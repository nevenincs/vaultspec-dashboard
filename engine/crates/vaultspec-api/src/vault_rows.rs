//! The stem-sorted `/vault-tree` row projection: the per-generation memo plus the
//! bounded snapshot ring that backs the generation-keyed delta route
//! (vault-tree-delta ADR D2/D3). Extracted from `app.rs` so the memo, the ring,
//! and the diff live together and `app.rs` stops growing (module-size gate).
//!
//! The row set is a filter-independent projection that changes only on a graph
//! rebuild, so it is memoized per graph `generation` (the ring's freshest slot is
//! the memo). The ring additionally RETAINS a small capped history of prior
//! generations' row vectors — `Arc`-shared with the memo, so retention is nearly
//! free — so the delta route can diff a client's held generation against the
//! current one by stem. The generation counter is per-`ScopeCell` and
//! process-local: an engine restart starts the ring empty, so a `since` from a
//! previous process is unanswerable and honestly yields a full-drain instruction.

use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::atomic::Ordering;

use serde_json::Value;

use crate::app::ScopeCell;

/// Snapshot-ring capacity (D2): retain the last N generations' row vectors for the
/// delta route to diff against. A bounded accumulator (resource-bounds: every
/// accumulator carries an explicit cap at creation) — the oldest is evicted, and
/// each retained entry only `Arc`-shares a vector the memo already built.
pub(crate) const VAULT_ROWS_RING_CAP: usize = 8;

/// Build attempts before `vault_tree_rows_at` gives up on a stable
/// `(generation, rows)` pair and serves an unrecorded build (review MEDIUM:
/// never record a pair whose label moved during the build).
const VAULT_ROWS_BUILD_RETRIES: usize = 4;

/// A bounded ring of `(generation, Arc<rows>)` snapshots, oldest-first. The
/// freshest entry (`back`) is the per-generation memo; the older entries are delta
/// baselines. Entries `Arc`-share the memo's row vectors, so only superseded
/// generations hold extra memory until evicted.
#[derive(Default)]
pub(crate) struct VaultRowsRing {
    snapshots: VecDeque<(u64, Arc<Vec<Value>>)>,
}

