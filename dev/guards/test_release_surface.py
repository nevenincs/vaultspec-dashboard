"""What the release publishes is a decision, not a side effect of compiling.

dist walks the engine workspace and archives every crate that produces a binary
unless something says otherwise. Nothing said otherwise, so v0.1.8 published 36
assets covering four separate things: the dashboard, a component of it, a
wrapper that exits 2 printing REFUSED for every input, and the maintainer
tooling that composes a release - the last of these under the name
`vaultspec-product`, which is the crate that BUILDS the product and reads on a
release page like the product itself.

Nobody chose any of that. The default is to publish everything that compiles, so
a crate joins the release surface by existing, and the surface grows silently
whenever the workspace does.

`dist-workspace.toml`'s `packages` list is the allowlist that replaces the
default, and this module's subject is that every binary-producing crate has been
put on one side of it ON PURPOSE. A crate that is neither published nor recorded
here as deliberately unpublished is the state this guard exists to refuse: it
means a new binary appeared and nobody decided anything about it.
"""

from __future__ import annotations

import tomllib
from pathlib import Path

import pytest

#: Binary-producing crates that are deliberately NOT published, and why. A crate
#: named here is a decision on the record; a crate in neither this mapping nor
#: the allowlist is an omission, which is what the guard reports.
UNPUBLISHED = {
    "vaultspec-updater": (
        "a component of the product tree, not a product. The installers place it "
        "out of the composed tree, and publishing it loose invites installing an "
        "updater with nothing to update."
    ),
    "vaultspec-release-verify": (
        "a status-only wrapper whose main() discards its result and exits 2 "
        "printing REFUSED, for every input, while signed distribution is "
        "deferred. Users reach this authority as the `vaultspec verify-release` "
        "subcommand instead."
    ),
    "vaultspec-product": (
        "the maintainer tooling that composes and certifies a release - "
        "product_build, product_certify and cohort_digest. It runs in CI and on "
        "a maintainer's machine; it is not something a user installs."
    ),
}


@pytest.fixture(scope="session")
def allowlist(repo_root: Path) -> list[str]:
    """The crates `dist-workspace.toml` permits the release to publish.

    Args:
        repo_root: The repository root directory.

    Returns:
        The `[workspace] packages` list, empty when the key is absent.
    """
    text = (repo_root / "dist-workspace.toml").read_text(encoding="utf-8")
    return tomllib.loads(text)["workspace"].get("packages", [])


@pytest.fixture(scope="session")
def binary_crates(repo_root: Path) -> dict[str, Path]:
    """Every engine crate that produces at least one binary.

    Cargo builds a binary from an explicit `[[bin]]`, from `src/main.rs`, and
    from each `src/bin/*.rs` - the last by convention, with nothing in the
    manifest to find it, which is exactly how three maintainer tools reached a
    release page without being mentioned anywhere.

    Args:
        repo_root: The repository root directory.

    Returns:
        A mapping of crate name to its directory.
    """
    crates: dict[str, Path] = {}
    for manifest in sorted((repo_root / "engine" / "crates").glob("*/Cargo.toml")):
        directory = manifest.parent
        produces_binary = (
            "[[bin]]" in manifest.read_text(encoding="utf-8")
            or (directory / "src" / "main.rs").is_file()
            or any((directory / "src" / "bin").glob("*.rs"))
        )
        if produces_binary:
            crates[_crate_name(manifest)] = directory
    return crates


def test_the_release_surface_is_an_allowlist(allowlist: list[str]) -> None:
    """An absent list is not an empty one - it publishes everything."""
    assert allowlist, (
        "dist-workspace.toml declares no `[workspace] packages`, so dist falls "
        "back to publishing every crate in the engine workspace that produces a "
        "binary. State the release surface explicitly."
    )


def test_every_binary_crate_is_published_or_recorded_as_not(
    allowlist: list[str], binary_crates: dict[str, Path]
) -> None:
    """A new binary crate must not join the release by existing."""
    undecided = sorted(set(binary_crates) - set(allowlist) - set(UNPUBLISHED))
    assert not undecided, (
        f"{undecided} produce binaries but are neither in dist-workspace.toml's "
        "`packages` allowlist nor recorded in UNPUBLISHED. Publishing one is a "
        "decision and so is not publishing it: add it to the allowlist, or to "
        "UNPUBLISHED with the reason it stays off the release."
    )


def test_nothing_is_both_published_and_recorded_as_unpublished(
    allowlist: list[str],
) -> None:
    """The two lists must not disagree about the same crate."""
    both = sorted(set(allowlist) & set(UNPUBLISHED))
    assert not both, (
        f"{both} appear in both the dist allowlist and UNPUBLISHED. The "
        "allowlist wins at build time, so this file would be documenting the "
        "opposite of what the release does."
    )


def test_the_allowlist_names_real_crates(
    allowlist: list[str], binary_crates: dict[str, Path]
) -> None:
    """dist matches the allowlist by name and ignores what it cannot find.

    A typo here does not fail the build: the entry matches nothing, the crate it
    meant to name goes unpublished, and the release is quietly short an asset.
    """
    unknown = sorted(set(allowlist) - set(binary_crates))
    assert not unknown, (
        f"{unknown} are in the dist allowlist but are not engine crates that "
        "produce a binary. dist matches by name and silently ignores an entry "
        "that matches nothing, so this would publish less than it appears to."
    )


def test_the_reasons_are_written_down(binary_crates: dict[str, Path]) -> None:
    """An unpublished crate with no reason is an entry nobody can review."""
    blank = sorted(name for name, why in UNPUBLISHED.items() if len(why.strip()) < 40)
    assert not blank, (
        f"{blank} are recorded as unpublished with no substantive reason. The "
        "reason is the whole value of the record - it is what a reader checks "
        "when deciding whether the crate should now ship."
    )


def test_the_crate_scan_found_the_workspace(binary_crates: dict[str, Path]) -> None:
    """Guard the guard: a moved crates directory makes every check vacuous."""
    assert len(binary_crates) >= 4, (
        f"only {len(binary_crates)} binary-producing crates were found under "
        "engine/crates. The workspace layout probably moved, and every check in "
        "this module is comparing against an empty set."
    )


def _crate_name(manifest: Path) -> str:
    """The package name a Cargo manifest declares.

    Args:
        manifest: A path to a crate's `Cargo.toml`.

    Returns:
        The `[package] name`.
    """
    return str(tomllib.loads(manifest.read_text(encoding="utf-8"))["package"]["name"])
