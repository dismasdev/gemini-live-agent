import sys
import os
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from mcp.server.fastmcp import FastMCP

# Persistent memory directory — stores coaching notes per user
MEMORY_DIR = Path(__file__).resolve().parent.parent.parent / "session_memory"
MEMORY_DIR.mkdir(exist_ok=True)

# Initialize FastMCP Server
mcp = FastMCP("InterviewCoachMCP")


@mcp.tool()
def run_python_code(code: str, stdin_input: str = "") -> str:
    """Execute Python code and return stdout/stderr. Use this to validate
    candidate solutions against test cases during interview coaching sessions."""
    try:
        result = subprocess.run(
            [sys.executable, "-c", code],
            input=stdin_input,
            capture_output=True,
            text=True,
            timeout=10,
        )
        output = ""
        if result.stdout:
            output += f"STDOUT:\n{result.stdout}"
        if result.stderr:
            output += f"STDERR:\n{result.stderr}"
        if result.returncode != 0:
            output += f"\nExit Code: {result.returncode}"
        return output.strip() or "Code executed successfully with no output."
    except subprocess.TimeoutExpired:
        return "ERROR: Code execution timed out (10 second limit). The solution may have an infinite loop or be too slow."
    except Exception as e:
        return f"ERROR: {str(e)}"


@mcp.tool()
def save_session_notes(user_id: str, notes: str) -> str:
    """Save coaching session notes for a candidate so you can remember them
    in future sessions. Call this at the END of each session to record:
    - Problems practiced and how the candidate performed
    - Strengths observed (e.g., good at hash maps, clear communication)
    - Weaknesses to work on (e.g., struggles with DP, forgets edge cases)
    - Topics covered and difficulty level reached
    - Specific advice given that should be followed up on
    Keep notes concise but informative — bullet points work best."""
    user_file = MEMORY_DIR / f"{user_id}.json"
    history = []
    if user_file.exists():
        try:
            history = json.loads(user_file.read_text())
        except (json.JSONDecodeError, OSError):
            history = []

    history.append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "notes": notes,
    })

    # Keep only the last 20 session entries to avoid unbounded growth
    history = history[-20:]
    user_file.write_text(json.dumps(history, indent=2))
    return f"Session notes saved. You now have {len(history)} session(s) on record for this candidate."


@mcp.tool()
def recall_session_notes(user_id: str) -> str:
    """Recall previous coaching session notes for a candidate. Call this at
    the START of each session to remember what you discussed before — problems
    practiced, strengths, weaknesses, and advice given. Returns all saved
    session notes for this candidate."""
    user_file = MEMORY_DIR / f"{user_id}.json"
    if not user_file.exists():
        return "No previous session notes found for this candidate. This appears to be their first session."

    try:
        history = json.loads(user_file.read_text())
    except (json.JSONDecodeError, OSError):
        return "Error reading session notes. Starting fresh."

    if not history:
        return "No previous session notes found."

    parts = []
    for i, entry in enumerate(history, 1):
        ts = entry.get("timestamp", "unknown time")
        notes = entry.get("notes", "")
        parts.append(f"--- Session {i} ({ts}) ---\n{notes}")

    return "\n\n".join(parts)


if __name__ == "__main__":
    print("Starting InterviewCoachMCP server...", file=sys.stderr)
    mcp.run()
