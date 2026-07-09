---
tags:
  - '#audit'
  - '#agentic-spec-authoring-backend'
date: '2026-07-09'
modified: '2026-07-09'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
  - "[[2026-06-29-agentic-security-provenance-adr]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #audit) and one feature tag.
     Replace agentic-spec-authoring-backend with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `agentic-spec-authoring-backend` audit: `W12-W14 engine wiring verification and Increment 5-6 phase review closure`

## Scope

This audit covers the W14.P42a engine-wiring phase (the six wiring points that make
the W12/W13 authorization, concurrency, and review-station engines enforce and serve
over the live command, apply, and route paths) and the paired phase-review closure for
the Increment-4 and Increment-5 engine phases whose review and verify rows were owed a
persisted verdict. The centerpiece is the S264 cross-cutting phase audit: the standing
question the phase exists to answer is whether an unauthorized human or agent can mutate
any state through the live wired API, and whether every wired engine is both reachable
and enforcing. Sibling build-phase findings already persisted for W10, W11, W12.P25, and
W12.P30 live in the 2026-07-06 audit, and for W12.P31 in the 2026-07-07 audit; this doc
closes the remaining W12.P22/P32/P41/P44 and W13.P20/P24/P26/P27/P28 review and verify
rows and records the wiring verification and Increment-5/6 acceptance.

## Findings

### w14-p42a-deferred-wiring-gap | high | resolved engines were built and fixture-tested in isolation with route and apply wiring deferred, and no plan phase scheduled the wiring

The W12 and W13 engines (authorization, advisory leases and fencing, base-revision
conflict detection, explicit rebase and supersession, review-station queues, transcript
compaction) were each built and unit-tested against fixtures with their route and apply
wiring deferred, and no plan phase had scheduled the wiring. In that state authorization
enforced nothing at the route layer, and the conflict, rebase, and review-station engines
served nothing over the wire. The W14.P42a phase was authored to wire every engine into
the live command, apply, and route paths, and the wiring surfaced four real defects that
none of the isolated engine tests could have shown. The wiring is complete across six
points and verified by the consolidated acceptance suite and the cross-cutting phase
audit below.

### w14-p42a-authorization-not-enforced | high | resolved the authorization floor is now structurally no-bypass at the sole command extractor

Before wiring, no route enforced authorization. The floor now composes four guards
first-denial-wins (actor standing, delegation standing, document scope, review authority)
and runs at the sole route-layer constructor of the resolved-command extractor, so every
mutating route is gated by construction rather than by per-route discipline. The
coverage guard iterates the mutating route fixtures and asserts each refuses an
unregistered actor. Denials are values; only a genuine infrastructure fault collapses to
a fixed redacted backend-fault message. Self-approval remains enforced in the domain, not
duplicated at the route.

### w14-p42a-scope-namespace-mismatch | high | resolved the document-scope guard compared two incomparable namespaces and denied every create

The first wiring of the document-scope guard compared the document reference scope (a
worktree path via the scope token) against the authoring session scope (a client-supplied
label). The two namespaces never matched, so the guard denied every create against real
data. Fixtures masked it because they aligned the two by accident. The guard now derives
the authorized scope server-authoritatively from the active workspace root, and the
client-supplied session scope is orphan write-only state read by nothing. This was a
non-functional-against-real-data defect invisible to the fixture tests.

### w14-p42a-fencing-mandatory-lock-wedge | high | resolved the advisory fence had mandatory-lock semantics that stranded approved applies

The first wiring of the fencing check treated an absent fencing token as a denial, which
gave the advisory-lease fence mandatory-lock semantics and stranded every system, direct,
and execute apply that carried no token. Per the concurrency ADR leases are advisory
coordination, not a correctness gate: an absent token now proceeds, a presented current
token proceeds, and only a presented stale token is refused as a value. The base-revision
check remains the anti-stale-write correctness floor beneath the advisory fence.

### w14-p42a-unbounded-compaction-audit-table | medium | resolved the transcript-compaction driver activated a dormant unbounded audit table

Wiring the transcript-compaction driver to run once per prompt turn activated a
compaction-run audit table that grew roughly one row per turn without bound, and keyed the
row on the run id so a joining turn that shared a run id hit a uniqueness collision. The
row is now keyed on the per-command receipt id, the insert is skipped on a pure no-op
sweep, and a bounded prune keeps only the most-recent rows so sustained real compaction
cannot grow the table without limit. The pending-approval and rollback classes are
structurally excluded from the due-set by the query, preserving the never-compact-pending
invariant by construction.

