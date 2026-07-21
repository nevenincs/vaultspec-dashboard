use super::*;
use crate::manifest::{VerifiedReceiptFacts, VerifiedReleaseSet};
use crate::paths::ACTIVE_RECEIPTS_JOURNAL_NAME;

/// The transient init sibling the journal is published from: the journal's name
/// plus `.init`. It stays a literal because the `OsStr` call sites need a
/// `'static` str; the `init_name_is_the_journal_sibling` test holds it to
/// `ACTIVE_RECEIPTS_JOURNAL_NAME` so the pair cannot drift apart.
pub(super) const ACTIVE_RECEIPT_INIT_NAME: &str = "active-receipts.v1.init";
#[cfg(windows)]
const MAX_RETAINED_INSTALL_DIAGNOSTICS: usize = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ActiveReceiptPublishFailureKind {
    Refused,
    RecoveryRequired,
    Indeterminate,
}

pub(super) struct ActiveReceiptPublishAttemptError {
    kind: ActiveReceiptPublishFailureKind,
    pub(super) message: String,
    journal_error: Option<Box<ActiveReceiptJournalError>>,
    #[cfg(windows)]
    install_failure: Option<Box<crate::generation::AppHomeInstallFailure>>,
    #[cfg(windows)]
    install_diagnostics: Vec<crate::generation::AppHomeInstallDiagnostic>,
}

/// Fail-closed publication error which retains the exact verified generation
/// borrow. On Windows it also retains every still-useful S171 file authority.
pub(crate) struct ActiveReceiptPublishError<'generation, 'product, 'lock> {
    verified: Option<VerifiedReleaseSet<'generation, 'product, 'lock>>,
    failure: ActiveReceiptPublishAttemptError,
}

impl std::fmt::Debug for ActiveReceiptPublishError<'_, '_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ActiveReceiptPublishError")
            .field("kind", &self.failure.kind)
            .field("message", &self.failure.message)
            .finish_non_exhaustive()
    }
}

impl std::fmt::Display for ActiveReceiptPublishError<'_, '_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "active receipt publication {:?}: {}",
            self.failure.kind, self.failure.message
        )
    }
}

impl<'generation, 'product, 'lock> ActiveReceiptPublishError<'generation, 'product, 'lock> {
    #[must_use]
    pub(crate) fn kind(&self) -> ActiveReceiptPublishFailureKind {
        self.failure.kind
    }

    pub(crate) fn activation_authority(
        &self,
    ) -> Option<(&ProductPaths, &crate::locking::InstallLockGuard)> {
        self.verified
            .as_ref()
            .map(|verified| (verified.activation_paths(), verified.activation_guard()))
    }

    #[must_use]
    pub(crate) fn retains_journal_authority(&self) -> bool {
        matches!(
            self.failure.journal_error.as_deref(),
            Some(ActiveReceiptJournalError::Mutation { .. })
        )
    }

    #[cfg(windows)]
    #[must_use]
    pub(crate) fn retains_install_authority(&self) -> bool {
        self.failure.install_failure.is_some()
    }

    #[cfg(windows)]
    #[must_use]
    pub(crate) fn has_install_diagnostic(&self) -> bool {
        !self.failure.install_diagnostics.is_empty()
    }

    #[cfg(windows)]
    #[must_use]
    pub(crate) fn install_diagnostics(&self) -> &[crate::generation::AppHomeInstallDiagnostic] {
        &self.failure.install_diagnostics
    }

