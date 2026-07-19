//! Private Win32 FFI for the D9 file/process-authority exception.

use std::fs::File;
use std::io;
use std::os::windows::io::AsRawHandle;

use windows_sys::Win32::Foundation::{
    CloseHandle, ERROR_INVALID_PARAMETER, HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows_sys::Win32::Storage::FileSystem::{
    FILE_DISPOSITION_INFO, FILE_ID_INFO, FileDispositionInfo, FileIdInfo,
    GetFileInformationByHandleEx, SYNCHRONIZE, SetFileInformationByHandle,
};
use windows_sys::Win32::System::Threading::{OpenProcess, WaitForSingleObject};

use crate::{HighResFileId, ProcessExistence};

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
