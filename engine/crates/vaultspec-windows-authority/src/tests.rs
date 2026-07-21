use super::*;
use std::ffi::OsString;
use std::io::{Read as _, Seek as _, SeekFrom, Write as _};
use std::os::windows::ffi::OsStringExt;
use std::os::windows::fs::{symlink_dir, symlink_file};
use std::os::windows::io::AsRawHandle;
use windows_acl::acl::{ACL, AceType};
use windows_acl::helper::{current_user, name_to_sid, sid_to_string, string_to_sid};

/// A FOREIGN principal, deliberately not part of the private policy: the D7
/// fixtures use it as the extra inheritable entry hardening must remove.
const BUILTIN_USERS_SID: &str = "S-1-5-32-545";
// The policy values themselves are single-sourced by `private_policy`, so the
// acceptance evidence proves the same constants production installs.
use private_policy::{ADMINISTRATORS_SID, FILE_ALL_ACCESS, LOCAL_SYSTEM_SID as SYSTEM_SID};

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

fn recover_exclusive_install_directory(
    error: Box<InstallSynchronizedFileError>,
) -> AuthorityDirectory {
    error
        .into_parts()
        .directory_authority
        .into_exclusive()
        .expect("failure before or after recovery must retain exclusive parent authority")
}

fn open_directory_for_generic_write(path: &Path) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options
        .access_mode(GENERIC_WRITE | windows_sys::Win32::Storage::FileSystem::FILE_WRITE_ATTRIBUTES)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS);
    options.open(path)
}

fn acl_for(file: &File) -> ACL {
    ACL::from_file_handle(file.as_raw_handle().cast(), false)
        .expect("the retained authority handle must expose its DACL")
}

fn current_user_sid() -> Vec<u8> {
    let name = current_user().expect("the Windows test account must have a name");
    name_to_sid(&name, None).expect("the Windows test account must resolve to a SID")
}

fn current_user_sid_string() -> String {
    let sid = current_user_sid();
    sid_to_string(sid.as_ptr().cast_mut().cast())
        .expect("the Windows test account SID must render as a string")
}

/// Harden `file` to the EXACT protected three-principal DACL (current user,
/// LocalSystem, built-in Administrators) with the purpose-correct flags, driven
/// by the crate's own snapshot for removals — the production `windows-acl`
/// mutation path the product consumer uses.
fn harden_three_principal(file: &File, directory: bool, user_sid: &str) {
    let flags: u8 = if directory { 0x03 } else { 0x00 };
    let mut acl = acl_for(file);
    for sid_text in [user_sid, SYSTEM_SID, ADMINISTRATORS_SID] {
        let sid = string_to_sid(sid_text).expect("principal SID must resolve");
        acl.add_entry(
            sid.as_ptr().cast_mut().cast(),
            AceType::AccessAllow,
            flags,
            FILE_ALL_ACCESS,
        )
        .expect("the retained hardening handle must add an explicit principal ACE");
    }
    let snapshot =
        os::private_dacl_snapshot(file).expect("post-add snapshot must observe the DACL");
    for entry in snapshot.entries() {
        let known = entry.sid() == user_sid
            || entry.sid() == SYSTEM_SID
            || entry.sid() == ADMINISTRATORS_SID;
        let conforming = entry.entry_type() == DaclAceKind::AccessAllowed
            && known
            && entry.flags() == flags
            && entry.mask() == FILE_ALL_ACCESS
            && !entry.inherited();
        if !conforming {
            let sid = string_to_sid(entry.sid()).expect("enumerated SID must round-trip");
            let ace_type = match entry.entry_type() {
                DaclAceKind::AccessAllowed => AceType::AccessAllow,
                DaclAceKind::AccessDenied => AceType::AccessDeny,
            };
            acl.remove_entry(
                sid.as_ptr().cast_mut().cast(),
                Some(ace_type),
                Some(entry.flags()),
            )
            .expect("the retained authority handle must remove a non-conforming ACE");
        }
    }
}

