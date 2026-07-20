use super::*;

pub(super) fn acquire_claim(
    parent: &ParentAuthority,
    path: &Path,
    owner: &str,
) -> std::io::Result<Result<ClaimAuthority, LockBusy>> {
    for _ in 0..3 {
        match inspect_claim(parent, path) {
            ClaimInspection::Missing => match publish_claim(parent, path, owner)? {
                PublishClaim::Acquired(authority) => return Ok(Ok(*authority)),
                PublishClaim::Contended => continue,
                PublishClaim::NoSlot => {
                    return Ok(Err(LockBusy {
                        owner: None,
                        pid: None,
                    }));
                }
            },
            ClaimInspection::Valid(snapshot) => {
                if snapshot.record.owner == owner
                    && process_instance_liveness(
                        snapshot.record.pid,
                        snapshot.record.process_start_time,
                    ) == ProcessInstanceLiveness::DeadOrDifferentInstance
                    && recover_stale_claim(parent, path, &snapshot).unwrap_or(false)
                {
                    continue;
                }
                return Ok(Err(LockBusy {
                    owner: Some(snapshot.record.owner),
                    pid: Some(snapshot.record.pid),
                }));
            }
            ClaimInspection::Blocked => {
                return Ok(Err(LockBusy {
                    owner: None,
                    pid: None,
                }));
            }
        }
    }
    Ok(Err(LockBusy {
        owner: None,
        pid: None,
    }))
}

enum PublishClaim {
    Acquired(Box<ClaimAuthority>),
    Contended,
    NoSlot,
}

fn publish_claim(
    parent: &ParentAuthority,
    path: &Path,
    owner: &str,
) -> std::io::Result<PublishClaim> {
    let record = ClaimRecord::new(owner)?;
    let bytes = serde_json::to_vec(&record)
        .map_err(|error| std::io::Error::other(format!("claim serialization failed: {error}")))?;
    if bytes.len() as u64 > MAX_CLAIM_BYTES {
        return Err(std::io::Error::other(
            "installation claim exceeds byte bound",
        ));
    }

    for slot in 0..PREPARED_CLAIM_SLOTS {
        let prepared_path = prepared_claim_path(path, slot)?;
        for _ in 0..2 {
            match create_prepared_file(parent, &prepared_path) {
                Ok(prepared_file) => {
                    let mut prepared_file =
                        PreparedClaimRollback::new(parent, &prepared_path, prepared_file);
                    prepared_file.file_mut()?.file_mut().write_all(&bytes)?;
                    prepared_file.file_mut()?.file_mut().flush()?;
                    prepared_file.file()?.file().sync_all()?;
                    let prepared = read_claim_snapshot(parent, &prepared_path)?;
                    if prepared.record != record
                        || prepared.bytes != bytes
                        || prepared_file.file()?.identity()? != prepared.identity
                    {
                        return Err(std::io::Error::other(
                            "prepared installation claim changed before publication",
                        ));
                    }
                    match link_authority_file(parent, &prepared_path, path) {
                        Ok(()) => {
                            #[cfg(unix)]
                            let (
                                claim_file,
                                fixed,
                                prepared_file,
                                prepared_residue,
                                canonical_path,
                            ) = {
                                let claim_file = match open_claim_authority(parent, path) {
                                    Ok(file) => file,
                                    Err(error) => {
                                        let prepared_cleaned =
                                            prepared_file.try_retract().unwrap_or(false);
                                        drop(prepared_file);
                                        if !prepared_cleaned {
                                            return Err(std::io::Error::other(format!(
                                                "published Unix claim open failed and prepared authority is poisoned: {error}"
                                            )));
                                        }
                                        if !recover_stale_claim(parent, path, &prepared)
                                            .unwrap_or(false)
                                        {
                                            return Err(std::io::Error::other(format!(
                                                "published Unix claim open failed and fixed authority is fail-closed poisoned: {error}"
                                            )));
                                        }
                                        return Err(error);
                                    }
                                };
                                let mut rollback =
                                    FixedClaimRollback::new(parent, path, &prepared, claim_file);
                                let fixed = validate_open_claim(
                                    parent,
                                    rollback.file_mut()?,
                                    path,
                                    &prepared,
                                    &bytes,
                                )?;
                                let canonical_path = canonical_authority_path(parent, path)?;
                                let (prepared_file, prepared_residue) =
                                    match prepared_file.try_retract() {
                                        Ok(true) => (None, None),
                                        Ok(false) | Err(_) => (
                                            Some(prepared_file.into_file()?),
                                            Some(prepared_path.clone()),
                                        ),
                                    };
                                (
                                    rollback.disarm()?,
                                    fixed,
                                    prepared_file,
                                    prepared_residue,
                                    canonical_path,
                                )
                            };
                            #[cfg(windows)]
                            let (
                                claim_file,
                                fixed,
                                prepared_file,
                                prepared_residue,
                                canonical_path,
                            ) = {
                                let (claim_file, fixed, canonical_path) =
                                    bind_windows_published_claim(
                                        parent,
                                        path,
                                        &prepared,
                                        prepared_file,
                                        &bytes,
                                    )?;
                                (claim_file, fixed, None, None, canonical_path)
                            };
                            return Ok(PublishClaim::Acquired(Box::new(ClaimAuthority {
                                canonical_path,
                                file: Some(claim_file),
                                prepared_file,
                                prepared_residue,
                                snapshot: fixed,
                                path: path.to_path_buf(),
                            })));
                        }
                        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                            let _ = prepared_file.try_retract();
                            return Ok(PublishClaim::Contended);
                        }
                        Err(error) => {
                            let _ = prepared_file.try_retract();
                            return Err(error);
                        }
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    if let ClaimInspection::Valid(snapshot) = inspect_claim(parent, &prepared_path)
                        && snapshot.record.owner == owner
                        && process_instance_liveness(
                            snapshot.record.pid,
                            snapshot.record.process_start_time,
                        ) == ProcessInstanceLiveness::DeadOrDifferentInstance
                        && recover_stale_claim(parent, &prepared_path, &snapshot).unwrap_or(false)
                    {
                        continue;
                    }
                    break;
                }
                Err(error) => return Err(error),
            }
        }
    }
    Ok(PublishClaim::NoSlot)
}

