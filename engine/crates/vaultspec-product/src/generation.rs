//! Dashboard-owned unpublished generation authority
//! (a2a-product-provisioning W01.P01.S162).
//!
//! A generation becomes visible only when a complete active receipt selects it.
//! This module therefore creates the final `generations/<id>` name directly,
//! but leaves it unpublished: it never writes a receipt and never starts a
//! process. Creation is exclusive, owner-private, and bound to the product path
//! authority. The returned token retains both the generations-parent identity
//! and the new directory identity so later verification or discard cannot be
//! redirected to a substituted filesystem object.
//!
//! Generation mutation is an install transaction operation. Every mutating
//! entrypoint requires a held [`crate::locking::InstallLockGuard`], keeping the
//! hard abandoned-generation bound and active-receipt check serialized with
//! installer/updater work.

use std::path::{Path, PathBuf};

use crate::{
    locking::InstallLockGuard,
    paths::{PathError, ProductPaths},
};

/// Maximum number of generation directories not selected by the active
/// receipt. Creation refuses at the bound; it never guesses which retained or
/// partial generation is safe to evict.
pub const MAX_ABANDONED_GENERATIONS: usize = 8;

/// A final-name generation that exists on disk but has not been published by an
/// active receipt. Its filesystem identities are deliberately opaque: callers
/// use [`GenerationAuthority::verify`] and
/// [`GenerationAuthority::discard`] rather than comparing paths themselves.
#[derive(Debug)]
pub struct UnpublishedGeneration {
    generation: String,
    path: PathBuf,
    parent_identity: DirectoryIdentity,
    directory_identity: DirectoryIdentity,
}

impl UnpublishedGeneration {
    /// The validated generation identifier.
    #[must_use]
    pub fn generation(&self) -> &str {
        &self.generation
    }

    /// The caller-owned destination directory to populate. Writers must retain
    /// their own no-follow directory lease while materializing content; this
    /// token lets the dashboard revalidate that lease before publication.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }
}

/// Dashboard authority for final-name unpublished generation roots.
#[derive(Debug, Clone)]
pub struct GenerationAuthority {
    paths: ProductPaths,
}

impl GenerationAuthority {
    /// Bind generation authority to the product-derived path set.
    #[must_use]
    pub fn new(paths: ProductPaths) -> Self {
        Self { paths }
    }

    /// Exclusively create an owner-private final-name generation directory.
    ///
    /// The generations parent must already have been created through product
    /// bootstrap. Existing links/reparse points, a changed parent identity, an
    /// existing final name, or the hard abandoned-generation bound all fail
    /// closed. This function never creates or changes the active receipt.
    pub fn create_unpublished(
        &self,
        _install_lock: &InstallLockGuard,
        generation: &str,
        active_generation: Option<&str>,
    ) -> Result<UnpublishedGeneration, GenerationError> {
        let path = self.paths.generation_dir(generation)?;
        let parent = self.authority_root()?;
        self.require_capacity(active_generation)?;

        let mut builder = std::fs::DirBuilder::new();
        builder.recursive(false);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        if let Err(error) = builder.create(&path) {
            return if error.kind() == std::io::ErrorKind::AlreadyExists {
                Err(GenerationError::AlreadyExists(generation.to_string()))
            } else {
                Err(GenerationError::Io(error))
            };
        }

        // Re-resolve both objects after creation. If the parent was exchanged
        // between the preflight and create calls, the newly created directory
        // is intentionally left inert rather than deleting through an
        // untrusted path.
        let current_parent = self.authority_root()?;
        if current_parent.identity != parent.identity
            || current_parent.canonical_path != parent.canonical_path
        {
            return Err(GenerationError::ParentIdentityChanged);
        }
        ensure_direct_child(&path, &parent.canonical_path)?;
        let directory_identity = directory_identity(&path)?;

        Ok(UnpublishedGeneration {
            generation: generation.to_string(),
            path,
            parent_identity: parent.identity,
            directory_identity,
        })
    }

