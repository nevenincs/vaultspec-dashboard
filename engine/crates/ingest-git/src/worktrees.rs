//! Worktree enumeration (engine-spec §2.2).
//!
//! Worktrees are the privileged scopes: the local, disk-persisted
//! development environments where structural resolution has a working tree
//! to resolve against (all four linkage tiers, D2.2). Each worktree is
//! (checkout path, HEAD ref, dirty state, ahead/behind).

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
    /// Commits in HEAD not yet in the upstream tracking branch; `None` when
    /// no tracking branch is configured or HEAD is detached.
    pub ahead: Option<u32>,
    /// Commits in the upstream tracking branch not yet in HEAD; `None` when
    /// no tracking branch is configured or HEAD is detached.
    pub behind: Option<u32>,
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

/// The thread bound for gix's index-vs-worktree status diff (B5b). gix treats
/// `None` and `Some(0)` as "one thread per logical core"; any `Some(n>0)` caps
/// at `n`. Default to 2 (enough to overlap I/O without the per-core memory
/// fan-out), overridable via `VAULTSPEC_GIT_STATUS_THREADS` (0 = gix default).
fn git_status_thread_limit() -> Option<usize> {
    match std::env::var("VAULTSPEC_GIT_STATUS_THREADS")
        .ok()
        .and_then(|v| v.trim().parse::<usize>().ok())
    {
        Some(0) => None,
        Some(n) => Some(n),
        None => Some(2),
    }
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
            .map_err(|e| GitError::Other(e.to_string()))?
            // Bound the index-vs-worktree diff parallelism (B5b,
            // resource-hardening). gix's default (`thread_limit: None`) spawns
            // one diff thread per logical core, each with its own buffers; on a
            // high-core machine under memory pressure that per-core fan-out is
            // the allocation spike that panicked the engine ("paging file too
            // small" / "insufficient system resources" inside gix `in_parallel`
            // during scope indexing). The worktree dirty check only needs to
            // know whether ANY change exists, so a small fixed bound makes peak
            // memory independent of core count.
            .index_worktree_options_mut(|opts| {
                opts.thread_limit = git_status_thread_limit();
            });
        let mut items = status
            .into_iter(None)
            .map_err(|e| GitError::Other(e.to_string()))?;
        items.next().is_some()
    };
    let path = std::fs::canonicalize(&path).unwrap_or(path);
    // Graceful — None on any failure (detached HEAD, no upstream, bare remote).
    let (ahead, behind) = ahead_behind(repo, &head_ref);
    Ok(WorktreeInfo {
        path,
        head_ref,
        dirty,
        is_main,
        ahead,
        behind,
    })
}

/// Return `(ahead, behind)` counts against the branch's upstream tracking ref,
/// or `(None, None)` on any failure (detached HEAD, no tracking branch, no
/// remote fetch ref, bare remote, empty repo).  Never propagates an error.
fn ahead_behind(repo: &gix::Repository, head_ref: &Option<String>) -> (Option<u32>, Option<u32>) {
    try_ahead_behind(repo, head_ref).unwrap_or((None, None))
}

fn try_ahead_behind(
    repo: &gix::Repository,
    head_ref: &Option<String>,
) -> Option<(Option<u32>, Option<u32>)> {
    use std::collections::HashSet;

    // Detached HEAD has no branch tracking config.
    let head_ref_name = head_ref.as_deref()?;
    let branch_short = head_ref_name.strip_prefix("refs/heads/")?;

    // Read branch.<name>.remote and branch.<name>.merge from git config.
    let snap = repo.config_snapshot();
    let remote_bstr = snap.string_by("branch", Some(branch_short.as_bytes().into()), "remote")?;
    let merge_bstr = snap.string_by("branch", Some(branch_short.as_bytes().into()), "merge")?;
    let remote_str = std::str::from_utf8(remote_bstr.as_ref()).ok()?;
    let merge_str = std::str::from_utf8(merge_bstr.as_ref()).ok()?;
    // merge is typically "refs/heads/<branch>"; strip to get the short name.
    let merge_short = merge_str.strip_prefix("refs/heads/").unwrap_or(merge_str);

    let tracking_ref = format!("refs/remotes/{remote_str}/{merge_short}");

    // Resolve both tips via rev_parse_single so tag objects are handled too.
    let upstream_id = repo.rev_parse_single(tracking_ref.as_str()).ok()?.detach();
    let head_id = repo.rev_parse_single("HEAD").ok()?.detach();

    if head_id == upstream_id {
        return Some((Some(0), Some(0)));
    }

    // Build reachability sets then diff them.  O(history) per side — acceptable
    // for the worktree counts a dashboard needs (bounded repos, infrequent call).
    let from_upstream: HashSet<_> = repo
        .rev_walk([upstream_id])
        .all()
        .ok()?
        .filter_map(|r| r.ok().map(|i| i.id))
        .collect();
    let from_head: HashSet<_> = repo
        .rev_walk([head_id])
        .all()
        .ok()?
        .filter_map(|r| r.ok().map(|i| i.id))
        .collect();

    let ahead = from_head
        .iter()
        .filter(|id| !from_upstream.contains(*id))
        .count()
        .min(u32::MAX as usize) as u32;
    let behind = from_upstream
        .iter()
        .filter(|id| !from_head.contains(*id))
        .count()
        .min(u32::MAX as usize) as u32;

    Some((Some(ahead), Some(behind)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::fixtures::*;

    // S05: verify ahead=1, behind=0 after one local commit not yet pushed.
    #[test]
    fn ahead_behind_reflects_one_unpushed_commit() {
        let dir = tempfile::tempdir().unwrap();
        let local = dir.path().join("local");
        let origin = dir.path().join("origin.git");

        // Seed: local repo with one commit, then bare-clone it as origin.
        std::fs::create_dir_all(&local).unwrap();
        repo_with_commit(&local);
        git(
            dir.path(),
            &["clone", "--bare", local.to_str().unwrap(), "origin.git"],
        );

        // Wire local → origin tracking so ahead/behind is computable.
        git(
            &local,
            &["remote", "add", "origin", origin.to_str().unwrap()],
        );
        git(&local, &["fetch", "origin"]);
        git(&local, &["branch", "--set-upstream-to=origin/main", "main"]);

        // One local commit that has NOT been pushed.
        std::fs::write(local.join("change.txt"), "local\n").unwrap();
        git(&local, &["add", "."]);
        git(&local, &["commit", "-m", "local only"]);

        let ws = Workspace::discover(&local).unwrap();
        let wts = enumerate(&ws).unwrap();
        let wt = wts.iter().find(|w| w.is_main).expect("main worktree");

        assert_eq!(wt.ahead, Some(1), "one commit ahead of origin");
        assert_eq!(wt.behind, Some(0), "origin has no commits we are missing");
    }

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