struct FixedClaimRollback<'a> {
    parent: &'a ParentAuthority,
    path: PathBuf,
    snapshot: Option<ClaimSnapshot>,
    file: Option<HeldAuthorityFile>,
}

struct PreparedClaimRollback<'a> {
    parent: &'a ParentAuthority,
    path: PathBuf,
    file: Option<HeldAuthorityFile>,
}

impl<'a> PreparedClaimRollback<'a> {
    fn new(parent: &'a ParentAuthority, path: &Path, file: HeldAuthorityFile) -> Self {
        Self {
            parent,
            path: path.to_path_buf(),
            file: Some(file),
        }
    }

    fn file(&self) -> std::io::Result<&HeldAuthorityFile> {
        self.file.as_ref().ok_or_else(|| {
            std::io::Error::other("prepared claim rollback lost its authority handle")
        })
    }

    fn file_mut(&mut self) -> std::io::Result<&mut HeldAuthorityFile> {
        self.file.as_mut().ok_or_else(|| {
            std::io::Error::other("prepared claim rollback lost its authority handle")
        })
    }

    fn try_retract(&mut self) -> std::io::Result<bool> {
        let Some(file) = self.file.as_ref() else {
            return Ok(true);
        };
        if !remove_created_exact(self.parent, &self.path, file)? {
            return Ok(false);
        }
        self.file.take();
        Ok(true)
    }

    #[cfg(unix)]
    fn into_file(mut self) -> std::io::Result<HeldAuthorityFile> {
        self.file.take().ok_or_else(|| {
            std::io::Error::other("prepared claim rollback lost its authority handle")
        })
    }
}

impl Drop for PreparedClaimRollback<'_> {
    fn drop(&mut self) {
        if let Some(file) = self.file.as_ref() {
            match remove_created_exact(self.parent, &self.path, file) {
                Ok(true) => {}
                Ok(false) => bounded_drop_diagnostic(
                    "prepared-claim rollback observed replacement",
                    &"authority identity mismatch",
                ),
                Err(error) => {
                    bounded_drop_diagnostic("prepared-claim rollback failed", &error);
                }
            }
        }
        self.file.take();
    }
}

