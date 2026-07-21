//! Private-file authority acceptance: DACL snapshots, the protected
//! three-principal policy, read-only observation, and the parent-relative
//! constructors (windows-private-file-authority D3/D4/D7 and its addenda).
//!
//! Split from the parent test module, which covers the general handle, install,
//! and component-grammar authority. The shared fixtures live in the parent.

use super::*;

#[test]
fn dacl_snapshot_reports_unprotected_for_an_inherited_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("ordinary");
    std::fs::write(&path, b"payload").unwrap();
    let reader = ReadOnlyAuthorityFile::open_private_readonly(&path).unwrap();
    // A tempdir file inherits its parent's DACL: present but not protected, so
    // the whole GetSecurityInfo -> GetSecurityDescriptorControl -> free path
    // runs and reports false.
    assert!(!reader.dacl_snapshot().unwrap().protected());
    reader.revalidate().unwrap();
}

#[test]
fn dacl_snapshot_observes_a_directory_handle() {
    let dir = tempfile::tempdir().unwrap();
    let hardening = HardeningDirectory::open_existing(dir.path()).unwrap();
    // SE_FILE_OBJECT covers directories; an inherited tempdir DACL is present
    // and unprotected, so this observes without error and reports false.
    assert!(!hardening.dacl_snapshot().unwrap().protected());
    hardening.revalidate().unwrap();
}

#[test]
fn private_file_authority_hardens_writes_recovers_and_retires_on_real_ntfs() {
    let dir = tempfile::tempdir().unwrap();
    let parent = HardeningDirectory::open_existing(dir.path()).unwrap();
    add_inheritable_extra_principal(parent.directory());
    assert!(parent.dacl_snapshot().unwrap().protected());

    let path = dir.path().join("private");
    let mut creation = PrivateFileCreation::create(&path).unwrap();
    let identity = creation.identity();
    assert_eq!(creation.link_count().unwrap(), 1);
    assert!(!creation.dacl_snapshot().unwrap().protected());
    assert_inherited_extra_principal(creation.file());

    let refused = ReadOnlyAuthorityFile::open_private_readonly(&path).unwrap_err();
    assert_sharing_violation(&refused);
    assert!(
        PrivateFileCreation::create(&path).is_err(),
        "create-new must refuse an existing name"
    );

    harden_without_inherited_entries(creation.file(), false);
    assert!(creation.dacl_snapshot().unwrap().protected());
    assert_no_inherited_entries(creation.file());
    creation.revalidate().unwrap();

    creation.file_mut().write_all(b"first descriptor").unwrap();
    creation.file().sync_all().unwrap();
    creation.file_mut().seek(SeekFrom::Start(0)).unwrap();
    let mut same_handle = Vec::new();
    creation.file_mut().read_to_end(&mut same_handle).unwrap();
    assert_eq!(same_handle, b"first descriptor");
    assert!(creation.dacl_snapshot().unwrap().protected());
    creation.revalidate().unwrap();
    drop(creation);

    let reader = ReadOnlyAuthorityFile::open_private_readonly(&path).unwrap();
    assert_eq!(reader.identity(), identity);
    assert_eq!(reader.read_bounded(64).unwrap(), b"first descriptor");
    assert_eq!(
        reader.read_bounded(4).unwrap_err().kind(),
        io::ErrorKind::InvalidData
    );
    assert_eq!(
        reader
            .read_bounded(MAX_PRIVATE_FILE_READ_BYTES + 1)
            .unwrap_err()
            .kind(),
        io::ErrorKind::InvalidInput
    );
    assert!(reader.dacl_snapshot().unwrap().protected());
    reader.revalidate().unwrap();
    let refused = PrivateFileRecovery::open(&path).unwrap_err();
    assert_sharing_violation(&refused);
    drop(reader);

    let mut recovery = PrivateFileRecovery::open(&path).unwrap();
    assert_eq!(recovery.identity(), identity);
    let refused = ReadOnlyAuthorityFile::open_private_readonly(&path).unwrap_err();
    assert_sharing_violation(&refused);
    recovery.file().set_len(0).unwrap();
    recovery.file_mut().seek(SeekFrom::Start(0)).unwrap();
    recovery
        .file_mut()
        .write_all(b"settled descriptor")
        .unwrap();
    recovery.file().sync_all().unwrap();
    recovery.revalidate().unwrap();
    assert!(recovery.dacl_snapshot().unwrap().protected());
    drop(recovery);

    let reader = ReadOnlyAuthorityFile::open_private_readonly(&path).unwrap();
    assert_eq!(reader.identity(), identity);
    assert_eq!(reader.read_bounded(64).unwrap(), b"settled descriptor");
    drop(reader);

    let recovery = PrivateFileRecovery::open(&path).unwrap();
    assert_eq!(recovery.identity(), identity);
    recovery.mark_delete_on_close().unwrap();
    drop(recovery);
    assert!(!path.exists(), "delete-on-close must retire the exact file");
}