    /// Resume publication with the same verified release set. Windows first
    /// retries exact app-home authority recovery when S171 left transition
    /// authority; Unix resumes directly from the durable journal cutpoint.
    pub(crate) fn retry(
        mut self: Box<Self>,
    ) -> Result<VerifiedReleaseSet<'generation, 'product, 'lock>, Box<Self>> {
        let Some(verified) = self.verified.take() else {
            self.failure.message = "verified release-set authority is missing".to_string();
            return Err(self);
        };
        #[cfg(windows)]
        let mut verified = verified;
        let mut retained_journal_error = match self.failure.journal_error.take().map(|error| *error)
        {
            Some(ActiveReceiptJournalError::Mutation {
                stage,
                source,
                journal,
            }) => {
                if let Err(settle) = journal.file.sync_all().and_then(|()| journal.validate()) {
                    self.failure.kind = ActiveReceiptPublishFailureKind::Indeterminate;
                    self.failure.message = format!(
                        "retained journal from {stage} could not settle before retry; original error: {source}; settle error: {settle}"
                    );
                    self.failure.journal_error =
                        Some(Box::new(ActiveReceiptJournalError::Mutation {
                            stage: "retry settle/validation",
                            source: settle,
                            journal,
                        }));
                    self.verified = Some(verified);
                    return Err(self);
                }
                drop(journal);
                Some(Box::new(ActiveReceiptJournalError::Io { stage, source }))
            }
            other => other.map(Box::new),
        };
        #[cfg(windows)]
        let destination_collision = self
            .failure
            .install_failure
            .as_ref()
            .is_some_and(|failure| failure.pre_move_destination_snapshot.is_some());
        #[cfg(windows)]
        {
            if self.failure.kind == ActiveReceiptPublishFailureKind::Indeterminate
                && let Err(error) = verified.recover_activation_app_home()
            {
                self.failure.kind = ActiveReceiptPublishFailureKind::Indeterminate;
                self.failure.message = format!("app-home authority recovery failed: {error}");
                self.failure.journal_error = retained_journal_error.take();
                self.verified = Some(verified);
                return Err(self);
            }
        }
        #[cfg(windows)]
        let released_install_diagnostic = self
            .failure
            .install_failure
            .take()
            .map(|failure| failure.release_file_leases());
        #[cfg(windows)]
        if let Some(diagnostic) = released_install_diagnostic {
            self.failure.install_diagnostics.push(diagnostic);
        }
        #[cfg(windows)]
        if destination_collision {
            let evidence = self
                .failure
                .install_diagnostics
                .iter()
                .map(crate::generation::AppHomeInstallDiagnostic::summary)
                .collect::<Vec<_>>()
                .join("; ");
            self.failure.kind = ActiveReceiptPublishFailureKind::Indeterminate;
            self.failure.message = format!(
                "first-install destination collision requires external adjudication; {evidence}"
            );
            self.failure.journal_error = retained_journal_error.take();
            self.verified = Some(verified);
            return Err(self);
        }
        #[cfg(windows)]
        if self.failure.install_diagnostics.len() >= MAX_RETAINED_INSTALL_DIAGNOSTICS {
            let summaries = self
                .failure
                .install_diagnostics
                .iter()
                .map(crate::generation::AppHomeInstallDiagnostic::summary)
                .collect::<Vec<_>>()
                .join("; ");
            self.failure.kind = ActiveReceiptPublishFailureKind::RecoveryRequired;
            self.failure.message =
                format!("S171 retry limit reached with all retained diagnostics: {summaries}");
            self.failure.journal_error = retained_journal_error.take();
            self.verified = Some(verified);
            return Err(self);
        }
        #[cfg(windows)]
        let retained_install_summaries = self
            .failure
            .install_diagnostics
            .iter()
            .map(crate::generation::AppHomeInstallDiagnostic::summary)
            .collect::<Vec<_>>()
            .join("; ");
        #[cfg(windows)]
        let mut retained_install_diagnostics =
            std::mem::take(&mut self.failure.install_diagnostics);
        match publish_active_receipt(verified) {
            Ok(verified) => Ok(verified),
            Err(mut error) => {
                if error.failure.journal_error.is_none() {
                    error.failure.journal_error = retained_journal_error.take();
                }
                #[cfg(windows)]
                if !retained_install_summaries.is_empty() {
                    error.failure.message =
                        format!("{retained_install_summaries}; {}", error.failure.message);
                }
                #[cfg(windows)]
                {
                    retained_install_diagnostics.append(&mut error.failure.install_diagnostics);
                    error.failure.install_diagnostics = retained_install_diagnostics;
                }
                Err(error)
            }
        }
    }
}

fn publish_attempt_error(
    kind: ActiveReceiptPublishFailureKind,
    message: impl Into<String>,
) -> ActiveReceiptPublishAttemptError {
    ActiveReceiptPublishAttemptError {
        kind,
        message: message.into(),
        journal_error: None,
        #[cfg(windows)]
        install_failure: None,
        #[cfg(windows)]
        install_diagnostics: Vec::new(),
    }
}

fn publish_journal_attempt_error(
    kind: ActiveReceiptPublishFailureKind,
    error: ActiveReceiptJournalError,
) -> ActiveReceiptPublishAttemptError {
    ActiveReceiptPublishAttemptError {
        kind,
        message: error.to_string(),
        journal_error: Some(Box::new(error)),
        #[cfg(windows)]
        install_failure: None,
        #[cfg(windows)]
        install_diagnostics: Vec::new(),
    }
}

pub(super) fn active_wire_from_facts(facts: &VerifiedReceiptFacts) -> ActiveReceiptWire {
    ActiveReceiptWire {
        schema_version: ACTIVE_RECEIPT_SCHEMA_VERSION.to_string(),
        dashboard_version: facts.dashboard_version().to_string(),
        dashboard_commit: facts.dashboard_commit().to_string(),
        dashboard_digest: facts.dashboard_digest().to_string(),
        release_set_identity: facts.release_set_identity().to_string(),
        release_set_member_digest: facts.release_set_member_digest().to_string(),
        component_lock_digest: facts.component_lock_digest().to_string(),
        external_five_member_cohort_digest: facts.external_five_member_cohort_digest().to_string(),
        target: facts.target(),
        a2a_identity: ActiveReleaseIdentityWire {
            name: facts.a2a_identity().name.clone(),
            version: facts.a2a_identity().version.clone(),
        },
        active_generation: facts.active_generation().to_string(),
        channel: facts.channel(),
        bootstrap_created_ownership: facts.bootstrap_created_ownership(),
        prior_seat: facts.prior_seat().map(|prior| ActivePriorSeatWire {
            generation: prior.generation.clone(),
            dashboard_version: prior.dashboard_version.clone(),
            pid: prior.pid,
        }),
        consistency_generation: facts.consistency_generation(),
        created_ms: facts.created_ms(),
    }
}

