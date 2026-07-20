//! Per-channel installation authority adapters (a2a-product-provisioning W03.P06).
//!
//! Every installer channel — the product-owned self-install updater, Scoop,
//! WinGet, and the Windows Installer MSI — has ONE distinct authority adapter.
//! The adapter is the sole sanctioned source of that channel's
//! [`InstallProvenanceAuthority`], the sealed proof of which authority owns a
//! generation's file activation and rollback. Its channel and manager-ownership
//! facts are what later mutation authority is gated on (provisioning-authority
//! ADR D1: "Install channel and manager ownership come from a sealed adapter
//! capability, not a caller-selected `Channel` enum").
//!
//! The provenance mint is private to this module, so no code outside the channel
//! adapters — not `manifest`, not a caller, not a candidate tree — can forge a
//! provenance for a channel it does not own. `manifest` may hold the sealed type
//! but cannot construct one.

use std::path::{Path, PathBuf};

use crate::receipt::Channel;

pub mod msi;
pub mod scoop;
pub mod self_install;
pub mod winget;

const MAX_ARTIFACT_IDENTITY_BYTES: usize = 256;

/// A pinned, complete release artifact a manager operation targets.
///
/// Identified by a bounded identity and its lowercase SHA-256 digest, never a
/// path — a manager operation may only ever target a pinned complete artifact,
/// so a candidate cannot point a manager at an arbitrary file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PinnedArtifact {
    identity: String,
    digest: String,
}

impl PinnedArtifact {
    /// Validate a pinned artifact from its bounded identity and lowercase
    /// SHA-256 digest.
    pub fn new(
        identity: impl Into<String>,
        digest: impl Into<String>,
    ) -> Result<Self, ChannelError> {
        let identity = identity.into();
        let digest = digest.into();
        if identity.is_empty()
            || identity.len() > MAX_ARTIFACT_IDENTITY_BYTES
            || identity.bytes().any(|b| b == 0 || b.is_ascii_control())
        {
            return Err(ChannelError::InvalidArtifact {
                detail: "pinned artifact identity must be non-empty, bounded, control-free text",
            });
        }
        if digest.len() != 64
            || !digest
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err(ChannelError::InvalidArtifact {
                detail: "pinned artifact digest must be a lowercase SHA-256 digest",
            });
        }
        Ok(Self { identity, digest })
    }

    /// The pinned artifact identity.
    #[must_use]
    pub fn identity(&self) -> &str {
        &self.identity
    }

    /// The pinned artifact lowercase SHA-256 digest.
    #[must_use]
    pub fn digest(&self) -> &str {
        &self.digest
    }
}

/// A package manager proven present by a phase-zero preflight.
///
/// A manager operation can be authorized only against one of these, so the
/// product never invokes a manager it did not first prove. Construction requires
/// that the resolved program is a real regular file — a minimal phase-zero proof.
#[derive(Debug, Clone)]
pub struct ProvenManager {
    program: PathBuf,
}

impl ProvenManager {
    /// Prove a manager present at a resolved program path. Returns `None` when the
    /// path is absent or is not a regular file.
    #[must_use]
    pub fn prove(program: impl Into<PathBuf>) -> Option<Self> {
        let program = program.into();
        let metadata = std::fs::symlink_metadata(&program).ok()?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return None;
        }
        Some(Self { program })
    }

    /// The proven manager program path.
    #[must_use]
    pub fn program(&self) -> &Path {
        &self.program
    }
}

/// A validated, ready-to-delegate manager operation.
///
/// It names the channel, the proven manager program, the closed operation label,
/// and the pinned artifact. It carries NO authority to write manager-owned files;
/// delegation to the manager itself happens in the external updater. It is the
/// evidence that a manager operation was authorized against a proven manager and
/// a pinned artifact, never a free-form command.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorizedManagerOperation {
    channel: Channel,
    program: PathBuf,
    operation: &'static str,
    artifact: PinnedArtifact,
}

