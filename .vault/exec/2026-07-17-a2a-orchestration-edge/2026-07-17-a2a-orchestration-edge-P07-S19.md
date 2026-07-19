---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S19'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-orchestration-edge with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S19 and 2026-07-17-a2a-orchestration-edge-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Enforce pre-allocation HTTP and SSE byte ceilings, byte-budget replay storage, and restartable relay lifecycle with adversarial socket and churn coverage and ## Scope

- `engine/crates/vaultspec-api/src/routes/ops/a2a_stream.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Enforce pre-allocation HTTP and SSE byte ceilings, byte-budget replay storage, and restartable relay lifecycle with adversarial socket and churn coverage

## Scope

- `engine/crates/vaultspec-api/src/routes/ops/a2a_stream.rs`

## Description

- Reject oversized status lines, header lines, aggregate heads, chunk declarations, and chunks before proportional allocation.
- Bound incremental SSE accumulation, drain oversized frames to the next delimiter, and cap dense per-push output with an explicit drop signal.
- Store one serialized immutable frame behind shared ownership and enforce 4 MiB replay, 8 MiB per-relay, and 64 MiB global retained-byte ceilings.
- Materialize replay lazily and retain count caps as defense in depth.
- Track producer ownership explicitly, remove every unsubscribed producerless tombstone, and restart a producer when a reconnect wins the exit race.
- Remove engine-side degraded status polling so the browser remains the sole authoritative poll owner.
- Split relay tests into a submodule so every source file remains below the 1,500-line gate.

## Outcome

Relay memory and parser behavior are now bounded before allocation, viewer churn cannot poison the 64-slot registry, and degraded operation performs one browser-owned status poll path. The focused Rust relay suite passed 24 of 24; frontend stream and recovery verification is included in the 65-test focused P07 pass. Module-size, formatting, and diff checks passed.

## Notes

The first hardening pass still allowed one 512 KiB chunk containing many tiny frames to allocate tens of thousands of parsed objects before delivery. The adversarial follow-up caps each push at 256 outputs, reserves the final slot for `progress_dropped`, drains overflow without parsing it, and proves framing recovers on the next push.
