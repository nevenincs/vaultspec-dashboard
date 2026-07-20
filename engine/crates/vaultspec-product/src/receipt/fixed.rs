use super::*;
use sha2::{Digest, Sha256};

pub(super) fn parse_proof(raw: &[u8], identity: JournalIdentity) -> Option<ProofRecord> {
    if raw.iter().all(|byte| *byte == 0) || &raw[..8] != PROOF_MAGIC {
        return None;
    }
    if read_u16(raw, 8) != FIXED_FORMAT_VERSION
        || read_u32(raw, 12) as usize != PROOF_BODY_END - PROOF_BODY_START
        || require_zero("proof padding", &raw[PROOF_BODY_END..]).is_err()
        || proof_record_digest(raw).as_slice() != &raw[24..56]
    {
        return None;
    }
    let state = match raw[10] {
        1 => ProofState::Active,
        2 => ProofState::Retired,
        _ => return None,
    };
    if require_zero("proof identity reserved bytes", &raw[57..64]).is_err()
        || raw[56] != identity.kind
        || read_u64(raw, 64) != identity.first
        || read_u128(raw, 72) != identity.second
        || require_zero("proof binding reserved bytes", &raw[90..96]).is_err()
    {
        return None;
    }
    let transition_sequence = read_u64(raw, 16);
    if transition_sequence == u64::MAX
        || (state == ProofState::Active && transition_sequence.is_multiple_of(2))
        || (state == ProofState::Retired && !transition_sequence.is_multiple_of(2))
    {
        return None;
    }
    let prior_slot = usize::from(raw[88]);
    let target_slot = usize::from(raw[89]);
    let prior_sequence = read_u64(raw, 96);
    let next_sequence = read_u64(raw, 104);
    let prior_envelope_digest = copy_digest(&raw[112..144]);
    let preimage_digest = copy_digest(&raw[144..176]);
    let intended_envelope_digest = copy_digest(&raw[176..208]);
    let preimage_kind = raw[11];
    let zero_binding = prior_slot == 0
        && target_slot == 0
        && prior_sequence == 0
        && next_sequence == 0
        && prior_envelope_digest == [0; 32]
        && preimage_digest == [0; 32]
        && intended_envelope_digest == [0; 32]
        && preimage_kind == 0;
    let initial_binding = state == ProofState::Retired
        && transition_sequence == 0
        && preimage_kind == 3
        && prior_slot < RECEIPT_SLOT_COUNT
        && target_slot == prior_slot
        && prior_sequence > 0
        && prior_sequence < u64::MAX
        && next_sequence == 0
        && prior_envelope_digest != [0; 32]
        && preimage_digest == [0; 32]
        && intended_envelope_digest == [0; 32];
    let binding = if zero_binding && state == ProofState::Retired && transition_sequence == 0 {
        ProofBinding::EmptyJournal
    } else if initial_binding {
        ProofBinding::InitialReceipt {
            slot: prior_slot,
            sequence: prior_sequence,
            envelope_digest: prior_envelope_digest,
        }
    } else {
        if transition_sequence == 0
            || prior_slot >= RECEIPT_SLOT_COUNT
            || target_slot >= RECEIPT_SLOT_COUNT
            || prior_slot == target_slot
            || next_sequence != prior_sequence.checked_add(1)?
            || next_sequence == u64::MAX
            || prior_envelope_digest == [0; 32]
            || intended_envelope_digest == [0; 32]
        {
            return None;
        }
        let target_preimage = match preimage_kind {
            1 if preimage_digest == [0; 32] => TargetPreimage::Empty,
            2 if preimage_digest != [0; 32] => TargetPreimage::Complete(preimage_digest),
            _ => return None,
        };
        ProofBinding::Transaction(TransactionBinding {
            prior_slot,
            target_slot,
            prior_sequence,
            next_sequence,
            prior_envelope_digest,
            target_preimage,
            intended_envelope_digest,
        })
    };
    let mut fixed = [0_u8; PROOF_SUBRECORD_BYTES];
    fixed.copy_from_slice(raw);
    if encode_proof_record(identity, state, transition_sequence, &binding) != fixed {
        return None;
    }
    Some(ProofRecord {
        raw: fixed,
        transition_sequence,
        state,
        binding,
    })
}

