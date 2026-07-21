use super::*;

use std::io::Write as _;

/// Env switch that turns this test binary into the chatty child below.
const ENV_CHATTY: &str = "VAULTSPEC_BOUNDED_CHILD_CHATTY";
/// Far more stderr than any OS pipe buffer (64 KiB on Windows and Linux), so an
/// undrained stderr pipe provably blocks the child mid-write.
const CHATTY_STDERR_BYTES: usize = 512 * 1024;
const CHATTY_STDOUT_MARKER: &str = "{\"done\":true}";

/// The real child half of the pipe-deadlock proof. Under the env switch this
/// test writes a pipe-buffer-overflowing stderr FIRST and only then its stdout
/// marker, so a reader that drains stdout alone can never see the marker: the
/// child is blocked writing stderr. Without the switch it is an inert no-op in
/// the normal suite.
#[test]
fn bounded_child_chatty_process() {
    if std::env::var(ENV_CHATTY).is_err() {
        return;
    }
    let noise = vec![b'e'; CHATTY_STDERR_BYTES];
    let mut err = std::io::stderr();
    err.write_all(&noise).unwrap();
    err.flush().unwrap();
    let mut out = std::io::stdout();
    out.write_all(CHATTY_STDOUT_MARKER.as_bytes()).unwrap();
    out.flush().unwrap();
    std::process::exit(0);
}

/// Spawn this test binary as the chatty child.
fn chatty_command() -> tokio::process::Command {
    let mut command = tokio::process::Command::new(std::env::current_exe().unwrap());
    command
        .args([
            "bounded_child::tests::bounded_child_chatty_process",
            "--exact",
            "--nocapture",
            "--test-threads=1",
        ])
        .env(ENV_CHATTY, "1");
    command
}

const PROOF_LIMITS: BoundedLimits = BoundedLimits {
    cap: 8 * 1024 * 1024,
    timeout: std::time::Duration::from_secs(20),
};

#[tokio::test]
async fn a_child_that_overflows_the_stderr_pipe_completes_instead_of_wedging() {
    let outcome = run_bounded(chatty_command(), None, PROOF_LIMITS, CapPolicy::Refuse)
        .await
        .expect("the chatty child must complete under both bounds");
    assert!(outcome.success, "child exited {:?}", outcome.code);
    assert!(
        outcome.stdout_lossy().contains(CHATTY_STDOUT_MARKER),
        "the stdout written AFTER the oversized stderr must arrive"
    );
    assert_eq!(
        outcome.stderr.len(),
        CHATTY_STDERR_BYTES,
        "the whole stderr must be drained, not just a pipe buffer's worth"
    );
    assert!(!outcome.truncated);
}

/// The negative control that proves the hazard is real on THIS platform rather
/// than papered over by a generous pipe buffer: draining stdout alone — exactly
/// what the unfixed runners did — never reaches the child's stdout marker, and
/// the call wedges until its wall-clock bound fires.
#[tokio::test]
async fn draining_stdout_alone_wedges_until_the_wall_clock_bound() {
    let mut child = chatty_command()
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn chatty child");
    let stdout = child.stdout.take().expect("piped stdout");
    let collect = async {
        let mut buf = Vec::new();
        let read = stdout.take(PROOF_LIMITS.cap).read_to_end(&mut buf).await;
        (read, buf)
    };
    let wedged = tokio::time::timeout(std::time::Duration::from_secs(5), collect)
        .await
        .is_err();
    let _ = child.kill().await;
    assert!(
        wedged,
        "an undrained stderr pipe must block the child; if this ever passes the \
         platform buffered the whole stderr and the proof above is vacuous"
    );
}

#[tokio::test]
async fn the_byte_cap_refuses_a_runaway_child_and_kills_it() {
    let limits = BoundedLimits {
        cap: 4 * 1024,
        timeout: std::time::Duration::from_secs(20),
    };
    let fault = run_bounded(chatty_command(), None, limits, CapPolicy::Refuse)
        .await
        .expect_err("a child over the cap is a refusal");
    assert!(matches!(fault, BoundedFault::OverCap), "got {fault:?}");
}

#[tokio::test]
async fn keep_partial_returns_the_bounded_prefix_marked_truncated() {
    let limits = BoundedLimits {
        cap: 4 * 1024,
        timeout: std::time::Duration::from_secs(20),
    };
    let outcome = run_bounded(chatty_command(), None, limits, CapPolicy::KeepPartial)
        .await
        .expect("a capped stream is a bounded answer under KeepPartial");
    assert!(outcome.truncated);
    assert!(!outcome.success);
    assert_eq!(outcome.stderr.len(), 4 * 1024);
}

/// Env switch + marker for the stdin echo child below.
const ENV_ECHO: &str = "VAULTSPEC_BOUNDED_CHILD_ECHO";

/// The real child half of the stdin proof: read stdin to EOF and echo its byte
/// count, proving the runner writes the body AND closes the handle.
#[test]
fn bounded_child_echo_process() {
    if std::env::var(ENV_ECHO).is_err() {
        return;
    }
    let mut body = Vec::new();
    std::io::Read::read_to_end(&mut std::io::stdin(), &mut body).unwrap();
    let mut out = std::io::stdout();
    out.write_all(format!("read:{}", body.len()).as_bytes())
        .unwrap();
    out.flush().unwrap();
    std::process::exit(0);
}

#[tokio::test]
async fn a_stdin_body_is_written_and_the_handle_closed() {
    let mut command = tokio::process::Command::new(std::env::current_exe().unwrap());
    command
        .args([
            "bounded_child::tests::bounded_child_echo_process",
            "--exact",
            "--nocapture",
            "--test-threads=1",
        ])
        .env(ENV_ECHO, "1");
    // A body far larger than the stdin pipe buffer: the write must be
    // concurrent with the output drain or it deadlocks.
    let body = "b".repeat(256 * 1024);
    let outcome = run_bounded(command, Some(&body), PROOF_LIMITS, CapPolicy::Refuse)
        .await
        .expect("the echo child must complete");
    assert!(
        outcome
            .stdout_lossy()
            .contains(&format!("read:{}", body.len())),
        "child saw {:?}",
        outcome.stdout_lossy()
    );
}
