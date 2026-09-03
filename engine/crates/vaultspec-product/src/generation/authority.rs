//! Platform directory-authority primitives for the retained generation
//! authority: exact retained directory handles, creation-time identity
//! snapshots, and the Windows owner-private DACL predicate.
//!
//! This submodule carries no generation-lifecycle semantics. The parent module
//! owns binding, creation, discard, and the receipt join; everything here is
//! the descriptor-level mechanism those flows retain and revalidate.

use std::ffi::OsStr;
use std::path::Path;

use super::GenerationError;

/// The permission bits of a raw `mode_t`, widened to one width.
///
/// `mode_t` is `u16` on Darwin and `u32` on Linux, so masking it straight into a
/// `u32` field compiles on one and not the other — both macOS release legs failed
/// to build on exactly that. The conversion is a widening on Darwin and the
/// identity on Linux, which is why the lint is allowed HERE and nowhere else:
/// this function exists to hold that platform divergence in one named place
/// rather than scatter casts. `from` rather than `as` on purpose — a cast would
/// keep compiling and silently truncate if a target's width ever changed.
#[cfg(unix)]
#[allow(clippy::useless_conversion)]
fn permission_bits(mode: rustix::fs::RawMode) -> u32 {
    u32::from(mode) & 0o777
}

#[cfg(unix)]
pub(super) fn creation_stage(
    stage: &'static str,
    error: impl std::fmt::Display,
) -> GenerationError {
    GenerationError::CreationStage {
        stage,
        error: error.to_string(),
    }
}

#[cfg(unix)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct DirectoryIdentity {
    device: u64,
    inode: u64,
}

#[cfg(unix)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct UnixCreatedName {
    identity: DirectoryIdentity,
    is_directory: bool,
    owner: u32,
    mode: u32,
}

#[cfg(unix)]
#[derive(Debug)]
pub(super) struct UnixUnretainedCreation {
    pub(super) creation: GenerationError,
}

#[cfg(unix)]
#[derive(Debug)]
pub(super) enum UnixChildCreation {
    Retained(DirectoryAuthority),
    Unretained(UnixUnretainedCreation),
}

#[cfg(windows)]
pub(super) type DirectoryIdentity = vaultspec_windows_authority::HighResFileId;

#[cfg(unix)]
#[derive(Debug)]
pub(super) struct DirectoryAuthority {
    pub(super) directory: rustix::fd::OwnedFd,
    pub(super) identity: DirectoryIdentity,
}

#[cfg(unix)]
impl DirectoryAuthority {
    pub(super) fn open_root(path: &Path) -> std::io::Result<Self> {
        let directory = rustix::fs::openat(
            rustix::fs::CWD,
            path,
            rustix::fs::OFlags::RDONLY
                | rustix::fs::OFlags::DIRECTORY
                | rustix::fs::OFlags::NOFOLLOW
                | rustix::fs::OFlags::CLOEXEC,
            rustix::fs::Mode::empty(),
        )?;
        Self::from_directory(directory)
    }

    pub(super) fn open_child(&self, name: &OsStr) -> std::io::Result<Self> {
        let directory = rustix::fs::openat(
            &self.directory,
            name,
            rustix::fs::OFlags::RDONLY
                | rustix::fs::OFlags::DIRECTORY
                | rustix::fs::OFlags::NOFOLLOW
                | rustix::fs::OFlags::CLOEXEC,
            rustix::fs::Mode::empty(),
        )?;
        Self::from_directory(directory)
    }

    pub(super) fn create_child(
        &self,
        name: &OsStr,
        path: &Path,
    ) -> std::io::Result<UnixChildCreation> {
        rustix::fs::mkdirat(
            &self.directory,
            name,
            rustix::fs::Mode::RUSR | rustix::fs::Mode::WUSR | rustix::fs::Mode::XUSR,
        )?;
        let created_name = match self.inspect_created_name(name) {
            Ok(created_name) => created_name,
            Err(error) => {
                return Ok(UnixChildCreation::Unretained(UnixUnretainedCreation {
                    creation: error,
                }));
            }
        };
        if !created_name.is_directory
            || created_name.owner != nix::unistd::Uid::effective().as_raw()
            || created_name.mode != 0o700
        {
            return Ok(UnixChildCreation::Unretained(UnixUnretainedCreation {
                creation: creation_stage(
                    "post-mkdir no-follow snapshot establishment",
                    format!(
                        "created filesystem object is not an owner-private directory at {path:?}"
                    ),
                ),
            }));
        }
        match self.open_child(name) {
            Ok(authority) => match authority.current_snapshot() {
                Ok(opened) if opened == created_name => Ok(UnixChildCreation::Retained(authority)),
                Ok(_) => Ok(UnixChildCreation::Unretained(UnixUnretainedCreation {
                    creation: creation_stage(
                        "post-mkdir no-follow open/fstat",
                        "opened directory snapshot differs from the captured created name",
                    ),
                })),
                Err(error) => Ok(UnixChildCreation::Unretained(UnixUnretainedCreation {
                    creation: creation_stage("post-mkdir retained-fd fstat", error),
                })),
            },
            Err(error) => Ok(UnixChildCreation::Unretained(UnixUnretainedCreation {
                creation: creation_stage("post-mkdir no-follow open", error),
            })),
        }
    }

