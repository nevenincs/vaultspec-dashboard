---
generated: true
tags:
  - '#index'
  - '#test-isolation-cleanup'
date: '2026-09-04'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:1ae00b5585dc8a58f7230469e04a3efa41fb514efb1ae62556e48c9d28bf4d60'
related:
  - '[[2026-09-04-test-isolation-cleanup-S01]]'
  - '[[2026-09-04-test-isolation-cleanup-S02]]'
  - '[[2026-09-04-test-isolation-cleanup-S03]]'
  - '[[2026-09-04-test-isolation-cleanup-S04]]'
  - '[[2026-09-04-test-isolation-cleanup-S05]]'
  - '[[2026-09-04-test-isolation-cleanup-S06]]'
  - '[[2026-09-04-test-isolation-cleanup-S07]]'
  - '[[2026-09-04-test-isolation-cleanup-S08]]'
  - '[[2026-09-04-test-isolation-cleanup-S09]]'
  - '[[2026-09-04-test-isolation-cleanup-S11]]'
  - '[[2026-09-04-test-isolation-cleanup-adr]]'
  - '[[2026-09-04-test-isolation-cleanup-plan]]'
  - '[[2026-09-04-test-isolation-cleanup-research]]'
  - '[[2026-09-06-test-isolation-cleanup-s06-awaited-happydom-abort-review-audit]]'
  - '[[2026-09-06-test-isolation-cleanup-s07-happydom-abort-guard-review-audit]]'
  - '[[2026-09-06-test-isolation-cleanup-s08-unexpected-engine-exit-diagnostics-review-audit]]'
  - '[[2026-09-06-test-isolation-cleanup-s09-affected-suite-barrier-review-audit]]'
  - '[[2026-09-06-test-isolation-cleanup-s11-system-program-identity-review-audit]]'
---

# `test-isolation-cleanup` feature index

Auto-generated index of all documents tagged with `#test-isolation-cleanup`.

## Documents

### adr

- `2026-09-04-test-isolation-cleanup-adr` - `test-isolation-cleanup` adr: `a global unmount barrier with runner-owned window teardown` | (**status:** `accepted`)

### audit

- `2026-09-06-test-isolation-cleanup-s06-awaited-happydom-abort-review-audit` - `test-isolation-cleanup` audit: `S06 awaited happy-dom abort review`
- `2026-09-06-test-isolation-cleanup-s07-happydom-abort-guard-review-audit` - `test-isolation-cleanup` audit: `S07 happy-dom abort guard review`
- `2026-09-06-test-isolation-cleanup-s08-unexpected-engine-exit-diagnostics-review-audit` - `test-isolation-cleanup` audit: `S08 unexpected engine exit diagnostics review`
- `2026-09-06-test-isolation-cleanup-s09-affected-suite-barrier-review-audit` - `test-isolation-cleanup` audit: `S09 affected suite barrier review`
- `2026-09-06-test-isolation-cleanup-s11-system-program-identity-review-audit` - `test-isolation-cleanup` audit: `S11 system program identity review`

### exec

- `2026-09-04-test-isolation-cleanup-S01` - Add the global unmount barrier setup file and register it after the live-engine setup file
- `2026-09-04-test-isolation-cleanup-S02` - Add a guard suite that mounts in one case and asserts absence in the next, and validate it fails with the barrier removed
- `2026-09-04-test-isolation-cleanup-S03` - Run the full frontend suite with the barrier active and enumerate every newly failing suite
- `2026-09-04-test-isolation-cleanup-S04` - Triage each newly failing suite as a surfaced pre-existing defect: fix on merits or record with evidence
- `2026-09-04-test-isolation-cleanup-S05` - Re-run the full gate three times to confirm the barrier holds against the flake class it closes
- `2026-09-04-test-isolation-cleanup-S06` - Await native happy-dom abort directly, remove the fixed drain, and make serial worker configuration truthful
- `2026-09-04-test-isolation-cleanup-S07` - Add an awaited-abort and no-timer guard, and prove it fails both when awaiting is removed and when a fixed drain returns
- `2026-09-04-test-isolation-cleanup-S08` - Add bounded unexpected-engine-exit diagnostics without retries or behavior changes
- `2026-09-04-test-isolation-cleanup-S09` - Run frontend/src/app/left/AddProjectDialog.localization.test.tsx, frontend/src/app/left/CreateDocDialog.render.test.tsx, frontend/src/stores/server/comments.live.test.ts, frontend/src/stores/server/systemPrograms.live.test.ts, frontend/src/stores/server/queries/docmeta.test.ts, both barrier guards, and full frontend lint
- `2026-09-04-test-isolation-cleanup-S11` - Correct the live system-program adapter test for running, crashed, and absent identity states

### plan

- `2026-09-04-test-isolation-cleanup-plan` - `test-isolation-cleanup` plan

### research

- `2026-09-04-test-isolation-cleanup-research` - `test-isolation-cleanup` research: `why component teardown never runs, and what to do about it`
