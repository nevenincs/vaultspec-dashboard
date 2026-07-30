//! Bounded execution of installed commands.
//!
//! Every command the certifier runs carries both a captured-output byte cap and
//! a wall clock, and a breach of either kills the whole spawned process group —
//! not merely the direct child, whose descendants would otherwise hold the
//! drained pipes open and make the bound advisory.

use std::ffi::OsString;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::{Duration, Instant};

use crate::{COMMAND_OUTPUT_CAP, COMMAND_WALL, CaseError, EvidenceGap, describe_code, display};

// Bounded execution of installed commands
// ---------------------------------------------------------------------------

/// Bounds on one executed installed command. Both a captured-output byte cap and
/// a wall clock are always present; the child is killed on either breach.
#[derive(Debug, Clone, Copy)]
pub(crate) struct CommandLimits {
    pub(crate) output_cap: usize,
    pub(crate) wall: Duration,
}

/// What an executed installed command produced, with each stream bounded by the
/// cap.
///
/// The two streams are retained SEPARATELY. An installed command that reports a
/// machine-readable projection does so on stdout, and folding stderr into it
/// would make that projection undecodable the moment the command also logged a
/// warning — so a case that reads a command's own report reads `stdout`, while
/// diagnostics render both.
#[derive(Debug)]
pub(crate) struct CommandOutcome {
    /// The real process id the command ran as, retained so a case can reason
    /// about that exact process after it has been reaped.
    pub(crate) pid: u32,
    pub(crate) code: Option<i32>,
    pub(crate) stdout: Vec<u8>,
    pub(crate) stderr: Vec<u8>,
}

impl CommandOutcome {
    /// Both captured streams as bounded lossy text, for a diagnostic line.
    pub(crate) fn text(&self) -> String {
        let mut both = String::from_utf8_lossy(&self.stdout).into_owned();
        both.push(' ');
        both.push_str(&String::from_utf8_lossy(&self.stderr));
        both.replace(['\r', '\n'], " ").trim().to_string()
    }
}

/// Why an installed command could not be executed to completion within bounds.
#[derive(Debug)]
pub(crate) enum CommandFailure {
    Spawn(std::io::Error),
    Timeout(Duration),
    OutputTooLarge(usize),
}

impl std::fmt::Display for CommandFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Spawn(error) => write!(f, "could not be spawned: {error}"),
            Self::Timeout(wall) => write!(f, "exceeded {wall:?} and was killed"),
            Self::OutputTooLarge(cap) => {
                write!(f, "exceeded the {cap}-byte output cap and was killed")
            }
        }
    }
}

