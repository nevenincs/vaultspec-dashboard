use super::*;

#[test]
fn capability_carries_no_wire_deserialize_path() {
    // A capability is only ever CONSTRUCTED from a validated request; the
    // wire cannot name one. This is enforced by the type system (no
    // Deserialize/FromStr on Capability) — the test documents the intent and
    // exercises the one construction path.
    let req = RunRequest {
        action: Action::Install,
        provider: Some(ProviderArg::Core),
        tool: None,
        upgrade: false,
        force: false,
        confirm: None,
        target: TargetParams::default(),
    };
    assert_eq!(
        req.to_capability().unwrap(),
        Capability::InstallFramework {
            provider: Provider::Core,
            force: false
        }
    );
}

#[test]
fn retired_provider_paths_are_not_in_the_wire_enum_or_filesystem_projection() {
    for provider in ["gemini", "all"] {
        let request = serde_json::from_value::<RunRequest>(json!({
            "action": "install",
            "provider": provider
        }));
        assert!(
            request.is_err(),
            "{provider} must fail wire decoding because `all` also installs Gemini"
        );
    }
    assert!(
        serde_json::from_value::<RunRequest>(json!({
            "action": "setup",
            "profile_id": "retired-profile"
        }))
        .is_err(),
        "retired profile fields must fail wire decoding"
    );

    let dir = tempfile::tempdir().expect("temporary project");
    std::fs::create_dir(dir.path().join(".gemini")).expect("retired marker fixture");
    assert!(
        !detect_providers(dir.path()).contains(&"gemini"),
        "retired provider files must not become served capability truth"
    );
}

#[test]
fn current_setup_expands_to_exactly_four_fixed_provider_commands() {
    let commands = Capability::SetupCurrent { force: true }
        .setup_commands(FsPath::new("/tmp/proj"))
        .expect("aggregate commands");
    assert_eq!(
        commands
            .iter()
            .map(|(provider, _)| provider.as_arg())
            .collect::<Vec<_>>(),
        ["core", "claude", "antigravity", "codex"]
    );
    for (index, (provider, argv)) in commands.into_iter().enumerate() {
        assert_eq!(argv.iter().filter(|token| *token == "install").count(), 1);
        assert!(argv.contains(&provider.as_arg().to_string()));
        assert!(argv.contains(&"--force".to_string()));
        assert_eq!(
            argv.iter().filter(|token| *token == "--skip").count(),
            usize::from(index > 0)
        );
        if index > 0 {
            assert!(argv.windows(2).any(|pair| pair == ["--skip", "core"]));
        }
        assert!(!argv.iter().any(|token| token == "all" || token == "gemini"));
    }
}

#[test]
fn setup_wire_intent_has_no_provider_operand() {
    let req = serde_json::from_value::<RunRequest>(json!({ "action": "setup" }))
        .expect("current setup request");
    assert_eq!(
        req.to_capability().expect("setup capability"),
        Capability::SetupCurrent { force: false }
    );
    let with_provider = serde_json::from_value::<RunRequest>(json!({
        "action": "setup",
        "provider": "core"
    }))
    .expect("bounded but inconsistent request");
    assert_eq!(
        with_provider.to_capability().unwrap_err().1,
        "unexpected_operand"
    );
}

#[test]
fn install_argv_is_fixed_tokens_plus_target() {
    let cap = Capability::InstallFramework {
        provider: Provider::Core,
        force: true,
    };
    let argv = cap.argv(FsPath::new("/tmp/proj"));
    // The core invocation prefix varies by machine; assert the fixed tail.
    let tail: Vec<&str> = argv
        .iter()
        .rev()
        .take(6)
        .rev()
        .map(|s| s.as_str())
        .collect();
    assert_eq!(
        tail,
        ["install", "core", "-t", "/tmp/proj", "--force", "--json"]
    );
}

#[test]
fn upgrade_argv_omits_force_carries_upgrade() {
    let cap = Capability::UpgradeFramework {
        provider: Provider::Core,
    };
    let argv = cap.argv(FsPath::new("/p"));
    assert!(argv.contains(&"--upgrade".to_string()));
    assert!(!argv.contains(&"--force".to_string()));
    assert!(argv.contains(&"--json".to_string()));
}