pub(super) fn resolve_logical_proof(raw: &[u8], identity: JournalIdentity) -> Option<ProofRecord> {
    let first = parse_proof(&raw[..PROOF_SUBRECORD_BYTES], identity);
    let second = parse_proof(&raw[PROOF_SUBRECORD_BYTES..], identity);
    match (first, second) {
        (Some(left), Some(right)) => match left.transition_sequence.cmp(&right.transition_sequence)
        {
            std::cmp::Ordering::Greater => Some(left),
            std::cmp::Ordering::Less => Some(right),
            std::cmp::Ordering::Equal if left.raw == right.raw => Some(left),
            std::cmp::Ordering::Equal => None,
        },
        (Some(record), None) | (None, Some(record)) => Some(record),
        (None, None) => None,
    }
}

pub(super) fn resolve_journal(
    bytes: &[u8],
    identity: JournalIdentity,
) -> Result<ActiveReceiptReadState, ActiveReceiptJournalError> {
    if bytes.len() != ACTIVE_RECEIPT_JOURNAL_BYTES {
        return Err(ActiveReceiptJournalError::Invalid(
            "journal buffer has the wrong fixed size".to_string(),
        ));
    }
    if &bytes[..8] != JOURNAL_MAGIC
        || read_u16(bytes, 8) != FIXED_FORMAT_VERSION
        || require_zero("journal header", &bytes[10..JOURNAL_HEADER_BYTES]).is_err()
    {
        return Err(ActiveReceiptJournalError::Invalid(
            "journal header is not the fixed v1 grammar".to_string(),
        ));
    }
    let slots = std::array::from_fn(|index| parse_slot(&bytes[receipt_slot_range(index)]));
    let logical: [Option<ProofRecord>; PROOF_LOGICAL_REPLICAS] = std::array::from_fn(|index| {
        let start = proof_subrecord_range(index, 0).start;
        let end = proof_subrecord_range(index, PROOF_SUBRECORDS - 1).end;
        resolve_logical_proof(&bytes[start..end], identity)
    });

    if let [Some(first), Some(second), Some(third)] = &logical
        && first.raw == second.raw
        && first.raw == third.raw
        && first.state == ProofState::Retired
    {
        return Ok(match retired_selected_receipt(&first.binding, &slots)? {
            Some(receipt) => ActiveReceiptReadState::Settled(receipt),
            None => ActiveReceiptReadState::Absent,
        });
    }

    let (quorum, quorum_count) = proof_quorum(&logical).ok_or_else(|| {
        ActiveReceiptJournalError::Ambiguous(
            "fewer than two logical proof replicas are byte-identical".to_string(),
        )
    })?;
    debug_assert!(quorum_count >= 2);
    match quorum.state {
        ProofState::Active => {
            let ProofBinding::Transaction(binding) = &quorum.binding else {
                return Err(ActiveReceiptJournalError::Invalid(
                    "active proof has no transaction binding".to_string(),
                ));
            };
            let transaction = validate_bound_transaction(binding, &slots)?;
            let (kind, prior) = if quorum_count == PROOF_LOGICAL_REPLICAS {
                (ActiveReceiptRecoveryKind::ActiveProof, transaction.prior)
            } else if let Some(minority) = proof_minority(quorum, &logical) {
                if minority.state != ProofState::Retired {
                    return Err(ActiveReceiptJournalError::Ambiguous(
                        "active proof quorum has a non-retired valid minority".to_string(),
                    ));
                }
                if minority.transition_sequence.checked_add(1) == Some(quorum.transition_sequence) {
                    if transaction.target != TargetObservation::Preimage {
                        return Err(ActiveReceiptJournalError::Ambiguous(
                            "split proof creation requires the exact target preimage".to_string(),
                        ));
                    }
                    let selected = retired_selected_receipt(&minority.binding, &slots)?
                        .ok_or_else(|| {
                            ActiveReceiptJournalError::Ambiguous(
                                "proof creation cannot advance an empty retired journal"
                                    .to_string(),
                            )
                        })?;
                    if selected != transaction.prior {
                        return Err(ActiveReceiptJournalError::Ambiguous(
                            "new active proof prior differs from the retired selection".to_string(),
                        ));
                    }
                    (ActiveReceiptRecoveryKind::ProofCreation, transaction.prior)
                } else if quorum.transition_sequence.checked_add(1)
                    == Some(minority.transition_sequence)
                    && minority.binding == quorum.binding
                {
                    if transaction.target != TargetObservation::Intended {
                        return Err(ActiveReceiptJournalError::Ambiguous(
                            "split proof retirement requires the exact intended target".to_string(),
                        ));
                    }
                    (
                        ActiveReceiptRecoveryKind::ProofRetirement,
                        transaction.prior,
                    )
                } else {
                    return Err(ActiveReceiptJournalError::Ambiguous(
                        "valid active/retired proof minority is not an adjacent transition"
                            .to_string(),
                    ));
                }
            } else {
                let kind = match transaction.target {
                    TargetObservation::Preimage => ActiveReceiptRecoveryKind::ProofCreation,
                    TargetObservation::Incomplete => ActiveReceiptRecoveryKind::ActiveProof,
                    TargetObservation::Intended => ActiveReceiptRecoveryKind::ProofRetirement,
                };
                (kind, transaction.prior)
            };
            Ok(ActiveReceiptReadState::RecoveryRequired(
                ActiveReceiptRecovery {
                    kind,
                    prior: Some(prior),
                },
            ))
        }
        ProofState::Retired => {
            let (kind, prior) = if let Some(minority) = proof_minority(quorum, &logical) {
                if minority.state != ProofState::Active {
                    return Err(ActiveReceiptJournalError::Ambiguous(
                        "retired proof quorum has a non-active valid minority".to_string(),
                    ));
                }
                if minority.transition_sequence.checked_add(1) == Some(quorum.transition_sequence)
                    && minority.binding == quorum.binding
                {
                    let ProofBinding::Transaction(binding) = &quorum.binding else {
                        return Err(ActiveReceiptJournalError::Ambiguous(
                            "retirement split lacks a transaction binding".to_string(),
                        ));
                    };
                    let transaction = validate_bound_transaction(binding, &slots)?;
                    if transaction.target != TargetObservation::Intended {
                        return Err(ActiveReceiptJournalError::Ambiguous(
                            "split proof retirement requires the exact intended target".to_string(),
                        ));
                    }
                    (
                        ActiveReceiptRecoveryKind::ProofRetirement,
                        Some(transaction.prior),
                    )
                } else if quorum.transition_sequence.checked_add(1)
                    == Some(minority.transition_sequence)
                {
                    let ProofBinding::Transaction(binding) = &minority.binding else {
                        return Err(ActiveReceiptJournalError::Ambiguous(
                            "new proof creation lacks a transaction binding".to_string(),
                        ));
                    };
                    let transaction = validate_bound_transaction(binding, &slots)?;
                    if transaction.target != TargetObservation::Preimage {
                        return Err(ActiveReceiptJournalError::Ambiguous(
                            "split proof creation requires the exact target preimage".to_string(),
                        ));
                    }
                    let selected =
                        retired_selected_receipt(&quorum.binding, &slots)?.ok_or_else(|| {
                            ActiveReceiptJournalError::Ambiguous(
                                "proof creation cannot advance an empty retired journal"
                                    .to_string(),
                            )
                        })?;
                    if selected != transaction.prior {
                        return Err(ActiveReceiptJournalError::Ambiguous(
                            "new active proof prior differs from the retired selection".to_string(),
                        ));
                    }
                    (
                        ActiveReceiptRecoveryKind::ProofCreation,
                        Some(transaction.prior),
                    )
                } else {
                    return Err(ActiveReceiptJournalError::Ambiguous(
                        "valid retired/active proof minority is not an adjacent transition"
                            .to_string(),
                    ));
                }
            } else {
                let prior = match &quorum.binding {
                    ProofBinding::Transaction(binding) => {
                        let transaction = validate_bound_transaction(binding, &slots)?;
                        if transaction.target != TargetObservation::Intended {
                            return Err(ActiveReceiptJournalError::Ambiguous(
                                "split proof retirement requires the exact intended target"
                                    .to_string(),
                            ));
                        }
                        Some(transaction.prior)
                    }
                    binding => {
                        let _ = retired_selected_receipt(binding, &slots)?;
                        None
                    }
                };
                (ActiveReceiptRecoveryKind::ProofRetirement, prior)
            };
            Ok(ActiveReceiptReadState::RecoveryRequired(
                ActiveReceiptRecovery { kind, prior },
            ))
        }
    }
}

