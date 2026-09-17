"""The CI lanes keep the fleet's shape: named alike, tiered alike, gated alike.

Three lanes, each answering a different question at a different cost:

- ``ci.yml`` runs on every pull-request push and answers only the cheap static
  questions.
- ``merge-gate.yml`` measures everything a change must pass, runs only when a
  maintainer adds ``ci:full`` (or when the release orchestrator calls it), and
  folds the result into ONE check the ruleset requires.
- ``product-release.yml`` orchestrates the release, and nothing becomes visible
  to a user until every gate before it has passed.

The soundness of that arrangement rests on properties no single job shows: a
push must not start the gate, so a new commit cannot merge on an old verdict;
the gate job must never be skipped, because a skipped required check counts
as passed; and it must depend on every measuring job, or a job could fail
without the verdict noticing. Each is asserted here rather than trusted to
review.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

from dev.runner import VerbRef
from dev.toolchain import SIMPLE, VERBS

WORKFLOWS = Path(".github") / "workflows"

CHEAP_LANE = "ci.yml"
GATE_WORKFLOW = "merge-gate.yml"
ORCHESTRATOR = "product-release.yml"
ARCHIVES = "release.yml"

GATE_JOB = "gate"
GATE_NAME = "Check: Merge gate (Linux)"
FULL_LABEL = "ci:full"

#: Every workflow is named for the product, so the Actions sidebar groups this
#: repository's lanes the way the sibling repositories group theirs.
WORKFLOW_PREFIX = "Dashboard "

#: `<Kind>: <Subject> [(<Platform>)]`. Kind says what the job DOES: a check
#: measures or refuses, a test executes the product, a build produces or
#: publishes something. Subject says what is covered, and the optional trailing
#: parenthesis names the runner pool - the only parenthesis permitted.
KINDS = ("Check", "Test", "Build")
_PLACEHOLDER = "X"
_PLATFORM = r"(?:Linux|Windows|macOS|X)(?: (?:X64|ARM64|X))?"
JOB_NAME = re.compile(
    rf"^(?:{'|'.join(KINDS)}): [A-Z][^()]*[^()\s](?: \({_PLATFORM}\))?$"
)
_EXPRESSION = re.compile(r"\$\{\{.*?\}\}")

#: The release chain. A cancelled run reports `cancelled`, not `failed`, so
#: none of these may cancel an in-flight run.
RELEASE_CRITICAL = (
    ORCHESTRATOR,
    ARCHIVES,
    "acquisition.yml",
    "a2a-channel-feasibility.yml",
    "a2a-product-certification.yml",
    "channel-publish-gate.yml",
    "homebrew-bump.yml",
    "scoop-bump.yml",
    "winget-publish.yml",
)

#: Recipes the gate calls to provision the runner rather than to measure.
_PROVISIONING = frozenset({"init", "init-python", "init-node", "init-tools"})
#: A `just` call opening a line, inline (`run: just x`) or inside a block.
_JUST_CALL = re.compile(r"^\s*(?:run:\s*)?just\s+([a-z][a-z0-9-]*)\b", re.MULTILINE)
_DISPATCH = re.compile(
    r"^\{\{dev\}\}\s+(?P<verb>[a-z][a-z0-9-]*)(?:\s+(?P<target>[a-z][a-z0-9-]*))?"
)


def _load(repo_root: Path, workflow: str) -> dict:
    """Return *workflow* parsed as YAML."""
    document = yaml.safe_load((repo_root / WORKFLOWS / workflow).read_text("utf-8"))
    assert isinstance(document, dict), f"{workflow} is not a mapping"
    return document


def _triggers(document: dict) -> dict:
    """Return the `on:` mapping; YAML 1.1 reads a bare `on` key as True."""
    triggers = document.get("on", document.get(True))
    assert isinstance(triggers, dict), "workflow has no `on:` mapping"
    return triggers


def _all_workflows(repo_root: Path) -> list[str]:
    """Every workflow file name, sorted."""
    return sorted(path.name for path in (repo_root / WORKFLOWS).glob("*.yml"))


def _needs(spec: dict) -> set[str]:
    """A job's `needs`, normalised to a set."""
    needs = spec.get("needs", [])
    return {needs} if isinstance(needs, str) else set(needs)


