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
use std::io::Read;
use std::marker::PhantomData;
use std::path::Path;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::locking::{InstallLockGuard, LockAuthorityError};
use crate::manifest::{ReleaseIdentity, Target};
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
            Self::Io { source, .. } => Some(source),
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
struct JournalHandle {
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
    let (identity, identity_handle) = {
        use std::os::unix::fs::MetadataExt;

        (
            JournalIdentity {
                kind: 1,
                first: metadata.dev(),
                second: u128::from(metadata.ino()),
            },
            (),
        )
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
    #[cfg(unix)]
    let _ = identity_handle;
    handle.validate()?;
    if !crate::discovery::handoff_is_owner_restricted(path) {
        return Err(std::io::Error::other(
            "journal access control is not owner-restricted",
        ));
    }
    Ok(handle)
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
        if crate::locking::process_is_alive(pid) {
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
        let empty_proofs = std::array::from_fn(|_| std::array::from_fn(|_| None));
        let bytes = encode_journal_image(&slots, &empty_proofs);
        let path = fixture.paths.active_receipts_journal_path();
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
