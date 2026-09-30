---
tags:
  - '#adr'
  - '#release-standard'
date: '2026-09-30'
modified: '2026-09-30'
body_schema: 'body-v2'
body_hash: 'sha256:55940b97f3cfedff98548064a231a76758c6c8030c042094b71af1f43fd57c8b'
related:
  - '[[2026-09-30-release-standard-ci-release-surface-audit]]'
---

# `release-standard` adr: `Adopt the fleet release standard` | (**status:** `accepted`)

Adopted on the maintainer's authorization of 2026-09-30. vaultspec-core leads this
standard; its record is `2026-09-30-release-standard-adr` in that repository's vault. This
record adopts it for the dashboard and names the places the dashboard's lanes force an
adaptation, rather than re-deciding the standard.

## Problem Statement

Releasing here created a release as a side effect of landing a commit. Every push to
`main` ran release-please with a personal access token, and a push that produced a
version bump tagged itself, created the release and started the whole distribution chain
before any gate had judged the merged tree. Three consequences follow, and each has cost
a release.

A release tag cannot be deleted. A release commit whose gate fails after its tag exists is
a permanent tag of a commit nobody can ship, and the only remedy is to burn the version.

A credential with `workflows` permission had to exist so the release pull request could
report its own checks, because a pull request the workflow token authors starts no workflow
runs. That credential is the one thing that can rewrite the lanes judging a release, and it
lived in the repository those lanes protect.

Every self-hosted job reachable from a pull request ran for any author who could open one
against this repository. The fork clause does not stop an author who pushes a branch here,
which is what Dependabot does daily; its pull requests carry author association
`CONTRIBUTOR`. And several jobs executed a repository script BEFORE their own checkout, so
whatever tree the previous job left on the persistent runner ran first, under the new job's
credentials. The required verdict job, meanwhile, excluded forks in its own condition - and
a skipped required check counts as passed, so the one case the refusal existed for was the
one case it never ran.

## Considerations

- The workflow token cannot create a tag or a release targeting a commit whose
  `.github/workflows` differ from the branch head, verified by probe. The tag must follow
  the merge with nothing in between.
- The merge gate is the only status check the branch ruleset requires, and a skipped
  required check counts as passed.
- The runners are persistent, three share one machine, and a job the runner is shut down
  under never reaches its trailing steps.
- A lane that starts from an event after the tag starts outside the ordering the cut
  enforces, so no workflow may listen for a tag push or a release event.

## Considered options

- **Adopt the fleet standard: proposal on push, release on dispatch.** Chosen. The proposal
  path refreshes the release pull request and never releases; a maintainer dispatches the
  cut, which proves the proposal's exact head with the full merge gate, squash-merges it,
  tags it seconds later and dispatches the release orchestrator.
- **Keep releasing on push, add a gate after the tag.** Rejected: the tag already exists
  when the gate speaks, so a failure leaves an unshippable permanent tag.
- **Keep the personal access token and report the release branch's checks through it.**
  Rejected: it keeps a `workflows`-capable credential in the repository, which is the
  credential the tag-follows-merge constraint exists because of.
- **Refuse untrusted authors by sending them to GitHub-hosted runners.** Rejected: a hosted
  leg still runs their code, and hosted runners are forbidden here outright.
- **Keep the pre-checkout reclaim as a repository script.** Rejected: a script, a recipe and
  a local composite action are all resolved out of the workspace, which is the tree being
  reclaimed.

## Constraints

- The release orchestrator asserts that its run ref is the release tag, and resolves every
  checkout and every reusable workflow it calls from that ref. The cut therefore dispatches
  it at the tag. The fleet standard dispatches at `main`, so the matrix and release policy
  stay current while the source is the tag; adopting that here means giving every checkout
  and every called workflow in the orchestrator an explicit source ref, which is a separate
  change of its own.
- `include-component-in-tag` is false here, so the tag is the bare `v<version>`. The step
  that diagnoses a tag this token cannot create derives it accordingly, and is not
  byte-identical to the fleet's.
- This merge gate is label-tiered rather than draft-state-tiered: nothing but the `ci:full`
  label starts it. The trust rule therefore reduces to the label door on that workflow, and
  to author association on the lanes that run on every push.
- The dev-server workflow is a byte-identical render of a machine-wide harness held in a
  private repository. Its pull-request-reachable job is outside this repository's ownership
  and is not covered here.

