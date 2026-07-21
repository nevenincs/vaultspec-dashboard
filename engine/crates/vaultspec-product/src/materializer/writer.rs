//! The crate-private retained generation writer
//! (archive-materialization D4/D5).
//!
//! The writer is borrowed from the exact `UnpublishedGeneration` and is the
//! ONLY descendant mutation surface: it accepts validated path segments and
//! admitted metadata, exposes no pathname or raw handle to the archive
//! parser, and installs every file through the transaction-reserved sibling
//! name with a no-replace rename under the same retained parent. There is no
//! overwrite, no link creation, no pathname cleanup, and no Drop cleanup; a
//! failed entry leaves bounded transaction-reserved residue for descriptor
//! recovery.
//!
//! Unix traversal is retained-parent-relative and no-follow throughout
//! (`openat`/`mkdirat`/`renameat`). Windows traversal rides the
//! write-shared, delete-denied materialization lease and the two fenced
//! child-file primitives in the isolated Windows authority crate; Windows
//! has no directory-synchronization primitive under these leases, so
//! ordering there rests on write-through file synchronization plus the
//! complete post-materialization verification, and production Windows
//! activation remains gated.

use std::collections::BTreeSet;
use std::io::Read;
use std::time::Instant;

use sha2::{Digest as _, Sha256};

use crate::generation::UnpublishedGeneration;

use super::MaterializeError;
use super::archive::RESERVED_TEMP_SUFFIX;
use crate::hex;

#[cfg(unix)]
type DirHandle = rustix::fd::OwnedFd;
#[cfg(windows)]
type DirHandle = vaultspec_windows_authority::MaterializationDirectory;

/// A traversal parent: the retained root by reference, or an owned child.
enum ParentDir<'a> {
    Root(&'a DirHandle),
    Owned(DirHandle),
}

impl ParentDir<'_> {
    fn handle(&self) -> &DirHandle {
        match self {
            ParentDir::Root(root) => root,
            ParentDir::Owned(directory) => directory,
        }
    }
}

pub(super) struct GenerationWriter<'generation, 'product, 'lock> {
    generation: &'generation mut UnpublishedGeneration<'product, 'lock>,
    root: DirHandle,
    /// Every parent chain touched, for the bottom-up final synchronization.
    directories: BTreeSet<Vec<String>>,
}

impl<'generation, 'product, 'lock> GenerationWriter<'generation, 'product, 'lock> {
    /// Borrow the writer from the exact retained generation.
    pub(super) fn begin(
        generation: &'generation mut UnpublishedGeneration<'product, 'lock>,
    ) -> Result<Self, MaterializeError> {
        let root = generation
            .open_materialization_root()
            .map_err(MaterializeError::Generation)?;
        Ok(Self {
            generation,
            root,
            directories: BTreeSet::new(),
        })
    }

    /// Decode one admitted entry into its final name: transaction-reserved
    /// sibling, counted+digested write, synchronize, same-handle revalidate,
    /// admitted mode, no-replace install, parent synchronize
    /// (archive-materialization D5). The decoded digest must equal the
    /// preflight digest, so the write pass cannot install bytes preflight
    /// never proved.
    pub(super) fn install_entry(
        &mut self,
        path: &str,
        executable: bool,
        decoded: &mut dyn Read,
        expected_size: u64,
        expected_sha256: &str,
        deadline: Instant,
    ) -> Result<(), MaterializeError> {
        let segments: Vec<&str> = path.split('/').collect();
        let (leaf, parents) = segments
            .split_last()
            .ok_or_else(|| MaterializeError::ArchiveGrammar("empty entry path".to_string()))?;
        let parent = ensure_directories(&self.root, parents)?;
        self.directories.insert(
            parents
                .iter()
                .map(|segment| (*segment).to_string())
                .collect(),
        );

        let temporary = format!(".{leaf}{RESERVED_TEMP_SUFFIX}");
        let digest = stage_and_install(
            parent.handle(),
            &temporary,
            leaf,
            decoded,
            expected_size,
            executable,
            deadline,
        )?;
        if digest != expected_sha256 {
            return Err(MaterializeError::ArchiveGrammar(format!(
                "decoded bytes for {path} disagree with the preflight digest"
            )));
        }
        synchronize_directory(parent.handle())?;
        Ok(())
    }