### w14-p42a-cross-engine-acceptance | info | the consolidated Increment-5 demo runs green over the live wired router as a single acceptance suite

The consolidated acceptance suite drives the real router over HTTP through the machine
bearer gate and actor-principal layer against a real git worktree with no mocks, and
proves the six engines compose: two concurrent writers with an observable lease token and
stale-refused, absent-proceeds, current-lands fencing; a deterministic stale-base conflict
served and the apply refused with and without a token (no lease bypasses the revision
check); the rebase route wired and deterministically gating; an unauthorized actor refused
with a redacted error that echoes neither token nor path nor foreign scope; and a claimed
item surfacing in the review queue with fingerprint-only redacted provenance. Two honest
wire constraints are documented: the conflicted state is not deterministically
wire-producible once the conflict preflight pre-empts the apply-failure that created it
(the positive rebase is covered by a store-seeded unit test), and the standing-or-delegation
denial is not externally wire-reachable because token issuance always registers the actor
active and rejects a delegated record (covered by the coverage guard at the extractor
floor). Both are genuine architectural properties with adequate unit substitution, not
coverage gaps.

### w14-p42a-phase-verdict | info | the phase is a clean integrated whole with no surviving unauthorized-mutation path

The S264 cross-cutting phase audit enumerated all twenty-six mounted routes: every one of
the twenty-four mutating handlers takes the resolved-command extractor, so each is
authorized before its handler with no per-route discipline; the single mutating route not
under the floor is actor-token issuance, correctly gated by the machine bearer gate as the
V1 trust root; and every read route constructs no command and mutates nothing. Every wired
engine is both reachable and enforcing, verified live in the acceptance suite. Redaction
holds at every seam: authorization denials echo neither token nor path nor foreign scope,
the backend fault collapses to a fixed message, and provenance is structurally redacted
because the projection type carries no raw-body field. The direct-write seam is floor
authorized and additionally resolves its target server-side against the active workspace
root, so there is no client scope to spoof. No CONFIRMED or PLAUSIBLE unauthorized-mutation
path exists. This verdict closes the W13.P20 authorization verify row (unauthorized humans
and agents cannot mutate state), the W13.P24 review-station serve verify, and the W13.P26
and W13.P27 deterministic-outcome verifies, all re-confirmed live.

### w12-w13-phase-review-closure | info | the Increment-4 and Increment-5 engine phases were each adversarially reviewed at build and re-verified clean by the wiring audit

The W12 agent-runtime phases (tool-permission request flow, interrupt resume and tool-call
records, bounded generation channels and transcript compaction, and the LangGraph agent
fixture that is the Increment-4 acceptance demo) and the W13 concurrency and review-depth
phases (authorization engine and scope guards, review-station queues and provenance audit,
advisory leases and fencing, base-revision conflict detection, explicit rebase and
supersession) were each adversarially reviewed at build, with required revisions landed and
re-checked before forward work proceeded. The W13 engines were additionally re-verified
end-to-end by the W14.P42a wiring: each was wired into the live route and apply paths and
exercised by the consolidated acceptance suite, and the cross-cutting phase audit found no
surviving gap across their seams. The Increment-4 demo is covered by the committed LangGraph
authoring fixture that drafts a proposal, pauses on a tool-permission interrupt, resumes by
interrupt id, requests approval, and in autonomous mode sees its work applied and listed
after the fact.

## Recommendations

- Add the two missing endpoint-family and route-fixture entries for the lease renew and
  release routes so they are individually exercised by the coverage guard and listed in the
  wire registry. This is a registry and test-completeness item, not an enforcement gap: both
  handlers already take the resolved-command extractor and are floor-gated structurally like
  every other mutating route.
- Retire the orphan client-supplied session scope now that the document-scope guard is
  server-authoritative, and relocate the document lease scope helper to sit beside the other
  scope conventions.
- Carry the final release-readiness and epic-closeout audit under W14.P43 once the
  broker-retirement and restart-replay-reconnect acceptance phases land, referencing this
  audit for the engine-wiring verification.
