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
    for (provider, argv) in commands {
        assert_eq!(argv.iter().filter(|token| *token == "install").count(), 1);
        assert!(argv.contains(&provider.as_arg().to_string()));
        assert!(argv.contains(&"--force".to_string()));
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
fn current_setup_receipts_cover_partial_timeout_and_indeterminate_outcomes() {
    let success = |ordinal, provider| {
        setup_receipt(
            ordinal,
            provider,
            Some(0),
            r#"{"status":"created"}"#,
            RunTermination::Completed,
        )
    };
    let mut complete_receipts: Vec<Value> = CURRENT_SETUP_PROVIDERS
        .iter()
        .copied()
        .enumerate()
        .map(|(index, provider)| success(index + 1, provider))
        .collect();
    reconcile_setup_receipts(
        &mut complete_receipts,
        &[],
        &["core", "claude", "antigravity", "codex"],
    );
    let (_, complete) = current_setup_outcome(complete_receipts);
    assert_eq!(complete["aggregate"]["status"], "complete");
    assert_eq!(
        complete["aggregate"]["providers"].as_array().unwrap().len(),
        4
    );

    let failed = setup_receipt(
        2,
        Provider::Claude,
        Some(1),
        "failed",
        RunTermination::Completed,
    );
    let mut partial_receipts = vec![
        success(1, Provider::Core),
        failed,
        success(3, Provider::Antigravity),
        success(4, Provider::Codex),
    ];
    reconcile_setup_receipts(
        &mut partial_receipts,
        &[],
        &["core", "antigravity", "codex"],
    );
    let (_, partial) = current_setup_outcome(partial_receipts);
    assert_eq!(partial["aggregate"]["status"], "partial");
    assert_eq!(partial["aggregate"]["providers"][0]["provider"], "core");
    assert_eq!(partial["aggregate"]["providers"][1]["provider"], "claude");

    let timeout = setup_receipt(
        3,
        Provider::Antigravity,
        None,
        "timed out",
        RunTermination::TimeoutCancelled,
    );
    let mut cancelled_receipts = vec![
        success(1, Provider::Core),
        success(2, Provider::Claude),
        timeout,
        json!({ "ordinal": 4, "provider": "codex", "attempted": false, "state": "not-run", "outcome": null }),
    ];
    reconcile_setup_receipts(&mut cancelled_receipts, &[], &["core", "claude"]);
    let (_, cancelled) = current_setup_outcome(cancelled_receipts);
    assert_eq!(cancelled["aggregate"]["status"], "timeout_cancelled");
    assert_eq!(cancelled["outcome_indeterminate"], true);
    assert_eq!(cancelled["reconciliation"], "completed");
    assert_eq!(cancelled["aggregate"]["providers"][3]["state"], "not-run");

    let indeterminate = setup_receipt(
        2,
        Provider::Claude,
        None,
        "wait failed",
        RunTermination::Indeterminate,
    );
    let mut unknown_receipts = vec![
        success(1, Provider::Core),
        indeterminate,
        json!({ "ordinal": 3, "provider": "antigravity", "attempted": false, "state": "not-run", "outcome": null }),
        json!({ "ordinal": 4, "provider": "codex", "attempted": false, "state": "not-run", "outcome": null }),
    ];
    reconcile_setup_receipts(&mut unknown_receipts, &["claude"], &["core", "claude"]);
    let (_, unknown) = current_setup_outcome(unknown_receipts);
    assert_eq!(unknown["aggregate"]["status"], "indeterminate");
    assert_eq!(unknown["outcome_indeterminate"], true);
    assert_eq!(unknown["reconciliation"], "status-required");
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
    assert_eq!(
        reg.running_for("machine:acquire:vaultspec-rag", "standard"),
        RunningMatch::Attach("run1".into())
    );
    assert_eq!(
        reg.running_for("machine:acquire:vaultspec-core", "standard"),
        RunningMatch::None
    );
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
    assert_eq!(
        reg.running_for(key, safe.posture()),
        RunningMatch::Attach("setup-1".into())
    );
    assert_eq!(
        reg.running_for(key, force.posture()),
        RunningMatch::Conflict("setup-1".into())
    );
}

#[test]
fn running_jobs_are_never_evicted_by_cap() {
    let mut reg = Registry::new();
    for i in 0..(MAX_JOBS + 5) {
        reg.insert(Job {
            id: format!("r{i}"),
            label: "setup:current".into(),
            target: "/p".into(),
            key: format!("k{i}"),
            posture: "standard",
            state: JobState::Running,
            created: Instant::now(),
            outcome: None,
        });
    }
    // All running: the cap cannot shed them, so every one survives.
    assert_eq!(reg.jobs.len(), MAX_JOBS + 5);
}

#[tokio::test]
async fn version_probe_interprets_a_real_rustc_process() {
    let version = probe_version("rustc", &["--version"])
        .await
        .expect("the test toolchain provides rustc on PATH");
    assert!(
        version.starts_with("rustc "),
        "expected rustc version output, got {version:?}"
    );
}
