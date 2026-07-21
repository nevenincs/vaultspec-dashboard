//! One cross-platform owner-private directory authority for this crate's
//! staging, publication, and datastore paths.
//!
//! Unix expresses owner-private as mode `0700` owned by the effective user,
//! established and proven through a retained handle whose identity matches the
//! named final link. Windows has no mode bits, so the equivalent property is the
//! reviewed `windows-private-file-authority` contract: the exact protected
//! (`SE_DACL_PROTECTED`) three-principal DACL — current user, LocalSystem, and
//! built-in Administrators — installed through one retained `WRITE_DAC`
//! hardening handle whose identity cannot change mid-hardening, then proven from
//! ONE `GetSecurityInfo` snapshot so the protected bit and the entry list can
//! never be joined across two descriptor states (D3/D4).
//!
//! This module adds no unsafe code and no native call. It composes the reviewed
//! safe D9 surface (`HardeningDirectory` + `private_policy`) with the pinned
//! `windows-acl` handle mutation layer (D2), exactly as the reviewed product
//! credentials consumer does.
//!
//! Directory entries are the unit of protection here. The installed Windows
//! entries carry `OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE`, so every file and
//! subdirectory created inside a hardened directory receives exactly those three
//! principals — the analog of a `0600` file created inside a `0700` directory.
//! Files that carry *authority* (credentials, bootstrap descriptors) are not
//! covered by inheritance: each of those is hardened on its own exact retained
//! handle by its owning consumer.

use std::path::Path;

/// An owner-private directory could not be established or proven.
#[derive(Debug)]
pub(crate) enum PrivateDirectoryError {
    /// A filesystem or operating-system operation failed.
    Filesystem(std::io::Error),
    /// The directory exists but does not meet the owner-private contract.
    Policy(String),
}

impl PrivateDirectoryError {
    fn policy(detail: impl Into<String>) -> Self {
        Self::Policy(detail.into())
    }
}

/// Establish (or idempotently re-prove) owner-private protection on an EXISTING
/// directory, then prove the resulting state.
#[cfg(unix)]
pub(crate) fn ensure_owner_private_directory(path: &Path) -> Result<(), PrivateDirectoryError> {
    use std::os::unix::fs::{MetadataExt as _, PermissionsExt as _};

    let named = path
        .symlink_metadata()
        .map_err(PrivateDirectoryError::Filesystem)?;
    let retained = std::fs::File::open(path).map_err(PrivateDirectoryError::Filesystem)?;
    retained
        .set_permissions(std::fs::Permissions::from_mode(0o700))
        .map_err(PrivateDirectoryError::Filesystem)?;
    let metadata = retained
        .metadata()
        .map_err(PrivateDirectoryError::Filesystem)?;
    if !named.is_dir() || named.file_type().is_symlink() {
        return Err(PrivateDirectoryError::policy(
            "owner-private path is not a directory final link",
        ));
    }
    if named.dev() != metadata.dev() || named.ino() != metadata.ino() {
        return Err(PrivateDirectoryError::policy(
            "owner-private directory identity changed during hardening",
        ));
    }
    if metadata.uid() != nix::unistd::Uid::effective().as_raw() {
        return Err(PrivateDirectoryError::policy(
            "owner-private directory is not owned by the effective user",
        ));
    }
    if metadata.permissions().mode() & 0o777 != 0o700 {
        return Err(PrivateDirectoryError::policy(
            "owner-private directory does not carry mode 0700",
        ));
    }
    Ok(())
}

/// Establish (or idempotently re-prove) owner-private protection on an EXISTING
/// directory, then prove the resulting state.
#[cfg(windows)]
pub(crate) fn ensure_owner_private_directory(path: &Path) -> Result<(), PrivateDirectoryError> {
    use std::os::windows::io::AsRawHandle as _;

    use vaultspec_windows_authority::{DaclSnapshot, HardeningDirectory, private_policy};
    use windows_acl::acl::ACL;

    // The hardening authority carries WRITE_DAC + READ_CONTROL and denies
    // delete/rename sharing, so the DACL is mutated AND snapshotted through one
    // exact retained handle whose identity cannot change mid-hardening.
    let hardening =
        HardeningDirectory::open_existing(path).map_err(PrivateDirectoryError::Filesystem)?;
    let current = current_user_sid()?;
    let mut acl = ACL::from_file_handle(
        hardening.directory().as_raw_handle() as *mut winapi::ctypes::c_void,
        false,
    )
    .map_err(win_error)
    .map_err(PrivateDirectoryError::Filesystem)?;
    add_three_principals(&mut acl, &current)?;
    remove_nonconforming(
        &mut acl,
        &hardening
            .dacl_snapshot()
            .map_err(PrivateDirectoryError::Filesystem)?,
        &current,
    )?;
    hardening
        .revalidate()
        .map_err(PrivateDirectoryError::Filesystem)?;
    // The final proof reads ONE snapshot: the protected bit and the exact
    // three-principal list together, so no consumer joins two descriptor states.
    let snapshot: DaclSnapshot = hardening
        .dacl_snapshot()
        .map_err(PrivateDirectoryError::Filesystem)?;
    private_policy::validate_private_directory(&snapshot, &current)
        .map_err(|violation| PrivateDirectoryError::policy(violation.to_string()))
}