    fn inspect_created_name(&self, name: &OsStr) -> Result<UnixCreatedName, GenerationError> {
        let stat = rustix::fs::statat(&self.directory, name, rustix::fs::AtFlags::SYMLINK_NOFOLLOW)
            .map_err(|error| {
                creation_stage("post-mkdir no-follow snapshot establishment", error)
            })?;
        Ok(UnixCreatedName {
            identity: DirectoryIdentity {
                device: stat.st_dev as u64,
                inode: stat.st_ino as u64,
            },
            is_directory: rustix::fs::FileType::from_raw_mode(stat.st_mode)
                == rustix::fs::FileType::Directory,
            owner: stat.st_uid,
            mode: permission_bits(stat.st_mode),
        })
    }

    fn from_directory(directory: rustix::fd::OwnedFd) -> std::io::Result<Self> {
        let stat = rustix::fs::fstat(&directory)?;
        if rustix::fs::FileType::from_raw_mode(stat.st_mode) != rustix::fs::FileType::Directory {
            return Err(std::io::Error::other(
                "generation authority handle is not a directory",
            ));
        }
        Ok(Self {
            identity: DirectoryIdentity {
                device: stat.st_dev as u64,
                inode: stat.st_ino as u64,
            },
            directory,
        })
    }

    fn current_snapshot(&self) -> std::io::Result<UnixCreatedName> {
        let stat = rustix::fs::fstat(&self.directory)?;
        Ok(UnixCreatedName {
            identity: DirectoryIdentity {
                device: stat.st_dev as u64,
                inode: stat.st_ino as u64,
            },
            is_directory: rustix::fs::FileType::from_raw_mode(stat.st_mode)
                == rustix::fs::FileType::Directory,
            owner: stat.st_uid,
            mode: permission_bits(stat.st_mode),
        })
    }

    pub(super) fn fd(&self) -> &rustix::fd::OwnedFd {
        &self.directory
    }

    pub(super) fn identity(&self) -> DirectoryIdentity {
        self.identity
    }

    pub(super) fn validate_parent(&self, path: &Path) -> Result<(), GenerationError> {
        let stat = rustix::fs::fstat(&self.directory)?;
        if rustix::fs::FileType::from_raw_mode(stat.st_mode) != rustix::fs::FileType::Directory
            || self.identity
                != (DirectoryIdentity {
                    device: stat.st_dev as u64,
                    inode: stat.st_ino as u64,
                })
        {
            return Err(GenerationError::ParentIdentityChanged);
        }
        if stat.st_uid != nix::unistd::Uid::effective().as_raw() || stat.st_mode & 0o022 != 0 {
            return Err(GenerationError::UnsafeFilesystemObject(path.to_path_buf()));
        }
        Ok(())
    }

    pub(super) fn validate_created(
        &self,
        parent: &Self,
        name: &OsStr,
        path: &Path,
    ) -> Result<(), GenerationError> {
        let held = rustix::fs::fstat(&self.directory)?;
        let named = rustix::fs::statat(
            &parent.directory,
            name,
            rustix::fs::AtFlags::SYMLINK_NOFOLLOW,
        )?;
        let held_identity = DirectoryIdentity {
            device: held.st_dev as u64,
            inode: held.st_ino as u64,
        };
        let named_identity = DirectoryIdentity {
            device: named.st_dev as u64,
            inode: named.st_ino as u64,
        };
        if rustix::fs::FileType::from_raw_mode(held.st_mode) != rustix::fs::FileType::Directory
            || rustix::fs::FileType::from_raw_mode(named.st_mode) != rustix::fs::FileType::Directory
            || held_identity != self.identity
            || named_identity != self.identity
        {
            return Err(GenerationError::IdentityChanged(
                name.to_string_lossy().into_owned(),
            ));
        }
        if held.st_uid != nix::unistd::Uid::effective().as_raw()
            || named.st_uid != nix::unistd::Uid::effective().as_raw()
            || held.st_mode & 0o777 != 0o700
            || named.st_mode & 0o777 != 0o700
        {
            return Err(GenerationError::UnsafeFilesystemObject(path.to_path_buf()));
        }
        Ok(())
    }