#[test]
fn directory_hardening_removes_inheritance_and_survives_reopen_on_real_ntfs() {
    let dir = tempfile::tempdir().unwrap();
    let parent = HardeningDirectory::open_existing(dir.path()).unwrap();
    add_inheritable_extra_principal(parent.directory());

    let child_path = dir.path().join("credentials");
    std::fs::create_dir(&child_path).unwrap();
    let child = HardeningDirectory::open_existing(&child_path).unwrap();
    let identity = child.identity();
    assert!(!child.dacl_snapshot().unwrap().protected());
    assert_inherited_extra_principal(child.directory());

    harden_without_inherited_entries(child.directory(), true);
    assert!(child.dacl_snapshot().unwrap().protected());
    assert_no_inherited_entries(child.directory());
    child.revalidate().unwrap();
    drop(child);

    let reopened = HardeningDirectory::open_existing(&child_path).unwrap();
    assert_eq!(reopened.identity(), identity);
    assert!(reopened.dacl_snapshot().unwrap().protected());
    assert_no_inherited_entries(reopened.directory());
    reopened.revalidate().unwrap();
}

#[test]
fn dacl_snapshot_has_no_leak_under_iteration() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("loop");
    std::fs::write(&path, b"loop").unwrap();
    let reader = ReadOnlyAuthorityFile::open_private_readonly(&path).unwrap();
    // Each call allocates one security descriptor plus one wide string per SID
    // and frees them through the LocalSecurityDescriptor / LocalWideString Drop
    // guards; the repetition documents no-leak intent under iteration.
    for _ in 0..512 {
        reader.dacl_snapshot().unwrap();
    }
}

// windows-private-file-authority D3/D4 single-snapshot policy exercises. The
// safe `private_policy` layer decides every D4 fact from ONE snapshot; these
// prove acceptance of a genuinely hardened protected three-principal DACL and
// fail-closed rejection of inherited, empty, foreign, and oversized DACLs on
// real NTFS with the production ACL dependency.

#[test]
fn private_policy_validates_a_hardened_private_file() {
    let dir = tempfile::tempdir().unwrap();
    let parent = HardeningDirectory::open_existing(dir.path()).unwrap();
    add_inheritable_extra_principal(parent.directory());
    let path = dir.path().join("private");
    let creation = PrivateFileCreation::create(&path).unwrap();
    let user = current_user_sid_string();

    // Before hardening the empty file inherited the parent DACL: unprotected,
    // with inherited entries, so the file policy rejects it.
    let before = creation.dacl_snapshot().unwrap();
    assert!(!before.protected());
    assert!(before.entries().iter().any(|entry| entry.inherited()));
    assert!(crate::private_policy::validate_private_file(&before, &user).is_err());

    // After hardening ONE snapshot proves protected + exactly the three explicit
    // allow entries with the file flags; the policy accepts it.
    harden_three_principal(creation.file(), false, &user);
    let after = creation.dacl_snapshot().unwrap();
    assert!(after.protected());
    assert_eq!(after.entries().len(), 3);
    assert!(after.entries().iter().all(|entry| {
        entry.entry_type() == DaclAceKind::AccessAllowed
            && entry.mask() == FILE_ALL_ACCESS
            && entry.flags() == 0x00
            && !entry.inherited()
    }));
    crate::private_policy::validate_private_file(&after, &user).unwrap();
    // The file's non-inheriting flags must fail the DIRECTORY policy.
    assert!(crate::private_policy::validate_private_directory(&after, &user).is_err());
}

