"""Development tooling lives in a sanctioned home, and the root stays clean.

Three homes are sanctioned, each for a stated reason:

* `dev/` - the harness itself, its guards, and every instrument nothing else
  roots.
* `frontend/dev/` - tooling rooted by the SPA's `vite`, `tsconfig`, `vitest`,
  and `playwright` configuration, which cannot move without rewriting all four.
* `engine/tests/` - tooling rooted by cargo.

`packaging/` is deliberately NOT a tooling home: `install.ps1` and `install.sh`
are shipped user-facing installers and `assemble-build-spec.py` is release
automation, so it is product distribution surface. Rehoming it under `dev/`
would be a fresh comingling rather than a fix.

The check that matters most here is the last one. Tooling accretes at the
repository root - a `scripts/` directory holding one file, a stray `.py` beside
the manifests - and each addition looks harmless in isolation. That is precisely
how the four simultaneous boundary failures that motivated the frontend fence
were reached: each passed review individually.
"""

from __future__ import annotations

from pathlib import Path

import pytest

#: Directories that may hold development tooling.
SANCTIONED_HOMES = ("dev", "frontend/dev", "engine/tests")

#: Directories that must not reappear at the repository root. `scripts/` held a
#: single Python file and existed for it alone; that file is now `dev/readme_assets.py`.
RETIRED_ROOT_DIRECTORIES = ("scripts", "tools", "bin", "hack")

#: Root-level Python files that are permitted. There are none: the harness is a
#: package, so a loose module at the root is by definition comingled.
ALLOWED_ROOT_PYTHON: frozenset[str] = frozenset()


@pytest.mark.parametrize("home", SANCTIONED_HOMES)
def test_sanctioned_home_exists(repo_root: Path, home: str) -> None:
    """Guard the guard: a home that vanished must fail loudly, not silently.

    Args:
        repo_root: The repository root.
        home: The sanctioned tooling home under test.
    """
    assert (repo_root / home).is_dir(), (
        f"{home} is a sanctioned tooling home but does not exist"
    )


@pytest.mark.parametrize("directory", RETIRED_ROOT_DIRECTORIES)
def test_retired_root_directory_stays_retired(repo_root: Path, directory: str) -> None:
    """A generic tooling directory at the root is comingling by another name.

    Args:
        repo_root: The repository root.
        directory: The directory that must not exist.
    """
    assert not (repo_root / directory).exists(), (
        f"{directory}/ is back at the repository root; development tooling "
        f"belongs in one of {list(SANCTIONED_HOMES)}"
    )


def test_no_loose_python_at_the_repository_root(repo_root: Path) -> None:
    """The harness is a package; a bare module at the root is not part of it.

    Args:
        repo_root: The repository root.
    """
    loose = sorted(
        path.name
        for path in repo_root.glob("*.py")
        if path.name not in ALLOWED_ROOT_PYTHON
    )
    assert not loose, (
        f"these Python files sit loose at the repository root: {loose}. "
        "Move them into dev/ so the harness has one home."
    )


def test_the_harness_dispatch_core_is_present(repo_root: Path) -> None:
    """The three dispatch modules are what every recipe depends on.

    Args:
        repo_root: The repository root.
    """
    missing = [
        name
        for name in ("__init__.py", "__main__.py", "runner.py", "toolchain.py")
        if not (repo_root / "dev" / name).is_file()
    ]
    assert not missing, f"the harness dispatch core is incomplete: {missing}"


def test_the_guards_live_beside_the_harness(repo_root: Path) -> None:
    """The guards' subject is this checkout's own configuration.

    They have no product module to cohabit with, so they sit in the harness
    rather than in a top-level test tree that would imply they test a product.

    Args:
        repo_root: The repository root.
    """
    guards = repo_root / "dev" / "guards"
    assert guards.is_dir(), "dev/guards is missing"
    assert list(guards.glob("test_*.py")), "dev/guards holds no guard modules"
