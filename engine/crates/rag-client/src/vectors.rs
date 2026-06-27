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
use std::path::Path;
use std::time::Instant;

use blake2::Blake2bVar;
use blake2::digest::{Update, VariableOutput};
use serde::Deserialize;
use serde_json::{Value, json};

use engine_model::{CanonicalKey, node_id};

use crate::client::{RagError, RagTransport, Result};

/// The default Qdrant HTTP port rag's resident store listens on (ADR Context:
/// "Qdrant HTTP at 127.0.0.1:8765"). Used when `service.json` does not carry an
/// explicit storage port. The storage door is distinct from rag's own service
/// port (8766) — embeddings come from Qdrant directly, not through rag.
pub const DEFAULT_QDRANT_PORT: u16 = 8765;

/// Compute the rag-managed Qdrant collection name holding a project's dense
/// vault-document vectors. rag namespaces every project's collections by a short
/// hash of its resolved, case-normalised root and suffixes the vault collection
/// `_vault_docs` (the code-chunk `_codebase_docs` collection is the deferred
/// D10′ scope this v1 read never touches). This MUST byte-match rag's own
/// `store.root_collection_prefix`: `r{blake2b-6-hex(normcase(resolve(root)))}_` —
/// the input is lower-cased and back-slash-normalised (Windows paths are
/// case-insensitive and `\`-separated; `./p` and `p` collide deliberately) so the
/// same root always lands in the same collection across processes. A mismatch
/// here is a 404 from Qdrant → semantic tier honest-absence (no vectors).
pub fn vault_collection_name(root: &Path) -> String {
    // normcase(resolve(root)): the engine's scope root is already absolute; match
    // rag's normalisation by lower-casing and using the platform separator (`\`
    // on Windows). No symlink resolution is applied — scope roots are real dirs.
    let resolved = root
        .to_string_lossy()
        .replace('/', std::path::MAIN_SEPARATOR_STR);
    let normalised = if cfg!(windows) {
        resolved.to_lowercase()
    } else {
        resolved
    };
    let mut hasher = Blake2bVar::new(6).expect("blake2b-6 is a valid output length");
    hasher.update(normalised.as_bytes());
    let mut digest = [0u8; 6];
    hasher
        .finalize_variable(&mut digest)
        .expect("6-byte buffer matches the 6-byte output");
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    format!("r{hex}_vault_docs")
}

/// Qdrant's documented `GET /collections/{name}` health for a collection — the
/// optimizer/segment/indexed-vs-total signals rag does NOT expose over its own
/// HTTP (Tier-2 of the rag-service-management three-tier contract). Tolerant
/// (every field optional): Qdrant's REST shape is stable across its 1.x line, but
/// a minor drift degrades a field rather than failing the read. This is the
/// "needs repair" signal the operations console surfaces.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct CollectionHealth {
    /// Qdrant optimizer health: `green` | `yellow` | `red`.
    pub status: Option<String>,
    pub points_count: Option<u64>,
    /// How many vectors are fully indexed vs uploaded (a gap signals an in-flight
    /// or stalled index).
    pub indexed_vectors_count: Option<u64>,
    /// Segment count — a fragmentation proxy (many small segments → needs an
    /// optimizer pass).
    pub segments_count: Option<u64>,
    /// `"ok"` or `{status:"error", error:...}` — forwarded verbatim.
    pub optimizer_status: Option<Value>,
}

/// The capability/version gate for the direct-Qdrant reads (rag-service-management
/// D6, generalized). Qdrant's `GET /collections/{name}` REST shape is stable
/// across the 1.x line, so the engine reads it for a major-1 Qdrant and degrades
/// honestly — no Tier-2 health, no direct scroll — on an unknown major it was not
/// built against (or when no version is reported). This prevents a rag-side Qdrant
/// upgrade from silently breaking the direct read: the gate fails closed, the tier
/// degrades, and the mismatch is stated rather than guessed.
pub fn qdrant_collection_api_supported(version: Option<&str>) -> bool {
    version
        .and_then(|v| v.trim().split('.').next())
        .and_then(|major| major.parse::<u32>().ok())
        == Some(1)
}

