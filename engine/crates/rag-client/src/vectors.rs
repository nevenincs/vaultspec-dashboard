//! Embedding read: stored dense vectors from rag's Qdrant over loopback HTTP
//! (graph-semantic-embeddings ADR D1, D10).
//!
//! The engine READS already-stored vectors and forwards them; it computes
//! nothing — "The engine builds no embeddings, ever" holds (engine-read-and-
//! infer). Vectors are scrolled from rag's resident Qdrant instance over the
//! same loopback HTTP transport the search client uses (published-wheel-purity:
//! no `vaultspec-rag`/torch import; loopback HTTP only). The coupling to rag's
//! Qdrant store shape (collection name, point-id → source mapping) is the
//! INTENDED canonical seam (ADR D1: direct Qdrant scroll is the design we build
//! to and keep), isolated entirely behind this module.
//!
//! Point-id → engine node-id mapping (ADR open question, resolved): rag stores
//! each chunk/document point with a `source` field in its payload — a vault stem
//! or a repo-relative code path, the SAME `source` token rag's `/search`
//! response carries (see `search.rs`). We map it to an engine node id through the
//! EXISTING `target_node_id` correlation, so a vault stem resolves to its `doc:`
//! node exactly as the search-result annotation does. A point whose `source` does
//! not resolve to a vault-document node is skipped (v1 scope is vault-document
//! embeddings only, ADR D10); a graph node with no Qdrant point renders as honest
//! ABSENCE (no vector served), which the scene draws as the fallback ring.

use std::collections::HashMap;
use std::time::Instant;

use serde::Deserialize;
use serde_json::{Value, json};

use crate::client::{RagError, RagTransport, Result};
use crate::discover::target_node_id;

/// The default Qdrant HTTP port rag's resident store listens on (ADR Context:
/// "Qdrant HTTP at 127.0.0.1:8765"). Used when `service.json` does not carry an
/// explicit storage port. The storage door is distinct from rag's own service
/// port (8766) — embeddings come from Qdrant directly, not through rag.
pub const DEFAULT_QDRANT_PORT: u16 = 8765;

/// The rag-managed Qdrant collection holding the dense vault-document vectors.
/// rag names its vault collection `vault`; the code-chunk collection (deferred,
/// ADR D10′) is a separate collection this v1 read never touches.
pub const VAULT_COLLECTION: &str = "vault";

/// Qdrant scroll page size: how many points per `/points/scroll` round-trip.
/// Bounded so a large corpus is read in capped pages rather than one unbounded
/// body — the MAX_RAG_BODY ceiling (inherited from the transport) still backstops
/// a single page, and the engine caps the SERVED node set at MAX_GRAPH_NODES, so
/// a page size that comfortably covers the realistic ~1525-doc vault slice in a
/// few round-trips is the honest middle.
pub const SCROLL_BATCH: usize = 1000;

/// A hard cap on scroll round-trips so a pathological or runaway Qdrant cursor
/// can never loop forever; SCROLL_BATCH * SCROLL_MAX_PAGES bounds the total
/// points read well above the MAX_GRAPH_NODES served ceiling.
pub const SCROLL_MAX_PAGES: usize = 64;

/// One stored embedding mapped to its engine node id.
#[derive(Debug, Clone, PartialEq)]
pub struct NodeEmbedding {
    /// The engine node id the point's `source` correlates to (`doc:{stem}`).
    pub node_id: String,
    /// The raw stored dense vector (float32, served verbatim — no reduction,
    /// ADR D4: server-side dimensionality reduction is forbidden).
    pub vector: Vec<f32>,
}

/// A Qdrant `/points/scroll` response point: id + payload + the requested vector.
#[derive(Debug, Deserialize)]
struct ScrollPoint {
    #[serde(default)]
    payload: Option<ScrollPayload>,
    /// `with_vector=true` returns the dense vector here. A named-vector
    /// collection would return an object; the vault collection stores a single
    /// unnamed dense vector, so this is a flat array.
    ///
    /// LIVE-INTEGRATION CHECKLIST (W04 review): if rag ever migrates the vault
    /// collection to NAMED vectors, Qdrant returns `vector` as an object
    /// (`{"name": [...]}`) rather than a flat array, and this `Option<Vec<f32>>`
    /// will silently deserialize to `None` — every point would then be skipped as
    /// honest absence and the semantic mode would go dark with no error. That
    /// migration must be caught here (switch to an enum over flat/named) before it
    /// ships, not diagnosed from an empty embedding slice.
    #[serde(default)]
    vector: Option<Vec<f32>>,
}

