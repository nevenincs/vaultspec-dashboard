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

import json
import re
import shutil
import subprocess
import tempfile
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
    "${{ matrix.os }}": "the build-product-tree matrix",
    "${{ matrix.arch }}": "the build-product-tree matrix",
}

#: The release build job's `runs-on`: dist's single-string runner KEY (from
#: dist-workspace.toml [dist.github-custom-runners]) translated into a standard
#: fleet label set. dist 0.32.0 models a runner as one label string, and the
#: fleet standard forbids a custom label like `linux-x64`, so the translation is
#: hand-maintained in release.yml and the derivation reads it from that line.
_DIST_TRANSLATION = re.compile(r"^\$\{\{\s*fromJSON\(matrix\.runner ==")
_DIST_PAIR = re.compile(r"matrix\.runner == '([^']+)' && '(\[[^\]]*\])'")
_RELEASE = ".github/workflows/release.yml"

#: What a fleet runner may be selected by: OS and architecture, plus the
#: capabilities the fleet standard names. Anything else encodes a repo or tool.
_STANDARD_OS = {"Linux", "Windows", "macOS"}
_STANDARD_ARCH = {"X64", "ARM64"}
_STANDARD_CAPABILITIES = {"gpu", "cuda", "build", "dev-runner"}


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
                resolved = str(label).strip() in RESOLVED_TEMPLATES
                if not resolved and not _DIST_TRANSLATION.match(str(label).strip()):
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
    config = tomllib.loads(
        (repo_root / "dist-workspace.toml").read_text(encoding="utf-8")
    )
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
    config = tomllib.loads(
        (repo_root / "dist-workspace.toml").read_text(encoding="utf-8")
    )
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


def _dist_runner_keys(repo_root: Path) -> set[str]:
    """Every runner key dist-workspace.toml hands dist, in both table forms."""
    config = tomllib.loads(
        (repo_root / "dist-workspace.toml").read_text(encoding="utf-8")
    )
    runners = config["dist"].get("github-custom-runners", {})
    keys = set()
    for entry in runners.values():
        key = entry.get("runner") if isinstance(entry, dict) else entry
        if key:
            keys.add(str(key))
    return keys


def _dist_translation(workflows: dict[str, dict]) -> dict[str, list[str]]:
    """The release build job's dist-key -> label-set translation, parsed."""
    templated = [
        str(spec["runs-on"]).strip()
        for spec in workflows[_RELEASE]["jobs"].values()
        if _DIST_TRANSLATION.match(str(spec.get("runs-on", "")).strip())
    ]
    assert len(templated) == 1, (
        f"{_RELEASE} should translate dist's runner key in exactly one job's "
        f"runs-on; found {len(templated)}. The derivation reads that one line."
    )
    return {key: json.loads(labels) for key, labels in _DIST_PAIR.findall(templated[0])}


def test_every_dist_runner_key_has_a_translation(
    repo_root: Path, workflows: dict[str, dict]
) -> None:
    """A dist key with no translation schedules a leg onto a label nobody has.

    dist writes the key verbatim into the build matrix; the release build job's
    `runs-on` is what turns it into labels a runner carries. A key added to
    dist-workspace.toml without a matching arm falls through to an
    `unmapped-dist-runner-*` label and the leg would queue until GitHub
    cancels it.
    """
    translation = _dist_translation(workflows)
    missing = sorted(_dist_runner_keys(repo_root) - set(translation))
    assert not missing, (
        f"dist-workspace.toml names runner key(s) {missing} that {_RELEASE}'s "
        "build-local-artifacts runs-on does not translate. Add an arm mapping "
        "each to a standard label set."
    )


def test_the_translation_targets_only_standard_label_sets(
    workflows: dict[str, dict],
) -> None:
    """The fleet standard: self-hosted, one OS, one arch, standard capabilities.

    A repo- or tool-specific label (the `linux-x64` this translation replaced)
    is carried by no runner once the fleet enforces the standard, so a
    translation that emits one strands the leg just as an unmapped key does.
    """
    offenders = {}
    for key, labels in _dist_translation(workflows).items():
        rest = labels[1:]
        oses = [label for label in rest if label in _STANDARD_OS]
        arches = [label for label in rest if label in _STANDARD_ARCH]
        extra = [
            label
            for label in rest
            if label not in _STANDARD_OS
            and label not in _STANDARD_ARCH
            and label not in _STANDARD_CAPABILITIES
        ]
        if labels[:1] != ["self-hosted"] or len(oses) != 1 or len(arches) != 1 or extra:
            offenders[key] = labels
    assert not offenders, (
        f"{offenders} are not standard fleet label sets: expected "
        "[self-hosted, <Linux|Windows|macOS>, <X64|ARM64>, *capabilities] with "
        f"capabilities drawn from {sorted(_STANDARD_CAPABILITIES)}."
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
    # Each invocation owns its output. Multiple agents can run the full lint gate
    # against one worktree, so a shared filename lets one cleanup race another
    # invocation between the workflow script and this read.
    with tempfile.NamedTemporaryFile(
        dir=repo_root,
        prefix=".preflight-derivation-output-",
        delete=False,
    ) as output_file:
        output = Path(output_file.name)
    relative = output.name
    try:
        output.write_text("", encoding="utf-8")
        prelude = "export GITHUB_OUTPUT='" + relative + "'\n"
        completed = subprocess.run(
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


def test_the_derivation_checks_every_dist_leg_by_its_standard_label_set(
    repo_root: Path, workflows: dict[str, dict]
) -> None:
    """The preflight must check what the build job will actually request.

    Checking dist's symbolic key would ask the fleet for a label no runner
    carries and refuse every release; checking nothing would pass while a leg
    queues. The derivation has to emit the translated set for every key.
    """
    translation = _dist_translation(workflows)
    expected = {
        ",".join(label.lower() for label in translation[key])
        for key in _dist_runner_keys(repo_root)
        if key in translation
    }
    emitted = _derive(repo_root, _RELEASE)
    assert expected <= emitted, (
        f"{_RELEASE}'s derivation emits {sorted(emitted)} but the build legs "
        f"request {sorted(expected)}; missing {sorted(expected - emitted)}."
    )
    raw = {key.lower() for key in _dist_runner_keys(repo_root)}
    leaked = sorted(raw & emitted)
    assert not leaked, (
        f"the derivation emits dist's symbolic key(s) {leaked} as selectors; "
        "no runner carries them, so the preflight would refuse every release."
    )


def test_an_unmapped_dist_key_fails_the_derivation(
    repo_root: Path, tmp_path: Path
) -> None:
    """Mutation: a new dist key without a translation must stop the release.

    Runs the real derivation over a copy of the tree whose dist table gains a
    key the translation does not know.
    """
    (tmp_path / ".github" / "workflows").mkdir(parents=True)
    shutil.copy(repo_root / _RELEASE, tmp_path / _RELEASE)
    config = (repo_root / "dist-workspace.toml").read_text(encoding="utf-8")
    table = "[dist.github-custom-runners]\n"
    unmapped = '  riscv64gc-unknown-linux-gnu = "linux-riscv64"\n'
    config = config.replace(table, table + unmapped, 1)
    assert "linux-riscv64" in config
    (tmp_path / "dist-workspace.toml").write_text(config, encoding="utf-8")
    with pytest.raises(AssertionError, match="has no translation"):
        _derive(tmp_path, _RELEASE)
