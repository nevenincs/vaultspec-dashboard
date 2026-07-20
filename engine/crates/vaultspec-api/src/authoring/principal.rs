//! Principal resolution + the compile-time actor fence (ASA-010).
//!
//! Authoring actor identity resolves ONLY from the server-held principal seam,
//! never a request body (security-provenance ADR). This module is the ENFORCEMENT
//! side of that seam: it turns a presented per-principal actor token into an
//! `AuthenticatedPrincipal` — a witness constructible ONLY here — and packages a
//! command as a `ResolvedCommand<T>` whose actor is that resolved principal. A
//! handler takes `ResolvedCommand<T>`; because it can only be built from an
//! `AuthenticatedPrincipal`, the compiler guarantees every command handler runs
//! against a server-resolved actor (not a body-claimed one).
//!
//! The axum middleware layer that reads the header, opens a store read, calls
//! `resolve_principal`, and builds the `ResolvedCommand` before dispatch is wired
//! in P39 (which mounts the authoring routes + the store into app state and runs
//! this seam AFTER the machine `bearer_gate`). This module provides the seam;
//! P39 mounts it.
#![allow(dead_code)]

use super::actor_tokens::ActorTokenRepository;
use super::api::CommandEnvelope;
use super::model::{ActorRef, CommandKind, IdempotencyKey};
use crate::a2a_run_leases::LeaseRepo;

/// The dedicated header carrying the per-principal actor token. Distinct from the
/// machine `Authorization: Bearer` (which the transport `bearer_gate` keeps
/// exclusively) — no ambiguity, no middleware-ordering trap (ASA-010).
pub const AUTHORING_ACTOR_TOKEN_HEADER: &str = "x-authoring-actor-token";

/// Why principal resolution refused — DISTINCT failure modes so a client can tell
/// which layer denied it (vs the transport gate's "wrong machine credential").
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum PrincipalDenial {
    #[error("no authoring actor token presented")]
    MissingToken,
    #[error("unknown or revoked authoring principal")]
    UnknownPrincipal,
}

/// A witness that an actor identity was resolved from the server-held seam (a
/// valid, live per-principal token). There is NO public constructor — the only
/// way to obtain one is [`resolve_principal`] or [`resolve_lease_principal`] — so
/// a resolved actor can never be fabricated by a handler or smuggled in a request
/// body.
///
/// When the token was an A2A run token, the principal also carries the non-secret
/// run-lease identity it belongs to (a2a-product-provisioning W02.P05.S37); it is
/// server-resolved from the lease store, never a client claim, and is `None` for
/// an authoring-session principal.
#[derive(Debug, Clone)]
pub struct AuthenticatedPrincipal {
    actor: ActorRef,
    lease_id: Option<String>,
}

impl AuthenticatedPrincipal {
    pub fn actor(&self) -> &ActorRef {
        &self.actor
    }

    pub fn into_actor(self) -> ActorRef {
        self.actor
    }

    /// The non-secret A2A run-lease identity this principal's token belongs to,
    /// when it resolved from an A2A run-token lease. `None` for authoring-session
    /// principals. Read-only — a handler can observe it but can never set it.
    pub fn lease_id(&self) -> Option<&str> {
        self.lease_id.as_deref()
    }
}

/// Resolve a presented actor token to an [`AuthenticatedPrincipal`] over the
/// AUTHORING token store — one path to a witness. `None` presented token →
/// `MissingToken`; unknown / expired / revoked → `UnknownPrincipal`. The resolved
/// id/kind/delegated_by come from the registered token record, never a request.
pub fn resolve_principal(
    tokens: &ActorTokenRepository<'_, '_>,
    presented_token: Option<&str>,
    now_ms: i64,
) -> Result<AuthenticatedPrincipal, PrincipalDenial> {
    let token = presented_token.ok_or(PrincipalDenial::MissingToken)?;
    match tokens
        .resolve(token, now_ms)
        .map_err(|_| PrincipalDenial::UnknownPrincipal)?
    {
        Some(actor) => Ok(AuthenticatedPrincipal {
            actor,
            lease_id: None,
        }),
        None => Err(PrincipalDenial::UnknownPrincipal),
    }
}

/// Resolve a presented A2A run token against the DEDICATED run-lease repository
/// (a2a-product-provisioning W02.P05.S38) — the other path to a witness. The
/// actor identity AND the non-secret lease identity both come from the
/// server-held lease store (never a client claim), so the compile-time actor
/// fence still holds. Unknown / expired / revoked / a store read fault →
/// `UnknownPrincipal`, so the extraction seam can fall back to the authoring
/// store fail-closed.
pub fn resolve_lease_principal(
    leases: &LeaseRepo,
    presented_token: Option<&str>,
    now_ms: i64,
) -> Result<AuthenticatedPrincipal, PrincipalDenial> {
    let token = presented_token.ok_or(PrincipalDenial::MissingToken)?;
    match leases
        .resolve_token(token, now_ms)
        .map_err(|_| PrincipalDenial::UnknownPrincipal)?
    {
        Some(resolved) => Ok(AuthenticatedPrincipal {
            actor: resolved.actor,
            lease_id: Some(resolved.lease_id),
        }),
        None => Err(PrincipalDenial::UnknownPrincipal),
    }
}

/// A command whose actor was RESOLVED from the principal seam (never the body).
/// Constructible only from an [`AuthenticatedPrincipal`] + the actor-less
/// [`CommandEnvelope`], so every handler taking a `ResolvedCommand` is guaranteed
/// a server-resolved actor (ASA-010 compile-time fence).
#[derive(Debug, Clone)]
pub struct ResolvedCommand<T> {
    actor: ActorRef,
    command: CommandKind,
    idempotency_key: IdempotencyKey,
    payload: T,
}

