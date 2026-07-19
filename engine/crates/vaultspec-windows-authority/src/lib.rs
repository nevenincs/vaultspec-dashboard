//! Safe public wrappers around the two Windows handle operations required by
//! the product installation authority.
//!
//! This crate is deliberately isolated from the engine workspace's
//! `unsafe_code = "forbid"` lint under ADR D9. The crate-level lint remains
//! `deny`; only the private [`os`] module lowers it for the minimal Win32 calls,
//! immediately beside their validity arguments. Consumers receive only owned
//! files, 128-bit identities, exact-handle operations, and bounded process
//! observations.

#![cfg(windows)]

use std::fs::{File, OpenOptions};
use std::io;
use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
use std::path::Path;

use windows_sys::Win32::Storage::FileSystem::{
    FILE_ATTRIBUTE_REPARSE_POINT, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
};

#[allow(
    unsafe_code,
    reason = "ADR D9 confines the minimum audited Win32 FFI to this private module"
)]
mod os;

const DELETE_ACCESS: u32 = 0x0001_0000;
const GENERIC_READ: u32 = 0x8000_0000;
const GENERIC_WRITE: u32 = 0x4000_0000;
const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;

/// A high-resolution Windows `FILE_ID_INFO` identity.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HighResFileId {
    /// Volume serial number returned by Windows.
    pub volume_serial_number: u64,
    /// Full 128-bit file identifier returned by Windows.
    pub file_id: u128,
}

/// A bounded operating-system observation used only when process enumeration
/// cannot identify a process instance.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcessExistence {
    /// The process exists and has not terminated.
    Exists,
    /// The operating system positively reports no live process at this pid.
    Missing,
    /// Access or another operating-system failure prevents a conclusion.
    Unverifiable,
}

/// Positively probe whether a Windows process exists without exposing a raw
/// handle. Access failures remain [`ProcessExistence::Unverifiable`].
#[must_use]
pub fn probe_process_existence(pid: u32) -> ProcessExistence {
    os::probe_process_existence(pid)
}

/// An owned regular-file handle bound to a high-resolution identity.
#[derive(Debug)]
pub struct AuthorityFile {
    file: File,
    identity: HighResFileId,
}

impl AuthorityFile {
    /// Open an existing regular non-reparse file for reading and exact-handle
    /// deletion. The handle denies write and delete sharing, so its content and
    /// named entry cannot be mutated, renamed, or replaced while retained.
    pub fn open_claim(path: &Path) -> io::Result<Self> {
        let file = open(path, false, GENERIC_READ | DELETE_ACCESS, false, false)?;
        Self::from_file(file)
    }

    /// Open an existing claim with delete access while continuing to share
    /// delete operations. This is only a publication/recovery transition
    /// handle; callers replace it with [`Self::open_claim`] before authorizing
    /// a transaction.
    pub fn open_claim_shared_delete(path: &Path) -> io::Result<Self> {
        let file = open(path, false, GENERIC_READ | DELETE_ACCESS, true, true)?;
        Self::from_file(file)
    }

    /// Create a new prepared claim with read/write/delete access. Delete
    /// sharing remains enabled until the fixed hard link is established and
    /// opened through [`Self::open_claim`].
    pub fn create_prepared(path: &Path) -> io::Result<Self> {
        let file = open(
            path,
            true,
            GENERIC_READ | GENERIC_WRITE | DELETE_ACCESS,
            true,
            true,
        )?;
        Self::from_file(file)
    }

    /// Open or create the OS lock file. Delete sharing is denied so the path
    /// remains bound to this exact handle for the guard lifetime.
    pub fn open_lock(path: &Path) -> io::Result<Self> {
        let file = open(path, false, GENERIC_READ | GENERIC_WRITE, true, false)?;
        Self::from_file(file)
    }

    /// Open an existing file or directory without delete access to obtain its
    /// exact no-follow high-resolution identity.
    pub fn identity_at_path(path: &Path) -> io::Result<HighResFileId> {
        let file = open(path, false, 0, true, true)?;
        let metadata = file.metadata()?;
        if (!metadata.is_file() && !metadata.is_dir())
            || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
        {
            return Err(io::Error::other(
                "Windows authority path is not a regular non-reparse file or directory",
            ));
        }
        os::high_res_id(&file)
    }

    /// Open a regular non-reparse file for bounded reads while allowing an
    /// existing delete-capable authority handle to remain open.
    pub fn open_reader(path: &Path) -> io::Result<Self> {
        let file = open(path, false, GENERIC_READ, true, true)?;
        Self::from_file(file)
    }

    /// The retained handle identity.
    #[must_use]
    pub fn identity(&self) -> HighResFileId {
        self.identity
    }

    /// Number of hard-link names currently bound to this exact retained file.
    ///
    /// The observation is queried from the retained handle, not a pathname, so
    /// callers can reject aliased authority without racing a later name lookup.
    pub fn link_count(&self) -> io::Result<u64> {
        os::link_count(&self.file)
    }

    /// Borrow the retained standard file for locking or bounded I/O.
    #[must_use]
    pub fn file(&self) -> &File {
        &self.file
    }

    /// Mutably borrow the retained standard file for bounded I/O.
    #[must_use]
    pub fn file_mut(&mut self) -> &mut File {
        &mut self.file
    }

    /// Mark this exact retained handle's entry for deletion when the handle is
    /// closed. No pathname lookup occurs.
    pub fn mark_delete_on_close(&self) -> io::Result<()> {
        os::mark_delete_on_close(&self.file)
    }

    fn from_file(file: File) -> io::Result<Self> {
        let metadata = file.metadata()?;
        if !metadata.is_file() || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(io::Error::other(
                "Windows authority handle is not a regular non-reparse file",
            ));
        }
        let identity = os::high_res_id(&file)?;
        Ok(Self { file, identity })
    }
}

fn open(
    path: &Path,
    create_new: bool,
    access: u32,
    share_write: bool,
    share_delete: bool,
) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options
        .read(access & GENERIC_READ != 0)
        .write(access & GENERIC_WRITE != 0);
    options
        .access_mode(access)
        .share_mode(
            FILE_SHARE_READ
                | if share_write { FILE_SHARE_WRITE } else { 0 }
                | if share_delete { FILE_SHARE_DELETE } else { 0 },
        )
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS);
    if create_new {
        options.create_new(true);
    } else if access & GENERIC_WRITE != 0 {
        options.create(true);
    }
    options.open(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retained_file_reports_real_hard_link_count() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "vaultspec-windows-authority-link-count-{}-{unique}",
            std::process::id()
        ));
        std::fs::create_dir(&directory).unwrap();
        let file_path = directory.join("authority-file");
        let alias_path = directory.join("authority-alias");
        std::fs::write(&file_path, b"authority").unwrap();
        let authority = AuthorityFile::open_reader(&file_path).unwrap();

        assert_eq!(authority.link_count().unwrap(), 1);
        std::fs::hard_link(&file_path, &alias_path).unwrap();
        assert_eq!(authority.link_count().unwrap(), 2);
        std::fs::remove_file(&alias_path).unwrap();
        assert_eq!(authority.link_count().unwrap(), 1);
        drop(authority);
        std::fs::remove_file(file_path).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }
}
