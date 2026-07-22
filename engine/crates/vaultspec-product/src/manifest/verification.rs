#![allow(
    dead_code,
    reason = "compile-time sealed verification substrate awaits a production adapter authority"
)]

use super::*;
use crate::hex;

#[path = "verification/snapshot.rs"]
mod snapshot;

use snapshot::{
    FilesystemIdentity, ObservedDirectory, RootIdentity, record_file_parent_directories,
};
pub(super) use snapshot::{GenerationSnapshot, ObservedFile};

pub(super) fn scan_generation(
    root: &Path,
    excluded_manifest: Option<&str>,
) -> Result<GenerationSnapshot> {
    scan_generation_inner(root, excluded_manifest, None).map(|(snapshot, _)| snapshot)
}

pub(super) fn scan_generation_locating_member(
    root: &Path,
    expected_digest: &str,
) -> Result<(GenerationSnapshot, String)> {
    let (snapshot, located) = scan_generation_inner(root, None, Some(expected_digest))?;
    let located = located.ok_or_else(|| {
        ManifestError::MissingFile(
            "release member whose digest matches the trusted release metadata".to_string(),
        )
    })?;
    Ok((snapshot, located))
}

fn scan_generation_inner(
    root: &Path,
    excluded_manifest: Option<&str>,
    expected_unique_digest: Option<&str>,
) -> Result<(GenerationSnapshot, Option<String>)> {
    let root_metadata = safe_symlink_metadata(root)?;
    if !root_metadata.is_dir() || metadata_is_link_like(&root_metadata) {
        return Err(ManifestError::UnsafeFileType {
            path: root.to_path_buf(),
            detail: "generation root must be a non-link directory".to_string(),
        });
    }
    require_windows_restricted_acl(root)?;
    let initial_root_identity = root_identity(root, &root_metadata)?;
    let canonical_root = std::fs::canonicalize(root).map_err(|error| io_error(root, error))?;
    let mut pending = vec![(root.to_path_buf(), 0_usize, None::<String>)];
    let mut discovered_directories = 1_usize;
    let mut directories = BTreeMap::new();
    let mut files = BTreeMap::new();
    let mut semantic = BTreeSet::new();
    let mut identities = BTreeSet::new();
    let mut file_parent_directories = BTreeSet::new();
    let mut total_bytes = 0_u64;
    let mut payload_files = 0_usize;
    let initial_file_limit =
        MAX_INSTALLED_FILES
            .checked_add(1)
            .ok_or_else(|| ManifestError::InvalidField {
                field: "generation tree".to_string(),
                detail: "installed-file count bound overflow".to_string(),
            })?;
    let file_limit = if excluded_manifest.is_none() {
        initial_file_limit
    } else {
        MAX_INSTALLED_FILES
    };
    let mut located_digest_match = None;
    while let Some((directory, depth, portable_directory)) = pending.pop() {
        if depth > 32 {
            return invalid("generation tree", "directory depth exceeds 32 segments");
        }
        require_windows_restricted_acl(&directory)?;
        if let Some(portable) = portable_directory.as_deref() {
            let current = observe_directory(&directory)?;
            if directories.get(portable) != Some(&current) {
                return Err(ManifestError::GenerationChanged {
                    detail: format!("installed directory {portable} changed before enumeration"),
                });
            }
        }
        let entries = std::fs::read_dir(&directory).map_err(|error| io_error(&directory, error))?;
        for entry in entries {
            let entry = entry.map_err(|error| io_error(&directory, error))?;
            let path = entry.path();
            let metadata = safe_symlink_metadata(&path)?;
            if metadata_is_link_like(&metadata) {
                return Err(ManifestError::UnsafeFileType {
                    path,
                    detail: "symlink or reparse-point traversal is forbidden".to_string(),
                });
            }
            let relative = path
                .strip_prefix(root)
                .map_err(|_| ManifestError::UnsafeFileType {
                    path: path.clone(),
                    detail: "path escaped the generation root".to_string(),
                })?;
            let portable = relative_path_string(relative)?;
            validate_portable_path("installed object", &portable)?;
            if !semantic.insert(semantic_path_key(&portable)) {
                return invalid("installed object", "case-folded semantic path collision");
            }
            let canonical_parent = std::fs::canonicalize(path.parent().unwrap_or(root))
                .map_err(|error| io_error(&path, error))?;
            if !canonical_parent.starts_with(&canonical_root) {
                return Err(ManifestError::UnsafeFileType {
                    path,
                    detail: "canonical parent escaped the generation root".to_string(),
                });
            }
            if metadata.is_dir() {
                if depth >= 32 {
                    return invalid("generation tree", "directory depth exceeds 32 segments");
                }
                if discovered_directories >= MAX_DIRECTORIES {
                    return invalid("generation tree", "too many directories");
                }
                discovered_directories += 1;
                let observed = observe_directory(&path)?;
                directories.insert(portable.clone(), observed);
                pending.push((path, depth + 1, Some(portable)));
                continue;
            }
            if !metadata.is_file() {
                return Err(ManifestError::UnsafeFileType {
                    path,
                    detail: "only regular files and directories are supported".to_string(),
                });
            }
            require_windows_restricted_acl(&path)?;
            total_bytes = total_bytes.checked_add(metadata.len()).ok_or_else(|| {
                ManifestError::InvalidField {
                    field: "generation tree".to_string(),
                    detail: "expanded size overflow".to_string(),
                }
            })?;
            if total_bytes > MAX_EXPANDED_TREE_BYTES {
                return invalid("generation tree", "expanded bytes exceed 8 GiB");
            }
            if excluded_manifest != Some(portable.as_str()) {
                payload_files += 1;
                if payload_files > file_limit {
                    return invalid(
                        "generation tree",
                        if excluded_manifest.is_none() {
                            "more than 100001 regular files before member-manifest discovery"
                        } else {
                            "more than 100000 installed payload files"
                        },
                    );
                }
            }
            let observed = hash_regular_file(&path, metadata.len())?;
            if !identities.insert(observed.identity) {
                return Err(ManifestError::UnsafeFileType {
                    path,
                    detail: "two installed paths resolve to the same regular-file identity"
                        .to_string(),
                });
            }
            if expected_unique_digest == Some(observed.digest.as_str())
                && located_digest_match.replace(portable.clone()).is_some()
            {
                return invalid(
                    "release member manifest",
                    "more than one installed file matches the trusted member digest",
                );
            }
            record_file_parent_directories(&portable, &mut file_parent_directories);
            files.insert(portable, observed);
        }
        require_windows_restricted_acl(&directory)?;
        if let Some(portable) = portable_directory.as_deref() {
            let current = observe_directory(&directory)?;
            if directories.get(portable) != Some(&current) {
                return Err(ManifestError::GenerationChanged {
                    detail: format!("installed directory {portable} changed during enumeration"),
                });
            }
        }
    }
    let final_root_metadata = safe_symlink_metadata(root)?;
    if !final_root_metadata.is_dir() || metadata_is_link_like(&final_root_metadata) {
        return Err(ManifestError::GenerationChanged {
            detail: "generation root type changed during scan".to_string(),
        });
    }
    let final_root_identity = root_identity(root, &final_root_metadata)?;
    if initial_root_identity != final_root_identity {
        return Err(ManifestError::GenerationChanged {
            detail: "generation root identity changed during scan".to_string(),
        });
    }
    require_windows_restricted_acl(root)?;
    if let Some(empty) = directories
        .keys()
        .find(|directory| !file_parent_directories.contains(*directory))
    {
        return invalid(
            "generation tree",
            &format!("non-root directory {empty} has no regular-file descendant"),
        );
    }
    Ok((
        GenerationSnapshot {
            canonical_root,
            root_identity: initial_root_identity,
            directories,
            files,
        },
        located_digest_match,
    ))
}