    /// Bottom-up final synchronization of every derived directory, the
    /// generation root, and the retained generations parent, then close the
    /// materialization window and revalidate retained authority.
    pub(super) fn finish(self) -> Result<(), MaterializeError> {
        let Self {
            generation,
            root,
            directories,
        } = self;
        let mut ordered: Vec<&Vec<String>> = directories.iter().collect();
        ordered.sort_by_key(|segments| std::cmp::Reverse(segments.len()));
        for segments in ordered {
            let mut parent = ParentDir::Root(&root);
            for segment in segments {
                parent = ParentDir::Owned(open_child_directory(parent.handle(), segment)?);
            }
            synchronize_directory(parent.handle())?;
        }
        synchronize_directory(&root)?;
        drop(root);
        generation
            .end_materialization()
            .map_err(MaterializeError::Generation)?;
        generation
            .synchronize_generations_parent()
            .map_err(MaterializeError::Generation)?;
        Ok(())
    }
}

fn ensure_directories<'a>(
    root: &'a DirHandle,
    parents: &[&str],
) -> Result<ParentDir<'a>, MaterializeError> {
    let mut current = ParentDir::Root(root);
    for segment in parents {
        let next = match open_child_directory(current.handle(), segment) {
            Ok(directory) => directory,
            Err(MaterializeError::Io { source, .. })
                if source.kind() == std::io::ErrorKind::NotFound =>
            {
                create_child_directory(current.handle(), segment)?
            }
            Err(error) => return Err(error),
        };
        current = ParentDir::Owned(next);
    }
    Ok(current)
}

// ---------------------------------------------------------------------------
// Unix platform surface: descriptor-relative, no-follow throughout.
// ---------------------------------------------------------------------------

#[cfg(unix)]
fn open_child_directory(parent: &DirHandle, segment: &str) -> Result<DirHandle, MaterializeError> {
    rustix::fs::openat(
        parent,
        segment,
        rustix::fs::OFlags::RDONLY
            | rustix::fs::OFlags::DIRECTORY
            | rustix::fs::OFlags::NOFOLLOW
            | rustix::fs::OFlags::CLOEXEC,
        rustix::fs::Mode::empty(),
    )
    .map_err(|error| MaterializeError::io("directory open", error.into()))
}

#[cfg(unix)]
fn create_child_directory(
    parent: &DirHandle,
    segment: &str,
) -> Result<DirHandle, MaterializeError> {
    rustix::fs::mkdirat(
        parent,
        segment,
        rustix::fs::Mode::RUSR | rustix::fs::Mode::WUSR | rustix::fs::Mode::XUSR,
    )
    .map_err(|error| MaterializeError::io("directory create", error.into()))?;
    open_child_directory(parent, segment)
}

#[cfg(unix)]
fn synchronize_directory(directory: &DirHandle) -> Result<(), MaterializeError> {
    rustix::fs::fsync(directory)
        .map_err(|error| MaterializeError::io("directory synchronize", error.into()))
}

#[cfg(unix)]
fn stage_and_install(
    parent: &DirHandle,
    temporary: &str,
    leaf: &str,
    decoded: &mut dyn Read,
    expected_size: u64,
    executable: bool,
    deadline: Instant,
) -> Result<String, MaterializeError> {
    use std::os::unix::fs::MetadataExt as _;

    let fd = rustix::fs::openat(
        parent,
        temporary,
        rustix::fs::OFlags::CREATE
            | rustix::fs::OFlags::EXCL
            | rustix::fs::OFlags::RDWR
            | rustix::fs::OFlags::NOFOLLOW
            | rustix::fs::OFlags::CLOEXEC,
        rustix::fs::Mode::RUSR | rustix::fs::Mode::WUSR,
    )
    .map_err(|error| MaterializeError::io("temporary create", error.into()))?;
    let mut file = std::fs::File::from(fd);
    let digest = copy_counted(decoded, &mut file, expected_size, deadline)?;
    file.sync_all()
        .map_err(|error| MaterializeError::io("temporary synchronize", error))?;
    // Same-handle revalidation: still the regular single-link object of the
    // exact counted size.
    let metadata = file
        .metadata()
        .map_err(|error| MaterializeError::io("temporary revalidate", error))?;
    if !metadata.is_file() || metadata.nlink() != 1 || metadata.len() != expected_size {
        return Err(MaterializeError::ArchiveGrammar(
            "temporary entry revalidation failed".to_string(),
        ));
    }
    let mode = if executable { 0o755 } else { 0o644 };
    rustix::fs::fchmod(&file, rustix::fs::Mode::from_raw_mode(mode))
        .map_err(|error| MaterializeError::io("admitted mode apply", error.into()))?;
    file.sync_all()
        .map_err(|error| MaterializeError::io("temporary mode synchronize", error))?;

    #[cfg(target_os = "linux")]
    rustix::fs::renameat_with(
        parent,
        temporary,
        parent,
        leaf,
        rustix::fs::RenameFlags::NOREPLACE,
    )
    .map_err(|error| MaterializeError::io("no-replace install", error.into()))?;
    #[cfg(not(target_os = "linux"))]
    {
        // No kernel no-replace rename here: refuse an occupant first, then
        // rename under the retained parent. The single-writer transaction and
        // the complete post-materialization verification bound the residual
        // window; the certified Linux targets take the kernel path above.
        match rustix::fs::statat(parent, leaf, rustix::fs::AtFlags::SYMLINK_NOFOLLOW) {
            Err(error) if error == rustix::io::Errno::NOENT => {}
            Ok(_) => {
                return Err(MaterializeError::ArchiveGrammar(
                    "final entry name is already occupied".to_string(),
                ));
            }
            Err(error) => {
                return Err(MaterializeError::io("occupancy probe", error.into()));
            }
        }
        rustix::fs::renameat(parent, temporary, parent, leaf)
            .map_err(|error| MaterializeError::io("no-replace install", error.into()))?;
    }
    Ok(digest)
}

