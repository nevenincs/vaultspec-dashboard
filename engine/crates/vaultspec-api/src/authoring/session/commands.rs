//! Session command orchestration: the idempotent, event-emitting free functions
//! layered over `SessionRepository` (create/turn/cancel/complete/resume) and their
//! shared idempotency, event-append, and authorization helpers.

use super::*;

pub fn create_session(
    store: &mut Store,
    context: SessionCommandContext,
    request: CreateSessionRequest,
) -> StoreResult<SessionCommandResult> {
    let request_digest = digest_value("session_request", &request)?;
    let session_id = derive_session_id(&context.actor, &context.idempotency_key, &request_digest)?;
    let scope = session_scope(&session_id, None, &request_digest);
    store.with_unit_of_work(CommandKind::CreateSession, |uow| {
        run_idempotent(
            uow,
            &context,
            IdempotentCoordinates {
                command: CommandKind::CreateSession,
                aggregate_kind: "session",
                aggregate_id: session_id.as_str().to_string(),
                scope,
                request_digest: request_digest.clone(),
            },
            |receipt_id| {
                let record = uow.sessions().create_session(
                    session_id.clone(),
                    request,
                    context.actor.clone(),
                    context.now_ms,
                )?;
                append_session_created_event(
                    uow,
                    &record,
                    &context.actor,
                    Some(context.idempotency_key.clone()),
                    Some(CommandKind::CreateSession),
                    receipt_id,
                    context.now_ms,
                )?;
                Ok(SessionCommandOutcome {
                    schema_version: OUTCOME_SCHEMA.to_string(),
                    command: CommandKind::CreateSession,
                    session_id: record.session_id,
                    status: "created".to_string(),
                    receipt_id: receipt_id.clone(),
                    run_id: None,
                    snapshot: None,
                })
            },
        )
    })
}

pub fn start_prompt_turn(
    store: &mut Store,
    context: SessionCommandContext,
    session_id: SessionId,
    request: StartPromptTurnRequest,
) -> StoreResult<SessionCommandResult> {
    let request_digest = digest_value("prompt_turn_request", &request)?;
    let scope = session_scope(&session_id, None, &request_digest);
    store.with_unit_of_work(CommandKind::StartPromptTurn, |uow| {
        run_idempotent(
            uow,
            &context,
            IdempotentCoordinates {
                command: CommandKind::StartPromptTurn,
                aggregate_kind: "session",
                aggregate_id: session_id.as_str().to_string(),
                scope,
                request_digest: request_digest.clone(),
            },
            |receipt_id| {
                // D7 consumption fence: a referenced feedback batch must exist and
                // belong to THIS session before the turn is accepted. The batch's
                // `source_revision` is provenance; the apply path's base-revision
                // fences bind it later — the turn fence is existence + ownership.
                if let Some(batch_id) = &request.feedback_batch_id {
                    let batch = uow.feedback_batches().get(batch_id)?.ok_or_else(|| {
                        StoreError::Validation(format!("unknown feedback batch `{batch_id}`"))
                    })?;
                    if batch.session_id != session_id {
                        return Err(StoreError::Validation(format!(
                            "feedback batch `{batch_id}` belongs to another session"
                        )));
                    }
                }
                let (turn, run) = uow.sessions().start_prompt_turn(
                    &session_id,
                    request,
                    context.actor.clone(),
                    context.now_ms,
                )?;
                // A turn started its own run directly, or was enqueued behind the active
                // run (D2). Each announces its own lifecycle kind; there is no JOIN arm.
                let (status, run_id) = match &run {
                    Some(run) => {
                        append_session_event(
                            uow,
                            LifecycleAggregateKind::Run,
                            run.run_id.as_str(),
                            LifecycleEventKind::RunStarted,
                            &context,
                            receipt_id,
                            json!({ "run": run }),
                        )?;
                        ("started", Some(run.run_id.clone()))
                    }
                    None => {
                        append_session_event(
                            uow,
                            LifecycleAggregateKind::Session,
                            session_id.as_str(),
                            LifecycleEventKind::TurnQueued,
                            &context,
                            receipt_id,
                            json!({ "turn": turn }),
                        )?;
                        ("queued", None)
                    }
                };
                // W14.P42a S262 — OPPORTUNISTIC compaction. A new prompt turn is the natural
                // activity boundary at which prior turns' generation transcripts have reached
                // a terminal lifecycle and become past-due, so one bounded `compact_due` sweep
                // runs inside THIS existing turn-creation unit of work (no background loop,
                // self-throttled to real turns, capped per sweep). Protected product state
                // (pending approvals) and rollback material are excluded by the retention
                // engine's due-set by construction, never compacted here. The compaction
                // audit key is the per-command receipt id (unique per command).
                super::super::stream::compact_generation_transcripts(
                    uow,
                    receipt_id.as_str(),
                    context.now_ms,
                )?;
                let snapshot = uow.sessions().snapshot(&session_id, run_id.as_ref())?;
                Ok(SessionCommandOutcome {
                    schema_version: OUTCOME_SCHEMA.to_string(),
                    command: CommandKind::StartPromptTurn,
                    session_id: session_id.clone(),
                    status: status.to_string(),
                    receipt_id: receipt_id.clone(),
                    run_id,
                    snapshot: Some(snapshot),
                })
            },
        )
    })
}

