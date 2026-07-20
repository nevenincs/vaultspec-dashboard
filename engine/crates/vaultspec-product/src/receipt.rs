//! Fixed active-receipt authority (a2a-product-provisioning W01.P01.S167).
//!
//! `active-receipts.v1` is one owner-private, exact-size journal containing two
//! receipt slots and three logical non-selection proof replicas. Each logical
//! proof has two alternating subrecords. A guarded reader synchronizes, closes,
//! reopens no-follow, and revalidates the retained journal identity before it
//! resolves slots or proof quorum. Only three byte-identical retired logical
//! proofs permit highest-sequence selection. Active or split-retirement proof
//! state is recovery authority only and never selects its target.
//!
//! The legacy S08 `receipt.json` types remain below as a temporary compilation
//! seam for lifecycle code. The fixed reader never opens or parses that path.

#![allow(
    dead_code,
    reason = "S167 deliberately lands a crate-internal reader before S168-S170 bind its authority consumers"
)]

use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom};
use std::marker::PhantomData;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::locking::{InstallLockGuard, LockAuthorityError};
use crate::manifest::{ReleaseIdentity, Target};
use crate::paths::ProductPaths;

mod fixed;
mod legacy;
mod publish;
#[cfg(test)]
mod tests;

use fixed::*;
#[allow(unused_imports)]
pub(crate) use publish::{
    ActiveReceiptPublishError, ActiveReceiptPublishFailureKind, publish_active_receipt,
};

/// Exact byte length of `active-receipts.v1`.
pub(crate) const ACTIVE_RECEIPT_JOURNAL_BYTES: usize = 34_368;

/// Closed payload grammar for the fixed journal. This is intentionally
/// distinct from the retired `receipt.json` schema below.
const ACTIVE_RECEIPT_SCHEMA_VERSION: &str = "2.0";

const JOURNAL_HEADER_BYTES: usize = 64;
const RECEIPT_SLOT_BYTES: usize = 16 * 1024;
const RECEIPT_SLOT_COUNT: usize = 2;
const RECEIPT_ENVELOPE_HEADER_BYTES: usize = 64;
const PROOF_LOGICAL_REPLICAS: usize = 3;
const PROOF_SUBRECORDS: usize = 2;
const PROOF_SUBRECORD_BYTES: usize = 256;
const PROOF_BODY_START: usize = 56;
const PROOF_BODY_END: usize = 208;
const JOURNAL_MAGIC: &[u8; 8] = b"VSACTV1\0";
const RECEIPT_ENVELOPE_MAGIC: &[u8; 8] = b"VSRCPT1\0";
const PROOF_MAGIC: &[u8; 8] = b"VSPRFV1\0";
const FIXED_FORMAT_VERSION: u16 = 1;

const _: () = assert!(
    ACTIVE_RECEIPT_JOURNAL_BYTES
        == JOURNAL_HEADER_BYTES
            + RECEIPT_SLOT_COUNT * RECEIPT_SLOT_BYTES
            + PROOF_LOGICAL_REPLICAS * PROOF_SUBRECORDS * PROOF_SUBRECORD_BYTES
);

fn receipt_slot_range(index: usize) -> std::ops::Range<usize> {
    let start = JOURNAL_HEADER_BYTES + index * RECEIPT_SLOT_BYTES;
    start..start + RECEIPT_SLOT_BYTES
}

fn proof_subrecord_range(logical_index: usize, subrecord_index: usize) -> std::ops::Range<usize> {
    let proof_base = JOURNAL_HEADER_BYTES + RECEIPT_SLOT_COUNT * RECEIPT_SLOT_BYTES;
    let start = proof_base
        + logical_index * PROOF_SUBRECORDS * PROOF_SUBRECORD_BYTES
        + subrecord_index * PROOF_SUBRECORD_BYTES;
    start..start + PROOF_SUBRECORD_BYTES
}

/// Assemble one bounded journal image in memory. This codec has no path or file
/// operand and cannot publish activation authority.
fn encode_journal_image(
    slots: &[Option<[u8; RECEIPT_SLOT_BYTES]>; RECEIPT_SLOT_COUNT],
    proofs: &[[Option<[u8; PROOF_SUBRECORD_BYTES]>; PROOF_SUBRECORDS]; PROOF_LOGICAL_REPLICAS],
) -> Vec<u8> {
    let mut bytes = vec![0_u8; ACTIVE_RECEIPT_JOURNAL_BYTES];
    bytes[..8].copy_from_slice(JOURNAL_MAGIC);
    bytes[8..10].copy_from_slice(&FIXED_FORMAT_VERSION.to_le_bytes());
    for (index, slot) in slots.iter().enumerate() {
        if let Some(slot) = slot {
            bytes[receipt_slot_range(index)].copy_from_slice(slot);
        }
    }
    for (logical_index, logical) in proofs.iter().enumerate() {
        for (subrecord_index, proof) in logical.iter().enumerate() {
            if let Some(proof) = proof {
                bytes[proof_subrecord_range(logical_index, subrecord_index)].copy_from_slice(proof);
            }
        }
    }
    bytes
}