## Implementation

The Release Please workflow carries both paths. On a push to `main` the proposal job runs
release-please with the workflow token and `skip-github-release`, so it can never tag or
release; `always-update` in the configuration rebuilds the proposal on `main`'s newest head
every time, so the head the cut proves is never behind. A second job repairs the Cargo lock
the version bump invalidates, pushes it to the release branch with the workflow token, and
then DISPATCHES the merge gate on that branch - a dispatch is exempt from the rule that the
workflow token starts no runs, and its check run lands on the head the pull request is
waiting on. That is what retires the personal access token.

On dispatch the cut runs as four jobs. A candidate job finds the single pending release
pull request, refusing more than one and refusing a head that is behind `main`. A prove job
calls the merge gate with that exact commit as its ref. A cut job squash-merges only that
head, matched to the proven commit, refuses a merged commit whose tree differs from the
proven tree, has release-please create the draft release and force its tag, refuses a tag
pointing at anything but the proven commit, and dispatches the orchestrator with the tag. A
step conditioned on the release step's failure diagnoses the one unrecoverable case -
workflow files changed between the merge and the tag - and names the tag and the runbook,
because the API error names neither.

The merge gate takes the ref to measure as a required input on its call and dispatch
surfaces, and every job checks out that ref. A caller that omits it measures its own ref,
which for a release is `main` rather than the commit being released.

Three refusals replace three absences. Every measuring job runs for a pull request only
when a user applied `ci:full` to a branch of this repository; the lanes that run on every
push require the author to be owner or collaborator. The verdict job's condition is exactly
`!cancelled()`, with no event or fork clause, and it refuses forks, untrusted authors and
bot-applied labels by name in its steps - after looking for an earlier verdict on the same
commit, so a commit a collaborator's label already proved keeps its pass. And the
pre-checkout reclaim is inline in every job that needs it, reads no repository file, and
drops `.git/hooks`, which survives `git clean`.

Guard tests hold each property: that only the dispatched cut can release, that the cut
waits on the gate for the exact head it merges, that no workflow starts from a tag push or
a release event, that the release is a forced-tag draft rebuilt on main's head, that the
gate's condition is exactly `!cancelled()`, that every pull-request-reachable fleet job
carries the trust clause, that the verdict refuses an untrusted author by name in the right
order, that nothing in the workspace executes before its own checkout, and that the inline
reclaim is one text everywhere. Each was proven to fail by mutating what it guards.

## Rationale

Proving before merging is the only ordering that works when a tag cannot be deleted, and
tagging immediately after merging is the only ordering that works when the token cannot tag
a commit whose workflows have since changed. Those two constraints leave exactly one shape,
and it is the shape the fleet already runs. Adopting it rather than deriving a local variant
means the recovery runbook, the refusals and the guard tests read the same in every
repository, which is what makes a release failure diagnosable by someone who has not read
this repository's lanes.

Making a label the trust boundary rather than an author allowlist means the control needs no
maintenance: applying a label takes triage rights, so the people who may admit code to the
machines are exactly the people the repository already trusts, and each admission is
recorded as an event rather than as configuration.

Writing the trust clause as two equality comparisons rather than a membership call keeps it
decidable by a scenario evaluator that treats every function call as unknown, so a guard can
prove the condition true or false for a given event instead of only asserting its text.

## Consequences

Nothing releases by accident, and nothing on the release path holds a credential that could
rewrite the lanes judging it. A release that fails leaves an invisible draft rather than a
published half-release, and the one unrecoverable failure diagnoses itself and points at a
runbook.

Releasing takes a deliberate dispatch, so a version bump that lands on `main` sits as a
proposal until someone asks for it. That is the intended cost.

An untrusted author's pull request reports no checks at all until a collaborator applies
`ci:full`. The verdict says so by name, but the checks list is empty in the meantime, and a
Dependabot pull request needs that label before it can merge.

The cut dispatches the orchestrator at the tag, so the orchestrator builds with the tagged
tree's matrix and release policy rather than the current one. A release cut at a tag whose
matrix has since changed builds the legs that tag declared. Correcting that means giving the
orchestrator an explicit source ref throughout, and is left open.

The pre-checkout reclaim now exists in eight copies because a workflow has no include and
the one thing it must not do is read a file from the workspace. A guard asserting byte
equality across every copy is what stands in for having one.
