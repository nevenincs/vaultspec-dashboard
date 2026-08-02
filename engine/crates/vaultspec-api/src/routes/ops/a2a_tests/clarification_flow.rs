//! The clarification-respond verb (split from the flat a2a_tests.rs under the module-size gate
//! — a move, not a re-decision; shared fixtures live in the parent module).

use super::*;

/// A `clarification-respond` body with the caller's overrides applied.
fn clarification_body(answers: Value) -> A2aVerbBody {
    A2aVerbBody {
        run_id: Some("run-7".to_string()),
        request_id: Some("clr-1".to_string()),
        answers: answers.as_object().cloned(),
        ..Default::default()
    }
}

#[test]
fn clarification_respond_maps_to_the_typed_resume_route_with_bounded_answers() {
    let (_dir, state) = test_state();
    let cell = state.active_cell();

    let call = build_forwarded_call(
        &state,
        "clarification-respond",
        &cell,
        &clarification_body(json!({
            // A choice answer carries an option id; a text answer carries free
            // text. The engine bounds both and judges neither.
            "q1": "option-b",
            "q2": "Prefer the bounded broker over a new channel class.",
        })),
    )
    .unwrap();
    assert_eq!(call.method, Method::Post);
    assert_eq!(call.path, "/v1/runs/run-7/clarifications/clr-1/respond");
    assert_eq!(
        call.budget, A2A_CONTROL_BUDGET,
        "a resume dispatches the parked graph, so it carries the control budget"
    );
    let body = call.body.expect("the resume forwards the answers");
    assert_eq!(body["answers"]["q1"], "option-b");
    assert_eq!(
        body["answers"]["q2"],
        "Prefer the bounded broker over a new channel class."
    );
    assert_eq!(
        body.as_object().unwrap().len(),
        1,
        "the forwarded body carries the answers and nothing the client invented"
    );
}

