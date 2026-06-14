//! The in-flight pipeline projection (dashboard-pipeline-wire): the active
//! ADRs and plans in a scope, projected from the linkage graph at query time.
//!
//! "In-flight" is the artifacts a viewer would call live work: ADR and plan
//! document nodes present in the scope whose lifecycle state is non-terminal
//! (an open plan, an accepted-but-not-superseded ADR). The projection is
//! BOUNDED to active artifacts in scope by construction — there is no
//! unbounded full-document slice here, so no node ceiling is needed (the
//! "in-flight" filter is itself the bound, `graph-queries-are-bounded`).
//!
//! Like every other engine projection it is computed at query time and never
//! stored on nodes (engine-spec §4.3); it reads the scope facet's lifecycle
//! through `lifecycle_in_scope` exactly as the graph slice does, so the two
//! agree on a node's state by construction.

use engine_graph::{LinkageGraph, lifecycle_in_scope};
use engine_model::{Node, ScopeRef};
use serde::Serialize;

/// One in-flight artifact: the stable node id, its doc type, title, and the
/// scope-resolved lifecycle state. A flat projection — the consumer renders
/// the right-rail work list from it (`dashboard-pipeline-status`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct InFlightArtifact {
    /// The stable node id (contract §4 identity guarantee, never re-keyed).
    pub id: String,
    /// The vault document type (`adr`, `plan`).
    pub doc_type: String,
    /// The document title, when present.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// The lifecycle state resolved in this scope (`active`, `accepted`, …).
    pub lifecycle_state: String,
}

/// Terminal lifecycle states: an artifact in one of these is no longer
/// in-flight (a closed plan, a superseded/archived decision).
fn is_terminal(state: &str) -> bool {
    matches!(
        state,
        "done" | "complete" | "completed" | "superseded" | "archived" | "rejected"
    )
}

/// Does this node count as an in-flight pipeline artifact in `scope`? It must
/// be an ADR or plan document present in the scope with a non-terminal
/// lifecycle state.
fn in_flight_artifact(node: &Node, scope: &ScopeRef) -> Option<InFlightArtifact> {
    let doc_type = node.doc_type.as_deref()?;
    if !matches!(doc_type, "adr" | "plan") {
        return None;
    }
    let lifecycle = lifecycle_in_scope(node, scope)?;
    if is_terminal(&lifecycle.state) {
        return None;
    }
    Some(InFlightArtifact {
        id: node.id.0.clone(),
        doc_type: doc_type.to_string(),
        title: node.title.clone(),
        lifecycle_state: lifecycle.state.clone(),
    })
}

/// The in-flight pipeline projection for a scope: every active ADR/plan node
/// present in `scope`, sorted by stable id for a deterministic wire order.
pub fn in_flight(graph: &LinkageGraph, scope: &ScopeRef) -> Vec<InFlightArtifact> {
    let mut artifacts: Vec<InFlightArtifact> = graph
        .nodes()
        .filter(|n| n.facets.iter().any(|f| &f.scope == scope))
        .filter_map(|n| in_flight_artifact(n, scope))
        .collect();
    artifacts.sort_by(|a, b| a.id.cmp(&b.id));
    artifacts
}
