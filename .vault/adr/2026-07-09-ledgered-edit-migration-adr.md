---
tags:
  - '#adr'
  - '#ledgered-edit-migration'
date: '2026-07-09'
modified: '2026-07-09'
related:
  - "[[2026-07-02-agentic-operation-modes-adr]]"
  - "[[2026-06-29-agentic-security-provenance-adr]]"
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #adr) and one feature tag.
     Replace ledgered-edit-migration with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     Status convention: the H1 status value is one of proposed, accepted,
     rejected, superseded, or deprecated. A new ADR starts as proposed; it
     moves to accepted or rejected when the decision is made; it becomes
     superseded when a later ADR replaces it (set by vault adr supersede,
     which also records superseded_by); and deprecated when it is retired
     without a direct successor.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `ledgered-edit-migration` adr: `Route every document edit through the ledgered authoring backend and retire the /ops/core write path` | (**status:** `accepted`)

## Problem Statement

The authoring backend delivers a complete propose-review-approve-apply-rollback ledger for
document changes, with identity, idempotency, advisory concurrency, conflict detection,
provenance, and streaming recovery — but the dashboard's actual edit surfaces do not use
it. Every document mutation the product exposes still flows through the un-ledgered
`/ops/core` sibling passthrough: the editor Save button, the frontmatter panel, rename,
create, relate/link, and the maintenance fixers all dispatch through one ops seam to
`/ops/core/*/write`, `create`, `archive`, `link`, and `autofix`. None of them enters
history as a changeset with a preimage and provenance, and none is rollback-eligible. The
operation-modes decision already named the editor Save cutover as a planned step, and the
broker-retirement work retired the direct-write MECHANISM to sole authority while honestly
recording that the product still writes around it. This ADR decides how to finish the job:
route every genuine document edit through the ledger and delete the legacy write path,
while being explicit about the operations that are not document edits and do not fit the
per-document changeset model.

## Considerations

- The ledger's V1 shape is a single-child, whole-document changeset (the multi-document
  saga was deliberately deferred). A per-document content edit fits this shape; a
  feature-scoped or bulk operation does not.
- The changeset operation vocabulary already declares nine kinds (create, replace-body,
  append-body, edit-frontmatter, rename, archive, unarchive, link, section-edit), and the
  internal core adapter already implements five capabilities (`vault add`, `set-body`,
  `set-frontmatter`, `edit`, `rename`) as typed, bounded, capability-probed subprocess
  verbs. But apply, materialization, preimage capture, rollback, and conflict detection are
  wired ONLY for whole-document body replacement; every other kind is refused at validation
  today. So the vocabulary and adapter plumbing exist; the gap is the apply-side wiring.
- A complete, tested, self-approving single-call body-replacement materializer already
  exists and is retired to sole authority — but nothing in the product calls it. Wiring the
  Save button to it is the highest-leverage, lowest-risk first move.
- Every command route resolves identity from a per-principal actor token. Only the review
  station bootstraps one today; a plain editing session has no token path, so any ledgered
  edit from the editor throws before it fires. A human self-approving their own manual edit
  is explicitly legal (it is not agent self-approval).
- Two exposed operations are not per-document content edits: feature-archive touches every
  document under a tag (multi-document), and autofix is a bulk vault repair with no single
  target. Neither fits the single-child V1 changeset model even in concept.
- The retirement must be a true cutover with no bridge: once an edit is ledgered, its
  legacy `/ops/core` write route and its frontend dispatch are deleted, not left as a
  fallback.

## Considered options

- **Ledger every content edit; keep maintenance operations as sanctioned non-ledgered ops
  (CHOSEN).** Route body, frontmatter, rename, create, and relate/link through the
  changeset ledger; delete their legacy write routes; retain feature-archive and autofix as
  explicitly-scoped vault-maintenance operations that are not document edits. Honest,
  buildable, and finishes the product cutover the operation-modes ADR intended.
- **Ledger everything including archive and autofix via a new multi-document changeset
  shape.** Rejected for now: it reopens the deliberately-deferred multi-document saga, is a
  large increment, and conflates vault-lifecycle maintenance with document authoring. Left
  as a return trigger, not a bridge.
- **Leave the non-body edits on `/ops/core` and only migrate the Save button.** Rejected:
  it does not satisfy "migrate every edit" and leaves an un-ledgered write path alive, which
  is exactly the state this ADR exists to end.
- **Bootstrap the editor actor token silently vs. as a first-class editor identity.** Chose
  a first-class, shared editor identity reusing the review station's token mechanism, so the
  same principal is visible across the editor and the review station rather than minting an
  anonymous per-edit token.

