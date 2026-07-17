//! Advisory leases and fencing tokens (W13.P26).
//!
//! A lease is a TTL-bound ADVISORY coordination record over one `scope_id`
//! (concurrency-leases-conflicts ADR). It reduces collisions for destructive,
//! whole-document, rename, archive, or long-running-rewrite work — it never
//! establishes correctness. Two ADR invariants shape every method here:
//!
//! - **Correctness must not depend on an unexpired lease.** A crashed holder cannot
//!   strand a scope: expiry is read at every touch (expire-on-read), so a past-TTL
//!   `Held` row transitions to `Expired` and PERMITS PROGRESS for a fresh acquirer.
//!   No sweeper is authoritative; the background janitor (a later-phase advisory) is
//!   only a reclaimer that prunes `Released`/`Expired` rows.
//! - **A stale fencing token cannot finalize or apply a lease-protected proposal**
//!   (`leases-never-replace-revision-checks`). The fencing token is a per-scope
//!   MONOTONIC counter: it strictly increments on every fresh acquisition and NEVER
//!   resets across release→re-acquire or expiry→re-acquire, because the scope's row
//!   persists (one row per scope). [`validate_fencing_token`] is a PURE gate that
//!   fences out any operation carrying a token below the scope's current one. It is
//!   ADDITIVE to revision checks and NEVER a bypass; wiring it into the apply/finalize
//!   path is a later phase — this phase lands the gate and the store only.
//!
//! The table is structurally bounded (one row per distinct scope ever leased, reused
//! on re-acquire), so it carries no retention/compaction lifecycle: miscategorizing an
//! advisory lease as protected/review/audit material would lie to the compaction
//! system. Expected policy refusals — a concurrent acquire while held, a non-owner
//! release, a stale fencing token, an absent scope — ride the success envelope as an
//! [`ActionEligibility`] value (denials-are-values); only store faults are `Err`.
#![allow(dead_code)]

use ingest_struct::reader::blob_oid;
use serde::{Deserialize, Serialize};

use super::actors::actor_kind_name;
use super::model::{ActionEligibility, ActorRef, CommandKind, LeaseId};
use super::store::unit_of_work::{Repository, SqliteRepository, UnitOfWork};
use super::store::{Result as StoreResult, StoreError};

const LEASE_SCHEMA: &str = "authoring.lease.v1";

/// The default advisory lease window (resource-bounds: a bounded TTL at creation). A
/// lease past it EXPIRES on the next touch and permits progress; a holder renews before
/// the window lapses to keep coordinating.
pub const DEFAULT_LEASE_TTL_MS: i64 = 10 * 60 * 1000;

/// Why a scope is leased (concurrency-leases-conflicts ADR: leases reduce collisions for
/// destructive, whole-document, rename, archive, or long-running rewrite work). Advisory
/// only — the purpose annotates intent, it never changes the fencing semantics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LeasePurpose {
    Destructive,
    WholeDocument,
    Rename,
    Archive,
    LongRunningRewrite,
}

/// The lifecycle of a scope's single lease row. `held` is a live advisory lease;
/// `released` was explicitly given up by its owner; `expired` lapsed past its TTL. A
/// `released`/`expired` row persists (it carries the monotonic fencing counter forward)
/// until the janitor reclaims it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LeaseState {
    Held,
    Released,
    Expired,
}

/// The durable, one-per-scope advisory lease record. `fencing_token` is the per-scope
/// monotonic counter — strictly increasing across the row's whole history, never reset.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LeaseRecord {
    pub schema_version: String,
    pub lease_id: LeaseId,
    pub scope_id: String,
    pub purpose: LeasePurpose,
    pub holder: ActorRef,
    pub fencing_token: i64,
    pub state: LeaseState,
    pub idempotency_key: String,
    pub acquired_at_ms: i64,
    pub expires_at_ms: i64,
    pub updated_at_ms: i64,
}

impl LeaseRecord {
    /// True while the lease is `Held` and its TTL window has not lapsed. This is the
    /// only state in which the lease coordinates work or its fencing token validates.
    pub fn is_active(&self, now_ms: i64) -> bool {
        matches!(self.state, LeaseState::Held) && now_ms < self.expires_at_ms
    }

