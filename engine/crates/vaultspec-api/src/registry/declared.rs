//! The declared-tier fold machinery (perf ADR D1 + declared-edge-continuity ADR),
//! extracted verbatim from `registry` to keep that module under the size cap — zero
//! behavior change. Owns the async fold (subprocess → corpus-fingerprint cache →
//! clone-and-commit), the stale-while-refolding carry (graft the last completed fold's
//! declared edges onto a rebuild, pruned to the new node set), and the declared-graph
//! cache constants/keys. Re-exported from `registry` so every `crate::registry::X`
//! call site is unchanged.

use std::sync::Arc;

use engine_model::ScopeRef;

use crate::app::ScopeCell;

/// Engine-store artifact kind for the cached raw core graph JSON, keyed by the
/// working-tree corpus FINGERPRINT for the present view and the commit SHA for an
/// as-of build (perf ADR D1 + graph-worktree-edge-consistency ADR). The declared
/// graph for a fixed corpus state is stable, so a rebuild over an unchanged corpus
/// (same fingerprint) is a cache hit that skips the ~16s core subprocess entirely.
/// Lives in the re-derivable `.vault/data/engine-data/` zone — fully deletable,
/// rebuildable on the next miss.
pub(crate) const DECLARED_GRAPH_KIND: &str = "declared-graph-v2";

/// Engine-store artifact kind for the cached HISTORICAL (as-of) declared graph JSON,
/// keyed by the committed sha. Kept in a SEPARATE kind from the present-view
/// (`DECLARED_GRAPH_KIND`) cache so the two never evict each other under the per-kind
/// keep-window: a burst of time-travel must not flush the live present-view snapshot,
/// and vice versa (audit MEDIUM-1 — the as-of on-disk reuse was lost when the
/// present-view cache moved to fingerprint keys; this restores it without coupling the
/// two caches' eviction). Same `.vault/data/engine-data/` re-derivable zone.
pub(crate) const DECLARED_GRAPH_ASOF_KIND: &str = "declared-graph-v2-asof";

/// How many declared-graph snapshot generations to retain. Each generation is a
/// full-graph JSON payload (megabytes) minted on every corpus change; the cache is
/// re-derivable, so we keep only a small recent window (the live corpus plus a few
/// for fast repeat-switch / near-HEAD time travel) and evict the rest. Without
/// this bound the snapshots accumulated unbounded (166 MB / 34 generations
/// observed in the field for a ~740-doc corpus).
pub(crate) const DECLARED_GRAPH_KEEP: usize = 4;

/// Rolling retention window for the temporal event log (B5, resource-hardening):
/// on each HEAD-change fold, events older than this are pruned so the append-only
/// `temporal_events` table cannot grow with the full commit history of the
/// process. The `/events` and lineage reads bound their own time ranges, so 90
/// days of recent history is ample.
const TEMPORAL_EVENT_RETENTION_MS: i64 = 90 * 24 * 60 * 60 * 1000;

/// Cache key for the declared graph: the corpus key qualified by the scope token,
/// so two scopes never alias each other's cached JSON (defensive — the JSON is
/// scope-independent, but the qualified key documents the per-scope contract). The
/// `corpus_key` is a working-tree CONTENT FINGERPRINT for the present view
/// (graph-worktree-edge-consistency ADR — an uncommitted edit must miss the cache)
/// and an explicit COMMIT SHA for an as-of / historical build (a committed snapshot
/// does not change). The two key spaces are distinct hex strings, so present-view
/// and as-of artifacts coexist in one store, pruned by recency.
pub(crate) fn declared_cache_key(scope_token: &str, corpus_key: &str) -> String {
    engine_model::content_hash(format!("{scope_token}:{corpus_key}").as_bytes())
}

/// The present-view declared `(git_ref, cache key material)` for a corpus state,
/// gated on the core-version floor (graph-worktree-edge-consistency ADR + the
/// version-guard hardening). On a verified read-only core: read the WORKING TREE
/// (`None`), keyed on the corpus content fingerprint — so an uncommitted edit misses
/// the cache and re-reads. On an older/unknown core: fail-safe to committed `HEAD`,
/// keyed on `fingerprint@<head sha>` so BOTH a content edit AND a commit invalidate
/// the cache in that degraded mode (the working-tree fingerprint alone would not move
/// on a commit). Computed from a graph snapshot so the rebuild (over `fresh`) and the
/// fold (over the committed graph) derive the SAME key for an unchanged corpus.
pub(crate) fn present_view_corpus(
    graph: &engine_graph::LinkageGraph,
    root: &std::path::Path,
    scope: &ScopeRef,
) -> (Option<&'static str>, String) {
    let git_ref = engine_graph::index::present_view_git_ref();
    let fingerprint = engine_graph::index::worktree_corpus_fingerprint(graph, scope);
    match git_ref {
        None => (None, fingerprint),
        Some(reference) => {
            let sha = engine_graph::asof::resolve_ref(root, "HEAD").unwrap_or_default();
            (Some(reference), format!("{fingerprint}@{sha}"))
        }
    }
}

