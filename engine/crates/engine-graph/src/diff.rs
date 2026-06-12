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

/// One delta entry (contract §5: `{op, node|edge, t, seq}`).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DiffEntry {
    pub op: DiffOp,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node: Option<Node>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edge: Option<Edge>,
    /// The target time of the diff (T2 for a T1→T2 log).
    pub t: i64,
    pub seq: u64,
}

/// The ordered delta log plus its clock position.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DiffLog {
    pub entries: Vec<DiffEntry>,
    /// The last sequence number in this log — `/graph/diff` responses
    /// carry it so `/stream?since=` can splice with no gap or overlap.
    pub last_seq: u64,
}

/// Compute the ordered delta log turning `from` into `to`. `seq_start` is
/// the next position on the monotonic delta clock (shared with the live
/// stream); `t` stamps every entry with the target time.
pub fn diff(from: &LinkageGraph, to: &LinkageGraph, t: i64, seq_start: u64) -> DiffLog {
    let mut entries = Vec::new();
    let mut seq = seq_start;
    let mut push = |op: DiffOp, node: Option<Node>, edge: Option<Edge>| {
        entries.push(DiffEntry {
            op,
            node,
            edge,
            t,
            seq,
        });
        seq += 1;
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
            Some(before) if before != *stored => {
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

    DiffLog {
        last_seq: seq.saturating_sub(1).max(seq_start),
        entries,
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
            feature_tags: vec![],
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
