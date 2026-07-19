//! Safe public wrappers around the bounded Windows handle operations required
//! by the product installation authority.
//!
//! This crate is deliberately isolated from the engine workspace's
//! `unsafe_code = "forbid"` lint under ADR D9. The crate-level lint remains
//! `deny`; only the private [`os`] module lowers it for the minimal Win32 calls,
//! immediately beside their validity arguments. Consumers receive only owned
//! files and directories, 128-bit identities, exact-handle operations, and
//! bounded process observations.

#![cfg(windows)]

use std::ffi::OsStr;
use std::fs::{File, OpenOptions};
use std::io;
use std::os::windows::ffi::OsStrExt;
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
const MAX_DIRECTORY_COMPONENT_UTF16_UNITS: usize = 255;

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

/// An owned non-reparse directory handle bound to a full-width identity.
///
/// The handle denies write and delete sharing for its retained lifetime. Child
/// traversal is available only through one validated name component relative
/// to this exact handle; no raw handle or arbitrary child path is exposed.
#[derive(Debug)]
pub struct AuthorityDirectory {
    directory: File,
    identity: HighResFileId,
}

impl AuthorityDirectory {
    /// Bootstrap authority from one existing directory pathname.
    ///
    /// This is the only pathname-based directory constructor. The final link is
    /// opened without reparse traversal and the returned handle itself is
    /// validated before this method succeeds.
    pub fn open_existing(path: &Path) -> io::Result<Self> {
        Self::from_file(os::open_existing_directory(path)?)
    }

    /// Open one existing direct child directory relative to this retained
    /// authority.
    pub fn open_child_directory(&self, name: &OsStr) -> io::Result<Self> {
        let name = validate_directory_component(name)?;
        Self::from_file(os::open_child_directory(&self.directory, &name, false)?)
    }

    /// Exclusively create and retain one direct child directory relative to
    /// this authority.
    pub fn create_child_directory(&self, name: &OsStr) -> io::Result<Self> {
        let name = validate_directory_component(name)?;
        Self::from_file(os::open_child_directory(&self.directory, &name, true)?)
    }

    /// The copied full-width identity of this exact retained directory.
    #[must_use]
    pub fn identity(&self) -> HighResFileId {
        self.identity
    }

    /// Delete exactly this retained directory if it is empty.
    ///
    /// Success marks the exact handle delete-pending and immediately consumes
    /// and closes it. Failure preserves the still-owned authority alongside the
    /// operating-system error so the caller can remove real children and retry.
    pub fn remove_empty(self) -> Result<(), RemoveEmptyDirectoryError> {
        if let Err(source) = os::mark_delete_on_close(&self.directory) {
            return Err(RemoveEmptyDirectoryError {
                authority: self,
                source,
            });
        }
        drop(self);
        Ok(())
    }

    fn from_file(directory: File) -> io::Result<Self> {
        let identity = os::validated_directory_identity(&directory)?;
        Ok(Self {
            directory,
            identity,
        })
    }
}

/// A failed terminal empty-directory cleanup that retains exact authority.
#[derive(Debug)]
pub struct RemoveEmptyDirectoryError {
    authority: AuthorityDirectory,
    source: io::Error,
}

impl RemoveEmptyDirectoryError {
    /// Borrow the still-owned directory authority for diagnostics or identity
    /// comparison.
    #[must_use]
    pub fn authority(&self) -> &AuthorityDirectory {
        &self.authority
    }

    /// Borrow the operating-system cleanup failure.
    #[must_use]
    pub fn error(&self) -> &io::Error {
        &self.source
    }

    /// Recover both the retained authority and operating-system failure.
    #[must_use]
    pub fn into_parts(self) -> (AuthorityDirectory, io::Error) {
        (self.authority, self.source)
    }
}

impl std::fmt::Display for RemoveEmptyDirectoryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "exact empty-directory cleanup failed: {}", self.source)
    }
}

impl std::error::Error for RemoveEmptyDirectoryError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.source)
    }
}