    /// True when the row is `Held` regardless of the TTL clock (used before an
    /// expire-on-read transition has been applied).
    pub fn is_held(&self) -> bool {
        matches!(self.state, LeaseState::Held)
    }
}

/// Input to acquire (or re-acquire) a scope's advisory lease.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AcquireLeaseInput {
    pub scope_id: String,
    pub purpose: LeasePurpose,
    pub holder: ActorRef,
    pub idempotency_key: String,
    pub created_at_ms: i64,
    /// Lease window override; `None` uses [`DEFAULT_LEASE_TTL_MS`].
    pub ttl_ms: Option<i64>,
}

/// The outcome of a lease operation: the scope's current lease row (absent only when the
/// scope was never leased), the served eligibility (did the operation take effect?), and
/// whether this call replayed an already-recorded state (idempotency).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LeaseOutcome {
    pub record: Option<LeaseRecord>,
    pub eligibility: ActionEligibility,
    pub replayed: bool,
}

/// The PURE fencing gate (concurrency-leases-conflicts ADR): may an operation carrying
/// `presented_token` finalize or apply work on this scope? Allowed ONLY when the scope
/// holds a live lease whose current fencing token EQUALS the presented one. A lapsed
/// lease, a released/absent lease, or any token other than the current one is fenced out
/// (denials-are-values). This gate is ADDITIVE to revision checks — it never replaces
/// or bypasses them, and no lease permits a stale write.
pub fn validate_fencing_token(
    current: Option<&LeaseRecord>,
    presented_token: i64,
    now_ms: i64,
) -> ActionEligibility {
    // The fencing gate protects finalize/apply of a lease-protected proposal.
    let command = CommandKind::RequestApply;
    match current {
        None => ActionEligibility::denied(
            command,
            "no active lease holds this scope; the fencing token is stale",
        ),
        Some(record) if !record.is_active(now_ms) => ActionEligibility::denied(
            command,
            "the lease has lapsed; the fencing token is stale and cannot finalize or apply",
        ),
        Some(record) if presented_token == record.fencing_token => {
            ActionEligibility::allowed(command)
        }
        Some(_) => ActionEligibility::denied(
            command,
            "the fencing token is out of date; a newer lease holder has fenced this operation out",
        ),
    }
}

/// Whether an operation carrying `presented_token` may proceed — the boolean form of
/// [`validate_fencing_token`].
pub fn fencing_token_permitted(
    current: Option<&LeaseRecord>,
    presented_token: i64,
    now_ms: i64,
) -> bool {
    validate_fencing_token(current, presented_token, now_ms).allowed
}

/// The advisory-lease repository: acquire / renew / release / expire / list over the
/// one-row-per-scope lease table, plus the durable per-scope monotonic fencing counter.
pub struct LeaseRepository<'repo, 'conn> {
    repo: SqliteRepository<'repo, 'conn>,
    uow: &'repo UnitOfWork<'conn>,
}

impl<'conn> UnitOfWork<'conn> {
    pub fn leases<'repo>(&'repo self) -> LeaseRepository<'repo, 'conn> {
        LeaseRepository {
            repo: self.repository("authoring_leases"),
            uow: self,
        }
    }
}