pub fn cancel_run(
    store: &mut Store,
    context: SessionCommandContext,
    run_id: RunId,
    request: CancelRunRequest,
) -> StoreResult<SessionCommandResult> {
    let request_digest = digest_value("cancel_run_request", &request)?;
    let scope = IdempotencyScope::new(
        "run",
        run_id.as_str(),
        None,
        digest_value(
            "run_scope",
            &json!({ "run_id": run_id, "request_digest": request_digest }),
        )?,
    );
    store.with_unit_of_work(CommandKind::CancelRun, |uow| {
        run_idempotent(
            uow,
            &context,
            IdempotentCoordinates {
                command: CommandKind::CancelRun,
                aggregate_kind: "run",
                aggregate_id: run_id.as_str().to_string(),
                scope,
                request_digest: request_digest.clone(),
            },
            |receipt_id| {
                let (run, changed) = uow
                    .sessions()
                    .cancel_run(&run_id, request, context.now_ms)?;
                if changed {
                    append_session_event(
                        uow,
                        LifecycleAggregateKind::Run,
                        run.run_id.as_str(),
                        LifecycleEventKind::CancellationRecorded,
                        &context,
                        receipt_id,
                        json!({ "run": run }),
                    )?;
                    // D2: the session stays Active, so the freed slot promotes the oldest
                    // queued turn atomically in THIS same unit of work.
                    if let Some(promoted) = uow
                        .sessions()
                        .promote_next_queued_turn(&run.session_id, context.now_ms)?
                    {
                        append_promoted_run_started(uow, &promoted, &context, receipt_id)?;
                    }
                }
                let snapshot = uow
                    .sessions()
                    .snapshot(&run.session_id, Some(&run.run_id))?;
                Ok(SessionCommandOutcome {
                    schema_version: OUTCOME_SCHEMA.to_string(),
                    command: CommandKind::CancelRun,
                    session_id: run.session_id,
                    status: "cancelled".to_string(),
                    receipt_id: receipt_id.clone(),
                    run_id: Some(run.run_id),
                    snapshot: Some(snapshot),
                })
            },
        )
    })
}

