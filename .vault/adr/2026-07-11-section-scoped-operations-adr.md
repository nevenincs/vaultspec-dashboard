---
tags:
  - '#adr'
  - '#section-scoped-operations'
date: '2026-07-11'
modified: '2026-07-11'
related:
  - "[[2026-06-29-agentic-change-format-and-chunking-adr]]"
  - "[[2026-06-29-agentic-document-chunk-management-adr]]"
  - "[[2026-06-29-agentic-rollback-history-adr]]"
  - "[[2026-07-11-agentic-spec-authoring-backend-adr]]"
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
  - "[[2026-06-29-agentic-spec-authoring-backend-research]]"
---

# `section-scoped-operations` adr: `Section-scoped operations: selector schema, whole-document materialization, selected-preimage rollback` | (**status:** `accepted`)

## Problem Statement

Per operator directive, the section-scoped proposal operations deferred at plan phase `W13.P45` are now built. This ADR clears the gate the deferral record required: it supersedes decision D1 of the 2026-07-11 deferral ADR and amends architecture-review finding ASA-003 in the change-format ADR - narrowly. The change-format ADR already accepted the section-edit contract (exact-resolving target evidence, selected preimage, conflict-on-unresolved) but left the selector schema "deferred to the implementation schema" and V1 materialization whole-document-only for want of a consumer. This ADR fixes that implementation schema: what a section selector is, how a section edit materializes without a new core verb, and how it rolls back. It does NOT un-defer the served chunk retrieval API (ASA-003's actual subject); chunk evidence stays optional provenance and no `document_chunk` API ships.

## Considerations

- The change-format ADR is explicit that offsets alone are unsafe: duplicate headings, moved sections, and regenerated prose invalidate byte offsets, so a selector must resolve EXACTLY against the expected base or the operation becomes conflicted - never a fuzzy patch.
- `vaultspec-core` exposes no section-edit verb: its `vault edit` capability is a combined whole-document body/frontmatter edit, not a range splice. A section edit therefore cannot be materialized by a dedicated core verb - it must be composed from a whole-document write, exactly as the ledgered-edit migration composed relate/link from a whole-frontmatter read-modify-write.
- The delivered rollback contract (rollback-history ADR) already provides preimage-restore and honest unavailability; a section edit fits it if it captures a preimage at resolve time.
- The base-revision conflict floor (concurrency ADR) already refuses stale whole-document writes; the section selector adds a finer, section-local staleness check on top, not a replacement.

## Considered options

- **Whole-document materialization with a section-scoped proposal, selector, and selected preimage (CHOSEN).** Section granularity lives where it matters - the diff the reviewer sees, the selected preimage, and the section-local conflict check - while the write reuses the safe, tested `SetBody` path. No new core verb, no upstream gate.
- **A dedicated `vaultspec-core` section-edit verb.** Rejected: upstream exposes none, so this is upstream-blocked exactly like the CreateDocument delete-inverse; composing from a whole-document write avoids the block entirely.
- **Offset-only or line-number selectors.** Rejected: the change-format ADR names this as the unstable case; without content-hash verification a shifted section is silently mis-edited.
- **Fuzzy or three-way-merge application.** Rejected: the accepted contract mandates conflict-on-unresolved, not best-effort application; determinism and reviewability outrank convenience in the authoring store.

## Constraints

- The served chunk retrieval API stays deferred (ASA-003 unchanged for its actual subject); this ADR amends only the section-EDIT materialization clause. Chunk evidence on an operation remains optional provenance.
- Depends on stable parents, all delivered and tested: `ReplaceBody` whole-document materialization and its post-verify, the preimage-restore rollback, and the base-revision conflict check. This ADR adds a layer above them, reversing none.
- The selector must be exact-resolving; an unresolved or ambiguous selector is a conflict, never a fuzzy apply. This is a hard invariant, not a tuning knob.

## Implementation

**The selector schema.** A section selector carries three parts: a structural anchor (the target section's heading path, so a uniquely-named heading resolves directly), a base-relative range hint (byte or line span expected to hold the section), and an expected selected-content hash (a digest of the section's current bytes). Resolution locates the section by structural anchor, then verifies the resolved bytes' hash equals the expected hash. An anchor that is missing, ambiguous (duplicate heading with no disambiguating path), or whose resolved content hash does not match is not resolved exactly - the operation becomes conflicted with a typed reason, carrying the observed-versus-expected evidence for review. An atomic hunk is the lower-level form of the same contract: an exact expected-old-bytes span at a resolved offset, replaced by new bytes, conflicting if the old bytes are not found verbatim.

**Materialization is whole-document.** On apply, the engine resolves the selector against the current base body, captures the resolved bytes as the selected preimage, splices the new section content in place of the resolved range to produce a new whole-document body, and writes that body through the existing `SetBody` core capability. A new `SectionScoped` draft mode and a `validate_section_edit_draft` validator accept a `SectionEdit` child carrying the selector, the new section content, and the expected selected preimage, rejecting malformed selectors before apply. The proposal, diff, and preview continue to display the section-scoped change; only the write is whole-document. Post-verify reuses the core-authoritative body path (re-read and confirm) rather than a preview-hash compare.

**Rollback uses the selected preimage.** A section edit's inverse restores the captured selected preimage into its resolved range through the same whole-document `SetBody` path, generated as a fresh reviewable rollback changeset; where the section no longer resolves at rollback time, it degrades to the honest `rollback_available=false` + reason + manual-repair hook, exactly as every other kind. The whole-document preimage remains available as the coarse fallback.

## Rationale

The decision keeps every existing safety property and reuses every stable parent: the write is still a whole-document `SetBody` with base-revision conflict detection beneath it, so nothing about apply soundness changes; the only additions are a section-local resolve-or-conflict step and a selected-preimage capture. Composing the section edit from a whole-document write is the same move the ledgered-edit migration already validated for relate/link, and it sidesteps the upstream gate that a dedicated core verb would hit. Making the selector exact-resolving with content-hash verification is a direct reading of the change-format ADR's own warning against offset instability. The chunk retrieval API is left deferred because it is genuinely a separate concern - a served read surface for agents - and no consumer needs it to make section EDITS work.

## Consequences

- `SectionEdit` becomes an appliable, rollback-eligible operation kind; plan phase `W13.P45` (S242-S244) closes and the epic reaches its full 250/250.
- The 2026-07-11 deferral ADR's D1 is superseded and the change-format ADR's section-edit materialization clause is amended; ASA-003's chunk-retrieval deferral and the CreateDocument delete-inverse deferral (D2) both STAND.
- A mis-resolving selector fails closed as a conflict with observed-versus-expected evidence, never a silent mis-edit; consumers may rely on that.
- The selected-preimage capture adds bounded storage per section edit (the resolved section's bytes), consistent with the existing whole-document preimage retention envelope.
- The remaining honest limit: the write is whole-document under the hood, so two concurrent section edits to disjoint sections of one document still serialize through the base-revision check rather than merging; that is acceptable under the accepted conflict-over-merge posture and can be revisited only if real usage demands section-level concurrency.