/// A settled receipt selected from the fixed journal.
///
/// Construction is private. The only crate construction path is the guarded,
/// fixed-size journal reader, and this type deliberately has no `Deserialize`
/// implementation. Sequence authority lives in the envelope and is attached
/// only after the canonical payload has passed every check.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct ActiveReceipt {
    sequence: u64,
    schema_version: String,
    dashboard_version: String,
    dashboard_commit: String,
    dashboard_digest: String,
    release_set_identity: String,
    release_set_member_digest: String,
    component_lock_digest: String,
    external_five_member_cohort_digest: String,
    target: Target,
    a2a_identity: ReleaseIdentity,
    active_generation: String,
    channel: Channel,
    bootstrap_created_ownership: bool,
    prior_seat: Option<PriorSeatIdentity>,
    consistency_generation: u64,
    created_ms: i64,
}

impl ActiveReceipt {
    fn duplicate_for_resolution(&self) -> Self {
        Self {
            sequence: self.sequence,
            schema_version: self.schema_version.clone(),
            dashboard_version: self.dashboard_version.clone(),
            dashboard_commit: self.dashboard_commit.clone(),
            dashboard_digest: self.dashboard_digest.clone(),
            release_set_identity: self.release_set_identity.clone(),
            release_set_member_digest: self.release_set_member_digest.clone(),
            component_lock_digest: self.component_lock_digest.clone(),
            external_five_member_cohort_digest: self.external_five_member_cohort_digest.clone(),
            target: self.target,
            a2a_identity: self.a2a_identity.clone(),
            active_generation: self.active_generation.clone(),
            channel: self.channel,
            bootstrap_created_ownership: self.bootstrap_created_ownership,
            prior_seat: self.prior_seat.clone(),
            consistency_generation: self.consistency_generation,
            created_ms: self.created_ms,
        }
    }

    /// Monotonic envelope sequence used to select between the two slots.
    #[must_use]
    pub(crate) fn sequence(&self) -> u64 {
        self.sequence
    }

    /// Closed receipt payload schema version.
    #[must_use]
    pub(crate) fn schema_version(&self) -> &str {
        &self.schema_version
    }

    /// Dashboard version in the complete release set.
    #[must_use]
    pub(crate) fn dashboard_version(&self) -> &str {
        &self.dashboard_version
    }

    /// Pinned dashboard source commit.
    #[must_use]
    pub(crate) fn dashboard_commit(&self) -> &str {
        &self.dashboard_commit
    }

    /// SHA-256 digest of the dashboard member.
    #[must_use]
    pub(crate) fn dashboard_digest(&self) -> &str {
        &self.dashboard_digest
    }

    /// Complete release-set identity.
    #[must_use]
    pub(crate) fn release_set_identity(&self) -> &str {
        &self.release_set_identity
    }

    /// SHA-256 digest of the release-set member manifest.
    #[must_use]
    pub(crate) fn release_set_member_digest(&self) -> &str {
        &self.release_set_member_digest
    }

    /// SHA-256 digest of the independently trusted component lock.
    #[must_use]
    pub(crate) fn component_lock_digest(&self) -> &str {
        &self.component_lock_digest
    }

    /// SHA-256 digest of the external exact-five cohort descriptor.
    #[must_use]
    pub(crate) fn external_five_member_cohort_digest(&self) -> &str {
        &self.external_five_member_cohort_digest
    }

    /// Release target for every member of this release set.
    #[must_use]
    pub(crate) fn target(&self) -> Target {
        self.target
    }

    /// Bound A2A component identity.
    #[must_use]
    pub(crate) fn a2a_identity(&self) -> &ReleaseIdentity {
        &self.a2a_identity
    }

    /// Product generation selected by this receipt.
    #[must_use]
    pub(crate) fn active_generation(&self) -> &str {
        &self.active_generation
    }

    /// Installer channel that owns activation for this generation.
    #[must_use]
    pub(crate) fn channel(&self) -> Channel {
        self.channel
    }

    /// Whether the bootstrap-created ownership capability remains retained.
    #[must_use]
    pub(crate) fn bootstrap_created_ownership(&self) -> bool {
        self.bootstrap_created_ownership
    }

    /// Prior seat descriptor retained for rollback relaunch.
    #[must_use]
    pub(crate) fn prior_seat(&self) -> Option<&PriorSeatIdentity> {
        self.prior_seat.as_ref()
    }

    /// Consistency-group generation bound into this receipt.
    #[must_use]
    pub(crate) fn consistency_generation(&self) -> u64 {
        self.consistency_generation
    }

