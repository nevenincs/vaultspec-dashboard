//! Private Win32 FFI for the D9 file/process-authority exception.

use std::fs::{File, OpenOptions};
use std::io;
use std::os::windows::ffi::OsStrExt;
use std::os::windows::fs::OpenOptionsExt;
use std::os::windows::io::{AsRawHandle, FromRawHandle};
use std::path::Path;

use windows_sys::Wdk::Foundation::OBJECT_ATTRIBUTES;
use windows_sys::Wdk::Storage::FileSystem::{
    FILE_CREATE, FILE_DIRECTORY_FILE, FILE_NON_DIRECTORY_FILE, FILE_OPEN, FILE_OPEN_REPARSE_POINT,
    FILE_RENAME_INFORMATION, FILE_SYNCHRONOUS_IO_NONALERT, FileRenameInformation, NtCreateFile,
    NtSetInformationFile,
};
use windows_sys::Win32::Foundation::{
    CloseHandle, ERROR_INVALID_PARAMETER, ERROR_MR_MID_NOT_FOUND, ERROR_SUCCESS, HANDLE, LocalFree,
    OBJ_CASE_INSENSITIVE, RtlNtStatusToDosError, UNICODE_STRING, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows_sys::Win32::Security::Authorization::{
    ConvertSidToStringSidW, GetSecurityInfo, SE_FILE_OBJECT,
};
use windows_sys::Win32::Security::{
    ACCESS_ALLOWED_ACE, ACL, DACL_SECURITY_INFORMATION, GetAce, GetSecurityDescriptorControl,
    GetSecurityDescriptorDacl, PSECURITY_DESCRIPTOR, SE_DACL_PRESENT, SE_DACL_PROTECTED,
    SECURITY_DESCRIPTOR_CONTROL,
};
use windows_sys::Win32::Storage::FileSystem::{
    DELETE, FILE_ADD_SUBDIRECTORY, FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_NORMAL,
    FILE_ATTRIBUTE_REPARSE_POINT, FILE_ATTRIBUTE_TAG_INFO, FILE_DISPOSITION_INFO,
    FILE_GENERIC_READ, FILE_GENERIC_WRITE, FILE_ID_INFO, FILE_LIST_DIRECTORY, FILE_READ_ATTRIBUTES,
    FILE_SHARE_READ, FILE_STANDARD_INFO, FILE_TRAVERSE, FileAttributeTagInfo, FileDispositionInfo,
    FileIdInfo, FileStandardInfo, GetFileInformationByHandleEx, MOVEFILE_REPLACE_EXISTING,
    MOVEFILE_WRITE_THROUGH, MoveFileExW, READ_CONTROL, SYNCHRONIZE, SetFileInformationByHandle,
    WRITE_DAC,
};
use windows_sys::Win32::System::IO::IO_STATUS_BLOCK;
use windows_sys::Win32::System::Threading::{OpenProcess, WaitForSingleObject};

use crate::{HighResFileId, ProcessExistence};

const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
const DIRECTORY_ACCESS: u32 = DELETE
    | FILE_LIST_DIRECTORY
    | FILE_ADD_SUBDIRECTORY
    | FILE_TRAVERSE
    | FILE_READ_ATTRIBUTES
    | SYNCHRONIZE;
/// Directory-hardening access (windows-private-file-authority D1): only the
/// traversal and identity-observation rights plus READ_CONTROL and WRITE_DAC.
/// Unlike [`DIRECTORY_ACCESS`], this deliberately carries neither DELETE nor
/// FILE_ADD_SUBDIRECTORY because the hardening value cannot remove the retained
/// directory or create children.
const DIRECTORY_HARDENING_ACCESS: u32 =
    FILE_TRAVERSE | FILE_READ_ATTRIBUTES | SYNCHRONIZE | READ_CONTROL | WRITE_DAC;
const DIRECTORY_CREATE_OPTIONS: u32 =
    FILE_DIRECTORY_FILE | FILE_SYNCHRONOUS_IO_NONALERT | FILE_OPEN_REPARSE_POINT;
const IO_INFORMATION_FILE_OPENED: usize = 1;
const IO_INFORMATION_FILE_CREATED: usize = 2;
const MAX_MOVE_PATH_UTF16_UNITS: usize = 32_766;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct RegularFileState {
    pub(super) identity: HighResFileId,
    pub(super) link_count: u64,
    pub(super) size: u64,
}

pub(super) fn open_existing_directory(path: &Path) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options
        .access_mode(DIRECTORY_ACCESS)
        .share_mode(FILE_SHARE_READ)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS);
    options.open(path)
}

/// Directory-hardening variant of [`open_existing_directory`]: opens the final
/// link no-follow with the additional READ_CONTROL and WRITE_DAC rights the
/// safe layer needs to re-DACL and observe the retained directory.
pub(super) fn open_existing_directory_for_hardening(path: &Path) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options
        .access_mode(DIRECTORY_HARDENING_ACCESS)
        .share_mode(FILE_SHARE_READ)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS);
    options.open(path)
}