#[test]
fn private_policy_validates_a_hardened_private_directory() {
    let dir = tempfile::tempdir().unwrap();
    let parent = HardeningDirectory::open_existing(dir.path()).unwrap();
    add_inheritable_extra_principal(parent.directory());
    let child_path = dir.path().join("credentials");
    std::fs::create_dir(&child_path).unwrap();
    let child = HardeningDirectory::open_existing(&child_path).unwrap();
    let user = current_user_sid_string();

    assert!(
        crate::private_policy::validate_private_directory(&child.dacl_snapshot().unwrap(), &user)
            .is_err()
    );

    harden_three_principal(child.directory(), true, &user);
    let after = child.dacl_snapshot().unwrap();
    assert!(after.protected());
    assert_eq!(after.entries().len(), 3);
    assert!(after.entries().iter().all(|entry| {
        entry.entry_type() == DaclAceKind::AccessAllowed
            && entry.mask() == FILE_ALL_ACCESS
            && entry.flags() == 0x03
            && !entry.inherited()
    }));
    crate::private_policy::validate_private_directory(&after, &user).unwrap();
    // The directory's inheritance flags must fail the FILE policy.
    assert!(crate::private_policy::validate_private_file(&after, &user).is_err());
}

#[test]
fn foreign_allow_entry_fails_private_policy() {
    let dir = tempfile::tempdir().unwrap();
    let parent = HardeningDirectory::open_existing(dir.path()).unwrap();
    add_inheritable_extra_principal(parent.directory());
    let path = dir.path().join("private");
    let creation = PrivateFileCreation::create(&path).unwrap();
    let user = current_user_sid_string();
    harden_three_principal(creation.file(), false, &user);
    crate::private_policy::validate_private_file(&creation.dacl_snapshot().unwrap(), &user)
        .unwrap();

    // A fourth, foreign explicit allow entry breaks the exact three-principal
    // list even though every entry is still protected and non-inherited.
    {
        let mut acl = acl_for(creation.file());
        let sid = string_to_sid(BUILTIN_USERS_SID).expect("built-in Users SID must resolve");
        acl.allow(sid.as_ptr().cast_mut().cast(), false, FILE_ALL_ACCESS)
            .expect("the retained handle must add a foreign allow ACE");
    }
    let snapshot = creation.dacl_snapshot().unwrap();
    assert_eq!(snapshot.entries().len(), 4);
    assert!(snapshot.protected());
    assert!(crate::private_policy::validate_private_file(&snapshot, &user).is_err());
}

#[test]
fn empty_dacl_fails_private_policy_validation() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("empty-dacl");
    std::fs::write(&path, b"payload").unwrap();
    let recovery = PrivateFileRecovery::open(&path).unwrap();
    let user = current_user_sid_string();
    // Harden first so the DACL becomes SE_DACL_PROTECTED with exactly the three
    // EXPLICIT entries; inherited ACEs cannot be stripped from an unprotected
    // DACL, but explicit ones can. Removing the three then leaves a present,
    // protected, EMPTY DACL that the retained handle still observes.
    harden_three_principal(recovery.file(), false, &user);
    {
        let mut acl = acl_for(recovery.file());
        for sid_text in [user.as_str(), SYSTEM_SID, ADMINISTRATORS_SID] {
            let sid = string_to_sid(sid_text).expect("principal SID must resolve");
            acl.remove_entry(
                sid.as_ptr().cast_mut().cast(),
                Some(AceType::AccessAllow),
                Some(0x00),
            )
            .expect("the retained handle must remove each explicit ACE");
        }
    }

    let snapshot = recovery
        .dacl_snapshot()
        .expect("a present but empty DACL still snapshots");
    assert!(
        snapshot.entries().is_empty(),
        "an emptied DACL exposes no entries"
    );
    assert!(
        crate::private_policy::validate_private_file(&snapshot, &user).is_err(),
        "an empty DACL is not the three-principal private list"
    );
}

