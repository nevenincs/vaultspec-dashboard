#![allow(
    dead_code,
    reason = "Windows bootstrap stays typed unavailable until protected private-file authority is approved"
)]
#![allow(
    clippy::result_large_err,
    reason = "retirement failure preserves exact non-cloneable file authority for retry"
)]

use std::io::{Read as _, Seek as _, Write as _};
use std::os::windows::io::AsRawHandle as _;
use std::path::Path;

use serde::{Deserialize, Serialize};
use vaultspec_windows_authority::{
    AuthorityFile, DaclAceKind, DaclSnapshot, HardeningDirectory, private_policy,
};
use windows_acl::acl::{ACL, AceType};

use super::TOKEN_BYTES;

const SYSTEM_SID: &str = "S-1-5-18";
const ADMINISTRATORS_SID: &str = "S-1-5-32-544";
const FILE_ALL_ACCESS: u32 = 0x001f_01ff;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileIdentity {
    pub volume_serial: u64,
    pub file_id: u128,
}

#[derive(Debug)]
pub struct RetainedCredentialFile {
    file: vaultspec_windows_authority::AuthorityFile,
    identity: FileIdentity,
}

#[derive(Debug)]
pub struct RetainedCredentialDirectory;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RetirementPhase {
    Named,
    ParentSyncPending,
}

#[derive(Debug)]
pub struct RetainedRetirementAuthority {
    state: RetirementState,
}

#[derive(Debug)]
enum RetirementState {
    Named {
        file: RetainedCredentialFile,
        path: std::path::PathBuf,
    },
    DeletePending {
        file: RetainedCredentialFile,
    },
}

#[derive(Debug)]
pub struct RetirementFailure {
    pub authority: RetainedRetirementAuthority,
    pub phase: RetirementPhase,
    pub source: std::io::Error,
}

impl RetainedRetirementAuthority {
    pub fn named(file: RetainedCredentialFile, directory_path: &Path, name: &str) -> Self {
        Self {
            state: RetirementState::Named {
                file,
                path: directory_path.join(name),
            },
        }
    }

    pub fn named_file_mut(&mut self) -> Option<&mut RetainedCredentialFile> {
        match &mut self.state {
            RetirementState::Named { file, .. } => Some(file),
            RetirementState::DeletePending { .. } => None,
        }
    }

    pub fn retry(self) -> Result<(), RetirementFailure> {
        match self.state {
            RetirementState::Named { file, path } => {
                let expected = file.file.identity();
                if let Err(source) = vaultspec_windows_authority::AuthorityFile::identity_at_path(
                    &path,
                )
                .and_then(|identity| {
                    if identity == expected {
                        file.file.mark_delete_on_close()
                    } else {
                        Err(std::io::Error::other(
                            "private file path no longer identifies retained authority",
                        ))
                    }
                }) {
                    return Err(RetirementFailure {
                        authority: Self {
                            state: RetirementState::Named { file, path },
                        },
                        phase: RetirementPhase::Named,
                        source,
                    });
                }
                Err(RetirementFailure {
                    authority: Self {
                        state: RetirementState::DeletePending { file },
                    },
                    phase: RetirementPhase::ParentSyncPending,
                    source: std::io::Error::other(
                        "Windows parent-directory durability requires the D9 amendment",
                    ),
                })
            }
            RetirementState::DeletePending { file } => Err(RetirementFailure {
                authority: Self {
                    state: RetirementState::DeletePending { file },
                },
                phase: RetirementPhase::ParentSyncPending,
                source: std::io::Error::other(
                    "Windows parent-directory durability requires the D9 amendment",
                ),
            }),
        }
    }
}

impl RetainedCredentialFile {
    pub fn identity(&self) -> &FileIdentity {
        &self.identity
    }

    pub fn rewrite(&mut self, bytes: &[u8], maximum: usize) -> std::io::Result<()> {
        if bytes.len() > maximum {
            return Err(std::io::Error::other("private file exceeds its byte bound"));
        }
        let file = self.file.file_mut();
        file.rewind()?;
        file.set_len(0)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        if bounded_read(file, maximum)? != bytes {
            return Err(std::io::Error::other(
                "private file same-handle reread differs",
            ));
        }
        Ok(())
    }
}

