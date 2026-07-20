//! The dedicated, durable A2A run-token lease repository
//! (a2a-product-provisioning W02.P05.S35/S39/S42/S160).
//!
//! A2A run-start mints a bounded per-role token bundle only AFTER the gateway
//! admits the run (ADR D7: admit before mint). Those tokens are the worker's
//! authenticated principal for its authoring commands, and they must be revoked
//! the instant the run terminates, its dispatch fails, or its bounded lifetime
//! expires. This repository is the DURABLE record of that lease lifecycle.
//!
//! It is deliberately SELF-CONTAINED and decoupled from the authoring-session
//! store (S35/S150): its own SQLite file, its own migration ledger, its own
//! schema. Nothing here reads or writes an authoring table, so a2a run admission
//! never entangles with document-authoring persistence.
//!
//! Security invariants (ADR D7, S43):
//! - Only token HASHES are stored — never a raw secret. The raw token exists
//!   transiently at mint time to inject into the gateway payload, and once as a
//!   presented header at resolve time; it never lands in a row, log, or output.
//! - Revocation is by the EXACT hashed bundle of one lease, so two concurrent
//!   runs sharing a role actor revoke independently.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use rusqlite::{Connection, OptionalExtension};

use crate::authoring::actor_tokens::hash_actor_token;
use crate::authoring::actors::{actor_kind_from_name, actor_kind_name};
use crate::authoring::model::{ActorId, ActorRef};

const DB_FILENAME: &str = "a2a-run-leases.sqlite3";
const DATA_DIR: &str = "a2a-run-leases";
const BUSY_TIMEOUT: Duration = Duration::from_secs(10);
const SCHEMA_VERSION: i64 = 3;
const TERMINAL_RETENTION_MS: i64 = 30 * 24 * 3_600 * 1_000;

/// The lifecycle state of a run-token lease. `Reserved` is pre-commit (the
/// gateway has not yet returned an authoritative run id); `Active` binds the
/// authoritative run/thread; `Settled` and `Revoked` are terminal (the bundle is
/// no longer resolvable).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LeaseState {
    Reserved,
    Active,
    Settled,
    Revoked,
}

impl LeaseState {
    fn from_str(s: &str) -> Option<Self> {
        match s {
            "reserved" => Some(LeaseState::Reserved),
            "active" => Some(LeaseState::Active),
            "settled" => Some(LeaseState::Settled),
            "revoked" => Some(LeaseState::Revoked),
            _ => None,
        }
    }

    /// Whether a lease in this state may still resolve a presented token. Only a
    /// Only a durably committed `Active` lease resolves. Pre-commit hashes are
    /// deliberately inert, so a crash or ambiguous response cannot authorize an
    /// actor before the local run/lease binding is durable.
    fn is_resolvable(self) -> bool {
        matches!(self, LeaseState::Active)
    }
}

/// One role's minted token within a bundle: the role label, the token HASH
/// (never the secret), and the actor identity the token authenticates as.
#[derive(Debug, Clone)]
pub struct LeaseToken {
    pub role: String,
    pub token_hash: String,
    pub actor: ActorRef,
}

/// A reservation to persist BEFORE commit: the non-secret lease identity, the
/// reservation (run-start idempotency) id, the bundle id, the per-role token
/// hashes, and the bounded expiry.
#[derive(Debug, Clone)]
pub struct LeaseReservation {
    /// The non-secret, stable lease identity (engine-generated).
    pub lease_id: String,
    /// The run-start reservation / idempotency id the dashboard supplied.
    pub reservation_id: String,
    /// The token-bundle identity.
    pub bundle_id: String,
    /// Dashboard-stable run id known before commit, used for crash repair.
    pub run_id: Option<String>,
    /// The per-role token hashes + actor identities.
    pub tokens: Vec<LeaseToken>,
    /// Bounded lifetime: the lease is revoked-by-expiry after this instant.
    pub expiry_ms: i64,
}

/// A resolved token: the authenticated actor plus the non-secret lease identity
/// it belongs to (carried with the principal, S37/S38).
#[derive(Debug, Clone)]
pub struct ResolvedLease {
    pub actor: ActorRef,
    pub lease_id: String,
    pub role: String,
}

