//! Engine-owned persistence: a single-file embedded SQLite store under
//! `.vault/data/engine-data/` (engine-spec §8).
//!
//! Persistence is cache, not truth: it holds derived artifacts keyed by
//! input content hashes, the temporal event log, and the semantic TTL
//! cache. Deleting it loses nothing but warm-up time (D8.1);
//! `vaultspec index --full` from a deleted cache must converge to the
//! identical graph (D8.2).
//!
//! Concurrency model (engine-spec §8): **single-writer, many concurrent
//! readers** — the rag posture, kept. [`Store`] is the one writer (owns a
//! read-write connection; `rusqlite::Connection` is `!Sync`, so the type
//! system already prevents shared mutable use); any number of
//! [`ReadHandle`]s may read concurrently, enabled by WAL journaling.

use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags, OptionalExtension, params};

/// Directory name for the engine cache, sibling convention to rag's
/// `search-data/` — gitignored, invisible to core's scanner.
pub const ENGINE_DATA_DIR: &str = "engine-data";

/// Database filename within the engine data directory.
pub const DB_FILENAME: &str = "engine.sqlite3";

/// Current schema version, tracked via `PRAGMA user_version`.
const SCHEMA_VERSION: i64 = 1;

/// Resolve the engine cache directory for a workspace's vault root.
pub fn engine_data_dir(vault_root: &Path) -> PathBuf {
    vault_root.join("data").join(ENGINE_DATA_DIR)
}

/// Resolve the database path for a workspace's vault root.
pub fn db_path(vault_root: &Path) -> PathBuf {
    engine_data_dir(vault_root).join(DB_FILENAME)
}

pub mod events;

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("unsupported schema version {found} (engine supports {supported})")]
    SchemaVersion { found: i64, supported: i64 },
    /// Corrupt `node_ids` payload in the event log — loud, never silent
    /// (audit W01P01-002): the field is the timeline↔stage join key.
    #[error("corrupt event row seq {seq}: {detail}")]
    CorruptEventRow { seq: i64, detail: String },
}

pub type Result<T> = std::result::Result<T, StoreError>;

/// One row of the persisted temporal event log (contract §5 raw shape:
/// stable seq, ts, kind, ref, node ids).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventRow {
    pub seq: i64,
    pub ts: i64,
    pub kind: String,
    pub git_ref: String,
    pub node_ids: Vec<String>,
}

/// The single writer. Open exactly one per process per database.
#[derive(Debug)]
pub struct Store {
    conn: Connection,
}

/// A concurrent reader over the same database (read-only connection; WAL
/// lets readers proceed while the writer writes).
#[derive(Debug)]
pub struct ReadHandle {
    conn: Connection,
}

const SCHEMA: &str = "
CREATE TABLE derived_artifacts (
    kind        TEXT NOT NULL,
    input_hash  TEXT NOT NULL,
    payload     TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (kind, input_hash)
) WITHOUT ROWID;

CREATE TABLE temporal_events (
    seq       INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        INTEGER NOT NULL,
    kind      TEXT NOT NULL,
    git_ref   TEXT NOT NULL,
    node_ids  TEXT NOT NULL
);
CREATE INDEX idx_temporal_events_ts ON temporal_events (ts);

CREATE TABLE semantic_cache (
    cache_key   TEXT PRIMARY KEY,
    payload     TEXT NOT NULL,
    expires_at  INTEGER NOT NULL
) WITHOUT ROWID;
";

impl Store {
    /// Open (creating directories, file, and schema as needed) the
    /// read-write store at the canonical location under `vault_root`.
    pub fn open(vault_root: &Path) -> Result<Self> {
        let path = db_path(vault_root);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        Self::open_at(&path)
    }

    /// Open the store at an explicit database path (tests, tooling).
    pub fn open_at(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        let found: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        match found {
            0 => {
                conn.execute_batch(SCHEMA)?;
                conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
            }
            SCHEMA_VERSION => {}
            other => {
                // Cache, not truth: an unknown version could simply be
                // rebuilt, but failing loud keeps the operator informed
                // (D5.1 posture applied to our own artifacts).
                return Err(StoreError::SchemaVersion {
                    found: other,
                    supported: SCHEMA_VERSION,
                });
            }
        }
        Ok(Store { conn })
    }

