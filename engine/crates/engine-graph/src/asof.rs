//! Blob-true as-of reconstruction (engine-spec D7.3, contract §5): the
//! graph as it stood at T, rebuilt from document blobs **as committed at
//! T** via the git object DB — never from the present working tree. The
//! playhead's progress rings are time-accurate.
//!
//! Historical views serve declared + structural + temporal tiers only; the
//! semantic AVAILABILITY tier is present-only by design (D3.5). Semantic is
//! not a graph tier at all, so nothing in this module can mint a semantic edge
//! by construction.

use std::path::Path;

use engine_model::{
    CanonicalKey, Facet, Node, NodeId, NodeKind, Presence, ScopeRef, Timestamp, node_id,
};

use crate::graph::LinkageGraph;
use crate::index::{IndexError, Result};

/// How a `t=<ts|sha>` token was interpreted (ADD-901): the response echoes
/// this so a client never has to guess whether its token was read as a git
/// revision or as a millisecond timestamp — the two can collide (an all-digit
/// sha-prefix vs an epoch-ms value), so the engine's chosen reading is part of
/// the contract surface.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Interpretation {
    /// Parsed as a git commit-ish (ref name or sha).
    Revision,
    /// Parsed as a millisecond Unix timestamp, resolved to the latest commit
    /// at-or-before T.
    Timestamp,
}

/// An as-of rebuild plus the resolution facts the response must echo
/// (ADD-901): the graph as it stood at T, the 40-char `resolved_sha` the
/// token resolved to, and the `interpretation` the engine chose.
#[derive(Debug)]
pub struct AsofGraph {
    pub graph: LinkageGraph,
    pub resolved_sha: String,
    pub interpretation: Interpretation,
}

/// Resolve a time-travel token (contract §5 `t=<ts|sha>`): revision-first,
/// then — when the token is all digits — a millisecond timestamp resolved
/// to the latest commit at-or-before T on the scope ref (addendum S01).
/// Returns the resolved commit AND how the token was read (ADD-901).
fn resolve_commit(
    repo: &gix::Repository,
    reference: &str,
) -> Result<(gix::ObjectId, Interpretation)> {
    match repo.rev_parse_single(reference) {
        Ok(id) => Ok((id.detach(), Interpretation::Revision)),
        Err(rev_err) => {
            // Millisecond-timestamp fallback: only for all-digit tokens —
            // anything else is an invalid revision. The raw gix error is
            // DROPPED on purpose: it embeds the build user's home dir and the
            // gix source file:line, which must never reach a wire client
            // (adversarial finding, 2026-06-13). The message names both forms
            // the contract grants (`t=<ts|sha>`).
            let Ok(t) = reference.parse::<i64>() else {
                let _ = rev_err;
                return Err(IndexError::Revision(format!(
                    "invalid revision `{reference}`: expected a commit-ish \
                     (ref name or sha) or a millisecond timestamp"
                )));
            };
            let tip = repo
                .rev_parse_single("HEAD")
                .map_err(|e| IndexError::Git(format!("rev-parse HEAD: {e}")))?;
            // Commit-time order (NEWEST first), not the default topological
            // (breadth-first) order: only a commit-time-sorted walk makes the
            // first commit at-or-before T provably the LATEST such commit when
            // history is non-linear (merges, committer-clock skew). The
            // first `ts_ms <= t` in this order is the answer (addendum S01,
            // review H1).
            use gix::revision::walk::Sorting;
            use gix::traverse::commit::simple::CommitTimeOrder;
            let walk = repo
                .rev_walk([tip.detach()])
                .sorting(Sorting::ByCommitTime(CommitTimeOrder::NewestFirst))
                .all()
                .map_err(|e| IndexError::Git(e.to_string()))?;
            for info in walk {
                let info = info.map_err(|e| IndexError::Git(e.to_string()))?;
                let commit = info.object().map_err(|e| IndexError::Git(e.to_string()))?;
                let ts_ms = commit
                    .time()
                    .map_err(|e| IndexError::Git(e.to_string()))?
                    .seconds
                    * 1000;
                if ts_ms <= t {
                    return Ok((commit.id, Interpretation::Timestamp));
                }
            }
            Err(IndexError::Revision(format!(
                "timestamp {t} predates the root commit on the scope ref"
            )))
        }
    }
}

