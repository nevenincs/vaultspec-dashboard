---
tags:
  - "#audit"
  - "#graph-worktree-edge-consistency"
date: '2026-06-30'
related:
  - "[[2026-06-30-graph-worktree-edge-consistency-plan]]"
promoted_to:
  - 'rule:present-view-graph-reads-one-corpus-snapshot'
modified: '2026-06-30'
---
# `graph-worktree-edge-consistency` audit: `review: present-view declared edges read the working tree`

## Scope

Adversarial correctness review of the uncommitted engine change for
`graph-worktree-edge-consistency` (ADR Option A): switching the present-view
declared cross-reference ingest from committed HEAD to the working tree, and
re-keying the declared-fold cache from the worktree HEAD sha to a working-tree
corpus content fingerprint. Files audited: `engine-graph/src/index.rs`
(`index_documents`, `worktree_corpus_fingerprint`, `ingest_core_graph`,
`fetch_core_graph_json`), `vaultspec-api/src/registry.rs` (`declared_cache_key`,
`cached_declared_json`, `declared_fold_blocking`), and `vaultspec-api/src/app.rs`
(`rebuild_and_swap` carry-last-good, `asof_graph`). The review traced the six
correctness questions in the dispatch brief; it did not run the test suite or the
live engine.

## Findings

The two coupled halves of the fix are correct: the HEAD-sha cache-key trap is
genuinely closed, the carry-last-good and async-fold fingerprints provably match,
the fingerprint is scope-correct and non-degenerate for the present view, and the
historical/as-of path is untouched. Two MEDIUM observations remain — a lost as-of
cache-reuse optimization (with a now-stale comment) and a narrow cache-key/JSON
skew race — neither rising to a merge blocker.

### LOW-1 (CONFIRMED CLOSED) — the HEAD-sha cache-key trap is actually closed

Verified the full chain. A doc node's facet `content_hash` is set to the
working-tree blob hash during structural ingest (`index.rs:248` reads
`read_from_worktree(...).blob_hash`; `index.rs:336` stores
`content_hash: Some(blob_hash.clone())`). `worktree_corpus_fingerprint`
(`index.rs:638-654`) hashes the sorted `(doc key, content_hash)` pairs of every
`doc:`-prefixed node. Therefore: an uncommitted body or `related:` frontmatter
edit changes the file bytes -> changes `blob_hash` -> changes that node's facet
content hash -> changes the fingerprint -> `cached_declared_json` /
`declared_fold_blocking` miss -> fresh working-tree `vault graph` fetch -> fresh
edges. An add introduces a new `(key, hash)` pair and a remove drops one, both
changing the fingerprint. The trap that re-served stale edges under an invariant
HEAD sha is closed. No action.

### LOW-2 (CONFIRMED) — fingerprint timing in `rebuild_and_swap` matches the fold

The carry-last-good path computes the fingerprint from `fresh` (the new
structural graph, pre-commit) at `app.rs:795`; the async fold later computes it
from `cell.graph_arc()` at `registry.rs:512` (post-commit). They match because the
fingerprint depends ONLY on `doc:` node facet content hashes, and
`ingest_declared_from_json` adds edges without upserting doc nodes or altering
their content-hash facets — so `fingerprint(structural) == fingerprint(folded)`.
After `rebuild_and_swap` commits `fresh` (`app.rs:816`), `graph_arc()` returns
that same corpus's nodes, so the carry-write key and the fold-read key coincide
for an unchanged corpus. Confirmed correct.

### LOW-3 (CONFIRMED) — fingerprint is scope-correct; one defensive edge

`worktree_corpus_fingerprint` filters facets by `&f.scope == scope`
(`index.rs:643-646`) and is called with `cell.scope`. Structural ingest stamps
each doc node's facet with that same `scope` (`index.rs:334`), so the present-view
single-scope graph yields a non-degenerate fingerprint (every doc contributes a
real content hash). The `doc:` prefix filter (`index.rs:641`) correctly excludes
`rule:` and `plancontainer:` nodes (whose facets carry `content_hash: None`),
confirmed against `engine-model/src/id.rs` kind prefixes. Defensive edge only: a
doc node missing a facet for `scope`, or one with `content_hash: None`, falls to
`unwrap_or_default()` (empty string) — that doc would still contribute its KEY (so
add/remove still moves the fingerprint) but a content edit to it would not. This
does not occur in the single-scope present-view build (every doc node gets
`Some(blob_hash)`); flagged only as a latent assumption to preserve if a
multi-scope or partial-facet graph is ever fed to this function.