/// Read one collection's Qdrant-native health via the documented
/// `GET /collections/{name}`. The CALLER gates this on
/// [`qdrant_collection_api_supported`] first (against the version from rag's
/// `/health`); the read itself is tolerant of field presence. A 404 (the
/// collection does not exist) surfaces as the transport's typed `Http` error,
/// which the broker degrades honestly.
pub fn read_collection_health(
    transport: &impl RagTransport,
    collection: &str,
) -> Result<CollectionHealth> {
    let raw = transport.get(&format!("/collections/{collection}"))?;
    let envelope: Value = serde_json::from_str(&raw)?;
    let result = envelope.get("result").cloned().unwrap_or(Value::Null);
    Ok(CollectionHealth {
        status: result
            .get("status")
            .and_then(Value::as_str)
            .map(String::from),
        points_count: result.get("points_count").and_then(Value::as_u64),
        indexed_vectors_count: result.get("indexed_vectors_count").and_then(Value::as_u64),
        segments_count: result.get("segments_count").and_then(Value::as_u64),
        optimizer_status: result.get("optimizer_status").cloned(),
    })
}

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
    /// `with_vector=true` returns the vector here. rag's live vault collection is
    /// a NAMED-vector collection, so Qdrant returns an OBJECT keyed by vector name
    /// (`{"dense": [...], "sparse": {...}}`) — we extract the `dense` named vector.
    /// A flat array (an unnamed collection) is also accepted for robustness. Held
    /// as a raw `Value` and resolved by `dense_vector` so both shapes work and a
    /// future shape change is a localised fix, not a silent all-absence.
    #[serde(default)]
    vector: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct ScrollPayload {
    /// The vault repo-relative path rag stores per chunk (e.g.
    /// `adr/2026-06-16-x-adr.md`) — `target_node_id` maps it to `doc:{stem}`,
    /// the same id the graph mints for the document node.
    #[serde(default)]
    path: Option<String>,
}

