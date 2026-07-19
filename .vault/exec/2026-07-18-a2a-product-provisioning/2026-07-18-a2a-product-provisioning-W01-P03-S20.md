---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S20'
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
     The S20 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Own the lifecycle registry and controller inside AppState so tests and seated instances cannot share global mutation state and ## Scope

- `engine/crates/vaultspec-api/src/app.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Own the lifecycle registry and controller inside AppState so tests and seated instances cannot share global mutation state

## Scope

- `engine/crates/vaultspec-api/src/app.rs`

## Description

- Add a `a2a_lifecycle: Arc<LifecyclePlane>` field to `AppState` so the lifecycle
  registry and controller live inside per-instance state, never a process-global
  static.
- Refactor the state builders into a shared `build_state_full` and resolve the
  product app home (machine app home via `vaultspec_session::app_home::app_home_dir`,
  falling back to the engine's re-derivable data dir under the workspace).
- Add a `#[cfg(test)]` `build_state_with_product_home` so acceptance tests root
  the plane at an isolated tempdir rather than the real machine app home.

## Outcome

Each seated instance and each test gets its own lifecycle registry + controller;
no global mutation state is shared, satisfying the S20 isolation requirement.

## Notes

The product install is machine-global (the single-app-runtime app home), so the
plane roots there in production; the workspace-local engine-data fallback applies
only when no home variable is set. Test isolation uses the explicit-home builder.