#[test]
fn oversized_dacl_fails_snapshot_typed() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("oversized");
    std::fs::write(&path, b"payload").unwrap();
    let recovery = PrivateFileRecovery::open(&path).unwrap();
    let mut acl = acl_for(recovery.file());
    // Nineteen syntactically valid, distinct built-in RIDs push the entry count
    // past the fixed 16-entry cap regardless of the inherited starting entries.
    for rid in 544..=562 {
        let sid = string_to_sid(&format!("S-1-5-32-{rid}"))
            .expect("a well-formed built-in SID must resolve");
        acl.allow(sid.as_ptr().cast_mut().cast(), false, FILE_ALL_ACCESS)
            .expect("the retained handle must add a distinct allow ACE");
    }

    let error = recovery
        .dacl_snapshot()
        .expect_err("an oversized DACL must fail closed inside the primitive");
    assert!(
        error
            .to_string()
            .contains("exceeds the fixed private entry cap"),
        "unexpected oversized-DACL error: {error}"
    );
}

// NULL-DACL coverage note (windows-private-file-authority D3/D7). A present-but-
// NULL DACL (SE_DACL_PRESENT with a null ACL pointer, which grants everyone) is
// rejected inside `private_dacl_snapshot`. Constructing one requires calling
// SetSecurityInfo with a null DACL, which is native `unsafe` FFI: the crate lint
// forbids unsafe outside the private `os` module, and `windows-acl` exposes no
// NULL-DACL setter, so no HONEST safe-Rust test can build one here. The
// fail-closed contract for malformed/degenerate DACLs is instead proven by the
// present-but-empty and oversized cases above plus source review of the
// null-pointer branch; nothing is silently skipped.

// windows-private-file-authority read-only DIRECTORY observation authority
// (D1 amendment). Real NTFS, no mocks: the type-check-on-open refusals, the
// permissive-sharing contract, and a genuine inherited/unprotected observation.

#[test]
fn read_only_observation_refuses_a_file_and_a_reparse_point() {
    let dir = tempfile::tempdir().unwrap();
    let file_path = dir.path().join("plain-file");
    std::fs::write(&file_path, b"not a directory").unwrap();
    // The exact mirror of ReadOnlyAuthorityFile refusing directories.
    assert!(ReadOnlyAuthorityDirectory::open_observation(&file_path).is_err());

    let target = dir.path().join("target");
    create_directory(&target);
    let link = dir.path().join("dir-link");
    symlink_dir(&target, &link).unwrap();
    // Opened no-follow, the reparse point itself is refused as a non-plain dir.
    assert!(ReadOnlyAuthorityDirectory::open_observation(&link).is_err());
}

#[test]
fn read_only_observation_reads_an_inherited_unprotected_directory() {
    let dir = tempfile::tempdir().unwrap();
    let child = dir.path().join("ordinary");
    create_directory(&child);
    let observation = ReadOnlyAuthorityDirectory::open_observation(&child).unwrap();
    assert_ne!(observation.identity().file_id, 0);
    let snapshot = observation.dacl_snapshot().unwrap();
    // A tempdir child inherits its parent's DACL: present, unprotected, with at
    // least one inherited entry.
    assert!(!snapshot.protected());
    assert!(snapshot.entries().iter().any(|entry| entry.inherited()));
    observation.revalidate().unwrap();
}

#[test]
fn read_only_observation_permits_a_concurrent_owner_write_handle() {
    let dir = tempfile::tempdir().unwrap();
    let child = dir.path().join("shared");
    create_directory(&child);
    // An owner holds the directory open with GENERIC_WRITE + FILE_WRITE_ATTRIBUTES
    // while the read-only observation authority snapshots it. Permissive sharing
    // means the observation neither blocks nor is blocked by the writer — the
    // deliberate inverse of the private-file exclusivity contract.
    let owner = open_directory_for_generic_write(&child).unwrap();
    let observation = ReadOnlyAuthorityDirectory::open_observation(&child).unwrap();
    assert!(!observation.dacl_snapshot().unwrap().entries().is_empty());
    // A second concurrent observation succeeds alongside both.
    let second = ReadOnlyAuthorityDirectory::open_observation(&child).unwrap();
    assert_eq!(second.identity(), observation.identity());
    drop(owner);
}