pub(super) fn open_child_directory(parent: &File, name: &[u16], create: bool) -> io::Result<File> {
    open_child_directory_with(parent, name, create, FILE_SHARE_READ)
}

/// Materialization-mode child directory: write sharing is admitted so kernel
/// rename-target opens (relative no-replace installs) do not collide with the
/// retained lease; delete sharing stays denied, so the directory itself cannot
/// be renamed or removed while retained.
pub(super) fn open_child_directory_write_shared(
    parent: &File,
    name: &[u16],
    create: bool,
) -> io::Result<File> {
    open_child_directory_with(
        parent,
        name,
        create,
        FILE_SHARE_READ | windows_sys::Win32::Storage::FileSystem::FILE_SHARE_WRITE,
    )
}

fn open_child_directory_with(
    parent: &File,
    name: &[u16],
    create: bool,
    share: u32,
) -> io::Result<File> {
    let byte_length = name
        .len()
        .checked_mul(std::mem::size_of::<u16>())
        .and_then(|length| u16::try_from(length).ok())
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "directory name is too long"))?;
    let unicode_name = UNICODE_STRING {
        Length: byte_length,
        MaximumLength: byte_length,
        Buffer: name.as_ptr().cast_mut(),
    };
    let object_attributes = OBJECT_ATTRIBUTES {
        Length: u32::try_from(std::mem::size_of::<OBJECT_ATTRIBUTES>())
            .expect("OBJECT_ATTRIBUTES size fits u32"),
        RootDirectory: parent.as_raw_handle(),
        ObjectName: &raw const unicode_name,
        Attributes: OBJ_CASE_INSENSITIVE,
        SecurityDescriptor: std::ptr::null(),
        SecurityQualityOfService: std::ptr::null(),
    };
    let mut raw_handle: HANDLE = std::ptr::null_mut();
    let mut io_status = IO_STATUS_BLOCK::default();
    let disposition = if create { FILE_CREATE } else { FILE_OPEN };

    // SAFETY: `parent` keeps a valid owned directory handle alive for this
    // synchronous call. `name`, `unicode_name`, `object_attributes`,
    // `raw_handle`, and `io_status` remain live, aligned, and correctly sized
    // for the call. The UNICODE_STRING length is checked and its buffer is
    // read-only by contract. `share` is one of the two fixed share modes the
    // thin wrappers above pass. Every optional pointer is null. No pointer
    // escapes.
    let status = unsafe {
        NtCreateFile(
            &raw mut raw_handle,
            DIRECTORY_ACCESS,
            &raw const object_attributes,
            &raw mut io_status,
            std::ptr::null(),
            FILE_ATTRIBUTE_NORMAL,
            share,
            disposition,
            DIRECTORY_CREATE_OPTIONS,
            std::ptr::null(),
            0,
        )
    };
    if status < 0 {
        return Err(ntstatus_to_io_error(status));
    }
    if raw_handle.is_null() {
        return Err(io::Error::other(
            "NtCreateFile succeeded without returning a directory handle",
        ));
    }

    // SAFETY: successful NtCreateFile returned one newly owned handle. File
    // takes that ownership exactly once and closes it on every later path.
    let file = unsafe { File::from_raw_handle(raw_handle) };
    let expected_information = if create {
        IO_INFORMATION_FILE_CREATED
    } else {
        IO_INFORMATION_FILE_OPENED
    };
    if io_status.Information != expected_information {
        return Err(io::Error::other(format!(
            "native directory disposition mismatch: expected {expected_information}, got {}",
            io_status.Information
        )));
    }
    Ok(file)
}

/// Access for a materializer child file: read/write for the counted decode and
/// same-handle revalidation, DELETE solely so a failed post-create validation
/// can retire the exact handle via delete-on-close (never a pathname delete).
const CHILD_FILE_ACCESS: u32 = DELETE | FILE_GENERIC_READ | FILE_GENERIC_WRITE | SYNCHRONIZE;
const CHILD_FILE_CREATE_OPTIONS: u32 =
    FILE_NON_DIRECTORY_FILE | FILE_SYNCHRONOUS_IO_NONALERT | FILE_OPEN_REPARSE_POINT;

