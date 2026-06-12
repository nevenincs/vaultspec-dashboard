//! Worktree enumeration (engine-spec §2.2).
//!
//! Worktrees are the privileged scopes: the local, disk-persisted
//! development environments where structural resolution has a working tree
//! to resolve against (all four linkage tiers, D2.2). Each worktree is
//! (checkout path, HEAD ref, dirty state).

use std::path::PathBuf;

use crate::workspace::{GitError, Result, Workspace};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorktreeInfo {
    /// Checkout path (worktree root).
    pub path: PathBuf,
    /// Symbolic HEAD ref name (e.g. `refs/heads/main`); `None` if detached.
    pub head_ref: Option<String>,
    /// Working tree differs from HEAD (tracked changes or untracked files).
    pub dirty: bool,
    /// True for the repository's main checkout, false for linked worktrees.
    pub is_main: bool,
}

/// Enumerate every worktree of the workspace: the main checkout plus all
/// linked worktrees.
pub fn enumerate(workspace: &Workspace) -> Result<Vec<WorktreeInfo>> {
    let repo = workspace.open()?;
    let mut out = Vec::new();

    if let Some(workdir) = repo.workdir() {
        out.push(inspect(&repo, workdir.to_path_buf(), true)?);
    }
    for proxy in repo
        .worktrees()
        .map_err(|e| GitError::Other(e.to_string()))?
    {
        let Ok(wt_repo) = proxy
            .clone()
            .into_repo_with_possibly_inaccessible_worktree()
        else {
            continue; // pruned or inaccessible worktree: skip, not fatal
        };
        let Some(workdir) = wt_repo.workdir() else {
            continue;
        };
        let workdir = workdir.to_path_buf();
        out.push(inspect(&wt_repo, workdir, false)?);
    }
    Ok(out)
}

fn inspect(repo: &gix::Repository, path: PathBuf, is_main: bool) -> Result<WorktreeInfo> {
    let head_ref = repo
        .head_name()
        .map_err(|e| GitError::Other(e.to_string()))?
        .map(|name| name.as_bstr().to_string());
    // `Repository::is_dirty()` excludes untracked files, but an untracked
    // vault document is exactly the kind of working-tree divergence the
    // landscape must report — use the status iterator, which includes them.
    let dirty = {
        let status = repo
            .status(gix::progress::Discard)
            .map_err(|e| GitError::Other(e.to_string()))?;
        let mut items = status
            .into_iter(None)
            .map_err(|e| GitError::Other(e.to_string()))?;
        items.next().is_some()
    };
    let path = std::fs::canonicalize(&path).unwrap_or(path);
    Ok(WorktreeInfo {
        path,
        head_ref,
        dirty,
        is_main,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::fixtures::*;

    #[test]
    fn enumerates_main_and_linked_worktrees_with_head_and_dirty_state() {
        let dir = tempfile::tempdir().unwrap();
        let main = dir.path().join("main");
        std::fs::create_dir_all(&main).unwrap();
        repo_with_commit(&main);
        let feature = dir.path().join("feature-x");
        git(
            &main,
            &[
                "worktree",
                "add",
                "-b",
                "feature-x",
                feature.to_str().unwrap(),
            ],
        );
        // Dirty the linked worktree only.
        std::fs::write(feature.join("scratch.txt"), "wip\n").unwrap();

        let ws = Workspace::discover(&main).unwrap();
        let mut wts = enumerate(&ws).unwrap();
        wts.sort_by_key(|w| w.path.clone());
        assert_eq!(wts.len(), 2);

        let main_wt = wts.iter().find(|w| w.is_main).expect("main worktree");
        assert_eq!(main_wt.head_ref.as_deref(), Some("refs/heads/main"));
        assert!(!main_wt.dirty, "main checkout is clean");

        let linked = wts.iter().find(|w| !w.is_main).expect("linked worktree");
        assert_eq!(linked.head_ref.as_deref(), Some("refs/heads/feature-x"));
        assert!(linked.dirty, "untracked file makes the worktree dirty");
    }
}
