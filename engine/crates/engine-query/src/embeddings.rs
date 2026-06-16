//! The bounded embedding projection (graph-semantic-embeddings ADR D2, D3, D8).
//!
//! This is the PURE, CPU-only selection half of the `/graph/embeddings` route:
//! given the scope's served document node-id set and a node-id → stored-vector
//! map (read from rag's Qdrant by the API layer's rag-client call — this module
//! never touches rag, keeping engine-query rag-free and CPU-only), it assembles
//! the bounded response: the float32 vectors keyed by node id, capped at
//! [`crate::graph::MAX_GRAPH_NODES`] with an honest `truncated` block, carrying
//! the graph generation it was read at.
//!
//! The engine serves the raw vector verbatim — NO dimensionality reduction (ADR
//! D4 forbids a server-side projection; the worker does PCA-to-2D). The vector is
//! an additive value keyed by a stable node id; it enters NO node or edge stable
//! key (ADR D8 / provenance-stable-keys-are-identity-bearing), exactly as
//! `salience` and `status_value` are additive projections.

use std::collections::HashMap;

use serde::Serialize;

use crate::graph::MAX_GRAPH_NODES;

/// One served node embedding: the stable node id and its raw float32 vector.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct EmbeddingEntry {
    /// The stable node id the vector is a value on (`doc:{stem}`).
    pub node_id: String,
    /// The raw stored dense vector, served verbatim (no reduction, ADR D4).
    pub vector: Vec<f32>,
}

/// The bounded embedding slice the route serializes under `data`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct EmbeddingSlice {
    /// The served vectors, keyed by node id, in the SERVED node-set order so the
    /// embedding set matches `/graph/query`'s DOI-ordered node set (ADR open
    /// question: the embedding set matches the served node set).
    pub embeddings: Vec<EmbeddingEntry>,
}

/// Build the bounded embedding slice for a served node-id set.
///
/// `served_node_ids` is the scope's served document node set in DOI order (the
/// SAME selection `/graph/query` makes, so the two slices align). `vectors` is
/// the node-id → stored-vector map read from Qdrant. For each served node that
/// HAS a stored vector we emit an entry, preserving the served order; a served
/// node with no stored vector is omitted (honest absence → the scene's fallback
/// ring, ADR D7). The result is capped at [`MAX_GRAPH_NODES`]; the returned
/// `Option<usize>` is the pre-cap total of would-be entries when truncation
/// fired (for the honest `truncated` block, mirroring `graph::bound_slice`).
pub fn build_embedding_slice(
    served_node_ids: &[String],
    vectors: &HashMap<String, Vec<f32>>,
) -> (EmbeddingSlice, Option<usize>) {
    let mut embeddings: Vec<EmbeddingEntry> = served_node_ids
        .iter()
        .filter_map(|id| {
            vectors.get(id).map(|vector| EmbeddingEntry {
                node_id: id.clone(),
                vector: vector.clone(),
            })
        })
        .collect();
    let total = embeddings.len();
    let truncated = if total > MAX_GRAPH_NODES {
        embeddings.truncate(MAX_GRAPH_NODES);
        Some(total)
    } else {
        None
    };
    (EmbeddingSlice { embeddings }, truncated)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vmap(pairs: &[(&str, Vec<f32>)]) -> HashMap<String, Vec<f32>> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.clone()))
            .collect()
    }

    #[test]
    fn serves_vectors_for_served_nodes_in_served_order() {
        let served = vec!["doc:b".to_string(), "doc:a".to_string()];
        let vectors = vmap(&[("doc:a", vec![1.0, 2.0]), ("doc:b", vec![3.0, 4.0])]);
        let (slice, truncated) = build_embedding_slice(&served, &vectors);
        assert_eq!(truncated, None);
        // DOI/served order is preserved: b before a.
        assert_eq!(slice.embeddings[0].node_id, "doc:b");
        assert_eq!(slice.embeddings[0].vector, vec![3.0, 4.0]);
        assert_eq!(slice.embeddings[1].node_id, "doc:a");
    }

    #[test]
    fn a_served_node_without_a_vector_is_omitted_as_honest_absence() {
        // `doc:b` is served but has no stored vector (not yet in Qdrant): it is
        // omitted, NOT served with an empty vector — the scene rings it honestly.
        let served = vec!["doc:a".to_string(), "doc:b".to_string()];
        let vectors = vmap(&[("doc:a", vec![1.0])]);
        let (slice, _) = build_embedding_slice(&served, &vectors);
        assert_eq!(slice.embeddings.len(), 1);
        assert_eq!(slice.embeddings[0].node_id, "doc:a");
    }

    #[test]
    fn a_stored_vector_for_a_non_served_node_is_not_served() {
        // The embedding set NEVER exceeds the served node set: a Qdrant vector for
        // a node outside the served slice is not leaked onto the wire.
        let served = vec!["doc:a".to_string()];
        let vectors = vmap(&[("doc:a", vec![1.0]), ("doc:z", vec![9.0])]);
        let (slice, _) = build_embedding_slice(&served, &vectors);
        assert_eq!(slice.embeddings.len(), 1);
        assert_eq!(slice.embeddings[0].node_id, "doc:a");
    }

    #[test]
    fn the_slice_is_bounded_at_the_node_ceiling_with_an_honest_total() {
        let n = MAX_GRAPH_NODES + 25;
        let served: Vec<String> = (0..n).map(|i| format!("doc:{i:06}")).collect();
        let vectors: HashMap<String, Vec<f32>> =
            served.iter().map(|id| (id.clone(), vec![1.0])).collect();
        let (slice, truncated) = build_embedding_slice(&served, &vectors);
        assert_eq!(slice.embeddings.len(), MAX_GRAPH_NODES);
        assert_eq!(truncated, Some(n), "the pre-cap total is reported honestly");
    }
}