pub(super) fn proof_quorum(
    logical: &[Option<ProofRecord>; PROOF_LOGICAL_REPLICAS],
) -> Option<(&ProofRecord, usize)> {
    for candidate in logical.iter().flatten() {
        let count = logical
            .iter()
            .flatten()
            .filter(|record| record.raw == candidate.raw)
            .count();
        if count >= 2 {
            return Some((candidate, count));
        }
    }
    None
}

pub(super) fn proof_minority<'a>(
    quorum: &ProofRecord,
    logical: &'a [Option<ProofRecord>; PROOF_LOGICAL_REPLICAS],
) -> Option<&'a ProofRecord> {
    logical
        .iter()
        .flatten()
        .find(|record| record.raw != quorum.raw)
}

pub(super) fn validate_bound_transaction(
    binding: &TransactionBinding,
    slots: &[SlotState; RECEIPT_SLOT_COUNT],
) -> Result<BoundTransaction, ActiveReceiptJournalError> {
    let prior = match &slots[binding.prior_slot] {
        SlotState::Valid(slot)
            if slot.receipt.sequence == binding.prior_sequence
                && slot.raw_digest == binding.prior_envelope_digest =>
        {
            slot.receipt.duplicate_for_resolution()
        }
        _ => {
            return Err(ActiveReceiptJournalError::Ambiguous(
                "proof prior slot, sequence, or envelope digest does not match".to_string(),
            ));
        }
    };
    if binding.next_sequence
        != binding.prior_sequence.checked_add(1).ok_or_else(|| {
            ActiveReceiptJournalError::Ambiguous("receipt sequence overflow".to_string())
        })?
    {
        return Err(ActiveReceiptJournalError::Ambiguous(
            "proof next sequence is not exactly prior + 1".to_string(),
        ));
    }
    let target = match &slots[binding.target_slot] {
        SlotState::Empty => match binding.target_preimage {
            TargetPreimage::Empty => TargetObservation::Preimage,
            TargetPreimage::Complete(_) => TargetObservation::Incomplete,
        },
        SlotState::Invalid(_) => TargetObservation::Incomplete,
        SlotState::Valid(slot) if slot.raw_digest == binding.intended_envelope_digest => {
            if slot.receipt.sequence != binding.next_sequence {
                return Err(ActiveReceiptJournalError::Ambiguous(
                    "intended target envelope has the wrong sequence".to_string(),
                ));
            }
            TargetObservation::Intended
        }
        SlotState::Valid(slot) => match binding.target_preimage {
            TargetPreimage::Complete(digest) if slot.raw_digest == digest => {
                TargetObservation::Preimage
            }
            TargetPreimage::Empty | TargetPreimage::Complete(_) => {
                return Err(ActiveReceiptJournalError::Ambiguous(
                    "target is a third complete valid envelope outside its bound preimage and intention"
                        .to_string(),
                ));
            }
        },
    };
    Ok(BoundTransaction { prior, target })
}

