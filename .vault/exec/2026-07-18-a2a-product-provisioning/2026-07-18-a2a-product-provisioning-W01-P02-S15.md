---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S15'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-product-provisioning with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S15 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Spawn only the manifest-declared gateway entrypoint and contain the owned process tree through bounded graceful and forced cleanup and ## Scope

- `engine/crates/vaultspec-product/src/process.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Spawn only the manifest-declared gateway entrypoint and contain the owned process tree through bounded graceful and forced cleanup

## Scope

- `engine/crates/vaultspec-product/src/process.rs`

## Description

- Add `process.rs` with `GatewaySpec::from_manifest`, which resolves the launch
  program ONLY from the capsule manifest's declared gateway `relative_command`
  under the capsule root, validating each segment against traversal/separators.
- Add `spawn_gateway` and `GatewayProcess` containing the owned tree: on Unix via
  a safe `process_group(0)` leader plus `killpg` SIGTERM-then-SIGKILL; on Windows
  via a `command-group` job object terminated after a graceful window.
- Implement bounded `terminate_tree(graceful)` that gives the tree the graceful
  window to exit, then force-kills and reaps, reporting whether force was needed.

## Outcome

A real spawned gateway and its real grandchild are both terminated by
`terminate_tree` with no orphan; `from_manifest` builds the exact declared path
and refuses a traversal segment.

## Notes

The workspace forbids `unsafe`, so Unix process-group creation uses the safe
`CommandExt::process_group(0)` (not a `pre_exec` `setsid`); Windows subtree kill
uses the `command-group` job object, the reason that dependency is declared.
Graceful termination on Windows has no POSIX signal, so it degrades to a
graceful-window wait then a forced job terminate.
