//! Purpose-split private-file authority values
//! (windows-private-file-authority D1): create-new, recovery, read-only
//! verification, and directory hardening. A child module of the crate root so
//! each value keeps using the root's single bounded `open` seam.

use super::*;

/// Exclusive authority over a newly created EMPTY private file
/// (windows-private-file-authority D1/D5).
///
/// This is deliberately not [`AuthorityFile`] or [`PrivateFileRecovery`]. It
/// proves create-new lineage and carries no conversion into either general or
/// recovery authority. All sharing stays denied while callers harden the empty
/// file, write and synchronize its bytes, reread them, and revalidate authority.
#[derive(Debug)]
pub struct PrivateFileCreation {
    file: File,
    identity: HighResFileId,
}

impl PrivateFileCreation {
    /// Exclusively create and retain one empty regular non-reparse file.
    pub fn create(path: &Path) -> io::Result<Self> {
        let file = open(
            path,
            OpenDisposition::CreateNew,
            GENERIC_READ | GENERIC_WRITE | READ_CONTROL | WRITE_DAC | DELETE_ACCESS,
            false,
            false,
            false,
        )?;
        let state = os::validated_regular_file_state(&file)?;
        if state.size != 0 {
            return Err(io::Error::other(
                "new private-file creation did not produce an empty file",
            ));
        }
        Ok(Self {
            file,
            identity: state.identity,
        })
    }

    /// The retained full-width identity.
    #[must_use]
    pub fn identity(&self) -> HighResFileId {
        self.identity
    }

    /// The exact retained file for authorized ACL mutation and bounded I/O.
    #[must_use]
    pub fn file(&self) -> &File {
        &self.file
    }

    /// The exact retained file for bounded writes and rereads.
    #[must_use]
    pub fn file_mut(&mut self) -> &mut File {
        &mut self.file
    }

    /// Number of hard-link names bound to this retained file.
    pub fn link_count(&self) -> io::Result<u64> {
        os::link_count(&self.file)
    }

    /// Observe this retained file's DACL in one bounded snapshot for the safe
    /// [`private_policy`] validation layer.
    pub fn dacl_snapshot(&self) -> io::Result<DaclSnapshot> {
        os::private_dacl_snapshot(&self.file)
    }

    /// Revalidate exact identity and safe regular-file state.
    pub fn revalidate(&self) -> io::Result<()> {
        revalidate_private_file(&self.file, self.identity)
    }

    /// Mark this exact retained creation residue for deletion on close.
    pub fn mark_delete_on_close(&self) -> io::Result<()> {
        os::mark_delete_on_close(&self.file)
    }
}

/// Exclusive mutable authority over an EXISTING private file during recovery
/// (windows-private-file-authority D1/D5).
///
/// Recovery authority is obtainable only by reopening an existing name. It is
/// distinct from new-file creation and read-only verification and retains the
/// write, DACL-write, and exact-retirement rights required through settlement.
#[derive(Debug)]
pub struct PrivateFileRecovery {
    file: File,
    identity: HighResFileId,
}

impl PrivateFileRecovery {
    /// Exclusively reopen one regular non-reparse private file for recovery.
    pub fn open(path: &Path) -> io::Result<Self> {
        let file = open(
            path,
            OpenDisposition::Existing,
            GENERIC_READ | GENERIC_WRITE | READ_CONTROL | WRITE_DAC | DELETE_ACCESS,
            false,
            false,
            false,
        )?;
        let identity = os::validated_regular_file_state(&file)?.identity;
        Ok(Self { file, identity })
    }

    /// The retained full-width identity.
    #[must_use]
    pub fn identity(&self) -> HighResFileId {
        self.identity
    }

    /// The exact retained file for authorized ACL mutation and bounded I/O.
    #[must_use]
    pub fn file(&self) -> &File {
        &self.file
    }

    /// The exact retained file for bounded rewrite and reread.
    #[must_use]
    pub fn file_mut(&mut self) -> &mut File {
        &mut self.file
    }

    /// Number of hard-link names bound to this retained file.
    pub fn link_count(&self) -> io::Result<u64> {
        os::link_count(&self.file)
    }

    /// Observe this retained file's DACL in one bounded snapshot for the safe
    /// [`private_policy`] validation layer.
    pub fn dacl_snapshot(&self) -> io::Result<DaclSnapshot> {
        os::private_dacl_snapshot(&self.file)
    }

    /// Revalidate exact identity and safe regular-file state.
    pub fn revalidate(&self) -> io::Result<()> {
        revalidate_private_file(&self.file, self.identity)
    }

    /// Mark this exact retained recovery file for deletion on close.
    pub fn mark_delete_on_close(&self) -> io::Result<()> {
        os::mark_delete_on_close(&self.file)
    }
}

fn revalidate_private_file(file: &File, identity: HighResFileId) -> io::Result<()> {
    if os::validated_regular_file_state(file)?.identity != identity {
        return Err(io::Error::other(
            "retained private-file identity changed unexpectedly",
        ));
    }
    Ok(())
}

/// A retained regular-file handle for READ-ONLY private-file verification
/// (windows-private-file-authority D1).
///
/// It carries generic read and `READ_CONTROL` only — never data-write,
/// `WRITE_DAC`, or delete — so it can observe identity, link count, protected
/// state, and bounded bytes but can never rewrite, re-DACL, rename, or delete
/// the file. It exposes neither `File` nor a raw handle and has no conversion to
/// creation or recovery authority, so mutation cannot compile through this API.
#[derive(Debug)]
pub struct ReadOnlyAuthorityFile {
    file: File,
    identity: HighResFileId,
}

