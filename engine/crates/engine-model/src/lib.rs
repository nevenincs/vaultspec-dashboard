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
    /// Subordinate plan-container hierarchy (dashboard-pipeline-wire W03):
    /// plan -> wave -> phase -> step. Declared-tier confidence (the structure
    /// is authored, not inferred); the edge stable key is composed only from
    /// the endpoint container ids, never a resolution or rule outcome, so
    /// re-indexing a plan never re-keys an existing containment edge.
    Contains,
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
    /// ADR H1 status (contract §4 status facet, dashboard-pipeline-wire W01):
    /// one of `proposed`, `accepted`, `rejected`, `deprecated`. A query-time
    /// facet in the same class as `doc_type` and `dates` — present only on ADR
    /// nodes whose H1 carries a status marker, absent everywhere else. Makes
    /// "in-flight ADR" honest (real status, not checkbox-guessed).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    /// Plan frontmatter tier (contract §4 tier facet, dashboard-pipeline-wire
    /// W01): one of `L1`-`L4`. A query-time facet alongside `doc_type` and
    /// `dates` — present only on plan nodes carrying a `tier:` frontmatter key,
    /// absent everywhere else.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tier: Option<String>,
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
    fn node_status_and_tier_round_trip_through_serde() {
        // W01.P02.S09: an ADR node carries its H1 status and a plan node carries
        // its tier through serialization; a node with neither omits both fields
        // (skip_serializing_if), so the wire stays clean for non-ADR/non-plan.
        let adr = Node {
            id: NodeId::derive(&NodeKind::Document, "2026-06-12-x-adr"),
            kind: NodeKind::Document,
            key: "2026-06-12-x-adr".into(),
            title: None,
            doc_type: Some("adr".into()),
            dates: None,
            feature_tags: vec!["x".into()],
            status: Some("accepted".into()),
            tier: None,
            facets: vec![],
        };
        let json = serde_json::to_string(&adr).unwrap();
        assert!(
            json.contains("\"status\":\"accepted\""),
            "status on the wire"
        );
        assert!(!json.contains("\"tier\""), "tier omitted on an ADR node");
        let back: Node = serde_json::from_str(&json).unwrap();
        assert_eq!(back, adr);

        let plan = Node {
            id: NodeId::derive(&NodeKind::Document, "2026-06-12-x-plan"),
            kind: NodeKind::Document,
            key: "2026-06-12-x-plan".into(),
            title: None,
            doc_type: Some("plan".into()),
            dates: None,
            feature_tags: vec!["x".into()],
            status: None,
            tier: Some("L3".into()),
            facets: vec![],
        };
        let json = serde_json::to_string(&plan).unwrap();
        assert!(json.contains("\"tier\":\"L3\""), "tier on the wire");
        assert!(
            !json.contains("\"status\""),
            "status omitted on a plan node"
        );
        let back: Node = serde_json::from_str(&json).unwrap();
        assert_eq!(back, plan);

        // A node carrying neither omits BOTH; deserializing a body without them
        // defaults to None (serde default), so older payloads still parse.
        let plain = Node {
            id: NodeId::derive(&NodeKind::Document, "plain"),
            kind: NodeKind::Document,
            key: "plain".into(),
            title: None,
            doc_type: None,
            dates: None,
            feature_tags: vec![],
            status: None,
            tier: None,
            facets: vec![],
        };
        let json = serde_json::to_string(&plain).unwrap();
        assert!(!json.contains("status") && !json.contains("tier"));
        assert_eq!(serde_json::from_str::<Node>(&json).unwrap(), plain);
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
