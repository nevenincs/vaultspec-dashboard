//! The single shared query core (engine-spec D6.1).
//!
//! CLI verbs and serve endpoints are thin shells over this crate; no
//! capability exists in only one front door. Scope is fully stateless:
//! every working-tree-dependent query names its scope per request
//! (contract §3).

use engine_graph::LinkageGraph;
use engine_model::ScopeRef;

/// A query-core handle. Placeholder: filter validation/normalization,
/// pagination cursors, as-of reconstruction, and the context assembly all
/// land here so both front doors share them.
#[derive(Debug, Default)]
pub struct QueryCore {
    graph: LinkageGraph,
}

/// Engine-side status rollup placeholder (engine-spec §6, `vaultspec
/// status`): index state, backend health, watcher state.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusReport {
    pub node_count: usize,
    pub edge_count: usize,
    /// Truthful degradation entries, e.g. "rag service down" (contract §2).
    pub degradations: Vec<String>,
}

impl QueryCore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Point-in-time status rollup — the recovery snapshot (contract §6).
    pub fn status(&self) -> StatusReport {
        StatusReport {
            node_count: self.graph.node_count(),
            edge_count: self.graph.edge_count(),
            degradations: vec![
                "engine index not yet implemented (foundation scaffold)".to_string(),
            ],
        }
    }

    /// Validate that a scope reference is well-formed. Placeholder for the
    /// per-request scope validation the contract requires (contract §3).
    pub fn validate_scope(&self, scope: &ScopeRef) -> bool {
        match scope {
            ScopeRef::Worktree { path } => !path.is_empty(),
            ScopeRef::Ref { name } => !name.is_empty(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_reports_empty_scaffold_graph_truthfully() {
        let core = QueryCore::new();
        let status = core.status();
        assert_eq!(status.node_count, 0);
        assert_eq!(status.edge_count, 0);
        assert!(!status.degradations.is_empty());
    }

    #[test]
    fn scope_validation_rejects_empty_refs() {
        let core = QueryCore::new();
        assert!(core.validate_scope(&ScopeRef::Ref {
            name: "main".into()
        }));
        assert!(!core.validate_scope(&ScopeRef::Ref {
            name: String::new()
        }));
    }
}

pub mod envelope;
pub mod events;
pub mod filter;
pub mod graph;
pub mod node;
pub mod ontology;
pub mod pipeline;
