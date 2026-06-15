//! Blob-true as-of reconstruction (engine-spec D7.3, contract §5): the
//! graph as it stood at T, rebuilt from document blobs **as committed at
//! T** via the git object DB — never from the present working tree. The
//! playhead's progress rings are time-accurate.
//!
//! Historical views serve declared + structural + temporal tiers only; the
//! semantic tier is present-only by design (D3.5) and is excluded here by
//! construction — nothing in this module can mint a semantic edge.

use std::path::Path;

use engine_model::{
    CanonicalKey, Facet, Node, NodeKind, Presence, ResolutionState, ScopeRef, Timestamp, node_id,
};
use ingest_struct::extract::MentionKind;

use crate::graph::{EdgeAttrs, LinkageGraph};
use crate::index::{IndexError, Result, structural_edge_for};

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
    let repo = gix::open(repo_dir).map_err(|e| IndexError::Git(format!("open: {e}")))?;
    let (commit_id, interpretation) = resolve_commit(&repo, reference)?;
    let commit = repo
        .find_commit(commit_id)
        .map_err(|e| IndexError::Git(e.to_string()))?;
    let tree = commit.tree().map_err(|e| IndexError::Git(e.to_string()))?;

    // Inventory of every path in the committed tree — the resolution
    // universe at T.
    let mut inventory: Vec<String> = Vec::new();
    let mut vault_docs: Vec<String> = Vec::new();
    for entry in tree
        .traverse()
        .breadthfirst
        .files()
        .map_err(|e| IndexError::Git(e.to_string()))?
    {
        let path = entry.filepath.to_string();
        if path.starts_with(".vault/") && path.ends_with(".md") {
            vault_docs.push(path.clone());
        }
        inventory.push(path);
    }
    inventory.sort();
    vault_docs.sort();

    // Resolve the sha, then RELEASE the gix repo handle before the declared-tier
    // ingestion below shells `vaultspec-core vault graph --ref <sha>` against the
    // SAME `.git` — releasing our reader handle before spawning a subprocess that
    // reopens the object DB is sound hygiene on Windows. Blob reads below use
    // `repo_dir` (their own short-lived handles), not `repo`.
    let resolved_sha = commit_id.to_string();
    drop(tree);
    drop(commit);
    drop(repo);

    let mut graph = LinkageGraph::new();
    for doc_path in &vault_docs {
        let body = ingest_struct::reader::read_from_ref(repo_dir, &resolved_sha, doc_path)?;
        let stem = doc_path
            .rsplit('/')
            .next()
            .unwrap_or(doc_path)
            .trim_end_matches(".md")
            .to_string();
        let doc_type = crate::index::doc_type_of(doc_path);
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
            }),
            feature_tags: crate::index::frontmatter_feature_tags(&body.text),
            // Status/tier facets are blob-true here too: both derive from
            // frontmatter/H1 the historical view reads, so an as-of snapshot
            // carries the ADR status and plan tier AS THEY STOOD at that commit
            // (dashboard-pipeline-wire W01).
            status: crate::index::frontmatter_adr_status(&body.text),
            tier: crate::index::frontmatter_plan_tier(&body.text),
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

        // Tree-based resolution at T (v1 as-of semantics): paths and wiki
        // stems against the committed inventory; step ids and symbols mark
        // STALE — verifying them blob-true needs plan/code blob scans,
        // a deliberate v1 bound recorded in the step record.
        let mentions = ingest_struct::extract::extract(&body.text);
        let mut by_id: std::collections::BTreeMap<
            String,
            (engine_model::Edge, u32, Option<String>),
        > = std::collections::BTreeMap::new();
        for mention in mentions {
            let (state, target) = match &mention.kind {
                MentionKind::Path(p) => {
                    if inventory.binary_search(p).is_ok() {
                        (ResolutionState::Resolved, Some(p.clone()))
                    } else {
                        let basename = p.rsplit('/').next().unwrap_or(p);
                        match inventory
                            .iter()
                            .find(|i| i.rsplit('/').next() == Some(basename))
                        {
                            Some(found) => (ResolutionState::Stale, Some(found.clone())),
                            None => (ResolutionState::Broken, None),
                        }
                    }
                }
                MentionKind::WikiLink(stem) => {
                    let filename = format!("{stem}.md");
                    match inventory
                        .iter()
                        .find(|i| i.rsplit('/').next() == Some(filename.as_str()))
                    {
                        Some(found) => (ResolutionState::Resolved, Some(found.clone())),
                        None => (ResolutionState::Broken, None),
                    }
                }
                // v1 as-of bound: undecidable without blob scans → stale.
                MentionKind::StepId(_) | MentionKind::Symbol(_) => (ResolutionState::Stale, None),
            };
            let resolved = ingest_struct::resolve::ResolvedMention {
                mention,
                state,
                target,
            };
            let resolved_target = resolved.target.clone();
            let edge = structural_edge_for(&stem, &body.blob_hash, &resolved, scope, observed_at);
            by_id
                .entry(edge.id.0.clone())
                .and_modify(|(_, c, _)| *c += 1)
                .or_insert((edge, 1, resolved_target));
        }
        for (_, (edge, multiplicity, resolved_target)) in by_id {
            crate::edges::ingest(
                &mut graph,
                edge,
                EdgeAttrs {
                    multiplicity,
                    resolved_target,
                    ..Default::default()
                },
            )?;
        }
    }

    // Declared tier AT the resolved commit (core 0.1.31 `vault graph --ref`):
    // the as-of snapshot now carries core's authored cross-references as they
    // stood at T, not only the structural + temporal tiers reconstructed from
    // blobs above — closing the historical declared-tier gap. Best-effort: an
    // old core, a non-vaultspec dir, or an unresolvable ref leaves the
    // historical declared tier simply absent, never a panic.
    let _ = crate::index::ingest_core_graph(
        &mut graph,
        repo_dir,
        scope,
        observed_at,
        Some(&resolved_sha),
    );

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
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(root.join("src/lib.rs"), "// v1\n").unwrap();
        std::fs::write(
            root.join(".vault/plan/2026-06-12-f-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#f'\n---\n\nMentions `src/lib.rs`.\n",
        )
        .unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "T1"]);
        git(root, &["tag", "t1"]);

        // Present tree diverges: lib.rs deleted, doc now mentions a new file.
        std::fs::remove_file(root.join("src/lib.rs")).unwrap();
        std::fs::write(
            root.join(".vault/plan/2026-06-12-f-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#f'\n---\n\nMentions `src/new.rs`.\n",
        )
        .unwrap();

        let scope = ScopeRef::Ref { name: "t1".into() };
        let graph = asof_graph_resolved(root, "t1", &scope, 0).unwrap().graph;

        // Blob-true: the doc node carries the T1 blob and the T1 mention,
        // resolved against the T1 tree (where src/lib.rs exists). Target
        // nodes are not materialized at ingestion (consistent with the
        // present-tree index path; node materialization is a P08 concern).
        assert_eq!(graph.node_count(), 1, "the document node");
        let edge = graph.edges().next().expect("structural edge at T1");
        assert_eq!(edge.edge.state, Some(ResolutionState::Resolved));
        assert!(
            edge.edge.dst.0.contains("src/lib.rs"),
            "the T1 mention, not the present one: {}",
            edge.edge.dst.0
        );

        // Semantic tier excluded by construction: no semantic edges exist.
        assert!(
            graph
                .edges()
                .all(|s| s.edge.tier != engine_model::Tier::Semantic)
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