impl ReadOnlyAuthorityFile {
    /// Open an existing regular non-reparse file for read-only verification.
    /// Read sharing admits other readers, but write and delete sharing are
    /// denied for the retained lifetime. That makes bounded reads coherent and
    /// prevents content or named-entry mutation during authority validation.
    pub fn open_private_readonly(path: &Path) -> io::Result<Self> {
        let file = open(
            path,
            OpenDisposition::Existing,
            GENERIC_READ | READ_CONTROL,
            true,
            false,
            false,
        )?;
        let identity = os::validated_regular_file_state(&file)?.identity;
        Ok(Self { file, identity })
    }

    /// The retained handle identity.
    #[must_use]
    pub fn identity(&self) -> HighResFileId {
        self.identity
    }

    /// Number of hard-link names currently bound to this exact retained file.
    pub fn link_count(&self) -> io::Result<u64> {
        os::link_count(&self.file)
    }

    /// Observe this exact retained file's DACL in one bounded snapshot
    /// (windows-private-file-authority D3/D4) for the safe [`private_policy`]
    /// validation layer.
    pub fn dacl_snapshot(&self) -> io::Result<DaclSnapshot> {
        os::private_dacl_snapshot(&self.file)
    }

    /// Read this exact retained file from offset zero within both a caller bound
    /// and the authority crate's fixed one-MiB ceiling.
    ///
    /// The file is revalidated before and after the read. Growth, truncation,
    /// identity change, or an unexpected short read fails closed.
    pub fn read_bounded(&self, max_bytes: usize) -> io::Result<Vec<u8>> {
        if max_bytes > MAX_PRIVATE_FILE_READ_BYTES {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "private-file read bound exceeds the fixed authority ceiling",
            ));
        }
        let before = os::validated_regular_file_state(&self.file)?;
        if before.identity != self.identity {
            return Err(io::Error::other(
                "retained read-only file identity changed unexpectedly",
            ));
        }
        let size = usize::try_from(before.size)
            .map_err(|_| io::Error::other("private file size cannot fit in memory"))?;
        if size > max_bytes {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "private file exceeds the caller's read bound",
            ));
        }

        let mut bytes = vec![0_u8; size];
        let mut offset = 0;
        while offset < bytes.len() {
            let file_offset = u64::try_from(offset)
                .map_err(|_| io::Error::other("private file offset is not representable"))?;
            let read = self.file.seek_read(&mut bytes[offset..], file_offset)?;
            if read == 0 {
                return Err(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "private file changed during bounded read",
                ));
            }
            offset += read;
        }

        let after = os::validated_regular_file_state(&self.file)?;
        if after.identity != self.identity || after.size != before.size {
            return Err(io::Error::other(
                "private file identity or size changed during bounded read",
            ));
        }
        Ok(bytes)
    }

    /// Re-observe the retained regular-file state, rejecting an identity change.
    pub fn revalidate(&self) -> io::Result<()> {
        if os::validated_regular_file_state(&self.file)?.identity != self.identity {
            return Err(io::Error::other(
                "retained read-only file identity changed unexpectedly",
            ));
        }
        Ok(())
    }
}

/// A retained non-reparse directory handle for private-directory HARDENING
/// (windows-private-file-authority D1).
///
/// Beyond the traversal, delete-share denial, and identity binding of
/// [`AuthorityDirectory`], it additionally carries `READ_CONTROL` and
/// `WRITE_DAC` so the safe `windows-acl` layer can install and observe the
/// protected three-principal DACL through this exact retained handle. It
/// exposes no child creation or removal: hardening authority only re-DACLs and
/// verifies the directory it retains.
#[derive(Debug)]
pub struct HardeningDirectory {
    directory: File,
    identity: HighResFileId,
}

impl HardeningDirectory {
    /// Open one existing directory pathname for hardening. The final link is
    /// opened without reparse traversal and the handle is validated as a live
    /// non-reparse directory before this succeeds.
    pub fn open_existing(path: &Path) -> io::Result<Self> {
        let directory = os::open_existing_directory_for_hardening(path)?;
        let identity = os::validated_directory_identity(&directory)?;
        Ok(Self {
            directory,
            identity,
        })
    }

    /// The copied full-width identity of this exact retained directory.
    #[must_use]
    pub fn identity(&self) -> HighResFileId {
        self.identity
    }

    /// Borrow the retained directory handle for the safe `windows-acl` layer's
    /// handle-based DACL mutation and enumeration.
    #[must_use]
    pub fn directory(&self) -> &File {
        &self.directory
    }

    /// Observe this exact retained directory's DACL in one bounded snapshot
    /// (windows-private-file-authority D3/D4) for the safe [`private_policy`]
    /// validation layer.
    pub fn dacl_snapshot(&self) -> io::Result<DaclSnapshot> {
        os::private_dacl_snapshot(&self.directory)
    }

    /// Re-observe the retained directory state, rejecting an identity change.
    pub fn revalidate(&self) -> io::Result<()> {
        if os::validated_directory_identity(&self.directory)? != self.identity {
            return Err(io::Error::other(
                "retained hardening directory identity changed unexpectedly",
            ));
        }
        Ok(())
    }
}