pub(super) fn retired_selected_receipt(
    binding: &ProofBinding,
    slots: &[SlotState; RECEIPT_SLOT_COUNT],
) -> Result<Option<ActiveReceipt>, ActiveReceiptJournalError> {
    match binding {
        ProofBinding::EmptyJournal => {
            if slots.iter().all(|slot| matches!(slot, SlotState::Empty)) {
                Ok(None)
            } else {
                Err(ActiveReceiptJournalError::Ambiguous(
                    "empty-journal retired proof cannot authorize receipt bytes".to_string(),
                ))
            }
        }
        ProofBinding::InitialReceipt {
            slot,
            sequence,
            envelope_digest,
        } => match &slots[*slot] {
            SlotState::Valid(parsed)
                if parsed.receipt.sequence == *sequence
                    && parsed.raw_digest == *envelope_digest
                    && matches!(slots[1 - *slot], SlotState::Empty) =>
            {
                Ok(Some(parsed.receipt.duplicate_for_resolution()))
            }
            _ => Err(ActiveReceiptJournalError::Ambiguous(
                "initial retired proof does not bind its selected slot identity".to_string(),
            )),
        },
        ProofBinding::Transaction(binding) => {
            let transaction = validate_bound_transaction(binding, slots)?;
            if transaction.target == TargetObservation::Intended {
                let SlotState::Valid(target) = &slots[binding.target_slot] else {
                    unreachable!("intended observation requires a valid target")
                };
                Ok(Some(target.receipt.duplicate_for_resolution()))
            } else {
                Err(ActiveReceiptJournalError::Ambiguous(
                    "retired proof does not bind the exact intended target".to_string(),
                ))
            }
        }
    }
}

