//! Stable identity derivation (contract §2).
//!
//! Node ids derive from kind + canonical key; edge ids are content hashes of
//! `(src, dst, relation, tier, provenance key)`. Both are stable across
//! queries, scopes, and time — never positional, never regenerated. The GUI
//! caches and animates by id; re-derivation of the same edge yields the
//! same id.

use crate::{EdgeId, NodeId, NodeKind, Provenance, RelationKind, Tier};

/// The canonical identity key forms, one per node kind (engine-spec §4.1).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CanonicalKey<'a> {
    /// Feature tag (kebab-case, core's mandated convention).
    Feature { tag: &'a str },
    /// Vault stem: filename sans `.md`.
    Document { stem: &'a str },
    /// Plan stem plus canonical container id (`W##/P##/S##`).
    PlanContainer {
        plan_stem: &'a str,
        container_id: &'a str,
    },
    /// Commit SHA — inherently ref-scoped.
    Commit { sha: &'a str },
    /// Repo-relative path, optionally qualified by a symbol.
    ///
    /// Key form is `{path}#{symbol}` (audit W01P01-004): this assumes repo
    /// paths do not contain `#`. Paths that do would alias a symbol
    /// qualifier; such paths are vanishingly rare in practice and not
    /// produced by any vaultspec convention. Revisit with an escaped
    /// separator if a real corpus ever violates the assumption.
    CodeArtifact {
        path: &'a str,
        symbol: Option<&'a str>,
    },
    /// Rule slug (kebab-case): the codify pipeline's output projected from the
    /// rules tree (graph-node-semantics ADR). Identity is the slug, stable
    /// across re-projection.
    Rule { slug: &'a str },
}

impl CanonicalKey<'_> {
    pub fn kind(&self) -> NodeKind {
        match self {
            CanonicalKey::Feature { .. } => NodeKind::Feature,
            CanonicalKey::Document { .. } => NodeKind::Document,
            CanonicalKey::PlanContainer { .. } => NodeKind::PlanContainer,
            CanonicalKey::Commit { .. } => NodeKind::Commit,
            CanonicalKey::CodeArtifact { .. } => NodeKind::CodeArtifact,
            CanonicalKey::Rule { .. } => NodeKind::Rule,
        }
    }

    /// The canonical key string, without the kind prefix.
    pub fn key_string(&self) -> String {
        match self {
            CanonicalKey::Feature { tag } => (*tag).to_string(),
            CanonicalKey::Document { stem } => (*stem).to_string(),
            CanonicalKey::PlanContainer {
                plan_stem,
                container_id,
            } => format!("{plan_stem}/{container_id}"),
            CanonicalKey::Commit { sha } => (*sha).to_string(),
            CanonicalKey::CodeArtifact { path, symbol } => match symbol {
                Some(symbol) => format!("{path}#{symbol}"),
                None => (*path).to_string(),
            },
            CanonicalKey::Rule { slug } => (*slug).to_string(),
        }
    }
}

pub(crate) fn kind_prefix(kind: &NodeKind) -> &'static str {
    match kind {
        NodeKind::Feature => "feature",
        NodeKind::Document => "doc",
        NodeKind::PlanContainer => "plan",
        NodeKind::Commit => "commit",
        NodeKind::CodeArtifact => "code",
        NodeKind::Rule => "rule",
    }
}

/// Derive a stable node id from a canonical key (contract §2).
pub fn node_id(key: &CanonicalKey) -> NodeId {
    NodeId(format!("{}:{}", kind_prefix(&key.kind()), key.key_string()))
}

impl NodeId {
    /// Derive a stable node id from kind + pre-rendered canonical key.
    /// Prefer [`node_id`] with a typed [`CanonicalKey`] where possible.
    pub fn derive(kind: &NodeKind, key: &str) -> Self {
        NodeId(format!("{}:{key}", kind_prefix(kind)))
    }
}

impl Tier {
    /// Stable wire name (matches the serde kebab-case encoding).
    pub fn as_str(&self) -> &'static str {
        match self {
            Tier::Declared => "declared",
            Tier::Structural => "structural",
            Tier::Temporal => "temporal",
        }
    }
}