impl<T> ResolvedCommand<T> {
    /// Build a resolved command. Requires the `AuthenticatedPrincipal` witness, so
    /// there is no path to a `ResolvedCommand` without server-side resolution.
    pub fn from_principal(principal: AuthenticatedPrincipal, envelope: CommandEnvelope<T>) -> Self {
        Self {
            actor: principal.into_actor(),
            command: envelope.command,
            idempotency_key: envelope.idempotency_key,
            payload: envelope.payload,
        }
    }

    pub fn actor(&self) -> &ActorRef {
        &self.actor
    }

    pub fn command(&self) -> CommandKind {
        self.command
    }

    pub fn idempotency_key(&self) -> &IdempotencyKey {
        &self.idempotency_key
    }

    pub fn payload(&self) -> &T {
        &self.payload
    }

    /// Consume into (resolved actor, command, idempotency key, payload) for
    /// dispatch. The idempotency command scope keys on the RESOLVED actor.
    pub fn into_parts(self) -> (ActorRef, CommandKind, IdempotencyKey, T) {
        (self.actor, self.command, self.idempotency_key, self.payload)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::authoring::api::{ApiVersion, CreateSessionRequest};
    use crate::authoring::model::{ActorId, ActorKind, ActorRef, CommandKind};
    use crate::authoring::store::Store;

    fn agent() -> ActorRef {
        ActorRef {
            id: ActorId::new("agent:writer").unwrap(),
            kind: ActorKind::Agent,
            delegated_by: None,
        }
    }

    fn envelope() -> CommandEnvelope<CreateSessionRequest> {
        CommandEnvelope {
            api_version: ApiVersion::V1,
            command: CommandKind::CreateSession,
            idempotency_key: IdempotencyKey::new("idem:session:create").unwrap(),
            payload: CreateSessionRequest {
                scope: "scope_a".to_string(),
                title: "Agentic".to_string(),
            },
        }
    }

    fn issue_token(store: &mut Store, actor: &ActorRef) -> String {
        store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                Ok(uow.actor_tokens().issue(
                    actor,
                    &ActorId::new("system:bootstrap").unwrap(),
                    100,
                    3_600_000,
                ))
            })
            .unwrap()
            .unwrap()
            .raw_token
    }

    #[test]
    fn resolves_a_live_token_and_builds_a_resolved_command_with_the_server_actor() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(&dir.path().join(".vault")).unwrap();
        let raw = issue_token(&mut store, &agent());

        let command = store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                let principal =
                    resolve_principal(&uow.actor_tokens(), Some(raw.as_str()), 200).unwrap();
                Ok(ResolvedCommand::from_principal(principal, envelope()))
            })
            .unwrap();

        // The command's actor is the SERVER-RESOLVED principal, not a body claim.
        assert_eq!(command.actor(), &agent());
        assert_eq!(command.command(), CommandKind::CreateSession);
        assert_eq!(command.payload().scope, "scope_a");
    }

    #[test]
    fn missing_and_unknown_tokens_deny_distinctly() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(&dir.path().join(".vault")).unwrap();

        store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                let tokens = uow.actor_tokens();
                // No token → MissingToken (distinct from an unknown principal).
                assert_eq!(
                    resolve_principal(&tokens, None, 200).unwrap_err(),
                    PrincipalDenial::MissingToken
                );
                // A garbage token → UnknownPrincipal.
                assert_eq!(
                    resolve_principal(&tokens, Some("deadbeef"), 200).unwrap_err(),
                    PrincipalDenial::UnknownPrincipal
                );
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn an_a2a_run_token_resolves_to_a_lease_principal_carrying_the_lease_id() {
        use crate::a2a_run_leases::{LeaseRepo, LeaseReservation, LeaseToken};
        use crate::authoring::actor_tokens::hash_actor_token;

        let dir = tempfile::tempdir().unwrap();
        let leases = LeaseRepo::open(&dir.path().join(".vault")).unwrap();
        let raw = "raw-a2a-run-token";
        leases
            .reserve(
                &LeaseReservation {
                    lease_id: "lease-42".to_string(),
                    reservation_id: "req-42".to_string(),
                    bundle_id: "bundle-42".to_string(),
                    run_id: Some("run-42".to_string()),
                    tokens: vec![LeaseToken {
                        role: "researcher".to_string(),
                        token_hash: hash_actor_token(raw),
                        actor: agent(),
                    }],
                    expiry_ms: 10_000,
                },
                1_000,
            )
            .unwrap();
        leases
            .commit("lease-42", "run-42", None, "gateway-lease-42", 1_500)
            .unwrap();

        // The a2a run token resolves to a witness carrying the SERVER-RESOLVED
        // actor + the non-secret lease identity.
        let principal = resolve_lease_principal(&leases, Some(raw), 2_000).unwrap();
        assert_eq!(principal.actor(), &agent());
        assert_eq!(principal.lease_id(), Some("lease-42"));

        // An authoring-session principal carries no lease id.
        // (unknown a2a token → UnknownPrincipal, so the seam falls back.)
        assert_eq!(
            resolve_lease_principal(&leases, Some("nope"), 2_000).unwrap_err(),
            PrincipalDenial::UnknownPrincipal
        );
    }

    #[test]
    fn a_revoked_token_no_longer_resolves_a_principal() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(&dir.path().join(".vault")).unwrap();
        let raw = issue_token(&mut store, &agent());

        store
            .with_unit_of_work(CommandKind::CreateSession, |uow| {
                uow.actor_tokens().revoke(&raw, 150)?;
                assert_eq!(
                    resolve_principal(&uow.actor_tokens(), Some(raw.as_str()), 200).unwrap_err(),
                    PrincipalDenial::UnknownPrincipal
                );
                Ok(())
            })
            .unwrap();
    }
}