pub fn cancel_session(
    store: &mut Store,
    context: SessionCommandContext,
    session_id: SessionId,
    request: CancelSessionRequest,
) -> StoreResult<SessionCommandResult> {
    let request_digest = digest_value("cancel_session_request", &request)?;
    let scope = session_scope(&session_id, None, &request_digest);
    store.with_unit_of_work(CommandKind::CancelSession, |uow| {
        run_idempotent(
            uow,
            &context,
            IdempotentCoordinates {
                command: CommandKind::CancelSession,
                aggregate_kind: "session",
                aggregate_id: session_id.as_str().to_string(),
                scope,
                request_digest: request_digest.clone(),
            },
            |receipt_id| {
                let (session, cancelled_run, changed) =
                    uow.sessions()
                        .cancel_session(&session_id, request, context.now_ms)?;
                if changed {
                    // The active run (if any) records its cancellation, then the session
                    // aggregate records its own new `session.cancelled` kind — keyed
                    // distinctly so both reach the deduped feed. NO promotion fires: a
                    // cancelled session's queue is voided, never drained.
                    if let Some(run) = &cancelled_run {
                        append_session_event(
                            uow,
                            LifecycleAggregateKind::Run,
                            run.run_id.as_str(),
                            LifecycleEventKind::CancellationRecorded,
                            &context,
                            receipt_id,
                            json!({ "run": run }),
                        )?;
                    }
                    append_session_event_keyed(
                        uow,
                        LifecycleAggregateKind::Session,
                        session_id.as_str(),
                        LifecycleEventKind::SessionCancelled,
                        &context,
                        receipt_id,
                        ":session-cancelled",
                        json!({ "session": session }),
                    )?;
                }
                let snapshot = uow.sessions().snapshot(&session_id, None)?;
                Ok(SessionCommandOutcome {
                    schema_version: OUTCOME_SCHEMA.to_string(),
                    command: CommandKind::CancelSession,
                    session_id: session.session_id.clone(),
                    status: "cancelled".to_string(),
                    receipt_id: receipt_id.clone(),
                    run_id: cancelled_run.map(|run| run.run_id),
                    snapshot: Some(snapshot),
                })
            },
        )
    })
}

pub fn close_session(
    store: &mut Store,
    context: SessionCommandContext,
    session_id: SessionId,
    request: CloseSessionRequest,
) -> StoreResult<SessionCommandResult> {
    let request_digest = digest_value("close_session_request", &request)?;
    let scope = session_scope(&session_id, None, &request_digest);
    store.with_unit_of_work(CommandKind::CloseSession, |uow| {
        run_idempotent(
            uow,
            &context,
            IdempotentCoordinates {
                command: CommandKind::CloseSession,
                aggregate_kind: "session",
                aggregate_id: session_id.as_str().to_string(),
                scope,
                request_digest: request_digest.clone(),
            },
            |receipt_id| {
                let (session, changed) =
                    uow.sessions()
                        .close_session(&session_id, request, context.now_ms)?;
                if changed {
                    // The benign terminal transition — no run to cancel (an active run
                    // is refused upstream) and no queue to void, so the session records
                    // its single new `session.closed` kind, keyed distinctly like the
                    // sibling `session.cancelled` so it reaches the deduped feed.
                    append_session_event_keyed(
                        uow,
                        LifecycleAggregateKind::Session,
                        session_id.as_str(),
                        LifecycleEventKind::SessionClosed,
                        &context,
                        receipt_id,
                        ":session-closed",
                        json!({ "session": session }),
                    )?;
                }
                let snapshot = uow.sessions().snapshot(&session_id, None)?;
                Ok(SessionCommandOutcome {
                    schema_version: OUTCOME_SCHEMA.to_string(),
                    command: CommandKind::CloseSession,
                    session_id: session.session_id.clone(),
                    status: "closed".to_string(),
                    receipt_id: receipt_id.clone(),
                    run_id: None,
                    snapshot: Some(snapshot),
                })
            },
        )
    })
}

