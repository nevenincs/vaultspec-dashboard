"""What ships never reaches for what does not.

The shipped surfaces are the Rust engine (`engine/crates/`) and the SPA
(`frontend/src/`). The harness surfaces are the root `dev/` package and
`frontend/dev/`. The law is one-way: a harness may import what ships, because a
harness rendering anything other than the real thing is worthless; what ships
importing a harness is a build failure.

The frontend arm of this fence is enforced by `frontend/dev/tooling/scan-domains.mjs`,
which already carries a ratchet of known-pending violations. This module does
not duplicate that scanner - it asserts the scanner is still wired into the gate,
because the fence's weakest point is not a violation slipping past the scanner
but the scanner quietly falling out of the gate that runs it.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

from dev.toolchain import LINT

#: Trees whose contents are compiled, bundled, or published.
SHIPPED_TREES = ("engine/crates", "frontend/src")

#: Suffixes worth scanning inside a shipped tree.
SOURCE_SUFFIXES = frozenset({".rs", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".css"})

#: Path fragments naming a harness tree, as they would appear in an import.
HARNESS_REFERENCES = ("frontend/dev/", "../dev/", "../../dev/", "@dev/")

#: The scanner holding the frontend half of the fence.
DOMAIN_SCANNER = "lint:domains"


def _shipped_sources(repo_root: Path) -> list[Path]:
    """Collect every source file in a shipped tree."""
    return [
        path
        for tree in SHIPPED_TREES
        for path in (repo_root / tree).rglob("*")
        if path.is_file() and path.suffix in SOURCE_SUFFIXES
    ]


def test_no_shipped_source_references_a_harness_tree(repo_root: Path) -> None:
    """A shipped module reaching into `dev/` means it is not actually dev-only.

    Args:
        repo_root: The repository root.
    """
    offenders: list[str] = []
    for path in _shipped_sources(repo_root):
        text = path.read_text(encoding="utf-8", errors="replace")
        if any(reference in text for reference in HARNESS_REFERENCES):
            offenders.append(str(path.relative_to(repo_root)))
    assert not offenders, (
        "these shipped sources reference a harness tree; the thing they need is "
        f"not dev-only and belongs in src/: {sorted(offenders)}"
    )


def test_the_domain_scanner_is_wired_into_the_frontend_gate() -> None:
    """The fence is only real while the gate that enforces it runs.

    `production-dev-separation` names this scanner as THE gate holding the
    src/dev boundary. Dropping it from the lint table would leave the rule
    documented and unenforced, which is worse than not having it.
    """
    frontend = LINT.targets["frontend"]
    scripts = [
        step.argv[-1] for step in frontend.steps if getattr(step, "argv", None)
    ]
    assert DOMAIN_SCANNER in scripts, (
        f"{DOMAIN_SCANNER} is no longer part of `lint frontend`; the src/dev "
        f"fence is unenforced. Present scripts: {scripts}"
    )


def test_the_domain_scanner_still_exists(repo_root: Path) -> None:
    """The gate names a scanner; the scanner must be on disk.

    Args:
        repo_root: The repository root.
    """
    scanner = repo_root / "frontend" / "dev" / "tooling" / "scan-domains.mjs"
    assert scanner.is_file(), f"{scanner} is missing but the lint gate invokes it"


def test_the_harness_is_not_importable_from_outside_itself(repo_root: Path) -> None:
    """Nothing outside `dev/` imports the harness package.

    The harness is not a library. An importer outside it would make the
    stdlib-only dispatch core a runtime dependency of something that ships.

    Args:
        repo_root: The repository root.
    """
    offenders: list[str] = []
    for path in repo_root.rglob("*.py"):
        relative = path.relative_to(repo_root)
        parts = relative.parts
        if parts[0] in {"dev", ".venv", "target", "node_modules"}:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            imported = (
                [alias.name for alias in node.names]
                if isinstance(node, ast.Import)
                else [node.module or ""]
                if isinstance(node, ast.ImportFrom)
                else []
            )
            if any(name == "dev" or name.startswith("dev.") for name in imported):
                offenders.append(str(relative))
    assert not offenders, f"the harness package is imported from: {sorted(offenders)}"


@pytest.mark.parametrize("tree", SHIPPED_TREES)
def test_shipped_tree_exists(repo_root: Path, tree: str) -> None:
    """Guard the guard: a renamed tree must not silently empty this check.

    If `frontend/src` were moved, every scan above would pass over nothing and
    report green while checking no files at all.

    Args:
        repo_root: The repository root.
        tree: The shipped tree under test.
    """
    assert (repo_root / tree).is_dir(), f"{tree} does not exist; the fence scans nothing"


def test_the_scan_covers_a_meaningful_number_of_files(repo_root: Path) -> None:
    """Guard the guard: assert the sweep actually reached the source.

    Args:
        repo_root: The repository root.
    """
    found = len(_shipped_sources(repo_root))
    assert found > 100, (
        f"only {found} shipped sources were scanned, which is too few to be the "
        "real tree - the fence is probably looking in the wrong place"
    )