    /// Open a concurrent read-only handle to the same database.
    pub fn reader(path: &Path) -> Result<ReadHandle> {
        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        Ok(ReadHandle { conn })
    }

    // --- derived artifacts (content-hash keyed; skip-heavy re-index) -------

    /// Insert or replace a derived artifact for `(kind, input_hash)`.
    pub fn put_artifact(
        &self,
        kind: &str,
        input_hash: &str,
        payload: &str,
        created_at: i64,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO derived_artifacts
             (kind, input_hash, payload, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![kind, input_hash, payload, created_at],
        )?;
        Ok(())
    }

    pub fn get_artifact(&self, kind: &str, input_hash: &str) -> Result<Option<String>> {
        get_artifact(&self.conn, kind, input_hash)
    }

    // --- temporal event log --------------------------------------------------

    /// Append an event; returns its monotonic sequence number.
    pub fn append_event(
        &self,
        ts: i64,
        kind: &str,
        git_ref: &str,
        node_ids: &[String],
    ) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO temporal_events (ts, kind, git_ref, node_ids)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                ts,
                kind,
                git_ref,
                serde_json::to_string(node_ids).expect("string vec")
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn events_in_range(&self, from_ts: i64, to_ts: i64) -> Result<Vec<EventRow>> {
        events_in_range(&self.conn, from_ts, to_ts)
    }

    // --- semantic TTL cache ----------------------------------------------------

    pub fn put_semantic(&self, cache_key: &str, payload: &str, expires_at: i64) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO semantic_cache (cache_key, payload, expires_at)
             VALUES (?1, ?2, ?3)",
            params![cache_key, payload, expires_at],
        )?;
        Ok(())
    }

    /// Fetch a semantic cache entry if it has not expired at `now`.
    pub fn get_semantic(&self, cache_key: &str, now: i64) -> Result<Option<String>> {
        get_semantic(&self.conn, cache_key, now)
    }

    /// Raw connection access for test corruption scenarios only.
    #[cfg(test)]
    pub(crate) fn conn_for_tests(&self) -> &Connection {
        &self.conn
    }

    /// Drop expired semantic entries; returns the number removed.
    pub fn evict_expired_semantic(&self, now: i64) -> Result<usize> {
        let n = self.conn.execute(
            "DELETE FROM semantic_cache WHERE expires_at <= ?1",
            params![now],
        )?;
        Ok(n)
    }
}

impl ReadHandle {
    pub fn get_artifact(&self, kind: &str, input_hash: &str) -> Result<Option<String>> {
        get_artifact(&self.conn, kind, input_hash)
    }

    pub fn events_in_range(&self, from_ts: i64, to_ts: i64) -> Result<Vec<EventRow>> {
        events_in_range(&self.conn, from_ts, to_ts)
    }

    pub fn get_semantic(&self, cache_key: &str, now: i64) -> Result<Option<String>> {
        get_semantic(&self.conn, cache_key, now)
    }
}

// Shared read implementations over any connection.

fn get_artifact(conn: &Connection, kind: &str, input_hash: &str) -> Result<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT payload FROM derived_artifacts WHERE kind = ?1 AND input_hash = ?2",
            params![kind, input_hash],
            |r| r.get(0),
        )
        .optional()?)
}

fn events_in_range(conn: &Connection, from_ts: i64, to_ts: i64) -> Result<Vec<EventRow>> {
    let mut stmt = conn.prepare(
        "SELECT seq, ts, kind, git_ref, node_ids FROM temporal_events
         WHERE ts >= ?1 AND ts <= ?2 ORDER BY seq",
    )?;
    let rows = stmt.query_map(params![from_ts, to_ts], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, i64>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, String>(3)?,
            r.get::<_, String>(4)?,
        ))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (seq, ts, kind, git_ref, node_ids_json) = row?;
        // Corrupt node_ids is a loud, typed error (audit W01P01-002).
        let node_ids = Store::decode_node_ids(seq, &node_ids_json)?;
        out.push(EventRow {
            seq,
            ts,
            kind,
            git_ref,
            node_ids,
        });
    }
    Ok(out)
}

