use super::*;
use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use std::os::windows::fs::{symlink_dir, symlink_file};

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

// windows-private-file-authority D3 primitive exercise. These prove the
// GetSecurityInfo -> control -> LocalFree fence executes on real files and
// directories and reports the unhardened (inherited, unprotected) state
// correctly; the full harden -> protected -> exact-list -> negative NTFS
// acceptance matrix (D7) hardens with the safe `windows-acl` layer separately.

#[test]
fn is_dacl_protected_reports_false_for_an_inherited_unprotected_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("ordinary");
    std::fs::write(&path, b"payload").unwrap();
    let reader = ReadOnlyAuthorityFile::open_private_readonly(&path).unwrap();
    // A tempdir file inherits its parent's DACL: present but not protected, so
    // the whole GetSecurityInfo -> GetSecurityDescriptorControl -> free path
    // runs and reports false.
    assert!(!reader.is_dacl_protected().unwrap());
    reader.revalidate().unwrap();
}

#[test]
fn is_dacl_protected_observes_a_directory_handle() {
    let dir = tempfile::tempdir().unwrap();
    let hardening = HardeningDirectory::open_existing(dir.path()).unwrap();
    // SE_FILE_OBJECT covers directories; an inherited tempdir DACL is present
    // and unprotected, so this observes without error and reports false.
    assert!(!hardening.is_dacl_protected().unwrap());
    hardening.revalidate().unwrap();
}

#[test]
fn read_only_authority_coexists_with_a_live_creation_claim() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("private");
    let creation = AuthorityFile::create_private(&path).unwrap();
    // The creation handle denies write and delete sharing but always shares
    // read, so a read-only verification handle opens alongside it.
    let reader = ReadOnlyAuthorityFile::open_private_readonly(&path).unwrap();
    assert_eq!(reader.identity(), creation.identity());
    assert_eq!(reader.link_count().unwrap(), 1);
    reader.revalidate().unwrap();
    drop(reader);
    drop(creation);
}

#[test]
fn create_private_is_exclusive_and_recovery_reopens_the_same_identity() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("private");
    let created = AuthorityFile::create_private(&path).unwrap();
    let identity = created.identity();
    assert!(
        AuthorityFile::create_private(&path).is_err(),
        "create-new must refuse an existing name"
    );
    drop(created);
    let recovered = AuthorityFile::open_private_recovery(&path).unwrap();
    assert_eq!(recovered.identity(), identity);
    recovered.mark_delete_on_close().unwrap();
    drop(recovered);
    assert!(!path.exists(), "delete-on-close must retire the exact file");
}

#[test]
fn dacl_is_protected_has_no_leak_under_iteration() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("loop");
    std::fs::write(&path, b"loop").unwrap();
    let reader = ReadOnlyAuthorityFile::open_private_readonly(&path).unwrap();
    // Each call allocates one security descriptor and frees it through the
    // LocalSecurityDescriptor Drop guard; the repetition documents no-leak
    // intent under iteration.
    for _ in 0..512 {
        reader.is_dacl_protected().unwrap();
    }
}
