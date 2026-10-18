"""The CI lanes keep the fleet's shape: named alike, tiered alike, gated alike.

Three lanes, each answering a different question at a different cost:

- ``ci.yml`` runs on every pull-request push and answers only the cheap static
  questions.
- ``merge-gate.yml`` measures everything a change must pass, runs when a
  maintainer adds ``ci:full``, on the release App's own pull request events, or
  when the release orchestrator calls it on a tag, and folds the result into ONE
  check the ruleset requires.
- ``release-please.yml`` keeps the release proposal current on every push and
  cuts a release only when a maintainer dispatches it.
- ``product-release.yml`` orchestrates the release, and nothing becomes visible
  to a user until every gate before it has passed.

The soundness of that arrangement rests on properties no single job shows: a
person's push must not start the gate, so a new commit cannot merge on an old
verdict; a run that admits nothing must never report the required context,
because a skipped required check counts as passed; the verdict must depend on
every measuring job, or a job could fail without the verdict noticing; only a
trusted author's branch may reach the self-hosted fleet at all; nothing under
the workspace may execute before the job that owns it has checked out; the
release pull request is written by the release App so its own events run the
gate; and only the dispatched cut may create a release, on a commit the gate
has already passed. Each is asserted here rather than trusted to review.
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
#: A name chosen by a condition, `${{ (<condition>) && 'A' || 'B' }}`: each
#: alternative is a name in its own right and must follow the grammar.
_CHOSEN_NAME = re.compile(r"^\$\{\{ .* && '([^']+)' \|\| '([^']+)' \}\}$")

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
    """The merge box is read by name; one grammar across every lane.

    A name chosen by a condition is checked alternative by alternative.

    Mutation proof: renaming the merge verdict's withheld alternative to
    `Admission withheld (Linux)` fails naming that job; restoring
    `Check: Admission withheld (Linux)` makes this pass.
    """
    offenders = []
    for workflow in _all_workflows(repo_root):
        for job, spec in _load(repo_root, workflow)["jobs"].items():
            name = str(spec.get("name", ""))
            chosen = _CHOSEN_NAME.match(name)
            candidates = (
                chosen.groups() if chosen else (_EXPRESSION.sub(_PLACEHOLDER, name),)
            )
            if not all(JOB_NAME.match(candidate) for candidate in candidates):
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


#: The release pull request's author. The fleet's release GitHub App writes it,
#: so its own pull request events start workflows like any other author's.
RELEASE_BOT = "nevenincs-release[bot]"

#: A pull request reaches the self-hosted fleet only for an author the
#: repository already trusts. Byte-identical across the fleet, and written as
#: equalities rather than `contains(fromJSON(...))` so a scenario evaluator that
#: treats every function call as undecidable can still prove a verdict for it.
TRUSTED_AUTHOR = (
    "(github.event.pull_request.author_association == 'OWNER' || "
    "github.event.pull_request.author_association == 'COLLABORATOR' || "
    f"github.event.pull_request.user.login == '{RELEASE_BOT}')"
)

#: The label door: applying a label takes triage rights, so a USER's label is
#: the request. A bot's label is not, even on a trusted author's branch.
LABEL_BY_USER = (
    "github.event.action == 'labeled' && "
    f"github.event.label.name == '{FULL_LABEL}' && "
    "github.event.sender.type == 'User'"
)
_USER_SENDER = "github.event.sender.type == 'User'"

FORK_CLAUSE = "github.event.pull_request.head.repo.full_name == github.repository"

#: The one condition that admits a merge-gate run. Calls and dispatches measure
#: the ref they name; a pull request is measured only from a trusted author's
#: branch of this repository, on a user's `ci:full` or on the release App's own
#: opened, reopened and synchronize events.
ADMITTED = (
    "github.event_name != 'pull_request' || "
    f"({FORK_CLAUSE} && {TRUSTED_AUTHOR} && "
    f"(({LABEL_BY_USER}) || "
    f"(github.event.action != 'labeled' && "
    f"github.event.pull_request.user.login == '{RELEASE_BOT}')))"
)
WITHHELD_NAME = "Check: Admission withheld (Linux)"


def test_only_a_label_or_the_release_app_starts_the_merge_gate(
    repo_root: Path,
) -> None:
    """A person's push carries no gate result until the label is added again.

    The gate listens for opened, reopened and synchronize only because the
    release App's pull request has no person to add the label; the admission
    condition pinned by the next test keeps every other author on the label.

    Mutation proof: narrowing the types to `[labeled]` fails on the types
    assertion (the release pull request would never be measured); restoring
    them makes this pass.
    """
    triggers = _triggers(_load(repo_root, GATE_WORKFLOW))
    pull_request = triggers["pull_request"]
    assert pull_request.get("types") == [
        "opened",
        "reopened",
        "synchronize",
        "labeled",
    ], f"{GATE_WORKFLOW} starts on {pull_request.get('types')}"
    assert pull_request.get("branches") == ["main"], "name the base branch"
    assert "workflow_call" in triggers, (
        "the release orchestrator measures the tagged tree through this workflow"
    )


def test_the_required_context_comes_only_from_an_admitted_run(
    repo_root: Path,
) -> None:
    """A skipped required check passes; an unwatched job fails silently.

    Every measuring job, the verdict's condition and the verdict's name carry
    the one admission condition byte for byte. A run that admits nothing skips
    its verdict under `WITHHELD_NAME`, so the required context is never reported
    skipped; an admitted run reports it on `always()`, so a cancelled or failed
    measurement is red rather than absent.

    Mutation proof: narrowing the verdict's condition to
    `${{ !cancelled() && (<admitted>) }}` fails on the exact-condition
    assertion; changing the withheld alternative of its name to
    `Check: Merge gate (Linux)` fails on the exact-name assertion (a skipped run
    would then report the required context as passed); restoring each makes
    this pass.
    """
    jobs = _load(repo_root, GATE_WORKFLOW)["jobs"]
    gate = jobs[GATE_JOB]
    assert str(gate.get("name", "")) == (
        f"${{{{ ({ADMITTED}) && '{GATE_NAME}' || '{WITHHELD_NAME}' }}}}"
    ), (
        "the verdict must report the required context only for an admitted run; "
        f"found name {gate.get('name')!r}"
    )
    assert str(gate.get("if", "")) == f"${{{{ always() && ({ADMITTED}) }}}}", (
        "the verdict must run on `always()` for exactly the admitted runs; "
        f"found {gate.get('if')!r}"
    )
    measuring = set(jobs) - {GATE_JOB}
    assert _needs(gate) == measuring, (
        f"the gate needs {sorted(_needs(gate))} but the workflow measures "
        f"{sorted(measuring)}"
    )
    for job in sorted(measuring):
        assert str(jobs[job].get("if", "")) == f"${{{{ {ADMITTED} }}}}", (
            f"{GATE_WORKFLOW}:{job} must run on exactly the admission condition"
        )


def _normalised(condition: object) -> str:
    """A condition with its whitespace collapsed, as GitHub evaluates it."""
    return " ".join(str(condition).split())


def _uncontained(workflow: str, document: dict) -> list[str]:
    """Jobs a pull request could start on the fleet outside the trust clause.

    Every job a `pull_request` can start - the verdict included - must refuse a
    fork's branch and an untrusted author in its own `if:`, and a `ci:full`
    door must also require that a USER applied the label. A runner switch to a
    hosted image is not refusal: it still runs the pull request's code.
    """
    triggers = _triggers(document)
    if "pull_request_target" in triggers:
        return [f"{workflow} listens for pull_request_target"]
    if "pull_request" not in triggers:
        return []
    offenders = []
    for job, spec in document["jobs"].items():
        runs_on = str(spec.get("runs-on", ""))
        condition = _normalised(spec.get("if", ""))
        if "fromJSON" in runs_on and "head.repo" in runs_on:
            offenders.append(f"{workflow}:{job} switches runners for forks")
        if FORK_CLAUSE not in condition:
            offenders.append(f"{workflow}:{job} can run for a fork")
        if TRUSTED_AUTHOR not in condition:
            offenders.append(f"{workflow}:{job} can run for an untrusted author")
        if FULL_LABEL in condition and _USER_SENDER not in condition:
            offenders.append(f"{workflow}:{job} admits a bot's {FULL_LABEL} label")
    return offenders


def test_only_a_trusted_authors_branch_reaches_the_fleet(repo_root: Path) -> None:
    """Forks, Dependabot and every other untrusted author run nothing here.

    Dependabot and other authors who are neither owner, collaborator nor the
    release App push branches of THIS repository, so the fork clause alone
    never stops them and the approval requirement for outside contributors does
    not cover them. The shared Dev server workflow is held to the same clause:
    it runs on the same machines.

    Mutation proof: replacing the author clause in `ci.yml`'s `static` condition
    with `true` fails with `ci.yml:static can run for an untrusted author`;
    replacing the fork clause in the merge verdict's condition with `true` fails
    with `merge-gate.yml:gate can run for a fork`; restoring each makes this
    pass.
    """
    offenders = [
        finding
        for workflow in _all_workflows(repo_root)
        for finding in _uncontained(workflow, _load(repo_root, workflow))
    ]
    assert not offenders, offenders


@pytest.mark.parametrize(
    ("workflow", "job", "clause", "finding"),
    [
        (CHEAP_LANE, "static", TRUSTED_AUTHOR, "can run for an untrusted author"),
        (GATE_WORKFLOW, "engine", TRUSTED_AUTHOR, "can run for an untrusted author"),
        (GATE_WORKFLOW, GATE_JOB, TRUSTED_AUTHOR, "can run for an untrusted author"),
        (CHEAP_LANE, "static", FORK_CLAUSE, "can run for a fork"),
        (GATE_WORKFLOW, GATE_JOB, FORK_CLAUSE, "can run for a fork"),
        (GATE_WORKFLOW, "lint", _USER_SENDER, f"admits a bot's {FULL_LABEL} label"),
        (
            "devserver.yml",
            "devserver",
            TRUSTED_AUTHOR,
            "can run for an untrusted author",
        ),
    ],
)
def test_the_containment_guard_notices_a_removed_clause(
    repo_root: Path, workflow: str, job: str, clause: str, finding: str
) -> None:
    """Guard the guard: stripping any one clause is reported by name."""
    document = _load(repo_root, workflow)
    assert not _uncontained(workflow, document)
    spec = document["jobs"][job]
    spec["if"] = _normalised(spec["if"]).replace(clause, "true")
    assert f"{workflow}:{job} {finding}" in _uncontained(workflow, document), (
        f"removing {clause!r} from {workflow}:{job} went unnoticed"
    )


def test_pull_request_target_is_refused(repo_root: Path) -> None:
    """Guard the guard: a `pull_request_target` lane is reported outright."""
    document = _load(repo_root, CHEAP_LANE)
    _triggers(document)["pull_request_target"] = None
    assert _uncontained(CHEAP_LANE, document) == [
        f"{CHEAP_LANE} listens for pull_request_target"
    ]


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
    copy makes this fail on the drift count; renaming the step in
    `merge-gate.yml`'s `dependencies` job fails naming that job as no longer
    reclaiming; restoring each makes this pass.
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
    sites = set(next(iter(bodies.values())))
    expected = {
        "ci.yml:static",
        "code-health.yml:health",
        "merge-gate.yml:lint",
        "merge-gate.yml:frontend",
        "merge-gate.yml:conformance",
        "merge-gate.yml:release-inputs",
        "merge-gate.yml:dependencies",
    }
    assert sites >= expected, (
        f"{sorted(expected - sites)} no longer reclaim before checkout; a job "
        "that stopped doing it hits EACCES on its own checkout instead"
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
    """Draft -> published once after the gates -> acquisition -> channels.

    Mutation proof: restoring `--prerelease` on the publication step makes
    this fail on the half-published release; restoring the step makes this
    pass.
    """
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
        jobs["publish-release"]
    )
    assert jobs["acquisition"]["uses"].endswith("acquisition.yml")
    assert "publish-release" in _needs(jobs["acquisition"])
    for channel in ("homebrew-bump", "scoop-bump"):
        assert "acquisition" in _needs(jobs[channel]), (
            f"{channel} must point only at a release acquisition has proven"
        )

    text = (repo_root / WORKFLOWS / ORCHESTRATOR).read_text("utf-8")
    assert text.count("--draft=false") == 1, (
        "exactly one step may take the release out of draft"
    )
    assert "--prerelease" not in text, (
        "the release is held as a draft until complete and then published "
        "once; a prerelease is a published release, visible half-finished"
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
    """The cut merges and tags only a head whose merge gate passed.

    A release tag cannot be deleted, so the proof comes before it: a release
    commit that fails its gate after its tag exists is a permanent tag of a
    commit nobody can ship. The proposal's own pull request events run the gate,
    so the candidate requires the newest `Check: Merge gate (Linux)` on the exact
    head to have completed successfully; the cut carries no condition that could
    override the candidate's success, merges only that head, and refuses a
    merged tree that differs from the proven one before Release Please creates
    anything.

    Mutation proof: changing the candidate's required verdict from
    `completed/success` to `completed/failure` makes this fail on the verdict
    assertion; restoring it makes this pass.
    """
    jobs = _load(repo_root, AUTHORITY)["jobs"]
    find = next(
        step
        for step in jobs["candidate"]["steps"]
        if step.get("name") == "Find the release pull request and the commit to prove"
    )
    assert find["env"]["GATE_NAME"] == GATE_NAME
    script = str(find["run"])
    newest = "sort_by(.started_at) | last"
    assert 'check_name="$GATE_NAME"' in script and newest in script, (
        "the candidate must read the newest gate run on the head, not any green one"
    )
    assert '[ "${verdict}" != "completed/success" ]' in script, (
        "the candidate must refuse a head whose newest gate run did not pass"
    )
    cut = jobs[CUT_JOB]
    assert _needs(cut) == {"candidate"}, "the cut must wait on the proven candidate"
    assert "if" not in cut, (
        "a condition on the cut overrides the default success check, which is "
        "the only thing stopping an unproven head from being tagged"
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


def test_nothing_dispatches_the_merge_gate(repo_root: Path) -> None:
    """The required check comes from pull request events, never a hand-off.

    A dispatched run's checks belong to no pull request, so a gate dispatched
    for the release pull request leaves its required context missing. Only the
    orchestrator calls the gate, on the tag it builds.

    Mutation proof: adding a step running
    `gh workflow run merge-gate.yml --ref "${RELEASE_BRANCH}"` to the proposal
    job makes this fail naming release-please.yml; removing it makes this pass.
    """
    dispatchers = sorted(
        workflow
        for workflow in _all_workflows(repo_root)
        if re.search(
            rf"gh\s+workflow\s+run\s+{re.escape(GATE_WORKFLOW)}",
            (repo_root / WORKFLOWS / workflow).read_text("utf-8"),
        )
    )
    assert not dispatchers, f"these workflows dispatch the merge gate: {dispatchers}"
    callers = sorted(
        f"{workflow}:{job}"
        for workflow in _all_workflows(repo_root)
        for job, spec in _load(repo_root, workflow)["jobs"].items()
        if str(spec.get("uses", "")).endswith(GATE_WORKFLOW)
    )
    assert callers == [f"{ORCHESTRATOR}:merge-gate"], callers


def test_a_call_must_name_the_ref_it_wants_measured(repo_root: Path) -> None:
    """A caller that omits the ref measures its own, which for a release is wrong.

    Mutation proof: changing the orchestrator's `ref:` to `main` makes this fail
    naming that caller; restoring the tag makes this pass.
    """
    call = _triggers(_load(repo_root, GATE_WORKFLOW))["workflow_call"]
    assert call["inputs"]["ref"]["required"] is True, (
        "the merge gate's `ref` input must be required: a caller that leaves it "
        "out measures the CALLER's ref, not the tree it is about to release"
    )
    spec = _load(repo_root, ORCHESTRATOR)["jobs"]["merge-gate"]
    assert "inputs.tag" in str(spec.get("with", {}).get("ref", "")), (
        f"{ORCHESTRATOR}:merge-gate calls the gate without naming the tag"
    )


APP_TOKEN_ACTION = "actions/create-github-app-token@"
_FULL_SHA = re.compile(r"@[0-9a-f]{40}$")


def test_the_release_pull_request_is_written_by_the_release_app(
    repo_root: Path,
) -> None:
    """The proposal's own events run the gate only if the App writes it.

    A pull request the default token writes starts no workflow runs, so its
    required check could only ever come from a dispatch, which belongs to no
    pull request. Every proposal step therefore takes a freshly minted App token
    with contents and pull-request write and nothing else, with no fallback to
    the default token; the release-creating step keeps the default token, whose
    tags and releases wake no other workflow.

    Mutation proof: deleting `token:` from the proposal step makes this fail on
    the App-token assertion; restoring it makes this pass.
    """
    jobs = _load(repo_root, AUTHORITY)["jobs"]
    for job, spec in jobs.items():
        steps = spec.get("steps") or []
        minted = {
            str(step["id"]): step
            for step in steps
            if str(step.get("uses", "")).startswith(APP_TOKEN_ACTION)
        }
        for step in steps:
            if not str(step.get("uses", "")).startswith(RELEASE_ACTION):
                continue
            options = step.get("with") or {}
            if options.get("skip-github-release") is not True:
                assert "token" not in options, (
                    f"{AUTHORITY}:{job} creates tags and releases; it keeps the "
                    "default token"
                )
                continue
            token = str(options.get("token", ""))
            match = re.fullmatch(r"\$\{\{ steps\.([a-z-]+)\.outputs\.token \}\}", token)
            assert match and match[1] in minted, (
                f"{AUTHORITY}:{job} writes the release pull request without the "
                f"release App's token: token={token!r}"
            )
            app = minted[match[1]]
            assert _FULL_SHA.search(str(app["uses"])), app["uses"]
            assert app["with"] == {
                "client-id": "${{ vars.RELEASE_APP_CLIENT_ID }}",
                "private-key": "${{ secrets.RELEASE_APP_PRIVATE_KEY }}",
                "permission-contents": "write",
                "permission-pull-requests": "write",
            }, app["with"]
    proposal = jobs["release-please"]
    assert any(
        str(step.get("uses", "")).startswith(RELEASE_ACTION)
        and (step.get("with") or {}).get("token")
        for step in proposal["steps"]
    ), "the proposal job no longer writes the release pull request"


def test_the_release_pull_request_has_one_head(repo_root: Path) -> None:
    """Nothing writes to the release branch after Release Please does.

    The engine lock moves with the workspace version inside Release Please's own
    commit, matched on every package without a registry source (the workspace's
    own crates), so the proposal carries one head and one gate run, and no step
    pushes to it with any token.

    Mutation proof: removing the `engine/Cargo.lock` entry from `extra-files`
    makes this fail on the lock assertion; restoring it makes this pass.
    """
    import json

    config = json.loads((repo_root / "release-please-config.json").read_text("utf-8"))
    extra = config["packages"]["."].get("extra-files", [])
    assert {
        "type": "toml",
        "path": "engine/Cargo.lock",
        "jsonpath": "$.package[?(!@.source)].version",
    } in extra, "the engine lock must move inside Release Please's own commit"
    text = (repo_root / WORKFLOWS / AUTHORITY).read_text("utf-8")
    assert "git push" not in text, f"{AUTHORITY} pushes to the release branch"


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
