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
import subprocess
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


# ---------------------------------------------------------------------------
# The behavioural half.
#
# Everything above asks whether a selector COULD be seen. That is not the same
# question as whether the derivation actually produces it, and the difference
# is not academic: the derivation shipped with `grep -v '\$\{\{'`, a basic
# regex in which `\{` opens an interval. grep aborted with `Unmatched \{`,
# emitted nothing and exited 2, so the literal-list half contributed no
# selectors at all - while the step still reported ok on the four the dist
# table supplied, and exited 0.
#
# `self-hosted,linux,x64` was therefore never checked. That is the label every
# non-target job schedules onto, and the one with no online runner through the
# morning this preflight was written to protect. A guard that passes in that
# state is not a guard, and the structural checks above passed in exactly it.
#
# So this runs the real step and reads what it actually emits.
# ---------------------------------------------------------------------------

DERIVE_STEP = "Derive the selectors this workflow schedules onto"


def _derive(repo_root: Path, workflow: str) -> set[str]:
    """Run a workflow's own derivation step and return the selectors it emits.

    The step's `run` block is executed verbatim, at the repository root, exactly
    as the runner executes it. Nothing is reimplemented here - a second
    implementation would be a second thing to drift.

    Args:
        repo_root: The repository root directory.
        workflow: The workflow path, relative to the root.

    Returns:
        The selector set the step wrote to `GITHUB_OUTPUT`.
    """
    document = yaml.safe_load((repo_root / workflow).read_text(encoding="utf-8"))
    script = next(
        step["run"]
        for spec in document["jobs"].values()
        for step in (spec.get("steps") or [])
        if str(step.get("name", "")) == DERIVE_STEP
    )
    # The runner reads this file with LF endings; a Windows checkout hands it
    # back with CRLF, and bash reads the trailing carriage return as part of the
    # token - `set -uo pipefail\r` is an invalid option, and the script dies on
    # its first line. Normalising reproduces what the runner actually executes
    # rather than what this filesystem happens to store.
    script = script.replace("\r\n", "\n")
    # The output file is RELATIVE to the repository root, which is already the
    # working directory. An absolute Windows path handed to a Windows bash does
    # not resolve in a redirect, and the script then fails on its own output
    # file - a failure about this harness rather than about the derivation it is
    # meant to report on. A relative name crosses no boundary at all.
    #
    # GITHUB_OUTPUT is exported INSIDE the script rather than passed through
    # `env=`, for the same class of reason: a Windows bash re-initialises its
    # environment from the Win32 block and the variable does not survive.
    #
    # Bytes, not text: in text mode Python re-encodes stdin with the platform
    # line ending, which undoes the LF normalisation above on the way in.
    relative = ".preflight-derivation-output"
    output = repo_root / relative
    try:
        output.write_text("", encoding="utf-8")
        prelude = "export GITHUB_OUTPUT='" + relative + "'\n"
        completed = subprocess.run(  # noqa: S603 - the repo's own workflow step
            ["bash", "-s"],
            input=(prelude + script).encode("utf-8"),
            cwd=repo_root,
            capture_output=True,
            timeout=120,
            check=False,
        )
        emitted = output.read_text(encoding="utf-8")
    finally:
        output.unlink(missing_ok=True)
    assert completed.returncode == 0, (
        f"{workflow}'s derivation exited {completed.returncode}: "
        f"{completed.stderr.decode(errors='replace').strip()[:400]}"
    )
    body = re.search(r"selectors<<SELECTORS_EOF\n(.*?)\nSELECTORS_EOF", emitted, re.S)
    assert body, (
        f"{workflow}'s derivation wrote no selectors block to GITHUB_OUTPUT. "
        f"stderr: {completed.stderr.decode(errors='replace').strip()[:400]}"
    )
    return {line.strip() for line in body.group(1).splitlines() if line.strip()}


@pytest.mark.parametrize("workflow", GUARDED_WORKFLOWS)
def test_the_derivation_emits_every_literal_selector(
    repo_root: Path, workflow: str, workflows: dict[str, dict]
) -> None:
    """Every literal `runs-on` list must appear in what the derivation emits.

    The expectation is read from the workflow's own jobs rather than written
    down here, so adding a job with a new label extends the requirement without
    anyone remembering to.
    """
    expected = set()
    for spec in workflows[workflow]["jobs"].values():
        value = spec.get("runs-on")
        if isinstance(value, list) and not any("${{" in str(v) for v in value):
            expected.add(",".join(str(v).strip().lower() for v in value))
    assert expected, f"{workflow} declares no literal label list to check against"

    emitted = _derive(repo_root, workflow)
    missing = sorted(expected - emitted)
    assert not missing, (
        f"{workflow}'s preflight derives {sorted(emitted)} and so never checks "
        f"{missing}. Those jobs schedule onto a fleet label the preflight cannot "
        "see, which is the state it reports ok in while the release queues."
    )


@pytest.mark.parametrize("workflow", GUARDED_WORKFLOWS)
def test_the_derivation_is_not_quietly_empty(repo_root: Path, workflow: str) -> None:
    """Guard the guard: a derivation that emits nothing must not read as ok.

    The step refuses to pass vacuously on an empty set, which is right. This
    asserts the refusal is never reached in the healthy tree - a run that
    derives nothing is a broken derivation, not an empty workflow.
    """
    emitted = _derive(repo_root, workflow)
    assert len(emitted) >= 2, (
        f"{workflow}'s derivation emitted {sorted(emitted)}. Both halves - the "
        "literal label lists and the dist table - should contribute, so a set "
        "this small means one of them silently produced nothing."
    )
