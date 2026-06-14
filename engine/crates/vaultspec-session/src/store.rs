//! Best-effort user-state SQLite store.
//!
//! A dedicated `user-state.sqlite3` file co-located with `service.json` and
//! `engine.sqlite3` in the gitignored `.vault/data/engine-data/` zone — a
//! SEPARATE file from the engine cache, reusing `engine-store`'s rusqlite/WAL
//! machinery (user-state-persistence ADR, "Persistence substrate").
//!
//! Corruption discipline is **best-effort**, matching the prototype posture:
//! a corrupt, unopenable, or shape-mismatched file is deleted and recreated
//! empty (the `engine-store` open-or-heal pattern). Unlike the engine cache
//! there is no fail-loud schema-version branch — there is nothing to safeguard,
//! so any unrecognized state is simply recreated. No back-up-aside, no
//! migration ceremony.

use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::Connection;

use crate::schema;

/// Database filename within the engine data directory. A SEPARATE file from
/// `engine-store`'s `engine.sqlite3`, so the cache's own self-heal can never
/// wipe user state as a side effect.
pub const DB_FILENAME: &str = "user-state.sqlite3";

/// How long a contended connection waits before erroring, matching the
/// engine cache's busy-timeout (a resident serve process and a one-shot
/// caller may briefly contend the writer).
const BUSY_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("serde: {0}")]
    Serde(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, StoreError>;

/// Resolve the user-state database path for a workspace's vault root. Reuses
/// `engine_store::engine_data_dir` so the file lands beside `service.json`
/// and `engine.sqlite3`.
pub fn db_path(vault_root: &Path) -> PathBuf {
    engine_store::engine_data_dir(vault_root).join(DB_FILENAME)
}

/// Delete the SQLite database file and its WAL/SHM siblings, if present. A
/// missing file is not an error (the heal path may run before any store
/// exists); only a real removal failure propagates.
fn remove_db_files(path: &Path) -> std::io::Result<()> {
    for suffix in ["", "-wal", "-shm"] {
        let candidate = if suffix.is_empty() {
            path.to_path_buf()
        } else {
            let mut name = path.as_os_str().to_owned();
            name.push(suffix);
            PathBuf::from(name)
        };
        match std::fs::remove_file(&candidate) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e),
        }
    }
    Ok(())
}

/// The single-writer user-state store. Open exactly one per process per
/// database; `rusqlite::Connection` is `!Sync`, so the type system already
/// prevents shared mutable use.
#[derive(Debug)]
pub struct Store {
    conn: Connection,
}

impl Store {
    /// Open the canonical user-state store under `vault_root`, healing a
    /// corrupt or unopenable file by recreating it empty.
    ///
    /// Best-effort posture: any open failure, schema-init failure, or a file
    /// that is not a valid SQLite database is treated as recoverable — the
    /// file (and its WAL/SHM siblings) is removed once and recreated with a
    /// fresh schema. There is no fail-loud branch: nothing here is precious,
    /// so a shape or version mismatch is also recreated. If the recreate also
    /// fails, the error propagates so the caller may degrade honestly.
    pub fn open_or_heal(vault_root: &Path) -> Result<Self> {
        let path = db_path(vault_root);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        match Self::open_at(&path) {
            Ok(store) => Ok(store),
            // Best-effort: ANY failure (corrupt header, stale WAL, schema
            // mismatch) blows away the recreatable file and tries once more.
            Err(_) => {
                remove_db_files(&path)?;
                Self::open_at(&path)
            }
        }
    }

    /// Open the store at an explicit database path (tests, tooling), applying
    /// WAL journaling, the busy-timeout, and the migration-free schema.
    pub fn open_at(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.busy_timeout(BUSY_TIMEOUT)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        schema::ensure_schema(&conn)?;
        Ok(Store { conn })
    }

    /// Borrow the underlying connection for the domain modules.
    pub(crate) fn conn(&self) -> &Connection {
        &self.conn
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn store_lives_beside_service_json_as_a_separate_file() {
        let p = db_path(Path::new(".vault"))
            .to_string_lossy()
            .replace('\\', "/");
        assert_eq!(p, ".vault/data/engine-data/user-state.sqlite3");
    }

    #[test]
    fn open_or_heal_creates_a_usable_store_from_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let vault_root = dir.path().join(".vault");
        let store = Store::open_or_heal(&vault_root).expect("fresh store opens");
        // The schema is present: a trivial query against a created table works.
        let count: i64 = store
            .conn()
            .query_row("SELECT count(*) FROM settings", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn garbage_file_fails_a_plain_open_then_heals() {
        let dir = tempfile::tempdir().unwrap();
        let vault_root = dir.path().join(".vault");
        let path = db_path(&vault_root);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, b"this is not a sqlite database, just garbage\n").unwrap();
        assert!(
            Store::open_at(&path).is_err(),
            "garbage file must fail a plain open"
        );
        // Best-effort heal recreates an empty, usable store.
        let store = Store::open_or_heal(&vault_root).expect("corrupt store self-heals");
        let count: i64 = store
            .conn()
            .query_row("SELECT count(*) FROM session", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
}
