---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S07'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace review-rail-viewers with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S07 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Add a bounded content query keyed by {scope, nodeId} with explicit gcTime and a cache cap, as the sole wire client of /nodes/{id}/content and ## Scope

- `frontend/src/stores/server/queries.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a bounded content query keyed by {scope, nodeId} with explicit gcTime and a cache cap, as the sole wire client of /nodes/{id}/content

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Add the `content` cache key keyed by (scope, nodeId) — the contract's cacheability unit for a per-scope read.
- Add `useNodeContent`, the sole wire client of the content route, disabled until both a node id and a scope are present, following the enabled-on-id pattern.
- Bound the query at creation per bounded-by-default-for-every-accumulator with an explicit `CONTENT_GC_TIME` so an unobserved entry (up to the byte cap) is evicted promptly rather than retained for the whole session; the per-observer single-entry shape bounds concurrent cache pressure.

## Outcome

The content query is the bounded, sole stores client of `/nodes/{id}/content`. Stores tests stay green.

## Notes

None.
