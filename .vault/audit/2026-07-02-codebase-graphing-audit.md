---
tags:
  - '#audit'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
related:
  - "[[2026-07-02-codebase-graphing-plan]]"
  - "[[2026-07-02-codebase-graphing-adr]]"
---

# `codebase-graphing` audit: `backend execution code review`

## Scope

Adversarial code review of the codebase-graphing backend execution (commits
`46f13b7e03` W01 and `37c9499181` W02-W05), verifying the accepted ADR's
decisions against the shipped code: the disconnection invariant (D1), the
extraction discipline (D2/D8), LOD and bounds (D3), identity (D4), the wire
(D5), and cache/refresh (D6). Review dimensions in priority order:
disconnection, correctness, bounds/resources, contract discipline, test
integrity. The concurrent authoring campaign's files swept into the second
commit were excluded.

## Findings

Verdict: **PASS** — no CRITICAL or HIGH findings; the disconnection invariant
holds structurally (two physically separate stores with independent
generations; the vault path byte-identical when `corpus` is absent) and is
verified end-to-end by router-level tests with no mocks. All three MEDIUMs and
four of five LOWs were resolved in the same cycle (revision commit following
the review); L5's defensive-500 half is recorded as accepted.

### code-projection-memoization | medium | RESOLVED - code rollup was recomputed per request

`code_graph_query` (rollup aggregation, member counts, per-node views) ran on
every code query with no per-generation cache, deviating from ADR D6 and the
memoize-on-generation rule. Resolved: the DEFAULT rollup slice is memoized per
code generation on the code cell (`default_rollup`); narrowed queries and file
granularity flow through the projection per request, mirroring the vault's
filtered-constellation split.

### fingerprint-composition | medium | RESOLVED - fingerprint key deviated from the ADR text

The extraction cache keys on `(path, len, mtime)` while ADR D6 said "path plus
blob hash", and the module comment claimed the trade-off was recorded when it
was not. Resolved by amending ADR D6 to record the actual composition and its
rationale: the freshness probe must cost one metadata walk, not a full
re-read; a same-size-same-mtime rewrite false-hits for at most one debounce
window; content hashes still ride each node facet for exact provenance.

### display-gate-code-module | medium | RESOLVED - vault display gate lacked the new kind

`is_displayable_node` rejected `CodeArtifact` but not the new `CodeModule`
kind. No vault producer mints one, so the structural guarantee held, but the
ADR's pitfall-to-guard asks for exactly this consumer-side net. Resolved:
the gate now rejects both code-corpus kinds.

### file-symlink-follow | low | RESOLVED - file symlinks were read while dir symlinks were guarded

The walk skipped directory symlinks but admitted file symlinks, whose read
follows the link outside the tree. Resolved: the walk now skips every symlink.

### language-classification-drift | low | RESOLVED - duplicated ext-to-language maps could drift

The extraction crate and the query crate deliberately duplicate the
extension-to-language map (keeping tree-sitter out of the query crate); a
one-sided extension would silently mis-facet. Resolved with a parity test in
the wire conformance suite asserting both sides agree over the known and
unknown extension set.

### rebuild-lock-rewalk | low | RESOLVED - lock waiters re-walked after the holder rebuilt

A request passing the debounce check then blocking on the rebuild lock
re-walked the tree even when the holder had just rebuilt. Resolved with a
debounce re-check under the lock.

### walk-depth-bound | low | RESOLVED - directory recursion depth was unbounded

`max_files` bounded file count but not directory depth; a pathological deep
chain could exhaust the stack. Resolved with a hard depth ceiling on the walk.

### code-tier-honesty-shape | low | ACCEPTED - code degradation rides additive fields, not a tiers entry

ADR D8's "tiers block reports the code corpus tier" is delivered as the
additive `extraction` counters plus the standard `truncated` block rather than
a new named tier in the `tiers` block — judged honest and reasonable by the
review; kept as-is. The defensive edge-rejection path (a band-invalid edge
500s rather than degrading) cannot fire by construction (targets are walked
files, self-imports skipped, per-file dedup) and is retained as a loud guard.

## Recommendations

Codify `code-graph-is-a-disconnected-corpus` (the ADR's candidate) now that
the review confirmed the disconnection holds structurally and the display-gate
net covers both code kinds. Future extensions (git co-change overlay, SCIP
opt-in, tsconfig path aliases) extend the code corpus without touching the
vault graph.

## Codification candidates

- `code-graph-is-a-disconnected-corpus` (per the ADR; the review's M3
  display-gate fix completes the structural guard the rule promises).
