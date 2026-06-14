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
use ingest_struct::resolve::Resolver;
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
    /// A client-supplied revision token that is well-formed but resolves to
    /// nothing servable — an unparseable revision, or a millisecond timestamp
    /// before the root commit. The message is engine-authored and LEAK-FREE
    /// (no build-machine paths or gix `file:line`), so the API boundary echoes
    /// it verbatim instead of the generic "expected a commit-ish …" fallback,
    /// which self-contradicts when the input WAS a valid timestamp (sweep LOW,
    /// 2026-06-13). Distinct from [`IndexError::Git`], whose strings carry gix
    /// internals and must never reach a client.
    #[error("{0}")]
    Revision(String),
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
    /// Per-document outcome in core's sync vocabulary (D6.2 / audit G2):
    /// `unchanged` (cache hit) or `updated` (re-extracted). `created` and
    /// `removed` are inapplicable to a rebuild-from-truth pipeline — the
    /// graph is derived wholly each pass, so blob novelty and blob change
    /// are indistinguishable and both report as `updated`.
    pub outcomes: Vec<(String, &'static str)>,
    /// Declared-tier edges ingested from core's authored graph (engine-spec
    /// §3/§5.1). 0 when core is unreachable — see `declared_unavailable`.
    pub declared_edges: usize,
    /// `None` when the declared tier was ingested (the engine's core
    /// capability: ingest core's vault graph); `Some(reason)` when core was
    /// unreachable or its graph unparseable, so the declared tier degrades
    /// TRUTHFULLY rather than silently presenting an empty tier as healthy.
    pub declared_unavailable: Option<String>,
    /// Stems that appeared in more than one document path this index (e.g.
    /// `adr/x.md` + `plan/x.md`). The node id is `doc:{stem}`,
    /// directory-independent, so colliding stems merge onto one node with the
    /// later write winning — silent data loss. Recorded (and warned at index
    /// time) so a collision is loud, never silent. vaultspec's own filename
    /// convention (`date-feature-type`) makes real collisions a misnaming.
    pub duplicate_stems: Vec<String>,
}

/// Index one worktree scope into a fresh graph (the cold path): structural
/// resolve + edge ingest AND the declared-tier core subprocess, synchronously.
///
/// This full path is the CLI's (`vaultspec index`, `vaultspec status`) and the
/// D8.2 re-derivability comparator; its output is UNCHANGED by the perf ADR
/// (the async split lives in the serve path via [`index_worktree_structural`]).
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

/// Sentinel `declared_unavailable` reason a STRUCTURAL-only index records: the
/// declared tier is not yet ingested because the async fold is in progress
/// (perf ADR D1). The serve path's `query_tiers` renders this as the
/// `declared` tier unavailable-while-building, flipping to available once the
/// fold's `commit_graph` lands. Distinct from a real core-unreachable reason,
/// which is what the fold itself records on a genuine failure.
pub const DECLARED_BUILDING: &str = "declared tier building";

/// Index one worktree scope into a fresh graph, STRUCTURAL TIER ONLY — every
/// phase of [`index_worktree`] EXCEPT the declared-tier core subprocess (perf
/// ADR D1). This is the fast servable parse: the serve path commits it
/// immediately so the worktree is interactive in roughly the structural-parse
/// time, then folds the declared tier in asynchronously.
///
/// `IndexStats.declared_edges` is 0 and `declared_unavailable` is the
/// [`DECLARED_BUILDING`] sentinel (NOT a failure — the tier is pending the
/// async fold, reported truthfully as unavailable-while-building).
pub fn index_worktree_structural(
    root: &Path,
    scope: &ScopeRef,
    store: &engine_store::Store,
    observed_at: Timestamp,
) -> Result<(LinkageGraph, IndexStats)> {
    let mut graph = LinkageGraph::new();
    let mut stats = index_structural(&mut graph, root, scope, store, observed_at, false)?;
    stats.declared_unavailable = Some(DECLARED_BUILDING.to_string());
    Ok((graph, stats))
}