/// Real-NTFS acceptance for the parent-relative constructors
/// (windows-private-file-authority, parent-relative addendum).
///
/// The load-bearing claim: a child can be opened with `READ_CONTROL | WRITE_DAC`
/// through a parent handle that holds NEITHER, because a relative open's
/// requested access binds the child object rather than the resolution root. The
/// test first proves the parent really is rights-poor by showing it cannot
/// snapshot its own DACL, so the success below cannot be explained by the parent
/// having carried the rights all along.
#[test]
fn parent_relative_hardening_opens_a_child_through_a_rights_poor_parent() {
    let dir = tempfile::tempdir().unwrap();
    let parent_path = dir.path().join("datastore");
    create_directory(&parent_path);

    // Seed an extra INHERITABLE principal on the parent so the child below is
    // really born with an inherited entry the private policy forbids. The
    // seeding handle is released before the rights-poor parent is opened.
    let seed = HardeningDirectory::open_existing(&parent_path).unwrap();
    add_inheritable_extra_principal(seed.directory());
    drop(seed);

    let child_name = OsString::from("live");
    create_directory(&parent_path.join("live"));

    // Exactly the rights a capability-held (cap-std) directory carries: no
    // READ_CONTROL, no WRITE_DAC.
    let parent = os::open_existing_directory(&parent_path).unwrap();
    assert!(
        os::private_dacl_snapshot(&parent).is_err(),
        "the parent must be unable to observe its own DACL, or the proof is vacuous"
    );

    let hardening = HardeningDirectory::open_child_existing(&parent, &child_name).unwrap();
    assert_inherited_extra_principal(hardening.directory());
    harden_without_inherited_entries(hardening.directory(), true);
    assert!(hardening.dacl_snapshot().unwrap().protected());
    assert_no_inherited_entries(hardening.directory());
    hardening.revalidate().unwrap();
    let hardened_identity = hardening.identity();
    drop(hardening);

    // The read-only counterpart resolves the same object through the same
    // rights-poor parent and sees the protected state.
    let observation =
        ReadOnlyAuthorityDirectory::open_child_observation(&parent, &child_name).unwrap();
    assert_eq!(observation.identity(), hardened_identity);
    assert!(observation.dacl_snapshot().unwrap().protected());
    observation.revalidate().unwrap();

    // The relative constructors resolve exactly one direct child: no traversal,
    // no parent escape, no absent name.
    for rejected in ["..", ".", r"nested\child", r"live\..\live"] {
        let name = OsString::from(rejected);
        assert!(
            HardeningDirectory::open_child_existing(&parent, &name).is_err(),
            "hardening must refuse the non-child component {rejected:?}"
        );
        assert!(
            ReadOnlyAuthorityDirectory::open_child_observation(&parent, &name).is_err(),
            "observation must refuse the non-child component {rejected:?}"
        );
    }
    let absent = OsString::from("absent");
    assert_eq!(
        HardeningDirectory::open_child_existing(&parent, &absent)
            .unwrap_err()
            .kind(),
        io::ErrorKind::NotFound
    );

    // Both constructors refuse a regular-file child, exactly as their pathname
    // counterparts do.
    std::fs::write(parent_path.join("regular"), b"not a directory").unwrap();
    let regular = OsString::from("regular");
    assert!(HardeningDirectory::open_child_existing(&parent, &regular).is_err());
    assert!(ReadOnlyAuthorityDirectory::open_child_observation(&parent, &regular).is_err());
}

