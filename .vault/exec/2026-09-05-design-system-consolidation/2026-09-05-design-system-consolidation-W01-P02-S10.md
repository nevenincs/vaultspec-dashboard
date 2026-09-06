---
tags:
  - '#exec'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:b463db8d25fc7aa0cb873cb8bfc35d71ecdab248b0f9e30720381877dad7b719'
step_id: 'S10'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
---

# Include the scanner in the complete frontend lint recipe

## Scope

- `dev/toolchain.py`

## Changes

- `M` `dev/toolchain.py`
- `verify:` `python -m py_compile dev/toolchain.py` -> `pass`
- `verify:` `uv run --no-sync pytest dev/guards -q` -> `pass`
- `verify:` `node frontend/dev/tooling/fixtures/design-system/run-fixtures.mjs` -> `pass`
- `verify:` `npx vitest run dev/tooling/scan-design-system.test.ts --config vite.config.ts` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent Sol review -> `pass`
