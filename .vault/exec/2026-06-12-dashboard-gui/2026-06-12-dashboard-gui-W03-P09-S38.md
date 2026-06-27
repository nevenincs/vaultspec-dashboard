---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S38'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---

# build the vault-scoped read-only file browser over the vault-tree endpoint with doc-type glyphs and freshness per G2.c

## Scope

- `frontend/src/app/left/VaultBrowser.tsx`

## Description

- Add `frontend/src/app/left/VaultBrowser.tsx`: a read-only tree over the
  vault-tree endpoint, grouped by the canonical `.vault/` subtree order
  (research, adr, plan, exec, audit, reference, index; unknown groups
  append rather than drop), groups collapsible.
- Each entry shows its doc-type glyph (distinct interim set with a
  fallback), display stem, first feature tag, and a compact freshness
  label (now/h/d/w buckets cooling to silence) - all pure, tested helpers.
- Expose `onEntryClick` and `highlightedPath` props as the S39 selection
  seam; mount the browser in the left rail under the picker.
- Add `frontend/src/app/left/VaultBrowser.test.ts` covering grouping
  order, unknown-group retention, glyph distinctness, freshness buckets,
  and stem derivation.

## Outcome

The boring, reliable entry path for users who think in files renders the
scoped corpus per G2.c; read-only by design (the v1 scope boundary). Gates
green: typecheck, eslint, vitest (177 passed), prettier.

## Notes

Browser glyphs are interim text marks; the commissioned family (G7.c,
frontend/design/glyphs convention agreed) supplies the real ones via the
same swap discipline as the stage.

Per audit finding 025, declared deliberately: the browser stays
LIVE-oriented during time travel - it is the filesystem entry path over
the present working tree (the vault-tree endpoint has no as-of parameter
in the contract), while the stage renders T. If a historical tree ever
becomes a contract capability, reconciliation is a new step, not a silent
change here.
