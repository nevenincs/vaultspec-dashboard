---
tags:
  - '#reference'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:ec576be357245bd55740a02a1c22b0f36ec3b8b0be35f9f297182d4129e56fc6'
related:
  - '[[2026-07-14-a2a-orchestration-edge-adr]]'
  - '[[2026-07-02-agentic-operation-modes-adr]]'
  - '[[2026-06-29-agentic-security-provenance-adr]]'
---
# `approval-shape-reconciliation` reference: `cross-repo approval shape inventory`

## Summary

What the approval shape actually is across `vaultspec-dashboard` and
`vaultspec-a2a`, and where the two repositories model the same approval fact
differently. Grounded by semantic search in both repositories, with every claim
carrying a `path:line` locator. Claims that could not be verified are marked as
such rather than smoothed over.

The headline is not that the two designs disagree. They agree, in writing, on
both sides: the engine is the approval authority. The defects are that a2a built
a second authority anyway, and that the engine computes an approval policy it
only half enforces.

### The contract both sides ratified

The a2a orchestration edge decision, amended 2026-07-17, states it without
qualification: the approval authority is the engine by ratified contract, with
no second approval authority in A2A. A2A proposes into the authoring API, the
human decides in the dashboard, and A2A resumes on the verdict delivered over
the event stream. The verdict vocabulary is complete — approve, reject, and
request_changes are all live.

a2a's own code says the same thing from its side. The session setup that
pre-approves bridged tool names calls itself a recorded approval policy and not
a bypass, and names the engine review lane as the real human gate. The dashboard
says it from the other direction: a mutating tool auto-permits precisely because
its proposal still rides the changeset approval matrix, so there is no double
gate.

Two independently written codebases, agreeing on where the gate lives. That
agreement is the asset this campaign protects.

### The engine's approval shape

The matrix is pure and single-authority. `OperationMode` is
Manual / Assisted / Autonomous with an autonomy rank; a session override may
only NARROW, and a widening override is ignored rather than rejected.
`RiskClass` separates destructive from non-destructive, and the destructive
floor is absolute in every mode. `approval_requirement(mode, risk)` produces
either `HumanApprovalRequired` or `SystemAutoApprovable`.

The durable objects are coherent. An approval record binds to the reviewed
tuple — proposal revision, validation digest, policy version — so staleness is
computed rather than guessed, across five named conditions. A mode downgrade
requeues not-yet-applying system approvals through ONE declared arc back to
needs-review under the system actor, never a synthetic re-draft. System
auto-approval requires BOTH a `SystemAutoApprovable` requirement AND a genuine
`System` actor, and direct-kind changesets are guarded from it entirely.

Two carve-outs are deliberate and correct: rejecting or requesting changes on
one's own proposal skips the self-approval ban, because withdrawing your own
work is legal; and a human self-approving is permitted, since the ban targets
automated actors.

### Where the engine's enforcement falls short of its own policy

**The requirement is computed, served, and not enforced against the approver.**
`ApprovalRequirement` has exactly two functional consumers, and both only decide
whether the SYSTEM may auto-approve. The human decision route consults the
self-approval ban and the transition gate, and never reads the mode or the
requirement. So a distinct non-origin actor may approve even when the served
projection says human approval is required. This matters concretely rather than
theoretically: the same edge decision provisions one actor per pipeline role at
run start, and one of those roles is a reviewer. An agent reviewer can therefore
approve another agent's proposal today, in Manual mode, while the surfaced
policy claims otherwise.

Whether that is intended — mode governing only system auto-approval, with any
distinct actor free to decide — or an unclosed gap is not settled by the code.
It is the campaign's central question, because the two readings imply opposite
remediations: enforce the requirement, or rename it to describe what it really
governs. A served field asserting a human is required while accepting an agent
is the failure mode this project has met repeatedly: a check that passes while
being structurally unable to observe the thing it names.