#[test]
fn acquire_argv_never_carries_json_and_targets_only_companions() {
    let core = Capability::AcquireTool {
        tool: Tool::Core,
        upgrade: false,
    }
    .argv(FsPath::new("."));
    assert_eq!(core, ["uv", "tool", "install", "vaultspec-core"]);
    let rag = Capability::AcquireTool {
        tool: Tool::Rag,
        upgrade: true,
    }
    .argv(FsPath::new("."));
    assert_eq!(rag, ["uv", "tool", "install", "--upgrade", "vaultspec-rag"]);
    assert!(!core.contains(&"--json".to_string()));
}

#[test]
fn migrate_requires_no_operands() {
    let req = RunRequest {
        action: Action::Migrate,
        provider: None,
        tool: None,
        upgrade: false,
        force: false,
        confirm: None,
        target: TargetParams::default(),
    };
    assert_eq!(req.to_capability().unwrap(), Capability::RunMigrations);
}

#[test]
fn install_without_provider_is_typed_error() {
    let req = RunRequest {
        action: Action::Install,
        provider: None,
        tool: None,
        upgrade: false,
        force: false,
        confirm: None,
        target: TargetParams::default(),
    };
    let (status, kind, _) = req.to_capability().unwrap_err();
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(kind, "provider_required");
}

#[test]
fn acquire_is_machine_wide_project_verbs_are_not() {
    assert!(
        Capability::AcquireTool {
            tool: Tool::Rag,
            upgrade: false
        }
        .is_machine_acquisition()
    );
    assert!(!Capability::RunMigrations.is_machine_acquisition());
    assert!(Capability::RunMigrations.mutates_project());
    assert!(
        !Capability::AcquireTool {
            tool: Tool::Core,
            upgrade: false
        }
        .mutates_project()
    );
}

#[test]
fn outcome_parses_sync_envelope_on_success() {
    let (state, out) = outcome_value(
        Some(0),
        r#"{"status":"created"}"#,
        RunTermination::Completed,
    );
    assert_eq!(state, JobState::Succeeded);
    assert_eq!(out["envelope"]["status"], "created");
    assert_eq!(out["outcome_indeterminate"], false);
}

#[test]
fn outcome_failure_on_nonzero_and_breach_is_indeterminate() {
    let (state, _) = outcome_value(Some(1), "boom", RunTermination::Completed);
    assert_eq!(state, JobState::Failed);
    let (state, out) = outcome_value(None, "killed", RunTermination::Indeterminate);
    assert_eq!(state, JobState::Failed);
    assert_eq!(out["outcome_indeterminate"], true);
}

#[test]
fn current_setup_requires_four_validated_local_receipts() {
    let receipt = |ordinal, provider, state| {
        setup_receipt(
            "prov-test",
            ordinal,
            provider,
            state,
            state == "succeeded",
            json!({}),
            "confirmed_current",
        )
    };
    let complete_receipts = vec![
        receipt(1, Provider::Core, "reconciled_existing"),
        receipt(2, Provider::Claude, "succeeded"),
        receipt(3, Provider::Antigravity, "succeeded"),
        receipt(4, Provider::Codex, "succeeded"),
    ];
    let (_, complete) = current_setup_outcome(complete_receipts.clone());
    assert_eq!(complete["aggregate"]["status"], "complete");
    assert_eq!(
        complete["aggregate"]["providers"][0]["receipt_authority"],
        "dashboard-local"
    );

    let (_, partial) = current_setup_outcome(vec![
        complete_receipts[0].clone(),
        receipt(2, Provider::Claude, "failed"),
        complete_receipts[2].clone(),
        complete_receipts[3].clone(),
    ]);
    assert_eq!(partial["aggregate"]["status"], "partial");
    let (_, incomplete) = current_setup_outcome(complete_receipts[..3].to_vec());
    assert_eq!(incomplete["aggregate"]["status"], "indeterminate");
    let (_, timeout) = current_setup_outcome(vec![
        receipt(1, Provider::Core, "timeout_cancelled"),
        receipt(2, Provider::Claude, "not-run"),
        receipt(3, Provider::Antigravity, "not-run"),
        receipt(4, Provider::Codex, "not-run"),
    ]);
    assert_eq!(timeout["aggregate"]["status"], "timeout_cancelled");
    let (_, unknown) = current_setup_outcome(vec![
        receipt(1, Provider::Core, "indeterminate"),
        receipt(2, Provider::Claude, "not-run"),
        receipt(3, Provider::Antigravity, "not-run"),
        receipt(4, Provider::Codex, "not-run"),
    ]);
    assert_eq!(unknown["aggregate"]["status"], "indeterminate");
}

