//! Code-corpus query projections (codebase-graphing ADR D3/D5).
//!
//! Operates on the SEPARATE code `LinkageGraph` instance (never the vault
//! graph — the disconnection invariant) and serves the SAME `GraphSlice`
//! shape through the same `node_view`/`edge_view` projections, so the wire is
//! byte-conformant with the vault corpus:
//!
//! - Feature-class granularity → the MODULE ROLLUP: module nodes plus
//!   aggregated import `meta_edges` (the code analogue of the constellation).
//! - Document-class granularity → FILE granularity: file + module nodes with
//!   raw `imports`/`contains` edges, endpoint-pruned to the kept set.
//!
//! Narrowing is code-corpus-shaped (directory prefix, language) and lives
//! OUTSIDE the vault `Filter` grammar (ADR D5: the vault filter shape is
//! frozen; corpus-mismatched facets are a typed validation error at the route).

use std::collections::{BTreeMap, HashSet};

use engine_graph::{LinkageGraph, MetaEdge};
use engine_model::{NodeKind, RelationKind, ScopeRef};
use serde_json::{Value, json};

use crate::graph::{GraphSlice, edge_view, node_view};

/// Code-corpus narrowing (ADR D5): the code corpus's own request grammar.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CodeNarrow {
    /// Keep only nodes whose repo-relative path sits under this prefix.
    pub dir_prefix: Option<String>,
    /// Keep only files in these languages (wire tokens: `rust`, `typescript`,
    /// `javascript`, `python`). Empty = all.
    pub languages: Vec<String>,
}

/// The language wire token for a file path. Mirrors `ingest-code`'s `Lang`
/// classification by extension — duplicated as a five-line map rather than
/// pulling the tree-sitter dependency chain into the query crate.
pub fn language_token(path: &str) -> Option<&'static str> {
    let ext = path.rsplit('.').next()?;
    match ext {
        "rs" => Some("rust"),
        "ts" | "mts" | "cts" | "tsx" => Some("typescript"),
        "js" | "mjs" | "cjs" | "jsx" => Some("javascript"),
        "py" => Some("python"),
        _ => None,
    }
}

fn narrow_keeps(narrow: &CodeNarrow, key: &str, is_file: bool) -> bool {
    if let Some(prefix) = &narrow.dir_prefix {
        // The root module key `.` sits above every prefix.
        let under = key == prefix
            || key.starts_with(&format!("{prefix}/"))
            || (!is_file && prefix.starts_with(&format!("{key}/")));
        if !under && key != "." {
            return false;
        }
        // The root module survives only when no prefix is set.
        if key == "." {
            return false;
        }
    }
    if is_file && !narrow.languages.is_empty() {
        let Some(lang) = language_token(key) else {
            return false;
        };
        if !narrow.languages.iter().any(|l| l == lang) {
            return false;
        }
    }
    true
}

/// Direct file-child count per module (the rollup's `member_count`).
fn member_counts(graph: &LinkageGraph) -> BTreeMap<String, usize> {
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    for stored in graph.edges() {
        if stored.edge.relation == RelationKind::Contains
            && stored.edge.src.0.starts_with("code-mod:")
            && stored.edge.dst.0.starts_with("code:")
        {
            *counts.entry(stored.edge.src.0.clone()).or_default() += 1;
        }
    }
    counts
}

/// The module a file belongs to: its direct parent directory (a module by
/// construction — `ingest-code` mints one for every source-bearing dir).
fn module_key_of_file(path: &str) -> String {
    match path.rfind('/') {
        Some(i) => path[..i].to_string(),
        None => ".".to_string(),
    }
}

