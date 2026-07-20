//! Self-install channel authority adapter (a2a-product-provisioning W03.P06.S51).
//!
//! For the self-install channel the copied external updater — not a package
//! manager — owns file activation and rollback. This adapter expresses that
//! channel's activation contract:
//!
//! - generations are created **final-name**: [`crate::generation::LockedProduct::create_unpublished`]
//!   establishes the exact final generation directory directly, never a staged
//!   temporary tree renamed into place, so there is no POSIX tree rename;
//! - a candidate is **activated only by atomic complete receipt selection** —
//!   the fixed active-receipt journal selects the generation, never a rename or
//!   symlink swap of the tree;
//! - the **prior generation is retained** untouched alongside the candidate, so a
//!   rollback re-selects it by receipt rather than restoring a moved tree.
//!
//! The adapter is the sole sanctioned source of the self-install
//! [`InstallProvenanceAuthority`] (channel self-install, manager ownership
//! false). Completeness verification of the created generation is performed by
//! the S52 transaction over the sealed release authority; this adapter owns the
//! channel identity and the final-name creation mechanism.

use crate::channels::InstallProvenanceAuthority;
use crate::generation::{CreateUnpublishedError, LockedProduct, UnpublishedGeneration};
use crate::receipt::Channel;

/// The product-owned self-install channel authority.
#[derive(Debug, Default, Clone, Copy)]
pub struct SelfInstallAuthority;

impl SelfInstallAuthority {
    /// Construct the self-install channel authority.
    #[must_use]
    pub fn new() -> Self {
        Self
    }

    /// The installer channel this adapter authorizes.
    #[must_use]
    pub fn channel(&self) -> Channel {
        Channel::SelfInstall
    }

    /// Whether a package manager owns file activation for this channel. Never for
    /// self-install: the product-owned updater owns activation and rollback.
    #[must_use]
    pub fn manager_owns_activation(&self) -> bool {
        false
    }

    /// Mint the sealed provenance for the self-install channel. The S52
    /// transaction consumes this to derive the receipt channel fact; a caller can
    /// never label a self-install as a manager-owned channel.
    #[allow(
        dead_code,
        reason = "S51 mints self-install provenance before the S52 transaction consumes it"
    )]
    pub(crate) fn provenance(&self) -> InstallProvenanceAuthority {
        InstallProvenanceAuthority::mint(Channel::SelfInstall, false)
    }

    /// Create a final-name unpublished candidate generation for the self-install
    /// channel.
    ///
    /// This delegates to the retained-generation authority, which creates the
    /// exact final generation name directly — there is no staging directory and
    /// no tree rename — so any prior generation is retained untouched. The
    /// returned token borrows the locked product uniquely, enforcing one live
    /// candidate at a time.
    pub fn create_candidate_generation<'product, 'lock>(
        &self,
        product: &'product mut LockedProduct<'lock>,
        generation: &str,
    ) -> Result<UnpublishedGeneration<'product, 'lock>, CreateUnpublishedError<'product, 'lock>>
    {
        product.create_unpublished(generation)
    }
}

#[cfg(test)]
#[path = "self_install/tests.rs"]
mod tests;