### LOW-4 (CONFIRMED) — as-of / historical path is unchanged; no leaked present-view HEAD

The as-of declared ingest passes the explicit resolved commit sha
(`asof.rs:281`, `Some(&resolved_sha)`), and `asof_graph` keys its declared-cache
read on that sha (`app.rs:517-518`, `declared_cache_key(scope, sha)`). A
workspace-wide grep for a live `Some("HEAD")` declared fetch found only
doc/comment occurrences (`index.rs:175/177/187/578`); every executable
present-view fetch now passes `None` (`index.rs:191`, `registry.rs:529`,
`app.rs:766`). The present-view switch did not leak into historical
reconstruction. Confirmed correct.

### MEDIUM-1 — the as-of declared-cache reuse is now dead, and its comment is stale

`asof_graph` still tries to reuse a sha-keyed declared artifact to skip the
~16-35s `vault graph --ref` subprocess (`app.rs:510-524`), reading
`declared_cache_key(scope, sha)` from `DECLARED_GRAPH_KIND`. But after this change
the ONLY writer of `DECLARED_GRAPH_KIND` is the present-view fold's miss path
(`registry.rs:533`), which now keys on the corpus FINGERPRINT, not the sha
(confirmed: the sole non-test `put_artifact(DECLARED_GRAPH_KIND, ...)` is
fingerprint-keyed). No code path writes a sha-keyed entry anymore, so the as-of
read at `app.rs:521` now ALWAYS misses and as-of falls back to the subprocess on
every first visit to a sha — including time-travel to the current HEAD, which
previously reused the live rebuild's HEAD-sha JSON. This is a performance
regression, not a correctness defect (the subprocess fallback is correct, and the
in-memory `asof_cache` LRU still serves repeat visits). Note the key separation is
also what PROTECTS correctness here: because as-of reads by sha and the present
view writes by fingerprint, an as-of@HEAD read can never accidentally pick up the
working-tree (fingerprint-keyed) JSON and serve uncommitted edges in a historical
view. The doc comment at `app.rs:510-511` ("the live rebuild persists core's
`vault graph` JSON by sha") is now FALSE and should be corrected; either restore
an as-of-usable cache write or delete the dead reuse branch and its comment.

### MEDIUM-2 — cache-key / JSON corpus skew can mislabel a present-view cache entry (narrow race)

`declared_fold_blocking` derives the cache KEY from the in-memory structural graph
(`registry.rs:511-512`, `worktree_corpus_fingerprint(&cell.graph_arc(), ...)`) but
fetches the JSON by running `vault graph` against the live working-tree FILES
(`registry.rs:529`) and, on the miss path, writes the JSON under that key
(`registry.rs:533`). Three points-in-time are involved: the in-memory graph the
fingerprint reads, the files the subprocess reads, and the second `graph_arc()`
clone the fold commits (`registry.rs:575`). If a `.vault/` edit lands (or a
concurrent watcher `rebuild_and_swap` commits — `commit_graph` is NOT gated by
`declared_fold_active`) between the fingerprint read and the subprocess fetch, the
written entry maps fingerprint(corpus_A) -> JSON(corpus_B). The mislabeled entry
is harmless at steady state (the settling corpus triggers a re-fold that writes a
correctly-keyed entry), but it persists in the store; if the corpus later returns
to EXACTLY state A within the `DECLARED_GRAPH_KEEP=4` window, `cached_declared_json`
hits it and folds corpus-B declared edges onto corpus-A structural nodes — the
exact stale-edge / cross-snapshot inconsistency this feature exists to eliminate,
now silent. The race is narrow (requires a precise interleaving plus an exact
corpus revisit within the keep-4 window) and self-corrects at rest, hence MEDIUM
rather than HIGH. Hardening: validate the fetched JSON's doc set against the key's
fingerprint before persisting (discard a skewed fetch rather than cache it under a
mismatched key), or accept the skew as bounded and document it.

### Cache coexistence (CONFIRMED SAFE) — fingerprint and sha key spaces do not collide

Present-view (fingerprint) and as-of (sha) artifacts share one
`DECLARED_GRAPH_KIND` store, but both keys pass through
`declared_cache_key` hashing the scope token joined to the corpus key (`registry.rs:356`),
producing distinct hex strings unless the fingerprint string equals a git sha
string (astronomically unlikely). No wrong-hit across the two spaces. The shared
`prune_artifacts_keep_newest(.., 4)` (`registry.rs:541`) does not flap the present
view: the fold writes the current fingerprint on every miss with a fresh
timestamp, so the currently-needed entry is always the newest and survives the
prune; and since the as-of path never writes this store, there are no sha entries
competing for the keep-4 window. Reverting the corpus beyond the keep-4 window
costs one re-fetch (correct, just uncached).

## Recommendations

- MEDIUM-1: Correct the stale comment at `app.rs:510-511` and resolve the now-dead
  as-of declared-cache reuse. Either (a) have the present-view fold ALSO persist a
  sha-keyed entry on a committed HEAD so as-of@HEAD can reuse it, or (b) delete the
  reuse branch (`app.rs:510-524`) and let as-of always run the subprocess (the
  in-memory `asof_cache` already serves repeat visits). Do not leave a comment that
  asserts a sha-keyed write that no longer happens.
- MEDIUM-2: Close the fingerprint-key / fetched-JSON skew. Before persisting on the
  miss path (`registry.rs:533`), validate that the fetched `vault graph` JSON's doc
  set matches the fingerprint the key was computed from, and skip the cache write on
  a mismatch — so a cache entry can never map one corpus's fingerprint to another
  corpus's edges. At minimum, document the skew as a known bounded behavior.
- Both findings are MEDIUM and non-blocking; the core fix (working-tree present-view
  edges + content-fingerprint cache key) is sound and may merge with these tracked.

## Codification candidates

- **Source:** the ADR's own candidate, reaffirmed by LOW-1/LOW-4 (nodes and declared
  edges now share one working-tree snapshot; historical views stay on an explicit
  committed ref).
  **Rule slug:** `present-view-graph-reads-one-corpus-snapshot`.
  **Rule:** The engine's live (present-view) graph must source its nodes AND its
  declared `related:` edges from the SAME working-tree snapshot — never nodes from the
  working tree and edges from committed HEAD — while historical/as-of views read an
  explicit committed ref; any corpus-reading subprocess must be document-read-only,
  and its result cache must be keyed on corpus CONTENT (a content fingerprint), never
  on the HEAD sha that an uncommitted edit does not change.