pub fn create(
    directory_path: &Path,
    name: &str,
    bytes: &[u8],
) -> std::io::Result<RetainedCredentialFile> {
    std::fs::create_dir_all(directory_path)?;
    harden_directory(directory_path)?;
    let path = directory_path.join(name);
    let mut authority = AuthorityFile::create_prepared(&path)?;
    harden_handle(&authority)?;
    validate_file_acl(&authority)?;
    if authority.link_count()? != 1 {
        return Err(std::io::Error::other(
            "credential file has more than one link",
        ));
    }
    authority.file_mut().write_all(bytes)?;
    authority.file_mut().sync_all()?;
    let reread = bounded_read(authority.file_mut(), bytes.len())?;
    if reread != bytes {
        return Err(std::io::Error::other(
            "credential same-handle reread differs from written bytes",
        ));
    }
    validate_file_acl(&authority)?;
    let id = authority.identity();
    Ok(RetainedCredentialFile {
        file: authority,
        identity: FileIdentity {
            volume_serial: id.volume_serial_number,
            file_id: id.file_id,
        },
    })
}

pub fn open_and_read(path: &Path) -> std::io::Result<(RetainedCredentialFile, Vec<u8>)> {
    open_private(path, TOKEN_BYTES)
}

pub fn revalidate_named(
    _directory: &RetainedCredentialDirectory,
    _name: &std::ffi::OsStr,
    _retained: &RetainedCredentialFile,
    _expected: &[u8],
) -> std::io::Result<()> {
    Err(std::io::Error::new(
        std::io::ErrorKind::PermissionDenied,
        "Windows protected credential authority is not provisioned",
    ))
}

pub fn retain_product_root(_path: &Path) -> std::io::Result<std::fs::File> {
    Err(std::io::Error::new(
        std::io::ErrorKind::PermissionDenied,
        "Windows protected credential authority is not provisioned",
    ))
}

pub fn prepare_directory_authority(
    _root: std::fs::File,
    _root_path: &Path,
) -> std::io::Result<RetainedCredentialDirectory> {
    Err(std::io::Error::new(
        std::io::ErrorKind::PermissionDenied,
        "Windows protected credential authority is not provisioned",
    ))
}

pub fn open_directory_authority(
    _root: std::fs::File,
    _root_path: &Path,
) -> std::io::Result<RetainedCredentialDirectory> {
    Err(std::io::Error::new(
        std::io::ErrorKind::PermissionDenied,
        "Windows protected credential authority is not provisioned",
    ))
}

pub fn entry_exists(
    _directory: &RetainedCredentialDirectory,
    _name: &std::ffi::OsStr,
) -> std::io::Result<bool> {
    Err(std::io::Error::new(
        std::io::ErrorKind::PermissionDenied,
        "Windows protected credential authority is not provisioned",
    ))
}

pub fn create_in(
    _directory: &RetainedCredentialDirectory,
    _name: &str,
    _bytes: &[u8],
) -> std::io::Result<RetainedCredentialFile> {
    Err(std::io::Error::new(
        std::io::ErrorKind::PermissionDenied,
        "Windows protected credential authority is not provisioned",
    ))
}

pub fn open_private_in(
    _directory: &RetainedCredentialDirectory,
    _name: &std::ffi::OsStr,
    _maximum: usize,
) -> std::io::Result<(RetainedCredentialFile, Vec<u8>)> {
    Err(std::io::Error::new(
        std::io::ErrorKind::PermissionDenied,
        "Windows protected credential authority is not provisioned",
    ))
}

pub fn open_private(
    path: &Path,
    maximum: usize,
) -> std::io::Result<(RetainedCredentialFile, Vec<u8>)> {
    let _ = (path, maximum);
    Err(std::io::Error::new(
        std::io::ErrorKind::PermissionDenied,
        "Windows private-file reads require protected-DACL proof",
    ))
}

pub fn restrict_existing(path: &Path) -> std::io::Result<()> {
    // Compatibility semantics for established noncredential receipt/journal
    // callers. Credential creation and reads never use this helper and remain
    // behind the exact protected-DACL D9 gate.
    let _ = path;
    Ok(())
}

const DIRECTORY_ACE_FLAGS: u8 = 0x03;
const FILE_ACE_FLAGS: u8 = 0x00;

