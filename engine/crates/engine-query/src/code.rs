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

/// The language wire token for a file path. Re-exported from `engine-model` (the
/// single source of truth) so the code corpus's language classification cannot
/// drift from `ingest-code`'s (codebase-graphing review CGR-007): this crate no
/// longer hand-mirrors the extension map, it shares the one in the dependency
/// sink. Kept at this path so existing `engine_query::code::language_token`
/// callers are unaffected.
pub use engine_model::language_token;

/// Code-corpus narrowing (ADR D5): the code corpus's own request grammar.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CodeNarrow {
    /// Keep only nodes whose repo-relative path sits under this prefix.
    pub dir_prefix: Option<String>,
    /// Keep only files in these languages (wire tokens: `rust`, `typescript`,
    /// `javascript`, `python`). Empty = all.
    pub languages: Vec<String>,
    /// Inclusive `yyyy-mm-dd` day-key bounds on a FILE's worktree mtime
    /// (`dates.modified`) — the timeline range facet, shared with the vault
    /// grammar (code-timeline-range ADR). Either bound open; both `None` = no
    /// date narrowing. A file with no mtime is excluded once a bound is set
    /// (mirrors the vault's missing-date exclusion); a MODULE passes while at
    /// least one descendant file passes, so the containment hierarchy above
    /// in-range content never orphans.
    pub date_from: Option<String>,
    pub date_to: Option<String>,
}

/// Whether the narrow carries a date bound at all (the fast path skips the
/// in-range precomputation entirely).
fn has_date_narrow(narrow: &CodeNarrow) -> bool {
    narrow.date_from.is_some() || narrow.date_to.is_some()
}

