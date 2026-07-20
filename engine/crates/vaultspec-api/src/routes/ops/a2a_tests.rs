use super::*;

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
    use std::io::Write;

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
}

fn write_service_record(path: &std::path::Path, port: u16) {
    let handoff = path.with_file_name("service.token");
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
            ..Default::default()
        },
    )
    .unwrap()
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
        crate::routes::scope_token(std::path::Path::new(
            r"\\?\Y:\code\vaultspec-dashboard-worktrees\cold"
        )),
        "Y:/code/vaultspec-dashboard-worktrees/cold"
    );
}

#[test]
fn build_forwarded_call_maps_read_verbs_to_the_right_paths() {
    let (_dir, state) = test_state();
    let cell = state.active_cell();
    let expected_scope = crate::routes::scope_token(&cell.root);

    let service =
        build_forwarded_call(&state, "service-state", &cell, &A2aVerbBody::default()).unwrap();
    assert_eq!(service.path, "/v1/service");
    assert!(service.body.is_none());

    // presets-list carries the engine-controlled workspace_root, percent-encoded.
    let presets =
        build_forwarded_call(&state, "presets-list", &cell, &A2aVerbBody::default()).unwrap();
    assert!(presets.path.starts_with("/v1/presets?workspace_root="));
    assert!(
        !presets.path.contains('\\') && !presets.path.contains(' '),
        "the workspace_root path is percent-encoded: {}",
        presets.path
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
            profile_id: Some("team-defaults".to_string()),
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
    assert_eq!(body["metadata"]["workspace_root"], expected_scope);
    assert!(body.get("expected_scope").is_none());
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
                ..Default::default()
            }
        )
        .unwrap_err()
        .0,
        StatusCode::BAD_REQUEST
    );
}

#[test]
fn provisioned_bundle_covers_every_role_with_distinct_tokens_and_no_bearer() {
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

    // engine_bearer is absent (null): the worker self-resolves it.
    assert_eq!(bundle.wire["engine_bearer"], Value::Null);

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
    let handoff = path.with_file_name("service.token");
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
    // ADR D1: a 4xx the sibling ANSWERS is a business refusal forwarded
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
    let call = build_forwarded_call(
        &state,
        "service-state",
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