impl AuthorizedManagerOperation {
    fn new(
        channel: Channel,
        proven: &ProvenManager,
        operation: &'static str,
        artifact: &PinnedArtifact,
    ) -> Self {
        Self {
            channel,
            program: proven.program().to_path_buf(),
            operation,
            artifact: artifact.clone(),
        }
    }

    /// The installer channel that owns this operation.
    #[must_use]
    pub fn channel(&self) -> Channel {
        self.channel
    }

    /// The proven manager program the operation delegates to.
    #[must_use]
    pub fn program(&self) -> &Path {
        &self.program
    }

    /// The closed operation label (never a free-form command string).
    #[must_use]
    pub fn operation(&self) -> &'static str {
        self.operation
    }

    /// The pinned complete artifact the operation targets.
    #[must_use]
    pub fn artifact(&self) -> &PinnedArtifact {
        &self.artifact
    }
}

/// Why a channel operation could not be authorized.
#[derive(Debug)]
pub enum ChannelError {
    /// A pinned artifact violated the identity or digest grammar.
    InvalidArtifact {
        /// The specific violation.
        detail: &'static str,
    },
}

impl std::fmt::Display for ChannelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidArtifact { detail } => write!(f, "invalid pinned artifact: {detail}"),
        }
    }
}

impl std::error::Error for ChannelError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pinned_artifact_validates_identity_and_digest() {
        assert!(PinnedArtifact::new("pkg@1.0", "a".repeat(64)).is_ok());
        // Bad digests and empty/oversized identities are refused.
        assert!(PinnedArtifact::new("pkg@1.0", "a".repeat(63)).is_err());
        assert!(PinnedArtifact::new("pkg@1.0", "A".repeat(64)).is_err());
        assert!(PinnedArtifact::new("pkg@1.0", "z".repeat(64)).is_err());
        assert!(PinnedArtifact::new("", "a".repeat(64)).is_err());
        assert!(PinnedArtifact::new("a\u{1}b", "a".repeat(64)).is_err());
    }

    #[test]
    fn proving_a_present_file_succeeds_and_an_absent_path_fails() {
        let proven = ProvenManager::prove(std::env::current_exe().unwrap());
        assert!(proven.is_some());
        assert!(ProvenManager::prove("/definitely/not/a/real/manager").is_none());
    }
}

/// Sealed proof of which installer authority owns a generation's activation.
///
/// Non-cloneable and non-serializable. Constructed only by a product-owned
/// channel adapter through the module-private [`InstallProvenanceAuthority::mint`],
/// which is reachable only from this module and its channel-adapter children.
/// Its facts (the installer channel and whether a package manager owns file
/// activation) control later mutation authority.
#[derive(Debug)]
pub(crate) struct InstallProvenanceAuthority {
    channel: Channel,
    manager_owns_activation: bool,
}

impl InstallProvenanceAuthority {
    /// Mint provenance for one channel. Module-private: only the channel adapters
    /// below may call it, so a channel's authority can never be forged elsewhere.
    #[allow(
        dead_code,
        reason = "S51/S156-S158 mint provenance before the S52 transaction consumes it"
    )]
    fn mint(channel: Channel, manager_owns_activation: bool) -> Self {
        Self {
            channel,
            manager_owns_activation,
        }
    }

    /// The installer channel that owns activation for the bound generation.
    #[allow(
        dead_code,
        reason = "consumed by the S52 transaction and receipt-fact derivation"
    )]
    pub(crate) fn channel(&self) -> Channel {
        self.channel
    }

    /// Whether a package manager owns file activation for this channel. False for
    /// self-install (the product/updater owns activation and rollback); true for
    /// the manager channels.
    #[allow(
        dead_code,
        reason = "consumed by the S52 transaction and receipt-fact derivation"
    )]
    pub(crate) fn manager_owns_activation(&self) -> bool {
        self.manager_owns_activation
    }
}
