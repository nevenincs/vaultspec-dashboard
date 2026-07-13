//! Generation-keyed row-listing delta reconciliation, shared by `/vault-tree` and
//! `/code-files` (vault-tree-delta ADR D2/D3 + its `/code-files` follow-on). The
//! ring, the diff, the torn-pair-safe memoize, and the delta assembly are all
//! KEY-GENERIC (vault rows key by `stem`, code rows by `path`); the only per-corpus
//! differences are the row-key extractor, the row builder, and (for code) the
//! walk-cap truncation honesty — never a copy-paste twin.
//!
//! A row set is a filter-independent projection that changes only on a graph
//! rebuild, so it is memoized per graph `generation` (the ring's freshest slot is
//! the memo). The ring additionally RETAINS a small capped history of prior
//! generations' row vectors — `Arc`-shared with the memo, so retention is nearly
//! free — so the delta route can diff a client's held generation against the
//! current one. The generation counter is per-cell and process-local: an engine
//! restart starts the ring empty, so a `since` from a previous process is
//! unanswerable and honestly yields a full-drain instruction.

use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::{Value, json};

use crate::app::{CodeGraphCell, ScopeCell};

/// Snapshot-ring capacity (D2): retain the last N generations' row vectors for the
/// delta route to diff against. A bounded accumulator (resource-bounds: every
/// accumulator carries an explicit cap at creation) — the oldest is evicted, and
/// each retained entry only `Arc`-shares a vector the memo already built.
pub(crate) const ROW_SNAPSHOT_RING_CAP: usize = 8;

/// Build attempts before `memoize_rows_at` gives up on a stable `(generation, rows)`
/// pair and serves an unrecorded build (review MEDIUM: never record a pair whose
/// label moved during the build).
const ROW_BUILD_RETRIES: usize = 4;

/// A bounded ring of `(generation, Arc<rows>)` snapshots, oldest-first. The
/// freshest entry (`back`) is the per-generation memo; the older entries are delta
/// baselines. Entries `Arc`-share the memo's row vectors, so only superseded
/// generations hold extra memory until evicted. Key-agnostic — it stores whole row
/// vectors, so vault and code share it unchanged.
#[derive(Default)]
pub(crate) struct RowSnapshotRing {
    snapshots: VecDeque<(u64, Arc<Vec<Value>>)>,
}

impl RowSnapshotRing {
    /// The current-generation rows, iff the freshest slot matches `generation`
    /// (the warm memo hit).
    fn current(&self, generation: u64) -> Option<Arc<Vec<Value>>> {
        match self.snapshots.back() {
            Some((g, rows)) if *g == generation => Some(rows.clone()),
            _ => None,
        }
    }

    /// Record a freshly-built generation as the new current, evicting the oldest
    /// beyond the cap. Idempotent: re-recording the current generation is a no-op
    /// (a race that rebuilds the same generation twice keeps ONE ring entry).
    /// `generation` is monotonic, so the ring stays ascending.
    fn record(&mut self, generation: u64, rows: Arc<Vec<Value>>) {
        if self.snapshots.back().is_some_and(|(g, _)| *g == generation) {
            return;
        }
        self.snapshots.push_back((generation, rows));
        while self.snapshots.len() > ROW_SNAPSHOT_RING_CAP {
            self.snapshots.pop_front();
        }
    }

    /// A retained snapshot for `generation`, if it is still in the ring (not yet
    /// evicted). `None` means the baseline is unknown — evicted, never seen, or
    /// from a previous process — and the delta must instruct a full drain.
    fn snapshot(&self, generation: u64) -> Option<Arc<Vec<Value>>> {
        self.snapshots
            .iter()
            .rev()
            .find(|(g, _)| *g == generation)
            .map(|(_, rows)| rows.clone())
    }
}

/// The outcome of a `since=<generation>` delta request (D3).
pub(crate) enum RowDelta {
    /// `since == current`: nothing changed since the client's generation.
    Unchanged { generation: u64 },
    /// `since` is unknown (evicted, never served, from a previous process, or over a
    /// truncated corpus): the client must fall back to a full drain. Never a wrong
    /// patch.
    FullRequired { generation: u64 },
    /// The key-keyed diff from `since` to the current `generation`: `changed` carries
    /// full rows (added or modified), `removed` carries dropped keys.
    Delta {
        since: u64,
        generation: u64,
        changed: Vec<Value>,
        removed: Vec<String>,
    },
}