/// Read the cached declared-graph JSON for the cell's CURRENT working-tree corpus
/// (`fingerprint`) WITHOUT the core subprocess (a pure store read); `None` on a miss.
/// The rebuild's unchanged-corpus fast path folds this to keep the `declared` tier
/// AVAILABLE instead of flapping to `DECLARED_BUILDING` on every FS change; a genuine
/// `.vault/` edit changes the fingerprint, so it misses and the async fold re-reads.
pub(crate) fn cached_declared_json(cell: &ScopeCell, corpus_key: &str) -> Option<String> {
    let key = declared_cache_key(&crate::routes::scope_token(&cell.root), corpus_key);
    let store = cell.store.lock().unwrap_or_else(|e| e.into_inner());
    store.get_artifact(DECLARED_GRAPH_KIND, &key).ok().flatten()
}

/// Reconcile the declared tier into a freshly-built structural graph BEFORE the swap
/// (declared-edge-continuity ADR); returns the `declared_status` to record. No runtime
/// (tests): ingest INLINE, falling through to the carry (with the core error as the
/// honest fallback reason) on failure. Serve + unchanged corpus with a cached declared
/// graph: ingest the exact cached edges → AVAILABLE. Otherwise (cold / corpus changed,
/// a fold will run): GRAFT the last completed fold's carried edges pruned to the fresh
/// node set — refreshing when any survive, else the building fallback. A successful
/// ingest also CAPTURES the carried set so the next rebuild grafts the freshest truth.
pub(crate) fn reconcile_declared_into(
    cell: &ScopeCell,
    fresh: &mut engine_graph::LinkageGraph,
    building_fallback: Option<String>,
) -> Option<String> {
    use engine_graph::index;
    if tokio::runtime::Handle::try_current().is_err() {
        match index::fetch_core_graph_json(&cell.root, index::present_view_git_ref()) {
            Ok(json) => ingest_and_capture(cell, fresh, &json),
            Err(reason) => graft_carried_declared(cell, fresh, Some(reason)),
        }
    } else {
        let prior_available = cell
            .declared_status
            .read()
            .map(|status| status.is_none())
            .unwrap_or(false);
        let (_, corpus_key) = present_view_corpus(fresh, &cell.root, &cell.scope);
        match prior_available
            .then(|| cached_declared_json(cell, &corpus_key))
            .flatten()
        {
            Some(json) => ingest_and_capture(cell, fresh, &json),
            None => graft_carried_declared(cell, fresh, building_fallback),
        }
    }
}

/// Ingest declared JSON into `fresh`; on success capture the resulting declared edge
/// set as the carried truth. Returns the `declared_unavailable` reason (None = up).
fn ingest_and_capture(
    cell: &ScopeCell,
    fresh: &mut engine_graph::LinkageGraph,
    json: &str,
) -> Option<String> {
    let (_, unavailable) = engine_graph::index::ingest_declared_from_json(
        fresh,
        json,
        &cell.scope,
        crate::app::now_ms(),
    );
    if unavailable.is_none() {
        capture_carried_declared(cell, fresh);
    }
    unavailable
}

/// Graft the cell's carried declared edge set (last completed fold) onto `fresh`, pruned
/// to its node set (declared-edge-continuity ADR). Returns `refreshing` when any survive
/// (a fold will update them), else `fallback` (edge-less: building sentinel or core error).
fn graft_carried_declared(
    cell: &ScopeCell,
    fresh: &mut engine_graph::LinkageGraph,
    fallback: Option<String>,
) -> Option<String> {
    let carried = cell
        .declared_edges
        .read()
        .ok()
        .and_then(|guard| guard.clone());
    match carried {
        Some(edges) if fresh.graft_declared_edges(&edges) > 0 => {
            Some(engine_graph::index::DECLARED_REFRESHING.to_string())
        }
        _ => fallback,
    }
}

/// Replace the cell's carried declared edge set from a graph that has the declared tier
/// ingested (declared-edge-continuity ADR): captured on a completed fold (and inline
/// ingest) so the next rebuild grafts the freshest truth. `Arc`-shared; bounded by the
/// corpus's declared edge count.
pub(crate) fn capture_carried_declared(cell: &ScopeCell, graph: &engine_graph::LinkageGraph) {
    let edges = std::sync::Arc::new(graph.declared_stored_edges());
    if let Ok(mut carried) = cell.declared_edges.write() {
        *carried = Some(edges);
    }
}