    /// Revalidate that an unpublished-generation token still names the same
    /// direct child of the same generations parent.
    pub fn verify(&self, generation: &UnpublishedGeneration) -> Result<(), GenerationError> {
        let expected = self.paths.generation_dir(&generation.generation)?;
        if expected != generation.path {
            return Err(GenerationError::IdentityChanged(
                generation.generation.clone(),
            ));
        }
        let parent = self.authority_root()?;
        if parent.identity != generation.parent_identity {
            return Err(GenerationError::ParentIdentityChanged);
        }
        ensure_direct_child(&expected, &parent.canonical_path)?;
        if directory_identity(&expected)? != generation.directory_identity {
            return Err(GenerationError::IdentityChanged(
                generation.generation.clone(),
            ));
        }
        Ok(())
    }

    /// Discard exactly the unpublished filesystem object represented by
    /// `generation`.
    ///
    /// A malformed/unreadable receipt fails closed. A settled active receipt
    /// selecting this generation makes it immutable to this operation. The
    /// retained parent and directory identities are rechecked immediately
    /// before recursive removal, while the caller-held install lock serializes
    /// product-owned receipt and generation mutation.
    pub fn discard(
        &self,
        _install_lock: &InstallLockGuard,
        generation: &UnpublishedGeneration,
        active_generation: Option<&str>,
    ) -> Result<(), GenerationError> {
        if let Some(active) = active_generation {
            let _ = self.paths.generation_dir(active)?;
        }
        if active_generation == Some(generation.generation()) {
            return Err(GenerationError::SelectedByActiveReceipt(
                generation.generation.clone(),
            ));
        }
        self.verify(generation)?;
        std::fs::remove_dir_all(&generation.path)?;
        Ok(())
    }

    fn authority_root(&self) -> Result<AuthorityRoot, GenerationError> {
        let root = self.paths.root();
        let generations = self.paths.generations_dir();
        let _ = directory_identity(root)?;
        let identity = directory_identity(&generations)?;
        let canonical_root = std::fs::canonicalize(root)?;
        let canonical_path = std::fs::canonicalize(&generations)?;
        if canonical_path.parent() != Some(canonical_root.as_path()) {
            return Err(GenerationError::OutsideProductRoot(generations));
        }
        Ok(AuthorityRoot {
            canonical_path,
            identity,
        })
    }

    fn require_capacity(&self, active: Option<&str>) -> Result<(), GenerationError> {
        if let Some(active) = active {
            let _ = self.paths.generation_dir(active)?;
        }
        let generations = self.paths.generations_dir();
        let mut abandoned = 0usize;
        for entry in std::fs::read_dir(&generations)? {
            let entry = entry?;
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                return Err(GenerationError::UnsafeFilesystemObject(entry.path()));
            };
            if active == Some(name.as_str()) {
                continue;
            }
            // The generations directory contains generation roots only. A file,
            // symlink, reparse point, or invalid generation name is not silently
            // ignored because doing so would make the resource bound bypassable.
            let _ = self.paths.generation_dir(&name)?;
            let _ = directory_identity(&entry.path())?;
            abandoned += 1;
            if abandoned >= MAX_ABANDONED_GENERATIONS {
                return Err(GenerationError::AbandonedGenerationLimit {
                    limit: MAX_ABANDONED_GENERATIONS,
                });
            }
        }
        Ok(())
    }
}

#[derive(Debug)]
struct AuthorityRoot {
    canonical_path: PathBuf,
    identity: DirectoryIdentity,
}

#[derive(Debug, PartialEq, Eq)]
struct DirectoryIdentity(same_file::Handle);

fn directory_identity(path: &Path) -> Result<DirectoryIdentity, GenerationError> {
    let metadata = std::fs::symlink_metadata(path)?;
    if metadata_is_link(&metadata) || !metadata.is_dir() {
        return Err(GenerationError::UnsafeFilesystemObject(path.to_path_buf()));
    }

    Ok(DirectoryIdentity(same_file::Handle::from_path(path)?))
}

