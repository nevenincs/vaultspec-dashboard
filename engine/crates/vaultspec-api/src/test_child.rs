//! Locator for the dev-only child in `examples/authoring_test_child.rs`.
//!
//! Tests that need a real subprocess drive that one binary instead of a shell,
//! so a fixture is the same program on every platform rather than a
//! `powershell` branch and an `sh` branch that nothing compares.

use std::path::PathBuf;

/// Resolve the child beside this test binary. `cargo test` builds examples
/// into `<target>/<profile>/examples`, and the test binary itself runs from
/// `<target>/<profile>/deps`, so the child is found relative to the running
/// executable rather than assumed from a hardcoded target directory.
pub(crate) fn test_child_bin() -> PathBuf {
    let exe = std::env::current_exe().expect("test executable path");
    let profile = exe
        .parent()
        .and_then(|deps| deps.parent())
        .expect("<target>/<profile>/deps/<test binary>");
    let child = profile.join("examples").join(format!(
        "authoring_test_child{}",
        std::env::consts::EXE_SUFFIX
    ));
    assert!(
        child.is_file(),
        "the authoring test child is missing at {}. `cargo test --workspace` (what the \
         suite runs) builds it; a target-filtered run such as `--lib` does not. Build it \
         with `cargo build -p vaultspec-api --example authoring_test_child`.",
        child.display()
    );
    child
}

/// The child's path as the leading element of an invocation.
pub(crate) fn test_child_argv0() -> String {
    test_child_bin().to_string_lossy().into_owned()
}
