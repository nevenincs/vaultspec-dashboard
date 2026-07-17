---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S08'
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
     The S08 and 2026-07-17-a2a-orchestration-edge-plan placeholders are machine-filled by
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
     The Prove the relay live end to end including replay from since, gap emission on eviction and lag, and the oversized-frame drop sentinel passing through unaltered and ## Scope

- `engine/crates/vaultspec-api/src/routes/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Prove the relay live end to end including replay from since, gap emission on eviction and lag, and the oversized-frame drop sentinel passing through unaltered

## Scope

- `engine/crates/vaultspec-api/src/routes/`

## Description

- Add a live loopback test standing up a real (test-harness) upstream socket and a `BufReader`-driven pump into a real `RunRelay`, exercising the relay end to end rather than mocking the upstream — per the project's mock-free test-integrity mandate.
- Prove replay-from-`since` against the relay's ring, matching the since-replay contract shared by the engine's other SSE channels.
- Prove gap emission on ring eviction and consumer lag, so a lagging or reconnecting client observes an honest gap marker rather than silently missing frames.
- Prove the oversized-frame drop sentinel (the a2a `sse_frames` 256 KiB frame-cap signal) passes through the relay unaltered, confirming the relay's own `MAX_RELAY_FRAME_BYTES = 512 * 1024` safety net sits strictly above the upstream's own cap and never mangles the sentinel it is meant to pass through.

## Outcome

Landed at commit `fd7069cb01` alongside S07, tests colocated in `a2a_stream.rs` under `#[cfg(test)] mod tests`. `cargo test -p vaultspec-api routes::ops` — 63 passed, 0 failed (opus-edge's verification).

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
