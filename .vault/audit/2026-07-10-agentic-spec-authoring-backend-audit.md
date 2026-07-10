---
tags:
  - '#audit'
  - '#agentic-spec-authoring-backend'
date: '2026-07-10'
modified: '2026-07-10'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
  - "[[2026-07-09-ledgered-edit-migration-audit]]"
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

# `agentic-spec-authoring-backend` audit: `W13.P46 per-operation rollback inverses — return trigger fired and satisfied`

## Scope

The W13.P46 conditional phase — per-operation rollback inverses beyond whole-document
preimage restore — was DEFERRED OUT on 2026-07-08 because V1 applied only whole-document
ReplaceBody, so no other operation kind was appliable and none needed a per-operation
inverse. This audit records that the phase's return trigger has since FIRED and been
satisfied: the ledgered-edit-migration campaign (completed 2026-07-10) made Rename,
EditFrontmatter, and CreateDocument appliable, and delivered the per-operation inverse logic
and its tests that this phase specified. It verifies that logic is present and tested in the
current tree, closing the build, test, and review rows (S247/S248/S249) as satisfied by
cross-campaign delivery rather than fabricated. The one honestly-unavailable inverse
(CreateDocument's delete) is confirmed upstream-gated, not a gap.

## Findings

### per-op-inverses-delivered | info | rename inverse, honest-unavailable inverses, and the eligibility admit-list are implemented and tested

The per-operation rollback inverse logic S247 specified is implemented in
`authoring/rollback.rs`: `generate_rollback` dispatches per operation kind, producing a
genuine Rename inverse (a rename-back to the original stem the source was moved from,
lineage-guarded against stem reuse) and, for kinds with no deterministic inverse, an honest
`rollback_available=false` carrying the denied eligibility reason plus a ManualRepairProposal
hook rather than a guessed inverse. The `create_rollback_eligibility` admit-list in
`authoring/transitions.rs` is ReplaceBody | EditFrontmatter | Rename, with CreateDocument
excluded. This is the "enabled per operation kind only as need appears from real usage"
contract: the need appeared when the ledgered-edit-migration campaign made those kinds
appliable, and the inverse was enabled for exactly the kinds that have one.

### per-op-inverse-tests-present | info | the S248 test matrix is covered by the committed rollback suite

The S248 test set is present in `authoring/rollback.rs` (eleven rollback tests):
`rename_rolls_back_by_renaming_back_to_the_original_stem` (rename inverse),
`rename_rollback_refuses_when_the_stem_was_renamed_away_and_reused` (the lineage guard),
`create_document_source_has_no_v1_inverse_and_offers_manual_repair` (the create/delete
honest-unavailable case), and `missing_preimage_is_unavailable_with_manual_repair` /
`rename_source_without_a_preimage_is_unavailable_with_manual_repair` (the remaining honest
unavailable-reason cases), plus reviewable-not-auto-applied and idempotent-replay coverage.
The delete inverse specifically is honestly unavailable, not missing: it is upstream-gated on
a vaultspec-core single-document delete verb that does not exist, recorded as the
ledgered-edit-migration W05.P15 disposition with its own return trigger.

### p46-closed | info | the phase's build/test/review rows are satisfied and checked

With the inverse logic and its tests verified present in the current tree, S247 (implement)
and S248 (test) are satisfied by the cross-campaign delivery, and this audit is the S249
review record. The phase closes at 5/5. The whole-document preimage-restore rollback
(W08.P38) remains the ReplaceBody/EditFrontmatter inverse; the Rename inverse is the one
genuine per-operation inverse; CreateDocument stays honestly non-invertible until the
upstream delete verb lands.

## Recommendations

- No new work for this phase. The one remaining honest gap — a CreateDocument delete-inverse
  — is the ledgered-edit-migration W05.P15 upstream coordination ask (a bounded vaultspec-core
  single-document delete verb); wire it as a CoreCapability and admit CreateDocument to the
  rollback eligibility set the day that verb ships.