/// Exclusively create one direct child regular file relative to the retained
/// parent directory handle (archive-materialization D4). `FILE_CREATE` cannot
/// open an existing object, so a name collision fails instead of replacing.
pub(super) fn create_child_regular_file(parent: &File, name: &[u16]) -> io::Result<File> {
    let byte_length = name
        .len()
        .checked_mul(std::mem::size_of::<u16>())
        .and_then(|length| u16::try_from(length).ok())
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "file name is too long"))?;
    let unicode_name = UNICODE_STRING {
        Length: byte_length,
        MaximumLength: byte_length,
        Buffer: name.as_ptr().cast_mut(),
    };
    let object_attributes = OBJECT_ATTRIBUTES {
        Length: u32::try_from(std::mem::size_of::<OBJECT_ATTRIBUTES>())
            .expect("OBJECT_ATTRIBUTES size fits u32"),
        RootDirectory: parent.as_raw_handle(),
        ObjectName: &raw const unicode_name,
        Attributes: OBJ_CASE_INSENSITIVE,
        SecurityDescriptor: std::ptr::null(),
        SecurityQualityOfService: std::ptr::null(),
    };
    let mut raw_handle: HANDLE = std::ptr::null_mut();
    let mut io_status = IO_STATUS_BLOCK::default();

    // SAFETY: `parent` keeps a valid owned directory handle alive for this
    // synchronous call, and `RootDirectory`-relative resolution never consults
    // the process working directory or any absolute pathname. `name`,
    // `unicode_name`, `object_attributes`, `raw_handle`, and `io_status`
    // remain live, aligned, and correctly sized for the call. The
    // UNICODE_STRING length is checked and its buffer is read-only by
    // contract. FILE_CREATE cannot open an existing object,
    // FILE_NON_DIRECTORY_FILE cannot yield a directory, and
    // FILE_OPEN_REPARSE_POINT prevents reparse-target traversal at the leaf;
    // the caller still re-verifies the attribute tag on the returned handle.
    // Share access is zero, so no second handle can reach the entry while it
    // is retained. Every optional pointer is null. No pointer escapes.
    let status = unsafe {
        NtCreateFile(
            &raw mut raw_handle,
            CHILD_FILE_ACCESS,
            &raw const object_attributes,
            &raw mut io_status,
            std::ptr::null(),
            FILE_ATTRIBUTE_NORMAL,
            0,
            FILE_CREATE,
            CHILD_FILE_CREATE_OPTIONS,
            std::ptr::null(),
            0,
        )
    };
    if status < 0 {
        return Err(ntstatus_to_io_error(status));
    }
    if raw_handle.is_null() {
        return Err(io::Error::other(
            "NtCreateFile succeeded without returning a file handle",
        ));
    }

    // SAFETY: successful NtCreateFile returned one newly owned handle. File
    // takes that ownership exactly once and closes it on every later path.
    let file = unsafe { File::from_raw_handle(raw_handle) };
    if io_status.Information != IO_INFORMATION_FILE_CREATED {
        return Err(io::Error::other(format!(
            "native file disposition mismatch: expected {IO_INFORMATION_FILE_CREATED}, got {}",
            io_status.Information
        )));
    }
    Ok(file)
}

/// Rename the exact retained regular file to a sibling name relative to the
/// retained parent directory handle, refusing replacement. Handle-based only:
/// the kernel `FileRenameInformation` class honors `RootDirectory`, so no
/// pathname is consulted and neither operand can be substituted between
/// validation and the rename. (The Win32 `SetFileInformationByHandle` wrapper
/// rejects a non-null `RootDirectory`, so this goes through
/// `NtSetInformationFile` like the crate's relative opens go through
/// `NtCreateFile`.)
pub(super) fn rename_child_no_replace(file: &File, parent: &File, name: &[u16]) -> io::Result<()> {
    let name_bytes = name
        .len()
        .checked_mul(std::mem::size_of::<u16>())
        .and_then(|length| u32::try_from(length).ok())
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "file name is too long"))?;
    let header = std::mem::size_of::<FILE_RENAME_INFORMATION>();
    let total = header
        .checked_add(name_bytes as usize)
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "rename buffer overflow"))?;
    let total_u32 = u32::try_from(total)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "rename buffer exceeds u32"))?;
    // A u64 backing store guarantees FILE_RENAME_INFORMATION's pointer
    // alignment; the trailing FileName[1] header slack keeps the name copy in
    // bounds.
    let mut buffer = vec![0u64; total.div_ceil(std::mem::size_of::<u64>())];
    let info = buffer.as_mut_ptr().cast::<FILE_RENAME_INFORMATION>();

    // SAFETY: `buffer` is zero-initialized, 8-byte aligned, and at least
    // `header + name_bytes` long, so every field write and the name copy stay
    // in bounds. The zeroed anonymous union means ReplaceIfExists is FALSE —
    // the no-replace law. `parent` keeps a valid owned directory handle alive
    // across the following call; only its raw value is written here.
    unsafe {
        (*info).RootDirectory = parent.as_raw_handle();
        (*info).FileNameLength = name_bytes;
        std::ptr::copy_nonoverlapping(name.as_ptr(), (*info).FileName.as_mut_ptr(), name.len());
    }

    let mut io_status = IO_STATUS_BLOCK::default();
    // SAFETY: `file` owns a valid handle opened with DELETE access (a rename
    // mutates the name entry), and `parent` remains a valid owned directory
    // handle for this synchronous call. `RootDirectory`-relative resolution
    // never consults the working directory or an absolute pathname; the name
    // is one validated leaf component. The info buffer and `io_status` are
    // live, aligned, and exactly the declared byte length; the kernel copies
    // the buffer and retains no pointer. No handle or pointer escapes.
    let status = unsafe {
        NtSetInformationFile(
            file.as_raw_handle(),
            &raw mut io_status,
            info.cast(),
            total_u32,
            FileRenameInformation,
        )
    };
    if status < 0 {
        return Err(ntstatus_to_io_error(status));
    }
    Ok(())
}

