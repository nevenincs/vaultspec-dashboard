use super::clarification::{
    MAX_A2A_ANSWER_CHARS, MAX_A2A_CLARIFICATION_ANSWERS, MAX_A2A_QUESTION_ID_CHARS,
    MAX_A2A_REQUEST_ID_CHARS,
};
use super::*;
use vaultspec_product::a2a_contract::{
    A2A_MAX_CLARIFICATION_ANSWER_CHARS, A2A_MAX_CLARIFICATION_IDENTIFIER_CHARS,
    A2A_MAX_CLARIFICATION_QUESTIONS, A2A_MAX_CLARIFICATION_REQUEST_ID_CHARS,
    HANDOFF_CREDENTIAL_FILE,
};

const TEST_REQUIRED_ROLES: &[&str] = &[
    "vaultspec-researcher",
    "vaultspec-synthesist",
    "vaultspec-adr-author",
    "vaultspec-doc-reviewer",
];

const TEST_PREPARE_RESPONSE: &str = r#"{"api_version":"v1","stage":"prepared","reservation_id":"resv-test-1","lease_id":"lease-gateway-test","required_roles":["vaultspec-researcher","vaultspec-synthesist","vaultspec-adr-author","vaultspec-doc-reviewer"],"expires_at":"2026-07-20T12:00:00Z","worker_state":"ready","provider_eligibility":"eligible","run_admission":"ready","reasons":[]}"#;

fn restrict_test_handoff(path: &std::path::Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).unwrap();
    }
    #[cfg(windows)]
    {
        let whoami = std::process::Command::new("whoami.exe").output().unwrap();
        let user = String::from_utf8(whoami.stdout).unwrap();
        let grant = format!("{}:F", user.trim());
        let status = std::process::Command::new("icacls.exe")
            .arg(path)
            .args([
                "/inheritance:r",
                "/grant:r",
                &grant,
                "*S-1-5-18:F",
                "*S-1-5-32-544:F",
            ])
            .status()
            .unwrap();
        assert!(status.success());
    }
}

struct ObservedRequest {
    body: String,
}

fn read_request(stream: &std::net::TcpStream) -> ObservedRequest {
    use std::io::{BufRead, BufReader, Read};

    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut request_line = String::new();
    reader.read_line(&mut request_line).unwrap();
    let mut content_length = 0usize;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        if line == "\r\n" || line.is_empty() {
            break;
        }
        if let Some(value) = line
            .split_once(':')
            .filter(|(name, _)| name.eq_ignore_ascii_case("content-length"))
            .map(|(_, value)| value.trim())
        {
            content_length = value.parse().unwrap();
        }
    }
    let mut body = vec![0u8; content_length];
    reader.read_exact(&mut body).unwrap();
    ObservedRequest {
        body: String::from_utf8(body).unwrap(),
    }
}