/// Resolve a time-travel token to its commit sha WITHOUT building the graph:
/// open the repo, resolve the revision (or ms-timestamp), return the 40-char
/// sha. Cheap — no tree traversal, no blob reads, no core subprocess. Lets
/// `/graph/diff` short-circuit when `from` and `to` name the SAME commit
/// (e.g. `HEAD` vs its sha), skipping two full as-of rebuilds that on a large
/// corpus each cost ~20s (sweep HIGH, 2026-06-13).
pub fn resolve_ref(repo_dir: &Path, reference: &str) -> Result<String> {
    let repo = gix::open(repo_dir).map_err(|e| IndexError::Git(format!("open: {e}")))?;
    Ok(resolve_commit(&repo, reference)?.0.to_string())
}

/// Like [`resolve_ref`] but ALSO returns how the token was read (ADD-901). Cheap —
/// no tree traversal, no blob reads, no core subprocess. The serve layer resolves
/// `(sha, interpretation)` per request from THIS request's token, then fetches the
/// historical graph from a by-sha cache: that keeps the `interpretation` echo
/// correct per token FORM even when two tokens (an all-digit sha-prefix and an
/// epoch-ms timestamp) resolve to the same commit — they share the cached graph
/// but each echoes its own reading.
pub fn resolve_ref_interpreted(
    repo_dir: &Path,
    reference: &str,
) -> Result<(String, Interpretation)> {
    let repo = gix::open(repo_dir).map_err(|e| IndexError::Git(format!("open: {e}")))?;
    let (id, interpretation) = resolve_commit(&repo, reference)?;
    Ok((id.to_string(), interpretation))
}

/// Rebuild the as-of graph AND return the resolution facts the response must
/// echo (ADD-901): the resolved 40-char sha and the chosen `interpretation`
/// (revision vs ms-timestamp). The contract requires the response to echo both
/// so a client never has to re-derive how its `t` token was read.
pub fn asof_graph_resolved(
    repo_dir: &Path,
    reference: &str,
    scope: &ScopeRef,
    observed_at: Timestamp,
) -> Result<AsofGraph> {
    asof_graph_resolved_cached(repo_dir, reference, scope, observed_at, None)
}