    /// Wall-clock creation time in epoch milliseconds.
    #[must_use]
    pub(crate) fn created_ms(&self) -> i64 {
        self.created_ms
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ActiveReceiptWire {
    schema_version: String,
    dashboard_version: String,
    dashboard_commit: String,
    dashboard_digest: String,
    release_set_identity: String,
    release_set_member_digest: String,
    component_lock_digest: String,
    external_five_member_cohort_digest: String,
    target: Target,
    a2a_identity: ActiveReleaseIdentityWire,
    active_generation: String,
    channel: Channel,
    bootstrap_created_ownership: bool,
    prior_seat: Option<ActivePriorSeatWire>,
    consistency_generation: u64,
    created_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ActiveReleaseIdentityWire {
    name: String,
    version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ActivePriorSeatWire {
    generation: String,
    dashboard_version: String,
    pid: Option<u32>,
}

impl ActiveReceiptWire {
    fn into_active(self, sequence: u64) -> Result<ActiveReceipt, String> {
        if sequence == 0 || sequence == u64::MAX {
            return Err("receipt sequence must be between 1 and u64::MAX - 1".to_string());
        }
        require_literal(
            "schema_version",
            ACTIVE_RECEIPT_SCHEMA_VERSION,
            &self.schema_version,
        )?;
        require_numeric_version("dashboard_version", &self.dashboard_version)?;
        require_commit("dashboard_commit", &self.dashboard_commit)?;
        require_digest("dashboard_digest", &self.dashboard_digest)?;
        require_bounded_identifier("release_set_identity", &self.release_set_identity)?;
        require_digest("release_set_member_digest", &self.release_set_member_digest)?;
        require_digest("component_lock_digest", &self.component_lock_digest)?;
        require_digest(
            "external_five_member_cohort_digest",
            &self.external_five_member_cohort_digest,
        )?;
        require_bounded_identifier("a2a_identity.name", &self.a2a_identity.name)?;
        require_numeric_version("a2a_identity.version", &self.a2a_identity.version)?;
        crate::paths::validate_generation(&self.active_generation)
            .map_err(|error| error.to_string())?;
        if self.created_ms <= 0 {
            return Err("created_ms must be positive".to_string());
        }
        let prior_seat = self
            .prior_seat
            .map(|prior| {
                crate::paths::validate_generation(&prior.generation)
                    .map_err(|error| error.to_string())?;
                require_numeric_version("prior_seat.dashboard_version", &prior.dashboard_version)?;
                if prior.pid == Some(0) {
                    return Err("prior_seat.pid must be non-zero when present".to_string());
                }
                Ok(PriorSeatIdentity {
                    generation: prior.generation,
                    dashboard_version: prior.dashboard_version,
                    pid: prior.pid,
                })
            })
            .transpose()?;

        Ok(ActiveReceipt {
            sequence,
            schema_version: self.schema_version,
            dashboard_version: self.dashboard_version,
            dashboard_commit: self.dashboard_commit,
            dashboard_digest: self.dashboard_digest,
            release_set_identity: self.release_set_identity,
            release_set_member_digest: self.release_set_member_digest,
            component_lock_digest: self.component_lock_digest,
            external_five_member_cohort_digest: self.external_five_member_cohort_digest,
            target: self.target,
            a2a_identity: ReleaseIdentity {
                name: self.a2a_identity.name,
                version: self.a2a_identity.version,
            },
            active_generation: self.active_generation,
            channel: self.channel,
            bootstrap_created_ownership: self.bootstrap_created_ownership,
            prior_seat,
            consistency_generation: self.consistency_generation,
            created_ms: self.created_ms,
        })
    }
}

fn require_literal(field: &str, expected: &str, value: &str) -> Result<(), String> {
    if value == expected {
        Ok(())
    } else {
        Err(format!("{field} must be {expected:?}"))
    }
}

fn require_digest(field: &str, value: &str) -> Result<(), String> {
    if value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        Ok(())
    } else {
        Err(format!("{field} must be a lowercase SHA-256 digest"))
    }
}

fn require_commit(field: &str, value: &str) -> Result<(), String> {
    if value.len() == 40
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        Ok(())
    } else {
        Err(format!("{field} must be a pinned lowercase 40-hex commit"))
    }
}

fn require_numeric_version(field: &str, value: &str) -> Result<(), String> {
    if value.len() > 128 {
        return Err(format!(
            "{field} must be an exact two- or three-part numeric version"
        ));
    }
    let parts = value.split('.');
    let count = parts.clone().count();
    if (2..=3).contains(&count)
        && parts
            .into_iter()
            .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
    {
        Ok(())
    } else {
        Err(format!(
            "{field} must be an exact two- or three-part numeric version"
        ))
    }
}

fn require_bounded_identifier(field: &str, value: &str) -> Result<(), String> {
    if !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-' | b'+'))
    {
        Ok(())
    } else {
        Err(format!(
            "{field} must be a non-empty bounded ASCII identifier"
        ))
    }
}

/// Result of reading the fixed active-receipt journal.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ActiveReceiptReadState {
    /// The journal is absent, or its two slots are empty under unanimous retired
    /// proof. Empty slots never select a generation.
    Absent,
    /// All logical proof replicas are identically retired and this is the
    /// highest complete valid receipt envelope.
    Settled(ActiveReceipt),
    /// A valid proof quorum requires the later recovery writer to normalize
    /// proof or target state. No target is authorized as settled by this state.
    RecoveryRequired(ActiveReceiptRecovery),
}

/// A journal observation whose authority cannot outlive the verified lock
/// guard borrowed by the read.
#[derive(Debug)]
pub(crate) struct ActiveReceiptRead<'guard> {
    state: ActiveReceiptReadState,
    _journal: Option<JournalHandle>,
    _guard: PhantomData<&'guard InstallLockGuard>,
}

