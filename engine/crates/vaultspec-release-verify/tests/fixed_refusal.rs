//! Real-process proof of the helper's D3 boundary: a fixed, bounded refusal.
//!
//! Archive-materialization ADR: "The one-shot helper therefore cannot compose
//! verification with installation and correctly remains a fixed refusal" until
//! the sealed provisioning transaction (W01.P01.S176) is linked into this
//! process.  The helper must therefore exit `2` with the single bounded token
//! `REFUSED` on stderr and NOTHING on stdout — for a syntactically valid
//! request (the embedded production root is empty until the key ceremony, so
//! verification refuses with `ProductionRootNotProvisioned`) and for a
//! malformed request alike.  No digest, path, or diagnostic detail may cross
//! the process boundary.

use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const HELPER_DEADLINE: Duration = Duration::from_secs(120);

fn run_helper(arguments: &[&str]) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_vaultspec-release-verify"))
        .args(arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn real helper process");
    let deadline = Instant::now() + HELPER_DEADLINE;
    loop {
        match child.try_wait().expect("poll helper") {
            Some(_) => break,
            None if Instant::now() >= deadline => {
                child.kill().expect("kill overdue helper");
                child.wait().expect("reap overdue helper");
                panic!("helper exceeded its wall-clock bound");
            }
            None => std::thread::sleep(Duration::from_millis(10)),
        }
    }
    child.wait_with_output().expect("collect helper output")
}

fn assert_fixed_refusal(output: &std::process::Output) {
    assert_eq!(output.status.code(), Some(2), "fixed refusal exit code");
    assert!(output.stdout.is_empty(), "stdout must stay empty");
    assert_eq!(
        String::from_utf8_lossy(&output.stderr).trim(),
        "REFUSED",
        "stderr carries only the bounded refusal token"
    );
}

#[test]
fn valid_request_returns_the_fixed_bounded_refusal() {
    let temp = tempfile::TempDir::new().expect("temporary roots");
    let bundle = temp.path().join("bundle");
    let product = temp.path().join("product");
    std::fs::create_dir(&bundle).expect("bundle directory");
    std::fs::create_dir(&product).expect("product root");
    let output = run_helper(&[
        "--bundle",
        bundle.to_str().expect("UTF-8 test path"),
        "--product-root",
        product.to_str().expect("UTF-8 test path"),
        "--target",
        "x86_64-pc-windows-msvc",
    ]);
    assert_fixed_refusal(&output);
}

#[test]
fn malformed_request_returns_the_same_fixed_refusal() {
    for arguments in [
        &[][..],
        &["--bundle", "somewhere"][..],
        &[
            "--bundle",
            "somewhere",
            "--product-root",
            "product",
            "--target",
            "not-a-supported-triple",
        ][..],
    ] {
        assert_fixed_refusal(&run_helper(arguments));
    }
}
