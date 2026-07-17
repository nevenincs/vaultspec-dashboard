---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S101'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Run the source guard across every production and auxiliary frontend entry point and repair all findings

## Scope

- `frontend/src/`
- `frontend/index.html`
- `frontend/vite.config.ts`

## Description

- `scan-localization.mjs` run over the full `src/` tree: 0 findings.
- `index.html`, the ONLY production entry point (per `vite.config.ts`'s
  `rollupOptions.input`, gated on `command === "build"`), read directly: carries
  no user-facing literal beyond the `<title>vaultspec dashboard</title>`
  product-name (exempt), plus a boot-shell pre-hydration spinner that is
  `aria-hidden` and carries no text at all.
- The six auxiliary HTML pages (`filters.html`, `graph.html`, `reader.html`,
  `spike.html`, `status.html`, `three.html`) are confirmed dev-only: `vite.config.ts`
  only wires `index.html` into the production rollup input; the others are
  reachable only under the Vite dev server, never shipped. This exclusion was
  already ruled and dossier-noted (Codification candidates, "explicitly NOT a
  codification candidate").

## Outcome

Every production and auxiliary frontend entry point has been swept; there are no
findings to repair. The scanner is clean over the whole `src/` tree, the sole
production HTML entry is clean, and the auxiliary pages are confirmed
production-excluded so they were never in scope to begin with.

## Notes

This record was authored during a fill pass reconciling the P18 sweep results
reported by the team lead — no code changes by me.

Independently reverified, not relayed: ran `scan-localization.mjs` myself
(clean); read `index.html` directly rather than trusting a summary; read
`vite.config.ts`'s `rollupOptions.input` directly to confirm the production/
dev-only entry-point split rather than assuming it.