impl ActiveReceiptRead<'_> {
    pub(crate) fn state(&self) -> Result<&ActiveReceiptReadState, ActiveReceiptJournalError> {
        if let Some(journal) = &self._journal {
            journal
                .validate()
                .map_err(|source| ActiveReceiptJournalError::Io {
                    stage: "retained authority revalidation",
                    source,
                })?;
        }
        Ok(&self.state)
    }
}

/// Which bounded proof transition remains to be normalized by recovery.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ActiveReceiptRecoveryKind {
    /// Two active proof replicas exist but proof publication has not reached all
    /// three; the target must still equal its bound preimage.
    ProofCreation,
    /// All three active proof replicas exist; target publication may be absent,
    /// partial, or complete, but cannot become selected until proof retirement.
    ActiveProof,
    /// At least two retired replicas exist but retirement is not unanimous.
    /// Transaction retirement requires the complete intended envelope; empty
    /// and initial genesis bindings require proof normalization only.
    ProofRetirement,
}

/// Opaque recovery context. The intended target is deliberately not exposed as
/// a settled receipt; the later S172 recovery writer consumes the proof journal.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct ActiveReceiptRecovery {
    kind: ActiveReceiptRecoveryKind,
    prior: Option<ActiveReceipt>,
}

impl ActiveReceiptRecovery {
    /// Proof normalization stage observed by the reader.
    #[must_use]
    pub(crate) fn kind(&self) -> ActiveReceiptRecoveryKind {
        self.kind
    }

    /// Prior receipt retained by a bound transition, when one exists.
    ///
    /// This receipt is recovery context only. The enclosing
    /// [`ActiveReceiptReadState::RecoveryRequired`] must never be treated as settled
    /// selection authority.
    #[must_use]
    pub(crate) fn prior(&self) -> Option<&ActiveReceipt> {
        self.prior.as_ref()
    }
}

/// Fail-closed fixed-journal read error.
#[derive(Debug)]
pub(crate) enum ActiveReceiptJournalError {
    /// The supplied guard is not the current installation authority.
    LockAuthority(LockAuthorityError),
    /// The fixed journal could not be opened, synchronized, or read.
    Io {
        /// Bounded reader stage.
        stage: &'static str,
        /// Operating-system error.
        source: std::io::Error,
    },
    /// Mutation may have started; the exact still-open journal authority is
    /// retained so no subsequent transition can proceed implicitly.
    Mutation {
        stage: &'static str,
        source: std::io::Error,
        journal: JournalHandle,
    },
    /// The fixed grammar, digest, padding, or semantic contract is invalid.
    Invalid(String),
    /// Multiple observations remain possible, so no receipt can be selected.
    Ambiguous(String),
}

impl std::fmt::Display for ActiveReceiptJournalError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::LockAuthority(error) => write!(f, "installation authority rejected: {error}"),
            Self::Io { stage, source } => write!(f, "active receipt journal {stage}: {source}"),
            Self::Mutation { stage, source, .. } => {
                write!(f, "active receipt journal mutation {stage}: {source}")
            }
            Self::Invalid(message) => write!(f, "active receipt journal invalid: {message}"),
            Self::Ambiguous(message) => {
                write!(f, "active receipt journal ambiguous: {message}")
            }
        }
    }
}

impl std::error::Error for ActiveReceiptJournalError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::LockAuthority(error) => Some(error),
            Self::Io { source, .. } | Self::Mutation { source, .. } => Some(source),
            Self::Invalid(_) | Self::Ambiguous(_) => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct JournalIdentity {
    kind: u8,
    first: u64,
    second: u128,
}

#[derive(Debug)]
pub(crate) struct JournalHandle {
    file: File,
    identity: JournalIdentity,
    #[cfg(windows)]
    _identity_handle: vaultspec_windows_authority::AuthorityFile,
}

