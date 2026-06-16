---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S31'
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
     The S31 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Rebuild the search tab from the binding SearchField Kit primitive over the preserved discover query, reading semantic-offline from tiers and ## Scope

- `frontend/src/app/right/SearchTab.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Rebuild the search tab from the binding SearchField Kit primitive over the preserved discover query, reading semantic-offline from tiers

## Scope

- `frontend/src/app/right/SearchTab.tsx`

## Description

- Rebuild the search tab onto the new Figma role-named token foundation, binding
  to the SearchField Kit primitive (Figma node 136:30).
- Migrate the search field, target radio chips, fallback tags, and result rows
  from the legacy radius and rounded-full scales to the canonical `rounded-fg-xs`
  and `rounded-fg-pill`, and the dense receipts to the `caption` type role.
- Keep semantic-offline read from the controller's tiers-gated `semanticOffline`,
  never from a bare transport error.

## Outcome

The search tab is a dumb projection over the preserved `useSearchController`
selector — the sole wire client for search, which owns the fallback, debounce /
cancel, node-id derivation, and the tiers-gated degradation. The view holds only
ephemeral input state, reads degradation only through the selector's interpreted
`semanticOffline` (never the raw tiers block), and emits selection intent through
`selectNode`. The full state machine (idle / loading / results / no-results /
degraded / error-with-retry) is preserved verbatim.

## Notes

The degradation-is-read-from-tiers law is honored unchanged: the semantic-offline
state is the controller's tiers truth, not a transport guess. No store shape or
query-key change. The aggregate frontend gate is red on unrelated uncommitted
scene-layer WIP from a concurrent builder; the scoped file here passes eslint,
prettier, and tsc cleanly.