/// Execute one installed command with both streams captured under a shared byte
/// cap and a wall clock, killing the whole spawned process TREE on either
/// breach.
///
/// The tree, not the direct child, is what must die: an installed command that
/// spawns helpers leaves those helpers holding the inherited pipe write ends, so
/// killing only the direct child would leave the drain threads blocked on a pipe
/// that never closes and the bound would be advisory rather than enforced.
///
/// Both streams are drained on their own threads so the child can never block on
/// a full pipe; the retained bytes are bounded by the cap and the drain itself is
/// time-bounded because the supervising loop kills the tree as soon as it
/// observes an overflow or passes the deadline.
pub(crate) fn run_bounded(
    program: &Path,
    args: &[OsString],
    envs: &[(String, String)],
    cwd: Option<&Path>,
    limits: CommandLimits,
) -> Result<CommandOutcome, CommandFailure> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (key, value) in envs {
        command.env(key, value);
    }
    if let Some(cwd) = cwd {
        command.current_dir(cwd);
    }

    let mut child = CertifyChild::spawn(&mut command).map_err(CommandFailure::Spawn)?;
    let pid = child.pid();
    let stdout = child
        .take_stdout()
        .ok_or_else(|| CommandFailure::Spawn(std::io::Error::other("no captured stdout")))?;
    let stderr = child
        .take_stderr()
        .ok_or_else(|| CommandFailure::Spawn(std::io::Error::other("no captured stderr")))?;

    let total = Arc::new(AtomicUsize::new(0));
    let overflow = Arc::new(AtomicBool::new(false));
    let out_reader = drain(stdout, limits.output_cap, &total, &overflow);
    let err_reader = drain(stderr, limits.output_cap, &total, &overflow);

    let deadline = Instant::now() + limits.wall;
    let mut breach: Option<CommandFailure> = None;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {}
            Err(error) => {
                child.kill_tree();
                let _ = out_reader.join();
                let _ = err_reader.join();
                return Err(CommandFailure::Spawn(error));
            }
        }
        if overflow.load(Ordering::Acquire) {
            breach = Some(CommandFailure::OutputTooLarge(limits.output_cap));
        } else if Instant::now() >= deadline {
            breach = Some(CommandFailure::Timeout(limits.wall));
        }
        if breach.is_some() {
            child.kill_tree();
            break None;
        }
        std::thread::sleep(Duration::from_millis(20));
    };

    let mut stdout = out_reader.join().unwrap_or_default();
    let mut stderr = err_reader.join().unwrap_or_default();
    if let Some(breach) = breach {
        return Err(breach);
    }
    if total.load(Ordering::Acquire) > limits.output_cap {
        return Err(CommandFailure::OutputTooLarge(limits.output_cap));
    }
    stdout.truncate(limits.output_cap);
    stderr.truncate(limits.output_cap);
    let status = status.expect("a status is present when no breach occurred");
    Ok(CommandOutcome {
        pid,
        code: status.code(),
        stdout,
        stderr,
    })
}

/// A spawned command held as its own process GROUP (Unix) or job object
/// (Windows), so a bound breach can terminate every descendant it created and
/// not merely the process the certifier launched.
pub(crate) enum CertifyChild {
    #[cfg(unix)]
    Unix {
        child: std::process::Child,
        pid: u32,
    },
    #[cfg(windows)]
    Windows(command_group::GroupChild),
}

