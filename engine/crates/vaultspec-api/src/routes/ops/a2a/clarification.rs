//! The `clarification-respond` boundary: the typed resume of a run parked on a
//! mid-run clarification interrupt (agent-flow D5(c)).
//!
//! The engine's whole job here is bounding. The questions themselves are read
//! from the authoritative `run-status` disclosure — never from this verb and
//! never from the non-authoritative `clarification-pending` relay frame — and
//! the parked node alone decides whether the answers resume the graph: whether
//! an option id exists, whether an answer satisfies its question, and whether
//! every required question was answered. So nothing below judges an answer; it
//! only refuses one that could not have come from a bounded question set, and
//! refuses it BEFORE any round-trip.

use axum::Json;
use axum::http::StatusCode;
use serde_json::{Value, json};
use vaultspec_product::a2a_contract::{
    A2A_MAX_CLARIFICATION_ANSWER_CHARS, A2A_MAX_CLARIFICATION_IDENTIFIER_CHARS,
    A2A_MAX_CLARIFICATION_QUESTIONS, A2A_MAX_CLARIFICATION_REQUEST_ID_CHARS,
};

use super::{
    A2A_CONTROL_BUDGET, A2aVerbBody, ForwardedCall, Method, validate_bounded_text,
    validate_bounded_token, validate_path_safe_id, validate_run_id,
};
use crate::app::AppState;

// Every cap below is a2a's, imported from the one contract declaration rather
// than restated here. A boundary that refuses MORE than the sibling strands a
// questionnaire the sibling issued; one that admits more buys the user an
// unexplained 422 on a run that stays parked. Neither direction is a safe
// default, so the engine holds no independent opinion about these numbers.

/// At most one answer per question a bounded request could have asked
/// (agent-flow D5; a2a's `MAX_QUESTIONS_PER_REQUEST`, which bounds the answer
/// map as well as the question set).
pub(super) const MAX_A2A_CLARIFICATION_ANSWERS: usize = A2A_MAX_CLARIFICATION_QUESTIONS;

/// 128, the same ceiling a run id gets, because that is what the id CONTAINS:
/// a2a mints it as `clarify-{thread_id}` truncated to its own
/// `MAX_REQUEST_ID_CHARS`. A tighter bound here refuses handles the sibling
/// legitimately issued and would accept, which leaves the run unanswerable from
/// this boundary — it was 64 until that was found.
pub(super) const MAX_A2A_REQUEST_ID_CHARS: usize = A2A_MAX_CLARIFICATION_REQUEST_ID_CHARS;

/// A question id is the key of the forwarded `answers` map, which a2a types as
/// `QuestionId` — so it takes the identifier cap, not the request-id cap.
pub(super) const MAX_A2A_QUESTION_ID_CHARS: usize = A2A_MAX_CLARIFICATION_IDENTIFIER_CHARS;

/// An answer value is EITHER a choice option id OR free text; which one a given
/// question admits is the parked node's authority, not the engine's, so the
/// boundary bounds the shape both share: a single-line capped string. Control
/// characters are refused exactly as they are for every other bounded text
/// field, so a text answer is one line — the questionnaire renders an input,
/// never a textarea.
pub(super) const MAX_A2A_ANSWER_CHARS: usize = A2A_MAX_CLARIFICATION_ANSWER_CHARS;

/// The sibling route this verb forwards to, named ONCE: this spelling and the
/// `{"answers": {question_id: answer}}` body key below are the whole
/// reconciliation surface with the a2a gateway's clarification route, and the
/// only lines that change if the landed sibling route differs.
fn respond_path(run_id: &str, request_id: &str) -> String {
    format!("/v1/runs/{run_id}/clarifications/{request_id}/respond")
}

/// Resolve `clarification-respond` to its forwarded sibling call, bounding every
/// client-controlled argument at the engine boundary first.
pub(super) fn build_call(
    state: &AppState,
    body: &A2aVerbBody,
) -> Result<ForwardedCall, (StatusCode, Json<Value>)> {
    // Both ids are interpolated into the sibling URL, so both are path-safe or
    // refused: they address one specific parked node.
    let run_id = body.run_id.as_deref().ok_or_else(|| {
        super::super::super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            "clarification-respond requires a `run_id`".to_string(),
        )
    })?;
    let run_id = validate_run_id(state, run_id)?;
    let request_id = body.request_id.as_deref().ok_or_else(|| {
        super::super::super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            "clarification-respond requires a `request_id`".to_string(),
        )
    })?;
    let request_id =
        validate_path_safe_id(state, "request_id", request_id, MAX_A2A_REQUEST_ID_CHARS)?;

    let answers = body.answers.as_ref().ok_or_else(|| {
        super::super::super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            "clarification-respond requires an `answers` object keyed by question id".to_string(),
        )
    })?;
    // A fifth answer cannot correspond to any question a bounded request asked.
    if answers.is_empty() || answers.len() > MAX_A2A_CLARIFICATION_ANSWERS {
        return Err(super::super::super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "clarification-respond `answers` must hold 1 to \
                 {MAX_A2A_CLARIFICATION_ANSWERS} entries"
            ),
        ));
    }

    let mut bounded = serde_json::Map::with_capacity(answers.len());
    for (question_id, answer) in answers {
        let question_id = validate_bounded_token(
            state,
            "answers question id",
            question_id,
            MAX_A2A_QUESTION_ID_CHARS,
        )?;
        let answer = answer.as_str().ok_or_else(|| {
            super::super::super::api_error(
                state,
                StatusCode::BAD_REQUEST,
                format!(
                    "clarification-respond answer for `{question_id}` must be a string \
                     (a choice option id or free text)"
                ),
            )
        })?;
        let answer =
            validate_bounded_text(state, "clarification answer", answer, MAX_A2A_ANSWER_CHARS)?;
        bounded.insert(question_id, Value::String(answer));
    }

    Ok(ForwardedCall {
        method: Method::Post,
        path: respond_path(&run_id, &request_id),
        body: Some(json!({ "answers": Value::Object(bounded) })),
        // A resume dispatches the parked graph, so it carries the control
        // budget rather than a read budget.
        budget: A2A_CONTROL_BUDGET,
    })
}
