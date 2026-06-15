---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S31'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# implement named lenses saved client-side and exposed to the command palette per G3.f and G5.d

## Scope

- `frontend/src/stores/view/lenses.ts`

## Description

- Add `frontend/src/stores/view/lenses.ts`: the lens store -
  `saveCurrent(name)` snapshots the live filter choices, `apply(name)`
  replaces them wholesale through the S28 model's `apply`, `remove`
  deletes, `all()` lists builtins plus saved for the command palette
  (S43).
- Persist client-side only (G5.d) with the same self-healing web-storage
  discipline as pins and positions; builtins never persist.
- Ship the spec's worked examples as builtin lenses: "broken links"
  (structural state = broken - the degradation matrix's queryable lens)
  and "high-confidence only" (0.7 floors on temporal and semantic).
- Add `frontend/src/stores/view/lenses.test.ts` covering persistence
  round-trip without builtins, corrupt-blob healing, snapshot/apply/remove,
  palette listing, and the show-broken builtin.

## Outcome

Filter sets are saveable, nameable, and palette-ready; the same lens names
will govern stage and timeline because both read the one filter model.
Phase W02.P07 (filter system) is complete. Gates green: typecheck, eslint,
vitest (148 passed), prettier.

## Notes

Lens save UI (a "save as lens…" affordance on the bar) rides the palette
work in S43 where the verb surface lives; the store API is complete now.

Revised per audit findings lens-scope-key-018 and broken-lens-isolation-019
(the consolidated P09/P10 revision): lens persistence is now keyed by
workspace + scope exactly like pins and positions (G5.d) - lens choices
embed scope-dependent vocabulary, so the original global key was a real
cross-scope bleed; `setScopeKey` re-keys on every scope change from the
same mode-independent effect as pins. The builtin "broken links" lens now
isolates to the structural tier filtered to broken - THE broken-links
view, not "everything plus a broken facet" - with both behaviors pinned by
tests.

