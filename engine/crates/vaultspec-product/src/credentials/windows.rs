#![allow(
    clippy::result_large_err,
    reason = "retirement failure preserves exact non-cloneable file authority for retry"
)]
//! Windows protected-private-file credential authority (windows-private-file
//! D6 un-gating — the product consumer of the reviewed D9 safe surface).
//!
//! Every credential and descriptor file is created empty via
//! [`PrivateFileCreation`] (which carries `WRITE_DAC`), hardened to the exact
//! protected three-principal DACL (current user, LocalSystem, built-in
//! Administrators) through its retained handle, validated with ONE
//! `private_policy` snapshot, and only THEN written, synchronized, and
//! same-handle reread — the pre-permission window the ADR closes. Reads reopen
//! read-only ([`ReadOnlyAuthorityFile`]) and revalidate the protected list from
//! one snapshot before and after; recovery reopens writable
//! ([`PrivateFileRecovery`]). A read-only value can never rewrite or re-DACL.
//! This module adds no unsafe and no native call — it composes the reviewed D9
//! surface with the safe `windows-acl` handle mutation layer.

use std::io::Read as _;
use std::os::windows::io::AsRawHandle as _;
use std::path::Path;

use serde::{Deserialize, Serialize};
use vaultspec_windows_authority::{
    AuthorityFile, DaclAceKind, DaclSnapshot, HardeningDirectory, HighResFileId,
    PrivateFileCreation, PrivateFileRecovery, ReadOnlyAuthorityDirectory, ReadOnlyAuthorityFile,
    private_policy,
};
// The three principals, the exact mask, and the file/directory ACE flags are
// single-sourced by `private_policy` (windows-private-file-authority, private-file
// class addendum); this module declares no policy literal of its own, so what it
// installs and what the shared validator requires cannot drift apart.
use vaultspec_windows_authority::private_policy::{
    ADMINISTRATORS_SID, DIRECTORY_EXPLICIT_FLAGS, FILE_ALL_ACCESS, FILE_EXPLICIT_FLAGS,
    LOCAL_SYSTEM_SID,
};
use windows_acl::acl::{ACL, AceType};

use super::TOKEN_BYTES;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileIdentity {
    pub volume_serial: u64,
    pub file_id: u128,
}

fn identity_of(id: HighResFileId) -> FileIdentity {
    FileIdentity {
        volume_serial: id.volume_serial_number,
        file_id: id.file_id,
    }
}

/// A retained credential file. The variant records how it was obtained — a
/// freshly created empty file, a reopened file under recovery, or a read-only
/// verification handle. Rewrite and retirement authority exist only for the
/// first two; a read-only handle can never mutate.
#[derive(Debug)]
pub struct RetainedCredentialFile {
    authority: PrivateAuthority,
    identity: FileIdentity,
}

#[derive(Debug)]
enum PrivateAuthority {
    Created(PrivateFileCreation),
    Recovery(PrivateFileRecovery),
    ReadOnly(ReadOnlyAuthorityFile),
}

/// A retained, protected-DACL-verified credentials directory bound to its exact
/// identity. Windows credential operations are path-based (each re-derives an
/// exact private-file handle), so this holds no long-lived directory handle —
/// which would otherwise collide (delete/write sharing) with the WRITE_DAC
/// hardening handle a concurrent directory authority opens. Every operation
/// instead re-observes identity AND the protected three-principal DACL through a
/// permissive-sharing read-only observation snapshot before and after (D5
/// point-in-time), and the installation guard supplies exclusivity.
#[derive(Debug)]
pub struct RetainedCredentialDirectory {
    path: std::path::PathBuf,
    identity: FileIdentity,
}

impl RetainedCredentialDirectory {
    pub fn path(&self) -> &Path {
        &self.path
    }

