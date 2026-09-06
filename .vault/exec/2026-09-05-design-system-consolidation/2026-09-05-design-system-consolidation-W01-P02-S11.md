---
tags:
  - '#exec'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:db24f3c48210cda22c7bf21001f3c9420fb54f788928faeaf75cce5b3a16d11a'
step_id: 'S11'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
---

# Guard the lint recipe and production-to-development import fence against accidental removal of the new check

## Scope

- `dev/guards/test_design_system_consolidation.py`

## Changes

- `A` `dev/guards/test_design_system_consolidation.py`
- `verify:` `python -m py_compile dev/guards/test_design_system_consolidation.py` -> `pass`
- `verify:` `uv run --no-sync pytest dev/guards/test_design_system_consolidation.py -q` -> `pass`
- `verify:` `uv run --no-sync pytest dev/guards -q` -> `pass`
- `verify:` `node dev/tooling/fixtures/design-system/run-fixtures.mjs` -> `pass`
- `verify:` `npx vitest run dev/tooling/scan-design-system.test.ts --config vite.config.ts` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` independent Sol review -> `pass`
