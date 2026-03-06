"""
MCP Client Bridge — Connects ADK Agent to FastMCP Servers
==========================================================
This module acts as a bridge between Google ADK Agents and MCP servers.
It spawns the MCP server as a subprocess, fetches tool definitions
over the stdio protocol, and wraps them into callable Python functions
that the ADK Agent can use.

Architecture:
    ADK Agent → MCP Client Bridge → (subprocess) → FastMCP Server
                    ↕ stdio
"""

import asyncio
import inspect
import os
import sys
import threading
from typing import Callable, List, Optional

from mcp import StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.session import ClientSession


def _run_async(coro):
    """
    Run an async coroutine safely, whether or not an event loop
    is already running (e.g. inside uvicorn).
    Falls back to running in a separate thread if needed.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # We're inside an existing event loop (e.g. uvicorn) — 
        # run in a new thread with its own event loop
        result = [None]
        exception = [None]

        def run_in_thread():
            try:
                result[0] = asyncio.run(coro)
            except Exception as e:
                exception[0] = e

        thread = threading.Thread(target=run_in_thread)
        thread.start()
        thread.join(timeout=30)

        if exception[0]:
            raise exception[0]
        return result[0]
    else:
        return asyncio.run(coro)


def create_mcp_bridge_tools(server_script: str) -> List[Callable]:
    """
    Connects to the specified FastMCP server over stdio,
    retrieves all its registered tools, and automatically wraps them
    into local Python async functions with accurate schemas
    so the ADK Agent can use them seamlessly.

    Args:
        server_script: Relative path to the MCP server script
                       (e.g. 'bidi_streaming_agent/mcp_servers/mac_mcp_server.py')
    
    Returns:
        List of async callables that the ADK Agent can use as tools.
    """
    # Resolve the script path relative to the project root
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    abs_script_path = os.path.join(project_root, server_script)

    # Use sys.executable to ensure the subprocess uses the same virtualenv Python
    python_cmd = sys.executable

    return _create_tools_from_params(
        StdioServerParameters(command=python_cmd, args=[abs_script_path]),
        label=server_script,
    )


def create_mcp_bridge_tools_from_command(
    command: str, args: Optional[List[str]] = None, env: Optional[dict] = None
) -> List[Callable]:
    """
    Connects to an MCP server launched via an arbitrary command (e.g. npx).

    Args:
        command: The executable to run (e.g. 'npx', 'leetcode-mcp-server').
        args:    Command-line arguments for the executable.
        env:     Optional environment variables passed to the subprocess.

    Returns:
        List of async callables that the ADK Agent can use as tools.
    """
    merged_env = {**os.environ, **(env or {})}
    return _create_tools_from_params(
        StdioServerParameters(command=command, args=args or [], env=merged_env),
        label=f"{command} {' '.join(args or [])}",
    )


def _create_tools_from_params(
    server_params: StdioServerParameters, label: str
) -> List[Callable]:
    """
    Internal helper: given MCP StdioServerParameters, fetch tools and wrap them.
    """

    # Helper to run a single MCP tool call
    async def run_mcp_tool(tool_name: str, args: dict) -> str:
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(tool_name, arguments=args)
                if result.content and len(result.content) > 0:
                    return result.content[0].text
                return "Tool executed successfully but returned no output."

    # Fetch the list of tools synchronously at import time to build definitions
    async def fetch_tools():
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                return await session.list_tools()

    try:
        print(f"[MCP Bridge] Fetching tools from {label}...")
        mcp_tools = _run_async(fetch_tools())
    except Exception as e:
        print(f"[MCP Bridge] Failed to fetch tools from {label}: {e}")
        return []

    dynamic_tools = []
    
    for tool_info in mcp_tools.tools:
        name = tool_info.name
        doc = tool_info.description or f"MCP Tool: {name}"
        
        # Determine arguments from JSON schema
        schema = tool_info.inputSchema or {}
        properties = schema.get("properties", {})
        required_fields = schema.get("required", [])
        
        # Build an async wrapper function with dynamic arguments
        # Capture the name in the closure correctly using default arg
        async def wrapper(_name=name, **kwargs) -> str:
            return await run_mcp_tool(_name, kwargs)

        # Set metadata for ADK reflection
        wrapper.__name__ = name
        wrapper.__doc__ = doc
        
        # We manually build the signature for ADK's introspection
        required_params = []
        optional_params = []
        for prop_name, prop_details in properties.items():
            # Map JSON schema types to Python types
            prop_type = str
            json_type = prop_details.get("type")
            if json_type == "integer" or json_type == "number":
                prop_type = int
            elif json_type == "boolean":
                prop_type = bool
            elif json_type == "array":
                prop_type = list

            # Handle Optional types (anyOf with null)
            any_of = prop_details.get("anyOf", [])
            if any_of:
                for variant in any_of:
                    if variant.get("type") == "string":
                        prop_type = str
                        break
                    elif variant.get("type") == "integer":
                        prop_type = int
                        break

            # Determine default value
            is_required = prop_name in required_fields
            if is_required:
                default = inspect.Parameter.empty
            else:
                # Optional params must always have a default for valid signatures
                default = prop_details.get("default", None)
            
            param = inspect.Parameter(
                name=prop_name,
                kind=inspect.Parameter.POSITIONAL_OR_KEYWORD,
                default=default,
                annotation=prop_type
            )
            # Sort required params first to satisfy Python signature rules
            if is_required:
                required_params.append(param)
            else:
                optional_params.append(param)

        wrapper.__signature__ = inspect.Signature(parameters=required_params + optional_params)
        dynamic_tools.append(wrapper)

    print(f"[MCP Bridge] Successfully loaded {len(dynamic_tools)} tools")
    return dynamic_tools
