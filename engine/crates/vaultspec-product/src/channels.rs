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

use crate::receipt::Channel;

pub mod self_install;

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