/// The in-range membership for a date-narrowed query: file KEYS whose mtime day
/// falls inside the bounds, plus every ancestor module key of an in-range file
/// (including the root module). One bounded pass over the held graph.
fn date_in_range_keys(
    graph: &LinkageGraph,
    narrow: &CodeNarrow,
) -> (HashSet<String>, HashSet<String>) {
    let from = narrow.date_from.as_deref();
    let to = narrow.date_to.as_deref();
    let mut files: HashSet<String> = HashSet::new();
    let mut modules: HashSet<String> = HashSet::new();
    for n in graph.nodes() {
        if n.kind != NodeKind::CodeArtifact {
            continue;
        }
        let day = n
            .dates
            .as_ref()
            .and_then(|d| d.modified.map(crate::lineage::ms_to_date_key));
        if !crate::lineage::created_in_range(day.as_deref(), from, to) {
            continue;
        }
        files.insert(n.key.clone());
        // Every ancestor directory of an in-range file is an in-range module,
        // so the containment chain above surviving content survives with it.
        let mut dir = n.key.as_str();
        while let Some(i) = dir.rfind('/') {
            dir = &dir[..i];
            modules.insert(dir.to_string());
        }
        modules.insert(".".to_string());
    }
    (files, modules)
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

/// The TOP-LEVEL module a node belongs to: the first path segment (CGR-005 viz
/// wire). This is the color-identity + legend grouping key — every node under
/// `engine/...` shares the module `engine`. A root-level file (no separator)
/// belongs to the root module `.`.
fn top_level_module(key: &str) -> String {
    match key.split_once('/') {
        // A nested key (a file or a submodule) → its first path segment.
        Some((first, _)) => first.to_string(),
        // A slash-less key is ALREADY a top-level identity: a top-level module
        // directory (`app`), the root module (`.`), or a root-level file.
        None => key.to_string(),
    }
}

/// Directory depth of a node key (the viz lightness ramp): the root module is
/// depth 0, and each path separator is one level deeper.
fn path_depth(key: &str) -> u64 {
    if key == "." {
        0
    } else {
        key.matches('/').count() as u64
    }
}

/// Per-generation hue assignment (CGR-005 viz wire, `display-state-is-backend-served`):
/// rank the TOP-LEVEL modules by file member count (ties broken by name for
/// determinism) and hand the top seven the categorical hue indexes `0..=6`;
/// every other module gets `null` (the long-tail neutral hue). Computed over the
/// FULL graph — never the narrowed slice — so a filtered view serves the SAME
/// hue for a given module (color identity is stable under narrowing). It rides
/// the code corpus's per-generation memo (`CodeGraphCell`) on the hot path,
/// exactly like `member_counts`.
fn module_hues(graph: &LinkageGraph) -> BTreeMap<String, u8> {
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    for n in graph.nodes() {
        if n.kind == NodeKind::CodeArtifact {
            *counts.entry(top_level_module(&n.key)).or_default() += 1;
        }
    }
    let mut ranked: Vec<(String, usize)> = counts.into_iter().collect();
    // Highest member count first; alphabetical tie-break keeps it deterministic.
    ranked.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    ranked
        .into_iter()
        .take(7)
        .enumerate()
        .map(|(i, (module, _))| (module, i as u8))
        .collect()
}

/// Attach the served module-identity fields (CGR-005) to a code node view:
/// `module` (top-level identity, doubling as a `dir_prefix` narrow for the
/// legend), `module_hue` (`0..=6` or null), and `depth`.
fn annotate_module_identity(view: &mut Value, key: &str, hues: &BTreeMap<String, u8>) {
    let module = top_level_module(key);
    view["module_hue"] = match hues.get(&module) {
        Some(h) => Value::from(*h),
        None => Value::Null,
    };
    view["depth"] = Value::from(path_depth(key));
    view["module"] = Value::String(module);
}

/// Percentile RECENCY rank per code node key (code-graph-heat ADR): each dated
/// file ranks by its worktree mtime among ALL dated files — 0 = oldest,
/// 1 = newest, a single dated file ranks 1.0 — and a module carries the MAX
/// over its descendant files ("hot content makes a hot container"). A rank,
/// not a linear age: mtimes cluster (a checkout day, a campaign), and the
/// percentile spreads the heat gradient evenly where a linear scale would
/// collapse most nodes onto one end. Computed over the FULL graph — never the
/// narrowed slice — so a node's heat is stable under narrowing (the
/// `module_hues` discipline). An undated file is honestly absent (the client
/// renders the cold end). Ties order by (mtime, key): deterministic.
fn recency_ranks(graph: &LinkageGraph) -> BTreeMap<String, f64> {
    let mut dated: Vec<(i64, &str)> = graph
        .nodes()
        .filter(|n| n.kind == NodeKind::CodeArtifact)
        .filter_map(|n| {
            n.dates
                .as_ref()
                .and_then(|d| d.modified)
                .map(|ms| (ms, n.key.as_str()))
        })
        .collect();
    dated.sort_unstable();
    let count = dated.len();
    let mut ranks: BTreeMap<String, f64> = BTreeMap::new();
    // Ascending mtime order, so an ancestor overwrite always raises its rank —
    // the module ends at the max of its descendants (file keys are paths and
    // module keys are dirs, so the one map never collides across kinds).
    for (i, (_, key)) in dated.iter().enumerate() {
        let rank = if count <= 1 {
            1.0
        } else {
            ((i as f64 / (count - 1) as f64) * 1000.0).round() / 1000.0
        };
        ranks.insert((*key).to_string(), rank);
        let mut dir = *key;
        while let Some(cut) = dir.rfind('/') {
            dir = &dir[..cut];
            ranks.insert(dir.to_string(), rank);
        }
        ranks.insert(".".to_string(), rank);
    }
    ranks
}

/// Attach the served recency rank (code-graph-heat ADR) when the node has one.
fn annotate_recency(view: &mut Value, key: &str, ranks: &BTreeMap<String, f64>) {
    if let Some(rank) = ranks.get(key) {
        view["recency_rank"] = Value::from(*rank);
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
    // Echo the applied date facet on the slice's filter block (the response is
    // honest about what narrowed it); the code date criterion is always the
    // worktree mtime (`modified`) — the only date a code file carries.
    let mut filter = crate::filter::Filter::default();
    if has_date_narrow(narrow) {
        filter.date_range = Some(crate::filter::DateRange {
            from: narrow.date_from.clone(),
            to: narrow.date_to.clone(),
        });
        filter.date_field = crate::filter::DateField::Modified;
    }
    let filter = filter
        .validated()
        .expect("a bare date-range filter is always valid");
    let date_narrow = has_date_narrow(narrow);
    let (in_range_files, in_range_modules) = if date_narrow {
        date_in_range_keys(graph, narrow)
    } else {
        (HashSet::new(), HashSet::new())
    };

    if feature_class_granularity {
        let counts = member_counts(graph);
        let hues = module_hues(graph);
        let ranks = recency_ranks(graph);
        let mut nodes: Vec<Value> = graph
            .nodes()
            .filter(|n| n.kind == NodeKind::CodeModule)
            .filter(|n| narrow_keeps(narrow, &n.key, false))
            .filter(|n| !date_narrow || in_range_modules.contains(&n.key))
            .map(|n| {
                let mut view = node_view(graph, scope, n);
                view["member_count"] =
                    Value::from(counts.get(n.id.0.as_str()).copied().unwrap_or(0));
                annotate_module_identity(&mut view, &n.key, &hues);
                annotate_recency(&mut view, &n.key, &ranks);
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

    // File granularity: file + module nodes, endpoint-pruned raw edges. Under a
    // date narrow, a file passes by its own mtime day and a module passes while
    // it still shelters in-range descendant content.
    let mut kept_nodes: Vec<_> = graph
        .nodes()
        .filter(|n| match n.kind {
            NodeKind::CodeArtifact => {
                narrow_keeps(narrow, &n.key, true)
                    && (!date_narrow || in_range_files.contains(&n.key))
            }
            NodeKind::CodeModule => {
                narrow_keeps(narrow, &n.key, false)
                    && (!date_narrow || in_range_modules.contains(&n.key))
            }
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
    let hues = module_hues(graph);
    let ranks = recency_ranks(graph);
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
            annotate_module_identity(&mut view, &n.key, &hues);
            annotate_recency(&mut view, &n.key, &ranks);
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
/// corpus's vocabulary only): the distinct language tokens present, the module
/// directory keys, and the corpus date span (code-timeline-range ADR) — the
/// min/max worktree-mtime day over the file nodes, in the SAME
/// `date_bounds` / `date_bounds_by_field` shape the vault vocabulary serves, so
/// the timeline strip fits to the active corpus with one reader. Only the
/// `modified` criterion exists for code (`created`/`stamped` are
/// vault-document concepts) and both spans are omitted when no file carries an
/// mtime (honest degradation).
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
    let modified = crate::filter::field_bounds(graph, crate::filter::DateField::Modified);
    let mut vocabulary = json!({ "languages": languages, "dirs": dirs });
    if let Some(bounds) = modified {
        let bounds = serde_json::to_value(&bounds).expect("date bounds serialize");
        // The flat span mirrors the by-field one: `modified` IS the code
        // corpus's only date axis (no created-span back-compat to preserve).
        vocabulary["date_bounds"] = bounds.clone();
        vocabulary["date_bounds_by_field"] = json!({ "modified": bounds });
    }
    vocabulary
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
            ..CodeNarrow::default()
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
            languages: vec!["python".into()],
            ..CodeNarrow::default()
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
    fn serves_module_identity_hue_and_depth_per_node() {
        // CGR-005 viz wire: top-level module identity, a per-generation hue
        // index (top-7 by member count), and directory depth on every code node.
        let g = demo_graph();
        // Rollup: module nodes carry module/module_hue/depth. Both `app` and
        // `lib` have 2 files; the tie breaks alphabetically → app=0, lib=1.
        let rollup = code_graph_query(&g, &scope(), true, &CodeNarrow::default());
        let app = rollup
            .nodes
            .iter()
            .find(|n| n["id"] == "code-mod:app")
            .unwrap();
        assert_eq!(app["module"], Value::from("app"));
        assert_eq!(app["module_hue"], Value::from(0));
        assert_eq!(app["depth"], Value::from(0));
        let lib = rollup
            .nodes
            .iter()
            .find(|n| n["id"] == "code-mod:lib")
            .unwrap();
        assert_eq!(lib["module_hue"], Value::from(1));

        // File granularity: files carry the SAME top-level identity + a depth.
        let files = code_graph_query(&g, &scope(), false, &CodeNarrow::default());
        let a = files
            .nodes
            .iter()
            .find(|n| n["id"] == "code:app/a.ts")
            .unwrap();
        assert_eq!(a["module"], Value::from("app"));
        assert_eq!(a["module_hue"], Value::from(0));
        assert_eq!(a["depth"], Value::from(1));
    }

    #[test]
    fn module_hue_is_null_beyond_the_top_seven_modules() {
        // Eight distinct top-level modules; the smallest (by member count, then
        // name) falls outside the top-7 palette and serves a null hue.
        let mut g = LinkageGraph::new();
        // Seven modules with two files each, one module with a single file.
        let mods = ["a", "b", "c", "d", "e", "f", "g"];
        for m in mods {
            for i in 0..2 {
                g.upsert_node(file_node(&format!("{m}/f{i}.rs")));
            }
            g.upsert_node(module_node(m));
        }
        g.upsert_node(file_node("z/only.rs"));
        g.upsert_node(module_node("z"));

        let slice = code_graph_query(&g, &scope(), false, &CodeNarrow::default());
        let z = slice
            .nodes
            .iter()
            .find(|n| n["id"] == "code:z/only.rs")
            .unwrap();
        assert_eq!(z["module_hue"], Value::Null, "long-tail module is null");
        let a = slice
            .nodes
            .iter()
            .find(|n| n["id"] == "code:a/f0.rs")
            .unwrap();
        assert!(a["module_hue"].is_u64(), "a top-7 module has a hue index");
    }

    #[test]
    fn vocabulary_serves_languages_and_module_dirs() {
        let g = demo_graph();
        let v = code_filter_vocabulary(&g);
        assert_eq!(v["languages"], json!(["python", "rust", "typescript"]));
        assert_eq!(v["dirs"], json!(["app", "lib"]));
        // demo_graph mints undated files → the date spans are honestly absent.
        assert!(v.get("date_bounds").is_none());
        assert!(v.get("date_bounds_by_field").is_none());
    }

    // ---- code-timeline-range ADR: mtime date narrowing ----------------------

    fn dated_file_node(path: &str, mtime_ms: i64) -> Node {
        let mut n = file_node(path);
        n.dates = Some(engine_model::Dates {
            created: None,
            modified: Some(mtime_ms),
            stamped: None,
        });
        n
    }

    /// Two files a day apart plus one undated file, in nested dirs, with an
    /// import between the dated pair.
    fn dated_graph() -> (LinkageGraph, String, String) {
        const DAY_MS: i64 = 86_400_000;
        let t_old = 1_750_000_000_000; // an arbitrary fixed day
        let t_new = t_old + 3 * DAY_MS;
        let mut g = LinkageGraph::new();
        g.upsert_node(dated_file_node("app/deep/old.ts", t_old));
        g.upsert_node(dated_file_node("app/new.ts", t_new));
        g.upsert_node(file_node("lib/undated.py"));
        for m in ["app", "app/deep", "lib"] {
            g.upsert_node(module_node(m));
        }
        for (m, f) in [
            ("app/deep", "app/deep/old.ts"),
            ("app", "app/new.ts"),
            ("lib", "lib/undated.py"),
        ] {
            engine_graph::edges::ingest(&mut g, contains_edge(m, f), EdgeAttrs::default()).unwrap();
        }
        engine_graph::edges::ingest(
            &mut g,
            import_edge("app/new.ts", "app/deep/old.ts"),
            EdgeAttrs::default(),
        )
        .unwrap();
        let old_day = crate::lineage::ms_to_date_key(t_old);
        let new_day = crate::lineage::ms_to_date_key(t_new);
        (g, old_day, new_day)
    }

    #[test]
    fn date_narrow_keeps_in_range_files_and_their_ancestor_modules() {
        let (g, old_day, _new_day) = dated_graph();
        // Range = exactly the old file's day: the new file and the UNDATED file
        // drop; the old file plus its full ancestor module chain survive, and
        // the import edge drops with its lost endpoint.
        let narrow = CodeNarrow {
            date_from: Some(old_day.clone()),
            date_to: Some(old_day),
            ..CodeNarrow::default()
        };
        let slice = code_graph_query(&g, &scope(), false, &narrow);
        let ids: Vec<&str> = slice
            .nodes
            .iter()
            .filter_map(|n| n["id"].as_str())
            .collect();
        assert_eq!(
            ids,
            vec!["code-mod:app", "code-mod:app/deep", "code:app/deep/old.ts"]
        );
        // Only the surviving containment edge remains (module → old file).
        assert_eq!(slice.edges.len(), 1);
        // The applied facet is echoed honestly on the slice's filter block.
        assert!(slice.filter.date_range.is_some());
    }

    #[test]
    fn date_narrow_open_from_keeps_everything_dated_after_it() {
        let (g, old_day, new_day) = dated_graph();
        // from = the day AFTER old: only the new file (and `app`) survive; the
        // undated file is excluded once any bound is set (mirrors the vault).
        assert!(old_day < new_day);
        let narrow = CodeNarrow {
            date_from: Some(new_day),
            ..CodeNarrow::default()
        };
        let slice = code_graph_query(&g, &scope(), false, &narrow);
        let ids: Vec<&str> = slice
            .nodes
            .iter()
            .filter_map(|n| n["id"].as_str())
            .collect();
        assert_eq!(ids, vec!["code-mod:app", "code:app/new.ts"]);
    }

    #[test]
    fn date_narrow_applies_to_the_module_rollup() {
        let (g, old_day, _new_day) = dated_graph();
        let narrow = CodeNarrow {
            date_from: Some(old_day.clone()),
            date_to: Some(old_day),
            ..CodeNarrow::default()
        };
        let slice = code_graph_query(&g, &scope(), true, &narrow);
        let ids: Vec<&str> = slice
            .nodes
            .iter()
            .filter_map(|n| n["id"].as_str())
            .collect();
        assert_eq!(ids, vec!["code-mod:app", "code-mod:app/deep"]);
    }

    #[test]
    fn recency_rank_is_a_percentile_with_module_max_and_honest_absence() {
        // code-graph-heat ADR: files rank by mtime percentile over ALL dated
        // files; a module carries its descendants' max; an undated file (and a
        // module with only undated content) serves NO rank.
        let (g, _old_day, _new_day) = dated_graph();
        let slice = code_graph_query(&g, &scope(), false, &CodeNarrow::default());
        let rank_of = |id: &str| {
            slice
                .nodes
                .iter()
                .find(|n| n["id"] == id)
                .unwrap()
                .get("recency_rank")
                .cloned()
        };
        // Two dated files: old = 0.0, new = 1.0.
        assert_eq!(rank_of("code:app/deep/old.ts"), Some(json!(0.0)));
        assert_eq!(rank_of("code:app/new.ts"), Some(json!(1.0)));
        // The undated file has no position on the heat axis.
        assert_eq!(rank_of("code:lib/undated.py"), None);
        // Modules: `app/deep` shelters only the old file; `app` shelters both
        // (max = the new file's 1.0); `lib` shelters nothing dated.
        assert_eq!(rank_of("code-mod:app/deep"), Some(json!(0.0)));
        assert_eq!(rank_of("code-mod:app"), Some(json!(1.0)));
        assert_eq!(rank_of("code-mod:lib"), None);

        // The rollup serves the SAME module ranks (full-graph stability).
        let rollup = code_graph_query(&g, &scope(), true, &CodeNarrow::default());
        let app = rollup
            .nodes
            .iter()
            .find(|n| n["id"] == "code-mod:app")
            .unwrap();
        assert_eq!(app["recency_rank"], json!(1.0));
    }

    #[test]
    fn recency_rank_is_stable_under_narrowing() {
        // Heat identity mirrors the module_hues discipline: a narrowed slice
        // serves the SAME rank a node had in the full view.
        let (g, old_day, _new_day) = dated_graph();
        let narrow = CodeNarrow {
            date_from: Some(old_day.clone()),
            date_to: Some(old_day),
            ..CodeNarrow::default()
        };
        let slice = code_graph_query(&g, &scope(), false, &narrow);
        let old = slice
            .nodes
            .iter()
            .find(|n| n["id"] == "code:app/deep/old.ts")
            .unwrap();
        // Still the full-corpus percentile (0.0), not 1.0-of-the-narrowed-set.
        assert_eq!(old["recency_rank"], json!(0.0));
    }

    #[test]
    fn vocabulary_serves_the_modified_date_span_when_files_carry_mtimes() {
        let (g, old_day, new_day) = dated_graph();
        let v = code_filter_vocabulary(&g);
        assert_eq!(v["date_bounds"], json!({ "min": old_day, "max": new_day }));
        assert_eq!(
            v["date_bounds_by_field"],
            json!({ "modified": { "min": old_day, "max": new_day } })
        );
    }
}