pub(super) fn require_zero(field: &str, bytes: &[u8]) -> Result<(), String> {
    if bytes.iter().all(|byte| *byte == 0) {
        Ok(())
    } else {
        Err(format!("{field} must be zero-filled"))
    }
}

pub(super) fn sha256(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}

pub(super) fn proof_record_digest(bytes: &[u8]) -> [u8; 32] {
    let mut digest = Sha256::new();
    digest.update(&bytes[..24]);
    digest.update(&bytes[PROOF_BODY_START..PROOF_BODY_END]);
    digest.finalize().into()
}

pub(super) fn copy_digest(bytes: &[u8]) -> [u8; 32] {
    let mut digest = [0_u8; 32];
    digest.copy_from_slice(bytes);
    digest
}

pub(super) fn read_u16(bytes: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes(
        bytes[offset..offset + 2]
            .try_into()
            .expect("fixed u16 range"),
    )
}

pub(super) fn read_u32(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(
        bytes[offset..offset + 4]
            .try_into()
            .expect("fixed u32 range"),
    )
}

pub(super) fn read_u64(bytes: &[u8], offset: usize) -> u64 {
    u64::from_le_bytes(
        bytes[offset..offset + 8]
            .try_into()
            .expect("fixed u64 range"),
    )
}

pub(super) fn read_u128(bytes: &[u8], offset: usize) -> u128 {
    u128::from_le_bytes(
        bytes[offset..offset + 16]
            .try_into()
            .expect("fixed u128 range"),
    )
}

/// Encode one receipt envelope in memory. This codec performs no filesystem
/// mutation and is not an activation/publication API.
pub(super) fn encode_receipt_slot(
    wire: &ActiveReceiptWire,
    sequence: u64,
) -> Result<[u8; RECEIPT_SLOT_BYTES], String> {
    let payload = serde_json::to_vec(wire)
        .map_err(|error| format!("receipt wire serialization failed: {error}"))?;
    encode_receipt_payload(&payload, sequence)
}

