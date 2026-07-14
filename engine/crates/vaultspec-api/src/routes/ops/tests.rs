use super::*;

// Two-sided D2 budget anchor: the frontend guards the client-outlives-engine
// ordering against its mirrored `ENGINE_SEARCH_BUDGET_MS`
// (`frontend/src/stores/server/queries.ts`), which cannot see this constant.
// Pinning the numeric value HERE makes a budget retune fail at the source of
// the change, so the mirror can never go silently stale — anyone changing
// `SEARCH_HTTP_BUDGET` / rag-client `READ_BUDGET` must visit both anchors.
#[test]
fn search_budget_is_pinned_to_the_frontend_mirror_anchor() {
    assert_eq!(SEARCH_HTTP_BUDGET, Duration::from_secs(10));
}

// rag's real FLAT HTTP `/search` envelope, captured live against rag 0.2.28
// (`POST /search {query, type, project_root, top_k}`): results sit at the
// TOP level (no `{ok, command, data}` wrapper), each item carrying rag's real
// field vocabulary, alongside the top-level `request_id`/`summary`/`timing`/
// `index_state` context. The vault path prefix, the `codebase` discriminator,
// and the null code symbols mirror the captured live shape; a `code`-source
// hit with a `function_name` and an unknown-discriminator hit are added to
// pin every annotation branch. `source` is the vault|codebase DISCRIMINATOR,
// never a path — the fixture exists to pin that.
const RAG_REAL: &str = r##"{
        "request_id": "req-7f3c",
        "summary": "5 results",
        "timing": {"total_ms": 7, "embed_ms": 3, "search_ms": 4},
        "index_state": {
            "source": "vault", "indexed_count": 3173, "vault_count": 3173,
            "code_count": 10507, "indexed_target_root": "Y:\\code\\proj",
            "requested_target_root": "Y:\\code\\proj", "target_matches": true,
            "status": "available"
        },
        "results": [
            {"id": "adr/2026-06-05-x-adr",
             "path": ".vault/adr/2026-06-05-x-adr.md",
             "title": "x adr", "snippet": "# x adr",
             "score": 0.548, "source": "vault",
             "doc_type": "adr", "feature": "f", "date": "2026-06-05",
             "line_start": null, "line_end": null},
            {"id": "src/lib.rs:1-9:aa", "path": "src/lib.rs", "score": 0.40,
             "source": "code", "function_name": "alpha", "language": "rust",
             "line_start": 1, "line_end": 9},
            {"id": "src/lib.rs:20-30:bb", "path": "src/lib.rs", "score": 0.30,
             "source": "codebase", "language": "rust",
             "function_name": null, "class_name": null},
            {"id": "src/main.rs:5-40:cc", "path": "src/main.rs", "score": 0.25,
             "source": "codebase", "class_name": "Server", "language": "rust"},
            {"score": 0.10, "source": "unknown-future-kind"}
        ]
    }"##;

#[test]
fn annotates_rags_real_flat_shape() {
    let rag: Value = serde_json::from_str(RAG_REAL).unwrap();
    let out = flatten_and_annotate(&rag, None).expect("real flat shape annotates");

    // The flat envelope's top-level context fields pass through verbatim —
    // there is nothing to flatten, only annotate in place.
    assert_eq!(out["request_id"], "req-7f3c");
    assert_eq!(out["summary"], "5 results");
    assert_eq!(out["index_state"]["status"], "available");
    assert_eq!(out["timing"]["total_ms"], 7);
    let results = out["results"].as_array().unwrap();
    assert_eq!(results.len(), 5, "every hit survives; none dropped");

    // Vault hit → doc node from the PATH STEM (last segment, `.md` stripped),
    // not the "vault" discriminator. rag fields pass through alongside node_id.
    assert_eq!(results[0]["node_id"], "doc:2026-06-05-x-adr");
    assert_eq!(results[0]["doc_type"], "adr");
    assert_eq!(results[0]["score"], 0.548);

    // Code hit with a symbol → code-artifact id qualified by `#symbol`.
    assert_eq!(results[1]["node_id"], "code:src/lib.rs#alpha");
    // The LIVE `codebase` discriminator with null symbols → bare path (the
    // real captured code shape).
    assert_eq!(results[2]["node_id"], "code:src/lib.rs");
    // A `codebase` hit qualified by its class symbol still clicks through.
    assert_eq!(results[3]["node_id"], "code:src/main.rs#Server");
    // Unknown discriminator → explicit null (typed miss), never guessed.
    assert_eq!(results[4]["node_id"], Value::Null);
}

#[test]
fn missing_results_list_is_a_typed_miss_not_an_empty_success() {
    // A 2xx flat body with no `results` key at all is shape drift.
    let rag = json!({"request_id": "r-1", "summary": "x"});
    assert!(matches!(
        flatten_and_annotate(&rag, None).unwrap_err(),
        SearchShapeMiss::NoResults
    ));
    // A `results` that is not an array is the same shape drift.
    assert!(matches!(
        flatten_and_annotate(&json!({"results": "not-an-array"}), None).unwrap_err(),
        SearchShapeMiss::NoResults
    ));
}

