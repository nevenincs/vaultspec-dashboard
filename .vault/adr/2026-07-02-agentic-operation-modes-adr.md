---
tags:
  - '#adr'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
related:
  - "[[2026-06-29-agentic-spec-authoring-backend-research]]"
  - "[[2026-07-02-agentic-spec-authoring-backend-audit]]"
  - "[[2026-06-29-agentic-approval-gates-review-state-adr]]"
  - "[[2026-06-29-agentic-security-provenance-adr]]"
  - "[[2026-06-29-agentic-authoring-boundary-adr]]"
  - "[[2026-06-29-agentic-changeset-ledger-adr]]"
  - "[[2026-06-16-document-editor-backend-adr]]"
---

# `agentic-operation-modes` adr: `authoring operation modes and the unified write path` | (**status:** `accepted`)

## Problem Statement

The product's target flow is explicit: agentic editors propose changes; the user
accepts or denies them; OR, based on operation mode, changes are delivered
autonomously. The accepted authoring cluster treats auto-apply only as a narrow
exception clause — "a separate system actor may auto-apply only when a recorded
policy permits a specific non-destructive class" — stated in the approval-gates and
security-provenance ADRs with no owning decision. There is no mode vocabulary, no
mode scope, no lifecycle path for an auto-approved changeset, no after-the-fact
review surface, and no kill-switch semantics. Separately, the architecture review
(finding ASA-007) identified a second unowned decision in the same territory: the
human editor's direct save path (the accepted document-editor ADRs' `/ops/core`
write broker) runs BESIDE the changeset ledger, so human mutations are invisible to
the history, provenance, preimage, and rollback machinery that all agent mutations
flow through — a fork in the single-history story that multi-concurrent editor
interfaces cannot tolerate. This ADR owns both decisions, because they are one
decision: WHO may cause a changeset to apply without a separate human review, and
under what recorded authority.

## Considerations

- The approval-policy-is-data decision (approval-gates ADR) already gives modes a
  natural representation: a mode is a named bundle of approval-policy entries, not
  a new mechanism.
- The security-provenance ADR's actor model already provides the recorded
  authority: a `system` actor can record an approval decision under a named
  policy, and the append-only audit trail already carries the policy decision.
- The changeset ledger's lifecycle must not fork per mode: an autonomously applied
  change must traverse the SAME states (`proposed` → `approved` → `applying` →
  `applied`) with the approver identity being what differs — never a bypass arc
  that skips states, or every projection, event, and rollback path would need
  mode-conditional logic.
- The human editor's save is the highest-frequency write in the product. Any
  unification must not add perceptible latency or a review step to the user's own
  typing; the user approving their own edit is a meaningless ceremony.
- The stale-approval rules (approval-gates) and the revision-first apply checks
  (concurrency ADR) are mode-independent correctness and must hold identically in
  every mode.

## Considered options

- **Modes as ad hoc flags** (an `auto_apply: bool` on proposals or sessions) —
  rejected: unauditable, un-scopable, and exactly the "ad hoc booleans fail under
  concurrent agents" failure the research warned about.
- **A separate autonomous pipeline** (agents write through a distinct trusted
  path when in autonomous mode) — rejected: forks the ledger, defeats provenance,
  and reintroduces the direct-write path the boundary ADR closed.
- **Modes as named approval-policy bundles over the existing machinery** —
  CHOSEN: no new mechanism; a mode selects which policy entries govern, the
  system actor records the approval, the lifecycle is unchanged.
- **For the human save: keep the dual path** (direct `/ops/core` saves beside the
  ledger) — rejected as the end state (it permanently blinds history and rollback
  to human edits) but ACCEPTED as the transition state until the unified path
  proves latency parity.
- **For the human save: route it through the ledger as a self-approved direct
  changeset** — CHOSEN as the end state.

## Constraints

- Mode changes are policy-data mutations: audited, actor-attributed, and
  effective for commands issued AFTER the change — never retroactive.
- Destructive operations (rename, archive, rollback, delete if ever supported)
  require explicit human approval in EVERY mode; no mode may widen this.
- Agent self-approval remains forbidden in every mode (security-provenance ADR);
  autonomous apply is a SYSTEM-actor approval under a recorded policy, which is
  a different fact than the proposing agent approving itself.
- The apply-time correctness floor (base-revision re-check, validation re-run,
  approval freshness) is mode-independent and cannot be relaxed by any mode.
- The direct-changeset human save must reuse the existing optimistic `blob_hash`
  conflict behaviour the editor already has; unification must not regress the
  editor's conflict UX.

## Implementation

**Mode vocabulary.** Three operation modes, represented as named backend policy
data, selectable per scope (worktree) with an optional per-session override that
can only NARROW (a session may be more manual than its scope, never more
autonomous):