pub fn complete_run(
    store: &mut Store,
    context: SessionCommandContext,
    run_id: RunId,
    request: CompleteRunRequest,
) -> StoreResult<SessionCommandResult> {
    let request_digest = digest_value("complete_run_request", &request)?;
    let scope = IdempotencyScope::new(
        "run",
        run_id.as_str(),
        None,
        digest_value(
            "run_scope",
            &json!({ "run_id": run_id, "request_digest": request_digest }),
        )?,
    );
    store.with_unit_of_work(CommandKind::CompleteRun, |uow| {
        run_idempotent(
            uow,
            &context,
            IdempotentCoordinates {
                command: CommandKind::CompleteRun,
                aggregate_kind: "run",
                aggregate_id: run_id.as_str().to_string(),
                scope,
                request_digest: request_digest.clone(),
            },
            |receipt_id| {
                let (run, changed) = uow.sessions().complete_run(
                    &run_id,
                    request,
                    &context.actor,
                    context.now_ms,
                )?;
                if changed {
                    append_session_event(
                        uow,
                        LifecycleAggregateKind::Run,
                        run.run_id.as_str(),
                        LifecycleEventKind::RunCompleted,
                        &context,
                        receipt_id,
                        json!({ "run": run }),
                    )?;
                    // D2: settlement is the queue's promotion trigger — the oldest queued
                    // turn is promoted into a fresh run atomically in THIS unit of work.
                    if let Some(promoted) = uow
                        .sessions()
                        .promote_next_queued_turn(&run.session_id, context.now_ms)?
                    {
                        append_promoted_run_started(uow, &promoted, &context, receipt_id)?;
                    }
                }
                let snapshot = uow
                    .sessions()
                    .snapshot(&run.session_id, Some(&run.run_id))?;
                Ok(SessionCommandOutcome {
                    schema_version: OUTCOME_SCHEMA.to_string(),
                    command: CommandKind::CompleteRun,
                    session_id: run.session_id,
                    status: "completed".to_string(),
                    receipt_id: receipt_id.clone(),
                    run_id: Some(run.run_id),
                    snapshot: Some(snapshot),
                })
            },
        )
    })
}

pub fn resume_run(
    store: &mut Store,
    context: SessionCommandContext,
    run_id: RunId,
    request: ResumeRunRequest,
) -> StoreResult<SessionCommandResult> {
    let request_digest = digest_value("resume_run_request", &request)?;
    let scope = IdempotencyScope::new(
        "run",
        run_id.as_str(),
        None,
        digest_value(
            "run_scope",
            &json!({ "run_id": run_id, "request_digest": request_digest }),
        )?,
    );
    store.with_unit_of_work(CommandKind::ResumeRun, |uow| {
        run_idempotent(
            uow,
            &context,
            IdempotentCoordinates {
                command: CommandKind::ResumeRun,
                aggregate_kind: "run",
                aggregate_id: run_id.as_str().to_string(),
                scope,
                request_digest: request_digest.clone(),
            },
            |receipt_id| {
                let snapshot = uow.sessions().resume_run(&run_id, request)?;
                Ok(SessionCommandOutcome {
                    schema_version: OUTCOME_SCHEMA.to_string(),
                    command: CommandKind::ResumeRun,
                    session_id: snapshot.session.session_id.clone(),
                    status: "resumed".to_string(),
                    receipt_id: receipt_id.clone(),
                    run_id: Some(run_id.clone()),
                    snapshot: Some(snapshot),
                })
            },
        )
    })
}

pub fn session_snapshot(store: &mut Store, session_id: SessionId) -> StoreResult<SessionSnapshot> {
    store.with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
        uow.sessions().snapshot(&session_id, None)
    })
}

pub fn list_sessions(
    store: &mut Store,
    cap: u32,
    after_ms: Option<i64>,
    after_session_id: Option<SessionId>,
) -> StoreResult<SessionListPage> {
    store.with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
        uow.sessions()
            .list_sessions(cap, after_ms, after_session_id)
    })
}

#[derive(Debug, Clone)]
struct IdempotentCoordinates {
    command: CommandKind,
    aggregate_kind: &'static str,
    aggregate_id: String,
    scope: IdempotencyScope,
    request_digest: String,
}