#[test]
fn clarification_respond_carries_the_continuation_prompt_alternative() {
    // The sibling resolves a parked node with EXACTLY ONE of two alternatives:
    // the questionnaire, or a CONTINUATION that resumes the run with new
    // instruction instead of answering. The continuation shipped sibling-side and
    // the broker forwarded only `answers`, so the alternative was unreachable from
    // the product — this pins the carry-through.
    let (_dir, state) = test_state();
    let cell = state.active_cell();

    let call = build_forwarded_call(
        &state,
        "clarification-respond",
        &cell,
        &A2aVerbBody {
            run_id: Some("run-7".to_string()),
            request_id: Some("clr-1".to_string()),
            prompt: Some("Skip the questionnaire and start with the rail rows.".to_string()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(call.method, Method::Post);
    assert_eq!(call.path, "/v1/runs/run-7/clarifications/clr-1/respond");
    assert_eq!(
        call.budget, A2A_CONTROL_BUDGET,
        "a continuation dispatches the parked graph exactly as an answer does"
    );
    let body = call.body.expect("the resume forwards the prompt");
    assert_eq!(
        body["prompt"], "Skip the questionnaire and start with the rail rows.",
        "the continuation text rides verbatim; the parked node judges it"
    );
    assert_eq!(
        body.as_object().unwrap().len(),
        1,
        "a continuation forwards the prompt alone — never an empty answers map beside it"
    );
}

#[test]
fn clarification_respond_carries_the_decline_alternative() {
    // The third outcome: a payload-free refusal that resumes the parked run
    // with no answer given, distinct from a cancel. The sibling appends its own
    // fixed marker turn; the engine forwards the literal and judges nothing.
    let (_dir, state) = test_state();
    let cell = state.active_cell();

    let call = build_forwarded_call(
        &state,
        "clarification-respond",
        &cell,
        &A2aVerbBody {
            run_id: Some("run-7".to_string()),
            request_id: Some("clr-1".to_string()),
            decline: Some(true),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(call.method, Method::Post);
    assert_eq!(call.path, "/v1/runs/run-7/clarifications/clr-1/respond");
    assert_eq!(
        call.budget, A2A_CONTROL_BUDGET,
        "a decline dispatches the parked graph exactly as an answer does"
    );
    let body = call.body.expect("the resume forwards the decline");
    assert_eq!(body["decline"], true);
    assert_eq!(
        body.as_object().unwrap().len(),
        1,
        "a decline forwards the literal alone — no empty answers map beside it"
    );
}

#[test]
fn clarification_respond_refuses_a_false_decline() {
    // Mirrors the sibling schema: `decline: false` is "not declining" while
    // supplying no other outcome — a contradiction refused before any round-trip.
    let (_dir, state) = test_state();
    let cell = state.active_cell();

    let refused = build_forwarded_call(
        &state,
        "clarification-respond",
        &cell,
        &A2aVerbBody {
            run_id: Some("run-7".to_string()),
            request_id: Some("clr-1".to_string()),
            decline: Some(false),
            ..Default::default()
        },
    );
    assert!(refused.is_err(), "decline admits only the literal true");
}

#[test]
fn clarification_respond_refuses_both_alternatives_and_neither() {
    // Exactly-one-of is enforced at the boundary, BEFORE any round-trip, so a
    // malformed resume never reaches the parked graph and never spends a budget.
    let (_dir, state) = test_state();
    let cell = state.active_cell();

    let both = build_forwarded_call(
        &state,
        "clarification-respond",
        &cell,
        &A2aVerbBody {
            run_id: Some("run-7".to_string()),
            request_id: Some("clr-1".to_string()),
            answers: json!({ "q1": "option-b" }).as_object().cloned(),
            prompt: Some("and also do this".to_string()),
            ..Default::default()
        },
    );
    assert!(
        both.is_err(),
        "answers AND prompt is two resolutions of one transition — refused"
    );

    let answers_and_decline = build_forwarded_call(
        &state,
        "clarification-respond",
        &cell,
        &A2aVerbBody {
            run_id: Some("run-7".to_string()),
            request_id: Some("clr-1".to_string()),
            answers: json!({ "q1": "option-b" }).as_object().cloned(),
            decline: Some(true),
            ..Default::default()
        },
    );
    assert!(
        answers_and_decline.is_err(),
        "answers AND decline is two resolutions of one transition — refused"
    );

    let prompt_and_decline = build_forwarded_call(
        &state,
        "clarification-respond",
        &cell,
        &A2aVerbBody {
            run_id: Some("run-7".to_string()),
            request_id: Some("clr-1".to_string()),
            prompt: Some("chat instead".to_string()),
            decline: Some(true),
            ..Default::default()
        },
    );
    assert!(
        prompt_and_decline.is_err(),
        "prompt AND decline is two resolutions of one transition — refused"
    );

    let neither = build_forwarded_call(
        &state,
        "clarification-respond",
        &cell,
        &A2aVerbBody {
            run_id: Some("run-7".to_string()),
            request_id: Some("clr-1".to_string()),
            ..Default::default()
        },
    );
    assert!(
        neither.is_err(),
        "a resume that resolves nothing would park the graph on an answered request"
    );
}

#[test]
fn clarification_respond_refuses_every_unbounded_or_unsafe_argument() {
    let (_dir, state) = test_state();
    let cell = state.active_cell();
    let refuse = |body: A2aVerbBody, why: &str| {
        let err = build_forwarded_call(&state, "clarification-respond", &cell, &body)
            .expect_err(why)
            .0;
        assert_eq!(err, StatusCode::BAD_REQUEST, "{why}");
    };

    // The two ids are required and both are interpolated into the sibling URL,
    // so both are path-safe or refused before any round-trip.
    refuse(
        A2aVerbBody {
            request_id: Some("clr-1".to_string()),
            answers: json!({ "q1": "a" }).as_object().cloned(),
            ..Default::default()
        },
        "a missing run_id is refused",
    );
    refuse(
        A2aVerbBody {
            run_id: Some("run-7".to_string()),
            answers: json!({ "q1": "a" }).as_object().cloned(),
            ..Default::default()
        },
        "a missing request_id is refused",
    );
    for bad_request_id in ["", "-flag", "../escape", "clr/../../etc", "clr 1", "clr;rm"] {
        refuse(
            A2aVerbBody {
                run_id: Some("run-7".to_string()),
                request_id: Some(bad_request_id.to_string()),
                answers: json!({ "q1": "a" }).as_object().cloned(),
                ..Default::default()
            },
            "a request_id outside the path-safe grammar is refused",
        );
    }
    // The two sides of the request-id ceiling, one char apart, both sized from
    // the boundary's own constant. This proves the REFUSAL BEHAVIOUR and
    // deliberately says nothing about the VALUE - the value is pinned to a2a in
    // exactly one place (`a2a_contract::the_clarification_bounds_are_pinned_to_
    // the_numbers_a2a_enforces`), because a literal restated here would be a
    // second opinion about a number the engine does not own. The predecessor of
    // this test asserted `== 64` against a a2a symbol that does not exist, at
    // half the real bound, and so would have failed the correction.
    refuse(
        A2aVerbBody {
            run_id: Some("run-7".to_string()),
            request_id: Some("a".repeat(MAX_A2A_REQUEST_ID_CHARS + 1)),
            answers: json!({ "q1": "a" }).as_object().cloned(),
            ..Default::default()
        },
        "an overlength request_id is refused",
    );
    // The ceiling itself passes: a2a mints ids up to exactly this length, so
    // refusing at the boundary would strand its own questionnaire.
    build_forwarded_call(
        &state,
        "clarification-respond",
        &cell,
        &A2aVerbBody {
            run_id: Some("run-7".to_string()),
            request_id: Some("a".repeat(MAX_A2A_REQUEST_ID_CHARS)),
            answers: json!({ "q1": "a" }).as_object().cloned(),
            ..Default::default()
        },
    )
    .expect("a request id at the ceiling sits on it, not over it");
    // The concrete handle a2a really mints for a dashboard-shaped run must pass.
    // `createTeamRunId()` emits `run-` + 32 hex (36 chars) and a2a prefixes
    // `clarify-`, so this is the exact id a live panel submits - captured from a
    // real parked run rather than imagined. It is 43 chars, which the retired
    // 64-char cap happened to clear; a 57-char run id, which the engine's own
    // `MAX_A2A_RUN_ID_CHARS` declares legal, did not.
    build_forwarded_call(
        &state,
        "clarification-respond",
        &cell,
        &A2aVerbBody {
            run_id: Some("run-19b53e071e8baf92b20a029c1308828c".to_string()),
            request_id: Some("clarify-run-19b53e071e8baf92b20a029c1308828c".to_string()),
            answers: json!({ "scope": "frontend" }).as_object().cloned(),
            ..Default::default()
        },
    )
    .expect("the request id a2a mints for a dashboard run id must be answerable");
    // And the worst case the engine itself admits: a run id at the engine's own
    // run-id ceiling. a2a mints `clarify-{thread_id}` TRUNCATED to its request-id
    // cap, so the handle for such a run is exactly cap-length - the case the
    // retired 64-char cap made permanently unanswerable, and the reason the two
    // caps must each track a2a rather than each other's intuition.
    let longest_run_id = "r".repeat(MAX_A2A_RUN_ID_CHARS);
    let minted: String = format!("clarify-{longest_run_id}")
        .chars()
        .take(MAX_A2A_REQUEST_ID_CHARS)
        .collect();
    build_forwarded_call(
        &state,
        "clarification-respond",
        &cell,
        &A2aVerbBody {
            run_id: Some(longest_run_id),
            request_id: Some(minted),
            answers: json!({ "q1": "a" }).as_object().cloned(),
            ..Default::default()
        },
    )
    .expect(
        "a run id the engine declares legal must still yield an answerable \
         clarification handle",
    );

    // The answers map is required, non-empty, and capped at the D5 question
    // ceiling — a fifth answer cannot correspond to any question the node asked.
    refuse(
        A2aVerbBody {
            run_id: Some("run-7".to_string()),
            request_id: Some("clr-1".to_string()),
            ..Default::default()
        },
        "absent answers are refused",
    );
    refuse(clarification_body(json!({})), "empty answers are refused");
    refuse(
        clarification_body(json!({ "q1": "a", "q2": "a", "q3": "a", "q4": "a", "q5": "a" })),
        "a fifth answer exceeds the four-question ceiling and is refused",
    );
    // Exactly four is the boundary itself, and it passes.
    build_forwarded_call(
        &state,
        "clarification-respond",
        &cell,
        &clarification_body(json!({ "q1": "a", "q2": "a", "q3": "a", "q4": "a" })),
    )
    .expect("four answers sit at the ceiling, not over it");

    // Question ids are bounded tokens; answer values are bounded single-line
    // strings. A non-string answer never reaches the sibling.
    refuse(
        clarification_body(json!({ "has space": "a" })),
        "a question id outside the token grammar is refused",
    );
    let overlong_key: serde_json::Map<String, Value> =
        [("q".repeat(MAX_A2A_QUESTION_ID_CHARS + 1), json!("a"))]
            .into_iter()
            .collect();
    refuse(
        clarification_body(Value::Object(overlong_key)),
        "an overlength question id is refused",
    );
    for bad_answer in [json!(7), json!(true), json!(null), json!(["a"]), json!({})] {
        refuse(
            clarification_body(json!({ "q1": bad_answer })),
            "a non-string answer is refused",
        );
    }
    refuse(
        clarification_body(json!({ "q1": "a".repeat(MAX_A2A_ANSWER_CHARS + 1) })),
        "an overlength answer is refused",
    );
    // The ceiling itself passes. Asserted alongside the refusal because a cap is
    // two behaviours, and a boundary that refused AT the cap would be invisible
    // to an over-length test alone.
    build_forwarded_call(
        &state,
        "clarification-respond",
        &cell,
        &clarification_body(json!({ "q1": "a".repeat(MAX_A2A_ANSWER_CHARS) })),
    )
    .expect("an answer at the ceiling sits on it, not over it");
    refuse(
        clarification_body(json!({ "q1": "line one\nline two" })),
        "a control character in an answer is refused",
    );
}

/// The boundary holds NO independent opinion about a2a's numbers.
///
/// This is the seam the two cap defects came through. Both caps were declared
/// as local literals here, each defensible on its own terms and neither
/// reconciled with the sibling, and the tests around them sized their fixtures
/// FROM those literals - so the answer cap sat at double a2a's and the
/// request-id cap at half it, both green.
///
/// The repair is structural: the values live once in `a2a_contract`, pinned
/// there against a2a, and this test fails the moment anyone re-declares one
/// here. It is deliberately an identity check, not a value check - restating a
/// number the engine does not own is the mistake, not the fix.
#[test]
fn the_clarification_caps_are_the_contract_values_not_the_boundarys_own() {
    assert_eq!(
        MAX_A2A_ANSWER_CHARS, A2A_MAX_CLARIFICATION_ANSWER_CHARS,
        "the answer cap is a2a's MAX_ANSWER_CHARS; a wider one forwards an \
         answer the sibling's wire model refuses at 422"
    );
    assert_eq!(
        MAX_A2A_REQUEST_ID_CHARS, A2A_MAX_CLARIFICATION_REQUEST_ID_CHARS,
        "the request-id cap is a2a's MAX_REQUEST_ID_CHARS; a tighter one \
         refuses handles a2a minted and leaves the run unanswerable"
    );
    assert_eq!(
        MAX_A2A_QUESTION_ID_CHARS, A2A_MAX_CLARIFICATION_IDENTIFIER_CHARS,
        "an answers key is a2a's QuestionId, which takes the identifier cap"
    );
    assert_eq!(
        MAX_A2A_CLARIFICATION_ANSWERS, A2A_MAX_CLARIFICATION_QUESTIONS,
        "one answer per question a bounded request could have asked"
    );
}

#[test]
fn a_clarification_the_sibling_will_not_answer_forwards_its_refusal_verbatim() {
    // Whether a clarification is answerable is a2a's authority alone, and it
    // says so with a 404: an unknown run, or a request id that is expired,
    // superseded, or belongs to another run. That refusal forwards VERBATIM at
    // 200 with its sibling_status and healthy tiers, because a2a IS up — it
    // answered. The engine neither interprets the refusal nor fabricates a
    // resume the graph did not park for.
    //
    // This also pinned the pre-landing posture: before a2a served the route at
    // all, the same 404 path made the engine half inert rather than broken,
    // which is what "lands engine-side gated until a2a serves the interrupt"
    // required (agent-flow D5 consequences).
    let (_dir, state) = test_state();
    let cell = state.active_cell();
    let refused = RagError::Http {
        status: 404,
        body: r#"{"detail": "Run not found"}"#.to_string(),
    };
    let Json(body) =
        map_transport_error(&state, &cell, refused).expect("a sibling refusal is a 200");
    assert_eq!(body["data"]["sibling_status"], 404);
    assert_eq!(body["data"]["envelope"]["detail"], "Run not found");
    assert!(body["tiers"]["semantic"]["available"].is_boolean());
}

#[test]
fn a_timeout_is_504_and_a_crash_is_502() {
    let (_dir, state) = test_state();
    let cell = state.active_cell();

    let timeout = RagError::Io(std::io::Error::from(std::io::ErrorKind::TimedOut));
    assert_eq!(
        map_transport_error(&state, &cell, timeout).unwrap_err().0,
        StatusCode::GATEWAY_TIMEOUT
    );

    let crash = RagError::Io(std::io::Error::from(std::io::ErrorKind::ConnectionRefused));
    assert_eq!(
        map_transport_error(&state, &cell, crash).unwrap_err().0,
        StatusCode::BAD_GATEWAY
    );

    assert_eq!(
        map_transport_error(&state, &cell, RagError::Protocol)
            .unwrap_err()
            .0,
        StatusCode::BAD_GATEWAY
    );
}