/// A lease row for reconciliation (S160): identity + state + the authoritative
/// run id (once committed) needed to re-query authoritative status.
#[derive(Debug, Clone)]
pub struct LeaseRow {
    pub lease_id: String,
    pub reservation_id: String,
    pub run_id: Option<String>,
    pub thread_id: Option<String>,
    pub state: LeaseState,
    pub expiry_ms: i64,
}

/// The outcome of a terminal settlement (S41): idempotent — a repeat settle of an
/// already-settled lease reports `AlreadySettled` and revokes nothing new.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettleOutcome {
    /// The lease transitioned to settled and its bundle was revoked now.
    Settled { revoked: usize },
    /// The lease was already terminal (settled or revoked); a no-op.
    AlreadyTerminal,
    /// No lease matched the run identity.
    Unknown,
    /// A lease matched the run id but the callback's gateway lease id did not
    /// match the one bound at commit; nothing was settled.
    LeaseMismatch,
}

/// Why a lease-repository operation failed.
#[derive(Debug)]
pub enum LeaseError {
    Sqlite(rusqlite::Error),
    Io(std::io::Error),
    SchemaVersion { found: i64, supported: i64 },
}

impl std::fmt::Display for LeaseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LeaseError::Sqlite(e) => write!(f, "a2a lease store sqlite error: {e}"),
            LeaseError::Io(e) => write!(f, "a2a lease store io error: {e}"),
            LeaseError::SchemaVersion { found, supported } => write!(
                f,
                "a2a lease store schema version {found} exceeds supported {supported}"
            ),
        }
    }
}

impl std::error::Error for LeaseError {}

impl From<rusqlite::Error> for LeaseError {
    fn from(e: rusqlite::Error) -> Self {
        LeaseError::Sqlite(e)
    }
}
impl From<std::io::Error> for LeaseError {
    fn from(e: std::io::Error) -> Self {
        LeaseError::Io(e)
    }
}

type Result<T> = std::result::Result<T, LeaseError>;

/// The migration ledger. One bootstrap migration; new versions append, never
/// mutate a shipped one.
struct Migration {
    version: i64,
    name: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "bootstrap",
        sql: BOOTSTRAP_SCHEMA,
    },
    Migration {
        version: 2,
        name: "gateway_lease_id",
        sql: GATEWAY_LEASE_ID_SCHEMA,
    },
    Migration {
        version: 3,
        name: "unresolved_run_identity",
        sql: UNRESOLVED_RUN_ID_SCHEMA,
    },
];

const UNRESOLVED_RUN_ID_SCHEMA: &str = "
CREATE UNIQUE INDEX idx_a2a_run_leases_unresolved_run
    ON a2a_run_leases (run_id)
    WHERE run_id IS NOT NULL AND state IN ('reserved','active');
";

/// v2 (W02.P05.S39/S41): the gateway MINTS the non-secret run-scoped `lease_id`
/// and returns it at commit; the terminal-settlement callback keys by it. Stored
/// here at commit so settlement can verify the callback's lease id against the
/// bound one (defense-in-depth atop the attach-control auth). Appended as a
/// ledgered migration — the v1 schema shipped, so v1 is never rewritten.
const GATEWAY_LEASE_ID_SCHEMA: &str = "
ALTER TABLE a2a_run_leases ADD COLUMN gateway_lease_id TEXT;
CREATE INDEX idx_a2a_run_leases_gateway_lease
    ON a2a_run_leases (gateway_lease_id) WHERE gateway_lease_id IS NOT NULL;
";

const BOOTSTRAP_SCHEMA: &str = "
CREATE TABLE a2a_run_lease_migrations (
    version       INTEGER NOT NULL,
    name          TEXT NOT NULL,
    applied_at_ms INTEGER NOT NULL,
    PRIMARY KEY (version)
) WITHOUT ROWID;

