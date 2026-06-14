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
//! - `workspace_registry` is the ordered set of registered project roots
//!   (dashboard-workspace-registry ADR): each row is a git workspace the
//!   operator pointed the dashboard at — a stable id (the canonical git common
//!   dir), an operator label, the absolute root path, a launch-default marker,
//!   and a last-seen reachability state with an optional degradation reason.
//!   It is USER-STATE CONFIG of exactly the class the crate already owns:
//!   registering a root only RECORDS a path, never mutating any repository.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

/// The sentinel scope used for workspace-global rows: the active-scope pointer
/// in `session` and global keys in `settings`.
pub const GLOBAL_SCOPE: &str = "";

/// The settings key under which the active-workspace id is persisted (the
/// dashboard-workspace-registry active-workspace selection). It rides the
/// existing global-settings kv surface so the active workspace survives a reload
/// the same way every other durable selection does — no new table is needed for
/// a single pointer.
pub const ACTIVE_WORKSPACE_KEY: &str = "active_workspace";

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

CREATE TABLE IF NOT EXISTS workspace_registry (
    id            TEXT NOT NULL,
    label         TEXT NOT NULL,
    path          TEXT NOT NULL,
    is_launch     INTEGER NOT NULL,
    position      INTEGER NOT NULL,
    reachable     INTEGER NOT NULL,
    unreachable_reason TEXT,
    updated_at    INTEGER NOT NULL,
    PRIMARY KEY (id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_workspace_registry_position
    ON workspace_registry (position);
";

/// One registered project root in the workspace registry
/// (dashboard-workspace-registry ADR). A `WorkspaceRoot` is USER-STATE CONFIG:
/// it RECORDS a git workspace the operator pointed the dashboard at — it never
/// implies any mutation of the repository it names. Each registered root is
/// READ exactly as the launch workspace is.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkspaceRoot {
    /// The stable workspace id — the canonical git common dir, the same
    /// identity-bearing derivation the rest of the contract uses (a worktree of
    /// the same repository resolves to the same id). Computed by the caller from
    /// a discovered `ingest-git` workspace and passed in; the session crate stays
    /// free of a git dependency (read-and-infer fence).
    pub id: String,
    /// An operator-facing label for the root (defaults to the root directory's
    /// final path component at registration; freely editable later).
    pub label: String,
    /// The absolute root path the operator registered, in the canonical
    /// forward-slash form. The engine READS this path; it never writes there.
    pub path: String,
    /// The launch-default marker (advisory): true for the workspace the engine
    /// auto-registered on first run. Advisory only — it does not gate selection.
    pub is_launch: bool,
    /// Last-seen reachability. A registered root can move or disappear on disk
    /// between sessions; an unreachable root renders degraded and retry-able,
    /// never silently vanishing (the worktree-switcher degraded-entry precedent).
    pub reachable: bool,
    /// The reason a root is unreachable, for copy-tone rendering; `None` when
    /// reachable (not a git workspace / path unreachable / not readable).
    #[serde(default)]
    pub unreachable_reason: Option<String>,
}

/// Create the session, settings, and workspace-registry tables if absent.
/// Idempotent and migration-free: safe to run on every open.
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
        // All four tables exist.
        for table in ["session", "recents", "settings", "workspace_registry"] {
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
