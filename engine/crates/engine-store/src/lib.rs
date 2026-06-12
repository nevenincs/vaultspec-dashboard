//! Engine-owned persistence: a single-file embedded SQLite store under
//! `.vault/data/engine-data/` (engine-spec §8).
//!
//! Persistence is cache, not truth: it holds derived artifacts keyed by
//! input content hashes (extraction results, temporal correlations, the
//! event log, the semantic TTL cache). Deleting it loses nothing but
//! warm-up time (D8.1); `vaultspec index --full` from a deleted cache must
//! converge to the identical graph (D8.2).

use std::path::{Path, PathBuf};

/// Directory name for the engine cache, sibling convention to rag's
/// `search-data/` — gitignored, invisible to core's scanner.
pub const ENGINE_DATA_DIR: &str = "engine-data";

/// Resolve the engine cache location for a workspace's vault root.
pub fn engine_data_dir(vault_root: &Path) -> PathBuf {
    vault_root.join("data").join(ENGINE_DATA_DIR)
}

/// Handle to the derived-artifact cache. Placeholder: connection management,
/// schema migration, and content-hash-keyed tables arrive with the index
/// pipeline.
#[derive(Debug)]
pub struct Store {
    pub db_path: PathBuf,
}

impl Store {
    /// Describe where the store would live without touching the filesystem.
    pub fn locate(vault_root: &Path) -> Self {
        Store {
            db_path: engine_data_dir(vault_root).join("engine.sqlite3"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn store_lives_under_vault_data_engine_data() {
        let store = Store::locate(Path::new(".vault"));
        let p = store.db_path.to_string_lossy().replace('\\', "/");
        assert_eq!(p, ".vault/data/engine-data/engine.sqlite3");
    }
}