impl<'a> FixedClaimRollback<'a> {
    fn new(
        parent: &'a ParentAuthority,
        path: &Path,
        snapshot: &ClaimSnapshot,
        file: HeldAuthorityFile,
    ) -> Self {
        Self {
            parent,
            path: path.to_path_buf(),
            snapshot: Some(snapshot.clone()),
            file: Some(file),
        }
    }

    fn file_mut(&mut self) -> std::io::Result<&mut HeldAuthorityFile> {
        self.file
            .as_mut()
            .ok_or_else(|| std::io::Error::other("fixed claim rollback lost its authority handle"))
    }

    fn disarm(&mut self) -> std::io::Result<HeldAuthorityFile> {
        self.snapshot.take();
        self.file
            .take()
            .ok_or_else(|| std::io::Error::other("fixed claim rollback lost its authority handle"))
    }
}

impl Drop for FixedClaimRollback<'_> {
    fn drop(&mut self) {
        if let Some(snapshot) = self.snapshot.take() {
            match retract_exact(self.parent, &self.path, &snapshot, self.file.as_ref()) {
                Ok(true) => {}
                Ok(false) => bounded_drop_diagnostic(
                    "fixed-claim rollback observed replacement",
                    &"authority identity mismatch",
                ),
                Err(error) => bounded_drop_diagnostic("fixed-claim rollback failed", &error),
            }
        }
        self.file.take();
    }
}

pub(super) fn bounded_drop_diagnostic(context: &str, detail: &dyn std::fmt::Display) {
    let diagnostic: String = format!("{context}: {detail}")
        .chars()
        .take(MAX_DROP_DIAGNOSTIC_CHARS)
        .collect();
    eprintln!("vaultspec installation authority drop: {diagnostic}");
}

fn create_prepared_file(
    parent: &ParentAuthority,
    path: &Path,
) -> std::io::Result<HeldAuthorityFile> {
    #[cfg(windows)]
    {
        let _ = parent;
        vaultspec_windows_authority::AuthorityFile::create_prepared(path)
            .map(HeldAuthorityFile::Windows)
    }
    #[cfg(unix)]
    {
        open_unix_authority_file(
            parent,
            path,
            rustix::fs::OFlags::CREATE
                | rustix::fs::OFlags::EXCL
                | rustix::fs::OFlags::RDWR
                | rustix::fs::OFlags::CLOEXEC
                | rustix::fs::OFlags::NOFOLLOW,
            rustix::fs::Mode::RUSR | rustix::fs::Mode::WUSR,
        )
        .map(HeldAuthorityFile::Unix)
    }
}

#[cfg(unix)]
pub(super) fn open_unix_authority_file(
    parent: &ParentAuthority,
    path: &Path,
    flags: rustix::fs::OFlags,
    mode: rustix::fs::Mode,
) -> std::io::Result<File> {
    let name = authority_name(parent, path)?;
    let file = File::from(rustix::fs::openat(&parent.directory, name, flags, mode)?);
    if !file.metadata()?.is_file() {
        return Err(std::io::Error::other(
            "installation authority handle must refer to a regular file",
        ));
    }
    Ok(file)
}

pub(super) fn open_claim_authority(
    parent: &ParentAuthority,
    path: &Path,
) -> std::io::Result<HeldAuthorityFile> {
    #[cfg(windows)]
    {
        let _ = parent;
        vaultspec_windows_authority::AuthorityFile::open_claim(path).map(HeldAuthorityFile::Windows)
    }
    #[cfg(unix)]
    {
        open_unix_authority_file(
            parent,
            path,
            rustix::fs::OFlags::RDONLY | rustix::fs::OFlags::CLOEXEC | rustix::fs::OFlags::NOFOLLOW,
            rustix::fs::Mode::empty(),
        )
        .map(HeldAuthorityFile::Unix)
    }
}

#[cfg(windows)]
fn open_shared_claim_authority(path: &Path) -> std::io::Result<HeldAuthorityFile> {
    vaultspec_windows_authority::AuthorityFile::open_claim_shared_delete(path)
        .map(HeldAuthorityFile::Windows)
}