impl JournalHandle {
    fn validate(&self) -> std::io::Result<()> {
        let metadata = self.file.metadata()?;
        if !metadata.is_file() || metadata.len() != ACTIVE_RECEIPT_JOURNAL_BYTES as u64 {
            return Err(std::io::Error::other(format!(
                "expected a regular {ACTIVE_RECEIPT_JOURNAL_BYTES}-byte journal"
            )));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;

            if metadata.uid() != nix::unistd::Uid::effective().as_raw()
                || metadata.mode() & 0o077 != 0
                || metadata.nlink() != 1
            {
                return Err(std::io::Error::other(
                    "journal must be current-owner private with exactly one link",
                ));
            }
            if self.identity
                != (JournalIdentity {
                    kind: 1,
                    first: metadata.dev(),
                    second: u128::from(metadata.ino()),
                })
            {
                return Err(std::io::Error::other("retained journal identity changed"));
            }
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;

            const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
            if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
                return Err(std::io::Error::other(
                    "journal must not be a Windows reparse point",
                ));
            }
            let identity = self._identity_handle.identity();
            if self.identity
                != (JournalIdentity {
                    kind: 2,
                    first: identity.volume_serial_number,
                    second: identity.file_id,
                })
            {
                return Err(std::io::Error::other(
                    "retained Windows journal identity changed",
                ));
            }
            if self._identity_handle.link_count()? != 1 {
                return Err(std::io::Error::other(
                    "journal must have exactly one Windows hard-link name",
                ));
            }
        }
        Ok(())
    }
}

fn open_journal(path: &Path, writable: bool) -> std::io::Result<JournalHandle> {
    let mut options = OpenOptions::new();
    options.read(true).write(writable);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;

        options.custom_flags(nix::libc::O_CLOEXEC | nix::libc::O_NOFOLLOW);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;

        const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
        const FILE_SHARE_READ: u32 = 0x0000_0001;
        options
            .share_mode(FILE_SHARE_READ)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    }
    let file = options.open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() {
        return Err(std::io::Error::other("journal is not a regular file"));
    }

    #[cfg(unix)]
    let identity = {
        use std::os::unix::fs::MetadataExt;

        JournalIdentity {
            kind: 1,
            first: metadata.dev(),
            second: u128::from(metadata.ino()),
        }
    };
    #[cfg(windows)]
    let (identity, identity_handle) = {
        use std::os::windows::fs::MetadataExt;

        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
        if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(std::io::Error::other(
                "journal must not be a Windows reparse point",
            ));
        }
        let authority = vaultspec_windows_authority::AuthorityFile::open_reader(path)?;
        let high = authority.identity();
        (
            JournalIdentity {
                kind: 2,
                first: high.volume_serial_number,
                second: high.file_id,
            },
            authority,
        )
    };

    let handle = JournalHandle {
        file,
        identity,
        #[cfg(windows)]
        _identity_handle: identity_handle,
    };
    handle.validate()?;
    if !crate::discovery::handoff_is_owner_restricted(path) {
        return Err(std::io::Error::other(
            "journal access control is not owner-restricted",
        ));
    }
    Ok(handle)
}

fn journal_io(stage: &'static str, source: std::io::Error) -> ActiveReceiptJournalError {
    ActiveReceiptJournalError::Io { stage, source }
}

fn retained_mutation_error(
    stage: &'static str,
    error: impl std::fmt::Display,
    journal: JournalHandle,
) -> ActiveReceiptJournalError {
    ActiveReceiptJournalError::Mutation {
        stage,
        source: std::io::Error::other(error.to_string()),
        journal,
    }
}

fn reopen_journal_image(
    path: &Path,
    writable: bool,
    expected_identity: Option<JournalIdentity>,
) -> Result<(JournalHandle, Vec<u8>), ActiveReceiptJournalError> {
    let mut handle =
        open_journal(path, writable).map_err(|source| journal_io("no-follow reopen", source))?;
    if expected_identity.is_some_and(|expected| expected != handle.identity) {
        return Err(ActiveReceiptJournalError::Ambiguous(
            "journal identity changed across close and reopen".to_string(),
        ));
    }
    handle
        .file
        .seek(SeekFrom::Start(0))
        .map_err(|source| journal_io("bounded read seek", source))?;
    let mut bytes = vec![0_u8; ACTIVE_RECEIPT_JOURNAL_BYTES];
    handle
        .file
        .read_exact(&mut bytes)
        .map_err(|source| journal_io("bounded reread", source))?;
    handle
        .validate()
        .map_err(|source| journal_io("post-reread validation", source))?;
    Ok((handle, bytes))
}

fn synchronize_close_reopen_journal(
    path: &Path,
    writable_after_reopen: bool,
) -> Result<(JournalHandle, Vec<u8>), ActiveReceiptJournalError> {
    let first =
        open_journal(path, true).map_err(|source| journal_io("initial no-follow open", source))?;
    let identity = first.identity;
    first
        .file
        .sync_all()
        .map_err(|source| journal_io("ingress synchronize", source))?;
    first
        .validate()
        .map_err(|source| journal_io("post-ingress-sync validation", source))?;
    drop(first);
    reopen_journal_image(path, writable_after_reopen, Some(identity))
}