fn validate_directory_component(name: &OsStr) -> io::Result<Vec<u16>> {
    let encoded: Vec<u16> = name.encode_wide().collect();
    let is_dot = encoded.as_slice() == [u16::from(b'.')];
    let is_dot_dot = encoded.as_slice() == [u16::from(b'.'), u16::from(b'.')];
    let contains_reserved = encoded.iter().any(|unit| {
        matches!(
            *unit,
            0x0000
                ..=0x001f
                    | 0x0022
                    | 0x002a
                    | 0x002f
                    | 0x003a
                    | 0x003c
                    | 0x003e
                    | 0x003f
                    | 0x005c
                    | 0x007c
        )
    });
    let has_forbidden_ending = encoded
        .last()
        .is_some_and(|unit| *unit == u16::from(b'.') || *unit == u16::from(b' '));
    if encoded.is_empty()
        || encoded.len() > MAX_DIRECTORY_COMPONENT_UTF16_UNITS
        || is_dot
        || is_dot_dot
        || contains_reserved
        || has_forbidden_ending
        || is_reserved_dos_basename(&encoded)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "directory child must be one bounded non-prefix UTF-16 component",
        ));
    }
    Ok(encoded)
}

fn is_reserved_dos_basename(encoded: &[u16]) -> bool {
    let extension = encoded
        .iter()
        .position(|unit| *unit == u16::from(b'.'))
        .unwrap_or(encoded.len());
    let base = &encoded[..extension];
    let base = &base[..base
        .iter()
        .rposition(|unit| *unit != u16::from(b' ') && *unit != u16::from(b'.'))
        .map_or(0, |index| index + 1)];
    let mut upper = [0_u16; 4];
    if base.len() > upper.len() {
        return false;
    }
    for (index, unit) in base.iter().enumerate() {
        upper[index] = match *unit {
            unit if (u16::from(b'a')..=u16::from(b'z')).contains(&unit) => {
                unit - u16::from(b'a' - b'A')
            }
            unit => unit,
        };
    }
    matches!(
        &upper[..base.len()],
        [0x0043, 0x004f, 0x004e]
            | [0x0050, 0x0052, 0x004e]
            | [0x0041, 0x0055, 0x0058]
            | [0x004e, 0x0055, 0x004c]
    ) || (base.len() == 4
        && matches!(
            &upper[..3],
            [0x0043, 0x004f, 0x004d] | [0x004c, 0x0050, 0x0054]
        )
        && matches!(upper[3], 0x0031..=0x0039 | 0x00b9 | 0x00b2 | 0x00b3))
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
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use std::os::windows::fs::symlink_dir;

    fn create_directory(path: &Path) {
        std::fs::create_dir(path).unwrap();
    }

    fn assert_invalid_component(authority: &AuthorityDirectory, name: &OsStr) {
        assert_eq!(
            authority.open_child_directory(name).unwrap_err().kind(),
            io::ErrorKind::InvalidInput,
            "open unexpectedly accepted {name:?}"
        );
        assert_eq!(
            authority.create_child_directory(name).unwrap_err().kind(),
            io::ErrorKind::InvalidInput,
            "create unexpectedly accepted {name:?}"
        );
    }

    fn open_directory_for_generic_write(path: &Path) -> io::Result<File> {
        let mut options = OpenOptions::new();
        options
            .access_mode(
                GENERIC_WRITE | windows_sys::Win32::Storage::FileSystem::FILE_WRITE_ATTRIBUTES,
            )
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS);
        options.open(path)
    }

    #[test]
    fn retained_file_reports_real_hard_link_count() {
        let directory = tempfile::tempdir().unwrap();
        let file_path = directory.path().join("authority-file");
        let alias_path = directory.path().join("authority-alias");
        std::fs::write(&file_path, b"authority").unwrap();
        let authority = AuthorityFile::open_reader(&file_path).unwrap();

        assert_eq!(authority.link_count().unwrap(), 1);
        std::fs::hard_link(&file_path, &alias_path).unwrap();
        assert_eq!(authority.link_count().unwrap(), 2);
        std::fs::remove_file(&alias_path).unwrap();
        assert_eq!(authority.link_count().unwrap(), 1);
        drop(authority);
        std::fs::remove_file(file_path).unwrap();
    }

    #[test]
    fn retained_directory_identity_is_stable_distinct_and_full_width() {
        let temp = tempfile::tempdir().unwrap();
        let first_path = temp.path().join("first");
        let second_path = temp.path().join("second");
        create_directory(&first_path);
        create_directory(&second_path);

        let first = AuthorityDirectory::open_existing(&first_path).unwrap();
        let first_identity = first.identity();
        let second = AuthorityDirectory::open_existing(&second_path).unwrap();
        let second_identity = second.identity();
        assert_ne!(first_identity, second_identity);
        assert_ne!(first_identity.volume_serial_number, 0);
        assert_ne!(first_identity.file_id, 0);
        drop(first);
        assert_eq!(
            AuthorityDirectory::open_existing(&first_path)
                .unwrap()
                .identity(),
            first_identity
        );
    }

    #[test]
    fn file_root_reparse_root_and_reparse_child_are_rejected() {
        let temp = tempfile::tempdir().unwrap();
        let file_path = temp.path().join("plain-file");
        std::fs::write(&file_path, b"not a directory").unwrap();
        assert!(AuthorityDirectory::open_existing(&file_path).is_err());

        let target = temp.path().join("target");
        let root_link = temp.path().join("root-link");
        create_directory(&target);
        symlink_dir(&target, &root_link).unwrap();
        assert!(AuthorityDirectory::open_existing(&root_link).is_err());

        let parent_path = temp.path().join("parent");
        let child_target = temp.path().join("child-target");
        create_directory(&parent_path);
        create_directory(&child_target);
        symlink_dir(&child_target, parent_path.join("linked-child")).unwrap();
        let parent = AuthorityDirectory::open_existing(&parent_path).unwrap();
        assert!(
            parent
                .open_child_directory(OsStr::new("linked-child"))
                .is_err()
        );
    }

    #[test]
    fn component_grammar_rejects_every_reserved_shape_and_accepts_unicode() {
        let temp = tempfile::tempdir().unwrap();
        let parent_path = temp.path().join("parent");
        create_directory(&parent_path);
        let parent = AuthorityDirectory::open_existing(&parent_path).unwrap();

        let mut invalid = vec![
            OsString::new(),
            OsString::from("."),
            OsString::from(".."),
            OsString::from("/"),
            OsString::from("\\"),
            OsString::from("a/b"),
            OsString::from("a\\b"),
            OsString::from("a:b"),
            OsString::from("C:\\absolute"),
            OsString::from("\\\\server\\share"),
            OsString::from("\\?\\C:\\absolute"),
            OsString::from("bad<name"),
            OsString::from("bad>name"),
            OsString::from("bad\"name"),
            OsString::from("bad|name"),
            OsString::from("bad?name"),
            OsString::from("bad*name"),
            OsString::from("trailing."),
            OsString::from("trailing "),
            OsString::from("CON"),
            OsString::from("prn.txt"),
            OsString::from("Aux"),
            OsString::from("NUL.bin"),
            OsString::from("COM1"),
            OsString::from("com9.log"),
            OsString::from("COM¹"),
            OsString::from("cOm².TxT"),
            OsString::from("LPT1"),
            OsString::from("lpt9.txt"),
            OsString::from("LPT³"),
            OsString::from("lPt¹.log"),
            OsString::from("x".repeat(MAX_DIRECTORY_COMPONENT_UTF16_UNITS + 1)),
            OsString::from_wide(&[0]),
            OsString::from_wide(&[1]),
            OsString::from_wide(&[0x1f]),
        ];
        for name in invalid.drain(..) {
            assert_invalid_component(&parent, &name);
        }

        for name in [
            OsStr::new("資料-🦀"),
            OsStr::new("COM0"),
            OsStr::new("COM⁴"),
            OsStr::new("LPT10"),
        ] {
            let created = parent.create_child_directory(name).unwrap();
            let identity = created.identity();
            drop(created);
            let reopened = parent.open_child_directory(name).unwrap();
            assert_eq!(reopened.identity(), identity);
            reopened.remove_empty().unwrap();
        }
    }

    #[test]
    fn exclusive_create_and_file_directory_collisions_are_honest() {
        let temp = tempfile::tempdir().unwrap();
        let parent_path = temp.path().join("parent");
        create_directory(&parent_path);
        create_directory(&parent_path.join("existing-directory"));
        std::fs::write(parent_path.join("existing-file"), b"file").unwrap();
        let parent = AuthorityDirectory::open_existing(&parent_path).unwrap();

        let created = parent
            .create_child_directory(OsStr::new("new-directory"))
            .unwrap();
        drop(created);
        assert_eq!(
            parent
                .create_child_directory(OsStr::new("new-directory"))
                .unwrap_err()
                .kind(),
            io::ErrorKind::AlreadyExists
        );
        assert_eq!(
            parent
                .create_child_directory(OsStr::new("existing-directory"))
                .unwrap_err()
                .kind(),
            io::ErrorKind::AlreadyExists
        );
        assert_eq!(
            parent
                .create_child_directory(OsStr::new("existing-file"))
                .unwrap_err()
                .kind(),
            io::ErrorKind::AlreadyExists
        );
        assert_eq!(
            parent
                .open_child_directory(OsStr::new("existing-file"))
                .unwrap_err()
                .raw_os_error(),
            Some(267)
        );
    }

    #[test]
    fn relative_children_disambiguate_parents_and_missing_is_not_found() {
        let temp = tempfile::tempdir().unwrap();
        let first_path = temp.path().join("first");
        let second_path = temp.path().join("second");
        create_directory(&first_path);
        create_directory(&second_path);
        let first = AuthorityDirectory::open_existing(&first_path).unwrap();
        let second = AuthorityDirectory::open_existing(&second_path).unwrap();

        let first_child = first
            .create_child_directory(OsStr::new("same-name"))
            .unwrap();
        let second_child = second
            .create_child_directory(OsStr::new("same-name"))
            .unwrap();
        assert_ne!(first_child.identity(), second_child.identity());
        assert_eq!(
            first
                .open_child_directory(OsStr::new("missing"))
                .unwrap_err()
                .kind(),
            io::ErrorKind::NotFound
        );
    }

    #[test]
    fn retained_directory_denies_rename_delete_and_ancestor_substitution_until_drop() {
        let temp = tempfile::tempdir().unwrap();
        let ancestor = temp.path().join("ancestor");
        let root = ancestor.join("root");
        let moved_ancestor = temp.path().join("moved-ancestor");
        let moved_root = ancestor.join("moved-root");
        create_directory(&ancestor);
        create_directory(&root);
        let authority = AuthorityDirectory::open_existing(&root).unwrap();

        assert!(open_directory_for_generic_write(&root).is_err());
        assert!(std::fs::rename(&root, &moved_root).is_err());
        assert!(std::fs::remove_dir(&root).is_err());
        assert!(std::fs::rename(&ancestor, &moved_ancestor).is_err());

        drop(authority);
        drop(open_directory_for_generic_write(&root).unwrap());
        std::fs::rename(&ancestor, &moved_ancestor).unwrap();
        std::fs::rename(&moved_ancestor, &ancestor).unwrap();
        std::fs::rename(&root, &moved_root).unwrap();
        std::fs::remove_dir(&moved_root).unwrap();
        std::fs::remove_dir(&ancestor).unwrap();
    }

    #[test]
    fn exact_empty_cleanup_consumes_only_the_retained_directory() {
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("target");
        let sentinel = temp.path().join("sentinel");
        create_directory(&target);
        create_directory(&sentinel);
        let sentinel_file = sentinel.join("keep");
        std::fs::write(&sentinel_file, b"untouched").unwrap();

        AuthorityDirectory::open_existing(&target)
            .unwrap()
            .remove_empty()
            .unwrap();
        assert!(!target.exists());
        assert_eq!(std::fs::read(sentinel_file).unwrap(), b"untouched");
    }

    #[test]
    fn nonempty_cleanup_returns_retained_authority_and_retries_after_real_removal() {
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("target");
        create_directory(&target);
        let child = target.join("child");
        std::fs::write(&child, b"real child").unwrap();
        let authority = AuthorityDirectory::open_existing(&target).unwrap();
        let identity = authority.identity();

        let failure = authority.remove_empty().unwrap_err();
        assert_eq!(failure.authority().identity(), identity);
        assert_eq!(failure.error().raw_os_error(), Some(145));
        assert!(std::error::Error::source(&failure).is_some());
        assert!(std::fs::rename(&target, temp.path().join("replacement")).is_err());

        std::fs::remove_file(child).unwrap();
        let (authority, source) = failure.into_parts();
        assert_eq!(source.raw_os_error(), Some(145));
        authority.remove_empty().unwrap();
        assert!(!target.exists());
    }

    #[test]
    fn unmapped_native_status_preserves_the_hex_status() {
        let error = os::ntstatus_to_io_error(0xDEAD_BEEF_u32 as i32);
        assert!(error.raw_os_error().is_none());
        assert!(error.to_string().contains("0xDEADBEEF"));
    }
}
