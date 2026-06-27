---
tags:
  - '#exec'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-06-26'
step_id: 'S01'
related:
  - "[[2026-06-26-rag-service-management-plan]]"
---

# Add an ungated GET /health liveness confirm and a Running/Crashed/Absent discovery state with reason to rag-client discovery

## Scope

- `engine/crates/rag-client/src/client.rs`

## Description

- Add `HealthInfo` + nested `QdrantHealth` deserialize structs for the ungated `GET /health` body (status, pid, qdrant.version/port/alive, project_count, service_token), with `is_ready()` matching rag's `"ready"` state case-insensitively.
- Add the `RagMachineState` enum (`Running` / `Crashed` / `Absent`) as the machine-global running-predicate result, with `is_running()` and `service_info()` helpers.
- Add `probe_machine_state(vault_root, timeout)` and the hermetic `probe_machine_state_at(candidates, health_probe)`: discovery + heartbeat (via the existing `discover`) THEN an ungated `/health` liveness confirm on the discovered port; fresh + ready -> `Running`, discovered-but-not-serving (stale, malformed, unreachable, not-ready) -> `Crashed`, no service -> `Absent`.
- Add five hermetic tests covering Running, Crashed-not-ready, Crashed-unreachable, Crashed-stale (asserts `/health` is NOT probed), and Absent.

## Outcome

Done. The running-predicate machinery exists in `rag-client` and is deliberately kept OFF the per-response hot path: `discover` stays filesystem-only (the `tiers` block hot path), and the `/health` round-trip is paid only by the lifecycle/ops callers that use `probe_machine_state`. `cargo test -p rag-client --lib client::` is green (13 passed, including the 5 new machine-state tests).

## Notes

`RagAvailability` is unchanged (additive design) so every existing `tiers`/search/embeddings consumer is untouched. The stale-vs-absent split reuses `discover_at`'s reason strings (`"stale"`/`"unreadable"` -> Crashed) rather than a new discovery return shape, to avoid churning the hot path; if that string coupling ever feels brittle it can be promoted to a typed discovery reason in a later step.
