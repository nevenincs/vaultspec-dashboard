---
tags:
  - '#adr'
  - '#agentic-spec-authoring-backend'
date: '2026-07-11'
modified: '2026-07-11'
related:
  - "[[2026-06-29-agentic-change-format-and-chunking-adr]]"
  - "[[2026-06-29-agentic-rollback-history-adr]]"
  - "[[2026-07-09-ledgered-edit-migration-adr]]"
  - "[[2026-07-09-ledgered-edit-migration-reference]]"
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---



# `agentic-spec-authoring-backend` adr: `Defer section-scoped operations and the CreateDocument delete-inverse until their gates clear` | (**status:** `accepted`)

## Problem Statement

Two capability remainders of the authoring backend were ruled deferred by architectural gates (2026-07-08, re-confirmed by the 2026-07-10 gate review), but the rulings live only in plan phase-intro prose, not in a governing decision record. This ADR promotes both dispositions to accepted decisions: section-scoped and atomic-hunk proposal operations (plan phase `W13.P45`, the `W03.P13` remainder) stay deferred behind an architecture gate, and the delete-inverse that would make a ledgered `CreateDocument` rollback-eligible (the `W13.P46` remainder, dispositioned as `W05.P15` of the ledgered-edit migration) stays deferred behind an upstream gate. The record fixes what is deferred, what already ships, which trigger clears each gate, and in what order the gate is serviced — so neither deferral can be reopened by drift or closed by silent contradiction of an accepted ADR.

## Considerations

- Section-scoped edits are contractually coupled to the chunk/selector API that the change-format ADR deferred under architecture-review finding ASA-003: no chunk API ships in V1, the chunk API becomes buildable only when a retrieval consumer exists, and section-scoped edits must carry exact-resolving target selectors and selected preimages, with an unresolvable selector becoming a conflict rather than a fuzzy patch. Building section operations first would contradict that accepted clause silently.
- No consumer needs sub-document edits. Increments 1-5, including the LangGraph agent runtime, produced none; the ledgered-edit migration then wired every product edit - save, frontmatter, rename, create, relate/link - through whole-document shapes, with relate/link materialized as a whole-frontmatter read-modify-write (`EditFrontmatter`), not a sub-document mutation. The strongest historical candidate for a section-edit consumer chose the whole-document shape and shipped.
- The rollback-history ADR narrowed V1 rollback to inverses deterministic from already-retained material, and made unavailability a first-class honest state: every applied operation exposes rollback availability, a reason when unavailable, and a manual-repair proposal instead of a guessed inverse. A `CreateDocument` with no inverse is therefore contract-conformant behavior, not a defect.
- The only inverse of a document creation is a single-document delete, and `vaultspec-core`'s vault surface exposes no such verb: its mutating verbs are `set-body`, `set-frontmatter`, `edit`, `rename`, `add`, and `link`; the only removal is feature-scoped multi-document archive. The authoring boundary forbids reaching the vault by any path other than the internal `vaultspec-core` adapter - no raw-filesystem writes, no git mutation - so a compliant delete-inverse cannot be built in this repository at all. The gap is genuinely upstream.
- The rollback-history ADR's own deferred inverse matrix words the create inverse as archive/tombstone conditioned on a documented core capability and policy; upstream exposes neither a single-document archive nor a delete, and the most recent, most specific record (the `W05.P15` disposition) fixes the ask as a bounded `vault delete <ref>`. The two records agree rather than conflict.

## Considered options

- **Keep both capabilities deferred behind explicit gates (CHOSEN).** Honest, consistent with the accepted ASA-003 clause and the authoring boundary, and loses nothing: every shipped edit is whole-document, and non-invertible operations already degrade honestly.
- **Build section-scoped operations now, speculatively.** Rejected: it reverses the accepted ASA-003 deferral without superseding it, ships a selector/chunk subsystem with zero consumers, and re-creates the exact speculative-subsystem failure ASA-003 exists to prevent.
- **Build the delete-inverse by deleting through raw filesystem or git.** Rejected: it breaches the authoring boundary that makes the adapter the sole vault materialization path - a rollback would become the one write that bypasses the write contract.
- **Approximate the create inverse with feature-scoped archive.** Rejected: archive is multi-document by construction; rolling back one created document could sweep sibling documents under the same tag. Wrong granularity is worse than honest unavailability.
- **Force-check the open plan rows to declare the epic 250/250.** Rejected: dishonest bookkeeping; the unchecked rows are the deferral's ledger and the plan's stated honest reachable target is 247/250.

