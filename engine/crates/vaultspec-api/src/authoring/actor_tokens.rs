//! Per-principal actor tokens (ASA-010): the server-held principal-identity seam.
//!
//! Authoring actor identity MUST resolve from a server-held seam, never a request
//! body (security-provenance ADR `actor-identity-resolves-from-a-server-held-
//! principal-seam`). This module is that seam's PERSISTENCE: a hashed, bounded,
//! revocable per-principal token, issued over the P19 actor REGISTRY, and
//! resolved back to the registered `ActorRef` by the route-layer principal
//! middleware. The store holds ONLY the token HASH — the raw token is returned
//! exactly ONCE at issuance and is never logged or persisted in cleartext.
#![allow(dead_code)]

use ingest_struct::reader::blob_oid;
use serde::{Deserialize, Serialize};

use super::actors::actor_kind_name;
use super::model::{ActorId, ActorRef};
use super::store::unit_of_work::{Repository, SqliteRepository, UnitOfWork};
use super::store::{Result as StoreResult, StoreError};

const ACTOR_TOKEN_SCHEMA: &str = "authoring.actor_token.v1";

/// Ceiling on a token's lifetime (resource-bounds: a credential is bounded at
/// creation). A caller-supplied lifetime is clamped to this.
pub const MAX_ACTOR_TOKEN_LIFETIME_MS: i64 = 90 * 24 * 3600 * 1000; // 90 days

/// Hard ceiling across every retained actor-token row. Issuance opportunistically
/// removes expired and revoked credentials before measuring this bound, then
/// refuses a genuinely new live row at the ceiling. Live credentials are never
/// evicted to make room: silently revoking an unrelated principal would weaken
/// identity more than a typed capacity refusal.
pub const MAX_ACTOR_TOKEN_ROWS: usize = 4096;

/// A purpose key is non-secret lifecycle metadata, not caller-controlled token
/// material. It is bounded so an idempotency label cannot become an unbounded
/// SQLite value. The A2A broker's `run_id + role` keys are below 256 bytes.
const MAX_ACTOR_TOKEN_ISSUANCE_KEY_BYTES: usize = 512;

/// V1 issuance authority. The security-provenance ADR models an `administer
/// policy` permission, but P19 delivered the actor registry + provenance, NOT a
/// permission-enforcement module — so V1 makes the MACHINE service token the sole
/// holder of administer-policy: the route layer gates token issuance on the
/// machine bearer, and every issuance records its `issued_by` bootstrap principal
/// (the audited trust root). RETURN TRIGGER: when a permission module lands
/// (multi-user), narrow the administer-policy holder set to administrator
/// principals — the seam (issued_by recorded + audited) does not change.
pub const V1_ADMINISTER_POLICY_HOLDER: &str = "machine-service-token";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ActorTokenRecord {
    pub schema_version: String,
    pub token_hash: String,
    pub actor: ActorRef,
    /// The principal that ISSUED this token — the audited trust root. In V1 the
    /// bootstrap system actor under the machine token's administer-policy.
    pub issued_by: ActorId,
    pub issued_at_ms: i64,
    pub expires_at_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revoked_at_ms: Option<i64>,
}

impl ActorTokenRecord {
    fn is_live(&self, now_ms: i64) -> bool {
        self.revoked_at_ms.is_none() && now_ms < self.expires_at_ms
    }
}

/// A freshly issued token: the RAW secret (returned to the caller exactly once)
/// plus its stored record (hash only). The raw token is never logged/persisted.
#[derive(Clone)]
pub struct IssuedActorToken {
    pub raw_token: String,
    pub record: ActorTokenRecord,
}

impl std::fmt::Debug for IssuedActorToken {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("IssuedActorToken")
            .field("raw_token", &"<redacted>")
            .field("record", &self.record)
            .finish()
    }
}

/// Hash a raw token for storage + lookup (blake2b via `blob_oid`). The raw token
/// is never stored or compared directly.
pub fn hash_actor_token(raw_token: &str) -> String {
    blob_oid(raw_token.as_bytes())
}