fn revalidate_publication_authority(
    verified: &VerifiedReleaseSet<'_, '_, '_>,
) -> Result<(), ActiveReceiptJournalError> {
    verified
        .activation_guard()
        .verify_for_product(verified.activation_paths())
        .map_err(ActiveReceiptJournalError::LockAuthority)?;
    verified.revalidate_for_activation().map_err(|error| {
        ActiveReceiptJournalError::Invalid(format!(
            "verified release-set activation revalidation failed: {error}"
        ))
    })
}

fn receipt_matches_wire(receipt: &ActiveReceipt, wire: &ActiveReceiptWire) -> bool {
    wire.clone()
        .into_active(receipt.sequence())
        .is_ok_and(|expected| expected == *receipt)
}

fn logical_proofs(
    bytes: &[u8],
    identity: JournalIdentity,
) -> [Option<ProofRecord>; PROOF_LOGICAL_REPLICAS] {
    std::array::from_fn(|index| {
        let start = proof_subrecord_range(index, 0).start;
        let end = proof_subrecord_range(index, PROOF_SUBRECORDS - 1).end;
        resolve_logical_proof(&bytes[start..end], identity)
    })
}

fn proof_destination_subrecord(
    bytes: &[u8],
    identity: JournalIdentity,
    logical_index: usize,
) -> Result<usize, ActiveReceiptJournalError> {
    let first_range = proof_subrecord_range(logical_index, 0);
    let second_range = proof_subrecord_range(logical_index, 1);
    let first = parse_proof(&bytes[first_range], identity);
    let second = parse_proof(&bytes[second_range], identity);
    match (first, second) {
        (None, Some(_)) => Ok(0),
        (Some(_), None) => Ok(1),
        (None, None) => Ok(0),
        (Some(first), Some(second)) if first.transition_sequence < second.transition_sequence => {
            Ok(0)
        }
        (Some(first), Some(second)) if second.transition_sequence < first.transition_sequence => {
            Ok(1)
        }
        (Some(first), Some(second)) if first.raw == second.raw => {
            Err(ActiveReceiptJournalError::Ambiguous(
                "logical proof has no unique older or empty subrecord".to_string(),
            ))
        }
        (Some(_), Some(_)) => Err(ActiveReceiptJournalError::Ambiguous(
            "logical proof has equal-sequence divergent subrecords".to_string(),
        )),
    }
}

fn normalize_proof_replicas(
    verified: &VerifiedReleaseSet<'_, '_, '_>,
    path: &Path,
    mut handle: JournalHandle,
    mut bytes: Vec<u8>,
    target: &ProofRecord,
) -> Result<(JournalHandle, Vec<u8>), ActiveReceiptJournalError> {
    for logical_index in 0..PROOF_LOGICAL_REPLICAS {
        let current = logical_proofs(&bytes, handle.identity);
        if current[logical_index]
            .as_ref()
            .is_some_and(|record| record.raw == target.raw)
        {
            continue;
        }
        if let Err(error) = revalidate_publication_authority(verified) {
            return Err(retained_mutation_error(
                "proof normalization authority revalidation",
                error,
                handle,
            ));
        }
        let subrecord = match proof_destination_subrecord(&bytes, handle.identity, logical_index) {
            Ok(subrecord) => subrecord,
            Err(error) => {
                return Err(retained_mutation_error(
                    "proof destination selection",
                    error,
                    handle,
                ));
            }
        };
        let range = proof_subrecord_range(logical_index, subrecord);
        (handle, bytes) = write_journal_range_and_reopen(path, handle, bytes, range, &target.raw)?;
        let current = logical_proofs(&bytes, handle.identity);
        if current[logical_index]
            .as_ref()
            .is_none_or(|record| record.raw != target.raw)
        {
            return Err(retained_mutation_error(
                "proof normalization semantic comparison",
                "logical proof did not resolve to the exact normalized record",
                handle,
            ));
        }
    }
    Ok((handle, bytes))
}

