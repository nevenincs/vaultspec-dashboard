---
tags:
  - '#exec'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-06-26'
step_id: 'S07'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# Extend the rag verb whitelist to forward bounded validated server-start flags and chain needs-install to qdrant install

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Extend `RagControlBody` with three `server-start`-only fields: `local_only`, `port` (u16), `qdrant_auto_provision` (all optional, ignored by other verbs).
- Add `rag_start_args(body)`: builds the validated, bounded `server start` flag list - forwards exactly `--local-only`, `--port` (bounded to 1024..=65535, else a 400), `--qdrant-auto-provision`, nothing else.
- Thread the body into `start_rag_service`; validate args up front (bad port -> 400 before the gate), use them on the absent-start path.
- needs-install chain: when a failed start's captured output references qdrant + install/provision, surface `status:"needs_install"` so the UI can offer `server qdrant install` or a retry with `--qdrant-auto-provision`.

## Outcome

Done. The dashboard can now start rag correctly on CI/offline/air-gapped hosts (`--local-only`), on a chosen port, and with auto-provisioning, and it distinguishes a missing-Qdrant-binary failure from a generic one. `cargo build -p vaultspec-api` is green.

## Notes

The frontend body validation (`isOpsRagControlBodyForVerb` currently requires an EMPTY server-start body) still rejects these flags; that is updated in W04 when the console offers the options. The engine accepts them now and the existing empty-body start path is unaffected (all fields optional). The needs-install detection is a best-effort heuristic over human output - clearly marked as such; the robust path is `--qdrant-auto-provision`.