fn run_idempotent(
    uow: &UnitOfWork<'_>,
    context: &SessionCommandContext,
    coordinates: IdempotentCoordinates,
    handler: impl FnOnce(&ReceiptId) -> StoreResult<SessionCommandOutcome>,
) -> StoreResult<SessionCommandResult> {
    let _actor_record = uow.actors().ensure_active(&context.actor)?;
    let key_scope = IdempotencyKeyScope::new(
        context.actor.clone(),
        coordinates.command,
        context.idempotency_key.clone(),
    );
    let receipt_id = receipt_id(
        coordinates.command,
        &coordinates.aggregate_id,
        &coordinates.request_digest,
    )?;
    match uow.idempotency().lookup_replay(
        &key_scope,
        &coordinates.scope,
        &coordinates.request_digest,
        context.now_ms,
    )? {
        ReplayLookup::Replay(record) => {
            let outcome = outcome_from_record(&record)?;
            return Ok(SessionCommandResult::Replayed {
                outcome,
                idempotency: record,
            });
        }
        ReplayLookup::InFlight(record) => {
            return Ok(SessionCommandResult::InFlight {
                idempotency: record,
            });
        }
        ReplayLookup::Conflict(conflict) => return Err(idempotency_conflict(&conflict)),
        ReplayLookup::None | ReplayLookup::Expired(_) => {}
    }

    let reservation = match uow.idempotency().reserve_in_flight(
        key_scope,
        coordinates.scope,
        coordinates.request_digest,
        receipt_id,
        context.now_ms,
        context.in_flight_expires_at_ms,
    )? {
        ReserveDecision::Reserved(reservation) => reservation,
        ReserveDecision::Replay(record) => {
            let outcome = outcome_from_record(&record)?;
            return Ok(SessionCommandResult::Replayed {
                outcome,
                idempotency: record,
            });
        }
        ReserveDecision::InFlight(record) => {
            return Ok(SessionCommandResult::InFlight {
                idempotency: record,
            });
        }
        ReserveDecision::Conflict(conflict) => return Err(idempotency_conflict(&conflict)),
    };
    let outcome = handler(&reservation.receipt_id)?;
    let idempotency = record_outcome(
        uow,
        &reservation,
        coordinates.aggregate_kind,
        &coordinates.aggregate_id,
        &outcome,
        context,
    )?;
    Ok(SessionCommandResult::Accepted {
        outcome,
        idempotency,
    })
}

fn record_outcome(
    uow: &UnitOfWork<'_>,
    reservation: &InFlightReservation,
    aggregate_kind: &str,
    aggregate_id: &str,
    outcome: &SessionCommandOutcome,
    context: &SessionCommandContext,
) -> StoreResult<IdempotencyRecord> {
    let payload =
        serde_json::to_value(outcome).map_err(|err| StoreError::Idempotency(err.to_string()))?;
    uow.idempotency().record_outcome(
        reservation,
        RecordedOutcome {
            kind: OutcomeKind::Accepted,
            aggregate_kind: aggregate_kind.to_string(),
            aggregate_id: aggregate_id.to_string(),
            schema: OUTCOME_SCHEMA.to_string(),
            payload,
            http_status: Some(200),
            completed_at_ms: context.now_ms,
            outcome_expires_at_ms: context.outcome_expires_at_ms,
        },
        context.now_ms,
    )
}

fn append_session_event(
    uow: &UnitOfWork<'_>,
    aggregate_kind: LifecycleAggregateKind,
    aggregate_id: &str,
    event_kind: LifecycleEventKind,
    context: &SessionCommandContext,
    receipt_id: &ReceiptId,
    payload: Value,
) -> StoreResult<()> {
    append_session_event_keyed(
        uow,
        aggregate_kind,
        aggregate_id,
        event_kind,
        context,
        receipt_id,
        "",
        payload,
    )
}

/// Append a lifecycle event, folding `discriminator` into the event/dedupe key. A
/// command that emits ONE event keys purely on its receipt id (`discriminator` = "");
/// a command that emits a SECOND event in the same unit of work — a settle/cancel that
/// also promotes the next queued turn, emitting `run.started` — passes a distinct
/// discriminator so the two events do not collapse to one on the deduped outbox.
#[allow(clippy::too_many_arguments)]
pub(super) fn append_session_event_keyed(
    uow: &UnitOfWork<'_>,
    aggregate_kind: LifecycleAggregateKind,
    aggregate_id: &str,
    event_kind: LifecycleEventKind,
    context: &SessionCommandContext,
    receipt_id: &ReceiptId,
    discriminator: &str,
    payload: Value,
) -> StoreResult<()> {
    let key = format!("session-event:{}{}", receipt_id.as_str(), discriminator);
    let event = lifecycle_event_draft(LifecycleEventInput {
        event_id: key.clone(),
        dedupe_key: key,
        aggregate_kind,
        aggregate_id: aggregate_id.to_string(),
        event_kind,
        actor: context.actor.clone(),
        command: Some(context_command(event_kind)),
        idempotency_key: Some(context.idempotency_key.clone()),
        payload,
        created_at_ms: context.now_ms,
    })?;
    match uow.outbox().append_event(event)? {
        AppendDecision::Inserted(_) | AppendDecision::Duplicate(_) => Ok(()),
    }
}

