---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S50'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace figma-parity-reconciliation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S50 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Rebuild the hover-card from the binding graph HoverCard frame 84:2 over the enriched node-evidence query and ## Scope

- `frontend/src/app/right/menus/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Rebuild the hover-card from the binding graph HoverCard frame 84:2 over the enriched node-evidence query

## Scope

- `frontend/src/app/right/menus/`

## Description

- Build the binding `graph/HoverCard` 84:2 hover-card in `frontend/src/app/right/menus/` as a transient projection over the ENRICHED node-evidence: a self-contained presentational `HoverCard` taking a typed model (identity plus grouped evidence) and a pure `hoverCardEvidence` derivation seam.
- Author `hoverCardEvidence.ts`: fold the stores-served `NodeEvidence` (the S13 shape — documents `{path, doc_type}`, code-locations keyed on `path` with resolution `state`, commits with `subject`) into bounded, headed groups (documents, code, commits) with a per-group cap and a `+N more` overflow tail, omitting empty groups, plus a `hasEvidence` guard. The fold is pure: no React, no fetch, no `tiers` read.
- Author `HoverCard.tsx`: render the identity header (kind glyph in the category accent, title) and the grouped evidence lines, with the single resolution-state tint (resolved/stale/broken) from the semantic state tokens, the category accent strip, and the monospace identity-tail id. Instrument register: no gradients, no textures, no second accent; warmth in the one category token.
- Cover both with tests: `hoverCardEvidence.test.ts` (group bounding/overflow, empty-group omission, path compaction, state pass-through, group order) and `HoverCard.render.test.tsx` (identity header, three groups, state tint, overflow tail, identity-only when no evidence) — the card is fed a typed model directly, exercising the real fold, no component-internal doubles.

## Outcome

The hover-card is faithful to the binding frame and is a strict dumb projection over the enriched node-evidence (consumed via the `useNodeEvidence` stores hook by the wiring layer, never fetched here, never reading raw `tiers`). Scoped tests green (full `right/menus/` dir: 24 tests, including the pre-existing `rightMenus.test.ts`).

## Notes

The LOW-1 carry-forward note (W01.P02 summary) suggested adding a `confidence` field to the evidence value-add before a richer consumer renders it. The engine evidence projection DOES serve `commits[].confidence` (and code-location confidence) on the wire, but the stores-layer `NodeEvidence` type does not yet declare it. Adding it is a stores/type change (`frontend/src/stores/server/engine.ts`), which is OUTSIDE this phase's scope fence (stores is preserved-and-frozen, owned elsewhere); the derivation seam folds only the typed fields available, and gains the confidence detail the moment the stores type carries it. Deferred to the stores owner.

Path note: the plan row names `frontend/src/app/right/menus/` for the hover-card; the existing islands hover-bloom card (`frontend/src/app/islands/HoverCard.tsx`, fed by `useNodeDetail`) is a sibling LOD rung and was left untouched. This step delivers the evidence-driven hover-card the binding frame specifies in the plan-named location. No SceneController surface change; no fetch added.
