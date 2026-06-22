//! Worktree enumeration (engine-spec §2.2).
//!
//! Worktrees are the privileged scopes: the local, disk-persisted
//! development environments where structural resolution has a working tree
//! to resolve against (all four linkage tiers, D2.2). Each worktree is
//! (checkout path, HEAD ref, dirty state, ahead/behind).

use std::path::{Path, PathBuf};

use rayon::prelude::*;

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
///
/// The expensive per-worktree inspection (an index-vs-worktree status diff plus
/// two history walks for ahead/behind) runs across the worktrees in a bounded
/// concurrent fan-out rather than serially, so the wall-clock no longer scales
/// linearly with worktree count. The returned order is stable (main checkout
/// first, then linked worktrees in repository order) and identical to the prior
/// serial implementation.
pub fn enumerate(workspace: &Workspace) -> Result<Vec<WorktreeInfo>> {
    inspect_all(collect_descriptors(workspace)?)
}

/// Inspect a single worktree of the workspace: the one whose checkout root
/// matches `path` (compared canonically). Returns `None` if `path` is not a
/// worktree of this workspace. This is the targeted path for callers that need
/// only one worktree's status (`/status`, the CLI `status` verb): it pays the
/// expensive inspection exactly once instead of inspecting every worktree and
/// discarding all but the match.
pub fn inspect_one(workspace: &Workspace, path: &Path) -> Result<Option<WorktreeInfo>> {
    let target = canonical(path);
    for (workdir, is_main) in collect_descriptors(workspace)? {
        if canonical(&workdir) == target {
            return Ok(Some(inspect_path(&workdir, is_main)?));
        }
    }
    Ok(None)
}

/// List every worktree's canonicalized checkout root (main first, then linked)
/// WITHOUT the expensive per-worktree inspection — no status diff, no
/// ahead/behind history walk. Callers that only need to resolve or match a
/// worktree path (scope validation, launch-root resolution, an emptiness check)
/// use this instead of `enumerate`, which inspects every worktree. The roots are
/// canonicalized to match the `WorktreeInfo::path` form `enumerate` returned, so
/// existing path comparisons are unchanged.
pub fn list_roots(workspace: &Workspace) -> Result<Vec<PathBuf>> {
    Ok(collect_descriptors(workspace)?
        .into_iter()
        .map(|(path, _)| canonical(&path))
        .collect())
}

/// The cheap phase: list every worktree's checkout root and whether it is the
/// main checkout. This does no status diff or history walk, so it stays serial;
/// the expensive `inspect` work is what the parallel fan-out covers.
fn collect_descriptors(workspace: &Workspace) -> Result<Vec<(PathBuf, bool)>> {
    let repo = workspace.open()?;
    let mut out = Vec::new();
    if let Some(workdir) = repo.workdir() {
        out.push((workdir.to_path_buf(), true));
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
        out.push((workdir.to_path_buf(), false));
    }
    Ok(out)
}

/// Run `inspect` across the collected descriptors with a bounded concurrent
/// fan-out, preserving descriptor order. A single descriptor (or a unit cap)
/// stays serial to avoid the pool-build cost.
fn inspect_all(descriptors: Vec<(PathBuf, bool)>) -> Result<Vec<WorktreeInfo>> {
    if descriptors.len() <= 1 {
        return descriptors
            .into_iter()
            .map(|(p, is_main)| inspect_path(&p, is_main))
            .collect();
    }
    let threads = worktree_inspect_concurrency().min(descriptors.len());
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(threads)
        .build()
        .map_err(|e| GitError::Other(e.to_string()))?;
    pool.install(|| {
        descriptors
            .into_par_iter()
            .map(|(p, is_main)| inspect_path(&p, is_main))
            .collect::<Result<Vec<_>>>()
    })
}

/// The bound on how many worktrees are inspected concurrently. Each inspection
/// can itself spawn up to the B5b status-thread limit, so the combined fan-out
/// is `worktree_inspect_concurrency() * git_status_thread_limit()` threads —
/// kept independent of worktree count and of core count. Default 4, overridable
/// via `VAULTSPEC_WORKTREE_INSPECT_THREADS` (0 or unset uses the default).
fn worktree_inspect_concurrency() -> usize {
    std::env::var("VAULTSPEC_WORKTREE_INSPECT_THREADS")
        .ok()
        .and_then(|v| v.trim().parse::<usize>().ok())
        .filter(|n| *n > 0)
        .unwrap_or(4)
}

/// Open the worktree at `path` and inspect it. Each parallel unit owns its own
/// repository handle (gix repos are not shared across the fan-out).
fn inspect_path(path: &Path, is_main: bool) -> Result<WorktreeInfo> {
    let repo = gix::open(path).map_err(|e| GitError::Other(e.to_string()))?;
    inspect(&repo, path.to_path_buf(), is_main)
}

fn canonical(p: &Path) -> PathBuf {
    std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf())
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

/// Bound for the ahead/behind cache (bounded-by-default-for-every-accumulator):
/// the live working set is one pair per active branch, but distinct (head,
/// upstream) pairs accumulate as commits land. Cap the map and clear it wholesale
/// on overflow — every retained entry stays exactly correct (the counts for a
/// commit-OID pair are immutable), so a cold rebuild after a clear is free of
/// staleness, only of a recompute.
const AHEAD_BEHIND_CACHE_CAP: usize = 512;

