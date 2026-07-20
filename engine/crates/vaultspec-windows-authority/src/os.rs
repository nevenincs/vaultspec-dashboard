//! Private Win32 FFI for the D9 file/process-authority exception.

use std::fs::{File, OpenOptions};
use std::io;
use std::os::windows::ffi::OsStrExt;
use std::os::windows::fs::OpenOptionsExt;
use std::os::windows::io::{AsRawHandle, FromRawHandle};
use std::path::Path;

use windows_sys::Wdk::Foundation::OBJECT_ATTRIBUTES;
use windows_sys::Wdk::Storage::FileSystem::{
    FILE_CREATE, FILE_DIRECTORY_FILE, FILE_OPEN, FILE_OPEN_REPARSE_POINT,
    FILE_SYNCHRONOUS_IO_NONALERT, NtCreateFile,
};
use windows_sys::Win32::Foundation::{
    CloseHandle, ERROR_INVALID_PARAMETER, ERROR_MR_MID_NOT_FOUND, HANDLE, OBJ_CASE_INSENSITIVE,
    RtlNtStatusToDosError, UNICODE_STRING, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows_sys::Win32::Storage::FileSystem::{
    DELETE, FILE_ADD_SUBDIRECTORY, FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_NORMAL,
    FILE_ATTRIBUTE_REPARSE_POINT, FILE_ATTRIBUTE_TAG_INFO, FILE_DISPOSITION_INFO, FILE_ID_INFO,
    FILE_LIST_DIRECTORY, FILE_READ_ATTRIBUTES, FILE_SHARE_READ, FILE_STANDARD_INFO, FILE_TRAVERSE,
    FileAttributeTagInfo, FileDispositionInfo, FileIdInfo, FileStandardInfo,
    GetFileInformationByHandleEx, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
    SYNCHRONIZE, SetFileInformationByHandle,
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

pub(super) fn open_child_directory(parent: &File, name: &[u16], create: bool) -> io::Result<File> {
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
    // read-only by contract. Every optional pointer is null. No pointer escapes.
    let status = unsafe {
        NtCreateFile(
            &raw mut raw_handle,
            DIRECTORY_ACCESS,
            &raw const object_attributes,
            &raw mut io_status,
            std::ptr::null(),
            FILE_ATTRIBUTE_NORMAL,
            FILE_SHARE_READ,
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