fn add_inheritable_extra_principal(file: &File) {
    let sid = string_to_sid(BUILTIN_USERS_SID).expect("built-in Users SID must resolve");
    let mut acl = acl_for(file);
    acl.allow(
        sid.as_ptr().cast_mut().cast(),
        true,
        windows_sys::Win32::Storage::FileSystem::FILE_ALL_ACCESS,
    )
    .expect("the retained hardening handle must add an inheritable test ACE");
}

fn harden_without_inherited_entries(file: &File, directory: bool) {
    let mut acl = acl_for(file);
    let inherited = acl
        .all()
        .expect("the retained authority handle must enumerate its DACL")
        .into_iter()
        .filter(|entry| u32::from(entry.flags) & windows_sys::Win32::Security::INHERITED_ACE != 0)
        .collect::<Vec<_>>();
    assert!(
        !inherited.is_empty(),
        "the D7 fixture must begin with inherited entries"
    );
    for entry in inherited {
        let sid = string_to_sid(&entry.string_sid).expect("enumerated SID must round-trip");
        acl.remove_entry(
            sid.as_ptr().cast_mut().cast(),
            Some(entry.entry_type),
            Some(entry.flags),
        )
        .expect("the retained authority handle must remove inherited ACEs");
    }

    let owner = current_user_sid();
    acl.allow(
        owner.as_ptr().cast_mut().cast(),
        directory,
        windows_sys::Win32::Storage::FileSystem::FILE_ALL_ACCESS,
    )
    .expect("the retained authority handle must install an explicit test ACE");
}

fn assert_inherited_extra_principal(file: &File) {
    let snapshot = os::private_dacl_snapshot(file)
        .expect("the retained authority handle must snapshot its DACL");
    assert!(
        snapshot
            .entries()
            .iter()
            .any(|entry| entry.sid() == BUILTIN_USERS_SID && entry.inherited())
    );
}

fn assert_no_inherited_entries(file: &File) {
    let snapshot = os::private_dacl_snapshot(file)
        .expect("the retained authority handle must snapshot its DACL");
    assert!(snapshot.entries().iter().all(|entry| !entry.inherited()));
}

