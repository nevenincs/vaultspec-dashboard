---
tags:
  - '#audit'
  - '#ledgered-edit-migration'
date: '2026-07-09'
modified: '2026-07-12'
related:
  - "[[2026-07-09-ledgered-edit-migration-plan]]"
  - "[[2026-07-09-ledgered-edit-migration-adr]]"
---

# `ledgered-edit-migration` audit: `Final gate and epic closeout`

## Scope

The Increment-4 final gate and epic closeout for the ledgered-edit-migration feature: the
migration that routes every product document-edit surface through the ledgered authoring
backend and deletes the legacy un-ledgered write path. It audits the full automated gate
across the touched engine and frontend surfaces, the end-to-end verification that each
migrated edit produces an auditable changeset, the honest maintenance-op boundary, and the
epic-completion assessment. Every phase in the plan was independently adversarially
reviewed as it landed; this closeout records the aggregate outcome.

## Findings

### led-final-gate-green | info | the full automated gate passes across every migrated surface

The final gate ran green. The authoring crate's Rust suite passed at its committed figure
(the working tree also carries an unrelated, co-resident provision-lane WIP that adds a
handful of tests and is not part of this migration) with every integration binary green
(the cross-engine acceptance, the vertical-slices real-vaultspec-core apply test, the
LangGraph authoring fixture, and the route/corpus/search binaries), zero failures. The
frontend lint gate passed on formatting, type-check, the pixel-scan with an empty
allowlist, token drift, and the Figma name contract; the production build succeeded; and
the frontend test suite passed at 2755 of 2755 across 300 files running online against a
real engine origin. The vault checks are clean for the feature.

### led-every-edit-ledgered | info | every product edit surface now produces an auditable changeset with provenance

All five document-edit surfaces were migrated off the legacy un-ledgered path onto the
ledgered direct-write, each verified end to end by committed live-wire coverage rather than
a one-off manual pass: the editor Save (whole-document body replacement), the frontmatter
panel (a field-level edit), rename (an identity change with a rename-back inverse), create
(a new document), and relate/link (modeled as a frontmatter edit on the source's related
list, executed as a read-modify-write with an optimistic fence). The frontend suite spies
the direct-write request shape for each surface and exercises the live authoring wire; the
backend carries live-core apply tests against real vaultspec-core proving each operation
kind lands and is recognized applied — including the crash-recovery reclaim path for every
core-authoritative kind. Both the single-call human-save path and the standard
propose-review-approve-apply flow (the agent LangGraph path included) construct every
migrated content kind, so a human save and an agent proposal both enter history as a
changeset with a preimage (except creation) and provenance.

### led-legacy-path-deleted | info | the legacy /ops/core write path is deleted with no surviving caller

The migration's final cutover removed the legacy write channel entirely — the
/ops/core/{verb}/write, create, link, and unarchive routes, their handlers, whitelist,
request bodies, and only-called-by-them helpers on the engine, and the matching dispatch
modes, client methods, body types, and the retired response adapter on the frontend, with
the pinning tests removed or replaced by genuine retained-op coverage. The removal was
independently confirmed to leave zero live callers (grep-clean plus a green compile, since
a surviving reference to a deleted route or handler would fail to build). The retained
read-control verbs and the deliberately-non-ledgered vault-maintenance operations
(feature-archive and autofix) remain, and the shared result vocabulary the ledger path
reuses was correctly kept.

### led-maintenance-op-boundary | info | feature-archive and autofix are honestly retained as non-ledgered maintenance operations

Per the accepted ADR, feature-archive (multi-document) and autofix (bulk repair) are not
per-document content edits and do not fit the single-child V1 changeset model, so they were
re-scoped as clearly-labeled vault-maintenance operations rather than forced into the
ledger. They were already structurally separated from the document-edit affordances
(feature-node-gated, so they never render on a document's own context menu); the closeout
strengthened their labels and documented the out-of-ledger boundary, with a return trigger
to introduce a multi-document changeset shape if they must be ledgered later. This is a
deliberate, documented boundary, not an unmigrated gap.

### led-epic-complete | info | the epic is complete — every non-deferred step done, reviewed, and gated green

The plan reaches full closure across its waves: editor identity and Save cutover, the
backend apply-side wiring for every operation kind plus the propose-side generalization and
the operation-typed route with a scope-pin, the frontend rewire of all five edit surfaces
plus the create identity-echo, and the maintenance re-scope, legacy removal, and this final
gate. Every phase was adversarially reviewed as it landed, and the review discipline
repeatedly caught real defects the isolated tests missed — an unsound crash-recovery
post-verify for core-authoritative writes, a rename-back rollback that could clobber an
unrelated document after stem reuse, a propose-side surface that could not construct
non-body changesets, a scope-pin that diverged from the frontend's normalization on Windows
extended-length paths, a blank advisories panel on a denied save, and a false "Create
refused" on every successful create. Each was fixed and re-reviewed before its phase closed.

## Recommendations

- Introduce a structured denial discriminator (`denial_kind` / `collision: true`) on the
  direct-write wire so the frontend stops routing a rename/create collision by substring-
  matching the backend's reason text — currently acceptable (it mirrors the backend's own
  conflict-vs-denied reason routing and is pinned by a live test that breaks on a wording
  change) but a structured flag is the durable fix.
- Land a delete-inverse for CreateDocument so a ledgered create becomes rollback-eligible;
  it ships non-invertible today (honest `rollback_available=false` with reason) because the
  ledger has no delete verb, which is an ADR-recorded deferral, not a defect.
- When the provision-lane WIP that co-resides in `lib.rs`/`engine.ts` lands, confirm nothing
  it adds re-introduces an un-ledgered document-write path (its routes are provisioning, not
  document edits, so this is a check, not an expected conflict).
