//! Declared-tier ingestion: vaultspec-core consumed via CLI subprocess with
//! `--json` (engine-spec §5.1).
//!
//! Core is Python, the engine is Rust; the process boundary is the only sane
//! seam. The engine pins the graph schema versions it understands and fails
//! loud on an unknown version rather than guessing (D5.1). Document bodies
//! are read directly from disk/object-DB by `ingest-struct`; this crate owns
//! only the core CLI adapter.

pub mod graph_v2;
pub mod inventory;
pub mod runner;

/// Graph payload schema versions this engine understands. Unknown versions
/// surface as a loud `/status` failure, never a silent guess.
pub const SUPPORTED_GRAPH_SCHEMAS: &[&str] = &["vaultspec.vault.graph.v2"];

/// Inventory schema versions this engine understands (one per verb).
pub const SUPPORTED_LIST_SCHEMAS: &[&str] = &[inventory::LIST_SCHEMA];
pub const SUPPORTED_STATS_SCHEMAS: &[&str] = &[inventory::STATS_SCHEMA];
pub const SUPPORTED_FEATURE_LIST_SCHEMAS: &[&str] = &[inventory::FEATURE_LIST_SCHEMA];

/// Returns true when the engine can ingest the given core graph schema.
pub fn schema_supported(schema: &str) -> bool {
    SUPPORTED_GRAPH_SCHEMAS.contains(&schema)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pins_graph_v2_and_rejects_unknown() {
        assert!(schema_supported("vaultspec.vault.graph.v2"));
        assert!(!schema_supported("vaultspec.vault.graph.v999"));
    }
}
