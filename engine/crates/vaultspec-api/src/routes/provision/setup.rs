use super::*;

pub(super) fn digest(raw: &str) -> String {
    format!("sha256:{:x}", Sha256::digest(raw.as_bytes()))
}

pub(super) fn local_receipt_id(job_id: &str, ordinal: usize, provider: Provider) -> String {
    format!("{job_id}:{ordinal}:{}", provider.as_arg())
}

pub(super) fn setup_receipt(
    job_id: &str,
    ordinal: usize,
    provider: Provider,
    state: &str,
    attempted: bool,
    evidence: Value,
    reconciliation: &str,
) -> Value {
    json!({
        "receipt_id": local_receipt_id(job_id, ordinal, provider),
        "receipt_authority": "dashboard-local",
        "ordinal": ordinal,
        "provider": provider.as_arg(),
        "attempted": attempted,
        "state": state,
        "evidence": evidence,
        "reconciliation": { "status": reconciliation },
    })
}

pub(super) fn terminal_receipts(
    job_id: &str,
    state: &str,
    evidence: Value,
    reconciliation: &str,
) -> Vec<Value> {
    CURRENT_SETUP_PROVIDERS
        .iter()
        .copied()
        .enumerate()
        .map(|(index, provider)| {
            if index == 0 {
                setup_receipt(
                    job_id,
                    1,
                    provider,
                    state,
                    false,
                    evidence.clone(),
                    reconciliation,
                )
            } else {
                setup_receipt(
                    job_id,
                    index + 1,
                    provider,
                    "not-run",
                    false,
                    Value::Null,
                    "not_attempted",
                )
            }
        })
        .collect()
}

#[derive(Debug)]
pub(super) struct ManifestState {
    pub(super) installed: HashSet<String>,
    pub(super) version: String,
    pub(super) serial: u64,
}

pub(super) fn read_setup_manifest(target: &FsPath) -> Result<Option<ManifestState>, String> {
    let path = target.join(".vaultspec").join("providers.json");
    let raw = match std::fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("reading provider manifest: {error}")),
    };
    let value: Value =
        serde_json::from_str(&raw).map_err(|_| "provider manifest is malformed".to_string())?;
    let entries = value["installed"]
        .as_array()
        .ok_or_else(|| "provider manifest installed set is malformed".to_string())?;
    let installed = entries
        .iter()
        .map(|entry| {
            entry
                .as_str()
                .map(str::to_owned)
                .ok_or_else(|| "provider manifest membership is malformed".to_string())
        })
        .collect::<Result<HashSet<_>, _>>()?;
    if installed.len() != entries.len() {
        return Err("provider manifest membership contains duplicates".to_string());
    }
    Ok(Some(ManifestState {
        installed,
        version: value["version"].as_str().unwrap_or_default().to_string(),
        serial: value["serial"].as_u64().unwrap_or_default(),
    }))
}

pub(super) fn manifest_has_unsupported(manifest: Option<&ManifestState>) -> bool {
    let allowed: HashSet<&str> = ["claude", "antigravity", "codex"].into_iter().collect();
    manifest.is_some_and(|m| {
        m.installed
            .iter()
            .any(|name| !allowed.contains(name.as_str()))
    })
}

pub(super) fn manifest_is_exact(manifest: Option<&ManifestState>) -> bool {
    let expected: HashSet<String> = ["claude", "antigravity", "codex"]
        .into_iter()
        .map(str::to_string)
        .collect();
    manifest.is_some_and(|m| m.version == "2.0" && m.serial > 0 && m.installed == expected)
}

#[derive(Debug)]
pub(super) struct ValidatedInstall {
    pub(super) projection: Value,
    pub(super) all_items_exist: bool,
}

