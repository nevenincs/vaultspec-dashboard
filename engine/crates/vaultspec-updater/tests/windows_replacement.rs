//! Windows replace-only-after-exit proof (a2a-product-provisioning W03.P07.S63 —
//! the standalone timing property).
//!
//! The self-install swap must replace the running dashboard and installed updater
//! executables, and Windows refuses to delete/overwrite an executable image while
//! a process is running it — which is exactly why the seat and updater must EXIT
//! before replacement. This proves that OS timing property against real files: a
//! running executable copy cannot be removed while alive, and can be once it
//! exits.
//!
//! The end-to-end swap of the actual dashboard + installed updater is the
//! activation seam (materializer); this timing property is what makes the
//! seat-exit-before-replacement ordering necessary and is proven standalone here.
//! S63 is not ticked until the end-to-end replacement lands with the seam.

use std::time::Duration;

/// A hidden helper re-invoked as a REAL child from a copied executable so the copy
/// is a running image. In a normal run (no `WINDOWS_REPL_SLEEPER` env) it is a
/// no-op; otherwise it sleeps well past the test's replace window.
#[test]
fn windows_replacement_sleeper() {
    if std::env::var("WINDOWS_REPL_SLEEPER").is_err() {
        return;
    }
    std::thread::sleep(Duration::from_secs(30));
}

#[cfg(windows)]
#[test]
fn windows_refuses_to_replace_a_running_executable_until_it_exits() {
    let temp = tempfile::tempdir().unwrap();
    let running = temp.path().join("running-image.exe");
    std::fs::copy(std::env::current_exe().unwrap(), &running).unwrap();

    // Spawn the copied image so the file is a live running executable.
    let mut child = std::process::Command::new(&running)
        .args([
            "windows_replacement_sleeper",
            "--nocapture",
            "--test-threads=1",
        ])
        .env("WINDOWS_REPL_SLEEPER", "1")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .unwrap();

    // While it runs, Windows refuses to remove the executable image.
    assert!(
        std::fs::remove_file(&running).is_err(),
        "a running executable image must not be replaceable"
    );
    assert!(running.exists());

    // After the process exits, the image can be replaced.
    child.kill().unwrap();
    child.wait().unwrap();
    assert!(remove_with_bounded_retry(&running));
}

/// Windows releases the executable image lock as the process fully terminates;
/// retry the removal within a short bound to avoid a teardown-timing flake.
#[cfg(windows)]
fn remove_with_bounded_retry(path: &std::path::Path) -> bool {
    let deadline = std::time::Instant::now() + Duration::from_secs(5);
    loop {
        if std::fs::remove_file(path).is_ok() {
            return true;
        }
        if std::time::Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// On Unix a running binary CAN be unlinked (the inode persists until the last
/// reference closes), so the "replace only after exit" property is Windows-
/// specific. The seat still exits before replacement for receipt-consistency
/// reasons, but the OS does not enforce it here. This documents the divergence so
/// the Windows proof above is understood as platform-specific.
#[cfg(not(windows))]
#[test]
fn unix_permits_unlinking_a_running_binary() {
    let temp = tempfile::tempdir().unwrap();
    let running = temp.path().join("running-image");
    std::fs::copy(std::env::current_exe().unwrap(), &running).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&running, std::fs::Permissions::from_mode(0o755)).unwrap();
    }

    let mut child = std::process::Command::new(&running)
        .args([
            "windows_replacement_sleeper",
            "--nocapture",
            "--test-threads=1",
        ])
        .env("WINDOWS_REPL_SLEEPER", "1")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .unwrap();

    // Unix allows unlinking the running binary immediately.
    assert!(std::fs::remove_file(&running).is_ok());
    let _ = child.kill();
    let _ = child.wait();
    let _ = temp;
}
