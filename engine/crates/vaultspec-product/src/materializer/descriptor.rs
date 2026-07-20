//! The durable `materialize.v1` descriptor (archive-materialization D6,
//! acceptance Refinement B).
//!
//! Materialization owns its OWN transaction-reserved descriptor, durably
//! written and parent-synchronized before generation creation and advanced at
//! every phase boundary. It composes with — and never mutates — the outer
//! `update.v1` descriptor: recovery reads both, and the update descriptor
//! remains the outer authority.

use serde::{Deserialize, Serialize};

use crate::locking::InstallLockGuard;
use crate::paths::ProductPaths;
use crate::transaction::{read_bounded_nofollow, sync_dir, write_new_nofollow};

use super::MaterializeError;

const DESCRIPTOR_NAME: &str = "materialize.v1";
const DESCRIPTOR_TMP: &str = "materialize.v1.tmp";
const DESCRIPTOR_VERSION: u8 = 1;
const MAX_DESCRIPTOR_BYTES: u64 = 64 * 1024;

/// The minimum durable materialization phases (archive-materialization D6).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MaterializePhase {
    /// The archive plan proved the closed grammar and manifest inventory.
    Preflighted,
    /// The exact final-name generation root exists and is retained.
    RootCreated,
    /// Entry decode/install is in progress.
    Materializing,
    /// Every entry, derived directory, root, and parent is synchronized.
    TreeSynchronized,
    /// The complete double-scan release verification succeeded.
    Verified,
    /// The fixed receipt settled on the candidate; only retirement remains.
    ReceiptSettled,
}

/// The durable materialization descriptor. Its facts bind the authenticated
/// release, archive and member-manifest identities, and the product-derived
/// generation name; it carries no secret.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MaterializeDescriptor {
    version: u8,
    phase: MaterializePhase,
    release_identity: String,
    target: String,
    archive_sha256: String,
    archive_length: u64,
    member_manifest_sha256: String,
    generation: String,
}

impl MaterializeDescriptor {
    pub(super) fn new(
        phase: MaterializePhase,
        release_identity: &str,
        target: &str,
        archive_sha256: &str,
        archive_length: u64,
        member_manifest_sha256: &str,
        generation: &str,
    ) -> Self {
        Self {
            version: DESCRIPTOR_VERSION,
            phase,
            release_identity: release_identity.to_string(),
            target: target.to_string(),
            archive_sha256: archive_sha256.to_string(),
            archive_length,
            member_manifest_sha256: member_manifest_sha256.to_string(),
            generation: generation.to_string(),
        }
    }

    pub(super) fn with_phase(&self, phase: MaterializePhase) -> Self {
        let mut next = self.clone();
        next.phase = phase;
        next
    }

    /// The durable materialization phase.
    #[must_use]
    pub fn phase(&self) -> MaterializePhase {
        self.phase
    }

    /// The authenticated release identity this materialization serves.
    #[must_use]
    pub fn release_identity(&self) -> &str {
        &self.release_identity
    }

    /// The product-derived final generation name being populated.
    #[must_use]
    pub fn generation(&self) -> &str {
        &self.generation
    }

    /// The TUF-verified archive SHA-256 (lowercase hex).
    #[must_use]
    pub fn archive_sha256(&self) -> &str {
        &self.archive_sha256
    }

    /// The cohort-authenticated member-manifest SHA-256 (lowercase hex).
    #[must_use]
    pub fn member_manifest_sha256(&self) -> &str {
        &self.member_manifest_sha256
    }
}

pub(super) fn write_descriptor(
    paths: &ProductPaths,
    guard: &InstallLockGuard,
    descriptor: &MaterializeDescriptor,
) -> Result<(), MaterializeError> {
    guard
        .verify_for_product(paths)
        .map_err(|error| MaterializeError::Authority(error.to_string()))?;
    let bytes = serde_json::to_vec(descriptor)
        .map_err(|error| MaterializeError::Descriptor(error.to_string()))?;
    if bytes.len() as u64 > MAX_DESCRIPTOR_BYTES {
        return Err(MaterializeError::Descriptor(
            "descriptor exceeds byte bound".to_string(),
        ));
    }
    let dir = paths.transaction_dir();
    write_new_nofollow(&dir.join(DESCRIPTOR_TMP), &bytes)
        .map_err(|error| MaterializeError::Descriptor(error.to_string()))?;
    std::fs::rename(dir.join(DESCRIPTOR_TMP), dir.join(DESCRIPTOR_NAME))
        .map_err(|error| MaterializeError::io("materialize descriptor commit rename", error))?;
    sync_dir(&dir).map_err(|error| MaterializeError::Descriptor(error.to_string()))?;
    Ok(())
}

/// Read the durable materialization descriptor under the held guard, if one
/// exists. The copied updater's recovery reads this alongside `update.v1`.
pub fn read_materialize_descriptor(
    paths: &ProductPaths,
    guard: &InstallLockGuard,
) -> Result<Option<MaterializeDescriptor>, MaterializeError> {
    guard
        .verify_for_product(paths)
        .map_err(|error| MaterializeError::Authority(error.to_string()))?;
    let path = paths.transaction_dir().join(DESCRIPTOR_NAME);
    let bytes = match read_bounded_nofollow(&path, MAX_DESCRIPTOR_BYTES)
        .map_err(|error| MaterializeError::Descriptor(error.to_string()))?
    {
        Some(bytes) => bytes,
        None => return Ok(None),
    };
    let descriptor: MaterializeDescriptor = serde_json::from_slice(&bytes)
        .map_err(|error| MaterializeError::Descriptor(error.to_string()))?;
    if descriptor.version != DESCRIPTOR_VERSION {
        return Err(MaterializeError::Descriptor(
            "unsupported materialize descriptor version".to_string(),
        ));
    }
    Ok(Some(descriptor))
}

pub(super) fn clear_descriptor(
    paths: &ProductPaths,
    guard: &InstallLockGuard,
) -> Result<(), MaterializeError> {
    guard
        .verify_for_product(paths)
        .map_err(|error| MaterializeError::Authority(error.to_string()))?;
    match std::fs::remove_file(paths.transaction_dir().join(DESCRIPTOR_NAME)) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(MaterializeError::io("materialize descriptor clear", error)),
    }
    sync_dir(&paths.transaction_dir())
        .map_err(|error| MaterializeError::Descriptor(error.to_string()))
}