CREATE TABLE a2a_run_leases (
    lease_id        TEXT NOT NULL,
    reservation_id  TEXT NOT NULL,
    bundle_id       TEXT NOT NULL,
    run_id          TEXT,
    thread_id       TEXT,
    state           TEXT NOT NULL CHECK (state IN ('reserved','active','settled','revoked')),
    expiry_ms       INTEGER NOT NULL,
    created_at_ms   INTEGER NOT NULL,
    updated_at_ms   INTEGER NOT NULL,
    PRIMARY KEY (lease_id)
);
CREATE INDEX idx_a2a_run_leases_run_id ON a2a_run_leases (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX idx_a2a_run_leases_state ON a2a_run_leases (state);
CREATE INDEX idx_a2a_run_leases_expiry ON a2a_run_leases (expiry_ms);

CREATE TABLE a2a_run_lease_tokens (
    token_hash   TEXT NOT NULL,
    lease_id     TEXT NOT NULL,
    role         TEXT NOT NULL,
    actor_id     TEXT NOT NULL,
    actor_kind   TEXT NOT NULL,
    PRIMARY KEY (token_hash),
    FOREIGN KEY (lease_id) REFERENCES a2a_run_leases (lease_id) ON DELETE CASCADE
);
CREATE INDEX idx_a2a_run_lease_tokens_lease ON a2a_run_lease_tokens (lease_id);
";

/// The dedicated durable lease repository. Holds one connection behind a mutex —
/// leases are low-frequency (per run), so a single serialized connection is the
/// simplest correct binding, mirroring the authoring store's single handle.
pub struct LeaseRepo {
    conn: Mutex<Connection>,
    path: PathBuf,
}

impl std::fmt::Debug for LeaseRepo {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LeaseRepo")
            .field("path", &self.path)
            .finish()
    }
}

/// The lease-repo database path under a vault root, isolated from the authoring
/// store's directory.
pub fn db_path(vault_root: &Path) -> PathBuf {
    vault_root.join("data").join(DATA_DIR).join(DB_FILENAME)
}

impl LeaseRepo {
    /// Open (creating + migrating) the lease repository under a vault root.
    pub fn open(vault_root: &Path) -> Result<Self> {
        Self::open_at(&db_path(vault_root))
    }

    /// Open the lease repository at an explicit path (tests isolate with a temp).
    pub fn open_at(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        configure_connection(&conn)?;
        run_migrations(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
            path: path.to_path_buf(),
        })
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Reserve a lease before commit: persist the bundle's token hashes bound to
    /// the non-secret lease identity in the `Reserved` state. The run/thread id
    /// is unknown until commit.
    pub fn reserve(&self, reservation: &LeaseReservation, now_ms: i64) -> Result<()> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        maintain_transaction(&tx, now_ms)?;
        tx.execute(
            "INSERT INTO a2a_run_leases
                (lease_id, reservation_id, bundle_id, run_id, thread_id, state,
                 expiry_ms, created_at_ms, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, NULL, 'reserved', ?5, ?6, ?6)",
            (
                &reservation.lease_id,
                &reservation.reservation_id,
                &reservation.bundle_id,
                &reservation.run_id,
                reservation.expiry_ms,
                now_ms,
            ),
        )?;
        for token in &reservation.tokens {
            tx.execute(
                "INSERT INTO a2a_run_lease_tokens
                    (token_hash, lease_id, role, actor_id, actor_kind)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                (
                    &token.token_hash,
                    &reservation.lease_id,
                    &token.role,
                    token.actor.id.as_str(),
                    actor_kind_name(token.actor.kind),
                ),
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Commit the lease: bind the authoritative A2A run + thread id AND the
    /// gateway-minted non-secret lease id (the identity the terminal callback
    /// keys by), then move to `Active`. Only a `Reserved` lease commits; a repeat
    /// is a no-op (S39).
    pub fn commit(
        &self,
        lease_id: &str,
        run_id: &str,
        thread_id: Option<&str>,
        gateway_lease_id: &str,
        now_ms: i64,
    ) -> Result<bool> {
        let conn = self.lock();
        let changed = conn.execute(
            "UPDATE a2a_run_leases
                SET run_id = ?2, thread_id = ?3, gateway_lease_id = ?4,
                    state = 'active', updated_at_ms = ?5
              WHERE lease_id = ?1 AND state = 'reserved'",
            (lease_id, run_id, thread_id, gateway_lease_id, now_ms),
        )?;
        Ok(changed > 0)
    }

    /// Repair the one pre-commit local row for a remotely durable run after a
    /// dashboard restart or lost local commit write. The stable run id was
    /// recorded at reserve time; the gateway's status supplies the non-secret
    /// lease id. A repeat on an already-active row is a no-op.
    pub fn commit_reserved_run(
        &self,
        run_id: &str,
        gateway_lease_id: &str,
        now_ms: i64,
    ) -> Result<bool> {
        let conn = self.lock();
        let changed = conn.execute(
            "UPDATE a2a_run_leases
                SET gateway_lease_id = ?2, state = 'active', updated_at_ms = ?3
              WHERE run_id = ?1 AND state = 'reserved'",
            (run_id, gateway_lease_id, now_ms),
        )?;
        Ok(changed > 0)
    }

    /// Fail closed on process restart: a reserved row never completed its local
    /// binding transaction, and reserved token hashes are intentionally inert.
    pub fn revoke_all_reserved(&self, now_ms: i64) -> Result<usize> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        let reserved: Vec<String> = {
            let mut stmt = tx.prepare(
                "SELECT lease_id FROM a2a_run_leases WHERE state = 'reserved'",
            )?;
            stmt.query_map([], |r| r.get::<_, String>(0))?
                .collect::<std::result::Result<Vec<_>, _>>()?
        };
        for lease_id in &reserved {
            tx.execute(
                "DELETE FROM a2a_run_lease_tokens WHERE lease_id = ?1",
                [lease_id],
            )?;
            tx.execute(
                "UPDATE a2a_run_leases SET state = 'revoked', updated_at_ms = ?2
                  WHERE lease_id = ?1",
                (lease_id, now_ms),
            )?;
        }
        maintain_transaction(&tx, now_ms)?;
        tx.commit()?;
        Ok(reserved.len())
    }

    /// Run bounded expiry and terminal-row retention maintenance explicitly.
    pub fn maintain(&self, now_ms: i64) -> Result<()> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        maintain_transaction(&tx, now_ms)?;
        tx.commit()?;
        Ok(())
    }