#[test]
fn an_empty_results_array_is_a_healthy_zero_match_not_a_miss() {
    // The empty-index / zero-hit case: rag answered 2xx with an empty
    // `results` list. That is a healthy success, never a shape miss.
    let out = flatten_and_annotate(
        &json!({
            "request_id": "r-2", "results": [],
            "index_state": {"status": "available"}
        }),
        None,
    )
    .expect("empty results is a healthy zero-match");
    assert_eq!(out["results"].as_array().unwrap().len(), 0);
    assert_eq!(out["index_state"]["status"], "available");
}

#[test]
fn annotation_carries_the_freshness_epoch_and_forwards_index_state() {
    // P02.S06 (D3): the freshness contract on the annotated success envelope —
    // a warm epoch is present verbatim, a cold/failed read is an honest null,
    // and rag's native `index_state` block is forwarded byte-for-byte in every
    // case. The expected epoch values are the ones the caller hands in (the
    // shared cache's read), not copied from any run.
    let rag: Value = serde_json::from_str(RAG_REAL).unwrap();
    let index_state = rag["index_state"].clone();

    // Epoch present: a successful cache read annotates the exact value.
    let warm = flatten_and_annotate(&rag, Some(2_000_000)).expect("annotates");
    assert_eq!(
        warm["semantic_epoch"], 2_000_000,
        "the warm epoch rides the envelope verbatim"
    );
    // rag's index_state block is forwarded UNTOUCHED (every field, verbatim).
    assert_eq!(
        warm["index_state"], index_state,
        "index_state passes through byte-for-byte alongside the annotation"
    );

    // A legitimate epoch of 0 ("nothing reindexed yet") is a real value, not
    // absence: it annotates as 0, distinct from the null absent marker.
    let zero = flatten_and_annotate(&rag, Some(0)).expect("annotates");
    assert_eq!(zero["semantic_epoch"], 0);
    assert!(
        !zero["semantic_epoch"].is_null(),
        "a real 0 epoch is never the absent marker"
    );

    // Cold/failed read: the honest absent marker is an explicit null, never a
    // fabricated 0, and index_state still forwards untouched.
    let cold = flatten_and_annotate(&rag, None).expect("annotates");
    assert_eq!(
        cold["semantic_epoch"],
        Value::Null,
        "a cold/failed epoch read annotates an honest null"
    );
    assert_eq!(
        cold["index_state"], index_state,
        "index_state is forwarded untouched even when the epoch is absent"
    );
}

#[test]
fn search_body_is_bounded_and_maps_the_target_vocabulary() {
    let (_dir, state) = sibling_state();
    // A vault search with a result bound: trimmed query, rag `type` vault,
    // the engine-controlled project_root, and max_results → top_k.
    let vault = search_body_for(
        &state,
        &SearchBody {
            scope: None,
            query: "  graph state  ".to_string(),
            target: Some("vault".to_string()),
            max_results: Some(7),
        },
        "Y:\\code\\proj",
    )
    .unwrap();
    assert_eq!(
        vault,
        json!({
            "query": "graph state",
            "type": "vault",
            "project_root": "Y:\\code\\proj",
            "top_k": 7,
        })
    );

    // The engine `code` target maps to rag's `codebase`; an absent
    // max_results omits top_k so rag uses its own default.
    let code = search_body_for(
        &state,
        &SearchBody {
            scope: None,
            query: "server".to_string(),
            target: Some("code".to_string()),
            max_results: None,
        },
        "/tmp/proj",
    )
    .unwrap();
    assert_eq!(code["type"], "codebase");
    assert_eq!(code.get("top_k"), None, "absent max_results omits top_k");

    // An absent target defaults to the app's `vault`.
    let defaulted = search_body_for(
        &state,
        &SearchBody {
            scope: None,
            query: "x".to_string(),
            target: None,
            max_results: None,
        },
        "/tmp/proj",
    )
    .unwrap();
    assert_eq!(defaulted["type"], "vault");

    for body in [
        SearchBody {
            scope: None,
            query: "   ".to_string(),
            target: Some("vault".to_string()),
            max_results: None,
        },
        SearchBody {
            scope: None,
            query: "x".repeat(MAX_SEARCH_QUERY_CHARS + 1),
            target: Some("vault".to_string()),
            max_results: None,
        },
        SearchBody {
            scope: None,
            query: "graph".to_string(),
            target: Some("--code".to_string()),
            max_results: None,
        },
        SearchBody {
            scope: None,
            query: "graph".to_string(),
            target: Some("code".to_string()),
            max_results: Some(MAX_SEARCH_RESULTS + 1),
        },
    ] {
        assert!(
            search_body_for(&state, &body, "/tmp/proj").is_err(),
            "invalid search body must be rejected before rag is reached"
        );
    }
}

