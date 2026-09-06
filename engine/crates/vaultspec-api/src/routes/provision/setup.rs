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

pub(super) fn safe_declared_items(envelope: &Value) -> Result<Vec<String>, String> {
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
        if pair[1].as_str().is_none() {
            return Err("install item label is not a string".to_string());
        }
        let rel_path = FsPath::new(rel);
        if rel_path.is_absolute()
            || rel_path
                .components()
                .any(|component| !matches!(component, Component::Normal(_)))
        {
            return Err("install item path is not a safe relative path".to_string());
        }
        paths.push(rel.to_string());
    }
    Ok(paths)
}

pub(super) fn validate_install_output(
    raw: &str,
    provider: Provider,
    target: &FsPath,
    preview: bool,
) -> Result<Value, String> {
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
    if !preview && items.iter().any(|relative| !target.join(relative).exists()) {
        return Err("producer-declared install item is missing".to_string());
    }
    Ok(
        json!({ "schema": "vaultspec.install.v1", "status": expected_status, "action": expected_action, "items": items }),
    )
}

pub(super) fn parse_doctor(raw: &str) -> Result<Value, String> {
    let envelope: Value =
        serde_json::from_str(raw).map_err(|_| "Core doctor stdout is malformed".to_string())?;
    if envelope["schema"] != "vaultspec.spec.doctor.v1" {
        return Err("unexpected Core doctor schema".to_string());
    }
    Ok(envelope)
}

pub(super) fn doctor_proves(doctor: &Value, provider: Provider) -> bool {
    if doctor["status"] != "unchanged" || doctor["data"]["framework"] != "present" {
        return false;
    }
    if provider == Provider::Core {
        return true;
    }
    let entry = &doctor["data"]["providers"][provider.as_arg()];
    let content_clean = entry["content"]
        .as_object()
        .is_some_and(|items| items.values().all(|value| value == "clean"));
    entry["manifest_entry"] == "coherent"
        && matches!(entry["dir_state"].as_str(), Some("complete" | "mixed"))
        && entry["config"] == "ok"
        && content_clean
}

pub(super) fn doctor_proves_missing(doctor: &Value, provider: Provider) -> bool {
    if provider == Provider::Core {
        return doctor["data"]["framework"] == "missing";
    }
    let entry = &doctor["data"]["providers"][provider.as_arg()];
    entry["manifest_entry"] == "not_installed" && entry["dir_state"] == "missing"
}

#[derive(Debug, PartialEq, Eq)]
pub(super) enum PreflightDecision {
    ReconciledExisting,
    InstallMissing,
    Indeterminate,
}