    /// Resolve a presented RAW token to its actor + lease identity, if the lease
    /// is resolvable (reserved/active) and not past expiry. Hash-only lookup; the
    /// raw token is hashed here and never stored.
    pub fn resolve_token(&self, raw_token: &str, now_ms: i64) -> Result<Option<ResolvedLease>> {
        let hash = hash_actor_token(raw_token);
        let conn = self.lock();
        let row = conn
            .query_row(
                "SELECT t.role, t.actor_id, t.actor_kind, l.lease_id, l.state, l.expiry_ms
                   FROM a2a_run_lease_tokens t
                   JOIN a2a_run_leases l ON l.lease_id = t.lease_id
                  WHERE t.token_hash = ?1",
                [&hash],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, String>(4)?,
                        r.get::<_, i64>(5)?,
                    ))
                },
            )
            .optional()?;
        let Some((role, actor_id, actor_kind, lease_id, state, expiry_ms)) = row else {
            return Ok(None);
        };
        let Some(state) = LeaseState::from_str(&state) else {
            return Ok(None);
        };
        if !state.is_resolvable() || now_ms > expiry_ms {
            return Ok(None);
        }
        let Some(actor) = build_actor(&actor_id, &actor_kind) else {
            return Ok(None);
        };
        Ok(Some(ResolvedLease {
            actor,
            lease_id,
            role,
        }))
    }

    /// Revoke a lease's ENTIRE bundle (on dispatch failure or commit failure):
    /// delete its token rows and mark the lease `Revoked`. Idempotent.
    pub fn revoke_lease(&self, lease_id: &str, now_ms: i64) -> Result<bool> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        tx.execute(
            "DELETE FROM a2a_run_lease_tokens WHERE lease_id = ?1",
            [lease_id],
        )?;
        let changed = tx.execute(
            "UPDATE a2a_run_leases
                SET state = 'revoked', updated_at_ms = ?2
              WHERE lease_id = ?1 AND state IN ('reserved','active')",
            (lease_id, now_ms),
        )?;
        tx.commit()?;
        Ok(changed > 0)
    }

    /// Idempotently settle a lease terminal from an attach-control-authenticated
    /// callback (S41): look up by the authoritative run id, VERIFY the callback's
    /// gateway lease id matches the one bound at commit (defense-in-depth atop the
    /// attach-control auth), then mark `Settled` and revoke exactly its hashed
    /// bundle. A repeat on an already-terminal lease is `AlreadyTerminal`; an
    /// unknown run is `Unknown`; a lease-id mismatch is `LeaseMismatch` (settle
    /// nothing).
    pub fn settle_terminal(
        &self,
        run_id: &str,
        gateway_lease_id: &str,
        now_ms: i64,
    ) -> Result<SettleOutcome> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        let existing: Option<(String, String, Option<String>)> = tx
            .query_row(
                "SELECT lease_id, state, gateway_lease_id FROM a2a_run_leases WHERE run_id = ?1",
                [run_id],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, Option<String>>(2)?,
                    ))
                },
            )
            .optional()?;
        let Some((lease_id, state, bound_gateway_lease)) = existing else {
            return Ok(SettleOutcome::Unknown);
        };
        // The callback's lease id must match the one bound at commit. A mismatch
        // (or a run committed without a bound lease id) settles nothing.
        if bound_gateway_lease.as_deref() != Some(gateway_lease_id) {
            return Ok(SettleOutcome::LeaseMismatch);
        }
        if !matches!(
            LeaseState::from_str(&state),
            Some(LeaseState::Reserved | LeaseState::Active)
        ) {
            return Ok(SettleOutcome::AlreadyTerminal);
        }
        let revoked = tx.execute(
            "DELETE FROM a2a_run_lease_tokens WHERE lease_id = ?1",
            [&lease_id],
        )?;
        tx.execute(
            "UPDATE a2a_run_leases SET state = 'settled', updated_at_ms = ?2 WHERE lease_id = ?1",
            (&lease_id, now_ms),
        )?;
        tx.commit()?;
        Ok(SettleOutcome::Settled { revoked })
    }

    /// Every not-yet-terminal lease, for reconciliation against authoritative A2A
    /// run status (S160). Ordered by creation for deterministic bounded walks.
    pub fn unresolved_leases(&self) -> Result<Vec<LeaseRow>> {
        let conn = self.lock();
        let mut stmt = conn.prepare(
            "SELECT lease_id, reservation_id, run_id, thread_id, state, expiry_ms
               FROM a2a_run_leases
              WHERE state IN ('reserved','active')
              ORDER BY created_at_ms ASC",
        )?;
        let rows = stmt
            .query_map([], row_to_lease)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Revoke every lease whose bounded lifetime has elapsed (S160): a lease that
    /// never settled is torn down by expiry so no bundle outlives its window.
    /// Returns the number of leases expired.
    pub fn expire_elapsed(&self, now_ms: i64) -> Result<usize> {
        let mut conn = self.lock();
        let tx = conn.transaction()?;
        let expired: Vec<String> = {
            let mut stmt = tx.prepare(
                "SELECT lease_id FROM a2a_run_leases
                  WHERE state IN ('reserved','active') AND expiry_ms < ?1",
            )?;
            stmt.query_map([now_ms], |r| r.get::<_, String>(0))?
                .collect::<std::result::Result<Vec<_>, _>>()?
        };
        for lease_id in &expired {
            tx.execute(
                "DELETE FROM a2a_run_lease_tokens WHERE lease_id = ?1",
                [lease_id],
            )?;
            tx.execute(
                "UPDATE a2a_run_leases SET state = 'revoked', updated_at_ms = ?2 WHERE lease_id = ?1",
                (lease_id, now_ms),
            )?;
        }
        tx.commit()?;
        Ok(expired.len())
    }

    /// The current state of a lease (test/reconciliation helper).
    pub fn lease_state(&self, lease_id: &str) -> Result<Option<LeaseState>> {
        let conn = self.lock();
        let state: Option<String> = conn
            .query_row(
                "SELECT state FROM a2a_run_leases WHERE lease_id = ?1",
                [lease_id],
                |r| r.get::<_, String>(0),
            )
            .optional()?;
        Ok(state.and_then(|s| LeaseState::from_str(&s)))
    }
}

