//! Generation-keyed DOCUMENT graph-slice delta (graph-slice-delta ADR D2/D3).
//! Sibling of `crate::row_delta`: the listings ring is single-level (generation →
//! rows), but the served graph slice is deterministic per (query-params
//! fingerprint, generation), so this ring is TWO-LEVEL — a small bounded set of
//! param-combos, each holding a small bounded ring of per-generation slice
//! snapshots. Node and edge diffs reuse `row_delta::diff_rows` keyed by `id`
//! (nodes and edges both carry a stable `id`), so there is no diff twin.
//!
//! A snapshot `Arc`-shares the exact served nodes/edges (the handler wraps them in
//! `Arc` and serializes the same `Arc` into the response, so recording is cheap).
//! The generation counter is per-scope and process-local (vault-tree-delta ADR
//! constraint): a restart starts the ring empty, so an unknown `since` — or a
//! params combo not in the ring — honestly yields `full_required`.

use std::collections::VecDeque;
use std::sync::Arc;

use serde_json::Value;

use crate::app::ScopeCell;
use crate::row_delta::{diff_rows, id_key};

/// How many distinct query-param combos the ring retains (D2 outer bound). The
/// stage holds ~one document + one constellation query at a time, so a handful of
/// combos covers the live set; the least-recently-served combo is evicted.
pub(crate) const GRAPH_SLICE_PARAMS_CAP: usize = 4;

/// How many generations per combo the ring retains (D2 inner bound). A client's
/// held generation is usually the immediately-previous one, so a shallow depth
/// answers the common delta; older generations evict (→ honest `full_required`).
pub(crate) const GRAPH_SLICE_GEN_DEPTH: usize = 4;

/// The exact served document slice a client holds (D2): nodes + edges + the
/// honesty `truncated` block, each `Arc`-shared with the response the handler sent.
#[derive(Clone)]
pub(crate) struct SliceSnapshot {
    pub nodes: Arc<Vec<Value>>,
    pub edges: Arc<Vec<Value>>,
    /// The served `truncated` block (node-ceiling honesty); `None` when the slice
    /// fit under the ceiling. A snapshot↔current truncation DIFFERENCE forces
    /// `full_required` (truncation composition is not diffable honestly, ADR).
    pub truncated: Option<Value>,
}

/// A bounded per-combo ring of `(generation, snapshot)`, newest at the back.
#[derive(Default)]
struct GenerationRing {
    snapshots: VecDeque<(u64, SliceSnapshot)>,
}

impl GenerationRing {
    fn record(&mut self, generation: u64, snapshot: SliceSnapshot) {
        // Idempotent on the newest generation (a repeat serve at the same gen).
        if self.snapshots.back().is_some_and(|(g, _)| *g == generation) {
            return;
        }
        self.snapshots.push_back((generation, snapshot));
        while self.snapshots.len() > GRAPH_SLICE_GEN_DEPTH {
            self.snapshots.pop_front();
        }
    }

    fn snapshot(&self, generation: u64) -> Option<&SliceSnapshot> {
        self.snapshots
            .iter()
            .rev()
            .find(|(g, _)| *g == generation)
            .map(|(_, snap)| snap)
    }
}

/// The two-level ring: LRU-ordered param-combos, each with its generation ring.
/// Bounded at BOTH levels (resource-bounds: every accumulator capped at creation).
#[derive(Default)]
pub(crate) struct GraphSliceRing {
    /// `(fingerprint, ring)`, least-recently-served combo at the FRONT.
    combos: VecDeque<(String, GenerationRing)>,
}

impl GraphSliceRing {
    /// Record a served slice at `(fingerprint, generation)`, creating the combo (and
    /// evicting the least-recently-served combo past the cap) and touching it to the
    /// back as most-recently-served.
    fn record(&mut self, fingerprint: &str, generation: u64, snapshot: SliceSnapshot) {
        if let Some(pos) = self.combos.iter().position(|(f, _)| f == fingerprint) {
            let (f, mut ring) = self.combos.remove(pos).expect("position valid");
            ring.record(generation, snapshot);
            self.combos.push_back((f, ring));
            return;
        }
        let mut ring = GenerationRing::default();
        ring.record(generation, snapshot);
        self.combos.push_back((fingerprint.to_string(), ring));
        while self.combos.len() > GRAPH_SLICE_PARAMS_CAP {
            self.combos.pop_front();
        }
    }