/// Asynchronously fold the declared tier into a cell's live graph (perf ADR
/// D1 — the dominant win: the slow `vaultspec-core vault graph` subprocess off
/// the servable-parse critical path).
///
/// The structural graph is already committed and servable; this task fingerprints
/// the cell's working-tree corpus, gets the declared graph JSON (cache hit → no
/// subprocess; miss → run the working-tree subprocess and cache the JSON by that
/// corpus fingerprint), clones the cell's CURRENT graph, ingests the declared edges
/// into the clone,
/// and `commit_graph`s the folded graph — emitting declared deltas on the
/// cell's per-scope monotonic clock. `declared_status` flips to `None`
/// (declared AVAILABLE) on success, or `Some(reason)` if core was unreachable
/// (truthful degrade).
///
/// LEAK-SAFE (HIGH-1 discipline, like `spawn_watcher`): the task holds a
/// `Weak<ScopeCell>`, upgrading per use and exiting if the cell was evicted —
/// it never keeps a dead scope alive.
///
/// COALESCED with a closed trailing edge (perf ADR D1, review HIGH): a per-cell
/// `declared_fold_active` flag means at most one fold runs per cell at a time.
/// If one is already in flight, this sets the `declared_fold_pending`
/// trailing-edge flag instead of dropping the request — the in-flight fold's
/// completion guard sees the flag and re-spawns a fold at the CURRENT HEAD. So
/// even when a rebuild that races a fold is the LAST change (no further rebuild
/// to piggy-back on), the latest structural commit STILL gets a declared fold;
/// the tier never serves a superseded commit's edges indefinitely.
pub fn spawn_declared_fold(cell: &Arc<ScopeCell>) {
    use std::sync::atomic::Ordering;

    // Only runs under a tokio runtime; the non-runtime (unit-test) path folds
    // declared inline in `rebuild_and_swap`, so there is nothing to defer here.
    if tokio::runtime::Handle::try_current().is_err() {
        return;
    }

    // Coalesce: claim the fold slot. If another fold is in flight, record the
    // trailing edge (a fold is owed at the current HEAD) and return; the running
    // fold re-spawns on completion. Re-check after setting `pending` to close the
    // lost-wakeup window: if the in-flight fold cleared `active` between our
    // failed claim and our `pending` set, it may have already observed `pending`
    // as false and finished — so we re-attempt the claim ourselves rather than
    // leave an owed fold stranded.
    if cell
        .declared_fold_active
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        cell.declared_fold_pending.store(true, Ordering::Release);
        if cell
            .declared_fold_active
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            // Still in flight: the running fold owns the trailing edge now.
            return;
        }
        // We won the slot after all; consume the flag WE just set (we are about
        // to fold at the current HEAD, satisfying it) and fall through to spawn.
        cell.declared_fold_pending.store(false, Ordering::Release);
    }

    spawn_claimed_fold(cell);
}

/// Spawn the fold task for a cell that has ALREADY claimed the
/// `declared_fold_active` slot. Leak-safe: the task holds a `Weak<ScopeCell>`
/// and upgrades inside, so an eviction between spawn and run cleanly aborts.
fn spawn_claimed_fold(cell: &Arc<ScopeCell>) {
    let Ok(handle) = tokio::runtime::Handle::try_current() else {
        // Claimed but no runtime to run on: release the slot so a later
        // (runtime-backed) spawn can claim it. Defensive — callers only reach
        // here under a runtime.
        cell.declared_fold_active
            .store(false, std::sync::atomic::Ordering::Release);
        return;
    };
    let weak = Arc::downgrade(cell);
    handle.spawn(async move {
        // The subprocess + CPU ingest is blocking; run it OFF the async reactor.
        let result = tokio::task::spawn_blocking(move || declared_fold_blocking(&weak)).await;
        if let Err(e) = result {
            eprintln!("vaultspec serve: declared fold task panicked: {e}");
        }
    });
}

