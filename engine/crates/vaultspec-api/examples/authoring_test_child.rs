//! A platform-agnostic child for the authoring fixtures.
//!
//! The fixtures that exercise the bounded-subprocess paths need a child that
//! performs some observable work and then refuses to exit, so the parent's cap
//! or deadline is what ends it. They used to get that from a shell — `sh -c`
//! on Unix and `powershell -Command` on Windows — which cost two things. The
//! branch had to be written and maintained twice, so a fixture only ever
//! proved itself on the platform whose branch happened to be right; and a cold
//! PowerShell start, seconds on a loaded machine, was charged against a budget
//! meant to cover the WORK. That made those budgets statements about a
//! transient machine state rather than about this code.
//!
//! This binary replaces both branches. It is the same program on every
//! platform, it starts as fast as any other built executable, and it can
//! publish a marker so a test asserts the ORDER it depends on instead of
//! inferring that order from elapsed time.
//!
//! `CoreAdapter::invoke` appends the real verb arguments and `--json` to the
//! invocation it is handed, so this binary parses ONLY its own leading flags
//! and ignores every remaining argument by design. That is also why it cannot
//! be the test binary re-executing itself: libtest rejects `--json`.

use std::io::Write as _;
use std::path::PathBuf;
use std::process::{Command, Stdio};

/// `--hang` parks rather than blocking forever, so a child can never outlive
/// the run that spawned it if a parent fails to kill it. It is far longer than
/// any fixture deadline, so a parent under test always wins the race.
const HANG: std::time::Duration = std::time::Duration::from_secs(600);

/// Steps run in the order they appear on the command line, so a fixture can
/// express a sequence — create, then set a body, then park — without a shell.
enum Step {
    Copy(PathBuf, PathBuf),
    Remove(PathBuf),
    Run(Vec<String>),
    Emit(String),
    EmitErr(String),
    Landed(PathBuf),
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let mut steps: Vec<Step> = Vec::new();
    let mut hang = false;
    let mut code = 0i32;
    let mut index = 0usize;

    // Stops at the first token that is not ours: everything after it belongs
    // to the caller that appended the real verb arguments.
    while index < argv.len() {
        match argv[index].as_str() {
            "--copy" => {
                steps.push(Step::Copy(
                    PathBuf::from(&argv[index + 1]),
                    PathBuf::from(&argv[index + 2]),
                ));
                index += 3;
            }
            "--remove" => {
                steps.push(Step::Remove(PathBuf::from(&argv[index + 1])));
                index += 2;
            }
            "--run" => {
                steps.push(Step::Run(
                    serde_json::from_str(&argv[index + 1]).expect("--run takes a JSON argv array"),
                ));
                index += 2;
            }
            "--emit" => {
                steps.push(Step::Emit(argv[index + 1].clone()));
                index += 2;
            }
            "--emit-err" => {
                steps.push(Step::EmitErr(argv[index + 1].clone()));
                index += 2;
            }
            "--landed" => {
                steps.push(Step::Landed(PathBuf::from(&argv[index + 1])));
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

    for step in steps {
        match step {
            Step::Copy(from, to) => {
                std::fs::copy(&from, &to).expect("child copies its source into place");
            }
            Step::Remove(path) => {
                std::fs::remove_file(&path).expect("child removes its target");
            }
            Step::Run(command) => {
                let (program, rest) = command.split_first().expect("--run argv is non-empty");
                let _ = Command::new(program)
                    .args(rest)
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();
            }
            Step::Emit(text) => {
                let mut stdout = std::io::stdout();
                stdout
                    .write_all(text.as_bytes())
                    .expect("child emits its payload");
                stdout.flush().expect("child flushes its payload");
            }
            Step::EmitErr(text) => {
                let mut stderr = std::io::stderr();
                stderr
                    .write_all(text.as_bytes())
                    .expect("child emits its diagnostic");
                stderr.flush().expect("child flushes its diagnostic");
            }
            // Published ATOMICALLY, so a kill can never leave a half-written
            // marker that a reader would misinterpret.
            Step::Landed(path) => {
                let staging = path.with_extension("landing");
                std::fs::write(&staging, b"landed").expect("child stages its marker");
                std::fs::rename(&staging, &path).expect("child publishes its marker");
            }
        }
    }

    if hang {
        std::thread::sleep(HANG);
    }
    std::process::exit(code);
}
