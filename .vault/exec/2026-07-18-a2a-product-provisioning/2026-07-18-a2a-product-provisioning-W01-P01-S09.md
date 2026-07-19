---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S09'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---




# Let dashboard bootstrap alone create and retain the ownership capability plus attach-control credential, permit the gateway to read attach-control for dashboard control and settlement callbacks, require the gateway to create a separate worker IPC credential used only between gateway and worker, and forbid aliases or secret-bearing discovery

## Scope

- `engine/crates/vaultspec-product/src/credentials.rs`

## Description

- Add `CredentialStore` in `credentials.rs` with three role-bound files
  (`CredentialRole`): the dashboard-created ownership capability and
  attach-control credential, and the gateway-created worker-IPC credential.
- Restrict creation by component: `bootstrap` (dashboard only) creates and
  retains ownership + attach-control and refuses if either already exists;
  `create_worker_ipc` (gateway only) mints the separate worker credential;
  `read_attach_control` lets the gateway read attach-control for control and
  settlement callbacks; `read_ownership` exposes the retained capability.
- Forbid aliasing (each role has a distinct secret and file) and secret-bearing
  discovery (`attach_control_reference` returns a file path, never the value);
  redact the secret in the `Debug` impl and compare with a length-stable check.
- Restrict every credential file to its owner via `restrict_to_owner` (Unix
  `0o600`; the Windows profile ACL is the control), and draw 256-bit secrets
  from OS entropy through independent `RandomState` instances folded via SHA-256,
  adding no dependency and no `unsafe`.

## Outcome

Bootstrap yields two distinct owner-retained secrets and refuses a second
create; the gateway reads attach-control and mints a separate worker-IPC secret
distinct from both; the discovery reference never contains a secret.

## Notes

The workspace's fixed dependency set carries no RNG crate and forbids `unsafe`,
so secret material is derived from the platform RNG that seeds `std`'s
`RandomState` — unguessable in practice for a loopback-local file-ACL threat
model.
