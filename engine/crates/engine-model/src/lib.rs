//! Pure shared types for the vaultspec engine (engine-spec §3, §4).
//!
//! Zero I/O. This crate is the dependency sink: every other crate in the
//! workspace depends on it, and the future orchestration layer links against
//! it. The edge is the atom of the engine (engine-spec §3).

use serde::{Deserialize, Serialize};

pub mod id;

pub use id::{CanonicalKey, content_hash, edge_id, node_id};

/// Stable node identity: kind + canonical key (contract §2).
///
/// Never positional, never regenerated; the GUI caches and animates by id.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct NodeId(pub String);

/// Stable edge identity: content hash of
/// `(src, dst, relation, tier, provenance key)` (contract §2).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct EdgeId(pub String);

/// Node kinds with their identity keys (engine-spec §4.1).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NodeKind {
    /// Convergence point keyed by feature tag — the primary entity (D4.1).
    Feature,
    /// Vault document keyed by stem (filename sans `.md`).
    Document,
    /// Plan container keyed by plan stem + canonical id (`W##/P##/S##`).
    PlanContainer,
    /// Commit keyed by SHA; inherently ref-scoped.
    Commit,
    /// Code artifact keyed by repo-relative path (+ optional symbol).
    CodeArtifact,
    /// A project rule keyed by its kebab-case slug (graph-node-semantics ADR):
    /// the codify pipeline's output, projected from the rules tree
    /// (`.vaultspec/rules/`, OUTSIDE `.vault/`). Authority class is law; it is
    /// a re-computable projection, never a vault document (read-and-infer).
    Rule,
}

/// Typed, directed relation semantics (engine-spec §3).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RelationKind {
    Fulfills,
    Implements,
    Resolves,
    Reviews,
    References,
    Mentions,
    Touches,
    Resembles,
    /// Core's `derived_edges`, ingested as a distinct relation at 0.8 —
    /// never mixed into declared (engine-spec §3).
    CoreDerived,
}

/// The four provenance tiers (engine-spec §3, D3.1).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Tier {
    /// Explicit cross-references from core's graph payload. Confidence 1.0.
    Declared,
    /// Deterministic extraction resolved against a working tree.
    Structural,
    /// Commit/record correlation via named rules. Confidence 0.3–0.9.
    Temporal,
    /// RAG matches; ephemeral, capped at 0.7, present-only (D3.5).
    Semantic,
}

/// Structural-tier resolution state — retained and surfaced, never dropped:
/// broken edges are signal, not garbage (D3.3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ResolutionState {
    Resolved,
    Stale,
    Broken,
}

/// Which corpus view (worktree or ref) an edge or facet holds in.
///
/// Scope is fully stateless: every working-tree-dependent query names its
/// scope per request (engine-spec §2.3, contract §3).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ScopeRef {
    /// A local worktree checkout path — privileged: all four tiers (D2.2).
    Worktree { path: String },
    /// A ref without a checkout — degraded to declared + temporal (D2.2).
    Ref { name: String },
}

/// Who said so, from what input, when. Never optional: provenance is what
/// makes an edge auditable and re-derivable (engine-spec §3).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case", tag = "source")]
pub enum Provenance {
    /// Core graph payload hash + edge id.
    CoreGraph {
        payload_hash: String,
        edge_id: String,
    },
    /// Document blob + byte span + resolved target path/symbol.
    DocumentBody {
        blob_hash: String,
        span: (usize, usize),
        target: String,
    },
    /// Commit SHA + the named correlation rule that fired (D3.4).
    CommitCorrelation { sha: String, rule: String },
    /// The rag query, result rank, and score.
    RagMatch {
        query: String,
        rank: u32,
        score: f32,
    },
}

/// Milliseconds since the Unix epoch. Placeholder representation; may grow
/// into a richer time type when the temporal tier is implemented.
pub type Timestamp = i64;

/// The atom of the engine: one edge schema across all four tiers; tier and
/// provenance are mandatory, never inferred from context (D3.1).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Edge {
    pub id: EdgeId,
    pub src: NodeId,
    pub dst: NodeId,
    pub relation: RelationKind,
    pub tier: Tier,
    /// Tier-calibrated, fixed bands — nothing learned or tunable in v1 (D3.2).
    pub confidence: f32,
    /// Structural tier only.
    pub state: Option<ResolutionState>,
    pub provenance: Provenance,
    pub scope: ScopeRef,
    pub observed_at: Timestamp,
}

/// Per-corpus-view facet: identity lives in the key; branch variance lives
/// in facets. Divergence is signal, never auto-merged (D4.2).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Facet {
    pub scope: ScopeRef,
    pub presence: Presence,
    /// Content hash of the underlying document blob(s) in this view —
    /// one namespace across read paths (the git blob oid).
    pub content_hash: Option<String>,
    /// Lifecycle state in this view (e.g. plan 60% checked on `feature-x`,
    /// 30% on `main` — engine-spec §4.2).
    pub lifecycle: Option<Lifecycle>,
}

/// Lifecycle state + optional progress for a facet (contract §4 node
/// `lifecycle {state, progress?}`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Lifecycle {
    pub state: String,
    pub progress: Option<Progress>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Progress {
    pub done: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Presence {
    Exists,
    Absent,
    Archived,
}

/// A node: an aggregation point with discovery capability, not a dot
/// (engine-spec §4.3). Cross-branch identity = stable key + facets.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Node {
    pub id: NodeId,
    pub kind: NodeKind,
    /// Canonical identity key (feature tag, vault stem, plan stem +
    /// canonical id, commit SHA, repo-relative path).
    pub key: String,
    pub title: Option<String>,
    /// Vault document type (the `.vault/` subdirectory), contract §4
    /// `doc_type?`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub doc_type: Option<String>,
    /// Contract §4 `dates {created, modified}`: created from the document
    /// frontmatter date; modified in ms since epoch (worktree mtime on
    /// present views; absent on blob-true historical views).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dates: Option<Dates>,
    /// Feature tags this node belongs to (contract §4 `feature_tags[]`);
    /// the join key for feature-convergence synthesis and meta-edge
    /// aggregation.
    pub feature_tags: Vec<String>,
    pub facets: Vec<Facet>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Dates {
    pub created: Option<String>,
    pub modified: Option<Timestamp>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn node_id_is_stable_across_derivations() {
        let a = NodeId::derive(&NodeKind::Feature, "editor-demo");
        let b = NodeId::derive(&NodeKind::Feature, "editor-demo");
        assert_eq!(a, b);
        assert_eq!(a.0, "feature:editor-demo");
    }

    #[test]
    fn edge_round_trips_through_serde() {
        let edge = Edge {
            id: EdgeId("e1".into()),
            src: NodeId::derive(&NodeKind::Document, "2026-06-12-demo-plan"),
            dst: NodeId::derive(&NodeKind::Document, "2026-06-12-demo-adr"),
            relation: RelationKind::Implements,
            tier: Tier::Declared,
            confidence: 1.0,
            state: None,
            provenance: Provenance::CoreGraph {
                payload_hash: "abc".into(),
                edge_id: "core-1".into(),
            },
            scope: ScopeRef::Ref {
                name: "main".into(),
            },
            observed_at: 0,
        };
        let json = serde_json::to_string(&edge).unwrap();
        let back: Edge = serde_json::from_str(&json).unwrap();
        assert_eq!(edge, back);
    }
}
