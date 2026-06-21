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

/// Delete the SQLite database file and its WAL/SHM siblings, if present.
/// A missing file is not an error (the heal path may run before any cache
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

/// Above this size a derived-artifact payload is gzip-compressed at rest
/// (perf-sweep A3). The declared-graph snapshot is ~6 MB of compact JSON that
/// compresses ~10x; per-doc `extract` payloads are small enough that the gzip
/// header would bloat them, so they stay plain. Self-identifying via the gzip
/// magic on read, so old uncompressed rows and new compressed rows coexist with
/// no schema bump or migration.
const COMPRESS_THRESHOLD: usize = 4096;
const GZIP_MAGIC: [u8; 2] = [0x1f, 0x8b];

/// Encode a payload for storage: gzip when large enough to pay, else plain UTF-8
/// bytes. Compression never fails a write — on an encoder error the plain bytes
/// are stored.
fn encode_payload(payload: &str) -> Vec<u8> {
    if payload.len() < COMPRESS_THRESHOLD {
        return payload.as_bytes().to_vec();
    }
    use std::io::Write;
    let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    match enc.write_all(payload.as_bytes()).and_then(|_| enc.finish()) {
        Ok(compressed) => compressed,
        Err(_) => payload.as_bytes().to_vec(),
    }
}

/// Decode a stored payload: gunzip when the gzip magic is present (a new
/// compressed row), else interpret as plain UTF-8 (an old uncompressed row). Our
/// payloads are JSON, which never begins with the gzip magic, so detection is
/// unambiguous.
fn decode_payload(bytes: Vec<u8>) -> Result<String> {
    if bytes.len() >= 2 && bytes[0] == GZIP_MAGIC[0] && bytes[1] == GZIP_MAGIC[1] {
        use std::io::Read;
        let mut out = String::new();
        flate2::read::GzDecoder::new(&bytes[..])
            .read_to_string(&mut out)
            .map_err(StoreError::Io)?;
        Ok(out)
    } else {
        String::from_utf8(bytes)
            .map_err(|e| StoreError::Io(std::io::Error::new(std::io::ErrorKind::InvalidData, e)))
    }
}

