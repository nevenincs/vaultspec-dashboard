//! Salience ontology adapter over the native graph-node-semantics projection.
//!
//! The graph-node-semantics feature is now merged, so its ontology projection
//! (`crate::ontology`) is the single source of truth for the authority register
//! and the aggregate-species hint. This module is a thin adapter that lifts that
//! native projection into the typed shapes the salience composition consumes
//! (the `AuthorityClass` / `LifecyclePhase` enums and the `is_aggregate` bool):
//! `authority_class` and `is_aggregate` DELEGATE to `crate::ontology` (no
//! re-derivation of the register), and `lifecycle_phase` reads the native
//! per-scope `lifecycle` facet directly. Behavior is identical to the pre-merge
//! local derivation; the duplicate register that lived here is gone.

use engine_graph::lifecycle_in_scope;
use engine_model::{Node, ScopeRef};

use crate::ontology;

/// The authority register (graph-node-semantics ADR "Authority class"): each
/// document type names *what kind of question it answers*. The salience lenses
/// bias their teleport toward an authority class, so this is the stable handle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthorityClass {
    /// ADR (and secondarily reference/research): "why is the system this way".
    DesignAuthority,
    /// Plan: "what is being built, how far along".
    RoadmapAuthority,
    /// Execution records: "was this step done, did anything go wrong".
    Evidence,
    /// Audit: "is the work sound".
    Judgment,
    /// Rule: "what binds going forward".
    Law,
    /// Reference/research substrate (grounds design authority).
    Substrate,
    /// Any node without a recognized doc_type (commits, code artifacts, bare
    /// docs): no authority class to bias toward. `.vault/index` feature-index
    /// metanodes are dropped at ingest (index-node-exclusion ADR) and so never
    /// reach this map; a stray one lands here, weighting to zero like any unknown.
    None,
}

/// Map a node to its authority class, lifting the native graph-node-semantics
/// register (`crate::ontology::authority_class`) into the salience enum. The
/// register itself is owned by the semantics projection — `adr -> design`,
/// `plan -> roadmap`, `exec -> evidence`, `audit -> judgment`, `rule -> law`,
/// `reference`/`research -> substrate`, anything else `unknown` ->
/// [`AuthorityClass::None`] — so the two never drift.
pub fn authority_class(node: &Node) -> AuthorityClass {
    match ontology::authority_class(node.doc_type.as_deref()) {
        "design" => AuthorityClass::DesignAuthority,
        "roadmap" => AuthorityClass::RoadmapAuthority,
        "evidence" => AuthorityClass::Evidence,
        "judgment" => AuthorityClass::Judgment,
        "law" => AuthorityClass::Law,
        "substrate" => AuthorityClass::Substrate,
        _ => AuthorityClass::None,
    }
}

/// A type-specific lifecycle phase, collapsed to the cross-type axis the salience
/// lifecycle multiplier needs (graph-node-semantics ADR "Type-specific lifecycle
/// vocabulary", reduced to the in-flight/durable/archived distinction that
/// "recent but archived" and "old but in-flight" both turn on). The per-type
/// vocabulary (ADR `proposed|accepted|deprecated`, plan progress, rule
/// active|superseded) maps onto these phases.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LifecyclePhase {
    /// Actively moving: a plan with incomplete progress, an in-flight feature.
    InFlight,
    /// Settled and durable: a complete plan, an accepted ADR, an active rule.
    Durable,
    /// Retired: an archived feature, a superseded rule, a deprecated ADR.
    Archived,
    /// No lifecycle signal available (no facet lifecycle, no progress).
    Unknown,
}

/// Derive the lifecycle phase from the native per-scope `lifecycle` facet (the
/// same `lifecycle_in_scope` projection the graph slice serves) and the node
/// presence. `Archived` presence is the strongest archived signal. This reads
/// the engine's native lifecycle directly — there is no duplicated derivation to
/// collapse here; the cross-type in-flight/durable/archived reduction is the
/// salience-specific axis the multiplier consumes.
pub fn lifecycle_phase(node: &Node, scope: &ScopeRef) -> LifecyclePhase {
    // An archived facet presence wins: a recent-but-archived node is durable-at-
    // most, never in-flight (the "recent but archived" case the ADR names).
    if node
        .facets
        .iter()
        .find(|f| &f.scope == scope)
        .map(|f| matches!(f.presence, engine_model::Presence::Archived))
        .unwrap_or(false)
    {
        return LifecyclePhase::Archived;
    }
    match lifecycle_in_scope(node, scope) {
        Some(lc) => match lc.state.as_str() {
            // An incomplete progress doc is actively in-flight.
            "active" => LifecyclePhase::InFlight,
            // A fully-checked plan is settled.
            "complete" => LifecyclePhase::Durable,
            "archived" => LifecyclePhase::Archived,
            _ => LifecyclePhase::Durable,
        },
        None => LifecyclePhase::Unknown,
    }
}