pub(super) fn ntstatus_to_io_error(status: i32) -> io::Error {
    // SAFETY: RtlNtStatusToDosError accepts one scalar NTSTATUS and returns a
    // copied Win32 error code; it retains no pointer or caller-owned state.
    let mapped = unsafe { RtlNtStatusToDosError(status) };
    if mapped == ERROR_MR_MID_NOT_FOUND || i32::try_from(mapped).is_err() {
        return io::Error::other(format!(
            "native directory operation failed with unmapped NTSTATUS 0x{:08X}",
            status as u32
        ));
    }
    io::Error::from_raw_os_error(i32::try_from(mapped).expect("mapped Win32 error fits i32"))
}

pub(super) fn validated_directory_identity(file: &File) -> io::Result<HighResFileId> {
    let mut standard = std::mem::MaybeUninit::<FILE_STANDARD_INFO>::zeroed();
    // SAFETY: `file` owns a valid handle. `standard` is writable, aligned, and
    // FILE_STANDARD_INFO-sized. Windows initializes it completely on success.
    let result = unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle(),
            FileStandardInfo,
            standard.as_mut_ptr().cast(),
            u32::try_from(std::mem::size_of::<FILE_STANDARD_INFO>())
                .expect("FILE_STANDARD_INFO size fits u32"),
        )
    };
    if result == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: the successful Win32 call initialized every standard-info byte.
    let standard = unsafe { standard.assume_init() };
    if !standard.Directory || standard.DeletePending {
        return Err(io::Error::other("authority handle is not a live directory"));
    }

    let mut tag = std::mem::MaybeUninit::<FILE_ATTRIBUTE_TAG_INFO>::zeroed();
    // SAFETY: `file` owns a valid handle. `tag` is writable, aligned, and
    // FILE_ATTRIBUTE_TAG_INFO-sized. Windows initializes it on success.
    let result = unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle(),
            FileAttributeTagInfo,
            tag.as_mut_ptr().cast(),
            u32::try_from(std::mem::size_of::<FILE_ATTRIBUTE_TAG_INFO>())
                .expect("FILE_ATTRIBUTE_TAG_INFO size fits u32"),
        )
    };
    if result == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: the successful Win32 call initialized every attribute-tag byte.
    let tag = unsafe { tag.assume_init() };
    if tag.FileAttributes & FILE_ATTRIBUTE_DIRECTORY == 0
        || tag.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
        || tag.ReparseTag != 0
    {
        return Err(io::Error::other(
            "authority directory is a reparse point or has unsafe attributes",
        ));
    }

    let identity = high_res_id(file)?;
    if identity.volume_serial_number == 0 || identity.file_id == 0 {
        return Err(io::Error::other(
            "authority directory returned a zero filesystem identity",
        ));
    }
    Ok(identity)
}

pub(super) fn validated_regular_file_state(file: &File) -> io::Result<RegularFileState> {
    let mut standard = std::mem::MaybeUninit::<FILE_STANDARD_INFO>::zeroed();
    // SAFETY: `file` owns a valid handle. `standard` is writable, aligned, and
    // FILE_STANDARD_INFO-sized. Windows initializes it completely on success.
    let result = unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle(),
            FileStandardInfo,
            standard.as_mut_ptr().cast(),
            u32::try_from(std::mem::size_of::<FILE_STANDARD_INFO>())
                .expect("FILE_STANDARD_INFO size fits u32"),
        )
    };
    if result == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: the successful Win32 call initialized every standard-info byte.
    let standard = unsafe { standard.assume_init() };
    if standard.Directory || standard.DeletePending {
        return Err(io::Error::other(
            "authority handle is not a live regular file",
        ));
    }
    let size = u64::try_from(standard.EndOfFile)
        .map_err(|_| io::Error::other("authority file returned a negative end-of-file"))?;

    let mut tag = std::mem::MaybeUninit::<FILE_ATTRIBUTE_TAG_INFO>::zeroed();
    // SAFETY: `file` owns a valid handle. `tag` is writable, aligned, and
    // FILE_ATTRIBUTE_TAG_INFO-sized. Windows initializes it on success.
    let result = unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle(),
            FileAttributeTagInfo,
            tag.as_mut_ptr().cast(),
            u32::try_from(std::mem::size_of::<FILE_ATTRIBUTE_TAG_INFO>())
                .expect("FILE_ATTRIBUTE_TAG_INFO size fits u32"),
        )
    };
    if result == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: the successful Win32 call initialized every attribute-tag byte.
    let tag = unsafe { tag.assume_init() };
    if tag.FileAttributes & FILE_ATTRIBUTE_DIRECTORY != 0
        || tag.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
        || tag.ReparseTag != 0
    {
        return Err(io::Error::other(
            "authority file is a directory, reparse point, or has unsafe attributes",
        ));
    }

    let identity = high_res_id(file)?;
    if identity.volume_serial_number == 0 || identity.file_id == 0 {
        return Err(io::Error::other(
            "authority file returned a zero filesystem identity",
        ));
    }
    Ok(RegularFileState {
        identity,
        link_count: u64::from(standard.NumberOfLinks),
        size,
    })
}

