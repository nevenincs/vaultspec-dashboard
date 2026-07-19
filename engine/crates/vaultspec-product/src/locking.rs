//! The installation transaction lock (a2a-product-provisioning W01.P01.S10).
//!
//! ADR constraint "Lock ordering is global": the controller (and the copied
//! external updater) acquires the installation transaction lock *first*, before
//! any drain, snapshot, migration, or file activation, and holds it through
//! activation or rollback. It is a short-lived operating-system exclusive lock,
//! distinct from the gateway's lifetime-held runtime singleton. **The gateway
//! never acquires or waits on the installation lock** — that separation is what
//! prevents a lifecycle mutation from deadlocking against a running gateway.
//!
//! This module encodes the boundary in the type system: [`InstallLock::acquire`]
//! takes an [`Actor`], and a [`Actor::Gateway`] request is refused before the
//! lock is ever touched — it cannot acquire *or* block on the lock. Only the
//! matching receipt owner may quarantine stale discovery, and only after proving
//! the recorded process dead ([`quarantine_owner_matched_stale`]).

use std::path::Path;

use fs4::fs_std::FileExt;

/// Which component is requesting the installation lock. The actor gates the
/// request: only installer/updater authority may hold it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Actor {
    /// The product-owned installer performing first install or a manager-adapter
    /// preflight.
    Installer,
    /// The copied external updater running the ordered update transaction.
    CopiedUpdater,
    /// The A2A gateway. Forbidden from acquiring or waiting on the install lock.
    Gateway,
}

impl Actor {
    fn may_hold_install_lock(self) -> bool {
        matches!(self, Actor::Installer | Actor::CopiedUpdater)
    }
}

/// Why the installation lock could not be acquired.
#[derive(Debug)]
pub enum LockError {
    /// The gateway requested the install lock; it may never acquire or wait on
    /// it. Refused before the lock file is touched.
    GatewayForbidden,
    /// An I/O error creating or locking the lock file.
    Io(std::io::Error),
}

impl std::fmt::Display for LockError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LockError::GatewayForbidden => write!(
                f,
                "the gateway may not acquire or wait on the installation transaction lock"
            ),
            LockError::Io(e) => write!(f, "install lock io error: {e}"),
        }
    }
}

impl std::error::Error for LockError {}

impl From<std::io::Error> for LockError {
    fn from(e: std::io::Error) -> Self {
        LockError::Io(e)
    }
}

/// The lock was held by another live installer/updater process.
#[derive(Debug)]
pub struct LockBusy {
    /// The owner recorded in the lock file, best-effort.
    pub owner: Option<String>,
    /// The pid recorded in the lock file, best-effort.
    pub pid: Option<u32>,
}

/// A held installation lock. Dropping it (or process death) releases the OS
/// lock, so a crash mid-transaction never strands the lock — a recovering
/// updater re-acquires the freed lock and resolves the durable receipt markers.
#[derive(Debug)]
pub struct InstallLockGuard {
    file: std::fs::File,
    owner: String,
    sidecar: std::path::PathBuf,
}

impl InstallLockGuard {
    /// The owner id recorded when this lock was acquired.
    #[must_use]
    pub fn owner(&self) -> &str {
        &self.owner
    }
}

impl Drop for InstallLockGuard {
    fn drop(&mut self) {
        // Retract the advisory identity, then release the OS lock. Best-effort:
        // process death would release the lock regardless, and a stranded
        // sidecar is reconciled by the owner-matched quarantine path.
        let _ = std::fs::remove_file(&self.sidecar);
        let _ = FileExt::unlock(&self.file);
    }
}

/// The installation transaction lock at a fixed product-owned path.
#[derive(Debug, Clone)]
pub struct InstallLock {
    path: std::path::PathBuf,
}

impl InstallLock {
    /// Bind the lock to its product-owned path (typically
    /// `ProductPaths::install_lock_path`).
    #[must_use]
    pub fn new(path: impl Into<std::path::PathBuf>) -> Self {
        Self { path: path.into() }
    }

    /// Try to acquire the lock without blocking. `Ok(Ok(guard))` on success;
    /// `Ok(Err(LockBusy))` when another live installer/updater holds it;
    /// `Err(GatewayForbidden)` when the actor is the gateway; `Err(Io)` on real
    /// I/O failure. The non-blocking try is the fail-loud default — an installer
    /// that finds the lock busy reports it rather than queueing behind an update.
    pub fn acquire(
        &self,
        actor: Actor,
        owner: &str,
    ) -> std::result::Result<std::result::Result<InstallLockGuard, LockBusy>, LockError> {
        if !actor.may_hold_install_lock() {
            return Err(LockError::GatewayForbidden);
        }
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .read(true)
            .truncate(false)
            .open(&self.path)?;
        let sidecar = self.sidecar_path();
        if !FileExt::try_lock_exclusive(&file)? {
            let (o, p) = read_lock_identity(&sidecar);
            return Ok(Err(LockBusy { owner: o, pid: p }));
        }
        // Advisory identity in an UNLOCKED sidecar, not the lock file itself:
        // the OS holds an exclusive lock on `self.path`, and on Windows a reader
        // cannot open a locked region, so a concurrent LockBusy reader would see
        // nothing. The sidecar (owner + pid) is what stale-state quarantine and
        // a busy caller read; the lock file remains the authority.
        let _ = std::fs::write(&sidecar, format!("{}\n{}", owner, std::process::id()));
        Ok(Ok(InstallLockGuard {
            file,
            owner: owner.to_string(),
            sidecar,
        }))
    }