fn write_response(stream: &mut std::net::TcpStream, status: u16, body: &str) {
    use std::io::{Read, Write};

    let reason = match status {
        200 => "OK",
        201 => "Created",
        404 => "Not Found",
        422 => "Unprocessable Entity",
        _ => "Response",
    };
    write!(
        stream,
        "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
    .unwrap();
    stream.flush().unwrap();
    // Close gracefully rather than by dropping the socket. We announce
    // `Connection: close`, so the client reads until EOF — and on Windows a
    // socket closed while ANY unread inbound bytes remain is reset rather than
    // finished, which discards the response the client has not read yet. The
    // client then reports a transport failure instead of the refusal under
    // test, so a harness shortcut here would read as a product defect.
    // Half-close to send FIN, then drain whatever the peer already sent so the
    // final drop has nothing left to turn into an RST.
    let _ = stream.shutdown(std::net::Shutdown::Write);
    let mut discard = [0u8; 1024];
    while let Ok(read) = stream.read(&mut discard) {
        if read == 0 {
            break;
        }
    }
}

fn write_service_record(path: &std::path::Path, port: u16) {
    let handoff = path.with_file_name(HANDOFF_CREDENTIAL_FILE);
    std::fs::write(&handoff, "tok").unwrap();
    restrict_test_handoff(&handoff);
    std::fs::write(
        path,
        format!(
            r#"{{"port": {port}, "last_heartbeat": {}, "pid": 4242, "handoff_reference": {}}}"#,
            now_ms(),
            serde_json::to_string(&handoff.to_string_lossy()).unwrap()
        ),
    )
    .unwrap();
}

fn run_start_call(state: &AppState, run_id: &str) -> ForwardedCall {
    let cell = state.active_cell();
    build_forwarded_call(
        state,
        "run-start",
        &cell,
        &A2aVerbBody {
            expected_scope: Some(crate::routes::scope_token(&cell.root)),
            run_id: Some(run_id.to_string()),
            team_preset: Some("vaultspec-adr-research".to_string()),
            message: Some("Research the bounded broker".to_string()),
            feature_tag: Some("a2a-orchestration-edge".to_string()),
            selection: Some(served_catalog_selection()),
            ..Default::default()
        },
    )
    .unwrap()
}

/// An opaque reference that stands in for an entry actually served by A2A. The
/// engine has no provider/model knowledge: these values prove only that it
/// preserves provider-issued strings and provider-native controls unchanged.
fn served_catalog_selection() -> CatalogSelectionReference {
    CatalogSelectionReference {
        provider_id: "provider-issued-id".to_string(),
        execution_mode: "execution-lane-issued-id".to_string(),
        catalog_revision: "catalog-revision-issued-id".to_string(),
        entry_id: "catalog-entry-issued-id".to_string(),
        controls: BTreeMap::from([(
            "provider-native-control-id".to_string(),
            "provider-native-control-value".to_string(),
        )]),
    }
}

fn unresolved_lease_count(state: &AppState) -> usize {
    state.a2a_run_leases.unresolved_leases().unwrap().len()
}

fn test_state() -> (tempfile::TempDir, Arc<AppState>) {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
    let state = crate::app::build_state(dir.path().to_path_buf());
    (dir, state)
}

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

    // A required selection is the replacement for the retired profile id. The
    // Rust edge verifies only bounded shape; A2A verifies that this reference
    // was actually served by the selected provider lane and remains current.
    assert_eq!(
        build_forwarded_call(
            &state,
            "run-start",
            &cell,
            &A2aVerbBody {
                expected_scope: Some(crate::routes::scope_token(&cell.root)),
                run_id: Some("run-missing-selection".to_string()),
                team_preset: Some("p".to_string()),
                message: Some("x".to_string()),
                ..Default::default()
            }
        )
        .unwrap_err()
        .0,
        StatusCode::BAD_REQUEST
    );
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

#[test]
fn provisioned_bundle_covers_every_role_with_distinct_tokens_and_forwards_the_bearer() {
    let (_dir, state) = test_state();
    let prepared = PreparedRun {
        reservation_id: "resv-bundle-1".to_string(),
        gateway_lease_id: "lease-gateway-provision".to_string(),
        required_roles: TEST_REQUIRED_ROLES
            .iter()
            .map(|role| (*role).to_string())
            .collect(),
    };
    let bundle = provision_actor_token_bundle(&state, &prepared, "run-provision-test").unwrap();

    // The machine bearer is FORWARDED, and is the engine's own. A null here
    // shipped a product whose every authoring submission failed closed: the
    // worker can only self-resolve a bearer from a LEGACY discovery record, and
    // the desktop record is secret-free by design. Asserting the exact value
    // (not merely "not null") is what keeps a future refactor from forwarding
    // some other token that happens to be non-empty.
    assert_eq!(
        bundle.wire["engine_bearer"],
        Value::String(state.bearer.clone()),
        "the run must carry the engine's machine bearer, not a null the worker \
         can only resolve from a legacy discovery record"
    );

    let tokens = bundle.wire["tokens"].as_object().unwrap();
    assert_eq!(
        tokens.len(),
        TEST_REQUIRED_ROLES.len(),
        "one token per authenticated preset-required role"
    );
    let mut seen = std::collections::HashSet::new();
    for role in TEST_REQUIRED_ROLES {
        let token = tokens[*role].as_str().expect("role token is a string");
        assert!(!token.is_empty(), "role `{role}` has a non-empty token");
        assert!(
            seen.insert(token.to_string()),
            "role `{role}` token must be distinct (roles never share a token)"
        );
        assert!(
            state
                .a2a_run_leases
                .resolve_token(token, now_ms())
                .unwrap()
                .is_some(),
            "the exact gateway lease is locally bound before dispatch"
        );
        let actor = ActorRef {
            id: ActorId::new(format!("agent:{role}")).unwrap(),
            kind: ActorKind::Agent,
            delegated_by: None,
        };
        state
            .with_authoring_store(|store| {
                store.with_unit_of_work(CommandKind::CreateSession, |uow| {
                    uow.actors().ensure_active(&actor).map(|_| ())
                })
            })
            .expect("every prepared role is registered active");
    }
    commit_local_lease(
        &state,
        &bundle.lease_id,
        &prepared.reservation_id,
        &prepared.gateway_lease_id,
        "run-provision-test",
        r#"{"api_version":"v1","stage":"committed","run_id":"run-provision-test","status":"running","lease_id":"lease-gateway-provision"}"#,
    )
    .unwrap();
    assert!(
        state
            .a2a_run_leases
            .resolve_token(tokens[TEST_REQUIRED_ROLES[0]].as_str().unwrap(), now_ms())
            .unwrap()
            .is_some(),
        "the pre-dispatch binding remains resolvable after strict confirmation"
    );
    assert_eq!(unresolved_lease_count(&state), 1);
}

#[test]
fn malformed_or_mismatched_commit_response_never_changes_the_prebound_lease() {
    let (_dir, state) = test_state();
    let prepared = PreparedRun {
        reservation_id: "resv-strict-commit".to_string(),
        gateway_lease_id: "lease-ok".to_string(),
        required_roles: vec!["vaultspec-researcher".to_string()],
    };
    let bundle = provision_actor_token_bundle(&state, &prepared, "run-strict").unwrap();
    for raw in [
        r#"{"api_version":"v2","stage":"committed","run_id":"run-strict","status":"running","lease_id":"lease-ok"}"#,
        r#"{"api_version":"v1","stage":"prepared","run_id":"run-strict","status":"running","lease_id":"lease-ok"}"#,
        r#"{"api_version":"v1","stage":"committed","run_id":"run-other","status":"running","lease_id":"lease-ok"}"#,
        r#"{"api_version":"v1","stage":"committed","run_id":"run-strict","status":"running","lease_id":"../bad"}"#,
        r#"{"api_version":"v1","stage":"committed","run_id":"run-strict","lease_id":"lease-ok"}"#,
    ] {
        assert!(
            commit_local_lease(
                &state,
                &bundle.lease_id,
                &prepared.reservation_id,
                &prepared.gateway_lease_id,
                "run-strict",
                raw,
            )
            .is_err(),
            "malformed response must fail closed: {raw}"
        );
    }
    assert_eq!(
        state.a2a_run_leases.lease_state(&bundle.lease_id).unwrap(),
        Some(crate::a2a_run_leases::LeaseState::Active)
    );
}

#[test]
fn provisioning_refuses_to_reactivate_a_stale_actor() {
    let (_dir, state) = test_state();
    let role = "vaultspec-researcher";
    let actor = ActorRef {
        id: ActorId::new(format!("agent:{role}")).unwrap(),
        kind: ActorKind::Agent,
        delegated_by: None,
    };
    state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::CreateSession, |uow| {
                uow.actors().put_record(ActorRecordInput {
                    actor,
                    display: ActorDisplayMetadata::new(role, None),
                    status: crate::authoring::actors::ActorStatus::Stale,
                    created_at_ms: 1,
                    updated_at_ms: 1,
                })?;
                Ok(())
            })
        })
        .unwrap();
    let prepared = PreparedRun {
        reservation_id: "resv-stale-actor".to_string(),
        gateway_lease_id: "lease-stale-actor".to_string(),
        required_roles: vec![role.to_string()],
    };

    assert!(provision_actor_token_bundle(&state, &prepared, "run-stale-actor").is_err());
    assert_eq!(unresolved_lease_count(&state), 0);
}