This candidate has held for exactly one execution cycle; per the codify discipline it
qualifies for promotion once the fix lands green and the MEDIUM findings are resolved.
The MEDIUM-2 skew is a sharper corollary worth carrying in the rule's prose: a
content-keyed cache must guarantee the key and the cached payload describe the SAME
corpus snapshot, or the content-keying buys nothing.

## Review round 2 — read-and-infer boundary & ADR conformance

Verdict: PASS — no CRITICAL or HIGH. The change is conformant to `engine-read-and-infer`
and faithfully implements the accepted ADR's Option A.

- **R2-LOW** (confirmed): no new `.vault/` write path (the change is a pure
  corpus-selector swap plus a read-only in-memory fingerprint); edge derivation stays
  core-owned (no widened engine semantics); declared-tier degradation stays truthful on
  a core-read failure (`declared_status = Some(reason)`, tiers block, never faked edges);
  the as-of path is correctly untouched (`asof.rs` pins `Some(sha)`); the codification
  candidate is well-formed and matches what was built.
- **R2-MEDIUM-A** — stale `fetch_core_graph_json` doc still called working-tree mode
  "vault-mutating / CRITICAL", directly contradicting the change (a future agent could
  revert on it). RESOLVED.
- **R2-MEDIUM-B** — a cluster of HEAD-sha cache comments (`DECLARED_GRAPH_KIND`,
  `spawn_declared_fold`, `declared_fold_blocking`, `DECLARED_GRAPH_KEEP`, the
  `ingest_declared_from_json` doc, the `..._separates_scope_and_sha` test) still
  described the cache as HEAD-sha-keyed. RESOLVED (swept to corpus-fingerprint / commit-sha).