impl VaultRowsRing {
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
        while self.snapshots.len() > VAULT_ROWS_RING_CAP {
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
pub(crate) enum VaultTreeDelta {
    /// `since == current`: nothing changed since the client's generation.
    Unchanged { generation: u64 },
    /// `since` is unknown (evicted, never served, or from a previous process): the
    /// client must fall back to a full drain. Never a wrong patch.
    FullRequired { generation: u64 },
    /// The stem-keyed diff from `since` to the current `generation`: `changed`
    /// carries full rows (added or modified), `removed` carries dropped stems.
    Delta {
        since: u64,
        generation: u64,
        changed: Vec<Value>,
        removed: Vec<String>,
    },
}

/// Diff two stem-keyed row sets: a row present in `current` that is new or whose
/// full value differs from `baseline` is CHANGED (added or modified); a stem in
/// `baseline` absent from `current` is REMOVED. O(N) over in-memory rows. The
/// stem is the row's identity key (`build_vault_tree_rows` sorts by it), so a row
/// with no string `stem` is skipped from the keyed sides rather than mis-diffed.
fn diff_vault_rows(baseline: &[Value], current: &[Value]) -> (Vec<Value>, Vec<String>) {
    use std::collections::{HashMap, HashSet};
    fn stem_of(row: &Value) -> Option<&str> {
        row["stem"].as_str()
    }
    let baseline_by: HashMap<&str, &Value> = baseline
        .iter()
        .filter_map(|row| stem_of(row).map(|stem| (stem, row)))
        .collect();
    let mut changed = Vec::new();
    let mut current_stems: HashSet<&str> = HashSet::new();
    for row in current {
        let Some(stem) = stem_of(row) else { continue };
        current_stems.insert(stem);
        match baseline_by.get(stem) {
            // Unchanged: same stem, byte-identical row value.
            Some(prev) if *prev == row => {}
            // Added (unknown stem) or modified (differing value).
            _ => changed.push(row.clone()),
        }
    }
    let mut removed = Vec::new();
    for row in baseline {
        if let Some(stem) = stem_of(row)
            && !current_stems.contains(stem)
        {
            removed.push(stem.to_string());
        }
    }
    (changed, removed)
}

impl ScopeCell {
    /// The stem-sorted `/vault-tree` rows for the current generation, memoized in
    /// the ring's freshest slot. The Tree view re-projected + re-sorted every
    /// `doc:` node on every poll; this serves the sorted listing from cache (the
    /// handler paginates the slice per request). Invalidated on a generation bump
    /// exactly like `document_views`.
    pub fn vault_tree_rows(&self) -> Arc<Vec<Value>> {
        self.vault_tree_rows_at().1
    }

    /// The current rows AND the generation they belong to, read as one consistent
    /// pair under the ring lock (D1: the full route serves this generation so a
    /// client can use it as a delta baseline; a bare `generation.load()` beside a
    /// separate rows read could report a newer generation than the rows). Building
    /// records the generation into the ring so a later `since=` request can diff
    /// against it.
    pub(crate) fn vault_tree_rows_at(&self) -> (u64, Arc<Vec<Value>>) {
        // Poison recovery (robustness H2): see `graph_arc`.
        let mut ring = self
            .vault_tree_rows_ring
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        // Review MEDIUM (vault-tree-delta): `rebuild_and_swap` swaps the graph
        // BEFORE bumping the generation, so a build racing a rebuild can produce
        // rows NEWER than a generation label read up front — and a mislabeled ring
        // entry is a poisoned delta baseline. Only record the pair when the
        // counter is unchanged across the build; a moved counter discards the
        // build and retries against the settled state. Bounded: bumps are rare
        // and the ring lock serializes builders, so the loop settles immediately
        // in practice.
        for _ in 0..VAULT_ROWS_BUILD_RETRIES {
            let generation = self.generation.load(Ordering::SeqCst);
            if let Some(rows) = ring.current(generation) {
                return (generation, rows);
            }
            let fresh = Arc::new(engine_query::graph::build_vault_tree_rows(
                &self.graph_arc(),
                &self.scope,
            ));
            if self.generation.load(Ordering::SeqCst) == generation {
                ring.record(generation, fresh.clone());
                return (generation, fresh);
            }
        }
        // Continuously-bumping pathology: serve the freshest build UNRECORDED at
        // the latest label. A later `since=` against this label misses the ring
        // and degrades honestly to `FullRequired` — never a wrong diff.
        let generation = self.generation.load(Ordering::SeqCst);
        let fresh = Arc::new(engine_query::graph::build_vault_tree_rows(
            &self.graph_arc(),
            &self.scope,
        ));
        (generation, fresh)
    }

    /// Diff the client's held `since` generation against the current rows (D3).
    /// `since == current` is a no-op empty delta; a `since` the ring no longer
    /// holds (evicted/restarted/never-seen) yields `FullRequired`; otherwise the
    /// stem-keyed diff. Read-only over in-memory rows.
    pub(crate) fn vault_tree_delta(&self, since: u64) -> VaultTreeDelta {
        let (generation, current_rows) = self.vault_tree_rows_at();
        if since == generation {
            return VaultTreeDelta::Unchanged { generation };
        }
        let baseline = self
            .vault_tree_rows_ring
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .snapshot(since);
        match baseline {
            Some(baseline) => {
                let (changed, removed) = diff_vault_rows(&baseline, &current_rows);
                VaultTreeDelta::Delta {
                    since,
                    generation,
                    changed,
                    removed,
                }
            }
            None => VaultTreeDelta::FullRequired { generation },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn rows(stems: &[(&str, &str)]) -> Arc<Vec<Value>> {
        Arc::new(
            stems
                .iter()
                .map(|(stem, title)| json!({"stem": stem, "title": title}))
                .collect(),
        )
    }

    #[test]
    fn ring_hits_the_current_generation_and_misses_others() {
        let mut ring = VaultRowsRing::default();
        assert!(ring.current(0).is_none(), "empty ring never hits");
        let g1 = rows(&[("a", "A")]);
        ring.record(1, g1.clone());
        assert!(
            ring.current(1).is_some_and(|r| Arc::ptr_eq(&r, &g1)),
            "the freshest slot is the warm memo (same Arc)"
        );
        assert!(ring.current(2).is_none(), "a non-current generation misses");
        // Re-recording the current generation is idempotent (race guard).
        ring.record(1, rows(&[("z", "Z")]));
        assert!(
            ring.current(1).is_some_and(|r| Arc::ptr_eq(&r, &g1)),
            "re-recording the current generation keeps the original entry"
        );
    }

    #[test]
    fn ring_retains_prior_snapshots_and_evicts_oldest_beyond_cap() {
        let mut ring = VaultRowsRing::default();
        for g in 1..=(VAULT_ROWS_RING_CAP as u64 + 2) {
            ring.record(g, rows(&[("a", "A")]));
        }
        let newest = VAULT_ROWS_RING_CAP as u64 + 2;
        // The two oldest generations were evicted; the cap's worth is retained.
        assert!(
            ring.snapshot(1).is_none(),
            "generation 1 evicted past the cap"
        );
        assert!(
            ring.snapshot(2).is_none(),
            "generation 2 evicted past the cap"
        );
        assert!(
            ring.snapshot(newest - VAULT_ROWS_RING_CAP as u64 + 1)
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
    fn diff_reports_changed_added_removed_and_a_noop() {
        let baseline = rows(&[("a", "A"), ("b", "B"), ("c", "C")]);
        // b modified (title change), c removed, d added, a unchanged.
        let current = rows(&[("a", "A"), ("b", "B2"), ("d", "D")]);
        let (changed, removed) = diff_vault_rows(&baseline, &current);
        let changed_stems: Vec<&str> = changed
            .iter()
            .map(|r| r["stem"].as_str().unwrap())
            .collect();
        assert_eq!(
            changed_stems,
            vec!["b", "d"],
            "modified + added are changed"
        );
        assert_eq!(
            removed,
            vec!["c".to_string()],
            "the dropped stem is removed"
        );

        // A no-op diff (identical sets) yields nothing.
        let (noop_changed, noop_removed) = diff_vault_rows(&baseline, &baseline);
        assert!(
            noop_changed.is_empty() && noop_removed.is_empty(),
            "identical rows: empty delta"
        );
    }
}