/// Extract the dense float vector from a Qdrant `with_vector` value: the `dense`
/// named vector when the point uses named vectors (rag's live shape), or the flat
/// array when unnamed. Returns `None` for the sparse-only or malformed shapes.
fn dense_vector(v: Value) -> Option<Vec<f32>> {
    match v {
        Value::Array(_) => serde_json::from_value(v).ok(),
        Value::Object(mut map) => map
            .remove("dense")
            .and_then(|d| serde_json::from_value(d).ok()),
        _ => None,
    }
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
    collection: &str,
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
        let raw =
            transport.post_json(&format!("/collections/{collection}/points/scroll"), &body)?;
        let envelope: ScrollEnvelope = serde_json::from_str(&raw)?;
        let Some(result) = envelope.result else { break };
        for point in result.points {
            let Some(vector) = point.vector.and_then(dense_vector) else {
                continue;
            };
            let Some(path) = point.payload.and_then(|p| p.path) else {
                continue;
            };
            // rag stores the vault-relative path (e.g. `adr/x-adr.md`); the graph
            // mints the document node keyed by the file STEM. Map path → the doc
            // node id (basename minus `.md`). A non-`.md` path (a stray code chunk)
            // is skipped — v1 scope is vault-document embeddings only (ADR D10).
            let Some(stem) = path
                .rsplit(['/', '\\'])
                .next()
                .and_then(|file| file.strip_suffix(".md"))
            else {
                continue;
            };
            // rag chunks a doc into several points sharing the same path, so the
            // first chunk's dense vector wins deterministically — one vector per
            // document node (chunk-0 is the doc head, representative).
            out.entry(node_id(&CanonicalKey::Document { stem }).0)
                .or_insert(vector);
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
    // Request ONLY the `path` payload key and the `dense` named vector — NOT the
    // full payload (which carries the document `content` text) nor the sparse
    // vector. Pulling everything blows the MAX_RAG_BODY cap on a real corpus
    // ("rag response unreadable"); a minimal projection keeps each page small.
    let mut body = json!({
        "limit": SCROLL_BATCH,
        "with_payload": ["path"],
        "with_vector": ["dense"],
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

    const TEST_COLLECTION: &str = "rabc123def456_vault_docs";

    #[test]
    fn maps_qdrant_points_to_doc_node_ids_with_named_dense_vectors() {
        // The LIVE shape: rag's vault collection is NAMED-vector, so each point's
        // `vector` is an object `{dense, sparse}` keyed by path. Two vault-doc
        // points + one code point: code is dropped (v1 doc-only, ADR D10), the doc
        // points map to `doc:{stem}` via target_node_id, taking the `dense` vector.
        let page = r#"{"result": {"points": [
            {"id": 1, "payload": {"path": "adr/2026-06-16-x-adr.md"},
             "vector": {"dense": [0.1, 0.2, 0.3], "sparse": {"indices": [1], "values": [0.5]}}},
            {"id": 2, "payload": {"path": "plan/2026-06-16-y-plan.md"},
             "vector": {"dense": [0.4, 0.5, 0.6]}},
            {"id": 3, "payload": {"path": "src/lib.rs"},
             "vector": {"dense": [0.7, 0.8, 0.9]}}
        ], "next_page_offset": null}}"#;
        let transport = FakeTransport::returning(vec![page]);
        let map = read_embeddings(&transport, TEST_COLLECTION, far_future()).unwrap();
        assert_eq!(map.len(), 2, "only the two vault-doc points are kept");
        assert_eq!(map.get("doc:2026-06-16-x-adr"), Some(&vec![0.1, 0.2, 0.3]));
        assert_eq!(map.get("doc:2026-06-16-y-plan"), Some(&vec![0.4, 0.5, 0.6]));
        assert!(!map.contains_key("code:src/lib.rs"), "code nodes deferred");
        // The scroll hit the HASHED per-project collection's scroll endpoint.
        let (path, body) = transport.calls.borrow()[0].clone();
        assert_eq!(
            path,
            format!("/collections/{TEST_COLLECTION}/points/scroll")
        );
        // Minimal projection: only the dense vector + the path payload key.
        assert!(body.contains("\"with_vector\":[\"dense\"]"));
        assert!(body.contains("\"with_payload\":[\"path\"]"));
    }

    #[test]
    fn also_accepts_a_flat_unnamed_dense_vector() {
        // Robustness: an unnamed collection returns `vector` as a flat array.
        let page = r#"{"result": {"points": [
            {"id": 1, "payload": {"path": "adr/flat-adr.md"}, "vector": [1.0, 2.0]}
        ], "next_page_offset": null}}"#;
        let transport = FakeTransport::returning(vec![page]);
        let map = read_embeddings(&transport, TEST_COLLECTION, far_future()).unwrap();
        assert_eq!(map.get("doc:flat-adr"), Some(&vec![1.0, 2.0]));
    }

    #[test]
    fn collection_name_matches_rags_hashed_vault_docs_scheme() {
        // The collection MUST be `r{12-hex}_vault_docs` (rag's namespacing); a
        // wrong name is a 404 → silent all-absence. Lock the shape + determinism.
        let name = vault_collection_name(Path::new("/some/project/root"));
        assert!(name.starts_with('r'), "rag prefixes the hash with 'r'");
        assert!(name.ends_with("_vault_docs"), "vault collection suffix");
        let hex = &name[1..name.len() - "_vault_docs".len()];
        assert_eq!(hex.len(), 12, "blake2b-6 → 12 hex chars");
        assert!(hex.chars().all(|c| c.is_ascii_hexdigit()));
        // Deterministic: same root → same name.
        assert_eq!(name, vault_collection_name(Path::new("/some/project/root")));
    }

    #[test]
    fn paginates_until_the_cursor_is_exhausted() {
        // First page returns a non-null next_page_offset, so a second scroll
        // fires; the second page exhausts the cursor (null), so the read stops.
        let page1 = r#"{"result": {"points": [
            {"id": 1, "payload": {"path": "adr/a-adr.md"}, "vector": {"dense": [1.0]}}
        ], "next_page_offset": 2}}"#;
        let page2 = r#"{"result": {"points": [
            {"id": 2, "payload": {"path": "plan/b-plan.md"}, "vector": {"dense": [2.0]}}
        ], "next_page_offset": null}}"#;
        let transport = FakeTransport::returning(vec![page1, page2]);
        let map = read_embeddings(&transport, TEST_COLLECTION, far_future()).unwrap();
        assert_eq!(map.len(), 2);
        assert_eq!(map.get("doc:a-adr"), Some(&vec![1.0]));
        assert_eq!(map.get("doc:b-plan"), Some(&vec![2.0]));
        assert_eq!(transport.calls.borrow().len(), 2, "two scroll pages");
        // The second request carried the cursor offset from the first page.
        assert!(transport.calls.borrow()[1].1.contains("\"offset\":2"));
    }

    #[test]
    fn a_point_missing_a_vector_or_path_is_skipped_as_honest_absence() {
        let page = r#"{"result": {"points": [
            {"id": 1, "payload": {"path": "adr/has-vector-adr.md"}, "vector": {"dense": [1.0]}},
            {"id": 2, "payload": {"path": "adr/no-vector-adr.md"}},
            {"id": 3, "vector": {"dense": [3.0]}},
            {"id": 4, "payload": {"path": "adr/sparse-only-adr.md"}, "vector": {"sparse": {"indices": [1], "values": [0.5]}}}
        ], "next_page_offset": null}}"#;
        let transport = FakeTransport::returning(vec![page]);
        let map = read_embeddings(&transport, TEST_COLLECTION, far_future()).unwrap();
        assert_eq!(
            map.len(),
            1,
            "only the point with BOTH a dense vector and path"
        );
        assert_eq!(map.get("doc:has-vector-adr"), Some(&vec![1.0]));
    }

    #[test]
    fn duplicate_path_keeps_one_vector_deterministically() {
        // rag chunks a document into multiple points sharing one `path`; the node
        // carries ONE vector (the first chunk's dense), never a re-keyed duplicate.
        let page = r#"{"result": {"points": [
            {"id": 1, "payload": {"path": "adr/dup-adr.md"}, "vector": {"dense": [1.0]}},
            {"id": 2, "payload": {"path": "adr/dup-adr.md"}, "vector": {"dense": [9.0]}}
        ], "next_page_offset": null}}"#;
        let transport = FakeTransport::returning(vec![page]);
        let map = read_embeddings(&transport, TEST_COLLECTION, far_future()).unwrap();
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
            {"id": 1, "payload": {"path": "adr/x-adr.md"}, "vector": {"dense": [1.0]}}
        ], "next_page_offset": null}}"#;
        let transport = FakeTransport::returning(vec![page]);
        let past = Instant::now() - Duration::from_secs(1);
        let result = read_embeddings(&transport, TEST_COLLECTION, past);
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

    #[test]
    fn qdrant_capability_gate_accepts_major_1_and_fails_closed_otherwise() {
        assert!(qdrant_collection_api_supported(Some("1.18.2")));
        assert!(qdrant_collection_api_supported(Some("1.0.0")));
        assert!(qdrant_collection_api_supported(Some(" 1.20.0 ")));
        // An unknown major the engine was not built against → degrade honestly.
        assert!(!qdrant_collection_api_supported(Some("2.0.0")));
        assert!(!qdrant_collection_api_supported(Some("0.9.0")));
        // No version / garbage → unsupported (fail closed).
        assert!(!qdrant_collection_api_supported(None));
        assert!(!qdrant_collection_api_supported(Some("")));
        assert!(!qdrant_collection_api_supported(Some("nightly")));
    }

    #[test]
    fn read_collection_health_parses_qdrant_native_signals() {
        let body = r#"{"result": {
            "status": "yellow",
            "points_count": 1525,
            "indexed_vectors_count": 1400,
            "segments_count": 12,
            "optimizer_status": "ok",
            "config": {"params": {}}
        }, "status": "ok", "time": 0.001}"#;
        let transport = FakeTransport::returning(vec![body]);
        let health = read_collection_health(&transport, TEST_COLLECTION).unwrap();
        assert_eq!(health.status.as_deref(), Some("yellow"));
        assert_eq!(health.points_count, Some(1525));
        assert_eq!(health.indexed_vectors_count, Some(1400));
        assert_eq!(health.segments_count, Some(12));
        assert_eq!(health.optimizer_status, Some(serde_json::json!("ok")));
        // The read hit Qdrant's documented collection-info path.
        assert_eq!(
            transport.calls.borrow()[0].0,
            format!("/collections/{TEST_COLLECTION}")
        );
    }

    #[test]
    fn read_collection_health_is_tolerant_of_missing_fields() {
        // A minor Qdrant shape drift (a field absent) degrades that field, never
        // the whole read.
        let transport = FakeTransport::returning(vec![r#"{"result": {"status": "green"}}"#]);
        let health = read_collection_health(&transport, TEST_COLLECTION).unwrap();
        assert_eq!(health.status.as_deref(), Some("green"));
        assert_eq!(health.points_count, None);
        assert_eq!(health.segments_count, None);
    }
}
