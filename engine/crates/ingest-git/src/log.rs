//! Commit-log walk (engine-spec §2.4 temporal ingestion source).
//!
//! Produces the raw temporal event records (timestamp, kind, ref, touched
//! paths) the correlation rules (D3.4) and the event log consume. Read-only
//! over the object DB, via gix (D2.5).

use crate::workspace::{GitError, Result, Workspace};

/// One commit observed on a ref, with the paths it touched.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitEvent {
    pub sha: String,
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
}

/// Walk `ref_name` from its tip, newest first, up to `limit` commits.
pub fn walk(workspace: &Workspace, ref_name: &str, limit: usize) -> Result<Vec<CommitEvent>> {
    let repo = workspace.open()?;
    let tip = repo
        .rev_parse_single(ref_name)
        .map_err(|e| GitError::Other(format!("rev-parse {ref_name}: {e}")))?;

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
        let touched_paths = touched_paths(&repo, &commit)?;
        out.push(CommitEvent {
            sha: commit.id.to_string(),
            ts,
            kind: "commit",
            git_ref: ref_name.to_string(),
            touched_paths,
        });
    }
    Ok(out)
}

/// Paths changed between a commit and its first parent (all paths for a
/// root commit).
fn touched_paths(repo: &gix::Repository, commit: &gix::Commit<'_>) -> Result<Vec<String>> {
    let tree = commit.tree().map_err(|e| GitError::Other(e.to_string()))?;
    let parent_tree = match commit.parent_ids().next() {
        Some(parent_id) => repo
            .find_commit(parent_id)
            .map_err(|e| GitError::Other(e.to_string()))?
            .tree()
            .map_err(|e| GitError::Other(e.to_string()))?,
        None => repo.empty_tree(),
    };

    let mut paths = Vec::new();
    let mut platform = parent_tree
        .changes()
        .map_err(|e| GitError::Other(e.to_string()))?;
    platform
        .for_each_to_obtain_tree(&tree, |change| {
            // Tree (directory) entries are structure, not touched files.
            if !change.entry_mode().is_tree() {
                paths.push(change.location().to_string());
            }
            Ok::<_, std::convert::Infallible>(std::ops::ControlFlow::Continue(()))
        })
        .map_err(|e| GitError::Other(e.to_string()))?;
    paths.sort();
    Ok(paths)
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
}
