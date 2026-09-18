//! A platform-agnostic child for the authoring fixtures.
//!
//! The fixtures that exercise the bounded-subprocess paths need a child that
//! performs some observable work and then refuses to exit, so the parent's cap
//! or deadline is what ends it. They used to get that from a shell — `sh -c`
//! on Unix and `powershell -Command` on Windows — which cost two things. The
//! branch had to be written and maintained twice, so a fixture only ever
//! proved itself on the platform whose branch was correct; and a cold
//! PowerShell start, which can take seconds on a loaded machine, was charged
//! against a budget meant to cover the WORK. That made the budgets guesses
//! about a transient machine state rather than statements about the code.
//!
//! This binary replaces both branches. It is the same program everywhere, it
//! starts as fast as any other already-built executable, and it reports what
//! it did through a marker file so a test can assert the ORDER it depends on
//! instead of inferring it from elapsed time.
//!
//! `CoreAdapter::invoke` appends the real verb arguments and `--json` to the
//! invocation it is given, so this binary parses ONLY its own leading flags
//! and ignores every remaining argument by design.

use std::io::Write as _;
use std::path::PathBuf;
use std::process::{Command, Stdio};

/// Blocking forever would wedge a runner if a parent ever failed to kill this
/// child, so `--hang` parks for a bounded stretch instead. It is far longer
/// than any fixture deadline, so a parent under test always wins the race.
const HANG: std::time::Duration = std::time::Duration::from_secs(600);

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let mut index = 0usize;
    let mut emit: Option<String> = None;
    let mut copy: Option<(PathBuf, PathBuf)> = None;
    let mut run: Option<Vec<String>> = None;
    let mut landed: Option<PathBuf> = None;
    let mut hang = false;
    let mut code = 0i32;

    // Stops at the first token that is not ours: everything after it belongs
    // to the caller that appended the real verb arguments.
    while index < argv.len() {
        match argv[index].as_str() {
            "--emit" => {
                emit = Some(argv[index + 1].clone());
                index += 2;
            }
            "--copy" => {
                copy = Some((
                    PathBuf::from(&argv[index + 1]),
                    PathBuf::from(&argv[index + 2]),
                ));
                index += 3;
            }
            "--run" => {
                run = Some(
                    serde_json::from_str(&argv[index + 1]).expect("--run takes a JSON argv array"),
                );
                index += 2;
            }
            "--landed" => {
                landed = Some(PathBuf::from(&argv[index + 1]));
                index += 2;
            }
            "--hang" => {
                hang = true;
                index += 1;
            }
            "--exit" => {
                code = argv[index + 1].parse().expect("--exit takes an integer");
                index += 2;
            }
            _ => break,
        }
    }

    if let Some((from, to)) = copy {
        std::fs::copy(&from, &to).expect("child copies its source into place");
    }
    if let Some(command) = run {
        let (program, rest) = command.split_first().expect("--run argv is non-empty");
        let _ = Command::new(program)
            .args(rest)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    if let Some(text) = emit {
        let mut stdout = std::io::stdout();
        stdout
            .write_all(text.as_bytes())
            .expect("child emits its payload");
        stdout.flush().expect("child flushes its payload");
    }
    // Published only once the work above is done, and published ATOMICALLY so
    // a kill can never leave a half-written marker a reader would misread.
    if let Some(path) = landed {
        let staging = path.with_extension("landing");
        std::fs::write(&staging, b"landed").expect("child stages its marker");
        std::fs::rename(&staging, &path).expect("child publishes its marker");
    }
    if hang {
        std::thread::sleep(HANG);
    }
    std::process::exit(code);
}