fn get_semantic(conn: &Connection, cache_key: &str, now: i64) -> Result<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT payload FROM semantic_cache WHERE cache_key = ?1 AND expires_at > ?2",
            params![cache_key, now],
            |r| r.get(0),
        )
        .optional()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join(DB_FILENAME);
        (dir, path)
    }

    #[test]
    fn store_lives_under_vault_data_engine_data() {
        let p = db_path(Path::new(".vault"))
            .to_string_lossy()
            .replace('\\', "/");
        assert_eq!(p, ".vault/data/engine-data/engine.sqlite3");
    }

    #[test]
    fn artifacts_round_trip_and_replace_by_hash_key() {
        let (_dir, path) = temp_db();
        let store = Store::open_at(&path).unwrap();
        assert_eq!(store.get_artifact("extract", "h1").unwrap(), None);
        store
            .put_artifact("extract", "h1", "payload-1", 100)
            .unwrap();
        store
            .put_artifact("extract", "h1", "payload-2", 200)
            .unwrap();
        store
            .put_artifact("correlate", "h1", "other-kind", 300)
            .unwrap();
        assert_eq!(
            store.get_artifact("extract", "h1").unwrap().as_deref(),
            Some("payload-2")
        );
        assert_eq!(
            store.get_artifact("correlate", "h1").unwrap().as_deref(),
            Some("other-kind")
        );
    }

    #[test]
    fn event_log_is_monotonic_and_range_queryable() {
        let (_dir, path) = temp_db();
        let store = Store::open_at(&path).unwrap();
        let s1 = store
            .append_event(1000, "commit", "main", &["commit:abc".into()])
            .unwrap();
        let s2 = store
            .append_event(
                2000,
                "doc-modified",
                "main",
                &["doc:x".into(), "feature:y".into()],
            )
            .unwrap();
        assert!(s2 > s1);
        let rows = store.events_in_range(1500, 2500).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].kind, "doc-modified");
        assert_eq!(
            rows[0].node_ids,
            vec!["doc:x".to_string(), "feature:y".to_string()]
        );
    }

    #[test]
    fn semantic_cache_honors_ttl() {
        let (_dir, path) = temp_db();
        let store = Store::open_at(&path).unwrap();
        store.put_semantic("q1", "results", 1000).unwrap();
        assert_eq!(
            store.get_semantic("q1", 999).unwrap().as_deref(),
            Some("results")
        );
        assert_eq!(store.get_semantic("q1", 1000).unwrap(), None);
        assert_eq!(store.evict_expired_semantic(1000).unwrap(), 1);
    }

    #[test]
    fn schema_version_mismatch_fails_loud() {
        let (_dir, path) = temp_db();
        {
            let store = Store::open_at(&path).unwrap();
            store.conn.pragma_update(None, "user_version", 99).unwrap();
        }
        match Store::open_at(&path) {
            Err(StoreError::SchemaVersion { found: 99, .. }) => {}
            other => panic!("expected schema-version error, got {other:?}"),
        }
    }

    #[test]
    fn concurrent_readers_see_writes_under_wal() {
        let (_dir, path) = temp_db();
        let store = Store::open_at(&path).unwrap();
        store.put_artifact("extract", "h-init", "v0", 1).unwrap();

        let readers: Vec<_> = (0..4)
            .map(|_| {
                let path = path.clone();
                std::thread::spawn(move || {
                    let reader = Store::reader(&path).expect("reader opens");
                    // Existing row is visible to every concurrent reader.
                    let initial = reader
                        .get_artifact("extract", "h-init")
                        .expect("read works")
                        .expect("row visible");
                    assert_eq!(initial, "v0");
                    initial
                })
            })
            .collect();

        // Writer keeps writing while readers are live (WAL: no blocking).
        for i in 0..50 {
            store
                .put_artifact("extract", &format!("h{i}"), "v", i)
                .unwrap();
        }
        for handle in readers {
            handle.join().expect("reader thread");
        }

        // A reader opened after the writes sees all of them.
        let reader = Store::reader(&path).unwrap();
        assert_eq!(
            reader.get_artifact("extract", "h49").unwrap().as_deref(),
            Some("v")
        );
        // And the read-only handle cannot write (single-writer discipline is
        // enforced by connection flags, not convention).
        assert!(
            reader
                .conn
                .execute("INSERT INTO semantic_cache VALUES ('k','v',1)", [])
                .is_err()
        );
    }
}