fn maintain_transaction(tx: &rusqlite::Transaction<'_>, now_ms: i64) -> Result<()> {
    tx.execute(
        "DELETE FROM a2a_run_lease_tokens
          WHERE lease_id IN (
              SELECT lease_id FROM a2a_run_leases
               WHERE state IN ('reserved','active') AND expiry_ms < ?1
          )",
        [now_ms],
    )?;
    tx.execute(
        "UPDATE a2a_run_leases SET state = 'revoked', updated_at_ms = ?1
          WHERE state IN ('reserved','active') AND expiry_ms < ?1",
        [now_ms],
    )?;
    let cutoff = now_ms.saturating_sub(TERMINAL_RETENTION_MS);
    tx.execute(
        "DELETE FROM a2a_run_leases
          WHERE state IN ('settled','revoked') AND updated_at_ms < ?1",
        [cutoff],
    )?;
    Ok(())
}

fn row_to_lease(r: &rusqlite::Row<'_>) -> rusqlite::Result<LeaseRow> {
    let state: String = r.get(4)?;
    Ok(LeaseRow {
        lease_id: r.get(0)?,
        reservation_id: r.get(1)?,
        run_id: r.get(2)?,
        thread_id: r.get(3)?,
        state: LeaseState::from_str(&state).unwrap_or(LeaseState::Revoked),
        expiry_ms: r.get(5)?,
    })
}

