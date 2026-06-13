//! Branch enumeration and advisory classification (engine-spec §2.2, D2.3),
//! plus remote-ref degraded mapping (D2.2).
//!
//! Classification is a cheap convention heuristic — advisory metadata,
//! never a gate, never load-bearing for correctness. The corpus-diff
//! confirmation step is **lazy and cached**: cold start never ingests every
//! branch's corpus just to classify it.

use std::collections::HashMap;

use crate::workspace::{GitError, Result, Workspace};

/// Advisory branch classification (D2.3).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BranchClass {
    Default,
    /// Candidate feature branch (heuristic); see [`FeatureConfirmation`].
    Feature,
    Other,
}

/// Linkage tiers a scope cannot serve. Remote refs without a checkout
/// degrade to declared + temporal: no working tree to resolve against.
pub const REMOTE_REF_DEGRADED: &[&str] = &["structural", "semantic"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BranchInfo {
    /// Short branch name (e.g. `main`, `origin/feature-x`).
    pub name: String,
    pub class: BranchClass,
    /// Remote ref without a local checkout (degraded scope, D2.2).
    pub is_remote: bool,
    /// Tier names this scope cannot serve (empty for local branches).
    pub degraded_tiers: Vec<&'static str>,
}

/// Classification configuration. The heuristic is configurable per D2.3;
/// the default treats anything that is not the default branch as a
/// candidate feature branch.
#[derive(Debug, Clone, Default)]
pub struct ClassifyConfig {
    /// Override the default-branch name; `None` derives it from HEAD.
    pub default_branch: Option<String>,
    /// Branch-name prefixes classified `Other` (e.g. `release/`, `hotfix/`).
    pub other_prefixes: Vec<String>,
}

/// Enumerate local branches with advisory classification.
pub fn local_branches(workspace: &Workspace, config: &ClassifyConfig) -> Result<Vec<BranchInfo>> {
    let repo = workspace.open()?;
    let default = default_branch_name(&repo, config);
    let platform = repo
        .references()
        .map_err(|e| GitError::Other(e.to_string()))?;
    let mut out = Vec::new();
    for reference in platform
        .local_branches()
        .map_err(|e| GitError::Other(e.to_string()))?
        .flatten()
    {
        let name = reference.name().shorten().to_string();
        let class = classify(&name, &default, config);
        out.push(BranchInfo {
            name,
            class,
            is_remote: false,
            degraded_tiers: Vec::new(),
        });
    }
    Ok(out)
}

/// Map remote branches as refs only — commit-level and vault-blob-level
/// visibility, flagged with the tiers they cannot serve (D2.2: degrade,
/// don't demand).
pub fn remote_refs(workspace: &Workspace, config: &ClassifyConfig) -> Result<Vec<BranchInfo>> {
    let repo = workspace.open()?;
    let default = default_branch_name(&repo, config);
    let platform = repo
        .references()
        .map_err(|e| GitError::Other(e.to_string()))?;
    let mut out = Vec::new();
    for reference in platform
        .remote_branches()
        .map_err(|e| GitError::Other(e.to_string()))?
        .flatten()
    {
        let name = reference.name().shorten().to_string();
        // `origin/HEAD` is a pointer, not a branch.
        if name.ends_with("/HEAD") {
            continue;
        }
        let short = name.split_once('/').map_or(name.as_str(), |(_, b)| b);
        let class = classify(short, &default, config);
        out.push(BranchInfo {
            name,
            class,
            is_remote: true,
            degraded_tiers: REMOTE_REF_DEGRADED.to_vec(),
        });
    }
    Ok(out)
}

fn default_branch_name(repo: &gix::Repository, config: &ClassifyConfig) -> String {
    if let Some(name) = &config.default_branch {
        return name.clone();
    }
    // HEAD is "the branch THIS worktree has checked out", NOT "the trunk". In a
    // multi-worktree checkout (the common case the sweep hit — one worktree per
    // feature) HEAD is a feature branch, so deriving the default from HEAD made
    // `classify` brand the real trunk (`main`) a feature branch and the feature
    // branch the default (sweep LOW, 2026-06-13). Prefer signals that name the
    // trunk independently of the current checkout, HEAD only as last resort.
    //
    // 1) A conventional trunk among the LOCAL branches. `refs/heads/*` is shared
    //    across every worktree of a repo, so `main` is enumerable even from a
    //    feature worktree that has it checked out elsewhere.
    if let Some(name) = conventional_trunk(repo) {
        return name;
    }
    // 2) The remote's recorded default (`origin/HEAD` -> `origin/<trunk>`) — the
    //    authoritative signal when the trunk is unconventionally named.
    if let Some(name) = remote_default_branch(repo) {
        return name;
    }
    // 3) Last resort: the current HEAD branch, else `main`.
    repo.head_name()
        .ok()
        .flatten()
        .map(|n| n.shorten().to_string())
        .unwrap_or_else(|| "main".to_string())
}

/// The first conventional trunk name (`main`, then `master`, then `trunk`) that
/// exists as a local branch, or `None`. Independent of the current HEAD.
fn conventional_trunk(repo: &gix::Repository) -> Option<String> {
    let platform = repo.references().ok()?;
    let locals: std::collections::HashSet<String> = platform
        .local_branches()
        .ok()?
        .flatten()
        .map(|r| r.name().shorten().to_string())
        .collect();
    ["main", "master", "trunk"]
        .into_iter()
        .find(|c| locals.contains(*c))
        .map(str::to_string)
}

/// The remote default branch from the `origin/HEAD` symbolic pointer (e.g.
/// `refs/remotes/origin/main` -> `main`), or `None` when unset/non-symbolic.
fn remote_default_branch(repo: &gix::Repository) -> Option<String> {
    let reference = repo.find_reference("refs/remotes/origin/HEAD").ok()?;
    match reference.target() {
        gix::refs::TargetRef::Symbolic(name) => {
            // `name.shorten()` yields `origin/main`; take the final segment.
            name.shorten()
                .to_string()
                .rsplit('/')
                .next()
                .map(str::to_string)
        }
        gix::refs::TargetRef::Object(_) => None,
    }
}

fn classify(name: &str, default: &str, config: &ClassifyConfig) -> BranchClass {
    if name == default {
        return BranchClass::Default;
    }
    if config.other_prefixes.iter().any(|p| name.starts_with(p)) {
        return BranchClass::Other;
    }
    BranchClass::Feature
}

/// Lazy, cached corpus-diff confirmation (D2.3): a candidate feature branch
/// is *confirmed* feature-carrying when its vault corpus contains feature
/// tags absent from the default branch. The probe runs on first ask, then
/// caches — callers supply the probe so this crate stays free of corpus
/// semantics.
pub struct FeatureConfirmation<P>
where
    P: FnMut(&str) -> bool,
{
    probe: P,
    cache: HashMap<String, bool>,
    /// Number of probe invocations (observable laziness, for tests).
    pub probes_run: usize,
}

impl<P: FnMut(&str) -> bool> FeatureConfirmation<P> {
    pub fn new(probe: P) -> Self {
        FeatureConfirmation {
            probe,
            cache: HashMap::new(),
            probes_run: 0,
        }
    }

    /// Confirm (or refute) a candidate branch, probing at most once.
    pub fn confirm(&mut self, branch: &str) -> bool {
        if let Some(&cached) = self.cache.get(branch) {
            return cached;
        }
        self.probes_run += 1;
        let result = (self.probe)(branch);
        self.cache.insert(branch.to_string(), result);
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::fixtures::*;

    fn fixture(dir: &std::path::Path) -> Workspace {
        repo_with_commit(dir);
        git(dir, &["branch", "feature-a"]);
        git(dir, &["branch", "release/1.0"]);
        Workspace::discover(dir).unwrap()
    }

    #[test]
    fn classifies_default_feature_and_other() {
        let dir = tempfile::tempdir().unwrap();
        let ws = fixture(dir.path());
        let config = ClassifyConfig {
            other_prefixes: vec!["release/".into()],
            ..Default::default()
        };
        let mut branches = local_branches(&ws, &config).unwrap();
        branches.sort_by(|a, b| a.name.cmp(&b.name));
        let by_name: Vec<(&str, BranchClass)> = branches
            .iter()
            .map(|b| (b.name.as_str(), b.class))
            .collect();
        assert_eq!(
            by_name,
            vec![
                ("feature-a", BranchClass::Feature),
                ("main", BranchClass::Default),
                ("release/1.0", BranchClass::Other),
            ]
        );
        assert!(branches.iter().all(|b| b.degraded_tiers.is_empty()));
    }

    #[test]
    fn trunk_is_named_correctly_when_head_is_on_a_feature_branch() {
        // Multi-worktree reality (sweep LOW): HEAD is checked out to a FEATURE
        // branch. The trunk must still be `main`, derived from the conventional
        // local trunk, NOT from HEAD — else the real trunk is branded a feature
        // branch and the feature branch the default.
        let dir = tempfile::tempdir().unwrap();
        let ws = fixture(dir.path());
        git(dir.path(), &["checkout", "feature-a"]);
        let branches = local_branches(&ws, &ClassifyConfig::default()).unwrap();
        let main = branches.iter().find(|b| b.name == "main").unwrap();
        let feat = branches.iter().find(|b| b.name == "feature-a").unwrap();
        assert_eq!(main.class, BranchClass::Default, "main is the trunk");
        assert_eq!(
            feat.class,
            BranchClass::Feature,
            "the checked-out feature branch is NOT the default"
        );
    }

    #[test]
    fn remote_refs_carry_degraded_tier_flags() {
        let dir = tempfile::tempdir().unwrap();
        let origin = dir.path().join("origin");
        std::fs::create_dir_all(&origin).unwrap();
        let ws_origin = fixture(&origin);
        drop(ws_origin);
        let clone = dir.path().join("clone");
        git(
            dir.path(),
            &["clone", origin.to_str().unwrap(), clone.to_str().unwrap()],
        );

        let ws = Workspace::discover(&clone).unwrap();
        let remotes = remote_refs(&ws, &ClassifyConfig::default()).unwrap();
        assert!(!remotes.is_empty());
        let feature = remotes
            .iter()
            .find(|b| b.name == "origin/feature-a")
            .expect("remote feature branch mapped");
        assert!(feature.is_remote);
        assert_eq!(feature.class, BranchClass::Feature);
        assert_eq!(feature.degraded_tiers, vec!["structural", "semantic"]);
        assert!(
            !remotes.iter().any(|b| b.name.ends_with("/HEAD")),
            "origin/HEAD pointer is not a branch"
        );
    }

    #[test]
    fn corpus_confirmation_is_lazy_and_cached() {
        let mut confirmed_for = Vec::new();
        let mut conf = FeatureConfirmation::new(|branch: &str| {
            confirmed_for.push(branch.to_string());
            branch == "feature-a"
        });
        // Nothing probed until first ask.
        assert_eq!(conf.probes_run, 0);
        assert!(conf.confirm("feature-a"));
        assert!(!conf.confirm("feature-b"));
        // Repeat asks hit the cache.
        assert!(conf.confirm("feature-a"));
        assert!(!conf.confirm("feature-b"));
        assert_eq!(conf.probes_run, 2);
    }
}