## Constraints

- The ledger V1 is single-child, single-document. This ADR stays inside that shape for
  content edits and does NOT migrate multi-document archive into it.
- Rollback is preimage-restore only today. Content edits that mutate an existing document
  (body, frontmatter, rename, link) capture a preimage and are rollback-eligible; document
  creation has no preimage, so its inverse is a delete, which the ledger has no verb for
  yet — creation ships as an honestly non-rollback-eligible changeset (recorded with
  provenance, `rollback_available=false` with reason), with a delete-inverse as a scoped
  follow-on rather than a blocker.
- The core adapter has typed capabilities only for add/set-body/set-frontmatter/edit/rename;
  it has none for archive/link/autofix. Link is therefore modeled as a frontmatter edit
  (it mutates the source document's `related:` list), not a new adapter verb.
- Depends on the authoring backend (stable, epic-complete) and the actor-token seam (stable,
  security-provenance ADR). No new external dependency.

## Implementation

The migration proceeds in dependency order, each phase a true cutover of its surface.

First, an **editor actor-token bootstrap**: generalize the review station's token issuance
into a shared current-editor identity so an editing session holds a human actor token,
minted once through the machine-bearer-gated issue-token route. Every subsequent ledgered
edit threads that token; a human approving their own manual save is legal self-approval.

Then the **Save button (body)** wires to the existing self-approving single-call
body-replacement route, unchanged on the backend — the lowest-risk, highest-value step,
migrating the most common edit first and deleting its legacy write dispatch.

Then the **backend gains apply-side wiring** for the remaining content operation kinds:
edit-frontmatter, rename, and create-document. Each extends validation to accept its kind,
materializes through the core adapter capability that already exists, captures a preimage
where one exists (frontmatter, rename), records provenance, and participates in conflict
detection. Rename's inverse is a rename-back; frontmatter's inverse is the stored preimage;
creation is non-rollback-eligible by construction. The single-call composition that Save
uses is generalized to an operation-typed direct edit so frontmatter, rename, and create
each get a self-approving human-save path symmetric with body replacement.

Then the **frontend rewires** the frontmatter panel, rename affordance, create dialog, and
the relate/link action to the operation-typed authoring path, and the dead archive/link
mutation hooks are removed.

**Relate/link** is materialized as a frontmatter edit on the source document (its
`related:` list), so it reuses the frontmatter path rather than a bespoke verb.

**Feature-archive and autofix** are re-scoped as vault-maintenance operations, not document
edits: they are removed from the editor's edit surfaces and retained only as clearly-labeled
maintenance actions on a separated admin path, documented as out-of-ledger by design with a
return trigger to introduce a multi-document changeset shape if they must be ledgered later.
Unarchive and the append-body/section-edit kinds remain enum-declared but out of scope.

Finally, the **legacy removal**: the `/ops/core` write routes for the migrated content
verbs (set-body, set-frontmatter, edit, rename, create, link) and their handlers are
deleted, along with the frontend ops write/create/link modes, the `opsCore*` write client
methods, the `Ops*Body` types, and the tests pinning the legacy shape. The read control
verbs (vault-check, vault-stats) and the retained maintenance operations stay.

## Rationale

The vocabulary and adapter plumbing already exist and the body-replacement path is already
built and tested, so most of the migration is wiring and deletion rather than new
subsystems — the grounding discovery confirmed apply-side wiring, not missing capabilities,
is the gap. Keeping maintenance operations out of the per-document ledger respects the V1
single-child shape and avoids reopening the deferred multi-document saga while still
finishing the cutover the operation-modes ADR intended. Modeling link as a frontmatter edit
avoids a new adapter verb for what is structurally a `related:` mutation. Bootstrapping a
first-class editor identity, rather than an anonymous per-edit token, keeps the same
principal coherent across the editor and the review station and preserves legal human
self-approval.

## Consequences

- Every genuine document edit becomes an auditable changeset with provenance and (except
  creation) rollback eligibility; the product finally uses the ledger it was built on, and
  the un-ledgered write path is gone.
- The cutover is staged and each surface is independently shippable — the Save button lands
  value before the harder kinds are wired.
- Honest gaps remain and are named, not hidden: creation is not rollback-eligible until a
  delete-inverse lands; feature-archive and autofix stay out of the ledger by design; and
  the editor now requires an actor token, so the token bootstrap is a hard dependency of
  every ledgered edit and must fail safely (an edit with no identity is refused, not
  silently dropped).
- The maintenance operations retained outside the ledger are a deliberate, documented
  boundary with a return trigger, not an oversight — a future multi-document changeset shape
  can absorb them if the need appears.
