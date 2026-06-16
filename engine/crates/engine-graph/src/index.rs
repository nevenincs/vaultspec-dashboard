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

    // Pass 1 (serial): node upsert + extraction-cache get/put per document,
    // collecting each document's mentions. The store is single-writer, so its
    // get/put stays on the coordinating thread; node upsert mutates the graph,
    // also serial. This pass does NOT resolve — resolution is the expensive,
    // parallelizable work, deferred to the batch call below (perf ADR D2).
    let mut per_doc: Vec<(String, String, Vec<ExtractedMention>)> =
        Vec::with_capacity(extracted.len());
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
        // Plan-container minting (dashboard-pipeline-wire W03.P07): a plan
        // document's interior becomes first-class-but-subordinate
        // PlanContainer nodes + Contains edges, keyed only by plan stem +
        // canonical container ids. Done here (the plan node is upserted just
        // below) so the interior rides every structural index pass; the
        // step->exec binding is a post-pass once all doc nodes exist.
        if doc_type_of(&rel_path).as_deref() == Some("plan") {
            mint_plan_containers(graph, &stem, &text, &feature_tags, scope, observed_at);
        }
        // Contract §4 node fields on the LIST shape (addendum S03):
        // title from the body H1, created from the frontmatter date,
        // modified from the worktree mtime (ms), doc_type from the vault
        // subdirectory, lifecycle from the type-specific vocabulary
        // (graph-node-semantics ADR: ADR status / plan tier+progress / audit
        // max-severity / rule active-superseded, else checkbox progress).
        let modified = std::fs::metadata(root.join(&rel_path))
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as Timestamp);
        let doc_type = doc_type_of(&rel_path);
        graph.upsert_node(Node {
            id: node_id(&CanonicalKey::Document { stem: &stem }),
            kind: NodeKind::Document,
            key: stem.clone(),
            title: doc_title(&text),
            doc_type: doc_type.clone(),
            dates: Some(engine_model::Dates {
                created: frontmatter_date(&text),
                modified,
            }),
            feature_tags,
            // Status/tier query-time facets (dashboard-pipeline-wire W01.P02
            // S07/S08): the ADR H1 status and the plan frontmatter tier, read
            // the same deterministic way as dates/feature_tags. Both are
            // truthful-absence Options — a non-ADR carries no status, a non-plan
            // (or tier-less plan) carries no tier.
            status: frontmatter_adr_status(&text),
            tier: frontmatter_plan_tier(&text),
            facets: vec![Facet {
                scope: scope.clone(),
                presence: Presence::Exists,
                content_hash: Some(blob_hash.clone()),
                lifecycle: doc_lifecycle(doc_type.as_deref(), &text),
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
        per_doc.push((stem, blob_hash, mentions));
    }

    // Bound the per-doc extract cache to the live corpus: this rebuild visited
    // every current document, so any cached extract whose content hash is not in
    // this set is a stale generation (an old version of a changed doc, or a
    // deleted doc) and is evicted. Keyed on the live set, not age, because an
    // unchanged doc's extract is old-but-live. Re-derivable: a mis-evict only
    // costs a re-extract on the next pass.
    let live_extract_keys: Vec<String> = per_doc.iter().map(|(_, h, _)| h.clone()).collect();
    store.retain_artifacts(EXTRACT_KIND, &live_extract_keys)?;

    // Resolve EVERY document's mentions in one parallel batch (perf ADR D2):
    // distinct symbols/steps are resolved across CPU cores, the per-document
    // result is byte-identical to the prior sequential `resolver.resolve(...)`
    // (the resolve_batch parity invariant). Resolution always runs against the
    // *current* tree (resolution state is live signal, not cacheable fact).
    let mention_batches: Vec<Vec<ExtractedMention>> =
        per_doc.iter().map(|(_, _, m)| m.clone()).collect();
    let resolved_batches = resolver.resolve_batch(mention_batches);

    // Pass 2 (serial): mint edges per document from the pre-resolved mentions.
    // Edge ingestion mutates the graph, so it stays serial; it is cheap.
    //
    // Multiplicity aggregates at extraction granularity (audit W02P05-202 /
    // W01P01-003): repeated same-target mentions in one document collapse to one
    // edge carrying the count, ingested once — so re-ingestion replaces instead
    // of inflating.
    for ((stem, blob_hash, _), resolved_mentions) in per_doc.iter().zip(resolved_batches) {
        let mut by_id: std::collections::BTreeMap<String, (Edge, u32, Option<String>)> =
            std::collections::BTreeMap::new();
        for resolved in resolved_mentions {
            // Mint the inferred `code:` destination node for resolved/stale
            // Path/Symbol mentions (code-artifact-nodes ADR D1/D5), so the
            // bridge a resolved Path/Symbol mention already computes resolves
            // to a real node instead of a 404 dead-end. Broken mentions mint
            // nothing (D1: no navigable artifact for an absent target);
            // StepId/WikiLink are out of scope (D1). Idempotent by id.
            mint_code_artifact(graph, &resolved, scope);
            let target = resolved.target.clone();
            let edge = structural_edge_for(stem, blob_hash, &resolved, scope, observed_at);
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

    // Post-pass: bind each step plan-container node to its exec-record document
    // node where one exists (W03.P07.S37). Runs after every doc node is in the
    // graph so minting order is irrelevant; the binding edge id is identity-only.
    bind_steps_to_exec_records(graph, scope, observed_at);

    // Rule node species (graph-node-semantics ADR): project the codify
    // pipeline's output from the rules tree as authority-class `law` nodes with
    // `promoted-from` edges back into the audit that bore them. Read-and-infer:
    // rules live OUTSIDE `.vault/` and are NEVER minted as vault documents — the
    // node is a re-computable projection, deletable and re-derivable.
    project_rules(graph, root, scope, observed_at);

    phase!("structural");

    Ok(stats)
}

/// Project the rules tree (`.vaultspec/rules/rules/*.md`, OUTSIDE `.vault/`)
/// into `rule` species nodes (graph-node-semantics ADR). Each rule becomes a
/// node of kind `Rule` (authority class `law`) carrying its active/superseded
/// lifecycle, and — when the rule names the audit it was promoted from
/// (`derived_from:` frontmatter, or a `## Source` audit-stem reference) — a
/// `promoted-from` declared edge from the rule back into that audit's document
/// node. Best-effort: a missing or unreadable rules tree simply projects no
/// rule nodes (the corpus has none), never failing the index.
pub(crate) fn project_rules(
    graph: &mut LinkageGraph,
    root: &Path,
    scope: &ScopeRef,
    observed_at: Timestamp,
) {
    let rules_dir = root.join(".vaultspec").join("rules").join("rules");
    let Ok(entries) = std::fs::read_dir(&rules_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.ends_with(".md") {
            continue;
        }
        // The rule slug is the filename sans `.md` and the `.builtin` infix.
        let slug = name
            .trim_end_matches(".md")
            .trim_end_matches(".builtin")
            .to_string();
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let rule_id = node_id(&CanonicalKey::Rule { slug: &slug });
        graph.upsert_node(Node {
            id: rule_id.clone(),
            kind: NodeKind::Rule,
            key: slug.clone(),
            title: doc_title(&text),
            // A rule has no `.vault/` subdirectory type; the `rule` doc_type is
            // the ontology's species handle, NOT a claim that rules are vault
            // documents (the node kind already says `rule`).
            doc_type: Some("rule".to_string()),
            dates: Some(engine_model::Dates {
                created: frontmatter_date(&text),
                modified: None,
            }),
            feature_tags: vec![],
            // A rule carries neither an ADR status nor a plan tier — those are
            // the adr/plan species' lifecycle handles; the rule's active/superseded
            // state lives in its facet lifecycle below.
            status: None,
            tier: None,
            facets: vec![Facet {
                scope: scope.clone(),
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: Some(engine_model::Lifecycle {
                    state: rule_status(&text),
                    progress: None,
                }),
            }],
        });

        // The `promoted-from` derivation edge back into the audit that bore the
        // rule: read the audit stem from `derived_from:` frontmatter or a
        // `## Source` audit reference, and mint a declared edge ONLY when that
        // audit document node already exists in the graph (an honest edge to a
        // real node, never a dangling one).
        if let Some(audit_stem) = rule_source_audit(&text) {
            let audit_id = node_id(&CanonicalKey::Document { stem: &audit_stem });
            if graph.node(&audit_id).is_some() {
                let provenance = Provenance::CoreGraph {
                    payload_hash: "rule-projection".into(),
                    edge_id: format!("promoted-from:{slug}->{audit_stem}"),
                };
                let edge = Edge {
                    id: edge_id(
                        &rule_id,
                        &audit_id,
                        &RelationKind::References,
                        Tier::Declared,
                        &provenance,
                    ),
                    src: rule_id.clone(),
                    dst: audit_id,
                    relation: RelationKind::References,
                    tier: Tier::Declared,
                    confidence: 1.0,
                    state: None,
                    provenance,
                    scope: scope.clone(),
                    observed_at,
                };
                let _ = crate::edges::ingest(graph, edge, EdgeAttrs::default());
            }
        }
    }
}

/// The audit stem a rule was promoted from: `derived_from:` frontmatter wins,
/// else the first `…-audit` stem named in backticks in the `## Source` section.
/// `None` when the rule names no source audit (a directly-authored rule).
pub(crate) fn rule_source_audit(text: &str) -> Option<String> {
    // 1) `derived_from:` frontmatter (the promote path stamps this).
    if let Some(rest) = text.strip_prefix("---")
        && let Some(end) = rest.find("\n---")
    {
        for line in rest[..end].lines() {
            if let Some(value) = line.trim().strip_prefix("derived_from:") {
                let value = value.trim().trim_matches('\'').trim_matches('"');
                if value.ends_with("-audit") {
                    return Some(value.to_string());
                }
            }
        }
    }
    // 2) A backtick-quoted `…-audit` stem anywhere in the body (the `## Source`
    //    section names it). Backtick-delimited spans are the odd-indexed pieces
    //    of a split on '`'; take the first that looks like an audit stem.
    text.split('`')
        .skip(1)
        .step_by(2)
        .find(|token| {
            token.ends_with("-audit")
                && token.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        })
        .map(str::to_string)
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

/// Mint the plan-container interior of one plan document (dashboard-pipeline-
/// wire W03.P07): one `NodeKind::PlanContainer` node per wave/phase/step keyed
/// by `CanonicalKey::PlanContainer { plan_stem, container_id }`, and the
/// subordinate `Contains` edges plan -> wave -> phase -> step.
///
/// READ-AND-INFER + STABLE IDENTITY: this is inference over a document the
/// engine reads, never authorship. Every node id and edge id is composed ONLY
/// from the plan stem and the canonical container ids (and the step's
/// completion lives OUTSIDE the key, on a facet), so re-indexing the same plan
/// — even with a toggled checkbox — re-keys no existing node or edge
/// (`provenance-stable-keys-are-identity-bearing`). The structure is bounded by
/// the parser's ceiling (W03.P06.S31).
///
/// `container_id` strings are the canonical ids joined with `/` to a stable
/// path under the plan stem: a wave is `W01`, a phase `W01/P02`, a step
/// `W01/P02/S03`. The slashed form mirrors `CanonicalKey::PlanContainer`'s
/// `{plan_stem}/{container_id}` rendering and keeps each child id unique within
/// its plan regardless of duplicated leaf ids across branches.
pub(crate) fn mint_plan_containers(
    graph: &mut LinkageGraph,
    plan_stem: &str,
    text: &str,
    feature_tags: &[String],
    scope: &ScopeRef,
    observed_at: Timestamp,
) {
    let structure = ingest_struct::plan_structure::parse_plan_structure(text);
    let plan_node = node_id(&CanonicalKey::Document { stem: plan_stem });

    // A small closure minting one container node + its Contains edge from a
    // parent node. The container_id is the slashed canonical path.
    let mint = |graph: &mut LinkageGraph,
                parent: &NodeId,
                container_id: &str,
                title: Option<String>,
                lifecycle: Option<engine_model::Lifecycle>| {
        let id = node_id(&CanonicalKey::PlanContainer {
            plan_stem,
            container_id,
        });
        graph.upsert_node(Node {
            id: id.clone(),
            kind: NodeKind::PlanContainer,
            key: format!("{plan_stem}/{container_id}"),
            title,
            doc_type: None,
            dates: None,
            feature_tags: feature_tags.to_vec(),
            status: None,
            tier: None,
            facets: vec![Facet {
                scope: scope.clone(),
                presence: Presence::Exists,
                content_hash: None,
                // Per-step completion rides the lifecycle facet (W03.P07.S35):
                // a closed step is `complete` 1/1, an open step `active` 0/1.
                // Toggling a checkbox changes THIS facet, never the node id.
                lifecycle,
            }],
        });
        let _ = crate::edges::ingest(
            graph,
            contains_edge(parent, &id, container_id, scope, observed_at),
            EdgeAttrs::default(),
        );
        id
    };

    // L1 steps directly under the plan.
    for step in &structure.steps {
        mint(
            graph,
            &plan_node,
            &step.id,
            Some(step.action.clone()),
            Some(step_lifecycle(step.done)),
        );
    }
    // L2 phases (and their steps) directly under the plan.
    for phase in &structure.phases {
        let phase_node = mint(
            graph,
            &plan_node,
            &phase.id,
            (!phase.heading.is_empty()).then(|| phase.heading.clone()),
            None,
        );
        for step in &phase.steps {
            let container_id = format!("{}/{}", phase.id, step.id);
            mint(
                graph,
                &phase_node,
                &container_id,
                Some(step.action.clone()),
                Some(step_lifecycle(step.done)),
            );
        }
    }
    // L3/L4 waves -> phases -> steps.
    for wave in &structure.waves {
        let wave_node = mint(
            graph,
            &plan_node,
            &wave.id,
            (!wave.heading.is_empty()).then(|| wave.heading.clone()),
            None,
        );
        for phase in &wave.phases {
            let phase_id = format!("{}/{}", wave.id, phase.id);
            let phase_node = mint(
                graph,
                &wave_node,
                &phase_id,
                (!phase.heading.is_empty()).then(|| phase.heading.clone()),
                None,
            );
            for step in &phase.steps {
                let container_id = format!("{}/{}/{}", wave.id, phase.id, step.id);
                mint(
                    graph,
                    &phase_node,
                    &container_id,
                    Some(step.action.clone()),
                    Some(step_lifecycle(step.done)),
                );
            }
        }
    }
}

/// The per-step lifecycle facet carrying completion (W03.P07.S35): a closed
/// step is `complete` (1/1), an open step `active` (0/1). One step = one unit
/// of progress, so the Work surface renders a step's done-ness uniformly with
/// the plan-level progress ring.
fn step_lifecycle(done: bool) -> engine_model::Lifecycle {
    engine_model::Lifecycle {
        state: if done { "complete" } else { "active" }.to_string(),
        progress: Some(engine_model::Progress {
            done: u32::from(done),
            total: 1,
        }),
    }
}

/// A subordinate `Contains` edge (W03.P07.S36) from a parent container (or the
/// plan node) to a child container. Declared tier (the structure is authored,
/// not inferred). The edge stable key is composed ONLY from the endpoint
/// container ids: src/dst already encode plan stem + canonical id, and the
/// provenance stable key is the child's canonical container id — never a
/// resolution or rule outcome, so re-indexing never re-keys it.
fn contains_edge(
    parent: &NodeId,
    child: &NodeId,
    child_container_id: &str,
    scope: &ScopeRef,
    observed_at: Timestamp,
) -> Edge {
    let provenance = Provenance::CoreGraph {
        // Volatile field, excluded from the stable key.
        payload_hash: String::new(),
        // Identity-bearing: the child's canonical container id.
        edge_id: child_container_id.to_string(),
    };
    let relation = RelationKind::Contains;
    let id = edge_id(parent, child, &relation, Tier::Declared, &provenance);
    Edge {
        id,
        src: parent.clone(),
        dst: child.clone(),
        relation,
        tier: Tier::Declared,
        confidence: 1.0,
        state: None,
        provenance,
        scope: scope.clone(),
        observed_at,
    }
}

/// Bind each step plan-container node to its exec-record document node where one
/// exists (W03.P07.S37): a `References` edge with an IDENTITY-ONLY stable key.
///
/// Exec records are vault documents whose stem encodes the step's canonical
/// display path with `-` separators (e.g. `2026-06-14-feature-W01-P01-S01`).
/// The binding runs as a post-pass once every document node is in the graph, so
/// minting order does not matter. The edge stable key is composed only from the
/// two endpoint ids (the step container id and the exec stem) — never a
/// resolution state — so it survives re-index unchanged.
pub(crate) fn bind_steps_to_exec_records(
    graph: &mut LinkageGraph,
    scope: &ScopeRef,
    observed_at: Timestamp,
) {
    // Collect step container ids and exec doc stems first (immutable borrow),
    // then mint edges (mutable borrow) — no aliasing.
    let step_nodes: Vec<(NodeId, String)> = graph
        .nodes()
        .filter(|n| {
            n.kind == NodeKind::PlanContainer && n.key.rsplit('/').next().is_some_and(is_step_leaf)
        })
        .map(|n| (n.id.clone(), n.key.clone()))
        .collect();
    let exec_stems: Vec<String> = graph
        .nodes()
        .filter(|n| n.id.0.starts_with("doc:") && n.doc_type.as_deref() == Some("exec"))
        .map(|n| n.key.clone())
        .collect();

    for (step_id, step_key) in &step_nodes {
        // The step key is `{plan_stem}/{container_id}`, e.g.
        // `2026-06-12-demo-plan/W01/P01/S01`. Bind only to THIS plan's exec
        // record `{plan-prefix}-{tail}`, where the prefix is the plan stem minus
        // its `-plan` suffix (the date+feature discriminator) and the tail is the
        // container path joined with `-`. Anchoring on the prefix prevents a step
        // binding to another plan whose exec records share the same container
        // tail -- every L1/L2/L3 plan has a `W01-P01-S01`/`P01-S01`/`S01`.
        let plan_stem = step_key.split('/').next().unwrap_or("");
        let tail = step_key
            .split('/')
            .skip(1) // drop the plan stem
            .collect::<Vec<_>>()
            .join("-");
        if tail.is_empty() || plan_stem.is_empty() {
            continue;
        }
        let plan_prefix = plan_stem.strip_suffix("-plan").unwrap_or(plan_stem);
        let expected_exec = format!("{plan_prefix}-{tail}");
        for exec_stem in &exec_stems {
            if exec_stem == &expected_exec {
                let exec_node = node_id(&CanonicalKey::Document { stem: exec_stem });
                let provenance = Provenance::CoreGraph {
                    payload_hash: String::new(),
                    // Identity-only: the step container id binds to the exec stem.
                    edge_id: format!("{}->{}", step_id.0, exec_stem),
                };
                let relation = RelationKind::References;
                let id = edge_id(step_id, &exec_node, &relation, Tier::Declared, &provenance);
                let _ = crate::edges::ingest(
                    graph,
                    Edge {
                        id,
                        src: step_id.clone(),
                        dst: exec_node,
                        relation,
                        tier: Tier::Declared,
                        confidence: 1.0,
                        state: None,
                        provenance,
                        scope: scope.clone(),
                        observed_at,
                    },
                    EdgeAttrs::default(),
                );
            }
        }
    }
}

/// Is a slashed-key leaf a step container (`S##`)? Used to find step nodes for
/// exec binding without re-parsing.
fn is_step_leaf(leaf: &str) -> bool {
    let mut chars = leaf.chars();
    chars.next() == Some('S') && {
        let digits: String = chars.collect();
        digits.len() >= 2 && digits.chars().all(|c| c.is_ascii_digit())
    }
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

/// Mint the inferred `code:` artifact node a resolved Path/Symbol mention
/// addresses (code-artifact-nodes ADR D1-D6), beside the structural edge that
/// names it. Idempotent by id (`upsert_node` merges the scope facet), so
/// re-ingestion converges and a file mentioned by ten documents is one node.
///
/// READ-AND-INFER + STABLE IDENTITY (D3): the id is derived ONLY from the
/// resolver's live `resolved_target` (the real repo-relative path), never from
/// the mention text, the byte span, the resolution state, or the rag index — so
/// a `Resolved`→`Stale` transition mints the node at the path that exists and
/// re-indexing re-derives the identical id, re-keying nothing. The node is the
/// same id `bridge_node_id` already computes from the resolved target, so the
/// bridge flips from `None` to navigable with NO change to `bridge_node_id`
/// itself (D5/D7). Like the plan-container and rule-projection species minted in
/// this file, the node is inferred cache: nothing is written to `.vault/`,
/// nothing is mutated, and it is fully re-derivable from a deleted cache.
///
/// Scope policy (D1/D5): mint only `Resolved`/`Stale` Path/Symbol mentions —
/// a `Broken` mention points at a target the tree cannot produce, so minting a
/// node for it would fabricate a navigable artifact for something absent (the
/// honest state is the broken edge with a `null` bridge). `StepId` bridging is
/// OUT of v1 scope (its bare-id target `plan:W01.P02.S03` must be reconciled
/// with the real `plan:{plan_stem}/…` container id — a distinct identity
/// reconciliation owned by the plan-container feature); `WikiLink` already
/// bridges to a real document node.
///
/// Symbol-node granularity (D3, recorded open-question call): the v1 symbol
/// node is the path-keyed `code:{resolved_path}` form — the file the symbol was
/// resolved into — NOT the symbol-qualified `code:{path}#{symbol}` form. This is the
/// non-id-bearing call: it mints exactly the node `bridge_node_id` looks up
/// (which derives `code:{resolved_target}` with `symbol: None` for a path),
/// leaving the existing `Mentions` edge's `code:#{symbol}` endpoint untouched.
/// The path-anchored symbol form is a future edge-id change requiring a
/// contract-review event, deliberately not taken here.
fn mint_code_artifact(
    graph: &mut LinkageGraph,
    resolved: &ingest_struct::resolve::ResolvedMention,
    scope: &ScopeRef,
) {
    // Only Path/Symbol mentions address a `CanonicalKey::CodeArtifact`; WikiLink
    // and StepId are out of scope (D1).
    match &resolved.mention.kind {
        MentionKind::Path(_) | MentionKind::Symbol(_) => {}
        MentionKind::WikiLink(_) | MentionKind::StepId(_) => return,
    }
    // Broken mints nothing (D1); only Resolved/Stale carry a live target.
    if !matches!(
        resolved.state,
        ResolutionState::Resolved | ResolutionState::Stale
    ) {
        return;
    }
    let Some(resolved_target) = resolved.target.as_deref() else {
        return;
    };
    // Identity from the resolved path alone (D3): the same id the bridge
    // computes (`CanonicalKey::CodeArtifact { path, symbol: None }`).
    let key = CanonicalKey::CodeArtifact {
        path: resolved_target,
        symbol: None,
    };
    let id = node_id(&key);
    graph.upsert_node(Node {
        id,
        kind: NodeKind::CodeArtifact,
        key: key.key_string(),
        // Thin node (D2): no title; inbound `Mentions` edges carry the detail.
        title: None,
        // `doc_type: "code"` is the ontology's species handle, mirroring
        // `project_rules`' `doc_type: "rule"` (D2) — NOT a claim that the file
        // is a vault document (the node kind already says `code`).
        doc_type: Some("code".to_string()),
        dates: None,
        // No feature_tags (D6): the feature-constellation projection excludes
        // code nodes, keeping the unbounded-safe default LOD untouched.
        feature_tags: vec![],
        // A source file has no pipeline state: no ADR status, no plan tier (D2).
        status: None,
        tier: None,
        facets: vec![Facet {
            scope: scope.clone(),
            presence: Presence::Exists,
            content_hash: None,
            // No lifecycle (D2): a source file carries no pipeline lifecycle.
            lifecycle: None,
        }],
    });
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

/// The ADR H1 status value (contract §4 status facet, dashboard-pipeline-wire
/// W01.P01.S01): one of `proposed`, `accepted`, `rejected`, or `deprecated`,
/// read from the H1 status marker the ADR template emits, e.g.
/// `# `feature` adr: `topic` | (**status:** `accepted`)`. The marker is
/// `(**status:** `<value>`)`; the value is the backtick-wrapped enum token.
///
/// An ADR with no recognizable status marker, or a status outside the four-
/// value enum, returns `None` — "in-flight ADR" is honest only when the real
/// status is present; a missing or out-of-enum status is truthful absence, not
/// a guessed default.
pub(crate) fn frontmatter_adr_status(text: &str) -> Option<String> {
    const STATUSES: &[&str] = &["proposed", "accepted", "rejected", "deprecated"];
    // The status marker lives on the H1 line. Scan for the `**status:**`
    // sentinel and read the next backtick-wrapped token after it. Tolerant of
    // spacing around the colon and the value's backticks, matching the template
    // form `(**status:** `accepted`)` while not over-fitting to the exact
    // surrounding punctuation.
    let line = text.lines().find(|l| l.contains("**status:**"))?;
    let after = line.split("**status:**").nth(1)?;
    let start = after.find('`')? + 1;
    let end = after[start..].find('`')? + start;
    let value = after[start..end].trim().to_ascii_lowercase();
    STATUSES.contains(&value.as_str()).then_some(value)
}

/// The plan frontmatter `tier` value (contract §4 tier facet,
/// dashboard-pipeline-wire W01.P01.S02): one of `L1`, `L2`, `L3`, or `L4`,
/// read from the `tier:` frontmatter key the plan template requires.
///
/// A document with no `tier:` key, or a tier outside the four-value enum,
/// returns `None` — an out-of-enum tier is rejected (truthful absence) rather
/// than carried through as a bogus facet.
pub(crate) fn frontmatter_plan_tier(text: &str) -> Option<String> {
    const TIERS: &[&str] = &["L1", "L2", "L3", "L4"];
    let rest = text.strip_prefix("---")?;
    let end = rest.find("\n---")?;
    let value = rest[..end].lines().find_map(|line| {
        let value = line.trim().strip_prefix("tier:")?.trim();
        let value = value.trim_matches('\'').trim_matches('"').trim();
        (!value.is_empty()).then(|| value.to_string())
    })?;
    TIERS.contains(&value.as_str()).then_some(value)
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
fn checkbox_lifecycle(text: &str) -> Option<engine_model::Lifecycle> {
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

/// Type-specific lifecycle vocabulary (graph-node-semantics ADR): the single
/// generic `state` string is a lossy collapse, so each species surfaces its
/// own state machine, parsed from frontmatter and body. This is the ADDITIVE
/// lifecycle extension — it RETAINS the §4 `{state, progress?}` shape and only
/// chooses a richer, type-correct `state` value (and keeps the checkbox
/// progress for plans). Parsed from body conventions (ADR H1 status line, audit
/// finding-severity headings, frontmatter tier/status), it DEGRADES HONESTLY:
/// a document predating the convention falls back to the generic checkbox
/// lifecycle (or `None`), never a fabricated state (ADR `Frontier caution`).
pub(crate) fn doc_lifecycle(doc_type: Option<&str>, text: &str) -> Option<engine_model::Lifecycle> {
    match doc_type {
        // ADR: the H1 status line — `(**status:** \`accepted\`)`.
        Some("adr") => adr_status(text)
            .map(|state| engine_model::Lifecycle {
                state,
                progress: None,
            })
            .or_else(|| checkbox_lifecycle(text)),
        // Plan: tier (frontmatter) + checkbox progress. The tier is the
        // ontological weight a generic state cannot carry; it rides as the
        // state while progress stays on the §4 progress channel.
        Some("plan") => {
            let progress = checkbox_lifecycle(text).and_then(|l| l.progress);
            let tier = plan_tier(text);
            match (tier, progress) {
                (Some(tier), progress) => Some(engine_model::Lifecycle {
                    state: tier,
                    progress,
                }),
                (None, _) => checkbox_lifecycle(text),
            }
        }
        // Audit: the worst finding severity drives the lifecycle.
        Some("audit") => audit_max_severity(text)
            .map(|severity| engine_model::Lifecycle {
                state: severity,
                progress: None,
            })
            .or_else(|| checkbox_lifecycle(text)),
        // Rule: active vs superseded (a `## Status` naming a successor).
        Some("rule") => Some(engine_model::Lifecycle {
            state: rule_status(text),
            progress: None,
        }),
        // Every other type keeps the generic checkbox lifecycle.
        _ => checkbox_lifecycle(text),
    }
}

/// The ADR status from the H1 status line (`… (**status:** \`accepted\`)`).
/// Recognizes the four-state machine; an ADR predating the convention yields
/// `None` (honest absence, not a fabricated `accepted`).
pub(crate) fn adr_status(text: &str) -> Option<String> {
    let h1 = text.lines().find(|l| l.starts_with("# "))?;
    let lower = h1.to_lowercase();
    for status in ["deprecated", "rejected", "accepted", "proposed"] {
        // Match `status:` followed (loosely) by the keyword on the H1 line.
        if lower.contains("status") && lower.contains(status) {
            return Some(status.to_string());
        }
    }
    None
}

/// The plan tier from frontmatter (`tier: L2`). The L1–L4 complexity signal a
/// generic `state` cannot carry; `None` when absent.
pub(crate) fn plan_tier(text: &str) -> Option<String> {
    let rest = text.strip_prefix("---")?;
    let end = rest.find("\n---")?;
    rest[..end].lines().find_map(|line| {
        let value = line.trim().strip_prefix("tier:")?.trim();
        let value = value.trim_matches('\'').trim_matches('"');
        matches!(value, "L1" | "L2" | "L3" | "L4").then(|| value.to_string())
    })
}

/// The worst finding severity in an audit body. Audits surface findings with a
/// severity word (critical/high/medium/low) on heading or label lines; the
/// lifecycle reports the worst one present. `None` when no severity is found
/// (an audit predating the convention degrades honestly).
pub(crate) fn audit_max_severity(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    for severity in ["critical", "high", "medium", "low"] {
        if lower.contains(severity) {
            return Some(severity.to_string());
        }
    }
    None
}

/// A rule's active/superseded status: a `## Status` section that names a
/// successor (a `superseded` keyword, or "successor"/"superseded by" prose)
/// reads as `superseded`; otherwise `active`. Rules default to active because a
/// shipped rule binds by default (ADR: pinned to shipped reality).
pub(crate) fn rule_status(text: &str) -> String {
    let lower = text.to_lowercase();
    if lower.contains("superseded by") || lower.contains("supersedes") {
        "superseded".to_string()
    } else {
        "active".to_string()
    }
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
    fn adr_status_parser_extracts_each_status_and_none_when_absent() {
        // W01.P01.S03: the H1 status marker the ADR template emits carries one
        // of the four enum values; the parser reads each, and a status-less
        // document (or an out-of-enum value) is truthful absence, not a guess.
        for status in ["proposed", "accepted", "rejected", "deprecated"] {
            let h1 = format!(
                "---\ntags:\n  - '#adr'\n---\n\n# `x` adr: `topic` | (**status:** `{status}`)\n\nbody\n"
            );
            assert_eq!(
                frontmatter_adr_status(&h1).as_deref(),
                Some(status),
                "extracts the `{status}` H1 status"
            );
        }
        // Case-insensitive on the enum token (templates are lowercase but a
        // hand-authored `Accepted` must still resolve to the canonical token).
        let mixed = "# `x` adr: `t` | (**status:** `Accepted`)\n";
        assert_eq!(frontmatter_adr_status(mixed).as_deref(), Some("accepted"));
        // No status marker at all → None.
        let no_status = "---\ntags:\n  - '#adr'\n---\n\n# `x` adr: `topic`\n\nbody\n";
        assert_eq!(frontmatter_adr_status(no_status), None);
        // An out-of-enum status token → None (rejected, never carried).
        let bad = "# `x` adr: `t` | (**status:** `superseded`)\n";
        assert_eq!(frontmatter_adr_status(bad), None);
    }

    #[test]
    fn plan_tier_parser_extracts_each_tier_and_none_when_missing_or_invalid() {
        // W01.P01.S04: the plan `tier:` frontmatter key carries one of L1-L4;
        // the parser reads each, and a missing or out-of-enum tier is None.
        for tier in ["L1", "L2", "L3", "L4"] {
            let plan = format!("---\ntags:\n  - '#plan'\n  - '#x'\ntier: {tier}\n---\n\nbody\n");
            assert_eq!(
                frontmatter_plan_tier(&plan).as_deref(),
                Some(tier),
                "extracts the {tier} tier"
            );
        }
        // Quoted value still resolves.
        let quoted = "---\ntags:\n  - '#plan'\ntier: 'L3'\n---\n\nbody\n";
        assert_eq!(frontmatter_plan_tier(quoted).as_deref(), Some("L3"));
        // No tier key → None.
        let no_tier = "---\ntags:\n  - '#plan'\n  - '#x'\n---\n\nbody\n";
        assert_eq!(frontmatter_plan_tier(no_tier), None);
        // Out-of-enum tier → None (rejected).
        let bad = "---\ntags:\n  - '#plan'\ntier: L9\n---\n\nbody\n";
        assert_eq!(frontmatter_plan_tier(bad), None);
        // A tier marker outside the frontmatter fence is ignored.
        let outside = "---\ntags:\n  - '#plan'\n---\n\ntier: L2 mentioned in prose\n";
        assert_eq!(frontmatter_plan_tier(outside), None);
    }

    #[test]
    fn rule_species_projects_from_the_rules_tree_with_promoted_from_edges() {
        // graph-node-semantics ADR: rules live OUTSIDE `.vault/` and project as
        // `rule` species nodes (authority law) with a `promoted-from` edge back
        // into the audit that bore them — never minted as vault documents.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        // An audit document the rule will point back to.
        std::fs::create_dir_all(root.join(".vault/audit")).unwrap();
        std::fs::write(
            root.join(".vault/audit/2026-06-14-x-audit.md"),
            "---\ntags:\n  - '#audit'\n  - '#x'\n---\n\n# x audit\n",
        )
        .unwrap();
        // A project rule whose `## Source` names that audit.
        std::fs::create_dir_all(root.join(".vaultspec/rules/rules")).unwrap();
        std::fs::write(
            root.join(".vaultspec/rules/rules/x-rule.md"),
            "---\nname: x-rule\n---\n\n# X rule\n\n## Status\n\nActive.\n\n## Source\n\nAudit `2026-06-14-x-audit`.\n",
        )
        .unwrap();

        let store = engine_store::Store::open(&root.join(".vault")).unwrap();
        let (graph, _) = index_worktree(root, &scope(), &store, 0).unwrap();

        // The rule node exists, is kind Rule, and is active.
        let rule_id = node_id(&CanonicalKey::Rule { slug: "x-rule" });
        let rule = graph.node(&rule_id).expect("rule node projected");
        assert_eq!(rule.kind, NodeKind::Rule);
        assert_eq!(rule.id.0, "rule:x-rule", "rule id is slug-keyed, not doc:");
        assert_eq!(rule.facets[0].lifecycle.as_ref().unwrap().state, "active");

        // A promoted-from edge bridges the rule to the audit document node.
        let audit_id = node_id(&CanonicalKey::Document {
            stem: "2026-06-14-x-audit",
        });
        let bridged = graph
            .edges_of(&rule_id)
            .any(|s| s.edge.src == rule_id && s.edge.dst == audit_id);
        assert!(bridged, "rule -> audit promoted-from edge minted");
    }

    #[test]
    fn type_specific_lifecycle_parses_per_species_with_honest_degradation() {
        // ADR status from the H1 status line.
        let adr = "---\ntags: ['#adr']\n---\n\n# `x` adr: `y` | (**status:** `accepted`)\n";
        assert_eq!(
            doc_lifecycle(Some("adr"), adr).unwrap().state,
            "accepted",
            "ADR status drives the lifecycle"
        );
        let deprecated = "# `x` adr (**status:** `deprecated`)\n";
        assert_eq!(
            doc_lifecycle(Some("adr"), deprecated).unwrap().state,
            "deprecated"
        );

        // Plan tier rides as the state; checkbox progress stays on progress.
        let plan = "---\ntier: L2\n---\n\n- [x] done\n- [ ] todo\n";
        let plan_lc = doc_lifecycle(Some("plan"), plan).unwrap();
        assert_eq!(plan_lc.state, "L2", "plan tier is the lifecycle state");
        assert_eq!(plan_lc.progress.unwrap().done, 1);
        assert_eq!(plan_lc.progress.unwrap().total, 2);

        // Audit worst-finding severity.
        let audit = "# audit\n\n### Finding A (high)\n### Finding B (low)\n";
        assert_eq!(
            doc_lifecycle(Some("audit"), audit).unwrap().state,
            "high",
            "the worst severity present wins"
        );

        // Rule active vs superseded.
        let active_rule = "# rule\n\n## Status\n\nActive.\n";
        assert_eq!(
            doc_lifecycle(Some("rule"), active_rule).unwrap().state,
            "active"
        );
        let superseded = "# rule\n\n## Status\n\nSuperseded by `new-rule`.\n";
        assert_eq!(
            doc_lifecycle(Some("rule"), superseded).unwrap().state,
            "superseded"
        );

        // Honest degradation: an ADR predating the status convention falls back
        // to the generic checkbox lifecycle (or None), never a fabricated state.
        let old_adr = "# an adr with no status line\n\n- [ ] a box\n";
        assert_eq!(
            doc_lifecycle(Some("adr"), old_adr).unwrap().state,
            "active",
            "no status line degrades to the checkbox lifecycle, not a lie"
        );
        let bare_adr = "# an adr with neither status nor checkboxes\n";
        assert!(
            doc_lifecycle(Some("adr"), bare_adr).is_none(),
            "no signal at all is honest absence"
        );
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

    fn write_plan(root: &Path, name: &str, body: &str) {
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::write(root.join(format!(".vault/plan/{name}")), body).unwrap();
    }

    const PLAN_BODY_OPEN: &str = "\
---
tags:
  - '#plan'
  - '#pc'
tier: L3
---

# `pc` plan

## Wave `W01` - the wave

### Phase `W01.P01` - the phase

- [ ] `W01.P01.S01` - first step; `src/a.rs`.
- [ ] `W01.P01.S02` - second step; `src/b.rs`.
";

    #[test]
    fn reingesting_a_plan_re_keys_no_existing_step_node_or_edge() {
        // W03.P07.S38: identity survives re-index. Minting the same plan twice
        // (the watcher's partial re-ingest path) must converge to the same
        // node and edge ids — stable keys are plan stem + canonical ids only.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_plan(root, "2026-06-14-pc-plan.md", PLAN_BODY_OPEN);
        let store = engine_store::Store::open(&root.join(".vault")).unwrap();

        let (g1, _) = index_worktree(root, &scope(), &store, 0).unwrap();
        // Re-ingest into the SAME graph (idempotent partial re-index path) and
        // into a FRESH graph; both must carry the identical container ids/edges.
        let (g2, _) = index_worktree(root, &scope(), &store, 99).unwrap();

        let step1 = node_id(&CanonicalKey::PlanContainer {
            plan_stem: "2026-06-14-pc-plan",
            container_id: "W01/P01/S01",
        });
        assert!(g1.node(&step1).is_some(), "step container minted");
        assert!(g2.node(&step1).is_some(), "same step id on re-index");

        // The wave, phase, and both steps exist with their canonical ids.
        for cid in ["W01", "W01/P01", "W01/P01/S01", "W01/P01/S02"] {
            let id = node_id(&CanonicalKey::PlanContainer {
                plan_stem: "2026-06-14-pc-plan",
                container_id: cid,
            });
            assert!(g1.node(&id).is_some(), "container {cid} minted");
        }

        // The full container node + Contains edge sets are byte-identical
        // across the two independent indexes — no re-keying, no churn.
        let containers = |g: &LinkageGraph| {
            let mut v: Vec<String> = g
                .nodes()
                .filter(|n| n.kind == NodeKind::PlanContainer)
                .map(|n| n.id.0.clone())
                .collect();
            v.sort();
            v
        };
        let contains = |g: &LinkageGraph| {
            let mut v: Vec<String> = g
                .edges()
                .filter(|s| s.edge.relation == RelationKind::Contains)
                .map(|s| s.edge.id.0.clone())
                .collect();
            v.sort();
            v
        };
        assert_eq!(
            containers(&g1),
            containers(&g2),
            "node ids stable across re-index"
        );
        assert_eq!(
            contains(&g1),
            contains(&g2),
            "Contains edge ids stable across re-index"
        );
        assert_eq!(
            contains(&g1).len(),
            4,
            "plan->wave, wave->phase, phase->step x2"
        );
    }

    #[test]
    fn toggling_a_step_checkbox_updates_completion_without_changing_the_step_node_id() {
        // W03.P07.S39: a `- [ ]` -> `- [x]` toggle changes the step's
        // completion facet, never its node id (the id is identity-bearing, the
        // completion lives outside the key).
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let store = engine_store::Store::open(&root.join(".vault")).unwrap();
        let step_id = node_id(&CanonicalKey::PlanContainer {
            plan_stem: "2026-06-14-pc-plan",
            container_id: "W01/P01/S01",
        });

        // Open.
        write_plan(root, "2026-06-14-pc-plan.md", PLAN_BODY_OPEN);
        let (g_open, _) = index_worktree(root, &scope(), &store, 0).unwrap();
        let open_node = g_open.node(&step_id).expect("step before toggle");
        let open_lc = open_node.facets[0].lifecycle.as_ref().unwrap();
        assert_eq!(open_lc.state, "active", "open step is active");
        assert_eq!(open_lc.progress.unwrap().done, 0);

        // Toggle S01 closed.
        let toggled = PLAN_BODY_OPEN.replace("- [ ] `W01.P01.S01`", "- [x] `W01.P01.S01`");
        write_plan(root, "2026-06-14-pc-plan.md", &toggled);
        let (g_closed, _) = index_worktree(root, &scope(), &store, 1).unwrap();
        let closed_node = g_closed.node(&step_id).expect("step after toggle");

        // Same node id (identity stable), changed completion (signal).
        assert_eq!(open_node.id, closed_node.id, "step node id is unchanged");
        let closed_lc = closed_node.facets[0].lifecycle.as_ref().unwrap();
        assert_eq!(closed_lc.state, "complete", "toggled step is complete");
        assert_eq!(closed_lc.progress.unwrap().done, 1);
    }

    #[test]
    fn step_containers_bind_to_their_exec_records() {
        // W03.P07.S37: a step container binds to its exec-record doc node when
        // one exists, via an identity-only References edge.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_plan(root, "2026-06-14-pc-plan.md", PLAN_BODY_OPEN);
        std::fs::create_dir_all(root.join(".vault/exec/2026-06-14-pc")).unwrap();
        std::fs::write(
            root.join(".vault/exec/2026-06-14-pc/2026-06-14-pc-W01-P01-S01.md"),
            "---\ntags:\n  - '#exec'\n  - '#pc'\n---\n\nexec record body\n",
        )
        .unwrap();
        let store = engine_store::Store::open(&root.join(".vault")).unwrap();
        let (g, _) = index_worktree(root, &scope(), &store, 0).unwrap();

        let step_id = node_id(&CanonicalKey::PlanContainer {
            plan_stem: "2026-06-14-pc-plan",
            container_id: "W01/P01/S01",
        });
        let exec_id = node_id(&CanonicalKey::Document {
            stem: "2026-06-14-pc-W01-P01-S01",
        });
        let bound = g
            .edges_of(&step_id)
            .any(|s| s.edge.relation == RelationKind::References && s.edge.dst == exec_id);
        assert!(bound, "step S01 binds to its exec record");
        // S02 has no exec record — it binds to none.
        let step2 = node_id(&CanonicalKey::PlanContainer {
            plan_stem: "2026-06-14-pc-plan",
            container_id: "W01/P01/S02",
        });
        let unbound = g
            .edges_of(&step2)
            .all(|s| s.edge.relation != RelationKind::References);
        assert!(unbound, "S02 has no exec record, so no binding");
    }

    #[test]
    fn a_step_binds_only_to_its_own_plans_exec_record_not_a_sibling_plans() {
        // Review HIGH-1 regression: two plans share the identical container tail
        // `W01-P01-S01`. A step must bind ONLY to its own plan's exec record,
        // never to a sibling plan's exec record carrying the same tail.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write_plan(root, "2026-06-14-pc-plan.md", PLAN_BODY_OPEN);
        write_plan(
            root,
            "2026-06-14-qc-plan.md",
            "---\ntags:\n  - '#plan'\n  - '#qc'\ntier: L3\n---\n\n# `qc` plan\n\n## Wave `W01` - w\n\n### Phase `W01.P01` - p\n\n- [ ] `W01.P01.S01` - first step; `src/a.rs`.\n",
        );
        // Each plan owns its exec record, both with the SAME container tail.
        std::fs::create_dir_all(root.join(".vault/exec/2026-06-14-pc")).unwrap();
        std::fs::write(
            root.join(".vault/exec/2026-06-14-pc/2026-06-14-pc-W01-P01-S01.md"),
            "---\ntags:\n  - '#exec'\n  - '#pc'\n---\n\npc exec\n",
        )
        .unwrap();
        std::fs::create_dir_all(root.join(".vault/exec/2026-06-14-qc")).unwrap();
        std::fs::write(
            root.join(".vault/exec/2026-06-14-qc/2026-06-14-qc-W01-P01-S01.md"),
            "---\ntags:\n  - '#exec'\n  - '#qc'\n---\n\nqc exec\n",
        )
        .unwrap();
        let store = engine_store::Store::open(&root.join(".vault")).unwrap();
        let (g, _) = index_worktree(root, &scope(), &store, 0).unwrap();

        let pc_step = node_id(&CanonicalKey::PlanContainer {
            plan_stem: "2026-06-14-pc-plan",
            container_id: "W01/P01/S01",
        });
        let pc_exec = node_id(&CanonicalKey::Document {
            stem: "2026-06-14-pc-W01-P01-S01",
        });
        let qc_exec = node_id(&CanonicalKey::Document {
            stem: "2026-06-14-qc-W01-P01-S01",
        });
        let refs: Vec<NodeId> = g
            .edges_of(&pc_step)
            .filter(|s| s.edge.relation == RelationKind::References)
            .map(|s| s.edge.dst.clone())
            .collect();
        assert!(
            refs.contains(&pc_exec),
            "pc step binds to its own exec record"
        );
        assert!(
            !refs.contains(&qc_exec),
            "pc step must NOT bind to the sibling qc plan's exec record with the same tail"
        );
    }

    #[test]
    fn ingested_adr_and_plan_carry_honest_status_and_tier_facets() {
        // W01.P03.S15: an ingested ADR carries its real H1 status and a plan
        // carries its frontmatter tier through to the doc node — the exact
        // query-time facets the engine-query filter vocabulary enumerates
        // (statuses/plan_tiers, tested data-driven in engine-query::filter).
        // engine-graph cannot depend on engine-query (that would be circular),
        // so the end-to-end assertion lands on the node facets the vocabulary
        // reads, proving honest extraction from real files through ingest.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::write(
            root.join(".vault/adr/2026-06-14-x-adr.md"),
            "---\ntags:\n  - '#adr'\n  - '#x'\n---\n\n# `x` adr: `topic` | (**status:** `accepted`)\n\nbody\n",
        )
        .unwrap();
        std::fs::write(
            root.join(".vault/plan/2026-06-14-x-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#x'\ntier: L3\n---\n\n- [ ] `S01` - do a thing; `src/a.rs`.\n",
        )
        .unwrap();
        let store = engine_store::Store::open(&root.join(".vault")).unwrap();
        let (graph, _) = index_worktree(root, &scope(), &store, 0).unwrap();

        let adr = graph
            .node(&node_id(&CanonicalKey::Document {
                stem: "2026-06-14-x-adr",
            }))
            .expect("adr node ingested");
        assert_eq!(
            adr.status.as_deref(),
            Some("accepted"),
            "ADR carries its real H1 status"
        );
        assert_eq!(adr.tier, None, "an ADR carries no plan tier");

        let plan = graph
            .node(&node_id(&CanonicalKey::Document {
                stem: "2026-06-14-x-plan",
            }))
            .expect("plan node ingested");
        assert_eq!(plan.tier.as_deref(), Some("L3"), "plan carries its tier");
        assert_eq!(plan.status, None, "a plan carries no ADR status");
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
