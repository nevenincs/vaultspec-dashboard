//! Ordered diff-log generation (engine-spec D7.4, contract §5): the delta
//! log between two graph states, with monotonic sequence numbers and
//! `last_seq` reporting. Scrubbing applies these deltas client-side at
//! frame rate; the live `graph` SSE channel shares this exact shape — one
//! delta clock (contract REDLINE-3).

use engine_model::{Edge, Node};
use serde::Serialize;

use crate::graph::LinkageGraph;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DiffOp {
    Add,
    Remove,
    Change,
}

/// One delta entry (contract §5: `{op, granularity, node|edge, t, seq}`).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DiffEntry {
    pub op: DiffOp,
    /// The delta's species on the single clock (contract §5/§7 amendment
    /// 2026-06-13, constellation-live-delta ADR / S50): this `diff` produces
    /// the DOCUMENT graph deltas; the feature/meta-edge projection is tagged
    /// `feature` elsewhere. A single-granularity consumer applies only its own.
    pub granularity: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node: Option<Node>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edge: Option<Edge>,
    /// The target time of the diff (T2 for a T1→T2 log).
    pub t: i64,
    pub seq: u64,
}

/// Hard ceiling on delta ENTRIES emitted by a single diff log
/// (graph-queries-are-bounded-by-default; the temporal-wire analogue of the
/// slice `MAX_GRAPH_NODES` / `MAX_DOCUMENT_NODES` ceilings). A diff between two
/// distant refs is effectively TWO full document slices (~2×(N+E) full-fat
/// entries carrying complete `Node`/`Edge` values), and `/graph/diff` is reached
/// on a user gesture (every out-of-range time-travel scrub), so an unbounded log
/// is a multi-MB body on a scrub. Kept at keyframe scale (mirrors the client's
/// `MAX_CLIENT_GRAPH_NODES` / `MAX_SCENE_NODES`), above which a scrub re-keyframes
/// through `/graph/asof` rather than shipping the whole delta stream.
pub const MAX_DIFF_DELTAS: usize = 20_000;

/// Honest truncation block for an over-ceiling diff log (mirrors the sibling
/// graph-query / lineage / ego `truncated` shape `{total, returned, reason}`,
/// graph-queries-are-bounded-by-default). `returned_deltas` is always 0: unlike a
/// bounded node SLICE (a truncated snapshot is still a valid smaller graph), a
/// truncated MUTATION SEQUENCE is NOT self-consistent — applying a prefix of the
/// adds/removes/changes leaves the client's graph wrong — so an over-ceiling diff
/// degrades to KEYFRAME-ONLY (no deltas) and the client answers with a re-keyframe
/// (`DeltaLog.needsKeyframe`) instead of applying a partial log.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DiffTruncated {
    pub total_deltas: usize,
    pub returned_deltas: usize,
    pub reason: String,
}

/// The ordered delta log plus its clock position.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DiffLog {
    pub entries: Vec<DiffEntry>,
    /// The last sequence number in this log — `/graph/diff` responses
    /// carry it so `/stream?since=` can splice with no gap or overlap.
    pub last_seq: u64,
    /// Present (and `entries` empty) when the symmetric difference exceeded
    /// [`MAX_DIFF_DELTAS`]: the log degraded to keyframe-only and the client must
    /// re-keyframe. Absent on an in-bounds diff (`skip_serializing_if`), so the
    /// common wire body is unchanged.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<DiffTruncated>,
}

/// Does a matched edge (SAME id in both graphs) carry a MEANINGFUL change?
///
/// Compares only diff-relevant content — relation/tier/confidence/state and
/// the stored attrs (multiplicity, weight, core_kind, resolved_target) — and
/// DELIBERATELY ignores volatile metadata that is not a real change:
/// - `observed_at`: re-stamped every index, so on the LIVE stream EVERY
///   unchanged edge would otherwise emit a phantom `change` on each rebuild;
/// - `provenance`: the declared tier's `payload_hash` is the hash of the WHOLE
///   core-graph payload, which differs between ANY two snapshots even for a
///   byte-identical edge — the historical-diff spurious-`change` storm
///   (2026-06-13: HEAD~3..HEAD reported ~7080 phantom edge changes);
/// - `scope`: a diff compares two views of the SAME corpus; identity is the id.
///
/// (relation/tier are id-implied for a matched edge, compared for clarity.)
fn edge_changed(before: &crate::graph::StoredEdge, after: &crate::graph::StoredEdge) -> bool {
    let (a, b) = (&before.edge, &after.edge);
    a.relation != b.relation
        || a.tier != b.tier
        || a.confidence != b.confidence
        || a.state != b.state
        || before.attrs != after.attrs
}