// ---------------------------------------------------------------------------
// Windows platform surface: the fenced child-file primitives on the
// write-shared, delete-denied materialization lease.
// ---------------------------------------------------------------------------

#[cfg(windows)]
fn open_child_directory(parent: &DirHandle, segment: &str) -> Result<DirHandle, MaterializeError> {
    parent
        .open_child_directory(std::ffi::OsStr::new(segment))
        .map_err(|error| MaterializeError::Io {
            stage: "directory open",
            source: error,
        })
}

#[cfg(windows)]
fn create_child_directory(
    parent: &DirHandle,
    segment: &str,
) -> Result<DirHandle, MaterializeError> {
    parent
        .create_child_directory(std::ffi::OsStr::new(segment))
        .map_err(|error| MaterializeError::io("directory create", error))
}

#[cfg(windows)]
fn synchronize_directory(_directory: &DirHandle) -> Result<(), MaterializeError> {
    // Windows exposes no directory synchronization under these leases; the
    // write-through file installs plus the complete post-materialization
    // verification carry ordering, and production Windows activation remains
    // gated (windows-private-file-authority D6).
    Ok(())
}

#[cfg(windows)]
fn stage_and_install(
    parent: &DirHandle,
    temporary: &str,
    leaf: &str,
    decoded: &mut dyn Read,
    expected_size: u64,
    _executable: bool,
    deadline: Instant,
) -> Result<String, MaterializeError> {
    let mut file = parent
        .create_child_regular_file(std::ffi::OsStr::new(temporary))
        .map_err(|error| MaterializeError::io("temporary create", error))?;
    let digest = copy_counted(decoded, file.file_mut(), expected_size, deadline)?;
    file.file_mut()
        .sync_all()
        .map_err(|error| MaterializeError::io("temporary synchronize", error))?;
    // Same-handle revalidation: still the single-link object of the exact
    // counted size. Release modes are Unix policy; Windows object policy is
    // the DACL, rechecked by the generation verifier.
    let size = file
        .file()
        .metadata()
        .map_err(|error| MaterializeError::io("temporary revalidate", error))?
        .len();
    let link_count = file
        .link_count()
        .map_err(|error| MaterializeError::io("temporary revalidate", error))?;
    if size != expected_size || link_count != 1 {
        return Err(MaterializeError::ArchiveGrammar(
            "temporary entry revalidation failed".to_string(),
        ));
    }
    parent
        .install_child_file_no_replace(&file, std::ffi::OsStr::new(leaf))
        .map_err(|error| MaterializeError::io("no-replace install", error))?;
    Ok(digest)
}

fn copy_counted(
    decoded: &mut dyn Read,
    output: &mut (impl std::io::Write + ?Sized),
    expected_size: u64,
    deadline: Instant,
) -> Result<String, MaterializeError> {
    let mut hasher = Sha256::new();
    let mut produced = 0u64;
    let mut chunk = [0u8; 64 * 1024];
    loop {
        if Instant::now() >= deadline {
            return Err(MaterializeError::Deadline);
        }
        let read = decoded
            .read(&mut chunk)
            .map_err(|error| MaterializeError::io("entry decode", error))?;
        if read == 0 {
            break;
        }
        produced += read as u64;
        if produced > expected_size {
            return Err(MaterializeError::ArchiveGrammar(
                "decoded bytes exceed the declared size".to_string(),
            ));
        }
        hasher.update(&chunk[..read]);
        output
            .write_all(&chunk[..read])
            .map_err(|error| MaterializeError::io("entry write", error))?;
    }
    if produced != expected_size {
        return Err(MaterializeError::ArchiveGrammar(
            "decoded bytes fall short of the declared size".to_string(),
        ));
    }
    Ok(hex::encode(&hasher.finalize()))
}