    /// The unlocked advisory-identity sidecar beside the lock file.
    fn sidecar_path(&self) -> std::path::PathBuf {
        let mut name = self
            .path
            .file_name()
            .map(std::ffi::OsStr::to_owned)
            .unwrap_or_else(|| std::ffi::OsString::from("install.lock"));
        name.push(".owner");
        self.path.with_file_name(name)
    }
}

/// Read the owner id and pid from the advisory sidecar, tolerantly.
fn read_lock_identity(sidecar: &Path) -> (Option<String>, Option<u32>) {
    let Ok(contents) = std::fs::read_to_string(sidecar) else {
        return (None, None);
    };
    let mut lines = contents.lines();
    let owner = lines
        .next()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let pid = lines.next().and_then(|s| s.trim().parse::<u32>().ok());
    (owner, pid)
}

/// Stale product state recorded by a prior generation (from discovery or a
/// receipt): the owner that wrote it and the process id it named.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StaleState {
    /// The owner id recorded with the stale state.
    pub owner: String,
    /// The process id the stale state named.
    pub pid: u32,
}

/// Why an owner-matched stale-state quarantine was refused.
#[derive(Debug, PartialEq, Eq)]
pub enum QuarantineRefusal {
    /// The stale state belongs to a different owner. A live foreign or
    /// unverifiable resident stays immutable (ADR D4).
    ForeignOwner,
    /// The recorded process is still alive; it must be proven dead first.
    ProcessLive,
}

impl std::fmt::Display for QuarantineRefusal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            QuarantineRefusal::ForeignOwner => {
                write!(
                    f,
                    "stale state is owned by a different install; refusing to quarantine"
                )
            }
            QuarantineRefusal::ProcessLive => {
                write!(
                    f,
                    "recorded process is still alive; cannot quarantine live state"
                )
            }
        }
    }
}

impl std::error::Error for QuarantineRefusal {}

/// Decide whether the current owner may quarantine stale state. Permits the
/// quarantine only when the stale state's owner matches *and* the recorded
/// process is proven dead — the two conditions the ADR requires under the
/// installation transaction lock. Must be called while holding the lock.
pub fn quarantine_owner_matched_stale(
    current_owner: &str,
    stale: &StaleState,
) -> std::result::Result<(), QuarantineRefusal> {
    if stale.owner != current_owner {
        return Err(QuarantineRefusal::ForeignOwner);
    }
    if process_is_alive(stale.pid) {
        return Err(QuarantineRefusal::ProcessLive);
    }
    Ok(())
}

/// Whether a process id is currently alive, via a scoped `sysinfo` refresh of
/// exactly that pid. This is the proof-of-death mechanism for stale-state
/// quarantine.
#[must_use]
pub fn process_is_alive(pid: u32) -> bool {
    use sysinfo::{Pid, ProcessesToUpdate, System};
    let mut sys = System::new();
    let target = Pid::from_u32(pid);
    sys.refresh_processes(ProcessesToUpdate::Some(&[target]), true);
    sys.process(target).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Spawn a process that exits immediately, portable across the test hosts.
    fn spawn_trivial_child() -> std::process::Child {
        if cfg!(windows) {
            std::process::Command::new("cmd")
                .args(["/C", "exit"])
                .spawn()
                .expect("spawn cmd")
        } else {
            std::process::Command::new("true")
                .spawn()
                .expect("spawn true")
        }
    }

    #[test]
    fn gateway_is_refused_before_touching_the_lock() {
        let dir = tempfile::tempdir().unwrap();
        let lock = InstallLock::new(dir.path().join("install.lock"));
        assert!(matches!(
            lock.acquire(Actor::Gateway, "gw"),
            Err(LockError::GatewayForbidden)
        ));
        // And no lock file was created by the refused request.
        assert!(!dir.path().join("install.lock").exists());
    }

    #[test]
    fn installer_acquires_and_releases_on_drop() {
        let dir = tempfile::tempdir().unwrap();
        let lock = InstallLock::new(dir.path().join("install.lock"));
        let guard = lock.acquire(Actor::Installer, "seat-a").unwrap().unwrap();
        assert_eq!(guard.owner(), "seat-a");
        // A second in-process handle is refused while the first is held.
        match lock.acquire(Actor::CopiedUpdater, "updater").unwrap() {
            Err(LockBusy { owner, .. }) => assert_eq!(owner.as_deref(), Some("seat-a")),
            Ok(_) => panic!("second acquire must be refused while held"),
        }
        drop(guard);
        // Released: acquirable again.
        lock.acquire(Actor::Installer, "seat-b").unwrap().unwrap();
    }

    #[test]
    fn quarantine_matches_owner_and_requires_death() {
        // Our own live pid can never be quarantined.
        let live = StaleState {
            owner: "seat-a".to_string(),
            pid: std::process::id(),
        };
        assert_eq!(
            quarantine_owner_matched_stale("seat-a", &live),
            Err(QuarantineRefusal::ProcessLive)
        );
        // A foreign owner is refused regardless of liveness.
        assert_eq!(
            quarantine_owner_matched_stale("seat-b", &live),
            Err(QuarantineRefusal::ForeignOwner)
        );
        // An owner-matched, provably-dead pid may be quarantined. Spawn a real
        // child, reap it, and use its now-dead pid so the proof-of-death is
        // deterministic rather than relying on a magic pid value.
        let mut child = spawn_trivial_child();
        let dead_pid = child.id();
        child.wait().unwrap();
        let dead = StaleState {
            owner: "seat-a".to_string(),
            pid: dead_pid,
        };
        assert!(quarantine_owner_matched_stale("seat-a", &dead).is_ok());
    }
}
