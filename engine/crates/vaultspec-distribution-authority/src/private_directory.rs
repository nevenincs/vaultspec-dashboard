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

use cap_std::fs::Dir;
use std::path::Path;

#[cfg(windows)]
use vaultspec_windows_authority::win32_error as win_error;

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
    use vaultspec_windows_authority::HardeningDirectory;

    // The hardening authority carries WRITE_DAC + READ_CONTROL and denies
    // delete/rename sharing, so the DACL is mutated AND snapshotted through one
    // exact retained handle whose identity cannot change mid-hardening.
    let hardening =
        HardeningDirectory::open_existing(path).map_err(PrivateDirectoryError::Filesystem)?;
    harden_and_prove(&hardening)
}

/// Install and prove the exact protected three-principal DACL through ONE
/// already-retained hardening handle.
///
/// Shared by the pathname and parent-relative entry points so this crate holds a
/// single hardening composition: the two entry points differ only in how the
/// directory is NAMED, never in what protection they establish or how they prove
/// it.
#[cfg(windows)]
fn harden_and_prove(
    hardening: &vaultspec_windows_authority::HardeningDirectory,
) -> Result<(), PrivateDirectoryError> {
    use std::os::windows::io::AsRawHandle as _;

    use vaultspec_windows_authority::{DaclSnapshot, private_policy};
    use windows_acl::acl::ACL;

    let current = current_user_sid()?;
    let mut acl = ACL::from_file_handle(
        hardening.directory().as_raw_handle() as *mut winapi::ctypes::c_void,
        false,
    )
    .map_err(win_error)
    .map_err(PrivateDirectoryError::Filesystem)?;
    add_three_principals(&mut acl, &current, DIRECTORY_EXPLICIT_FLAGS)?;
    remove_nonconforming(
        &mut acl,
        &hardening
            .dacl_snapshot()
            .map_err(PrivateDirectoryError::Filesystem)?,
        &current,
        DIRECTORY_EXPLICIT_FLAGS,
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

/// Establish (or idempotently re-prove) owner-private protection on ONE named
/// direct child directory of a capability-held parent, resolved RELATIVELY.
///
/// This is the cap-std bridge. A `cap-std` `Dir` carries read and traverse
/// rights only, so it cannot be hardened through itself — but the requested
/// access of a relative open binds the CHILD, not the parent supplied as the
/// resolution root, so the child opens with `WRITE_DAC` through a parent holding
/// none. No absolute path is ever reconstructed for a capability-rooted object:
/// reconstructing one would detect a substituted object only after it had
/// already been opened and hardened, and could not speak for intermediate
/// components at all.
#[cfg(windows)]
pub(crate) fn ensure_owner_private_child_directory(
    parent: &Dir,
    name: &str,
) -> Result<(), PrivateDirectoryError> {
    use vaultspec_windows_authority::HardeningDirectory;

    let root = capability_root(parent)?;
    let hardening = HardeningDirectory::open_child_existing(&root, std::ffi::OsStr::new(name))
        .map_err(PrivateDirectoryError::Filesystem)?;
    harden_and_prove(&hardening)
}

/// Prove — never establish — owner-private protection on one named direct child
/// of a capability-held parent. Verification-only: it opens with read-only
/// observation rights and cannot re-DACL, delete, or traverse.
#[cfg(windows)]
pub(crate) fn prove_owner_private_child_directory(
    parent: &Dir,
    name: &str,
) -> Result<(), PrivateDirectoryError> {
    use vaultspec_windows_authority::{ReadOnlyAuthorityDirectory, private_policy};

    let root = capability_root(parent)?;
    let observation =
        ReadOnlyAuthorityDirectory::open_child_observation(&root, std::ffi::OsStr::new(name))
            .map_err(PrivateDirectoryError::Filesystem)?;
    let current = current_user_sid()?;
    let snapshot = observation
        .dacl_snapshot()
        .map_err(PrivateDirectoryError::Filesystem)?;
    private_policy::validate_private_directory(&snapshot, &current)
        .map_err(|violation| PrivateDirectoryError::policy(violation.to_string()))
}

/// Borrow the capability handle as a plain directory handle for one relative
/// open. The clone is the SAME kernel object, so this is retained capability,
/// not a copied observation of it.
#[cfg(windows)]
fn capability_root(parent: &Dir) -> Result<std::fs::File, PrivateDirectoryError> {
    Ok(parent
        .try_clone()
        .map_err(PrivateDirectoryError::Filesystem)?
        .into_std_file())
}

/// Establish (or idempotently re-prove) owner-private protection on ONE named
/// direct child directory of a capability-held parent, resolved RELATIVELY.
#[cfg(unix)]
pub(crate) fn ensure_owner_private_child_directory(
    parent: &Dir,
    name: &str,
) -> Result<(), PrivateDirectoryError> {
    use std::os::unix::fs::{MetadataExt as _, PermissionsExt as _};

    let child = open_child_exact(parent, name)?;
    child
        .set_permissions(std::fs::Permissions::from_mode(0o700))
        .map_err(PrivateDirectoryError::Filesystem)?;
    let metadata = child
        .metadata()
        .map_err(PrivateDirectoryError::Filesystem)?;
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

/// Prove — never establish — owner-private protection on one named direct child
/// of a capability-held parent.
#[cfg(unix)]
pub(crate) fn prove_owner_private_child_directory(
    parent: &Dir,
    name: &str,
) -> Result<(), PrivateDirectoryError> {
    use std::os::unix::fs::{MetadataExt as _, PermissionsExt as _};

    let metadata = open_child_exact(parent, name)?
        .metadata()
        .map_err(PrivateDirectoryError::Filesystem)?;
    if metadata.uid() != nix::unistd::Uid::effective().as_raw()
        || metadata.permissions().mode() & 0o777 != 0o700
    {
        return Err(PrivateDirectoryError::policy(
            "owner-private directory is not an effective-user 0700 directory",
        ));
    }
    Ok(())
}

/// Open one named direct child directory through the capability, refusing a
/// symlink or non-directory final link.
#[cfg(unix)]
fn open_child_exact(parent: &Dir, name: &str) -> Result<std::fs::File, PrivateDirectoryError> {
    let named = parent
        .symlink_metadata(name)
        .map_err(PrivateDirectoryError::Filesystem)?;
    if !named.is_dir() || named.file_type().is_symlink() {
        return Err(PrivateDirectoryError::policy(
            "owner-private path is not a directory final link",
        ));
    }
    Ok(parent
        .open_dir(name)
        .map_err(PrivateDirectoryError::Filesystem)?
        .into_std_file())
}

// The three principals, the exact mask, and the directory ACE flags are
// single-sourced by the authority crate's `private_policy` (private-file class
// addendum); this module declares no policy literal of its own, so what it
// installs and what the shared validator requires cannot drift apart.
#[cfg(windows)]
use vaultspec_windows_authority::private_policy::{
    ADMINISTRATORS_SID, DIRECTORY_EXPLICIT_FLAGS, FILE_ALL_ACCESS, FILE_EXPLICIT_FLAGS,
    LOCAL_SYSTEM_SID,
};

/// Install the exact three allow entries (`windows-acl` mutation, D2).
#[cfg(windows)]
fn add_three_principals(
    acl: &mut windows_acl::acl::ACL,
    current: &str,
    required_flags: u8,
) -> Result<(), PrivateDirectoryError> {
    use windows_acl::acl::AceType;

    for sid_text in [current, LOCAL_SYSTEM_SID, ADMINISTRATORS_SID] {
        let sid = windows_acl::helper::string_to_sid(sid_text)
            .map_err(win_error)
            .map_err(PrivateDirectoryError::Filesystem)?;
        acl.add_entry(
            sid.as_ptr().cast_mut().cast(),
            AceType::AccessAllow,
            required_flags,
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
    required_flags: u8,
) -> Result<(), PrivateDirectoryError> {
    use vaultspec_windows_authority::DaclAceKind;
    use windows_acl::acl::AceType;

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

/// This crate's error-typed view of the one shared principal derivation.
#[cfg(windows)]
pub(crate) fn current_user_sid() -> Result<String, PrivateDirectoryError> {
    vaultspec_windows_authority::current_user_sid().map_err(PrivateDirectoryError::Filesystem)
}

/// Create ONE named direct child file of a capability-held parent, establish its
/// private protection on that exact creation handle BEFORE any byte is written,
/// then write, synchronize, and re-prove it.
///
/// The trust datastore's files are authority-bearing — `root.json` is the anchor
/// a LATER verification run reads to decide a trust outcome — so each is proven
/// on its own retained handle rather than relying on the parent directory's
/// inheritance. An inherited descriptor is not `SE_DACL_PROTECTED` and carries
/// `INHERITED_ACE` entries, so a later reader could only credit it by
/// re-observing the parent too, joining two objects' descriptor states observed
/// at two different times. There is deliberately no validator for that weaker
/// shape.
#[cfg(windows)]
pub(crate) fn write_private_datastore_file(
    parent: &Dir,
    name: &str,
    bytes: &[u8],
) -> Result<(), PrivateDirectoryError> {
    use std::io::{Read as _, Seek as _, Write as _};
    use std::os::windows::io::AsRawHandle as _;

    use vaultspec_windows_authority::PrivateFileCreation;
    use windows_acl::acl::ACL;

    let root = capability_root(parent)?;
    let mut created = PrivateFileCreation::create_child(&root, std::ffi::OsStr::new(name))
        .map_err(PrivateDirectoryError::Filesystem)?;

    // Harden the EMPTY file through its own retained WRITE_DAC handle, closing
    // the window in which authority-bearing bytes could exist unprotected.
    let current = current_user_sid()?;
    let mut acl = ACL::from_file_handle(
        created.file().as_raw_handle() as *mut winapi::ctypes::c_void,
        false,
    )
    .map_err(win_error)
    .map_err(PrivateDirectoryError::Filesystem)?;
    add_three_principals(&mut acl, &current, FILE_EXPLICIT_FLAGS)?;
    remove_nonconforming(
        &mut acl,
        &created
            .dacl_snapshot()
            .map_err(PrivateDirectoryError::Filesystem)?,
        &current,
        FILE_EXPLICIT_FLAGS,
    )?;
    prove_created_file(&created, &current)?;

    let file = created.file_mut();
    file.write_all(bytes)
        .and_then(|()| file.sync_all())
        .map_err(PrivateDirectoryError::Filesystem)?;
    file.rewind().map_err(PrivateDirectoryError::Filesystem)?;
    let mut reread = Vec::with_capacity(bytes.len());
    file.read_to_end(&mut reread)
        .map_err(PrivateDirectoryError::Filesystem)?;
    if reread != bytes {
        return Err(PrivateDirectoryError::policy(
            "datastore file same-handle reread differs from the written bytes",
        ));
    }
    prove_created_file(&created, &current)
}

/// Exact identity, one link, and — from ONE snapshot — the protected
/// three-principal file DACL.
#[cfg(windows)]
fn prove_created_file(
    created: &vaultspec_windows_authority::PrivateFileCreation,
    current: &str,
) -> Result<(), PrivateDirectoryError> {
    use vaultspec_windows_authority::private_policy;

    created
        .revalidate()
        .map_err(PrivateDirectoryError::Filesystem)?;
    if created
        .link_count()
        .map_err(PrivateDirectoryError::Filesystem)?
        != 1
    {
        return Err(PrivateDirectoryError::policy(
            "datastore file has more than one link",
        ));
    }
    let snapshot = created
        .dacl_snapshot()
        .map_err(PrivateDirectoryError::Filesystem)?;
    private_policy::validate_private_file(&snapshot, current)
        .map_err(|violation| PrivateDirectoryError::policy(violation.to_string()))
}

/// Create ONE named direct child file of a capability-held parent owner-private,
/// then write, synchronize, and prove it.
#[cfg(unix)]
pub(crate) fn write_private_datastore_file(
    parent: &Dir,
    name: &str,
    bytes: &[u8],
) -> Result<(), PrivateDirectoryError> {
    use cap_std::fs::OpenOptionsExt as _;
    use std::io::Write as _;
    use std::os::unix::fs::{MetadataExt as _, PermissionsExt as _};

    let mut options = cap_std::fs::OpenOptions::new();
    options.read(true).write(true).create_new(true).mode(0o600);
    let mut file = parent
        .open_with(name, &options)
        .map_err(PrivateDirectoryError::Filesystem)?
        .into_std();
    let metadata = file.metadata().map_err(PrivateDirectoryError::Filesystem)?;
    if metadata.uid() != nix::unistd::Uid::effective().as_raw()
        || metadata.nlink() != 1
        || metadata.permissions().mode() & 0o777 != 0o600
    {
        return Err(PrivateDirectoryError::policy(
            "datastore file is not an effective-user 0600 single-link regular file",
        ));
    }
    file.write_all(bytes)
        .and_then(|()| file.sync_all())
        .map_err(PrivateDirectoryError::Filesystem)
}
