---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S06'
related:
  - "[[2026-07-14-feature-group-authoring-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace feature-group-authoring with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S06 and 2026-07-14-feature-group-authoring-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Serve the coverage projection on the query plane with the shared envelope and tiers, scope-bound, with route tests and ## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Serve the coverage projection on the query plane with the shared envelope and tiers, scope-bound, with route tests

## Scope

- `engine/crates/vaultspec-api/src/routes/query.rs`

## Description

- Add a `features` route handler in the query routes module beside `filters`: a
  `FeaturesParams` extractor (required `scope`, optional `feature`), scope
  resolution through the shared `validate_scope`, a read of the cell's memoized
  coverage map, and a served body of either the requested feature's coverage or
  the compact roster through the shared envelope helper with the tiers block.
- Register `GET /features` in `build_router` beside `/filters`.
- Add `/features` to the `CONTRACT_ROUTES` inventory and to the `spa` bearer-gate
  prefix list so the route ships gated and the contract/router drift guard stays
  green.
- Add end-to-end route tests driven through the real router over a real vault
  worktree: one-feature coverage through the envelope, the roster without a
  feature, an unknown feature reading all-missing rather than 404, and an unknown
  scope 400 that still carries the tiers block.

## Outcome

The route compiles and its four tests pass
(`cargo test -p vaultspec-api --test feature_coverage_routes`, 4 passed). The
contract/router drift guard and the bearer-gate guard both pass
(`contract_route_inventory_matches_the_router`,
`every_contract_route_requires_a_bearer`). `cargo fmt` and `cargo clippy` for the
crate are clean. Every response rides the shared envelope with the tiers block on
success and on the unknown-scope error, never a hand-built body.

## Notes

Judgment calls recorded here:

- An unknown feature is served as an all-missing coverage with a 200, never a 404:
  starting a brand-new feature in the panel is a legitimate read, and the
  all-missing shape is exactly the start-a-new-feature state the panel needs.
- The optional-feature branch chooses the shape at the route: present feature to
  coverage, absent feature to roster, both from the one memoized map.

Cross-boundary flag for the principal (not resolvable within the engine/
boundary): registering the route necessarily adds two lines to the crate's
`lib.rs` (the `CONTRACT_ROUTES` inventory entry and the router registration, both
bound by the drift guard), and that grandfathered monolith sits at exactly its
recorded module-size baseline with zero headroom. The module-size gate therefore
reports `lib.rs` two lines over its baseline. The baseline lives under
`frontend/scripts/`, outside the engine boundary this step is scoped to, so the
baseline needs a two-line bump for the legitimate route addition. Separately, the
gate was ALREADY red on the shared worktree before this work: a parallel lane
removed `authoring/operations.rs`, leaving a stale baseline entry the gate flags.
Neither is an engine-code defect; both are baseline-file hygiene the principal
owns.