/// Encode already-canonical payload bytes into one fixed envelope in memory.
/// The caller remains responsible for the closed payload grammar.
pub(super) fn encode_receipt_payload(
    payload: &[u8],
    sequence: u64,
) -> Result<[u8; RECEIPT_SLOT_BYTES], String> {
    if payload.is_empty() || payload.len() > RECEIPT_SLOT_BYTES - RECEIPT_ENVELOPE_HEADER_BYTES {
        return Err("receipt payload is outside the fixed envelope bound".to_string());
    }
    let mut raw = [0_u8; RECEIPT_SLOT_BYTES];
    raw[..8].copy_from_slice(RECEIPT_ENVELOPE_MAGIC);
    raw[8..10].copy_from_slice(&FIXED_FORMAT_VERSION.to_le_bytes());
    raw[16..24].copy_from_slice(&sequence.to_le_bytes());
    raw[24..28].copy_from_slice(&(payload.len() as u32).to_le_bytes());
    raw[32..64].copy_from_slice(&sha256(payload));
    raw[RECEIPT_ENVELOPE_HEADER_BYTES..RECEIPT_ENVELOPE_HEADER_BYTES + payload.len()]
        .copy_from_slice(payload);
    Ok(raw)
}

/// Encode one proof subrecord in memory. The function publishes no bytes and is
/// shared by parser canonicalization and real-filesystem test fixtures.
pub(super) fn encode_proof_record(
    identity: JournalIdentity,
    state: ProofState,
    transition_sequence: u64,
    binding: &ProofBinding,
) -> [u8; PROOF_SUBRECORD_BYTES] {
    let mut raw = [0_u8; PROOF_SUBRECORD_BYTES];
    raw[..8].copy_from_slice(PROOF_MAGIC);
    raw[8..10].copy_from_slice(&FIXED_FORMAT_VERSION.to_le_bytes());
    raw[10] = match state {
        ProofState::Active => 1,
        ProofState::Retired => 2,
    };
    raw[12..16].copy_from_slice(&((PROOF_BODY_END - PROOF_BODY_START) as u32).to_le_bytes());
    raw[16..24].copy_from_slice(&transition_sequence.to_le_bytes());
    raw[56] = identity.kind;
    raw[64..72].copy_from_slice(&identity.first.to_le_bytes());
    raw[72..88].copy_from_slice(&identity.second.to_le_bytes());
    match binding {
        ProofBinding::EmptyJournal => {}
        ProofBinding::InitialReceipt {
            slot,
            sequence,
            envelope_digest,
        } => {
            raw[11] = 3;
            raw[88] = *slot as u8;
            raw[89] = *slot as u8;
            raw[96..104].copy_from_slice(&sequence.to_le_bytes());
            raw[112..144].copy_from_slice(envelope_digest);
        }
        ProofBinding::Transaction(binding) => {
            raw[88] = binding.prior_slot as u8;
            raw[89] = binding.target_slot as u8;
            raw[96..104].copy_from_slice(&binding.prior_sequence.to_le_bytes());
            raw[104..112].copy_from_slice(&binding.next_sequence.to_le_bytes());
            raw[112..144].copy_from_slice(&binding.prior_envelope_digest);
            match binding.target_preimage {
                TargetPreimage::Empty => raw[11] = 1,
                TargetPreimage::Complete(digest) => {
                    raw[11] = 2;
                    raw[144..176].copy_from_slice(&digest);
                }
            }
            raw[176..208].copy_from_slice(&binding.intended_envelope_digest);
        }
    }
    let record_digest = proof_record_digest(&raw);
    raw[24..56].copy_from_slice(&record_digest);
    raw
}