/// The fixed cap on DACL entries the private-file snapshot will observe
/// (windows-private-file-authority D3). A DACL with more entries than this fails
/// closed inside the primitive rather than being partially read.
const MAX_PRIVATE_DACL_ENTRIES: u16 = 16;
/// `ACCESS_ALLOWED_ACE_TYPE` / `ACCESS_DENIED_ACE_TYPE` (Win32 SystemServices).
/// Defined locally to avoid enabling an extra `windows-sys` feature for two
/// scalar constants; both are stable ABI values.
const ACCESS_ALLOWED_ACE_TYPE: u8 = 0;
const ACCESS_DENIED_ACE_TYPE: u8 = 1;
/// `INHERITED_ACE` (Win32 Security) as a `u8` mask over the ACE header flags.
const INHERITED_ACE_FLAG: u8 = 0x10;

/// Observe the DACL control word AND its entry list on the OWNED handle in one
/// bounded snapshot (windows-private-file-authority D3, amended 2026-07-21).
///
/// A single `GetSecurityInfo` allocates one self-relative security descriptor;
/// the protected-state control bit and every DACL entry are read from THAT one
/// allocation before it is freed inside this call, so no consumer can join a
/// control word and an entry list drawn from two separately fetched descriptors.
/// The primitive returns a bounded, normalized, owned [`crate::DaclSnapshot`]:
/// the protected flag plus, per entry, the ACE type, header flags, inheritance,
/// access mask, and textual SID. No security descriptor, raw pointer, borrowed
/// DACL/ACE pointer, or SID pointer ever escapes. Absent, NULL, oversized
/// (beyond [`MAX_PRIVATE_DACL_ENTRIES`]), or unknown-type DACLs fail closed as
/// typed errors here — the safe policy layer never sees a partial observation.
pub(super) fn private_dacl_snapshot(file: &File) -> io::Result<crate::DaclSnapshot> {
    let mut security_descriptor: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
    // SAFETY: `file` owns a valid handle carrying READ_CONTROL for this
    // synchronous call — every public constructor that reaches this fn requests
    // either GENERIC_READ (whose generic mapping includes READ_CONTROL) or
    // READ_CONTROL explicitly, so the handle can always read its own security.
    // Only the security-descriptor out-parameter is requested; the owner,
    // group, DACL, and SACL out-pointers are null, so Windows returns nothing
    // but the self-relative descriptor it allocates. `security_descriptor` is a
    // live, aligned out-pointer. GetSecurityInfo copies the handle's security
    // into a fresh allocation and retains no borrowed pointer.
    let status = unsafe {
        GetSecurityInfo(
            file.as_raw_handle(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            &raw mut security_descriptor,
        )
    };
    if status != ERROR_SUCCESS {
        return Err(i32::try_from(status)
            .map(io::Error::from_raw_os_error)
            .unwrap_or_else(|_| {
                io::Error::other("GetSecurityInfo returned an unmapped Win32 error")
            }));
    }
    if security_descriptor.is_null() {
        return Err(io::Error::other(
            "GetSecurityInfo succeeded without returning a security descriptor",
        ));
    }
    // The returned descriptor is one LocalAlloc'd allocation; the guard frees it
    // on every later return or panic path. Every borrowed DACL/ACE/SID pointer
    // read below points INTO this allocation and is consumed before the guard
    // drops it, so nothing native outlives this function.
    let descriptor = LocalSecurityDescriptor(security_descriptor);

    let mut control: SECURITY_DESCRIPTOR_CONTROL = 0;
    let mut revision: u32 = 0;
    // SAFETY: `descriptor.0` is the live self-relative security descriptor
    // GetSecurityInfo just allocated. `control` and `revision` are live,
    // aligned out-parameters. GetSecurityDescriptorControl copies two scalar
    // values out and retains no pointer.
    let result =
        unsafe { GetSecurityDescriptorControl(descriptor.0, &raw mut control, &raw mut revision) };
    if result == 0 {
        return Err(io::Error::last_os_error());
    }
    // SECURITY_DESCRIPTOR_REVISION is 1; an indeterminate control revision means
    // the control word cannot be trusted, so fail closed rather than read it.
    if revision != 1 {
        return Err(io::Error::other(
            "security descriptor control has an unexpected revision",
        ));
    }
    if control & SE_DACL_PRESENT == 0 {
        return Err(io::Error::other(
            "authority object has no present DACL to observe",
        ));
    }
    let protected = control & SE_DACL_PROTECTED != 0;

    let mut dacl_present: windows_sys::core::BOOL = 0;
    let mut dacl: *mut ACL = std::ptr::null_mut();
    let mut dacl_defaulted: windows_sys::core::BOOL = 0;
    // SAFETY: `descriptor.0` is the live self-relative descriptor. The three
    // out-parameters are live and aligned. GetSecurityDescriptorDacl copies the
    // present flag and writes a BORROWED interior pointer to the DACL that lives
    // inside `descriptor`'s allocation; it allocates nothing and transfers no
    // ownership. `dacl` is only read while `descriptor` is alive.
    let result = unsafe {
        GetSecurityDescriptorDacl(
            descriptor.0,
            &raw mut dacl_present,
            &raw mut dacl,
            &raw mut dacl_defaulted,
        )
    };
    if result == 0 {
        return Err(io::Error::last_os_error());
    }
    if dacl_present == 0 || dacl.is_null() {
        // SE_DACL_PRESENT with a NULL DACL grants everyone full access; fail
        // closed rather than treat an absent list as an empty allow-nothing one.
        return Err(io::Error::other(
            "authority object has a present but NULL DACL",
        ));
    }

    // SAFETY: `dacl` is a live, non-null ACL header inside the descriptor
    // allocation. Reading `AceCount` copies one scalar; no pointer escapes.
    let ace_count = unsafe { (*dacl).AceCount };
    if ace_count > MAX_PRIVATE_DACL_ENTRIES {
        return Err(io::Error::other(
            "authority object DACL exceeds the fixed private entry cap",
        ));
    }

    let mut entries = Vec::with_capacity(usize::from(ace_count));
    for index in 0..u32::from(ace_count) {
        let mut ace_ptr: *mut core::ffi::c_void = std::ptr::null_mut();
        // SAFETY: `dacl` is a live non-null ACL inside the descriptor allocation
        // and `index` is strictly below its AceCount. GetAce writes a BORROWED
        // interior pointer to the index-th ACE; `ace_ptr` is a live out-pointer.
        let got = unsafe { GetAce(dacl, index, &raw mut ace_ptr) };
        if got == 0 {
            return Err(io::Error::last_os_error());
        }
        if ace_ptr.is_null() {
            return Err(io::Error::other("GetAce returned a null ACE pointer"));
        }
        // ACCESS_ALLOWED_ACE and ACCESS_DENIED_ACE share the identical
        // {Header, Mask, SidStart} prefix layout, so the allowed-ACE view reads
        // the type-tagged header and mask of either.
        let ace = ace_ptr.cast::<ACCESS_ALLOWED_ACE>();
        // SAFETY: `ace` points at a live ACE (header + mask + embedded SID)
        // inside the descriptor allocation. Reading the header type/flags and
        // the mask copies out scalars.
        let (ace_type, ace_flags, mask) =
            unsafe { ((*ace).Header.AceType, (*ace).Header.AceFlags, (*ace).Mask) };
        let entry_type = match ace_type {
            ACCESS_ALLOWED_ACE_TYPE => crate::DaclAceKind::AccessAllowed,
            ACCESS_DENIED_ACE_TYPE => crate::DaclAceKind::AccessDenied,
            _ => {
                return Err(io::Error::other(
                    "authority object DACL carries an unsupported ACE type",
                ));
            }
        };
        // SAFETY: `SidStart` is the first DWORD of the SID embedded in the ACE;
        // its address is the SID pointer. The SID lives inside the descriptor
        // allocation and is consumed by `sid_to_string` before the guard drops.
        let sid_ptr = unsafe { &raw const (*ace).SidStart }
            .cast_mut()
            .cast::<core::ffi::c_void>();
        let sid = sid_to_string(sid_ptr)?;
        entries.push(crate::DaclEntry::new(
            entry_type,
            ace_flags,
            ace_flags & INHERITED_ACE_FLAG != 0,
            mask,
            sid,
        ));
    }
    Ok(crate::DaclSnapshot::new(protected, entries))
}

/// Convert one SID that lives inside a live security descriptor into its textual
/// form, freeing the `ConvertSidToStringSidW` allocation inside this call. No
/// native pointer escapes.
fn sid_to_string(sid: *mut core::ffi::c_void) -> io::Result<String> {
    let mut wide: windows_sys::core::PWSTR = std::ptr::null_mut();
    // SAFETY: `sid` addresses a valid SID inside a live security descriptor.
    // ConvertSidToStringSidW allocates one NUL-terminated wide string with
    // LocalAlloc and writes its pointer to `wide`; we own and free it below.
    let ok = unsafe { ConvertSidToStringSidW(sid, &raw mut wide) };
    if ok == 0 {
        return Err(io::Error::last_os_error());
    }
    if wide.is_null() {
        return Err(io::Error::other(
            "ConvertSidToStringSidW returned a null string",
        ));
    }
    let guard = LocalWideString(wide);
    // SAFETY: `guard.0` is a non-null NUL-terminated wide string just allocated
    // by ConvertSidToStringSidW; it stays live until the guard drops.
    let text = unsafe { wide_ptr_to_string(guard.0) };
    Ok(text)
}

/// Copy a NUL-terminated wide string into an owned `String`.
///
/// # Safety
/// `pointer` must be a valid, NUL-terminated wide string for the duration of the
/// call.
unsafe fn wide_ptr_to_string(pointer: *const u16) -> String {
    let mut length = 0usize;
    // SAFETY: the caller guarantees a NUL terminator, so the scan halts in
    // bounds; each read is of one live `u16`.
    while unsafe { *pointer.add(length) } != 0 {
        length += 1;
    }
    // SAFETY: `pointer` is valid for `length` `u16`s just measured above.
    let units = unsafe { std::slice::from_raw_parts(pointer, length) };
    String::from_utf16_lossy(units)
}

/// Owns a security descriptor `GetSecurityInfo` allocated with LocalAlloc and
/// frees it exactly once on drop. Keeps the native allocation from escaping the
/// [`private_dacl_snapshot`] fence on any path.
struct LocalSecurityDescriptor(PSECURITY_DESCRIPTOR);

impl Drop for LocalSecurityDescriptor {
    fn drop(&mut self) {
        // SAFETY: this type is constructed only from a non-null security
        // descriptor GetSecurityInfo allocated with LocalAlloc, and frees that
        // allocation exactly once. LocalFree accepts the pointer as an HLOCAL
        // and returns null on success; the returned handle is ignored.
        let _ = unsafe { LocalFree(self.0.cast::<core::ffi::c_void>()) };
    }
}

/// Owns a wide string `ConvertSidToStringSidW` allocated with LocalAlloc and
/// frees it exactly once on drop, keeping it from escaping [`sid_to_string`].
struct LocalWideString(windows_sys::core::PWSTR);

impl Drop for LocalWideString {
    fn drop(&mut self) {
        // SAFETY: this type is constructed only from a non-null wide string
        // ConvertSidToStringSidW allocated with LocalAlloc, and frees it exactly
        // once. LocalFree accepts the pointer as an HLOCAL and returns null on
        // success; the returned handle is ignored.
        let _ = unsafe { LocalFree(self.0.cast::<core::ffi::c_void>()) };
    }
}

pub(super) fn move_file_replace_write_through(source: &Path, destination: &Path) -> io::Result<()> {
    let source = encode_move_path(source)?;
    let destination = encode_move_path(destination)?;
    // SAFETY: both vectors are live, immutable, NUL-terminated UTF-16 paths
    // bounded to the documented Windows maximum for this synchronous call.
    // MoveFileExW retains neither pointer and receives only the two ADR-approved
    // flags. No optional pointer is passed.
    let result = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

pub(super) fn validate_move_path(path: &Path) -> io::Result<()> {
    let _ = encode_move_path(path)?;
    Ok(())
}

fn encode_move_path(path: &Path) -> io::Result<Vec<u16>> {
    let mut raw = Vec::with_capacity(260);
    for unit in path.as_os_str().encode_wide() {
        if unit == 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Windows move path contains an interior NUL",
            ));
        }
        if raw.len() == MAX_MOVE_PATH_UTF16_UNITS {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Windows move path exceeds 32,766 UTF-16 units",
            ));
        }
        raw.push(unit);
    }
    let slash = u16::from(b'/');
    let backslash = u16::from(b'\\');
    let question = u16::from(b'?');
    let dot = u16::from(b'.');
    let colon = u16::from(b':');
    let mut encoded = if raw.starts_with(&[backslash, backslash, question, backslash]) {
        raw
    } else if raw.starts_with(&[backslash, backslash, dot, backslash]) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Windows device namespace paths are not valid installation operands",
        ));
    } else if raw.starts_with(&[backslash, backslash]) {
        let mut verbatim = vec![
            backslash,
            backslash,
            question,
            backslash,
            u16::from(b'U'),
            u16::from(b'N'),
            u16::from(b'C'),
            backslash,
        ];
        verbatim.extend(
            raw[2..]
                .iter()
                .map(|unit| if *unit == slash { backslash } else { *unit }),
        );
        verbatim
    } else if raw.len() >= 3
        && matches!(raw[0], 0x0041..=0x005a | 0x0061..=0x007a)
        && raw[1] == colon
        && matches!(raw[2], unit if unit == backslash || unit == slash)
    {
        let mut verbatim = vec![backslash, backslash, question, backslash];
        verbatim.extend(
            raw.into_iter()
                .map(|unit| if unit == slash { backslash } else { unit }),
        );
        verbatim
    } else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Windows move path is not an absolute DOS, UNC, or verbatim path",
        ));
    };
    if encoded.len() > MAX_MOVE_PATH_UTF16_UNITS {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "normalized Windows move path exceeds 32,766 UTF-16 units",
        ));
    }
    encoded.push(0);
    Ok(encoded)
}

