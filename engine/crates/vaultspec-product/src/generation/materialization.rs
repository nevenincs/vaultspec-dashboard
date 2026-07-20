//! The crate-private materialization-window seams over the exact retained
//! generation (archive-materialization D4): a bounded root handle for
//! descriptor-relative population, the Windows exclusive↔materializing lease
//! swap, and the final generations-parent synchronization.

use super::*;

impl UnpublishedGeneration<'_, '_> {
    /// Crate-private materializer seam: a fresh bounded root handle over the
    /// exact retained generation for descriptor-relative population
    /// (archive-materialization D4). The retained token authority is
    /// unchanged; identity equality is proven before the handle is returned.
    #[cfg(unix)]
    pub(crate) fn open_materialization_root(
        &mut self,
    ) -> Result<rustix::fd::OwnedFd, GenerationError> {
        self.validate_retained()?;
        let opened = self
            .product
            .generations
            .open_child(OsStr::new(&self.generation))
            .map_err(GenerationError::Io)?;
        if opened.identity() != self.identity {
            return Err(GenerationError::IdentityChanged(self.generation.clone()));
        }
        Ok(opened.directory)
    }

    /// Crate-private materializer seam: release the exclusive deny-write lease
    /// and hand the writer a write-shared, delete-denied lease on the SAME
    /// verified identity. Until [`Self::end_materialization`] restores
    /// exclusivity, general product operations on this token fail typed.
    #[cfg(windows)]
    pub(crate) fn open_materialization_root(
        &mut self,
    ) -> Result<vaultspec_windows_authority::MaterializationDirectory, GenerationError> {
        self.validate_retained()?;
        match std::mem::replace(&mut self.authority, RootAuthority::Materializing) {
            RootAuthority::Exclusive(exclusive) => drop(exclusive),
            RootAuthority::Materializing => {
                return Err(GenerationError::RootAuthorityMaterializing);
            }
        }
        let root = self
            .product
            .generations
            .directory
            .open_materialization_child(OsStr::new(&self.generation))
            .map_err(GenerationError::Io)?;
        if root.identity() != self.identity {
            return Err(GenerationError::IdentityChanged(self.generation.clone()));
        }
        Ok(root)
    }

    /// Close the materialization window: on Unix a retained-authority
    /// revalidation; on Windows reacquire and revalidate the exclusive lease
    /// after the writer's lease has been dropped.
    #[cfg(unix)]
    pub(crate) fn end_materialization(&mut self) -> Result<(), GenerationError> {
        self.validate_retained()
    }

    /// See the Unix variant. The caller must have dropped the materialization
    /// lease first; the exclusive reopen otherwise fails on sharing.
    #[cfg(windows)]
    pub(crate) fn end_materialization(&mut self) -> Result<(), GenerationError> {
        if !matches!(self.authority, RootAuthority::Materializing) {
            return Err(GenerationError::RootAuthorityMaterializing);
        }
        let reopened = self
            .product
            .generations
            .open_child(OsStr::new(&self.generation))
            .map_err(GenerationError::Io)?;
        if reopened.identity() != self.identity {
            return Err(GenerationError::IdentityChanged(self.generation.clone()));
        }
        self.authority = RootAuthority::Exclusive(reopened);
        self.validate_retained()
    }

    /// Synchronize the retained generations parent after the writer's final
    /// bottom-up tree synchronization (archive-materialization D5). Windows
    /// has no directory-synchronization primitive under these leases; ordering
    /// there rests on the write-through installs and the post-materialization
    /// verification, and production Windows activation remains gated.
    pub(crate) fn synchronize_generations_parent(&self) -> Result<(), GenerationError> {
        self.validate_retained()?;
        #[cfg(unix)]
        rustix::fs::fsync(self.product.generations.fd())?;
        self.validate_retained()
    }
}
