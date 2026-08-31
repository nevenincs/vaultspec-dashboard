"""The preflight cannot check a runner it never derived.

The release preflights refuse to start a release whose runners are offline, and
they derive the selectors to check rather than carrying a hand-kept list -
because a list that must be edited in lockstep with a matrix eventually is not.
The sibling project shipped a stale list twice, and the second time it reported
a false partial on a release every leg could serve.

Deriving removes that failure and introduces a quieter one. The derivations read
the workflow with line-oriented text tools: `runs-on` is matched as a
single-line `[a, b, c]`, and templated selectors are skipped deliberately, since
parsing one would yield a selector containing an unexpanded expression that
matches no runner and reads as a real outage. Both choices are correct, and both
mean a job whose `runs-on` is written in some OTHER valid YAML shape is not
checked - and does not announce that it was not checked. The preflight passes,
the release starts, and the leg queues against the offline host the preflight
exists to catch.

So the property this module holds is not "the derivation is correct" - the
workflow asserts its own preconditions at run time, which is the right place for
that. It is that EVERY selector either reaches the derivation or is a
GitHub-hosted image that has no fleet runner to be offline. A job that is
neither is the gap, and it is invisible until a release is already queued.

This runs on every pull request. The run-time assertions only run at a release,
which is the moment nobody wants to discover a stale selector.
"""

from __future__ import annotations

import re
import tomllib
from pathlib import Path

import pytest
import yaml

#: The workflows carrying a preflight that derives its own selectors. Both
#: schedule onto the self-hosted fleet and both can strand a release.
GUARDED_WORKFLOWS = (
    ".github/workflows/release.yml",
    ".github/workflows/product-release.yml",
)

#: Selectors that name a GitHub-hosted image rather than a fleet runner. These
#: have no registered runner to be offline, so a preflight neither can nor
#: should check them - `actions/runners` lists self-hosted runners only.
#: Matched as whole labels: `ubuntu-24.04-arm` is hosted, a fleet label that
#: merely contains "linux" is not.
_HOSTED = re.compile(
    r"^(ubuntu|windows|macos)-(latest|\d[\w.]*)(-[a-z0-9]+)*$",
    re.IGNORECASE,
)

#: The templated selectors each derivation is built to resolve, and the source
#: it resolves them from. A templated selector NOT named here is skipped by the
#: derivation's `${{` filter and silently unchecked - which is the whole subject
#: of this module.
RESOLVED_TEMPLATES = {
    "${{ matrix.runner }}": "dist-workspace.toml [dist.github-custom-runners]",
    "${{ matrix.os }}": "the build-product-tree matrix",
    "${{ matrix.arch }}": "the build-product-tree matrix",
}


@pytest.fixture(scope="session")
def workflows(repo_root: Path) -> dict[str, dict]:
    """Each guarded workflow's parsed document, keyed by its path.

    Args:
        repo_root: The repository root directory.

    Returns:
        A mapping of workflow path to its parsed YAML.
    """
    documents: dict[str, dict] = {}
    for relative in GUARDED_WORKFLOWS:
        text = (repo_root / relative).read_text(encoding="utf-8")
        documents[relative] = yaml.safe_load(text)
    return documents


@pytest.fixture(scope="session")
def selectors(workflows: dict[str, dict]) -> list[tuple[str, str, object]]:
    """Every `runs-on` in the guarded workflows, as `(workflow, job, value)`.

    A job without `runs-on` is one that calls a reusable workflow, which brings
    its own; it schedules nothing itself and is omitted.

    Args:
        workflows: The parsed workflow documents.

    Returns:
        One tuple per scheduling job.
    """
    found: list[tuple[str, str, object]] = []
    for relative, document in workflows.items():
        for job, spec in document["jobs"].items():
            if "runs-on" in spec:
                found.append((relative, job, spec["runs-on"]))
    return found


def test_every_selector_is_hosted_or_derivable(
    selectors: list[tuple[str, str, object]],
) -> None:
    """A selector the derivation cannot see is a leg the preflight cannot check."""
    unreachable = []
    for relative, job, value in selectors:
        labels = value if isinstance(value, list) else [value]
        for label in labels:
            if "${{" in str(label):
                if str(label).strip() not in RESOLVED_TEMPLATES:
                    unreachable.append(f"{relative}:{job} -> {label}")
            elif not _HOSTED.match(str(label)) and not isinstance(value, list):
                # A bare self-hosted scalar. The derivations match `runs-on:`
                # only as a bracketed list, so a scalar never reaches them.
                unreachable.append(f"{relative}:{job} -> {label} (scalar)")
    assert not unreachable, (
        "these selectors are neither GitHub-hosted nor resolvable by the "
        f"preflight derivation, so the preflight cannot check them: {unreachable}. "
        "Either write the selector as a single-line label list, or teach the "
        "derivation the template and record it in RESOLVED_TEMPLATES."
    )