**A whole authorization layer is unreachable.** The composed authorization
engine includes a review-authority clause delegating to `reviewer_eligibility`,
which wraps the same self-approval primitive. That branch fires only when an
origin author is supplied, and every production call site supplies `None`; the
only site passing `Some` is the module's own test. The module documentation
concedes the point, stating that authorization is inert until a later phase
wires it. The security control itself is not weakened — the ban is enforced live
at two direct call sites — but a second, dead copy of it exists and invites
designs written against code that never runs.

**The second mode layer has no wire surface.** `session_override` is modelled on
the request types, echoed on the served policy projection, and mirrored in the
frontend types, yet every production constructor hardcodes it absent and no HTTP
request type exposes it. The two-layer model is one layer deep in practice, and
the operation-modes decision record overstates what is reachable.

Frontend consumption is clean throughout: no parallel enums, no client-side
re-derivation of served approval truth.

### a2a's approval shape, and the second authority

a2a correctly separates two things. The LOCAL tool-permission gate is answered
inside a2a and never consults the engine, which is right — it governs whether a
CLI subprocess may invoke a tool. The DOCUMENT gate is engine-governed: the
phase gate parks on an interrupt and resumes only on a real verdict, and it
never reads the autonomy flag, so autonomy cannot bypass it. The verdict
subscriber projects engine truth back into run state by correlating on
identifiers committed to the checkpoint, without re-deriving any decision.

Against that, one route breaks the contract. a2a's run-scoped permission respond
endpoint can also answer a document approval pause, which makes it a second
approval authority — precisely what the ratified amendment forbids. It is broken
as well as unsanctioned: it constructs a resume value carrying an approved
boolean, while the phase gate reads a verdict string. The key never matches, so
the gate falls through to its fail-closed branch and records a rejection every
time, whatever the caller answered.

The failure mode is safe but dishonest. Nothing is wrongly materialised, yet the
caller believes they approved, the run reroutes into revision, and the engine's
proposal is never decided at all — a state fork between a2a's local record and
engine truth. No test exercises the path. The cause is traceable to a shared
constant that bundles the legacy plan gate with the newer document gate, with a
comment asserting both park with the same shape; that assertion is false against
current code, and the resume construction was never updated when the document
gate arrived.

One further asymmetry sits in the local lane: under autonomy, the Kimi family
enforces an exact-name allowlist while the Claude family auto-approves the first
offered option for anything not already pre-approved upstream. Whether a
mutating tool can actually reach that branch was not verified and needs a check
of what the allowlist holds at call time.

### What is NOT broken

Worth stating explicitly, because it constrains the remediation. Nothing lets
a2a auto-approve an engine-side action. No production code in a2a sets the
engine's operation mode — only its own acceptance tests do — and every mutating
authoring call fails closed on a denial, surfacing the engine's own denial kind
rather than substituting a local judgement. The document gate always interrupts
regardless of autonomy. The composition of a2a autonomy with engine Manual mode
is therefore correct today.

That a2a cannot set its own mode is a property to preserve, not a gap to fill.
An agent widening its own approval policy is the same hazard the narrowing-only
override and the system-actor requirement already exist to prevent.

### The same fact in three shapes

The reconciliation target, stated plainly. One approval outcome is currently
represented as an approved boolean on the legacy plan path, as a verdict string
with notes on the document path, and as a decision record with a bound reviewed
tuple in the engine. The mismatch between the first two is what silently
rejects; the absence of a notes field on the local request type means even a
corrected implementation could not carry reviewer comments through.

### Open questions for the decision record

- Should `HumanApprovalRequired` require an actor of human kind? Enforcing it is
  a behaviour change that would refuse an agent reviewer role the edge decision
  provisions by design. The alternative is to rename the requirement to describe
  what it actually governs.
- Should the dead review-authority branch become the single enforcement point,
  retiring the two direct call sites, or be deleted? Leaving a dead copy of a
  security control in place is the option a review should refuse.
- Should the local respond route refuse document approval pauses outright,
  pointing at the engine surface? The ratified amendment appears to settle this,
  and the campaign should confirm rather than re-litigate it.
- Should `session_override` gain the missing wire surface, or should the
  parameter and the decision-record language be stripped to match reality?
- Is the Claude-family autonomous fallback intentional, given the Kimi family
  enforces names in the same position?
