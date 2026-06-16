//! Commit-log walk (engine-spec §2.4 temporal ingestion source).
//!
//! Produces the raw temporal event records (timestamp, kind, ref, touched
//! paths) the correlation rules (D3.4) and the event log consume. Read-only
//! over the object DB, via gix (D2.5).

use crate::workspace::{GitError, Result, Workspace};

/// How a path changed between a commit and its first parent (contract §5
/// vault-lifecycle sourcing): the per-path kind the commit walk previously
/// discarded. `gix`'s diff already computes these; carrying them lets the
/// event sourcer distinguish a vault-doc *creation* (Added) or *archival*
/// (a rename into `.vault/archive/`, or a deletion) from a plain modification.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChangeKind {
    /// The path was newly added at this commit.
    Added,
    /// The path was deleted at this commit.
    Deleted,
    /// The path's content (or mode) changed in place.
    Modified,
    /// The path was renamed/copied from `from` to its current location.
    Renamed {
        /// The source (old) path of the rename.
        from: String,
    },
}

/// One path touched by a commit, with the kind of change (additive to the
/// flat `touched_paths`): `path` is the post-commit location, `kind` names how
/// it changed. The two surfaces stay in sync — `touched_paths` is the `path`
/// of every `PathChange`, in the same order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PathChange {
    /// Repo-relative path touched (the destination, for a rename).
    pub path: String,
    /// How the path changed relative to the first parent.
    pub kind: ChangeKind,
}

/// One commit observed on a ref, with the paths it touched.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitEvent {
    pub sha: String,
    /// The commit's subject — the first line of the commit message, trimmed
    /// (status-overview ADR: the "what has been committed?" datum). gix's
    /// `message().summary()` already isolates the summary line; carrying it
    /// here closes the previously-deferred subject gap the event sourcer
    /// flagged (`commits lack the subject (a git lookup)`). Read-only over the
    /// object DB; never a write.
    pub subject: String,
    /// Commit time in **milliseconds** since the Unix epoch — the
    /// engine-wide `engine_model::Timestamp` unit. gix reports seconds;
    /// the conversion happens here, at the seam, so no downstream surface
    /// ever sees mixed units (audit W01P02-102).
    pub ts: engine_model::Timestamp,
    /// Event kind; always `commit` for this source (contract §5 kinds).
    pub kind: &'static str,
    /// The ref the walk started from (short name).
    pub git_ref: String,
    /// Repo-relative paths touched relative to the first parent.
    pub touched_paths: Vec<String>,
    /// The same touched paths carrying their per-path change kind (additive
    /// to `touched_paths`, same order). Lets a consumer source the
    /// vault-lifecycle event kind (created / archived) the flat path list
    /// cannot express.
    pub changes: Vec<PathChange>,
}

/// Walk `ref_name` from its tip, newest first, up to `limit` commits.
pub fn walk(workspace: &Workspace, ref_name: &str, limit: usize) -> Result<Vec<CommitEvent>> {
    let repo = workspace.open()?;
    let tip = match repo.rev_parse_single(ref_name) {
        Ok(tip) => tip,
        Err(e) => {
            // An UNBORN HEAD — a branch with no commits yet — is an empty
            // history, not a failure: there are simply zero events. This is the
            // common state of a freshly-created worktree (e.g. a graphite stack
            // branch before its first commit), where the events endpoint walks
            // "HEAD" and previously 400'd (sweep LOW, 2026-06-13). A genuinely
            // unknown ref (typo, deleted branch) on a born HEAD still fails loud.
            if repo.head().is_ok_and(|h| h.is_unborn()) {
                return Ok(Vec::new());
            }
            return Err(GitError::Other(format!("rev-parse {ref_name}: {e}")));
        }
    };

    let mut out = Vec::new();
    let walk = repo
        .rev_walk([tip.detach()])
        .all()
        .map_err(|e| GitError::Other(e.to_string()))?;
    for info in walk.take(limit) {
        let info = info.map_err(|e| GitError::Other(e.to_string()))?;
        let commit = info.object().map_err(|e| GitError::Other(e.to_string()))?;
        // gix reports seconds; engine_model::Timestamp is milliseconds.
        // Convert at the seam (audit W01P02-102).
        let ts = commit
            .time()
            .map_err(|e| GitError::Other(e.to_string()))?
            .seconds
            * 1000;
        // The commit subject: gix's `summary()` isolates the first line of the
        // message (the conventional subject), already trimmed of surrounding
        // whitespace. An empty/whitespace-only message yields an empty subject
        // rather than a failure — the commit is still a real event.
        let subject = commit
            .message()
            .map(|m| m.summary().to_string())
            .unwrap_or_default();
        let changes = touched_changes(&repo, &commit)?;
        // `touched_paths` stays the flat path list (back-compat): the `path`
        // of every change, in the same order.
        let touched_paths = changes.iter().map(|c| c.path.clone()).collect();
        out.push(CommitEvent {
            sha: commit.id.to_string(),
            subject,
            ts,
            kind: "commit",
            git_ref: ref_name.to_string(),
            touched_paths,
            changes,
        });
    }
    Ok(out)
}

