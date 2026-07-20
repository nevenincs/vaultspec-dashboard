//! The retained-archive borrow surface: the staged possession-bound archive,
//! its read/seek view, and the sealed synchronous materialization capability
//! (distribution-trust D3, archive-materialization D3).

use std::fmt;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};

use crate::{
    DistributionTarget, VerificationError, VerifiedDistributionRelease, hex_lower,
    validate_staged_bytes_async,
};

/// The anonymous staged archive retained after tough consumed and validated
/// its stream.  Fields are crate-visible so verification can construct it;
/// every later borrow revalidates length and digest through the same handle.
pub(crate) struct StagedArchive {
    pub(crate) file: File,
    pub(crate) expected_length: u64,
    pub(crate) expected_digest: Vec<u8>,
}

impl StagedArchive {
    fn file_mut(&mut self) -> &mut File {
        &mut self.file
    }

    pub(crate) async fn revalidate(&mut self) -> Result<(), VerificationError> {
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt as _;
            let metadata = self
                .file
                .metadata()
                .map_err(|_| VerificationError::StagingUnavailable)?;
            if metadata.nlink() != 0 || !metadata.is_file() {
                return Err(VerificationError::StagingUnavailable);
            }
        }
        let clone = self
            .file_mut()
            .try_clone()
            .map_err(|_| VerificationError::StagingUnavailable)?;
        let mut clone = tokio::fs::File::from_std(clone);
        validate_staged_bytes_async(&mut clone, self.expected_length, &self.expected_digest).await
    }
}

/// Read/seek-only view of the retained authenticated archive.
pub struct VerifiedArchiveReader<'a> {
    file: &'a mut File,
}

impl Read for VerifiedArchiveReader<'_> {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        self.file.read(buffer)
    }
}

impl Seek for VerifiedArchiveReader<'_> {
    fn seek(&mut self, position: SeekFrom) -> std::io::Result<u64> {
        self.file.seek(position)
    }
}

/// Sealed synchronous materialization capability over the retained archive.
///
/// Constructed only by [`VerifiedDistributionRelease::materialization_source`]
/// after a same-handle length/digest revalidation.  The unique borrow keeps the
/// verified release — and therefore the verification lock and product-root
/// scope — alive for the whole materialization.  The product materializer
/// consumes this synchronously, so `tough` and its async runtime never leave
/// this crate (distribution-trust D3), and no caller-supplied path or digest
/// can reconnect verification to provisioning (archive-materialization D3).
pub struct MaterializationSource<'release> {
    archive: &'release mut File,
    archive_length: u64,
    archive_sha256: &'release [u8],
    target: DistributionTarget,
    member_manifest_sha256: &'release str,
    component_lock: &'release [u8],
    canonical_cohort: &'release [u8],
    release_identity: &'release str,
    capsule_root: &'release str,
}

impl fmt::Debug for MaterializationSource<'_> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("MaterializationSource")
            .field("target", &self.target)
            .field("release_identity", &self.release_identity)
            .field("archive_length", &self.archive_length)
            .finish_non_exhaustive()
    }
}

impl MaterializationSource<'_> {
    /// The verified target this archive was selected for.
    #[must_use]
    pub fn target(&self) -> DistributionTarget {
        self.target
    }

    /// The TUF-verified exact archive byte length.
    #[must_use]
    pub fn archive_length(&self) -> u64 {
        self.archive_length
    }

    /// The TUF-verified archive SHA-256, lowercase hex.
    #[must_use]
    pub fn archive_sha256_hex(&self) -> String {
        hex_lower(self.archive_sha256)
    }

    /// The cohort-authenticated member-manifest SHA-256 for the selected
    /// target, lowercase hex.  The materializer locates the installed member
    /// manifest only by this digest.
    #[must_use]
    pub fn member_manifest_sha256(&self) -> &str {
        self.member_manifest_sha256
    }

    /// The verified decoded component-lock bytes.
    #[must_use]
    pub fn component_lock(&self) -> &[u8] {
        self.component_lock
    }

    /// The canonical RFC 8785 cohort bytes exactly as authenticated.
    #[must_use]
    pub fn canonical_cohort(&self) -> &[u8] {
        self.canonical_cohort
    }

    /// The verified release identity.
    #[must_use]
    pub fn release_identity(&self) -> &str {
        self.release_identity
    }

    /// The cohort-declared portable capsule root.
    #[must_use]
    pub fn capsule_root(&self) -> &str {
        self.capsule_root
    }

    /// Borrow the retained archive bytes for one bounded synchronous pass.
    /// The reader is rewound before each borrow.
    pub fn archive(&mut self) -> std::io::Result<VerifiedArchiveReader<'_>> {
        self.archive.rewind()?;
        Ok(VerifiedArchiveReader {
            file: &mut *self.archive,
        })
    }
}

impl VerifiedDistributionRelease {
    /// Borrow the exact archive bytes consumed and authenticated by tough.
    ///
    /// The retained file is rewound before each borrow.  No caller-supplied
    /// path or digest is used to reconnect verification to provisioning.
    pub async fn selected_archive(
        &mut self,
    ) -> Result<VerifiedArchiveReader<'_>, VerificationError> {
        self.selected_archive.revalidate().await?;
        let file = self.selected_archive.file_mut();
        file.rewind()
            .map_err(|_| VerificationError::StagingUnavailable)?;
        Ok(VerifiedArchiveReader { file })
    }

    /// Borrow the sealed synchronous materialization capability.
    ///
    /// Revalidates the retained archive same-handle (length and digest, the
    /// async path used by every borrow), then splits the unique release borrow
    /// into a rewound reader plus the verified facts a product materializer
    /// needs.  The one async touch lives here; the returned capability is
    /// consumed synchronously and cannot be constructed anywhere else.
    pub async fn materialization_source(
        &mut self,
    ) -> Result<MaterializationSource<'_>, VerificationError> {
        self.selected_archive.revalidate().await?;
        let VerifiedDistributionRelease {
            target,
            cohort,
            component_lock,
            canonical_cohort,
            selected_archive,
            ..
        } = self;
        let member = cohort
            .members
            .iter()
            .find(|member| member.target == *target)
            .ok_or(VerificationError::InvalidCohort)?;
        let StagedArchive {
            file,
            expected_length,
            expected_digest,
        } = selected_archive;
        file.rewind()
            .map_err(|_| VerificationError::StagingUnavailable)?;
        Ok(MaterializationSource {
            archive: file,
            archive_length: *expected_length,
            archive_sha256: expected_digest.as_slice(),
            target: *target,
            member_manifest_sha256: &member.member_manifest_sha256,
            component_lock: component_lock.as_slice(),
            canonical_cohort: canonical_cohort.as_slice(),
            release_identity: &cohort.release_identity,
            capsule_root: &cohort.capsule.root,
        })
    }
}