/// One row of the persisted temporal event log (contract §5 raw shape:
/// stable seq, ts, kind, ref, node ids).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventRow {
    pub seq: i64,
    pub ts: i64,
    pub kind: String,
    pub git_ref: String,
    pub node_ids: Vec<String>,
    /// How many correlated code-artifact ids were dropped by the wire
    /// bound (contract §5, addendum S05). Set by the live `commit_rows`
    /// path, which both front doors use. The persisted-event read path
    /// (`events_in_range*`) is NOT bound-aware and is currently off-wire
    /// (no serve/CLI caller); it reports 0. Anyone wiring the persisted log
    /// onto a front door must apply the `commit_rows` bound at the persist
    /// seam first, or this field will lie.
    pub truncated_node_ids: u64,
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

    /// Open the canonical store, self-healing a corrupt or unopenable cache.
    ///
    /// The cache is pure, deletable, fully re-derivable (D8.1): a corrupt
    /// `engine.sqlite3` (e.g. a stale WAL after a hard kill) must NOT take the
    /// service down at boot. On an open/corruption failure this deletes the
    /// database file and its WAL/SHM siblings once and recreates the schema.
    /// A schema-version mismatch is *intentionally* fail-loud (D5.1) and is
    /// NOT healed — it propagates unchanged. If the recreate also fails the
    /// error propagates and the caller may still choose to abort.
    pub fn open_or_heal(vault_root: &Path) -> Result<Self> {
        let path = db_path(vault_root);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        match Self::open_at(&path) {
            Ok(store) => Ok(store),
            // Version mismatch stays loud: an operator deliberately wants to
            // know the cache is from an incompatible engine.
            Err(e @ StoreError::SchemaVersion { .. }) => Err(e),
            // Any other open/corruption failure: blow away the deletable cache
            // and try exactly once more.
            Err(_) => {
                remove_db_files(&path)?;
                Self::open_at(&path)
            }
        }
    }

    /// Open the store at an explicit database path (tests, tooling).
    pub fn open_at(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        // A concurrent one-shot CLI and a resident serve process may both
        // hold write connections briefly (dogfood finding DF-4): WAL plus
        // a busy timeout makes contention a wait, never a crash.
        conn.busy_timeout(std::time::Duration::from_secs(10))?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        // Incremental auto-vacuum so the deleted pages from pruning snapshot
        // generations, evicting expired semantic rows, and aging out temporal
        // events can be returned to the OS via `reclaim()` — without it the
        // file only ever grows and a `DELETE` frees pages logically but never
        // shrinks the 100s-of-MB cache (B5, resource-hardening). auto_vacuum can
        // only change on an empty DB or via a one-time VACUUM, so convert any
        // legacy NONE/FULL database exactly once. The VACUUM is best-effort: a
        // concurrent writer holding the lock simply defers conversion to a later
        // open (the pragma persists), never fails the open.
        let auto_vacuum: i64 = conn.query_row("PRAGMA auto_vacuum", [], |r| r.get(0))?;
        if auto_vacuum != 2
            && conn
                .pragma_update(None, "auto_vacuum", "INCREMENTAL")
                .is_ok()
        {
            let _ = conn.execute_batch("VACUUM");
        }
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
            params![kind, input_hash, encode_payload(payload), created_at],
        )?;
        Ok(())
    }

    pub fn get_artifact(&self, kind: &str, input_hash: &str) -> Result<Option<String>> {
        get_artifact(&self.conn, kind, input_hash)
    }

    /// Bound a snapshot-style artifact `kind` to its `keep_newest` most-recently
    /// written rows, deleting older generations. The declared-graph snapshot
    /// mints a fresh, fat payload (megabytes) under a new `input_hash` on every
    /// HEAD change and never replaced the old one — an unbounded leak (observed
    /// in the field at 34 generations / 166 MB for a ~740-doc corpus). The cache
    /// is pure and re-derivable (D8.1), so evicting an old generation costs only
    /// warm-up if a past state is revisited. Returns the number of rows removed.
    pub fn prune_artifacts_keep_newest(&self, kind: &str, keep_newest: usize) -> Result<usize> {
        let n = self.conn.execute(
            "DELETE FROM derived_artifacts
             WHERE kind = ?1 AND input_hash NOT IN (
                 SELECT input_hash FROM derived_artifacts
                 WHERE kind = ?1
                 ORDER BY created_at DESC, input_hash DESC
                 LIMIT ?2
             )",
            params![kind, keep_newest.max(1) as i64],
        )?;
        Ok(n)
    }

    /// Retain only the artifacts of `kind` whose `input_hash` is in `live`,
    /// deleting every stale generation. For per-item caches (e.g. the per-doc
    /// `extract`) keyed by content hash, the live set is exactly the current
    /// corpus and the stale rows are old versions of changed or deleted docs;
    /// age-based eviction is WRONG here (a never-changed doc's row is old but
    /// live), so the caller passes the live key set explicitly. A temp table
    /// keeps this correct for any corpus size (no bound-parameter ceiling).
    /// Returns the number of rows removed.
    pub fn retain_artifacts(&self, kind: &str, live: &[String]) -> Result<usize> {
        self.conn.execute_batch(
            "CREATE TEMP TABLE IF NOT EXISTS _retain_keys (h TEXT PRIMARY KEY);
             DELETE FROM _retain_keys;",
        )?;
        {
            let mut stmt = self
                .conn
                .prepare("INSERT OR IGNORE INTO _retain_keys (h) VALUES (?1)")?;
            for h in live {
                stmt.execute(params![h])?;
            }
        }
        let n = self.conn.execute(
            "DELETE FROM derived_artifacts
             WHERE kind = ?1 AND input_hash NOT IN (SELECT h FROM _retain_keys)",
            params![kind],
        )?;
        Ok(n)
    }

    /// Reclaim free pages and collapse the WAL after a prune/eviction batch
    /// (B5, resource-hardening). `incremental_vacuum` returns the pages freed by
    /// the snapshot/semantic/event prunes to the OS (requires the
    /// `auto_vacuum=INCREMENTAL` set in `open_at`); `wal_checkpoint(TRUNCATE)`
    /// flushes committed frames into the main DB and shrinks the WAL file back to
    /// zero. Best-effort by nature: a checkpoint blocked by a concurrent reader
    /// reclaims what it can now and the rest on the next call.
    pub fn reclaim(&self) -> Result<()> {
        // Full VACUUM compacts the file reliably across journal modes; under WAL,
        // `incremental_vacuum` proved unreliable at returning a populated freelist
        // to the OS (the freed pages stayed in the file). reclaim() runs only on
        // HEAD-change folds, NOT per request, and the underlying stores are now
        // bounded by the snapshot/semantic/event retention, so the compacted file
        // is small and the brief exclusive lock is acceptable; the call site
        // treats a failure (reader contention) as best-effort, deferring to the
        // next fold. The trailing checkpoint(TRUNCATE) shrinks the WAL back to
        // zero so it does not itself become the residual growth.
        self.conn.execute_batch("VACUUM;")?;
        self.conn
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
        Ok(())
    }

    /// Delete temporal events older than `cutoff_ts`, bounding the append-only
    /// event log to a rolling window (B5, resource-hardening). Without this the
    /// `temporal_events` table grew once per correlated commit-event for the
    /// life of the process. The `/events` and lineage reads bound their own time
    /// ranges, so history beyond the window is never served. Returns rows removed.
    pub fn prune_events_before(&self, cutoff_ts: i64) -> Result<usize> {
        let n = self.conn.execute(
            "DELETE FROM temporal_events WHERE ts < ?1",
            params![cutoff_ts],
        )?;
        Ok(n)
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
    use rusqlite::types::Value as SqlValue;
    // Read the raw column value: new rows are BLOB (gzip or plain bytes), but old
    // rows written before A3 are genuinely TEXT-typed and rusqlite refuses to
    // coerce TEXT into Vec<u8> — so branch on the storage type.
    let val: Option<SqlValue> = conn
        .query_row(
            "SELECT payload FROM derived_artifacts WHERE kind = ?1 AND input_hash = ?2",
            params![kind, input_hash],
            |r| r.get(0),
        )
        .optional()?;
    match val {
        None => Ok(None),
        Some(SqlValue::Blob(bytes)) => decode_payload(bytes).map(Some),
        Some(SqlValue::Text(text)) => Ok(Some(text)),
        Some(other) => Err(StoreError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("unexpected payload column type: {other:?}"),
        ))),
    }
}

