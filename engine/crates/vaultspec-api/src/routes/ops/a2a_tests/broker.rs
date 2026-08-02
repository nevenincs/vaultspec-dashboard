//! Verb whitelist, guards, and forwarded-call mapping (split from the flat a2a_tests.rs under the module-size gate
//! — a move, not a re-decision; shared fixtures live in the parent module).

use super::*;

#[tokio::test]
async fn an_unknown_verb_403s_before_any_discovery() {
    let (_dir, state) = test_state();
    let err = ops_a2a(State(state), Path("run-nuke".to_string()), None)
        .await
        .unwrap_err();
    assert_eq!(err.0, StatusCode::FORBIDDEN);
    assert!(err.1.0["error"].as_str().unwrap().contains("run-nuke"));
    assert!(
        err.1.0["tiers"]["semantic"]["available"].is_boolean(),
        "the 403 carries the tiers block"
    );
}

/// The retired `service-state` verb is refused like any other unlisted verb.
///
/// Asserted by NAME rather than left to the membership count, because the
/// failure this guards against is a re-add: the verb had a complete, working,
/// live-tested client stack behind it and no product consumer at all, and a
/// stack that still compiles is exactly the thing someone re-whitelists to
/// "unbreak". The dashboard reads a2a availability from the `agent` tier on
/// `presets-list`; if a real readiness surface is ever wanted, it arrives with
/// its consumer, not ahead of one.
#[tokio::test]
async fn the_retired_service_state_verb_is_no_longer_brokered() {
    // BOTH gates, asserted separately and deliberately. The verb is refused twice
    // over - once by the whitelist and once by the call builder's fallback - so
    // checking only the refused RESPONSE would still pass with the whitelist entry
    // put back, and a re-add is the failure this test exists to catch. The
    // membership assertion is therefore not redundant with the response one.
    assert!(
        !A2A_WHITELIST.contains(&"service-state"),
        "`service-state` was revoked: it had a full client stack, a live test, and \
         no product consumer. Re-adding it needs a consumer, not a green broker"
    );

    let (_dir, state) = test_state();
    let err = ops_a2a(State(state), Path("service-state".to_string()), None)
        .await
        .unwrap_err();
    assert_eq!(
        err.0,
        StatusCode::FORBIDDEN,
        "an unlisted verb is refused before any discovery or round-trip"
    );
    assert!(err.1.0["error"].as_str().unwrap().contains("service-state"));
}

#[test]
fn run_id_guard_accepts_path_safe_and_rejects_everything_else() {
    let (_dir, state) = test_state();
    assert_eq!(
        validate_run_id(&state, "run_abc-123").unwrap(),
        "run_abc-123"
    );
    for bad in [
        "",
        "-flag",
        "../escape",
        "run/../../etc",
        "run id",
        "run;rm",
        "a".repeat(MAX_A2A_RUN_ID_CHARS + 1).as_str(),
    ] {
        assert!(
            validate_run_id(&state, bad).is_err(),
            "`{bad}` must be rejected"
        );
    }
}

#[test]
fn token_guard_rejects_flag_injection_and_overlength() {
    let (_dir, state) = test_state();
    assert!(validate_bounded_token(&state, "team_preset", "vaultspec-authoring", 64).is_ok());
    assert!(validate_bounded_token(&state, "team_preset", "team.default:v1", 64).is_ok());
    for bad in ["", "-x", "--force", "has space", "semi;colon"] {
        assert!(
            validate_bounded_token(&state, "team_preset", bad, 64).is_err(),
            "`{bad}` must be rejected"
        );
    }
    assert!(validate_bounded_token(&state, "team_preset", &"a".repeat(65), 64).is_err());
}

#[test]
fn scope_fence_accepts_the_same_canonical_token_the_routes_serve() {
    let (_dir, state) = test_state();
    let cell = state.active_cell();
    let served = crate::routes::scope_token(&cell.root);
    validate_expected_scope(
        &state,
        &cell,
        &A2aVerbBody {
            expected_scope: Some(served),
            ..Default::default()
        },
        "active-runs",
    )
    .expect("the served route token is the generation fence token");

    #[cfg(windows)]
    assert_eq!(
        crate::routes::scope_token(std::path::Path::new(r"\\?\C:\work\project\cold")),
        "C:/work/project/cold"
    );
}