/// A cryptographically-random 32-byte token, hex-encoded (mirrors the engine's
/// bearer-token generation: OS CSPRNG via getrandom, hex shape).
pub(crate) fn generate_raw_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("OS CSPRNG unavailable for actor token");
    let mut hex = String::with_capacity(64);
    for b in bytes {
        use std::fmt::Write as _;
        let _ = write!(hex, "{b:02x}");
    }
    hex
}

pub struct ActorTokenRepository<'repo, 'conn> {
    repo: SqliteRepository<'repo, 'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn actor_tokens<'repo>(&'repo self) -> ActorTokenRepository<'repo, 'conn> {
        ActorTokenRepository {
            repo: self.repository("authoring_actor_tokens"),
        }
    }
}

impl ActorTokenRepository<'_, '_> {
    /// Issue a per-principal token for `actor`, authorized by `issued_by` (the
    /// administer-policy holder — the machine bootstrap actor in V1). Returns the
    /// RAW token ONCE; persists only its hash. The lifetime is clamped bounded.
    pub fn issue(
        &self,
        actor: &ActorRef,
        issued_by: &ActorId,
        issued_at_ms: i64,
        lifetime_ms: i64,
    ) -> StoreResult<IssuedActorToken> {
        self.issue_inner(actor, issued_by, issued_at_ms, lifetime_ms, None)
    }

    /// Issue or ROTATE the one token row assigned to a stable, non-secret
    /// `issuance_key`. The raw secret is still random and returned only once; it
    /// is never made recoverable from the key. A caller may rotate only after its
    /// external idempotency preflight proves the associated operation does not
    /// already exist. Reusing a key for another actor is refused.
    pub fn issue_for_purpose(
        &self,
        actor: &ActorRef,
        issued_by: &ActorId,
        issued_at_ms: i64,
        lifetime_ms: i64,
        issuance_key: &str,
    ) -> StoreResult<IssuedActorToken> {
        if issuance_key.is_empty() || issuance_key.len() > MAX_ACTOR_TOKEN_ISSUANCE_KEY_BYTES {
            return Err(StoreError::ActorToken(format!(
                "issuance_key must be 1..={MAX_ACTOR_TOKEN_ISSUANCE_KEY_BYTES} bytes"
            )));
        }
        self.issue_inner(
            actor,
            issued_by,
            issued_at_ms,
            lifetime_ms,
            Some(issuance_key),
        )
    }

    fn issue_inner(
        &self,
        actor: &ActorRef,
        issued_by: &ActorId,
        issued_at_ms: i64,
        lifetime_ms: i64,
        issuance_key: Option<&str>,
    ) -> StoreResult<IssuedActorToken> {
        if issued_at_ms < 0 {
            return Err(StoreError::ActorToken(
                "issued_at_ms must be non-negative".to_string(),
            ));
        }

        // Reclaim dead credentials before measuring the hard table ceiling. This
        // is deliberately inside the caller's unit of work: a later issuance
        // failure rolls the prune back with the attempted write.
        self.prune_reclaimable(issued_at_ms)?;

        let existing = match issuance_key {
            Some(key) => self.record_by_issuance_key(key)?,
            None => None,
        };
        if let Some(record) = &existing
            && record.actor != *actor
        {
            return Err(StoreError::ActorToken(format!(
                "issuance_key is already assigned to actor `{}`",
                record.actor.id.as_str()
            )));
        }
        if existing.is_none() && self.count_total()? >= MAX_ACTOR_TOKEN_ROWS {
            return Err(StoreError::ActorToken(format!(
                "actor-token store has reached its {MAX_ACTOR_TOKEN_ROWS}-row ceiling"
            )));
        }

        let bounded_lifetime = lifetime_ms.clamp(1, MAX_ACTOR_TOKEN_LIFETIME_MS);
        let raw_token = generate_raw_token();
        let record = ActorTokenRecord {
            schema_version: ACTOR_TOKEN_SCHEMA.to_string(),
            token_hash: hash_actor_token(&raw_token),
            actor: actor.clone(),
            issued_by: issued_by.clone(),
            issued_at_ms,
            expires_at_ms: issued_at_ms.saturating_add(bounded_lifetime),
            revoked_at_ms: None,
        };
        let record_json = serde_json::to_string(&record)
            .map_err(|err| StoreError::ActorToken(err.to_string()))?;
        if issuance_key.is_some() && existing.is_some() {
            self.repo.execute(
                "UPDATE authoring_actor_tokens
                 SET token_hash = ?2,
                     actor_id = ?3,
                     actor_kind = ?4,
                     delegated_by_actor_id = ?5,
                     issued_by_actor_id = ?6,
                     issued_at_ms = ?7,
                     expires_at_ms = ?8,
                     revoked_at_ms = NULL,
                     record_json = ?9
                 WHERE issuance_key = ?1",
                rusqlite::params![
                    issuance_key,
                    record.token_hash.as_str(),
                    record.actor.id.as_str(),
                    actor_kind_name(record.actor.kind),
                    record.actor.delegated_by.as_ref().map(ActorId::as_str),
                    record.issued_by.as_str(),
                    record.issued_at_ms,
                    record.expires_at_ms,
                    record_json.as_str(),
                ],
            )?;
        } else {
            self.repo.execute(
                "INSERT INTO authoring_actor_tokens
                    (token_hash, actor_id, actor_kind, delegated_by_actor_id,
                     issued_by_actor_id, issued_at_ms, expires_at_ms, revoked_at_ms,
                     record_json, issuance_key)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                rusqlite::params![
                    record.token_hash.as_str(),
                    record.actor.id.as_str(),
                    actor_kind_name(record.actor.kind),
                    record.actor.delegated_by.as_ref().map(ActorId::as_str),
                    record.issued_by.as_str(),
                    record.issued_at_ms,
                    record.expires_at_ms,
                    record.revoked_at_ms,
                    record_json.as_str(),
                    issuance_key,
                ],
            )?;
        }
        Ok(IssuedActorToken { raw_token, record })
    }