/// Compute the ordered delta log turning `from` into `to`. `seq_start` is
/// the next position on the monotonic delta clock (shared with the live
/// stream); `t` stamps every entry with the target time.
pub fn diff(from: &LinkageGraph, to: &LinkageGraph, t: i64, seq_start: u64) -> DiffLog {
    let mut entries = Vec::new();
    let mut seq = seq_start;
    // `total` counts EVERY changed element so the honest truncation block below
    // reports the true size; `entries` is capped at the ceiling so allocation
    // stays bounded even for a diff that will be discarded as over-ceiling
    // (bounded-by-default-for-every-accumulator).
    let mut total: usize = 0;
    let mut push = |op: DiffOp, node: Option<Node>, edge: Option<Edge>| {
        total += 1;
        if entries.len() < MAX_DIFF_DELTAS {
            entries.push(DiffEntry {
                op,
                granularity: "document",
                node,
                edge,
                t,
                seq,
            });
            seq += 1;
        }
    };

    // Deterministic order: nodes then edges, each sorted by id.
    let mut from_nodes: Vec<&Node> = from.nodes().collect();
    from_nodes.sort_by(|a, b| a.id.0.cmp(&b.id.0));
    let mut to_nodes: Vec<&Node> = to.nodes().collect();
    to_nodes.sort_by(|a, b| a.id.0.cmp(&b.id.0));

    for node in &to_nodes {
        match from.node(&node.id) {
            None => push(DiffOp::Add, Some((*node).clone()), None),
            Some(before) if before != *node => push(DiffOp::Change, Some((*node).clone()), None),
            _ => {}
        }
    }
    for node in &from_nodes {
        if to.node(&node.id).is_none() {
            push(DiffOp::Remove, Some((*node).clone()), None);
        }
    }

    let mut from_edges: Vec<_> = from.edges().collect();
    from_edges.sort_by(|a, b| a.edge.id.0.cmp(&b.edge.id.0));
    let mut to_edges: Vec<_> = to.edges().collect();
    to_edges.sort_by(|a, b| a.edge.id.0.cmp(&b.edge.id.0));

    for stored in &to_edges {
        match from.edge(&stored.edge.id) {
            None => push(DiffOp::Add, None, Some(stored.edge.clone())),
            Some(before) if edge_changed(before, stored) => {
                push(DiffOp::Change, None, Some(stored.edge.clone()))
            }
            _ => {}
        }
    }
    for stored in &from_edges {
        if to.edge(&stored.edge.id).is_none() {
            push(DiffOp::Remove, None, Some(stored.edge.clone()));
        }
    }

    // Over the ceiling: degrade to KEYFRAME-ONLY. A partial mutation log is not
    // self-consistent (see `DiffTruncated`), so emit no deltas plus an honest
    // truncation block — the client re-keyframes via `/graph/asof` rather than
    // applying a prefix. This is the one graph wire surface that answers a
    // truncation with a keyframe fallback instead of a self-consistent subgraph,
    // because a delta stream, unlike a slice, cannot be safely truncated.
    if total > MAX_DIFF_DELTAS {
        return DiffLog {
            entries: Vec::new(),
            last_seq: seq_start,
            truncated: Some(DiffTruncated {
                total_deltas: total,
                returned_deltas: 0,
                reason: format!(
                    "diff delta ceiling ({MAX_DIFF_DELTAS}): a partial mutation log \
                     is not self-consistent — the client re-keyframes via /graph/asof"
                ),
            }),
        };
    }

    DiffLog {
        last_seq: seq.saturating_sub(1).max(seq_start),
        entries,
        truncated: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::edges::ingest_test_helpers::declared_edge;
    use crate::graph::EdgeAttrs;
    use engine_model::{CanonicalKey, Facet, NodeKind, Presence, ScopeRef, node_id};

    fn doc(stem: &str) -> Node {
        Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.into(),
            title: None,
            doc_type: None,
            dates: None,
            feature_tags: vec![],
            status: None,
            tier: None,
            facets: vec![Facet {
                scope: ScopeRef::Ref {
                    name: "main".into(),
                },
                presence: Presence::Exists,
                content_hash: Some("h".into()),
                lifecycle: None,
            }],
        }
    }

    #[test]
    fn diff_emits_ordered_adds_changes_removes_with_monotonic_seq() {
        let mut a = LinkageGraph::new();
        a.upsert_node(doc("kept"));
        a.upsert_node(doc("removed"));
        a.upsert_node(doc("changed"));

        let mut b = LinkageGraph::new();
        b.upsert_node(doc("kept"));
        let mut changed = doc("changed");
        changed.facets[0].content_hash = Some("h2".into());
        b.upsert_node(changed);
        b.upsert_node(doc("added"));
        crate::edges::ingest(
            &mut b,
            declared_edge("kept", "added", 1),
            EdgeAttrs::default(),
        )
        .unwrap();

        let log = diff(&a, &b, 42, 10);
        let ops: Vec<(DiffOp, bool)> = log
            .entries
            .iter()
            .map(|e| (e.op, e.node.is_some()))
            .collect();
        assert_eq!(
            ops,
            vec![
                (DiffOp::Add, true),    // node "added"
                (DiffOp::Change, true), // node "changed"
                (DiffOp::Remove, true), // node "removed"
                (DiffOp::Add, false),   // the new edge
            ]
        );
        // Monotonic clock from seq_start; last_seq reported for splicing.
        let seqs: Vec<u64> = log.entries.iter().map(|e| e.seq).collect();
        assert_eq!(seqs, vec![10, 11, 12, 13]);
        assert_eq!(log.last_seq, 13);
        assert!(log.entries.iter().all(|e| e.t == 42));
    }

    #[test]
    fn over_ceiling_diff_degrades_to_keyframe_only_with_honest_truncation() {
        // A diff whose symmetric difference exceeds MAX_DIFF_DELTAS must NOT ship a
        // partial (non-self-consistent) mutation log: it degrades to keyframe-only
        // — empty `entries` plus an honest `truncated` block the client answers
        // with a re-keyframe (GIR-010, graph-queries-are-bounded-by-default).
        let a = LinkageGraph::new();
        let mut b = LinkageGraph::new();
        let over = MAX_DIFF_DELTAS + 1;
        for i in 0..over {
            b.upsert_node(doc(&format!("d{i:06}")));
        }
        let log = diff(&a, &b, 7, 0);
        assert!(
            log.entries.is_empty(),
            "an over-ceiling diff emits no deltas (keyframe-only degradation)"
        );
        let truncated = log.truncated.expect("over-ceiling diff carries truncation");
        assert_eq!(
            truncated.total_deltas, over,
            "the TRUE delta count is reported"
        );
        assert_eq!(truncated.returned_deltas, 0);
    }

    #[test]
    fn at_ceiling_diff_ships_every_delta_with_no_truncation() {
        // Exactly at the ceiling is in-bounds: all deltas ship, no truncation.
        let a = LinkageGraph::new();
        let mut b = LinkageGraph::new();
        for i in 0..MAX_DIFF_DELTAS {
            b.upsert_node(doc(&format!("d{i:06}")));
        }
        let log = diff(&a, &b, 7, 0);
        assert_eq!(log.entries.len(), MAX_DIFF_DELTAS);
        assert!(log.truncated.is_none());
    }

    #[test]
    fn identical_graphs_produce_an_empty_log() {
        let mut a = LinkageGraph::new();
        a.upsert_node(doc("x"));
        let mut b = LinkageGraph::new();
        b.upsert_node(doc("x"));
        let log = diff(&a, &b, 0, 5);
        assert!(log.entries.is_empty());
        assert_eq!(log.last_seq, 5, "clock does not advance on no-op");
    }
}