fn assert_sharing_violation(error: &io::Error) {
    assert_eq!(
        error.raw_os_error(),
        Some(32),
        "exclusive private authority must reject a second open with ERROR_SHARING_VIOLATION"
    );
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
fn synchronized_source_handoff_excludes_writers_and_delete_until_transition() {
    let temp = tempfile::tempdir().unwrap();
    let source_path = temp.path().join("journal.init");
    let moved_path = temp.path().join("journal.moved");
    std::fs::write(&source_path, b"complete fixed journal image").unwrap();

    let synchronizer = AuthorityFile::open_install_source(&source_path).unwrap();
    let synchronized_state = install_file_state(&synchronizer).unwrap();
    let mut writer_options = OpenOptions::new();
    writer_options
        .write(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    assert_eq!(
        writer_options
            .open(&source_path)
            .unwrap_err()
            .raw_os_error(),
        Some(32)
    );
    assert_eq!(
        std::fs::rename(&source_path, &moved_path)
            .unwrap_err()
            .raw_os_error(),
        Some(32)
    );

    let transition = AuthorityFile::open_reader(&source_path).unwrap();
    assert_eq!(install_file_state(&transition).unwrap(), synchronized_state);
    drop(synchronizer);

    let writer = writer_options.open(&source_path).unwrap();
    std::fs::rename(&source_path, &moved_path).unwrap();
    assert_eq!(install_file_state(&transition).unwrap(), synchronized_state);
    drop(writer);
    drop(transition);
    assert_eq!(
        std::fs::read(moved_path).unwrap(),
        b"complete fixed journal image"
    );
}

#[test]
fn synchronized_install_moves_exact_existing_source_to_absent_destination() {
    let temp = tempfile::tempdir().unwrap();
    let source_path = temp.path().join("journal.init");
    let destination_path = temp.path().join("active-receipts.v1");
    let bytes = b"complete fixed journal image";
    std::fs::write(&source_path, bytes).unwrap();
    let source = AuthorityFile::open_reader(&source_path).unwrap();
    let source_state = install_file_state(&source).unwrap();
    drop(source);
    let directory = AuthorityDirectory::open_existing(temp.path()).unwrap();
    let directory_identity = directory.identity();

    let (directory, installed) = directory
        .install_synchronized_file(
            temp.path(),
            OsStr::new("journal.init"),
            OsStr::new("active-receipts.v1"),
        )
        .unwrap();

    assert_eq!(directory.identity(), directory_identity);
    assert_eq!(install_file_state(&installed).unwrap(), source_state);
    assert_eq!(installed.identity(), source_state.identity);
    assert_eq!(installed.link_count().unwrap(), 1);
    assert_eq!(source_state.size, bytes.len() as u64);
    assert!(!source_path.try_exists().unwrap());
    assert_eq!(std::fs::read(destination_path).unwrap(), bytes);
    let mut writer_options = OpenOptions::new();
    writer_options
        .write(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    assert_eq!(
        writer_options
            .open(temp.path().join("active-receipts.v1"))
            .unwrap_err()
            .raw_os_error(),
        Some(32)
    );
}

#[test]
fn synchronized_install_replaces_one_safe_existing_destination() {
    let temp = tempfile::tempdir().unwrap();
    let source_path = temp.path().join("journal.init");
    let destination_path = temp.path().join("active-receipts.v1");
    std::fs::write(&source_path, b"new complete journal").unwrap();
    std::fs::write(&destination_path, b"old complete journal").unwrap();
    let source = AuthorityFile::open_reader(&source_path).unwrap();
    let source_state = install_file_state(&source).unwrap();
    drop(source);
    let old_destination = AuthorityFile::open_reader(&destination_path).unwrap();
    let old_identity = old_destination.identity();
    drop(old_destination);
    let directory = AuthorityDirectory::open_existing(temp.path()).unwrap();
    let directory_identity = directory.identity();

    let (directory, installed) = directory
        .install_synchronized_file(
            temp.path(),
            OsStr::new("journal.init"),
            OsStr::new("active-receipts.v1"),
        )
        .unwrap();

    assert_eq!(directory.identity(), directory_identity);
    assert_eq!(install_file_state(&installed).unwrap(), source_state);
    assert_ne!(installed.identity(), old_identity);
    assert!(!source_path.try_exists().unwrap());
    assert_eq!(
        std::fs::read(destination_path).unwrap(),
        b"new complete journal"
    );
}

#[test]
fn missing_install_source_is_never_created() {
    let temp = tempfile::tempdir().unwrap();
    let source_path = temp.path().join("missing.init");
    let destination_path = temp.path().join("active-receipts.v1");
    let directory = AuthorityDirectory::open_existing(temp.path()).unwrap();

    let error = directory
        .install_synchronized_file(
            temp.path(),
            OsStr::new("missing.init"),
            OsStr::new("active-receipts.v1"),
        )
        .unwrap_err();

    assert_eq!(error.stage(), InstallSynchronizedFileStage::SourceOpen);
    assert_eq!(error.outcome(), InstallSynchronizedFileOutcome::BeforeMove);
    assert_eq!(error.error().kind(), io::ErrorKind::NotFound);
    assert!(error.source_authority().is_none());
    assert!(!source_path.try_exists().unwrap());
    assert!(!destination_path.try_exists().unwrap());
}

#[test]
fn install_rejects_relative_wrong_cross_directory_and_equal_inputs() {
    let first = tempfile::tempdir().unwrap();
    let second = tempfile::tempdir().unwrap();
    std::fs::write(first.path().join("source"), b"source").unwrap();
    let mut directory = AuthorityDirectory::open_existing(first.path()).unwrap();

    for (path, source, destination, expected_stage) in [
        (
            Path::new("."),
            OsStr::new("source"),
            OsStr::new("destination"),
            InstallSynchronizedFileStage::InputValidation,
        ),
        (
            second.path(),
            OsStr::new("source"),
            OsStr::new("destination"),
            InstallSynchronizedFileStage::NamedDirectoryValidation,
        ),
        (
            first.path(),
            OsStr::new("source\\nested"),
            OsStr::new("destination"),
            InstallSynchronizedFileStage::InputValidation,
        ),
        (
            first.path(),
            OsStr::new("source"),
            OsStr::new("source"),
            InstallSynchronizedFileStage::InputValidation,
        ),
    ] {
        let error = directory
            .install_synchronized_file(path, source, destination)
            .unwrap_err();
        assert_eq!(error.stage(), expected_stage);
        assert_eq!(error.outcome(), InstallSynchronizedFileOutcome::BeforeMove);
        directory = recover_exclusive_install_directory(error);
    }
    assert_eq!(
        std::fs::read(first.path().join("source")).unwrap(),
        b"source"
    );
}

#[test]
fn install_rejects_directory_and_reparse_operands() {
    let temp = tempfile::tempdir().unwrap();
    let source_directory = temp.path().join("source-directory");
    let destination_directory = temp.path().join("destination-directory");
    let reparse_target = temp.path().join("reparse-target");
    let source_reparse = temp.path().join("source-reparse");
    let destination_reparse = temp.path().join("destination-reparse");
    create_directory(&source_directory);
    create_directory(&destination_directory);
    std::fs::write(&reparse_target, b"target").unwrap();
    symlink_file(&reparse_target, &source_reparse).unwrap();
    symlink_file(&reparse_target, &destination_reparse).unwrap();
    std::fs::write(temp.path().join("source-for-directory"), b"source").unwrap();
    std::fs::write(temp.path().join("source-for-reparse"), b"source").unwrap();
    let directory = AuthorityDirectory::open_existing(temp.path()).unwrap();

    let source_directory_error = directory
        .install_synchronized_file(
            temp.path(),
            OsStr::new("source-directory"),
            OsStr::new("unused-destination"),
        )
        .unwrap_err();
    assert_eq!(
        source_directory_error.stage(),
        InstallSynchronizedFileStage::SourceOpen
    );
    let directory = recover_exclusive_install_directory(source_directory_error);
    let destination_directory_error = directory
        .install_synchronized_file(
            temp.path(),
            OsStr::new("source-for-directory"),
            OsStr::new("destination-directory"),
        )
        .unwrap_err();
    assert_eq!(
        destination_directory_error.stage(),
        InstallSynchronizedFileStage::DestinationInspection
    );
    let directory = recover_exclusive_install_directory(destination_directory_error);
    let source_reparse_error = directory
        .install_synchronized_file(
            temp.path(),
            OsStr::new("source-reparse"),
            OsStr::new("unused-reparse-destination"),
        )
        .unwrap_err();
    assert_eq!(
        source_reparse_error.stage(),
        InstallSynchronizedFileStage::SourceOpen
    );
    let directory = recover_exclusive_install_directory(source_reparse_error);
    let destination_reparse_error = directory
        .install_synchronized_file(
            temp.path(),
            OsStr::new("source-for-reparse"),
            OsStr::new("destination-reparse"),
        )
        .unwrap_err();
    assert_eq!(
        destination_reparse_error.stage(),
        InstallSynchronizedFileStage::DestinationInspection
    );
    drop(destination_reparse_error);
}

#[test]
fn install_rejects_preexisting_source_and_destination_hard_links() {
    let temp = tempfile::tempdir().unwrap();
    let source_path = temp.path().join("source");
    let source_alias = temp.path().join("source-alias");
    std::fs::write(&source_path, b"source").unwrap();
    std::fs::hard_link(&source_path, &source_alias).unwrap();
    let destination_source = temp.path().join("destination-source");
    let destination_path = temp.path().join("destination");
    let destination_alias = temp.path().join("destination-alias");
    std::fs::write(&destination_source, b"replacement").unwrap();
    std::fs::write(&destination_path, b"destination").unwrap();
    std::fs::hard_link(&destination_path, &destination_alias).unwrap();
    let directory = AuthorityDirectory::open_existing(temp.path()).unwrap();

    let source_error = directory
        .install_synchronized_file(temp.path(), OsStr::new("source"), OsStr::new("unused"))
        .unwrap_err();
    assert_eq!(
        source_error.stage(),
        InstallSynchronizedFileStage::SourceInitialValidation
    );
    assert_eq!(
        source_error
            .source_authority()
            .unwrap()
            .link_count()
            .unwrap(),
        2
    );
    let directory = recover_exclusive_install_directory(source_error);

    let destination_error = directory
        .install_synchronized_file(
            temp.path(),
            OsStr::new("destination-source"),
            OsStr::new("destination"),
        )
        .unwrap_err();
    assert_eq!(
        destination_error.stage(),
        InstallSynchronizedFileStage::DestinationInspection
    );
    assert_eq!(
        destination_error
            .pre_move_destination_authority()
            .unwrap()
            .link_count()
            .unwrap(),
        2
    );
    assert_eq!(std::fs::read(destination_path).unwrap(), b"destination");
}

#[test]
fn install_rejects_case_alias_of_the_source_name() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::write(temp.path().join("journal.init"), b"source").unwrap();
    let directory = AuthorityDirectory::open_existing(temp.path()).unwrap();

    let error = directory
        .install_synchronized_file(
            temp.path(),
            OsStr::new("journal.init"),
            OsStr::new("JOURNAL.INIT"),
        )
        .unwrap_err();

    assert_eq!(
        error.stage(),
        InstallSynchronizedFileStage::DestinationInspection
    );
    assert_eq!(error.outcome(), InstallSynchronizedFileOutcome::BeforeMove);
    assert!(error.source_authority().is_some());
    assert_eq!(
        std::fs::read(temp.path().join("journal.init")).unwrap(),
        b"source"
    );
}

#[test]
fn move_failure_retains_exact_source_and_pre_move_destination_authorities() {
    let temp = tempfile::tempdir().unwrap();
    let source_path = temp.path().join("source");
    let destination_path = temp.path().join("destination");
    std::fs::write(&source_path, b"source bytes").unwrap();
    std::fs::write(&destination_path, b"destination bytes").unwrap();
    let source = AuthorityFile::open_reader(&source_path).unwrap();
    let source_identity = source.identity();
    drop(source);
    let old_destination = AuthorityFile::open_reader(&destination_path).unwrap();
    let old_destination_state = install_file_state(&old_destination).unwrap();
    drop(old_destination);
    let mut blocker_options = OpenOptions::new();
    blocker_options
        .read(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
    let blocker = blocker_options.open(&source_path).unwrap();
    let directory = AuthorityDirectory::open_existing(temp.path()).unwrap();

    let failure = directory
        .install_synchronized_file(temp.path(), OsStr::new("source"), OsStr::new("destination"))
        .unwrap_err();

    assert_eq!(failure.stage(), InstallSynchronizedFileStage::Move);
    assert_eq!(
        failure.outcome(),
        InstallSynchronizedFileOutcome::MoveReturnedFailure
    );
    assert_eq!(failure.error().raw_os_error(), Some(32));
    assert_eq!(
        failure.source_authority().unwrap().identity(),
        source_identity
    );
    let snapshot = failure.pre_move_destination_snapshot().unwrap();
    assert_eq!(snapshot.identity(), old_destination_state.identity);
    assert_eq!(snapshot.size(), old_destination_state.size);
    assert_eq!(snapshot.link_count(), old_destination_state.link_count);
    assert!(failure.pre_move_destination_authority().is_none());
    assert!(
        failure
            .reacquired_pre_move_destination_authority()
            .is_some()
    );
    assert!(failure.destination_reacquisition_error().is_none());
    assert!(failure.installed_destination_authority().is_none());
    let parts = failure.into_parts();
    assert_eq!(parts.stage, InstallSynchronizedFileStage::Move);
    assert_eq!(
        parts.outcome,
        InstallSynchronizedFileOutcome::MoveReturnedFailure
    );
    assert!(parts.directory_authority.exclusive().is_some());
    assert_eq!(parts.source_authority.unwrap().identity(), source_identity);
    assert_eq!(parts.pre_move_destination_snapshot, Some(snapshot));
    assert!(parts.pre_move_destination_authority.is_none());
    assert_eq!(
        parts
            .reacquired_pre_move_destination_authority
            .as_ref()
            .unwrap()
            .identity(),
        snapshot.identity()
    );
    assert!(parts.installed_destination_authority.is_none());
    assert!(parts.destination_reacquisition_error.is_none());
    assert!(parts.native_move_error.is_none());
    assert_eq!(parts.error.raw_os_error(), Some(32));
    drop(parts.directory_authority);
    drop(parts.reacquired_pre_move_destination_authority);
    drop(blocker);
    assert_eq!(std::fs::read(source_path).unwrap(), b"source bytes");
    assert_eq!(
        std::fs::read(destination_path).unwrap(),
        b"destination bytes"
    );
}

#[test]
fn canonical_long_parent_path_uses_the_same_exact_directory() {
    let temp = tempfile::tempdir().unwrap();
    let mut parent = temp.path().join("long-parent");
    for index in 0..14 {
        parent.push(format!("bounded-segment-{index:02}"));
    }
    std::fs::create_dir_all(&parent).unwrap();
    assert!(parent.as_os_str().encode_wide().count() > 260);
    std::fs::write(parent.join("source"), b"long path source").unwrap();
    let directory = AuthorityDirectory::open_existing(&parent).unwrap();
    let directory_identity = directory.identity();
    let dotted_parent = parent.join(".");

    let (directory, installed) = directory
        .install_synchronized_file(
            &dotted_parent,
            OsStr::new("source"),
            OsStr::new("destination"),
        )
        .unwrap();

    assert_eq!(directory.identity(), directory_identity);
    assert_eq!(installed.link_count().unwrap(), 1);
    assert!(!parent.join("source").try_exists().unwrap());
    assert_eq!(
        std::fs::read(parent.join("destination")).unwrap(),
        b"long path source"
    );
}

#[test]
fn delete_pending_file_fails_full_retained_state_validation() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("delete-pending");
    let authority = AuthorityFile::create_prepared(&path).unwrap();
    authority.mark_delete_on_close().unwrap();

    assert!(authority.validated_state().is_err());
    drop(authority);
    assert!(!path.try_exists().unwrap());
}

#[test]
fn unmapped_native_status_preserves_the_hex_status() {
    let error = os::ntstatus_to_io_error(0xDEAD_BEEF_u32 as i32);
    assert!(error.raw_os_error().is_none());
    assert!(error.to_string().contains("0xDEADBEEF"));
}

#[test]
fn child_regular_file_is_create_new_writable_and_never_replaces() {
    let temp = tempfile::tempdir().unwrap();
    let root = AuthorityDirectory::open_existing(temp.path()).unwrap();
    let parent = root
        .create_materialization_child(OsStr::new("workdir"))
        .unwrap();

    let mut created = parent
        .create_child_regular_file(OsStr::new("entry.tmp"))
        .unwrap();
    use std::io::{Read as _, Seek as _, Write as _};
    created.file_mut().write_all(b"decoded bytes").unwrap();
    created.file_mut().sync_all().unwrap();
    created.file_mut().rewind().unwrap();
    let mut reread = Vec::new();
    created.file_mut().read_to_end(&mut reread).unwrap();
    assert_eq!(reread, b"decoded bytes");
    assert_eq!(created.link_count().unwrap(), 1);
    assert_ne!(created.identity().file_id, 0);

    // Create-new: the same name is a collision, never a replacement. The
    // retained zero-share handle also denies a second open of the entry.
    let collision = parent
        .create_child_regular_file(OsStr::new("entry.tmp"))
        .unwrap_err();
    assert_ne!(collision.kind(), io::ErrorKind::InvalidInput);
    drop(created);

    // A directory occupying the name is a collision too.
    let occupied = parent
        .create_child_directory(OsStr::new("occupied"))
        .unwrap();
    let error = parent
        .create_child_regular_file(OsStr::new("occupied"))
        .unwrap_err();
    assert_ne!(error.kind(), io::ErrorKind::InvalidInput);
    drop(occupied);

    // Component grammar holds for files exactly as for directories.
    for bad in ["..", "a/b", "a\\b", "CON", "trailing.", "trailing "] {
        assert_eq!(
            parent
                .create_child_regular_file(OsStr::new(bad))
                .unwrap_err()
                .kind(),
            io::ErrorKind::InvalidInput,
            "create unexpectedly accepted {bad:?}"
        );
    }
}

#[test]
fn install_child_file_no_replace_renames_by_handle_and_refuses_an_occupant() {
    let temp = tempfile::tempdir().unwrap();
    let root = AuthorityDirectory::open_existing(temp.path()).unwrap();
    let parent = root
        .create_materialization_child(OsStr::new("workdir"))
        .unwrap();
    let workdir = temp.path().join("workdir");

    let mut staged = parent
        .create_child_regular_file(OsStr::new(".entry.vsmz-tmp"))
        .unwrap();
    use std::io::Write as _;
    staged.file_mut().write_all(b"payload").unwrap();
    staged.file_mut().sync_all().unwrap();
    let staged_identity = staged.identity();

    parent
        .install_child_file_no_replace(&staged, OsStr::new("entry.bin"))
        .unwrap();
    // The exact retained object now answers at the final name; the temp name
    // is gone; the handle survived its own rename.
    assert_eq!(
        AuthorityFile::identity_at_path(&workdir.join("entry.bin")).unwrap(),
        staged_identity
    );
    assert!(
        AuthorityFile::identity_at_path(&workdir.join(".entry.vsmz-tmp")).is_err(),
        "the temporary name must not survive the install"
    );
    assert_eq!(staged.link_count().unwrap(), 1);
    drop(staged);
    assert_eq!(
        std::fs::read(workdir.join("entry.bin")).unwrap(),
        b"payload"
    );

    // No-replace: a second install onto the occupied final name fails and the
    // occupant is untouched.
    let second = parent
        .create_child_regular_file(OsStr::new(".second.vsmz-tmp"))
        .unwrap();
    let error = parent
        .install_child_file_no_replace(&second, OsStr::new("entry.bin"))
        .unwrap_err();
    assert_ne!(error.kind(), io::ErrorKind::InvalidInput);
    assert_eq!(
        std::fs::read(workdir.join("entry.bin")).unwrap(),
        b"payload"
    );
    second.mark_delete_on_close().unwrap();
    drop(second);
    assert!(!workdir.join(".second.vsmz-tmp").exists());
}

// windows-private-file-authority D3/D7 authority-boundary exercise. These use
// real NTFS objects and the production ACL dependency. The product layer's
// exact current-user/SYSTEM/Administrators list remains a separately gated
// policy consumer; this crate proves retained rights, protection, inheritance
// removal, identity, I/O, reopen, recovery, and exact retirement.

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
