"""The Linux build environment and the README's glibc promise cannot drift apart.

A binary's glibc floor is decided by the machine that builds it, and nothing
about that machine is stated in the repository unless a container pins it. Until
one did, both Linux legs built bare: v0.1.8 shipped a `vaultspec` requiring
glibc 2.39, produced on a host running 2.43, against a README that promised
"glibc-based Linux" and named no version. That floor excluded every current
enterprise LTS, no file in the tree said so, and moving it needed nothing more
than a runner being reimaged.

So the floor is asserted in two places that are edited by different people for
different reasons - the pinned image in `dist-workspace.toml`, and the sentence
a user reads in `README.md` - and this module's subject is the agreement between
them. Checking the image against a floor declared beside it in the same table
would be close to vacuous; the drift worth catching is the build environment
moving while the promise stays still, or the promise being written to a number
the build never provided.

The runtime half of this - what the produced binary actually requires - is not
knowable from the checkout and is asserted against the published asset instead.
"""

from __future__ import annotations

import re
import tomllib
from pathlib import Path

import pytest

#: The targets whose floor is a glibc version. The macOS and Windows targets
#: have no glibc and are outside this module's subject entirely.
LINUX_GNU_TARGETS = (
    "aarch64-unknown-linux-gnu",
    "x86_64-unknown-linux-gnu",
)

#: Matches the manylinux release a pinned image provides, e.g. the `2_28` in
#: `manylinux_2_28_aarch64`. The trailing architecture is deliberately outside
#: the capture: this pattern reads the FLOOR, and `test_a_container_declares_its
#: _own_architecture` is what checks the arch.
_MANYLINUX = re.compile(r"manylinux_(\d+)_(\d+)_")

#: Matches the floor as the README states it per platform, e.g. the `2.28` in
#: "Linux on arm64, glibc 2.28 or newer". Written to match the sentence a reader
#: actually sees rather than a machine-readable block, because the sentence is
#: the promise - a table nobody reads could agree with the build forever while
#: the prose above it lied.
_README_FLOOR = re.compile(r"Linux on (?:arm64|x64), glibc (\d+)\.(\d+) or newer")

#: A digest, not a tag. A mutable tag is not an acceptable input to a release:
#: it can be repointed at a different toolchain between two builds of the same
#: commit, which is exactly the drift the pin exists to remove.
_DIGEST = re.compile(r"@sha256:[0-9a-f]{64}$")


@pytest.fixture(scope="session")
def dist_config(repo_root: Path) -> dict:
    """The parsed `dist-workspace.toml`.

    Args:
        repo_root: The repository root directory.

    Returns:
        The full document, of which `[dist]` carries the release configuration.
    """
    text = (repo_root / "dist-workspace.toml").read_text(encoding="utf-8")
    return tomllib.loads(text)


@pytest.fixture(scope="session")
def linux_legs(dist_config: dict) -> dict[str, dict]:
    """Every Linux-gnu target mapped to its runner table.

    A target configured with the SHORT form - a bare runner-label string, which
    is what the two non-Linux targets still use - has no container and no host,
    so it is normalised to an empty table here and caught by the checks below
    rather than crashing them.

    Args:
        dist_config: The parsed `dist-workspace.toml`.

    Returns:
        A mapping of target triple to its expanded runner table.
    """
    runners = dist_config["dist"].get("github-custom-runners", {})
    legs: dict[str, dict] = {}
    for target in LINUX_GNU_TARGETS:
        entry = runners.get(target)
        legs[target] = entry if isinstance(entry, dict) else {}
    return legs


@pytest.fixture(scope="session")
def readme_floors(repo_root: Path) -> list[tuple[int, int]]:
    """Every per-platform glibc floor the README states, as `(major, minor)`.

    Args:
        repo_root: The repository root directory.

    Returns:
        One tuple per matching sentence, in the order they appear.
    """
    text = (repo_root / "README.md").read_text(encoding="utf-8")
    return [(int(major), int(minor)) for major, minor in _README_FLOOR.findall(text)]


@pytest.mark.parametrize("target", LINUX_GNU_TARGETS)
def test_every_linux_leg_builds_in_a_container(
    target: str, linux_legs: dict[str, dict]
) -> None:
    """A Linux leg with no container inherits its build host's glibc."""
    image = linux_legs[target].get("container")
    assert image, (
        f"{target} declares no build container in dist-workspace.toml, so its "
        "glibc floor is whatever the runner happens to provide and can move "
        "when that machine is reimaged. Pin a manylinux image for it."
    )


@pytest.mark.parametrize("target", LINUX_GNU_TARGETS)
def test_every_container_is_pinned_by_digest(
    target: str, linux_legs: dict[str, dict]
) -> None:
    """A tag can be repointed between two builds of the same commit."""
    image = _image_of(linux_legs[target])
    assert _DIGEST.search(image), (
        f"{target} pins its build container as {image!r}, which is not a "
        "digest. Pin it as `@sha256:<64 hex>` so the build environment is the "
        "same input on every run."
    )