fn observe_directory(path: &Path) -> Result<ObservedDirectory> {
    require_windows_restricted_acl(path)?;
    let metadata = safe_symlink_metadata(path)?;
    if !metadata.is_dir() || metadata_is_link_like(&metadata) {
        return Err(ManifestError::UnsafeFileType {
            path: path.to_path_buf(),
            detail: "installed directory is not a non-link directory".to_string(),
        });
    }
    #[cfg(unix)]
    let observation = {
        use std::os::unix::fs::MetadataExt;
        ObservedDirectory {
            identity: FilesystemIdentity::Unix {
                device: metadata.dev(),
                inode: metadata.ino(),
            },
            owner: Some(metadata.uid()),
            mode: Some(metadata.mode() & 0o777),
        }
    };
    #[cfg(windows)]
    let observation = {
        let identity = vaultspec_windows_authority::AuthorityFile::identity_at_path(path)
            .map_err(|error| io_error(path, error))?;
        ObservedDirectory {
            identity: FilesystemIdentity::Windows {
                volume_serial_number: identity.volume_serial_number,
                file_id: identity.file_id,
            },
            owner: None,
            mode: None,
        }
    };
    require_windows_restricted_acl(path)?;
    Ok(observation)
}

pub(super) fn require_unchanged_snapshot(
    initial: &GenerationSnapshot,
    final_snapshot: &GenerationSnapshot,
) -> Result<()> {
    if initial == final_snapshot {
        Ok(())
    } else {
        Err(ManifestError::GenerationChanged {
            detail: "root identity, canonical root, directory inventory, or installed-file observation changed across verification"
                .to_string(),
        })
    }
}

#[cfg(unix)]
fn root_identity(_path: &Path, metadata: &Metadata) -> Result<RootIdentity> {
    use std::os::unix::fs::MetadataExt;
    Ok(RootIdentity::Unix {
        device: metadata.dev(),
        inode: metadata.ino(),
    })
}

#[cfg(windows)]
fn root_identity(path: &Path, _metadata: &Metadata) -> Result<RootIdentity> {
    let identity = vaultspec_windows_authority::AuthorityFile::identity_at_path(path)
        .map_err(|error| io_error(path, error))?;
    Ok(RootIdentity::Windows {
        volume_serial_number: identity.volume_serial_number,
        file_id: identity.file_id,
    })
}

fn safe_symlink_metadata(path: &Path) -> Result<Metadata> {
    std::fs::symlink_metadata(path).map_err(|error| io_error(path, error))
}