pub(super) fn safe_declared_items(envelope: &Value) -> Result<Vec<(String, String)>, String> {
    let items = envelope["data"]["items"]
        .as_array()
        .ok_or_else(|| "install items are missing".to_string())?;
    if items.is_empty() {
        return Err("install items are empty".to_string());
    }
    let mut paths = Vec::with_capacity(items.len());
    for item in items {
        let pair = item
            .as_array()
            .filter(|pair| pair.len() == 2)
            .ok_or_else(|| "install item is not an exact pair".to_string())?;
        let rel = pair[0]
            .as_str()
            .ok_or_else(|| "install item path is not a string".to_string())?;
        let label = pair[1]
            .as_str()
            .ok_or_else(|| "install item label is not a string".to_string())?;
        let rel_path = FsPath::new(rel);
        if rel_path.is_absolute()
            || rel_path
                .components()
                .any(|component| !matches!(component, Component::Normal(_)))
        {
            return Err("install item path is not a safe relative path".to_string());
        }
        paths.push((rel.to_string(), label.to_string()));
    }
    Ok(paths)
}

fn path_is_within(canonical_target: &FsPath, path: &FsPath) -> bool {
    path == canonical_target || path.starts_with(canonical_target)
}

/// Prove an existing item or the nearest existing ancestor of a missing item
/// remains within the canonical target. This catches a missing child below an
/// existing symlink/junction before that child can authorize a mutation.
pub(super) fn declared_item_state(target: &FsPath, relative: &str) -> Result<bool, String> {
    let canonical_target =
        std::fs::canonicalize(target).map_err(|_| "setup target cannot be resolved".to_string())?;
    let item = target.join(relative);
    let exists = item.exists();
    let mut ancestor = item.as_path();
    while !ancestor.exists() {
        ancestor = ancestor
            .parent()
            .ok_or_else(|| "declared item has no existing ancestor".to_string())?;
    }
    let canonical = std::fs::canonicalize(ancestor)
        .map_err(|_| "declared item ancestor cannot be resolved".to_string())?;
    if !path_is_within(&canonical_target, &canonical) {
        return Err(if exists {
            "producer-declared install item escapes the setup target".to_string()
        } else {
            "missing producer-declared item has an escaping ancestor".to_string()
        });
    }
    Ok(exists)
}

pub(super) fn validate_install_output(
    raw: &str,
    provider: Provider,
    target: &FsPath,
    preview: bool,
) -> Result<ValidatedInstall, String> {
    let envelope: Value = serde_json::from_str(raw)
        .map_err(|_| "Core stdout is not exactly one JSON object".to_string())?;
    if envelope["schema"] != "vaultspec.install.v1" {
        return Err("unexpected Core install schema".to_string());
    }
    let expected_status = if preview { "unchanged" } else { "created" };
    let expected_action = if preview { "dry_run" } else { "install" };
    if envelope["status"] != expected_status || envelope["data"]["action"] != expected_action {
        return Err("Core install status/action disagreement".to_string());
    }
    let path = envelope["data"]["path"]
        .as_str()
        .ok_or_else(|| "Core install target is missing".to_string())?;
    let actual = std::fs::canonicalize(path)
        .map_err(|_| "Core install target cannot be resolved".to_string())?;
    let expected =
        std::fs::canonicalize(target).map_err(|_| "setup target cannot be resolved".to_string())?;
    if actual != expected {
        return Err("Core install target disagreement".to_string());
    }
    if let Some(errors) = envelope["data"].get("errors") {
        match errors.as_array() {
            Some(errors) if errors.is_empty() => {}
            Some(_) => return Err("Core install reported errors".to_string()),
            None => return Err("Core install errors field is malformed".to_string()),
        }
    }
    if !preview {
        let providers = envelope["data"]["providers"]
            .as_array()
            .ok_or_else(|| "Core install provider identity is missing".to_string())?;
        let valid = match provider {
            Provider::Core => providers.is_empty(),
            _ => providers.len() == 1 && providers[0] == provider.as_arg(),
        };
        if !valid {
            return Err("Core install provider identity disagreement".to_string());
        }
    }
    let items = safe_declared_items(&envelope)?;
    let states = items
        .iter()
        .map(|(relative, _)| declared_item_state(target, relative))
        .collect::<Result<Vec<_>, _>>()?;
    let all_items_exist = states.iter().all(|exists| *exists);
    if !preview && !all_items_exist {
        return Err("producer-declared install item is missing".to_string());
    }
    Ok(ValidatedInstall {
        projection: json!({
            "schema": "vaultspec.install.v1",
            "status": expected_status,
            "action": expected_action,
            "target": expected.to_string_lossy(),
            "provider": provider.as_arg(),
            "items": items,
        }),
        all_items_exist,
    })
}