    /// Resolve a presented RAW token to its registered `ActorRef`, or `None` when
    /// the token is unknown, expired, or revoked. Bounded hash-lookup read.
    pub fn resolve(&self, raw_token: &str, now_ms: i64) -> StoreResult<Option<ActorRef>> {
        let Some(record) = self.record_by_hash(&hash_actor_token(raw_token))? else {
            return Ok(None);
        };
        Ok(if record.is_live(now_ms) {
            Some(record.actor)
        } else {
            None
        })
    }

    /// Revoke a token by its RAW value. Idempotent: an already-revoked token stays
    /// revoked with its original revocation time. Returns whether the token exists.
    pub fn revoke(&self, raw_token: &str, now_ms: i64) -> StoreResult<bool> {
        let token_hash = hash_actor_token(raw_token);
        let Some(record) = self.record_by_hash(&token_hash)? else {
            return Ok(false);
        };
        if record.revoked_at_ms.is_none() {
            self.revoke_hash(&token_hash, record, now_ms)?;
        }
        Ok(true)
    }

    /// Revoke a bounded set of just-issued credentials by HASH. This cleanup
    /// seam lets a broker discard failed-attempt secrets without retaining or
    /// re-presenting their raw values. Returns the number newly revoked.
    pub fn revoke_hashes(&self, token_hashes: &[String], now_ms: i64) -> StoreResult<usize> {
        let mut revoked = 0usize;
        for token_hash in token_hashes {
            let Some(record) = self.record_by_hash(token_hash)? else {
                continue;
            };
            if record.revoked_at_ms.is_none() {
                self.revoke_hash(token_hash, record, now_ms)?;
                revoked += 1;
            }
        }
        Ok(revoked)
    }

    /// Delete credentials that can no longer authenticate: every revoked row and
    /// every row whose expiry is at or before `now_ms`. Live rows are untouched.
    /// Called opportunistically by issuance and by failed-attempt cleanup.
    pub fn prune_reclaimable(&self, now_ms: i64) -> StoreResult<usize> {
        if now_ms < 0 {
            return Err(StoreError::ActorToken(
                "prune time must be non-negative".to_string(),
            ));
        }
        self.repo.execute(
            "DELETE FROM authoring_actor_tokens
             WHERE revoked_at_ms IS NOT NULL OR expires_at_ms <= ?1",
            [now_ms],
        )
    }

