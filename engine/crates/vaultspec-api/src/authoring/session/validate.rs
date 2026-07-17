//! Validation, id derivation, and record<->column mapping helpers for authoring sessions.

use super::*;

pub(super) fn session_scope(
    session_id: &SessionId,
    revision: Option<String>,
    request_digest: &str,
) -> IdempotencyScope {
    IdempotencyScope::new(
        "session",
        session_id.as_str(),
        revision,
        digest_value(
            "session_scope",
            &json!({ "session_id": session_id, "request_digest": request_digest }),
        )
        .expect("scope digest serializes"),
    )
}

pub(super) fn derive_session_id(
    actor: &ActorRef,
    idempotency_key: &IdempotencyKey,
    request_digest: &str,
) -> StoreResult<SessionId> {
    SessionId::new(format!(
        "session:{}",
        blob_oid(
            serde_json::to_string(&json!({
                "actor": actor,
                "idempotency_key": idempotency_key,
                "request_digest": request_digest,
            }))
            .map_err(|err| StoreError::Session(err.to_string()))?
            .as_bytes(),
        )
    ))
    .map_err(|err| StoreError::Session(err.to_string()))
}

pub(super) fn derive_turn_id(
    session_id: &SessionId,
    turn_index: i64,
    prompt_digest: &str,
) -> StoreResult<String> {
    Ok(format!(
        "turn:{}",
        blob_oid(format!("{}:{turn_index}:{prompt_digest}", session_id.as_str()).as_bytes())
    ))
}

pub(super) fn derive_run_id(session_id: &SessionId, turn_id: &str) -> StoreResult<RunId> {
    RunId::new(format!(
        "run:{}",
        blob_oid(format!("{}:{turn_id}", session_id.as_str()).as_bytes())
    ))
    .map_err(|err| StoreError::Session(err.to_string()))
}

pub(super) fn digest_value(prefix: &str, value: &impl Serialize) -> StoreResult<String> {
    let bytes =
        serde_json::to_vec(value).map_err(|err| StoreError::Idempotency(err.to_string()))?;
    Ok(format!("{prefix}:{}", blob_oid(&bytes)))
}

pub(super) fn receipt_id(
    command: CommandKind,
    aggregate_id: &str,
    request_digest: &str,
) -> StoreResult<ReceiptId> {
    ReceiptId::new(format!(
        "receipt:{:?}:{}:{}",
        command,
        aggregate_id,
        digest_suffix(request_digest)
    ))
    .map_err(|err| StoreError::Idempotency(err.to_string()))
}

pub(super) fn digest_suffix(digest: &str) -> &str {
    digest.rsplit_once(':').map_or(digest, |(_, suffix)| suffix)
}

pub(super) fn delegated_by_key(actor: &ActorRef) -> &str {
    actor.delegated_by.as_ref().map_or("", ActorId::as_str)
}

pub(super) fn langgraph_columns(
    langgraph: Option<&LangGraphRef>,
) -> (Option<&str>, Option<&str>, Option<&str>) {
    (
        langgraph.map(|value| value.thread_id.as_str()),
        langgraph.and_then(|value| value.run_id.as_ref().map(|id| id.as_str())),
        langgraph.and_then(|value| value.checkpoint_id.as_ref().map(|id| id.as_str())),
    )
}

pub(super) fn merge_langgraph_ref(
    existing: Option<LangGraphRef>,
    incoming: LangGraphRef,
    aggregate_kind: &str,
    aggregate_id: &str,
) -> StoreResult<LangGraphRef> {
    let Some(mut current) = existing else {
        return Ok(incoming);
    };
    if current.thread_id != incoming.thread_id {
        return Err(StoreError::Session(format!(
            "LangGraph thread for {aggregate_kind} `{aggregate_id}` is already `{}`",
            current.thread_id
        )));
    }
    if let Some(incoming_run_id) = incoming.run_id {
        if let Some(current_run_id) = current.run_id.as_ref()
            && *current_run_id != incoming_run_id
        {
            return Err(StoreError::Session(format!(
                "LangGraph run for {aggregate_kind} `{aggregate_id}` is already `{current_run_id}`"
            )));
        }
        current.run_id = Some(incoming_run_id);
    }
    if incoming.checkpoint_id.is_some() {
        current.checkpoint_id = incoming.checkpoint_id;
    }
    Ok(current)
}

pub(super) fn read_json_record<T: for<'de> Deserialize<'de>>(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<T> {
    let record_json: String = row.get(0)?;
    serde_json::from_str(&record_json).map_err(|err| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(err))
    })
}