fn build_actor(actor_id: &str, actor_kind: &str) -> Option<ActorRef> {
    let id = ActorId::new(actor_id).ok()?;
    let kind = actor_kind_from_name(actor_kind).ok()?;
    Some(ActorRef {
        id,
        kind,
        delegated_by: None,
    })
}

fn configure_connection(conn: &Connection) -> Result<()> {
    conn.busy_timeout(BUSY_TIMEOUT)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(())
}

fn user_version(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row("PRAGMA user_version", [], |r| r.get(0))?)
}

fn run_migrations(conn: &Connection) -> Result<()> {
    let current = user_version(conn)?;
    if current > SCHEMA_VERSION {
        return Err(LeaseError::SchemaVersion {
            found: current,
            supported: SCHEMA_VERSION,
        });
    }
    for migration in MIGRATIONS.iter().filter(|m| m.version > current) {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(migration.sql)?;
        tx.execute(
            "INSERT INTO a2a_run_lease_migrations (version, name, applied_at_ms)
             VALUES (?1, ?2, CAST(strftime('%s','now') AS INTEGER) * 1000)",
            (migration.version, migration.name),
        )?;
        tx.pragma_update(None, "user_version", migration.version)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::authoring::model::ActorKind;

    fn agent(role: &str) -> ActorRef {
        ActorRef {
            id: ActorId::new(format!("agent:{role}")).unwrap(),
            kind: ActorKind::Agent,
            delegated_by: None,
        }
    }

    fn reservation(
        lease: &str,
        reservation_id: &str,
        roles: &[&str],
        expiry_ms: i64,
    ) -> (LeaseReservation, Vec<String>) {
        let mut tokens = Vec::new();
        let mut raws = Vec::new();
        for role in roles {
            let raw = format!("raw-{lease}-{role}");
            tokens.push(LeaseToken {
                role: (*role).to_string(),
                token_hash: hash_actor_token(&raw),
                actor: agent(role),
            });
            raws.push(raw);
        }
        (
            LeaseReservation {
                lease_id: lease.to_string(),
                reservation_id: reservation_id.to_string(),
                bundle_id: format!("bundle-{lease}"),
                run_id: Some(format!("run-{lease}")),
                tokens,
                expiry_ms,
            },
            raws,
        )
    }

    #[test]
    fn migrate_reopen_reserve_commit_resolve_and_settle() {
        let dir = tempfile::tempdir().unwrap();
        let path = super::db_path(dir.path());
        {
            let repo = LeaseRepo::open_at(&path).unwrap();
            let (res, raws) =
                reservation("lease-1", "run-req-1", &["researcher", "planner"], 10_000);
            repo.reserve(&res, 1_000).unwrap();
            // A reserved lease is inert until the authoritative run binding is
            // durable, closing the crash/response-loss authorization window.
            assert!(repo.resolve_token(&raws[0], 1_500).unwrap().is_none());
            // Commit binds the authoritative run id + the gateway lease id.
            assert!(
                repo.commit("lease-1", "run-abc", Some("thread-xyz"), "gw-abc", 2_000)
                    .unwrap()
            );
            assert_eq!(
                repo.lease_state("lease-1").unwrap(),
                Some(LeaseState::Active)
            );
        }
        // Reopen (durability): the migrated (v2) schema + rows survive a fresh handle.
        let repo = LeaseRepo::open_at(&path).unwrap();
        let (_res, raws) = reservation("lease-1", "run-req-1", &["researcher", "planner"], 10_000);
        assert!(repo.resolve_token(&raws[1], 3_000).unwrap().is_some());
        // A callback lease-id mismatch settles nothing.
        assert_eq!(
            repo.settle_terminal("run-abc", "gw-WRONG", 3_500).unwrap(),
            SettleOutcome::LeaseMismatch
        );
        assert!(repo.resolve_token(&raws[0], 3_600).unwrap().is_some());
        // Idempotent terminal settlement revokes the exact bundle; a repeat is a no-op.
        let out = repo.settle_terminal("run-abc", "gw-abc", 4_000).unwrap();
        assert_eq!(out, SettleOutcome::Settled { revoked: 2 });
        assert_eq!(
            repo.lease_state("lease-1").unwrap(),
            Some(LeaseState::Settled)
        );
        assert!(
            repo.resolve_token(&raws[0], 4_500).unwrap().is_none(),
            "settled tokens no longer resolve"
        );
        assert_eq!(
            repo.settle_terminal("run-abc", "gw-abc", 5_000).unwrap(),
            SettleOutcome::AlreadyTerminal
        );
    }

    #[test]
    fn concurrent_runs_for_one_role_revoke_independently() {
        let dir = tempfile::tempdir().unwrap();
        let repo = LeaseRepo::open(dir.path()).unwrap();
        let (res_a, raws_a) = reservation("lease-a", "req-a", &["researcher"], 10_000);
        let (res_b, raws_b) = reservation("lease-b", "req-b", &["researcher"], 10_000);
        repo.reserve(&res_a, 1_000).unwrap();
        repo.reserve(&res_b, 1_000).unwrap();
        repo.commit("lease-a", "run-a", None, "gw-a", 1_100)
            .unwrap();
        repo.commit("lease-b", "run-b", None, "gw-b", 1_100)
            .unwrap();
        // Settle run A: its bundle is revoked; run B (same role actor) is untouched.
        repo.settle_terminal("run-a", "gw-a", 2_000).unwrap();
        assert!(repo.resolve_token(&raws_a[0], 2_100).unwrap().is_none());
        assert!(
            repo.resolve_token(&raws_b[0], 2_100).unwrap().is_some(),
            "the concurrent same-role run's lease is independent"
        );
    }

    #[test]
    fn expiry_revokes_an_unsettled_lease() {
        let dir = tempfile::tempdir().unwrap();
        let repo = LeaseRepo::open(dir.path()).unwrap();
        let (res, raws) = reservation("lease-exp", "req-exp", &["executor"], 5_000);
        repo.reserve(&res, 1_000).unwrap();
        repo.commit("lease-exp", "run-exp", None, "gw-exp", 1_100)
            .unwrap();
        // Before expiry it resolves; the reconciliation walk lists it.
        assert!(repo.resolve_token(&raws[0], 4_000).unwrap().is_some());
        assert_eq!(repo.unresolved_leases().unwrap().len(), 1);
        // At/after expiry it is revoked by the expiry sweep and no longer resolves.
        assert_eq!(repo.expire_elapsed(6_000).unwrap(), 1);
        assert!(repo.resolve_token(&raws[0], 6_500).unwrap().is_none());
        assert_eq!(
            repo.lease_state("lease-exp").unwrap(),
            Some(LeaseState::Revoked)
        );
        assert!(repo.unresolved_leases().unwrap().is_empty());
    }

    #[test]
    fn a_token_past_expiry_does_not_resolve_even_before_the_sweep() {
        let dir = tempfile::tempdir().unwrap();
        let repo = LeaseRepo::open(dir.path()).unwrap();
        let (res, raws) = reservation("lease-t", "req-t", &["reviewer"], 3_000);
        repo.reserve(&res, 1_000).unwrap();
        // now_ms past expiry: resolution refuses even though the sweep has not run.
        assert!(repo.resolve_token(&raws[0], 3_001).unwrap().is_none());
    }
}