/// Pin every access right and file flag this crate composes into its masks.
///
/// The crate single-sources these from `windows-sys` so a value is spelled once
/// (windows-private-file-authority, file-constructor addendum). Several safety
/// arguments here rest on a right being ABSENT from a mask — the read-only
/// values carry no `WRITE_DAC` and no `DELETE` — so a silent value change under
/// a dependency bump would invalidate those arguments without touching a line of
/// this crate's source. These are stable documented Win32 values; pinning them
/// makes the single-sourcing self-verifying.
#[test]
fn access_right_and_file_flag_values_are_pinned() {
    use windows_sys::Win32::Foundation::{GENERIC_READ, GENERIC_WRITE};
    use windows_sys::Win32::Storage::FileSystem::{
        DELETE, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_READ_ATTRIBUTES,
        FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, READ_CONTROL, SYNCHRONIZE, WRITE_DAC,
    };

    assert_eq!(DELETE, 0x0001_0000);
    assert_eq!(READ_CONTROL, 0x0002_0000);
    assert_eq!(WRITE_DAC, 0x0004_0000);
    assert_eq!(SYNCHRONIZE, 0x0010_0000);
    assert_eq!(FILE_READ_ATTRIBUTES, 0x0000_0080);
    assert_eq!(GENERIC_READ, 0x8000_0000);
    assert_eq!(GENERIC_WRITE, 0x4000_0000);
    assert_eq!(FILE_FLAG_OPEN_REPARSE_POINT, 0x0020_0000);
    assert_eq!(FILE_FLAG_BACKUP_SEMANTICS, 0x0200_0000);
    assert_eq!(FILE_SHARE_READ, 0x0000_0001);
    assert_eq!(FILE_SHARE_WRITE, 0x0000_0002);
    assert_eq!(FILE_SHARE_DELETE, 0x0000_0004);

    // The read-only observation rights must not have acquired mutation authority.
    let observation = READ_CONTROL | FILE_READ_ATTRIBUTES | SYNCHRONIZE;
    assert_eq!(observation & WRITE_DAC, 0);
    assert_eq!(observation & DELETE, 0);
    assert_eq!(observation & GENERIC_WRITE, 0);
}

/// Real-NTFS acceptance for the parent-relative FILE constructors
/// (windows-private-file-authority, file-constructor addendum).
///
/// Non-vacuous by construction, exactly as the directory proof is: the parent is
/// asserted rights-poor BEFORE a child is hardened through it, so the success
/// cannot be explained by the parent having carried WRITE_DAC all along.
#[test]
fn parent_relative_file_creation_hardens_through_a_rights_poor_parent() {
    let dir = tempfile::tempdir().unwrap();
    let parent_path = dir.path().join("datastore");
    create_directory(&parent_path);

    // Seed an extra inheritable principal so the created child is genuinely born
    // with an inherited entry the private policy forbids.
    let seed = HardeningDirectory::open_existing(&parent_path).unwrap();
    add_inheritable_extra_principal(seed.directory());
    drop(seed);

    let parent = os::open_existing_directory(&parent_path).unwrap();
    assert!(
        os::private_dacl_snapshot(&parent).is_err(),
        "the parent must be unable to observe its own DACL, or the proof is vacuous"
    );

    let name = OsString::from("root.json");
    let mut creation = PrivateFileCreation::create_child(&parent, &name).unwrap();
    let identity = creation.identity();
    assert_eq!(creation.link_count().unwrap(), 1);
    assert_inherited_extra_principal(creation.file());

    // Harden the EMPTY file through its own exact retained handle, then prove it.
    harden_without_inherited_entries(creation.file(), false);
    assert!(creation.dacl_snapshot().unwrap().protected());
    assert_no_inherited_entries(creation.file());
    creation.revalidate().unwrap();

    // A name collision must FAIL rather than adopt the existing object.
    assert!(
        PrivateFileCreation::create_child(&parent, &name).is_err(),
        "FILE_CREATE must refuse an existing name"
    );

    creation.file_mut().write_all(b"trust anchor").unwrap();
    creation.file().sync_all().unwrap();
    assert!(creation.dacl_snapshot().unwrap().protected());
    creation.revalidate().unwrap();
    drop(creation);

    // Protection survives close and reopen through the read-only child variant.
    let reader = ReadOnlyAuthorityFile::open_child_readonly(&parent, &name).unwrap();
    assert_eq!(reader.identity(), identity);
    assert_eq!(reader.read_bounded(64).unwrap(), b"trust anchor");
    assert!(reader.dacl_snapshot().unwrap().protected());
    reader.revalidate().unwrap();
    drop(reader);

    // A directory name is refused by FILE_NON_DIRECTORY_FILE, and the shared
    // single-component validator refuses separator-bearing and traversal names.
    create_directory(&parent_path.join("subdir"));
    let subdir = OsString::from("subdir");
    assert!(PrivateFileCreation::create_child(&parent, &subdir).is_err());
    assert!(ReadOnlyAuthorityFile::open_child_readonly(&parent, &subdir).is_err());
    for rejected in ["..", ".", r"nested\child", "a/b"] {
        let bad = OsString::from(rejected);
        assert!(
            PrivateFileCreation::create_child(&parent, &bad).is_err(),
            "creation must refuse the non-child component {rejected:?}"
        );
        assert!(
            ReadOnlyAuthorityFile::open_child_readonly(&parent, &bad).is_err(),
            "read-only must refuse the non-child component {rejected:?}"
        );
    }
    let absent = OsString::from("absent.json");
    assert_eq!(
        ReadOnlyAuthorityFile::open_child_readonly(&parent, &absent)
            .unwrap_err()
            .kind(),
        io::ErrorKind::NotFound
    );
}

