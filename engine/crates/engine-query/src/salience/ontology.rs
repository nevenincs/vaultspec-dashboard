//! Local ontology derivation — the graph-node-semantics integration seam.
//!
//! integration seam: graph-node-semantics provides authority_class/lifecycle
//! natively. The lens teleport bias, recency, and fan-out treatment read the
//! node-semantics ontology fields (`authority_class`, `lifecycle`, `aggregate`).
//! That sibling feature is built in parallel and its fields are not yet present
//! on `Node` in this worktree. So this module DERIVES the same ontology locally
//! from the existing thin-node fields (`doc_type`, the per-scope `lifecycle`
//! facet, `dates`), using the SAME authority register the graph-node-semantics
//! ADR defines.
//!
//! When the semantics feature lands, this module collapses to thin pass-throughs
//! that read `node.authority_class` / `node.lifecycle` / `node.aggregate`
//! directly; the salience composition above it is unchanged. Keep the register
//! here in lock-step with the semantics ADR until then.

use engine_graph::lifecycle_in_scope;
use engine_model::{Node, ScopeRef};

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
    /// Generated index: a manifest, not authored knowledge.
    Manifest,
    /// Any node without a recognized doc_type (commits, code artifacts, bare
    /// docs): no authority class to bias toward.
    None,
}

/// Map a node to its authority class via its `doc_type` (the `.vault/`
/// subdirectory), using the graph-node-semantics register verbatim:
/// adr -> design-authority; plan -> roadmap-authority; exec -> evidence;
/// audit -> judgment; rule -> law; index -> manifest; reference/research ->
/// substrate (secondary design authority). This is the exact register the
/// semantics ADR pins.
pub fn authority_class(node: &Node) -> AuthorityClass {
    match node.doc_type.as_deref() {
        Some("adr") => AuthorityClass::DesignAuthority,
        Some("plan") => AuthorityClass::RoadmapAuthority,
        Some("exec") => AuthorityClass::Evidence,
        Some("audit") => AuthorityClass::Judgment,
        Some("rule") => AuthorityClass::Law,
        Some("index") => AuthorityClass::Manifest,
        Some("reference") | Some("research") => AuthorityClass::Substrate,
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

/// Derive the lifecycle phase from the existing per-scope `lifecycle` facet
/// (which today carries `state` in {active, complete} from checkbox progress)
/// and the node presence. `Archived` presence is the strongest archived signal.
///
/// integration seam: graph-node-semantics will carry the rich per-type state
/// (ADR status, plan tier, rule active/superseded, feature in_flight/archived)
/// on the node directly; this derivation reads what the thin node carries today.
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
/// consumes this). Derived from `doc_type == "exec"` today.
///
/// integration seam: graph-node-semantics carries an `aggregate` hint flag on the
/// node; this reads doc_type until then.
pub fn is_aggregate(node: &Node) -> bool {
    matches!(node.doc_type.as_deref(), Some("exec"))
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
            }),
            feature_tags: vec![],
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
        assert_eq!(
            authority_class(&node("index", None, Presence::Exists)),
            AuthorityClass::Manifest
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
