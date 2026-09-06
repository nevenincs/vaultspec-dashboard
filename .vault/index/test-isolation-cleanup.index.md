---
generated: true
tags:
  - '#index'
  - '#test-isolation-cleanup'
date: '2026-09-04'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:9893533173d2ac699149f5bf91994f218f76e717dba1ab2d64cb6b89bddbe67d'
related:
  - '[[2026-09-04-test-isolation-cleanup-S01]]'
  - '[[2026-09-04-test-isolation-cleanup-S02]]'
  - '[[2026-09-04-test-isolation-cleanup-S03]]'
  - '[[2026-09-04-test-isolation-cleanup-S04]]'
  - '[[2026-09-04-test-isolation-cleanup-S05]]'
  - '[[2026-09-04-test-isolation-cleanup-S06]]'
  - '[[2026-09-04-test-isolation-cleanup-adr]]'
  - '[[2026-09-04-test-isolation-cleanup-plan]]'
  - '[[2026-09-04-test-isolation-cleanup-research]]'
  - '[[2026-09-06-test-isolation-cleanup-s06-awaited-happydom-abort-review-audit]]'
---

# `test-isolation-cleanup` feature index

Auto-generated index of all documents tagged with `#test-isolation-cleanup`.

## Documents

### adr

- `2026-09-04-test-isolation-cleanup-adr` - `test-isolation-cleanup` adr: `an awaited global unmount and async-task barrier` | (**status:** `accepted`)

### audit

- `2026-09-06-test-isolation-cleanup-s06-awaited-happydom-abort-review-audit` - `test-isolation-cleanup` audit: `S06 awaited happy-dom abort review`

### exec

- `2026-09-04-test-isolation-cleanup-S01` - Add the global unmount barrier setup file and register it after the live-engine setup file
- `2026-09-04-test-isolation-cleanup-S02` - Add a guard suite that mounts in one case and asserts absence in the next, and validate it fails with the barrier removed
- `2026-09-04-test-isolation-cleanup-S03` - Run the full frontend suite with the barrier active and enumerate every newly failing suite
- `2026-09-04-test-isolation-cleanup-S04` - Triage each newly failing suite as a surfaced pre-existing defect: fix on merits or record with evidence
- `2026-09-04-test-isolation-cleanup-S05` - Re-run the full gate three times to confirm the barrier holds against the flake class it closes
- `2026-09-04-test-isolation-cleanup-S06` - Await native happy-dom abort directly, remove the fixed drain, and make serial worker configuration truthful

### plan

- `2026-09-04-test-isolation-cleanup-plan` - `test-isolation-cleanup` plan

### research

- `2026-09-04-test-isolation-cleanup-research` - `test-isolation-cleanup` research: `why component teardown never runs, and what to do about it`
