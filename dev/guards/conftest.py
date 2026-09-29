"""Shared fixtures for the repository-health guards."""

from __future__ import annotations

import ast
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

#: The machine-wide dev-server harness. It is a byte-identical copy of the one in
#: the private `devservers` repository, shared by every web app on this
#: workstation, and it is the one module under `dev/` this repository does not
#: own: a PEP 723 script run by `uv run --script`, never imported by the `dev`
#: package, and `just dev check` fails when this copy drifts from its source.
DEVSERVER = REPO_ROOT / "dev" / "devserver.py"


def devserver_constant(name: str) -> str:
    """Read a string constant out of `dev/devserver.py` without importing it.

    The harness imports `psutil` and `filelock`, which its PEP 723 header
    declares for `uv run --script` and this repository's dev group does not.
    Parsing keeps the guards on the dev group's own dependencies while still
    comparing against the canonical text itself, not a transcription of it.

    Args:
        name: The module-level constant, e.g. ``RECIPE`` or ``WORKFLOW``.

    Returns:
        The constant's value.
    """
    tree = ast.parse(DEVSERVER.read_text(encoding="utf-8"), filename=str(DEVSERVER))
    for node in tree.body:
        if (
            isinstance(node, ast.Assign)
            and any(isinstance(t, ast.Name) and t.id == name for t in node.targets)
            and isinstance(node.value, ast.Constant)
            and isinstance(node.value.value, str)
        ):
            return node.value.value
    raise AssertionError(f"{DEVSERVER} defines no string constant {name}")


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