fn run_bound_transaction(
    verified: &VerifiedReleaseSet<'_, '_, '_>,
    path: &Path,
    mut handle: JournalHandle,
    mut bytes: Vec<u8>,
    active: ProofRecord,
    intended_slot: [u8; RECEIPT_SLOT_BYTES],
) -> Result<ActiveReceipt, ActiveReceiptJournalError> {
    let ProofBinding::Transaction(binding) = &active.binding else {
        return Err(ActiveReceiptJournalError::Invalid(
            "publication requires an active transaction proof".to_string(),
        ));
    };
    if active.state != ProofState::Active || active.transition_sequence.is_multiple_of(2) {
        return Err(ActiveReceiptJournalError::Invalid(
            "publication active proof has invalid state or parity".to_string(),
        ));
    }
    let identity = handle.identity;
    (handle, bytes) = normalize_proof_replicas(verified, path, handle, bytes, &active)?;
    let Some(retired_sequence) = active.transition_sequence.checked_add(1) else {
        return Err(retained_mutation_error(
            "proof retirement sequence",
            "proof transition sequence overflow",
            handle,
        ));
    };
    let retired_raw = encode_proof_record(
        identity,
        ProofState::Retired,
        retired_sequence,
        &active.binding,
    );
    let Some(retired) = parse_proof(&retired_raw, identity) else {
        return Err(retained_mutation_error(
            "proof retirement encoding",
            "canonical retired proof did not parse",
            handle,
        ));
    };
    for logical_index in 0..PROOF_LOGICAL_REPLICAS {
        if let Err(error) = proof_destination_subrecord(&bytes, identity, logical_index) {
            return Err(retained_mutation_error(
                "proof retirement destination preflight",
                error,
                handle,
            ));
        }
    }
    let slots = std::array::from_fn(|index| parse_slot(&bytes[receipt_slot_range(index)]));
    let observed = match validate_bound_transaction(binding, &slots) {
        Ok(observed) => observed,
        Err(error) => {
            return Err(retained_mutation_error(
                "active proof transaction validation",
                error,
                handle,
            ));
        }
    };
    if observed.target != TargetObservation::Intended {
        if let Err(error) = revalidate_publication_authority(verified) {
            return Err(retained_mutation_error(
                "target write authority revalidation",
                error,
                handle,
            ));
        }
        (handle, bytes) = write_journal_range_and_reopen(
            path,
            handle,
            bytes,
            receipt_slot_range(binding.target_slot),
            &intended_slot,
        )?;
    }
    let slots = std::array::from_fn(|index| parse_slot(&bytes[receipt_slot_range(index)]));
    let target_observation = match validate_bound_transaction(binding, &slots) {
        Ok(observation) => observation.target,
        Err(error) => {
            return Err(retained_mutation_error(
                "target write transaction validation",
                error,
                handle,
            ));
        }
    };
    if target_observation != TargetObservation::Intended {
        return Err(retained_mutation_error(
            "target write semantic comparison",
            "target did not revalidate as the exact intended envelope",
            handle,
        ));
    }
    (handle, bytes) = normalize_proof_replicas(verified, path, handle, bytes, &retired)?;
    if let Err(source) = handle.validate() {
        return Err(retained_mutation_error(
            "final publication validation",
            source,
            handle,
        ));
    }
    let resolved = match resolve_journal(&bytes, identity) {
        Ok(resolved) => resolved,
        Err(error) => {
            return Err(retained_mutation_error(
                "final publication resolution",
                error,
                handle,
            ));
        }
    };
    match resolved {
        ActiveReceiptReadState::Settled(receipt)
            if receipt.sequence() == binding.next_sequence
                && sha256(&bytes[receipt_slot_range(binding.target_slot)])
                    == binding.intended_envelope_digest =>
        {
            Ok(receipt)
        }
        _ => Err(retained_mutation_error(
            "final publication semantic comparison",
            "publication did not settle the exact intended receipt",
            handle,
        )),
    }
}