#[test]
fn discovery_classifies_absent_stale_and_fresh() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("service.json");

    // Absent: no file.
    assert!(matches!(
        discover_a2a_at(std::slice::from_ref(&path)),
        A2aDiscovery::Down { .. }
    ));

    // Stale heartbeat (1970): a crashed/stopped service, degraded.
    std::fs::write(&path, r#"{"port": 8080, "last_heartbeat": 1000}"#).unwrap();
    assert!(matches!(
        discover_a2a_at(std::slice::from_ref(&path)),
        A2aDiscovery::Down { ref reason } if reason.contains("stale")
    ));

    // Fresh heartbeat: a live service.
    let now = now_ms();
    let handoff = path.with_file_name(HANDOFF_CREDENTIAL_FILE);
    std::fs::write(&handoff, "tok").unwrap();
    restrict_test_handoff(&handoff);
    std::fs::write(
        &path,
        format!(
            r#"{{"port": 8080, "last_heartbeat": {now}, "pid": 4242, "handoff_reference": {}}}"#,
            serde_json::to_string(&handoff.to_string_lossy()).unwrap()
        ),
    )
    .unwrap();
    match discover_a2a_at(std::slice::from_ref(&path)) {
        A2aDiscovery::Fresh(info) => {
            assert_eq!(info.port, 8080);
            assert_eq!(info.service_token.as_deref(), Some("tok"));
        }
        other => panic!("expected Fresh, got {other:?}"),
    }

    std::fs::write(
        &path,
        format!(r#"{{"port": 8080, "last_heartbeat": {now}, "service_token": "must-not-appear"}}"#),
    )
    .unwrap();
    assert!(matches!(
        discover_a2a_at(std::slice::from_ref(&path)),
        A2aDiscovery::Down { ref reason } if reason.contains("raw credential")
    ));
}

#[test]
fn percent_encode_escapes_path_separators_and_drive_colon() {
    assert_eq!(percent_encode("Y:\\code\\proj"), "Y%3A%5Ccode%5Cproj");
    assert_eq!(percent_encode("plain-name_1.2~"), "plain-name_1.2~");
    assert_eq!(percent_encode("a b"), "a%20b");
}

#[test]
fn http_business_refusal_forwards_verbatim_with_sibling_status() {
    // A 4xx the sibling ANSWERS is a business refusal forwarded
    // verbatim at 200 with its sibling_status — the sibling is up, tiers stay
    // healthy. This is the a2a analog of the rag write runner's exit-1
    // status:"failed" forward.
    let (_dir, state) = test_state();
    let cell = state.active_cell();
    let refusal = RagError::Http {
        status: 422,
        body: r#"{"detail": "preset ineligible"}"#.to_string(),
    };
    let Json(body) = map_transport_error(&state, &cell, refusal).expect("a refusal is a 200");
    assert_eq!(body["data"]["sibling_status"], 422);
    assert_eq!(body["data"]["envelope"]["detail"], "preset ineligible");
    assert!(body["tiers"]["semantic"]["available"].is_boolean());
}

#[test]
fn live_loopback_discovers_health_then_round_trips_active_runs() {
    // A real TcpListener stands in for the resident a2a gateway: a real
    // service.json, a real ungated /health 200, and a real HTTP round-trip
    // through the loopback transport. This is a LIVE loopback (the rag-client
    // socket-test precedent), not a stub of engine code — it exercises the real
    // discovery predicate, the real attach gate, and the real transport. It
    // does NOT stand up the Python gateway (that live contract test lives in
    // the vaultspec-a2a repo's own test_gateway_live.py; see the report).
    use std::io::{Read, Write};
    use std::net::TcpListener;

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    // The gateway answers two Connection: close requests — the /health probe,
    // then the verb — each on its own accepted connection.
    let (request_tx, request_rx) = std::sync::mpsc::channel();
    let server = std::thread::spawn(move || {
        let health = r#"{"status": "ok", "checks": {}}"#;
        let verb = r#"{"api_version":"v1","state":"active","runs":[{"run_id":"run-7","status":"running","feature_tag":"a2a-orchestration-edge"}],"truncated":false}"#;
        for (index, body) in [health, verb].into_iter().enumerate() {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0u8; 2048];
            let read = stream.read(&mut buf).unwrap();
            if index == 1 {
                let request = String::from_utf8_lossy(&buf[..read]);
                request_tx
                    .send(request.lines().next().unwrap_or_default().to_string())
                    .unwrap();
            }
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
        }
    });

    // A fresh discovery record pointing at the real listener.
    let dir = tempfile::tempdir().unwrap();
    let service_json = dir.path().join("service.json");
    let now = now_ms();
    std::fs::write(
        &service_json,
        format!(r#"{{"port": {port}, "last_heartbeat": {now}, "pid": 4242}}"#),
    )
    .unwrap();

    // Discovery + the ungated /health gate resolve a live endpoint.
    let (endpoint_port, bearer) = a2a_endpoint_from(std::slice::from_ref(&service_json))
        .expect("a fresh, healthy gateway resolves an endpoint");
    assert_eq!(endpoint_port, port);
    let transport = LoopbackTransport {
        port: endpoint_port,
        bearer,
        timeout: A2A_READ_BUDGET,
    };
    // Resolve the production mapping and make the real bounded discovery
    // round-trip. The sibling envelope is preserved without reshaping.
    let (_state_dir, state) = test_state();
    let cell = state.active_cell();
    let expected_scope = crate::routes::scope_token(&cell.root);
    let call = build_forwarded_call(
        &state,
        "active-runs",
        &cell,
        &A2aVerbBody {
            expected_scope: Some(expected_scope),
            feature_tag: Some("a2a-orchestration-edge".to_string()),
            ..Default::default()
        },
    )
    .unwrap();
    let raw = transport.get(&call.path).expect("verb round-trips");
    let envelope: Value = serde_json::from_str(&raw).unwrap();
    assert_eq!(envelope["api_version"], "v1");
    assert_eq!(envelope["state"], "active");
    assert_eq!(envelope["runs"][0]["run_id"], "run-7");
    assert_eq!(envelope["truncated"], false);

    let request_line = request_rx.recv().unwrap();
    assert!(request_line.starts_with("GET /v1/runs?state=active&workspace_root="));
    assert!(request_line.contains("&feature_tag=a2a-orchestration-edge"));
    assert!(request_line.contains("&limit=2 HTTP/1.1"));

    server.join().unwrap();
}

#[tokio::test]
async fn provider_catalog_round_trips_opaque_catalog_and_health_through_the_handler() {
    // The loopback gateway is a real TCP listener reached through the production
    // discovery, health probe, blocking broker, and response envelope path. It
    // is deliberately an opaque provider catalog: this test proves that the
    // engine relays A2A-issued model/control and health facts unchanged rather
    // than maintaining its own provider or tier vocabulary.
    use std::io::{Read, Write};
    use std::net::TcpListener;

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let (request_tx, request_rx) = std::sync::mpsc::channel();
    let server = std::thread::spawn(move || {
        let health = r#"{"status":"ok","checks":{}}"#;
        let catalog = r#"{
            "providers":[{
                "provider_id":"provider-issued-id",
                "execution_mode":"execution-lane-issued-id",
                "health":{
                    "configured":true,
                    "transport":"available",
                    "authenticated":"unknown",
                    "catalog_available":true,
                    "admitted":true,
                    "selectable":true
                },
                "catalog":{"revision":"catalog-revision-issued-id","fresh":true},
                "entries":[{
                    "entry_id":"catalog-entry-issued-id",
                    "controls":[{
                        "control_id":"provider-native-control-id",
                        "options":[{"option_id":"provider-native-control-value"}]
                    }]
                }]
            }]
        }"#;
        for (index, body) in [health, catalog].into_iter().enumerate() {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0u8; 4096];
            let read = stream.read(&mut buf).unwrap();
            if index == 1 {
                let request = String::from_utf8_lossy(&buf[..read]);
                request_tx
                    .send(request.lines().next().unwrap_or_default().to_string())
                    .unwrap();
            }
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .unwrap();
        }
    });

    let discovery = tempfile::tempdir().unwrap();
    let service_json = discovery.path().join("service.json");
    std::fs::write(
        &service_json,
        format!(
            r#"{{"port": {port}, "last_heartbeat": {}, "pid": 4242}}"#,
            now_ms()
        ),
    )
    .unwrap();

    let (_state_dir, state) = test_state();
    let Json(response) = ops_a2a_with_candidates(
        state,
        "provider-catalog".to_string(),
        A2aVerbBody::default(),
        vec![service_json],
    )
    .await
    .expect("the live catalog reply is wrapped by the public handler");

    let catalog = &response["data"]["envelope"];
    assert_eq!(catalog["providers"][0]["provider_id"], "provider-issued-id");
    assert_eq!(
        catalog["providers"][0]["entries"][0]["entry_id"],
        "catalog-entry-issued-id"
    );
    assert_eq!(
        catalog["providers"][0]["entries"][0]["controls"][0]["options"][0]["option_id"],
        "provider-native-control-value"
    );
    assert_eq!(
        catalog["providers"][0]["health"]["authenticated"], "unknown",
        "authentication remains an A2A-owned state rather than an engine boolean"
    );
    assert_eq!(catalog["providers"][0]["health"]["selectable"], true);
    assert!(
        response["tiers"]["agent"]["available"].is_boolean(),
        "the handler retains the shared tier envelope"
    );

    let request_line = request_rx.recv().unwrap();
    assert!(request_line.starts_with("GET /v1/provider-catalog?workspace_root="));
    assert!(request_line.ends_with(" HTTP/1.1"));
    server.join().unwrap();
}