/// Paths changed between a commit and its first parent (all paths for a
/// root commit), each carrying its change kind. `gix`'s tree diff already
/// classifies every change as Addition / Deletion / Modification / Rewrite;
/// this preserves that classification instead of flattening to a bare path.
fn touched_changes(repo: &gix::Repository, commit: &gix::Commit<'_>) -> Result<Vec<PathChange>> {
    use gix::object::tree::diff::Change;

    let tree = commit.tree().map_err(|e| GitError::Other(e.to_string()))?;
    let parent_tree = match commit.parent_ids().next() {
        Some(parent_id) => repo
            .find_commit(parent_id)
            .map_err(|e| GitError::Other(e.to_string()))?
            .tree()
            .map_err(|e| GitError::Other(e.to_string()))?,
        None => repo.empty_tree(),
    };

    let mut changes = Vec::new();
    let mut platform = parent_tree
        .changes()
        .map_err(|e| GitError::Other(e.to_string()))?;
    platform
        .for_each_to_obtain_tree(&tree, |change| {
            // Tree (directory) entries are structure, not touched files.
            if !change.entry_mode().is_tree() {
                let path = change.location().to_string();
                let kind = match &change {
                    Change::Addition { .. } => ChangeKind::Added,
                    Change::Deletion { .. } => ChangeKind::Deleted,
                    Change::Modification { .. } => ChangeKind::Modified,
                    Change::Rewrite {
                        source_location, ..
                    } => ChangeKind::Renamed {
                        from: source_location.to_string(),
                    },
                };
                changes.push(PathChange { path, kind });
            }
            Ok::<_, std::convert::Infallible>(std::ops::ControlFlow::Continue(()))
        })
        .map_err(|e| GitError::Other(e.to_string()))?;
    changes.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(changes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::fixtures::*;

    #[test]
    fn walk_yields_commits_newest_first_with_touched_paths() {
        let dir = tempfile::tempdir().unwrap();
        repo_with_commit(dir.path()); // commit 1: README.md
        std::fs::create_dir_all(dir.path().join("src")).unwrap();
        std::fs::write(dir.path().join("src/lib.rs"), "// lib\n").unwrap();
        git(dir.path(), &["add", "."]);
        git(dir.path(), &["commit", "-m", "add lib"]); // commit 2: src/lib.rs
        std::fs::write(dir.path().join("README.md"), "updated\n").unwrap();
        std::fs::write(dir.path().join("src/lib.rs"), "// lib v2\n").unwrap();
        git(dir.path(), &["add", "."]);
        git(dir.path(), &["commit", "-m", "touch both"]); // commit 3: both

        let ws = Workspace::discover(dir.path()).unwrap();
        let events = walk(&ws, "main", 100).unwrap();
        assert_eq!(events.len(), 3);
        assert!(events.iter().all(|e| e.kind == "commit"));
        assert!(events.iter().all(|e| e.git_ref == "main"));
        // Millisecond scale (audit W01P02-102): a 2026 commit in seconds
        // would be ~1.7e9; in milliseconds it must exceed 1e12.
        assert!(events.iter().all(|e| e.ts > 1_000_000_000_000));

        // Newest first.
        assert_eq!(events[0].touched_paths, vec!["README.md", "src/lib.rs"]);
        assert_eq!(events[1].touched_paths, vec!["src/lib.rs"]);
        // Root commit reports its full tree.
        assert_eq!(events[2].touched_paths, vec!["README.md"]);

        // Each commit carries its subject (the first message line),
        // newest-first (status-overview ADR: the "what has been committed?"
        // datum). The root commit's subject is the fixture's initial message.
        assert_eq!(events[0].subject, "touch both");
        assert_eq!(events[1].subject, "add lib");

        // `changes` mirrors `touched_paths` in the same order, carrying the
        // per-path kind: commit 3 modified both; commit 2 added src/lib.rs;
        // the root commit added README.md.
        assert_eq!(
            events[0].changes,
            vec![
                PathChange {
                    path: "README.md".into(),
                    kind: ChangeKind::Modified
                },
                PathChange {
                    path: "src/lib.rs".into(),
                    kind: ChangeKind::Modified
                },
            ]
        );
        assert_eq!(
            events[1].changes,
            vec![PathChange {
                path: "src/lib.rs".into(),
                kind: ChangeKind::Added
            }]
        );
        assert_eq!(
            events[2].changes,
            vec![PathChange {
                path: "README.md".into(),
                kind: ChangeKind::Added
            }]
        );
        // `touched_paths` is exactly the `path` of every change.
        for e in &events {
            let from_changes: Vec<String> = e.changes.iter().map(|c| c.path.clone()).collect();
            assert_eq!(e.touched_paths, from_changes);
        }
    }

    #[test]
    fn change_kinds_distinguish_add_delete_and_rename() {
        // gix's diff classifies every change; the walk must preserve Added,
        // Deleted, and a Rename's source (the vault-lifecycle sourcing depends
        // on it: a delete or a rename into `.vault/archive/` is an archival).
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-b", "main", "."]);
        std::fs::write(root.join("a.txt"), "a\n").unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "add a"]);

        // Rename a.txt -> b.txt (a pure rename; git detects it).
        git(root, &["mv", "a.txt", "b.txt"]);
        git(root, &["commit", "-m", "rename a to b"]);

        // Delete b.txt.
        std::fs::remove_file(root.join("b.txt")).unwrap();
        git(root, &["add", "-A"]);
        git(root, &["commit", "-m", "delete b"]);

        let ws = Workspace::discover(root).unwrap();
        let events = walk(&ws, "main", 100).unwrap();
        assert_eq!(events.len(), 3);

        // Newest first: delete, then rename, then add.
        assert_eq!(
            events[0].changes,
            vec![PathChange {
                path: "b.txt".into(),
                kind: ChangeKind::Deleted
            }]
        );
        assert_eq!(
            events[1].changes,
            vec![PathChange {
                path: "b.txt".into(),
                kind: ChangeKind::Renamed {
                    from: "a.txt".into()
                }
            }],
            "a rename preserves its source path"
        );
        assert_eq!(
            events[2].changes,
            vec![PathChange {
                path: "a.txt".into(),
                kind: ChangeKind::Added
            }]
        );
    }

    #[test]
    fn subject_is_the_first_message_line_only() {
        // status-overview ADR: the commit subject is the first line of the
        // message (the summary), not the body. A multi-line commit message
        // must surface only its subject line, trimmed.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-b", "main", "."]);
        std::fs::write(root.join("a.txt"), "a\n").unwrap();
        git(root, &["add", "."]);
        git(
            root,
            &[
                "commit",
                "-m",
                "feat: the subject line",
                "-m",
                "A body paragraph that must not leak into the subject.",
            ],
        );

        let ws = Workspace::discover(root).unwrap();
        let events = walk(&ws, "main", 10).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(
            events[0].subject, "feat: the subject line",
            "the subject is the first message line, never the body"
        );
    }

    #[test]
    fn limit_caps_the_walk() {
        let dir = tempfile::tempdir().unwrap();
        repo_with_commit(dir.path());
        std::fs::write(dir.path().join("a.txt"), "a\n").unwrap();
        git(dir.path(), &["add", "."]);
        git(dir.path(), &["commit", "-m", "second"]);

        let ws = Workspace::discover(dir.path()).unwrap();
        let events = walk(&ws, "main", 1).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].touched_paths, vec!["a.txt"]);
    }

    #[test]
    fn unknown_ref_fails_loud() {
        let dir = tempfile::tempdir().unwrap();
        repo_with_commit(dir.path());
        let ws = Workspace::discover(dir.path()).unwrap();
        assert!(walk(&ws, "no-such-branch", 10).is_err());
    }

    #[test]
    fn unborn_head_is_empty_history_not_an_error() {
        // A repo with NO commits (unborn HEAD) — the state of a freshly-created
        // worktree, e.g. a graphite stack branch before its first commit. The
        // events endpoint walks "HEAD"; that must be an empty event log, not a
        // 400 (sweep LOW, 2026-06-13).
        let dir = tempfile::tempdir().unwrap();
        git(dir.path(), &["init", "-b", "main", "."]);
        let ws = Workspace::discover(dir.path()).unwrap();
        let events = walk(&ws, "HEAD", 100).unwrap();
        assert!(events.is_empty(), "unborn HEAD yields zero events");
    }
}