#[test]
fn build_forwarded_call_maps_read_verbs_to_the_right_paths() {
    let (_dir, state) = test_state();
    let cell = state.active_cell();
    let expected_scope = crate::routes::scope_token(&cell.root);

    // presets-list carries the engine-controlled workspace_root, percent-encoded.
    let presets =
        build_forwarded_call(&state, "presets-list", &cell, &A2aVerbBody::default()).unwrap();
    assert!(presets.path.starts_with("/v1/presets?workspace_root="));
    assert!(
        !presets.path.contains('\\') && !presets.path.contains(' '),
        "the workspace_root path is percent-encoded: {}",
        presets.path
    );

    // provider-catalog uses the same engine-owned workspace context and the
    // bounded read budget. Its response includes A2A-owned catalog and health
    // records and therefore is not parsed or reclassified at this edge.
    let catalog =
        build_forwarded_call(&state, "provider-catalog", &cell, &A2aVerbBody::default()).unwrap();
    assert!(
        catalog
            .path
            .starts_with("/v1/provider-catalog?workspace_root=")
    );
    assert!(catalog.body.is_none());
    assert_eq!(catalog.budget, A2A_READ_BUDGET);
    assert!(
        !catalog.path.contains('\\') && !catalog.path.contains(' '),
        "the workspace_root path is percent-encoded: {}",
        catalog.path
    );

    // active-runs pins state=active and carries the engine-controlled
    // workspace_root (percent-encoded); it is a bounded read, never a client
    // field. It requires no run_id.
    let active = build_forwarded_call(
        &state,
        "active-runs",
        &cell,
        &A2aVerbBody {
            expected_scope: Some(expected_scope.clone()),
            feature_tag: Some("a2a-orchestration-edge".to_string()),
            ..Default::default()
        },
    )
    .unwrap();
    assert!(
        active
            .path
            .starts_with("/v1/runs?state=active&workspace_root=")
    );
    assert!(active.path.contains("&feature_tag=a2a-orchestration-edge"));
    assert!(active.path.ends_with("&limit=2"));
    assert!(active.body.is_none());
    assert_eq!(active.budget, A2A_READ_BUDGET);
    assert!(
        !active.path.contains('\\') && !active.path.contains(' '),
        "the workspace_root path is percent-encoded: {}",
        active.path
    );
    assert_eq!(
        build_forwarded_call(
            &state,
            "active-runs",
            &cell,
            &A2aVerbBody {
                expected_scope: Some(expected_scope.clone()),
                feature_tag: Some("bad feature".to_string()),
                ..Default::default()
            }
        )
        .unwrap_err()
        .0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        build_forwarded_call(
            &state,
            "active-runs",
            &cell,
            &A2aVerbBody {
                expected_scope: Some("X:/a-different-workspace".to_string()),
                ..Default::default()
            }
        )
        .unwrap_err()
        .0,
        StatusCode::CONFLICT
    );

    // run-status requires a run_id and forms the run URL.
    let status = build_forwarded_call(
        &state,
        "run-status",
        &cell,
        &A2aVerbBody {
            run_id: Some("run-7".to_string()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(status.path, "/v1/runs/run-7");

    // run-status without a run_id is a 400.
    assert_eq!(
        build_forwarded_call(&state, "run-status", &cell, &A2aVerbBody::default())
            .unwrap_err()
            .0,
        StatusCode::BAD_REQUEST
    );
}

#[test]
fn build_run_start_validates_and_omits_actor_tokens() {
    let (_dir, state) = test_state();
    let cell = state.active_cell();
    let expected_scope = crate::routes::scope_token(&cell.root);

    // A valid run-start body: the forwarded payload carries the preset +
    // message + optional fields but NEVER an actor_tokens field (the handler
    // injects it after provisioning).
    let call = build_forwarded_call(
        &state,
        "run-start",
        &cell,
        &A2aVerbBody {
            expected_scope: Some(expected_scope.clone()),
            run_id: Some("run-start-7".to_string()),
            team_preset: Some("vaultspec-authoring".to_string()),
            message: Some("Research the edge".to_string()),
            feature_tag: Some("a2a-orchestration-edge".to_string()),
            selection: Some(served_catalog_selection()),
            overrides: Some(BTreeMap::from([(
                "role-issued-id".to_string(),
                served_catalog_selection(),
            )])),
            fallbacks: Some(vec![served_catalog_selection()]),
            autonomous: Some(true),
            ..Default::default()
        },
    )
    .unwrap();
    assert!(matches!(call.method, Method::Post));
    assert_eq!(call.path, "/v1/runs");
    let body = call.body.unwrap();
    assert_eq!(body["team_preset"], "vaultspec-authoring");
    assert_eq!(body["run_id"], "run-start-7");
    assert_eq!(body["message"], "Research the edge");
    assert_eq!(body["feature_tag"], "a2a-orchestration-edge");
    assert_eq!(body["autonomous"], true);
    assert_eq!(
        body["selection"]["provider_id"], "provider-issued-id",
        "the engine forwards the opaque provider-issued reference exactly"
    );
    assert_eq!(
        body["selection"]["entry_id"], "catalog-entry-issued-id",
        "the engine never substitutes a repository model name"
    );
    assert_eq!(
        body["selection"]["controls"]["provider-native-control-id"],
        "provider-native-control-value"
    );
    assert_eq!(
        body["overrides"]["role-issued-id"]["catalog_revision"],
        "catalog-revision-issued-id"
    );
    assert_eq!(
        body["fallbacks"][0]["execution_mode"],
        "execution-lane-issued-id"
    );
    assert_eq!(body["metadata"]["workspace_root"], expected_scope);
    assert!(body.get("expected_scope").is_none());
    assert!(
        body.get("profile_id").is_none(),
        "new starts cannot use the retired profile selection wire"
    );
    assert!(
        body.get("actor_tokens").is_none(),
        "the pure build step never carries actor tokens"
    );

    // A missing preset, empty message, and oversized message are each a 400.
    assert!(
        build_forwarded_call(
            &state,
            "run-start",
            &cell,
            &A2aVerbBody {
                expected_scope: Some(expected_scope.clone()),
                message: Some("x".to_string()),
                ..Default::default()
            }
        )
        .is_err()
    );
    assert!(
        build_forwarded_call(
            &state,
            "run-start",
            &cell,
            &A2aVerbBody {
                expected_scope: Some(expected_scope.clone()),
                team_preset: Some("p".to_string()),
                message: Some("   ".to_string()),
                ..Default::default()
            }
        )
        .is_err()
    );
    assert!(
        build_forwarded_call(
            &state,
            "run-start",
            &cell,
            &A2aVerbBody {
                expected_scope: Some(expected_scope),
                team_preset: Some("p".to_string()),
                message: Some("x".repeat(MAX_A2A_MESSAGE_BYTES + 1)),
                ..Default::default()
            }
        )
        .is_err()
    );

    // A valid-looking anonymous start is still refused: without a stable id
    // neither dispatch nor token issuance can be idempotent under retry.
    assert_eq!(
        build_forwarded_call(
            &state,
            "run-start",
            &cell,
            &A2aVerbBody {
                expected_scope: Some(crate::routes::scope_token(&cell.root)),
                team_preset: Some("p".to_string()),
                message: Some("x".to_string()),
                selection: Some(served_catalog_selection()),
                ..Default::default()
            }
        )
        .unwrap_err()
        .0,
        StatusCode::BAD_REQUEST
    );

    // TRANSITIONAL, optional-until-served: a start WITHOUT a selection is
    // admitted and forwards NO selection-shaped key at all — the only start
    // the sibling's current extra-forbid schema accepts. Overrides or
    // fallbacks without a selection stay refused: they modify a whole-team
    // selection that is not there.
    let bare = build_forwarded_call(
        &state,
        "run-start",
        &cell,
        &A2aVerbBody {
            expected_scope: Some(crate::routes::scope_token(&cell.root)),
            run_id: Some("run-missing-selection".to_string()),
            team_preset: Some("p".to_string()),
            message: Some("x".to_string()),
            ..Default::default()
        },
    )
    .expect("a selection-less start is the only start the sibling accepts today");
    let bare_body = bare.body.expect("run-start builds a body");
    for absent in ["selection", "overrides", "fallbacks"] {
        assert!(
            bare_body.get(absent).is_none(),
            "an absent {absent} forwards no key — not a null and not an empty object"
        );
    }
    assert_eq!(
        build_forwarded_call(
            &state,
            "run-start",
            &cell,
            &A2aVerbBody {
                expected_scope: Some(crate::routes::scope_token(&cell.root)),
                run_id: Some("run-orphan-overrides".to_string()),
                team_preset: Some("p".to_string()),
                message: Some("x".to_string()),
                overrides: Some(
                    std::iter::once(("role-a".to_string(), served_catalog_selection())).collect()
                ),
                ..Default::default()
            }
        )
        .unwrap_err()
        .0,
        StatusCode::BAD_REQUEST
    );
}

#[test]
fn run_start_forwards_only_keys_the_sibling_schema_admits() {
    // The agreement pin whose absence let a mandatory field ship against an
    // extra-forbid consumer. The admitted set is the sibling's
    // `RunStartRequest` field list (a2a `api/schemas/gateway.py`,
    // `model_config = ConfigDict(extra="forbid")`): a forwarded key outside it
    // is refused wholesale by the sibling, so run-start would be broken for
    // every caller — the failure must land here, in a test, first.
    // `selection`/`overrides`/`fallbacks` are DELIBERATELY absent from this
    // list until the sibling's provider-catalog producer serves them; adding
    // a key here is a reviewed cross-repository contract event, not a local
    // edit.
    const SIBLING_ADMITTED_RUN_START_KEYS: &[&str] = &[
        "stage",
        "reservation_id",
        "team_preset",
        "message",
        "actor_tokens",
        "metadata",
        "autonomous",
        "title",
        "feature_tag",
        "run_id",
        "profile_id",
        "feedback_batch_id",
    ];

    let (_dir, state) = test_state();
    let cell = state.active_cell();
    let call = build_forwarded_call(
        &state,
        "run-start",
        &cell,
        &A2aVerbBody {
            expected_scope: Some(crate::routes::scope_token(&cell.root)),
            run_id: Some("run-admitted-keys".to_string()),
            team_preset: Some("p".to_string()),
            message: Some("x".to_string()),
            feature_tag: Some("f".to_string()),
            title: Some("t".to_string()),
            autonomous: Some(true),
            ..Default::default()
        },
    )
    .expect("a fully-populated selection-less start builds");
    let body = call.body.expect("run-start builds a body");
    for key in body.as_object().expect("object body").keys() {
        assert!(
            SIBLING_ADMITTED_RUN_START_KEYS.contains(&key.as_str()),
            "forwarded run-start key `{key}` is not admitted by the sibling's \
             extra-forbid RunStartRequest — the sibling refuses the whole body"
        );
    }
}

#[test]
fn run_start_catalog_selection_is_opaque_but_resource_bounded() {
    let (_dir, state) = test_state();
    let cell = state.active_cell();
    let expected_scope = crate::routes::scope_token(&cell.root);
    let start = |selection: CatalogSelectionReference,
                 overrides: Option<BTreeMap<String, CatalogSelectionReference>>,
                 fallbacks: Option<Vec<CatalogSelectionReference>>| {
        build_forwarded_call(
            &state,
            "run-start",
            &cell,
            &A2aVerbBody {
                expected_scope: Some(expected_scope.clone()),
                run_id: Some("run-catalog-bounds".to_string()),
                team_preset: Some("team-issued-id".to_string()),
                message: Some("Use the selected catalog entry".to_string()),
                selection: Some(selection),
                overrides,
                fallbacks,
                ..Default::default()
            },
        )
    };

    // These unfamiliar values must pass unchanged: only A2A can decide whether
    // they came from the provider's current catalog. The engine has no provider
    // or model enum to keep in sync with that catalog.
    let mut opaque = served_catalog_selection();
    opaque.provider_id = "provider-issued:future-lane".to_string();
    opaque.execution_mode = "transport/issued-by-provider".to_string();
    opaque.entry_id = "entry issued by the provider".to_string();
    assert!(start(opaque, None, None).is_ok());

    let mut too_many_controls = served_catalog_selection();
    too_many_controls.controls = (0..=MAX_A2A_CONTROLS_PER_SELECTION)
        .map(|index| (format!("control-{index}"), "served-value".to_string()))
        .collect();
    assert_eq!(
        start(too_many_controls, None, None).unwrap_err().0,
        StatusCode::BAD_REQUEST
    );

    let mut blank_entry = served_catalog_selection();
    blank_entry.entry_id = "   ".to_string();
    assert_eq!(
        start(blank_entry, None, None).unwrap_err().0,
        StatusCode::BAD_REQUEST
    );

    let overrides = (0..=MAX_A2A_ROLE_OVERRIDES)
        .map(|index| (format!("role-{index}"), served_catalog_selection()))
        .collect();
    assert_eq!(
        start(served_catalog_selection(), Some(overrides), None)
            .unwrap_err()
            .0,
        StatusCode::BAD_REQUEST
    );

    let fallbacks = vec![served_catalog_selection(); MAX_A2A_FALLBACKS + 1];
    assert_eq!(
        start(served_catalog_selection(), None, Some(fallbacks))
            .unwrap_err()
            .0,
        StatusCode::BAD_REQUEST
    );
}

#[test]
fn the_retired_profile_wire_is_not_deserializable_at_the_engine_boundary() {
    let legacy = json!({ "profile_id": "legacy-profile" });
    assert!(
        serde_json::from_value::<A2aVerbBody>(legacy).is_err(),
        "new run starts must use an A2A-served catalog selection, not profile_id"
    );
}
