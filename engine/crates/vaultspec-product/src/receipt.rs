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
use sha2::{Digest, Sha256};

use crate::locking::{InstallLockGuard, LockAuthorityError};
use crate::manifest::{ReleaseIdentity, Target, VerifiedReceiptFacts, VerifiedReleaseSet};
use crate::paths::ProductPaths;

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

fn parse_proof(raw: &[u8], identity: JournalIdentity) -> Option<ProofRecord> {
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

fn resolve_logical_proof(raw: &[u8], identity: JournalIdentity) -> Option<ProofRecord> {
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

fn resolve_journal(
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

fn proof_quorum(
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

fn proof_minority<'a>(
    quorum: &ProofRecord,
    logical: &'a [Option<ProofRecord>; PROOF_LOGICAL_REPLICAS],
) -> Option<&'a ProofRecord> {
    logical
        .iter()
        .flatten()
        .find(|record| record.raw != quorum.raw)
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

fn validate_bound_transaction(
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

fn retired_selected_receipt(
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

fn require_zero(field: &str, bytes: &[u8]) -> Result<(), String> {
    if bytes.iter().all(|byte| *byte == 0) {
        Ok(())
    } else {
        Err(format!("{field} must be zero-filled"))
    }
}

fn sha256(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}

fn proof_record_digest(bytes: &[u8]) -> [u8; 32] {
    let mut digest = Sha256::new();
    digest.update(&bytes[..24]);
    digest.update(&bytes[PROOF_BODY_START..PROOF_BODY_END]);
    digest.finalize().into()
}

fn copy_digest(bytes: &[u8]) -> [u8; 32] {
    let mut digest = [0_u8; 32];
    digest.copy_from_slice(bytes);
    digest
}

fn read_u16(bytes: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes(
        bytes[offset..offset + 2]
            .try_into()
            .expect("fixed u16 range"),
    )
}

fn read_u32(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(
        bytes[offset..offset + 4]
            .try_into()
            .expect("fixed u32 range"),
    )
}

fn read_u64(bytes: &[u8], offset: usize) -> u64 {
    u64::from_le_bytes(
        bytes[offset..offset + 8]
            .try_into()
            .expect("fixed u64 range"),
    )
}

fn read_u128(bytes: &[u8], offset: usize) -> u128 {
    u128::from_le_bytes(
        bytes[offset..offset + 16]
            .try_into()
            .expect("fixed u128 range"),
    )
}

/// Encode one receipt envelope in memory. This codec performs no filesystem
/// mutation and is not an activation/publication API.
fn encode_receipt_slot(
    wire: &ActiveReceiptWire,
    sequence: u64,
) -> Result<[u8; RECEIPT_SLOT_BYTES], String> {
    let payload = serde_json::to_vec(wire)
        .map_err(|error| format!("receipt wire serialization failed: {error}"))?;
    encode_receipt_payload(&payload, sequence)
}

/// Encode already-canonical payload bytes into one fixed envelope in memory.
/// The caller remains responsible for the closed payload grammar.
fn encode_receipt_payload(
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
fn encode_proof_record(
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

const ACTIVE_RECEIPT_INIT_NAME: &str = "active-receipts.v1.init";
const ACTIVE_RECEIPT_JOURNAL_NAME: &str = "active-receipts.v1";
#[cfg(windows)]
const MAX_RETAINED_INSTALL_DIAGNOSTICS: usize = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ActiveReceiptPublishFailureKind {
    Refused,
    RecoveryRequired,
    Indeterminate,
}

struct ActiveReceiptPublishAttemptError {
    kind: ActiveReceiptPublishFailureKind,
    message: String,
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
    pub(crate) fn retry(mut self: Box<Self>) -> Result<(), Box<Self>> {
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
            Ok(()) => Ok(()),
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

fn active_wire_from_facts(facts: &VerifiedReceiptFacts) -> ActiveReceiptWire {
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

fn prepare_initial_journal(
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
                        std::ffi::OsStr::new(ACTIVE_RECEIPT_JOURNAL_NAME),
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
                    std::ffi::OsStr::new(ACTIVE_RECEIPT_JOURNAL_NAME),
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
) -> Result<(), Box<ActiveReceiptPublishError<'generation, 'product, 'lock>>> {
    match publish_active_receipt_attempt(&mut verified) {
        Ok(()) => Ok(()),
        Err(failure) => Err(Box::new(ActiveReceiptPublishError {
            verified: Some(verified),
            failure,
        })),
    }
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

impl std::fmt::Display for ReceiptError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ReceiptError::Parse(m) => write!(f, "receipt parse failed: {m}"),
            ReceiptError::Io(e) => write!(f, "receipt io error: {e}"),
        }
    }
}

impl std::error::Error for ReceiptError {}

impl From<std::io::Error> for ReceiptError {
    fn from(e: std::io::Error) -> Self {
        ReceiptError::Io(e)
    }
}

impl Receipt {
    /// A fresh bootstrap receipt: the first install atomically records the
    /// initial active generation and that it created and retains ownership.
    #[must_use]
    pub fn bootstrap(
        channel: Channel,
        target: Target,
        a2a_identity: ReleaseIdentity,
        active_generation: impl Into<String>,
        created_ms: i64,
    ) -> Self {
        Self {
            schema_version: RECEIPT_SCHEMA_VERSION.to_string(),
            state: ReceiptState::Active,
            channel,
            bootstrap_created_ownership: true,
            active_generation: active_generation.into(),
            consistency_generation: 0,
            target,
            a2a_identity,
            created_ms,
            prior_seat: None,
            interruption: None,
        }
    }

    /// Load a receipt from disk. Unlike best-effort launcher state, a malformed
    /// *active* receipt is a hard error — activation authority cannot silently
    /// default to empty.
    pub fn load(path: &std::path::Path) -> std::result::Result<Self, ReceiptError> {
        let raw = std::fs::read_to_string(path)?;
        serde_json::from_str(&raw).map_err(|e| ReceiptError::Parse(e.to_string()))
    }

    /// Atomically persist this receipt to `path`: write a pid-suffixed temp file,
    /// restrict it to the owner on Unix, then rename over the destination. A
    /// concurrent reader observes either the previous complete receipt or this
    /// one — never a torn write.
    pub fn persist(&self, path: &std::path::Path) -> std::result::Result<(), ReceiptError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let file_name = path
            .file_name()
            .map(std::ffi::OsStr::to_owned)
            .unwrap_or_else(|| std::ffi::OsString::from("receipt.json"));
        let mut tmp_name = file_name;
        tmp_name.push(format!(".tmp-{}", std::process::id()));
        let tmp = path.with_file_name(tmp_name);
        let body =
            serde_json::to_string_pretty(self).map_err(|e| ReceiptError::Parse(e.to_string()))?;
        std::fs::write(&tmp, body)?;
        crate::credentials::restrict_to_owner(&tmp)?;
        std::fs::rename(&tmp, path)?;
        Ok(())
    }

    /// Commit this receipt as the live, settled active receipt: clear any
    /// interruption marker, mark it active, and persist atomically. This is the
    /// "atomic complete receipt activation" the update transaction ends with.
    pub fn activate(&mut self, path: &std::path::Path) -> std::result::Result<(), ReceiptError> {
        self.state = ReceiptState::Active;
        self.interruption = None;
        self.persist(path)
    }

    /// Record a durable interruption marker mid-transaction and persist it. The
    /// state moves to `Staged` (an in-flight candidate) unless already rolling
    /// back, so a crash after this point recovers from the exact boundary.
    pub fn mark(
        &mut self,
        marker: InterruptionMarker,
        path: &std::path::Path,
    ) -> std::result::Result<(), ReceiptError> {
        self.interruption = Some(marker);
        self.state = if marker == InterruptionMarker::RollingBack {
            ReceiptState::RollingBack
        } else {
            ReceiptState::Staged
        };
        self.persist(path)
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::LockedProduct;
    use crate::locking::{Actor, InstallLock};

    struct JournalFixture {
        guard: InstallLockGuard,
        paths: ProductPaths,
        _root: tempfile::TempDir,
    }

    impl JournalFixture {
        fn new() -> Self {
            let root = tempfile::tempdir().unwrap();
            let paths = ProductPaths::under_app_home(root.path());
            paths.ensure().unwrap();
            let guard = InstallLock::new(paths.install_lock_path())
                .acquire(Actor::Installer, "receipt-s167-test")
                .unwrap()
                .unwrap();
            Self {
                guard,
                paths,
                _root: root,
            }
        }

        fn read(&self) -> Result<ActiveReceiptRead<'_>, ActiveReceiptJournalError> {
            read_active_receipt_journal(&self.paths, &self.guard)
        }
    }

    fn restrict_test_journal(path: &Path) {
        crate::credentials::restrict_to_owner(path).unwrap();
        #[cfg(windows)]
        {
            let whoami = std::process::Command::new("whoami.exe").output().unwrap();
            assert!(whoami.status.success());
            let user = String::from_utf8(whoami.stdout).unwrap();
            let grant = format!("{}:F", user.trim());
            let output = std::process::Command::new("icacls.exe")
                .arg(path)
                .args([
                    "/inheritance:r",
                    "/grant:r",
                    &grant,
                    "*S-1-5-18:F",
                    "*S-1-5-32-544:F",
                ])
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "icacls failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }

    fn active_wire(generation: &str) -> ActiveReceiptWire {
        ActiveReceiptWire {
            schema_version: ACTIVE_RECEIPT_SCHEMA_VERSION.to_string(),
            dashboard_version: "0.1.4".to_string(),
            dashboard_commit: "a".repeat(40),
            dashboard_digest: "b".repeat(64),
            release_set_identity: "release-2026.07.19".to_string(),
            release_set_member_digest: "c".repeat(64),
            component_lock_digest: "d".repeat(64),
            external_five_member_cohort_digest: "e".repeat(64),
            target: Target::X86_64PcWindowsMsvc,
            a2a_identity: ActiveReleaseIdentityWire {
                name: "vaultspec-a2a".to_string(),
                version: "0.1.0".to_string(),
            },
            active_generation: generation.to_string(),
            channel: Channel::SelfInstall,
            bootstrap_created_ownership: true,
            prior_seat: Some(ActivePriorSeatWire {
                generation: "generation-prior".to_string(),
                dashboard_version: "0.1.3".to_string(),
                pid: Some(42),
            }),
            consistency_generation: 7,
            created_ms: 1_721_344_500_000,
        }
    }

    fn initial_binding(slot: usize, raw: &[u8; RECEIPT_SLOT_BYTES]) -> ProofBinding {
        ProofBinding::InitialReceipt {
            slot,
            sequence: read_u64(raw, 16),
            envelope_digest: sha256(raw),
        }
    }

    fn transaction_binding(
        prior_slot: usize,
        prior: &[u8; RECEIPT_SLOT_BYTES],
        target_slot: usize,
        preimage: TargetPreimage,
        intended: &[u8; RECEIPT_SLOT_BYTES],
    ) -> ProofBinding {
        let prior_sequence = read_u64(prior, 16);
        ProofBinding::Transaction(TransactionBinding {
            prior_slot,
            target_slot,
            prior_sequence,
            next_sequence: prior_sequence.checked_add(1).unwrap(),
            prior_envelope_digest: sha256(prior),
            target_preimage: preimage,
            intended_envelope_digest: sha256(intended),
        })
    }

    fn replicated(
        proof: [u8; PROOF_SUBRECORD_BYTES],
    ) -> [[Option<[u8; PROOF_SUBRECORD_BYTES]>; PROOF_SUBRECORDS]; PROOF_LOGICAL_REPLICAS] {
        std::array::from_fn(|_| [Some(proof), None])
    }

    fn write_journal<F>(
        fixture: &JournalFixture,
        slots: [Option<[u8; RECEIPT_SLOT_BYTES]>; RECEIPT_SLOT_COUNT],
        proofs: F,
    ) where
        F: FnOnce(
            JournalIdentity,
        ) -> [[Option<[u8; PROOF_SUBRECORD_BYTES]>; PROOF_SUBRECORDS];
               PROOF_LOGICAL_REPLICAS],
    {
        write_journal_at(&fixture.paths, slots, proofs);
    }

    fn write_journal_at<F>(
        paths: &ProductPaths,
        slots: [Option<[u8; RECEIPT_SLOT_BYTES]>; RECEIPT_SLOT_COUNT],
        proofs: F,
    ) where
        F: FnOnce(
            JournalIdentity,
        ) -> [[Option<[u8; PROOF_SUBRECORD_BYTES]>; PROOF_SUBRECORDS];
               PROOF_LOGICAL_REPLICAS],
    {
        let empty_proofs = std::array::from_fn(|_| std::array::from_fn(|_| None));
        let bytes = encode_journal_image(&slots, &empty_proofs);
        let path = paths.active_receipts_journal_path();
        std::fs::write(&path, &bytes).unwrap();
        restrict_test_journal(&path);
        let identity = open_journal(&path, false).unwrap().identity;
        let proofs = proofs(identity);
        let bytes = encode_journal_image(&slots, &proofs);
        std::fs::write(&path, bytes).unwrap();
        restrict_test_journal(&path);
    }

    fn assert_recovery_kind(fixture: &JournalFixture, expected: ActiveReceiptRecoveryKind) {
        let read = fixture.read().unwrap();
        let state = read.state().unwrap();
        let ActiveReceiptReadState::RecoveryRequired(recovery) = state else {
            panic!("expected RecoveryRequired, found {state:?}");
        };
        assert_eq!(recovery.kind(), expected);
        assert_eq!(recovery.prior().map(ActiveReceipt::sequence), Some(1));
        assert_eq!(
            recovery.prior().map(ActiveReceipt::active_generation),
            Some("generation-one")
        );
    }

    fn identity() -> ReleaseIdentity {
        ReleaseIdentity {
            name: "vaultspec-a2a".to_string(),
            version: "0.1.0".to_string(),
        }
    }

    #[derive(Clone, Copy)]
    enum PublicationCutpoint {
        CreationOneActive,
        CreationTwoActive,
        ActivePartial,
        ActiveIntended,
        RetirementOneRetired,
        RetirementTwoRetired,
    }

    fn assert_publication_recovers_cutpoint(cutpoint: PublicationCutpoint) {
        use crate::manifest::tests::Fixture as ManifestFixture;

        let fixture = ManifestFixture::new();
        let mut product = LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();
        let mut generation = product.create_unpublished("generation-2").unwrap();
        fixture.populate(generation.path());
        let verified = fixture.verify(&mut generation).unwrap();
        let intended_wire = active_wire_from_facts(verified.receipt_facts());
        let mut prior_wire = intended_wire.clone();
        prior_wire.active_generation = "generation-1".to_string();
        let prior = encode_receipt_slot(&prior_wire, 1).unwrap();
        let intended = encode_receipt_slot(&intended_wire, 2).unwrap();
        let initial = initial_binding(0, &prior);
        let transaction = transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended);
        let mut partial = [0_u8; RECEIPT_SLOT_BYTES];
        partial[0] = 0xff;
        let target = match cutpoint {
            PublicationCutpoint::CreationOneActive | PublicationCutpoint::CreationTwoActive => None,
            PublicationCutpoint::ActivePartial => Some(partial),
            PublicationCutpoint::ActiveIntended
            | PublicationCutpoint::RetirementOneRetired
            | PublicationCutpoint::RetirementTwoRetired => Some(intended),
        };
        write_journal_at(&fixture.paths, [Some(prior), target], |identity| {
            let old = encode_proof_record(identity, ProofState::Retired, 0, &initial);
            let active = encode_proof_record(identity, ProofState::Active, 1, &transaction);
            let retired = encode_proof_record(identity, ProofState::Retired, 2, &transaction);
            match cutpoint {
                PublicationCutpoint::CreationOneActive => {
                    [[Some(active), None], [Some(old), None], [Some(old), None]]
                }
                PublicationCutpoint::CreationTwoActive => [
                    [Some(active), None],
                    [Some(active), None],
                    [Some(old), None],
                ],
                PublicationCutpoint::ActivePartial | PublicationCutpoint::ActiveIntended => {
                    replicated(active)
                }
                PublicationCutpoint::RetirementOneRetired => [
                    [Some(retired), None],
                    [Some(active), None],
                    [Some(active), None],
                ],
                PublicationCutpoint::RetirementTwoRetired => [
                    [Some(retired), None],
                    [Some(retired), None],
                    [Some(active), None],
                ],
            }
        });
        let path = fixture.paths.active_receipts_journal_path();
        let before = std::fs::read(&path).unwrap();

        publish_active_receipt(verified).unwrap();

        let after = std::fs::read(&path).unwrap();
        assert_eq!(
            &before[receipt_slot_range(0)],
            &after[receipt_slot_range(0)],
            "the already-active prior slot must remain byte-for-byte untouched"
        );
        let read = read_active_receipt_journal(&fixture.paths, &fixture.guard).unwrap();
        let ActiveReceiptReadState::Settled(receipt) = read.state().unwrap() else {
            panic!("recovered publication did not settle");
        };
        assert_eq!(receipt.sequence(), 2);
        assert_eq!(receipt.active_generation(), "generation-2");
    }

    #[test]
    fn publisher_recovers_every_adjacent_writer_cutpoint() {
        for cutpoint in [
            PublicationCutpoint::CreationOneActive,
            PublicationCutpoint::CreationTwoActive,
            PublicationCutpoint::ActivePartial,
            PublicationCutpoint::ActiveIntended,
            PublicationCutpoint::RetirementOneRetired,
            PublicationCutpoint::RetirementTwoRetired,
        ] {
            assert_publication_recovers_cutpoint(cutpoint);
        }
    }

    #[derive(Clone, Copy)]
    enum PublicationRefusal {
        ExistingEmpty,
        MismatchedVerifiedRelease,
        ThirdCompleteTarget,
        EqualDuplicateProofs,
    }

    fn assert_publication_refuses_without_mutation(case: PublicationRefusal) {
        use crate::manifest::tests::Fixture as ManifestFixture;

        let fixture = ManifestFixture::new();
        let mut product = LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();
        let mut generation = product.create_unpublished("generation-3").unwrap();
        fixture.populate(generation.path());
        let verified = fixture.verify(&mut generation).unwrap();
        let verified_wire = active_wire_from_facts(verified.receipt_facts());
        let mut prior_wire = verified_wire.clone();
        prior_wire.active_generation = "generation-1".to_string();
        let mut other_wire = verified_wire.clone();
        other_wire.active_generation = "generation-2".to_string();
        let mut wrong_wire = verified_wire.clone();
        wrong_wire.active_generation = "generation-9".to_string();
        let prior = encode_receipt_slot(&prior_wire, 1).unwrap();
        let verified_intended = encode_receipt_slot(&verified_wire, 2).unwrap();
        let other_intended = encode_receipt_slot(&other_wire, 2).unwrap();
        let wrong_complete = encode_receipt_slot(&wrong_wire, 9).unwrap();
        match case {
            PublicationRefusal::ExistingEmpty => {
                write_journal_at(&fixture.paths, [None, None], |_| {
                    std::array::from_fn(|_| std::array::from_fn(|_| None))
                });
            }
            PublicationRefusal::MismatchedVerifiedRelease => {
                let binding =
                    transaction_binding(0, &prior, 1, TargetPreimage::Empty, &other_intended);
                write_journal_at(&fixture.paths, [Some(prior), None], |identity| {
                    replicated(encode_proof_record(
                        identity,
                        ProofState::Active,
                        1,
                        &binding,
                    ))
                });
            }
            PublicationRefusal::ThirdCompleteTarget => {
                let binding =
                    transaction_binding(0, &prior, 1, TargetPreimage::Empty, &verified_intended);
                write_journal_at(
                    &fixture.paths,
                    [Some(prior), Some(wrong_complete)],
                    |identity| {
                        replicated(encode_proof_record(
                            identity,
                            ProofState::Active,
                            1,
                            &binding,
                        ))
                    },
                );
            }
            PublicationRefusal::EqualDuplicateProofs => {
                let binding =
                    transaction_binding(0, &prior, 1, TargetPreimage::Empty, &verified_intended);
                write_journal_at(&fixture.paths, [Some(prior), None], |identity| {
                    let active = encode_proof_record(identity, ProofState::Active, 1, &binding);
                    std::array::from_fn(|_| [Some(active), Some(active)])
                });
            }
        }
        let path = fixture.paths.active_receipts_journal_path();
        let before = std::fs::read(&path).unwrap();
        let error = publish_active_receipt(verified).unwrap_err();
        assert_ne!(error.kind(), ActiveReceiptPublishFailureKind::Refused);
        drop(error);
        assert_eq!(std::fs::read(path).unwrap(), before);
    }

    #[test]
    fn publisher_refuses_ambiguous_or_mismatched_images_without_mutation() {
        for case in [
            PublicationRefusal::ExistingEmpty,
            PublicationRefusal::MismatchedVerifiedRelease,
            PublicationRefusal::ThirdCompleteTarget,
            PublicationRefusal::EqualDuplicateProofs,
        ] {
            assert_publication_refuses_without_mutation(case);
        }
    }

    #[test]
    fn first_install_reuses_the_exact_synchronized_init_residue() {
        use crate::manifest::tests::Fixture as ManifestFixture;

        let fixture = ManifestFixture::new();
        let mut product = LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();
        let mut generation = product.create_unpublished("generation-1").unwrap();
        fixture.populate(generation.path());
        let verified = fixture.verify(&mut generation).unwrap();
        let wire = active_wire_from_facts(verified.receipt_facts());
        let (_, expected) = prepare_initial_journal(&verified, &fixture.paths, &wire)
            .unwrap_or_else(|error| panic!("init residue preparation failed: {}", error.message));
        assert_eq!(
            std::fs::read(fixture.paths.app_home().join(ACTIVE_RECEIPT_INIT_NAME)).unwrap(),
            expected
        );

        publish_active_receipt(verified).unwrap();

        assert_eq!(
            std::fs::read(fixture.paths.active_receipts_journal_path()).unwrap(),
            expected
        );
    }

    #[test]
    fn first_install_refuses_a_different_exact_init_residue_without_mutation() {
        use crate::manifest::tests::Fixture as ManifestFixture;

        let fixture = ManifestFixture::new();
        let mut product = LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();
        let mut first = product.create_unpublished("generation-1").unwrap();
        fixture.populate(first.path());
        let verified = fixture.verify(&mut first).unwrap();
        let wire = active_wire_from_facts(verified.receipt_facts());
        prepare_initial_journal(&verified, &fixture.paths, &wire)
            .unwrap_or_else(|error| panic!("init residue preparation failed: {}", error.message));
        drop(verified);
        drop(first);

        let init_path = fixture.paths.app_home().join(ACTIVE_RECEIPT_INIT_NAME);
        let before = std::fs::read(&init_path).unwrap();
        let mut second = product.create_unpublished("generation-2").unwrap();
        fixture.populate(second.path());
        let verified = fixture.verify(&mut second).unwrap();
        let error = publish_active_receipt(verified).unwrap_err();
        assert_eq!(
            error.kind(),
            ActiveReceiptPublishFailureKind::RecoveryRequired
        );
        drop(error);
        assert_eq!(std::fs::read(init_path).unwrap(), before);
        assert!(!fixture.paths.active_receipts_journal_path().exists());
    }

    #[cfg(windows)]
    #[test]
    fn real_s171_failures_preserve_both_attempts_and_retry_to_success() {
        use crate::manifest::tests::Fixture as ManifestFixture;
        use std::os::windows::fs::OpenOptionsExt;

        const FILE_SHARE_READ: u32 = 0x0000_0001;
        const FILE_SHARE_WRITE: u32 = 0x0000_0002;

        let fixture = ManifestFixture::new();
        let mut product = LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();
        let mut generation = product.create_unpublished("generation-1").unwrap();
        fixture.populate(generation.path());
        let verified = fixture.verify(&mut generation).unwrap();
        let wire = active_wire_from_facts(verified.receipt_facts());
        prepare_initial_journal(&verified, &fixture.paths, &wire)
            .unwrap_or_else(|error| panic!("init residue preparation failed: {}", error.message));
        let init_path = fixture.paths.app_home().join(ACTIVE_RECEIPT_INIT_NAME);
        let blocker = OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
            .open(&init_path)
            .unwrap();

        let first = publish_active_receipt(verified).unwrap_err();
        assert!(first.retains_install_authority());
        let second = first.retry().unwrap_err();
        assert!(second.retains_install_authority());
        assert_eq!(second.install_diagnostics().len(), 1);

        drop(blocker);
        second.retry().unwrap();
        let read = read_active_receipt_journal(&fixture.paths, &fixture.guard).unwrap();
        let ActiveReceiptReadState::Settled(receipt) = read.state().unwrap() else {
            panic!("S171 retry did not settle");
        };
        assert_eq!(receipt.active_generation(), "generation-1");
        assert_eq!(receipt.sequence(), 1);
    }

    #[test]
    fn mutation_error_retains_the_exact_journal_handle() {
        let fixture = JournalFixture::new();
        let prior = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
        let intended = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
        let initial = initial_binding(0, &prior);
        let transaction = transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended);
        write_journal(&fixture, [Some(prior), None], |identity| {
            let old = encode_proof_record(identity, ProofState::Retired, 0, &initial);
            let active = encode_proof_record(identity, ProofState::Active, 1, &transaction);
            [
                [Some(active), None],
                [Some(active), None],
                [Some(old), None],
            ]
        });
        let path = fixture.paths.active_receipts_journal_path();
        let handle = open_journal(&path, true).unwrap();
        let replacement =
            encode_proof_record(handle.identity, ProofState::Retired, 2, &transaction);
        let bytes = std::fs::read(&path).unwrap();
        let error = write_journal_range_and_reopen(
            &path,
            handle,
            bytes,
            proof_subrecord_range(0, 0),
            &replacement,
        )
        .unwrap_err();
        assert!(matches!(error, ActiveReceiptJournalError::Mutation { .. }));
        #[cfg(windows)]
        {
            assert!(OpenOptions::new().write(true).open(&path).is_err());
            assert!(std::fs::remove_file(&path).is_err());
        }
        drop(error);
        #[cfg(windows)]
        {
            drop(OpenOptions::new().write(true).open(&path).unwrap());
            std::fs::remove_file(path).unwrap();
        }
    }

    #[test]
    fn fixed_reader_is_absent_and_never_accepts_legacy_receipt_json() {
        let fixture = JournalFixture::new();
        Receipt::bootstrap(
            Channel::SelfInstall,
            Target::X86_64PcWindowsMsvc,
            identity(),
            "legacy-generation",
            1,
        )
        .persist(&fixture.paths.receipt_path())
        .unwrap();

        let read = fixture.read().unwrap();
        assert!(matches!(
            read.state().unwrap(),
            ActiveReceiptReadState::Absent
        ));
    }

    #[test]
    fn empty_journal_never_selects_and_one_initial_slot_is_exactly_bound() {
        let fixture = JournalFixture::new();
        write_journal(&fixture, [None, None], |journal_identity| {
            replicated(encode_proof_record(
                journal_identity,
                ProofState::Retired,
                0,
                &ProofBinding::EmptyJournal,
            ))
        });
        let empty = fixture.read().unwrap();
        assert!(matches!(
            empty.state().unwrap(),
            ActiveReceiptReadState::Absent
        ));
        drop(empty);

        let slot = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
        let binding = initial_binding(0, &slot);
        write_journal(&fixture, [Some(slot), None], |journal_identity| {
            replicated(encode_proof_record(
                journal_identity,
                ProofState::Retired,
                0,
                &binding,
            ))
        });
        let settled = fixture.read().unwrap();
        let ActiveReceiptReadState::Settled(receipt) = settled.state().unwrap() else {
            panic!("expected settled receipt");
        };
        assert_eq!(receipt.sequence(), 1);
        assert_eq!(receipt.schema_version(), ACTIVE_RECEIPT_SCHEMA_VERSION);
        assert_eq!(receipt.dashboard_version(), "0.1.4");
        assert_eq!(receipt.dashboard_commit(), "a".repeat(40));
        assert_eq!(receipt.dashboard_digest(), "b".repeat(64));
        assert_eq!(receipt.release_set_identity(), "release-2026.07.19");
        assert_eq!(receipt.release_set_member_digest(), "c".repeat(64));
        assert_eq!(receipt.component_lock_digest(), "d".repeat(64));
        assert_eq!(receipt.external_five_member_cohort_digest(), "e".repeat(64));
        assert_eq!(receipt.target(), Target::X86_64PcWindowsMsvc);
        assert_eq!(receipt.a2a_identity().name, "vaultspec-a2a");
        assert_eq!(receipt.active_generation(), "generation-one");
        assert_eq!(receipt.channel(), Channel::SelfInstall);
        assert!(receipt.bootstrap_created_ownership());
        assert_eq!(receipt.prior_seat().unwrap().pid, Some(42));
        assert_eq!(receipt.consistency_generation(), 7);
        assert_eq!(receipt.created_ms(), 1_721_344_500_000);
    }

    #[test]
    fn two_retired_genesis_replicas_require_recovery_without_prior_authority() {
        let fixture = JournalFixture::new();
        write_journal(&fixture, [None, None], |identity| {
            let retired = encode_proof_record(
                identity,
                ProofState::Retired,
                0,
                &ProofBinding::EmptyJournal,
            );
            [[Some(retired), None], [Some(retired), None], [None, None]]
        });
        let empty = fixture.read().unwrap();
        let ActiveReceiptReadState::RecoveryRequired(recovery) = empty.state().unwrap() else {
            panic!("two retired empty-journal proofs must require recovery");
        };
        assert_eq!(recovery.kind(), ActiveReceiptRecoveryKind::ProofRetirement);
        assert!(recovery.prior().is_none());
        drop(empty);

        let slot = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
        let initial = initial_binding(0, &slot);
        write_journal(&fixture, [Some(slot), None], |identity| {
            let retired = encode_proof_record(identity, ProofState::Retired, 0, &initial);
            [[Some(retired), None], [Some(retired), None], [None, None]]
        });
        let initial_read = fixture.read().unwrap();
        let ActiveReceiptReadState::RecoveryRequired(recovery) = initial_read.state().unwrap()
        else {
            panic!("two retired initial-receipt proofs must require recovery");
        };
        assert_eq!(recovery.kind(), ActiveReceiptRecoveryKind::ProofRetirement);
        assert!(recovery.prior().is_none());
    }

    #[test]
    fn unanimous_retired_transaction_selects_exact_next_slot() {
        let fixture = JournalFixture::new();
        let prior = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
        let intended = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
        let binding = transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended);
        write_journal(&fixture, [Some(prior), Some(intended)], |identity| {
            replicated(encode_proof_record(
                identity,
                ProofState::Retired,
                2,
                &binding,
            ))
        });

        let read = fixture.read().unwrap();
        let ActiveReceiptReadState::Settled(receipt) = read.state().unwrap() else {
            panic!("expected settled receipt");
        };
        assert_eq!(receipt.sequence(), 2);
        assert_eq!(receipt.active_generation(), "generation-two");
    }

    #[test]
    fn initial_proof_cannot_authorize_an_unbound_second_slot() {
        let fixture = JournalFixture::new();
        let bound = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
        let attacker = encode_receipt_slot(&active_wire("generation-nine"), 9).unwrap();
        let binding = initial_binding(0, &bound);
        write_journal(&fixture, [Some(bound), Some(attacker)], |identity| {
            replicated(encode_proof_record(
                identity,
                ProofState::Retired,
                0,
                &binding,
            ))
        });

        assert!(matches!(
            fixture.read(),
            Err(ActiveReceiptJournalError::Ambiguous(_))
        ));
    }

    #[test]
    fn exact_size_and_no_follow_alias_are_fail_closed() {
        let fixture = JournalFixture::new();
        let path = fixture.paths.active_receipts_journal_path();
        for size in [
            ACTIVE_RECEIPT_JOURNAL_BYTES - 1,
            ACTIVE_RECEIPT_JOURNAL_BYTES + 1,
        ] {
            std::fs::write(&path, vec![0_u8; size]).unwrap();
            restrict_test_journal(&path);
            assert!(matches!(
                fixture.read(),
                Err(ActiveReceiptJournalError::Io { .. })
            ));
        }
        std::fs::remove_file(&path).unwrap();
        let target = fixture.paths.app_home().join("alias-target");
        std::fs::write(&target, vec![0_u8; ACTIVE_RECEIPT_JOURNAL_BYTES]).unwrap();
        restrict_test_journal(&target);
        #[cfg(unix)]
        std::os::unix::fs::symlink(&target, &path).unwrap();
        #[cfg(windows)]
        std::os::windows::fs::symlink_file(&target, &path).unwrap();
        assert!(matches!(
            fixture.read(),
            Err(ActiveReceiptJournalError::Io { .. })
        ));
    }

    #[test]
    fn unknown_fields_semantic_digest_and_padding_damage_are_rejected() {
        let fixture = JournalFixture::new();
        let mut value = serde_json::to_value(active_wire("generation-one")).unwrap();
        value["unknown_authority"] = serde_json::json!(true);
        let unknown = encode_receipt_payload(&serde_json::to_vec(&value).unwrap(), 1).unwrap();

        let mut bad_semantic_wire = active_wire("../escape");
        bad_semantic_wire.dashboard_digest = "NOT-A-DIGEST".to_string();
        let semantic = encode_receipt_slot(&bad_semantic_wire, 1).unwrap();

        let mut digest = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
        digest[RECEIPT_ENVELOPE_HEADER_BYTES] ^= 0x01;
        let mut padding = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
        padding[RECEIPT_SLOT_BYTES - 1] = 1;

        for damaged in [unknown, semantic, digest, padding] {
            let binding = initial_binding(0, &damaged);
            write_journal(&fixture, [Some(damaged), None], |identity| {
                replicated(encode_proof_record(
                    identity,
                    ProofState::Retired,
                    0,
                    &binding,
                ))
            });
            assert!(fixture.read().is_err());
        }
    }

    #[test]
    fn equal_sequence_receipts_and_missing_proof_quorum_are_rejected() {
        let fixture = JournalFixture::new();
        let left = encode_receipt_slot(&active_wire("generation-left"), 2).unwrap();
        let right = encode_receipt_slot(&active_wire("generation-right"), 2).unwrap();
        let binding = ProofBinding::Transaction(TransactionBinding {
            prior_slot: 0,
            target_slot: 1,
            prior_sequence: 2,
            next_sequence: 3,
            prior_envelope_digest: sha256(&left),
            target_preimage: TargetPreimage::Empty,
            intended_envelope_digest: sha256(&right),
        });
        write_journal(&fixture, [Some(left), Some(right)], |identity| {
            let first = encode_proof_record(identity, ProofState::Active, 1, &binding);
            let second = encode_proof_record(
                identity,
                ProofState::Retired,
                0,
                &ProofBinding::InitialReceipt {
                    slot: 0,
                    sequence: 2,
                    envelope_digest: sha256(&left),
                },
            );
            let third = encode_proof_record(
                identity,
                ProofState::Retired,
                0,
                &ProofBinding::InitialReceipt {
                    slot: 1,
                    sequence: 2,
                    envelope_digest: sha256(&right),
                },
            );
            [
                [Some(first), None],
                [Some(second), None],
                [Some(third), None],
            ]
        });
        assert!(matches!(
            fixture.read(),
            Err(ActiveReceiptJournalError::Ambiguous(_))
        ));
    }

    #[test]
    fn dual_subrecord_torn_write_is_ignored_and_equal_sequence_divergence_invalidates_logical() {
        let fixture = JournalFixture::new();
        let prior = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
        let intended = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
        let binding = transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended);
        write_journal(&fixture, [Some(prior), Some(intended)], |identity| {
            let valid = encode_proof_record(identity, ProofState::Retired, 2, &binding);
            let mut torn = valid;
            torn[16..24].copy_from_slice(&4_u64.to_le_bytes());
            torn[24] ^= 1;
            std::array::from_fn(|_| [Some(torn), Some(valid)])
        });
        let read = fixture.read().unwrap();
        assert!(matches!(
            read.state().unwrap(),
            ActiveReceiptReadState::Settled(_)
        ));
        drop(read);

        let divergent_binding = ProofBinding::Transaction(TransactionBinding {
            intended_envelope_digest: [9; 32],
            ..match binding.clone() {
                ProofBinding::Transaction(binding) => binding,
                _ => unreachable!(),
            }
        });
        write_journal(&fixture, [Some(prior), Some(intended)], |identity| {
            let valid = encode_proof_record(identity, ProofState::Retired, 2, &binding);
            let divergent =
                encode_proof_record(identity, ProofState::Retired, 2, &divergent_binding);
            [
                [Some(valid), Some(divergent)],
                [Some(valid), None],
                [Some(valid), None],
            ]
        });
        assert_recovery_kind(&fixture, ActiveReceiptRecoveryKind::ProofRetirement);
    }

    #[test]
    fn unanimous_active_proof_is_recovery_for_preimage_partial_and_intended_target() {
        let fixture = JournalFixture::new();
        let prior = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
        let intended = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
        let binding = transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended);
        let mut partial = [0_u8; RECEIPT_SLOT_BYTES];
        partial[0] = 0xff;

        for target in [None, Some(partial), Some(intended)] {
            write_journal(&fixture, [Some(prior), target], |identity| {
                replicated(encode_proof_record(
                    identity,
                    ProofState::Active,
                    1,
                    &binding,
                ))
            });
            assert_recovery_kind(&fixture, ActiveReceiptRecoveryKind::ActiveProof);
        }
    }

    #[test]
    fn proof_creation_split_is_recovery_in_both_replica_directions() {
        let fixture = JournalFixture::new();
        let prior = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
        let intended = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
        let initial = initial_binding(0, &prior);
        let transaction = transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended);

        for active_majority in [true, false] {
            write_journal(&fixture, [Some(prior), None], |identity| {
                let old = encode_proof_record(identity, ProofState::Retired, 0, &initial);
                let active = encode_proof_record(identity, ProofState::Active, 1, &transaction);
                if active_majority {
                    [
                        [Some(active), None],
                        [Some(active), None],
                        [Some(old), None],
                    ]
                } else {
                    [[Some(old), None], [Some(old), None], [Some(active), None]]
                }
            });
            assert_recovery_kind(&fixture, ActiveReceiptRecoveryKind::ProofCreation);
        }
    }

    #[test]
    fn proof_retirement_split_is_recovery_in_both_replica_directions() {
        let fixture = JournalFixture::new();
        let prior = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
        let intended = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
        let transaction = transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended);

        for active_majority in [true, false] {
            write_journal(&fixture, [Some(prior), Some(intended)], |identity| {
                let active = encode_proof_record(identity, ProofState::Active, 1, &transaction);
                let retired = encode_proof_record(identity, ProofState::Retired, 2, &transaction);
                if active_majority {
                    [
                        [Some(active), None],
                        [Some(active), None],
                        [Some(retired), None],
                    ]
                } else {
                    [
                        [Some(retired), None],
                        [Some(retired), None],
                        [Some(active), None],
                    ]
                }
            });
            assert_recovery_kind(&fixture, ActiveReceiptRecoveryKind::ProofRetirement);
        }
    }

    #[test]
    fn valid_nonadjacent_third_proof_and_transition_overflow_are_ambiguous() {
        let fixture = JournalFixture::new();
        let prior = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
        let intended = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
        let transaction = transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended);
        write_journal(&fixture, [Some(prior), Some(intended)], |identity| {
            let active = encode_proof_record(identity, ProofState::Active, 1, &transaction);
            let nonadjacent = encode_proof_record(identity, ProofState::Retired, 4, &transaction);
            [
                [Some(active), None],
                [Some(active), None],
                [Some(nonadjacent), None],
            ]
        });
        assert!(matches!(
            fixture.read(),
            Err(ActiveReceiptJournalError::Ambiguous(_))
        ));

        write_journal(&fixture, [Some(prior), Some(intended)], |identity| {
            replicated(encode_proof_record(
                identity,
                ProofState::Active,
                u64::MAX,
                &transaction,
            ))
        });
        assert!(matches!(
            fixture.read(),
            Err(ActiveReceiptJournalError::Ambiguous(_))
        ));
    }

    #[test]
    fn proof_identity_parity_and_authenticated_header_corruption_are_rejected() {
        let fixture = JournalFixture::new();
        let prior = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
        let intended = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
        let transaction = transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended);

        write_journal(&fixture, [Some(prior), None], |mut identity| {
            identity.second ^= 1;
            replicated(encode_proof_record(
                identity,
                ProofState::Active,
                1,
                &transaction,
            ))
        });
        assert!(matches!(
            fixture.read(),
            Err(ActiveReceiptJournalError::Ambiguous(_))
        ));

        for (state, sequence) in [(ProofState::Active, 2), (ProofState::Retired, 1)] {
            write_journal(&fixture, [Some(prior), None], |identity| {
                replicated(encode_proof_record(identity, state, sequence, &transaction))
            });
            assert!(matches!(
                fixture.read(),
                Err(ActiveReceiptJournalError::Ambiguous(_))
            ));
        }

        for corrupt_offset in [10_usize, 12, 16] {
            write_journal(&fixture, [Some(prior), None], |identity| {
                let mut proof = encode_proof_record(identity, ProofState::Active, 1, &transaction);
                proof[corrupt_offset] ^= if corrupt_offset == 10 { 3 } else { 2 };
                replicated(proof)
            });
            assert!(matches!(
                fixture.read(),
                Err(ActiveReceiptJournalError::Ambiguous(_))
            ));
        }
    }

    #[cfg(windows)]
    #[test]
    fn permissive_windows_journal_acl_is_rejected() {
        let fixture = JournalFixture::new();
        let slot = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
        let initial = initial_binding(0, &slot);
        write_journal(&fixture, [Some(slot), None], |identity| {
            replicated(encode_proof_record(
                identity,
                ProofState::Retired,
                0,
                &initial,
            ))
        });
        let output = std::process::Command::new("icacls.exe")
            .arg(fixture.paths.active_receipts_journal_path())
            .args(["/grant", "*S-1-1-0:R"])
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "icacls failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(matches!(
            fixture.read(),
            Err(ActiveReceiptJournalError::Io { .. })
        ));
    }

    #[cfg(windows)]
    #[test]
    fn preexisting_windows_hard_link_alias_is_rejected() {
        let fixture = JournalFixture::new();
        let slot = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
        let initial = initial_binding(0, &slot);
        write_journal(&fixture, [Some(slot), None], |identity| {
            replicated(encode_proof_record(
                identity,
                ProofState::Retired,
                0,
                &initial,
            ))
        });
        let path = fixture.paths.active_receipts_journal_path();
        let alias = fixture.paths.app_home().join("journal-preexisting-alias");
        std::fs::hard_link(&path, &alias).unwrap();

        assert!(matches!(
            fixture.read(),
            Err(ActiveReceiptJournalError::Io { .. })
        ));
        std::fs::remove_file(alias).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn successful_read_retains_windows_write_delete_lease_until_drop() {
        let fixture = JournalFixture::new();
        let slot = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
        let initial = initial_binding(0, &slot);
        write_journal(&fixture, [Some(slot), None], |identity| {
            replicated(encode_proof_record(
                identity,
                ProofState::Retired,
                0,
                &initial,
            ))
        });
        let path = fixture.paths.active_receipts_journal_path();
        let alias = fixture.paths.app_home().join("journal-live-alias");
        let read = fixture.read().unwrap();
        assert!(matches!(
            read.state().unwrap(),
            ActiveReceiptReadState::Settled(_)
        ));
        assert!(OpenOptions::new().write(true).open(&path).is_err());
        assert!(std::fs::remove_file(&path).is_err());
        std::fs::hard_link(&path, &alias).unwrap();
        assert!(OpenOptions::new().write(true).open(&alias).is_err());
        assert!(read.state().is_err());

        drop(read);
        drop(OpenOptions::new().write(true).open(&path).unwrap());
        std::fs::remove_file(&alias).unwrap();
    }

    #[test]
    fn active_proof_rejects_prior_preimage_intention_and_third_complete_mismatches() {
        let fixture = JournalFixture::new();
        let prior = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
        let intended = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
        let wrong_complete = encode_receipt_slot(&active_wire("generation-nine"), 9).unwrap();

        let base = match transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended) {
            ProofBinding::Transaction(binding) => binding,
            _ => unreachable!(),
        };
        let attacks = [
            (
                [Some(prior), None],
                TransactionBinding {
                    prior_envelope_digest: [8; 32],
                    ..base.clone()
                },
            ),
            (
                [Some(prior), Some(intended)],
                TransactionBinding {
                    intended_envelope_digest: [9; 32],
                    ..base.clone()
                },
            ),
            ([Some(prior), Some(wrong_complete)], base.clone()),
        ];
        for (slots, binding) in attacks {
            write_journal(&fixture, slots, |identity| {
                replicated(encode_proof_record(
                    identity,
                    ProofState::Active,
                    1,
                    &ProofBinding::Transaction(binding),
                ))
            });
            assert!(fixture.read().is_err());
        }

        let current = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
        let old_target = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
        let next = encode_receipt_slot(&active_wire("generation-three"), 3).unwrap();
        let bad_preimage = ProofBinding::Transaction(TransactionBinding {
            prior_slot: 1,
            target_slot: 0,
            prior_sequence: 2,
            next_sequence: 3,
            prior_envelope_digest: sha256(&current),
            target_preimage: TargetPreimage::Complete([7; 32]),
            intended_envelope_digest: sha256(&next),
        });
        write_journal(&fixture, [Some(old_target), Some(current)], |identity| {
            replicated(encode_proof_record(
                identity,
                ProofState::Active,
                3,
                &bad_preimage,
            ))
        });
        assert!(fixture.read().is_err());
    }

    #[test]
    fn guard_from_another_product_is_rejected_before_absence() {
        let first = JournalFixture::new();
        let second = JournalFixture::new();
        assert!(matches!(
            read_active_receipt_journal(&second.paths, &first.guard),
            Err(ActiveReceiptJournalError::LockAuthority(_))
        ));
    }

    #[cfg(unix)]
    #[test]
    fn hard_link_alias_is_rejected() {
        let fixture = JournalFixture::new();
        let path = fixture.paths.active_receipts_journal_path();
        std::fs::write(&path, vec![0_u8; ACTIVE_RECEIPT_JOURNAL_BYTES]).unwrap();
        restrict_test_journal(&path);
        std::fs::hard_link(&path, fixture.paths.app_home().join("journal-alias")).unwrap();
        assert!(matches!(
            fixture.read(),
            Err(ActiveReceiptJournalError::Io { .. })
        ));
    }

    #[test]
    fn bootstrap_receipt_roundtrips_and_retains_ownership() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("receipt.json");
        let r = Receipt::bootstrap(
            Channel::SelfInstall,
            Target::X86_64PcWindowsMsvc,
            identity(),
            "2026-07-19-a1b2",
            1_700_000_000_000,
        );
        r.persist(&path).unwrap();
        let loaded = Receipt::load(&path).unwrap();
        assert_eq!(loaded, r);
        assert!(loaded.bootstrap_created_ownership);
        assert_eq!(loaded.state, ReceiptState::Active);
        assert!(loaded.interruption.is_none());
    }

    #[test]
    fn activation_clears_the_interruption_marker() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("receipt.json");
        let mut r = Receipt::bootstrap(
            Channel::Scoop,
            Target::X86_64PcWindowsMsvc,
            identity(),
            "gen-a",
            1,
        );
        r.mark(InterruptionMarker::Migrating, &path).unwrap();
        assert_eq!(Receipt::load(&path).unwrap().state, ReceiptState::Staged);
        r.activate(&path).unwrap();
        let live = Receipt::load(&path).unwrap();
        assert_eq!(live.state, ReceiptState::Active);
        assert!(live.interruption.is_none());
    }

    #[test]
    fn sweep_removes_orphan_temps_but_never_the_active_receipt() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("receipt.json");
        Receipt::bootstrap(
            Channel::Msi,
            Target::X86_64PcWindowsMsvc,
            identity(),
            "g",
            1,
        )
        .persist(&path)
        .unwrap();
        // A temp from a provably-DEAD writer (a pid that is never a live process)
        // is reclaimed; a temp from a LIVE writer (this very process) is PRESERVED
        // so an in-flight atomic write is never corrupted out from under it.
        let dead_pid = u32::MAX - 7;
        let live_pid = std::process::id();
        let dead_tmp = dir.path().join(format!("receipt.json.tmp-{dead_pid}"));
        let live_tmp = dir.path().join(format!("receipt.json.tmp-{live_pid}"));
        std::fs::write(&dead_tmp, "x").unwrap();
        std::fs::write(&live_tmp, "x").unwrap();
        // Only the dead-pid temp is swept.
        assert_eq!(sweep_orphan_tmp(&path).unwrap(), 1);
        assert!(!dead_tmp.exists(), "the dead-writer temp is reclaimed");
        assert!(live_tmp.exists(), "the live-writer temp is preserved");
        // The active receipt survives and still loads.
        assert!(path.exists());
        assert!(Receipt::load(&path).is_ok());
        // A second sweep still preserves the live temp (nothing left to reclaim).
        assert_eq!(sweep_orphan_tmp(&path).unwrap(), 0);
        assert!(live_tmp.exists());
    }
}