impl LeaseRepository<'_, '_> {
    /// Acquire a scope's advisory lease. A live lease held by a DIFFERENT holder blocks
    /// the acquisition (denials-are-values) — only release or expiry frees the scope. A
    /// live lease held by the SAME holder replays (idempotent hold, no new token). A
    /// vacant, released, or expired scope issues a FRESH lease with a strictly higher
    /// fencing token (the previous token + 1), fencing out any prior holder.
    pub fn acquire_lease(&self, input: AcquireLeaseInput) -> StoreResult<LeaseOutcome> {
        self.uow.actors().ensure_active(&input.holder)?;
        let now = input.created_at_ms;
        let existing = self.current(&input.scope_id)?;

        if let Some(record) = &existing
            && record.is_active(now)
        {
            if record.holder == input.holder {
                // The same holder re-acquiring a live lease is an idempotent hold —
                // the recorded lease (and its token) stand unchanged.
                return Ok(LeaseOutcome {
                    eligibility: ActionEligibility::allowed(CommandKind::AcquireLease),
                    record: Some(record.clone()),
                    replayed: true,
                });
            }
            // A live lease held by another holder blocks acquisition. Progress comes
            // from that lease being released or expiring, NEVER from overriding it.
            return Ok(LeaseOutcome {
                eligibility: ActionEligibility::denied(
                    CommandKind::AcquireLease,
                    format!(
                        "scope `{}` is leased by another holder until it is released or expires",
                        input.scope_id
                    ),
                ),
                record: Some(record.clone()),
                replayed: false,
            });
        }

        // Vacant / released / expired → issue a fresh lease. The fencing token carries
        // forward from the persisted row (never reset), so it is monotonic per scope.
        let previous_token = existing.as_ref().map_or(0, |record| record.fencing_token);
        let fencing_token = previous_token.saturating_add(1);
        let ttl = input.ttl_ms.unwrap_or(DEFAULT_LEASE_TTL_MS).max(0);
        let record = LeaseRecord {
            schema_version: LEASE_SCHEMA.to_string(),
            lease_id: lease_id_for(&input.scope_id, fencing_token)?,
            scope_id: input.scope_id.clone(),
            purpose: input.purpose,
            holder: input.holder.clone(),
            fencing_token,
            state: LeaseState::Held,
            idempotency_key: input.idempotency_key.clone(),
            acquired_at_ms: now,
            expires_at_ms: now.saturating_add(ttl),
            updated_at_ms: now,
        };
        self.store_record(&record)?;
        Ok(LeaseOutcome {
            eligibility: ActionEligibility::allowed(CommandKind::AcquireLease),
            record: Some(record),
            replayed: false,
        })
    }

    /// Renew a live lease, extending its TTL window (the fencing token is unchanged — a
    /// renewal is not a fresh acquisition). Owner-only. An absent scope, a
    /// released/expired lease, or a non-owner renewal is refused as a value; expiry is
    /// read first, so a past-TTL lease transitions to `Expired` and forces re-acquire
    /// rather than renewing (expiry permits progress).
    pub fn renew_lease(
        &self,
        scope_id: &str,
        holder: &ActorRef,
        ttl_ms: Option<i64>,
        now_ms: i64,
    ) -> StoreResult<LeaseOutcome> {
        self.uow.actors().ensure_active(holder)?;
        let Some(mut record) = self.current(scope_id)? else {
            return Ok(denied_without_record(
                CommandKind::RenewLease,
                format!("scope `{scope_id}` has no active lease to renew"),
            ));
        };
        if self.expire_in_place(&mut record, now_ms)? {
            return Ok(denied_with_record(
                record,
                CommandKind::RenewLease,
                "the lease has expired; acquire a fresh lease to continue",
            ));
        }
        if !record.is_held() {
            return Ok(denied_with_record(
                record,
                CommandKind::RenewLease,
                "the lease is no longer held and cannot be renewed",
            ));
        }
        if record.holder != *holder {
            return Ok(denied_with_record(
                record,
                CommandKind::RenewLease,
                "only the lease holder may renew this lease",
            ));
        }
        let ttl = ttl_ms.unwrap_or(DEFAULT_LEASE_TTL_MS).max(0);
        record.expires_at_ms = now_ms.saturating_add(ttl);
        record.updated_at_ms = now_ms;
        self.store_record(&record)?;
        Ok(LeaseOutcome {
            eligibility: ActionEligibility::allowed(CommandKind::RenewLease),
            record: Some(record),
            replayed: false,
        })
    }

    /// Release a live lease. Owner-only: a non-owner release is refused as a value and
    /// leaves the lease held by its owner. An absent or already-lapsed lease is a
    /// no-effect denial. A released lease keeps its fencing token so the next acquisition
    /// stays monotonic.
    pub fn release_lease(
        &self,
        scope_id: &str,
        holder: &ActorRef,
        now_ms: i64,
    ) -> StoreResult<LeaseOutcome> {
        self.uow.actors().ensure_active(holder)?;
        let Some(mut record) = self.current(scope_id)? else {
            return Ok(denied_without_record(
                CommandKind::ReleaseLease,
                format!("scope `{scope_id}` has no active lease to release"),
            ));
        };
        if self.expire_in_place(&mut record, now_ms)? {
            return Ok(denied_with_record(
                record,
                CommandKind::ReleaseLease,
                "the lease has already expired; there is nothing to release",
            ));
        }
        if !record.is_held() {
            return Ok(denied_with_record(
                record,
                CommandKind::ReleaseLease,
                "the lease is not held; there is nothing to release",
            ));
        }
        if record.holder != *holder {
            // A non-owner cannot release another holder's lease. The lease stands.
            return Ok(denied_with_record(
                record,
                CommandKind::ReleaseLease,
                "only the lease holder may release this lease",
            ));
        }
        record.state = LeaseState::Released;
        record.updated_at_ms = now_ms;
        self.store_record(&record)?;
        Ok(LeaseOutcome {
            eligibility: ActionEligibility::allowed(CommandKind::ReleaseLease),
            record: Some(record),
            replayed: false,
        })
    }

