---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S05'
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
     The S05 and 2026-07-17-a2a-orchestration-edge-plan placeholders are machine-filled by
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
     The Write guard tests mirroring the rag ops suite plus a live loopback test against a real a2a gateway covering whitelist miss, degraded sibling, crash, and verbatim envelope pass-through and ## Scope

- `engine/crates/vaultspec-api/src/routes/ops/tests.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Write guard tests mirroring the rag ops suite plus a live loopback test against a real a2a gateway covering whitelist miss, degraded sibling, crash, and verbatim envelope pass-through

## Scope

- `engine/crates/vaultspec-api/src/routes/ops/tests.rs`

## Description

- Mirror the shipped rag ops guard suite's shape for the a2a pass-through: whitelist-miss rejection, degraded-sibling 200, crash/timeout escalation, and verbatim envelope pass-through, each proven as a distinct test case.
- Add a live loopback test standing up a real (test-harness) a2a gateway rather than mocking the sibling, per the project's mock-free test-integrity mandate.
- Cover the token-bundle injection path from S04 (bundle present in the forwarded payload, absent from any captured log output).

## Outcome

Landed at commit `fd7069cb01` alongside S03/S04, in `routes/ops/a2a.rs` (guard tests colocated with the module rather than a separate `tests.rs`, matching the module's own convention). `cargo test -p vaultspec-api routes::ops` — 63 passed, 0 failed (opus-edge's verification; ops re-checked the crate compiled clean including this module before staging the commit).

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
