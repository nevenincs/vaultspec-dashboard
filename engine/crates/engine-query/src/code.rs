//! Code-corpus query projections (codebase-graphing ADR D3/D5, amended by the
//! code-graph-files-only cutover).
//!
//! Operates on the SEPARATE code `LinkageGraph` instance (never the vault
//! graph — the disconnection invariant) and serves the SAME `GraphSlice`
//! shape through the same `node_view`/`edge_view` projections, so the wire is
//! byte-conformant with the vault corpus. Every served node is a FILE
//! (`code:{path}`) — directories never become nodes:
//!
//! - Feature-class granularity → the PACKAGE ROLLUP: one node per package,
//!   REPRESENTED BY ITS ENTRY FILE (`engine_model::PackageIndex` — the
//!   `__init__.py` / `mod.rs` / `lib.rs` / `index.*` that imports land on),
//!   plus every standalone file, with aggregated import `meta_edges` between
//!   representatives (the code analogue of the constellation).
//! - Document-class granularity → FILE granularity: file nodes with raw
//!   `imports`/`contains` (entry→member) edges, endpoint-pruned to the kept
//!   set.
//!
//! Package NESTING is served as per-node metadata (`module`, `depth`,
//! `package`, `package_entry`) for the scene's visual channels — hue, recede,
//! anchor treatment — never as folder nodes.
//!
//! Narrowing is code-corpus-shaped (directory prefix, language) and lives
//! OUTSIDE the vault `Filter` grammar (ADR D5: the vault filter shape is
//! frozen; corpus-mismatched facets are a typed validation error at the route).

use std::collections::{BTreeMap, HashSet};

use engine_graph::{LinkageGraph, MetaEdge};
use engine_model::{Node, NodeKind, PackageIndex, RelationKind, ScopeRef};
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
    /// (mirrors the vault's missing-date exclusion); at the package rollup a
    /// package passes while at least one member file passes, so the package
    /// above in-range content never vanishes.
    pub date_from: Option<String>,
    pub date_to: Option<String>,
}

/// Whether the narrow carries a date bound at all (the fast path skips the
/// in-range precomputation entirely).
fn has_date_narrow(narrow: &CodeNarrow) -> bool {
    narrow.date_from.is_some() || narrow.date_to.is_some()
}

/// The in-range membership for a date-narrowed query: file KEYS whose mtime
/// day falls inside the bounds. One bounded pass over the held graph.
fn date_in_range_keys(graph: &LinkageGraph, narrow: &CodeNarrow) -> HashSet<String> {
    let from = narrow.date_from.as_deref();
    let to = narrow.date_to.as_deref();
    graph
        .nodes()
        .filter(|n| n.kind == NodeKind::CodeArtifact)
        .filter(|n| {
            let day = n
                .dates
                .as_ref()
                .and_then(|d| d.modified.map(crate::lineage::ms_to_date_key));
            crate::lineage::created_in_range(day.as_deref(), from, to)
        })
        .map(|n| n.key.clone())
        .collect()
}

/// The structural (non-date) narrow for one FILE key.
fn narrow_keeps(narrow: &CodeNarrow, key: &str) -> bool {
    if let Some(prefix) = &narrow.dir_prefix
        && key != prefix
        && !key.starts_with(&format!("{prefix}/"))
    {
        return false;
    }
    if !narrow.languages.is_empty() {
        let Some(lang) = language_token(key) else {
            return false;
        };
        if !narrow.languages.iter().any(|l| l == lang) {
            return false;
        }
    }
    true
}

/// The TOP-LEVEL module a node belongs to: the first path segment (CGR-005 viz
/// wire). This is the color-identity + legend grouping key — every node under
/// `engine/...` shares the module `engine`. A root-level file (no separator)
/// is its own top-level identity.
fn top_level_module(key: &str) -> String {
    match key.split_once('/') {
        Some((first, _)) => first.to_string(),
        None => key.to_string(),
    }
}

/// Directory depth of a file key (the viz lightness ramp): a root-level file
/// is depth 0, and each path separator is one level deeper.
fn path_depth(key: &str) -> u64 {
    key.matches('/').count() as u64
}

