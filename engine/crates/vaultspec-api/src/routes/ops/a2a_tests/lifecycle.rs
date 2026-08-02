//! Token provisioning, leases, discovery, health, and replay (split from the flat a2a_tests.rs under the module-size gate
//! — a move, not a re-decision; shared fixtures live in the parent module).

use super::super::discovery::{A2aDiscovery, a2a_endpoint_from, discover_a2a_at};
use super::*;

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
            "api_version":"v1",
            "providers":[{
                "provider_id":"provider-issued-id",
                "execution_mode":"execution-lane-issued-id",
                "health":{
                    "configured":"available",
                    "transport":"available",
                    "authentication":"authenticated",
                    "catalog":"available",
                    "admission":"admitted",
                    "selectable":true,
                    "reasons":[],
                    "checked_at":"2031-01-01T00:00:00.000Z"
                },
                "catalog":{
                    "schema_version":1,
                    "state":{
                        "status":"available",
                        "revision":"catalog-revision-issued-id",
                        "checked_at":"2031-01-01T00:00:00.000Z",
                        "expires_at":"2031-01-01T00:05:00.000Z"
                    },
                    "models":[{
                        "entry_id":"catalog-entry-issued-id",
                        "native_control_ids":["provider-native-control-id"],
                        "capabilities":[]
                    }],
                    "native_controls":[{
                        "control_id":"provider-native-control-id",
                        "options":[{"option_id":"provider-native-control-value"}]
                    }]
                }
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
    let expected_scope = crate::routes::scope_token(&state.active_cell().root);
    let Json(response) = ops_a2a_with_candidates(
        state,
        "provider-catalog".to_string(),
        A2aVerbBody {
            expected_scope: Some(expected_scope),
            ..Default::default()
        },
        vec![service_json],
    )
    .await
    .expect("the live catalog reply is wrapped by the public handler");

    let catalog = &response["data"]["envelope"];
    assert_eq!(catalog["api_version"], "v1");
    assert_eq!(catalog["providers"][0]["provider_id"], "provider-issued-id");
    assert_eq!(
        catalog["providers"][0]["catalog"]["schema_version"], 1,
        "the public broker preserves the A2A lane schema version verbatim"
    );
    assert_eq!(
        catalog["providers"][0]["catalog"]["models"][0]["entry_id"],
        "catalog-entry-issued-id"
    );
    assert_eq!(
        catalog["providers"][0]["catalog"]["native_controls"][0]["options"][0]["option_id"],
        "provider-native-control-value"
    );
    assert_eq!(
        catalog["providers"][0]["health"]["authentication"], "authenticated",
        "authentication remains an A2A-owned enum rather than an engine boolean"
    );
    assert_eq!(catalog["providers"][0]["health"]["selectable"], true);
    assert!(
        response["tiers"]["agent"]["available"].is_boolean(),
        "the handler retains the shared tier envelope"
    );

    let request_line = request_rx.recv().unwrap();
    assert!(request_line.starts_with("GET /v1/provider-catalog?workspace_root="));
    assert!(
        !request_line.contains("expected_scope"),
        "the browser's generation fence is consumed by Rust and never reaches A2A"
    );
    assert!(request_line.ends_with(" HTTP/1.1"));
    server.join().unwrap();
}

#[tokio::test]
async fn run_status_round_trips_frozen_assignment_without_reclassification() {
    // This uses the production discovery, health probe, blocking broker, and
    // public handler over real loopback sockets. The served frozen snapshot is
    // deliberately treated as an A2A-owned historical record: the Rust edge
    // may wrap it, but may neither reinterpret it through a current catalog nor
    // drop provider-native values on the way to the Dashboard.
    use std::net::TcpListener;

    let expected = json!({
        "api_version": "v1",
        "run_id": "run-frozen-evidence",
        "status": "running",
        "frozen_assignment": {
            "schema_version": 1,
            "digest": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "assignments": [{
                "role_id": "writer",
                "provider_id": "provider-issued-id",
                "provider_display_name": "Provider-issued display",
                "execution_mode": "provider-issued-execution-mode",
                "catalog_revision": "provider-issued-revision",
                "entry_id": "provider-issued-entry",
                "model_name": "provider-issued-model-value",
                "model_display_name": "Provider-issued model display",
                "controls": [{
                    "control_id": "provider-issued-control",
                    "option_id": "provider-issued-option",
                    "provider_value": "provider-issued-value",
                    "display_name": "Provider-issued control display",
                    "option_display_name": "Provider-issued option display"
                }],
                "fallbacks": [{
                    "provider_id": "provider-issued-fallback-id",
                    "execution_mode": "provider-issued-fallback-mode",
                    "catalog_revision": "provider-issued-fallback-revision",
                    "entry_id": "provider-issued-fallback-entry",
                    "model_name": "provider-issued-fallback-model",
                    "controls": []
                }],
                "provenance": { "selection_source": "team_selection" }
            }]
        }
    });
    let response_body = expected.to_string();

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let (request_tx, request_rx) = std::sync::mpsc::channel();
    let server = std::thread::spawn(move || {
        let responses = [
            (200, r#"{"status":"ok","checks":{}}"#.to_string()),
            (200, response_body),
        ];
        for (index, (status, body)) in responses.into_iter().enumerate() {
            let (mut stream, _) = listener.accept().unwrap();
            let request = read_request(&stream);
            if index == 1 {
                request_tx.send(request.request_line).unwrap();
            }
            write_response(&mut stream, status, &body);
        }
    });

    let discovery = tempfile::tempdir().unwrap();
    let service_json = discovery.path().join("service.json");
    write_service_record(&service_json, port);

    let (_state_dir, state) = test_state();
    let Json(response) = ops_a2a_with_candidates(
        state,
        "run-status".to_string(),
        A2aVerbBody {
            run_id: Some("run-frozen-evidence".to_string()),
            ..Default::default()
        },
        vec![service_json],
    )
    .await
    .expect("the public broker wraps the served frozen run status");

    assert_eq!(response["data"]["envelope"], expected);
    assert!(
        response["tiers"]["agent"]["available"].is_boolean(),
        "the opaque sibling envelope retains the shared tiers block"
    );
    assert_eq!(
        request_rx.recv().unwrap(),
        "GET /v1/runs/run-frozen-evidence HTTP/1.1"
    );
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
    assert_eq!(
        prepare["selection"]["provider_id"], "provider-issued-id",
        "the served selection reaches the reservation without engine remapping"
    );
    assert_eq!(commit["stage"], "commit");
    assert_eq!(commit["reservation_id"], "resv-test-1");
    assert_eq!(commit["run_id"], "run-idem-1");
    assert_eq!(
        commit["selection"], prepare["selection"],
        "the committed run receives the exact selection that reservation admitted"
    );
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
    let offloaded = crate::routes::ops::rag_offload(&state, move || {
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