def test_every_fleet_selector_is_a_single_line_list(
    repo_root: Path, selectors: list[tuple[str, str, object]]
) -> None:
    """The derivations read `runs-on` with line-oriented tools.

    A YAML block list is valid, equivalent, and invisible to an `awk` that
    matches `runs-on:[[:space:]]*\\[`. That is the shape which passes review,
    passes the workflow's own precondition checks, and is never checked.
    """
    block_form = re.compile(r"^\s*runs-on:\s*$", re.MULTILINE)
    offenders = []
    for relative in GUARDED_WORKFLOWS:
        text = (repo_root / relative).read_text(encoding="utf-8")
        if block_form.search(text):
            offenders.append(relative)
    assert not offenders, (
        f"{offenders} write at least one `runs-on` as a YAML block list. The "
        "preflight derivation matches a single-line `[a, b, c]` and would skip "
        "it silently. Write it inline."
    )


def test_the_dist_table_still_carries_every_build_label(repo_root: Path) -> None:
    """`matrix.runner` resolves through the dist table, so the table is the matrix.

    Read the same file the derivation reads, in both accepted forms, and require
    that it names a label for every declared target. A target present in
    `targets` but absent from the table gets dist's default hosted runner, which
    the preflight would not check and which is not what this fleet builds on.
    """
    config = tomllib.loads((repo_root / "dist-workspace.toml").read_text(encoding="utf-8"))
    dist = config["dist"]
    runners = dist.get("github-custom-runners", {})
    missing = []
    for target in dist.get("targets", []):
        entry = runners.get(target)
        label = entry.get("runner") if isinstance(entry, dict) else entry
        if not label:
            missing.append(target)
    assert not missing, (
        f"{missing} are built by this release but name no runner in "
        "[dist.github-custom-runners]. dist would schedule them onto its default "
        "hosted runner and the preflight would derive nothing for them."
    )


def test_the_expanded_runner_form_is_not_confused_with_its_neighbours(
    repo_root: Path,
) -> None:
    """`runner`, `host` and `container` sit together in the expanded sub-table.

    The derivation takes `runner` and must not take the other two. `host` is a
    target triple and `container` an image reference; either would be checked
    against the runner list as a label that matches nothing, turning a healthy
    fleet into a refused release.
    """
    config = tomllib.loads((repo_root / "dist-workspace.toml").read_text(encoding="utf-8"))
    runners = config["dist"].get("github-custom-runners", {})
    expanded = {t: e for t, e in runners.items() if isinstance(e, dict)}
    for target, entry in expanded.items():
        label = entry.get("runner", "")
        assert label and "-unknown-" not in label and "/" not in label, (
            f"{target}'s runner label is {label!r}, which looks like a target "
            "triple or an image reference rather than a runner label. The "
            "derivation would check it against the runner list and find nothing."
        )
    assert expanded or runners, (
        "no runner entries at all; the derivation would produce an empty set"
    )


def test_the_guarded_workflows_still_have_a_preflight(
    repo_root: Path, workflows: dict[str, dict]
) -> None:
    """Guard the guard: this module is about a preflight that must exist.

    Every check above concerns what a preflight can see. If the preflight itself
    is deleted, they all keep passing while nothing checks a runner at all.
    """
    without = [
        relative
        for relative, document in workflows.items()
        if not any("preflight" in job.lower() for job in document["jobs"])
    ]
    assert not without, (
        f"{without} no longer declare a preflight job. Nothing now refuses a "
        "release whose runners are offline, and the rest of this module is "
        "checking the reachability of a check that is gone."
    )


def test_the_selector_scan_found_the_scheduling_jobs(
    selectors: list[tuple[str, str, object]],
) -> None:
    """Guard the guard: an empty scan makes every check above vacuous."""
    assert len(selectors) >= 8, (
        f"only {len(selectors)} scheduling jobs were found across "
        f"{len(GUARDED_WORKFLOWS)} workflows; the parse or the job layout "
        "probably changed and these checks are comparing against nothing."
    )