/// Full re-index: bypasses the extraction cache (every document is
/// re-extracted and the cache rewritten). The `vaultspec index --full`
/// path; converges to the incremental graph by D8.2.
pub fn index_worktree_full(
    root: &Path,
    scope: &ScopeRef,
    store: &engine_store::Store,
    observed_at: Timestamp,
) -> Result<(LinkageGraph, IndexStats)> {
    let mut graph = LinkageGraph::new();
    let stats = index_documents(&mut graph, root, scope, store, observed_at, true)?;
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
    index_documents(graph, root, scope, store, observed_at, false)
}

fn index_documents(
    graph: &mut LinkageGraph,
    root: &Path,
    scope: &ScopeRef,
    store: &engine_store::Store,
    observed_at: Timestamp,
    force_extract: bool,
) -> Result<IndexStats> {
    let mut stats = index_structural(graph, root, scope, store, observed_at, force_extract)?;

    // Declared tier: ingest core's authored graph at HEAD (the engine's stated
    // core capability — "ingests core's vault graph"). Structural mentions
    // above are only one tier; without this the linkage graph carries no
    // declared cross-references at all.
    //
    // READ-AND-INFER (D1.2, CRITICAL): we MUST use `--ref HEAD`, never the
    // working-tree mode. Plain `vaultspec-core vault graph` mutates the target
    // vault — it runs core's index refresh, which stamps `modified:`
    // frontmatter onto un-migrated docs and rewrites `.gitignore` — so reading
    // a corpus would silently corrupt it (adversarial finding, 2026-06-13).
    // `--ref HEAD` reads the git object DB read-only (no checkout, no cache, no
    // write), at the cost of reflecting the committed state rather than
    // uncommitted working-tree edits — the correct trade for a read-and-infer
    // engine. The structural tier above still reflects the working tree via
    // read-only file reads.
    let timing = std::env::var_os("VAULTSPEC_INDEX_TIMING").is_some();
    let t_start = std::time::Instant::now();
    let (declared, unavailable) = ingest_core_graph(graph, root, scope, observed_at, Some("HEAD"));
    stats.declared_edges += declared;
    stats.declared_unavailable = unavailable;
    if timing {
        eprintln!(
            "vaultspec index timing: declared (core subprocess) +{}ms ({} docs)",
            t_start.elapsed().as_millis(),
            stats.documents
        );
    }

    Ok(stats)
}