/// True when the node is an aggregate species — an execution record collapsible
/// into its parent plan as "N records, M complete" (graph-node-semantics ADR
/// "Aggregate-versus-individual weight hint"; the salience fan-out treatment
/// consumes this). Delegates to the native semantics projection
/// (`crate::ontology::is_aggregate_species`) so the hint has a single owner.
pub fn is_aggregate(node: &Node) -> bool {
    ontology::is_aggregate_species(node.doc_type.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_model::{
        CanonicalKey, Dates, Facet, Lifecycle, NodeKind, Presence, Progress, node_id,
    };

    fn scope() -> ScopeRef {
        ScopeRef::Ref {
            name: "main".into(),
        }
    }

    fn node(doc_type: &str, lifecycle: Option<Lifecycle>, presence: Presence) -> Node {
        Node {
            id: node_id(&CanonicalKey::Document { stem: "x" }),
            kind: NodeKind::Document,
            key: "x".into(),
            title: None,
            doc_type: Some(doc_type.into()),
            dates: Some(Dates {
                created: None,
                modified: Some(0),
                stamped: None,
            }),
            feature_tags: vec![],
            status: None,
            tier: None,
            facets: vec![Facet {
                scope: scope(),
                presence,
                content_hash: None,
                lifecycle,
            }],
        }
    }

    #[test]
    fn authority_register_matches_the_semantics_adr() {
        assert_eq!(
            authority_class(&node("adr", None, Presence::Exists)),
            AuthorityClass::DesignAuthority
        );
        assert_eq!(
            authority_class(&node("plan", None, Presence::Exists)),
            AuthorityClass::RoadmapAuthority
        );
        assert_eq!(
            authority_class(&node("exec", None, Presence::Exists)),
            AuthorityClass::Evidence
        );
        assert_eq!(
            authority_class(&node("audit", None, Presence::Exists)),
            AuthorityClass::Judgment
        );
        assert_eq!(
            authority_class(&node("rule", None, Presence::Exists)),
            AuthorityClass::Law
        );
        // `index` is a metanode dropped at ingest (index-node-exclusion ADR) and
        // is no longer a register; a stray one degrades to None like any unknown.
        assert_eq!(
            authority_class(&node("index", None, Presence::Exists)),
            AuthorityClass::None
        );
        assert_eq!(
            authority_class(&node("research", None, Presence::Exists)),
            AuthorityClass::Substrate
        );
    }

    #[test]
    fn lifecycle_phase_separates_in_flight_durable_archived() {
        let in_flight = node(
            "plan",
            Some(Lifecycle {
                state: "active".into(),
                progress: Some(Progress { done: 1, total: 4 }),
            }),
            Presence::Exists,
        );
        assert_eq!(
            lifecycle_phase(&in_flight, &scope()),
            LifecyclePhase::InFlight
        );

        let complete = node(
            "plan",
            Some(Lifecycle {
                state: "complete".into(),
                progress: Some(Progress { done: 4, total: 4 }),
            }),
            Presence::Exists,
        );
        assert_eq!(
            lifecycle_phase(&complete, &scope()),
            LifecyclePhase::Durable
        );

        // Archived presence wins even with an active lifecycle (recent-but-archived).
        let archived = node(
            "plan",
            Some(Lifecycle {
                state: "active".into(),
                progress: Some(Progress { done: 1, total: 4 }),
            }),
            Presence::Archived,
        );
        assert_eq!(
            lifecycle_phase(&archived, &scope()),
            LifecyclePhase::Archived
        );
    }

    #[test]
    fn exec_records_are_the_aggregate_species() {
        assert!(is_aggregate(&node("exec", None, Presence::Exists)));
        assert!(!is_aggregate(&node("plan", None, Presence::Exists)));
        assert!(!is_aggregate(&node("adr", None, Presence::Exists)));
    }
}