/// Per-generation hue assignment (CGR-005 viz wire, `display-state-is-backend-served`):
/// rank the TOP-LEVEL modules by file member count (ties broken by name for
/// determinism) and hand the top seven the categorical hue indexes `0..=6`;
/// every other module gets `null` (the long-tail neutral hue). Computed over the
/// FULL graph — never the narrowed slice — so a filtered view serves the SAME
/// hue for a given module (color identity is stable under narrowing). It rides
/// the code corpus's per-generation memo (`CodeGraphCell`) on the hot path.
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

/// Attach the served PACKAGE-identity fields (code-graph-files-only): the
/// package directory this file belongs to (`package`, null for a standalone
/// file; `""` names the repository root) and whether this file IS its
/// package's entry — the node that DISPLAYS as the package (`package_entry`).
/// The scene's nesting channels (anchor treatment, clustering) read these.
fn annotate_package(view: &mut Value, key: &str, packages: &PackageIndex) {
    view["package"] = match packages.package_root(key) {
        Some(dir) => Value::String(dir.to_string()),
        None => Value::Null,
    };
    view["package_entry"] = Value::from(packages.is_entry(key));
}

/// Per-file GIT recency, folded from the bounded commit walk + git status
/// (code-graph-heat ADR amendment). Owned by the API cell (memoized on
/// `HEAD sha @ dirty-set hash` — its own freshness axis, distinct from the
/// parse generation) and threaded into the query; `None` when the scope is not
/// a git repository (the honest mtime fallback applies).
#[derive(Debug, Clone, Default)]
pub struct CodeRecency {
    /// Repo-relative path → committer time (ms) of the LAST commit touching it
    /// within the bounded walk horizon. A file beyond the horizon is absent
    /// (it ranks in the oldest tie block).
    pub last_commit_ms: BTreeMap<String, i64>,
    /// Dirty + untracked repo-relative paths (git status, never mtime
    /// inference): uncommitted work ranks ABOVE everything committed.
    pub dirty: HashSet<String>,
}

/// Percentile RECENCY rank per FILE key (code-graph-heat ADR, amended):
/// 0 = oldest, 1 = newest. The effective ordering key is GIT-derived — a clean
/// file orders by the committer time of the last commit touching it; a
/// DIRTY/UNTRACKED file orders above every committed file, with the worktree
/// mtime doing the fine ordering only inside that dirty set (the one place a
/// real local edit makes mtime honest). Without git (`recency` None) the mtime
/// orders everything, as before.
///
/// Ranks are TIE-AWARE: files with an equal effective key share one min-rank,
/// so an identical-timestamp block (a checkout stamping hundreds of files in
/// one second, a horizon of equally-unknown old files) paints ONE color
/// instead of spreading an arbitrary gradient across meaningless
/// micro-differences — the defect that fired the ADR's re-open trigger. A
/// rank, not a linear age, so real distinct times still spread evenly.
/// Computed over the FULL graph — never the narrowed slice — so a node's heat
/// is stable under narrowing (the `module_hues` discipline). The package
/// rollup folds a representative's rank as the MAX over its member files
/// ("hot content makes a hot package").
fn recency_ranks(graph: &LinkageGraph, recency: Option<&CodeRecency>) -> BTreeMap<String, f64> {
    // Effective key: (tier, time) — tier 1 = uncommitted work, above all of
    // tier 0. Without git, a file with no mtime is unknowable and omitted
    // (client renders the cold end); with git, an unknown-to-history clean
    // file honestly joins the oldest tie block at (0, 0).
    let mut keyed: Vec<((u8, i64), &str)> = graph
        .nodes()
        .filter(|n| n.kind == NodeKind::CodeArtifact)
        .filter_map(|n| {
            let mtime = n.dates.as_ref().and_then(|d| d.modified);
            let key = match recency {
                Some(r) if r.dirty.contains(&n.key) => (1u8, mtime.unwrap_or(0)),
                Some(r) => (0u8, r.last_commit_ms.get(&n.key).copied().unwrap_or(0)),
                None => (0u8, mtime?),
            };
            Some((key, n.key.as_str()))
        })
        .collect();
    keyed.sort_unstable();
    let count = keyed.len();
    let mut ranks: BTreeMap<String, f64> = BTreeMap::new();
    let mut i = 0;
    while i < count {
        let mut j = i;
        while j < count && keyed[j].0 == keyed[i].0 {
            j += 1;
        }
        // Min-rank for the whole tie group (equal times ⇒ equal color).
        let rank = if count <= 1 {
            1.0
        } else {
            ((i as f64 / (count - 1) as f64) * 1000.0).round() / 1000.0
        };
        for (_, key) in &keyed[i..j] {
            ranks.insert((*key).to_string(), rank);
        }
        i = j;
    }
    ranks
}