/// Hard ceiling on rows materialized by a single `events_in_range` read
/// (bounded-by-default-for-every-accumulator). The 90-day retention prune bounds
/// the TABLE, but not a single query: a wide `[from_ts, to_ts]` could otherwise
/// materialize an unbounded `Vec<EventRow>` into memory. This is a fixed backstop
/// that NO caller can opt out of (unlike a caller-supplied limit) — closing the
/// footgun before any front door wires this read to the wire. A wire caller that
/// reaches this cap must still surface truncation honestly (a `truncated` block,
/// mirroring the graph-query ceilings); the cap is the resource-safety floor, not
/// a substitute for that. Sized well above any realistic 90-day window.
const EVENTS_RANGE_CAP: i64 = 50_000;

fn events_in_range(conn: &Connection, from_ts: i64, to_ts: i64) -> Result<Vec<EventRow>> {
    let mut stmt = conn.prepare(
        "SELECT seq, ts, kind, git_ref, node_ids FROM temporal_events
         WHERE ts >= ?1 AND ts <= ?2 ORDER BY seq LIMIT ?3",
    )?;
    let rows = stmt.query_map(params![from_ts, to_ts, EVENTS_RANGE_CAP], |r| {
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
            // This read path is not bound-aware (see EventRow field doc):
            // it is off-wire today, so 0 is correct only until a caller
            // serves it. Bound at the persist seam before that happens.
            truncated_node_ids: 0,
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
    fn large_payloads_compress_and_old_plain_rows_still_decode() {
        let (_dir, path) = temp_db();
        let store = Store::open_at(&path).unwrap();
        // A large payload is gzip-compressed at rest and round-trips exactly.
        let big = "{\"k\":\"".to_string() + &"v".repeat(COMPRESS_THRESHOLD * 4) + "\"}";
        store
            .put_artifact("declared-graph-v2", "h1", &big, 1)
            .unwrap();
        assert_eq!(
            store
                .get_artifact("declared-graph-v2", "h1")
                .unwrap()
                .as_deref(),
            Some(big.as_str())
        );
        let stored: usize = store
            .conn_for_tests()
            .query_row(
                "SELECT length(payload) FROM derived_artifacts WHERE input_hash='h1'",
                [],
                |r| r.get::<_, i64>(0),
            )
            .unwrap() as usize;
        assert!(stored < big.len() / 2, "large payload should compress");
        // A small payload stays plain and round-trips.
        store
            .put_artifact("extract", "h2", "small-json", 2)
            .unwrap();
        assert_eq!(
            store.get_artifact("extract", "h2").unwrap().as_deref(),
            Some("small-json")
        );
        // Backward compatibility: an OLD uncompressed TEXT row decodes correctly.
        store
            .conn_for_tests()
            .execute(
                "INSERT INTO derived_artifacts (kind, input_hash, payload, created_at)
                 VALUES ('extract', 'old', 'plain-uncompressed', 3)",
                [],
            )
            .unwrap();
        assert_eq!(
            store.get_artifact("extract", "old").unwrap().as_deref(),
            Some("plain-uncompressed")
        );
    }

    #[test]
    fn prune_keeps_only_newest_generations_and_is_idempotent() {
        let (_dir, path) = temp_db();
        let store = Store::open_at(&path).unwrap();
        for i in 0..6 {
            store
                .put_artifact("declared-graph-v2", &format!("h{i}"), "payload", i)
                .unwrap();
        }
        assert_eq!(
            store
                .prune_artifacts_keep_newest("declared-graph-v2", 2)
                .unwrap(),
            4
        );
        // The two newest by created_at survive; older generations are gone.
        assert!(
            store
                .get_artifact("declared-graph-v2", "h5")
                .unwrap()
                .is_some()
        );
        assert!(
            store
                .get_artifact("declared-graph-v2", "h4")
                .unwrap()
                .is_some()
        );
        assert!(
            store
                .get_artifact("declared-graph-v2", "h3")
                .unwrap()
                .is_none()
        );
        assert!(
            store
                .get_artifact("declared-graph-v2", "h0")
                .unwrap()
                .is_none()
        );
        // A second prune is a no-op (already within the bound); never deletes the
        // last survivors even with keep_newest below 1.
        assert_eq!(
            store
                .prune_artifacts_keep_newest("declared-graph-v2", 2)
                .unwrap(),
            0
        );
        assert_eq!(
            store
                .prune_artifacts_keep_newest("declared-graph-v2", 0)
                .unwrap(),
            1
        );
        assert!(
            store
                .get_artifact("declared-graph-v2", "h5")
                .unwrap()
                .is_some()
        );
    }

    #[test]
    fn retain_drops_stale_but_keeps_live_regardless_of_age() {
        let (_dir, path) = temp_db();
        let store = Store::open_at(&path).unwrap();
        // h-old is the OLDEST but still live; h-stale is newer but not live —
        // age-based eviction would wrongly drop h-old, so retain must key on the
        // live set, not created_at.
        store.put_artifact("extract", "h-old", "v", 1).unwrap();
        store.put_artifact("extract", "h-stale", "v", 2).unwrap();
        store.put_artifact("extract", "h-new", "v", 3).unwrap();
        let removed = store
            .retain_artifacts("extract", &["h-old".to_string(), "h-new".to_string()])
            .unwrap();
        assert_eq!(removed, 1);
        assert!(store.get_artifact("extract", "h-old").unwrap().is_some());
        assert!(store.get_artifact("extract", "h-new").unwrap().is_some());
        assert!(store.get_artifact("extract", "h-stale").unwrap().is_none());
        // A different kind is untouched by an extract retain.
        store
            .put_artifact("declared-graph-v2", "g1", "v", 1)
            .unwrap();
        store.retain_artifacts("extract", &[]).unwrap();
        assert!(
            store
                .get_artifact("declared-graph-v2", "g1")
                .unwrap()
                .is_some()
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
    fn prune_events_before_bounds_the_log() {
        // B5 (resource-hardening): the append-only event log must age out past a
        // retention cutoff, not grow with the full commit history.
        let (_dir, path) = temp_db();
        let store = Store::open_at(&path).unwrap();
        for ts in [1000, 2000, 3000, 4000] {
            store
                .append_event(ts, "commit", "main", &["c".into()])
                .unwrap();
        }
        let removed = store.prune_events_before(2500).unwrap();
        assert_eq!(removed, 2, "the two events before the cutoff are pruned");
        let survivors = store.events_in_range(0, i64::MAX).unwrap();
        assert_eq!(survivors.len(), 2, "only events at/after the cutoff remain");
        assert!(survivors.iter().all(|e| e.ts >= 2500));
    }

    #[test]
    fn prune_then_reclaim_shrinks_the_db_file() {
        // P01.S03 (reproduce) + B5 (fix): a `DELETE` alone frees pages only
        // logically; with `auto_vacuum=INCREMENTAL` (set in `open_at`),
        // `reclaim()` returns those pages to the OS so the file actually shrinks.
        // Proves the 100s-of-MB cache cannot stay inflated after eviction.
        let (_dir, path) = temp_db();
        let store = Store::open_at(&path).unwrap();
        // Confirm the DB really is in incremental auto-vacuum mode.
        let mode: i64 = store
            .conn
            .query_row("PRAGMA auto_vacuum", [], |r| r.get(0))
            .unwrap();
        assert_eq!(mode, 2, "open_at enables incremental auto_vacuum");

        // Snapshot payloads across 30 generations. Use HIGH-ENTROPY content:
        // payloads are now gzip-compressed at rest (A3), so a repetitive string
        // would collapse to a single page and the vacuum page-reclaim mechanism
        // this test exercises would be unobservable. Hex of an iterating PRNG is
        // high-entropy enough that gzip cannot meaningfully shrink it, so each
        // generation still occupies many real pages.
        let mut state = 0x2545_F491_4F6C_DD1Du64;
        let mut payload = String::with_capacity(210 * 1024);
        while payload.len() < 200 * 1024 {
            state = state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            payload.push_str(&format!("{state:016x}"));
        }
        for i in 0..30 {
            store
                .put_artifact("declared-graph-v2", &format!("h{i}"), &payload, i)
                .unwrap();
        }
        store.reclaim().unwrap();
        let page_count = |s: &Store| -> i64 {
            s.conn
                .query_row("PRAGMA page_count", [], |r| r.get(0))
                .unwrap()
        };
        let before = page_count(&store);

        // Keep only the newest generation, then reclaim the freed pages.
        store
            .prune_artifacts_keep_newest("declared-graph-v2", 1)
            .unwrap();
        store
            .conn
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .unwrap();
        let freelist: i64 = store
            .conn
            .query_row("PRAGMA freelist_count", [], |r| r.get(0))
            .unwrap();
        assert!(
            freelist > 100,
            "the prune DELETE frees pages to the freelist (auto_vacuum on): {freelist}"
        );
        store.reclaim().unwrap();
        let after = page_count(&store);

        assert!(
            after < before / 2,
            "reclaim shrinks the file after pruning: {before} -> {after} pages"
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
    fn corrupt_cache_self_heals() {
        let dir = tempfile::tempdir().unwrap();
        let vault_root = dir.path().join(".vault");
        let path = db_path(&vault_root);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        // A stale WAL / hard-kill artifact: bytes that are not a valid SQLite
        // database. A plain open must fail to parse the header.
        std::fs::write(&path, b"this is not a sqlite database, just garbage\n").unwrap();
        assert!(
            Store::open_at(&path).is_err(),
            "garbage file must fail a plain open"
        );

        // Self-heal: the corrupt file is removed and a fresh schema created.
        let store = Store::open_or_heal(&vault_root).expect("corrupt cache self-heals");
        // The recreated store is fully usable.
        store.put_artifact("extract", "h", "payload", 1).unwrap();
        assert_eq!(
            store.get_artifact("extract", "h").unwrap().as_deref(),
            Some("payload")
        );
    }

    #[test]
    fn open_or_heal_preserves_schema_version_fail_loud() {
        let dir = tempfile::tempdir().unwrap();
        let vault_root = dir.path().join(".vault");
        let path = db_path(&vault_root);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        {
            let store = Store::open_at(&path).unwrap();
            store.conn.pragma_update(None, "user_version", 99).unwrap();
        }
        // A version mismatch is intentionally NOT healed: it stays loud so the
        // healthy-but-incompatible cache is reported, not silently wiped.
        match Store::open_or_heal(&vault_root) {
            Err(StoreError::SchemaVersion { found: 99, .. }) => {}
            other => panic!("expected schema-version error to survive heal, got {other:?}"),
        }
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
