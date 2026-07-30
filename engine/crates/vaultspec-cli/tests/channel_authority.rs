//! The `update` verb refuses a copy that carries no transaction authority.
//!
//! A complete product installation ships the external updater beside the
//! dashboard; that updater is what owns file activation and rollback for a
//! self-installed copy. A copy without it belongs to a package manager that
//! stages, activates, and rolls back its own files, so the verb must refuse with
//! that channel's remediation instead of writing files it does not own — and it
//! must refuse before it touches any product state.
//!
//! This runs the REAL `vaultspec` executable from a directory that deliberately
//! holds nothing else.
//!
//! The file name deliberately avoids the words Windows installer detection
//! looks for (`update`, `install`, `setup`, `patch`): a test binary named after
//! them is escalated to a UAC prompt and cannot run at all.

use std::path::Path;

fn dashboard_name() -> &'static str {
    if cfg!(windows) {
        "vaultspec.exe"
    } else {
        "vaultspec"
    }
}

/// Copy the built dashboard binary into a directory of its own, so no updater
/// sits beside it.
fn lone_dashboard(dir: &Path) -> std::path::PathBuf {
    let dest = dir.join(dashboard_name());
    std::fs::copy(env!("CARGO_BIN_EXE_vaultspec"), &dest).expect("copy the dashboard binary");
    dest
}

#[test]
fn a_copy_without_the_product_updater_is_refused_with_its_channel_remediation() {
    let temp = tempfile::tempdir().unwrap();
    let install = temp.path().join("install");
    std::fs::create_dir_all(&install).unwrap();
    let app_home = temp.path().join("app-home");
    let dashboard = lone_dashboard(&install);

    let output = std::process::Command::new(&dashboard)
        .args(["update", "--json"])
        .env("VAULTSPEC_APP_HOME", &app_home)
        .output()
        .expect("run the real dashboard binary");
    assert!(
        output.status.success(),
        "a channel refusal is an outcome, not a crash: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let envelope: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("the verb emits the contract envelope");
    let data = &envelope["data"];
    assert_eq!(
        data["handed_off"], false,
        "no transaction may be handed off from a copy with no updater: {envelope}"
    );
    let reason = data["reason"].as_str().unwrap_or_default();
    for manager in ["scoop", "winget", "Windows Installer"] {
        assert!(
            reason.contains(manager),
            "the refusal must name the channel authority {manager}: {reason}"
        );
    }

    assert!(
        !app_home.exists(),
        "a refused update must not create product state"
    );
}