#[test]
fn install_v1_decoder_rejects_malformed_identity_and_missing_items() {
    let dir = tempfile::tempdir().expect("target");
    std::fs::create_dir(dir.path().join(".vaultspec")).expect("declared item");
    let valid = json!({
        "schema":"vaultspec.install.v1", "status":"created",
        "data":{"action":"install","path":dir.path(),"providers":[],"items":[[".vaultspec","core"]]}
    })
    .to_string();
    let accepted = validate_install_output(&valid, Provider::Core, dir.path(), false)
        .expect("valid current install projection");
    assert_eq!(accepted.projection["provider"], "core");
    assert!(accepted.projection.get("data").is_none());
    for bad in [
        valid.replace("vaultspec.install.v1", "vaultspec.sync.v1"),
        valid.replace("\"providers\":[]", "\"providers\":[\"claude\"]"),
        format!("{valid} trailing"),
        valid.replace(".vaultspec", "../escape"),
    ] {
        assert!(validate_install_output(&bad, Provider::Core, dir.path(), false).is_err());
    }
}

#[test]
fn doctor_decoder_admits_only_exact_current_or_provider_bound_missing_evidence() {
    let core_missing = json!({"schema":"vaultspec.spec.doctor.v1","status":"failed","data":{
        "framework":"missing","providers":{},"unknown":{"provider":"retired"}
    }})
    .to_string();
    let core = setup::validate_doctor_output(
        &core_missing,
        Some(2),
        Provider::Core,
        setup::DoctorExpectation::Missing,
    )
    .expect("exact clean-Core negative envelope");
    assert!(core.get("unknown").is_none());
    assert_eq!(core["provider"], "core");
    for (code, raw) in [
        (Some(0), core_missing.clone()),
        (Some(2), core_missing.replace("\"failed\"", "\"unchanged\"")),
        (Some(2), core_missing.replace("\"missing\"", "\"present\"")),
        (
            Some(2),
            core_missing.replace("\"providers\":{}", "\"providers\":{\"unknown\":{}}"),
        ),
    ] {
        assert!(
            setup::validate_doctor_output(
                &raw,
                code,
                Provider::Core,
                setup::DoctorExpectation::Missing,
            )
            .is_err()
        );
    }

    let provider_missing = json!({"schema":"vaultspec.spec.doctor.v1","status":"unchanged","data":{
        "framework":"present","providers":{"claude":{
            "manifest_entry":"not_installed","dir_state":"missing","config":"ok","content":{},
            "unknown":"discarded"
        },"unknown":{"name":"retired"}}
    }})
    .to_string();
    let projection = setup::validate_doctor_output(
        &provider_missing,
        Some(0),
        Provider::Claude,
        setup::DoctorExpectation::Missing,
    )
    .expect("typed current-provider missing evidence");
    assert_eq!(projection["provider"], "claude");
    assert!(projection["entry"].get("unknown").is_none());
    for raw in [
        provider_missing.replace("\"unchanged\"", "\"failed\""),
        provider_missing.replace("\"present\"", "\"missing\""),
        provider_missing.replace("\"claude\":", "\"other\":"),
        provider_missing.replace("\"dir_state\":\"missing\"", "\"dir_state\":3"),
        provider_missing.replace(
            "\"manifest_entry\":\"not_installed\"",
            "\"manifest_entry\":\"coherent\"",
        ),
    ] {
        assert!(
            setup::validate_doctor_output(
                &raw,
                Some(0),
                Provider::Claude,
                setup::DoctorExpectation::Missing,
            )
            .is_err()
        );
    }
}

