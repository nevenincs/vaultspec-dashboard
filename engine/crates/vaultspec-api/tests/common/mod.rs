//! Test support shared by BOTH compilation units: the integration tests under
//! `tests/` (`mod common;`) and the in-crate `authoring` unit tests (included
//! through the `#[path]` seam in `authoring/mod.rs`).
//!
//! `scaffold_vaultspec_workspace` was reimplemented six times with silently
//! diverged behavior; it lives here once so the strict and best-effort callers
//! cannot drift apart on WHAT they install, only on how they react to a
//! missing core.
//!
//! The invocation stays a REAL `vaultspec-core install` subprocess — the
//! project forbids mocking the engine wire, and these fixtures exist precisely
//! to drive apply against the genuine binary.

#![allow(dead_code)]

use std::path::Path;
use std::process::Command;

/// Install a real `.vaultspec` workspace at `root`, best-effort and offline.
///
/// Two attempts, in order: the uv-managed entry point (`uv run --no-sync
/// vaultspec-core`) and a bare `vaultspec-core` on `PATH`. Returns whether a
/// workspace is present afterwards, so a caller that can degrade honestly
/// (no core in the environment → a failed receipt, never a faked one) can.
pub fn try_scaffold_vaultspec_workspace(root: &Path) -> bool {
    install_vaultspec_workspace(root).0
}

/// The install itself, plus the attempts' captured output so a strict caller
/// can report WHY core refused rather than a bare boolean.
fn install_vaultspec_workspace(root: &Path) -> (bool, String) {
    let attempts: [&[&str]; 2] = [
        &[
            "uv",
            "run",
            "--no-sync",
            "vaultspec-core",
            "install",
            "--target",
            ".",
        ],
        &["vaultspec-core", "install", "--target", "."],
    ];
    let mut diagnostics = String::new();
    for args in attempts {
        let result = Command::new(args[0])
            .args(&args[1..])
            .current_dir(root)
            .output();
        match result {
            Ok(out) => {
                if out.status.success() && root.join(".vaultspec").is_dir() {
                    return (true, diagnostics);
                }
                diagnostics.push_str(&format!(
                    "\n{args:?}: {}{}",
                    String::from_utf8_lossy(&out.stdout),
                    String::from_utf8_lossy(&out.stderr)
                ));
            }
            Err(err) => diagnostics.push_str(&format!("\n{args:?}: {err}")),
        }
    }
    (root.join(".vaultspec").is_dir(), diagnostics)
}

/// [`try_scaffold_vaultspec_workspace`] for the live-core fixtures that have
/// nothing to degrade to: the test is only meaningful against a real
/// workspace, so a missing core fails loudly. `context` names the suite so the
/// panic says which fixture needs a core.
pub fn scaffold_vaultspec_workspace(root: &Path, context: &str) {
    let (installed, diagnostics) = install_vaultspec_workspace(root);
    assert!(
        installed,
        "real vaultspec-core install must succeed for {context}:{diagnostics}"
    );
}
