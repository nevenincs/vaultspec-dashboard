---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S19'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-timeline with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S19 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add the client method that fetches the lineage slice for a scope, range, and filter and ## Scope

- `frontend/src/stores/server/engine.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the client method that fetches the lineage slice for a scope, range, and filter

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

- Add the `lineage({ scope, from?, to?, filter? })` client method on `EngineClient`, issuing `GET /graph/lineage` with the same get/unwrap path as `events` and `graphQuery`.
- Pass `from`/`to` as inclusive ISO `yyyy-mm-dd` bounds and `filter` as the URL-encoded JSON filter string the route accepts.
- Run the result through the tolerant `adaptLineageSlice` adapter, mirroring how `graphQuery` runs through `adaptGraphSlice`.

## Outcome

The stores layer is now the sole wire client for the lineage projection. The method returns the reconciled `LineageSlice`; absent params are simply omitted from the query string by the shared `get` builder.

## Notes

The non-null assertion on `scope` matches the surrounding client style; the hook gates `enabled` on a non-null scope so the call only fires with a real scope.