#[test]
fn declared_items_cannot_escape_through_existing_or_missing_path_ancestors() {
    let target = tempfile::tempdir().expect("target");
    let outside = tempfile::tempdir().expect("outside");
    std::fs::create_dir(target.path().join("inside")).expect("inside");
    assert!(
        !setup::declared_item_state(target.path(), "inside/missing.txt").unwrap(),
        "normal missing descendant is confined by its existing ancestor"
    );

    #[cfg(windows)]
    {
        use std::os::windows::fs::{symlink_dir, symlink_file};
        let outside_file = outside.path().join("outside.txt");
        std::fs::write(&outside_file, "outside").expect("outside file");
        symlink_file(&outside_file, target.path().join("file-link")).expect("file symlink");
        symlink_dir(outside.path(), target.path().join("dir-link")).expect("directory symlink");
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::symlink;
        let outside_file = outside.path().join("outside.txt");
        std::fs::write(&outside_file, "outside").expect("outside file");
        symlink(&outside_file, target.path().join("file-link")).expect("file symlink");
        symlink(outside.path(), target.path().join("dir-link")).expect("directory symlink");
    }
    assert!(
        setup::declared_item_state(target.path(), "file-link").is_err(),
        "an existing file indirection cannot escape"
    );
    assert!(
        setup::declared_item_state(target.path(), "dir-link/missing.txt").is_err(),
        "a missing file below an escaping directory cannot authorize mutation"
    );
    assert!(
        setup::declared_item_state(target.path(), "dir-link/missing-dir/child").is_err(),
        "a missing directory tree below an escaping ancestor cannot authorize mutation"
    );
}

#[test]
fn manifest_membership_is_closed_to_exact_current_set() {
    let exact = ManifestState {
        installed: ["claude", "antigravity", "codex"]
            .into_iter()
            .map(str::to_string)
            .collect(),
        version: "2.0".into(),
        serial: 1,
    };
    assert!(manifest_is_exact(Some(&exact)));
    let mut extra = exact.installed.clone();
    extra.insert("unsupported".into());
    let extra = ManifestState {
        installed: extra,
        version: "2.0".into(),
        serial: 2,
    };
    assert!(manifest_has_unsupported(Some(&extra)));
    assert!(!manifest_is_exact(Some(&extra)));
    let refused = setup::terminal_receipts(
        "refused",
        "indeterminate",
        json!({"error_kind":"manifest_membership_disagreement"}),
        "refused_before_child_spawn",
    );
    assert_eq!(
        refused.len(),
        4,
        "terminal refusal retains every current ordinal"
    );
    assert!(refused.iter().all(|receipt| receipt["attempted"] == false));
}

#[test]
fn per_ordinal_preflight_converges_core_only_partial_and_healthy_states() {
    for (installed, expected_missing) in [
        (vec![], vec!["claude", "antigravity", "codex"]),
        (vec!["claude", "antigravity"], vec!["codex"]),
        (vec!["claude"], vec!["antigravity", "codex"]),
        (vec!["claude", "antigravity", "codex"], vec![]),
    ] {
        let manifest = ManifestState {
            installed: installed.iter().map(|name| (*name).to_string()).collect(),
            version: "2.0".into(),
            serial: 1,
        };
        let mut missing = Vec::new();
        for provider in CURRENT_SETUP_PROVIDERS {
            let preview_valid =
                provider == Provider::Core || installed.contains(&provider.as_arg());
            let doctor_current = provider == Provider::Core || preview_valid;
            let doctor_missing = provider != Provider::Core && !preview_valid;
            match setup::decide_preflight(
                Some(&manifest),
                doctor_current,
                doctor_missing,
                provider,
                true,
                preview_valid,
            ) {
                setup::PreflightDecision::InstallMissing => missing.push(provider.as_arg()),
                setup::PreflightDecision::ReconciledExisting => {}
                setup::PreflightDecision::Indeterminate => {
                    panic!("authoritative fixture disagreed")
                }
            }
        }
        assert_eq!(missing, expected_missing);
    }
    let empty = ManifestState {
        installed: HashSet::new(),
        version: "2.0".into(),
        serial: 1,
    };
    assert_eq!(
        setup::decide_preflight(Some(&empty), false, false, Provider::Claude, false, false,),
        setup::PreflightDecision::Indeterminate,
        "a malformed or bounded preview cannot authorize a missing-provider mutation"
    );
    let claims_claude = ManifestState {
        installed: ["claude"].into_iter().map(str::to_string).collect(),
        version: "2.0".into(),
        serial: 2,
    };
    assert_eq!(
        setup::decide_preflight(
            Some(&claims_claude),
            false,
            true,
            Provider::Claude,
            true,
            true,
        ),
        setup::PreflightDecision::Indeterminate,
        "receipt, manifest, and doctor disagreement cannot become current"
    );
}