#[test]
fn brokered_rag_read_numbers_are_clamped_before_forwarding() {
    let mut params = HashMap::new();
    params.insert("limit".to_string(), (MAX_RAG_JOBS_LIMIT + 500).to_string());
    params.insert("lines".to_string(), (MAX_RAG_LOG_LINES + 500).to_string());
    params.insert("bad".to_string(), "not-a-number".to_string());

    assert_eq!(
        bounded_rag_read_u32(&params, "limit", MAX_RAG_JOBS_LIMIT),
        Some(MAX_RAG_JOBS_LIMIT)
    );
    assert_eq!(
        bounded_rag_read_u32(&params, "lines", MAX_RAG_LOG_LINES),
        Some(MAX_RAG_LOG_LINES)
    );
    assert_eq!(bounded_rag_read_u32(&params, "bad", 10), None);
    assert_eq!(bounded_rag_read_u32(&params, "missing", 10), None);
}

// --- H1 / M4: bounded sibling subprocess --------------------------------

fn sibling_state() -> (tempfile::TempDir, Arc<AppState>) {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
    let state = crate::app::build_state(dir.path().to_path_buf());
    (dir, state)
}

// --- rag-storage-broker (destructive storage verbs) ---------------------

#[test]
fn namespace_prefix_guard_accepts_canonical_and_rejects_everything_else() {
    let (_dir, state) = sibling_state();
    // rag's canonical r{12-lowercase-hex}_ form.
    assert_eq!(
        validate_namespace_prefix(&state, "rabc123def456_").unwrap(),
        "rabc123def456_"
    );
    for bad in [
        "",
        "-x",
        "--allow-unknown",
        "rABC123DEF456_",           // uppercase hex rejected
        "rabc123def456",            // missing trailing underscore
        "abc123def456_",            // missing leading r
        "rabc123def45_",            // 11 hex, too short
        "rabc123def4567_",          // 13 hex, too long
        "rabc123def45g6_",          // non-hex char
        "rabc123def456_; rm -rf /", // shell metacharacters
    ] {
        assert!(
            validate_namespace_prefix(&state, bad).is_err(),
            "`{bad}` must be rejected"
        );
    }
}

#[test]
fn storage_args_assembles_validated_argv_per_verb() {
    let (_dir, state) = sibling_state();
    let base = |v: &str| {
        RAG_STORAGE_CLI_WHITELIST
            .iter()
            .find(|(n, _)| *n == v)
            .map(|(_, a)| *a)
            .unwrap()
    };

    // delete: validated prefix, then --yes (required by --json) and --dry-run
    // (preview default).
    let body = RagStorageBody {
        prefix: Some("rabc123def456_".into()),
        ..Default::default()
    };
    let args = storage_args_for(
        &state,
        "storage-delete",
        base("storage-delete"),
        "/r",
        &body,
    )
    .unwrap();
    assert_eq!(
        args,
        [
            "server",
            "storage",
            "delete",
            "rabc123def456_",
            "--yes",
            "--dry-run"
        ]
    );
    assert!(!args.iter().any(|a| a == "--allow-unknown"));

    // delete with apply: --yes and NO --dry-run.
    let apply = RagStorageBody {
        prefix: Some("rabc123def456_".into()),
        apply: Some(true),
        ..Default::default()
    };
    let args = storage_args_for(
        &state,
        "storage-delete",
        base("storage-delete"),
        "/r",
        &apply,
    )
    .unwrap();
    assert_eq!(
        args,
        ["server", "storage", "delete", "rabc123def456_", "--yes"]
    );

    // prune: no positional, preview by default.
    let args = storage_args_for(
        &state,
        "storage-prune",
        base("storage-prune"),
        "/r",
        &RagStorageBody::default(),
    )
    .unwrap();
    assert_eq!(args, ["server", "storage", "prune", "--yes", "--dry-run"]);

    // migrate: the ENGINE-CONTROLLED cell root (not a body field) + the enum.
    let migrate = RagStorageBody {
        to: Some("server".into()),
        ..Default::default()
    };
    let args = storage_args_for(
        &state,
        "storage-migrate",
        base("storage-migrate"),
        "/active/scope",
        &migrate,
    )
    .unwrap();
    assert_eq!(
        args,
        [
            "server",
            "storage",
            "migrate",
            "/active/scope",
            "--to",
            "server",
            "--yes",
            "--dry-run"
        ]
    );
}

#[test]
fn storage_args_reject_missing_or_invalid_required_values() {
    let (_dir, state) = sibling_state();
    // delete with no prefix → 400.
    assert!(
        storage_args_for(
            &state,
            "storage-delete",
            &["server", "storage", "delete"],
            "/r",
            &RagStorageBody::default(),
        )
        .is_err()
    );
    // migrate with a bad backend → 400.
    let bad = RagStorageBody {
        to: Some("s3".into()),
        ..Default::default()
    };
    assert!(
        storage_args_for(
            &state,
            "storage-migrate",
            &["server", "storage", "migrate"],
            "/r",
            &bad,
        )
        .is_err()
    );
}