fn validate_open_claim(
    parent: &ParentAuthority,
    file: &mut HeldAuthorityFile,
    path: &Path,
    expected: &ClaimSnapshot,
    bytes: &[u8],
) -> std::io::Result<ClaimSnapshot> {
    let fixed = read_claim_snapshot(parent, path)?;
    if fixed != *expected || file.identity()? != fixed.identity {
        return Err(std::io::Error::other(
            "fixed installation claim identity disagrees with prepared claim",
        ));
    }
    let opened_bytes = read_bounded(file.file_mut())?;
    file.file_mut().seek(SeekFrom::Start(0))?;
    if opened_bytes != bytes || read_claim_snapshot(parent, path)? != fixed {
        return Err(std::io::Error::other(
            "fixed installation claim changed while being opened",
        ));
    }
    Ok(fixed)
}

#[cfg(windows)]
fn bind_windows_published_claim(
    parent: &ParentAuthority,
    path: &Path,
    prepared: &ClaimSnapshot,
    mut prepared_file: PreparedClaimRollback,
    bytes: &[u8],
) -> std::io::Result<(HeldAuthorityFile, ClaimSnapshot, PathBuf)> {
    // Publication starts with both exact hard-link names sharing delete access.
    // The fixed-name handle supplies rollback authority while the prepared name
    // is marked delete-pending through its own retained handle and closed.
    let shared_file = match open_shared_claim_authority(path) {
        Ok(file) => file,
        Err(error) => {
            let prepared_cleaned = prepared_file.try_retract().unwrap_or(false);
            drop(prepared_file);
            if !prepared_cleaned {
                return Err(std::io::Error::other(format!(
                    "published claim transition open failed and prepared authority is poisoned: {error}"
                )));
            }
            let cleaned = recover_stale_claim(parent, path, prepared).unwrap_or(false);
            if !cleaned {
                return Err(std::io::Error::other(format!(
                    "published claim transition open failed and fixed authority is fail-closed poisoned: {error}"
                )));
            }
            return Err(error);
        }
    };
    let mut shared_rollback = FixedClaimRollback::new(parent, path, prepared, shared_file);
    let fixed = validate_open_claim(parent, shared_rollback.file_mut()?, path, prepared, bytes)?;
    if !prepared_file.try_retract()? {
        return Err(std::io::Error::other(
            "prepared installation claim could not be retracted exactly",
        ));
    }
    drop(prepared_file);

    // The read-only bridge shares delete access while the transition handle is
    // closed. The final handle then denies delete sharing for the entire guard
    // lifetime, preventing rename/replacement of the fixed authority name.
    let mut bridge = open_snapshot_reader(parent, path)?;
    validate_open_claim(parent, &mut bridge, path, &fixed, bytes)?;
    drop(shared_rollback.disarm()?);

    let final_file = match open_claim_authority(parent, path) {
        Ok(file) => file,
        Err(error) => {
            let cleaned = recover_stale_claim(parent, path, &fixed).unwrap_or(false);
            drop(bridge);
            if !cleaned {
                return Err(std::io::Error::other(format!(
                    "final claim authority open failed and exact rollback failed: {error}"
                )));
            }
            return Err(error);
        }
    };
    let mut final_rollback = FixedClaimRollback::new(parent, path, &fixed, final_file);
    validate_open_claim(parent, final_rollback.file_mut()?, path, &fixed, bytes)?;
    let canonical_path = canonical_authority_path(parent, path)?;
    let final_file = final_rollback.disarm()?;
    drop(bridge);
    Ok((final_file, fixed, canonical_path))
}

pub(super) fn open_snapshot_reader(
    parent: &ParentAuthority,
    path: &Path,
) -> std::io::Result<HeldAuthorityFile> {
    #[cfg(windows)]
    {
        let _ = parent;
        vaultspec_windows_authority::AuthorityFile::open_reader(path)
            .map(HeldAuthorityFile::Windows)
    }
    #[cfg(unix)]
    {
        open_unix_authority_file(
            parent,
            path,
            rustix::fs::OFlags::RDONLY | rustix::fs::OFlags::CLOEXEC | rustix::fs::OFlags::NOFOLLOW,
            rustix::fs::Mode::empty(),
        )
        .map(HeldAuthorityFile::Unix)
    }
}
