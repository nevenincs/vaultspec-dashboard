---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S20'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---

# Yield the compact reader edge-swipe recognizer while a text selection is active

## Scope

- `frontend/src/app/shell/CompactDocReader.tsx`

## Description

- Add `hasLiveSelection` and yield the edge-swipe-back gesture in `CompactDocReader`: pointer-down never arms over a live selection, and a long-press selection that begins mid-gesture disarms the swipe

## Outcome

Prose selection owns the reader surface per ADR D3; vertical-scroll yield behaviour is unchanged and the shell suite passes.

## Notes