    /// A retained snapshot for `(fingerprint, generation)`, if still held. `None`
    /// (combo evicted / never served / generation evicted / previous process)
    /// means the client must full-drain.
    fn snapshot(&self, fingerprint: &str, generation: u64) -> Option<SliceSnapshot> {
        self.combos
            .iter()
            .find(|(f, _)| f == fingerprint)
            .and_then(|(_, ring)| ring.snapshot(generation).cloned())
    }
}

/// The outcome of a `since=<generation>` graph-slice delta request (D3).
pub(crate) enum GraphSliceDelta {
    /// `since == current`: nothing changed since the client's generation.
    Unchanged { generation: u64 },
    /// The `(params, since)` snapshot is not retained, or truncation composition
    /// differs: the client must full-drain. Never a wrong patch.
    FullRequired { generation: u64 },
    /// The id-keyed node + edge diff from `since` to the current `generation`.
    Delta {
        since: u64,
        generation: u64,
        changed_nodes: Vec<Value>,
        removed_node_ids: Vec<String>,
        changed_edges: Vec<Value>,
        removed_edge_ids: Vec<String>,
        truncated: Option<Value>,
    },
}

/// Diff a retained baseline snapshot against the current served slice by node/edge
/// `id`. A `truncated`-block difference is a conservative `full_required` (the ADR:
/// truncation composition is not diffable honestly).
fn diff_snapshots(
    baseline: &SliceSnapshot,
    current: &SliceSnapshot,
    since: u64,
    generation: u64,
) -> GraphSliceDelta {
    if baseline.truncated != current.truncated {
        return GraphSliceDelta::FullRequired { generation };
    }
    let (changed_nodes, removed_node_ids) = diff_rows(&baseline.nodes, &current.nodes, id_key);
    let (changed_edges, removed_edge_ids) = diff_rows(&baseline.edges, &current.edges, id_key);
    GraphSliceDelta::Delta {
        since,
        generation,
        changed_nodes,
        removed_node_ids,
        changed_edges,
        removed_edge_ids,
        truncated: current.truncated.clone(),
    }
}

impl ScopeCell {
    /// Record a served document slice into the ring (D2). Called by the full
    /// `/graph/query` handler AND the delta route (recording the freshly-served
    /// current slice keeps the ring warm), for the PRESENT-VIEW document vault path
    /// only — `as_of`/feature/code paths never record.
    pub(crate) fn record_graph_slice(
        &self,
        fingerprint: &str,
        generation: u64,
        snapshot: SliceSnapshot,
    ) {
        self.graph_slice_ring
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .record(fingerprint, generation, snapshot);
    }