/// A row's identity key extractor (vault: `stem`, code: `path`, graph slice: `id`)
/// — the field the row is keyed by, so a row missing it is skipped from the keyed
/// sides rather than mis-diffed.
pub(crate) type RowKey = fn(&Value) -> Option<&str>;

fn stem_key(row: &Value) -> Option<&str> {
    row["stem"].as_str()
}

fn path_key(row: &Value) -> Option<&str> {
    row["path"].as_str()
}

/// Key a row by its `id` field — the graph-slice node/edge identity
/// (graph-slice-delta ADR: nodes and edges both carry a stable `id`).
pub(crate) fn id_key(row: &Value) -> Option<&str> {
    row["id"].as_str()
}

/// Diff two keyed row sets: a row present in `current` that is new or whose full
/// value differs from `baseline` is CHANGED (added or modified); a key in
/// `baseline` absent from `current` is REMOVED. O(N) over in-memory rows.
pub(crate) fn diff_rows(
    baseline: &[Value],
    current: &[Value],
    key: RowKey,
) -> (Vec<Value>, Vec<String>) {
    use std::collections::{HashMap, HashSet};
    let baseline_by: HashMap<&str, &Value> = baseline
        .iter()
        .filter_map(|row| key(row).map(|k| (k, row)))
        .collect();
    let mut changed = Vec::new();
    let mut current_keys: HashSet<&str> = HashSet::new();
    for row in current {
        let Some(k) = key(row) else { continue };
        current_keys.insert(k);
        match baseline_by.get(k) {
            // Unchanged: same key, byte-identical row value.
            Some(prev) if *prev == row => {}
            // Added (unknown key) or modified (differing value).
            _ => changed.push(row.clone()),
        }
    }
    let mut removed = Vec::new();
    for row in baseline {
        if let Some(k) = key(row)
            && !current_keys.contains(k)
        {
            removed.push(k.to_string());
        }
    }
    (changed, removed)
}

/// Read the current rows AND the generation they belong to as one consistent pair,
/// recording the pair into the ring (D1/D2). Torn-pair guard (review MEDIUM): a
/// rebuild swaps the graph BEFORE bumping the generation, so a build racing a
/// rebuild can produce rows NEWER than a generation label read up front — a
/// mislabeled ring entry is a poisoned delta baseline. Only record when the counter
/// held stable across the build; a moved counter discards the build and retries.
/// Under a continuous-bump pathology the freshest build is served UNRECORDED at the
/// latest label, so a later `since=` misses the ring and degrades honestly to
/// `FullRequired`. `record` is `false` for a state that must never become a delta
/// baseline (a walk-capped/truncated code corpus).
pub(crate) fn memoize_rows_at(
    generation: &AtomicU64,
    ring: &Mutex<RowSnapshotRing>,
    record: bool,
    build: impl Fn() -> Vec<Value>,
) -> (u64, Arc<Vec<Value>>) {
    // Poison recovery (robustness H2): see `graph_arc`. The ring lock serializes
    // builders, so the retry loop settles immediately in practice.
    let mut ring = ring.lock().unwrap_or_else(|e| e.into_inner());
    for _ in 0..ROW_BUILD_RETRIES {
        let g = generation.load(Ordering::SeqCst);
        if let Some(rows) = ring.current(g) {
            return (g, rows);
        }
        let fresh = Arc::new(build());
        if generation.load(Ordering::SeqCst) == g {
            if record {
                ring.record(g, fresh.clone());
            }
            return (g, fresh);
        }
    }
    (generation.load(Ordering::SeqCst), Arc::new(build()))
}

/// Assemble the delta outcome from a `(generation, current rows)` pair and the ring
/// (D3). `force_full_required` short-circuits to a full drain for a state with no
/// stable complete baseline (a truncated code corpus). `since == generation` is an
/// empty delta; a `since` the ring no longer holds yields `FullRequired`; otherwise
/// the keyed diff.
fn ring_delta(
    since: u64,
    generation: u64,
    current: &[Value],
    ring: &RowSnapshotRing,
    force_full_required: bool,
    key: RowKey,
) -> RowDelta {
    if force_full_required {
        return RowDelta::FullRequired { generation };
    }
    if since == generation {
        return RowDelta::Unchanged { generation };
    }
    match ring.snapshot(since) {
        Some(baseline) => {
            let (changed, removed) = diff_rows(&baseline, current, key);
            RowDelta::Delta {
                since,
                generation,
                changed,
                removed,
            }
        }
        None => RowDelta::FullRequired { generation },
    }
}

