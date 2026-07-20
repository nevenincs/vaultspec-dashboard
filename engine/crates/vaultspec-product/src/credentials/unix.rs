use std::ffi::OsStr;
use std::io::{Read as _, Seek as _, Write as _};
use std::os::fd::OwnedFd;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::TOKEN_BYTES;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileIdentity {
    pub device: u64,
    pub inode: u64,
}

#[derive(Debug)]
pub struct RetainedCredentialFile {
    file: std::fs::File,
    identity: FileIdentity,
}

#[derive(Debug)]
pub struct RetainedCredentialDirectory {
    root: std::fs::File,
    app_home: OwnedFd,
    directory: OwnedFd,
    root_path: PathBuf,
    path: PathBuf,
    root_identity: FileIdentity,
    app_home_identity: FileIdentity,
    identity: FileIdentity,
}

impl RetainedCredentialDirectory {
    pub fn path(&self) -> &Path {
        &self.path
    }

    fn revalidate(&self) -> std::io::Result<()> {
        validate_root_path(&self.root, &self.root_path, self.root_identity)?;
        validate_directory_relationship(
            &self.root,
            OsStr::new("app-home"),
            &self.app_home,
            self.app_home_identity,
        )?;
        validate_directory_relationship(
            &self.app_home,
            OsStr::new("credentials"),
            &self.directory,
            self.identity,
        )?;
        validate_directory(&self.directory)?;
        Ok(())
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
        directory: OwnedFd,
        name: String,
    },
    ParentSyncPending {
        directory: OwnedFd,
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
        let directory = open_directory(directory_path)?;
        validate_directory(&directory)?;
        validate_named(&directory, OsStr::new(name), &file)?;
        Ok(Self {
            state: RetirementState::Named {
                file,
                directory,
                name: name.to_owned(),
            },
        })
    }

    pub fn named_file_mut(&mut self) -> Option<&mut RetainedCredentialFile> {
        match &mut self.state {
            RetirementState::Named { file, .. } => Some(file),
            RetirementState::ParentSyncPending { .. } => None,
        }
    }

    pub fn retry(self) -> Result<(), RetirementFailure> {
        let parent_sync = match self.state {
            RetirementState::Named {
                file,
                directory,
                name,
            } => {
                if let Err(source) = validate_directory(&directory)
                    .and_then(|()| validate_named(&directory, OsStr::new(&name), &file))
                    .and_then(|()| {
                        rustix::fs::unlinkat(
                            &directory,
                            name.as_str(),
                            rustix::fs::AtFlags::empty(),
                        )
                        .map_err(std::io::Error::from)
                    })
                {
                    return Err(RetirementFailure {
                        authority: Self {
                            state: RetirementState::Named {
                                file,
                                directory,
                                name,
                            },
                        },
                        phase: RetirementPhase::Named,
                        source,
                    });
                }
                Self {
                    state: RetirementState::ParentSyncPending { directory },
                }
            }
            RetirementState::ParentSyncPending { directory } => Self {
                state: RetirementState::ParentSyncPending { directory },
            },
        };
        let RetirementState::ParentSyncPending { directory } = &parent_sync.state else {
            unreachable!("retirement state normalized to parent sync")
        };
        if let Err(source) = rustix::fs::fsync(directory).map_err(std::io::Error::from) {
            return Err(RetirementFailure {
                authority: parent_sync,
                phase: RetirementPhase::ParentSyncPending,
                source,
            });
        }
        Ok(())
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
        self.file.rewind()?;
        self.file.set_len(0)?;
        self.file.write_all(bytes)?;
        self.file.sync_all()?;
        if bounded_read(&mut self.file, maximum)? != bytes {
            return Err(std::io::Error::other(
                "private file same-handle reread differs",
            ));
        }
        Ok(())
    }
}

pub fn revalidate_named(
    directory: &RetainedCredentialDirectory,
    name: &OsStr,
    retained: &RetainedCredentialFile,
    expected: &[u8],
) -> std::io::Result<()> {
    directory.revalidate()?;
    validate_named(&directory.directory, name, retained)?;
    let mut reader = retained.file.try_clone()?;
    if bounded_read(&mut reader, expected.len())? != expected {
        return Err(std::io::Error::other(
            "credential retained bytes differ from verified authority",
        ));
    }
    validate_named(&directory.directory, name, retained)
}

pub fn retain_product_root(path: &Path) -> std::io::Result<std::fs::File> {
    let root = std::fs::File::from(open_directory(path)?);
    let identity = directory_identity(&root)?;
    validate_root_path(&root, path, identity)?;
    Ok(root)
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
    name: &OsStr,
) -> std::io::Result<bool> {
    directory.revalidate()?;
    match rustix::fs::statat(
        &directory.directory,
        name,
        rustix::fs::AtFlags::SYMLINK_NOFOLLOW,
    ) {
        Ok(_) => Ok(true),
        Err(rustix::io::Errno::NOENT) => Ok(false),
        Err(error) => Err(error.into()),
    }
}