    fn revalidate(&self) -> std::io::Result<()> {
        let observation = ReadOnlyAuthorityDirectory::open_observation(&self.path)?;
        if identity_of(observation.identity()) != self.identity {
            return Err(std::io::Error::other(
                "credentials directory identity changed",
            ));
        }
        validate_directory_dacl(&observation.dacl_snapshot()?)
    }
}

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
    pub fn named(
        file: RetainedCredentialFile,
        directory_path: &Path,
        name: &str,
    ) -> std::io::Result<Self> {
        let path = directory_path.join(name);
        if identity_of(AuthorityFile::identity_at_path(&path)?) != file.identity {
            return Err(std::io::Error::other(
                "retirement named path does not identify the retained file",
            ));
        }
        Ok(Self {
            state: RetirementState::Named { file, path },
        })
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
                let expected = file.identity;
                let named = AuthorityFile::identity_at_path(&path).map(identity_of);
                if let Err(source) = named.and_then(|identity| {
                    if identity == expected {
                        file.mark_delete_on_close()
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
                // Delete-on-close is armed on the exact retained handle. Durably
                // flushing the parent directory after the name is gone is a
                // SEPARATE Windows durability concern outside this DACL
                // amendment; it remains a typed, rollback-scoped gap (a reviewed
                // parent-directory durability guarantee is a tracked follow-on).
                Err(RetirementFailure {
                    authority: Self {
                        state: RetirementState::DeletePending { file },
                    },
                    phase: RetirementPhase::ParentSyncPending,
                    source: std::io::Error::other(
                        "Windows credential retirement requires a reviewed parent-directory durability guarantee",
                    ),
                })
            }
            RetirementState::DeletePending { file } => Err(RetirementFailure {
                authority: Self {
                    state: RetirementState::DeletePending { file },
                },
                phase: RetirementPhase::ParentSyncPending,
                source: std::io::Error::other(
                    "Windows credential retirement requires a reviewed parent-directory durability guarantee",
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
        let file = self.writable_file_mut()?;
        write_sync_reread(file, bytes, maximum)?;
        self.revalidate_protected()
    }

    fn writable_file_mut(&mut self) -> std::io::Result<&mut std::fs::File> {
        match &mut self.authority {
            PrivateAuthority::Created(created) => Ok(created.file_mut()),
            PrivateAuthority::Recovery(recovery) => Ok(recovery.file_mut()),
            PrivateAuthority::ReadOnly(_) => Err(std::io::Error::other(
                "read-only credential authority cannot rewrite",
            )),
        }
    }

    fn dacl_snapshot(&self) -> std::io::Result<DaclSnapshot> {
        match &self.authority {
            PrivateAuthority::Created(created) => created.dacl_snapshot(),
            PrivateAuthority::Recovery(recovery) => recovery.dacl_snapshot(),
            PrivateAuthority::ReadOnly(read_only) => read_only.dacl_snapshot(),
        }
    }

    fn link_count(&self) -> std::io::Result<u64> {
        match &self.authority {
            PrivateAuthority::Created(created) => created.link_count(),
            PrivateAuthority::Recovery(recovery) => recovery.link_count(),
            PrivateAuthority::ReadOnly(read_only) => read_only.link_count(),
        }
    }

    fn revalidate(&self) -> std::io::Result<()> {
        match &self.authority {
            PrivateAuthority::Created(created) => created.revalidate(),
            PrivateAuthority::Recovery(recovery) => recovery.revalidate(),
            PrivateAuthority::ReadOnly(read_only) => read_only.revalidate(),
        }
    }

    /// The load-bearing fail-closed check (windows-private-file-authority D4):
    /// exact identity, one link, and — from ONE snapshot — a protected
    /// three-principal DACL. An unreadable/absent DACL (`Err`) and an
    /// equivalent-looking unprotected DACL both refuse.
    fn revalidate_protected(&self) -> std::io::Result<()> {
        self.revalidate()?;
        if self.link_count()? != 1 {
            return Err(std::io::Error::other(
                "credential file has more than one link",
            ));
        }
        validate_file_dacl(&self.dacl_snapshot()?)
    }

    fn mark_delete_on_close(&self) -> std::io::Result<()> {
        match &self.authority {
            PrivateAuthority::Created(created) => created.mark_delete_on_close(),
            PrivateAuthority::Recovery(recovery) => recovery.mark_delete_on_close(),
            PrivateAuthority::ReadOnly(_) => Err(std::io::Error::other(
                "read-only credential authority cannot be retired",
            )),
        }
    }
}

pub fn open_and_read(path: &Path) -> std::io::Result<(RetainedCredentialFile, Vec<u8>)> {
    let (retained, bytes) = open_private(path, TOKEN_BYTES)?;
    if bytes.len() != TOKEN_BYTES {
        return Err(std::io::Error::other(
            "credential file must contain exactly 64 bytes",
        ));
    }
    Ok((retained, bytes))
}

pub fn revalidate_named(
    directory: &RetainedCredentialDirectory,
    name: &std::ffi::OsStr,
    retained: &RetainedCredentialFile,
    expected: &[u8],
) -> std::io::Result<()> {
    directory.revalidate()?;
    let path = directory.path.join(name);
    if identity_of(AuthorityFile::identity_at_path(&path)?) != retained.identity {
        return Err(std::io::Error::other(
            "credential named identity differs from retained authority",
        ));
    }
    retained.revalidate_protected()?;
    let reader = ReadOnlyAuthorityFile::open_private_readonly(&path)?;
    if identity_of(reader.identity()) != retained.identity {
        return Err(std::io::Error::other(
            "credential reopened identity differs from retained authority",
        ));
    }
    validate_file_dacl(&reader.dacl_snapshot()?)?;
    if reader.read_bounded(expected.len())? != expected {
        return Err(std::io::Error::other(
            "credential retained bytes differ from verified authority",
        ));
    }
    directory.revalidate()
}

pub fn retain_product_root(path: &Path) -> std::io::Result<std::fs::File> {
    // The directory authorities re-derive the credentials tree by relative child
    // traversal under the installation guard; this handle only proves the root
    // is an openable directory (backup semantics are required to open one).
    use std::os::windows::fs::OpenOptionsExt as _;
    const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
    const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
    std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
}

pub fn prepare_directory_authority(
    root: std::fs::File,
    root_path: &Path,
) -> std::io::Result<RetainedCredentialDirectory> {
    directory_authority(root, root_path, true)
}

pub fn open_directory_authority(
    root: std::fs::File,
    root_path: &Path,
) -> std::io::Result<RetainedCredentialDirectory> {
    directory_authority(root, root_path, false)
}

pub fn entry_exists(
    directory: &RetainedCredentialDirectory,
    name: &std::ffi::OsStr,
) -> std::io::Result<bool> {
    directory.revalidate()?;
    match std::fs::symlink_metadata(directory.path.join(name)) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

pub fn create_in(
    directory: &RetainedCredentialDirectory,
    name: &str,
    bytes: &[u8],
) -> std::io::Result<RetainedCredentialFile> {
    directory.revalidate()?;
    let file = create_hardened_file(&directory.path.join(name), bytes)?;
    directory.revalidate()?;
    Ok(file)
}

pub fn open_private(
    path: &Path,
    maximum: usize,
) -> std::io::Result<(RetainedCredentialFile, Vec<u8>)> {
    let reader = ReadOnlyAuthorityFile::open_private_readonly(path)?;
    let identity = identity_of(reader.identity());
    if reader.link_count()? != 1 {
        return Err(std::io::Error::other(
            "credential file has more than one link",
        ));
    }
    // Point-in-time protected-DACL proof before AND after the bounded read (D5).
    validate_file_dacl(&reader.dacl_snapshot()?)?;
    let bytes = reader.read_bounded(maximum)?;
    reader.revalidate()?;
    validate_file_dacl(&reader.dacl_snapshot()?)?;
    Ok((
        RetainedCredentialFile {
            authority: PrivateAuthority::ReadOnly(reader),
            identity,
        },
        bytes,
    ))
}

pub fn open_private_in(
    directory: &RetainedCredentialDirectory,
    name: &std::ffi::OsStr,
    maximum: usize,
) -> std::io::Result<(RetainedCredentialFile, Vec<u8>)> {
    directory.revalidate()?;
    let result = open_private(&directory.path.join(name), maximum)?;
    directory.revalidate()?;
    Ok(result)
}

pub fn restrict_existing(_path: &Path) -> std::io::Result<()> {
    // Compatibility no-op for established non-credential receipt/journal callers.
    // Credential creation and reads go through the protected-DACL create/open
    // paths above, never this helper.
    Ok(())
}

/// Open an existing directory child (the bootstrap descriptor) under RECOVERY
/// authority — a writable, retire-capable handle that proves the protected
/// three-principal DACL and returns the bounded bytes. Unlike [`open_private_in`]
/// (read-only), the returned file can later be rewritten and exact-retired, as
/// the descriptor transaction requires.
pub fn open_recovery_in(
    directory: &RetainedCredentialDirectory,
    name: &std::ffi::OsStr,
    maximum: usize,
) -> std::io::Result<(RetainedCredentialFile, Vec<u8>)> {
    directory.revalidate()?;
    let path = directory.path.join(name);
    let recovery = PrivateFileRecovery::open(&path)?;
    let identity = identity_of(recovery.identity());
    let mut retained = RetainedCredentialFile {
        authority: PrivateAuthority::Recovery(recovery),
        identity,
    };
    retained.revalidate_protected()?;
    let bytes = bounded_read(retained.writable_file_mut()?, maximum)?;
    retained.revalidate_protected()?;
    directory.revalidate()?;
    Ok((retained, bytes))
}

fn create_hardened_file(path: &Path, bytes: &[u8]) -> std::io::Result<RetainedCredentialFile> {
    let created = PrivateFileCreation::create(path)?;
    // Harden the EMPTY file's DACL to the exact protected three-principal list
    // through its retained WRITE_DAC handle, BEFORE any secret byte is written.
    harden_created(&created)?;
    let identity = identity_of(created.identity());
    let mut retained = RetainedCredentialFile {
        authority: PrivateAuthority::Created(created),
        identity,
    };
    retained.revalidate_protected()?;
    let file = retained.writable_file_mut()?;
    write_sync_reread(file, bytes, bytes.len())?;
    retained.revalidate_protected()?;
    Ok(retained)
}

fn write_sync_reread(
    file: &mut std::fs::File,
    bytes: &[u8],
    maximum: usize,
) -> std::io::Result<()> {
    use std::io::{Seek as _, Write as _};
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

fn directory_authority(
    root: std::fs::File,
    root_path: &Path,
    create_credentials: bool,
) -> std::io::Result<RetainedCredentialDirectory> {
    drop(root);
    let path = root_path.join("app-home").join("credentials");
    if create_credentials {
        std::fs::create_dir_all(&path)?;
    }
    // Establish (or idempotently re-prove) the protected three-principal DACL —
    // the Windows analog of the Unix owner-private 0700 mode, which `ensure`
    // cannot set through `create_dir_all`. This runs under the installation
    // guard for both open and prepare; a missing directory surfaces NotFound
    // here (routing `begin` to the create path) rather than a policy violation.
    harden_directory(&path)?;
    // Capture the exact directory identity through a permissive-sharing read-only
    // observation; no long-lived directory handle is retained (see the type doc).
    let observation = ReadOnlyAuthorityDirectory::open_observation(&path)?;
    let identity = identity_of(observation.identity());
    drop(observation);
    let authority = RetainedCredentialDirectory { path, identity };
    authority.revalidate()?;
    Ok(authority)
}

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
    add_three_principals(&mut acl, &current, DIRECTORY_EXPLICIT_FLAGS)?;
    remove_nonconforming(
        &mut acl,
        &hardening.dacl_snapshot()?,
        &current,
        DIRECTORY_EXPLICIT_FLAGS,
    )?;
    hardening.revalidate()?;
    // Final proof reads ONE snapshot: protected bit + exact three-principal list
    // together, so no consumer joins two descriptor states.
    private_policy::validate_private_directory(&hardening.dacl_snapshot()?, &current)
        .map_err(policy_error)
}

fn harden_created(created: &PrivateFileCreation) -> std::io::Result<()> {
    let current = current_user_sid()?;
    let mut acl = ACL::from_file_handle(
        created.file().as_raw_handle() as *mut winapi::ctypes::c_void,
        false,
    )
    .map_err(win_error)?;
    add_three_principals(&mut acl, &current, FILE_EXPLICIT_FLAGS)?;
    remove_nonconforming(
        &mut acl,
        &created.dacl_snapshot()?,
        &current,
        FILE_EXPLICIT_FLAGS,
    )
}

/// Install the exact three allow entries (windows-acl mutation).
fn add_three_principals(acl: &mut ACL, current: &str, required_flags: u8) -> std::io::Result<()> {
    for sid_text in [current, LOCAL_SYSTEM_SID, ADMINISTRATORS_SID] {
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
        let known_principal =
            sid == current || sid == LOCAL_SYSTEM_SID || sid == ADMINISTRATORS_SID;
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
fn validate_file_dacl(snapshot: &DaclSnapshot) -> std::io::Result<()> {
    private_policy::validate_private_file(snapshot, &current_user_sid()?).map_err(policy_error)
}

/// Validate the exact protected three-principal DACL of the credentials
/// DIRECTORY from one snapshot (windows-private-file-authority D4).
fn validate_directory_dacl(snapshot: &DaclSnapshot) -> std::io::Result<()> {
    private_policy::validate_private_directory(snapshot, &current_user_sid()?).map_err(policy_error)
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
    use std::io::Seek as _;
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
