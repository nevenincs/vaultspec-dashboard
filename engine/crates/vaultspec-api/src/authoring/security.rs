//! Authorization engine and scope guards (W13.P20).
//!
//! This module is the who-can-act-on-what layer. It sits ABOVE identity resolution
//! (the ASA-010 principal seam in [`super::principal`] already proves WHICH actor is
//! acting) and BESIDE — never inside — the approval-policy plane ([`super::policy`],
//! W10.P21) and the tool-permission plane ([`super::permissions`], W12.P22). It adds
//! nothing those planes already own; it answers a distinct question: does this
//! resolved, standing actor have the authority to run THIS command against THESE
//! targets in THIS scope?
//!
//! FOUR guards compose into [`authorize_command`], first-denial-wins:
//! - actor standing — the acting principal is a registered, ACTIVE actor;
//! - delegation standing — when the actor acts under a `delegated_by` initiator,
//!   that delegating principal is itself registered and active (a confused-deputy
//!   fence: a delegate is only as authorized as a standing delegator);
//! - document scope — every target document lies inside the session's authorized
//!   scope (the "scope guard" the phase is named for);
//! - review authority — for approve/apply-class commands, the actor may decide this
//!   proposal. This REUSES [`super::policy::reviewer_eligibility`] (the single
//!   self-approval authority); it never re-derives the approval matrix.
//!
//! DENIALS ARE VALUES (security-provenance / api-contract ADRs). A refusal is a
//! DOMAIN OUTCOME: a denied [`ActionEligibility`] on the success lane, with an honest
//! reason. The pre-P20 gap this closes is [`super::actors::ActorRepository::ensure_active`]
//! returning a stale/unregistered actor as a `StoreError` FAULT — an authorization
//! refusal wearing an infrastructure error's clothes. Here that becomes a value. Only
//! a GENUINE infrastructure fault (SQLite, IO) becomes a [`SecurityFault`], carrying a
//! FIXED, generic message that never echoes the underlying error, a token, a path, or
//! an id.
//!
//! SCOPE — "delegated scopes" (ADR): "Agents may propose and request approval within
//! delegated scope." The scope is the authorized WORKSPACE a delegate acts within
//! (document-scope fencing), and capabilities are KIND-based (agents cannot
//! self-approve; the system actor auto-approves; agents request semantic proposals,
//! not raw writes) via the existing policy/permission planes. This module does NOT
//! introduce a per-actor granted-capability allowlist — that would double-model the
//! kind-based capability planes the ADR already describes.
//!
//! WIRING (release-gating, deferred like P26/P27/P28): this phase lands the ENGINE.
//! An engine no command path calls enforces NOTHING. A later phase MUST call
//! [`authorize_command`] on EVERY mutating command path, BEFORE the mutation, or
//! authorization is inert.
//!
//! RESOURCE BOUNDS: the pure guards hold no state; the store-backed guards issue only
//! bounded primary-key reads over the actor registry.
#![allow(dead_code)]

use super::actors::{ActorRepository, ActorStatus};
use super::model::{ActionEligibility, ActorKind, ActorRef, CommandKind, DocumentRef};
use super::policy::reviewer_eligibility;
use super::store::StoreError;
use super::tools::SemanticToolName;

/// A GENUINE infrastructure fault raised while an authorization guard read the actor
/// registry (SQLite, IO). Its message is FIXED and generic — it never echoes the
/// underlying error text, an actor id, a token, or a path — so a refusal reason can
/// never leak provenance (security-provenance ADR: audit retention needs redaction).
/// An authorization REFUSAL is never a `SecurityFault`; it rides the success lane as a
/// denied [`ActionEligibility`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum SecurityFault {
    #[error("an internal authorization check could not be completed")]
    Backend,
}

/// Redact a store error the authorization path did not expect into a generic fault.
/// A `StoreError::Actor` is NOT redacted here — it is an authorization signal the
/// guards resolve into a VALUE before this is ever reached — so any error arriving
/// here is a genuine infrastructure fault, collapsed to [`SecurityFault::Backend`]
/// with no detail carried across.
fn redact_fault(_error: &StoreError) -> SecurityFault {
    SecurityFault::Backend
}