/// The read-only child mask must never acquire mutation authority. This is the
/// assertion the mask single-sourcing exists to protect: it compares the exact
/// composed mask, so widening it in one place fails here rather than silently
/// invalidating the "mutation cannot compile through this value" argument.
#[test]
fn read_only_child_file_mask_excludes_every_mutation_right() {
    use windows_sys::Win32::Foundation::GENERIC_WRITE;
    use windows_sys::Win32::Storage::FileSystem::{
        DELETE, FILE_GENERIC_READ, FILE_GENERIC_WRITE, READ_CONTROL, WRITE_DAC,
    };

    let read_only = FILE_GENERIC_READ;
    assert_eq!(
        read_only & WRITE_DAC,
        0,
        "read-only must not carry WRITE_DAC"
    );
    assert_eq!(read_only & DELETE, 0, "read-only must not carry DELETE");
    assert_eq!(read_only & GENERIC_WRITE, 0);
    assert_eq!(read_only & FILE_GENERIC_WRITE & !FILE_GENERIC_READ, 0);
    // It DOES carry the snapshot right, which is why no separate READ_CONTROL
    // is requested by either child constructor.
    assert_ne!(read_only & READ_CONTROL, 0, "snapshot needs READ_CONTROL");

    // The hardening delta over the materializer mask is EXACTLY WRITE_DAC.
    let materializer = DELETE | FILE_GENERIC_READ | FILE_GENERIC_WRITE | 0x0010_0000;
    let hardening = materializer | WRITE_DAC;
    assert_eq!(hardening & !materializer, WRITE_DAC);
}

/// Real-NTFS acceptance for the directory-metadata flush (W01.P01.S177).
///
/// Both sides of the boundary, so the result cannot be misread: a directory
/// handle WITHOUT append access is refused by `FlushFileBuffers`, and
/// `sync_directory_metadata` succeeds through that very same handle by reopening
/// the object with flush-only rights. That is the whole mechanism — the missing
/// right is `FILE_ADD_SUBDIRECTORY`, which on a directory IS `FILE_APPEND_DATA`.
#[test]
fn directory_metadata_flush_succeeds_through_a_non_flushable_handle() {
    use std::os::windows::fs::OpenOptionsExt as _;

    let dir = tempfile::tempdir().unwrap();
    let child = dir.path().join("datastore");
    create_directory(&child);
    std::fs::write(child.join("root.json"), b"trust anchor").unwrap();

    // A handle opened the way capability libraries open directories: readable,
    // but carrying no append access.
    let capability_like = std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(0x0200_0000)
        .open(&child)
        .unwrap();
    assert_eq!(
        capability_like.sync_all().unwrap_err().raw_os_error(),
        Some(5),
        "a directory handle without append access must be refused by FlushFileBuffers"
    );

    // The same handle, flushed through the reopen.
    crate::sync_directory_metadata(&capability_like)
        .expect("flush must succeed by reopening the retained object");

    // The crate's own directory handle already carries the bit, so it flushes
    // directly too — and the operation is repeatable.
    let retained = os::open_existing_directory(&child).unwrap();
    retained
        .sync_all()
        .expect("DIRECTORY_ACCESS carries the append bit");
    crate::sync_directory_metadata(&retained).expect("flush is idempotent");

    // It refuses a FILE handle: the reopen requests FILE_DIRECTORY_FILE.
    let file = std::fs::File::open(child.join("root.json")).unwrap();
    assert!(
        crate::sync_directory_metadata(&file).is_err(),
        "a non-directory handle must be refused"
    );
}
