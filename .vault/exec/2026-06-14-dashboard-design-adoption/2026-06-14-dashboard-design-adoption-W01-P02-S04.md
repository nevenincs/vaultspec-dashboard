---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S04'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

# Wire Tailwind v4 @theme static for the color namespace so every color token emits to :root even when not class-referenced (the scene getComputedStyle requirement)

## Scope

- `frontend/src/styles.css`

## Description

- Wire the Tailwind v4 `@theme static` block for the color namespace so every color token is emitted to :root unconditionally, even when no utility class references it.
- Confirm via a production build that the scene-read tokens land on the root selector as literal hex, satisfying the getComputedStyle requirement that the scene depends on.

## Outcome

`@theme static` carries the whole token architecture (primitives, semantic tier, public surface). The build output confirms color tokens emit to root even when unreferenced, which is the mechanical precondition for the scene reading them.

## Notes

`static` (not the default) is required: the default `@theme` tree-shakes unreferenced tokens, which would drop the scene-only tokens the chrome never class-references.
