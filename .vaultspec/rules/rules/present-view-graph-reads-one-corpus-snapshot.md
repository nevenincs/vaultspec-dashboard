---
name: present-view-graph-reads-one-corpus-snapshot
derived_from:
  - "audit:2026-06-30-graph-worktree-edge-consistency-audit"
---

# The present-view graph reads one corpus snapshot

## Rule

The `vaultspec` engine's live (present-view) graph MUST source its NODES and its
declared `related:` cross-reference EDGES from the SAME corpus snapshot — the working
tree — never nodes from the working tree and declared edges from committed HEAD. Only
HISTORICAL / as-of views read an explicit committed ref (blob-true). Any subprocess the
engine runs to read that corpus (today `vaultspec-core vault graph`, no `--ref`) must be
DOCUMENT-READ-ONLY (it mutates no `.vault/` document), and the cache that memoizes its
result MUST be keyed on the corpus CONTENT (a fingerprint over the in-scope documents'
content hashes), NEVER on the HEAD sha — a sha is invariant under an uncommitted edit, so
a sha-keyed present-view cache re-serves stale edges the moment a document changes without
a commit.

## Why

The `2026-06-30-graph-worktree-edge-consistency-audit` (and its ADR) traced a graph that
rendered uncommitted `.vault/` documents as disconnected, edge-less nodes: the engine
sourced nodes from a working-tree file walk but declared edges from `vault graph --ref
HEAD`, so a freshly-authored, uncommitted document had a node but none of its `related:`
edges — defeating the dashboard's purpose of showing in-progress authoring. The original
HEAD pin existed only to dodge a since-fixed core mutation (working-tree `vault graph` no
longer stamps `modified:`/rewrites `.gitignore` in core ≥ 0.1.36; that work belongs to
`vault check --fix`), so the read-and-infer boundary is preserved by reading the working
tree read-only. The second, mechanical half of the bug was the cache key: the declared
fold cached by HEAD sha, which an uncommitted edit does not change, so even after switching
the ingest the edges would not refresh — the fix re-keys on a working-tree content
fingerprint so a `.vault/` edit misses and re-reads. Edge stable ids exclude the corpus
snapshot (endpoints + relation + tier only), so a working-tree edge and its eventual
committed counterpart share one id — no SSE delta-clock churn across the commit. This is
the present-view companion of `engine-read-and-infer` (the engine reads, never mutates) and
the bounded-slice spirit of `display-state-is-backend-served-not-frontend-derived`: one
authoritative snapshot per view, computed by the engine.

## How

- **Good:** the present-view declared ingest runs `vault graph` against the working tree
  (no `--ref`); the as-of path keeps `--ref <sha>`; the declared-fold cache keys on a
  `worktree_corpus_fingerprint` over the in-scope `doc:` nodes' content hashes, so adding,
  removing, or editing a document (including a `related:` change) misses the cache and
  re-reads, while an unchanged corpus hits it (no subprocess).
- **Good:** the present-view (fingerprint) and as-of (sha) cache key spaces are kept
  DISTINCT in the shared store, so a historical view can never pick up the working-tree
  fold's JSON and serve uncommitted edges as committed history.
- **Bad:** sourcing nodes from the working tree but declared edges from `--ref HEAD` — an
  uncommitted document is a node with no edges (the original defect).
- **Bad:** keying the present-view declared cache on the HEAD sha (or any value invariant
  under an uncommitted edit) — edits silently never refresh the served edges.
- **Bad:** reaching present-view consistency by reading the working tree through a
  vault-MUTATING subprocess (stamping `modified:`, rewriting tracked files) — that violates
  `engine-read-and-infer`; use a document-read-only read, and if the resident core cannot
  guarantee that, fall back to `--ref HEAD` rather than corrupt the corpus.

## Status

Active. Promoted at the close of the `2026-06-30-graph-worktree-edge-consistency` cycle
(research → ADR accepted → plan → execute → review PASS), on explicit mandate direction
ahead of the usual one-cycle wait (project precedent: rules promoted on explicit user
direction). The fix was live-verified (the previously edge-less uncommitted ADR cluster
now serves all its `related` edges; as-of HEAD unchanged). Sibling of
`engine-read-and-infer`, `display-state-is-backend-served-not-frontend-derived`,
`derived-projections-memoize-on-the-graph-generation`,
`provenance-stable-keys-are-identity-bearing`, and
`bounded-by-default-for-every-accumulator`.

## Source

ADR `2026-06-30-graph-worktree-edge-consistency-adr` (accepted; Option A), research
`2026-06-30-graph-worktree-edge-consistency-research`, audit
`2026-06-30-graph-worktree-edge-consistency-audit`. Implementation seams:
`worktree_corpus_fingerprint` and the working-tree declared ingest in
`engine-graph/src/index.rs`; the fingerprint-keyed declared fold in
`vaultspec-api/src/registry.rs`; the carry-last-good fold and the sha-keyed as-of read in
`vaultspec-api/src/app.rs`.
