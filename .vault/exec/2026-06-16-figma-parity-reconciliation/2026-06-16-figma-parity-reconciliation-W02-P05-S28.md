---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-07-12'
step_id: 'S28'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# Rebuild the right rail tab bar to the binding Inspect Work Search Changes IA with the liveness pillars promoted to a persistent header

## Scope

- `frontend/src/app/right/RailTabs.tsx`

## Description

- Rebuild the segmented activity-rail tab bar onto the new Figma role-named token
  foundation, binding to the ActivityRail Kit primitive treatment (Figma node
  244:753 in the RightRail frame 17:563).
- Migrate the segmented track from the legacy radius scale to the canonical Figma
  radius (`rounded-fg-md`), and the active pill to `rounded-fg-xs`.
- Replace the retired six-level brand elevation on the active pill with the
  three-level Figma raised elevation (`shadow-fg-raised`).
- Keep the tab type on the `label` role and the structural Lucide tab marks
  unchanged (sanctioned-icon families), preserving the roving-tablist a11y.

## Outcome

The tab bar is a pure-chrome dumb projection that fetches nothing and reads no
tiers block; it renders on the canonical foundation utilities only and flips the
host-owned active-tab id. The persistent NowStrip liveness header lives in the
rail host composition above this bar, so the persistent-header requirement is met
at the host. The tab-id identity contract is held stable so the host (which owns
the tab-to-pane mapping) keeps typechecking across the scope boundary.

## Notes

The binding-design IA rename to Inspect | Work | Search | Changes is the
activity-rail-ADR supersession governed by a later reconciliation step and the
paired host rewire; renaming the id union in this leaf bar alone would break the
host's typecheck and the rail IA test, both outside this Step's scope fence. S28
rebuilds the visual treatment onto the foundation and holds the id contract; the
IA rename lands with its host rewire. The aggregate frontend gate is currently
red on unrelated, uncommitted scene-layer WIP from a concurrent builder (a
prettier-dirty and a missing-module tsc error under the scene field directory);
the scoped files here pass eslint, prettier, and tsc cleanly.