pub(super) fn decide_preflight(
    manifest: Option<&ManifestState>,
    doctor: Option<&Value>,
    provider: Provider,
    preview_shape_valid: bool,
    preview_items_exist: bool,
) -> PreflightDecision {
    let manifest_valid = match provider {
        Provider::Core => manifest.is_some_and(|m| m.version == "2.0" && m.serial > 0),
        _ => manifest.is_some_and(|m| m.installed.contains(provider.as_arg())),
    };
    if preview_shape_valid
        && preview_items_exist
        && manifest_valid
        && doctor.is_some_and(|value| doctor_proves(value, provider))
    {
        PreflightDecision::ReconciledExisting
    } else if preview_shape_valid
        && !preview_items_exist
        && !manifest_valid
        && doctor.is_some_and(|value| doctor_proves_missing(value, provider))
    {
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
            termination: RunTermination::TimeoutCancelled,
        };
    };
    if *remaining_output < 3 {
        return RunCapture {
            code: None,
            stdout: String::new(),
            stderr: "aggregate setup output budget exhausted".into(),
            termination: RunTermination::Indeterminate,
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

    let mut doctor_capture =
        run_setup_bounded(doctor_argv(target), started, &mut remaining_output).await;
    let mut doctor = if doctor_capture.code == Some(0)
        && doctor_capture.termination == RunTermination::Completed
    {
        parse_doctor(&doctor_capture.stdout).ok()
    } else {
        None
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
            Ok(manifest) if !manifest_has_unsupported(manifest.as_ref()) => manifest,
            Ok(_) => {
                receipts.push(setup_receipt(
                    job_id,
                    ordinal,
                    provider,
                    "indeterminate",
                    false,
                    json!({"error_kind":"manifest_membership_disagreement"}),
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
        let preview_capture = if force {
            None
        } else {
            Some(run_setup_bounded(preview_argv(&argv), started, &mut remaining_output).await)
        };
        let preview_validation = preview_capture.as_ref().and_then(|capture| {
            if capture.code == Some(0) && capture.termination == RunTermination::Completed {
                validate_install_output(&capture.stdout, provider, target, true).ok()
            } else {
                None
            }
        });
        let preview_shape_valid = preview_validation.is_some();
        let preview_items_exist = preview_validation.as_ref().is_some_and(|value| {
            value["items"].as_array().is_some_and(|items| {
                items.iter().all(|item| {
                    item.as_str()
                        .is_some_and(|relative| target.join(relative).exists())
                })
            })
        });
        let decision = decide_preflight(
            manifest.as_ref(),
            doctor.as_ref(),
            provider,
            preview_shape_valid,
            preview_items_exist,
        );
        if !force && decision == PreflightDecision::ReconciledExisting {
            let preview = preview_capture.expect("checked preview");
            receipts.push(setup_receipt(
                job_id,
                ordinal,
                provider,
                "reconciled_existing",
                false,
                json!({
                    "producer_stdout": preview.stdout,
                    "producer_stdout_digest": digest(&preview.stdout),
                    "doctor_digest": digest(&doctor_capture.stdout),
                }),
                "confirmed_current",
            ));
            continue;
        }
        if !force && decision != PreflightDecision::InstallMissing {
            receipts.push(setup_receipt(
                job_id,
                ordinal,
                provider,
                "indeterminate",
                false,
                json!({"error":"preflight evidence disagrees"}),
                "unresolved",
            ));
            stop = true;
            continue;
        }

        let capture = run_setup_bounded(argv, started, &mut remaining_output).await;
        let state = match capture.termination {
            RunTermination::TimeoutCancelled => "timeout_cancelled",
            RunTermination::Indeterminate => "indeterminate",
            RunTermination::Completed if capture.code != Some(0) => "failed",
            RunTermination::Completed => "succeeded",
        };
        let install = if state == "succeeded" {
            validate_install_output(&capture.stdout, provider, target, false)
        } else {
            Err(capture.stderr.clone())
        };
        doctor_capture =
            run_setup_bounded(doctor_argv(target), started, &mut remaining_output).await;
        doctor = if doctor_capture.code == Some(0)
            && doctor_capture.termination == RunTermination::Completed
        {
            parse_doctor(&doctor_capture.stdout).ok()
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
            && doctor
                .as_ref()
                .is_some_and(|value| doctor_proves(value, provider));
        let final_state = if confirmed {
            "succeeded"
        } else if matches!(state, "timeout_cancelled") {
            "timeout_cancelled"
        } else if state == "failed"
            && !post_manifest_valid
            && doctor
                .as_ref()
                .is_some_and(|value| doctor_proves_missing(value, provider))
        {
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
                "producer_stdout": capture.stdout,
                "producer_stdout_digest": digest(&capture.stdout),
                "stderr": capture.stderr,
                "doctor_digest": digest(&doctor_capture.stdout),
                "validation": install.err(),
            }),
            if confirmed {
                "confirmed_current"
            } else {
                "unresolved"
            },
        ));
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
    let (final_doctor_current, final_doctor_failure_state, final_doctor_digest) =
        if candidate_complete {
            let final_doctor =
                run_setup_bounded(doctor_argv(target), started, &mut remaining_output).await;
            let current = final_doctor.code == Some(0)
                && final_doctor.termination == RunTermination::Completed
                && parse_doctor(&final_doctor.stdout).is_ok_and(|value| {
                    CURRENT_SETUP_PROVIDERS
                        .iter()
                        .copied()
                        .all(|provider| doctor_proves(&value, provider))
                });
            let failure_state = if final_doctor.termination == RunTermination::TimeoutCancelled {
                "timeout_cancelled"
            } else {
                "indeterminate"
            };
            (current, failure_state, Some(digest(&final_doctor.stdout)))
        } else {
            (false, "indeterminate", None)
        };
    if let Some(final_digest) = final_doctor_digest {
        for receipt in &mut receipts {
            receipt["reconciliation"]["final_doctor_digest"] = json!(&final_digest);
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
                receipt["reconciliation"]["status"] = json!("final_manifest_disagreement");
            }
        }
    }
    current_setup_outcome(receipts)
}
