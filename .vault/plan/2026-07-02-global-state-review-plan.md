---
tags:
  - '#plan'
  - '#global-state-review'
date: '2026-07-02'
modified: '2026-07-02'
tier: L2
related:
  - '[[2026-07-02-global-state-review-audit]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

# `global-state-review` plan

### Phase `P01` - Reveal-selection scroll reactions

Add stores-owned reveal-selection scroll reactions so a non-scene-originated selection scrolls the rail row and the timeline into view.

- [x] `P01.S01` - GS-003: reveal the selected document's rail row on external (non-canvas) selection via a stores-owned reveal signal plus TreeBrowser scrollIntoView, gated on the frame flag, timeline half dropped (strip torn down, Issue #14); `frontend/src/stores/view/ + frontend/src/app/left/ + frontend/src/app/timeline/`.

### Phase `P02` - Ghost-emphasis mask gating

Gate the scene ring pass and emitAnchors on the visibleNodeIds mask so a filtered-out node shows no ghost ring or floating anchor.

- [x] `P02.S02` - GS-004: gate the scene ring pass and emitAnchors on the visibleNodeIds mask so a filtered-out node shows no ghost ring or floating anchor; `frontend/src/scene/three/threeField.ts`.
- [x] `P02.S04` - GS-006: dim/hint filter-hidden working-set chips, the chip trail is DOM chrome so GS-004's anchor gating doesn't reach it, gate on the same visibility mask; `frontend working-set chip component`.
- [ ] `P02.S05` - GS-007: pre-existing INTERMITTENT flake, VaultBrowser.render.test.tsx intermittently aborts (AbortError on patchDashboardState / waitFor timeout) under the shared-engine test harness, confirmed independent of GS-003/GS-006 (flakes with OR without our files), test-infra, needs a robustness fix (assertion/timeout hardening or per-file engine-state reset), deferred to test-infra; `frontend/src/app/left/VaultBrowser.render.test.tsx`.

### Phase `P03` - Mask-mode affordance retention decision

Decide whether to keep mask-mode affordance retention now that GS-004 anchor gating covers it, or prune the affordances that are visibly dead in mask mode.

- [x] `P03.S03` - GS-005: RESOLVED, keep mask-mode affordance retention (state and presentation stay decoupled, GS-004's anchor gating already hides the ghost, pruning would make a transient filter destructive of session state), decision documented in the audit; `frontend/src/stores/view/graphAffordances.ts`.

## Description

Remediation of the global-state-review audit (GS-003/GS-004 actionable; GS-005 a deliberate decision; GS-001/GS-002 verified sound). Reaction-layer only - the data path and state model were found correct and are unchanged.

## Steps







## Parallelization


## Verification