#[test]
fn preflight_preserves_timeout_output_cap_and_runner_failure_causes_by_phase() {
    let capture = |termination| RunCapture {
        code: None,
        stdout: String::new(),
        stderr: String::new(),
        captured_bytes: 0,
        termination,
    };
    assert_eq!(
        setup::preflight_failure(&capture(RunTermination::TimeoutCancelled), "doctor"),
        Some(("timeout_cancelled", "doctor_timeout_cancelled".into()))
    );
    assert_eq!(
        setup::preflight_failure(&capture(RunTermination::OutputCapped), "preview"),
        Some(("indeterminate", "preview_output_capped".into()))
    );
    assert_eq!(
        setup::preflight_failure(&capture(RunTermination::Indeterminate), "doctor"),
        Some(("indeterminate", "doctor_runner_indeterminate".into()))
    );
    assert_eq!(
        setup::preflight_failure(&capture(RunTermination::Completed), "preview"),
        None
    );
}

#[test]
fn registry_bounds_and_single_flight() {
    let mut reg = Registry::new();
    for i in 0..(MAX_JOBS + 10) {
        reg.insert(Job {
            id: format!("j{i}"),
            label: "setup:current".into(),
            target: "/p".into(),
            key: format!("k{i}"),
            posture: "standard",
            state: JobState::Succeeded,
            created: Instant::now(),
            outcome: None,
        });
    }
    assert!(reg.jobs.len() <= MAX_JOBS, "registry stays capped");

    let mut reg = Registry::new();
    reg.insert(Job {
        id: "run1".into(),
        label: "acquire:vaultspec-rag".into(),
        target: "machine".into(),
        key: "machine:acquire:vaultspec-rag".into(),
        posture: "standard",
        state: JobState::Running,
        created: Instant::now(),
        outcome: None,
    });
    let duplicate = Job {
        id: "run2".into(),
        label: "acquire:vaultspec-rag".into(),
        target: "machine".into(),
        key: "machine:acquire:vaultspec-rag".into(),
        posture: "standard",
        state: JobState::Running,
        created: Instant::now(),
        outcome: None,
    };
    assert!(matches!(
        reg.match_or_reserve(duplicate),
        Reservation::Attach(_)
    ));
    let distinct = Job {
        id: "run3".into(),
        label: "acquire:vaultspec-core".into(),
        target: "machine".into(),
        key: "machine:acquire:vaultspec-core".into(),
        posture: "standard",
        state: JobState::Running,
        created: Instant::now(),
        outcome: None,
    };
    assert!(matches!(
        reg.match_or_reserve(distinct),
        Reservation::Reserved(_)
    ));
}

#[test]
fn setup_single_flight_attaches_identical_posture_and_conflicts_different_posture() {
    let safe = Capability::SetupCurrent { force: false };
    let force = Capability::SetupCurrent { force: true };
    assert_eq!(safe.label(), force.label(), "one semantic setup identity");

    let key = "/p:setup:current";
    let mut reg = Registry::new();
    reg.insert(Job {
        id: "setup-1".into(),
        label: safe.label(),
        target: "/p".into(),
        key: key.into(),
        posture: safe.posture(),
        state: JobState::Running,
        created: Instant::now(),
        outcome: None,
    });
    let candidate = |id: &str, posture| Job {
        id: id.into(),
        label: "setup:current".into(),
        target: "/p".into(),
        key: key.into(),
        posture,
        state: JobState::Running,
        created: Instant::now(),
        outcome: None,
    };
    assert!(matches!(
        reg.match_or_reserve(candidate("setup-2", safe.posture())),
        Reservation::Attach(_)
    ));
    assert_eq!(reg.jobs.len(), 1, "attach cannot reserve a second job");
    assert!(
        matches!(reg.match_or_reserve(candidate("setup-3", force.posture())), Reservation::Conflict(id) if id == "setup-1")
    );
    assert_eq!(reg.jobs.len(), 1, "conflict cannot reserve a second job");
}