    pub(super) fn remove_empty(
        self,
        parent: &Self,
        name: &OsStr,
    ) -> Result<(), Box<(Self, GenerationError)>> {
        let named = match rustix::fs::statat(
            &parent.directory,
            name,
            rustix::fs::AtFlags::SYMLINK_NOFOLLOW,
        ) {
            Ok(named) => named,
            Err(error) => return Err(Box::new((self, GenerationError::Io(error.into())))),
        };
        let named_identity = DirectoryIdentity {
            device: named.st_dev as u64,
            inode: named.st_ino as u64,
        };
        if rustix::fs::FileType::from_raw_mode(named.st_mode) != rustix::fs::FileType::Directory
            || named_identity != self.identity
        {
            return Err(Box::new((
                self,
                GenerationError::IdentityChanged(name.to_string_lossy().into_owned()),
            )));
        }
        match rustix::fs::unlinkat(&parent.directory, name, rustix::fs::AtFlags::REMOVEDIR) {
            Ok(()) => Ok(()),
            Err(error) => Err(Box::new((self, GenerationError::Io(error.into())))),
        }
    }
}

#[cfg(windows)]
#[derive(Debug)]
pub(super) struct DirectoryAuthority {
    pub(super) directory: vaultspec_windows_authority::AuthorityDirectory,
    pub(super) identity: DirectoryIdentity,
}

#[cfg(windows)]
impl DirectoryAuthority {
    pub(super) fn open_root(path: &Path) -> std::io::Result<Self> {
        Self::from_directory(
            vaultspec_windows_authority::AuthorityDirectory::open_existing_root(path)?,
        )
    }

    pub(super) fn open_child(&self, name: &OsStr) -> std::io::Result<Self> {
        Self::from_directory(self.directory.open_child_directory(name)?)
    }

    pub(super) fn create_child(&self, name: &OsStr, _path: &Path) -> std::io::Result<Self> {
        Self::from_directory(self.directory.create_child_directory(name)?)
    }

    fn from_directory(
        directory: vaultspec_windows_authority::AuthorityDirectory,
    ) -> std::io::Result<Self> {
        let identity = directory.identity();
        Ok(Self {
            directory,
            identity,
        })
    }

    pub(super) fn from_retained(
        directory: vaultspec_windows_authority::AuthorityDirectory,
    ) -> Self {
        let identity = directory.identity();
        Self {
            directory,
            identity,
        }
    }

    pub(super) fn identity(&self) -> DirectoryIdentity {
        self.identity
    }

    pub(super) fn validate_parent(&self, path: &Path) -> Result<(), GenerationError> {
        if !windows_directory_dacl_is_restricted(path) {
            return Err(GenerationError::UnsafeFilesystemObject(path.to_path_buf()));
        }
        Ok(())
    }

    pub(super) fn validate_created(
        &self,
        _parent: &Self,
        _name: &OsStr,
        path: &Path,
    ) -> Result<(), GenerationError> {
        if !windows_directory_dacl_is_restricted(path) {
            return Err(GenerationError::UnsafeFilesystemObject(path.to_path_buf()));
        }
        Ok(())
    }

    pub(super) fn remove_empty(
        self,
        _parent: &Self,
        _name: &OsStr,
    ) -> Result<(), Box<(Self, GenerationError)>> {
        let Self {
            directory,
            identity,
        } = self;
        match directory.remove_empty() {
            Ok(()) => Ok(()),
            Err(error) => {
                let (directory, source) = error.into_parts();
                Err(Box::new((
                    Self {
                        directory,
                        identity,
                    },
                    GenerationError::Io(source),
                )))
            }
        }
    }
}

#[cfg(windows)]
pub(super) fn windows_directory_dacl_is_restricted(path: &Path) -> bool {
    use std::os::windows::fs::MetadataExt;
    use vaultspec_windows_authority::{
        ReadOnlyAuthorityDirectory, current_user_sid, private_policy,
    };

    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
    let Ok(metadata) = std::fs::symlink_metadata(path) else {
        return false;
    };
    if !metadata.is_dir()
        || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
        || metadata.file_type().is_symlink()
    {
        return false;
    }
    // Fail closed on every step, as the whole predicate does: an undetermined
    // principal is "cannot prove restricted", never "does not match".
    let Ok(user_sid) = current_user_sid() else {
        return false;
    };
    // Observe the directory object's DACL through one read-only snapshot; the
    // observation authority also refuses files and reparse points fail-closed.
    let Ok(observation) = ReadOnlyAuthorityDirectory::open_observation(path) else {
        return false;
    };
    let Ok(snapshot) = observation.dacl_snapshot() else {
        return false;
    };
    private_policy::validate_no_outside_principal(&snapshot, &user_sid).is_ok()
}