#[test]
fn rag_envelope_detection_and_storage_outcome() {
    // is_rag_envelope keys on top-level ok(bool) + command(string).
    let env = serde_json::json!({"ok": false, "command": "storage.delete",
            "data": {"status": "would_remove", "prefix": "rabc123def456_"}});
    assert!(is_rag_envelope(&env));
    assert!(!is_rag_envelope(
        &serde_json::json!({"status": "would_remove"})
    ));
    assert!(!is_rag_envelope(
        &serde_json::json!({"ok": "yes", "command": 1})
    ));

    // A would_remove preview EXITS 1 but is a forwarded business outcome.
    let raw = env.to_string();
    assert_eq!(storage_outcome(&raw, false).unwrap(), env);
    // An applied result on exit 0 forwards too.
    assert!(storage_outcome(&raw, true).is_ok());
    // A genuine crash (non-zero exit, no envelope) is a stated fault → 502.
    assert!(storage_outcome("Traceback...\nKeyError", false).is_err());
    // Empty stdout on exit 0 is also a fault (never a forged success).
    assert!(storage_outcome("", true).is_err());
}

#[tokio::test]
async fn storage_route_403s_unknown_verb_and_400s_a_bad_prefix_before_spawning() {
    let (_dir, state) = sibling_state();
    // An unknown storage verb 403s before any subprocess.
    let err = ops_rag_storage(State(state.clone()), Path("storage-nuke".to_string()), None)
        .await
        .unwrap_err();
    assert_eq!(err.0, StatusCode::FORBIDDEN);

    // A whitelisted verb with a malformed prefix 400s before any subprocess.
    let err = ops_rag_storage(
        State(state.clone()),
        Path("storage-delete".to_string()),
        Some(Json(RagStorageBody {
            prefix: Some("not-a-prefix".into()),
            ..Default::default()
        })),
    )
    .await
    .unwrap_err();
    assert_eq!(err.0, StatusCode::BAD_REQUEST);
}

/// A program that ignores the trailing `--json` run_sibling appends.
fn shell(snippet: &str) -> Vec<String> {
    if cfg!(windows) {
        vec!["cmd".into(), "/C".into(), snippet.into()]
    } else {
        vec!["sh".into(), "-c".into(), snippet.into()]
    }
}

#[tokio::test]
async fn a_hung_sibling_is_killed_on_timeout_not_left_to_pin_the_worker() {
    // Robustness H1: an untimed sibling pins an async worker forever. With a
    // (here, short) timeout the child is killed and a 504 degraded envelope
    // is returned instead of hanging.
    let (_dir, state) = sibling_state();
    // Sleep well past the injected 200ms timeout.
    let prog = if cfg!(windows) {
        // PowerShell script block swallows the trailing `--json` into $args
        // (ignored) and holds the stdout pipe open for 5s, so the read
        // blocks until the 200ms timeout fires.
        vec![
            "powershell".into(),
            "-NoProfile".into(),
            "-Command".into(),
            "& { Start-Sleep -Seconds 5 }".into(),
        ]
    } else {
        shell("sleep 5")
    };
    let err = run_sibling_bounded(
        &state,
        &prog,
        &[],
        Duration::from_millis(200),
        SIBLING_STDOUT_CAP,
    )
    .await
    .unwrap_err();
    assert_eq!(err.0, StatusCode::GATEWAY_TIMEOUT, "hung sibling → 504");
    assert!(err.1.0["error"].as_str().unwrap().contains("timed out"));
}

#[tokio::test]
async fn a_crashed_sibling_is_a_502_not_a_healthy_200(/* M4 */) {
    // M4: a non-zero sibling exit is a 502 degraded envelope, never a 200
    // wrapping a crash.
    let (_dir, state) = sibling_state();
    let prog = shell("exit 7");
    let err = run_sibling_bounded(&state, &prog, &[], SIBLING_TIMEOUT, SIBLING_STDOUT_CAP)
        .await
        .unwrap_err();
    assert_eq!(err.0, StatusCode::BAD_GATEWAY, "crashed sibling → 502");
    assert!(err.1.0["error"].as_str().unwrap().contains("exited"));
}

#[tokio::test]
async fn a_runaway_sibling_stdout_is_capped_not_buffered_to_oom() {
    // Robustness H1: stdout past the cap is killed + degraded, never grown
    // to exhaustion. Inject a tiny 4 KiB cap and emit far more.
    let (_dir, state) = sibling_state();
    let prog = if cfg!(windows) {
        vec![
            "powershell".into(),
            "-NoProfile".into(),
            "-Command".into(),
            "& { [Console]::Out.Write('x' * 65536) }".into(),
        ]
    } else {
        shell("head -c 65536 /dev/zero | tr '\\0' 'x'")
    };
    let err = run_sibling_bounded(&state, &prog, &[], SIBLING_TIMEOUT, 4096)
        .await
        .unwrap_err();
    assert_eq!(err.0, StatusCode::BAD_GATEWAY, "runaway stdout → 502");
    assert!(err.1.0["error"].as_str().unwrap().contains("capped"));
}