fn write_journal_range_and_reopen(
    path: &Path,
    handle: JournalHandle,
    mut expected: Vec<u8>,
    range: std::ops::Range<usize>,
    replacement: &[u8],
) -> Result<(JournalHandle, Vec<u8>), ActiveReceiptJournalError> {
    if range.len() != replacement.len() || expected.len() != ACTIVE_RECEIPT_JOURNAL_BYTES {
        return Err(ActiveReceiptJournalError::Invalid(
            "positional journal write has an invalid fixed range".to_string(),
        ));
    }
    if let Err(source) = handle.validate() {
        return Err(ActiveReceiptJournalError::Mutation {
            stage: "pre-write validation",
            source,
            journal: handle,
        });
    }
    if let Err(source) = positional_write_all(&handle.file, range.start as u64, replacement) {
        return Err(ActiveReceiptJournalError::Mutation {
            stage: "positional write",
            source,
            journal: handle,
        });
    }
    if let Err(source) = handle.file.sync_all() {
        return Err(ActiveReceiptJournalError::Mutation {
            stage: "positional write synchronize",
            source,
            journal: handle,
        });
    }
    if let Err(source) = handle.validate() {
        return Err(ActiveReceiptJournalError::Mutation {
            stage: "post-write validation",
            source,
            journal: handle,
        });
    }
    let identity = handle.identity;
    expected[range].copy_from_slice(replacement);
    drop(handle);
    let (reopened, actual) = reopen_journal_image(path, true, Some(identity))?;
    if actual != expected {
        return Err(retained_mutation_error(
            "post-write whole-image comparison",
            "journal bytes differ from the exact positional-write image",
            reopened,
        ));
    }
    if let Err(error) = resolve_journal(&actual, identity) {
        return Err(retained_mutation_error(
            "post-write semantic resolution",
            error,
            reopened,
        ));
    }
    Ok((reopened, actual))
}

fn positional_write_all(file: &File, offset: u64, bytes: &[u8]) -> std::io::Result<()> {
    let mut written = 0usize;
    while written < bytes.len() {
        #[cfg(unix)]
        let count = {
            use std::os::unix::fs::FileExt;
            file.write_at(&bytes[written..], offset + written as u64)?
        };
        #[cfg(windows)]
        let count = {
            use std::os::windows::fs::FileExt;
            file.seek_write(&bytes[written..], offset + written as u64)?
        };
        if count == 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::WriteZero,
                "positional journal write made no progress",
            ));
        }
        written += count;
    }
    Ok(())
}

/// Read activation authority from `active-receipts.v1` under the current
/// installation lock.
///
/// The guard is verified before the journal path is observed. The reader opens
/// an existing file without following its final link, retains its identity,
/// synchronizes through a write-capable handle, closes it, then reopens
/// no-follow and revalidates identity and exact size before reading a bounded
/// fixed buffer. Proof/quorum resolution begins only after that sequence.
pub(crate) fn read_active_receipt_journal<'guard>(
    paths: &ProductPaths,
    guard: &'guard InstallLockGuard,
) -> Result<ActiveReceiptRead<'guard>, ActiveReceiptJournalError> {
    guard
        .verify_for_product(paths)
        .map_err(ActiveReceiptJournalError::LockAuthority)?;
    let path = paths.active_receipts_journal_path();
    let first = match open_journal(&path, true) {
        Ok(handle) => handle,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(ActiveReceiptRead {
                state: ActiveReceiptReadState::Absent,
                _journal: None,
                _guard: PhantomData,
            });
        }
        Err(source) => {
            return Err(ActiveReceiptJournalError::Io {
                stage: "initial no-follow open",
                source,
            });
        }
    };
    let retained_identity = first.identity;
    first
        .file
        .sync_all()
        .map_err(|source| ActiveReceiptJournalError::Io {
            stage: "synchronize",
            source,
        })?;
    first
        .validate()
        .map_err(|source| ActiveReceiptJournalError::Io {
            stage: "post-synchronize validation",
            source,
        })?;
    drop(first);

    let mut reopened =
        open_journal(&path, false).map_err(|source| ActiveReceiptJournalError::Io {
            stage: "post-synchronize no-follow reopen",
            source,
        })?;
    if reopened.identity != retained_identity {
        return Err(ActiveReceiptJournalError::Ambiguous(
            "journal identity changed across synchronization and reopen".to_string(),
        ));
    }
    let mut bytes = vec![0_u8; ACTIVE_RECEIPT_JOURNAL_BYTES];
    reopened
        .file
        .read_exact(&mut bytes)
        .map_err(|source| ActiveReceiptJournalError::Io {
            stage: "bounded read",
            source,
        })?;
    reopened
        .validate()
        .map_err(|source| ActiveReceiptJournalError::Io {
            stage: "post-read validation",
            source,
        })?;
    guard
        .verify_for_product(paths)
        .map_err(ActiveReceiptJournalError::LockAuthority)?;
    let state = resolve_journal(&bytes, retained_identity)?;
    Ok(ActiveReceiptRead {
        state,
        _journal: Some(reopened),
        _guard: PhantomData,
    })
}