#[test]
fn accepted_run_start_replay_preflights_existing_and_does_not_mint_again() {
    use std::net::TcpListener;

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let (requests_tx, requests_rx) = std::sync::mpsc::channel();
    let server = std::thread::spawn(move || {
        let responses = [
            (200, r#"{"status":"ok"}"#),
            (404, r#"{"detail":"not found"}"#),
            (201, TEST_PREPARE_RESPONSE),
            (
                201,
                r#"{"api_version":"v1","stage":"committed","run_id":"run-idem-1","status":"running","lease_id":"lease-gateway-test"}"#,
            ),
            (200, r#"{"status":"ok"}"#),
            (
                200,
                r#"{"api_version":"v1","run_id":"run-idem-1","status":"running"}"#,
            ),
        ];
        for (index, (status, body)) in responses.into_iter().enumerate() {
            let (mut stream, _) = listener.accept().unwrap();
            let request = read_request(&stream);
            if index == 2 || index == 3 {
                requests_tx.send(request).unwrap();
            }
            write_response(&mut stream, status, body);
        }
    });

    let discovery = tempfile::tempdir().unwrap();
    let service_json = discovery.path().join("service.json");
    write_service_record(&service_json, port);
    let (_state_dir, state) = test_state();

    let first = execute_broker_call(
        &state,
        run_start_call(&state, "run-idem-1"),
        Some("run-idem-1"),
        std::slice::from_ref(&service_json),
    );
    assert!(matches!(first, BrokeredRoundTrip::Answer(Ok(_))));
    assert_eq!(unresolved_lease_count(&state), 1);

    let replay = execute_broker_call(
        &state,
        run_start_call(&state, "run-idem-1"),
        Some("run-idem-1"),
        std::slice::from_ref(&service_json),
    );
    assert!(matches!(replay, BrokeredRoundTrip::Answer(Ok(_))));
    assert_eq!(
        unresolved_lease_count(&state),
        1,
        "an accepted idempotent replay must not append or rotate tokens"
    );

    let prepare: Value = serde_json::from_str(&requests_rx.recv().unwrap().body).unwrap();
    let commit: Value = serde_json::from_str(&requests_rx.recv().unwrap().body).unwrap();
    assert_eq!(prepare["stage"], "prepare");
    assert!(prepare.get("actor_tokens").is_none());
    assert_eq!(commit["stage"], "commit");
    assert_eq!(commit["reservation_id"], "resv-test-1");
    assert_eq!(commit["run_id"], "run-idem-1");
    assert_eq!(
        commit["actor_tokens"]["tokens"].as_object().unwrap().len(),
        TEST_REQUIRED_ROLES.len()
    );
    server.join().unwrap();
}

#[test]
fn refusals_revoke_but_ambiguous_transport_failures_retain_and_retry_tokens() {
    use std::net::TcpListener;

    // First real gateway: prepare admits, then commit explicitly refuses. The
    // locally reserved lease is revoked rather than left resolvable.
    let refused_listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let refused_port = refused_listener.local_addr().unwrap().port();
    let refused_server = std::thread::spawn(move || {
        for (status, body) in [
            (200, r#"{"status":"ok"}"#),
            (404, r#"{"detail":"not found"}"#),
            (201, TEST_PREPARE_RESPONSE),
            (422, r#"{"detail":"preset ineligible"}"#),
            (404, r#"{"detail":"not found"}"#),
            (
                201,
                r#"{"api_version":"v1","stage":"released","reservation_id":"resv-test-1","released":true}"#,
            ),
        ] {
            let (mut stream, _) = refused_listener.accept().unwrap();
            let _request = read_request(&stream);
            write_response(&mut stream, status, body);
        }
    });
    let refused_discovery = tempfile::tempdir().unwrap();
    let refused_json = refused_discovery.path().join("service.json");
    write_service_record(&refused_json, refused_port);
    let (_state_dir, state) = test_state();
    let refused = execute_broker_call(
        &state,
        run_start_call(&state, "run-refused-1"),
        Some("run-refused-1"),
        std::slice::from_ref(&refused_json),
    );
    assert!(matches!(
        refused,
        BrokeredRoundTrip::Answer(Err(RagError::Http { status: 422, .. }))
    ));
    assert_eq!(unresolved_lease_count(&state), 0);
    refused_server.join().unwrap();

    // Second real gateway: prepare admits, then it accepts commit and closes
    // without an HTTP response. The exact same reservation/id/token commit is
    // retried once and returns the authoritative committed lease.
    let failed_listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let failed_port = failed_listener.local_addr().unwrap().port();
    let failed_server = std::thread::spawn(move || {
        for (index, (status, body)) in [
            (200, r#"{"status":"ok"}"#),
            (404, r#"{"detail":"not found"}"#),
            (201, TEST_PREPARE_RESPONSE),
            (200, ""),
            (
                201,
                r#"{"api_version":"v1","stage":"committed","run_id":"run-failed-1","status":"submitted","lease_id":"lease-gateway-test"}"#,
            ),
        ]
        .into_iter()
        .enumerate()
        {
            let (mut stream, _) = failed_listener.accept().unwrap();
            let _request = read_request(&stream);
            if index != 3 {
                write_response(&mut stream, status, body);
            }
        }
    });
    let failed_discovery = tempfile::tempdir().unwrap();
    let failed_json = failed_discovery.path().join("service.json");
    write_service_record(&failed_json, failed_port);
    let failed = execute_broker_call(
        &state,
        run_start_call(&state, "run-failed-1"),
        Some("run-failed-1"),
        std::slice::from_ref(&failed_json),
    );
    assert!(matches!(failed, BrokeredRoundTrip::Answer(Ok(_))));
    assert_eq!(unresolved_lease_count(&state), 1);
    failed_server.join().unwrap();
}

#[test]
fn accepted_start_with_a_lost_response_retains_tokens_and_recovers_idempotently() {
    use std::net::TcpListener;

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let (post_tx, post_rx) = std::sync::mpsc::channel();
    let server = std::thread::spawn(move || {
        // health, absent preflight, admitted prepare, accepted commit whose
        // response is dropped, then the exact idempotent commit replay.
        for (index, (status, body)) in [
            (200, r#"{"status":"ok"}"#),
            (404, r#"{"detail":"not found"}"#),
            (201, TEST_PREPARE_RESPONSE),
            (201, ""),
            (
                201,
                r#"{"api_version":"v1","stage":"committed","run_id":"run-lost-ack","status":"running","lease_id":"lease-gateway-test"}"#,
            ),
        ]
        .into_iter()
        .enumerate()
        {
            let (mut stream, _) = listener.accept().unwrap();
            let request = read_request(&stream);
            if index == 3 || index == 4 {
                post_tx.send(request).unwrap();
            }
            if index != 3 {
                write_response(&mut stream, status, body);
            }
        }
    });
    let discovery = tempfile::tempdir().unwrap();
    let service_json = discovery.path().join("service.json");
    write_service_record(&service_json, port);
    let (_state_dir, state) = test_state();
    let outcome = execute_broker_call(
        &state,
        run_start_call(&state, "run-lost-ack"),
        Some("run-lost-ack"),
        std::slice::from_ref(&service_json),
    );
    assert!(matches!(outcome, BrokeredRoundTrip::Answer(Ok(_))));
    assert_eq!(unresolved_lease_count(&state), 1);

    let accepted_body: Value = serde_json::from_str(&post_rx.recv().unwrap().body).unwrap();
    let recovery_body: Value = serde_json::from_str(&post_rx.recv().unwrap().body).unwrap();
    assert!(accepted_body.get("actor_tokens").is_some());
    assert_eq!(accepted_body, recovery_body);
    assert_eq!(recovery_body["stage"], "commit");
    assert_eq!(recovery_body["reservation_id"], "resv-test-1");
    server.join().unwrap();
}

#[tokio::test(flavor = "current_thread")]
async fn stalled_health_probe_yields_the_async_worker() {
    use std::net::TcpListener;

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let server = std::thread::spawn(move || {
        for index in 0..2 {
            let (mut stream, _) = listener.accept().unwrap();
            let _request = read_request(&stream);
            if index == 0 {
                std::thread::sleep(Duration::from_millis(200));
            }
            write_response(&mut stream, 200, r#"{"status":"ok"}"#);
        }
    });
    let discovery = tempfile::tempdir().unwrap();
    let service_json = discovery.path().join("service.json");
    write_service_record(&service_json, port);
    let (_state_dir, state) = test_state();
    // Any read verb exercises the stalled-probe path; `presets-list` is the
    // cheapest one that survives the whitelist.
    let call = build_forwarded_call(
        &state,
        "presets-list",
        &state.active_cell(),
        &A2aVerbBody::default(),
    )
    .unwrap();
    let execution_state = Arc::clone(&state);
    let candidates = vec![service_json];
    let offloaded = super::super::rag_offload(&state, move || {
        execute_broker_call(&execution_state, call, None, &candidates)
    });
    tokio::pin!(offloaded);

    tokio::select! {
        _ = tokio::time::sleep(Duration::from_millis(30)) => {}
        _ = &mut offloaded => panic!("the deliberately stalled health probe completed too early"),
    }
    let outcome = offloaded.await.unwrap();
    assert!(matches!(outcome, BrokeredRoundTrip::Answer(Ok(_))));
    server.join().unwrap();
}

#[test]
fn a_stale_gateway_never_probes_health_and_reports_down() {
    // A stale discovery record is known-down BEFORE any /health probe — the
    // transport resolve returns the truthful reason the handler degrades on.
    let dir = tempfile::tempdir().unwrap();
    let service_json = dir.path().join("service.json");
    // Heartbeat from 1970 → stale. The port is unbound; a health probe would
    // hang/refuse, so proving we never reach it also proves the fast gate.
    std::fs::write(&service_json, r#"{"port": 9, "last_heartbeat": 1000}"#).unwrap();
    match a2a_endpoint_from(std::slice::from_ref(&service_json)) {
        Ok(_) => panic!("a stale gateway must be known-down, not a live endpoint"),
        Err(reason) => assert!(reason.contains("stale"), "reason: {reason}"),
    }
}

/// Drive one full run-start broker round-trip against a real loopback gateway
/// whose prepare response is `prepare_body`, and assert the refusal fails
/// closed: the drive surfaces a protocol error and NO lease, token, or actor
/// was minted. The server answers exactly the three exchanges a refused drive
/// performs — health, the absent-run preflight, then the offending prepare —
/// so a drive that wrongly proceeded past the gate would also hang the accept
/// loop rather than pass silently.
fn assert_prepare_refusal_mints_nothing(run_id: &str, prepare_body: String) {
    use std::net::TcpListener;

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let server = std::thread::spawn(move || {
        for (status, body) in [
            (200, r#"{"status":"ok"}"#.to_string()),
            (404, r#"{"detail":"not found"}"#.to_string()),
            (201, prepare_body),
        ] {
            let (mut stream, _) = listener.accept().unwrap();
            let _request = read_request(&stream);
            write_response(&mut stream, status, &body);
        }
    });
    let discovery = tempfile::tempdir().unwrap();
    let service_json = discovery.path().join("service.json");
    write_service_record(&service_json, port);
    let (_state_dir, state) = test_state();
    let outcome = execute_broker_call(
        &state,
        run_start_call(&state, run_id),
        Some(run_id),
        std::slice::from_ref(&service_json),
    );
    assert!(
        matches!(outcome, BrokeredRoundTrip::Answer(Err(RagError::Protocol))),
        "a refused prepare must fail closed as a protocol error"
    );
    assert_eq!(
        unresolved_lease_count(&state),
        0,
        "a refused prepare must mint no lease, token, or actor"
    );
    server.join().unwrap();
}

#[test]
fn a_prepare_response_failing_the_admission_gate_mints_nothing() {
    // The prepare gate is a five-way protocol check (api_version, stage,
    // worker_state, provider_eligibility, run_admission). A response that fails
    // it must refuse the run BEFORE any credential exists. Two distinct failing
    // legs: a non-"prepared" stage, and a run admission that is not "ready".
    assert_prepare_refusal_mints_nothing(
        "run-prepare-stage-refused",
        TEST_PREPARE_RESPONSE.replace(r#""stage":"prepared""#, r#""stage":"pending""#),
    );
    assert_prepare_refusal_mints_nothing(
        "run-prepare-admission-refused",
        TEST_PREPARE_RESPONSE.replace(
            r#""run_admission":"ready""#,
            r#""run_admission":"backpressure""#,
        ),
    );
}

#[test]
fn invalid_prepare_role_sets_fail_closed_and_mint_nothing() {
    // The prepare-returned role set is the only authority for which worker
    // identities receive run credentials, so every malformed set must refuse
    // the run with nothing minted: a duplicate role, an id outside the agent
    // charset, an empty set, and a set over the shared 64-role ceiling.
    let with_roles = |roles: Value| {
        let mut response: Value = serde_json::from_str(TEST_PREPARE_RESPONSE).unwrap();
        response["required_roles"] = roles;
        response.to_string()
    };
    assert_prepare_refusal_mints_nothing(
        "run-roles-duplicate",
        with_roles(json!(["vaultspec-researcher", "vaultspec-researcher"])),
    );
    assert_prepare_refusal_mints_nothing("run-roles-bad-charset", with_roles(json!(["bad role!"])));
    assert_prepare_refusal_mints_nothing("run-roles-empty", with_roles(json!([])));
    let overflow: Vec<String> = (0..=MAX_A2A_REQUIRED_ROLES)
        .map(|index| format!("role-{index}"))
        .collect();
    assert_prepare_refusal_mints_nothing("run-roles-overflow", with_roles(json!(overflow)));
}

#[test]
fn the_verb_whitelist_is_exactly_the_reviewed_contract_surface() {
    // The whitelist's force is its exact membership: four orchestration control
    // verbs, two bounded reads (active-run recovery plus A2A-owned provider
    // catalog/health), and one typed interrupt-resume (agent-flow D5(c)), and
    // nothing else. Any addition, removal, or rename is a contract change and
    // must fail here.
    //
    // It was five control verbs until `service-state` was removed. That entry
    // bought the engine a discovery and `/health` round-trip for a verb no
    // product surface had ever called: the dashboard reads a2a's availability
    // from the `agent` tier on `presets-list`, not from this. Its only caller
    // was the live test asserting it round-tripped - which proved the broker
    // worked and said nothing about the product needing it. Brokered authority
    // is granted for a consumer, so an entry with no consumer is revoked.
    const CONTROL_VERBS: &[&str] = &["run-start", "run-status", "run-cancel", "presets-list"];
    const BOUNDED_READS: &[&str] = &["active-runs", "provider-catalog"];
    const RESUME_VERBS: &[&str] = &["clarification-respond"];
    assert_eq!(
        A2A_WHITELIST.len(),
        CONTROL_VERBS.len() + BOUNDED_READS.len() + RESUME_VERBS.len(),
        "the whitelist holds exactly the four control verbs, the two bounded reads, \
         and the one typed resume"
    );
    assert_eq!(
        A2A_WHITELIST
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len(),
        A2A_WHITELIST.len(),
        "whitelist entries are distinct"
    );
    for verb in CONTROL_VERBS
        .iter()
        .chain(BOUNDED_READS)
        .chain(RESUME_VERBS)
    {
        assert!(
            A2A_WHITELIST.contains(verb),
            "expected whitelisted verb `{verb}` is missing"
        );
    }
}

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
