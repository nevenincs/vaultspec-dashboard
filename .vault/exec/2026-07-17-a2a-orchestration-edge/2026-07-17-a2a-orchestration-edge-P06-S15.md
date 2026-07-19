---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S15'
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
     The S15 and 2026-07-17-a2a-orchestration-edge-plan placeholders are machine-filled by
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
     The Add the engine-scoped active-run discovery verb with fixed two-result upstream bound, optional bounded feature filter, and real-loopback contract coverage and ## Scope

- `engine/crates/vaultspec-api/src/routes/ops/a2a.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the engine-scoped active-run discovery verb with fixed two-result upstream bound, optional bounded feature filter, and real-loopback contract coverage

## Scope

- `engine/crates/vaultspec-api/src/routes/ops/a2a.rs`

## Description

- Amend the accepted edge decision and implementation reference with the bounded active-run discovery contract.
- Add `active-runs` to the fixed engine whitelist and inject the active scope root into sibling discovery.
- Validate the optional feature tag and pin the upstream result limit to two.
- Exercise the exact query target and verbatim sibling response through a real loopback socket.

## Outcome

The engine now brokers one read-only active-run discovery operation without accepting a browser-controlled workspace path. Focused Rust coverage passed 29 tests, including the real loopback contract.

## Notes

The first compile exceeded the command wrapper's two-minute limit; the cached rerun completed successfully. Existing test diagnostics about temporary workspaces lacking `.vaultspec` remained non-failing and unrelated.