#[test]
fn hard_cap_preserves_attach_and_conflict_but_refuses_distinct_running_job() {
    let mut reg = Registry::new();
    let candidate = |id: String, key: String, posture| Job {
        id,
        label: "setup:current".into(),
        target: "/p".into(),
        key,
        posture,
        state: JobState::Running,
        created: Instant::now(),
        outcome: None,
    };
    for i in 0..MAX_JOBS {
        assert!(matches!(
            reg.match_or_reserve(candidate(format!("r{i}"), format!("k{i}"), "standard")),
            Reservation::Reserved(_)
        ));
    }
    assert_eq!(reg.jobs.len(), MAX_JOBS);
    assert!(matches!(
        reg.match_or_reserve(candidate("attach".into(), "k0".into(), "standard")),
        Reservation::Attach(_)
    ));
    assert!(matches!(
        reg.match_or_reserve(candidate("conflict".into(), "k0".into(), "force")),
        Reservation::Conflict(id) if id == "r0"
    ));
    assert!(matches!(
        reg.match_or_reserve(candidate(
            "refused".into(),
            "distinct-at-cap".into(),
            "standard"
        )),
        Reservation::AtCapacity
    ));
    assert_eq!(reg.jobs.len(), MAX_JOBS, "refusal cannot over-admit");

    reg.set_outcome("r0", JobState::Succeeded, json!({"done":true}));
    assert!(matches!(
        reg.match_or_reserve(candidate(
            "admitted".into(),
            "after-terminal".into(),
            "standard"
        )),
        Reservation::Reserved(_)
    ));
    assert_eq!(reg.jobs.len(), MAX_JOBS);
    assert!(
        !reg.jobs.contains_key("r0"),
        "oldest terminal job was evicted"
    );
}

#[tokio::test]
async fn version_probe_interprets_a_real_process() {
    let version = probe_version("git", &["--version"])
        .await
        .expect("the test environment provides git on PATH");
    assert!(
        version.starts_with("git version "),
        "expected git version output, got {version:?}"
    );
}

#[cfg(windows)]
#[tokio::test]
async fn real_process_malformed_timeout_and_output_cap_never_validate_as_success() {
    let command = |script: &str| {
        vec![
            "powershell.exe".to_string(),
            "-NoProfile".to_string(),
            "-NonInteractive".to_string(),
            "-Command".to_string(),
            script.to_string(),
        ]
    };
    let malformed = run_capability_with_limits(
        &command("[Console]::Out.Write('not-json')"),
        BoundedLimits {
            cap: 1024,
            timeout: Duration::from_secs(5),
        },
    )
    .await;
    assert_eq!(malformed.code, Some(0));
    let dir = tempfile::tempdir().expect("target");
    assert!(validate_install_output(&malformed.stdout, Provider::Core, dir.path(), false).is_err());

    let marker = dir.path().join(".claude");
    let script = format!(
        "New-Item -ItemType Directory -Path '{}' | Out-Null; Start-Sleep -Seconds 5",
        marker.display()
    );
    let timed = run_capability_with_limits(
        &command(&script),
        BoundedLimits {
            cap: 1024,
            timeout: Duration::from_secs(2),
        },
    )
    .await;
    assert_eq!(timed.termination, RunTermination::TimeoutCancelled);
    assert!(
        marker.is_dir(),
        "partial directory may exist but cannot prove success"
    );

    let over = run_capability_with_limits(
        &command("[Console]::Out.Write(('x' * 4096))"),
        BoundedLimits {
            cap: 32,
            timeout: Duration::from_secs(5),
        },
    )
    .await;
    assert_eq!(over.termination, RunTermination::OutputCapped);
}

#[cfg(windows)]
#[tokio::test]
async fn four_real_process_install_v1_receipts_can_form_complete_only_after_validation() {
    let dir = tempfile::tempdir().expect("target");
    let mut receipts = Vec::new();
    for (index, provider) in CURRENT_SETUP_PROVIDERS.iter().copied().enumerate() {
        let rel = format!("item-{index}");
        std::fs::write(dir.path().join(&rel), "current").expect("declared item");
        let providers = if provider == Provider::Core {
            json!([])
        } else {
            json!([provider.as_arg()])
        };
        let raw = json!({"schema":"vaultspec.install.v1","status":"created","data":{
            "action":"install","path":dir.path(),"providers":providers,"items":[[rel,"current"]]
        }})
        .to_string();
        let escaped = raw.replace('\'', "''");
        let argv = vec![
            "powershell.exe".into(),
            "-NoProfile".into(),
            "-NonInteractive".into(),
            "-Command".into(),
            format!("[Console]::Out.Write('{escaped}')"),
        ];
        let capture = run_capability_with_limits(
            &argv,
            BoundedLimits {
                cap: 4096,
                timeout: Duration::from_secs(5),
            },
        )
        .await;
        assert_eq!(capture.code, Some(0));
        let validated = validate_install_output(&capture.stdout, provider, dir.path(), false)
            .expect("current receipt");
        receipts.push(setup_receipt(
            "real",
            index + 1,
            provider,
            "succeeded",
            true,
            json!({
                "install": validated.projection,
                "install_digest": digest(&capture.stdout)
            }),
            "confirmed_current",
        ));
    }
    assert_eq!(
        current_setup_outcome(receipts).1["aggregate"]["status"],
        "complete"
    );
}