// The three principals, the exact mask, and the directory ACE flags are
// single-sourced by the authority crate's `private_policy` (private-file class
// addendum); this module declares no policy literal of its own, so what it
// installs and what the shared validator requires cannot drift apart.
#[cfg(windows)]
use vaultspec_windows_authority::private_policy::{
    ADMINISTRATORS_SID, DIRECTORY_EXPLICIT_FLAGS, FILE_ALL_ACCESS, LOCAL_SYSTEM_SID,
};

/// Install the exact three allow entries (`windows-acl` mutation, D2).
#[cfg(windows)]
fn add_three_principals(
    acl: &mut windows_acl::acl::ACL,
    current: &str,
) -> Result<(), PrivateDirectoryError> {
    use windows_acl::acl::AceType;

    for sid_text in [current, LOCAL_SYSTEM_SID, ADMINISTRATORS_SID] {
        let sid = windows_acl::helper::string_to_sid(sid_text)
            .map_err(win_error)
            .map_err(PrivateDirectoryError::Filesystem)?;
        acl.add_entry(
            sid.as_ptr().cast_mut().cast(),
            AceType::AccessAllow,
            DIRECTORY_EXPLICIT_FLAGS,
            FILE_ALL_ACCESS,
        )
        .map_err(win_error)
        .map_err(PrivateDirectoryError::Filesystem)?;
    }
    Ok(())
}

/// Remove every entry that is not one of the three conforming allow entries,
/// driven by the single DACL snapshot (`windows-acl` retained only for the
/// `remove_entry` mutation).
#[cfg(windows)]
fn remove_nonconforming(
    acl: &mut windows_acl::acl::ACL,
    snapshot: &vaultspec_windows_authority::DaclSnapshot,
    current: &str,
) -> Result<(), PrivateDirectoryError> {
    use vaultspec_windows_authority::DaclAceKind;
    use windows_acl::acl::AceType;

    for entry in snapshot.entries() {
        let sid = entry.sid();
        let known_principal =
            sid == current || sid == LOCAL_SYSTEM_SID || sid == ADMINISTRATORS_SID;
        let conforming = entry.entry_type() == DaclAceKind::AccessAllowed
            && known_principal
            && entry.flags() == DIRECTORY_EXPLICIT_FLAGS
            && entry.mask() == FILE_ALL_ACCESS
            && !entry.inherited();
        if !conforming {
            let sid = windows_acl::helper::string_to_sid(entry.sid())
                .map_err(win_error)
                .map_err(PrivateDirectoryError::Filesystem)?;
            let ace_type = match entry.entry_type() {
                DaclAceKind::AccessAllowed => AceType::AccessAllow,
                DaclAceKind::AccessDenied => AceType::AccessDeny,
            };
            acl.remove_entry(
                sid.as_ptr().cast_mut().cast(),
                Some(ace_type),
                Some(entry.flags()),
            )
            .map_err(win_error)
            .map_err(PrivateDirectoryError::Filesystem)?;
        }
    }
    Ok(())
}

#[cfg(windows)]
pub(crate) fn current_user_sid() -> Result<String, PrivateDirectoryError> {
    let name = windows_acl::helper::current_user().ok_or_else(|| {
        PrivateDirectoryError::Filesystem(std::io::Error::other(
            "current Windows user is unavailable",
        ))
    })?;
    let sid = windows_acl::helper::name_to_sid(&name, None)
        .map_err(win_error)
        .map_err(PrivateDirectoryError::Filesystem)?;
    windows_acl::helper::sid_to_string(sid.as_ptr().cast_mut().cast())
        .map_err(win_error)
        .map_err(PrivateDirectoryError::Filesystem)
}

#[cfg(windows)]
fn win_error(code: u32) -> std::io::Error {
    std::io::Error::from_raw_os_error(code as i32)
}
