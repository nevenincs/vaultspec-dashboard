---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:6211cf3b71b6e313fd4e44c19f2001bc9751c75d177ec994b97df7c951cc5d0e'
step_id: 'S36'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---

# Add an active-salience-lens view store (status default) distinct from the saved-filter-set lenses store, exposing the active lens and a setter

## Scope

- `frontend/src/stores/view/salienceLens.ts`

## Description

## Outcome

Added the active-salience-lens view store (salienceLens.ts): useSalienceLensStore holds the active lens (status default) and the DOI focus node, with setLens/setFocus setters. Distinct from the saved-filter-set lenses store (lenses.ts) and the canvas tier-dial lens. Ephemeral view state, not localStorage/session.

## Notes
