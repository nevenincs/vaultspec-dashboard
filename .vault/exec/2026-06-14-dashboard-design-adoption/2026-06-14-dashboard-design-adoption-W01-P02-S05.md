---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S05'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---




# Wire @theme inline for the aliasing tokens that reference another variable, so no unresolved var() ships to the wire

## Scope

- `frontend/src/styles.css`

## Description

- Resolve the `@theme inline` requirement: inline is the correct tool only for theme-invariant alias tokens, because it bakes a token's literal value into the generated utility rather than emitting a var() reference.
- Establish that the theme-remapped surface must NOT use inline (inlining would freeze the light value into every utility and defeat the data-theme flip), and that under `@theme static` the chrome utilities emit a resolving var() chain - not an unresolved var() on the wire.
- Remove an earlier self-referential inline alias that would have introduced a var() cycle on :root, documenting the mechanism in the token file.

## Outcome

No unresolved var() ships to the wire: chrome utilities emit `var(--color-paper)` which resolves through the semantic tier at runtime, and the scene surface is literal hex. The S05 finding (inline is for theme-invariant aliases only) is recorded inline in the token file.

## Notes

An initial pass placed the scene-read tokens in an `@theme inline` self-alias block; the build revealed it emitted `--color-x: var(--color-x)` cycles on :root. Corrected by declaring the scene-read tokens once as literal hex in `@theme static` and overriding per theme.