#[derive(Debug)]
enum SlotState {
    Empty,
    Valid(Box<ParsedSlot>),
    Invalid(String),
}

#[derive(Debug)]
struct ParsedSlot {
    receipt: ActiveReceipt,
    raw_digest: [u8; 32],
    raw: Vec<u8>,
}

fn parse_slot(raw: &[u8]) -> SlotState {
    if raw.iter().all(|byte| *byte == 0) {
        return SlotState::Empty;
    }
    let parse = || -> Result<ParsedSlot, String> {
        if &raw[..8] != RECEIPT_ENVELOPE_MAGIC {
            return Err("receipt envelope magic mismatch".to_string());
        }
        if read_u16(raw, 8) != FIXED_FORMAT_VERSION {
            return Err("unsupported receipt envelope version".to_string());
        }
        require_zero("receipt envelope reserved header", &raw[10..16])?;
        let sequence = read_u64(raw, 16);
        let payload_len = usize::try_from(read_u32(raw, 24))
            .map_err(|_| "receipt payload length overflow".to_string())?;
        require_zero("receipt envelope reserved header", &raw[28..32])?;
        if payload_len == 0 || payload_len > RECEIPT_SLOT_BYTES - RECEIPT_ENVELOPE_HEADER_BYTES {
            return Err("receipt payload length is outside the fixed slot bound".to_string());
        }
        let payload_end = RECEIPT_ENVELOPE_HEADER_BYTES
            .checked_add(payload_len)
            .ok_or_else(|| "receipt payload length overflow".to_string())?;
        let payload = &raw[RECEIPT_ENVELOPE_HEADER_BYTES..payload_end];
        let expected_payload_digest = &raw[32..64];
        if sha256(payload).as_slice() != expected_payload_digest {
            return Err("receipt payload digest mismatch".to_string());
        }
        require_zero("receipt envelope padding", &raw[payload_end..])?;
        let wire: ActiveReceiptWire = serde_json::from_slice(payload)
            .map_err(|error| format!("closed receipt payload parse failed: {error}"))?;
        let canonical = serde_json::to_vec(&wire)
            .map_err(|error| format!("receipt canonicalization failed: {error}"))?;
        if canonical != payload {
            return Err("receipt payload bytes are not canonical".to_string());
        }
        if encode_receipt_payload(&canonical, sequence)?.as_slice() != raw {
            return Err("receipt envelope is not the canonical fixed encoding".to_string());
        }
        let receipt = wire.into_active(sequence)?;
        Ok(ParsedSlot {
            receipt,
            raw_digest: sha256(raw),
            raw: raw.to_vec(),
        })
    };
    match parse() {
        Ok(slot) => SlotState::Valid(Box::new(slot)),
        Err(error) => SlotState::Invalid(error),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProofState {
    Active,
    Retired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TargetPreimage {
    Empty,
    Complete([u8; 32]),
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TransactionBinding {
    prior_slot: usize,
    target_slot: usize,
    prior_sequence: u64,
    next_sequence: u64,
    prior_envelope_digest: [u8; 32],
    target_preimage: TargetPreimage,
    intended_envelope_digest: [u8; 32],
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ProofBinding {
    EmptyJournal,
    InitialReceipt {
        slot: usize,
        sequence: u64,
        envelope_digest: [u8; 32],
    },
    Transaction(TransactionBinding),
}

#[derive(Debug, Clone)]
struct ProofRecord {
    raw: [u8; PROOF_SUBRECORD_BYTES],
    transition_sequence: u64,
    state: ProofState,
    binding: ProofBinding,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TargetObservation {
    Preimage,
    Incomplete,
    Intended,
}

struct BoundTransaction {
    prior: ActiveReceipt,
    target: TargetObservation,
}

/// The current receipt grammar version. A consumer requires the same major and
/// a declared minor no newer than it supports.
pub const RECEIPT_SCHEMA_VERSION: &str = "1.0";

/// Which installer authority wrote a generation. Recorded so update and rollback
/// route file activation to the correct authority (ADR D2: "Every installer
/// writes channel provenance into the release receipt").
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Channel {
    /// The product-owned shell/PowerShell installer; the copied external updater
    /// owns file activation and rollback.
    SelfInstall,
    /// Installed through Scoop; the manager stages, activates, and rolls back.
    Scoop,
    /// Installed through WinGet; the manager owns file activation.
    WinGet,
    /// Installed through the Windows Installer MSI; the manager owns activation.
    Msi,
}

/// The activation state of a receipt on disk.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ReceiptState {
    /// The live, authoritative receipt: its generation is the running release set.
    Active,
    /// A candidate written during an in-flight update, not yet activated.
    Staged,
    /// A receipt captured while a rollback restores the prior generation.
    RollingBack,
}

/// The durable transaction-phase marker an interrupted update leaves behind.
/// Recovery reads it to resume or roll back deterministically from the exact
/// boundary (ADR D6: "Interruption recovery resolves staged and active receipts
/// deterministically").
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum InterruptionMarker {
    /// Candidate staged; no mutation of the live set yet.
    Staged,
    /// Admission closed and active runs draining.
    Draining,
    /// The consistency group has been snapshotted and verified.
    Snapshotted,
    /// Files activated but the receipt not yet committed.
    Activated,
    /// Staged migrations running.
    Migrating,
    /// Candidate probed and accepted.
    Accepted,
    /// A failure was hit and the transaction is rolling back.
    RollingBack,
}

/// The prior seat descriptor retained for rollback relaunch. Non-secret: it
/// names the generation and dashboard build the updater restores, plus the last
/// observed seat pid (advisory only — liveness is proven at recovery time).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PriorSeatIdentity {
    /// The generation id the prior seat ran.
    pub generation: String,
    /// The dashboard version the prior seat ran.
    pub dashboard_version: String,
    /// The last observed seat process id, if one was recorded.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
}

/// A complete release-set receipt.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Receipt {
    /// Receipt grammar version.
    pub schema_version: String,
    /// Activation state.
    pub state: ReceiptState,
    /// Which installer authority wrote this generation.
    pub channel: Channel,
    /// Whether this install created and retains the ownership capability.
    pub bootstrap_created_ownership: bool,
    /// The generation id whose immutable tree is live.
    pub active_generation: String,
    /// The consistency-group generation counter bound to this receipt.
    pub consistency_generation: u64,
    /// The target triple this release set is for.
    pub target: Target,
    /// The A2A component identity bound into this release set.
    pub a2a_identity: ReleaseIdentity,
    /// Wall-clock creation time (epoch milliseconds).
    pub created_ms: i64,
    /// The prior seat descriptor for rollback relaunch, when one exists.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prior_seat: Option<PriorSeatIdentity>,
    /// The durable interruption marker, present only while a transaction is
    /// in flight; `None` on a settled active receipt.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interruption: Option<InterruptionMarker>,
}

/// Why a receipt could not be read or written.
#[derive(Debug)]
pub enum ReceiptError {
    /// The receipt file could not be parsed.
    Parse(String),
    /// An I/O error reading or writing the receipt.
    Io(std::io::Error),
}

/// Sweep orphaned receipt temp files (`receipt.json.tmp-<pid>`) left by a crash
/// between the atomic write and the rename. Best-effort and bounded to the
/// receipt directory: a stranded temp is dead weight, and the resource-bounds
/// law requires the accumulator be reclaimed rather than allowed to grow. The
/// active `receipt.json` itself is never a temp and is left untouched. Returns
/// the number of orphaned temp files removed.
pub fn sweep_orphan_tmp(receipt_path: &std::path::Path) -> std::io::Result<usize> {
    let Some(dir) = receipt_path.parent() else {
        return Ok(0);
    };
    let Some(base) = receipt_path.file_name().and_then(|n| n.to_str()) else {
        return Ok(0);
    };
    let tmp_prefix = format!("{base}.tmp-");
    let mut removed = 0;
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        // A not-yet-created receipt directory has nothing to sweep.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(e) => return Err(e),
    };
    for entry in entries.flatten() {
        let file_name = entry.file_name();
        let Some(name) = file_name.to_str() else {
            continue;
        };
        let Some(pid_str) = name.strip_prefix(&tmp_prefix) else {
            continue;
        };
        // Reclaim a stranded temp ONLY when its writer pid is provably DEAD — the
        // same proof-of-death discipline as `locking::quarantine_owner_matched_stale`
        // and `discovery::classify`. A live writer (e.g. the external updater
        // mid-transaction during the activation handoff window) must keep its
        // in-flight temp; deleting it would corrupt its pending atomic rename. A
        // suffix that is not a plain pid is a foreign/unrecognized name — left
        // untouched rather than guessed at.
        let Ok(pid) = pid_str.parse::<u32>() else {
            continue;
        };
        #[cfg(unix)]
        let writer_is_alive = pid <= i32::MAX as u32 && crate::locking::process_is_alive(pid);
        #[cfg(not(unix))]
        let writer_is_alive = crate::locking::process_is_alive(pid);
        if writer_is_alive {
            continue;
        }
        if std::fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}
