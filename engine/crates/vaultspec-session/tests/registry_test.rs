//! Integration tests over the workspace registry through the public
//! `UserState` handle (dashboard-workspace-registry ADR), exercising the real
//! on-disk SQLite store across reopen cycles (no mocks, no doubles). The
//! registry is USER-STATE CONFIG: these tests RECORD, select, and forget
//! registry rows and never touch any repository on disk.

use std::fs;

use vaultspec_session::{RegistryError, UserState, WorkspaceRoot};

/// Resolve the user-state db path under a temp vault root, mirroring the
/// crate's own layout (`.vault/data/engine-data/user-state.sqlite3`).
fn db_path(vault_root: &std::path::Path) -> std::path::PathBuf {
    vault_root
        .join("data")
        .join("engine-data")
        .join("user-state.sqlite3")
}

fn root(id: &str, label: &str, path: &str, is_launch: bool) -> WorkspaceRoot {
    WorkspaceRoot {
        id: id.to_string(),
        label: label.to_string(),
        path: path.to_string(),
        is_launch,
        reachable: true,
        unreachable_reason: None,
    }
}

#[test]
fn registry_roots_order_reachability_and_active_workspace_survive_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let vault_root = dir.path().join(".vault");

    // First session: auto-register a launch root, add two more, mark one
    // unreachable, and select an active workspace.
    {
        let state = UserState::open(&vault_root).expect("open fresh");
        state
            .auto_register_launch("id-launch", "launch", "/ws/launch", 100)
            .unwrap();
        state
            .add_root(&root("id-b", "beta", "/ws/b", false), 101)
            .unwrap();
        state
            .add_root(&root("id-c", "gamma", "/ws/c", false), 102)
            .unwrap();
        state
            .set_root_reachability("id-c", false, Some("path unreachable"), 103)
            .unwrap();
        state.set_active_workspace("id-b", 104).unwrap();
    }

    // Reopen from the same root: everything written above survives the process
    // boundary because it was flushed to the real SQLite file.
    {
        let state = UserState::open(&vault_root).expect("reopen");
        let roots = state.list_roots().unwrap();
        assert_eq!(
            roots.iter().map(|r| r.id.clone()).collect::<Vec<_>>(),
            vec!["id-launch", "id-b", "id-c"],
            "registry order must survive reopen"
        );
        let launch = &roots[0];
        assert!(launch.is_launch, "launch-default marker survives reopen");
        assert_eq!(launch.label, "launch");
        assert_eq!(launch.path, "/ws/launch");

        let c = state.root("id-c").unwrap().expect("present");
        assert!(!c.reachable, "reachability state survives reopen");
        assert_eq!(c.unreachable_reason.as_deref(), Some("path unreachable"));

        assert_eq!(
            state.active_workspace().unwrap().as_deref(),
            Some("id-b"),
            "active workspace must survive reopen"
        );
    }
}

#[test]
fn auto_register_launch_is_idempotent_across_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let vault_root = dir.path().join(".vault");

    {
        let state = UserState::open(&vault_root).expect("open fresh");
        let first = state
            .auto_register_launch("id-launch", "launch", "/ws/launch", 1)
            .unwrap();
        assert!(first.is_launch);
        // A second add (a sibling) lands AFTER the launch root.
        state
            .add_root(&root("id-b", "beta", "/ws/b", false), 2)
            .unwrap();
    }

    // A reboot re-runs auto-register; it must NOT re-seed, reorder, or duplicate
    // the launch root — the single-project experience is stable across reboots.
    {
        let state = UserState::open(&vault_root).expect("reopen");
        state
            .auto_register_launch("id-launch", "launch", "/ws/launch", 3)
            .unwrap();
        let ids: Vec<String> = state
            .list_roots()
            .unwrap()
            .into_iter()
            .map(|r| r.id)
            .collect();
        assert_eq!(
            ids,
            vec!["id-launch", "id-b"],
            "auto-register on reboot does not re-seed or reorder"
        );
    }
}

#[test]
fn forget_refuses_the_last_launch_root_but_removes_siblings() {
    let dir = tempfile::tempdir().unwrap();
    let vault_root = dir.path().join(".vault");
    let state = UserState::open(&vault_root).expect("open fresh");

    state
        .auto_register_launch("id-launch", "launch", "/ws/launch", 1)
        .unwrap();
    // The launch workspace cannot be forgotten while it is the only root.
    assert_eq!(
        state.forget_root("id-launch").unwrap(),
        Err(RegistryError::LastLaunchRoot)
    );
    assert_eq!(state.list_roots().unwrap().len(), 1);

    // Once a sibling exists, forgetting the sibling removes only its config row.
    state
        .add_root(&root("id-b", "beta", "/ws/b", false), 2)
        .unwrap();
    assert_eq!(state.forget_root("id-b").unwrap(), Ok(()));
    assert_eq!(
        state
            .list_roots()
            .unwrap()
            .into_iter()
            .map(|r| r.id)
            .collect::<Vec<_>>(),
        vec!["id-launch"]
    );
}

#[test]
fn corrupt_registry_recreates_empty_and_relaunch_reseeds() {
    let dir = tempfile::tempdir().unwrap();
    let vault_root = dir.path().join(".vault");

    // Establish a registry with content.
    {
        let state = UserState::open(&vault_root).expect("open fresh");
        state
            .auto_register_launch("id-launch", "launch", "/ws/launch", 1)
            .unwrap();
        state
            .add_root(&root("id-b", "beta", "/ws/b", false), 2)
            .unwrap();
        state.set_active_workspace("id-b", 3).unwrap();
        assert_eq!(state.list_roots().unwrap().len(), 2);
    }

    // Simulate disk corruption: overwrite the db file with garbage and remove
    // the WAL/SHM siblings so the garbage header is what the opener sees.
    let path = db_path(&vault_root);
    for suffix in ["-wal", "-shm"] {
        let mut sib = path.clone().into_os_string();
        sib.push(suffix);
        let _ = fs::remove_file(std::path::PathBuf::from(sib));
    }
    fs::write(&path, b"corrupt: not a sqlite database\n").unwrap();

    // Best-effort heal: reopen must NOT panic, and the registry resets to empty
    // (the prototype posture — a corrupt registry resets to the launch
    // workspace only). The prior siblings and active selection are gone.
    let state = UserState::open(&vault_root).expect("corrupt store recreates without panic");
    assert!(
        state.list_roots().unwrap().is_empty(),
        "recreated registry starts empty"
    );
    assert_eq!(
        state.active_workspace().unwrap(),
        None,
        "active workspace reset on corruption"
    );

    // And it is fully usable after the heal: re-launch re-seeds the launch root.
    state
        .auto_register_launch("id-launch", "launch", "/ws/launch", 10)
        .unwrap();
    let roots = state.list_roots().unwrap();
    assert_eq!(roots.len(), 1);
    assert!(roots[0].is_launch, "launch workspace re-seeded after heal");
}
