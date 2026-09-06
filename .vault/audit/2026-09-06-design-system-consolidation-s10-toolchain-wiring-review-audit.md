---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:644f22d1b11954027f47a92bc1ea71c7061b8c7fd462b657d208e3d7c9838698'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
---

# `design-system-consolidation` audit: `s10 toolchain wiring review`

## Scope

Independent review of the `dev/toolchain.py` change for `W01.P02.S10` against
the accepted plan, the dev-workflow rule, and the package script registered in
S09. The review checks declarative-source ownership, exact command order,
single-invocation semantics, visible execution through `just lint frontend`,
and the boundary that reserves permanent removal guards for S11. The Justfile,
production sources, and scene sources are outside this change scope.

## Findings

### s10-toolchain-wiring | low | The complete frontend recipe invokes the scanner exactly once in order

No corrective finding surfaced. The only S10 diff adds `npm("lint:design-system")` to the declarative `LINT.targets["frontend"]` step tuple immediately after `lint:modules` and before `format:check`. It delegates command ownership to the S09 package script, introduces no duplicate or hand-written scanner argv, and leaves the Justfile unchanged. No S11 removal guard is implemented early, and no production or scene source change belongs to this step.

Independent Python compilation passed. `uv run --no-sync pytest dev/guards -q` passed 121 tests. Independent `just lint frontend` visibly invoked `lint:design-system` exactly once in the required position, reported the clean 125/100+6/12+1 scanner baseline, and exited 0 through the complete recipe. `git diff --check` also passed; the established fixture 19/19 and focused scanner 6/6 evidence remains valid.

## Recommendations

- S11 should guard this declarative step and the production-to-development import fence without duplicating execution logic or relocating command ownership from `frontend/package.json`.

Status: PASS.
