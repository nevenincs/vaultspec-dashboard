---
name: engine-read-and-infer
---

# Engine boundary: vaultspec is read-and-infer; sibling semantics never enter it

## Rule

The `vaultspec` engine (the Rust workspace under `engine/`) is strictly
read-and-infer: it must never write `.vault/` documents, never mutate git refs,
trees, or config, and never grow sibling control or search *semantics* — its serve
mode may only forward whitelisted sibling verbs verbatim through the transparent,
namespaced `/ops/*` and `/search` pass-throughs defined in the contract.

## Why

The engine's value is trustworthy inference over sources of truth it does not own:
vaultspec-core owns vault CRUD, vaultspec-rag owns semantic indexing, git owns
history (decisions D1.2, D5.1–D5.3 in `2026-06-12-vaultspec-engine-adr`). The one
seam where this was nearly diluted — a browser GUI needs a server-side hand for
sibling operations — was resolved in the contract
(`2026-06-12-dashboard-foundation-reference` §6/§8) as transparent forwarding with
zero engine semantics: sibling envelopes returned verbatim, domain logic stays in
the siblings. Widening the engine beyond that fence re-creates the monolith the
future agent-orchestration layer was explicitly designed to avoid.

## How

- **Good:** a new GUI operational need (e.g. a new rag watcher verb) lands as an
  addition to the `/ops/rag/*` whitelist, forwarding the sibling's envelope
  untouched.
- **Good:** inference results (derived edges, temporal correlations) persist only
  in the engine-owned SQLite cache under `.vault/data/engine-data/` — deletable,
  fully re-derivable (D8.2), never written back into documents or core's graph.
- **Bad:** an engine endpoint that "fixes up" a core result, retries with altered
  arguments, or implements a vault mutation because the CLI round-trip felt slow —
  that is sibling semantics inside the engine; file the gap upstream instead
  (D5.3).

## Status

Active. Structurally honored in the foundation scaffold (no vault-write code path
exists in the workspace); the per-phase code reviews of the engine plan
(`2026-06-12-vaultspec-engine-plan`) enforce it at every phase boundary.

## Source

Engine ADR `2026-06-12-vaultspec-engine-adr` (D1.2, D1.3, D5.1–D5.3, D8.2);
contract reference `2026-06-12-dashboard-foundation-reference` (§6 ops proxy, §8
search pass-through, §9 non-goals); foundation audit
`2026-06-12-dashboard-foundation-audit` (read-and-infer verified structurally).