/// Aggregate file-level `imports` edges into module-level meta-edges,
/// mirroring the constellation aggregation exactly: unordered canonical pair
/// (one ribbon per module pair), multiplicity-weighted count, per-tier
/// breakdown. `src_feature`/`dst_feature` carry the module KEYS (the field
/// names are the shared wire shape; the values are corpus-appropriate).
pub fn code_meta_edges(graph: &LinkageGraph) -> Vec<MetaEdge> {
    // Mirrors the constellation's `MetaAgg` accumulator shape.
    type ModuleMetaAgg = (usize, BTreeMap<&'static str, usize>);
    let mut agg: BTreeMap<(String, String), ModuleMetaAgg> = BTreeMap::new();
    for stored in graph.edges() {
        if stored.edge.relation != RelationKind::Imports {
            continue;
        }
        let src_mod = module_key_of_file(stored.edge.src.0.trim_start_matches("code:"));
        let dst_mod = module_key_of_file(stored.edge.dst.0.trim_start_matches("code:"));
        if src_mod == dst_mod {
            continue;
        }
        let (lo, hi) = if src_mod <= dst_mod {
            (src_mod, dst_mod)
        } else {
            (dst_mod, src_mod)
        };
        let entry = agg.entry((lo, hi)).or_default();
        entry.0 += stored.attrs.multiplicity.max(1) as usize;
        *entry.1.entry(stored.edge.tier.as_str()).or_default() += 1;
    }
    agg.into_iter()
        .map(|((lo, hi), (count, breakdown_by_tier))| MetaEdge {
            src: format!("code-mod:{lo}"),
            dst: format!("code-mod:{hi}"),
            src_feature: lo,
            dst_feature: hi,
            count,
            breakdown_by_tier,
        })
        .collect()
}

/// Query the code corpus. `feature_class_granularity == true` serves the
/// module rollup (the constellation analogue); `false` serves file
/// granularity. Both return the standard `GraphSlice`; the route applies the
/// unconditional `bound_slice` ceiling exactly as it does for the vault
/// corpus.
pub fn code_graph_query(
    graph: &LinkageGraph,
    scope: &ScopeRef,
    feature_class_granularity: bool,
    narrow: &CodeNarrow,
) -> GraphSlice {
    let filter = crate::filter::Filter::default()
        .validated()
        .expect("the default filter is always valid");

    if feature_class_granularity {
        let counts = member_counts(graph);
        let mut nodes: Vec<Value> = graph
            .nodes()
            .filter(|n| n.kind == NodeKind::CodeModule)
            .filter(|n| narrow_keeps(narrow, &n.key, false))
            .map(|n| {
                let mut view = node_view(graph, scope, n);
                view["member_count"] =
                    Value::from(counts.get(n.id.0.as_str()).copied().unwrap_or(0));
                view
            })
            .collect();
        nodes.sort_by(|a, b| a["id"].as_str().cmp(&b["id"].as_str()));
        let kept: HashSet<&str> = nodes
            .iter()
            .filter_map(|n| n.get("id").and_then(Value::as_str))
            .collect();
        let meta = code_meta_edges(graph)
            .into_iter()
            .filter(|m| kept.contains(m.src.as_str()) && kept.contains(m.dst.as_str()))
            .collect();
        return GraphSlice {
            nodes,
            edges: Vec::new(),
            meta_edges: meta,
            filter,
        };
    }

    // File granularity: file + module nodes, endpoint-pruned raw edges.
    let mut kept_nodes: Vec<_> = graph
        .nodes()
        .filter(|n| match n.kind {
            NodeKind::CodeArtifact => narrow_keeps(narrow, &n.key, true),
            NodeKind::CodeModule => narrow_keeps(narrow, &n.key, false),
            _ => false,
        })
        .collect();
    kept_nodes.sort_by(|a, b| a.id.0.cmp(&b.id.0));
    let kept: HashSet<&str> = kept_nodes.iter().map(|n| n.id.0.as_str()).collect();

    let mut edges: Vec<_> = graph
        .edges()
        .filter(|s| kept.contains(s.edge.src.0.as_str()) && kept.contains(s.edge.dst.0.as_str()))
        .map(|s| &s.edge)
        .collect();
    edges.sort_by(|a, b| a.id.0.cmp(&b.id.0));

    let counts = member_counts(graph);
    let nodes = kept_nodes
        .iter()
        .map(|n| {
            let mut view = node_view(graph, scope, n);
            match n.kind {
                NodeKind::CodeArtifact => {
                    if let Some(lang) = language_token(&n.key) {
                        view["language"] = Value::String(lang.to_string());
                    }
                }
                _ => {
                    view["member_count"] =
                        Value::from(counts.get(n.id.0.as_str()).copied().unwrap_or(0));
                }
            }
            view
        })
        .collect();
    let edge_views = edges.iter().map(|e| edge_view(graph, e)).collect();

    GraphSlice {
        nodes,
        edges: edge_views,
        meta_edges: Vec::new(),
        filter,
    }
}

/// The code corpus's facet vocabulary (ADR D5: `/filters` serves the ACTIVE
/// corpus's vocabulary only): the distinct language tokens present and the
/// module directory keys, both sorted.
pub fn code_filter_vocabulary(graph: &LinkageGraph) -> Value {
    let mut languages: Vec<&'static str> = graph
        .nodes()
        .filter(|n| n.kind == NodeKind::CodeArtifact)
        .filter_map(|n| language_token(&n.key))
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    languages.sort_unstable();
    let mut dirs: Vec<&str> = graph
        .nodes()
        .filter(|n| n.kind == NodeKind::CodeModule)
        .map(|n| n.key.as_str())
        .collect();
    dirs.sort_unstable();
    json!({ "languages": languages, "dirs": dirs })
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_graph::graph::EdgeAttrs;
    use engine_model::{
        CanonicalKey, Edge, Facet, Node, NodeId, Presence, Provenance, ResolutionState, Tier,
        edge_id, node_id,
    };

    fn scope() -> ScopeRef {
        ScopeRef::Worktree {
            path: "Y:/repo".into(),
        }
    }

    fn file_node(path: &str) -> Node {
        Node {
            id: node_id(&CanonicalKey::CodeArtifact { path, symbol: None }),
            kind: NodeKind::CodeArtifact,
            key: path.into(),
            title: None,
            doc_type: None,
            dates: None,
            feature_tags: vec![],
            status: None,
            tier: None,
            facets: vec![Facet {
                scope: scope(),
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        }
    }

    fn module_node(dir: &str) -> Node {
        Node {
            id: node_id(&CanonicalKey::CodeModule { dir }),
            kind: NodeKind::CodeModule,
            key: dir.into(),
            title: None,
            doc_type: None,
            dates: None,
            feature_tags: vec![],
            status: None,
            tier: None,
            facets: vec![Facet {
                scope: scope(),
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        }
    }

    fn import_edge(src: &str, dst: &str) -> Edge {
        let s = NodeId(format!("code:{src}"));
        let d = NodeId(format!("code:{dst}"));
        let provenance = Provenance::DocumentBody {
            blob_hash: "h".into(),
            span: (0, 1),
            target: dst.into(),
        };
        Edge {
            id: edge_id(
                &s,
                &d,
                &RelationKind::Imports,
                Tier::Structural,
                &provenance,
            ),
            src: s,
            dst: d,
            relation: RelationKind::Imports,
            tier: Tier::Structural,
            confidence: 0.9,
            state: Some(ResolutionState::Resolved),
            provenance,
            scope: scope(),
            observed_at: 0,
        }
    }

    fn contains_edge(src_mod: &str, dst_file: &str) -> Edge {
        let s = NodeId(format!("code-mod:{src_mod}"));
        let d = NodeId(format!("code:{dst_file}"));
        let provenance = Provenance::TreeLayout {
            target: dst_file.into(),
        };
        Edge {
            id: edge_id(&s, &d, &RelationKind::Contains, Tier::Declared, &provenance),
            src: s,
            dst: d,
            relation: RelationKind::Contains,
            tier: Tier::Declared,
            confidence: 1.0,
            state: None,
            provenance,
            scope: scope(),
            observed_at: 0,
        }
    }

    fn demo_graph() -> LinkageGraph {
        let mut g = LinkageGraph::new();
        for f in ["app/a.ts", "app/b.ts", "lib/c.py", "lib/d.rs"] {
            g.upsert_node(file_node(f));
        }
        for m in ["app", "lib"] {
            g.upsert_node(module_node(m));
        }
        for (m, f) in [
            ("app", "app/a.ts"),
            ("app", "app/b.ts"),
            ("lib", "lib/c.py"),
            ("lib", "lib/d.rs"),
        ] {
            engine_graph::edges::ingest(&mut g, contains_edge(m, f), EdgeAttrs::default()).unwrap();
        }
        // a→b intra-module; a→c and b→d cross-module.
        for (s, d, m) in [
            ("app/a.ts", "app/b.ts", 1u32),
            ("app/a.ts", "lib/c.py", 3),
            ("app/b.ts", "lib/d.rs", 1),
        ] {
            engine_graph::edges::ingest(
                &mut g,
                import_edge(s, d),
                EdgeAttrs {
                    multiplicity: m,
                    ..Default::default()
                },
            )
            .unwrap();
        }
        g
    }

    #[test]
    fn rollup_serves_module_nodes_and_aggregated_meta_edges() {
        let g = demo_graph();
        let slice = code_graph_query(&g, &scope(), true, &CodeNarrow::default());
        let ids: Vec<&str> = slice
            .nodes
            .iter()
            .filter_map(|n| n["id"].as_str())
            .collect();
        assert_eq!(ids, vec!["code-mod:app", "code-mod:lib"]);
        assert!(slice.edges.is_empty(), "rollup carries meta_edges only");
        assert_eq!(slice.meta_edges.len(), 1, "one ribbon per module pair");
        let m = &slice.meta_edges[0];
        assert_eq!(
            (m.src.as_str(), m.dst.as_str()),
            ("code-mod:app", "code-mod:lib")
        );
        assert_eq!(m.count, 4, "multiplicity-weighted: 3 (a→c) + 1 (b→d)");
        assert_eq!(slice.nodes[0]["member_count"], Value::from(2));
    }

    #[test]
    fn file_granularity_prunes_to_kept_endpoints_and_annotates_language() {
        let g = demo_graph();
        // Narrow to app/: lib files drop, so cross-module imports drop too.
        let narrow = CodeNarrow {
            dir_prefix: Some("app".into()),
            languages: vec![],
        };
        let slice = code_graph_query(&g, &scope(), false, &narrow);
        let ids: Vec<&str> = slice
            .nodes
            .iter()
            .filter_map(|n| n["id"].as_str())
            .collect();
        assert_eq!(ids, vec!["code-mod:app", "code:app/a.ts", "code:app/b.ts"]);
        let file = slice
            .nodes
            .iter()
            .find(|n| n["id"] == "code:app/a.ts")
            .unwrap();
        assert_eq!(file["language"], Value::from("typescript"));
        // Kept edges: app's two contains + the intra-module a→b import.
        assert_eq!(slice.edges.len(), 3);
        assert!(slice.meta_edges.is_empty());
    }

    #[test]
    fn language_narrow_drops_other_languages_and_their_edges() {
        let g = demo_graph();
        let narrow = CodeNarrow {
            dir_prefix: None,
            languages: vec!["python".into()],
        };
        let slice = code_graph_query(&g, &scope(), false, &narrow);
        let file_ids: Vec<&str> = slice
            .nodes
            .iter()
            .filter_map(|n| n["id"].as_str())
            .filter(|id| id.starts_with("code:"))
            .collect();
        assert_eq!(file_ids, vec!["code:lib/c.py"]);
    }

    #[test]
    fn vocabulary_serves_languages_and_module_dirs() {
        let g = demo_graph();
        let v = code_filter_vocabulary(&g);
        assert_eq!(v["languages"], json!(["python", "rust", "typescript"]));
        assert_eq!(v["dirs"], json!(["app", "lib"]));
    }
}
