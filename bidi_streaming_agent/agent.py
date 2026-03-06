"""
Interview Coach Agent — DSA & System Design
=============================================
This module defines the root AI agent for the Interview Coach application.
The agent:
    1. Connects to the LeetCode MCP server for real problems from LeetCode's database
    2. Connects to a local code execution MCP server for validating solutions
    3. Coaches candidates through DSA and system design interviews
    4. Uses Socratic teaching: asks questions, gives hints, corrects mistakes
    5. Can see whiteboard drawings, hear voice explanations, and respond naturally

Architecture:
    ┌────────────────────────────────────────────────────────────────┐
    │              Root Agent (Interview Coach)                      │
    │                                                                │
    │   ┌──────────────┐       MCP stdio          ┌──────────────┐  │
    │   │ ADK Agent    │ ◄─────────────────────► │ LeetCode MCP │  │
    │   │ (Gemini API) │   npx / node             │ (jinzcdev)   │  │
    │   │              │                          └──────────────┘  │
    │   │              │       MCP stdio          ┌──────────────┐  │
    │   │              │ ◄─────────────────────► │ CodeExec MCP │  │
    │   │              │   python subprocess      │ (local)      │  │
    │   └──────────────┘                          └──────────────┘  │
    └────────────────────────────────────────────────────────────────┘

LeetCode MCP Server: @jinzcdev/leetcode-mcp-server
    - get_daily_challenge, get_problem, search_problems
    - list_problem_solutions, get_problem_solution
    - Real problems from LeetCode's database

Model: gemini-2.5-flash-native-audio-preview-12-2025
    - Supports native audio input/output
    - Enables real-time voice conversations
    - Sub-second latency for natural interactions
"""

import os
from google.adk.agents import Agent
from google.adk.tools import google_search

from bidi_streaming_agent.mcp_client_bridge import (
    create_mcp_bridge_tools,
    create_mcp_bridge_tools_from_command,
)

# ---------------------------------------------------------------------------
# 1. LeetCode MCP Server — real problems from LeetCode's database
# ---------------------------------------------------------------------------
print("[Agent] Connecting to LeetCode MCP Server...")
_leetcode_tools = create_mcp_bridge_tools_from_command(
    command="leetcode-mcp-server",
    args=["--site", "global"],
)
print(f"[Agent] Loaded {len(_leetcode_tools)} tools from LeetCode MCP server")

# ---------------------------------------------------------------------------
# 2. Code Execution MCP Server — run_python_code for validating solutions
# ---------------------------------------------------------------------------
CODE_EXEC_MCP = "bidi_streaming_agent/mcp_servers/interview_mcp_server.py"
print(f"[Agent] Connecting to Code Execution MCP Server: {CODE_EXEC_MCP}")
_code_tools = create_mcp_bridge_tools(CODE_EXEC_MCP)
print(f"[Agent] Loaded {len(_code_tools)} tools from Code Execution MCP server")

# Combine all tools
_all_tools = [google_search] + _leetcode_tools + _code_tools

# ---------------------------------------------------------------------------
# Interview Coach Root Agent Instruction Prompt
# ---------------------------------------------------------------------------
INTERVIEW_COACH_INSTRUCTION = """
You are a friendly tech mentor and interview coach specializing in DSA and System
Design for top tech companies. You're also a great conversationalist — career
advice, tech chat, whatever the candidate wants.

## Personality
- Warm, personable senior dev friend. Friendly first, coach second.
- Encouraging but honest. Celebrate progress, be straight about weaknesses.
- Flexible — follow the candidate's lead. Don't force DSA if they want to chat.
- Socratic when coaching — guide through questions, never lecture.
- Keep voice responses concise: 2-4 sentences per turn.

## Multimodal
You can see images/screen shares, hear voice, and speak back naturally.
Analyze code/diagrams in images carefully and give specific visual feedback.

## DSA Coaching — Striver's Method
Follow Striver's (takeUforward) approach: **Brute → Better → Optimal**.
1. Understand the problem fully first. Clarify constraints and edge cases.
2. **Brute force first** — always start here. "What's the simplest approach?"
   If they skip to optimal, pull them back. Analyze TC/SC of the brute force.
3. **Find the bottleneck** — "Why is this slow? What redundant work can we cut?"
4. **Better approach** — guide with hints toward improved solution. Celebrate progress.
5. **Optimal** — only when ready. Use progressive hints (subtle → direct).
6. **Dry-run before coding** — trace the approach with examples first, then code.
7. **After solving**: summarize all approaches with TC/SC, connect to the pattern
   family ("This pair-sum pattern applies to Two Sum, 3Sum, 4Sum...").
Teach patterns, not just solutions. Always discuss time AND space complexity.

## System Design Coaching
Requirements → Scale estimation → High-level architecture → Deep dive → Scaling.
Ask trade-off questions. Challenge their decisions. Guide back-of-envelope math.

## Error Correction
Don't say "wrong" — have them dry-run with a counterexample to find the flaw.
When stuck, ask: "What's the brute force?" Build from what they already know.

## Tools
- **search_problems / get_problem / get_daily_challenge** — fetch real LeetCode problems
- **list_problem_solutions / get_problem_solution** — community solutions
- **run_python_code** — test/validate code
- **recall_session_notes** — call at session START with user_id
- **save_session_notes** — call at session END with summary
- **google_search** — research concepts

## Rules
- FIRST thing every session: call recall_session_notes with user_id. Greet warmly,
  reference previous sessions if notes exist.
- LAST thing: call save_session_notes with summary (problems, performance, next steps).
- Never give full solutions — guide through hints.
- Be conversational. Read the room. Engage genuinely.
- NEVER narrate your thinking process. Jump straight into natural dialogue.

## Session Context
user_id: `{user_id}`
"""


def _build_instruction(context) -> str:
    """Dynamically inject the user_id from session state into the instruction."""
    user_id = context.state.get("user_id", "unknown")
    return INTERVIEW_COACH_INSTRUCTION.format(user_id=user_id)


# ---------------------------------------------------------------------------
# Root Agent Instance
# ---------------------------------------------------------------------------
root_agent = Agent(
    model=os.getenv(
        "DEMO_AGENT_MODEL",
        "gemini-2.5-flash-native-audio-preview-12-2025",
    ),
    name="interview_coach_agent",
    description=(
        "A friendly tech mentor and interview coach specializing in DSA and "
        "System Design. Great at casual conversation, career advice, and "
        "interactive mock interviews with real-time voice, vision, and "
        "code execution capabilities."
    ),
    instruction=_build_instruction,
    tools=_all_tools,
)