fn publish_existing_journal(
    verified: &VerifiedReleaseSet<'_, '_, '_>,
    path: &Path,
    handle: JournalHandle,
    bytes: Vec<u8>,
    wire: &ActiveReceiptWire,
) -> Result<ActiveReceipt, ActiveReceiptJournalError> {
    let identity = handle.identity;
    let state = resolve_journal(&bytes, identity)?;
    if let ActiveReceiptReadState::Settled(receipt) = &state
        && receipt_matches_wire(receipt, wire)
    {
        return Ok(receipt.duplicate_for_resolution());
    }
    let logical = logical_proofs(&bytes, identity);
    match state {
        ActiveReceiptReadState::Absent => Err(ActiveReceiptJournalError::Ambiguous(
            "a physically present empty journal cannot be first-install authority".to_string(),
        )),
        ActiveReceiptReadState::Settled(prior) => {
            let [Some(first), Some(second), Some(third)] = &logical else {
                return Err(ActiveReceiptJournalError::Ambiguous(
                    "settled journal lacks three proof replicas".to_string(),
                ));
            };
            if first.raw != second.raw
                || first.raw != third.raw
                || first.state != ProofState::Retired
            {
                return Err(ActiveReceiptJournalError::Ambiguous(
                    "settled journal proof replicas are not unanimous retired state".to_string(),
                ));
            }
            let next_sequence = prior.sequence().checked_add(1).ok_or_else(|| {
                ActiveReceiptJournalError::Ambiguous("receipt sequence overflow".to_string())
            })?;
            if next_sequence == u64::MAX {
                return Err(ActiveReceiptJournalError::Ambiguous(
                    "receipt sequence reached its fixed-grammar maximum".to_string(),
                ));
            }
            let intended = encode_receipt_slot(wire, next_sequence)
                .map_err(ActiveReceiptJournalError::Invalid)?;
            let prior_slot = match &first.binding {
                ProofBinding::InitialReceipt { slot, .. } => *slot,
                ProofBinding::Transaction(binding) => binding.target_slot,
                ProofBinding::EmptyJournal => {
                    return Err(ActiveReceiptJournalError::Ambiguous(
                        "empty retired proof cannot select a steady-state prior".to_string(),
                    ));
                }
            };
            let target_slot = 1 - prior_slot;
            let preimage = match parse_slot(&bytes[receipt_slot_range(target_slot)]) {
                SlotState::Empty => TargetPreimage::Empty,
                SlotState::Valid(slot) => TargetPreimage::Complete(slot.raw_digest),
                SlotState::Invalid(_) => {
                    return Err(ActiveReceiptJournalError::Ambiguous(
                        "settled journal has a partial-invalid inactive slot".to_string(),
                    ));
                }
            };
            let prior_raw = &bytes[receipt_slot_range(prior_slot)];
            let binding = ProofBinding::Transaction(TransactionBinding {
                prior_slot,
                target_slot,
                prior_sequence: prior.sequence(),
                next_sequence,
                prior_envelope_digest: sha256(prior_raw),
                target_preimage: preimage,
                intended_envelope_digest: sha256(&intended),
            });
            let active_raw = encode_proof_record(
                identity,
                ProofState::Active,
                first.transition_sequence.checked_add(1).ok_or_else(|| {
                    ActiveReceiptJournalError::Ambiguous(
                        "proof transition sequence overflow".to_string(),
                    )
                })?,
                &binding,
            );
            let active = parse_proof(&active_raw, identity).ok_or_else(|| {
                ActiveReceiptJournalError::Invalid(
                    "canonical active proof did not parse".to_string(),
                )
            })?;
            run_bound_transaction(verified, path, handle, bytes, active, intended)
        }
        ActiveReceiptReadState::RecoveryRequired(recovery) => {
            let forward_state = match recovery.kind() {
                ActiveReceiptRecoveryKind::ProofCreation
                | ActiveReceiptRecoveryKind::ActiveProof => ProofState::Active,
                ActiveReceiptRecoveryKind::ProofRetirement => ProofState::Retired,
            };
            let mut candidates = logical.iter().flatten().filter(|record| {
                record.state == forward_state
                    && matches!(record.binding, ProofBinding::Transaction(_))
            });
            let forward = candidates.next().ok_or_else(|| {
                ActiveReceiptJournalError::Ambiguous(
                    "recovery lacks its adjacent forward transaction record".to_string(),
                )
            })?;
            if candidates.any(|candidate| candidate.raw != forward.raw) {
                return Err(ActiveReceiptJournalError::Ambiguous(
                    "recovery has divergent forward transaction records".to_string(),
                ));
            }
            let transaction = match &forward.binding {
                ProofBinding::Transaction(binding) => binding,
                _ => {
                    return Err(ActiveReceiptJournalError::Ambiguous(
                        "recovery proof does not bind a receipt transaction".to_string(),
                    ));
                }
            };
            let intended = encode_receipt_slot(wire, transaction.next_sequence)
                .map_err(ActiveReceiptJournalError::Invalid)?;
            if sha256(&intended) != transaction.intended_envelope_digest {
                return Err(ActiveReceiptJournalError::Ambiguous(
                    "verified release set does not match the recovery intention".to_string(),
                ));
            }
            let slots = std::array::from_fn(|index| parse_slot(&bytes[receipt_slot_range(index)]));
            let observation = validate_bound_transaction(transaction, &slots)?.target;
            if forward_state == ProofState::Retired {
                if observation != TargetObservation::Intended {
                    return Err(ActiveReceiptJournalError::Ambiguous(
                        "retirement recovery lacks the exact intended target".to_string(),
                    ));
                }
                let retired = forward.clone();
                let (handle, bytes) =
                    normalize_proof_replicas(verified, path, handle, bytes, &retired)?;
                if let Err(source) = handle.validate() {
                    return Err(retained_mutation_error(
                        "recovery retirement validation",
                        source,
                        handle,
                    ));
                }
                let resolved = match resolve_journal(&bytes, identity) {
                    Ok(resolved) => resolved,
                    Err(error) => {
                        return Err(retained_mutation_error(
                            "recovery retirement resolution",
                            error,
                            handle,
                        ));
                    }
                };
                return match resolved {
                    ActiveReceiptReadState::Settled(receipt)
                        if receipt_matches_wire(&receipt, wire) =>
                    {
                        Ok(receipt)
                    }
                    _ => Err(retained_mutation_error(
                        "recovery retirement semantic comparison",
                        "retirement recovery did not settle the intended receipt",
                        handle,
                    )),
                };
            }
            run_bound_transaction(verified, path, handle, bytes, forward.clone(), intended)
        }
    }
}

fn exact_file_bytes(file: &File) -> std::io::Result<Vec<u8>> {
    let metadata = file.metadata()?;
    if !metadata.is_file() || metadata.len() != ACTIVE_RECEIPT_JOURNAL_BYTES as u64 {
        return Err(std::io::Error::other(
            "installed receipt journal has the wrong exact size",
        ));
    }
    let mut reader = file.try_clone()?;
    reader.seek(SeekFrom::Start(0))?;
    let mut bytes = vec![0_u8; ACTIVE_RECEIPT_JOURNAL_BYTES];
    reader.read_exact(&mut bytes)?;
    Ok(bytes)
}

