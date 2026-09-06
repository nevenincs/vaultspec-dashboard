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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ValidationFault {
    Malformed,
    SchemaDisagreement,
    StateDisagreement,
    IdentityDisagreement,
    TargetUnresolved,
    TargetDisagreement,
    UnsafeItemPath,
    ItemEscape,
    ItemUnresolved,
    ItemMissing,
    ProducerErrors,
}

impl ValidationFault {
    pub(super) const fn kind(self) -> &'static str {
        match self {
            Self::Malformed => "producer_malformed",
            Self::SchemaDisagreement => "producer_schema_disagreement",
            Self::StateDisagreement => "producer_state_disagreement",
            Self::IdentityDisagreement => "producer_identity_disagreement",
            Self::TargetUnresolved => "target_unresolved",
            Self::TargetDisagreement => "producer_target_disagreement",
            Self::UnsafeItemPath => "producer_item_path_unsafe",
            Self::ItemEscape => "producer_item_escape",
            Self::ItemUnresolved => "producer_item_unresolved",
            Self::ItemMissing => "producer_item_missing",
            Self::ProducerErrors => "producer_reported_errors",
        }
    }
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

pub(super) fn safe_declared_items(
    envelope: &Value,
) -> Result<Vec<(String, String)>, ValidationFault> {
    let items = envelope["data"]["items"]
        .as_array()
        .ok_or(ValidationFault::Malformed)?;
    if items.is_empty() {
        return Err(ValidationFault::Malformed);
    }
    let mut paths = Vec::with_capacity(items.len());
    for item in items {
        let pair = item
            .as_array()
            .filter(|pair| pair.len() == 2)
            .ok_or(ValidationFault::Malformed)?;
        let rel = pair[0].as_str().ok_or(ValidationFault::Malformed)?;
        let label = pair[1].as_str().ok_or(ValidationFault::Malformed)?;
        let rel_path = FsPath::new(rel);
        if rel_path.is_absolute()
            || rel_path
                .components()
                .any(|component| !matches!(component, Component::Normal(_)))
        {
            return Err(ValidationFault::UnsafeItemPath);
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
pub(super) fn declared_item_state(
    target: &FsPath,
    relative: &str,
) -> Result<bool, ValidationFault> {
    let canonical_target =
        std::fs::canonicalize(target).map_err(|_| ValidationFault::TargetUnresolved)?;
    let components: Vec<_> = FsPath::new(relative).components().collect();
    let mut candidate = target.to_path_buf();
    for (index, component) in components.iter().enumerate() {
        let Component::Normal(component) = component else {
            return Err(ValidationFault::UnsafeItemPath);
        };
        candidate.push(component);
        match std::fs::symlink_metadata(&candidate) {
            Ok(_) => {
                // Canonicalization must succeed even for the final entry. A
                // dangling symlink/junction is therefore disagreement, rather
                // than being mistaken for an absent item.
                let canonical = std::fs::canonicalize(&candidate)
                    .map_err(|_| ValidationFault::ItemUnresolved)?;
                if !path_is_within(&canonical_target, &canonical) {
                    return Err(ValidationFault::ItemEscape);
                }
                if index + 1 < components.len()
                    && !std::fs::metadata(&candidate)
                        .map_err(|_| ValidationFault::ItemUnresolved)?
                        .is_dir()
                {
                    return Err(ValidationFault::ItemUnresolved);
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(_) => return Err(ValidationFault::ItemUnresolved),
        }
    }
    Ok(true)
}

pub(super) fn validate_install_output(
    raw: &str,
    provider: Provider,
    target: &FsPath,
    preview: bool,
) -> Result<ValidatedInstall, ValidationFault> {
    let envelope: Value = serde_json::from_str(raw).map_err(|_| ValidationFault::Malformed)?;
    if envelope["schema"] != "vaultspec.install.v1" {
        return Err(ValidationFault::SchemaDisagreement);
    }
    let expected_status = if preview { "unchanged" } else { "created" };
    let expected_action = if preview { "dry_run" } else { "install" };
    if envelope["status"] != expected_status || envelope["data"]["action"] != expected_action {
        return Err(ValidationFault::StateDisagreement);
    }
    let path = envelope["data"]["path"]
        .as_str()
        .ok_or(ValidationFault::Malformed)?;
    let actual = std::fs::canonicalize(path).map_err(|_| ValidationFault::TargetUnresolved)?;
    let expected = std::fs::canonicalize(target).map_err(|_| ValidationFault::TargetUnresolved)?;
    if actual != expected {
        return Err(ValidationFault::TargetDisagreement);
    }
    if let Some(errors) = envelope["data"].get("errors") {
        match errors.as_array() {
            Some(errors) if errors.is_empty() => {}
            Some(_) => return Err(ValidationFault::ProducerErrors),
            None => return Err(ValidationFault::Malformed),
        }
    }
    if !preview {
        let providers = envelope["data"]["providers"]
            .as_array()
            .ok_or(ValidationFault::Malformed)?;
        let valid = match provider {
            Provider::Core => providers.is_empty(),
            _ => providers.len() == 1 && providers[0] == provider.as_arg(),
        };
        if !valid {
            return Err(ValidationFault::IdentityDisagreement);
        }
    }
    let items = safe_declared_items(&envelope)?;
    let states = items
        .iter()
        .map(|(relative, _)| declared_item_state(target, relative))
        .collect::<Result<Vec<_>, _>>()?;
    let all_items_exist = states.iter().all(|exists| *exists);
    if !preview && !all_items_exist {
        return Err(ValidationFault::ItemMissing);
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

fn parse_doctor(raw: &str) -> Result<Value, ValidationFault> {
    let envelope: Value = serde_json::from_str(raw).map_err(|_| ValidationFault::Malformed)?;
    if envelope["schema"] != "vaultspec.spec.doctor.v1" {
        return Err(ValidationFault::SchemaDisagreement);
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
) -> Result<Value, ValidationFault> {
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
            return Err(ValidationFault::StateDisagreement);
        }
        if expectation == DoctorExpectation::Missing
            && !doctor["data"]["providers"]
                .as_object()
                .is_some_and(serde_json::Map::is_empty)
        {
            return Err(ValidationFault::IdentityDisagreement);
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
        return Err(ValidationFault::StateDisagreement);
    }
    let entry = &doctor["data"]["providers"][provider.as_arg()];
    let manifest_entry = entry["manifest_entry"]
        .as_str()
        .ok_or(ValidationFault::Malformed)?;
    let dir_state = entry["dir_state"]
        .as_str()
        .ok_or(ValidationFault::Malformed)?;
    let config = entry["config"].as_str().ok_or(ValidationFault::Malformed)?;
    let content = entry["content"]
        .as_object()
        .ok_or(ValidationFault::Malformed)?;
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
        return Err(ValidationFault::StateDisagreement);
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
        RunTermination::AtCapacity => Some((
            "indeterminate",
            format!("{phase}_process_group_at_capacity"),
        )),
        RunTermination::Indeterminate => {
            Some(("indeterminate", format!("{phase}_runner_indeterminate")))
        }
    }
}

fn run_cause(capture: &RunCapture) -> Option<&'static str> {
    match capture.termination {
        RunTermination::TimeoutCancelled => Some("child_timeout_cancelled"),
        RunTermination::OutputCapped => Some("child_output_capped"),
        RunTermination::AtCapacity => Some("process_group_at_capacity"),
        RunTermination::Indeterminate => Some("child_runner_indeterminate"),
        RunTermination::Completed if capture.code.is_some_and(|code| code != 0) => {
            Some("child_exit_nonzero")
        }
        RunTermination::Completed if capture.code.is_none() => Some("child_exit_unobserved"),
        RunTermination::Completed => None,
    }
}

pub(super) fn validation_cause<T>(
    capture: &RunCapture,
    validation: &Result<T, ValidationFault>,
) -> Option<&'static str> {
    run_cause(capture).or_else(|| validation.as_ref().err().map(|fault| fault.kind()))
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
            Err(_) => {
                receipts.push(setup_receipt(
                    job_id,
                    ordinal,
                    provider,
                    "indeterminate",
                    false,
                    json!({"error_kind":"manifest_unreadable"}),
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
            );
            let doctor_missing = validate_doctor_output(
                &doctor_run.stdout,
                doctor_run.code,
                provider,
                DoctorExpectation::Missing,
            );
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
                validate_install_output(&preview.stdout, provider, target, true)
            } else {
                Err(ValidationFault::StateDisagreement)
            };
            let decision = decide_preflight(
                manifest.as_ref(),
                doctor_current.is_ok(),
                doctor_missing.is_ok(),
                provider,
                preview_validation.is_ok(),
                preview_validation
                    .as_ref()
                    .is_ok_and(|value| value.all_items_exist),
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
                        "preview_cause":validation_cause(&preview, &preview_validation),
                        "doctor_current_cause":validation_cause(doctor_run, &doctor_current),
                        "doctor_missing_cause":validation_cause(doctor_run, &doctor_missing),
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
            RunTermination::OutputCapped
            | RunTermination::AtCapacity
            | RunTermination::Indeterminate => "indeterminate",
            RunTermination::Completed if capture.code.is_some_and(|code| code != 0) => "failed",
            RunTermination::Completed if capture.code.is_none() => "indeterminate",
            RunTermination::Completed => "succeeded",
        };
        let install = if state == "succeeded" {
            validate_install_output(&capture.stdout, provider, target, false)
        } else {
            Err(ValidationFault::StateDisagreement)
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
        } else {
            Err(ValidationFault::StateDisagreement)
        };
        let doctor_missing = if post_doctor.termination == RunTermination::Completed {
            validate_doctor_output(
                &post_doctor.stdout,
                post_doctor.code,
                provider,
                DoctorExpectation::Missing,
            )
        } else {
            Err(ValidationFault::StateDisagreement)
        };
        let post_manifest_result = read_setup_manifest(target);
        let post_manifest = match &post_manifest_result {
            Ok(manifest) => manifest.as_ref(),
            Err(_) => None,
        };
        let post_has_unsupported = manifest_has_unsupported(post_manifest);
        let post_manifest_valid = match provider {
            Provider::Core => post_manifest.is_some_and(|m| m.version == "2.0" && m.serial > 0),
            _ => post_manifest.is_some_and(|m| m.installed.contains(provider.as_arg())),
        };
        let confirmed = install.is_ok()
            && !post_has_unsupported
            && post_manifest_valid
            && doctor_current.is_ok();
        let final_state = if confirmed {
            "succeeded"
        } else if matches!(state, "timeout_cancelled")
            || post_doctor.termination == RunTermination::TimeoutCancelled
        {
            "timeout_cancelled"
        } else if matches!(state, "indeterminate")
            || matches!(
                post_doctor.termination,
                RunTermination::OutputCapped
                    | RunTermination::AtCapacity
                    | RunTermination::Indeterminate
            )
        {
            "indeterminate"
        } else if state == "failed" && !post_manifest_valid && doctor_missing.is_ok() {
            "failed"
        } else {
            "indeterminate"
        };
        let install_projection = match &install {
            Ok(value) => Some(value.projection.clone()),
            Err(_) => None,
        };
        let doctor_projection = match (&doctor_current, &doctor_missing) {
            (Ok(value), _) | (_, Ok(value)) => Some(value.clone()),
            _ => None,
        };
        receipts.push(setup_receipt(
            job_id,
            ordinal,
            provider,
            final_state,
            true,
            json!({
                "exit_code": capture.code,
                "install": install_projection,
                "install_digest": digest(&capture.stdout),
                "stderr_digest": digest(&capture.stderr),
                "doctor": doctor_projection,
                "doctor_digest": digest(&post_doctor.stdout),
                "run_cause": run_cause(&capture),
                "post_doctor_run_cause": run_cause(&post_doctor),
                "validation_cause": install.as_ref().err().map(|fault| fault.kind()),
                "doctor_current_cause": doctor_current.as_ref().err().map(|fault| fault.kind()),
                "doctor_missing_cause": doctor_missing.as_ref().err().map(|fault| fault.kind()),
                "manifest_cause": post_manifest_result.as_ref().err().map(|_| "manifest_unreadable"),
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
    let final_manifest_result = read_setup_manifest(target);
    let final_manifest_current = match &final_manifest_result {
        Ok(manifest) => manifest_is_exact(manifest.as_ref()),
        Err(_) => false,
    };
    let (
        final_doctor_current,
        final_doctor_failure_state,
        final_doctor_digest,
        final_projections,
        final_doctor_cause,
    ) = if candidate_complete {
        let final_doctor =
            run_setup_bounded(doctor_argv(target), started, &mut remaining_output).await;
        let validation = if final_doctor.termination == RunTermination::Completed {
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
                })
                .collect::<Result<Vec<_>, _>>()
        } else {
            Err(ValidationFault::StateDisagreement)
        };
        let current = validation.is_ok();
        let validation_cause = validation.as_ref().err().map(|fault| fault.kind());
        let projections = validation.unwrap_or_default();
        let run_failure = run_cause(&final_doctor);
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
            run_failure.or(validation_cause),
        )
    } else {
        (false, "indeterminate", None, Vec::new(), None)
    };
    if let Some(final_digest) = final_doctor_digest {
        for (index, receipt) in receipts.iter_mut().enumerate() {
            receipt["reconciliation"]["final_doctor_digest"] = json!(&final_digest);
            if let Some(projection) = final_projections.get(index) {
                receipt["reconciliation"]["final_doctor"] = projection.clone();
            }
            if let Some(cause) = final_doctor_cause {
                receipt["reconciliation"]["final_doctor_cause"] = json!(cause);
            }
            if final_manifest_result.is_err() {
                receipt["reconciliation"]["final_manifest_cause"] =
                    json!("final_manifest_unreadable");
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
