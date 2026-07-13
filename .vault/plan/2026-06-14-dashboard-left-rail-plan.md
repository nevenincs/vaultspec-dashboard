---
tags:
  - '#plan'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-06-14-dashboard-left-rail-adr]]'
  - '[[2026-06-14-dashboard-left-rail-research]]'
---

# `dashboard-left-rail` plan

### Phase `P01` - Rail composition frame

Refactor the left aside into the ordered hosted-slot stack (workspace switcher then worktree switcher then browser region then in-rail filter), separated by soft 1px rules, preserving the collapse model and the single top-to-bottom focus order and applying attenuated-chrome tokens. EXECUTE THIS PLAN LAST: it hosts the workspace switcher and code mode the other two features build, and edits the same shared files.

- [x] `P01.S01` - Refactor the left aside into the ordered hosted-slot stack separated by soft 1px rules; `frontend/src/app/AppShell.tsx`.
- [x] `P01.S02` - Preserve the collapse model and the single top-to-bottom focus order across the slots; `frontend/src/app/AppShell.tsx`.
- [x] `P01.S03` - Apply attenuated-chrome tokens so the rail cedes attention to the stage; `frontend/src/app/AppShell.tsx`.

### Phase `P02` - Browser mode toggle

Give the browser region two modes, vault (existing) and code (the code-tree feature's code mode), behind a compact keyboard-reachable toggle defaulting to vault; the chosen mode is view-local state re-keyed per scope and wired into the wholesale reset so it does not bleed across a swap.

- [x] `P02.S04` - Add a compact keyboard-reachable vault/code mode toggle to the browser region defaulting to vault; `frontend/src/app/left/`.
- [x] `P02.S05` - Render the vault browser and the code-tree code mode behind the toggle; `frontend/src/app/left/`.
- [x] `P02.S06` - Re-key the chosen mode per scope and wire it into the wholesale reset; `frontend/src/stores/view/`.

### Phase `P03` - In-rail filter

Add an optional filter affordance scoped to the active browser mode that narrows the already-fetched listing client-side by name, stem, or tag; it issues no wire request, clears on scope swap, and is visibly distinct from the global right-rail search pillar.

- [x] `P03.S07` - Add an in-rail filter scoped to the active browser mode that narrows the already-fetched listing client-side; `frontend/src/app/left/`.
- [x] `P03.S08` - Issue no wire request from the filter and clear it on scope swap; `frontend/src/app/left/`.
- [x] `P03.S09` - Make the filter visibly distinct from the global right-rail search pillar; `frontend/src/app/left/`.

### Phase `P04` - Read-only law, states, and a11y

Enforce the single rail navigation law (every interaction emits only scope-select, node-select, or view-affordance intent through stores; no fetch, no node-shape minting, no raw tiers read, no git/disk/vault mutation affordance), keep the git status badge read-only, render the uniform four honest states, and establish the rail-wide keyboard contract, labelled landmark, and reduced-motion behaviour.

- [x] `P04.S10` - Enforce that every rail interaction emits only scope-select, node-select, or view-affordance intent through stores; `frontend/src/app/left/`.
- [x] `P04.S11` - Keep the inline git status badge read-only with no mutation affordance anywhere in the rail; `frontend/src/app/left/WorktreePicker.tsx`.
- [x] `P04.S12` - Render the uniform four honest states across rail surfaces; `frontend/src/app/left/`.
- [x] `P04.S13` - Establish the rail-wide keyboard contract, labelled landmark, and reduced-motion and keyboard-instant behaviour; `frontend/src/app/AppShell.tsx`.

### Phase `P05` - Verification

Verify: the ordered rail stack renders with collapse and focus order, per-scope mode and filter reset with no cross-scope bleed, the read-only law has no escape hatch, and the feature-scoped lint, test, and vault-check gates pass.

- [x] `P05.S14` - Test that the ordered rail stack renders with collapse and focus order; `frontend/src/app/`.
- [x] `P05.S15` - Prove per-scope mode and filter reset with no cross-scope bleed; `frontend/src/stores/__adversarial__/`.
- [x] `P05.S16` - Prove the read-only law has no fetch or mutation escape hatch in the rail; `frontend/src/app/left/`.
- [x] `P05.S17` - Run the feature-scoped lint, test, and vault-check gates to green; `frontend/src/app/`.

## Description

## Steps

## Parallelization

## Verification