/// The authorization context for one command: the resolved actor (from the principal
/// seam), the command's AUTHORIZED SCOPE (the workspace the request is bound to, when the
/// command carries targets), the command's target documents, and — for approve/apply-class
/// commands — the proposal's origin author (so review authority can be checked). Borrowed;
/// the engine holds nothing.
///
/// `authorized_scope` is SERVER-AUTHORITATIVE, not a client/session value: the caller
/// supplies the active workspace's `scope_token` (the same identifier that populates
/// `DocumentRef::Existing.scope`), so the scope guard fences a target claiming a DIFFERENT
/// workspace than the one the request operates on.
#[derive(Debug, Clone)]
pub struct CommandAuthorization<'a> {
    pub command: CommandKind,
    pub actor: &'a ActorRef,
    pub authorized_scope: Option<&'a str>,
    pub targets: &'a [&'a DocumentRef],
    pub origin_author: Option<&'a ActorRef>,
}

/// The acting principal must be a registered, ACTIVE actor. Resolves the record by
/// identity and turns absence/staleness into a DENIED value (denials-are-values) —
/// closing the pre-P20 gap where `ensure_active` surfaced these as a `StoreError`
/// fault. A genuine registry read failure is a redacted [`SecurityFault`].
pub fn actor_standing_guard(
    actors: &ActorRepository<'_, '_>,
    actor: &ActorRef,
    command: CommandKind,
) -> Result<Option<ActionEligibility>, SecurityFault> {
    let record = actors.record(actor).map_err(|err| redact_fault(&err))?;
    match record {
        None => Ok(Some(ActionEligibility::denied(
            command,
            "the acting principal is not a registered actor",
        ))),
        Some(record) if record.status != ActorStatus::Active => Ok(Some(
            ActionEligibility::denied(command, "the acting principal's actor record is stale"),
        )),
        Some(_) => Ok(None),
    }
}

/// A delegate is only as authorized as a STANDING delegator. When the actor carries a
/// `delegated_by` initiator, that delegating principal must itself be registered and
/// active — a confused-deputy fence (security-provenance ADR: agents are untrusted
/// writers; a delegation chain is trustworthy only while its root actor stands). A
/// non-delegated actor has nothing to check. Denials are values; a registry read
/// failure is a redacted fault.
pub fn delegation_standing_guard(
    actors: &ActorRepository<'_, '_>,
    actor: &ActorRef,
    command: CommandKind,
) -> Result<Option<ActionEligibility>, SecurityFault> {
    let Some(delegator_id) = actor.delegated_by.as_ref() else {
        return Ok(None);
    };
    let records = actors
        .records_by_actor_id(delegator_id)
        .map_err(|err| redact_fault(&err))?;
    if records.is_empty() {
        return Ok(Some(ActionEligibility::denied(
            command,
            "the delegating principal is not a registered actor",
        )));
    }
    if !records
        .iter()
        .any(|record| record.status == ActorStatus::Active)
    {
        return Ok(Some(ActionEligibility::denied(
            command,
            "the delegating principal's actor record is stale",
        )));
    }
    Ok(None)
}

/// Every target document must lie inside the AUTHORIZED SCOPE — the SCOPE GUARD the phase
/// is named for. A target whose existing scope differs from the authorized (workspace)
/// scope is refused (a delegate acting outside its authorized workspace, or a spoofed
/// cross-workspace target). Walks the composite `DocumentRef` shapes to their underlying
/// existing scope; a `ProvisionalCreate` has no existing scope to fence, so it is not
/// constrained here. Pure; denials are values.
pub fn document_scope_guard(
    authorized_scope: &str,
    targets: &[&DocumentRef],
    command: CommandKind,
) -> Option<ActionEligibility> {
    for target in targets {
        if let Some(target_scope) = existing_scope(target)
            && target_scope != authorized_scope
        {
            return Some(ActionEligibility::denied(
                command,
                "a target document lies outside the session's authorized scope",
            ));
        }
    }
    None
}

/// The existing-document scope a `DocumentRef` ultimately resolves to, if any. A
/// rename target and a materialized result carry their source/reviewed ref, so the
/// fence follows through to the real document; a provisional create has no existing
/// scope.
fn existing_scope(doc: &DocumentRef) -> Option<&str> {
    match doc {
        DocumentRef::Existing { scope, .. } => Some(scope.as_str()),
        DocumentRef::RenameTarget { source, .. } => existing_scope(source),
        DocumentRef::MaterializedResult { reviewed, .. } => existing_scope(reviewed),
        DocumentRef::ProvisionalCreate { .. } => None,
    }
}

