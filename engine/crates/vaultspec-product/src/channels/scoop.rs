//! Scoop channel authority adapter (a2a-product-provisioning W03.P06.S156).
//!
//! Scoop owns file activation for this channel: it stages, activates, and rolls
//! back the release under its own apps/shims/cache/bucket state. The product
//! delegates to Scoop and never writes any Scoop-owned file. This adapter can
//! only ever authorize one of a CLOSED set of Scoop operations against a
//! phase-zero [`ProvenManager`] and a [`PinnedArtifact`] — there is no way to
//! express a free-form Scoop command, and there is no API here that writes a
//! Scoop-owned app, shim, cache entry, or bucket file.

use crate::channels::{
    AuthorizedManagerOperation, InstallProvenanceAuthority, PinnedArtifact, ProvenManager,
};
use crate::receipt::Channel;

/// The closed set of Scoop operations the product may delegate.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScoopOperation {
    /// Install the pinned complete archive.
    Install,
    /// Update to the pinned complete archive.
    Update,
    /// Uninstall the pinned complete archive.
    Uninstall,
}

impl ScoopOperation {
    fn label(self) -> &'static str {
        match self {
            Self::Install => "scoop-install",
            Self::Update => "scoop-update",
            Self::Uninstall => "scoop-uninstall",
        }
    }
}

/// The Scoop channel authority.
#[derive(Debug, Default, Clone, Copy)]
pub struct ScoopAuthority;

impl ScoopAuthority {
    /// Construct the Scoop channel authority.
    #[must_use]
    pub fn new() -> Self {
        Self
    }

    /// The installer channel this adapter authorizes.
    #[must_use]
    pub fn channel(&self) -> Channel {
        Channel::Scoop
    }

    /// Whether a package manager owns file activation. Always true for Scoop.
    #[must_use]
    pub fn manager_owns_activation(&self) -> bool {
        true
    }

    /// Mint the sealed provenance for the Scoop channel.
    #[allow(
        dead_code,
        reason = "S156 mints Scoop provenance before the S52 transaction consumes it"
    )]
    pub(crate) fn provenance(&self) -> InstallProvenanceAuthority {
        InstallProvenanceAuthority::mint(Channel::Scoop, true)
    }

    /// Authorize one closed Scoop operation for a pinned complete archive against
    /// a phase-zero-proven Scoop manager. The result is a validated descriptor the
    /// external updater delegates to Scoop; it writes no Scoop-owned file.
    #[must_use]
    pub fn authorize(
        &self,
        proven: &ProvenManager,
        operation: ScoopOperation,
        artifact: &PinnedArtifact,
    ) -> AuthorizedManagerOperation {
        AuthorizedManagerOperation::new(Channel::Scoop, proven, operation.label(), artifact)
    }
}

#[cfg(test)]
#[path = "scoop/tests.rs"]
mod tests;