def test_every_workflow_is_named_for_the_product(repo_root: Path) -> None:
    """One prefix, and no two workflows share a display name."""
    names = {
        w: str(_load(repo_root, w).get("name", "")) for w in _all_workflows(repo_root)
    }
    unprefixed = sorted(
        w for w, n in names.items() if not n.startswith(WORKFLOW_PREFIX)
    )
    assert not unprefixed, f"workflows not named `{WORKFLOW_PREFIX}...`: {unprefixed}"
    duplicated = sorted(n for n in names.values() if list(names.values()).count(n) > 1)
    assert not duplicated, f"workflow names used twice: {sorted(set(duplicated))}"


def test_every_job_follows_the_name_grammar(repo_root: Path) -> None:
    """The merge box is read by name; one grammar across every lane."""
    offenders = []
    for workflow in _all_workflows(repo_root):
        for job, spec in _load(repo_root, workflow)["jobs"].items():
            name = str(spec.get("name", ""))
            collapsed = _EXPRESSION.sub(_PLACEHOLDER, name)
            if not JOB_NAME.match(collapsed):
                offenders.append(f"{workflow}:{job} -> {name!r}")
    assert not offenders, (
        "job names must read `<Check|Test|Build>: <Subject> [(<Platform>)]`: "
        f"{offenders}"
    )


def test_every_scheduling_job_has_a_literal_timeout(repo_root: Path) -> None:
    """A queued or hung self-hosted job is unbounded unless the file bounds it."""
    offenders = []
    for workflow in _all_workflows(repo_root):
        for job, spec in _load(repo_root, workflow)["jobs"].items():
            if "runs-on" not in spec:
                continue
            timeout = spec.get("timeout-minutes")
            if (
                not isinstance(timeout, int)
                or isinstance(timeout, bool)
                or timeout <= 0
            ):
                offenders.append(f"{workflow}:{job} -> {timeout!r}")
    assert not offenders, f"jobs without a positive literal timeout: {offenders}"


def test_only_release_please_runs_on_a_push(repo_root: Path) -> None:
    """The merge gate measured the merged tree; a push to main re-measures nothing."""
    pushed = [
        w for w in _all_workflows(repo_root) if "push" in _triggers(_load(repo_root, w))
    ]
    assert pushed == ["release-please.yml"], (
        f"only release-please may run on a push; found {pushed}. Tag triggers are "
        "dead weight here: releases are dispatched by tag from release-please."
    )
    branches = _triggers(_load(repo_root, "release-please.yml"))["push"]["branches"]
    assert branches == ["main"], f"release-please runs on {branches}, not [main]"


def test_the_cheap_lane_runs_on_every_pull_request_push(repo_root: Path) -> None:
    """Fast feedback: every push, only checks, never the verdict."""
    document = _load(repo_root, CHEAP_LANE)
    pull_request = _triggers(document)["pull_request"]
    assert pull_request.get("branches") == ["main"], "name the base branch"
    assert "types" not in pull_request, (
        "the cheap lane must run on every push, so it takes the default types"
    )
    names = [str(spec["name"]) for spec in document["jobs"].values()]
    assert all(n.startswith("Check: ") for n in names), names
    assert GATE_NAME not in names, "the cheap lane must not report the merge verdict"


def test_a_push_never_starts_the_merge_gate(repo_root: Path) -> None:
    """A new commit must carry no gate result until the label is added again."""
    triggers = _triggers(_load(repo_root, GATE_WORKFLOW))
    pull_request = triggers["pull_request"]
    assert pull_request.get("types") == ["labeled"], (
        f"{GATE_WORKFLOW} must start only on `labeled`, not {pull_request.get('types')}"
    )
    assert pull_request.get("branches") == ["main"], "name the base branch"
    assert "workflow_call" in triggers, (
        "the release orchestrator measures the tagged tree through this workflow"
    )