## Constraints

- The change-format ADR (accepted) owns the chunk/selector contract; this ADR cannot and does not relax it. Amending or superseding its ASA-003 clause is a prerequisite of any section-scoped build - the ADR gate precedes the code.
- The authoring boundary ADR (accepted, stable) fixes the adapter as the only vault path; the delete-inverse is buildable only as a new `CoreCapability` brokering an upstream verb.
- Upstream dependency: `vaultspec-core` must ship a bounded single-document delete verb (`vault delete <ref>` or equivalent). This is a Tier-3 coordination ask to file toward `vaultspec-core`, not a gap to patch around locally.
- The rollback eligibility contract (rollback-history ADR, delivered and tested) is the stable parent this ADR leans on; both deferrals sit inside its honest-unavailability envelope.

## Implementation

**D1 - Section-scoped proposal operations stay deferred.** V1 materialization remains whole-document by decision: `operations.rs` validates every accepted kind (`ReplaceBody`, `EditFrontmatter`, `Rename`, `CreateDocument`) under `DraftMode::WholeDocument`, and a `SectionEdit` or `AppendBody` draft is refused at validation with a typed `UnsupportedOperationKind`/`UnsupportedDraftMode` - an honest refusal before apply, never a partial capability. Return trigger: the first agent or editor workflow requiring an exact-resolving sub-document or atomic-hunk edit. Gate ordering is mandatory: firing the trigger first amends or supersedes the ASA-003 clause in the change-format ADR (which couples section operations to the deferred chunk/selector API), and only then is the build admitted, under that ADR's standing conditions - exact-resolving selectors, selected preimages, unresolved selector degrades to conflict.

**D2 - The `CreateDocument` delete-inverse stays deferred.** A ledgered create ships honestly non-rollback-eligible: `create_rollback_eligibility` in `transitions.rs` admits exactly `ReplaceBody | EditFrontmatter | Rename` and denies everything else with a reason naming the missing V1 inverse; `rollback.rs` pairs the denial with a `ManualRepairProposal` (pinned by `create_document_source_has_no_v1_inverse_and_offers_manual_repair`). Return trigger: the day `vaultspec-core` ships a bounded single-document delete verb, wire it as a new `CoreCapability` in the core adapter, generate the rollback as a delete changeset through the standard apply path, and admit `CreateDocument` to the eligibility set. Until then the Tier-3 coordination ask stands filed toward `vaultspec-core`.

**What is delivered, so the boundary is exact.** Whole-document materialization for the four accepted kinds; preimage-restore rollback for `ReplaceBody` and `EditFrontmatter`; a genuine rename-back inverse for `Rename` (a `Rename` to the original stem, guarded against post-apply drift, never a body write); and the honest-unavailability contract - `rollback_available=false`, a reason naming the unimplemented inverse, and a manual-repair proposal - for every other kind. Nothing in either deferral is a missing safety property; both are absent capabilities with honest refusals in their place.

## Rationale

Both deferrals follow the same principle the change-format and rollback-history ADRs already accepted: capabilities are admitted per kind as evidence of need appears, never as speculative batches. For D1 the evidence ran the other way - the one campaign that touched every product edit chose whole-document shapes throughout, so the coupled chunk/selector subsystem still has zero consumers. For D2 the gap is not local at all: the boundary that makes the authoring store trustworthy is precisely what makes the inverse unbuildable here, and honoring the boundary over the feature is the decision. Formalizing both as one accepted ADR ends their existence as plan-prose-only rulings and makes any future reversal an explicit supersession rather than drift.

## Consequences

- The plan's honest reachable target stays 247/250, with `W13.P45`'s build rows (`S242`-`S244`) honestly unchecked as the deferral's ledger - not debt to be force-checked.
- A `SectionEdit` proposal is refused at validation with a typed error today; a `CreateDocument` rollback attempt is denied with a reason and a manual-repair proposal. Both behaviors are contract, not bugs, and consumers may rely on them.
- When the D1 gate clears, the amended change-format ADR governs the build (selector schema, selected preimages, conflict-on-unresolved); the cost accepted is that a future sub-document consumer waits for one ADR amendment before code.
- When the D2 gate clears, creation joins the eligibility set through the same apply/materialization path as every forward change; the cost accepted meanwhile is that undoing a ledgered create is a manual archive or hand repair, recorded as such.
- Two return triggers are now discoverable in one governing record; the risk of a future contributor "fixing" the honest refusals without clearing the gates is closed by this ADR's existence.
