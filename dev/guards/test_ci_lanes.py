"""The CI lanes keep the fleet's shape: named alike, tiered alike, gated alike.

Three lanes, each answering a different question at a different cost:

- ``ci.yml`` runs on every pull-request push and answers only the cheap static
  questions.
- ``merge-gate.yml`` measures everything a change must pass, runs only when a
  maintainer adds ``ci:full`` (or when the release cut or the orchestrator calls
  it on a named ref), and folds the result into ONE check the ruleset requires.
- ``release-please.yml`` keeps the release proposal current on every push and
  cuts a release only when a maintainer dispatches it.
- ``product-release.yml`` orchestrates the release, and nothing becomes visible
  to a user until every gate before it has passed.

The soundness of that arrangement rests on properties no single job shows: a
push must not start the gate, so a new commit cannot merge on an old verdict;
the gate job must never be skipped, because a skipped required check counts
as passed; it must depend on every measuring job, or a job could fail without
the verdict noticing; only a trusted author's change may reach the self-hosted
fleet at all; nothing under the workspace may execute before the job that owns
it has checked out; and only the dispatched cut may create a release, on a
commit the gate has already passed. Each is asserted here rather than trusted
to review.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

from dev.guards.conftest import devserver_constant
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


def _shared_workflows(repo_root: Path) -> set[str]:
    """The machine-wide Dev server workflow, when it is byte-identical to canonical.

    `.github/workflows/devserver.yml` is not this repository's lane. It is
    rendered from the shared dev-server harness (`dev/devserver.py render
    workflow`) and identical in every web app on the workstation, so it carries
    the harness's own name ("Dev server", not "Dashboard ...") and its own push
    trigger, and `just dev check` fails when it drifts. Exempting it only while
    it matches the canonical text keeps the exemption from covering a hand-edited
    copy - or anything else placed at that path.
    """
    path = devserver_constant("WORKFLOW_PATH")
    text = (repo_root / path).read_text("utf-8") if (repo_root / path).is_file() else ""
    return {Path(path).name} if text == devserver_constant("WORKFLOW") else set()


def test_every_workflow_is_named_for_the_product(repo_root: Path) -> None:
    """One prefix, and no two workflows share a display name."""
    names = {
        w: str(_load(repo_root, w).get("name", ""))
        for w in _all_workflows(repo_root)
        if w not in _shared_workflows(repo_root)
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
    """The merge gate measured the merged tree; a push to main re-measures nothing.

    The shared Dev server workflow is exempt (see `_shared_workflows`): its
    triggers are fixed machine-wide, not by this repository's lane design.
    """
    pushed = [
        w
        for w in _all_workflows(repo_root)
        if w not in _shared_workflows(repo_root)
        and "push" in _triggers(_load(repo_root, w))
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
    """A skipped required check passes; an unwatched job fails silently.

    The gate's condition is asserted EXACTLY, not by substring. The condition it
    replaces read `(event != pull_request || same-repo) && (always())`, which
    still contains `always()` and is still skipped for a fork - and a skipped
    required check counts as passed, so the one case the refusal exists for was
    the one case it never ran. Every refusal belongs in the job's steps, where it
    produces a red verdict rather than an absent one.

    Mutation proof: narrowing the condition to
    `${{ github.event_name != 'pull_request' && !cancelled() }}` makes this fail
    on the exact-condition assertion; restoring it makes this pass.
    """
    jobs = _load(repo_root, GATE_WORKFLOW)["jobs"]
    gate = jobs[GATE_JOB]
    assert gate["name"] == GATE_NAME
    assert str(gate.get("if", "")) == "${{ !cancelled() }}", (
        "the gate job's condition must be exactly `${{ !cancelled() }}`: any "
        "narrowing skips the required check for the case it narrows away, and a "
        f"skipped required check counts as PASSED. Found {gate.get('if')!r}"
    )
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


#: A pull request reaches the self-hosted fleet only for an author the
#: repository already trusts. Written as two equalities rather than
#: `contains(fromJSON('["OWNER", "COLLABORATOR"]'), ...)`: the two mean the same
#: thing, and a scenario evaluator that treats every function call as
#: undecidable can prove a verdict for the equality form and not for the other.
TRUSTED_AUTHOR = (
    "(github.event.pull_request.author_association == 'OWNER' || "
    "github.event.pull_request.author_association == 'COLLABORATOR')"
)

#: The other door: applying a label takes triage rights, so a USER's label is
#: itself the review that admits a change. A bot's label is not.
LABEL_BY_USER = (
    "github.event.action == 'labeled' && "
    f"github.event.label.name == '{FULL_LABEL}' && "
    "github.event.sender.type == 'User'"
)

#: Workflows whose `pull_request`-reachable jobs this repository does not own.
#: `devserver.yml` is a byte-identical render of the machine-wide harness (see
#: `_shared_workflows`); its conditions are fixed there, not here.
_UNOWNED_PULL_REQUEST_LANES = frozenset({"devserver.yml"})


def _untrusted_reachable(workflow: str, document: dict) -> list[str]:
    """Jobs a `pull_request` can start on the fleet for an untrusted author.

    The verdict job is exempt and must NOT carry the clause: it has to run for
    everyone and refuse by name in its steps.
    """
    if "pull_request" not in _triggers(document):
        return []
    offenders = []
    for job, spec in document["jobs"].items():
        if str(spec.get("name", "")) == GATE_NAME:
            continue
        condition = str(spec.get("if", ""))
        if TRUSTED_AUTHOR not in condition and LABEL_BY_USER not in condition:
            offenders.append(f"{workflow}:{job}")
    return offenders


def test_only_a_trusted_author_or_a_users_label_reaches_the_fleet(
    repo_root: Path,
) -> None:
    """An untrusted author's code runs nothing here until someone reads it.

    Dependabot and every other author who is neither owner nor collaborator push
    branches of THIS repository, so the fork clause never stops them and the
    approval requirement for outside contributors does not cover them. Their
    change reaches the self-hosted fleet only after a user with triage rights
    has admitted it - by applying `ci:full` on the gate, which is the one lane
    with a label door.

    Mutation proof: replacing the author clause in `ci.yml`'s `static` condition
    with `true` makes this fail naming that job; restoring it makes this pass.
    """
    offenders = [
        finding
        for workflow in _all_workflows(repo_root)
        if workflow not in _UNOWNED_PULL_REQUEST_LANES
        for finding in _untrusted_reachable(workflow, _load(repo_root, workflow))
    ]
    assert not offenders, (
        "these jobs run a pull request on the self-hosted fleet whatever its "
        f"author, Dependabot included: {offenders}"
    )


@pytest.mark.parametrize(
    ("workflow", "job"), [(CHEAP_LANE, "static"), (GATE_WORKFLOW, "engine")]
)
def test_the_trust_guard_notices_a_removed_clause(
    repo_root: Path, workflow: str, job: str
) -> None:
    """Guard the guard: stripping the trust clause must be reported."""
    document = _load(repo_root, workflow)
    assert not _untrusted_reachable(workflow, document)
    spec = document["jobs"][job]
    spec["if"] = (
        str(spec["if"]).replace(TRUSTED_AUTHOR, "true").replace(LABEL_BY_USER, "true")
    )
    assert _untrusted_reachable(workflow, document) == [f"{workflow}:{job}"], (
        f"removing the trust clause from {workflow}:{job} went unnoticed"
    )


def test_the_gate_refuses_an_untrusted_author_by_name(repo_root: Path) -> None:
    """The verdict says why nothing ran, and says it after looking for a verdict.

    Two orderings carry the whole value of this. The earlier-verdict lookup comes
    FIRST, so an untrusted author's commit that a collaborator's `ci:full`
    already proved keeps its pass. The named refusal comes before the generic
    "add the ci:full label" message, because telling an author to apply a label
    they have no rights to apply reads as a broken gate rather than as a review
    still owed.

    Mutation proof: deleting the `case "$ASSOCIATION" in OWNER | COLLABORATOR`
    refusal from the verdict script makes this fail on that marker; restoring it
    makes this pass.
    """
    gate = _load(repo_root, GATE_WORKFLOW)["jobs"][GATE_JOB]
    steps = {str(step.get("name", "")): step for step in gate["steps"]}
    judge = steps["Decide the merge verdict"]
    env = judge["env"]
    assert env["ASSOCIATION"] == "${{ github.event.pull_request.author_association }}"
    assert env["AUTHOR"] == "${{ github.event.pull_request.user.login }}"
    assert env["SENDER_TYPE"] == "${{ github.event.sender.type }}"

    script = str(judge["run"])
    marker = 'case "$ASSOCIATION" in OWNER | COLLABORATOR) ;;'
    assert marker in script, (
        "the verdict no longer refuses a commit by an author who is neither the "
        "owner nor a collaborator; it would tell them to apply a label they "
        "cannot apply"
    )
    lookup = script.index("check_name=")
    refusal = script.index(marker)
    generic = script.index("No passing ci:full run has measured")
    assert lookup < refusal, (
        "an untrusted author's commit that a collaborator's ci:full already "
        "proved must keep that verdict, so the lookup comes first"
    )
    assert refusal < generic, (
        "the untrusted author must be refused by name, not told to add a label"
    )
    nothing_ran = 'if [ "$EVENT" = "pull_request" ] && [ "$measured" = "0" ]; then'
    assert nothing_ran in script, (
        "a ci:full run whose every measuring job was conditioned off - a bot "
        "applied the label - must be refused by name too, not reported as six "
        "jobs that failed"
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


#: A step reading code out of the workspace rather than out of itself: an
#: interpreter pointed at a repository path, a recipe, a package script, or a
#: module from the harness. Anchored to a command position so that `2>/dev/null`
#: and a path inside a quoted message are not mistaken for one. A `uses:` on a
#: local path is the same defect in another spelling - the action is resolved
#: from the checked-out tree - and is handled separately.
_WORKSPACE_CODE = re.compile(
    r"(?m)(?:^|[|&;]\s*|\$\()\s*"
    r"(?:sh|bash|pwsh|python3?|node)\s+[\"']?(?:\./)?(?:\.github|dev|frontend|engine)/"
    r"|(?:^|[|&;]\s*)\s*(?:just|npm|npx|cargo)\s"
    r"|(?:^|[|&;]\s*)\s*uv\s+run\b"
    r"|python3?\s+-m\s+dev\b"
)


def _executes_before_checkout(workflow: str, document: dict) -> list[str]:
    """Steps that run workspace-resident code before their job checks out."""
    offenders = []
    for job, spec in document["jobs"].items():
        for step in spec.get("steps") or []:
            uses = str(step.get("uses", ""))
            if uses.startswith("actions/checkout@"):
                break
            if uses.startswith("./"):
                offenders.append(f"{workflow}:{job}:{uses} (local action)")
                continue
            found = _WORKSPACE_CODE.search(str(step.get("run", "")))
            if found:
                offenders.append(
                    f"{workflow}:{job}:{step.get('name')} -> {found.group().strip()!r}"
                )
    return offenders


def test_nothing_in_the_workspace_runs_before_its_own_checkout(
    repo_root: Path,
) -> None:
    """A job never executes the tree the previous job left behind.

    The runners are persistent and three of them share the machine. A job the
    runner is shut down under never reaches its trailing steps, so its whole
    checkout is still there when the next job starts - and that checkout can be
    any branch, a Dependabot pull request included. A pre-checkout step that
    reads a script, a recipe or a local action out of the workspace therefore
    runs the PREVIOUS branch's code with THIS job's credentials and permissions.

    Mutation proof: restoring the pre-checkout step to
    `run: bash .github/scripts/reclaim-workspace.sh || true` in `ci.yml` makes
    this fail naming that step; restoring the inline body makes this pass.
    """
    offenders = [
        finding
        for workflow in _all_workflows(repo_root)
        for finding in _executes_before_checkout(workflow, _load(repo_root, workflow))
    ]
    assert not offenders, (
        "these steps execute workspace-resident code before their own job has "
        f"checked out, so they run whatever tree the previous job left: {offenders}"
    )


def test_the_pre_checkout_reclaim_is_one_text_in_every_lane(repo_root: Path) -> None:
    """The one thing a workflow cannot factor out must not be allowed to drift.

    There is no include, and a script or a local action is exactly what cannot be
    used here, so the reclaim is inline in every job that needs it. Byte equality
    is the substitute for having one copy: a fix to one of them is a fix to all
    of them, or this fails.

    Mutation proof: deleting the `.git/hooks` removal from `code-health.yml`'s
    copy makes this fail on the drift count; restoring it makes this pass.
    """
    bodies: dict[str, list[str]] = {}
    for workflow in _all_workflows(repo_root):
        for job, spec in _load(repo_root, workflow)["jobs"].items():
            for step in spec.get("steps") or []:
                if str(step.get("name", "")) == "Reclaim the workspace before checkout":
                    bodies.setdefault(str(step["run"]), []).append(f"{workflow}:{job}")
    assert len(bodies) == 1, (
        "the pre-checkout reclaim has drifted into "
        f"{len(bodies)} variants: {list(bodies.values())}"
    )
    sites = next(iter(bodies.values()))
    assert len(sites) >= 8, (
        f"only {len(sites)} jobs reclaim before checkout ({sites}); a job that "
        "stopped doing it hits EACCES on its own checkout instead"
    )
    body = next(iter(bodies))
    assert ".git/hooks" in body, (
        "the reclaim must drop `.git/hooks`: `git clean` does not reach inside "
        "`.git`, so a previous job's hook survives into this one"
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
        assert "merge-gate" in _needs(jobs[builder]), (
            f"{builder} must wait for the merge gate"
        )
    # A job sent to a selector with no online runner queues rather than fails,
    # and `timeout-minutes` does not bound the wait. The watchdog reads this
    # run's own jobs - never the fleet's inventory - and cancels the run.
    watchdog = jobs["queue-watchdog"]
    assert watchdog["permissions"] == {"actions": "write"}, watchdog["permissions"]
    script = "".join(str(step.get("run", "")) for step in watchdog["steps"])
    assert "actions/runs/${RUN_ID}/jobs" in script, script
    assert "gh run cancel" in script, script
    assert "actions/runners" not in script, "the watchdog must not read fleet inventory"
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


AUTHORITY = "release-please.yml"
RELEASE_ACTION = "googleapis/release-please-action@"
CUT_JOB = "cut"


def _release_steps(repo_root: Path, workflow: str) -> list[tuple[str, dict]]:
    """Every step in *workflow*, paired with the job that owns it."""
    return [
        (job, step)
        for job, spec in _load(repo_root, workflow)["jobs"].items()
        for step in spec.get("steps") or []
    ]


def test_only_the_dispatched_cut_creates_a_release(repo_root: Path) -> None:
    """The proposal path proposes; releasing is something a maintainer asks for.

    Every commit on main refreshes the release pull request, and that path must
    never tag or release: merging the proposal by hand releases nothing either.
    A maintainer dispatches the cut, which proves, merges, tags and then starts
    the orchestrator. If the proposal path could release, a commit would tag
    itself the moment it landed, before any gate had seen the merged tree.

    Mutation proof: dropping `skip-github-release: true` from the proposal step
    makes this fail naming `release-please` as a job that can release; restoring
    it makes this pass.
    """
    creators = sorted(
        job
        for job, step in _release_steps(repo_root, AUTHORITY)
        if str(step.get("uses", "")).startswith(RELEASE_ACTION)
        and (step.get("with") or {}).get("skip-github-release") is not True
    )
    assert creators == [CUT_JOB], (
        "only the dispatched cut may create a release; every other "
        "release-please step must run with `skip-github-release: true`, but "
        f"these jobs can release: {creators}"
    )
    triggers = _triggers(_load(repo_root, AUTHORITY))
    assert set(triggers) == {"push", "workflow_dispatch"}, (
        f"{AUTHORITY} carries the proposal and the cut, and nothing else: "
        f"found {sorted(triggers)}"
    )


def test_the_release_is_proven_before_anything_is_tagged(repo_root: Path) -> None:
    """The cut merges and tags only the head the full merge gate passed.

    A release tag cannot be deleted, so the proof comes before it: a release
    commit that fails its gate after its tag exists is a permanent tag of a
    commit nobody can ship. The cut therefore waits on the merge gate called on
    the candidate's exact head, carries no condition that could override that
    success, merges only that head, and refuses a merged tree that differs from
    the proven one before Release Please creates anything.

    Mutation proof: removing `prove-gate` from the cut's `needs` makes this fail
    on the gate dependency; restoring it makes this pass.
    """
    jobs = _load(repo_root, AUTHORITY)["jobs"]
    prove = jobs["prove-gate"]
    assert prove["uses"].endswith(GATE_WORKFLOW)
    assert prove["with"]["ref"] == "${{ needs.candidate.outputs.sha }}", (
        "the release gate must measure the candidate's exact head, not a branch "
        "that can move under it"
    )
    cut = jobs[CUT_JOB]
    assert "prove-gate" in _needs(cut), "the cut must wait on the release gate"
    assert "if" not in cut, (
        "a condition on the cut overrides the default success check, which is "
        "the only thing stopping a failed gate from tagging a release"
    )
    names = [str(step.get("name", "")) for step in cut["steps"]]
    assert names.index("Merge the proven release pull request") < names.index(
        "Create the release for the merged proposal"
    ), "the cut must merge before it creates the release"
    merge = str(cut["steps"][0]["run"])
    assert '--match-head-commit "${SHA}"' in merge, (
        "the cut must merge only the head the gate proved"
    )
    assert "tree.sha" in merge, (
        "the cut must refuse a merged commit that does not carry the proven tree"
    )
    require = next(
        step for step in cut["steps"] if step.get("name", "").startswith("Require the")
    )
    assert "release_created" in str(require["env"]["CREATED"])
    assert "not the proven" in str(require["run"]), (
        "the cut must refuse a tag that points at anything but the proven commit"
    )


def test_a_call_must_name_the_ref_it_wants_measured(repo_root: Path) -> None:
    """A caller that omits the ref measures its own, which for a release is wrong.

    Mutation proof: changing the cut's `ref:` to `main` makes this fail naming
    that caller; restoring the candidate's sha makes this pass.
    """
    call = _triggers(_load(repo_root, GATE_WORKFLOW))["workflow_call"]
    assert call["inputs"]["ref"]["required"] is True, (
        "the merge gate's `ref` input must be required: a caller that leaves it "
        "out measures the CALLER's ref, and the release cut's ref is main, not "
        "the commit it is about to merge"
    )
    for workflow, expected in ((AUTHORITY, "candidate"), (ORCHESTRATOR, "inputs.tag")):
        callers = [
            (job, spec)
            for job, spec in _load(repo_root, workflow)["jobs"].items()
            if str(spec.get("uses", "")).endswith(GATE_WORKFLOW)
        ]
        assert callers, f"{workflow} no longer calls {GATE_WORKFLOW}"
        for job, spec in callers:
            assert expected in str(spec.get("with", {}).get("ref", "")), (
                f"{workflow}:{job} calls the gate without naming {expected}"
            )


def test_release_please_dispatches_the_orchestrator_by_tag(repo_root: Path) -> None:
    """A workflow-created tag raises no tag event; the chain is an explicit dispatch."""
    dispatch = [
        str(step.get("run", ""))
        for _, step in _release_steps(repo_root, AUTHORITY)
        if str(step.get("run", "")).startswith(f"gh workflow run {ORCHESTRATOR}")
    ]
    assert dispatch, f"release-please never dispatches {ORCHESTRATOR}"
    assert all("--ref" in r and "-f tag=" in r for r in dispatch), dispatch
    triggers = _triggers(_load(repo_root, ORCHESTRATOR))
    assert set(triggers) == {"workflow_dispatch"}, (
        f"{ORCHESTRATOR} must be dispatch-only, not {sorted(triggers)}"
    )


def test_nothing_listens_for_a_tag_push_or_a_release(repo_root: Path) -> None:
    """Every lane after the tag starts by dispatch, or by a call from one.

    The workflow token cannot create a tag or a release on a commit whose
    workflow files differ from main's head, so the tag must follow the merge
    within seconds and no credential with `workflows` permission may exist. What
    that buys is only kept if nothing downstream reacts to an event: a lane
    listening for a tag push or a `release` event starts on its own, outside the
    ordering the cut and the orchestrator enforce, and can publish a release the
    gates have not finished judging.

    Mutation proof: adding `tags: ['v*']` to release-please's push trigger makes
    this fail naming that workflow; removing it makes this pass.
    """
    offenders = []
    for workflow in _all_workflows(repo_root):
        triggers = _triggers(_load(repo_root, workflow))
        if "release" in triggers:
            offenders.append(f"{workflow}: release event")
        push = triggers.get("push")
        if isinstance(push, dict) and "tags" in push:
            offenders.append(f"{workflow}: push tags {push['tags']}")
    assert not offenders, (
        f"these workflows start themselves from a release-shaped event: {offenders}"
    )


def test_the_release_is_a_draft_with_its_tag_forced(repo_root: Path) -> None:
    """Created unpublished, tagged anyway, and rebuilt on main's newest head.

    A published release cannot be filled in afterwards, so the release object is
    created as a draft and the orchestrator publishes it once it carries
    everything it claims. `force-tag-creation` is the other half: GitHub creates
    no git tag for a draft, and the whole orchestrator checks out the tag for its
    source, so without it the release has no ref to build from. `always-update`
    is the third: the proposal is rebuilt on main's newest head on every push, so
    the head the cut proves is never behind main by the time it merges.
    """
    import json

    config = json.loads((repo_root / "release-please-config.json").read_text("utf-8"))
    assert config.get("always-update") is True, (
        "without `always-update` the proposal branch lags main, and the cut "
        "refuses a candidate that is behind rather than releasing a stale tree"
    )
    package = config["packages"]["."]
    assert package.get("draft") is True, (
        "a published release cannot receive the assets that justify it"
    )
    assert package.get("force-tag-creation") is True, (
        "a draft release creates no git tag, and every job in the orchestrator "
        "checks out the tag for its source"
    )