fn parse_doctor(raw: &str) -> Result<Value, String> {
    let envelope: Value =
        serde_json::from_str(raw).map_err(|_| "Core doctor stdout is malformed".to_string())?;
    if envelope["schema"] != "vaultspec.spec.doctor.v1" {
        return Err("unexpected Core doctor schema".to_string());
    }
    Ok(envelope)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum DoctorExpectation {
    Current,
    Missing,
}

/// Decode only the command-bound current evidence that may cross the wire.
/// Unknown producer metadata remains open-world input and is discarded.
pub(super) fn validate_doctor_output(
    raw: &str,
    code: Option<i32>,
    provider: Provider,
    expectation: DoctorExpectation,
) -> Result<Value, String> {
    let doctor = parse_doctor(raw)?;
    if provider == Provider::Core {
        let (expected_code, status, framework) = match expectation {
            DoctorExpectation::Current => (0, "unchanged", "present"),
            DoctorExpectation::Missing => (2, "failed", "missing"),
        };
        if code != Some(expected_code)
            || doctor["status"] != status
            || doctor["data"]["framework"] != framework
        {
            return Err("Core Doctor status/framework disagreement".to_string());
        }
        if expectation == DoctorExpectation::Missing
            && !doctor["data"]["providers"]
                .as_object()
                .is_some_and(serde_json::Map::is_empty)
        {
            return Err("Core-missing Doctor providers are not empty".to_string());
        }
        return Ok(json!({
            "schema":"vaultspec.spec.doctor.v1",
            "status":status,
            "framework":framework,
            "provider":"core",
        }));
    }
    if code != Some(0)
        || doctor["status"] != "unchanged"
        || doctor["data"]["framework"] != "present"
    {
        return Err("provider Doctor status/framework disagreement".to_string());
    }
    let entry = &doctor["data"]["providers"][provider.as_arg()];
    let manifest_entry = entry["manifest_entry"]
        .as_str()
        .ok_or_else(|| "Doctor manifest_entry is missing or mistyped".to_string())?;
    let dir_state = entry["dir_state"]
        .as_str()
        .ok_or_else(|| "Doctor dir_state is missing or mistyped".to_string())?;
    let config = entry["config"]
        .as_str()
        .ok_or_else(|| "Doctor config is missing or mistyped".to_string())?;
    let content = entry["content"]
        .as_object()
        .ok_or_else(|| "Doctor content is missing or mistyped".to_string())?;
    let valid = match expectation {
        DoctorExpectation::Current => {
            manifest_entry == "coherent"
                && matches!(dir_state, "complete" | "mixed")
                && config == "ok"
                && content
                    .values()
                    .all(|value| value.as_str() == Some("clean"))
        }
        DoctorExpectation::Missing => {
            manifest_entry == "not_installed"
                && dir_state == "missing"
                && config == "ok"
                && content.is_empty()
        }
    };
    if !valid {
        return Err("selected provider Doctor evidence disagrees".to_string());
    }
    Ok(json!({
        "schema":"vaultspec.spec.doctor.v1",
        "status":"unchanged",
        "framework":"present",
        "provider":provider.as_arg(),
        "entry":{
            "manifest_entry":manifest_entry,
            "dir_state":dir_state,
            "config":config,
            "content_clean":true,
        }
    }))
}

#[derive(Debug, PartialEq, Eq)]
pub(super) enum PreflightDecision {
    ReconciledExisting,
    InstallMissing,
    Indeterminate,
}

pub(super) fn preflight_failure(
    capture: &RunCapture,
    phase: &str,
) -> Option<(&'static str, String)> {
    match capture.termination {
        RunTermination::Completed => None,
        RunTermination::TimeoutCancelled => {
            Some(("timeout_cancelled", format!("{phase}_timeout_cancelled")))
        }
        RunTermination::OutputCapped => Some(("indeterminate", format!("{phase}_output_capped"))),
        RunTermination::Indeterminate => {
            Some(("indeterminate", format!("{phase}_runner_indeterminate")))
        }
    }
}

pub(super) fn decide_preflight(
    manifest: Option<&ManifestState>,
    doctor_current: bool,
    doctor_missing: bool,
    provider: Provider,
    preview_shape_valid: bool,
    preview_items_exist: bool,
) -> PreflightDecision {
    let manifest_valid = match provider {
        Provider::Core => manifest.is_some_and(|m| m.version == "2.0" && m.serial > 0),
        _ => manifest.is_some_and(|m| m.installed.contains(provider.as_arg())),
    };
    if preview_shape_valid && preview_items_exist && manifest_valid && doctor_current {
        PreflightDecision::ReconciledExisting
    } else if preview_shape_valid && !preview_items_exist && !manifest_valid && doctor_missing {
        PreflightDecision::InstallMissing
    } else {
        PreflightDecision::Indeterminate
    }
}

pub(super) fn doctor_argv(target: &FsPath) -> Vec<String> {
    let mut argv = ingest_core::runner::CoreRunner::detect().invocation;
    argv.extend([
        "spec".into(),
        "doctor".into(),
        "-t".into(),
        target.to_string_lossy().to_string(),
        "--json".into(),
    ]);
    argv
}

pub(super) fn preview_argv(argv: &[String]) -> Vec<String> {
    let mut preview = argv.to_vec();
    let position = preview
        .iter()
        .position(|token| token == "--json")
        .unwrap_or(preview.len());
    preview.insert(position, "--dry-run".into());
    preview.retain(|token| token != "--force");
    preview
}

pub(super) async fn run_setup_bounded(
    argv: Vec<String>,
    started: Instant,
    remaining_output: &mut u64,
) -> RunCapture {
    let Some(remaining_time) = JOB_TIMEOUT.checked_sub(started.elapsed()) else {
        return RunCapture {
            code: None,
            stdout: String::new(),
            stderr: "aggregate setup deadline reached".into(),
            captured_bytes: 0,
            termination: RunTermination::TimeoutCancelled,
        };
    };
    if *remaining_output < 3 {
        return RunCapture {
            code: None,
            stdout: String::new(),
            stderr: "aggregate setup output budget exhausted".into(),
            captured_bytes: 0,
            termination: RunTermination::OutputCapped,
        };
    }
    let capture = run_capability_with_limits(
        &argv,
        BoundedLimits {
            cap: (*remaining_output - 1) / 2,
            timeout: remaining_time,
        },
    )
    .await;
    *remaining_output = remaining_output.saturating_sub(capture.bytes());
    capture
}

pub(super) fn current_setup_outcome(receipts: Vec<Value>) -> (JobState, Value) {
    let identities_valid = receipts.len() == CURRENT_SETUP_PROVIDERS.len()
        && receipts
            .iter()
            .zip(CURRENT_SETUP_PROVIDERS)
            .enumerate()
            .all(|(index, (receipt, provider))| {
                receipt["ordinal"] == index + 1
                    && receipt["provider"] == provider.as_arg()
                    && receipt["receipt_authority"] == "dashboard-local"
                    && matches!(
                        receipt["state"].as_str(),
                        Some(
                            "succeeded"
                                | "reconciled_existing"
                                | "failed"
                                | "timeout_cancelled"
                                | "indeterminate"
                                | "not-run"
                        )
                    )
            });
    let states: Vec<&str> = receipts
        .iter()
        .filter_map(|receipt| receipt["state"].as_str())
        .collect();
    let status = if !identities_valid || states.contains(&"indeterminate") {
        "indeterminate"
    } else if states.contains(&"timeout_cancelled") {
        "timeout_cancelled"
    } else if states
        .iter()
        .all(|state| matches!(*state, "succeeded" | "reconciled_existing"))
    {
        "complete"
    } else {
        "partial"
    };
    let job_state = if status == "complete" {
        JobState::Succeeded
    } else {
        JobState::Failed
    };
    (
        job_state,
        json!({
            "aggregate": {
                "intent": "setup-current-providers",
                "status": status,
                "providers": receipts,
            },
            "outcome_indeterminate": matches!(status, "timeout_cancelled" | "indeterminate"),
            "reconciliation": if status == "indeterminate" {
                "status-required"
            } else {
                "completed"
            },
        }),
    )
}

pub(super) async fn run_current_setup(
    job_id: &str,
    force: bool,
    commands: Vec<(Provider, Vec<String>)>,
    target: &FsPath,
) -> (JobState, Value) {
    let mut receipts = Vec::with_capacity(CURRENT_SETUP_PROVIDERS.len());
    let mut stop = false;
    let started = Instant::now();
    let mut remaining_output = JOB_OUTPUT_CAP;

    let initial_manifest = match read_setup_manifest(target) {
        Ok(manifest) => manifest,
        Err(error) => {
            return current_setup_outcome(terminal_receipts(
                job_id,
                "indeterminate",
                json!({"error": error}),
                "manifest_unreadable",
            ));
        }
    };
    if initial_manifest
        .as_ref()
        .is_some_and(|manifest| manifest.version != "2.0" || manifest.serial == 0)
    {
        return current_setup_outcome(terminal_receipts(
            job_id,
            "indeterminate",
            json!({"error_kind": "manifest_contract_disagreement"}),
            "refused_before_child_spawn",
        ));
    }
    if manifest_has_unsupported(initial_manifest.as_ref()) {
        let mut outcome = current_setup_outcome(terminal_receipts(
            job_id,
            "indeterminate",
            json!({"error_kind": "manifest_membership_disagreement"}),
            "refused_before_child_spawn",
        ));
        outcome.1["error_kind"] = json!("manifest_membership_disagreement");
        return outcome;
    }

    let mut doctor_capture = if force {
        None
    } else {
        Some(run_setup_bounded(doctor_argv(target), started, &mut remaining_output).await)
    };

    for (index, (provider, argv)) in commands.into_iter().enumerate() {
        let ordinal = index + 1;
        if stop {
            receipts.push(setup_receipt(
                job_id,
                ordinal,
                provider,
                "not-run",
                false,
                Value::Null,
                "not_attempted",
            ));
            continue;
        }
        let manifest = match read_setup_manifest(target) {
            Ok(manifest)
                if !manifest_has_unsupported(manifest.as_ref())
                    && manifest
                        .as_ref()
                        .is_none_or(|state| state.version == "2.0" && state.serial > 0) =>
            {
                manifest
            }
            Ok(_) => {
                receipts.push(setup_receipt(
                    job_id,
                    ordinal,
                    provider,
                    "indeterminate",
                    false,
                    json!({"error_kind":"manifest_contract_disagreement"}),
                    "refused_before_child_spawn",
                ));
                stop = true;
                continue;
            }
            Err(error) => {
                receipts.push(setup_receipt(
                    job_id,
                    ordinal,
                    provider,
                    "indeterminate",
                    false,
                    json!({"error":error}),
                    "manifest_unreadable",
                ));
                stop = true;
                continue;
            }
        };
        if !force {
            let doctor_run = doctor_capture
                .as_ref()
                .expect("safe setup has Doctor evidence");
            if let Some((state, error_kind)) = preflight_failure(doctor_run, "doctor") {
                receipts.push(setup_receipt(
                    job_id,
                    ordinal,
                    provider,
                    state,
                    false,
                    json!({
                        "error_kind": error_kind,
                        "doctor_digest": digest(&doctor_run.stdout),
                    }),
                    "preflight_not_authoritative",
                ));
                stop = true;
                continue;
            }
            let doctor_current = validate_doctor_output(
                &doctor_run.stdout,
                doctor_run.code,
                provider,
                DoctorExpectation::Current,
            )
            .ok();
            let doctor_missing = validate_doctor_output(
                &doctor_run.stdout,
                doctor_run.code,
                provider,
                DoctorExpectation::Missing,
            )
            .ok();
            let preview =
                run_setup_bounded(preview_argv(&argv), started, &mut remaining_output).await;
            if let Some((state, error_kind)) = preflight_failure(&preview, "preview") {
                receipts.push(setup_receipt(
                    job_id,
                    ordinal,
                    provider,
                    state,
                    false,
                    json!({
                        "error_kind": error_kind,
                        "preview_digest": digest(&preview.stdout),
                        "doctor_digest": digest(&doctor_run.stdout),
                    }),
                    "preflight_not_authoritative",
                ));
                stop = true;
                continue;
            }
            let preview_validation = if preview.code == Some(0) {
                validate_install_output(&preview.stdout, provider, target, true).ok()
            } else {
                None
            };
            let decision = decide_preflight(
                manifest.as_ref(),
                doctor_current.is_some(),
                doctor_missing.is_some(),
                provider,
                preview_validation.is_some(),
                preview_validation
                    .as_ref()
                    .is_some_and(|value| value.all_items_exist),
            );
            if decision == PreflightDecision::ReconciledExisting {
                receipts.push(setup_receipt(
                    job_id,
                    ordinal,
                    provider,
                    "reconciled_existing",
                    false,
                    json!({
                        "install": preview_validation.expect("validated preview").projection,
                        "install_digest": digest(&preview.stdout),
                        "doctor": doctor_current.expect("validated current Doctor"),
                        "doctor_digest": digest(&doctor_run.stdout),
                    }),
                    "confirmed_current",
                ));
                continue;
            }
            if decision != PreflightDecision::InstallMissing {
                receipts.push(setup_receipt(
                    job_id,
                    ordinal,
                    provider,
                    "indeterminate",
                    false,
                    json!({
                        "error_kind":"preflight_evidence_disagreement",
                        "preview_digest":digest(&preview.stdout),
                        "doctor_digest":digest(&doctor_run.stdout),
                    }),
                    "unresolved",
                ));
                stop = true;
                continue;
            }
        }

        let capture = run_setup_bounded(argv, started, &mut remaining_output).await;
        let state = match capture.termination {
            RunTermination::TimeoutCancelled => "timeout_cancelled",
            RunTermination::OutputCapped | RunTermination::Indeterminate => "indeterminate",
            RunTermination::Completed if capture.code.is_some_and(|code| code != 0) => "failed",
            RunTermination::Completed if capture.code.is_none() => "indeterminate",
            RunTermination::Completed => "succeeded",
        };
        let install = if state == "succeeded" {
            validate_install_output(&capture.stdout, provider, target, false)
        } else {
            Err(capture.stderr.clone())
        };
        let post_doctor =
            run_setup_bounded(doctor_argv(target), started, &mut remaining_output).await;
        let doctor_current = if post_doctor.termination == RunTermination::Completed {
            validate_doctor_output(
                &post_doctor.stdout,
                post_doctor.code,
                provider,
                DoctorExpectation::Current,
            )
            .ok()
        } else {
            None
        };
        let doctor_missing = if post_doctor.termination == RunTermination::Completed {
            validate_doctor_output(
                &post_doctor.stdout,
                post_doctor.code,
                provider,
                DoctorExpectation::Missing,
            )
            .ok()
        } else {
            None
        };
        let post_manifest = read_setup_manifest(target).ok().flatten();
        let post_has_unsupported = manifest_has_unsupported(post_manifest.as_ref());
        let post_manifest_valid = match provider {
            Provider::Core => post_manifest
                .as_ref()
                .is_some_and(|m| m.version == "2.0" && m.serial > 0),
            _ => post_manifest
                .as_ref()
                .is_some_and(|m| m.installed.contains(provider.as_arg())),
        };
        let confirmed = install.is_ok()
            && !post_has_unsupported
            && post_manifest_valid
            && doctor_current.is_some();
        let final_state = if confirmed {
            "succeeded"
        } else if matches!(state, "timeout_cancelled")
            || post_doctor.termination == RunTermination::TimeoutCancelled
        {
            "timeout_cancelled"
        } else if matches!(state, "indeterminate")
            || matches!(
                post_doctor.termination,
                RunTermination::OutputCapped | RunTermination::Indeterminate
            )
        {
            "indeterminate"
        } else if state == "failed" && !post_manifest_valid && doctor_missing.is_some() {
            "failed"
        } else {
            "indeterminate"
        };
        receipts.push(setup_receipt(
            job_id,
            ordinal,
            provider,
            final_state,
            true,
            json!({
                "exit_code": capture.code,
                "install": install.as_ref().ok().map(|value| value.projection.clone()),
                "install_digest": digest(&capture.stdout),
                "doctor": doctor_current.clone().or(doctor_missing),
                "doctor_digest": digest(&post_doctor.stdout),
                "validation": install.err(),
            }),
            if confirmed {
                "confirmed_current"
            } else {
                "unresolved"
            },
        ));
        doctor_capture = Some(post_doctor);
        stop = matches!(final_state, "timeout_cancelled" | "indeterminate");
    }
    let candidate_complete = receipts.len() == CURRENT_SETUP_PROVIDERS.len()
        && receipts.iter().all(|receipt| {
            matches!(
                receipt["state"].as_str(),
                Some("succeeded" | "reconciled_existing")
            )
        });
    let final_manifest_current =
        manifest_is_exact(read_setup_manifest(target).ok().flatten().as_ref());
    let (final_doctor_current, final_doctor_failure_state, final_doctor_digest, final_projections) =
        if candidate_complete {
            let final_doctor =
                run_setup_bounded(doctor_argv(target), started, &mut remaining_output).await;
            let current = final_doctor.code == Some(0)
                && final_doctor.termination == RunTermination::Completed
                && CURRENT_SETUP_PROVIDERS.iter().copied().all(|provider| {
                    validate_doctor_output(
                        &final_doctor.stdout,
                        final_doctor.code,
                        provider,
                        DoctorExpectation::Current,
                    )
                    .is_ok()
                });
            let projections = if current {
                CURRENT_SETUP_PROVIDERS
                    .iter()
                    .copied()
                    .map(|provider| {
                        validate_doctor_output(
                            &final_doctor.stdout,
                            final_doctor.code,
                            provider,
                            DoctorExpectation::Current,
                        )
                        .expect("checked current Doctor projection")
                    })
                    .collect()
            } else {
                Vec::new()
            };
            let failure_state = if final_doctor.termination == RunTermination::TimeoutCancelled {
                "timeout_cancelled"
            } else {
                "indeterminate"
            };
            (
                current,
                failure_state,
                Some(digest(&final_doctor.stdout)),
                projections,
            )
        } else {
            (false, "indeterminate", None, Vec::new())
        };
    if let Some(final_digest) = final_doctor_digest {
        for (index, receipt) in receipts.iter_mut().enumerate() {
            receipt["reconciliation"]["final_doctor_digest"] = json!(&final_digest);
            if let Some(projection) = final_projections.get(index) {
                receipt["reconciliation"]["final_doctor"] = projection.clone();
            }
        }
    }
    if candidate_complete && (!final_manifest_current || !final_doctor_current) {
        for receipt in &mut receipts {
            if matches!(
                receipt["state"].as_str(),
                Some("succeeded" | "reconciled_existing")
            ) {
                receipt["state"] = json!(if !final_doctor_current {
                    final_doctor_failure_state
                } else {
                    "indeterminate"
                });
                receipt["reconciliation"]["status"] = json!(if !final_manifest_current {
                    "final_manifest_disagreement"
                } else {
                    "final_doctor_disagreement"
                });
            }
        }
    }
    current_setup_outcome(receipts)
}
