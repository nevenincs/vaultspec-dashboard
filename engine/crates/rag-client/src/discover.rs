//! Node-scoped semantic discovery (engine-spec §4.3, D3.5): the node
//! executes rag queries built from its own content + linkage to discover
//! more. Results are **ephemeral suggestions** — TTL-cached, confidence
//! capped at 0.7, never persisted as graph fact (the graph boundary
//! rejects semantic edges outright), always labelled, absent from any
//! historical view, and absent entirely when rag is down.

use engine_model::{Edge, NodeId, Provenance, RelationKind, ScopeRef, Tier, Timestamp, edge_id};
use serde::Deserialize;

use crate::client::{RagTransport, Result};
use crate::semantic_confidence;

/// Default TTL for cached discovery results: 5 minutes.
pub const DISCOVER_TTL_MS: i64 = 5 * 60 * 1000;

/// One ranked candidate from rag.
#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct RagHit {
    /// The matched source: a vault stem or repo-relative code path.
    pub source: String,
    pub score: f32,
    #[serde(default)]
    pub rank: u32,
}

#[derive(Debug, Deserialize)]
struct RagSearchData {
    #[serde(default)]
    results: Vec<RagHit>,
}

#[derive(Debug, Deserialize)]
struct RagEnvelope {
    ok: bool,
    #[serde(default)]
    data: Option<RagSearchData>,
    #[serde(default)]
    message: Option<String>,
}

/// Run node-scoped discovery: query rag (through the TTL cache), turn hits
/// into **candidate** semantic edges. The returned edges are suggestions
/// for the wire only; `engine_graph::ingest` rejects them by design.
pub fn discover(
    transport: &impl RagTransport,
    store: &engine_store::Store,
    node: &NodeId,
    query: &str,
    scope: &ScopeRef,
    now: Timestamp,
) -> Result<Vec<Edge>> {
    let cache_key = format!(
        "discover:{}:{}",
        node.0,
        engine_model::content_hash(query.as_bytes())
    );
    let raw = match store.get_semantic(&cache_key, now).ok().flatten() {
        Some(cached) => cached,
        None => {
            let body = serde_json::json!({ "query": query, "max_results": 10 }).to_string();
            let fresh = transport.post_json("/search", &body)?;
            // Cache errors are non-fatal: a cold cache only costs latency.
            let _ = store.put_semantic(&cache_key, &fresh, now + DISCOVER_TTL_MS);
            fresh
        }
    };

    let envelope: RagEnvelope = serde_json::from_str(&raw)?;
    if !envelope.ok {
        return Err(crate::client::RagError::Http {
            status: 200,
            body: envelope
                .message
                .unwrap_or_else(|| "rag reported failure".into()),
        });
    }
    let hits = envelope.data.map(|d| d.results).unwrap_or_default();

    Ok(hits
        .iter()
        .map(|hit| {
            let dst = target_node_id(&hit.source);
            let provenance = Provenance::RagMatch {
                query: query.to_string(),
                rank: hit.rank,
                score: hit.score,
            };
            let id = edge_id(
                node,
                &dst,
                &RelationKind::Resembles,
                Tier::Semantic,
                &provenance,
            );
            Edge {
                id,
                src: node.clone(),
                dst,
                relation: RelationKind::Resembles,
                tier: Tier::Semantic,
                // Capped below structural (D3.5); raw score preserved in
                // provenance for auditability.
                confidence: semantic_confidence(hit.score),
                state: None,
                provenance,
                scope: scope.clone(),
                observed_at: now,
            }
        })
        .collect())
}

/// Map a rag source to an engine node id: vault stems → document nodes,
/// paths → code-artifact nodes (the same correlation the event log uses).
pub fn target_node_id(source: &str) -> NodeId {
    use engine_model::{CanonicalKey, node_id};
    let trimmed = source.trim_start_matches("./");
    if let Some(stem) = trimmed
        .strip_prefix(".vault/")
        .and_then(|rest| rest.split('/').next_back())
        .and_then(|file| file.strip_suffix(".md"))
    {
        node_id(&CanonicalKey::Document { stem })
    } else if !trimmed.contains('/') && !trimmed.contains('.') {
        // Bare stem (rag vault hits report stems, not paths).
        node_id(&CanonicalKey::Document { stem: trimmed })
    } else {
        node_id(&CanonicalKey::CodeArtifact {
            path: trimmed,
            symbol: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::client::test_support::FakeTransport;

    fn store() -> (tempfile::TempDir, engine_store::Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = engine_store::Store::open_at(&dir.path().join("t.sqlite3")).unwrap();
        (dir, store)
    }

    const PAYLOAD: &str = r#"{"ok": true, "command": "search",
        "data": {"results": [
            {"source": ".vault/adr/2026-06-12-x-adr.md", "score": 0.95, "rank": 1},
            {"source": "src/lib.rs", "score": 0.4, "rank": 2}
        ]}}"#;

    #[test]
    fn discovery_caps_confidence_and_labels_semantic() {
        let (_dir, store) = store();
        let transport = FakeTransport::returning(vec![PAYLOAD]);
        let node = NodeId("feature:editor-demo".into());
        let scope = ScopeRef::Ref {
            name: "main".into(),
        };
        let edges = discover(&transport, &store, &node, "editor layout", &scope, 1000).unwrap();
        assert_eq!(edges.len(), 2);
        // 0.95 raw → capped at 0.7; raw preserved in provenance.
        assert_eq!(edges[0].confidence, 0.7);
        assert!(matches!(&edges[0].provenance,
            Provenance::RagMatch { score, .. } if *score == 0.95));
        assert!(edges.iter().all(|e| e.tier == Tier::Semantic));
        assert_eq!(edges[0].dst.0, "doc:2026-06-12-x-adr");
        assert_eq!(edges[1].dst.0, "code:src/lib.rs");

        // Ephemeral by type: the graph boundary rejects these outright.
        let mut g = engine_graph::LinkageGraph::new();
        assert!(
            engine_graph::ingest(&mut g, edges[0].clone(), engine_graph::EdgeAttrs::default())
                .is_err(),
            "semantic edges are never graph fact (D3.5)"
        );
    }

    #[test]
    fn discovery_hits_the_ttl_cache_within_the_window() {
        let (_dir, store) = store();
        let transport = FakeTransport::returning(vec![PAYLOAD]); // ONE response
        let node = NodeId("feature:x".into());
        let scope = ScopeRef::Ref {
            name: "main".into(),
        };
        let first = discover(&transport, &store, &node, "q", &scope, 1000).unwrap();
        // Second call inside the TTL: served from cache, no transport call.
        let second = discover(&transport, &store, &node, "q", &scope, 2000).unwrap();
        assert_eq!(first.len(), second.len());
        assert_eq!(transport.calls.borrow().len(), 1, "one live call only");
        // After expiry the transport is consulted again (and is exhausted).
        let expired = discover(
            &transport,
            &store,
            &node,
            "q",
            &scope,
            1000 + DISCOVER_TTL_MS + 1,
        );
        assert!(
            expired.is_err(),
            "fake transport exhausted proves a live re-fetch"
        );
    }
}