#[tokio::test]
async fn a_well_behaved_sibling_envelope_passes_through() {
    // The bounded runner must not regress the happy path: a small JSON
    // envelope on stdout, exit 0, passes through verbatim.
    let (_dir, state) = sibling_state();
    let prog = if cfg!(windows) {
        vec![
            "powershell".into(),
            "-NoProfile".into(),
            "-Command".into(),
            r#"& { [Console]::Out.Write('{"ok":true}') }"#.into(),
        ]
    } else {
        shell(r#"printf '%s' '{"ok":true}'"#)
    };
    let value = run_sibling_bounded(&state, &prog, &[], SIBLING_TIMEOUT, SIBLING_STDOUT_CAP)
        .await
        .expect("clean sibling passes through");
    assert_eq!(value["ok"], true);
}

// --- P02: brokered /ops/rag/* control plane -----------------------------

#[tokio::test]
async fn reindex_with_a_bad_type_is_a_tiered_400_before_any_round_trip() {
    // P02.S12/S15: arg validation rejects an unknown `type` BEFORE the
    // transport is built, as a tiers-carrying 400 (mirrors the search target
    // guard) — the bad value never reaches rag.
    let (_dir, state) = sibling_state();
    let err = ops_rag(
        State(state),
        Path("reindex".to_string()),
        Some(Json(RagControlBody {
            reindex_type: Some("bogus".into()),
            ..Default::default()
        })),
    )
    .await
    .unwrap_err();
    assert_eq!(err.0, StatusCode::BAD_REQUEST);
    assert!(err.1.0["error"].as_str().unwrap().contains("bogus"));
    assert!(
        err.1.0["tiers"]["semantic"]["available"].is_boolean(),
        "the 400 carries the tiers block"
    );
}

#[tokio::test]
async fn reindex_with_a_bad_initiator_kind_is_a_tiered_400() {
    let (_dir, state) = sibling_state();
    let err = ops_rag(
        State(state),
        Path("reindex".to_string()),
        Some(Json(RagControlBody {
            initiator_kind: Some("intruder".into()),
            ..Default::default()
        })),
    )
    .await
    .unwrap_err();
    assert_eq!(err.0, StatusCode::BAD_REQUEST);
    assert!(
        err.1.0["error"]
            .as_str()
            .unwrap()
            .contains("initiator_kind")
    );
}

#[tokio::test]
async fn watcher_reconfigure_out_of_bounds_args_are_tiered_400s() {
    // P02.S12/S15: bound enforcement — a debounce past the ceiling and a
    // negative cooldown are each a tiers-carrying 400 before forwarding.
    let (_dir, state) = sibling_state();
    let err = ops_rag(
        State(state.clone()),
        Path("watcher-reconfigure".to_string()),
        Some(Json(RagControlBody {
            debounce_ms: Some(MAX_WATCH_DEBOUNCE_MS + 1),
            ..Default::default()
        })),
    )
    .await
    .unwrap_err();
    assert_eq!(err.0, StatusCode::BAD_REQUEST);
    assert!(err.1.0["error"].as_str().unwrap().contains("debounce_ms"));

    let err = ops_rag(
        State(state),
        Path("watcher-reconfigure".to_string()),
        Some(Json(RagControlBody {
            cooldown_s: Some(-1.0),
            ..Default::default()
        })),
    )
    .await
    .unwrap_err();
    assert_eq!(err.0, StatusCode::BAD_REQUEST);
    assert!(err.1.0["error"].as_str().unwrap().contains("cooldown_s"));
}

#[tokio::test]
async fn evict_with_a_dash_prefixed_root_is_a_tiered_400() {
    // P02.S12: the flag-injection guard — a dash-prefixed evict root is
    // rejected, mirroring the diff-path/rev guards.
    let (_dir, state) = sibling_state();
    let err = ops_rag(
        State(state),
        Path("project-evict".to_string()),
        Some(Json(RagControlBody {
            root: Some("--force".into()),
            ..Default::default()
        })),
    )
    .await
    .unwrap_err();
    assert_eq!(err.0, StatusCode::BAD_REQUEST);
    assert!(err.1.0["error"].as_str().unwrap().contains("root"));
}

#[tokio::test]
async fn an_unknown_read_verb_403s_before_any_round_trip() {
    // P02.S15: an unknown GET read verb 403s with the tiers block, never
    // reaching discovery or rag.
    let (_dir, state) = sibling_state();
    let err = ops_rag_get(
        State(state),
        Path("not-a-verb".to_string()),
        Query(HashMap::new()),
    )
    .await
    .unwrap_err();
    assert_eq!(err.0, StatusCode::FORBIDDEN);
    assert!(err.1.0["error"].as_str().unwrap().contains("not-a-verb"));
    assert!(err.1.0["tiers"]["semantic"]["available"].is_boolean());
}

#[tokio::test]
async fn an_unknown_post_verb_403s_with_the_tiers_block() {
    let (_dir, state) = sibling_state();
    let err = ops_rag(State(state), Path("not-a-verb".to_string()), None)
        .await
        .unwrap_err();
    assert_eq!(err.0, StatusCode::FORBIDDEN);
    assert!(err.1.0["tiers"]["semantic"]["available"].is_boolean());
}

#[test]
fn brokered_envelope_forwards_rags_value_verbatim_with_tiers() {
    // P02.S15: on success rag's envelope passes through VERBATIM under
    // `data.envelope` (unreshaped), with the tiers block attached
    // (engine-read-and-infer + every-wire-response-carries-the-tiers-block).
    let (_dir, state) = sibling_state();
    let cell = state.active_cell();
    let rag_value = json!({
        "ok": true, "job_id": "j-9", "status": "queued", "custom": [1, 2, 3]
    });
    let Json(body) = brokered_envelope(&cell, Ok(rag_value.clone()));
    assert_eq!(
        body["data"]["envelope"], rag_value,
        "rag's envelope is forwarded byte-for-byte, not reshaped"
    );
    assert!(body["tiers"]["semantic"]["available"].is_boolean());
}

#[test]
fn brokered_envelope_degrades_the_semantic_tier_on_a_rag_fault() {
    // P02.S15: a rag transport/shape fault degrades the semantic tier with an
    // empty envelope — never a hard 5xx (degradation-is-read-from-tiers). The
    // declared tier still reports truthfully through the shared overlay.
    let (_dir, state) = sibling_state();
    let cell = state.active_cell();
    let err = rag_client::client::RagError::Io(std::io::Error::other("connection refused"));
    let Json(body) = brokered_envelope(&cell, Err(err));
    assert_eq!(body["data"]["envelope"], Value::Null, "no value on a fault");
    assert_eq!(
        body["tiers"]["semantic"]["available"], false,
        "the semantic tier is reported unavailable, not an error"
    );
}

// --- the bounded write-sibling runner (W04.P12: shared by the retained
// autofix/archive maintenance ops; the write/create channels that used to
// exercise it here were deleted along with their routes) ----------------

/// A stub sibling that reads its whole stdin and echoes it back inside a
/// `status:"updated"` envelope under `data.stdin`, exiting 0. Used to prove
/// the body round-trips to the child's stdin. The trailing `--json` the
/// runner appends is ignored.
fn stdin_echo_updated() -> Vec<String> {
    if cfg!(windows) {
        vec![
                "powershell".into(),
                "-NoProfile".into(),
                "-Command".into(),
                // Read all of stdin, JSON-escape it via ConvertTo-Json, and emit
                // a status:"updated" envelope carrying it under data.stdin.
                "& { $i = [Console]::In.ReadToEnd(); $e = $i | ConvertTo-Json; \
                 [Console]::Out.Write('{\"schema\":\"x\",\"status\":\"updated\",\"data\":{\"stdin\":' + $e + '}}') }".into(),
            ]
    } else {
        // jq-free: read stdin, base64 it would need a decoder; instead use a
        // small python one-liner if present, else a portable printf with the
        // raw text known to be JSON-safe in our test. We pass plain text and
        // rely on python for robust JSON escaping.
        shell(
            "body=$(cat); printf '{\"schema\":\"x\",\"status\":\"updated\",\"data\":{\"stdin\":\"%s\"}}' \"$body\"",
        )
    }
}

#[tokio::test]
async fn the_body_is_forwarded_to_the_child_stdin() {
    // W02: the new document body is written to the child's stdin and the
    // sibling reads it. The stub echoes stdin back under data.stdin; the
    // route forwards the envelope verbatim under data.envelope.
    let (_dir, state) = sibling_state();
    let cell = state.active_cell();
    let marker = "ROUND_TRIP_BODY_MARKER";
    let value = run_sibling_write_bounded(
        &state,
        &cell,
        &stdin_echo_updated(),
        &[],
        Some(marker),
        SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await
    .expect("stdin-echo sibling produces a status envelope");
    assert_eq!(value["status"], "updated");
    let echoed = value["data"]["stdin"].as_str().unwrap_or_default();
    assert!(
        echoed.contains(marker),
        "the body round-tripped through the child's stdin: {echoed}"
    );
}

/// A stub sibling that exits 1 emitting a `status:"failed"` CONFLICT
/// envelope — the load-bearing case: a business refusal that exits non-zero
/// must forward VERBATIM as a 200, NOT a 502.
fn conflict_failed_exit1() -> Vec<String> {
    let payload = r#"{"schema":"vaultspec.vault.set-body.v1","status":"failed","data":{"message":"Blob-hash conflict","conflict":true,"expected":"aaa","actual":"bbb","path":"adr/x-adr.md"}}"#;
    if cfg!(windows) {
        vec![
            "powershell".into(),
            "-NoProfile".into(),
            "-Command".into(),
            format!(
                "& {{ [Console]::Out.Write('{}'); exit 1 }}",
                payload.replace('\'', "''")
            ),
        ]
    } else {
        shell(&format!("printf '%s' '{payload}'; exit 1"))
    }
}

#[tokio::test]
async fn a_failed_conflict_envelope_exiting_1_is_forwarded_verbatim_not_a_502() {
    // W02 (the load-bearing test): a `status:"failed"` conflict that exits 1
    // is a VALID business response forwarded VERBATIM under data.envelope on a
    // 200, never a 502. The client branches on envelope.status + data.conflict.
    let (_dir, state) = sibling_state();
    let cell = state.active_cell();
    let value = run_sibling_write_bounded(
        &state,
        &cell,
        &conflict_failed_exit1(),
        &[],
        None,
        SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await
    .expect("a status:failed conflict envelope is Ok (forwarded), not an Err");
    assert_eq!(value["status"], "failed");
    assert_eq!(value["data"]["conflict"], true);
    assert_eq!(value["data"]["expected"], "aaa");
}

#[tokio::test]
async fn a_crash_with_no_parseable_envelope_is_a_502_with_tiers() {
    // W02: a sibling that exits non-zero with NO parseable status envelope is
    // a genuine fault — a 502 degraded envelope carrying the tiers block,
    // never a forged success. This is the boundary the conflict case must not
    // cross.
    let (_dir, state) = sibling_state();
    let cell = state.active_cell();
    let err = run_sibling_write_bounded(
        &state,
        &cell,
        &shell("echo not-an-envelope 1>&2; exit 9"),
        &[],
        None,
        SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await
    .unwrap_err();
    assert_eq!(err.0, StatusCode::BAD_GATEWAY, "crash → 502");
    assert!(
        err.1.0["tiers"]["semantic"]["available"].is_boolean(),
        "the 502 carries the tiers block"
    );
}

/// A stub sibling that emits a `status:"updated"` success envelope, exit 0.
fn success_updated() -> Vec<String> {
    let payload = r#"{"schema":"vaultspec.vault.set-body.v1","status":"updated","data":{"path":"adr/x-adr.md","blob_hash":"c245aabbccddeeff00112233445566778899aabb","checks":[]}}"#;
    if cfg!(windows) {
        vec![
            "powershell".into(),
            "-NoProfile".into(),
            "-Command".into(),
            format!(
                "& {{ [Console]::Out.Write('{}') }}",
                payload.replace('\'', "''")
            ),
        ]
    } else {
        shell(&format!("printf '%s' '{payload}'"))
    }
}

#[tokio::test]
async fn a_success_write_carries_the_tiers_block_under_a_forwarded_envelope() {
    // W02: a success (`status:"updated"`) rides the same 200 forwarded
    // envelope as a refusal, with the tiers block attached. We drive the
    // runner directly (the route's verb whitelist + validation are covered
    // above) and assert the verbatim-forward shape the route emits.
    let (_dir, state) = sibling_state();
    let cell = state.active_cell();
    let value = run_sibling_write_bounded(
        &state,
        &cell,
        &success_updated(),
        &[],
        Some("# new body\n"),
        SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await
    .expect("success envelope is forwarded");
    // The route wraps this verbatim under data.envelope with tiers.
    let Json(body) = super::super::envelope(
        json!({ "envelope": value }),
        super::super::query_tiers(&state.active_cell()),
        None,
    );
    assert_eq!(body["data"]["envelope"]["status"], "updated");
    assert_eq!(
        body["data"]["envelope"]["data"]["blob_hash"],
        "c245aabbccddeeff00112233445566778899aabb"
    );
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "tiers block on the success envelope"
    );
}

#[tokio::test]
async fn a_hung_write_sibling_is_killed_on_timeout() {
    // W02 + subprocess-calls-carry-cap-and-timeout: the write runner keeps the
    // wall-clock timeout — a hung sibling is killed and degrades to a 504, not
    // left to pin the worker.
    let (_dir, state) = sibling_state();
    let prog = if cfg!(windows) {
        vec![
            "powershell".into(),
            "-NoProfile".into(),
            "-Command".into(),
            "& { Start-Sleep -Seconds 5 }".into(),
        ]
    } else {
        shell("sleep 5")
    };
    let cell = state.active_cell();
    let err = run_sibling_write_bounded(
        &state,
        &cell,
        &prog,
        &[],
        None,
        Duration::from_millis(200),
        SIBLING_STDOUT_CAP,
    )
    .await
    .unwrap_err();
    assert_eq!(
        err.0,
        StatusCode::GATEWAY_TIMEOUT,
        "hung write sibling → 504"
    );
    assert!(err.1.0["error"].as_str().unwrap().contains("timed out"));
}

// --- core ARCHIVE channel (/ops/core/archive) ---------------------------

#[tokio::test]
async fn archive_field_validation_rejects_bad_features_with_a_tiered_400() {
    // An empty, flag-shaped, or out-of-grammar feature is a tiers-carrying 400
    // before any subprocess (the same injection-guard surface as create).
    let (_dir, state) = sibling_state();
    for bad in ["", "--force", "feat/evil", "has space", "--feature=x"] {
        let err = ops_core_archive(
            State(state.clone()),
            Json(CoreArchiveBody {
                feature: bad.into(),
                ..Default::default()
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(
            err.0,
            StatusCode::BAD_REQUEST,
            "feature `{bad}` must be a 400"
        );
        assert!(err.1.0["error"].as_str().unwrap().contains("feature"));
        assert!(
            err.1.0["tiers"]["semantic"]["available"].is_boolean(),
            "the 400 carries the tiers block"
        );
    }
    // A clean kebab/word feature tag passes validation.
    assert!(validate_token(&state, "feature", "editor-demo").is_ok());
}

// --- rag-affordance-adoption: version-tolerant --json start --------------

#[test]
fn rag_start_args_appends_json_after_the_validated_flags() {
    let args = rag_start_args(&RagControlBody::default()).unwrap();
    assert_eq!(args, ["server", "start", "--json"]);

    let with_flags = rag_start_args(&RagControlBody {
        local_only: Some(true),
        port: Some(9000),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(
        with_flags,
        [
            "server",
            "start",
            "--local-only",
            "--port",
            "9000",
            "--json"
        ]
    );
    // The port bound still rejects a privileged port before --json is reached.
    assert!(
        rag_start_args(&RagControlBody {
            port: Some(80),
            ..Default::default()
        })
        .is_err()
    );
}

// --- version-tolerant --json retry (ADR D5 / T1-R1) ---

/// `lifecycle_run_to_envelope` is the pure conversion step inside
/// `run_sibling_version_tolerant`.  It must turn an exit-0 JSON stdout into
/// the parsed envelope, wrap a non-JSON exit-0 stdout in {"raw":..,"exit":..},
/// and return Err for any non-zero exit (matching the `run_sibling` contract).
#[test]
fn lifecycle_run_to_envelope_converts_and_guards() {
    // Exit 0 with valid JSON stdout → the parsed value passes through verbatim.
    let ok_json = LifecycleRun {
        code: Some(0),
        stdout: r#"{"status": "running", "pid": 1234}"#.to_string(),
        stderr: String::new(),
    };
    let val = lifecycle_run_to_envelope(&ok_json).expect("exit-0 JSON should succeed");
    assert_eq!(val["status"], "running");
    assert_eq!(val["pid"], 1234);

    // Exit 0 with human/non-JSON stdout → wrapped as {"raw": ..., "exit": ...}.
    let ok_text = LifecycleRun {
        code: Some(0),
        stdout: "Service is healthy.".to_string(),
        stderr: String::new(),
    };
    let val = lifecycle_run_to_envelope(&ok_text).expect("exit-0 text should succeed");
    assert_eq!(val["raw"], "Service is healthy.");
    assert_eq!(val["exit"], 0);

    // Non-zero exit without a JSON-rejection pattern → Err (genuine failure,
    // not a --json rejection).  run_sibling_version_tolerant maps this to 502.
    let fail = LifecycleRun {
        code: Some(1),
        stdout: String::new(),
        stderr: "Doctor found 2 issues".to_string(),
    };
    assert!(lifecycle_run_to_envelope(&fail).is_err());
}

/// The version-tolerant retry applies the SAME `rag_rejected_json` predicate
/// that `start_rag_service` uses — the detector must fire for exit-2 (the
/// typer usage-error primary signal) and for the unknown-option text, and must
/// NOT fire on a genuine exit-1 --json failure envelope.  The unit tests for
/// `rag_rejected_json` already pin these cases; this test documents that the
/// retry decision for server-status/doctor/install is routed through that
/// helper and not a bespoke heuristic.
#[test]
fn version_tolerant_retry_decision_reuses_rag_rejected_json() {
    // exit-2 (primary: typer usage error) → retry
    assert!(rag_rejected_json(&LifecycleRun {
        code: Some(2),
        stdout: String::new(),
        stderr: String::new(),
    }));
    // unknown-option text on non-standard exit → retry
    assert!(rag_rejected_json(&LifecycleRun {
        code: Some(1),
        stdout: String::new(),
        stderr: "Error: No such option: --json".to_string(),
    }));
    // genuine rag exit-1 --json failure envelope → NOT a retry
    assert!(!rag_rejected_json(&LifecycleRun {
        code: Some(1),
        stdout: r#"{"ok": false, "error": "service_unreachable"}"#.to_string(),
        stderr: String::new(),
    }));
}

#[test]
fn rag_rejected_json_detects_an_older_rag_unknown_option() {
    // PRIMARY signal: a typer usage error exits 2 -> retry without --json, even
    // with no recognizable text.
    let exit2 = LifecycleRun {
        code: Some(2),
        stdout: String::new(),
        stderr: String::new(),
    };
    assert!(rag_rejected_json(&exit2));
    // Belt-and-suspenders: the unknown-option text on a non-standard exit code.
    let by_text = LifecycleRun {
        code: Some(1),
        stdout: String::new(),
        stderr: "Error: No such option: --json".to_string(),
    };
    assert!(rag_rejected_json(&by_text));
    // A genuine rag --json FAILURE exits 1 and does not name --json: NOT a
    // rejection (rag's structured failures exit 1, never 2).
    let genuine = LifecycleRun {
        code: Some(1),
        stdout: r#"{"ok": false, "error": "port_in_use"}"#.to_string(),
        stderr: String::new(),
    };
    assert!(!rag_rejected_json(&genuine));
}

#[test]
fn rag_start_failure_lifts_the_structured_reason() {
    // rag's --json failure envelope: the stated error + data are surfaced.
    let envelope = r#"{"ok": false, "command": "service.start",
            "error": "machine_owned", "message": "...",
            "data": {"holder_pid": 4242}}"#;
    let (error, data) = rag_start_failure(envelope).expect("an ok:false envelope yields a reason");
    assert_eq!(error, "machine_owned");
    assert_eq!(data["holder_pid"], 4242);
    // A success envelope or human text yields no failure reason (degrade to the
    // inferred reason).
    assert!(rag_start_failure(r#"{"ok": true, "command": "service.start"}"#).is_none());
    assert!(rag_start_failure("Service start failed\nPort in use").is_none());
}
