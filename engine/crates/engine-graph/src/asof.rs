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

/// Rebuild the structural slice of the graph as committed at `reference`
/// (a ref name or commit sha).
pub fn asof_graph(
    repo_dir: &Path,
    reference: &str,
    scope: &ScopeRef,
    observed_at: Timestamp,
) -> Result<LinkageGraph> {
    let repo = gix::open(repo_dir).map_err(|e| IndexError::Git(format!("open: {e}")))?;
    let commit_id = repo
        .rev_parse_single(reference)
        .map_err(|e| IndexError::Git(format!("rev-parse {reference}: {e}")))?;
    let commit = repo
        .find_commit(commit_id.detach())
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

    let mut graph = LinkageGraph::new();
    for doc_path in &vault_docs {
        let body = ingest_struct::reader::read_from_ref(repo_dir, reference, doc_path)?;
        let stem = doc_path
            .rsplit('/')
            .next()
            .unwrap_or(doc_path)
            .trim_end_matches(".md")
            .to_string();
        graph.upsert_node(Node {
            id: node_id(&CanonicalKey::Document { stem: &stem }),
            kind: NodeKind::Document,
            key: stem.clone(),
            title: None,
            feature_tags: crate::index::frontmatter_feature_tags(&body.text),
            facets: vec![Facet {
                scope: scope.clone(),
                presence: Presence::Exists,
                content_hash: Some(body.blob_hash.clone()),
                lifecycle: None,
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
    Ok(graph)
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
        let graph = asof_graph(root, "t1", &scope, 0).unwrap();

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
}