fn harden_directory(path: &Path) -> std::io::Result<()> {
    // The hardening authority carries WRITE_DAC + READ_CONTROL and denies
    // delete/rename sharing, so the DACL is mutated AND snapshotted through one
    // exact retained handle whose identity cannot change mid-hardening.
    let hardening = HardeningDirectory::open_existing(path)?;
    let current = current_user_sid()?;
    let mut acl = ACL::from_file_handle(
        hardening.directory().as_raw_handle() as *mut winapi::ctypes::c_void,
        false,
    )
    .map_err(win_error)?;
    add_three_principals(&mut acl, &current, DIRECTORY_ACE_FLAGS)?;
    remove_nonconforming(
        &mut acl,
        &hardening.dacl_snapshot()?,
        &current,
        DIRECTORY_ACE_FLAGS,
    )?;
    hardening.revalidate()?;
    // Final proof reads ONE snapshot: protected bit + exact three-principal list
    // together, so no consumer joins two descriptor states.
    private_policy::validate_private_directory(&hardening.dacl_snapshot()?, &current)
        .map_err(policy_error)
}

fn harden_handle(authority: &AuthorityFile) -> std::io::Result<()> {
    let current = current_user_sid()?;
    let mut acl = ACL::from_file_handle(
        authority.file().as_raw_handle() as *mut winapi::ctypes::c_void,
        false,
    )
    .map_err(win_error)?;
    add_three_principals(&mut acl, &current, FILE_ACE_FLAGS)?;
    remove_nonconforming(
        &mut acl,
        &authority.dacl_snapshot()?,
        &current,
        FILE_ACE_FLAGS,
    )
}

/// Install the exact three allow entries (windows-acl mutation).
fn add_three_principals(acl: &mut ACL, current: &str, required_flags: u8) -> std::io::Result<()> {
    for sid_text in [current, SYSTEM_SID, ADMINISTRATORS_SID] {
        let sid = windows_acl::helper::string_to_sid(sid_text).map_err(win_error)?;
        acl.add_entry(
            sid.as_ptr().cast_mut().cast(),
            AceType::AccessAllow,
            required_flags,
            FILE_ALL_ACCESS,
        )
        .map_err(win_error)?;
    }
    Ok(())
}

/// Remove every entry that is not one of the three conforming allow entries,
/// driven by the single DACL snapshot (windows-acl retained only for the
/// `remove_entry` mutation).
fn remove_nonconforming(
    acl: &mut ACL,
    snapshot: &DaclSnapshot,
    current: &str,
    required_flags: u8,
) -> std::io::Result<()> {
    for entry in snapshot.entries() {
        let sid = entry.sid();
        let known_principal = sid == current || sid == SYSTEM_SID || sid == ADMINISTRATORS_SID;
        let conforming = entry.entry_type() == DaclAceKind::AccessAllowed
            && known_principal
            && entry.flags() == required_flags
            && entry.mask() == FILE_ALL_ACCESS
            && !entry.inherited();
        if !conforming {
            let sid = windows_acl::helper::string_to_sid(entry.sid()).map_err(win_error)?;
            let ace_type = match entry.entry_type() {
                DaclAceKind::AccessAllowed => AceType::AccessAllow,
                DaclAceKind::AccessDenied => AceType::AccessDeny,
            };
            acl.remove_entry(
                sid.as_ptr().cast_mut().cast(),
                Some(ace_type),
                Some(entry.flags()),
            )
            .map_err(win_error)?;
        }
    }
    Ok(())
}

/// Validate the exact protected three-principal DACL of a credential FILE from
/// one snapshot (windows-private-file-authority D4).
fn validate_file_acl(authority: &AuthorityFile) -> std::io::Result<()> {
    let current = current_user_sid()?;
    private_policy::validate_private_file(&authority.dacl_snapshot()?, &current)
        .map_err(policy_error)
}

fn policy_error(violation: private_policy::PrivatePolicyViolation) -> std::io::Error {
    std::io::Error::other(violation.to_string())
}

fn current_user_sid() -> std::io::Result<String> {
    let name = windows_acl::helper::current_user()
        .ok_or_else(|| std::io::Error::other("current Windows user is unavailable"))?;
    let sid = windows_acl::helper::name_to_sid(&name, None).map_err(win_error)?;
    windows_acl::helper::sid_to_string(sid.as_ptr().cast_mut().cast()).map_err(win_error)
}

fn bounded_read(file: &mut std::fs::File, maximum: usize) -> std::io::Result<Vec<u8>> {
    file.rewind()?;
    let mut buffer = vec![0_u8; maximum.saturating_add(1)];
    let mut used = 0;
    while used < buffer.len() {
        let read = file.read(&mut buffer[used..])?;
        if read == 0 {
            break;
        }
        used += read;
    }
    if used > maximum {
        return Err(std::io::Error::other("private file exceeds its byte bound"));
    }
    Ok(buffer[..used].to_vec())
}

fn win_error(code: u32) -> std::io::Error {
    std::io::Error::from_raw_os_error(code as i32)
}