/// Emit `run.started` for a queued turn just promoted (FIFO) into a fresh run inside a
/// settle/cancel command's unit of work — keyed distinctly from that command's own
/// event so both reach the feed. It mirrors a direct start's `run.started` exactly, so
/// the client renders a promoted run identically to a directly-started one.
pub(super) fn append_promoted_run_started(
    uow: &UnitOfWork<'_>,
    run: &RunRecord,
    context: &SessionCommandContext,
    receipt_id: &ReceiptId,
) -> StoreResult<()> {
    append_session_event_keyed(
        uow,
        LifecycleAggregateKind::Run,
        run.run_id.as_str(),
        LifecycleEventKind::RunStarted,
        context,
        receipt_id,
        &format!(":promote:{}", run.run_id.as_str()),
        json!({ "run": run }),
    )
}

pub(crate) fn append_session_created_event(
    uow: &UnitOfWork<'_>,
    record: &AuthoringSessionRecord,
    actor: &ActorRef,
    idempotency_key: Option<IdempotencyKey>,
    command: Option<CommandKind>,
    receipt_id: &ReceiptId,
    created_at_ms: i64,
) -> StoreResult<()> {
    let event = lifecycle_event_draft(LifecycleEventInput {
        event_id: format!("session-event:{}", receipt_id.as_str()),
        dedupe_key: format!("session-event:{}", receipt_id.as_str()),
        aggregate_kind: LifecycleAggregateKind::Session,
        aggregate_id: record.session_id.as_str().to_string(),
        event_kind: LifecycleEventKind::SessionCreated,
        actor: actor.clone(),
        command,
        idempotency_key,
        payload: json!({ "session": record }),
        created_at_ms,
    })?;
    match uow.outbox().append_event(event)? {
        AppendDecision::Inserted(_) | AppendDecision::Duplicate(_) => Ok(()),
    }
}

fn context_command(event_kind: LifecycleEventKind) -> CommandKind {
    match event_kind {
        LifecycleEventKind::SessionCreated => CommandKind::CreateSession,
        LifecycleEventKind::RunStarted => CommandKind::StartPromptTurn,
        LifecycleEventKind::CancellationRecorded => CommandKind::CancelRun,
        LifecycleEventKind::RunCompleted => CommandKind::CompleteRun,
        LifecycleEventKind::TurnQueued => CommandKind::StartPromptTurn,
        LifecycleEventKind::SessionCancelled => CommandKind::CancelSession,
        LifecycleEventKind::SessionClosed => CommandKind::CloseSession,
        _ => CommandKind::ResumeRun,
    }
}

fn outcome_from_record(record: &IdempotencyRecord) -> StoreResult<SessionCommandOutcome> {
    let payload = record
        .outcome
        .as_ref()
        .ok_or_else(|| {
            StoreError::Idempotency(
                "replayed session command carries no recorded outcome".to_string(),
            )
        })?
        .payload
        .clone();
    serde_json::from_value(payload).map_err(|err| {
        StoreError::Idempotency(format!("recorded session outcome is unreadable: {err}"))
    })
}

fn idempotency_conflict(conflict: &IdempotencyConflict) -> StoreError {
    StoreError::Idempotency(format!(
        "idempotency key `{}` conflicts with existing session command scope `{}`",
        conflict.key_scope.key.as_str(),
        conflict.existing_scope.id
    ))
}
