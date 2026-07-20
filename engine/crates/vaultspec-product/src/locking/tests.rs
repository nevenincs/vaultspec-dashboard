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
    let unverifiable = StaleState {
        owner: "seat-a".to_string(),
        pid: 0,
    };
    assert_eq!(
        quarantine_owner_matched_stale("seat-a", &unverifiable),
        Err(QuarantineRefusal::ProcessUnverifiable)
    );
    assert!(
        process_is_alive(0),
        "unverifiable polling fails closed alive"
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

#[test]
fn zero_start_observation_requires_a_positive_os_missing_probe() {
    let current_pid = std::process::id();
    let recorded_start = process_start_time(current_pid).expect("current process start");
    assert_eq!(
        classify_process_instance_observation(current_pid, recorded_start, Some(0)),
        ProcessInstanceLiveness::Unverifiable,
        "a live pid with a zero enumeration result is not a different instance"
    );

    let mut child = spawn_trivial_child();
    let dead_pid = child.id();
    child.wait().unwrap();
    assert_eq!(
        classify_process_instance_observation(dead_pid, recorded_start, Some(0)),
        ProcessInstanceLiveness::DeadOrDifferentInstance,
        "only the real OS missing probe promotes zero observation to dead"
    );
}
