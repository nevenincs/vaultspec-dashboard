//! The index pipeline (engine-spec §2.4, D2.4): cold full-index with
//! parallel per-document fan-out, and content-hash incremental re-index
//! against the store cache (skip-heavy and deterministic).
//!
//! Cold start is a feature: the one-shot CLI runs this same pipeline
//! without a resident service. Persistence is cache, not truth (D8.1):
//! `full_index` from a deleted cache must converge to the identical graph
//! (D8.2 — proven by the re-derivability test in `tests/`).

use std::path::Path;

use engine_model::{
    CanonicalKey, Edge, Facet, Node, NodeId, NodeKind, Presence, Provenance, RelationKind,
    ResolutionState, ScopeRef, Tier, Timestamp, edge_id, node_id,
};
use ingest_struct::extract::{ExtractedMention, MentionKind};
use ingest_struct::resolve::resolve;
use rayon::prelude::*;

use crate::graph::{EdgeAttrs, LinkageGraph};

#[derive(Debug, thiserror::Error)]
pub enum IndexError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("store: {0}")]
    Store(#[from] engine_store::StoreError),
    #[error("read: {0}")]
    Read(#[from] ingest_struct::reader::StructError),
    #[error("edge: {0}")]
    Edge(#[from] crate::edges::EdgeError),
    #[error("cache: {0}")]
    Cache(#[from] serde_json::Error),
    #[error("git: {0}")]
    Git(String),
}

pub type Result<T> = std::result::Result<T, IndexError>;

/// Cache artifact kind for structural extraction results.
const EXTRACT_KIND: &str = "extract";

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct IndexStats {
    pub documents: usize,
    pub cache_hits: usize,
    pub extracted: usize,
    pub edges: usize,
}

/// Index one worktree scope into a fresh graph (the cold path).
pub fn index_worktree(
    root: &Path,
    scope: &ScopeRef,
    store: &engine_store::Store,
    observed_at: Timestamp,
) -> Result<(LinkageGraph, IndexStats)> {
    let mut graph = LinkageGraph::new();
    let stats = index_worktree_into(&mut graph, root, scope, store, observed_at)?;
    Ok((graph, stats))
}

/// Index one worktree scope into an existing graph — the watcher's partial
/// re-ingestion path. **Idempotent** (audit W02P05-202): re-ingesting the
/// same documents converges to the cold rebuild, never inflates.
pub fn index_worktree_into(
    graph: &mut LinkageGraph,
    root: &Path,
    scope: &ScopeRef,
    store: &engine_store::Store,
    observed_at: Timestamp,
) -> Result<IndexStats> {
    let docs = vault_documents(root)?;
    let mut stats = IndexStats {
        documents: docs.len(),
        ..Default::default()
    };

    // Parallel per-document read + extract fan-out (CPU-bound; D2.4).
    // The store is single-writer, so cache lookups/writes happen on the
    // coordinating thread after the parallel section.
    let extracted: Vec<(String, String, String)> = docs
        .par_iter()
        .map(|rel_path| {
            let body = ingest_struct::reader::read_from_worktree(root, rel_path)?;
            Ok((rel_path.clone(), body.blob_hash, body.text))
        })
        .collect::<Result<_>>()?;

    for (rel_path, blob_hash, text) in extracted {
        let stem = doc_stem(&rel_path);
        let feature_tags = frontmatter_feature_tags(&text);
        graph.upsert_node(Node {
            id: node_id(&CanonicalKey::Document { stem: &stem }),
            kind: NodeKind::Document,
            key: stem.clone(),
            title: None,
            feature_tags,
            facets: vec![Facet {
                scope: scope.clone(),
                presence: Presence::Exists,
                content_hash: Some(blob_hash.clone()),
                lifecycle: None,
            }],
        });

        // Content-hash skip: reuse cached extraction when the blob is
        // unchanged (D2.4 cache discipline).
        let mentions: Vec<ExtractedMention> = match store.get_artifact(EXTRACT_KIND, &blob_hash)? {
            Some(cached) => {
                stats.cache_hits += 1;
                serde_json::from_str(&cached)?
            }
            None => {
                stats.extracted += 1;
                let fresh = ingest_struct::extract::extract(&text);
                store.put_artifact(
                    EXTRACT_KIND,
                    &blob_hash,
                    &serde_json::to_string(&fresh)?,
                    observed_at,
                )?;
                fresh
            }
        };

        // Resolution always runs against the *current* tree (resolution
        // state is live signal, not cacheable fact).
        //
        // Multiplicity aggregates at extraction granularity (audit
        // W02P05-202 / W01P01-003): repeated same-target mentions in one
        // document collapse to one edge carrying the count, ingested once
        // — so re-ingestion replaces instead of inflating.
        let mut by_id: std::collections::BTreeMap<String, (Edge, u32, Option<String>)> =
            std::collections::BTreeMap::new();
        for resolved in resolve(root, mentions) {
            let target = resolved.target.clone();
            let edge = structural_edge_for(&stem, &blob_hash, &resolved, scope, observed_at);
            by_id
                .entry(edge.id.0.clone())
                .and_modify(|(_, count, _)| *count += 1)
                .or_insert((edge, 1, target));
        }
        for (_, (edge, multiplicity, resolved_target)) in by_id {
            stats.edges += 1;
            crate::edges::ingest(
                graph,
                edge,
                EdgeAttrs {
                    multiplicity,
                    resolved_target,
                    ..Default::default()
                },
            )?;
        }
    }
    Ok(stats)
}

/// Build the structural edge for one resolved mention. Shared with the
/// blob-true as-of path so present and historical views mint identical
/// edge identities for identical content.
pub(crate) fn structural_edge_for(
    src_stem: &str,
    blob_hash: &str,
    resolved: &ingest_struct::resolve::ResolvedMention,
    scope: &ScopeRef,
    observed_at: Timestamp,
) -> Edge {
    // Identity from the MENTION TEXT alone (audit W02P06-301): resolution
    // output updates only `state` (and the resolved target attribute),
    // never identity — a broken→resolved transition keeps the same edge id
    // (D3.3 retained-edge-with-mutable-state; contract §2 animate-by-id).
    // Step mentions key by canonical identifier alone (plan-stem
    // qualification belongs to plan-container nodes minted from plans, not
    // to mention targets); symbols key by the unqualified `#symbol` form.
    let src = node_id(&CanonicalKey::Document { stem: src_stem });
    let (dst, target_key): (NodeId, String) = match &resolved.mention.kind {
        MentionKind::Path(p) => (
            node_id(&CanonicalKey::CodeArtifact {
                path: p,
                symbol: None,
            }),
            p.clone(),
        ),
        MentionKind::WikiLink(stem) => (node_id(&CanonicalKey::Document { stem }), stem.clone()),
        MentionKind::StepId(s) => (NodeId::derive(&NodeKind::PlanContainer, s), s.clone()),
        MentionKind::Symbol(sym) => (
            node_id(&CanonicalKey::CodeArtifact {
                path: "",
                symbol: Some(sym),
            }),
            sym.clone(),
        ),
    };
    let confidence = match resolved.state {
        ResolutionState::Resolved => ingest_struct::CONFIDENCE_RESOLVED,
        ResolutionState::Stale => ingest_struct::CONFIDENCE_STALE,
        ResolutionState::Broken => crate::edges::STRUCTURAL_BROKEN_CONFIDENCE,
    };
    let provenance = Provenance::DocumentBody {
        blob_hash: blob_hash.to_string(),
        span: resolved.mention.span,
        target: target_key,
    };
    let relation = RelationKind::Mentions;
    let id = edge_id(&src, &dst, &relation, Tier::Structural, &provenance);
    Edge {
        id,
        src,
        dst,
        relation,
        tier: Tier::Structural,
        confidence,
        state: Some(resolved.state),
        provenance,
        scope: scope.clone(),
        observed_at,
    }
}

/// Canonical, deterministic serialization of a graph — the D8.2
/// re-derivability comparator (sorted nodes and edges by id).
pub fn canonical_snapshot(graph: &LinkageGraph) -> String {
    let mut nodes: Vec<&Node> = graph.nodes().collect();
    nodes.sort_by(|a, b| a.id.0.cmp(&b.id.0));
    let mut edges: Vec<&crate::graph::StoredEdge> = graph.edges().collect();
    edges.sort_by(|a, b| a.edge.id.0.cmp(&b.edge.id.0));
    let nodes_json: Vec<serde_json::Value> = nodes
        .iter()
        .map(|n| serde_json::to_value(n).expect("node serializes"))
        .collect();
    let edges_json: Vec<serde_json::Value> = edges
        .iter()
        .map(|s| {
            serde_json::json!({
                "edge": s.edge,
                "multiplicity": s.attrs.multiplicity,
                "weight": s.attrs.weight,
                "resolved_target": s.attrs.resolved_target,
            })
        })
        .collect();
    serde_json::to_string_pretty(&serde_json::json!({
        "nodes": nodes_json,
        "edges": edges_json,
    }))
    .expect("snapshot serializes")
}

fn doc_stem(rel_path: &str) -> String {
    rel_path
        .rsplit('/')
        .next()
        .unwrap_or(rel_path)
        .trim_end_matches(".md")
        .to_string()
}

/// Feature tags from vault frontmatter: `- '#tag'` entries that are not
/// directory tags.
pub(crate) fn frontmatter_feature_tags(text: &str) -> Vec<String> {
    const DIRECTORY_TAGS: &[&str] = &[
        "adr",
        "audit",
        "exec",
        "index",
        "plan",
        "reference",
        "research",
    ];
    let Some(rest) = text.strip_prefix("---") else {
        return Vec::new();
    };
    let Some(end) = rest.find("\n---") else {
        return Vec::new();
    };
    rest[..end]
        .lines()
        .filter_map(|line| {
            let tag = line
                .trim()
                .strip_prefix("- '#")
                .and_then(|t| t.strip_suffix('\''))?;
            (!DIRECTORY_TAGS.contains(&tag)).then(|| tag.to_string())
        })
        .collect()
}

/// Enumerate vault documents (`.vault/**/*.md`) as repo-relative paths.
fn vault_documents(root: &Path) -> Result<Vec<String>> {
    let vault = root.join(".vault");
    let mut out = Vec::new();
    let mut stack = vec![vault];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if path.is_dir() {
                if !name.starts_with('.') && name != "data" && name != "logs" {
                    stack.push(path);
                }
            } else if name.ends_with(".md")
                && let Ok(rel) = path.strip_prefix(root)
            {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    out.sort();
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ingest_struct::extract::ExtractedMention;
    use ingest_struct::resolve::ResolvedMention;

    fn scope() -> ScopeRef {
        ScopeRef::Ref {
            name: "main".into(),
        }
    }

    fn mention(kind: MentionKind, state: ResolutionState, target: Option<&str>) -> ResolvedMention {
        ResolvedMention {
            mention: ExtractedMention {
                kind,
                span: (0, 10),
            },
            state,
            target: target.map(str::to_string),
        }
    }

    #[test]
    fn resolution_transitions_never_change_edge_identity() {
        // Audit W02P06-301: identity from mention text alone - a
        // broken-to-resolved transition mutates state, never the edge id.
        for (kind, resolved_target) in [
            (MentionKind::StepId("W01.P02.S03".into()), "some-plan.md"),
            (
                MentionKind::Symbol("engine::graph::insert".into()),
                "src/graph.rs",
            ),
            (MentionKind::Path("src/lib.rs".into()), "src/lib.rs"),
        ] {
            let broken = structural_edge_for(
                "doc-a",
                "blob1",
                &mention(kind.clone(), ResolutionState::Broken, None),
                &scope(),
                0,
            );
            let healed = structural_edge_for(
                "doc-a",
                "blob1",
                &mention(kind, ResolutionState::Resolved, Some(resolved_target)),
                &scope(),
                99,
            );
            assert_eq!(broken.id, healed.id, "identity survives resolution");
            assert_ne!(broken.state, healed.state, "state carries the signal");
        }
    }
}