/// The blocking body of the declared fold (perf ADR D1): corpus-fingerprint →
/// cache-or-subprocess JSON → clone-and-fold → commit. Runs on a blocking thread; the
/// completion guard releases the coalescing slot and re-spawns on a raced rebuild.
fn declared_fold_blocking(weak: &std::sync::Weak<ScopeCell>) {
    use std::sync::atomic::Ordering;

    // Upgrade once at the top; if the cell was evicted, there is nothing to fold
    // and the flag died with the cell — exit.
    let Some(cell) = weak.upgrade() else {
        return;
    };
    // On EVERY exit path (incl. panic): release the coalescing slot, then re-spawn a
    // fold if a rebuild raced this one (`declared_fold_pending`), so the latest commit
    // is never left unfolded. Holds a `Weak` (never keeps an evicted cell alive,
    // HIGH-1). Terminates: a re-spawn only fires when a concurrent rebuild set pending,
    // and it clears pending; a stable HEAD spawns nothing.
    struct FoldGuard {
        cell: std::sync::Weak<ScopeCell>,
    }
    impl Drop for FoldGuard {
        fn drop(&mut self) {
            let Some(cell) = self.cell.upgrade() else {
                return;
            };
            cell.declared_fold_active.store(false, Ordering::Release);
            // Trailing edge: a rebuild landed mid-fold and could not claim the
            // slot. Re-spawn now that the slot is free, folding at the current
            // HEAD. `swap` consumes the flag so a single race triggers exactly
            // one re-spawn.
            if cell.declared_fold_pending.swap(false, Ordering::AcqRel) {
                spawn_declared_fold(&cell);
            }
        }
    }
    let _guard = FoldGuard { cell: weak.clone() };

    // Resolve the present-view declared source for the CURRENT corpus (graph-worktree-
    // edge-consistency ADR): working tree keyed on the corpus CONTENT fingerprint on a
    // verified read-only core, else a committed-HEAD read keyed on `fingerprint@<sha>`.
    // Keying on content (not HEAD) is what makes an uncommitted `.vault/` edit re-read.
    let (git_ref, corpus_key) = present_view_corpus(&cell.graph_arc(), &cell.root, &cell.scope);

    // Declared graph JSON: cache hit (no subprocess) or miss (subprocess + cache).
    let json: Result<String, String> = {
        let key = declared_cache_key(&crate::routes::scope_token(&cell.root), &corpus_key);
        let cached = {
            let store = cell.store.lock().unwrap_or_else(|e| e.into_inner());
            store.get_artifact(DECLARED_GRAPH_KIND, &key).ok().flatten()
        };
        match cached {
            Some(json) => Ok(json),
            None => {
                // Cache miss: run the subprocess at the gated ref (read-only core, else
                // committed HEAD), then persist the JSON by the corpus key.
                let fetched = engine_graph::index::fetch_core_graph_json(&cell.root, git_ref);
                // TOCTOU guard (audit MEDIUM-2): only persist if the corpus is STILL the
                // one we keyed on — a concurrent rebuild could otherwise cache JSON under
                // a now-stale key. On a mismatch we skip the WRITE only; the fetched edges
                // still fold below, and the next stable fold caches under the right key.
                let (_, still_key) =
                    present_view_corpus(&cell.graph_arc(), &cell.root, &cell.scope);
                if let (Ok(json), true) = (&fetched, still_key == corpus_key) {
                    let store = cell.store.lock().unwrap_or_else(|e| e.into_inner());
                    if let Err(e) =
                        store.put_artifact(DECLARED_GRAPH_KIND, &key, json, crate::app::now_ms())
                    {
                        eprintln!("vaultspec serve: caching declared graph failed: {e}");
                    }
                    // Bound the snapshot cache: keep only the most recent
                    // generations, evicting older full-graph payloads so the
                    // cache cannot grow without limit across corpus changes.
                    if let Err(e) =
                        store.prune_artifacts_keep_newest(DECLARED_GRAPH_KIND, DECLARED_GRAPH_KEEP)
                    {
                        eprintln!("vaultspec serve: pruning declared-graph cache failed: {e}");
                    }
                    // While we hold the write lock, bound the other growing stores and
                    // reclaim freed pages (B5): evict expired semantic rows, age out
                    // temporal events past retention, then reclaim + collapse the WAL.
                    // Best-effort + logged; a contended reclaim retries on the next fold.
                    let now = crate::app::now_ms();
                    if let Err(e) = store.evict_expired_semantic(now) {
                        eprintln!("vaultspec serve: evicting expired semantic cache failed: {e}");
                    }
                    if let Err(e) = store.prune_events_before(now - TEMPORAL_EVENT_RETENTION_MS) {
                        eprintln!("vaultspec serve: pruning temporal events failed: {e}");
                    }
                    if let Err(e) = store.reclaim() {
                        eprintln!("vaultspec serve: reclaiming sqlite free pages failed: {e}");
                    }
                }
                fetched
            }
        }
    };

    // Clone the cell's CURRENT structural graph and fold the declared edges into
    // the clone, then commit. Cloning (not re-parsing) is why `LinkageGraph` is
    // `Clone` (perf ADR D1): clone(structural)+declared is byte-identical to a
    // synchronous structural+declared build (D8.2 convergence), since declared
    // ingest is replace-by-id idempotent over the structural graph.
    let declared_status = match json {
        Ok(json) => {
            let mut folded = (*cell.graph_arc()).clone();
            let (_, unavailable) = engine_graph::index::ingest_declared_from_json(
                &mut folded,
                &json,
                &cell.scope,
                crate::app::now_ms(),
            );
            // A COMPLETED fold replaces the carried declared set (declared-edge-
            // continuity ADR), captured BEFORE the move into `commit_graph`. The commit
            // diffs against the currently-served graph (carrying the PRIOR set), so
            // clients receive exactly the correction, never a full re-add.
            if unavailable.is_none() {
                capture_carried_declared(&cell, &folded);
            }
            // Commit the folded graph: emits declared deltas on the cell's per-scope
            // clock + ring, and bumps generation.
            cell.commit_graph(folded);
            unavailable
        }
        // Core unreachable: leave the structural graph served, report the
        // declared tier unavailable TRUTHFULLY (replaces the building sentinel).
        Err(reason) => Some(reason),
    };
    if let Ok(mut status) = cell.declared_status.write() {
        *status = declared_status;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault_root(dir: &std::path::Path) {
        std::fs::create_dir_all(dir.join(".vault/plan")).unwrap();
        std::fs::write(
            dir.join(".vault/plan/2026-06-14-reg-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#reg'\n---\n\nMentions `src/a.rs`.\n",
        )
        .unwrap();
    }

    fn git(dir: &std::path::Path, args: &[&str]) {
        let out = std::process::Command::new("git")
            .current_dir(dir)
            .args(args)
            .env("GIT_AUTHOR_NAME", "f")
            .env("GIT_AUTHOR_EMAIL", "f@t")
            .env("GIT_COMMITTER_NAME", "f")
            .env("GIT_COMMITTER_EMAIL", "f@t")
            .output()
            .expect("git runs");
        assert!(out.status.success(), "git {args:?}");
    }
    /// A real worktree cell holding a STRUCTURAL graph, for the declared-fold
    /// cache tests. Builds a one-commit git repo with one vault doc, opens a
    /// real store, and commits the structural-only graph (no declared tier yet).
    fn structural_cell(dir: &std::path::Path) -> (std::path::PathBuf, Arc<ScopeCell>) {
        git(dir, &["init", "-b", "main", "."]);
        vault_root(dir);
        git(dir, &["add", "."]);
        git(dir, &["commit", "-m", "fixture"]);
        let root = std::fs::canonicalize(dir).unwrap();
        let token = crate::routes::scope_token(&root);
        let store = engine_store::Store::open_or_heal(&root.join(".vault")).unwrap();
        let cell = Arc::new(ScopeCell::new(
            root.clone(),
            ScopeRef::Worktree {
                path: token.clone(),
            },
            store,
        ));
        // Commit STRUCTURAL only (no runtime here, but build it through the same
        // path index_worktree_structural produces, then commit directly so we do
        // NOT trip the sync-fallback declared ingest in rebuild_and_swap).
        let (structural, _) = {
            let store = cell.store.lock().unwrap();
            engine_graph::index::index_worktree_structural(
                &cell.root,
                &cell.scope,
                &store,
                crate::app::now_ms(),
            )
            .unwrap()
        };
        cell.commit_graph(structural);
        (root, cell)
    }

    /// A minimal valid `vaultspec.vault.graph.v2` `data` payload declaring ONE
    /// edge between two documents — the cacheable JSON the fold ingests.
    fn declared_graph_json() -> String {
        serde_json::json!({
            "nodes": [
                {"id": "2026-06-14-reg-plan", "doc_type": "plan"},
                {"id": "2026-06-14-reg-adr", "doc_type": "adr"}
            ],
            "edges": [
                {"source": "2026-06-14-reg-plan", "target": "2026-06-14-reg-adr", "kind": "related"}
            ]
        })
        .to_string()
    }

    #[tokio::test]
    async fn declared_fold_ingests_from_the_corpus_fingerprint_cache_without_a_subprocess() {
        // Perf ADR D1 + graph-worktree-edge-consistency ADR: the declared graph for
        // a given working-tree corpus is stable, so the fold caches the raw core
        // JSON by the corpus FINGERPRINT (not the HEAD sha — an uncommitted edit
        // leaves HEAD unchanged) and a fold over the same corpus is a cache HIT that
        // skips the ~16s subprocess. We prove the hit by PRE-SEEDING the cache with
        // valid graph-v2 JSON: core is unavailable in the test env (the temp dir is
        // not a vaultspec workspace), so the declared tier can ONLY become available
        // via the cache. If the fold ran the subprocess instead, it would fail and
        // declared_status would carry a failure reason — never None.
        let dir = tempfile::tempdir().unwrap();
        let (_root, cell) = structural_cell(dir.path());

        // The structural commit carries no declared edges yet.
        let structural_edges = cell.graph_arc().edge_count();

        // Seed the cache under the EXACT key the fold computes: the corpus
        // fingerprint of the cell's current graph, scope-qualified.
        let fingerprint =
            engine_graph::index::worktree_corpus_fingerprint(&cell.graph_arc(), &cell.scope);
        let key = declared_cache_key(&crate::routes::scope_token(&cell.root), &fingerprint);
        {
            let store = cell.store.lock().unwrap();
            store
                .put_artifact(
                    DECLARED_GRAPH_KIND,
                    &key,
                    &declared_graph_json(),
                    crate::app::now_ms(),
                )
                .unwrap();
        }

        // Run the fold's blocking body directly (no subprocess will run — the
        // cache hits). A Weak mirrors the real spawn path's leak-safety.
        let weak = Arc::downgrade(&cell);
        tokio::task::spawn_blocking(move || super::declared_fold_blocking(&weak))
            .await
            .unwrap();

        // The cached declared edge folded in: edge count grew, declared tier is
        // now AVAILABLE (status None) — only reachable via the cache here.
        assert!(
            cell.graph_arc().edge_count() > structural_edges,
            "the cached declared edge folded into the live graph"
        );
        assert_eq!(
            *cell.declared_status.read().unwrap(),
            None,
            "declared tier flips to available from the cache (no subprocess ran)"
        );
    }

    #[tokio::test]
    async fn rebuild_carries_last_good_declared_instead_of_flapping_to_building() {
        // Issue #4 / #1: on a routine re-index where declared was already available
        // AND the declared graph for the CURRENT corpus is cached (no `.vault/` change,
        // so the corpus fingerprint is unchanged), `rebuild_and_swap` must FOLD those
        // edges and keep the tier available — NOT
        // collapse `declared_status` to the building sentinel, which is what left the
        // "Still loading links…" banner flapping on every filesystem change. Runs
        // under a tokio runtime so the async (serve) branch is taken, not the sync
        // test fallback.
        let dir = tempfile::tempdir().unwrap();
        let (_root, cell) = structural_cell(dir.path());
        let structural_edges = cell.graph_arc().edge_count();

        // Prior state: declared was available (a previous fold succeeded) and the
        // declared graph for the CURRENT corpus is cached (no `.vault/` change this
        // re-index, so the corpus fingerprint is unchanged).
        *cell.declared_status.write().unwrap() = None;
        seed_declared_cache(&cell, "2026-06-14-reg-plan", "2026-06-14-reg-adr");

        // The re-index: a fresh structural rebuild + the carry-last-good declared fold.
        cell.rebuild_and_swap().unwrap();

        // The declared tier stayed AVAILABLE (no building sentinel), and its edges
        // are present in the freshly-committed graph — no flap, no gap.
        assert_eq!(
            *cell.declared_status.read().unwrap(),
            None,
            "declared stays available across a routine re-index (carry last-good), \
             never flapping to the building sentinel"
        );
        assert!(
            cell.graph_arc().edge_count() > structural_edges,
            "the cached declared edge is folded into the rebuilt graph (no gap)"
        );
    }

    #[tokio::test]
    async fn rebuild_reports_building_when_no_last_good_declared_is_cached() {
        // The honest cold-build / new-HEAD path: with no cached declared graph to
        // carry, `rebuild_and_swap` reports declared unavailable-while-building until
        // the async fold lands — the legitimate "building" case the banner may show.
        let dir = tempfile::tempdir().unwrap();
        let (_root, cell) = structural_cell(dir.path());
        // Prior available, but the cache is EMPTY (no seed) → nothing to carry.
        *cell.declared_status.write().unwrap() = None;

        cell.rebuild_and_swap().unwrap();

        assert_eq!(
            cell.declared_status.read().unwrap().as_deref(),
            Some(engine_graph::index::DECLARED_BUILDING),
            "with no cached declared graph, declared honestly reports building"
        );
    }

    /// Seed the declared-graph cache for the cell's CURRENT working-tree corpus
    /// (keyed on the corpus fingerprint the fold computes, not a HEAD sha — see the
    /// graph-worktree-edge-consistency ADR) with a JSON payload declaring one edge
    /// from `src` to `dst`, so the fold over that same corpus state hits the cache
    /// (no subprocess) and folds that specific edge. Call this AFTER committing the
    /// structural graph for the corpus state being seeded, so the fingerprint
    /// matches what the fold will compute.
    fn seed_declared_cache(cell: &ScopeCell, src: &str, dst: &str) {
        let json = serde_json::json!({
            "nodes": [
                {"id": src, "doc_type": "plan"},
                {"id": dst, "doc_type": "adr"}
            ],
            "edges": [ {"source": src, "target": dst, "kind": "related"} ]
        })
        .to_string();
        let fingerprint =
            engine_graph::index::worktree_corpus_fingerprint(&cell.graph_arc(), &cell.scope);
        let key = declared_cache_key(&crate::routes::scope_token(&cell.root), &fingerprint);
        let store = cell.store.lock().unwrap();
        store
            .put_artifact(DECLARED_GRAPH_KIND, &key, &json, crate::app::now_ms())
            .unwrap();
    }

    #[tokio::test]
    async fn a_rebuild_that_races_an_in_flight_fold_is_not_lost_trailing_edge() {
        // Review HIGH (perf ADR D1 trailing-edge race): F1 claims the fold slot
        // and begins folding at HEAD-A; a rebuild lands structural@HEAD-B and
        // finds the slot busy, so it cannot spawn its own fold. Without the
        // trailing-edge close, F1 finishes, clears the slot, and NO fold ever
        // runs at HEAD-B — the declared tier serves HEAD-A's edges over HEAD-B's
        // structural graph forever (B was the last change). This test forces
        // exactly that interleaving and asserts a fold DOES eventually run at
        // HEAD-B: the cell ends clean (slot free, no pending) with HEAD-B's
        // declared edge folded in.
        use std::sync::atomic::Ordering;

        let dir = tempfile::tempdir().unwrap();
        let (root, cell) = structural_cell(dir.path());
        let structural_edges = cell.graph_arc().edge_count();

        // HEAD-A (the corpus state F1 nominally folds at). Under fingerprint
        // keying the fold over the eventual HEAD-B corpus is what lands, so we seed
        // HEAD-B's declared cache below (after the structural re-commit), not A's.
        let head_a = engine_graph::asof::resolve_ref(&root, "HEAD").unwrap();

        // Simulate F1 in flight: claim the slot WITHOUT running the body yet.
        assert!(
            cell.declared_fold_active
                .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                .is_ok(),
            "the test claims the slot to stand in for an in-flight fold F1"
        );

        // The racing rebuild advances HEAD to B and re-commits structural at B,
        // then tries to spawn a fold — the slot is busy, so it must record the
        // trailing edge (pending) rather than drop the request.
        std::fs::write(
            root.join(".vault/plan/2026-06-14-reg-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#reg'\n---\n\nMentions `src/b.rs`.\n",
        )
        .unwrap();
        git(&root, &["add", "."]);
        git(&root, &["commit", "-m", "head-b"]);
        let head_b = engine_graph::asof::resolve_ref(&root, "HEAD").unwrap();
        assert_ne!(head_a, head_b, "HEAD actually advanced to B");
        // Re-commit the structural graph at HEAD-B (what the watcher's
        // rebuild_and_swap does), so the cell's CURRENT graph is HEAD-B's.
        {
            let (structural_b, _) = {
                let store = cell.store.lock().unwrap();
                engine_graph::index::index_worktree_structural(
                    &cell.root,
                    &cell.scope,
                    &store,
                    crate::app::now_ms(),
                )
                .unwrap()
            };
            cell.commit_graph(structural_b);
        }
        // Seed HEAD-B's declared cache NOW — after the re-commit, so the seed is
        // keyed on HEAD-B's corpus fingerprint, exactly what the fold computes from
        // the current graph (edge into `...-b-adr`).
        seed_declared_cache(&cell, "2026-06-14-reg-plan", "2026-06-14-b-adr");

        spawn_declared_fold(&cell);
        assert!(
            cell.declared_fold_pending.load(Ordering::Acquire),
            "a rebuild racing an in-flight fold records the trailing edge"
        );

        // F1 completes: run its blocking body (it owns the slot we claimed). Its
        // guard releases the slot, sees `pending`, and re-spawns a fold — which,
        // running at the CURRENT HEAD-B, hits HEAD-B's cache and folds B's edge.
        let weak = Arc::downgrade(&cell);
        tokio::task::spawn_blocking(move || super::declared_fold_blocking(&weak))
            .await
            .unwrap();

        // Let the re-spawned fold (and any further re-spawn) settle.
        for _ in 0..100 {
            if !cell.declared_fold_active.load(Ordering::Acquire)
                && !cell.declared_fold_pending.load(Ordering::Acquire)
            {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }

        // The trailing edge is closed: the cell ends clean and the declared tier
        // is AVAILABLE over HEAD-B's structural graph with HEAD-B's declared edge
        // present (the `...-b-adr` phantom node only exists if B's fold ran).
        assert!(
            !cell.declared_fold_active.load(Ordering::Acquire),
            "the fold slot is released after the chain settles"
        );
        assert!(
            !cell.declared_fold_pending.load(Ordering::Acquire),
            "no trailing edge is left owed once the chain settles"
        );
        assert_eq!(
            *cell.declared_status.read().unwrap(),
            None,
            "declared tier is available after the trailing fold"
        );
        assert!(
            cell.graph_arc().edge_count() > structural_edges,
            "a declared edge is folded into the live graph"
        );
        // Declared edges reference document nodes by id but do not mint them, so
        // assert on the EDGE to HEAD-B's target (`doc:2026-06-14-b-adr`), which
        // exists ONLY if a fold ran at HEAD-B (HEAD-A's cache targets `a-adr`).
        let b_dst = engine_model::node_id(&engine_model::CanonicalKey::Document {
            stem: "2026-06-14-b-adr",
        });
        let graph = cell.graph_arc();
        assert!(
            graph.edges().any(|s| s.edge.dst == b_dst),
            "HEAD-B's declared edge folded in — the trailing fold ran at the \
             CURRENT HEAD, not the superseded HEAD-A"
        );
        let a_dst = engine_model::node_id(&engine_model::CanonicalKey::Document {
            stem: "2026-06-14-a-adr",
        });
        assert!(
            !graph.edges().any(|s| s.edge.dst == a_dst),
            "no superseded HEAD-A declared edge survives once the fold runs at \
             HEAD-B (the fold clones the CURRENT structural graph, not A's)"
        );
    }

    #[test]
    fn declared_cache_key_is_deterministic_and_separates_scope_and_corpus_key() {
        // The cache key is a pure function of (scope token, corpus key — a
        // working-tree fingerprint for the present view or a commit sha for an
        // as-of build): stable for the same inputs, distinct when either changes —
        // so a rebuild over an unchanged corpus hits, and two scopes (or two corpus
        // states) never alias.
        let k = declared_cache_key("/ws/main", "abc123");
        assert_eq!(k, declared_cache_key("/ws/main", "abc123"), "stable");
        assert_ne!(
            k,
            declared_cache_key("/ws/feature", "abc123"),
            "different scope, different key"
        );
        assert_ne!(
            k,
            declared_cache_key("/ws/main", "def456"),
            "different corpus key, different key"
        );
    }

    /// A carried declared `StoredEdge` between two node ids (declared-edge-continuity
    /// ADR test seam).
    fn carried_edge(
        src: &engine_model::NodeId,
        dst: &engine_model::NodeId,
        scope: &ScopeRef,
    ) -> engine_graph::StoredEdge {
        engine_graph::StoredEdge {
            edge: engine_model::Edge {
                id: engine_model::EdgeId(format!("{}->{}", src.0, dst.0)),
                src: src.clone(),
                dst: dst.clone(),
                relation: engine_model::RelationKind::References,
                tier: engine_model::Tier::Declared,
                confidence: 1.0,
                state: None,
                provenance: engine_model::Provenance::CoreGraph {
                    payload_hash: "h".into(),
                    edge_id: "e".into(),
                },
                scope: scope.clone(),
                observed_at: 0,
            },
            attrs: engine_graph::EdgeAttrs::default(),
        }
    }

    #[test]
    fn carry_grafts_survivors_reports_refreshing_and_captures_the_set() {
        // declared-edge-continuity ADR: the carried set grafts onto a fresh graph
        // pruned to its nodes (a ghost endpoint drops), reports refreshing when any
        // survive (else the fallback), and a completed set is captured for the next
        // rebuild.
        let dir = tempfile::tempdir().unwrap();
        let (_root, cell) = structural_cell(dir.path());
        let id = cell.graph_arc().nodes().next().unwrap().id.clone();
        let ghost = engine_model::NodeId("doc:ghost-absent".into());

        // No carried set → the fallback reason; nothing grafted.
        let mut a = (*cell.graph_arc()).clone();
        assert_eq!(
            graft_carried_declared(&cell, &mut a, Some("fallback".into())).as_deref(),
            Some("fallback")
        );
        assert_eq!(a.declared_stored_edges().len(), 0);

        // Carried self-edge (endpoint present) + ghost edge (pruned) → refreshing, 1.
        *cell.declared_edges.write().unwrap() = Some(std::sync::Arc::new(vec![
            carried_edge(&id, &id, &cell.scope),
            carried_edge(&id, &ghost, &cell.scope),
        ]));
        let mut b = (*cell.graph_arc()).clone();
        assert_eq!(
            graft_carried_declared(&cell, &mut b, Some("fallback".into())).as_deref(),
            Some(engine_graph::index::DECLARED_REFRESHING)
        );
        assert_eq!(b.declared_stored_edges().len(), 1, "ghost endpoint pruned");

        // A completed fold captures the served declared set for the next rebuild.
        capture_carried_declared(&cell, &b);
        assert_eq!(
            cell.declared_edges.read().unwrap().as_ref().unwrap().len(),
            1
        );
    }
}