/// Attach the served recency rank (code-graph-heat ADR) when the node has one.
fn annotate_recency(view: &mut Value, key: &str, ranks: &BTreeMap<String, f64>) {
    if let Some(rank) = ranks.get(key) {
        view["recency_rank"] = Value::from(*rank);
    }
}

/// The rollup REPRESENTATIVE of a file: its package's entry file, or itself
/// when it belongs to no package (a standalone file).
fn representative<'a>(packages: &'a PackageIndex, key: &'a str) -> &'a str {
    packages.package_entry(key).unwrap_or(key)
}

/// Aggregate file-level `imports` edges into package-level meta-edges,
/// mirroring the constellation aggregation exactly: unordered canonical pair
/// (one ribbon per representative pair), multiplicity-weighted count, per-tier
/// breakdown. Endpoints are the representatives' FILE node ids;
/// `src_feature`/`dst_feature` carry the representative file KEYS (the field
/// names are the shared wire shape; the values are corpus-appropriate).
pub fn code_meta_edges(graph: &LinkageGraph, packages: &PackageIndex) -> Vec<MetaEdge> {
    // Mirrors the constellation's `MetaAgg` accumulator shape.
    type PackageMetaAgg = (usize, BTreeMap<&'static str, usize>);
    let mut agg: BTreeMap<(String, String), PackageMetaAgg> = BTreeMap::new();
    for stored in graph.edges() {
        if stored.edge.relation != RelationKind::Imports {
            continue;
        }
        let src_rep = representative(packages, stored.edge.src.0.trim_start_matches("code:"));
        let dst_rep = representative(packages, stored.edge.dst.0.trim_start_matches("code:"));
        if src_rep == dst_rep {
            continue;
        }
        let (lo, hi) = if src_rep <= dst_rep {
            (src_rep.to_string(), dst_rep.to_string())
        } else {
            (dst_rep.to_string(), src_rep.to_string())
        };
        let entry = agg.entry((lo, hi)).or_default();
        entry.0 += stored.attrs.multiplicity.max(1) as usize;
        *entry.1.entry(stored.edge.tier.as_str()).or_default() += 1;
    }
    agg.into_iter()
        .map(|((lo, hi), (count, breakdown_by_tier))| MetaEdge {
            src: format!("code:{lo}"),
            dst: format!("code:{hi}"),
            src_feature: lo,
            dst_feature: hi,
            count,
            breakdown_by_tier,
        })
        .collect()
}

/// Query the code corpus. `feature_class_granularity == true` serves the
/// package rollup (the constellation analogue); `false` serves file
/// granularity. Both return the standard `GraphSlice` in which every node is a
/// FILE; the route applies the unconditional `bound_slice` ceiling exactly as
/// it does for the vault corpus.
pub fn code_graph_query(
    graph: &LinkageGraph,
    scope: &ScopeRef,
    feature_class_granularity: bool,
    narrow: &CodeNarrow,
    recency: Option<&CodeRecency>,
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
    let in_range = if date_narrow {
        date_in_range_keys(graph, narrow)
    } else {
        HashSet::new()
    };
    let keep_file =
        |key: &str| narrow_keeps(narrow, key) && (!date_narrow || in_range.contains(key));

    let packages = PackageIndex::build(
        graph
            .nodes()
            .filter(|n| n.kind == NodeKind::CodeArtifact)
            .map(|n| n.key.as_str()),
    );
    let hues = module_hues(graph);
    let ranks = recency_ranks(graph, recency);

    if feature_class_granularity {
        // PACKAGE ROLLUP: group every file under its representative — the
        // package's entry file, or itself when standalone. A representative is
        // served while ANY of its members passes the narrow; `member_count`
        // and the folded recency are FULL-corpus stats (stable under
        // narrowing, the `module_hues` discipline).
        let mut members: BTreeMap<&str, Vec<&Node>> = BTreeMap::new();
        for n in graph.nodes().filter(|n| n.kind == NodeKind::CodeArtifact) {
            members
                .entry(representative(&packages, &n.key))
                .or_default()
                .push(n);
        }
        let mut nodes: Vec<Value> = Vec::new();
        for (rep, group) in &members {
            if !group.iter().any(|n| keep_file(&n.key)) {
                continue;
            }
            let Some(rep_node) = group.iter().find(|n| n.key == *rep) else {
                // Defensive: the representative is a member of its own group by
                // construction (an entry file belongs to the package it defines).
                continue;
            };
            let mut view = node_view(graph, scope, rep_node);
            view["member_count"] = Value::from(group.len());
            if let Some(lang) = language_token(rep) {
                view["language"] = Value::String(lang.to_string());
            }
            annotate_module_identity(&mut view, rep, &hues);
            annotate_package(&mut view, rep, &packages);
            // Hot content makes a hot package: the representative paints the
            // MAX recency over its member files.
            let max_rank = group
                .iter()
                .filter_map(|n| ranks.get(&n.key).copied())
                .fold(None::<f64>, |acc, r| Some(acc.map_or(r, |a| a.max(r))));
            if let Some(rank) = max_rank {
                view["recency_rank"] = Value::from(rank);
            }
            nodes.push(view);
        }
        nodes.sort_by(|a, b| a["id"].as_str().cmp(&b["id"].as_str()));
        let kept: HashSet<&str> = nodes
            .iter()
            .filter_map(|n| n.get("id").and_then(Value::as_str))
            .collect();
        let meta = code_meta_edges(graph, &packages)
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

    // File granularity: FILE nodes only, endpoint-pruned raw edges (`imports`
    // plus the file→file `contains` scaffold).
    let mut kept_nodes: Vec<_> = graph
        .nodes()
        .filter(|n| n.kind == NodeKind::CodeArtifact && keep_file(&n.key))
        .collect();
    kept_nodes.sort_by(|a, b| a.id.0.cmp(&b.id.0));
    let kept: HashSet<&str> = kept_nodes.iter().map(|n| n.id.0.as_str()).collect();

    let mut edges: Vec<_> = graph
        .edges()
        .filter(|s| kept.contains(s.edge.src.0.as_str()) && kept.contains(s.edge.dst.0.as_str()))
        .map(|s| &s.edge)
        .collect();
    edges.sort_by(|a, b| a.id.0.cmp(&b.id.0));

    let nodes = kept_nodes
        .iter()
        .map(|n| {
            let mut view = node_view(graph, scope, n);
            if let Some(lang) = language_token(&n.key) {
                view["language"] = Value::String(lang.to_string());
            }
            annotate_module_identity(&mut view, &n.key, &hues);
            annotate_package(&mut view, &n.key, &packages);
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
/// corpus's vocabulary only): the distinct language tokens present, the
/// source-bearing directory keys (for the `dir_prefix` narrow — a vocabulary
/// of paths, NOT nodes), and the corpus date span (code-timeline-range ADR) —
/// the min/max worktree-mtime day over the file nodes, in the SAME
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
    let dirs: HashSet<&str> = graph
        .nodes()
        .filter(|n| n.kind == NodeKind::CodeArtifact)
        .filter_map(|n| n.key.rfind('/').map(|i| &n.key[..i]))
        .collect();
    let mut dirs: Vec<&str> = dirs.into_iter().collect();
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
            size: None,
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

    fn contains_edge(src_file: &str, dst_file: &str) -> Edge {
        let s = NodeId(format!("code:{src_file}"));
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

    /// `app/` is a PACKAGE (entry `app/index.ts`, members a+b); `lib/` holds
    /// two STANDALONE files (no entry file).
    fn demo_graph() -> LinkageGraph {
        let mut g = LinkageGraph::new();
        for f in [
            "app/index.ts",
            "app/a.ts",
            "app/b.ts",
            "lib/c.py",
            "lib/d.rs",
        ] {
            g.upsert_node(file_node(f));
        }
        for (e, f) in [("app/index.ts", "app/a.ts"), ("app/index.ts", "app/b.ts")] {
            engine_graph::edges::ingest(&mut g, contains_edge(e, f), EdgeAttrs::default()).unwrap();
        }
        // a→b intra-package; a→c and b→d cross the package boundary.
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
    fn rollup_serves_package_entry_representatives_and_aggregated_meta_edges() {
        let g = demo_graph();
        let slice = code_graph_query(&g, &scope(), true, &CodeNarrow::default(), None);
        let ids: Vec<&str> = slice
            .nodes
            .iter()
            .filter_map(|n| n["id"].as_str())
            .collect();
        // Every rollup node is a FILE: the package's entry file for `app`,
        // the standalone files themselves for `lib`.
        assert_eq!(
            ids,
            vec!["code:app/index.ts", "code:lib/c.py", "code:lib/d.rs"]
        );
        assert!(slice.edges.is_empty(), "rollup carries meta_edges only");
        // Cross-representative ribbons: app→c (x3) and app→d (x1); a→b is
        // intra-package and folds away.
        assert_eq!(slice.meta_edges.len(), 2);
        let c = slice
            .meta_edges
            .iter()
            .find(|m| m.dst == "code:lib/c.py")
            .unwrap();
        assert_eq!(c.src, "code:app/index.ts");
        assert_eq!(c.count, 3, "multiplicity-weighted");
        let entry = slice
            .nodes
            .iter()
            .find(|n| n["id"] == "code:app/index.ts")
            .unwrap();
        assert_eq!(entry["member_count"], Value::from(3));
        assert_eq!(entry["package_entry"], Value::from(true));
        assert_eq!(entry["package"], Value::from("app"));
        let standalone = slice
            .nodes
            .iter()
            .find(|n| n["id"] == "code:lib/c.py")
            .unwrap();
        assert_eq!(standalone["member_count"], Value::from(1));
        assert_eq!(standalone["package_entry"], Value::from(false));
        assert_eq!(standalone["package"], Value::Null);
    }

    #[test]
    fn file_granularity_prunes_to_kept_endpoints_and_annotates_language() {
        let g = demo_graph();
        // Narrow to app/: lib files drop, so cross-package imports drop too.
        let narrow = CodeNarrow {
            dir_prefix: Some("app".into()),
            ..CodeNarrow::default()
        };
        let slice = code_graph_query(&g, &scope(), false, &narrow, None);
        let ids: Vec<&str> = slice
            .nodes
            .iter()
            .filter_map(|n| n["id"].as_str())
            .collect();
        assert_eq!(
            ids,
            vec!["code:app/a.ts", "code:app/b.ts", "code:app/index.ts"]
        );
        let file = slice
            .nodes
            .iter()
            .find(|n| n["id"] == "code:app/a.ts")
            .unwrap();
        assert_eq!(file["language"], Value::from("typescript"));
        assert_eq!(file["package"], Value::from("app"));
        assert_eq!(file["package_entry"], Value::from(false));
        // Kept edges: the two entry→member contains + the intra-package a→b
        // import — all file→file.
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
        let slice = code_graph_query(&g, &scope(), false, &narrow, None);
        let file_ids: Vec<&str> = slice
            .nodes
            .iter()
            .filter_map(|n| n["id"].as_str())
            .collect();
        assert_eq!(file_ids, vec!["code:lib/c.py"]);
    }

    #[test]
    fn serves_module_identity_hue_and_depth_per_node() {
        // CGR-005 viz wire: top-level module identity, a per-generation hue
        // index (top-7 by member count), and directory depth on every code node.
        let g = demo_graph();
        // Rollup: representatives carry module/module_hue/depth. `app` holds 3
        // files, `lib` 2 → app=0, lib=1.
        let rollup = code_graph_query(&g, &scope(), true, &CodeNarrow::default(), None);
        let app = rollup
            .nodes
            .iter()
            .find(|n| n["id"] == "code:app/index.ts")
            .unwrap();
        assert_eq!(app["module"], Value::from("app"));
        assert_eq!(app["module_hue"], Value::from(0));
        assert_eq!(app["depth"], Value::from(1));
        let lib = rollup
            .nodes
            .iter()
            .find(|n| n["id"] == "code:lib/c.py")
            .unwrap();
        assert_eq!(lib["module_hue"], Value::from(1));

        // File granularity: files carry the SAME top-level identity + a depth.
        let files = code_graph_query(&g, &scope(), false, &CodeNarrow::default(), None);
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
        }
        g.upsert_node(file_node("z/only.rs"));

        let slice = code_graph_query(&g, &scope(), false, &CodeNarrow::default(), None);
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
    fn vocabulary_serves_languages_and_source_dirs() {
        let g = demo_graph();
        let v = code_filter_vocabulary(&g);
        assert_eq!(v["languages"], json!(["python", "rust", "typescript"]));
        // `dirs` is the dir_prefix vocabulary — source-bearing directory PATHS,
        // never nodes.
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

    /// A package whose entry is OLD and whose member is NEW, plus an undated
    /// standalone file, with an import between the dated pair.
    fn dated_graph() -> (LinkageGraph, String, String) {
        const DAY_MS: i64 = 86_400_000;
        let t_old = 1_750_000_000_000; // an arbitrary fixed day
        let t_new = t_old + 3 * DAY_MS;
        let mut g = LinkageGraph::new();
        g.upsert_node(dated_file_node("app/index.ts", t_old));
        g.upsert_node(dated_file_node("app/new.ts", t_new));
        g.upsert_node(file_node("lib/undated.py"));
        engine_graph::edges::ingest(
            &mut g,
            contains_edge("app/index.ts", "app/new.ts"),
            EdgeAttrs::default(),
        )
        .unwrap();
        engine_graph::edges::ingest(
            &mut g,
            import_edge("app/new.ts", "app/index.ts"),
            EdgeAttrs::default(),
        )
        .unwrap();
        let old_day = crate::lineage::ms_to_date_key(t_old);
        let new_day = crate::lineage::ms_to_date_key(t_new);
        (g, old_day, new_day)
    }

    #[test]
    fn date_narrow_keeps_in_range_files_only() {
        let (g, old_day, _new_day) = dated_graph();
        // Range = exactly the entry's day: the new member and the UNDATED file
        // drop; both edges lose an endpoint and drop with them.
        let narrow = CodeNarrow {
            date_from: Some(old_day.clone()),
            date_to: Some(old_day),
            ..CodeNarrow::default()
        };
        let slice = code_graph_query(&g, &scope(), false, &narrow, None);
        let ids: Vec<&str> = slice
            .nodes
            .iter()
            .filter_map(|n| n["id"].as_str())
            .collect();
        assert_eq!(ids, vec!["code:app/index.ts"]);
        assert!(slice.edges.is_empty());
        // The applied facet is echoed honestly on the slice's filter block.
        assert!(slice.filter.date_range.is_some());
    }

    #[test]
    fn date_narrow_open_from_keeps_everything_dated_after_it() {
        let (g, old_day, new_day) = dated_graph();
        // from = the day AFTER the entry: only the new member survives; the
        // undated file is excluded once any bound is set (mirrors the vault).
        assert!(old_day < new_day);
        let narrow = CodeNarrow {
            date_from: Some(new_day),
            ..CodeNarrow::default()
        };
        let slice = code_graph_query(&g, &scope(), false, &narrow, None);
        let ids: Vec<&str> = slice
            .nodes
            .iter()
            .filter_map(|n| n["id"].as_str())
            .collect();
        assert_eq!(ids, vec!["code:app/new.ts"]);
    }

    #[test]
    fn date_narrow_keeps_a_package_while_any_member_is_in_range() {
        let (g, _old_day, new_day) = dated_graph();
        // Rollup narrowed to the NEW member's day: the package survives
        // (any-member rule) even though its ENTRY file is out of range; the
        // undated standalone drops.
        let narrow = CodeNarrow {
            date_from: Some(new_day.clone()),
            date_to: Some(new_day),
            ..CodeNarrow::default()
        };
        let slice = code_graph_query(&g, &scope(), true, &narrow, None);
        let ids: Vec<&str> = slice
            .nodes
            .iter()
            .filter_map(|n| n["id"].as_str())
            .collect();
        assert_eq!(ids, vec!["code:app/index.ts"]);
    }

    #[test]
    fn recency_rank_is_a_percentile_with_package_max_and_honest_absence() {
        // code-graph-heat ADR: files rank by mtime percentile over ALL dated
        // files; the package rollup folds the MAX over member files; an
        // undated file serves NO rank.
        let (g, _old_day, _new_day) = dated_graph();
        let slice = code_graph_query(&g, &scope(), false, &CodeNarrow::default(), None);
        let rank_of = |slice: &GraphSlice, id: &str| {
            slice
                .nodes
                .iter()
                .find(|n| n["id"] == id)
                .unwrap()
                .get("recency_rank")
                .cloned()
        };
        // Two dated files: entry (old) = 0.0, member (new) = 1.0.
        assert_eq!(rank_of(&slice, "code:app/index.ts"), Some(json!(0.0)));
        assert_eq!(rank_of(&slice, "code:app/new.ts"), Some(json!(1.0)));
        // The undated file has no position on the heat axis.
        assert_eq!(rank_of(&slice, "code:lib/undated.py"), None);

        // The rollup representative paints the package MAX ("hot content makes
        // a hot package"): the OLD entry carries the NEW member's 1.0.
        let rollup = code_graph_query(&g, &scope(), true, &CodeNarrow::default(), None);
        assert_eq!(rank_of(&rollup, "code:app/index.ts"), Some(json!(1.0)));
        assert_eq!(rank_of(&rollup, "code:lib/undated.py"), None);
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
        let slice = code_graph_query(&g, &scope(), false, &narrow, None);
        let old = slice
            .nodes
            .iter()
            .find(|n| n["id"] == "code:app/index.ts")
            .unwrap();
        // Still the full-corpus percentile (0.0), not 1.0-of-the-narrowed-set.
        assert_eq!(old["recency_rank"], json!(0.0));
    }

    // ---- code-graph-heat ADR amendment: git-derived composite ranking -------

    fn rank_in<'a>(slice: &'a GraphSlice, id: &str) -> Option<&'a Value> {
        slice
            .nodes
            .iter()
            .find(|n| n["id"] == id)
            .and_then(|n| n.get("recency_rank"))
    }

    #[test]
    fn git_axis_supersedes_mtime_for_clean_files() {
        // dated_graph's mtimes say new.ts is newest — but the GIT history says
        // the entry was committed last. The git axis must win for clean files,
        // and a file git knows needs no mtime at all (undated.py ranks mid).
        let (g, _old, _new) = dated_graph();
        let recency = CodeRecency {
            last_commit_ms: BTreeMap::from([
                ("app/index.ts".to_string(), 2_000_000_i64),
                ("app/new.ts".to_string(), 1_000_000),
                ("lib/undated.py".to_string(), 1_500_000),
            ]),
            dirty: HashSet::new(),
        };
        let slice = code_graph_query(&g, &scope(), false, &CodeNarrow::default(), Some(&recency));
        assert_eq!(rank_in(&slice, "code:app/index.ts"), Some(&json!(1.0)));
        assert_eq!(rank_in(&slice, "code:app/new.ts"), Some(&json!(0.0)));
        assert_eq!(rank_in(&slice, "code:lib/undated.py"), Some(&json!(0.5)));
    }

    #[test]
    fn dirty_files_rank_above_every_committed_file() {
        // The dirty/untracked set (git status, never mtime inference) is the
        // hottest tier: a dirty file outranks even the most recently COMMITTED
        // file, and mtime orders only within the dirty set.
        let (g, _old, _new) = dated_graph();
        let recency = CodeRecency {
            last_commit_ms: BTreeMap::from([
                ("app/new.ts".to_string(), 9_000_000_000_000_i64), // newest commit
                ("app/index.ts".to_string(), 1_000_000),
            ]),
            // the entry (mtime-oldest, commit-oldest) is DIRTY → hottest anyway.
            dirty: HashSet::from(["app/index.ts".to_string()]),
        };
        let slice = code_graph_query(&g, &scope(), false, &CodeNarrow::default(), Some(&recency));
        assert_eq!(rank_in(&slice, "code:app/index.ts"), Some(&json!(1.0)));
        assert!(
            rank_in(&slice, "code:app/new.ts")
                .unwrap()
                .as_f64()
                .unwrap()
                < 1.0,
            "committed stays below dirty"
        );
    }

    #[test]
    fn equal_effective_times_share_one_tie_rank() {
        // The re-open-trigger defect: an identical-timestamp block must paint
        // ONE color (shared min-rank), never an arbitrary spread. Two files
        // with the same last-commit time tie at 0.0; the newer file ranks 1.0.
        let (g, _old, _new) = dated_graph();
        let recency = CodeRecency {
            last_commit_ms: BTreeMap::from([
                ("app/index.ts".to_string(), 1_000_000_i64),
                ("lib/undated.py".to_string(), 1_000_000),
                ("app/new.ts".to_string(), 2_000_000),
            ]),
            dirty: HashSet::new(),
        };
        let slice = code_graph_query(&g, &scope(), false, &CodeNarrow::default(), Some(&recency));
        assert_eq!(rank_in(&slice, "code:app/index.ts"), Some(&json!(0.0)));
        assert_eq!(rank_in(&slice, "code:lib/undated.py"), Some(&json!(0.0)));
        assert_eq!(rank_in(&slice, "code:app/new.ts"), Some(&json!(1.0)));
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