impl CertifyChild {
    pub(crate) fn spawn(command: &mut Command) -> std::io::Result<Self> {
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt as _;
            command.process_group(0);
            let child = command.spawn()?;
            let pid = child.id();
            Ok(Self::Unix { child, pid })
        }
        #[cfg(windows)]
        {
            use command_group::CommandGroup as _;
            Ok(Self::Windows(command.group_spawn()?))
        }
    }

    /// The real process id of the spawned child.
    pub(crate) fn pid(&mut self) -> u32 {
        match self {
            #[cfg(unix)]
            Self::Unix { pid, .. } => *pid,
            #[cfg(windows)]
            Self::Windows(child) => child.inner().id(),
        }
    }

    pub(crate) fn take_stdout(&mut self) -> Option<std::process::ChildStdout> {
        match self {
            #[cfg(unix)]
            Self::Unix { child, .. } => child.stdout.take(),
            #[cfg(windows)]
            Self::Windows(child) => child.inner().stdout.take(),
        }
    }

    pub(crate) fn take_stderr(&mut self) -> Option<std::process::ChildStderr> {
        match self {
            #[cfg(unix)]
            Self::Unix { child, .. } => child.stderr.take(),
            #[cfg(windows)]
            Self::Windows(child) => child.inner().stderr.take(),
        }
    }

    pub(crate) fn try_wait(&mut self) -> std::io::Result<Option<std::process::ExitStatus>> {
        match self {
            #[cfg(unix)]
            Self::Unix { child, .. } => child.try_wait(),
            #[cfg(windows)]
            Self::Windows(child) => child.try_wait(),
        }
    }

    /// Force-kill the whole spawned tree and reap it.
    pub(crate) fn kill_tree(&mut self) {
        match self {
            #[cfg(unix)]
            Self::Unix { child, pid } => {
                use nix::sys::signal::{Signal, killpg};
                use nix::unistd::Pid;
                if let Ok(raw) = i32::try_from(*pid) {
                    let _ = killpg(Pid::from_raw(raw), Signal::SIGKILL);
                }
                let _ = child.wait();
            }
            #[cfg(windows)]
            Self::Windows(child) => {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

/// Drain one child stream on its own thread, retaining at most `cap` bytes and
/// raising the shared overflow flag once the combined streams pass the cap.
pub(crate) fn drain<R: Read + Send + 'static>(
    mut stream: R,
    cap: usize,
    total: &Arc<AtomicUsize>,
    overflow: &Arc<AtomicBool>,
) -> std::thread::JoinHandle<Vec<u8>> {
    let total = Arc::clone(total);
    let overflow = Arc::clone(overflow);
    std::thread::spawn(move || {
        let mut retained: Vec<u8> = Vec::new();
        let mut scratch = [0_u8; 8192];
        loop {
            match stream.read(&mut scratch) {
                Ok(0) | Err(_) => break,
                Ok(read) => {
                    let seen = total.fetch_add(read, Ordering::AcqRel) + read;
                    if retained.len() < cap {
                        let keep = (cap - retained.len()).min(read);
                        retained.extend_from_slice(&scratch[..keep]);
                    }
                    if seen > cap {
                        overflow.store(true, Ordering::Release);
                    }
                }
            }
        }
        retained
    })
}

/// Execute an installed command under the standard command bounds, mapping a
/// spawn failure to a typed evidence gap naming the component.
pub(crate) fn execute_installed(
    component: &'static str,
    program: &Path,
    args: &[&str],
    envs: &[(String, String)],
    cwd: Option<&Path>,
) -> Result<CommandOutcome, CaseError> {
    let args: Vec<OsString> = args.iter().map(OsString::from).collect();
    let limits = CommandLimits {
        output_cap: COMMAND_OUTPUT_CAP,
        wall: COMMAND_WALL,
    };
    match run_bounded(program, &args, envs, cwd, limits) {
        Ok(outcome) => Ok(outcome),
        Err(CommandFailure::Spawn(error)) => Err(EvidenceGap::ComponentAbsent {
            component,
            relative: format!("{} ({error})", display(program)),
        }
        .into()),
        Err(other) => Err(CaseError::failed(format!(
            "the installed {component} {other}"
        ))),
    }
}

/// Execute an installed command and require it to succeed.
pub(crate) fn require_success(
    component: &'static str,
    program: &Path,
    args: &[&str],
    envs: &[(String, String)],
    cwd: Option<&Path>,
) -> Result<CommandOutcome, CaseError> {
    let outcome = execute_installed(component, program, args, envs, cwd)?;
    if outcome.code == Some(0) {
        Ok(outcome)
    } else {
        Err(CaseError::failed(format!(
            "the installed {component} exited {} for {:?}: {}",
            describe_code(outcome.code),
            args,
            outcome.text()
        )))
    }
}

// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// A real child that outlives its wall clock is KILLED, and the breach is
    /// reported as a timeout rather than a silent pass.
    #[test]
    fn a_command_past_its_wall_clock_is_killed() {
        let (program, args) = sleeper();
        let limits = CommandLimits {
            output_cap: COMMAND_OUTPUT_CAP,
            wall: Duration::from_millis(400),
        };
        let started = Instant::now();
        let refused = run_bounded(Path::new(&program), &args, &[], None, limits);
        assert!(
            matches!(refused, Err(CommandFailure::Timeout(_))),
            "a child past its wall clock must be killed and reported: {refused:?}"
        );
        assert!(
            started.elapsed() < Duration::from_secs(20),
            "the runner must return promptly after killing the child"
        );
    }

    /// A real child that floods its output is KILLED on the byte cap.
    #[test]
    fn a_command_past_its_output_cap_is_killed() {
        let (program, args) = flooder();
        let limits = CommandLimits {
            output_cap: 4096,
            wall: Duration::from_secs(30),
        };
        let refused = run_bounded(Path::new(&program), &args, &[], None, limits);
        assert!(
            matches!(refused, Err(CommandFailure::OutputTooLarge(4096))),
            "a child past its output cap must be killed and reported: {refused:?}"
        );
    }

    /// A real child that exits cleanly is reported with its code and bounded
    /// output — the runner is not merely a killer.
    #[test]
    fn a_bounded_command_reports_its_real_exit_code() {
        let (program, args) = echoer();
        let limits = CommandLimits {
            output_cap: COMMAND_OUTPUT_CAP,
            wall: Duration::from_secs(30),
        };
        let outcome = run_bounded(Path::new(&program), &args, &[], None, limits).unwrap();
        assert_eq!(outcome.code, Some(0));
        assert!(
            outcome.text().contains("certifier"),
            "the runner must retain the child's real output: {}",
            outcome.text()
        );
    }

    /// A spawn of a program that does not exist is a spawn failure, which the
    /// installed-command helper classifies as unavailable evidence.
    #[test]
    fn an_absent_program_is_a_spawn_failure() {
        let refused = execute_installed(
            "dashboard executable",
            Path::new("/no/such/installed/command"),
            &["--version"],
            &[],
            None,
        );
        assert!(matches!(
            refused,
            Err(CaseError::Unavailable(EvidenceGap::ComponentAbsent { .. }))
        ));
    }

    fn sleeper() -> (String, Vec<OsString>) {
        if cfg!(windows) {
            (
                "cmd.exe".to_string(),
                ["/c", "ping -n 30 127.0.0.1 >nul"]
                    .iter()
                    .map(OsString::from)
                    .collect(),
            )
        } else {
            (
                "sh".to_string(),
                ["-c", "sleep 30"].iter().map(OsString::from).collect(),
            )
        }
    }

    fn flooder() -> (String, Vec<OsString>) {
        if cfg!(windows) {
            (
                "cmd.exe".to_string(),
                [
                    "/c",
                    "for /l %i in (1,1,1000000) do @echo xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
                ]
                .iter()
                .map(OsString::from)
                .collect(),
            )
        } else {
            (
                "sh".to_string(),
                ["-c", "yes xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"]
                    .iter()
                    .map(OsString::from)
                    .collect(),
            )
        }
    }

    /// A real child writing to BOTH streams has them retained separately, so a
    /// machine-readable report on stdout stays decodable even when the command
    /// also logs to stderr.
    #[test]
    fn the_two_streams_are_retained_separately() {
        let (program, args) = two_stream_writer();
        let limits = CommandLimits {
            output_cap: COMMAND_OUTPUT_CAP,
            wall: Duration::from_secs(30),
        };
        let outcome = run_bounded(Path::new(&program), &args, &[], None, limits).unwrap();
        let stdout = String::from_utf8_lossy(&outcome.stdout);
        let stderr = String::from_utf8_lossy(&outcome.stderr);
        assert!(
            stdout.contains("report") && !stdout.contains("warning"),
            "stdout must carry only the report: {stdout}"
        );
        assert!(
            stderr.contains("warning"),
            "stderr must carry the log: {stderr}"
        );
        assert!(
            outcome.text().contains("warning"),
            "diagnostics render both"
        );
    }

    fn two_stream_writer() -> (String, Vec<OsString>) {
        if cfg!(windows) {
            (
                "cmd.exe".to_string(),
                ["/c", "echo report& echo warning 1>&2"]
                    .iter()
                    .map(OsString::from)
                    .collect(),
            )
        } else {
            (
                "sh".to_string(),
                ["-c", "echo report; echo warning 1>&2"]
                    .iter()
                    .map(OsString::from)
                    .collect(),
            )
        }
    }

    fn echoer() -> (String, Vec<OsString>) {
        if cfg!(windows) {
            (
                "cmd.exe".to_string(),
                ["/c", "echo certifier"]
                    .iter()
                    .map(OsString::from)
                    .collect(),
            )
        } else {
            (
                "sh".to_string(),
                ["-c", "echo certifier"]
                    .iter()
                    .map(OsString::from)
                    .collect(),
            )
        }
    }
}