    /// Number of retained rows after any caller-selected prune. This is the
    /// repository's hard-cap measurement and a useful diagnostics read.
    pub fn count_total(&self) -> StoreResult<usize> {
        let count: i64 =
            self.repo
                .query_row("SELECT count(*) FROM authoring_actor_tokens", [], |row| {
                    row.get(0)
                })?;
        Ok(count.max(0) as usize)
    }

    /// Revoke ALL live tokens for a principal — the operator-facing admin verb
    /// (arch-reviewer advisory): an operator can revoke a LOST token whose raw
    /// value they no longer hold. Returns the count revoked; idempotent per row
    /// (already-revoked rows are skipped by the `revoked_at_ms IS NULL` filter).
    /// Rewrites each row's `record_json` (the resolve source of truth), not just
    /// the column.
    pub fn revoke_all_for_actor(&self, actor: &ActorRef, now_ms: i64) -> StoreResult<usize> {
        let rows = self.repo.query_collect(
            "SELECT token_hash, record_json
             FROM authoring_actor_tokens
             WHERE actor_id = ?1 AND actor_kind = ?2 AND revoked_at_ms IS NULL",
            rusqlite::params![actor.id.as_str(), actor_kind_name(actor.kind)],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )?;
        let mut revoked = 0usize;
        for (token_hash, json) in rows {
            let mut record: ActorTokenRecord = serde_json::from_str(&json)
                .map_err(|err| StoreError::ActorToken(err.to_string()))?;
            record.revoked_at_ms = Some(now_ms);
            let record_json = serde_json::to_string(&record)
                .map_err(|err| StoreError::ActorToken(err.to_string()))?;
            self.repo.execute(
                "UPDATE authoring_actor_tokens
                 SET revoked_at_ms = ?2, record_json = ?3
                 WHERE token_hash = ?1",
                rusqlite::params![token_hash.as_str(), now_ms, record_json.as_str()],
            )?;
            revoked += 1;
        }
        Ok(revoked)
    }

    fn record_by_hash(&self, token_hash: &str) -> StoreResult<Option<ActorTokenRecord>> {
        let json = self.repo.query_optional(
            "SELECT record_json FROM authoring_actor_tokens WHERE token_hash = ?1",
            [token_hash],
            |row| row.get::<_, String>(0),
        )?;
        match json {
            Some(json) => Ok(Some(
                serde_json::from_str(&json)
                    .map_err(|err| StoreError::ActorToken(err.to_string()))?,
            )),
            None => Ok(None),
        }
    }

    fn record_by_issuance_key(&self, issuance_key: &str) -> StoreResult<Option<ActorTokenRecord>> {
        let json = self.repo.query_optional(
            "SELECT record_json
             FROM authoring_actor_tokens
             WHERE issuance_key = ?1",
            [issuance_key],
            |row| row.get::<_, String>(0),
        )?;
        match json {
            Some(json) => Ok(Some(
                serde_json::from_str(&json)
                    .map_err(|err| StoreError::ActorToken(err.to_string()))?,
            )),
            None => Ok(None),
        }
    }

    fn revoke_hash(
        &self,
        token_hash: &str,
        mut record: ActorTokenRecord,
        now_ms: i64,
    ) -> StoreResult<()> {
        record.revoked_at_ms = Some(now_ms);
        let record_json = serde_json::to_string(&record)
            .map_err(|err| StoreError::ActorToken(err.to_string()))?;
        self.repo.execute(
            "UPDATE authoring_actor_tokens
             SET revoked_at_ms = ?2, record_json = ?3
             WHERE token_hash = ?1",
            rusqlite::params![token_hash, now_ms, record_json.as_str()],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::authoring::model::{ActorKind, CommandKind};
    use crate::authoring::store::Store;

    fn actor(id: &str, kind: ActorKind) -> ActorRef {
        ActorRef {
            id: ActorId::new(id).unwrap(),
            kind,
            delegated_by: None,
        }
    }

    fn admin() -> ActorId {
        ActorId::new("system:bootstrap").unwrap()
    }

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(&dir.path().join(".vault")).unwrap();
        (dir, store)
    }

    #[test]
    fn issue_returns_the_raw_token_once_and_stores_only_its_hash() {
        let (_dir, mut store) = temp_store();
        let agent = actor("agent:writer", ActorKind::Agent);

        let issued = store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                Ok(uow.actor_tokens().issue(&agent, &admin(), 100, 3_600_000))
            })
            .unwrap()
            .unwrap();