    /// The scope's current lease row (raw, without an expire-on-read write), if any. The
    /// caller interprets liveness through [`LeaseRecord::is_active`] — used both for the
    /// pure fencing gate and for read listings.
    pub fn current(&self, scope_id: &str) -> StoreResult<Option<LeaseRecord>> {
        let json = self.repo.query_optional(
            "SELECT record_json
             FROM authoring_leases
             WHERE scope_id = ?1",
            [scope_id],
            |row| row.get::<_, String>(0),
        )?;
        match json {
            Some(json) => Ok(Some(read_record(&json)?)),
            None => Ok(None),
        }
    }

    /// Every lease row in acquisition order, bounded by `cap`. The table holds at most
    /// one row per scope, so this is inherently bounded by the leased-scope count.
    pub fn list_leases(&self, cap: u32) -> StoreResult<Vec<LeaseRecord>> {
        let rows = self.repo.query_collect(
            "SELECT record_json
             FROM authoring_leases
             ORDER BY acquired_at_ms ASC, scope_id ASC
             LIMIT ?1",
            [cap],
            |row| row.get::<_, String>(0),
        )?;
        rows.iter().map(|json| read_record(json)).collect()
    }

    /// Sweep-driven expiry (janitor P04a.S57): the SAME expire-on-read transition,
    /// driven eventually for leases nothing touches again. Bounded by `cap` (the table
    /// holds at most one row per scope, so the page is inherently small). Returns how
    /// many leases actually expired.
    pub fn expire_due(&self, now_ms: i64, cap: u32) -> StoreResult<usize> {
        let mut expired = 0;
        for mut record in self.list_leases(cap)? {
            if self.expire_in_place(&mut record, now_ms)? {
                expired += 1;
            }
        }
        Ok(expired)
    }

    /// Expire-on-read: transition a `Held` row past its TTL to `Expired` and persist it,
    /// returning whether the transition fired. Correctness never waits on a sweeper — a
    /// crashed holder's lease is reclaimed the moment the next operation touches it.
    fn expire_in_place(&self, record: &mut LeaseRecord, now_ms: i64) -> StoreResult<bool> {
        if !record.is_held() || now_ms < record.expires_at_ms {
            return Ok(false);
        }
        record.state = LeaseState::Expired;
        record.updated_at_ms = now_ms;
        self.store_record(record)?;
        Ok(true)
    }

    fn store_record(&self, record: &LeaseRecord) -> StoreResult<()> {
        validate_record(record)?;
        let record_json =
            serde_json::to_string(record).map_err(|err| StoreError::Lease(err.to_string()))?;
        let delegated_by = record
            .holder
            .delegated_by
            .as_ref()
            .map_or("", |id| id.as_str());
        self.repo.execute(
            "INSERT INTO authoring_leases
                (scope_id, lease_id, purpose, state, holder_actor_id, holder_actor_kind,
                 holder_delegated_by_actor_id, fencing_token, idempotency_key, record_json,
                 acquired_at_ms, expires_at_ms, updated_at_ms)
             VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
             ON CONFLICT(scope_id) DO UPDATE SET
                lease_id = excluded.lease_id,
                purpose = excluded.purpose,
                state = excluded.state,
                holder_actor_id = excluded.holder_actor_id,
                holder_actor_kind = excluded.holder_actor_kind,
                holder_delegated_by_actor_id = excluded.holder_delegated_by_actor_id,
                fencing_token = excluded.fencing_token,
                idempotency_key = excluded.idempotency_key,
                record_json = excluded.record_json,
                acquired_at_ms = excluded.acquired_at_ms,
                expires_at_ms = excluded.expires_at_ms,
                updated_at_ms = excluded.updated_at_ms",
            rusqlite::params![
                record.scope_id.as_str(),
                record.lease_id.as_str(),
                purpose_as_str(record.purpose),
                state_as_str(record.state),
                record.holder.id.as_str(),
                actor_kind_name(record.holder.kind),
                delegated_by,
                record.fencing_token,
                record.idempotency_key.as_str(),
                record_json.as_str(),
                record.acquired_at_ms,
                record.expires_at_ms,
                record.updated_at_ms,
            ],
        )?;
        Ok(())
    }
}

