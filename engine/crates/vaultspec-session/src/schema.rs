//! Session and settings table DDL and a migration-free schema init.
//!
//! Best-effort posture (user-state-persistence ADR): there is no
//! `user_version` gate and no migration ladder. `ensure_schema` runs
//! `CREATE TABLE IF NOT EXISTS` on every open; a file whose shape does not
//! match is recreated empty by the store's `open_or_heal`, never migrated.
//!
//! The schema is deliberately simple:
//!
//! - `session` is a per-`(workspace, scope)` blob table. The active scope of
//!   a workspace is stored under the sentinel scope `""` (empty string); each
//!   real `(workspace, scope)` row carries that scope's active folder and its
//!   feature-tag contexts as a JSON blob. This keeps the session a small,
//!   versionless kv surface rather than a wide column set.
//! - `recents` is an append-keyed list of recent selections per workspace,
//!   ordered by a monotonic `position`, deduped by value on write.
//! - `settings` is a kv table whose `scope` column distinguishes global keys
//!   (sentinel scope `""`) from scope-scoped keys.

use rusqlite::Connection;

/// The sentinel scope used for workspace-global rows: the active-scope pointer
/// in `session` and global keys in `settings`.
pub const GLOBAL_SCOPE: &str = "";

const DDL: &str = "
CREATE TABLE IF NOT EXISTS session (
    workspace  TEXT NOT NULL,
    scope      TEXT NOT NULL,
    blob       TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (workspace, scope)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS recents (
    workspace  TEXT NOT NULL,
    position   INTEGER NOT NULL,
    value      TEXT NOT NULL,
    PRIMARY KEY (workspace, position)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_recents_value ON recents (workspace, value);

CREATE TABLE IF NOT EXISTS settings (
    scope      TEXT NOT NULL,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (scope, key)
) WITHOUT ROWID;
";

/// Create the session and settings tables if absent. Idempotent and
/// migration-free: safe to run on every open.
pub fn ensure_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(DDL)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ensure_schema_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        ensure_schema(&conn).unwrap();
        // Running twice must not error (IF NOT EXISTS).
        ensure_schema(&conn).unwrap();
        // All three tables exist.
        for table in ["session", "recents", "settings"] {
            let n: i64 = conn
                .query_row(
                    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?1",
                    [table],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(n, 1, "table {table} must exist");
        }
    }
}