pub(super) fn mark_delete_on_close(file: &File) -> io::Result<()> {
    let disposition = FILE_DISPOSITION_INFO { DeleteFile: true };
    // SAFETY: `file` owns a valid file handle opened with DELETE access by the
    // only public constructors that expose exact-handle deletion. The buffer is
    // live, aligned, and exactly FILE_DISPOSITION_INFO-sized for this call.
    let result = unsafe {
        SetFileInformationByHandle(
            file.as_raw_handle(),
            FileDispositionInfo,
            (&raw const disposition).cast(),
            u32::try_from(std::mem::size_of::<FILE_DISPOSITION_INFO>())
                .expect("FILE_DISPOSITION_INFO size fits u32"),
        )
    };
    if result == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

pub(super) fn high_res_id(file: &File) -> io::Result<HighResFileId> {
    let mut info = std::mem::MaybeUninit::<FILE_ID_INFO>::zeroed();
    // SAFETY: `file` owns a valid handle. `info` is writable, aligned, and
    // FILE_ID_INFO-sized. Windows initializes the complete value on success.
    let result = unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle(),
            FileIdInfo,
            info.as_mut_ptr().cast(),
            u32::try_from(std::mem::size_of::<FILE_ID_INFO>()).expect("FILE_ID_INFO size fits u32"),
        )
    };
    if result == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: the successful Win32 call initialized every FILE_ID_INFO byte.
    let info = unsafe { info.assume_init() };
    Ok(HighResFileId {
        volume_serial_number: info.VolumeSerialNumber,
        file_id: u128::from_le_bytes(info.FileId.Identifier),
    })
}