pub(super) fn prepare_initial_journal(
    verified: &VerifiedReleaseSet<'_, '_, '_>,
    paths: &ProductPaths,
    wire: &ActiveReceiptWire,
) -> Result<(JournalIdentity, Vec<u8>), ActiveReceiptPublishAttemptError> {
    #[cfg(windows)]
    let _ = verified;
    let init_path = paths.app_home().join(ACTIVE_RECEIPT_INIT_NAME);
    let created = match std::fs::symlink_metadata(&init_path) {
        Ok(_) => false,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            #[cfg(unix)]
            let file = verified
                .create_activation_init_file(std::ffi::OsStr::new(ACTIVE_RECEIPT_INIT_NAME))
                .map_err(|error| {
                    publish_attempt_error(
                        ActiveReceiptPublishFailureKind::Refused,
                        format!("descriptor-relative initialization create failed: {error}"),
                    )
                })?;
            #[cfg(windows)]
            let file = {
                let mut options = OpenOptions::new();
                options.read(true).write(true).create_new(true);
                options.open(&init_path).map_err(|error| {
                    publish_attempt_error(
                        ActiveReceiptPublishFailureKind::Refused,
                        format!("initialization create failed: {error}"),
                    )
                })?
            };
            file.set_len(ACTIVE_RECEIPT_JOURNAL_BYTES as u64)
                .and_then(|()| file.sync_all())
                .map_err(|error| {
                    publish_attempt_error(
                        ActiveReceiptPublishFailureKind::RecoveryRequired,
                        format!("initialization sizing/sync failed: {error}"),
                    )
                })?;
            #[cfg(windows)]
            crate::credentials::restrict_to_owner(&init_path).map_err(|error| {
                publish_attempt_error(
                    ActiveReceiptPublishFailureKind::RecoveryRequired,
                    format!("initialization access restriction failed: {error}"),
                )
            })?;
            true
        }
        Err(error) => {
            return Err(publish_attempt_error(
                ActiveReceiptPublishFailureKind::Refused,
                format!("initialization inspection failed: {error}"),
            ));
        }
    };
    let (handle, bytes) = reopen_journal_image(&init_path, true, None).map_err(|error| {
        publish_journal_attempt_error(ActiveReceiptPublishFailureKind::RecoveryRequired, error)
    })?;
    let identity = handle.identity;
    let slot = encode_receipt_slot(wire, 1)
        .map_err(|error| publish_attempt_error(ActiveReceiptPublishFailureKind::Refused, error))?;
    let binding = ProofBinding::InitialReceipt {
        slot: 0,
        sequence: 1,
        envelope_digest: sha256(&slot),
    };
    let retired = encode_proof_record(identity, ProofState::Retired, 0, &binding);
    let proofs = std::array::from_fn(|_| [Some(retired), None]);
    let expected = encode_journal_image(&[Some(slot), None], &proofs);
    let (handle, actual) = if created {
        write_journal_range_and_reopen(
            &init_path,
            handle,
            bytes,
            0..ACTIVE_RECEIPT_JOURNAL_BYTES,
            &expected,
        )
        .map_err(|error| {
            publish_journal_attempt_error(ActiveReceiptPublishFailureKind::RecoveryRequired, error)
        })?
    } else {
        (handle, bytes)
    };
    if actual != expected {
        return Err(publish_attempt_error(
            ActiveReceiptPublishFailureKind::RecoveryRequired,
            "fixed initialization residue does not match this verified release set",
        ));
    }
    if let Err(source) = handle.file.sync_all() {
        return Err(publish_journal_attempt_error(
            ActiveReceiptPublishFailureKind::RecoveryRequired,
            ActiveReceiptJournalError::Mutation {
                stage: "initialization synchronization",
                source,
                journal: handle,
            },
        ));
    }
    if let Err(source) = handle.validate() {
        return Err(publish_journal_attempt_error(
            ActiveReceiptPublishFailureKind::RecoveryRequired,
            ActiveReceiptJournalError::Mutation {
                stage: "initialization post-sync validation",
                source,
                journal: handle,
            },
        ));
    }
    drop(handle);
    let (_, reread) = reopen_journal_image(&init_path, false, Some(identity)).map_err(|error| {
        publish_journal_attempt_error(ActiveReceiptPublishFailureKind::RecoveryRequired, error)
    })?;
    if reread != expected {
        return Err(publish_attempt_error(
            ActiveReceiptPublishFailureKind::RecoveryRequired,
            "post-sync initialization reread differs from the intended image",
        ));
    }
    Ok((identity, expected))
}