fn denied_without_record(command: CommandKind, reason: impl Into<String>) -> LeaseOutcome {
    LeaseOutcome {
        record: None,
        eligibility: ActionEligibility::denied(command, reason),
        replayed: false,
    }
}

fn denied_with_record(
    record: LeaseRecord,
    command: CommandKind,
    reason: impl Into<String>,
) -> LeaseOutcome {
    LeaseOutcome {
        record: Some(record),
        eligibility: ActionEligibility::denied(command, reason),
        replayed: false,
    }
}

fn lease_id_for(scope_id: &str, fencing_token: i64) -> StoreResult<LeaseId> {
    // A stable, charset-safe id unique per acquisition: the token strictly increments
    // per scope, so `(scope, token)` is unique for every fresh lease.
    let oid = blob_oid(format!("{scope_id}\u{0}{fencing_token}").as_bytes());
    LeaseId::new(format!("lease:{oid}")).map_err(|err| StoreError::Lease(err.to_string()))
}

fn read_record(json: &str) -> StoreResult<LeaseRecord> {
    serde_json::from_str(json).map_err(|err| StoreError::Lease(err.to_string()))
}

fn validate_record(record: &LeaseRecord) -> StoreResult<()> {
    if record.schema_version != LEASE_SCHEMA {
        return Err(StoreError::Lease(format!(
            "unsupported lease schema `{}`",
            record.schema_version
        )));
    }
    if record.scope_id.trim().is_empty() {
        return Err(StoreError::Lease(
            "lease scope_id cannot be empty".to_string(),
        ));
    }
    if record.idempotency_key.trim().is_empty() {
        return Err(StoreError::Lease(
            "lease idempotency key cannot be empty".to_string(),
        ));
    }
    if record.fencing_token <= 0 {
        return Err(StoreError::Lease(
            "lease fencing token must be positive".to_string(),
        ));
    }
    if record.updated_at_ms < record.acquired_at_ms {
        return Err(StoreError::Lease(
            "updated_at_ms cannot be before acquired_at_ms".to_string(),
        ));
    }
    Ok(())
}

fn purpose_as_str(purpose: LeasePurpose) -> &'static str {
    match purpose {
        LeasePurpose::Destructive => "destructive",
        LeasePurpose::WholeDocument => "whole_document",
        LeasePurpose::Rename => "rename",
        LeasePurpose::Archive => "archive",
        LeasePurpose::LongRunningRewrite => "long_running_rewrite",
    }
}

