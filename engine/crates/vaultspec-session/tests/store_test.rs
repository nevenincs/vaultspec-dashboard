//! Integration tests over the public `UserState` handle, exercising the real
//! on-disk SQLite store across reopen cycles (no mocks, no doubles).

use std::fs;

use vaultspec_session::{ScopeContext, UserState};

/// Resolve the user-state db path under a temp vault root, mirroring the
/// crate's own layout (`.vault/data/engine-data/user-state.sqlite3`).
fn db_path(vault_root: &std::path::Path) -> std::path::PathBuf {
    vault_root
        .join("data")
        .join("engine-data")
        .join("user-state.sqlite3")
}

#[test]
fn reopen_restores_active_scope_folder_contexts_and_settings() {
    let dir = tempfile::tempdir().unwrap();
    let vault_root = dir.path().join(".vault");

    let ctx = ScopeContext {
        active_folder: Some("plan".to_string()),
        feature_tags: vec!["editor-demo".into(), "grid-layout".into()],
        workspace_layout: Some("{\"v\":1,\"tabs\":[]}".to_string()),
    };

    // First session: write active scope, a per-scope context, and settings.
    {
        let state = UserState::open(&vault_root).expect("open fresh");
        state.set_active_scope("wsA", "feature-x", 100).unwrap();
        state
            .set_scope_context("wsA", "feature-x", &ctx, 100)
            .unwrap();
        state.set_global_setting("theme", "dark", 100).unwrap();
        state
            .set_scoped_setting("feature-x", "granularity", "document", 100)
            .unwrap();
    }

    // Reopen from the same root: everything written above survives the
    // process boundary because it was flushed to the real SQLite file.
    {
        let state = UserState::open(&vault_root).expect("reopen");
        assert_eq!(
            state.active_scope("wsA").unwrap().as_deref(),
            Some("feature-x"),
            "active scope must survive reopen"
        );
        assert_eq!(
            state.scope_context("wsA", "feature-x").unwrap(),
            ctx,
            "folder + feature-tag contexts must survive reopen"
        );
        assert_eq!(
            state.global_setting("theme").unwrap().as_deref(),
            Some("dark"),
            "global setting must survive reopen"
        );
        assert_eq!(
            state
                .scoped_setting("feature-x", "granularity")
                .unwrap()
                .as_deref(),
            Some("document"),
            "scoped setting must survive reopen"
        );
    }
}

#[test]
fn corrupt_file_on_disk_is_recreated_empty_without_panic() {
    let dir = tempfile::tempdir().unwrap();
    let vault_root = dir.path().join(".vault");

    // Establish a real store with content.
    {
        let state = UserState::open(&vault_root).expect("open fresh");
        state.set_active_scope("wsA", "main", 1).unwrap();
        assert_eq!(state.active_scope("wsA").unwrap().as_deref(), Some("main"));
    }

    // Simulate a hard-kill / disk corruption: overwrite the db file with bytes
    // that are not a valid SQLite database. Remove the WAL/SHM siblings so the
    // garbage header is what the opener sees.
    let path = db_path(&vault_root);
    for suffix in ["-wal", "-shm"] {
        let mut sib = path.clone().into_os_string();
        sib.push(suffix);
        let _ = fs::remove_file(std::path::PathBuf::from(sib));
    }
    fs::write(&path, b"corrupt: this is not a sqlite database at all\n").unwrap();

    // Best-effort heal: reopen must NOT panic and must recreate an empty,
    // usable store. The prior content is gone (acceptable per the prototype
    // posture), but the store works.
    let state = UserState::open(&vault_root).expect("corrupt store recreates without panic");
    assert_eq!(
        state.active_scope("wsA").unwrap(),
        None,
        "recreated store starts empty"
    );
    // And it is fully usable after the heal.
    state.set_active_scope("wsA", "recovered", 2).unwrap();
    assert_eq!(
        state.active_scope("wsA").unwrap().as_deref(),
        Some("recovered")
    );
}

#[test]
fn recents_are_most_recent_first_deduped_and_bounded_across_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let vault_root = dir.path().join(".vault");

    {
        let state = UserState::open(&vault_root).expect("open fresh");
        state.push_recent("wsA", "main").unwrap();
        state.push_recent("wsA", "feature-x").unwrap();
        state.push_recent("wsA", "feature-y").unwrap();
        // Re-push an existing entry: it moves to the front, not duplicated.
        state.push_recent("wsA", "main").unwrap();
        assert_eq!(
            state.recents("wsA").unwrap(),
            vec!["main", "feature-y", "feature-x"]
        );
    }

    // Ordering survives reopen.
    {
        let state = UserState::open(&vault_root).expect("reopen");
        assert_eq!(
            state.recents("wsA").unwrap(),
            vec!["main", "feature-y", "feature-x"],
            "recents order must survive reopen"
        );

        // Bounded: pushing well past the cap keeps exactly the cap, newest first.
        let cap = vaultspec_session::MAX_RECENTS;
        for i in 0..(cap + 25) {
            state.push_recent("wsA", &format!("scope-{i}")).unwrap();
        }
        let recents = state.recents("wsA").unwrap();
        assert_eq!(recents.len(), cap, "recents bounded to MAX_RECENTS");
        assert_eq!(
            recents[0],
            format!("scope-{}", cap + 24),
            "newest push is at the front"
        );
        // The earliest entries fell off the bound.
        assert!(
            !recents.iter().any(|v| v == "scope-0"),
            "oldest entries past the bound are dropped"
        );
    }
}
