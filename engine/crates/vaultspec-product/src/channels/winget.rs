//! WinGet channel authority adapter (a2a-product-provisioning W03.P06.S157).
//!
//! WinGet owns file activation for this channel: it installs, upgrades, and
//! removes the complete MSI through the Windows Package Manager and the Windows
//! Installer. The product delegates to WinGet and never writes any WinGet- or
//! Windows Installer-owned file. This adapter can only ever authorize one of a
//! CLOSED set of WinGet package/version operations against a phase-zero
//! [`ProvenManager`] and a [`PinnedArtifact`] (the complete MSI); no free-form
//! WinGet command is representable and no installer-owned file is written here.

use crate::channels::{
    AuthorizedManagerOperation, InstallProvenanceAuthority, PinnedArtifact, ProvenManager,
};
use crate::receipt::Channel;

/// The closed set of WinGet operations the product may delegate.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WinGetOperation {
    /// Install the pinned complete MSI package.
    Install,
    /// Upgrade to the pinned complete MSI package version.
    Upgrade,
    /// Uninstall the pinned complete MSI package.
    Uninstall,
}

impl WinGetOperation {
    fn label(self) -> &'static str {
        match self {
            Self::Install => "winget-install",
            Self::Upgrade => "winget-upgrade",
            Self::Uninstall => "winget-uninstall",
        }
    }
}

/// The WinGet channel authority.
#[derive(Debug, Default, Clone, Copy)]
pub struct WinGetAuthority;

impl WinGetAuthority {
    /// Construct the WinGet channel authority.
    #[must_use]
    pub fn new() -> Self {
        Self
    }

    /// The installer channel this adapter authorizes.
    #[must_use]
    pub fn channel(&self) -> Channel {
        Channel::WinGet
    }

    /// Whether a package manager owns file activation. Always true for WinGet.
    #[must_use]
    pub fn manager_owns_activation(&self) -> bool {
        true
    }

    /// Mint the sealed provenance for the WinGet channel.
    #[allow(
        dead_code,
        reason = "S157 mints WinGet provenance before the S52 transaction consumes it"
    )]
    pub(crate) fn provenance(&self) -> InstallProvenanceAuthority {
        InstallProvenanceAuthority::mint(Channel::WinGet, true)
    }

    /// Authorize one closed WinGet operation for the pinned complete MSI against a
    /// phase-zero-proven WinGet manager. The result is a validated descriptor the
    /// external updater delegates to WinGet; it writes no installer-owned file.
    #[must_use]
    pub fn authorize(
        &self,
        proven: &ProvenManager,
        operation: WinGetOperation,
        artifact: &PinnedArtifact,
    ) -> AuthorizedManagerOperation {
        AuthorizedManagerOperation::new(Channel::WinGet, proven, operation.label(), artifact)
    }
}

#[cfg(test)]
#[path = "winget/tests.rs"]
mod tests;