#[cfg(windows)]
fn metadata_is_link_like(metadata: &Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn metadata_is_link_like(metadata: &Metadata) -> bool {
    metadata.file_type().is_symlink()
}

#[cfg(not(windows))]
fn require_windows_restricted_acl(_path: &Path) -> Result<()> {
    Ok(())
}

#[cfg(windows)]
fn require_windows_restricted_acl(path: &Path) -> Result<()> {
    use vaultspec_windows_authority::{AuthorityFile, ReadOnlyAuthorityDirectory, private_policy};
    use windows_acl::helper::{current_user, name_to_sid, sid_to_string};

    static CURRENT_USER_SID: std::sync::OnceLock<Option<String>> = std::sync::OnceLock::new();
    let restricted = (|| {
        let user_sid = CURRENT_USER_SID
            .get_or_init(|| {
                let user = current_user()?;
                let sid = name_to_sid(&user, None).ok()?;
                sid_to_string(sid.as_ptr().cast_mut().cast()).ok()
            })
            .as_deref()?;
        // Observe the DACL through a handle-based single snapshot, never a raced
        // path enumeration: a directory through the read-only OBSERVATION
        // authority (permissive sharing, no WRITE_DAC, no traverse), a regular
        // file through an exact read handle.
        let metadata = std::fs::symlink_metadata(path).ok()?;
        let snapshot = if metadata.is_dir() {
            ReadOnlyAuthorityDirectory::open_observation(path)
                .ok()?
                .dacl_snapshot()
                .ok()?
        } else {
            AuthorityFile::open_reader(path)
                .ok()?
                .dacl_snapshot()
                .ok()?
        };
        private_policy::validate_no_outside_principal(&snapshot, user_sid).ok()
    })()
    .is_some();
    if restricted {
        Ok(())
    } else {
        Err(ManifestError::UnsafeFileType {
            path: path.to_path_buf(),
            detail: "Windows installed object DACL grants or delegates authority outside the current user, LocalSystem, and Administrators"
                .to_string(),
        })
    }
}

#[cfg(unix)]
fn normalized_file_mode(metadata: &Metadata) -> Option<&'static str> {
    use std::os::unix::fs::PermissionsExt;
    Some(if metadata.permissions().mode() & 0o111 == 0 {
        "0644"
    } else {
        "0755"
    })
}

#[cfg(not(unix))]
fn normalized_file_mode(_metadata: &Metadata) -> Option<&'static str> {
    None
}

#[derive(Clone, Copy, PartialEq, Eq)]
struct OpenedFileState {
    identity: FilesystemIdentity,
    owner: Option<u32>,
    link_count: u64,
    size: u64,
    normalized_mode: Option<&'static str>,
}

struct OpenedRegular {
    #[cfg(unix)]
    file: File,
    #[cfg(windows)]
    authority: vaultspec_windows_authority::AuthorityFile,
}

impl OpenedRegular {
    fn file(&self) -> &File {
        #[cfg(unix)]
        {
            &self.file
        }
        #[cfg(windows)]
        {
            self.authority.file()
        }
    }

    fn state(&self, path: &Path) -> Result<OpenedFileState> {
        let metadata = self
            .file()
            .metadata()
            .map_err(|error| io_error(path, error))?;
        if !metadata.is_file() || metadata_is_link_like(&metadata) {
            return Err(ManifestError::UnsafeFileType {
                path: path.to_path_buf(),
                detail: "opened object is not a non-link regular file".to_string(),
            });
        }
        #[cfg(unix)]
        let (identity, owner, link_count) = {
            use std::os::unix::fs::MetadataExt;
            (
                FilesystemIdentity::Unix {
                    device: metadata.dev(),
                    inode: metadata.ino(),
                },
                Some(metadata.uid()),
                metadata.nlink(),
            )
        };
        #[cfg(windows)]
        let (identity, owner, link_count) = {
            let identity = self.authority.identity();
            (
                FilesystemIdentity::Windows {
                    volume_serial_number: identity.volume_serial_number,
                    file_id: identity.file_id,
                },
                None,
                self.authority
                    .link_count()
                    .map_err(|error| io_error(path, error))?,
            )
        };
        if link_count != 1 {
            return Err(ManifestError::UnsafeFileType {
                path: path.to_path_buf(),
                detail: format!(
                    "installed regular file must have exactly one hard-link name, found {link_count}"
                ),
            });
        }
        Ok(OpenedFileState {
            identity,
            owner,
            link_count,
            size: metadata.len(),
            normalized_mode: normalized_file_mode(&metadata),
        })
    }
}

fn open_regular_nofollow(path: &Path) -> Result<OpenedRegular> {
    #[cfg(unix)]
    {
        let mut options = OpenOptions::new();
        options.read(true);
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(nix::libc::O_NOFOLLOW);
        let file = options.open(path).map_err(|error| io_error(path, error))?;
        let opened = OpenedRegular { file };
        let _ = opened.state(path)?;
        Ok(opened)
    }
    #[cfg(windows)]
    {
        let authority = vaultspec_windows_authority::AuthorityFile::open_reader(path)
            .map_err(|error| io_error(path, error))?;
        let opened = OpenedRegular { authority };
        let _ = opened.state(path)?;
        Ok(opened)
    }
}

