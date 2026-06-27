---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S42'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# Rewrite the node sprites as category-colored circles faithful to the binding Node-items frame

## Scope

- `frontend/src/scene/field/nodeSprites.ts`

## Description

- Rewrote `nodeSprites.ts` cleanly and faithfully to the binding graph/Node-items 83:2 frame: a plain category-coloured filled circle sized by the engine-served salience, with a clean meta-size label below and exactly three states (default / selected accent ring / filtered-out fade).
- Made the DEFAULT state read crisp at full opacity per the binding frame: the node-body alpha is now driven only by the three-state model (default 1, selected 1, filtered-out fade), the ego recede, and the circle-level ghost floor — freshness no longer dims the default disc, which had muddied the clean instrument register.
- Retained `freshnessAlpha` as a pure exported helper for off-canvas recency consumers, with the documentation stating it is no longer applied to the disc.
- Preserved the single surviving on-canvas status treatment (circle-level ghost desaturation + dim for retired/archived/superseded nodes) via a small `ghostFloor` helper, and kept the full status data flowing off-canvas to the hover-card/inspector unchanged.
- Preserved the entire exported API contract (nodeRadius, labelPriority, ambientLabelFloor, bodyColor, selectedRingColor, selectedRingRadius, stateColor, tierBadgeText, progressFraction, lodFor, the constants, the GlyphTextureProvider seam, and NodeSpriteLayer with its method signatures) so every consumer and test binds unchanged.
- Documented the layer as receiving its node set only through the frozen SceneController command path (set-data / set-selected / set-visibility) and emitting nothing — selection/hover flow back through the controller event channel elsewhere.

## Outcome

The node sprite layer is a clean, faithful translation of the binding Node-items frame on the frozen contract. Scoped gate green: eslint exit 0, prettier --check clean, project tsc -b exit 0, and the nodeSprites unit + draw tests, salience-encoding, token-read, and field-assembly tests all pass (49/49). Render-only; the category-circle + salience + three-state treatment carries no graph compute and no LOD/ceiling change.

## Notes

The freshness-on-default-body dimming was deliberately removed as a fidelity correction: the binding Node-items frame shows the default node as a crisp full-opacity category circle, and a per-age dim on the disc competed with the three-state model and the clean register. The recency signal survives as the pure `freshnessAlpha` helper for any off-canvas consumer. No test asserted the default-body freshness alpha, so the change is regression-free against the suite.

Figma MCP read remained unreachable in this executor session; proceeded on the ADR fallback (the current scene as the faithful base). Scope isolated and confirmed clean; the aggregate frontend gate was not used as the green signal due to the concurrent scene agent's live WIP.
