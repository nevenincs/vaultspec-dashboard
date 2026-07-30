//! Windows replace-only-after-exit proof.
//!
//! A self-install swap replaces BOTH installed executables — the dashboard and
//! the updater that ships beside it — and Windows refuses to overwrite an
//! executable image while a process is running it. That is precisely why the
//! seated processes exit before replacement, and why the updater that performs
//! the swap is a COPY taken out of the release rather than the installed one.
//!
//! This proves the whole ordering against real files and real processes: the
//! copied updater, running the whole time, cannot replace either installed image
//! while the seated processes live, and replaces both once they have exited.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

/// Sentinel that turns the replace helper on, dropped into its working
/// directory. An ordinary suite run has no such file, so the helper is inert.
const REPLACE_REQUEST: &str = "replace-request.txt";
/// The bytes the helper writes over each installed image.
const REPLACEMENT: &str = "replacement.bin";
/// What the helper records for its first attempt, made while the seated
/// processes are still running.
const FIRST_ATTEMPT: &str = "first-attempt.txt";
/// The test drops this once the seated processes have exited.
const PROCEED: &str = "proceed.txt";
/// What the helper records for the post-exit attempt.
const OUTCOME: &str = "outcome.txt";
/// The replacement image content, distinct from the original executable bytes.
const REPLACEMENT_BYTES: &[u8] = b"replaced-image";

/// A hidden helper re-invoked as a REAL child from a copied executable so the
/// copy is a running image. In a normal run (no `WINDOWS_REPL_SLEEPER` env) it
/// is a no-op; otherwise it sleeps well past the test's replace window.
#[test]
fn windows_replacement_sleeper() {
    if std::env::var("WINDOWS_REPL_SLEEPER").is_err() {
        return;
    }
    std::thread::sleep(Duration::from_secs(30));
}

/// The copied updater's replace drive, run as a REAL separate process from
/// OUTSIDE the release: attempt the replacement while the seated processes are
/// alive, wait for their exit, then replace both. Inert without the request
/// file in its working directory.
#[test]
fn windows_replacement_replacer() {
    let request = Path::new(REPLACE_REQUEST);
    if !request.exists() {
        return;
    }
    let targets: Vec<PathBuf> = std::fs::read_to_string(request)
        .expect("read the replace request")
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(PathBuf::from)
        .collect();
    std::fs::write(REPLACEMENT, REPLACEMENT_BYTES).expect("stage the replacement bytes");

    // While the seated processes hold their images, replacement must fail.
    let first: Vec<String> = targets
        .iter()
        .map(|target| match std::fs::copy(REPLACEMENT, target) {
            Ok(_) => format!("replaced {}", target.display()),
            Err(_) => format!("refused {}", target.display()),
        })
        .collect();
    std::fs::write(FIRST_ATTEMPT, first.join("\n")).expect("record the first attempt");

    // The seat exits, and only then may the images be replaced.
    let deadline = Instant::now() + Duration::from_secs(60);
    while !Path::new(PROCEED).exists() {
        if Instant::now() >= deadline {
            std::fs::write(
                OUTCOME,
                "timed out waiting for the seated processes to exit",
            )
            .expect("record the outcome");
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    let after: Vec<String> = targets
        .iter()
        .map(|target| {
            if replace_with_bounded_retry(Path::new(REPLACEMENT), target) {
                format!("replaced {}", target.display())
            } else {
                format!("refused {}", target.display())
            }
        })
        .collect();
    std::fs::write(OUTCOME, after.join("\n")).expect("record the outcome");
}

/// Windows releases an executable image as its last process fully terminates;
/// retry within a short bound so teardown timing is not mistaken for refusal.
fn replace_with_bounded_retry(source: &Path, target: &Path) -> bool {
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        if std::fs::copy(source, target).is_ok() {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

#[cfg(windows)]
#[test]
fn the_copied_updater_replaces_both_installed_images_only_after_the_seated_processes_exit() {
    use vaultspec_product::handoff::copy_updater_out;

    let temp = tempfile::tempdir().unwrap();
    let release = temp.path().join("release/bin");
    std::fs::create_dir_all(&release).unwrap();
    let dashboard = release.join("vaultspec.exe");
    let installed_updater = release.join("vaultspec-updater.exe");
    let image = std::env::current_exe().unwrap();
    std::fs::copy(&image, &dashboard).unwrap();
    std::fs::copy(&image, &installed_updater).unwrap();

    // The swap is driven from a copy taken OUT of the release: the installed
    // updater is one of the files being replaced, so it cannot drive its own
    // replacement.
    let staging = temp.path().join("transaction/updater");
    let copied = copy_updater_out(&installed_updater, &staging).expect("copy the updater out");
    assert!(!copied.starts_with(&release));

    // The seated processes: both installed images are running.
    let mut seated_dashboard = spawn_sleeping_image(&dashboard);
    let mut seated_updater = spawn_sleeping_image(&installed_updater);
    for target in [&dashboard, &installed_updater] {
        assert!(
            std::fs::copy(&image, target).is_err(),
            "a running installed image must not be replaceable: {}",
            target.display()
        );
    }

    // The copied updater runs for the whole drive, from outside the release.
    let work = temp.path().join("work");
    std::fs::create_dir_all(&work).unwrap();
    std::fs::write(
        work.join(REPLACE_REQUEST),
        format!("{}\n{}\n", dashboard.display(), installed_updater.display()),
    )
    .unwrap();
    let mut replacer = std::process::Command::new(&copied)
        .args([
            "windows_replacement_replacer",
            "--exact",
            "--nocapture",
            "--test-threads=1",
        ])
        .current_dir(&work)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .expect("spawn the copied updater");

    let first = await_file(&work.join(FIRST_ATTEMPT), Duration::from_secs(60));
    assert_eq!(
        first.lines().filter(|l| l.starts_with("refused")).count(),
        2,
        "neither installed image may be replaced while its process runs: {first}"
    );
    assert_eq!(
        std::fs::read(&dashboard).unwrap(),
        std::fs::read(&image).unwrap(),
        "the running dashboard image must be untouched"
    );

    // The seat exits.
    for seated in [&mut seated_dashboard, &mut seated_updater] {
        seated.kill().unwrap();
        seated.wait().unwrap();
    }
    std::fs::write(work.join(PROCEED), b"exited").unwrap();

    let outcome = await_file(&work.join(OUTCOME), Duration::from_secs(60));
    assert_eq!(
        outcome
            .lines()
            .filter(|l| l.starts_with("replaced"))
            .count(),
        2,
        "both installed images must be replaceable once the seat has exited: {outcome}"
    );
    for target in [&dashboard, &installed_updater] {
        assert_eq!(
            std::fs::read(target).unwrap(),
            REPLACEMENT_BYTES,
            "{} must carry the replacement bytes",
            target.display()
        );
    }

    replacer.wait().expect("reap the copied updater");
}

#[cfg(windows)]
fn spawn_sleeping_image(image: &Path) -> std::process::Child {
    std::process::Command::new(image)
        .args([
            "windows_replacement_sleeper",
            "--exact",
            "--nocapture",
            "--test-threads=1",
        ])
        .env("WINDOWS_REPL_SLEEPER", "1")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .expect("spawn a real running image")
}

#[cfg(windows)]
fn await_file(path: &Path, budget: Duration) -> String {
    let deadline = Instant::now() + budget;
    loop {
        if let Ok(text) = std::fs::read_to_string(path) {
            return text;
        }
        assert!(
            Instant::now() < deadline,
            "the copied updater never wrote {}",
            path.display()
        );
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
