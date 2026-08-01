"""Dev dependencies are declared as dev dependencies, and nowhere else.

Two directions matter, and they fail differently.

Undeclared but imported: the harness works on the machine that happens to have
the package transitively, and breaks on a clean checkout. `rich` was in exactly
this state - imported by the README renderer, declared by nothing, resolved only
because `vaultspec-core` pulled it in.

Declared as runtime: the published-wheel-purity rule in `resource-bounds`. This
project is a uv virtual project that publishes nothing today, but the manifest
still states a runtime surface, and `torch` has repeatedly migrated into it after
an installer run.
"""

from __future__ import annotations

import ast
import sys
import tomllib
from pathlib import Path

import pytest

#: Packages that must never appear in the runtime dependency list.
DEV_ONLY_PACKAGES = frozenset({"pytest", "rich", "torch", "vaultspec-rag", "mdformat"})

#: Import names whose distribution is named differently on PyPI.
DISTRIBUTION_ALIASES = {"pymarkdown": "pymarkdownlnt"}


def _normalise(name: str) -> str:
    """Reduce a requirement string to its bare, comparable distribution name."""
    for separator in ("[", ">", "<", "=", "!", "~", ";", " "):
        name = name.split(separator, 1)[0]
    return name.strip().lower().replace("_", "-")


@pytest.fixture(scope="session")
def manifest(repo_root: Path) -> dict:
    """The parsed `pyproject.toml`."""
    return tomllib.loads((repo_root / "pyproject.toml").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def declared_dev(manifest: dict) -> set[str]:
    """Every distribution declared in the `dev` dependency group."""
    return {_normalise(item) for item in manifest["dependency-groups"]["dev"]}


def _third_party_imports(repo_root: Path) -> set[str]:
    """Collect the top-level non-stdlib modules the harness imports."""
    found: set[str] = set()
    for path in (repo_root / "dev").rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                found.update(alias.name.split(".")[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                found.add(node.module.split(".")[0])
    return {
        name
        for name in found
        if name not in sys.stdlib_module_names and name != "dev"
    }


def test_every_harness_import_is_declared(
    repo_root: Path, declared_dev: set[str]
) -> None:
    """An imported-but-undeclared package works by luck until a clean checkout.

    Args:
        repo_root: The repository root.
        declared_dev: The declared dev-group distributions.
    """
    imported = {
        _normalise(DISTRIBUTION_ALIASES.get(name, name))
        for name in _third_party_imports(repo_root)
    }
    undeclared = sorted(imported - declared_dev)
    assert not undeclared, (
        "the harness imports these without declaring them in the dev group: "
        f"{undeclared}"
    )


@pytest.mark.parametrize("package", sorted(DEV_ONLY_PACKAGES))
def test_dev_only_package_is_not_a_runtime_dependency(
    manifest: dict, package: str
) -> None:
    """A dev tool in the runtime list is a published-wheel-purity violation.

    Args:
        manifest: The parsed manifest.
        package: The package that must stay dev-only.
    """
    runtime = {_normalise(item) for item in manifest["project"].get("dependencies", [])}
    assert package not in runtime, (
        f"{package} is dev-only but appears in [project] dependencies; "
        "revert it to the dev group"
    )


def test_the_dev_group_is_not_empty(declared_dev: set[str]) -> None:
    """Guard the guard: an empty group makes every check above vacuous."""
    assert len(declared_dev) > 3, (
        f"only {len(declared_dev)} dev dependencies were parsed, which cannot be "
        "the real group - the manifest shape probably changed"
    )


def test_the_import_scan_found_something(repo_root: Path) -> None:
    """Guard the guard: a scan that reads no files passes trivially.

    Args:
        repo_root: The repository root.
    """
    modules = list((repo_root / "dev").rglob("*.py"))
    assert len(modules) > 5, (
        f"only {len(modules)} harness modules were scanned; the package layout "
        "probably moved"
    )