/// Cache keyed on the immutable `(head_oid, upstream_oid)` pair: ahead/behind
/// counts are a pure function of the two commit tips and the repo's object DB
/// (shared across a repo's worktrees), so the same pair always yields the same
/// counts. A tip moving produces a new key (miss → recompute); moving back to a
/// seen pair hits with the correct value.
type AheadBehindCache =
    std::sync::Mutex<std::collections::HashMap<(gix::ObjectId, gix::ObjectId), (u32, u32)>>;

fn ahead_behind_cache() -> &'static AheadBehindCache {
    static CACHE: std::sync::OnceLock<AheadBehindCache> = std::sync::OnceLock::new();
    CACHE.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
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

    // Serve a cached result for this exact tip pair before the O(history) walk.
    let cache_key = (head_id, upstream_id);
    if let Some(&(ahead, behind)) = ahead_behind_cache()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(&cache_key)
    {
        return Some((Some(ahead), Some(behind)));
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

    {
        let mut cache = ahead_behind_cache()
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        // Bounded: clear wholesale on overflow (retained entries are never stale,
        // so this only forfeits cached work, never correctness).
        if cache.len() >= AHEAD_BEHIND_CACHE_CAP {
            cache.clear();
        }
        cache.insert(cache_key, (ahead, behind));
    }

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

    // S03: inspect_one returns exactly the matching worktree, and the result is
    // identical to that worktree's entry from the full enumeration (parity).
    #[test]
    fn inspect_one_returns_the_matching_worktree() {
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
        std::fs::write(feature.join("scratch.txt"), "wip\n").unwrap();

        let ws = Workspace::discover(&main).unwrap();
        let all = enumerate(&ws).unwrap();

        // The linked worktree resolved on its own matches its enumerate entry.
        let one = inspect_one(&ws, &feature)
            .unwrap()
            .expect("feature worktree resolves");
        let from_all = all
            .iter()
            .find(|w| !w.is_main)
            .expect("linked worktree in enumerate");
        assert_eq!(&one, from_all, "inspect_one parity with enumerate");
        assert_eq!(one.head_ref.as_deref(), Some("refs/heads/feature-x"));
        assert!(one.dirty, "untracked file makes the worktree dirty");

        // The main checkout resolves too.
        let main_one = inspect_one(&ws, &main)
            .unwrap()
            .expect("main worktree resolves");
        assert!(main_one.is_main);
    }

    // S03: inspect_one returns None for a path that is not a worktree.
    #[test]
    fn inspect_one_returns_none_for_non_worktree_path() {
        let dir = tempfile::tempdir().unwrap();
        let main = dir.path().join("main");
        std::fs::create_dir_all(&main).unwrap();
        repo_with_commit(&main);

        let ws = Workspace::discover(&main).unwrap();
        let stranger = dir.path().join("not-a-worktree");
        std::fs::create_dir_all(&stranger).unwrap();
        assert!(
            inspect_one(&ws, &stranger).unwrap().is_none(),
            "a non-worktree path resolves to None, not an error"
        );
    }

    // S03: parallel enumerate yields the same set as a serial inspection across
    // several worktrees (order-independent parity).
    #[test]
    fn parallel_enumerate_matches_serial_set() {
        let dir = tempfile::tempdir().unwrap();
        let main = dir.path().join("main");
        std::fs::create_dir_all(&main).unwrap();
        repo_with_commit(&main);
        for name in ["wt-a", "wt-b", "wt-c"] {
            let p = dir.path().join(name);
            git(&main, &["worktree", "add", "-b", name, p.to_str().unwrap()]);
        }

        let ws = Workspace::discover(&main).unwrap();

        // Reference set built by inspecting each descriptor serially.
        let mut serial: Vec<WorktreeInfo> = collect_descriptors(&ws)
            .unwrap()
            .into_iter()
            .map(|(p, is_main)| inspect_path(&p, is_main).unwrap())
            .collect();
        let mut parallel = enumerate(&ws).unwrap();
        assert_eq!(parallel.len(), 4, "main + three linked worktrees");

        serial.sort_by_key(|w| w.path.clone());
        parallel.sort_by_key(|w| w.path.clone());
        assert_eq!(parallel, serial, "parallel enumerate equals the serial set");
    }

    // list_roots returns the same canonicalized path set as enumerate, so the
    // path-only callers that migrate to it match exactly as before.
    #[test]
    fn list_roots_matches_enumerate_paths() {
        let dir = tempfile::tempdir().unwrap();
        let main = dir.path().join("main");
        std::fs::create_dir_all(&main).unwrap();
        repo_with_commit(&main);
        for name in ["lr-a", "lr-b"] {
            let p = dir.path().join(name);
            git(&main, &["worktree", "add", "-b", name, p.to_str().unwrap()]);
        }
        let ws = Workspace::discover(&main).unwrap();

        let mut from_list = list_roots(&ws).unwrap();
        let mut from_enum: Vec<_> = enumerate(&ws)
            .unwrap()
            .into_iter()
            .map(|w| w.path)
            .collect();
        from_list.sort();
        from_enum.sort();
        assert_eq!(from_list.len(), 3, "main + two linked worktrees");
        assert_eq!(
            from_list, from_enum,
            "list_roots paths equal enumerate paths"
        );
    }
}