- `manual` — every changeset requires an eligible human approval before apply.
  The default mode.
- `assisted` — changesets whose every child operation falls in a recorded
  non-destructive class (body edit, frontmatter edit, create) are auto-approved
  by the `system` actor citing the mode policy; everything else queues for human
  review exactly as in `manual`.
- `autonomous` — as `assisted`, plus the review station's after-the-fact lane is
  the PRIMARY human surface: eligible changesets apply without waiting, and the
  human reviews applied work, with one-command rollback. Destructive operations
  still queue for explicit human approval.

**Lifecycle.** An auto-approved changeset traverses the canonical ledger states
unchanged: it reaches `approved` with an approval record whose reviewer is the
`system` actor and whose decision payload names the mode policy entry (policy id +
version), then `applying` → `applied` through the normal idempotent apply command.
No state is skipped; every projection, event, and rollback path sees a normal
changeset. The stale-approval rules apply identically: if the base moves between
auto-approval and apply, the changeset conflicts like any other.

**After-the-fact review lane.** The review-station projection gains a second lane:
`applied-under-policy` items — changesets applied by system-actor approval, ordered
by apply time, carrying the mode policy reference, the diff, and rollback
availability. Reviewing an item is acknowledgement (append-only), not a gate;
requesting rollback creates a normal rollback changeset. This lane is what makes
autonomous delivery honest instead of silent.

**Kill switch.** Downgrading the mode (autonomous → assisted → manual) is a policy
write that takes effect immediately for NEW approvals; in-flight auto-approved
changesets that have not yet entered `applying` are re-queued for human review
(their system approvals are marked stale by the policy change — the existing
policy-change stale trigger already covers this). Changesets already `applying`
complete and land in the after-the-fact lane.

**Unified write path (the human save).** End state: the editor's save command
creates a `kind=direct` changeset — preimage captured, child operation recorded,
auto-approved by the AUTHORING HUMAN's own actor identity (self-approval by a
human over their own manual edit is not agent self-approval and is explicitly
legal), and applied immediately through the same apply command. The user
experiences a save; the ledger records a complete history entry with preimage and
rollback availability. Transition state: the existing `/ops/core` direct write
broker remains live until the direct-changeset path demonstrates latency parity
and conflict-UX parity on the walking skeleton; the two paths must not coexist
longer than that proof requires, and the retirement is a planned step, not an
indefinite tolerance. Local unsaved drafts (the frontend's editor buffer) remain
frontend-owned and never enter the ledger.

## Rationale

Modes-as-policy-bundles adds zero new mechanism to a cluster that already has
approval-policy-as-data, a system actor, append-only audit, and stale triggers —
it composes existing decisions into the missing product concept. Keeping the
lifecycle mode-independent means autonomy is a fact about WHO approved (recorded,
auditable, reversible), not a different machine — which is what makes the
after-the-fact lane and rollback work unchanged. Unifying the human save as a
direct changeset is what makes the ledger the actual history of the vault rather
than the history of agent work only; without it, multi-concurrent editing has two
sources of truth and rollback preimages silently rot against un-ledgered human
edits (the ASA-007 failure). The human-self-approval carve-out is principled: the
self-approval ban exists because an agent is an untrusted writer whose output
needs independent review; a human editing their own document IS the review.

## Consequences

- The user's stated flow — accept, deny, or autonomous by operation mode —
  becomes a first-class, recorded, reversible capability instead of a stretched
  exception clause.
- The review station grows one lane; the ledger, apply path, and rollback
  machinery are untouched — autonomy costs one policy table and one projection.
- Human edits gain history, preimages, and rollback; the cost is that the save
  path acquires a ledger write, which must be proven latency-neutral before the
  legacy broker retires (the transition gate is explicit).
- Mode misconfiguration risk (an over-broad non-destructive class) is bounded by
  the destructive-op floor and fully audited; the kill switch is one policy
  write.
- The approval-gates and security-provenance ADRs' auto-apply clauses become
  references to this ADR (single ownership; no restatement).

## Codification candidates

- **Rule slug:** `operation-modes-are-policy-bundles-over-one-lifecycle`.
  **Rule:** Authoring operation modes select approval policy; they never fork the
  changeset lifecycle, relax apply-time revision/validation checks, or widen the
  destructive-operation human-approval floor.
- **Rule slug:** `autonomous-apply-is-recorded-system-approval`.
  **Rule:** An autonomously applied changeset carries a system-actor approval
  naming the mode policy id and version, traverses the canonical lifecycle, and
  appears in the after-the-fact review lane with rollback availability.
- **Rule slug:** `every-vault-mutation-is-a-ledgered-changeset`.
  **Rule:** Once the unified write path lands, every vault document mutation —
  human or agent — enters history as a changeset with preimage and provenance;
  no un-ledgered write path remains.