fn hash_regular_file(path: &Path, expected_size: u64) -> Result<ObservedFile> {
    require_windows_restricted_acl(path)?;
    let opened = open_regular_nofollow(path)?;
    let initial_state = opened.state(path)?;
    if initial_state.size != expected_size {
        return Err(ManifestError::GenerationChanged {
            detail: format!(
                "{} size changed between no-follow metadata and same-handle open",
                path.display()
            ),
        });
    }
    let read_limit = expected_size
        .checked_add(1)
        .ok_or_else(|| ManifestError::InputTooLarge {
            field: path.display().to_string(),
            limit: expected_size,
            found: u64::MAX,
        })?;
    let mut reader = opened.file().take(read_limit);
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; READ_CHUNK];
    let mut total = 0_u64;
    loop {
        let count = reader
            .read(&mut buffer)
            .map_err(|error| io_error(path, error))?;
        if count == 0 {
            break;
        }
        total = total
            .checked_add(count as u64)
            .ok_or_else(|| ManifestError::InputTooLarge {
                field: path.display().to_string(),
                limit: expected_size,
                found: u64::MAX,
            })?;
        if total > expected_size || total > MAX_EXPANDED_TREE_BYTES {
            return Err(ManifestError::SizeMismatch {
                path: path.display().to_string(),
                expected: expected_size,
                found: total,
            });
        }
        hasher.update(&buffer[..count]);
    }
    if total != expected_size {
        return Err(ManifestError::SizeMismatch {
            path: path.display().to_string(),
            expected: expected_size,
            found: total,
        });
    }
    let final_state = opened.state(path)?;
    require_windows_restricted_acl(path)?;
    if initial_state != final_state {
        return Err(ManifestError::GenerationChanged {
            detail: format!(
                "{} same-handle identity, link count, size, or mode changed during hashing",
                path.display()
            ),
        });
    }
    Ok(ObservedFile {
        identity: final_state.identity,
        owner: final_state.owner,
        link_count: final_state.link_count,
        size: total,
        digest: format!("{:x}", hasher.finalize()),
        normalized_mode: final_state.normalized_mode,
    })
}

fn relative_path_string(path: &Path) -> Result<String> {
    let mut segments = Vec::new();
    for component in path.components() {
        let std::path::Component::Normal(segment) = component else {
            return invalid("installed file", "non-normal filesystem path component");
        };
        let text = segment
            .to_str()
            .ok_or_else(|| ManifestError::InvalidField {
                field: "installed file".to_string(),
                detail: "path is not UTF-8".to_string(),
            })?;
        segments.push(text);
    }
    Ok(segments.join("/"))
}

pub(super) fn verify_release_manifest_bytes(
    root: &Path,
    relative: &str,
    expected: &[u8],
    observed: &BTreeMap<String, ObservedFile>,
) -> Result<()> {
    verify_installed_exact_bytes(root, relative, expected, observed_file(observed, relative)?)
}

pub(super) fn verify_installed_exact_bytes(
    root: &Path,
    relative: &str,
    expected: &[u8],
    initial: &ObservedFile,
) -> Result<()> {
    let bytes = read_installed_bounded(root, relative, expected.len() as u64, initial)?;
    if bytes != expected {
        return Err(ManifestError::DigestDrift {
            field: relative.to_string(),
            expected: hex::sha256(expected),
            found: hex::sha256(&bytes),
        });
    }
    Ok(())
}

pub(super) fn observed_file<'a>(
    observed: &'a BTreeMap<String, ObservedFile>,
    relative: &str,
) -> Result<&'a ObservedFile> {
    observed
        .get(relative)
        .ok_or_else(|| ManifestError::MissingFile(relative.to_string()))
}

pub(super) fn verify_complete_inventory(
    manifest: &RawReleaseSetManifest,
    observed: &BTreeMap<String, ObservedFile>,
) -> Result<()> {
    for (path, expected) in &manifest.file_digests {
        let file = observed
            .get(path)
            .ok_or_else(|| ManifestError::MissingFile(path.clone()))?;
        expect_digest(&format!("installed file {path}"), expected, &file.digest)?;
    }
    for path in observed.keys() {
        if path != &manifest.release_manifest.path && !manifest.file_digests.contains_key(path) {
            return Err(ManifestError::ExtraFile(path.clone()));
        }
    }
    if !observed.contains_key(&manifest.release_manifest.path) {
        return Err(ManifestError::MissingFile(
            manifest.release_manifest.path.clone(),
        ));
    }
    Ok(())
}

pub(super) fn verify_artifact_joins(
    manifest: &RawReleaseSetManifest,
    observed: &BTreeMap<String, ObservedFile>,
) -> Result<()> {
    // S06 proves the declared license and SBOM files are present and byte-bound.
    // Semantic coverage/completeness remains release-workflow authority owned by
    // W04.P08.S64/S65; this verifier does not claim to interpret those contents.
    verify_sized_join(
        "dashboard",
        &manifest.dashboard.path,
        manifest.dashboard.size,
        &manifest.dashboard.digest,
        manifest,
        observed,
    )?;
    verify_sized_join(
        "updater",
        &manifest.updater.path,
        manifest.updater.size,
        &manifest.updater.digest,
        manifest,
        observed,
    )?;
    verify_digest_join(
        "component lock",
        &manifest.a2a_component.component_lock.path,
        &manifest.a2a_component.component_lock.digest,
        manifest,
        observed,
    )?;
    verify_digest_join(
        "capsule manifest",
        &manifest.a2a_component.capsule_manifest.path,
        &manifest.a2a_component.capsule_manifest.digest,
        manifest,
        observed,
    )?;
    verify_sized_join(
        "capsule archive",
        &manifest.a2a_component.capsule_archive.path,
        manifest.a2a_component.capsule_archive.size,
        &manifest.a2a_component.capsule_archive.digest,
        manifest,
        observed,
    )?;
    verify_sized_join(
        "tree evidence",
        &manifest.a2a_component.tree_evidence.path,
        manifest.a2a_component.tree_evidence.size,
        &manifest.a2a_component.tree_evidence.digest,
        manifest,
        observed,
    )?;
    verify_sized_join(
        "sbom",
        &manifest.sbom.path,
        manifest.sbom.size,
        &manifest.sbom.digest,
        manifest,
        observed,
    )?;
    for license in &manifest.licenses {
        verify_digest_join(
            "license",
            &license.path,
            &license.digest,
            manifest,
            observed,
        )?;
    }
    Ok(())
}