/// Serialize a `RowDelta` into the shared `/…/delta` envelope data (D3), used by
/// BOTH the vault-tree and code-files delta routes: a real diff carries
/// `{since, generation, changed, removed}`, an unchanged generation the same shape
/// with empty lists (echoing the requested `since`), and an unknown/truncated
/// baseline `{generation, full_required: true}`.
pub(crate) fn row_delta_envelope_data(delta: RowDelta, requested_since: u64) -> Value {
    match delta {
        RowDelta::Unchanged { generation } => json!({
            "since": requested_since,
            "generation": generation,
            "changed": [],
            "removed": [],
        }),
        RowDelta::FullRequired { generation } => json!({
            "generation": generation,
            "full_required": true,
        }),
        RowDelta::Delta {
            since,
            generation,
            changed,
            removed,
        } => json!({
            "since": since,
            "generation": generation,
            "changed": changed,
            "removed": removed,
        }),
    }
}

impl ScopeCell {
    /// The stem-sorted `/vault-tree` rows for the current generation, memoized in
    /// the ring's freshest slot. Invalidated on a generation bump exactly like
    /// `document_views`.
    pub fn vault_tree_rows(&self) -> Arc<Vec<Value>> {
        self.vault_tree_rows_at().1
    }

    /// The current vault rows AND their generation as one consistent pair (D1), the
    /// full route's delta baseline. Delegates the torn-pair-safe memoize.
    pub(crate) fn vault_tree_rows_at(&self) -> (u64, Arc<Vec<Value>>) {
        memoize_rows_at(&self.generation, &self.vault_tree_rows_ring, true, || {
            engine_query::graph::build_vault_tree_rows(&self.graph_arc(), &self.scope)
        })
    }

    /// The stem-keyed vault-tree delta from the client's held `since` generation
    /// (D3).
    pub(crate) fn vault_tree_delta(&self, since: u64) -> RowDelta {
        let (generation, current) = self.vault_tree_rows_at();
        let ring = self
            .vault_tree_rows_ring
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        ring_delta(since, generation, &current, &ring, false, stem_key)
    }
}

impl CodeGraphCell {
    /// The current path-sorted `/code-files` rows, their generation, AND whether the
    /// corpus is walk-capped (truncated), as one consistent triple. A truncated
    /// listing is NOT a stable complete baseline, so it is NEVER recorded in the ring
    /// (`record = !truncated`) — a later `since=` against a truncated generation
    /// misses the ring and degrades to `FullRequired`. The caller has already
    /// `ensure_fresh`ed the lazy corpus; the build closure re-reads the CURRENT
    /// graph per attempt (review LOW parity with the vault path) so a retry after
    /// a mid-build generation bump rebuilds from the settled graph, never a stale
    /// capture.
    pub(crate) fn code_file_rows_at(&self) -> (u64, Arc<Vec<Value>>, bool) {
        let truncated = self.stats_snapshot().is_some_and(|s| s.capped);
        let (generation, rows) = memoize_rows_at(
            &self.generation,
            &self.code_file_rows_ring,
            !truncated,
            || engine_query::graph::build_code_file_rows(&self.graph_arc()),
        );
        (generation, rows, truncated)
    }