#[derive(Debug, Deserialize)]
struct ScrollPayload {
    /// The vault stem or repo-relative path — the SAME token `/search` carries.
    #[serde(default)]
    source: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ScrollResult {
    #[serde(default)]
    points: Vec<ScrollPoint>,
    /// The opaque cursor for the next page; `null` when the scroll is exhausted.
    #[serde(default)]
    next_page_offset: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct ScrollEnvelope {
    #[serde(default)]
    result: Option<ScrollResult>,
}

/// Read every stored vault-document embedding from Qdrant, mapped to engine node
/// ids. Scrolls the vault collection in bounded pages with `with_vector=true`,
/// correlates each point's `source` to its engine node id, and keeps only
/// vault-document (`doc:`) nodes (ADR D10). The result is keyed by node id so the
/// caller can intersect it with the SERVED node set; a node absent from the map
/// has no stored vector (honest absence → fallback ring).
///
/// `deadline` is an OVERALL wall-clock budget for the whole multi-page scroll —
/// the true bound the per-socket inactivity timeout alone cannot give (a 64-page
/// scroll could otherwise accrue 64 × the per-page timeout). Checked before each
/// page round-trip; a breach returns a typed `TimedOut` error (the semantic tier
/// degrades to no-vectors, exactly like the per-socket timeout path) rather than
/// silently truncating the read.
///
/// The engine reads and forwards: no vector is computed, reduced, or altered.
pub fn read_embeddings(
    transport: &impl RagTransport,
    deadline: Instant,
) -> Result<HashMap<String, Vec<f32>>> {
    let mut out: HashMap<String, Vec<f32>> = HashMap::new();
    let mut offset: Option<Value> = None;
    for _ in 0..SCROLL_MAX_PAGES {
        // Overall wall-clock budget (W04 review): bound the WHOLE scroll, not just
        // each socket. A stalled or slow Qdrant that creeps under the per-page
        // inactivity timeout on every page still cannot pin the request past this.
        if Instant::now() >= deadline {
            return Err(RagError::Io(std::io::Error::new(
                std::io::ErrorKind::TimedOut,
                "embedding scroll exceeded its overall wall-clock budget",
            )));
        }
        let body = scroll_body(offset.as_ref());
        let raw = transport.post_json(
            &format!("/collections/{VAULT_COLLECTION}/points/scroll"),
            &body,
        )?;
        let envelope: ScrollEnvelope = serde_json::from_str(&raw)?;
        let Some(result) = envelope.result else { break };
        for point in result.points {
            let Some(vector) = point.vector else { continue };
            let Some(source) = point.payload.and_then(|p| p.source) else {
                continue;
            };
            let node_id = target_node_id(&source).0;
            // v1 scope: vault-document nodes only (ADR D10). A `code:` source is
            // skipped; a re-scrolled stem (rag chunks a doc into several points)
            // keeps the first vector deterministically — one vector per node.
            if node_id.starts_with("doc:") {
                out.entry(node_id).or_insert(vector);
            }
        }
        match result.next_page_offset {
            Some(next) if !next.is_null() => offset = Some(next),
            _ => break,
        }
    }
    Ok(out)
}

/// Build the Qdrant `/points/scroll` request body: a bounded page with the
/// payload (for the `source` correlation) AND the dense vector requested. An
/// `offset` continues a prior page; `None` starts the scroll.
fn scroll_body(offset: Option<&Value>) -> String {
    let mut body = json!({
        "limit": SCROLL_BATCH,
        "with_payload": true,
        "with_vector": true,
    });
    if let Some(offset) = offset {
        body["offset"] = offset.clone();
    }
    body.to_string()
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::client::test_support::FakeTransport;

    #[test]
    fn maps_qdrant_points_to_doc_node_ids_with_vectors() {
        // Two vault-doc points and one code point: the code point is dropped (v1
        // scope is vault-document embeddings only, ADR D10), the doc points map
        // to `doc:{stem}` via target_node_id.
        let page = r#"{"result": {"points": [
            {"id": 1, "payload": {"source": ".vault/adr/2026-06-16-x-adr.md"},
             "vector": [0.1, 0.2, 0.3]},
            {"id": 2, "payload": {"source": "2026-06-16-y-plan"},
             "vector": [0.4, 0.5, 0.6]},
            {"id": 3, "payload": {"source": "src/lib.rs"},
             "vector": [0.7, 0.8, 0.9]}
        ], "next_page_offset": null}}"#;
        let transport = FakeTransport::returning(vec![page]);
        let map = read_embeddings(&transport, far_future()).unwrap();
        assert_eq!(map.len(), 2, "only the two vault-doc points are kept");
        assert_eq!(map.get("doc:2026-06-16-x-adr"), Some(&vec![0.1, 0.2, 0.3]));
        assert_eq!(map.get("doc:2026-06-16-y-plan"), Some(&vec![0.4, 0.5, 0.6]));
        assert!(!map.contains_key("code:src/lib.rs"), "code nodes deferred");
        // The scroll hit the vault collection's scroll endpoint with vectors on.
        let (path, body) = transport.calls.borrow()[0].clone();
        assert_eq!(path, "/collections/vault/points/scroll");
        assert!(body.contains("\"with_vector\":true"));
    }

    #[test]
    fn paginates_until_the_cursor_is_exhausted() {
        // First page returns a non-null next_page_offset, so a second scroll
        // fires; the second page exhausts the cursor (null), so the read stops.
        let page1 = r#"{"result": {"points": [
            {"id": 1, "payload": {"source": "a-adr"}, "vector": [1.0]}
        ], "next_page_offset": 2}}"#;
        let page2 = r#"{"result": {"points": [
            {"id": 2, "payload": {"source": "b-plan"}, "vector": [2.0]}
        ], "next_page_offset": null}}"#;
        let transport = FakeTransport::returning(vec![page1, page2]);
        let map = read_embeddings(&transport, far_future()).unwrap();
        assert_eq!(map.len(), 2);
        assert_eq!(map.get("doc:a-adr"), Some(&vec![1.0]));
        assert_eq!(map.get("doc:b-plan"), Some(&vec![2.0]));
        assert_eq!(transport.calls.borrow().len(), 2, "two scroll pages");
        // The second request carried the cursor offset from the first page.
        assert!(transport.calls.borrow()[1].1.contains("\"offset\":2"));
    }

    #[test]
    fn a_point_missing_a_vector_or_source_is_skipped_as_honest_absence() {
        let page = r#"{"result": {"points": [
            {"id": 1, "payload": {"source": "has-vector-adr"}, "vector": [1.0]},
            {"id": 2, "payload": {"source": "no-vector-adr"}},
            {"id": 3, "vector": [3.0]}
        ], "next_page_offset": null}}"#;
        let transport = FakeTransport::returning(vec![page]);
        let map = read_embeddings(&transport, far_future()).unwrap();
        assert_eq!(map.len(), 1, "only the point with BOTH a vector and source");
        assert_eq!(map.get("doc:has-vector-adr"), Some(&vec![1.0]));
    }

    #[test]
    fn duplicate_source_keeps_one_vector_deterministically() {
        // rag chunks a document into multiple points sharing one `source`; the
        // node carries ONE vector (the first), never a re-keyed duplicate.
        let page = r#"{"result": {"points": [
            {"id": 1, "payload": {"source": "dup-adr"}, "vector": [1.0]},
            {"id": 2, "payload": {"source": "dup-adr"}, "vector": [9.0]}
        ], "next_page_offset": null}}"#;
        let transport = FakeTransport::returning(vec![page]);
        let map = read_embeddings(&transport, far_future()).unwrap();
        assert_eq!(map.len(), 1);
        assert_eq!(map.get("doc:dup-adr"), Some(&vec![1.0]));
    }

    #[test]
    fn an_exhausted_wall_clock_budget_is_a_timeout_not_a_silent_partial() {
        // The overall wall-clock budget bounds the WHOLE scroll: a deadline already
        // in the past stops the read before the first page round-trip and surfaces
        // a typed TimedOut error (the semantic tier degrades), never a silent
        // partial result the caller would mistake for honest absence.
        let page = r#"{"result": {"points": [
            {"id": 1, "payload": {"source": "x-adr"}, "vector": [1.0]}
        ], "next_page_offset": null}}"#;
        let transport = FakeTransport::returning(vec![page]);
        let past = Instant::now() - Duration::from_secs(1);
        let result = read_embeddings(&transport, past);
        match result {
            Err(RagError::Io(e)) => assert_eq!(e.kind(), std::io::ErrorKind::TimedOut),
            other => panic!("expected a TimedOut Io error, got {other:?}"),
        }
        // The budget breach short-circuits before any scroll round-trip fires.
        assert_eq!(transport.calls.borrow().len(), 0, "no page was scrolled");
    }

    /// A deadline comfortably past the end of any test run, for the happy paths.
    fn far_future() -> Instant {
        Instant::now() + Duration::from_secs(3600)
    }
}