impl RelationKind {
    /// Stable wire name (matches the serde kebab-case encoding).
    pub fn as_str(&self) -> &'static str {
        match self {
            RelationKind::Fulfills => "fulfills",
            RelationKind::Implements => "implements",
            RelationKind::Resolves => "resolves",
            RelationKind::Reviews => "reviews",
            RelationKind::References => "references",
            RelationKind::Mentions => "mentions",
            RelationKind::Touches => "touches",
            RelationKind::Resembles => "resembles",
            RelationKind::Contains => "contains",
            RelationKind::CoreDerived => "core-derived",
        }
    }
}

impl Provenance {
    /// The stable part of provenance used for edge identity (contract §2).
    ///
    /// Deliberately excludes volatile inputs (core payload hash, document
    /// blob hash, byte spans, rag rank/score): re-deriving the same logical
    /// edge from a newer ingestion run must yield the same edge id.
    pub fn stable_key(&self) -> String {
        match self {
            Provenance::CoreGraph { edge_id, .. } => format!("core:{edge_id}"),
            Provenance::DocumentBody { target, .. } => format!("body:{target}"),
            // Temporal identity is per (commit, record), NOT per rule
            // (audit redline W02P07-401, conducted as the W01P01-001
            // contract-review event): the U2 enrichment-adoption upgrade
            // (rule-2 matches becoming rule-1 corpus-wide) must upgrade
            // confidence in place, never churn edge ids. The rule stays in
            // provenance as attribution only.
            Provenance::CommitCorrelation { sha, .. } => format!("commit:{sha}"),
            Provenance::RagMatch { query, .. } => format!("rag:{query}"),
        }
    }
}

/// FNV-1a, 128-bit. Tiny, dependency-free, and deterministic across
/// platforms and Rust versions — unlike `DefaultHasher`, which guarantees
/// neither. Not cryptographic; edge ids need stability and a negligible
/// collision rate at vault scale (thousands to low millions of edges),
/// not adversarial resistance.
fn fnv1a_128(bytes: &[u8]) -> u128 {
    const OFFSET: u128 = 0x6c62272e07bb014262b821756295c58d;
    const PRIME: u128 = 0x0000000001000000000000000000013b;
    let mut hash = OFFSET;
    for &b in bytes {
        hash ^= u128::from(b);
        hash = hash.wrapping_mul(PRIME);
    }
    hash
}

/// Stable content hash of arbitrary bytes, as a 32-hex-digit string.
/// Used for content-hash cache keys and payload identity (engine-spec §2.4
/// cache discipline). Same determinism rationale as [`edge_id`].
pub fn content_hash(bytes: &[u8]) -> String {
    format!("{:032x}", fnv1a_128(bytes))
}

/// Derive a stable edge id: content hash of
/// `(src, dst, relation, tier, provenance stable key)` (contract §2).
pub fn edge_id(
    src: &NodeId,
    dst: &NodeId,
    relation: &RelationKind,
    tier: Tier,
    provenance: &Provenance,
) -> EdgeId {
    edge_id_with_tier_name(src, dst, relation, tier.as_str(), provenance)
}