@pytest.mark.parametrize("target", LINUX_GNU_TARGETS)
def test_a_container_declares_its_own_architecture(
    target: str, linux_legs: dict[str, dict]
) -> None:
    """An omitted container host silently plans a cross-compile.

    `host` defaults to a hardcoded `x86_64-unknown-linux-musl` and dist prefers
    it over the runner's own host when deciding what the build machine is, so an
    aarch64 leg that omits it gets a cargo-zigbuild install step and produces an
    artifact labelled for a machine it was not built on. The failure is silent:
    the leg goes green and the binary is mislabelled.
    """
    container = linux_legs[target].get("container")
    host = container.get("host") if isinstance(container, dict) else None
    assert host == target, (
        f"{target} declares its container host as {host!r}. It must be "
        f"{target!r} explicitly - the default is x86_64-unknown-linux-musl, "
        "which turns this leg into a cross-compile without saying so."
    )


def test_both_linux_legs_pin_the_same_manylinux_release(
    linux_legs: dict[str, dict],
) -> None:
    """One baseline, not two that happen to agree on a number.

    The build environment is a downloaded, executed input, and two builds of one
    toolchain can differ in ways a floor check does not measure - so the legs are
    held to the same RELEASE, not merely the same floor.
    """
    releases = {
        target: _manylinux_release(_image_of(leg)) for target, leg in linux_legs.items()
    }
    assert len(set(releases.values())) == 1, (
        "the Linux legs pin different manylinux releases: "
        f"{ {target: f'{major}.{minor}' for target, (major, minor) in releases.items()} }. "
        "Pin both arches to one release so the two share a baseline."
    )


def test_the_readme_states_the_floor_the_containers_provide(
    linux_legs: dict[str, dict], readme_floors: list[tuple[int, int]]
) -> None:
    """The promise a user reads must be the floor the build enforces.

    This is the check the module exists for. The two values live in files edited
    for unrelated reasons, and v0.1.8 is what their disagreement looks like: a
    2.39 binary under a README that named no version at all.
    """
    provided = {_manylinux_release(_image_of(leg)) for leg in linux_legs.values()}
    promised = set(readme_floors)
    assert promised == provided, (
        "the README promises glibc "
        f"{sorted(f'{major}.{minor}' for major, minor in promised)} but the "
        "pinned build containers provide "
        f"{sorted(f'{major}.{minor}' for major, minor in provided)}. Whichever "
        "is wrong, a user is being told something the build does not do."
    )


def test_the_readme_states_a_floor_for_every_linux_platform(
    readme_floors: list[tuple[int, int]],
) -> None:
    """Guard the guard: an unstated floor makes the agreement check vacuous.

    With no matching sentence in the README, `promised` and `provided` are both
    compared as sets and an empty promise would simply differ - but the message
    would blame a mismatch rather than an absence, which is the wrong repair.
    """
    assert len(readme_floors) == len(LINUX_GNU_TARGETS), (
        f"the README states {len(readme_floors)} per-platform glibc floors and "
        f"this project ships {len(LINUX_GNU_TARGETS)} Linux targets. Every "
        "Linux platform in the support list needs its floor stated, in the form "
        "'Linux on <arch>, glibc <major>.<minor> or newer'."
    )


def test_the_config_still_declares_the_linux_targets(dist_config: dict) -> None:
    """Guard the guard: a renamed target would make every check above skip."""
    targets = set(dist_config["dist"].get("targets", []))
    missing = sorted(set(LINUX_GNU_TARGETS) - targets)
    assert not missing, (
        f"{missing} are checked by this module but are no longer in "
        "dist-workspace.toml's `targets`. Either the triples were renamed, in "
        "which case update LINUX_GNU_TARGETS, or Linux support was dropped."
    )


def _image_of(leg: dict) -> str:
    """The container image string of a leg, in either form dist accepts.

    `container` is a string or a table carrying `image`; both are valid config,
    so a guard that understood only one would pass on the form it could not read.

    Args:
        leg: One target's expanded runner table.

    Returns:
        The image reference, or an empty string when the leg declares none.
    """
    container = leg.get("container")
    if isinstance(container, dict):
        return str(container.get("image", ""))
    return str(container or "")


def _manylinux_release(image: str) -> tuple[int, int]:
    """The glibc floor a pinned manylinux image provides, as `(major, minor)`.

    Args:
        image: A container image reference.

    Returns:
        The release parsed out of the image name.

    Raises:
        AssertionError: If the image is not a manylinux image, since every other
            check in this module reads its floor from that name.
    """
    match = _MANYLINUX.search(image)
    assert match is not None, (
        f"{image!r} is not a manylinux image, so the floor it provides cannot "
        "be read from its name. Every Linux leg is pinned to manylinux so the "
        "floor is stated by the build environment itself."
    )
    return (int(match.group(1)), int(match.group(2)))
