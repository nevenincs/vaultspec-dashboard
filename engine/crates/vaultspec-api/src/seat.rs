//! The machine-singleton SEAT (single-app-runtime ADR D1).
//!
//! One resident app process per machine. The seat is an OS-level exclusive
//! file lock on `<app home>/seat.lock`, held for the process lifetime: the
//! kernel releases it on ANY death (crash, kill, clean exit), so dead-pid
//! takeover is automatic — a new serve simply acquires the freed lock and
//! republishes discovery. A live conflict fails loud, naming the running
//! seat from its discovery file so the message can say "run `vaultspec` to
//! open it".
//!
//! Exemptions (the sanctioned multi-instance paths, declared at the flag
//! site in the CLI): `--port 0` (the OS-ephemeral test port) and an explicit
//! `--no-seat` skip seat acquisition entirely and keep the workspace-local
//! discovery file, so the vitest live-engine harness, the adverse suites,
//! and parallel dev worktrees spawn freely exactly as before.

use std::io::Write as _;
use std::path::{Path, PathBuf};

use fs4::fs_std::FileExt;

/// A held seat. Dropping it (or process death) releases the OS lock; the
/// serve loop keeps it alive for its full lifetime.
#[derive(Debug)]
pub struct SeatGuard {
    file: std::fs::File,
    /// The app home the seat was acquired under (discovery lives beside it).
    pub home: PathBuf,
}

impl Drop for SeatGuard {
    fn drop(&mut self) {
        // Best-effort explicit unlock; the OS would also release on close.
        let _ = FileExt::unlock(&self.file);
    }
}

/// Why the seat could not be acquired.
#[derive(Debug)]
pub enum SeatBusy {
    /// Another live process holds the lock; fields are read best-effort from
    /// the seat discovery file (absent when it is missing or unreadable).
    Held { pid: Option<u64>, port: Option<u16> },
}

/// Try to acquire the machine seat under `home`. `Ok(Ok(guard))` on success;
/// `Ok(Err(SeatBusy))` when a live holder exists; `Err` only on real I/O
/// failure creating the app home or lock file.
pub fn acquire_seat(home: &Path) -> std::io::Result<Result<SeatGuard, SeatBusy>> {
    std::fs::create_dir_all(home)?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(false)
        .open(home.join("seat.lock"))?;
    if !FileExt::try_lock_exclusive(&file)? {
        // Live holder: name it from the seat discovery file, best-effort.
        let (pid, port) = read_seat_identity(home);
        return Ok(Err(SeatBusy::Held { pid, port }));
    }
    // Advisory content for humans inspecting the file; the LOCK is the truth.
    let _ = file.set_len(0);
    let _ = writeln!(file, "{}", std::process::id());
    Ok(Ok(SeatGuard {
        file,
        home: home.to_path_buf(),
    }))
}

/// Read pid/port from the seat discovery file, tolerantly.
pub fn read_seat_identity(home: &Path) -> (Option<u64>, Option<u16>) {
    let parsed: Option<serde_json::Value> =
        std::fs::read_to_string(vaultspec_session::app_home::seat_discovery_path(home))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok());
    let pid = parsed
        .as_ref()
        .and_then(|v| v.get("pid"))
        .and_then(serde_json::Value::as_u64);
    let port = parsed
        .as_ref()
        .and_then(|v| v.get("port"))
        .and_then(serde_json::Value::as_u64)
        .and_then(|p| u16::try_from(p).ok());
    (pid, port)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seat_is_exclusive_within_a_home_and_released_on_drop() {
        let dir = tempfile::tempdir().unwrap();
        let first = acquire_seat(dir.path()).unwrap();
        let guard = first.expect("first acquire succeeds");
        // A second acquire in the same home is refused while the guard lives.
        // (Same-process re-lock semantics differ per OS for flock, but on both
        // Windows byte-range locks and unix flock a SECOND handle's try-lock
        // fails while the first holds it.)
        match acquire_seat(dir.path()).unwrap() {
            Err(SeatBusy::Held { .. }) => {}
            Ok(_) => panic!("second acquire must be refused while the seat is held"),
        }
        drop(guard);
        // Released: acquirable again (the dead-pid takeover path).
        acquire_seat(dir.path())
            .unwrap()
            .expect("re-acquire after release succeeds");
    }

    #[test]
    fn busy_names_the_running_seat_from_discovery() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            vaultspec_session::app_home::seat_discovery_path(dir.path()),
            r#"{"port": 8767, "pid": 4242, "service_token": "x", "last_heartbeat": 1}"#,
        )
        .unwrap();
        let _guard = acquire_seat(dir.path()).unwrap().unwrap();
        match acquire_seat(dir.path()).unwrap() {
            Err(SeatBusy::Held { pid, port }) => {
                assert_eq!(pid, Some(4242));
                assert_eq!(port, Some(8767));
            }
            Ok(_) => panic!("must be busy"),
        }
    }
}