/// The shared id-derivation core: content hash of
/// `(src, dst, relation, tier-wire-name, provenance stable key)`.
fn edge_id_with_tier_name(
    src: &NodeId,
    dst: &NodeId,
    relation: &RelationKind,
    tier_name: &str,
    provenance: &Provenance,
) -> EdgeId {
    // Field separator 0x1f (unit separator) cannot appear in any component's
    // meaningful content and prevents concatenation ambiguity.
    let material = format!(
        "{}\u{1f}{}\u{1f}{}\u{1f}{}\u{1f}{}",
        src.0,
        dst.0,
        relation.as_str(),
        tier_name,
        provenance.stable_key(),
    );
    EdgeId(format!("e:{:032x}", fnv1a_128(material.as_bytes())))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_provenance() -> Provenance {
        Provenance::CoreGraph {
            payload_hash: "volatile-payload-hash".into(),
            edge_id: "core-edge-7".into(),
        }
    }

    #[test]
    fn node_ids_cover_every_canonical_key_form() {
        let cases = [
            (
                node_id(&CanonicalKey::Feature { tag: "editor-demo" }),
                "feature:editor-demo",
            ),
            (
                node_id(&CanonicalKey::Document {
                    stem: "2026-06-12-editor-demo-plan",
                }),
                "doc:2026-06-12-editor-demo-plan",
            ),
            (
                node_id(&CanonicalKey::PlanContainer {
                    plan_stem: "2026-06-12-editor-demo-plan",
                    container_id: "W01/P02/S03",
                }),
                "plan:2026-06-12-editor-demo-plan/W01/P02/S03",
            ),
            (
                node_id(&CanonicalKey::Commit { sha: "abc123" }),
                "commit:abc123",
            ),
            (
                node_id(&CanonicalKey::CodeArtifact {
                    path: "src/main.rs",
                    symbol: Some("main"),
                }),
                "code:src/main.rs#main",
            ),
            (
                node_id(&CanonicalKey::CodeArtifact {
                    path: "src/main.rs",
                    symbol: None,
                }),
                "code:src/main.rs",
            ),
        ];
        for (actual, expected) in cases {
            assert_eq!(actual.0, expected);
        }
    }

    #[test]
    fn node_id_derivation_is_stable() {
        let key = CanonicalKey::Feature { tag: "editor-demo" };
        assert_eq!(node_id(&key), node_id(&key));
        assert_eq!(
            NodeId::derive(&NodeKind::Feature, "editor-demo"),
            node_id(&key)
        );
    }

    #[test]
    fn edge_id_is_deterministic_across_derivations() {
        let src = NodeId("doc:a".into());
        let dst = NodeId("feature:b".into());
        let a = edge_id(
            &src,
            &dst,
            &RelationKind::Implements,
            Tier::Declared,
            &sample_provenance(),
        );
        let b = edge_id(
            &src,
            &dst,
            &RelationKind::Implements,
            Tier::Declared,
            &sample_provenance(),
        );
        assert_eq!(a, b);
        assert!(a.0.starts_with("e:"));
        assert_eq!(a.0.len(), 2 + 32);
    }

    #[test]
    fn edge_id_ignores_volatile_provenance_fields() {
        let src = NodeId("doc:a".into());
        let dst = NodeId("feature:b".into());
        let p1 = Provenance::CoreGraph {
            payload_hash: "hash-from-monday".into(),
            edge_id: "core-edge-7".into(),
        };
        let p2 = Provenance::CoreGraph {
            payload_hash: "hash-from-tuesday".into(),
            edge_id: "core-edge-7".into(),
        };
        assert_eq!(
            edge_id(&src, &dst, &RelationKind::Implements, Tier::Declared, &p1),
            edge_id(&src, &dst, &RelationKind::Implements, Tier::Declared, &p2),
        );
    }

    #[test]
    fn edge_id_distinguishes_every_identity_component() {
        let src = NodeId("doc:a".into());
        let dst = NodeId("feature:b".into());
        let base = edge_id(
            &src,
            &dst,
            &RelationKind::Implements,
            Tier::Declared,
            &sample_provenance(),
        );
        // direction
        assert_ne!(
            base,
            edge_id(
                &dst,
                &src,
                &RelationKind::Implements,
                Tier::Declared,
                &sample_provenance()
            )
        );
        // relation
        assert_ne!(
            base,
            edge_id(
                &src,
                &dst,
                &RelationKind::Reviews,
                Tier::Declared,
                &sample_provenance()
            )
        );
        // tier
        assert_ne!(
            base,
            edge_id(
                &src,
                &dst,
                &RelationKind::Implements,
                Tier::Structural,
                &sample_provenance()
            )
        );
        // provenance stable key
        assert_ne!(
            base,
            edge_id(
                &src,
                &dst,
                &RelationKind::Implements,
                Tier::Declared,
                &Provenance::CoreGraph {
                    payload_hash: "x".into(),
                    edge_id: "core-edge-8".into(),
                }
            )
        );
    }

    #[test]
    fn fnv1a_128_matches_known_vectors() {
        // Standard FNV-1a 128 test vectors.
        assert_eq!(fnv1a_128(b""), 0x6c62272e07bb014262b821756295c58d);
        assert_eq!(fnv1a_128(b"a"), 0xd228cb696f1a8caf78912b704e4a8964);
    }
}