def test_the_gate_is_never_skipped_and_sees_every_job(repo_root: Path) -> None:
    """A skipped required check passes; an unwatched job fails silently."""
    jobs = _load(repo_root, GATE_WORKFLOW)["jobs"]
    gate = jobs[GATE_JOB]
    assert gate["name"] == GATE_NAME
    assert "always()" in str(gate.get("if", "")), "the gate job must run `always()`"
    measuring = set(jobs) - {GATE_JOB}
    assert _needs(gate) == measuring, (
        f"the gate needs {sorted(_needs(gate))} but the workflow measures "
        f"{sorted(measuring)}"
    )
    for job in measuring:
        condition = str(jobs[job].get("if", ""))
        assert FULL_LABEL in condition and "head.repo.full_name" in condition, (
            f"{GATE_WORKFLOW}:{job} must run only for `{FULL_LABEL}` on a "
            "same-repository pull request"
        )


FORK_CLAUSE = "github.event.pull_request.head.repo.full_name == github.repository"
FORK_REFUSAL = "github.event.pull_request.head.repo.full_name != github.repository"


def _fork_offenders(workflow: str, document: dict) -> list[str]:
    """Where a fork's pull request could reach a runner, or pass the verdict.

    Every job a `pull_request` can start must refuse forks in its own `if:`,
    except the verdict, which must run for a fork and fail it in its first step.
    A runner switch to a hosted image is not refusal: it still runs fork code.
    """
    if "pull_request" not in _triggers(document):
        return []
    offenders = []
    for job, spec in document["jobs"].items():
        runs_on = str(spec.get("runs-on", ""))
        if "fromJSON" in runs_on and "head.repo" in runs_on:
            offenders.append(f"{workflow}:{job} switches runners for forks")
        if str(spec.get("name", "")) == GATE_NAME:
            steps = spec.get("steps") or [{}]
            first = steps[0]
            if FORK_REFUSAL not in str(first.get("if", "")) or "uses" in first:
                offenders.append(f"{workflow}:{job} does not fail forks first")
            continue
        if FORK_CLAUSE not in str(spec.get("if", "")):
            offenders.append(f"{workflow}:{job} can run for a fork")
    return offenders


def test_fork_pull_requests_are_always_refused(repo_root: Path) -> None:
    """No fork's pull request gets a runner, and none can pass the verdict."""
    offenders = [
        finding
        for workflow in _all_workflows(repo_root)
        for finding in _fork_offenders(workflow, _load(repo_root, workflow))
    ]
    assert not offenders, offenders


@pytest.mark.parametrize(
    ("workflow", "job"),
    [(CHEAP_LANE, "static"), (GATE_WORKFLOW, "engine"), (GATE_WORKFLOW, GATE_JOB)],
)
def test_the_fork_guard_notices_a_removed_clause(
    repo_root: Path, workflow: str, job: str
) -> None:
    """Guard the guard: stripping the refusal must be reported."""
    document = _load(repo_root, workflow)
    assert not _fork_offenders(workflow, document)
    spec = document["jobs"][job]
    if job == GATE_JOB:
        spec["steps"][0]["if"] = "${{ false }}"
    else:
        spec["if"] = str(spec.get("if", "")).replace(FORK_CLAUSE, "true")
    assert _fork_offenders(workflow, document), (
        f"removing the fork refusal from {workflow}:{job} went unnoticed"
    )


def test_just_ci_is_exactly_the_merge_gate(
    repo_root: Path, recipe_bodies: dict[str, list[str]]
) -> None:
    """The parity rule: the local pipeline and the required check are one policy."""
    text = (repo_root / WORKFLOWS / GATE_WORKFLOW).read_text("utf-8")
    called = set(_JUST_CALL.findall(text)) - _PROVISIONING
    gate: set[tuple[str, str]] = set()
    for recipe in called:
        body = recipe_bodies[recipe]
        match = _DISPATCH.match(body[0].strip())
        assert match, f"`just {recipe}` does not dispatch a verb"
        gate.add((match["verb"], match["target"] or SIMPLE))
    local = {
        (step.verb, step.target)
        for step in VERBS["ci"].targets[SIMPLE].steps
        if isinstance(step, VerbRef)
    }
    assert local == gate, (
        f"`just ci` runs {sorted(local)} but the merge gate runs {sorted(gate)}"
    )


