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
#[derive(Debug, Clone)]
pub struct IssuedActorToken {
    pub raw_token: String,
    pub record: ActorTokenRecord,
}

/// Hash a raw token for storage + lookup (blake2b via `blob_oid`). The raw token
/// is never stored or compared directly.
pub fn hash_actor_token(raw_token: &str) -> String {
    blob_oid(raw_token.as_bytes())
}

/// A cryptographically-random 32-byte token, hex-encoded (mirrors the engine's
/// bearer-token generation: OS CSPRNG via getrandom, hex shape).
fn generate_raw_token() -> String {
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
        if issued_at_ms < 0 {
            return Err(StoreError::ActorToken(
                "issued_at_ms must be non-negative".to_string(),
            ));
        }
        let bounded_lifetime = lifetime_ms.clamp(1, MAX_ACTOR_TOKEN_LIFETIME_MS);
        let raw_token = generate_raw_token();
        let record = ActorTokenRecord {
            schema_version: ACTOR_TOKEN_SCHEMA.to_string(),
            token_hash: hash_actor_token(&raw_token),
            actor: actor.clone(),
            issued_by: issued_by.clone(),
            issued_at_ms,
            expires_at_ms: issued_at_ms + bounded_lifetime,
            revoked_at_ms: None,
        };
        let record_json = serde_json::to_string(&record)
            .map_err(|err| StoreError::ActorToken(err.to_string()))?;
        self.repo.execute(
            "INSERT INTO authoring_actor_tokens
                (token_hash, actor_id, actor_kind, delegated_by_actor_id,
                 issued_by_actor_id, issued_at_ms, expires_at_ms, revoked_at_ms, record_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
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
            ],
        )?;
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
        let Some(mut record) = self.record_by_hash(&token_hash)? else {
            return Ok(false);
        };
        if record.revoked_at_ms.is_none() {
            record.revoked_at_ms = Some(now_ms);
            let record_json = serde_json::to_string(&record)
                .map_err(|err| StoreError::ActorToken(err.to_string()))?;
            self.repo.execute(
                "UPDATE authoring_actor_tokens
                 SET revoked_at_ms = ?2, record_json = ?3
                 WHERE token_hash = ?1",
                rusqlite::params![token_hash.as_str(), now_ms, record_json.as_str()],
            )?;
        }
        Ok(true)
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
}