/// Only a HUMAN or an AGENT may drive the semantic tool surface — the tool-invoking
/// principals (a human through the UI, an agent through its runtime). A SYSTEM actor's
/// authority is the policy auto-approve lane, and a TOOL-EXECUTOR is an execution
/// identity, not a requester; neither invokes a tool. This is the authorization-layer
/// "forbidden tool" guard: WHO may invoke the surface. It is DISTINCT from the
/// tool-permission plane's per-call human gate ([`super::permissions`]) and the
/// risk-tier requirement ([`super::policy`]), which decide whether a permitted call
/// still needs approval; those still apply downstream. Pure; a denial is a value.
pub fn tool_requester_kind_guard(
    actor_kind: ActorKind,
    tool: SemanticToolName,
) -> Option<ActionEligibility> {
    match actor_kind {
        ActorKind::Human | ActorKind::Agent => None,
        ActorKind::System | ActorKind::ToolExecutor => Some(ActionEligibility::denied(
            tool.command(),
            "this actor kind may not invoke the semantic tool surface",
        )),
    }
}

/// Approve / apply-class commands whose review authority is checked by reusing the
/// single self-approval authority ([`reviewer_eligibility`]). Kept in sync with the
/// `automated_self_approval_blocker` scope (Approve, RequestApply, and their kin) —
/// routing a reject or a withdrawal through the self-approval gate would wrongly
/// outlaw an agent rejecting its own proposal (deliberately legal).
fn is_review_authority_command(command: CommandKind) -> bool {
    matches!(command, CommandKind::Approve | CommandKind::RequestApply)
}