@pytest.mark.parametrize("workflow", RELEASE_CRITICAL)
def test_release_critical_runs_are_never_cancelled(
    repo_root: Path, workflow: str
) -> None:
    """A cancelled release gate reports `cancelled`, which nothing reads as red."""
    concurrency = _load(repo_root, workflow).get("concurrency", {})
    assert concurrency.get("cancel-in-progress") is False, (
        f"{workflow} must declare `cancel-in-progress: false`"
    )
    assert "${{" in str(concurrency.get("group", "")), (
        f"{workflow} needs a keyed concurrency group, never an unkeyed one"
    )


def test_no_credential_falls_back_to_the_default_token(repo_root: Path) -> None:
    """A fallback that changes what a job can observe must change whether it passes."""
    fallback = re.compile(r"\|\|\s*(?:secrets\.GITHUB_TOKEN|github\.token)")
    offenders = [
        f"{w}:{number}"
        for w in _all_workflows(repo_root)
        for number, line in enumerate(
            (repo_root / WORKFLOWS / w).read_text("utf-8").splitlines(), start=1
        )
        if fallback.search(line) and not line.lstrip().startswith("#")
    ]
    assert not offenders, f"credential fallbacks in {offenders}"


def test_nothing_is_visible_before_every_gate_passes(repo_root: Path) -> None:
    """Draft -> prerelease after the gates -> latest after acquisition."""
    jobs = _load(repo_root, ORCHESTRATOR)["jobs"]
    for builder in ("archives", "build-product-tree"):
        assert {"merge-gate", "preflight"} <= _needs(jobs[builder]), (
            f"{builder} must wait for the merge gate and the runner preflight"
        )
    assert jobs["merge-gate"]["uses"].endswith(GATE_WORKFLOW)
    assert jobs["archives"]["uses"].endswith(ARCHIVES)
    assert {"archives", "attach-to-release", "channel-feasibility"} <= _needs(
        jobs["publish-prerelease"]
    )
    assert jobs["acquisition"]["uses"].endswith("acquisition.yml")
    assert "publish-prerelease" in _needs(jobs["acquisition"])
    assert "acquisition" in _needs(jobs["promote-release"])
    for channel in ("homebrew-bump", "scoop-bump"):
        assert "promote-release" in _needs(jobs[channel]), (
            f"{channel} must publish only a promoted release"
        )

    text = (repo_root / WORKFLOWS / ORCHESTRATOR).read_text("utf-8")
    assert text.count("--draft=false") == 1, (
        "exactly one step may take the release out of draft"
    )
    assert "--draft=false" not in (repo_root / WORKFLOWS / ARCHIVES).read_text(
        "utf-8"
    ), f"{ARCHIVES} uploads to the draft; it must never publish it"


def test_release_please_dispatches_the_orchestrator_by_tag(repo_root: Path) -> None:
    """A workflow-created tag raises no tag event; the chain is an explicit dispatch."""
    jobs = _load(repo_root, "release-please.yml")["jobs"]
    runs = [
        str(step.get("run", ""))
        for spec in jobs.values()
        for step in spec.get("steps", [])
    ]
    dispatch = [r for r in runs if r.startswith(f"gh workflow run {ORCHESTRATOR}")]
    assert dispatch, f"release-please never dispatches {ORCHESTRATOR}"
    assert all("--ref" in r and "-f tag=" in r for r in dispatch), dispatch
    triggers = _triggers(_load(repo_root, ORCHESTRATOR))
    assert set(triggers) == {"workflow_dispatch"}, (
        f"{ORCHESTRATOR} must be dispatch-only, not {sorted(triggers)}"
    )