/// Like [`asof_graph_resolved`] but accepts a pre-fetched declared-tier JSON (the
/// cacheable `vault graph --ref` payload the serve layer keys by sha in its
/// declared-graph cache). When `Some`, the declared tier is ingested from that
/// JSON instead of re-running the ~16s core subprocess — so an as-of build for a
/// recently-indexed sha (the common time-travel target, retained in the declared
/// cache) skips the subprocess. `None` runs the subprocess as before (the CLI and
/// `/graph/diff` paths, and any sha not in the cache).
pub fn asof_graph_resolved_cached(
    repo_dir: &Path,
    reference: &str,
    scope: &ScopeRef,
    observed_at: Timestamp,
    declared_json: Option<&str>,
) -> Result<AsofGraph> {
    let repo = gix::open(repo_dir).map_err(|e| IndexError::Git(format!("open: {e}")))?;
    let (commit_id, interpretation) = resolve_commit(&repo, reference)?;
    let commit = repo
        .find_commit(commit_id)
        .map_err(|e| IndexError::Git(e.to_string()))?;
    let tree = commit.tree().map_err(|e| IndexError::Git(e.to_string()))?;

    // The `.vault/` documents in the committed tree — the node set at T.
    let mut vault_docs: Vec<String> = Vec::new();
    for entry in tree
        .traverse()
        .breadthfirst
        .files()
        .map_err(|e| IndexError::Git(e.to_string()))?
    {
        let path = entry.filepath.to_string();
        if path.starts_with(".vault/") && path.ends_with(".md") {
            vault_docs.push(path);
        }
    }
    vault_docs.sort();

    // Reuse the OPEN repo + already-resolved commit tree for the per-doc blob
    // reads below. The dominant /graph/asof cost was a FRESH `gix::open` +
    // ref-resolution + tree-resolve PER DOC (`read_from_ref` × ~3135, every one
    // re-resolving the SAME sha) — tens of seconds. Sharing this tree across the
    // loop makes each read a direct tree lookup. The gix handle is still RELEASED
    // before the declared-tier `vaultspec-core vault graph --ref <sha>` subprocess
    // reopens the same `.git` object DB (sound hygiene on Windows) — but AFTER the
    // loop, not before it.
    let resolved_sha = commit_id.to_string();

    let mut graph = LinkageGraph::new();
    // index-node-exclusion ADR D1: `.vault/index` feature-index documents are
    // metanodes, never graph nodes — skip them in the blob-true replay too, and
    // prune any incident edge below.
    let mut excluded_index_ids: std::collections::HashSet<NodeId> =
        std::collections::HashSet::new();
    for doc_path in &vault_docs {
        let body = ingest_struct::reader::read_path_in_tree(&tree, &resolved_sha, doc_path)?;
        let stem = doc_path
            .rsplit('/')
            .next()
            .unwrap_or(doc_path)
            .trim_end_matches(".md")
            .to_string();
        let doc_type = crate::index::doc_type_of(doc_path);
        if doc_type.as_deref() == Some("index") {
            excluded_index_ids.insert(node_id(&CanonicalKey::Document { stem: &stem }));
            continue;
        }
        graph.upsert_node(Node {
            id: node_id(&CanonicalKey::Document { stem: &stem }),
            kind: NodeKind::Document,
            key: stem.clone(),
            title: crate::index::doc_title(&body.text),
            doc_type: doc_type.clone(),
            dates: Some(engine_model::Dates {
                created: crate::index::frontmatter_date(&body.text),
                // Blob-true historical views carry no worktree mtime.
                modified: None,
                // `stamped` (frontmatter `modified:`) IS blob-true — read from the
                // committed blob as it stood at T, so the timeline can filter by
                // the authored stamp historically even though the mtime is absent.
                stamped: crate::index::frontmatter_stamped(&body.text),
            }),
            feature_tags: crate::index::frontmatter_feature_tags(&body.text),
            // Status/tier facets are blob-true here too: both derive from
            // frontmatter/H1 the historical view reads, so an as-of snapshot
            // carries the ADR status and plan tier AS THEY STOOD at that commit
            // (dashboard-pipeline-wire W01).
            status: crate::index::frontmatter_adr_status(&body.text),
            tier: crate::index::frontmatter_plan_tier(&body.text),
            // Blob-true weight: measured on the committed body as it stood at T.
            size: Some(engine_model::DocSize::measure(&body.text)),
            facets: vec![Facet {
                scope: scope.clone(),
                presence: Presence::Exists,
                content_hash: Some(body.blob_hash.clone()),
                // Type-specific lifecycle, blob-true at T (graph-node-semantics
                // ADR): the historical playhead reads each species' state from
                // the committed blob, not the present working tree.
                lifecycle: crate::index::doc_lifecycle(doc_type.as_deref(), &body.text),
            }],
        });

        // STRICT reference-only graph (user ruling, 2026-06-28): in-body
        // `[[wiki-link]]` MENTIONS are NOT graph fact — only `related:`
        // frontmatter (the declared tier) defines the node graph. The historical
        // view therefore mints document NODES blob-true at T but no structural
        // body-mention edges, matching the live graph (the structural body-mention
        // EDGE producer was retired).
    }

    // index-node-exclusion ADR D1: drop any edge that resolved onto a skipped
    // index document, so the historical view carries no dangling index edge.
    graph.prune_edges_incident_to(&excluded_index_ids);

    // Release the shared gix handle NOW — before the declared-tier subprocess
    // reopens the same `.git` object DB (Windows hygiene). The per-doc loop above
    // is done, so the shared tree/commit/repo are no longer needed.
    drop(tree);
    drop(commit);
    drop(repo);

    // Declared tier AT the resolved commit (core 0.1.31 `vault graph --ref`):
    // the as-of snapshot now carries core's authored cross-references as they
    // stood at T, not only the structural + temporal tiers reconstructed from
    // blobs above — closing the historical declared-tier gap. Best-effort: an
    // old core, a non-vaultspec dir, or an unresolvable ref leaves the
    // historical declared tier simply absent, never a panic.
    match declared_json {
        // Cached declared JSON (keyed by this sha in the serve layer): ingest it
        // directly — no core subprocess. The blob-true structural tier above is
        // already built; this just folds in the authored declared edges.
        Some(json) => {
            let _ = crate::index::ingest_declared_from_json(&mut graph, json, scope, observed_at);
        }
        // No cache: run the read-and-infer `vault graph --ref <sha>` subprocess.
        None => {
            let _ = crate::index::ingest_core_graph(
                &mut graph,
                repo_dir,
                scope,
                observed_at,
                Some(&resolved_sha),
            );
        }
    }

    Ok(AsofGraph {
        graph,
        resolved_sha,
        interpretation,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn git(dir: &Path, args: &[&str]) {
        let output = Command::new("git")
            .current_dir(dir)
            .args(args)
            .env("GIT_AUTHOR_NAME", "f")
            .env("GIT_AUTHOR_EMAIL", "f@t")
            .env("GIT_COMMITTER_NAME", "f")
            .env("GIT_COMMITTER_EMAIL", "f@t")
            .output()
            .expect("git runs");
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn asof_reads_blobs_at_t_never_the_present_tree() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-b", "main", "."]);
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
        std::fs::write(root.join(".vault/adr/2026-06-12-old-adr.md"), "# old\n").unwrap();
        std::fs::write(
            root.join(".vault/plan/2026-06-12-f-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#f'\n---\n\nMentions [[2026-06-12-old-adr]].\n",
        )
        .unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "T1"]);
        git(root, &["tag", "t1"]);

        // Present tree diverges: the old target is deleted, doc now mentions a
        // different vault document.
        std::fs::remove_file(root.join(".vault/adr/2026-06-12-old-adr.md")).unwrap();
        std::fs::write(root.join(".vault/adr/2026-06-12-new-adr.md"), "# new\n").unwrap();
        std::fs::write(
            root.join(".vault/plan/2026-06-12-f-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#f'\n---\n\nMentions [[2026-06-12-new-adr]].\n",
        )
        .unwrap();

        let scope = ScopeRef::Ref { name: "t1".into() };
        let graph = asof_graph_resolved(root, "t1", &scope, 0).unwrap().graph;

        // Blob-true: the as-of graph is the T1 corpus — the plan and the OLD ADR
        // that existed at T1 — NOT the present tree (which deleted the old ADR and
        // added a new one). Body `[[wiki-link]]` mentions are not graphed under the
        // strict reference-only ruling, so the historical reading is proven by the
        // NODE set: reading the present tree would surface `new-adr`, never the
        // `old-adr` that only existed at T1.
        assert_eq!(
            graph.node_count(),
            2,
            "the plan and the T1 (old) ADR document nodes"
        );
        assert!(
            graph.nodes().any(|n| n.id.0.contains("2026-06-12-old-adr")),
            "the T1 corpus carries the old ADR node, not the present one"
        );
        assert!(
            graph
                .nodes()
                .all(|n| !n.id.0.contains("2026-06-12-new-adr")),
            "the present tree's new ADR never leaks into the as-of view"
        );
    }

    fn git_at(dir: &Path, epoch_secs: i64, args: &[&str]) {
        let date = format!("@{epoch_secs} +0000");
        let output = Command::new("git")
            .current_dir(dir)
            .args(args)
            .env("GIT_AUTHOR_NAME", "f")
            .env("GIT_AUTHOR_EMAIL", "f@t")
            .env("GIT_COMMITTER_NAME", "f")
            .env("GIT_COMMITTER_EMAIL", "f@t")
            .env("GIT_AUTHOR_DATE", &date)
            .env("GIT_COMMITTER_DATE", &date)
            .output()
            .expect("git runs");
        assert!(
            output.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn rev_parse(dir: &Path, rev: &str) -> String {
        let out = Command::new("git")
            .current_dir(dir)
            .args(["rev-parse", rev])
            .output()
            .expect("git runs");
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    }

    #[test]
    fn ms_timestamp_resolves_the_latest_commit_not_the_first_in_topology() {
        // Regression for review H1: on non-linear history, breadth-first
        // (topological) order can surface an OLDER commit before a NEWER one
        // that is also <= T. The resolver must return the LATEST commit at or
        // before T, which only a commit-time-ordered walk guarantees.
        //
        // History (committer times in seconds; M's FIRST parent is B):
        //     A(100) ── B(200) ───────── M(500)   [main]
        //        \                       /
        //         ────────── C(400) ────         [feature, off A]
        //
        // Breadth-first from M visits B(200) before C(400) (first-parent
        // first), so the old code returned B for any T in [200,400). The
        // correct answer for T=450 is C(400).
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-b", "main", "."]);
        git_at(root, 1_000_000_100, &["commit", "--allow-empty", "-m", "A"]);
        let a = rev_parse(root, "HEAD");
        git_at(root, 1_000_000_200, &["commit", "--allow-empty", "-m", "B"]);
        let b = rev_parse(root, "HEAD");
        git(root, &["checkout", "-b", "feature", &a]);
        git_at(root, 1_000_000_400, &["commit", "--allow-empty", "-m", "C"]);
        let c = rev_parse(root, "HEAD");
        git(root, &["checkout", "main"]);
        git_at(
            root,
            1_000_000_500,
            &["merge", "--no-ff", "feature", "-m", "M"],
        );
        let m = rev_parse(root, "HEAD");

        let repo = gix::open(root).unwrap();

        // T = 450s (ms): latest commit at-or-before is C(400), NOT B(200).
        let (resolved, interp) = resolve_commit(&repo, "1000000450000").unwrap();
        assert_eq!(resolved.to_string(), c, "must pick C(400), not B(200)");
        assert_eq!(
            interp,
            Interpretation::Timestamp,
            "an all-digit epoch-ms token reads as a timestamp"
        );

        // T between B and C resolves B; T at/after M resolves M (sanity).
        assert_eq!(
            resolve_commit(&repo, "1000000300000")
                .unwrap()
                .0
                .to_string(),
            b
        );
        assert_eq!(
            resolve_commit(&repo, "1000000500000")
                .unwrap()
                .0
                .to_string(),
            m
        );

        // A real ref/sha reads as a revision, never a timestamp.
        let (_, head_interp) = resolve_commit(&repo, "HEAD").unwrap();
        assert_eq!(head_interp, Interpretation::Revision);
        let (_, sha_interp) = resolve_commit(&repo, &m).unwrap();
        assert_eq!(sha_interp, Interpretation::Revision, "a sha is a revision");

        // A timestamp before the root commit errors, never an empty graph —
        // and as a leak-free `Revision` error naming the REAL cause, so the API
        // boundary echoes it instead of the self-contradicting "expected a
        // millisecond timestamp" fallback (sweep LOW, 2026-06-13).
        let predates = resolve_commit(&repo, "1000000099000").unwrap_err();
        assert!(
            matches!(&predates, IndexError::Revision(m) if m.contains("predates the root commit")),
            "out-of-range timestamp is a precise Revision error: {predates:?}"
        );

        // A non-numeric unknown revision is ALSO a leak-free Revision error
        // (the generic message), never a raw gix string that leaks build paths.
        let bad = resolve_commit(&repo, "no-such-ref").unwrap_err();
        assert!(
            matches!(&bad, IndexError::Revision(m) if m.contains("expected a commit-ish")),
            "unparseable token is a leak-free Revision error: {bad:?}"
        );
    }
}