fn state_as_str(state: LeaseState) -> &'static str {
    match state {
        LeaseState::Held => "held",
        LeaseState::Released => "released",
        LeaseState::Expired => "expired",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
    use crate::authoring::model::{ActorId, ActorKind, CommandKind};
    use crate::authoring::store::Store;

    fn actor(id: &str, kind: ActorKind) -> ActorRef {
        ActorRef {
            id: ActorId::new(id).unwrap(),
            kind,
            delegated_by: None,
        }
    }

    fn holder_a() -> ActorRef {
        actor("agent:a", ActorKind::Agent)
    }

    fn holder_b() -> ActorRef {
        actor("agent:b", ActorKind::Agent)
    }

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(&dir.path().join(".vault")).unwrap();
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                for id in ["agent:a", "agent:b"] {
                    uow.actors().put_record(ActorRecordInput::active(
                        actor(id, ActorKind::Agent),
                        ActorDisplayMetadata::new(id, None),
                        1,
                    ))?;
                }
                Ok(())
            })
            .unwrap();
        (dir, store)
    }

    fn acquire(
        store: &mut Store,
        scope: &str,
        holder: &ActorRef,
        ttl_ms: Option<i64>,
        now: i64,
    ) -> LeaseOutcome {
        store
            .with_unit_of_work(CommandKind::AcquireLease, |uow| {
                Ok(uow.leases().acquire_lease(AcquireLeaseInput {
                    scope_id: scope.to_string(),
                    purpose: LeasePurpose::WholeDocument,
                    holder: holder.clone(),
                    idempotency_key: format!("idem:{scope}:{}:{now}", holder.id.as_str()),
                    created_at_ms: now,
                    ttl_ms,
                }))
            })
            .unwrap()
            .unwrap()
    }

    fn renew(
        store: &mut Store,
        scope: &str,
        holder: &ActorRef,
        ttl_ms: Option<i64>,
        now: i64,
    ) -> LeaseOutcome {
        store
            .with_unit_of_work(CommandKind::RenewLease, |uow| {
                Ok(uow.leases().renew_lease(scope, holder, ttl_ms, now))
            })
            .unwrap()
            .unwrap()
    }

    fn release(store: &mut Store, scope: &str, holder: &ActorRef, now: i64) -> LeaseOutcome {
        store
            .with_unit_of_work(CommandKind::ReleaseLease, |uow| {
                Ok(uow.leases().release_lease(scope, holder, now))
            })
            .unwrap()
            .unwrap()
    }

    fn current(store: &mut Store, scope: &str) -> Option<LeaseRecord> {
        store
            .with_read_unit_of_work(CommandKind::ReadContext, |uow| uow.leases().current(scope))
            .unwrap()
    }

    #[test]
    fn renewal_extends_the_window_without_bumping_the_fencing_token() {
        let (_dir, mut store) = temp_store();
        let acquired = acquire(&mut store, "doc:1", &holder_a(), Some(1_000), 10);
        assert!(acquired.eligibility.allowed);
        let lease = acquired.record.unwrap();
        assert_eq!(lease.fencing_token, 1);
        assert_eq!(lease.expires_at_ms, 1_010);

        // A renewal well within the window extends expiry, keeps the same holder, and —
        // crucially — does NOT mint a new fencing token (a renewal is not a fresh acquire).
        let renewed = renew(&mut store, "doc:1", &holder_a(), Some(2_000), 500)
            .record
            .unwrap();
        assert!(renewed.is_active(500));
        assert_eq!(renewed.holder, holder_a());
        assert_eq!(renewed.expires_at_ms, 2_500);
        assert_eq!(
            renewed.fencing_token, 1,
            "renewal keeps the fencing token; only a fresh acquisition increments it"
        );
    }

    #[test]
    fn expiry_permits_progress_for_a_different_holder_with_a_higher_token() {
        let (_dir, mut store) = temp_store();
        // A holds a lease that lapses at t=110.
        let first = acquire(&mut store, "doc:2", &holder_a(), Some(100), 10)
            .record
            .unwrap();
        assert_eq!(first.fencing_token, 1);

        // Long after A's TTL, a DIFFERENT holder acquires the SAME scope. A crashed/absent
        // holder cannot strand the scope: expiry permits progress, and the fresh lease
        // carries a strictly higher fencing token that fences A out.
        let second = acquire(&mut store, "doc:2", &holder_b(), Some(100), 5_000);
        assert!(
            second.eligibility.allowed,
            "expiry permits a different holder to acquire: {:?}",
            second.eligibility.reason
        );
        let second = second.record.unwrap();
        assert_eq!(second.holder, holder_b());
        assert_eq!(second.state, LeaseState::Held);
        assert_eq!(
            second.fencing_token, 2,
            "a fresh acquisition after expiry increments the fencing token"
        );

        // A's original token no longer validates against the current lease.
        let live = current(&mut store, "doc:2");
        assert!(!fencing_token_permitted(live.as_ref(), 1, 5_000));
        assert!(fencing_token_permitted(live.as_ref(), 2, 5_000));
    }

    #[test]
    fn bad_scope_renew_and_release_are_honest_denials_not_faults() {
        let (_dir, mut store) = temp_store();
        // Renewing / releasing a scope that was never leased returns no record and a
        // denial VALUE (never an Err) — the honest None path.
        let renewed = renew(&mut store, "doc:never", &holder_a(), None, 10);
        assert!(renewed.record.is_none());
        assert!(!renewed.eligibility.allowed);
        assert!(
            renewed
                .eligibility
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("no active lease")),
            "bad-scope renew is an honest denial: {:?}",
            renewed.eligibility
        );

        let released = release(&mut store, "doc:never", &holder_a(), 10);
        assert!(released.record.is_none());
        assert!(!released.eligibility.allowed);

        // The fencing gate over an unleased scope denies too (no lease → stale token).
        assert!(!fencing_token_permitted(None, 1, 10));
    }

    #[test]
    fn concurrent_acquisition_while_held_is_a_denial_value_and_leaves_the_lease_intact() {
        let (_dir, mut store) = temp_store();
        let held = acquire(&mut store, "doc:3", &holder_a(), Some(10_000), 10)
            .record
            .unwrap();
        assert_eq!(held.fencing_token, 1);

        // B tries to acquire while A's lease is live: blocked as a VALUE (not a panic/Err).
        let blocked = acquire(&mut store, "doc:3", &holder_b(), Some(10_000), 20);
        assert!(!blocked.eligibility.allowed);
        assert!(
            blocked
                .eligibility
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("leased by another holder")),
            "concurrent acquire is blocked as a value: {:?}",
            blocked.eligibility
        );

        // The live lease is untouched: still A, still token 1.
        let after = current(&mut store, "doc:3").unwrap();
        assert_eq!(after.holder, holder_a());
        assert_eq!(after.fencing_token, 1);
        assert!(after.is_active(20));
    }

    #[test]
    fn a_stale_fencing_token_is_fenced_out_after_re_acquisition() {
        let (_dir, mut store) = temp_store();
        // A acquires (token 1), then releases; a later acquire mints token 2.
        let first = acquire(&mut store, "doc:4", &holder_a(), Some(10_000), 10)
            .record
            .unwrap();
        assert_eq!(first.fencing_token, 1);
        release(&mut store, "doc:4", &holder_a(), 20);
        let second = acquire(&mut store, "doc:4", &holder_b(), Some(10_000), 30)
            .record
            .unwrap();
        assert_eq!(second.fencing_token, 2);

        let live = current(&mut store, "doc:4");
        // The stale token 1 is fenced out; the current token 2 validates.
        let stale = validate_fencing_token(live.as_ref(), 1, 40);
        assert!(!stale.allowed);
        assert!(
            stale
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("out of date")),
            "a stale token is fenced out: {stale:?}"
        );
        assert!(validate_fencing_token(live.as_ref(), 2, 40).allowed);
        // A token above the current one is not honored either.
        assert!(!fencing_token_permitted(live.as_ref(), 3, 40));
    }

    #[test]
    fn release_by_non_owner_is_denied_and_the_owner_keeps_the_lease() {
        let (_dir, mut store) = temp_store();
        acquire(&mut store, "doc:5", &holder_a(), Some(10_000), 10);

        // B attempts to release A's lease: denied as a VALUE, and A's lease stands held.
        let denied = release(&mut store, "doc:5", &holder_b(), 20);
        assert!(!denied.eligibility.allowed);
        assert!(
            denied
                .eligibility
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("only the lease holder")),
            "a non-owner release is denied: {:?}",
            denied.eligibility
        );
        let still_held = current(&mut store, "doc:5").unwrap();
        assert_eq!(still_held.state, LeaseState::Held);
        assert_eq!(still_held.holder, holder_a());

        // The owner can release it.
        let released = release(&mut store, "doc:5", &holder_a(), 30);
        assert!(released.eligibility.allowed);
        assert_eq!(released.record.unwrap().state, LeaseState::Released);
    }

    #[test]
    fn fencing_token_never_resets_across_release_and_expiry() {
        let (_dir, mut store) = temp_store();
        // token 1: fresh acquire.
        assert_eq!(
            acquire(&mut store, "doc:6", &holder_a(), Some(100), 10)
                .record
                .unwrap()
                .fencing_token,
            1
        );
        // token 2: release then re-acquire — the counter does NOT reset to 1.
        release(&mut store, "doc:6", &holder_a(), 20);
        assert_eq!(
            acquire(&mut store, "doc:6", &holder_a(), Some(100), 30)
                .record
                .unwrap()
                .fencing_token,
            2
        );
        // token 3: let it expire, then re-acquire — still strictly increasing.
        let third = acquire(&mut store, "doc:6", &holder_b(), Some(100), 5_000)
            .record
            .unwrap();
        assert_eq!(third.fencing_token, 3);
        assert_eq!(third.holder, holder_b());
    }
}
