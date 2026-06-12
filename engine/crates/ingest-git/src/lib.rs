//! Temporal-tier and outer-framework ingestion via the pure-Rust `gix`
//! library — no libgit2, no shelling out (engine-spec D2.5).
//!
//! Owns workspace discovery (common-git-dir resolution, engine-spec §2.1),
//! worktree/ref enumeration (§2.2), advisory branch classification (D2.3),
//! and the named temporal correlation rules (§3, D3.4). The object DB is
//! read-only truth; this crate never mutates refs, trees, or config.

use engine_model::ScopeRef;

pub mod branches;
pub mod log;
pub mod workspace;
pub mod worktrees;

/// Advisory branch classification — heuristic, configurable, never a gate
/// (engine-spec D2.3).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BranchClass {
    Default,
    Feature,
    Other,
}

/// A workspace: the repository common git dir plus its worktrees and refs.
/// Workspace identity = common git dir; worktrees and refs are scopes within
/// it, not separate workspaces (D2.1).
#[derive(Debug, Clone)]
pub struct Workspace {
    /// The repository's common git dir — the workspace identity key.
    pub common_dir: String,
    /// Known scopes: worktrees (privileged, all four tiers) and remote refs
    /// without a checkout (degraded to declared + temporal, D2.2).
    pub scopes: Vec<ScopeRef>,
}

/// Named temporal correlation rules in descending confidence (engine-spec
/// §3, D3.4). Rules are additive and independently attributable in
/// provenance.
pub const TEMPORAL_RULES: &[(&str, f32)] = &[
    ("explicit-step-identifier", 0.9),
    ("doc-and-code-in-one-commit", 0.7),
    ("path-overlap-time-window", 0.4),
    ("same-day-same-branch", 0.3),
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn temporal_rules_descend_in_confidence() {
        let confidences: Vec<f32> = TEMPORAL_RULES.iter().map(|(_, c)| *c).collect();
        assert!(confidences.windows(2).all(|w| w[0] >= w[1]));
    }
}

pub mod correlate;
