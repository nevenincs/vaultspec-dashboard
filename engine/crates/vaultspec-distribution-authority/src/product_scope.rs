//! Retained product-root scope and the per-process verification lease.
//!
//! The scope retains the exact product root the verification was requested
//! against and reproves the named relationship at every trust boundary; the
//! process lease bounds concurrent verifications per product root.

#[cfg(unix)]
use std::fs::File;
use std::path::Path;
use std::sync::Mutex;

use crate::VerificationError;

#[derive(Debug)]
pub(crate) struct ProductRootScope {
    pub(crate) authority: cap_std::fs::Dir,
    #[cfg(unix)]
    directory: File,
    #[cfg(unix)]
    device: u64,
    #[cfg(unix)]
    inode: u64,
    #[cfg(windows)]
    identity: vaultspec_windows_authority::HighResFileId,
}

impl ProductRootScope {
    #[cfg(unix)]
    pub(crate) fn process_key(&self) -> ProductRootKey {
        ProductRootKey::Unix {
            device: self.device,
            inode: self.inode,
        }
    }

    #[cfg(windows)]
    pub(crate) fn process_key(&self) -> ProductRootKey {
        ProductRootKey::Windows {
            volume_serial_number: self.identity.volume_serial_number,
            file_id: self.identity.file_id,
        }
    }

    pub(crate) fn ensure_named(&self, path: &Path) -> Result<(), VerificationError> {
        if self.matches(path) {
            Ok(())
        } else {
            Err(VerificationError::ProductRootMismatch)
        }
    }

    #[cfg(unix)]
    pub(crate) fn retain(path: &Path) -> Result<Self, VerificationError> {
        use std::os::unix::fs::MetadataExt as _;

        let named = path
            .symlink_metadata()
            .map_err(|_| VerificationError::ProductRootMismatch)?;
        let directory = File::open(path).map_err(|_| VerificationError::ProductRootMismatch)?;
        let retained = directory
            .metadata()
            .map_err(|_| VerificationError::ProductRootMismatch)?;
        if !named.is_dir()
            || named.file_type().is_symlink()
            || named.dev() != retained.dev()
            || named.ino() != retained.ino()
            || named.uid() != nix::unistd::Uid::effective().as_raw()
        {
            return Err(VerificationError::ProductRootMismatch);
        }
        let authority = cap_std::fs::Dir::from_std_file(
            directory
                .try_clone()
                .map_err(|_| VerificationError::ProductRootMismatch)?,
        );
        Ok(Self {
            authority,
            directory,
            device: retained.dev(),
            inode: retained.ino(),
        })
    }

    #[cfg(windows)]
    pub(crate) fn retain(path: &Path) -> Result<Self, VerificationError> {
        // An OS failure and an identity mismatch are different findings; keep
        // the cause rather than collapsing both into "mismatch".
        let identity = vaultspec_windows_authority::AuthorityFile::identity_at_path(path)
            .map_err(VerificationError::ProductRootUnavailable)?;
        let authority = cap_std::fs::Dir::open_ambient_dir(path, cap_std::ambient_authority())
            .map_err(VerificationError::ProductRootUnavailable)?;
        if vaultspec_windows_authority::AuthorityFile::identity_at_path(path)
            .map_err(VerificationError::ProductRootUnavailable)?
            != identity
        {
            return Err(VerificationError::ProductRootMismatch);
        }
        Ok(Self {
            authority,
            identity,
        })
    }

    #[cfg(unix)]
    pub(crate) fn matches(&self, path: &Path) -> bool {
        use std::os::unix::fs::MetadataExt as _;

        let Ok(retained) = self.directory.metadata() else {
            return false;
        };
        let Ok(named) = path.symlink_metadata() else {
            return false;
        };
        named.is_dir()
            && !named.file_type().is_symlink()
            && retained.dev() == self.device
            && retained.ino() == self.inode
            && named.dev() == self.device
            && named.ino() == self.inode
    }

    #[cfg(windows)]
    pub(crate) fn matches(&self, path: &Path) -> bool {
        vaultspec_windows_authority::AuthorityFile::identity_at_path(path)
            .is_ok_and(|identity| identity == self.identity)
    }
}

#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub(crate) enum ProductRootKey {
    #[cfg(unix)]
    Unix { device: u64, inode: u64 },
    #[cfg(windows)]
    Windows {
        volume_serial_number: u64,
        file_id: u128,
    },
}

const MAX_ACTIVE_PRODUCT_ROOTS: usize = 16;
static ACTIVE_PRODUCT_ROOTS: Mutex<Vec<ProductRootKey>> = Mutex::new(Vec::new());

#[derive(Debug)]
pub(crate) struct ProcessVerificationLease {
    key: ProductRootKey,
}

impl ProcessVerificationLease {
    pub(crate) fn acquire(key: ProductRootKey) -> Result<Self, VerificationError> {
        let mut active = ACTIVE_PRODUCT_ROOTS
            .lock()
            .map_err(|_| VerificationError::DatastoreUnavailable)?;
        if active.contains(&key) || active.len() == MAX_ACTIVE_PRODUCT_ROOTS {
            return Err(VerificationError::VerificationInProgress);
        }
        active.push(key);
        Ok(Self { key })
    }
}

impl Drop for ProcessVerificationLease {
    fn drop(&mut self) {
        let mut active = ACTIVE_PRODUCT_ROOTS
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(position) = active.iter().position(|key| *key == self.key) {
            active.swap_remove(position);
        }
    }
}