/// The composed authorization decision for one command: actor standing, then
/// delegation standing, then document scope, then — for approve/apply-class commands
/// with a known origin author — review authority (REUSED from [`reviewer_eligibility`],
/// never re-derived). First denial wins; each denial is a VALUE. A genuine registry
/// read failure short-circuits as a redacted [`SecurityFault`].
///
/// ADDITIVE: this gates who-can-act. It does NOT replace revision fences, the
/// approval-requirement matrix, or the tool-permission lifecycle — those remain owned
/// by their planes and still run downstream.
pub fn authorize_command(
    actors: &ActorRepository<'_, '_>,
    ctx: &CommandAuthorization<'_>,
) -> Result<ActionEligibility, SecurityFault> {
    if let Some(denied) = actor_standing_guard(actors, ctx.actor, ctx.command)? {
        return Ok(denied);
    }
    if let Some(denied) = delegation_standing_guard(actors, ctx.actor, ctx.command)? {
        return Ok(denied);
    }
    if let Some(authorized_scope) = ctx.authorized_scope
        && let Some(denied) = document_scope_guard(authorized_scope, ctx.targets, ctx.command)
    {
        return Ok(denied);
    }
    if is_review_authority_command(ctx.command)
        && let Some(origin_author) = ctx.origin_author
    {
        let eligibility = reviewer_eligibility(ctx.command, ctx.actor, origin_author);
        if !eligibility.allowed {
            return Ok(eligibility);
        }
    }
    Ok(ActionEligibility::allowed(ctx.command))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
    use crate::authoring::model::{ActorId, RevisionToken};
    use crate::authoring::store::Store;

    fn actor(id: &str, kind: ActorKind) -> ActorRef {
        ActorRef {
            id: ActorId::new(id).unwrap(),
            kind,
            delegated_by: None,
        }
    }

    fn delegated(id: &str, kind: ActorKind, delegated_by: &str) -> ActorRef {
        ActorRef {
            id: ActorId::new(id).unwrap(),
            kind,
            delegated_by: Some(ActorId::new(delegated_by).unwrap()),
        }
    }

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(&dir.path().join(".vault")).unwrap();
        (dir, store)
    }

    fn register(store: &mut Store, actor: &ActorRef, status: ActorStatus, now: i64) {
        let actor = actor.clone();
        store
            .with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.actors().put_record(ActorRecordInput {
                    actor: actor.clone(),
                    display: ActorDisplayMetadata::new(actor.id.as_str(), None),
                    status,
                    created_at_ms: now,
                    updated_at_ms: now,
                })?;
                Ok(())
            })
            .unwrap();
    }

    fn existing_target(scope: &str, node: &str) -> DocumentRef {
        DocumentRef::Existing {
            scope: scope.to_string(),
            node_id: node.to_string(),
            stem: node.to_string(),
            path: format!(".vault/adr/{node}.md"),
            doc_type: "adr".to_string(),
            base_revision: RevisionToken::new("blob:base").unwrap(),
        }
    }

    /// Run a guard/engine call inside a real unit of work over the live store, so the
    /// actor registry read is the same path production takes (no fabricated repo).
    fn authorize(store: &mut Store, ctx: &CommandAuthorization<'_>) -> ActionEligibility {
        store
            .with_unit_of_work(ctx.command, |uow| Ok(authorize_command(&uow.actors(), ctx)))
            .unwrap()
            .expect("authorization must resolve to a value, not a fault")
    }

    // Scenario: forbidden document scope — a target outside the session-bound scope.
    #[test]
    fn forbidden_document_scope_is_denied_as_a_value() {
        let (_dir, mut store) = temp_store();
        let author = actor("agent:writer", ActorKind::Agent);
        register(&mut store, &author, ActorStatus::Active, 100);

        let out_of_scope = existing_target("scope_b", "adr-1");
        let targets: [&DocumentRef; 1] = [&out_of_scope];
        let ctx = CommandAuthorization {
            command: CommandKind::CreateProposal,
            actor: &author,
            authorized_scope: Some("scope_a"),
            targets: &targets,
            origin_author: None,
        };

        let decision = authorize(&mut store, &ctx);
        assert!(!decision.allowed, "a cross-scope target must be refused");
        assert_eq!(decision.command, CommandKind::CreateProposal);
        assert!(
            decision
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("outside the session's authorized scope"))
        );

        // A target INSIDE the bound scope authorizes (the guard is a fence, not a ban).
        let in_scope = existing_target("scope_a", "adr-1");
        let in_targets: [&DocumentRef; 1] = [&in_scope];
        let allowed_ctx = CommandAuthorization {
            targets: &in_targets,
            ..ctx
        };
        assert!(authorize(&mut store, &allowed_ctx).allowed);
    }

    // Scenario: forbidden tool — a non-tool-driving actor kind invoking the surface.
    #[test]
    fn forbidden_tool_denies_system_and_tool_executor_kinds() {
        // System and ToolExecutor may not invoke the semantic tool surface.
        for kind in [ActorKind::System, ActorKind::ToolExecutor] {
            let denied = tool_requester_kind_guard(kind, SemanticToolName::ProposeChangeset)
                .expect("a non-tool-driving actor kind must be refused");
            assert!(!denied.allowed);
            assert_eq!(denied.command, CommandKind::CreateProposal);
            assert!(
                denied.reason.as_deref().is_some_and(
                    |reason| reason.contains("may not invoke the semantic tool surface")
                )
            );
        }
        // A human and an agent may drive the surface (authorization-layer eligibility;
        // the per-call human gate + risk tier still apply downstream).
        assert!(
            tool_requester_kind_guard(ActorKind::Human, SemanticToolName::RequestApply).is_none()
        );
        assert!(
            tool_requester_kind_guard(ActorKind::Agent, SemanticToolName::ProposeChangeset)
                .is_none()
        );
    }

    // Scenario: stale actor — a registered-but-stale principal. The core denials-are-
    // values fix: a stale actor is a VALUE denial, never a StoreError fault.
    #[test]
    fn stale_actor_is_denied_as_a_value_not_a_fault() {
        let (_dir, mut store) = temp_store();
        let stale = actor("agent:stale", ActorKind::Agent);
        register(&mut store, &stale, ActorStatus::Stale, 100);

        let ctx = CommandAuthorization {
            command: CommandKind::CreateProposal,
            actor: &stale,
            authorized_scope: None,
            targets: &[],
            origin_author: None,
        };

        // The call resolves to a value (the `authorize` helper `expect`s Ok, proving it
        // is never an Err fault) and that value is a denial.
        let decision = authorize(&mut store, &ctx);
        assert!(!decision.allowed, "a stale actor must be refused");
        assert!(
            decision
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("stale"))
        );

        // An UNREGISTERED actor is a distinct denial value (not a fault either).
        let ghost = actor("agent:ghost", ActorKind::Agent);
        let ghost_ctx = CommandAuthorization {
            actor: &ghost,
            ..ctx
        };
        let ghost_decision = authorize(&mut store, &ghost_ctx);
        assert!(!ghost_decision.allowed);
        assert!(
            ghost_decision
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("not a registered actor"))
        );
    }

    // Scenario: unauthorized apply — an automated actor applying its OWN proposal is
    // refused (review authority reused from policy::reviewer_eligibility, never
    // re-derived).
    #[test]
    fn unauthorized_apply_of_own_proposal_is_denied() {
        let (_dir, mut store) = temp_store();
        let author = actor("agent:author", ActorKind::Agent);
        register(&mut store, &author, ActorStatus::Active, 100);

        let ctx = CommandAuthorization {
            command: CommandKind::RequestApply,
            actor: &author,
            authorized_scope: None,
            targets: &[],
            origin_author: Some(&author),
        };

        let decision = authorize(&mut store, &ctx);
        assert!(!decision.allowed, "an agent cannot apply its own proposal");
        assert_eq!(decision.command, CommandKind::RequestApply);
        assert!(
            decision
                .reason
                .as_deref()
                .is_some_and(|reason| reason.contains("its own proposal")),
            "the denial reuses the self-approval authority reason: {:?}",
            decision.reason
        );

        // A DISTINCT human applier over the same proposal is authorized — authorization
        // fences self-apply, it does not ban apply.
        let human = actor("human:reviewer", ActorKind::Human);
        register(&mut store, &human, ActorStatus::Active, 100);
        let human_ctx = CommandAuthorization {
            actor: &human,
            ..ctx
        };
        assert!(authorize(&mut store, &human_ctx).allowed);
    }

    // Scenario: redacted error — a genuine infrastructure fault carries a FIXED generic
    // message that never echoes the underlying error, a token, a path, or an id.
    #[test]
    fn redacted_error_never_echoes_underlying_detail() {
        let sensitive =
            "actor human:alice token=deadbeefsecret path=/home/op/.vault/data/authoring.sqlite3";
        let source = StoreError::Io(std::io::Error::other(sensitive));

        let fault = redact_fault(&source);
        assert_eq!(fault, SecurityFault::Backend);
        let rendered = fault.to_string();
        for leak in [
            "deadbeefsecret",
            "human:alice",
            "/home/op",
            "authoring.sqlite3",
            "token=",
        ] {
            assert!(
                !rendered.contains(leak),
                "the redacted fault leaked `{leak}`: {rendered}"
            );
        }
        assert_eq!(
            rendered,
            "an internal authorization check could not be completed"
        );

        // A SQLite fault redacts identically — any non-authorization store error becomes
        // the one generic backend fault, carrying no detail across.
        let sql_fault = redact_fault(&StoreError::Idempotency(sensitive.to_string()));
        assert_eq!(sql_fault, SecurityFault::Backend);
        assert!(!sql_fault.to_string().contains("deadbeefsecret"));
    }

    // Scenario: allowed delegated command — a delegate whose delegator is a registered,
    // active principal is authorized (in-scope, non-self command).
    #[test]
    fn allowed_delegated_command_authorizes_when_delegator_stands() {
        let (_dir, mut store) = temp_store();
        let initiator = actor("human:alice", ActorKind::Human);
        let delegate = delegated("agent:writer", ActorKind::Agent, "human:alice");
        // The registry keys an actor by base (id, kind); `delegated_by` is provenance,
        // not part of the stored record. Register the delegate's BASE identity — the
        // acting ref then carries the delegation the guards resolve by id.
        register(&mut store, &initiator, ActorStatus::Active, 100);
        register(
            &mut store,
            &actor("agent:writer", ActorKind::Agent),
            ActorStatus::Active,
            100,
        );

        let in_scope = existing_target("scope_a", "adr-1");
        let targets: [&DocumentRef; 1] = [&in_scope];
        let ctx = CommandAuthorization {
            command: CommandKind::CreateProposal,
            actor: &delegate,
            authorized_scope: Some("scope_a"),
            targets: &targets,
            origin_author: None,
        };

        let decision = authorize(&mut store, &ctx);
        assert!(
            decision.allowed,
            "a delegate with a standing delegator, in scope, is authorized: {:?}",
            decision.reason
        );
        assert_eq!(decision.command, CommandKind::CreateProposal);

        // If the delegating principal goes stale, the same delegated command is refused
        // (the confused-deputy fence — a delegate is only as authorized as its
        // delegator).
        register(&mut store, &initiator, ActorStatus::Stale, 200);
        let denied = authorize(&mut store, &ctx);
        assert!(
            !denied.allowed,
            "a stale delegator revokes the delegate's authority"
        );
        assert!(denied.reason.as_deref().is_some_and(|reason| {
            reason.contains("delegating principal") && reason.contains("stale")
        }));
    }
}
