"""Shared fixtures for the repository-health guards."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

#: The repository root, resolved from this file rather than the working
#: directory so a guard reports the same thing however pytest was invoked.
REPO_ROOT = Path(__file__).resolve().parents[2]

#: Matches a `just` recipe header: a name, optional parameters (which may carry
#: defaults, as in `lint target='all':`), then a trailing colon. Variable
#: assignments (`dev := "..."`) are excluded by the `:=` check at the call site
#: rather than by this pattern, so a parameter default containing `=` still
#: matches - excluding `=` here silently dropped every parameterised recipe.
_RECIPE_HEADER = re.compile(r"^(?P<name>[a-z][a-z0-9-]*)(?P<params>[^:\n]*):\s*$")


@pytest.fixture(scope="session")
def repo_root() -> Path:
    """The repository root directory."""
    return REPO_ROOT


@pytest.fixture(scope="session")
def justfile_text() -> str:
    """The `justfile`'s full text."""
    return (REPO_ROOT / "justfile").read_text(encoding="utf-8")


@pytest.fixture(scope="session")
def recipe_bodies(justfile_text: str) -> dict[str, list[str]]:
    """Every recipe's name mapped to its body lines, comments stripped.

    Args:
        justfile_text: The `justfile`'s full text.

    Returns:
        A mapping of recipe name to the non-empty, non-comment body lines.
    """
    bodies: dict[str, list[str]] = {}
    current: str | None = None
    for raw in justfile_text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        if raw[:1].isspace():
            if current is not None:
                bodies[current].append(raw.strip())
            continue
        if ":=" in raw:
            current = None
            continue
        match = _RECIPE_HEADER.match(raw)
        current = match.group("name") if match else None
        if current is not None:
            bodies[current] = []
    return bodies
