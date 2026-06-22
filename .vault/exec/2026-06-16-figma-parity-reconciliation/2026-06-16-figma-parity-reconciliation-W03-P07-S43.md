---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S43'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# Rewire the category color reads to literal-hex scene tokens resolvable by getComputedStyle

## Scope

- `frontend/src/scene/field/categoryColor.ts`

## Description

- Rewrote `categoryColor.ts` cleanly: the module owns ONLY the kind -> `--color-scene-category-<category>` token-name mapping, and routes every read through the shared `tokenReads` `cssColorNumber` seam (the one home for the getComputedStyle literal-hex-or-fallback discipline).
- Stated the literal-hex contract explicitly: the eight category tokens are emitted as flat `#rrggbb` per theme by the regenerated foundation token file, because getComputedStyle does not walk a var() chain for a custom property — so the token must never be a var() alias (themes-are-oklch).
- Preserved the eight-category type, the doc-type folding rules (reference->research, summary->index, rule->adr) and the unknown->code in-family fallback so no node ever renders uncoloured.
- Confirmed the light-theme fallback hex constants stay in lockstep with the `:root` / light `[data-theme]` `--color-scene-category-*` values in `styles.css`, which the categoryColor spot-check tests pin.

## Outcome

The category-colour read path is clean and faithfully wired to the literal-hex scene tokens resolvable by getComputedStyle. Scoped gate green: eslint exit 0, prettier --check clean, project tsc -b exit 0, and the categoryColor, token-read, and nodeSprites tests pass (25/25). Render-only; no compute, no LOD/ceiling change.

## Notes

Figma MCP read remained unreachable in this executor session; proceeded on the ADR fallback (the current scene as the faithful base). The fallback hex set matches the live token file values; if the regenerated foundation shifts a category hue, both `styles.css` and this fallback map (and the categoryColor + tokenReads tests) move together — that coupling is the literal-hex contract. Scope isolated; the aggregate frontend gate was not used as the green signal due to the concurrent scene agent's live WIP.