- **R2-MEDIUM-C** — no core-version guard for the working-tree read: the no-mutation
  guarantee rests on core ≥ 0.1.34, unenforced; an older (working-tree-mutating) or a
  future-regressed core would silently stamp `modified:` on every edit. Mitigated by
  `resolve_core_invocation` preferring the uv-pinned project core. DEFERRED (tracked) —
  see the revision log; ties to the ADR's recorded `vault graph --no-cache` upstream ask.

## Revision log (post-review)

Resolved before commit (doc-accuracy, load-bearing per review-revision-precedence):
- R2-MEDIUM-A: rewrote the `fetch_core_graph_json` doc (`index.rs`) — `None` = read-only
  working-tree present view (core 0.1.34 mutates no `.vault/` doc), `Some(sha)` =
  blob-true historical.
- R2-MEDIUM-B: swept every stale "HEAD sha" cache comment to "corpus fingerprint (present)
  / commit sha (as-of)" across `index.rs` and `registry.rs`; renamed the cache-key test.
- MEDIUM-1 (comment half): corrected the false as-of cache-reuse comment in `app.rs`.
- VERSION FACT: the research/ADR/comments cited core `0.1.36`; the installed core is
  actually `0.1.34`. Re-verified the no-mutation property directly on 0.1.34 (full
  before/after mtime+size snapshot of all 1341 `.vault/*.md` + git-status: zero change),
  and corrected every `0.1.36` reference to `0.1.34` across the research, ADR, rule, and
  code comments. The read-only finding is empirical (snapshot-verified), independent of
  the mislabeled version number.

Second revision round — ALL deferred items now RESOLVED (mandate: exhaust every known
surface). Re-verified green end to end: fmt + clippy clean; ingest-core 15 (incl new
`semver_parse_and_readonly_floor`), engine-graph 38, vaultspec-api 150, conformance 3,
e2e 6; live present view 18 nodes / 289 edges, as-of HEAD 0.
- R2-MEDIUM-C (RESOLVED): added a core-version FLOOR. `ingest-core::runner` gained
  `core_version()` (memoized `--version` probe), `parse_semver`, and
  `supports_readonly_worktree_graph()` (≥ `MIN_READONLY_WORKTREE_GRAPH` = the verified
  0.1.34). `engine-graph::index::present_view_git_ref()` returns `None` (working tree) only
  on a verified core, else fail-safe `Some("HEAD")` (logged once) — a sub-floor/unknown
  core can never be pointed at the working tree, so it can never silently mutate. Wired into
  `index_documents`, the async fold, and the sync rebuild fallback.
- MEDIUM-1 (perf half, RESOLVED): restored on-disk as-of declared reuse. The as-of path
  now fetches the `--ref sha` JSON on a miss and persists it under a SEPARATE cache kind
  (`DECLARED_GRAPH_ASOF_KIND`, sha-keyed) — distinct kind so present-view and as-of caches
  never evict each other; key separation still stops a historical view from picking up
  working-tree edges.
- MEDIUM-2 (RESOLVED, concurrent-rebuild case): added a TOCTOU guard in
  `declared_fold_blocking` — after the miss-path fetch, re-derive the corpus key and persist
  ONLY if it still equals the key we fetched under, so a concurrent `commit_graph` can no
  longer cache JSON under a stale key (the edges still fold into the live graph; only the
  cache write is skipped, and the next stable fold caches correctly). The irreducible
  sub-debounce residual (a `.vault/` edit + exact byte-revert inside the watcher debounce,
  before any rebuild) is documented and accepted as bounded.
- Fallback-mode keying: in HEAD-fallback the present-view cache key is the fingerprint
  joined to the HEAD sha
  so BOTH a content edit and a commit invalidate it (the working-tree fingerprint alone
  would not move on a commit).