    /// The path-keyed code-files delta from the client's held `since` generation
    /// (D3). A truncated corpus forces `FullRequired` (a capped listing has no
    /// stable complete baseline).
    pub(crate) fn code_file_delta(&self, since: u64) -> RowDelta {
        let (generation, current, truncated) = self.code_file_rows_at();
        let ring = self
            .code_file_rows_ring
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        ring_delta(since, generation, &current, &ring, truncated, path_key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn rows(keyed: &[(&str, &str)], key_field: &str) -> Arc<Vec<Value>> {
        Arc::new(
            keyed
                .iter()
                .map(|(k, title)| json!({ key_field: k, "title": title }))
                .collect(),
        )
    }

    #[test]
    fn ring_hits_the_current_generation_and_misses_others() {
        let mut ring = RowSnapshotRing::default();
        assert!(ring.current(0).is_none(), "empty ring never hits");
        let g1 = rows(&[("a", "A")], "stem");
        ring.record(1, g1.clone());
        assert!(
            ring.current(1).is_some_and(|r| Arc::ptr_eq(&r, &g1)),
            "the freshest slot is the warm memo (same Arc)"
        );
        assert!(ring.current(2).is_none(), "a non-current generation misses");
        // Re-recording the current generation is idempotent (race guard).
        ring.record(1, rows(&[("z", "Z")], "stem"));
        assert!(
            ring.current(1).is_some_and(|r| Arc::ptr_eq(&r, &g1)),
            "re-recording the current generation keeps the original entry"
        );
    }

    #[test]
    fn ring_retains_prior_snapshots_and_evicts_oldest_beyond_cap() {
        let mut ring = RowSnapshotRing::default();
        for g in 1..=(ROW_SNAPSHOT_RING_CAP as u64 + 2) {
            ring.record(g, rows(&[("a", "A")], "stem"));
        }
        let newest = ROW_SNAPSHOT_RING_CAP as u64 + 2;
        assert!(
            ring.snapshot(1).is_none(),
            "generation 1 evicted past the cap"
        );
        assert!(
            ring.snapshot(2).is_none(),
            "generation 2 evicted past the cap"
        );
        assert!(
            ring.snapshot(newest - ROW_SNAPSHOT_RING_CAP as u64 + 1)
                .is_some(),
            "the oldest still-retained generation survives"
        );
        assert!(
            ring.snapshot(newest).is_some(),
            "the current generation is retained"
        );
        assert!(
            ring.current(newest).is_some(),
            "the newest is the current memo"
        );
    }

    #[test]
    fn diff_reports_changed_added_removed_and_a_noop_keyed_by_stem() {
        let baseline = rows(&[("a", "A"), ("b", "B"), ("c", "C")], "stem");
        // b modified (title change), c removed, d added, a unchanged.
        let current = rows(&[("a", "A"), ("b", "B2"), ("d", "D")], "stem");
        let (changed, removed) = diff_rows(&baseline, &current, stem_key);
        let changed_keys: Vec<&str> = changed
            .iter()
            .map(|r| r["stem"].as_str().unwrap())
            .collect();
        assert_eq!(changed_keys, vec!["b", "d"], "modified + added are changed");
        assert_eq!(
            removed,
            vec!["c".to_string()],
            "the dropped stem is removed"
        );

        let (noop_changed, noop_removed) = diff_rows(&baseline, &baseline, stem_key);
        assert!(
            noop_changed.is_empty() && noop_removed.is_empty(),
            "identical rows: empty delta"
        );
    }

    #[test]
    fn diff_is_key_generic_over_path_for_code_rows() {
        // The SAME diff, keyed by `path` (code rows) instead of `stem`.
        let baseline = rows(&[("src/a.rs", "A"), ("src/b.rs", "B")], "path");
        let current = rows(&[("src/a.rs", "A"), ("src/c.rs", "C")], "path");
        let (changed, removed) = diff_rows(&baseline, &current, path_key);
        let changed_keys: Vec<&str> = changed
            .iter()
            .map(|r| r["path"].as_str().unwrap())
            .collect();
        assert_eq!(changed_keys, vec!["src/c.rs"], "the added path is changed");
        assert_eq!(
            removed,
            vec!["src/b.rs".to_string()],
            "the dropped path is removed"
        );
    }

    #[test]
    fn ring_delta_short_circuits_and_full_requires() {
        let current = rows(&[("a", "A")], "stem");
        let mut ring = RowSnapshotRing::default();
        ring.record(5, current.clone());
        // since == current → empty (Unchanged).
        assert!(matches!(
            ring_delta(5, 5, &current, &ring, false, stem_key),
            RowDelta::Unchanged { generation: 5 }
        ));
        // A truncated corpus forces FullRequired regardless of since.
        assert!(matches!(
            ring_delta(5, 5, &current, &ring, true, stem_key),
            RowDelta::FullRequired { generation: 5 }
        ));
        // An unknown (never-recorded) since → FullRequired.
        assert!(matches!(
            ring_delta(2, 5, &current, &ring, false, stem_key),
            RowDelta::FullRequired { generation: 5 }
        ));
    }
}
