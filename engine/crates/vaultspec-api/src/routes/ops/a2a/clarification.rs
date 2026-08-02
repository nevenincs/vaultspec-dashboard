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

/// The ceiling on the handle a2a MINTS. The served respond route puts no bound
/// on its `request_id` path parameter at all, so there is no a2a-side refusal
/// to defer to and nothing is gained by being strict here - while being
/// stricter than a2a's minting ceiling refuses a handle a2a issued and leaves
/// the run parked with no way to answer it through this edge.
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
/// `{"answers": {question_id: answer}}` / `{"prompt": text}` body keys below are
/// the whole reconciliation surface with the a2a gateway's clarification route,
/// and the only lines that change if the landed sibling route differs.
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

    // The sibling resolves a parked node with EXACTLY ONE of two alternatives:
    // `answers` (the questionnaire) or `prompt` (a continuation that resumes the
    // run with new instruction instead of answering). Refuse both-or-neither here,
    // before any round-trip, so a malformed resume never reaches the parked graph.
    match (body.answers.as_ref(), body.prompt.as_deref()) {
        (Some(_), Some(_)) => {
            return Err(super::super::super::api_error(
                state,
                StatusCode::BAD_REQUEST,
                "clarification-respond takes either `answers` or `prompt`, never both".to_string(),
            ));
        }
        (None, None) => {
            return Err(super::super::super::api_error(
                state,
                StatusCode::BAD_REQUEST,
                "clarification-respond requires an `answers` object keyed by question id, \
                 or a `prompt` continuing the run"
                    .to_string(),
            ));
        }
        (None, Some(prompt)) => {
            let prompt =
                validate_bounded_text(state, "clarification prompt", prompt, MAX_A2A_ANSWER_CHARS)?;
            return Ok(ForwardedCall {
                method: Method::Post,
                path: respond_path(&run_id, &request_id),
                body: Some(json!({ "prompt": Value::String(prompt) })),
                budget: A2A_CONTROL_BUDGET,
            });
        }
        (Some(_), None) => {}
    }

    let answers = body.answers.as_ref().expect("answers present in this arm");
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
