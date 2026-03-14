import ast
import json
import re
import sqlite3
from pathlib import Path
from typing import Any


DB_PATH = Path(__file__).resolve().parent.parent / "idea_repository.db"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_idea_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS idea_evaluations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                idea_text TEXT NOT NULL,
                relevancy_score REAL NOT NULL,
                potential_impact_score REAL NOT NULL,
                competition_found INTEGER NOT NULL DEFAULT 0,
                competition_summary TEXT NOT NULL DEFAULT '',
                google_search_notes TEXT NOT NULL DEFAULT '',
                submitted_by TEXT NOT NULL DEFAULT 'anonymous'
            )
            """
        )


def _clamp_score(score: float) -> float:
    return max(0.0, min(10.0, float(score)))


def _idea_score_keywords(text: str) -> float:
    strong = [
        "automation",
        "security",
        "healthcare",
        "education",
        "ai",
        "accessibility",
        "infrastructure",
        "developer productivity",
        "cost reduction",
    ]
    medium = ["mobile", "analytics", "workflow", "assistant", "api", "collaboration"]
    lower = text.lower()
    points = 0.0
    for word in strong:
        if word in lower:
            points += 1.2
    for word in medium:
        if word in lower:
            points += 0.7
    return points


def score_idea_metrics(idea_text: str, domain_context: str = "") -> str:
    """
    Quickly estimate relevancy and impact scores on a 0-10 scale.
    Use this before persisting an idea when no explicit score is available.
    """
    combined = f"{idea_text} {domain_context}".strip()
    base = 4.5
    keyword_boost = _idea_score_keywords(combined)
    length_bonus = min(len(combined) / 300.0, 1.5)

    relevancy = _clamp_score(base + keyword_boost * 0.5 + length_bonus)
    impact = _clamp_score(base + keyword_boost * 0.7 + length_bonus)

    payload = {
        "relevancy_score": round(relevancy, 2),
        "potential_impact_score": round(impact, 2),
        "notes": "Heuristic estimate. Validate with Google Search and product context.",
    }
    return json.dumps(payload, indent=2)


def store_idea_evaluation(
    idea_text: str,
    relevancy_score: float,
    potential_impact_score: float,
    competition_found: bool = False,
    competition_summary: str = "",
    google_search_notes: str = "",
    submitted_by: str = "anonymous",
) -> str:
    """
    Persist an idea plus metrics in the local SQLite idea repository.

    Expected workflow:
    1) Use google_search to check if similar products/startups already exist.
    2) Score idea relevancy and potential impact (0-10).
    3) Save using this tool.
    """
    init_idea_db()
    rel = _clamp_score(relevancy_score)
    impact = _clamp_score(potential_impact_score)

    with _connect() as conn:
        cursor = conn.execute(
            """
            INSERT INTO idea_evaluations (
                idea_text,
                relevancy_score,
                potential_impact_score,
                competition_found,
                competition_summary,
                google_search_notes,
                submitted_by
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                idea_text.strip(),
                rel,
                impact,
                int(bool(competition_found)),
                competition_summary.strip(),
                google_search_notes.strip(),
                submitted_by.strip() or "anonymous",
            ),
        )
        idea_id = cursor.lastrowid

    return (
        f"Idea stored successfully with id={idea_id}. "
        f"relevancy_score={rel}, potential_impact_score={impact}, "
        f"competition_found={bool(competition_found)}"
    )