pub fn create_in(
    directory: &RetainedCredentialDirectory,
    name: &str,
    bytes: &[u8],
) -> std::io::Result<RetainedCredentialFile> {
    directory.revalidate()?;
    let descriptor = rustix::fs::openat(
        &directory.directory,
        name,
        rustix::fs::OFlags::CREATE
            | rustix::fs::OFlags::EXCL
            | rustix::fs::OFlags::NOFOLLOW
            | rustix::fs::OFlags::CLOEXEC
            | rustix::fs::OFlags::RDWR,
        rustix::fs::Mode::RUSR | rustix::fs::Mode::WUSR,
    )?;
    rustix::fs::fchmod(&descriptor, rustix::fs::Mode::RUSR | rustix::fs::Mode::WUSR)?;
    let mut retained = retained_from_fd(descriptor)?;
    validate_named(&directory.directory, OsStr::new(name), &retained)?;
    retained.file.write_all(bytes)?;
    retained.file.sync_all()?;
    rustix::fs::fsync(&directory.directory)?;
    directory.revalidate()?;
    validate_named(&directory.directory, OsStr::new(name), &retained)?;
    let reread = bounded_read(&mut retained.file, bytes.len())?;
    if reread != bytes {
        return Err(std::io::Error::other(
            "credential same-handle reread differs from written bytes",
        ));
    }
    Ok(retained)
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

pub fn open_private(
    path: &Path,
    maximum: usize,
) -> std::io::Result<(RetainedCredentialFile, Vec<u8>)> {
    let parent_path = path
        .parent()
        .ok_or_else(|| std::io::Error::other("credential path has no parent"))?;
    let name = path
        .file_name()
        .ok_or_else(|| std::io::Error::other("credential path has no file name"))?;
    let directory = open_directory(parent_path)?;
    validate_directory(&directory)?;
    let descriptor = rustix::fs::openat(
        &directory,
        name,
        rustix::fs::OFlags::RDONLY | rustix::fs::OFlags::NOFOLLOW | rustix::fs::OFlags::CLOEXEC,
        rustix::fs::Mode::empty(),
    )?;
    let mut retained = retained_from_fd(descriptor)?;
    validate_named(&directory, name, &retained)?;
    let bytes = bounded_read(&mut retained.file, maximum)?;
    validate_named(&directory, name, &retained)?;
    Ok((retained, bytes))
}

pub fn open_private_in(
    directory: &RetainedCredentialDirectory,
    name: &OsStr,
    maximum: usize,
) -> std::io::Result<(RetainedCredentialFile, Vec<u8>)> {
    directory.revalidate()?;
    let descriptor = rustix::fs::openat(
        &directory.directory,
        name,
        rustix::fs::OFlags::RDONLY | rustix::fs::OFlags::NOFOLLOW | rustix::fs::OFlags::CLOEXEC,
        rustix::fs::Mode::empty(),
    )?;
    let mut retained = retained_from_fd(descriptor)?;
    validate_named(&directory.directory, name, &retained)?;
    let bytes = bounded_read(&mut retained.file, maximum)?;
    directory.revalidate()?;
    validate_named(&directory.directory, name, &retained)?;
    Ok((retained, bytes))
}

pub fn restrict_existing(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt as _;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
}

fn directory_authority(
    root: std::fs::File,
    root_path: &Path,
    create_credentials: bool,
) -> std::io::Result<RetainedCredentialDirectory> {
    let root_identity = directory_identity(&root)?;
    validate_root_path(&root, root_path, root_identity)?;
    let app_home = open_child_directory(&root, OsStr::new("app-home"))?;
    let app_home_identity = directory_identity(&app_home)?;
    validate_directory_relationship(&root, OsStr::new("app-home"), &app_home, app_home_identity)?;
    let directory = match open_child_directory(&app_home, OsStr::new("credentials")) {
        Ok(directory) => directory,
        Err(error) if create_credentials && error.kind() == std::io::ErrorKind::NotFound => {
            rustix::fs::mkdirat(
                &app_home,
                "credentials",
                rustix::fs::Mode::RUSR | rustix::fs::Mode::WUSR | rustix::fs::Mode::XUSR,
            )
            .map_err(std::io::Error::from)?;
            rustix::fs::fsync(&app_home).map_err(std::io::Error::from)?;
            open_child_directory(&app_home, OsStr::new("credentials"))?
        }
        Err(error) => return Err(error),
    };
    if create_credentials {
        rustix::fs::fchmod(
            &directory,
            rustix::fs::Mode::RUSR | rustix::fs::Mode::WUSR | rustix::fs::Mode::XUSR,
        )?;
    }
    validate_directory(&directory)?;
    let identity = directory_identity(&directory)?;
    let authority = RetainedCredentialDirectory {
        root,
        app_home,
        directory,
        root_path: root_path.to_path_buf(),
        path: root_path.join("app-home").join("credentials"),
        root_identity,
        app_home_identity,
        identity,
    };
    authority.revalidate()?;
    Ok(authority)
}

fn open_directory(path: &Path) -> std::io::Result<OwnedFd> {
    Ok(rustix::fs::openat(
        rustix::fs::CWD,
        path,
        rustix::fs::OFlags::RDONLY
            | rustix::fs::OFlags::DIRECTORY
            | rustix::fs::OFlags::NOFOLLOW
            | rustix::fs::OFlags::CLOEXEC,
        rustix::fs::Mode::empty(),
    )?)
}

fn open_child_directory(parent: impl std::os::fd::AsFd, name: &OsStr) -> std::io::Result<OwnedFd> {
    rustix::fs::openat(
        parent,
        name,
        rustix::fs::OFlags::RDONLY
            | rustix::fs::OFlags::DIRECTORY
            | rustix::fs::OFlags::NOFOLLOW
            | rustix::fs::OFlags::CLOEXEC,
        rustix::fs::Mode::empty(),
    )
    .map_err(std::io::Error::from)
}

fn validate_root_path(
    retained: &std::fs::File,
    path: &Path,
    expected: FileIdentity,
) -> std::io::Result<()> {
    let current = open_directory(path)?;
    if directory_identity(retained)? != expected || directory_identity(&current)? != expected {
        return Err(std::io::Error::other(
            "product root retained and named identities differ",
        ));
    }
    Ok(())
}

fn validate_directory_relationship(
    parent: impl std::os::fd::AsFd,
    name: &OsStr,
    retained: &OwnedFd,
    expected: FileIdentity,
) -> std::io::Result<()> {
    let named = rustix::fs::statat(parent, name, rustix::fs::AtFlags::SYMLINK_NOFOLLOW)?;
    if rustix::fs::FileType::from_raw_mode(named.st_mode) != rustix::fs::FileType::Directory
        || directory_identity(retained)? != expected
        || (FileIdentity {
            device: named.st_dev as u64,
            inode: named.st_ino as u64,
        }) != expected
    {
        return Err(std::io::Error::other(
            "retained directory child relationship changed",
        ));
    }
    Ok(())
}

fn validate_directory(directory: &OwnedFd) -> std::io::Result<()> {
    let state = rustix::fs::fstat(directory)?;
    if rustix::fs::FileType::from_raw_mode(state.st_mode) != rustix::fs::FileType::Directory
        || state.st_uid != nix::unistd::Uid::effective().as_raw()
        || state.st_mode & 0o777 != 0o700
    {
        return Err(std::io::Error::other(
            "credentials directory is not retained owner mode 0700 authority",
        ));
    }
    Ok(())
}

fn directory_identity(directory: &impl std::os::fd::AsFd) -> std::io::Result<FileIdentity> {
    let state = rustix::fs::fstat(directory)?;
    Ok(FileIdentity {
        device: state.st_dev as u64,
        inode: state.st_ino as u64,
    })
}

fn retained_from_fd(descriptor: OwnedFd) -> std::io::Result<RetainedCredentialFile> {
    let state = rustix::fs::fstat(&descriptor)?;
    validate_file_state(&state)?;
    Ok(RetainedCredentialFile {
        file: std::fs::File::from(descriptor),
        identity: FileIdentity {
            device: state.st_dev as u64,
            inode: state.st_ino as u64,
        },
    })
}

fn validate_named(
    directory: &OwnedFd,
    name: &OsStr,
    retained: &RetainedCredentialFile,
) -> std::io::Result<()> {
    let held = rustix::fs::fstat(&retained.file)?;
    let named = rustix::fs::statat(directory, name, rustix::fs::AtFlags::SYMLINK_NOFOLLOW)?;
    validate_file_state(&held)?;
    validate_file_state(&named)?;
    let held_identity = FileIdentity {
        device: held.st_dev as u64,
        inode: held.st_ino as u64,
    };
    let named_identity = FileIdentity {
        device: named.st_dev as u64,
        inode: named.st_ino as u64,
    };
    if held_identity != retained.identity || named_identity != retained.identity {
        return Err(std::io::Error::other(
            "credential retained and named identities differ",
        ));
    }
    Ok(())
}

fn validate_file_state(state: &rustix::fs::Stat) -> std::io::Result<()> {
    if rustix::fs::FileType::from_raw_mode(state.st_mode) != rustix::fs::FileType::RegularFile
        || state.st_uid != nix::unistd::Uid::effective().as_raw()
        || state.st_mode & 0o777 != 0o600
        || state.st_nlink != 1
    {
        return Err(std::io::Error::other(
            "credential is not an owner mode 0600 single-link regular file",
        ));
    }
    Ok(())
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
