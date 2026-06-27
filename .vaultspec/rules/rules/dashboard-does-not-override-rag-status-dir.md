---
name: dashboard-does-not-override-rag-status-dir
---

# The dashboard never overrides rag's STATUS_DIR; discovery stays machine-global

## Rule

The dashboard must never set or override `VAULTSPEC_RAG_STATUS_DIR` (nor otherwise
fragment rag discovery off the machine-global `~/.vaultspec-rag/service.json`): the
machine-global candidate always wins over any per-scope status file and the lifecycle
subprocess spawn introduces no STATUS_DIR; if per-scope isolation is ever genuinely
needed, switch discovery to a STATUS_DIR-independent machine pointer (the lock-holder
pid) coordinated with rag FIRST.

## Why

The `2026-06-26-rag-service-management-adr` (D3) committed this invariant in writing
because rag is machine-global at `~/.vaultspec-rag/service.json` while the OS machine
lock still permits only ONE service per machine: a per-scope `VAULTSPEC_RAG_STATUS_DIR`
override fragments discovery so each workspace looks for its own status file, yet the
single locked service can publish only one — so every workspace but the lock holder
fails discovery (or 502s) against a service that is actually healthy. Keeping discovery
machine-global is what lets the dashboard attach to the one resident service regardless
of who started it.

## How

- **Good:** `service_json_candidates` lists the machine-global home path
  (`~/.vaultspec-rag/service.json`) first and it wins; the lifecycle subprocess spawn
  carries no `VAULTSPEC_RAG_STATUS_DIR`.
- **Bad:** setting `VAULTSPEC_RAG_STATUS_DIR` per scope to "isolate" a workspace's rag
  — it fragments discovery while the machine lock still allows exactly one service, so
  the losers 502 or fail discovery against a healthy service.

## Status

Active. Promoted at the close of the `rag-service-management` cycle (research → ADR
accepted → plan → execute → review PASS), in which the machine-global discovery order
and the STATUS_DIR-free spawn were built and the `client.rs` discovery guard tests
landed. Sibling of [[rag-is-a-machine-singleton-the-dashboard-attaches-never-owns]],
[[rag-data-rides-the-codified-contract-not-the-qdrant-shape]],
[[engine-read-and-infer]], and [[dashboard-layer-ownership]].

## Source

ADR `2026-06-26-rag-service-management-adr` (decision D3) and research
`2026-06-26-rag-service-management-research`. Guards: the `client.rs`
`service_json_candidates` machine-global-first discovery and the discovery guard tests;
rag `0.2.25` machine lock (`_machine_lock.py`).
