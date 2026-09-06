---
generated: true
tags:
  - '#index'
  - '#test-isolation-cleanup'
date: '2026-09-04'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:9acd3a11fda1bd5074b072c1d31171bd668a6a739a7d07d8e250e6453d617149'
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
  - '[[2026-09-04-test-isolation-cleanup-S12]]'
  - '[[2026-09-04-test-isolation-cleanup-S13]]'
  - '[[2026-09-04-test-isolation-cleanup-S14]]'
  - '[[2026-09-04-test-isolation-cleanup-adr]]'
  - '[[2026-09-04-test-isolation-cleanup-plan]]'
  - '[[2026-09-04-test-isolation-cleanup-research]]'
  - '[[2026-09-06-test-isolation-cleanup-s06-awaited-happydom-abort-review-audit]]'
  - '[[2026-09-06-test-isolation-cleanup-s07-happydom-abort-guard-review-audit]]'
  - '[[2026-09-06-test-isolation-cleanup-s08-unexpected-engine-exit-diagnostics-review-audit]]'
  - '[[2026-09-06-test-isolation-cleanup-s09-affected-suite-barrier-review-audit]]'
  - '[[2026-09-06-test-isolation-cleanup-s11-system-program-identity-review-audit]]'
  - '[[2026-09-06-test-isolation-cleanup-s12-per-test-abort-removal-review-audit]]'
  - '[[2026-09-06-test-isolation-cleanup-s13-per-test-window-lifecycle-guard-review-audit]]'
  - '[[2026-09-06-test-isolation-cleanup-s14-eight-file-prefix-diagnostic-review-audit]]'
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
- `2026-09-06-test-isolation-cleanup-s12-per-test-abort-removal-review-audit` - `test-isolation-cleanup` audit: `S12 per-test abort removal review`
- `2026-09-06-test-isolation-cleanup-s13-per-test-window-lifecycle-guard-review-audit` - `test-isolation-cleanup` audit: `S13 per-test window lifecycle guard review`
- `2026-09-06-test-isolation-cleanup-s14-eight-file-prefix-diagnostic-review-audit` - `test-isolation-cleanup` audit: `S14 eight-file prefix diagnostic review`

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
- `2026-09-04-test-isolation-cleanup-S12` - Remove the destructive per-test happy-dom abort path and its obsolete helper and guard while preserving RTL unmount and Vitest-owned file teardown
- `2026-09-04-test-isolation-cleanup-S13` - Add a cross-test lifecycle guard proving the harness never calls happy-dom abort between cases and demonstrate it red with the removed hook restored
- `2026-09-04-test-isolation-cleanup-S14` - Record the first exact eight-file prefix as a completed diagnostic enumeration even though the zero-diagnostic barrier is red, preserve its log, and route the attributed AgentPanel cluster plus smaller unassigned reset cluster to S15 without an unchanged rerun

### plan

- `2026-09-04-test-isolation-cleanup-plan` - `test-isolation-cleanup` plan

### research

- `2026-09-04-test-isolation-cleanup-research` - `test-isolation-cleanup` research: `why component teardown never runs, and what to do about it`