fn verify_digest_join(
    field: &str,
    path: &str,
    digest: &str,
    manifest: &RawReleaseSetManifest,
    observed: &BTreeMap<String, ObservedFile>,
) -> Result<()> {
    let inventory = manifest
        .file_digests
        .get(path)
        .ok_or_else(|| ManifestError::MissingFile(path.to_string()))?;
    expect_digest(&format!("{field} inventory join"), digest, inventory)?;
    let actual = observed
        .get(path)
        .ok_or_else(|| ManifestError::MissingFile(path.to_string()))?;
    expect_digest(&format!("{field} installed bytes"), digest, &actual.digest)
}

fn verify_sized_join(
    field: &str,
    path: &str,
    size: u64,
    digest: &str,
    manifest: &RawReleaseSetManifest,
    observed: &BTreeMap<String, ObservedFile>,
) -> Result<()> {
    verify_digest_join(field, path, digest, manifest, observed)?;
    let actual = &observed[path];
    if actual.size != size {
        return Err(ManifestError::SizeMismatch {
            path: path.to_string(),
            expected: size,
            found: actual.size,
        });
    }
    Ok(())
}

pub(super) fn read_installed_bounded(
    root: &Path,
    relative: &str,
    limit: u64,
    initial: &ObservedFile,
) -> Result<Vec<u8>> {
    let path = root.join(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
    require_windows_restricted_acl(&path)?;
    let metadata = safe_symlink_metadata(&path)?;
    if metadata.len() > limit {
        return Err(ManifestError::InputTooLarge {
            field: relative.to_string(),
            limit,
            found: metadata.len(),
        });
    }
    let opened = open_regular_nofollow(&path)?;
    let initial_state = opened.state(&path)?;
    if initial_state.size != metadata.len() {
        return Err(ManifestError::GenerationChanged {
            detail: format!(
                "{relative} size changed between no-follow metadata and same-handle open"
            ),
        });
    }
    if initial_state.size > limit {
        return Err(ManifestError::InputTooLarge {
            field: relative.to_string(),
            limit,
            found: initial_state.size,
        });
    }
    let read_limit = limit
        .checked_add(1)
        .ok_or_else(|| ManifestError::InputTooLarge {
            field: relative.to_string(),
            limit,
            found: u64::MAX,
        })?;
    let capacity = usize::try_from(initial_state.size.min(limit)).map_err(|_| {
        ManifestError::InputTooLarge {
            field: relative.to_string(),
            limit,
            found: initial_state.size,
        }
    })?;
    let mut bytes = Vec::with_capacity(capacity);
    opened
        .file()
        .take(read_limit)
        .read_to_end(&mut bytes)
        .map_err(|error| io_error(&path, error))?;
    if bytes.len() as u64 > limit {
        return Err(ManifestError::InputTooLarge {
            field: relative.to_string(),
            limit,
            found: bytes.len() as u64,
        });
    }
    let final_state = opened.state(&path)?;
    require_windows_restricted_acl(&path)?;
    if initial_state != final_state {
        return Err(ManifestError::GenerationChanged {
            detail: format!(
                "{relative} same-handle identity, link count, size, or mode changed during bounded reread"
            ),
        });
    }
    let reread = ObservedFile {
        identity: final_state.identity,
        owner: final_state.owner,
        link_count: final_state.link_count,
        size: bytes.len() as u64,
        digest: hex::sha256(&bytes),
        normalized_mode: final_state.normalized_mode,
    };
    if !initial.semantically_matches(&reread) {
        return Err(ManifestError::GenerationChanged {
            detail: format!("{relative} semantic observation changed during bounded reread"),
        });
    }
    Ok(bytes)
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct InstalledTreeInventory {
    inventory_version: String,
    metadata: InventoryMetadata,
    components: Vec<InventoryComponent>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct InventoryMetadata {
    timestamp: String,
    component: InventoryApplication,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct InventoryApplication {
    #[serde(rename = "type")]
    kind: String,
    name: String,
    version: String,
    properties: Vec<InventoryProperty>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct InventoryComponent {
    #[serde(rename = "type")]
    kind: String,
    name: String,
    hashes: Vec<InventoryHash>,
    properties: Vec<InventoryProperty>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct InventoryHash {
    alg: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct InventoryProperty {
    name: String,
    value: String,
}

#[derive(Debug, Serialize)]
struct TreeDigestRecord<'a> {
    mode: &'a str,
    path: &'a str,
    sha256: &'a str,
    size: &'a str,
}

#[derive(Debug)]
pub(super) struct ValidatedTreeRecord {
    pub(super) path: String,
    pub(super) mode: String,
    pub(super) size: u64,
    pub(super) size_text: String,
    pub(super) digest: String,
}

pub(super) fn verify_tree_evidence(
    root: &Path,
    trusted_capsule_root: &str,
    release: &RawReleaseSetManifest,
    capsule: &CapsuleManifest,
    observed: &BTreeMap<String, ObservedFile>,
) -> Result<()> {
    let evidence = read_installed_bounded(
        root,
        &release.a2a_component.tree_evidence.path,
        MAX_TREE_EVIDENCE_BYTES,
        observed_file(observed, &release.a2a_component.tree_evidence.path)?,
    )?;
    let inventory: InstalledTreeInventory = serde_json::from_slice(&evidence)
        .map_err(|error| ManifestError::Parse(error.to_string()))?;
    let parsed_value: serde_json::Value = serde_json::from_slice(&evidence)
        .map_err(|error| ManifestError::Parse(error.to_string()))?;
    let mut canonical_evidence = serde_json::to_vec(&parsed_value)
        .map_err(|error| ManifestError::Parse(error.to_string()))?;
    canonical_evidence.push(b'\n');
    if canonical_evidence != evidence {
        return invalid(
            "a2a_component.tree_evidence",
            "inventory bytes are not compact sorted-key UTF-8 JSON plus one LF",
        );
    }
    expect_literal(
        "tree_evidence.inventory_version",
        "vaultspec-installed-tree-v1",
        &inventory.inventory_version,
    )?;
    require_bounded_text(
        "tree_evidence.metadata.timestamp",
        &inventory.metadata.timestamp,
        1,
        64,
    )?;
    expect_literal(
        "tree_evidence.metadata.component.type",
        "application",
        &inventory.metadata.component.kind,
    )?;
    expect_literal(
        "tree_evidence.metadata.component.name",
        &capsule.identity.name,
        &inventory.metadata.component.name,
    )?;
    expect_literal(
        "tree_evidence.metadata.component.version",
        &capsule.identity.version,
        &inventory.metadata.component.version,
    )?;
    let metadata_properties = property_map(
        "tree_evidence.metadata.component.properties",
        &inventory.metadata.component.properties,
        2,
    )?;
    expect_literal(
        "tree_evidence metadata target",
        capsule.target.triple(),
        required_property(&metadata_properties, "vaultspec:target")?,
    )?;
    expect_digest(
        "tree_evidence metadata component manifest",
        &release.a2a_component.capsule_manifest.digest,
        required_property(&metadata_properties, "vaultspec:component-manifest-sha256")?,
    )?;

    if inventory.components.is_empty() || inventory.components.len() > MAX_TREE_FILES {
        return invalid("tree_evidence.components", "must contain 1..=80000 files");
    }
    if inventory.components.len() != release.a2a_component.tree_evidence.file_count {
        return invalid(
            "tree_evidence.file_count",
            "does not match inventory components",
        );
    }
    let mut records = Vec::with_capacity(inventory.components.len());
    let mut semantic = BTreeSet::new();
    let mut installed_tree_paths = BTreeSet::new();
    for component in &inventory.components {
        expect_literal("tree_evidence.components.type", "file", &component.kind)?;
        validate_portable_path("tree_evidence.components.name", &component.name)?;
        if !semantic.insert(semantic_path_key(&component.name)) {
            return invalid("tree_evidence.components", "duplicate semantic path");
        }
        if component.hashes.len() != 1 {
            return invalid(
                "tree_evidence.components.hashes",
                "must contain exactly one SHA-256 hash",
            );
        }
        expect_literal(
            "tree_evidence.components.hashes.alg",
            "SHA-256",
            &component.hashes[0].alg,
        )?;
        require_digest(
            "tree_evidence.components.hashes.content",
            &component.hashes[0].content,
        )?;
        let properties = property_map(
            "tree_evidence.components.properties",
            &component.properties,
            2,
        )?;
        let mode = required_property(&properties, "vaultspec:file-mode")?;
        if !matches!(mode, "0644" | "0755") {
            return invalid("tree_evidence.components.mode", "must be 0644 or 0755");
        }
        let size_text = required_property(&properties, "vaultspec:file-size")?;
        if size_text.is_empty()
            || (size_text.len() > 1 && size_text.starts_with('0'))
            || !size_text.bytes().all(|byte| byte.is_ascii_digit())
        {
            return invalid(
                "tree_evidence.components.size",
                "must be canonical unsigned decimal",
            );
        }
        let size = size_text
            .parse::<u64>()
            .map_err(|_| ManifestError::InvalidField {
                field: "tree_evidence.components.size".to_string(),
                detail: "size is outside u64".to_string(),
            })?;
        if size > 2 * 1024 * 1024 * 1024 {
            return invalid("tree_evidence.components.size", "member exceeds 2 GiB");
        }
        let installed_path = format!("{trusted_capsule_root}/{}", component.name);
        validate_portable_path("tree_evidence installed path", &installed_path)?;
        let actual = observed
            .get(&installed_path)
            .ok_or_else(|| ManifestError::MissingFile(installed_path.clone()))?;
        if actual.size != size {
            return Err(ManifestError::SizeMismatch {
                path: installed_path,
                expected: size,
                found: actual.size,
            });
        }
        expect_digest(
            &format!("tree evidence installed file {}", component.name),
            &component.hashes[0].content,
            &actual.digest,
        )?;
        if let Some(actual_mode) = actual.normalized_mode {
            expect_literal(
                &format!("tree evidence installed mode {}", component.name),
                mode,
                actual_mode,
            )?;
        }
        installed_tree_paths.insert(installed_path);
        records.push(ValidatedTreeRecord {
            path: component.name.clone(),
            mode: mode.to_string(),
            size,
            size_text: size_text.to_string(),
            digest: component.hashes[0].content.clone(),
        });
    }
    let tree_prefix = format!("{trusted_capsule_root}/");
    for installed_path in observed
        .keys()
        .filter(|path| path.starts_with(&tree_prefix))
    {
        if !installed_tree_paths.contains(installed_path) {
            return Err(ManifestError::ExtraFile(format!(
                "{installed_path} is absent from A2A installed-tree evidence"
            )));
        }
    }
    verify_entrypoint_tree_record(
        "gateway",
        &capsule.entrypoints.gateway,
        trusted_capsule_root,
        &records,
        observed,
    )?;
    verify_entrypoint_tree_record(
        "standalone-mcp",
        &capsule.entrypoints.standalone_mcp,
        trusted_capsule_root,
        &records,
        observed,
    )?;
    records.sort_by(|left, right| left.path.cmp(&right.path));
    let expanded = records.iter().try_fold(0_u64, |total, record| {
        total
            .checked_add(record.size)
            .ok_or_else(|| ManifestError::InvalidField {
                field: "tree_evidence.components".to_string(),
                detail: "expanded size overflow".to_string(),
            })
    })?;
    if expanded > MAX_EXPANDED_TREE_BYTES {
        return invalid("tree_evidence.components", "expanded tree exceeds 8 GiB");
    }
    let computed = tree_digest(&records)?;
    expect_digest(
        "a2a_component.tree_evidence.tree_digest",
        &release.a2a_component.tree_evidence.tree_digest,
        &computed,
    )
}

fn verify_entrypoint_tree_record(
    field: &str,
    entrypoint: &LaunchEntrypoint,
    trusted_capsule_root: &str,
    records: &[ValidatedTreeRecord],
    observed: &BTreeMap<String, ObservedFile>,
) -> Result<()> {
    let relative = entrypoint.relative_command.join("/");
    // The A2A producer permits bounded Unicode path segments, while the
    // committed S04 release inventory is deliberately ASCII. S13/S64 release
    // composition must reject an otherwise valid Unicode capsule; S06 keeps
    // that mismatch fail-closed rather than silently widening S04.
    validate_portable_path(&format!("capsule.entrypoints.{field}"), &relative)?;
    let record = records
        .iter()
        .find(|record| record.path == relative)
        .ok_or_else(|| {
            ManifestError::MissingFile(format!(
                "{field} entrypoint {relative} is absent from A2A tree evidence"
            ))
        })?;
    expect_literal(
        &format!("capsule.entrypoints.{field} mode"),
        "0755",
        &record.mode,
    )?;
    let installed = format!("{trusted_capsule_root}/{relative}");
    let actual = observed_file(observed, &installed)?;
    if let Some(mode) = actual.normalized_mode {
        expect_literal(
            &format!("capsule.entrypoints.{field} installed mode"),
            "0755",
            mode,
        )?;
    }
    Ok(())
}

fn property_map<'a>(
    field: &str,
    properties: &'a [InventoryProperty],
    expected: usize,
) -> Result<BTreeMap<&'a str, &'a str>> {
    if properties.len() != expected {
        return invalid(
            field,
            &format!("must contain exactly {expected} properties"),
        );
    }
    let mut values = BTreeMap::new();
    for property in properties {
        require_bounded_text(field, &property.name, 1, 128)?;
        require_bounded_text(field, &property.value, 1, 4096)?;
        if values
            .insert(property.name.as_str(), property.value.as_str())
            .is_some()
        {
            return invalid(field, "duplicate property name");
        }
    }
    Ok(values)
}

fn required_property<'a>(properties: &'a BTreeMap<&str, &str>, name: &str) -> Result<&'a str> {
    properties
        .get(name)
        .copied()
        .ok_or_else(|| ManifestError::InvalidField {
            field: "tree_evidence.properties".to_string(),
            detail: format!("missing {name}"),
        })
}

pub(super) fn tree_digest(records: &[ValidatedTreeRecord]) -> Result<String> {
    let canonical: Vec<TreeDigestRecord<'_>> = records
        .iter()
        .map(|record| TreeDigestRecord {
            mode: &record.mode,
            path: &record.path,
            sha256: &record.digest,
            size: &record.size_text,
        })
        .collect();
    // This exactly matches A2A `deterministic_tree_digest`: validated records
    // sorted by path, lexicographic object keys, compact UTF-8 JSON, one LF.
    // S04's schema prose names canonical evidence but should later codify this
    // preimage mechanically; this consumer follows the current producer.
    let mut bytes =
        serde_json::to_vec(&canonical).map_err(|error| ManifestError::Parse(error.to_string()))?;
    bytes.push(b'\n');
    Ok(hex::sha256(&bytes))
}

// ---------------------------------------------------------------------------
// Closed scalar and path validators
// ---------------------------------------------------------------------------

pub(super) fn require_input_bound(field: &str, found: usize, limit: u64) -> Result<()> {
    if found as u64 > limit {
        Err(ManifestError::InputTooLarge {
            field: field.to_string(),
            limit,
            found: found as u64,
        })
    } else {
        Ok(())
    }
}

pub(super) fn invalid<T>(field: &str, detail: &str) -> Result<T> {
    Err(ManifestError::InvalidField {
        field: field.to_string(),
        detail: detail.to_string(),
    })
}

pub(super) fn expect_literal(field: &str, expected: &str, found: &str) -> Result<()> {
    if expected == found {
        Ok(())
    } else {
        Err(ManifestError::IdentityMismatch {
            detail: format!("{field}: expected {expected:?}, found {found:?}"),
        })
    }
}

pub(super) fn expect_digest(field: &str, expected: &str, found: &str) -> Result<()> {
    if expected == found {
        Ok(())
    } else {
        Err(ManifestError::DigestDrift {
            field: field.to_string(),
            expected: expected.to_string(),
            found: found.to_string(),
        })
    }
}

pub(super) fn require_digest(field: &str, value: &str) -> Result<()> {
    if value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        Ok(())
    } else {
        Err(ManifestError::MalformedDigest {
            field: field.to_string(),
            value: value.to_string(),
        })
    }
}

pub(super) fn require_commit(field: &str, value: &str) -> Result<()> {
    if value.len() == 40
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        Ok(())
    } else {
        Err(ManifestError::UnpinnedCommit {
            field: field.to_string(),
            value: value.to_string(),
        })
    }
}

pub(super) fn require_exact_version(field: &str, value: &str) -> Result<()> {
    require_numeric_version(field, value, 2, 3)
}

pub(super) fn require_numeric_version(
    field: &str,
    value: &str,
    minimum_parts: usize,
    maximum_parts: usize,
) -> Result<()> {
    if value.len() > 128 {
        return invalid(field, "version exceeds 128 bytes");
    }
    let parts: Vec<&str> = value.split('.').collect();
    if !(minimum_parts..=maximum_parts).contains(&parts.len())
        || parts
            .iter()
            .any(|part| part.is_empty() || !part.bytes().all(|byte| byte.is_ascii_digit()))
    {
        return Err(ManifestError::FloatingSelector {
            field: field.to_string(),
            value: value.to_string(),
        });
    }
    Ok(())
}

pub(super) fn version_prefix(value: &str, parts: usize) -> Result<String> {
    require_exact_version("trusted runtime version", value)?;
    let components: Vec<&str> = value.split('.').collect();
    if components.len() < parts {
        return invalid(
            "trusted runtime version",
            "not enough numeric version components",
        );
    }
    Ok(components[..parts].join("."))
}

pub(super) fn require_identity(field: &str, value: &str) -> Result<()> {
    let bytes = value.as_bytes();
    let valid = !bytes.is_empty()
        && bytes.len() <= 128
        && bytes[0].is_ascii_alphanumeric()
        && bytes[bytes.len() - 1].is_ascii_alphanumeric()
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'));
    if valid {
        Ok(())
    } else {
        invalid(
            field,
            "must match the bounded non-path identity-token grammar",
        )
    }
}

pub(super) fn require_bounded_text(
    field: &str,
    value: &str,
    minimum: usize,
    maximum: usize,
) -> Result<()> {
    let length = value.len();
    if length < minimum
        || length > maximum
        || value
            .chars()
            .any(|character| character == '\0' || character.is_control())
    {
        invalid(
            field,
            &format!("must be {minimum}..={maximum} UTF-8 bytes without controls"),
        )
    } else {
        Ok(())
    }
}

pub(super) fn require_target_roster(field: &str, targets: &[Target]) -> Result<()> {
    if targets == TARGETS {
        Ok(())
    } else {
        invalid(field, "must equal the canonical ordered five-target roster")
    }
}

pub(super) fn require_gateway_range(field: &str, range: &RangeBounds) -> Result<()> {
    if range.minimum == "v1" && range.maximum == "v1" {
        Ok(())
    } else {
        invalid(field, "only the closed v1..v1 gateway range is supported")
    }
}

pub(super) fn require_migration(field: &str, value: &str) -> Result<()> {
    let lower = value.to_ascii_lowercase();
    if value.is_empty()
        || value.len() > 64
        || matches!(lower.as_str(), "head" | "heads" | "base" | "latest" | "x")
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
        || !value.as_bytes()[0].is_ascii_alphanumeric()
    {
        return Err(ManifestError::FloatingSelector {
            field: field.to_string(),
            value: value.to_string(),
        });
    }
    Ok(())
}

pub(crate) fn validate_portable_path(field: &str, path: &str) -> Result<()> {
    if path.is_empty() || path.len() > 4096 || path.contains('\\') || path.contains(':') {
        return invalid(field, "path must be a bounded relative slash path");
    }
    let segments: Vec<&str> = path.split('/').collect();
    if segments.is_empty() || segments.len() > 32 {
        return invalid(field, "path must contain 1..=32 segments");
    }
    for segment in segments {
        validate_portable_segment(field, segment, true)?;
    }
    Ok(())
}

pub(crate) fn validate_portable_segment(
    field: &str,
    segment: &str,
    ascii_release_path: bool,
) -> Result<()> {
    let invalid_character = if ascii_release_path {
        segment.bytes().any(|byte| {
            !(byte.is_ascii_alphanumeric() || matches!(byte, b'@' | b'_' | b'+' | b'.' | b'-'))
        })
    } else {
        segment.chars().any(|character| {
            character.is_control()
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
        })
    };
    if segment.is_empty()
        || segment.len() > 128
        || matches!(segment, "." | "..")
        || segment.ends_with('.')
        || segment.ends_with(' ')
        || invalid_character
        || is_windows_reserved(segment)
    {
        return invalid(field, &format!("unsafe portable path segment {segment:?}"));
    }
    Ok(())
}

fn is_windows_reserved(segment: &str) -> bool {
    let stem = segment
        .split('.')
        .next()
        .unwrap_or(segment)
        .to_ascii_lowercase();
    if matches!(
        stem.as_str(),
        "con" | "conin$" | "conout$" | "prn" | "aux" | "nul"
    ) {
        return true;
    }
    let mut characters = stem.chars();
    let prefix: String = characters.by_ref().take(3).collect();
    let suffix: String = characters.collect();
    matches!(prefix.as_str(), "com" | "lpt")
        && matches!(
            suffix.as_str(),
            "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
        )
}

pub(crate) fn semantic_path_key(path: &str) -> String {
    path.to_ascii_lowercase()
}