fn metadata_is_link(metadata: &std::fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        return metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0;
    }
    #[cfg(not(windows))]
    false
}

fn ensure_direct_child(path: &Path, parent: &Path) -> Result<(), GenerationError> {
    let canonical = std::fs::canonicalize(path)?;
    if canonical.parent() != Some(parent) {
        return Err(GenerationError::OutsideProductRoot(path.to_path_buf()));
    }
    Ok(())
}

/// Why unpublished generation authority refused an operation.
#[derive(Debug)]
pub enum GenerationError {
    /// The generation identifier violated the product path grammar.
    Path(PathError),
    /// The final generation name already exists; it is never reused or merged.
    AlreadyExists(String),
    /// The explicit abandoned-generation hard bound was reached.
    AbandonedGenerationLimit { limit: usize },
    /// A link, reparse point, file, or other unsafe object occupied an
    /// authority-bearing filesystem location.
    UnsafeFilesystemObject(PathBuf),
    /// Canonical containment did not prove the object was a direct generation
    /// child of the product root.
    OutsideProductRoot(PathBuf),
    /// The generations parent changed identity during the operation.
    ParentIdentityChanged,
    /// The generation path no longer names the retained filesystem identity.
    IdentityChanged(String),
    /// The active complete receipt selects the generation, so discard is
    /// forbidden.
    SelectedByActiveReceipt(String),
    /// Filesystem operation failed.
    Io(std::io::Error),
}

impl std::fmt::Display for GenerationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Path(error) => write!(f, "generation path refused: {error}"),
            Self::AlreadyExists(generation) => {
                write!(f, "generation {generation:?} already exists")
            }
            Self::AbandonedGenerationLimit { limit } => write!(
                f,
                "refusing generation creation at the abandoned-generation limit ({limit})"
            ),
            Self::UnsafeFilesystemObject(path) => write!(
                f,
                "unsafe filesystem object at generation authority path {path:?}"
            ),
            Self::OutsideProductRoot(path) => {
                write!(f, "generation path is not a direct product child: {path:?}")
            }
            Self::ParentIdentityChanged => {
                write!(f, "generations parent filesystem identity changed")
            }
            Self::IdentityChanged(generation) => {
                write!(f, "generation {generation:?} filesystem identity changed")
            }
            Self::SelectedByActiveReceipt(generation) => write!(
                f,
                "active receipt selects generation {generation:?}; discard refused"
            ),
            Self::Io(error) => write!(f, "generation filesystem error: {error}"),
        }
    }
}

impl std::error::Error for GenerationError {}

impl From<PathError> for GenerationError {
    fn from(error: PathError) -> Self {
        Self::Path(error)
    }
}

impl From<std::io::Error> for GenerationError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::locking::{Actor, InstallLock};

    #[test]
    fn final_name_is_exclusive_unpublished_and_identity_checked() {
        let temp = tempfile::tempdir().unwrap();
        let paths = ProductPaths::under_app_home(temp.path());
        paths.ensure().unwrap();
        let guard = InstallLock::new(paths.install_lock_path())
            .acquire(Actor::Installer, "generation-unit")
            .unwrap()
            .unwrap();
        let authority = GenerationAuthority::new(paths.clone());

        let generation = authority
            .create_unpublished(&guard, "release-a", None)
            .unwrap();
        assert_eq!(
            generation.path(),
            paths.generation_dir("release-a").unwrap()
        );
        assert!(!paths.receipt_path().exists());
        authority.verify(&generation).unwrap();
        assert!(matches!(
            authority.create_unpublished(&guard, "release-a", None),
            Err(GenerationError::AlreadyExists(g)) if g == "release-a"
        ));

        std::fs::write(generation.path().join("payload"), b"real bytes").unwrap();
        authority.discard(&guard, &generation, None).unwrap();
        assert!(!generation.path().exists());
    }
}
