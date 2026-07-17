---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S04'
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
     The S04 and 2026-07-17-a2a-orchestration-edge-plan placeholders are machine-filled by
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
     The Provision per-role actors and engine-minted tokens at run-start and inject the ActorTokenBundle into the forwarded payload, never logging token values and ## Scope

- `engine/crates/vaultspec-api/src/routes/ops/`
- `engine/crates/vaultspec-api/src/authoring/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Provision per-role actors and engine-minted tokens at run-start and inject the ActorTokenBundle into the forwarded payload, never logging token values

## Scope

- `engine/crates/vaultspec-api/src/routes/ops/`
- `engine/crates/vaultspec-api/src/authoring/`

## Description

- Provision per-role actors and mint engine-side `ActorTokenBundle` tokens at run-start, inside the `ops_a2a` verb dispatch for the run-start verb specifically.
- Inject the minted token bundle into the forwarded payload before it crosses to the a2a gateway, so the gateway receives engine-issued credentials rather than trusting a caller-supplied identity.
- Never log token values at any point on the forward path (request build, response handling, or error paths) — token material stays out of every log level.

## Outcome

Landed at commit `fd7069cb01` alongside S03/S05, in the same `a2a.rs` module. `cargo test -p vaultspec-api routes::ops` — 63 passed, 0 failed (opus-edge's verification).

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
