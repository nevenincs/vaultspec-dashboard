---
tags:
  - '#exec'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S07'
related:
  - "[[2026-07-12-on-demand-cold-start-plan]]"
---

# Add the instant pre-hydration boot shell: an inline-styled static skeleton in index.html painting before any bundle downloads, retired on AppShell's first commit with a main.tsx backstop

## Scope

- `frontend/index.html + frontend/src/main.tsx + frontend/src/app/AppShell.tsx`

## Description

Add the pre-hydration boot shell: inline-styled static skeleton in index.html (theme-aware via prefers-color-scheme, reduced-motion safe, literal values mirroring the paper/ink/accent tokens - the sanctioned pre-token pattern), retired by AppShell's first-commit effect with a 10s main.tsx backstop for non-AppShell surfaces.

## Outcome

Live-verified: shell paints at ~50ms (before any bundle), hands off to real chrome at app commit with no blank frame.

## Notes