        // Stored value is the HASH, never the raw token.
        assert_ne!(issued.record.token_hash, issued.raw_token);
        assert_eq!(
            issued.record.token_hash,
            hash_actor_token(&issued.raw_token)
        );
        let rendered = format!("{issued:?}");
        assert!(rendered.contains("<redacted>"));
        assert!(!rendered.contains(&issued.raw_token));
        assert_eq!(issued.record.actor, agent);
        assert_eq!(issued.record.issued_by, admin());
        assert_eq!(issued.record.expires_at_ms, 100 + 3_600_000);
    }

    #[test]
    fn resolve_maps_a_live_token_to_the_registered_actor() {
        let (_dir, mut store) = temp_store();
        let agent = actor("agent:writer", ActorKind::Agent);
        let issued = store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                Ok(uow.actor_tokens().issue(&agent, &admin(), 100, 3_600_000))
            })
            .unwrap()
            .unwrap();

        let resolved = store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                uow.actor_tokens().resolve(&issued.raw_token, 200)
            })
            .unwrap();
        assert_eq!(resolved, Some(agent));
    }

    #[test]
    fn resolve_rejects_unknown_expired_and_revoked_tokens() {
        let (_dir, mut store) = temp_store();
        let agent = actor("agent:writer", ActorKind::Agent);
        let issued = store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                Ok(uow.actor_tokens().issue(&agent, &admin(), 100, 1000))
            })
            .unwrap()
            .unwrap();

        store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                // Unknown token → None.
                assert_eq!(uow.actor_tokens().resolve("deadbeef", 200)?, None);
                // Expired (now >= expires_at 1100) → None.
                assert_eq!(uow.actor_tokens().resolve(&issued.raw_token, 5000)?, None);
                Ok(())
            })
            .unwrap();

        // Revoke → resolve None; revoke is idempotent + reports existence.
        store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                assert!(uow.actor_tokens().revoke(&issued.raw_token, 300)?);
                assert!(uow.actor_tokens().revoke(&issued.raw_token, 400)?);
                assert!(!uow.actor_tokens().revoke("deadbeef", 400)?);
                assert_eq!(uow.actor_tokens().resolve(&issued.raw_token, 500)?, None);
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn lifetime_is_clamped_to_the_bound() {
        let (_dir, mut store) = temp_store();
        let agent = actor("agent:writer", ActorKind::Agent);
        let issued = store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                Ok(uow.actor_tokens().issue(&agent, &admin(), 0, i64::MAX))
            })
            .unwrap()
            .unwrap();
        assert_eq!(issued.record.expires_at_ms, MAX_ACTOR_TOKEN_LIFETIME_MS);
    }

    #[test]
    fn revoke_all_for_actor_revokes_a_lost_token_by_principal() {
        let (_dir, mut store) = temp_store();
        let a = actor("agent:writer", ActorKind::Agent);
        let b = actor("agent:other", ActorKind::Agent);

        let (a1, a2, b1) = store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                let t = uow.actor_tokens();
                let a1 = t.issue(&a, &admin(), 100, 3_600_000)?.raw_token;
                let a2 = t.issue(&a, &admin(), 100, 3_600_000)?.raw_token;
                let b1 = t.issue(&b, &admin(), 100, 3_600_000)?.raw_token;
                Ok((a1, a2, b1))
            })
            .unwrap();

        store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                let t = uow.actor_tokens();
                // An operator who lost the raw values revokes ALL of A's tokens.
                assert_eq!(t.revoke_all_for_actor(&a, 200)?, 2);
                // A's tokens no longer resolve; B is unaffected.
                assert_eq!(t.resolve(&a1, 300)?, None);
                assert_eq!(t.resolve(&a2, 300)?, None);
                assert_eq!(t.resolve(&b1, 300)?, Some(b.clone()));
                // Idempotent: nothing live remains for A.
                assert_eq!(t.revoke_all_for_actor(&a, 400)?, 0);
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn stable_purpose_rotates_one_random_secret_without_growing_rows() {
        let (_dir, mut store) = temp_store();
        let agent = actor("agent:writer", ActorKind::Agent);

        let (first, second, rows) = store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                let tokens = uow.actor_tokens();
                let first = tokens.issue_for_purpose(
                    &agent,
                    &admin(),
                    100,
                    3_600_000,
                    "a2a-run-start:v1:run-7:writer",
                )?;
                let second = tokens.issue_for_purpose(
                    &agent,
                    &admin(),
                    200,
                    3_600_000,
                    "a2a-run-start:v1:run-7:writer",
                )?;
                Ok((first, second, tokens.count_total()?))
            })
            .unwrap();

        assert_ne!(
            first.raw_token, second.raw_token,
            "a purpose key is lifecycle metadata, never a deterministic secret"
        );
        assert_eq!(rows, 1, "rotation updates the purpose row in place");
        assert_eq!(
            store
                .with_unit_of_work(CommandKind::CreateSession, |uow| {
                    uow.actor_tokens().resolve(&first.raw_token, 300)
                })
                .unwrap(),
            None,
            "the rotated-out token hash no longer authenticates"
        );
        assert_eq!(
            store
                .with_unit_of_work(CommandKind::CreateSession, |uow| {
                    uow.actor_tokens().resolve(&second.raw_token, 300)
                })
                .unwrap(),
            Some(agent)
        );
    }

    #[test]
    fn issuance_prunes_expired_and_revoked_rows_before_capacity_measurement() {
        let (_dir, mut store) = temp_store();
        let a = actor("agent:a", ActorKind::Agent);
        let b = actor("agent:b", ActorKind::Agent);
        let retained = store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                let tokens = uow.actor_tokens();
                let expired = tokens.issue(&a, &admin(), 100, 10)?.raw_token;
                let revoked = tokens.issue(&a, &admin(), 100, 10_000)?.raw_token;
                assert!(tokens.revoke(&revoked, 105)?);
                assert_eq!(tokens.count_total()?, 2);

                // The next real issuance at t=200 removes both dead rows first.
                let live = tokens.issue(&b, &admin(), 200, 10_000)?;
                assert_eq!(tokens.count_total()?, 1);
                assert_eq!(tokens.resolve(&expired, 200)?, None);
                Ok(live.raw_token)
            })
            .unwrap();
        assert_eq!(
            store
                .with_unit_of_work(CommandKind::CreateSession, |uow| {
                    uow.actor_tokens().resolve(&retained, 300)
                })
                .unwrap(),
            Some(b)
        );
    }

    /// Concatenate EVERY column of EVERY actor-token row from the real on-disk
    /// store, so a test can prove no raw secret ever landed in persistence — not
    /// in a dedicated column, not smuggled into `record_json`.
    fn dump_actor_token_rows(db_path: &std::path::Path) -> String {
        use rusqlite::types::ValueRef;
        let conn = rusqlite::Connection::open(db_path).unwrap();
        let mut stmt = conn.prepare("SELECT * FROM authoring_actor_tokens").unwrap();
        let column_count = stmt.column_count();
        let mut dumped = String::new();
        let mut rows = stmt.query([]).unwrap();
        while let Some(row) = rows.next().unwrap() {
            for index in 0..column_count {
                match row.get_ref(index).unwrap() {
                    ValueRef::Text(bytes) => dumped.push_str(&String::from_utf8_lossy(bytes)),
                    ValueRef::Blob(bytes) => dumped.push_str(&String::from_utf8_lossy(bytes)),
                    ValueRef::Integer(value) => dumped.push_str(&value.to_string()),
                    ValueRef::Real(value) => dumped.push_str(&value.to_string()),
                    ValueRef::Null => {}
                }
                dumped.push('\n');
            }
        }
        dumped
    }

    /// S43: two concurrent A2A runs for ONE role actor each mint their own bundle
    /// (distinct run-scoped purpose keys). The secrets are independently random,
    /// revoking one run's exact hashed bundle leaves the concurrent same-role run
    /// authenticating, and no raw secret ever reaches a record, the debug output,
    /// or persistence — the raw exists only in the once-returned value.
    #[test]
    fn concurrent_same_role_runs_revoke_independently_and_never_persist_a_raw_secret() {
        let (dir, mut store) = temp_store();
        let researcher = actor("agent:researcher", ActorKind::Agent);

        // Two concurrent runs, one role — each keyed by its own run-scoped purpose.
        let (run_a, run_b) = store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                let tokens = uow.actor_tokens();
                let run_a = tokens.issue_for_purpose(
                    &researcher,
                    &admin(),
                    100,
                    3_600_000,
                    "a2a-run-start:v1:run-A:researcher",
                )?;
                let run_b = tokens.issue_for_purpose(
                    &researcher,
                    &admin(),
                    100,
                    3_600_000,
                    "a2a-run-start:v1:run-B:researcher",
                )?;
                Ok((run_a, run_b))
            })
            .unwrap();

        // The same role actor, but independently random secrets + distinct hashes.
        assert_eq!(run_a.record.actor, run_b.record.actor);
        assert_ne!(run_a.raw_token, run_b.raw_token);
        assert_ne!(run_a.record.token_hash, run_b.record.token_hash);

        // Revoke EXACTLY run A's hashed bundle (the broker's terminal/failed-attempt
        // cleanup seam). Run B — the concurrent same-role run — keeps resolving.
        store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                let tokens = uow.actor_tokens();
                assert_eq!(
                    tokens.revoke_hashes(&[run_a.record.token_hash.clone()], 200)?,
                    1
                );
                assert_eq!(
                    tokens.resolve(&run_a.raw_token, 300)?,
                    None,
                    "run A's bundle is revoked"
                );
                assert_eq!(
                    tokens.resolve(&run_b.raw_token, 300)?,
                    Some(researcher.clone()),
                    "the concurrent same-role run is untouched"
                );
                Ok(())
            })
            .unwrap();

        // No raw secret in the stored RECORD or the debug OUTPUT.
        let record_json = serde_json::to_string(&run_b.record).unwrap();
        assert!(
            !record_json.contains(&run_b.raw_token),
            "the persisted record carries the hash, never the raw"
        );
        assert!(record_json.contains(&run_b.record.token_hash));
        let debug = format!("{run_b:?}");
        assert!(debug.contains("<redacted>"));
        assert!(!debug.contains(&run_a.raw_token) && !debug.contains(&run_b.raw_token));

        // No raw secret in PERSISTENCE: scan every column of every row in the real
        // on-disk store. Neither raw appears; the hashes do (proves the scan hit
        // the right rows, so the absence of the raws is meaningful).
        let dumped = dump_actor_token_rows(store.path());
        assert!(!dumped.contains(&run_a.raw_token));
        assert!(!dumped.contains(&run_b.raw_token));
        assert!(dumped.contains(&run_a.record.token_hash));
        assert!(dumped.contains(&run_b.record.token_hash));
        drop(dir);
    }

    #[test]
    fn live_actor_token_rows_stop_at_the_documented_hard_ceiling() {
        let (_dir, mut store) = temp_store();
        let agent = actor("agent:bounded", ActorKind::Agent);
        store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                let tokens = uow.actor_tokens();
                for _ in 0..MAX_ACTOR_TOKEN_ROWS {
                    tokens.issue(&agent, &admin(), 100, 10_000)?;
                }
                assert_eq!(tokens.count_total()?, MAX_ACTOR_TOKEN_ROWS);
                Ok(())
            })
            .unwrap();

        let err = store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                uow.actor_tokens().issue(&agent, &admin(), 100, 10_000)
            })
            .unwrap_err();
        assert!(
            matches!(err, StoreError::ActorToken(ref detail) if detail.contains("row ceiling")),
            "the cap breach is a typed actor-token refusal: {err:?}"
        );

        // The rejected insert changes nothing: the already-committed live set
        // remains exactly at, never beyond, the documented hard ceiling.
        let rows = store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                uow.actor_tokens().count_total()
            })
            .unwrap();
        assert_eq!(rows, MAX_ACTOR_TOKEN_ROWS);
    }
}