def fetch_saved_ideas(limit: int = 10) -> list[dict[str, Any]]:
    init_idea_db()
    safe_limit = max(1, min(int(limit), 100))
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, created_at, idea_text, relevancy_score, potential_impact_score,
                   competition_found, competition_summary, google_search_notes, submitted_by
            FROM idea_evaluations
            ORDER BY id DESC
            LIMIT ?
            """,
            (safe_limit,),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "created_at": row["created_at"],
            "idea_text": row["idea_text"],
            "relevancy_score": row["relevancy_score"],
            "potential_impact_score": row["potential_impact_score"],
            "competition_found": bool(row["competition_found"]),
            "competition_summary": row["competition_summary"],
            "google_search_notes": row["google_search_notes"],
            "submitted_by": row["submitted_by"],
        }
        for row in rows
    ]


def list_saved_ideas(limit: int = 10) -> str:
    """List recent stored ideas with their scores and competition checks."""
    return json.dumps(fetch_saved_ideas(limit=limit), indent=2)


def analyze_code_for_bugs(code: str, language: str = "python") -> str:
    """
    Analyze code and return likely bug/security issues.
    This is a fast heuristic pass, not a full static analyzer.
    """
    findings: list[dict[str, str]] = []
    lang = (language or "python").lower().strip()

    if not code.strip():
        return json.dumps({"summary": "No code provided", "findings": []}, indent=2)

    if lang in {"python", "py"}:
        try:
            tree = ast.parse(code)
        except SyntaxError as exc:
            findings.append(
                {
                    "severity": "high",
                    "type": "syntax-error",
                    "detail": f"Python syntax error near line {exc.lineno}: {exc.msg}",
                }
            )
            tree = None

        if tree is not None:
            for node in ast.walk(tree):
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                    if node.func.id in {"eval", "exec"}:
                        findings.append(
                            {
                                "severity": "high",
                                "type": "unsafe-execution",
                                "detail": f"Use of {node.func.id} may execute untrusted input.",
                            }
                        )
                if isinstance(node, ast.ExceptHandler) and node.type is None:
                    findings.append(
                        {
                            "severity": "medium",
                            "type": "bare-except",
                            "detail": "Bare except can hide real failures and make debugging hard.",
                        }
                    )
                if isinstance(node, ast.FunctionDef):
                    for default in node.args.defaults:
                        if isinstance(default, (ast.List, ast.Dict, ast.Set)):
                            findings.append(
                                {
                                    "severity": "high",
                                    "type": "mutable-default-arg",
                                    "detail": f"Function '{node.name}' has a mutable default argument.",
                                }
                            )

        if re.search(r"while\s+True\s*:", code):
            findings.append(
                {
                    "severity": "medium",
                    "type": "possible-infinite-loop",
                    "detail": "Found 'while True'. Ensure there is a guaranteed break/return path.",
                }
            )

    elif lang in {"javascript", "js", "typescript", "ts", "tsx", "jsx"}:
        if re.search(r"(^|[^=!])==([^=]|$)", code):
            findings.append(
                {
                    "severity": "medium",
                    "type": "loose-equality",
                    "detail": "Loose equality (==) can cause coercion bugs. Prefer ===.",
                }
            )
        if re.search(r"innerHTML\s*=", code):
            findings.append(
                {
                    "severity": "high",
                    "type": "xss-risk",
                    "detail": "Direct innerHTML assignment can introduce XSS if data is untrusted.",
                }
            )
        if "console.log(" in code:
            findings.append(
                {
                    "severity": "low",
                    "type": "debug-artifact",
                    "detail": "console.log statements may leak data in production logs.",
                }
            )

    for marker in ["TODO", "FIXME", "HACK"]:
        if marker in code:
            findings.append(
                {
                    "severity": "low",
                    "type": "incomplete-work",
                    "detail": f"Found marker '{marker}' indicating incomplete implementation.",
                }
            )

    if not findings:
        summary = "No obvious bug patterns detected by heuristic scan."
    else:
        high = len([f for f in findings if f["severity"] == "high"])
        medium = len([f for f in findings if f["severity"] == "medium"])
        low = len([f for f in findings if f["severity"] == "low"])
        summary = f"Detected {len(findings)} potential issues (high={high}, medium={medium}, low={low})."

    return json.dumps({"summary": summary, "findings": findings}, indent=2)


init_idea_db()
