"""Which commit of the code this backend is running (shown on the site's About page)."""

import os
import subprocess
from pathlib import Path


def _from_git() -> tuple[str, str, str]:
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%H%n%cI%n%s"],
            cwd=Path(__file__).resolve().parent,
            capture_output=True,
            text=True,
            timeout=5,
        )
        if out.returncode == 0:
            lines = out.stdout.strip().split("\n", 2) + ["", ""]
            return lines[0], lines[1], lines[2]
    except Exception:
        pass
    return "", "", ""


def _load() -> dict:
    commit = os.environ.get("GIT_COMMIT", "").strip()
    date = os.environ.get("GIT_COMMIT_DATE", "").strip()
    subject = os.environ.get("GIT_COMMIT_SUBJECT", "").strip()
    if not commit:
        commit, date, subject = _from_git()
    return {"commit": commit or None, "date": date or None, "subject": subject or None}


# Read once at startup: a new commit means a restart.
VERSION = _load()