    /// Diff the client's held `since` generation against the freshly-served `current`
    /// slice (D3). `since == current` is an empty delta; a `(fingerprint, since)` the
    /// ring no longer holds — or a truncation difference — yields `FullRequired`.
    pub(crate) fn graph_slice_delta(
        &self,
        fingerprint: &str,
        since: u64,
        current: &SliceSnapshot,
        generation: u64,
    ) -> GraphSliceDelta {
        if since == generation {
            return GraphSliceDelta::Unchanged { generation };
        }
        let baseline = self
            .graph_slice_ring
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .snapshot(fingerprint, since);
        match baseline {
            Some(baseline) => diff_snapshots(&baseline, current, since, generation),
            None => GraphSliceDelta::FullRequired { generation },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn snap(
        node_ids: &[(&str, &str)],
        edge_ids: &[&str],
        truncated: Option<Value>,
    ) -> SliceSnapshot {
        SliceSnapshot {
            nodes: Arc::new(
                node_ids
                    .iter()
                    .map(|(id, title)| json!({"id": id, "title": title}))
                    .collect(),
            ),
            edges: Arc::new(edge_ids.iter().map(|id| json!({"id": id})).collect()),
            truncated,
        }
    }

    #[test]
    fn ring_is_bounded_at_both_levels_and_lru_evicts_combos() {
        let mut ring = GraphSliceRing::default();
        // Fill one combo past its generation depth: oldest generations evict.
        for g in 1..=(GRAPH_SLICE_GEN_DEPTH as u64 + 2) {
            ring.record("params-a", g, snap(&[("n1", "A")], &["e1"], None));
        }
        let newest = GRAPH_SLICE_GEN_DEPTH as u64 + 2;
        assert!(ring.snapshot("params-a", 1).is_none(), "gen 1 evicted");
        assert!(
            ring.snapshot("params-a", newest).is_some(),
            "current gen retained"
        );
        assert!(
            ring.snapshot("params-a", newest - GRAPH_SLICE_GEN_DEPTH as u64 + 1)
                .is_some(),
            "the oldest still-retained generation survives"
        );

        // Fill more combos than the params cap: the least-recently-served evicts.
        for i in 0..GRAPH_SLICE_PARAMS_CAP {
            ring.record(&format!("combo-{i}"), 10, snap(&[("n1", "A")], &[], None));
        }
        // `params-a` was the least-recently-touched → evicted past the combo cap.
        assert!(
            ring.snapshot("params-a", newest).is_none(),
            "LRU combo evicted"
        );
        // Touching an existing combo moves it to most-recently-served.
        ring.record("combo-0", 11, snap(&[("n1", "A")], &[], None));
        ring.record("combo-fresh", 10, snap(&[("n1", "A")], &[], None));
        assert!(
            ring.snapshot("combo-0", 11).is_some(),
            "touched combo survives eviction"
        );
    }

    #[test]
    fn diff_reports_node_and_edge_add_remove_change() {
        // baseline: nodes n1,n2 / edges e1,e2.  current: n1 changed, n2 removed,
        // n3 added; e1 kept, e2 removed, e3 added.
        let baseline = snap(&[("n1", "A"), ("n2", "B")], &["e1", "e2"], None);
        let current = SliceSnapshot {
            nodes: Arc::new(vec![
                json!({"id": "n1", "title": "A2"}),
                json!({"id": "n3", "title": "C"}),
            ]),
            edges: Arc::new(vec![json!({"id": "e1"}), json!({"id": "e3"})]),
            truncated: None,
        };
        match diff_snapshots(&baseline, &current, 4, 5) {
            GraphSliceDelta::Delta {
                since,
                generation,
                changed_nodes,
                removed_node_ids,
                changed_edges,
                removed_edge_ids,
                ..
            } => {
                assert_eq!((since, generation), (4, 5));
                let cn: Vec<&str> = changed_nodes
                    .iter()
                    .map(|n| n["id"].as_str().unwrap())
                    .collect();
                assert_eq!(cn, vec!["n1", "n3"], "changed(n1) + added(n3)");
                assert_eq!(removed_node_ids, vec!["n2".to_string()]);
                let ce: Vec<&str> = changed_edges
                    .iter()
                    .map(|e| e["id"].as_str().unwrap())
                    .collect();
                assert_eq!(ce, vec!["e3"], "only the added edge is changed");
                assert_eq!(removed_edge_ids, vec!["e2".to_string()]);
            }
            _ => panic!("expected a Delta"),
        }
    }

    #[test]
    fn a_truncation_difference_forces_full_required() {
        let baseline = snap(&[("n1", "A")], &["e1"], None);
        let truncated = snap(&[("n1", "A")], &["e1"], Some(json!({"total_nodes": 9000})));
        assert!(matches!(
            diff_snapshots(&baseline, &truncated, 4, 5),
            GraphSliceDelta::FullRequired { generation: 5 }
        ));
    }
}