#[tokio::test]
async fn project_locked_core_completes_partial_repeat_and_force_aggregate_shapes() {
    async fn seed(target: &FsPath, count: usize) {
        let commands = Capability::SetupCurrent { force: false }
            .setup_commands(target)
            .expect("setup commands");
        for (provider, argv) in commands.into_iter().take(count) {
            let capture = run_capability_with_limits(
                &argv,
                BoundedLimits {
                    cap: JOB_OUTPUT_CAP,
                    timeout: Duration::from_secs(90),
                },
            )
            .await;
            assert_eq!(
                capture.code,
                Some(0),
                "seed {provider:?}: {}",
                capture.combined()
            );
            validate_install_output(&capture.stdout, provider, target, false)
                .expect("project-locked Core seed receipt");
        }
    }

    async fn aggregate(target: &FsPath, force: bool, job: &str) -> Value {
        let commands = Capability::SetupCurrent { force }
            .setup_commands(target)
            .expect("setup commands");
        let (_, outcome) = setup::run_current_setup(job, force, commands, target).await;
        assert_eq!(outcome["aggregate"]["status"], "complete", "{outcome}");
        assert!(setup::manifest_is_exact(
            setup::read_setup_manifest(target).unwrap().as_ref()
        ));
        let wire = outcome.to_string();
        assert!(
            !wire.contains("producer_stdout"),
            "raw producer JSON is not served"
        );
        assert!(
            !wire.contains("unknown"),
            "open-world Doctor metadata is not served"
        );
        for receipt in outcome["aggregate"]["providers"].as_array().unwrap() {
            assert!(receipt["evidence"].get("doctor_digest").is_some());
            assert!(receipt["reconciliation"].get("final_doctor").is_some());
            assert!(
                receipt["reconciliation"]
                    .get("final_doctor_digest")
                    .is_some()
            );
        }
        outcome
    }

    let core_only = tempfile::tempdir().expect("core-only target");
    seed(core_only.path(), 1).await;
    let core_only_result = aggregate(core_only.path(), false, "real-core-only").await;
    assert_eq!(
        core_only_result["aggregate"]["providers"]
            .as_array()
            .unwrap()
            .iter()
            .map(|receipt| receipt["attempted"].as_bool().unwrap())
            .collect::<Vec<_>>(),
        [false, true, true, true]
    );
    let repeated = aggregate(core_only.path(), false, "real-healthy-repeat").await;
    assert!(
        repeated["aggregate"]["providers"]
            .as_array()
            .unwrap()
            .iter()
            .all(|receipt| receipt["attempted"] == false)
    );
    let forced = aggregate(core_only.path(), true, "real-force").await;
    assert!(
        forced["aggregate"]["providers"]
            .as_array()
            .unwrap()
            .iter()
            .all(|receipt| receipt["attempted"] == true)
    );

    let one_missing = tempfile::tempdir().expect("one-missing target");
    seed(one_missing.path(), 3).await;
    let one_missing_result = aggregate(one_missing.path(), false, "real-one-missing").await;
    assert_eq!(
        one_missing_result["aggregate"]["providers"]
            .as_array()
            .unwrap()
            .iter()
            .map(|receipt| receipt["attempted"].as_bool().unwrap())
            .collect::<Vec<_>>(),
        [false, false, false, true]
    );

    let multiple_missing = tempfile::tempdir().expect("multiple-missing target");
    seed(multiple_missing.path(), 2).await;
    let multiple_result = aggregate(multiple_missing.path(), false, "real-multiple-missing").await;
    assert_eq!(
        multiple_result["aggregate"]["providers"]
            .as_array()
            .unwrap()
            .iter()
            .map(|receipt| receipt["attempted"].as_bool().unwrap())
            .collect::<Vec<_>>(),
        [false, false, true, true]
    );
}