fn publish_active_receipt_attempt_unfinalized(
    verified: &mut VerifiedReleaseSet<'_, '_, '_>,
) -> Result<ActiveReceipt, ActiveReceiptPublishAttemptError> {
    let paths = verified.activation_paths().clone();
    verified
        .activation_guard()
        .verify_for_product(&paths)
        .map_err(|error| {
            publish_attempt_error(ActiveReceiptPublishFailureKind::Refused, error.to_string())
        })?;
    let wire = active_wire_from_facts(verified.receipt_facts());
    let journal_path = paths.active_receipts_journal_path();
    match std::fs::symlink_metadata(&journal_path) {
        Ok(_) => {
            let (handle, bytes) =
                synchronize_close_reopen_journal(&journal_path, true).map_err(|error| {
                    publish_journal_attempt_error(
                        ActiveReceiptPublishFailureKind::RecoveryRequired,
                        error,
                    )
                })?;
            verified
                .activation_guard()
                .verify_for_product(&paths)
                .map_err(|error| {
                    publish_attempt_error(
                        ActiveReceiptPublishFailureKind::Refused,
                        error.to_string(),
                    )
                })?;
            let state = resolve_journal(&bytes, handle.identity).map_err(|error| {
                publish_attempt_error(
                    ActiveReceiptPublishFailureKind::RecoveryRequired,
                    error.to_string(),
                )
            })?;
            if let ActiveReceiptReadState::Settled(receipt) = &state
                && receipt_matches_wire(receipt, &wire)
            {
                verified.revalidate_for_activation().map_err(|error| {
                    publish_attempt_error(
                        ActiveReceiptPublishFailureKind::Refused,
                        error.to_string(),
                    )
                })?;
                return Ok(receipt.duplicate_for_resolution());
            }
            verified.revalidate_for_activation().map_err(|error| {
                publish_attempt_error(ActiveReceiptPublishFailureKind::Refused, error.to_string())
            })?;
            publish_existing_journal(verified, &journal_path, handle, bytes, &wire).map_err(
                |error| {
                    publish_journal_attempt_error(
                        ActiveReceiptPublishFailureKind::RecoveryRequired,
                        error,
                    )
                },
            )
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            verified.revalidate_for_activation().map_err(|error| {
                publish_attempt_error(ActiveReceiptPublishFailureKind::Refused, error.to_string())
            })?;
            let (identity, expected) = prepare_initial_journal(verified, &paths, &wire)?;
            verified.revalidate_for_activation().map_err(|error| {
                publish_attempt_error(ActiveReceiptPublishFailureKind::Refused, error.to_string())
            })?;
            verified
                .activation_guard()
                .verify_for_product(&paths)
                .map_err(|error| {
                    publish_attempt_error(
                        ActiveReceiptPublishFailureKind::Refused,
                        error.to_string(),
                    )
                })?;
            #[cfg(windows)]
            let mut install_diagnostic = None;
            #[cfg(unix)]
            {
                verified
                    .install_activation_init_file(
                        std::ffi::OsStr::new(ACTIVE_RECEIPT_INIT_NAME),
                        std::ffi::OsStr::new(ACTIVE_RECEIPTS_JOURNAL_NAME),
                    )
                    .map_err(|error| {
                        publish_attempt_error(
                            ActiveReceiptPublishFailureKind::RecoveryRequired,
                            format!("descriptor-relative initialization install failed: {error}"),
                        )
                    })?;
                verified
                    .synchronize_activation_app_home()
                    .map_err(|error| {
                        publish_attempt_error(
                            ActiveReceiptPublishFailureKind::RecoveryRequired,
                            format!("app-home synchronization failed: {error}"),
                        )
                    })?;
            }
            #[cfg(windows)]
            {
                use crate::generation::AppHomeInstallOutcome;
                match verified.install_synchronized_activation_file(
                    std::ffi::OsStr::new(ACTIVE_RECEIPT_INIT_NAME),
                    std::ffi::OsStr::new(ACTIVE_RECEIPTS_JOURNAL_NAME),
                ) {
                    AppHomeInstallOutcome::Installed(installed) => {
                        let actual = exact_file_bytes(installed.file()).map_err(|error| {
                            publish_attempt_error(
                                ActiveReceiptPublishFailureKind::Indeterminate,
                                format!("strict installed-handle reread failed: {error}"),
                            )
                        })?;
                        if actual != expected {
                            return Err(publish_attempt_error(
                                ActiveReceiptPublishFailureKind::Indeterminate,
                                "strict installed-handle bytes differ from the intended image",
                            ));
                        }
                    }
                    AppHomeInstallOutcome::Reconcile(failure) => {
                        let exact_installed = failure
                            .installed_destination_authority
                            .as_ref()
                            .and_then(|authority| exact_file_bytes(authority.file()).ok())
                            .is_some_and(|actual| actual == expected);
                        if !exact_installed || failure.pre_move_destination_snapshot.is_some() {
                            return Err(ActiveReceiptPublishAttemptError {
                                kind: ActiveReceiptPublishFailureKind::RecoveryRequired,
                                message: format!(
                                    "S171 {:?}/{:?} requires semantic reconciliation: {}; {}",
                                    failure.stage,
                                    failure.outcome,
                                    failure.error,
                                    failure.evidence_summary()
                                ),
                                journal_error: None,
                                install_failure: Some(Box::new(failure)),
                                install_diagnostics: Vec::new(),
                            });
                        }
                        install_diagnostic = Some(failure.release_file_leases());
                    }
                    AppHomeInstallOutcome::Indeterminate(failure) => {
                        return Err(ActiveReceiptPublishAttemptError {
                            kind: ActiveReceiptPublishFailureKind::Indeterminate,
                            message: format!(
                                "S171 {:?}/{:?} retained transition authority: {}; {}",
                                failure.stage,
                                failure.outcome,
                                failure.error,
                                failure.evidence_summary()
                            ),
                            journal_error: None,
                            install_failure: Some(Box::new(failure)),
                            install_diagnostics: Vec::new(),
                        });
                    }
                }
            }
            let common_result = (|| {
                let (handle, actual) = reopen_journal_image(&journal_path, false, Some(identity))
                    .map_err(|error| {
                    publish_journal_attempt_error(
                        ActiveReceiptPublishFailureKind::RecoveryRequired,
                        error,
                    )
                })?;
                if actual != expected {
                    return Err(publish_attempt_error(
                        ActiveReceiptPublishFailureKind::RecoveryRequired,
                        "installed journal differs from the exact intended image",
                    ));
                }
                handle.validate().map_err(|error| {
                    publish_attempt_error(
                        ActiveReceiptPublishFailureKind::RecoveryRequired,
                        error.to_string(),
                    )
                })?;
                match resolve_journal(&actual, identity).map_err(|error| {
                    publish_journal_attempt_error(
                        ActiveReceiptPublishFailureKind::RecoveryRequired,
                        error,
                    )
                })? {
                    ActiveReceiptReadState::Settled(receipt)
                        if receipt_matches_wire(&receipt, &wire) =>
                    {
                        Ok(receipt)
                    }
                    _ => Err(publish_attempt_error(
                        ActiveReceiptPublishFailureKind::RecoveryRequired,
                        "installed journal did not select the exact intended receipt",
                    )),
                }
            })();
            #[cfg(windows)]
            if let Err(mut error) = common_result {
                if let Some(diagnostic) = install_diagnostic {
                    error.message = format!("{}; {}", diagnostic.summary(), error.message);
                    error.install_diagnostics.push(diagnostic);
                }
                return Err(error);
            }
            #[cfg(windows)]
            return common_result;
            #[cfg(unix)]
            common_result
        }
        Err(error) => Err(publish_attempt_error(
            ActiveReceiptPublishFailureKind::Refused,
            format!("journal path inspection failed: {error}"),
        )),
    }
}

