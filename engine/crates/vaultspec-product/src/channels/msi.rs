//! MSI channel authority adapter (a2a-product-provisioning W03.P06.S158).
//!
//! The Windows Installer owns activation for this channel. The product delegates
//! install, upgrade, downgrade, rollback, repair, and removal to the Windows
//! Installer, targeting the candidate and retained prior product packages, and
//! never rewrites any installer-owned file. This adapter can only ever authorize
//! one of a CLOSED set of Windows Installer operations against a phase-zero
//! [`ProvenManager`] and a [`PinnedArtifact`] (a product package); no free-form
//! installer command is representable and no installer-owned file is written here.

use crate::channels::{
    AuthorizedManagerOperation, InstallProvenanceAuthority, PinnedArtifact, ProvenManager,
};
use crate::receipt::Channel;

/// The closed set of Windows Installer operations the product may delegate.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MsiOperation {
    /// Install the candidate product package.
    Install,
    /// Upgrade to the candidate product package.
    Upgrade,
    /// Downgrade to a retained prior product package.
    Downgrade,
    /// Roll back to the retained prior product package.
    Rollback,
    /// Repair the installed product package in place.
    Repair,
    /// Remove the installed product package.
    Remove,
}

impl MsiOperation {
    fn label(self) -> &'static str {
        match self {
            Self::Install => "msi-install",
            Self::Upgrade => "msi-upgrade",
            Self::Downgrade => "msi-downgrade",
            Self::Rollback => "msi-rollback",
            Self::Repair => "msi-repair",
            Self::Remove => "msi-remove",
        }
    }
}

/// The Windows Installer (MSI) channel authority.
#[derive(Debug, Default, Clone, Copy)]
pub struct MsiAuthority;

impl MsiAuthority {
    /// Construct the MSI channel authority.
    #[must_use]
    pub fn new() -> Self {
        Self
    }

    /// The installer channel this adapter authorizes.
    #[must_use]
    pub fn channel(&self) -> Channel {
        Channel::Msi
    }

    /// Whether a package manager owns file activation. Always true for the MSI
    /// channel — the Windows Installer owns activation and rollback.
    #[must_use]
    pub fn manager_owns_activation(&self) -> bool {
        true
    }

    /// Mint the sealed provenance for the MSI channel.
    #[allow(
        dead_code,
        reason = "S158 mints MSI provenance before the S52 transaction consumes it"
    )]
    pub(crate) fn provenance(&self) -> InstallProvenanceAuthority {
        InstallProvenanceAuthority::mint(Channel::Msi, true)
    }

    /// Authorize one closed Windows Installer operation for a candidate or
    /// retained-prior product package against a phase-zero-proven installer. The
    /// result is a validated descriptor the external updater delegates to the
    /// Windows Installer; it rewrites no installer-owned file.
    #[must_use]
    pub fn authorize(
        &self,
        proven: &ProvenManager,
        operation: MsiOperation,
        artifact: &PinnedArtifact,
    ) -> AuthorizedManagerOperation {
        AuthorizedManagerOperation::new(Channel::Msi, proven, operation.label(), artifact)
    }
}

#[cfg(test)]
#[path = "msi/tests.rs"]
mod tests;
