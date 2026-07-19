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