fn publish_active_receipt_attempt(
    verified: &mut VerifiedReleaseSet<'_, '_, '_>,
) -> Result<(), ActiveReceiptPublishAttemptError> {
    let _ = publish_active_receipt_attempt_unfinalized(verified)?;
    let paths = verified.activation_paths().clone();
    let wire = active_wire_from_facts(verified.receipt_facts());
    let read =
        read_active_receipt_journal(&paths, verified.activation_guard()).map_err(|error| {
            publish_attempt_error(
                ActiveReceiptPublishFailureKind::RecoveryRequired,
                format!("final guarded journal reread failed: {error}"),
            )
        })?;
    let settled_matches = match read.state().map_err(|error| {
        publish_attempt_error(
            ActiveReceiptPublishFailureKind::RecoveryRequired,
            format!("final guarded journal resolution failed: {error}"),
        )
    })? {
        ActiveReceiptReadState::Settled(receipt) => receipt_matches_wire(receipt, &wire),
        _ => false,
    };
    if !settled_matches {
        return Err(publish_attempt_error(
            ActiveReceiptPublishFailureKind::RecoveryRequired,
            "final guarded reread did not settle the exact intended receipt",
        ));
    }
    drop(read);
    verified
        .activation_guard()
        .verify_for_product(&paths)
        .map_err(|error| {
            publish_attempt_error(
                ActiveReceiptPublishFailureKind::Indeterminate,
                format!("settled receipt final guard validation failed: {error}"),
            )
        })?;
    verified.revalidate_for_activation().map_err(|error| {
        publish_attempt_error(
            ActiveReceiptPublishFailureKind::Indeterminate,
            format!("settled receipt final release revalidation failed: {error}"),
        )
    })?;
    Ok(())
}

/// Construct and durably publish one active receipt from the exact hidden
/// verified-generation authority. No caller path, guard, generation, sequence,
/// or receipt payload is accepted.
pub(crate) fn publish_active_receipt<'generation, 'product, 'lock>(
    mut verified: VerifiedReleaseSet<'generation, 'product, 'lock>,
) -> Result<
    VerifiedReleaseSet<'generation, 'product, 'lock>,
    Box<ActiveReceiptPublishError<'generation, 'product, 'lock>>,
> {
    match publish_active_receipt_attempt(&mut verified) {
        Ok(()) => Ok(verified),
        Err(failure) => Err(Box::new(ActiveReceiptPublishError {
            verified: Some(verified),
            failure,
        })),
    }
}