pub(super) fn link_count(file: &File) -> io::Result<u64> {
    let mut info = std::mem::MaybeUninit::<FILE_STANDARD_INFO>::zeroed();
    // SAFETY: `file` owns a valid file handle. `info` is writable, aligned, and
    // FILE_STANDARD_INFO-sized. Windows initializes the complete value on
    // success, and no pointer or handle escapes this private boundary.
    let result = unsafe {
        GetFileInformationByHandleEx(
            file.as_raw_handle(),
            FileStandardInfo,
            info.as_mut_ptr().cast(),
            u32::try_from(std::mem::size_of::<FILE_STANDARD_INFO>())
                .expect("FILE_STANDARD_INFO size fits u32"),
        )
    };
    if result == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: the successful Win32 call initialized every
    // FILE_STANDARD_INFO byte.
    let info = unsafe { info.assume_init() };
    Ok(u64::from(info.NumberOfLinks))
}

pub(super) fn probe_process_existence(pid: u32) -> ProcessExistence {
    if pid == 0 {
        return ProcessExistence::Unverifiable;
    }
    // SAFETY: OpenProcess receives a scalar pid and requests only SYNCHRONIZE.
    // A successful owned handle is closed by ProcessHandle::drop.
    let raw = unsafe { OpenProcess(SYNCHRONIZE, 0, pid) };
    if raw.is_null() {
        return if io::Error::last_os_error().raw_os_error()
            == Some(i32::try_from(ERROR_INVALID_PARAMETER).expect("Win32 error fits i32"))
        {
            ProcessExistence::Missing
        } else {
            ProcessExistence::Unverifiable
        };
    }
    let handle = ProcessHandle(raw);
    // SAFETY: `handle` owns a valid process handle with SYNCHRONIZE access. A
    // zero timeout performs a bounded, non-blocking state observation.
    match unsafe { WaitForSingleObject(handle.0, 0) } {
        WAIT_OBJECT_0 => ProcessExistence::Missing,
        WAIT_TIMEOUT => ProcessExistence::Exists,
        _ => ProcessExistence::Unverifiable,
    }
}

struct ProcessHandle(HANDLE);

impl Drop for ProcessHandle {
    fn drop(&mut self) {
        // SAFETY: this type is constructed only from a unique successful
        // OpenProcess result and closes that handle exactly once.
        let _ = unsafe { CloseHandle(self.0) };
    }
}