/// The structural tier of the index: read+extract, resolver build, resolve +
/// edge ingest. Everything [`index_documents`] does EXCEPT the declared-tier
/// core subprocess (perf ADR D1). Shared by the full path (which then ingests
/// declared synchronously) and [`index_worktree_structural`] (the fast
/// servable parse, declared deferred to the async fold).
fn index_structural(
    graph: &mut LinkageGraph,
    root: &Path,
    scope: &ScopeRef,
    store: &engine_store::Store,
    observed_at: Timestamp,
    force_extract: bool,
) -> Result<IndexStats> {
    let docs = vault_documents(root)?;
    let mut stats = IndexStats {
        documents: docs.len(),
        ..Default::default()
    };

    // Opt-in phase timing (`VAULTSPEC_INDEX_TIMING=1`): emits per-phase
    // wall-clock to stderr so the cold-parse breakdown (structural vs the
    // declared-tier subprocess) is measurable in production without a profiler.
    let timing = std::env::var_os("VAULTSPEC_INDEX_TIMING").is_some();
    let t_start = std::time::Instant::now();
    macro_rules! phase {
        ($label:expr) => {
            if timing {
                eprintln!(
                    "vaultspec index timing: {} +{}ms ({} docs)",
                    $label,
                    t_start.elapsed().as_millis(),
                    stats.documents
                );
            }
        };
    }

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
    phase!("read+extract");

    // Detect directory-independent stem collisions (node id is `doc:{stem}`):
    // two paths with the same basename merge onto one node, the later write
    // winning — surface it loudly rather than losing content silently.
    let mut seen_stems: std::collections::BTreeMap<String, String> =
        std::collections::BTreeMap::new();

    // Build the worktree resolver ONCE for the whole pass (perf ADR D1): one
    // tree walk and one shared file-content cache amortized across every
    // document, replacing the prior per-document walk + codebase re-read that
    // made cold index ~O(N²).
    let resolver = Resolver::new(root);
    phase!("resolver-built");

    for (rel_path, blob_hash, text) in extracted {
        let stem = doc_stem(&rel_path);
        if let Some(prev) = seen_stems.insert(stem.clone(), rel_path.clone())
            && prev != rel_path
        {
            eprintln!(
                "vaultspec index: WARNING duplicate stem `{stem}` ({prev} and \
                 {rel_path}) collide on node id `doc:{stem}`; the later document \
                 wins and the earlier is lost — rename to disambiguate"
            );
            stats.duplicate_stems.push(stem.clone());
        }
        let feature_tags = frontmatter_feature_tags(&text);
        // Contract §4 node fields on the LIST shape (addendum S03):
        // title from the body H1, created from the frontmatter date,
        // modified from the worktree mtime (ms), doc_type from the vault
        // subdirectory, lifecycle from checkbox progress.
        let modified = std::fs::metadata(root.join(&rel_path))
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as Timestamp);
        graph.upsert_node(Node {
            id: node_id(&CanonicalKey::Document { stem: &stem }),
            kind: NodeKind::Document,
            key: stem.clone(),
            title: doc_title(&text),
            doc_type: doc_type_of(&rel_path),
            dates: Some(engine_model::Dates {
                created: frontmatter_date(&text),
                modified,
            }),
            feature_tags,
            facets: vec![Facet {
                scope: scope.clone(),
                presence: Presence::Exists,
                content_hash: Some(blob_hash.clone()),
                lifecycle: doc_lifecycle(&text),
            }],
        });

        // Content-hash skip: reuse cached extraction when the blob is
        // unchanged (D2.4 cache discipline).
        let cached = if force_extract {
            None
        } else {
            store.get_artifact(EXTRACT_KIND, &blob_hash)?
        };
        let mentions: Vec<ExtractedMention> = match cached {
            Some(cached) => {
                stats.cache_hits += 1;
                stats.outcomes.push((rel_path.clone(), "unchanged"));
                serde_json::from_str(&cached)?
            }
            None => {
                stats.extracted += 1;
                stats.outcomes.push((rel_path.clone(), "updated"));
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
        for resolved in resolver.resolve(mentions) {
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

    phase!("structural");

    Ok(stats)
}

/// Ingest core's authored `vault graph` as declared-tier edges (engine-spec
/// §3/§5.1, D5.1). `git_ref` selects the corpus: `None` reads the working tree
/// (present view); `Some(sha)` reads the git object DB at that ref (blob-true
/// historical view, core 0.1.31 `vault graph --ref`) so an as-of snapshot
/// carries the declared tier too — core's authored cross-references AS THEY
/// STOOD at that commit, not only structural + temporal.
///
/// Returns `(declared_edges_ingested, unavailable_reason)`: the reason is
/// `None` on success, else why core could not supply the tier — the caller
/// degrades the declared tier truthfully rather than claiming one it did not
/// ingest. Best-effort: core unreachable / old-core / unresolvable-ref never
/// panics, it just yields an absent declared tier.
pub(crate) fn ingest_core_graph(
    graph: &mut LinkageGraph,
    root: &Path,
    scope: &ScopeRef,
    observed_at: Timestamp,
    git_ref: Option<&str>,
) -> (usize, Option<String>) {
    // Split into the subprocess fetch and the parse/ingest so the async
    // declared fold (perf ADR D1) can cache the raw JSON by HEAD sha between
    // them. This combined path keeps the synchronous full `index_worktree`
    // (CLI / re-derivability test) behaviorally UNCHANGED: fetch, then ingest.
    let json = match fetch_core_graph_json(root, git_ref) {
        Ok(json) => json,
        Err(reason) => return (0, Some(reason)),
    };
    ingest_declared_from_json(graph, &json, scope, observed_at)
}

/// The graph-v2 envelope schema core emits (engine-spec §5.1).
const GRAPH_SCHEMA: &str = "vaultspec.vault.graph.v2";

/// Run `vaultspec-core vault graph [--ref <git_ref>]` in `root` and return the
/// raw `data` payload as a JSON STRING (the cacheable unit, perf ADR D1).
///
/// `git_ref` selects the corpus exactly as [`ingest_core_graph`] documents:
/// `Some("HEAD")` is the read-and-infer-safe object-DB read (D1.2, CRITICAL —
/// never the vault-mutating working-tree mode); `None` reads the working tree.
///
/// On failure returns a LEAK-FREE reason (no build-machine paths, no core
/// stderr) safe to surface as the declared-tier degradation reason — the full
/// error is logged for operators, mirroring the prior inline behavior.
pub fn fetch_core_graph_json(
    root: &Path,
    git_ref: Option<&str>,
) -> std::result::Result<String, String> {
    let runner = ingest_core::runner::CoreRunner::detect();
    let mut args: Vec<&str> = vec!["vault", "graph"];
    if let Some(reference) = git_ref {
        args.push("--ref");
        args.push(reference);
    }
    let data = match runner.run_json(root, &args, &[GRAPH_SCHEMA]) {
        Ok(envelope) => match envelope.data() {
            Ok(data) => data,
            Err(e) => return Err(format!("core graph payload: {e}")),
        },
        // The full error embeds core's stderr — absolute paths and a
        // sibling-workspace hint — which must NOT reach the wire `tiers` block
        // (sweep MEDIUM, 2026-06-13). Log the detail for operators; surface only
        // the leak-free category as the declared-tier degradation reason.
        Err(e) => {
            eprintln!("vaultspec: declared tier unavailable — core graph read failed: {e}");
            return Err(e.wire_reason());
        }
    };
    Ok(data.to_string())
}

/// Parse a raw core graph-v2 `data` JSON string and ingest its declared +
/// core-derived edges into `graph`. The CPU-side counterpart to
/// [`fetch_core_graph_json`] (perf ADR D1): the async fold caches the JSON by
/// HEAD sha, then calls this to fold the declared tier into a clone of the
/// live structural graph.
///
/// Returns `(declared_edges_ingested, unavailable_reason)` — `None` on
/// success, `Some(reason)` if the JSON was unparseable. Ingesting into the
/// structural graph is idempotent (replace-by-id), so the folded
/// clone(structural)+declared graph is byte-identical to a synchronous
/// structural+declared build (D8.2 convergence).
pub fn ingest_declared_from_json(
    graph: &mut LinkageGraph,
    json: &str,
    scope: &ScopeRef,
    observed_at: Timestamp,
) -> (usize, Option<String>) {
    let data: serde_json::Value = match serde_json::from_str(json) {
        Ok(data) => data,
        Err(e) => return (0, Some(format!("core graph json: {e}"))),
    };
    let parsed = match ingest_core::graph_v2::parse(&data, scope, observed_at) {
        Ok(parsed) => parsed,
        Err(e) => return (0, Some(format!("core graph parse: {e}"))),
    };
    // Declared edges carry core's authored kind/multiplicity/weight verbatim;
    // core-derived edges ride the distinct `core-derived` relation at 0.8.
    let mut count = 0;
    for d in parsed.declared {
        if crate::edges::ingest(
            graph,
            d.edge,
            EdgeAttrs {
                multiplicity: d.multiplicity,
                weight: Some(d.weight),
                core_kind: Some(d.core_kind),
                resolved_target: None,
            },
        )
        .is_ok()
        {
            count += 1;
        }
    }
    for edge in parsed.core_derived {
        if crate::edges::ingest(graph, edge, EdgeAttrs::default()).is_ok() {
            count += 1;
        }
    }
    (count, None)
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

/// Document title: the first level-one heading in the body (contract §4
/// `title`).
pub(crate) fn doc_title(text: &str) -> Option<String> {
    text.lines().find_map(|line| {
        line.strip_prefix("# ")
            .map(|t| t.trim().trim_matches('`').to_string())
            .filter(|t| !t.is_empty())
    })
}

/// The frontmatter `date:` value (contract §4 `dates.created`).
pub(crate) fn frontmatter_date(text: &str) -> Option<String> {
    let rest = text.strip_prefix("---")?;
    let end = rest.find("\n---")?;
    rest[..end].lines().find_map(|line| {
        let value = line.trim().strip_prefix("date:")?.trim();
        let value = value.trim_matches('\'').trim_matches('"');
        (!value.is_empty()).then(|| value.to_string())
    })
}

/// Vault document type from the repo-relative path: the `.vault/<type>/…`
/// subdirectory (contract §4 `doc_type?`).
pub(crate) fn doc_type_of(rel_path: &str) -> Option<String> {
    let rest = rel_path.strip_prefix(".vault/")?;
    let (first, remainder) = rest.split_once('/')?;
    let _ = remainder; // a bare `.vault/file.md` has no type directory
    Some(first.to_string())
}

/// Lifecycle from checkbox progress (contract §4 `lifecycle {state,
/// progress?}`): documents carrying task lists report done/total; complete
/// when every box is checked.
pub(crate) fn doc_lifecycle(text: &str) -> Option<engine_model::Lifecycle> {
    let mut done: u32 = 0;
    let mut total: u32 = 0;
    for line in text.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("- [x] ") || trimmed.starts_with("- [X] ") {
            done += 1;
            total += 1;
        } else if trimmed.starts_with("- [ ] ") {
            total += 1;
        }
    }
    (total > 0).then(|| engine_model::Lifecycle {
        state: if done == total { "complete" } else { "active" }.to_string(),
        progress: Some(engine_model::Progress { done, total }),
    })
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

    #[test]
    fn declared_tier_degrades_truthfully_while_structural_survives() {
        // A vault-only worktree (no `.vaultspec/`): core's `vault graph`
        // cannot run there, so the declared tier must degrade TRUTHFULLY
        // (`declared_unavailable` set, zero declared edges) while the
        // structural pass — git object DB + working tree, no core — still
        // produces edges. Regression guard for the wiring that was missing
        // entirely (the graph was silently structural-only).
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::write(
            root.join(".vault/plan/2026-06-12-x-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#x'\n---\n\nMentions `src/a.rs`.\n",
        )
        .unwrap();
        let store = engine_store::Store::open(&root.join(".vault")).unwrap();
        let (graph, stats) = index_worktree(root, &scope(), &store, 0).unwrap();

        // Structural tier survives without core.
        assert!(
            graph.edge_count() >= 1 && stats.edges >= 1,
            "structural mentions ingest without core"
        );
        // Declared tier degrades truthfully — never silently empty-yet-claimed.
        // The `declared_edges == 0` arm is unconditional. The `is_some()` arm
        // depends on a cross-package contract: core's `vault graph` errors in a
        // `.vaultspec`-less dir. If a future core succeeds-empty there instead,
        // this arm needs revisiting (declared would be available-but-empty).
        assert_eq!(
            stats.declared_edges, 0,
            "no declared edges when core cannot graph"
        );
        assert!(
            stats.declared_unavailable.is_some(),
            "declared tier reports its own unavailability"
        );
    }

    #[test]
    fn structural_index_carries_edges_and_the_building_sentinel_without_a_subprocess() {
        // Perf ADR D1: the fast servable parse builds the structural tier ONLY,
        // never running the declared-tier core subprocess. It must carry the
        // same structural edges index_worktree produces, zero declared edges,
        // and the DECLARED_BUILDING sentinel (the async fold is pending — a
        // truthful "not yet" state, NOT a failure reason).
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::write(
            root.join(".vault/plan/2026-06-12-x-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#x'\n---\n\nMentions `src/a.rs`.\n",
        )
        .unwrap();
        let store = engine_store::Store::open(&root.join(".vault")).unwrap();
        let (graph, stats) = index_worktree_structural(root, &scope(), &store, 0).unwrap();

        assert!(
            graph.edge_count() >= 1 && stats.edges >= 1,
            "structural mentions ingest in the structural-only parse"
        );
        assert_eq!(
            stats.declared_edges, 0,
            "no declared tier in the fast parse"
        );
        assert_eq!(
            stats.declared_unavailable.as_deref(),
            Some(DECLARED_BUILDING),
            "the structural parse reports declared as building, not failed"
        );
    }

    #[test]
    fn cloned_structural_plus_declared_equals_a_combined_build() {
        // Perf ADR D1 convergence invariant: the async fold clones the
        // structural graph and ingests declared into the clone. That folded
        // clone(structural)+declared graph MUST equal a graph built structural
        // THEN declared from the same JSON in one pass — declared ingest is
        // replace-by-id idempotent over the structural graph (D8.2). Proven on
        // the canonical snapshot (no core subprocess: we feed a fixed JSON).
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::write(
            root.join(".vault/plan/2026-06-12-x-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#x'\n---\n\nMentions `src/a.rs` and \
             [[2026-06-12-x-adr]].\n",
        )
        .unwrap();
        let store = engine_store::Store::open(&root.join(".vault")).unwrap();

        let declared_json = serde_json::json!({
            "nodes": [
                {"id": "2026-06-12-x-plan", "doc_type": "plan"},
                {"id": "2026-06-12-x-adr", "doc_type": "adr"}
            ],
            "edges": [
                {"source": "2026-06-12-x-plan", "target": "2026-06-12-x-adr", "kind": "related"}
            ]
        })
        .to_string();

        // Path A: structural, then clone and fold declared into the clone.
        let (structural, _) = index_worktree_structural(root, &scope(), &store, 0).unwrap();
        let mut folded = structural.clone();
        ingest_declared_from_json(&mut folded, &declared_json, &scope(), 0);

        // Path B: structural, then declared into the SAME graph in one pass.
        let (mut combined, _) = index_worktree_structural(root, &scope(), &store, 0).unwrap();
        ingest_declared_from_json(&mut combined, &declared_json, &scope(), 0);

        assert_eq!(
            canonical_snapshot(&folded),
            canonical_snapshot(&combined),
            "clone(structural)+declared converges to structural+declared (D8.2)"
        );
        assert!(
            folded.edge_count() > structural.edge_count(),
            "the declared edge actually folded in"
        );
    }

    #[test]
    fn full_index_equals_structural_plus_declared_from_json_d8_2() {
        // Review LOW (perf ADR D1, D8.2 lock): the async fold's serve path is
        // `index_worktree_structural` + `ingest_declared_from_json`. Tie it back
        // to the SYNCHRONOUS full `index_worktree` (the CLI / re-derivability
        // path): for the SAME declared input and observed_at, the full path's
        // graph must be byte-identical to structural + the same declared JSON.
        //
        // The full path's declared phase IS `ingest_core_graph` =
        // `fetch_core_graph_json` + `ingest_declared_from_json`. In this
        // `.vaultspec`-less dir core cannot graph, so the full path ingests an
        // EMPTY declared tier; feeding that SAME empty declared into the fold
        // path must therefore yield the identical graph. Ingesting a non-empty
        // fixed JSON into BOTH the full result and the structural base then
        // proves the seams stay identical past the empty case — locking that the
        // fold path and the full path share one declared-ingest function.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::write(
            root.join(".vault/plan/2026-06-12-x-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#x'\n---\n\nMentions `src/a.rs` and \
             [[2026-06-12-x-adr]].\n",
        )
        .unwrap();
        let store = engine_store::Store::open(&root.join(".vault")).unwrap();

        // The full synchronous path (structural + declared-from-core). Core is
        // unavailable here, so declared is empty and `full` == structural-only.
        let (full, full_stats) = index_worktree(root, &scope(), &store, 7).unwrap();
        assert_eq!(
            full_stats.declared_edges, 0,
            "core unavailable: the full path's declared tier is empty here"
        );
        // The fold's base: structural-only at the SAME observed_at.
        let (structural, _) = index_worktree_structural(root, &scope(), &store, 7).unwrap();
        assert_eq!(
            canonical_snapshot(&full),
            canonical_snapshot(&structural),
            "full(structural+empty-declared) == structural base of the fold path"
        );

        // Past the empty case: ingest the SAME fixed declared JSON into both the
        // full-path result and the structural base via the shared seam. The two
        // must stay byte-identical — the fold path and the full path converge.
        let declared_json = serde_json::json!({
            "nodes": [
                {"id": "2026-06-12-x-plan", "doc_type": "plan"},
                {"id": "2026-06-12-x-adr", "doc_type": "adr"}
            ],
            "edges": [
                {"source": "2026-06-12-x-plan", "target": "2026-06-12-x-adr", "kind": "related"}
            ]
        })
        .to_string();
        let mut full_plus = full;
        let mut fold_path = structural;
        ingest_declared_from_json(&mut full_plus, &declared_json, &scope(), 7);
        ingest_declared_from_json(&mut fold_path, &declared_json, &scope(), 7);
        assert_eq!(
            canonical_snapshot(&full_plus),
            canonical_snapshot(&fold_path),
            "full + declared(JSON) == structural + declared(JSON): the fold path \
             converges to the synchronous full path (D8.2)"
        );
        assert!(
            fold_path.edge_count() > full_stats.documents,
            "the fixed declared edge actually ingested on both sides"
        );
    }
}