pub(super) fn validate_session_record(
    record: AuthoringSessionRecord,
) -> StoreResult<AuthoringSessionRecord> {
    if record.schema_version != SESSION_RECORD_SCHEMA {
        return Err(StoreError::Session(format!(
            "unsupported session schema `{}`",
            record.schema_version
        )));
    }
    validate_scope(&record.scope)?;
    validate_title(&record.title)?;
    if record.updated_at_ms < record.created_at_ms {
        return Err(StoreError::Session(
            "session updated_at_ms predates created_at_ms".to_string(),
        ));
    }
    let _ = SessionStatus::from_str(record.status.as_str())?;
    let _ = actor_kind_from_name(actor_kind_name(record.actor.kind))?;
    Ok(record)
}

pub(super) fn session_lifecycle_status(status: SessionStatus) -> LifecycleStatus {
    match status {
        SessionStatus::Active => LifecycleStatus::Active,
        SessionStatus::Cancelled | SessionStatus::Closed => LifecycleStatus::Expired,
    }
}

pub(super) fn run_lifecycle_status(status: RunStatus) -> LifecycleStatus {
    match status {
        RunStatus::Active | RunStatus::CancelRequested => LifecycleStatus::Active,
        RunStatus::Cancelled | RunStatus::Completed | RunStatus::Failed => LifecycleStatus::Expired,
    }
}

pub(super) fn validate_turn_record(record: PromptTurnRecord) -> StoreResult<PromptTurnRecord> {
    if record.schema_version != PROMPT_TURN_RECORD_SCHEMA {
        return Err(StoreError::Session(format!(
            "unsupported prompt turn schema `{}`",
            record.schema_version
        )));
    }
    validate_prompt(&record.prompt_text)?;
    if record.turn_index <= 0 {
        return Err(StoreError::Session(
            "prompt turn index must be positive".to_string(),
        ));
    }
    Ok(record)
}

pub(super) fn validate_run_record(record: RunRecord) -> StoreResult<RunRecord> {
    if record.schema_version != RUN_RECORD_SCHEMA {
        return Err(StoreError::Session(format!(
            "unsupported run schema `{}`",
            record.schema_version
        )));
    }
    let _ = RunStatus::from_str(record.status.as_str())?;
    if record.active != (record.status.active_flag() == 1) {
        return Err(StoreError::Session(
            "run active flag does not match status".to_string(),
        ));
    }
    if record.updated_at_ms < record.created_at_ms {
        return Err(StoreError::Session(
            "run updated_at_ms predates created_at_ms".to_string(),
        ));
    }
    Ok(record)
}

pub(super) fn validate_scope(scope: &str) -> StoreResult<()> {
    if scope.trim().is_empty() || scope != scope.trim() || scope.len() > 160 {
        return Err(StoreError::Session(
            "session scope must be non-empty, unpadded, and at most 160 bytes".to_string(),
        ));
    }
    Ok(())
}

pub(super) fn validate_title(title: &str) -> StoreResult<()> {
    if title.trim().is_empty() || title != title.trim() || title.len() > 200 {
        return Err(StoreError::Session(
            "session title must be non-empty, unpadded, and at most 200 bytes".to_string(),
        ));
    }
    Ok(())
}

pub(super) fn validate_prompt(prompt: &str) -> StoreResult<()> {
    if prompt.trim().is_empty() {
        return Err(StoreError::Session(
            "prompt turn must contain non-whitespace text".to_string(),
        ));
    }
    if prompt.len() > PROMPT_TEXT_MAX_BYTES {
        return Err(StoreError::Session(format!(
            "prompt turn exceeds {PROMPT_TEXT_MAX_BYTES} bytes"
        )));
    }
    Ok(())
}

pub(super) fn validate_reason(reason: &str) -> StoreResult<()> {
    if reason.trim().is_empty() || reason != reason.trim() || reason.len() > 500 {
        return Err(StoreError::Session(
            "cancellation reason must be non-empty, unpadded, and at most 500 bytes".to_string(),
        ));
    }
    Ok(())
}

pub(super) fn validate_completion_summary(summary: Option<&str>) -> StoreResult<()> {
    if let Some(summary) = summary
        && (summary.trim().is_empty() || summary != summary.trim() || summary.len() > 500)
    {
        return Err(StoreError::Session(
            "completion summary must be non-empty, unpadded, and at most 500 bytes when present"
                .to_string(),
        ));
    }
    Ok(())
}

/// A `Failed` run's optional `failure_reason` (D1), validated like the cancel reason:
/// non-empty, unpadded, and at most 500 bytes when present.
pub(super) fn validate_failure_reason(reason: Option<&str>) -> StoreResult<()> {
    if let Some(reason) = reason
        && (reason.trim().is_empty() || reason != reason.trim() || reason.len() > 500)
    {
        return Err(StoreError::Session(
            "failure reason must be non-empty, unpadded, and at most 500 bytes when present"
                .to_string(),
        ));
    }
    Ok(())
}
