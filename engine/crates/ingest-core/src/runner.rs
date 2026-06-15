//! The core subprocess runner (engine-spec §5.1, D5.1).
//!
//! vaultspec-core is Python, the engine is Rust; the process boundary is
//! the only sane seam. Every consumed verb runs as `vaultspec-core …
//! --json` inside the scope's checkout, and every payload passes schema
//! pinning before parsing: unknown schema versions fail loud, never guess.

use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

use serde::Deserialize;

/// Default core stdout ceiling (robustness H1, 2026-06-13): a runaway core verb
/// that streams unbounded stdout would OOM the engine during an index rebuild.
/// Output past the cap is a typed error, never a buffer grown to exhaustion.
///
/// Sized at 64 MiB: a real `vault graph --json` for a large, mature corpus
/// already crosses the original 8 MiB ceiling (this dashboard's own vault is
/// ~8.8 MiB and growing across the concurrent campaigns), which silently took
/// the declared tier offline. 64 MiB keeps generous headroom for corpus growth
/// while still bounding the genuinely pathological case. The ceiling is
/// overridable at runtime via `VAULTSPEC_CORE_STDOUT_CAP_MIB` so a still-larger
/// corpus needs no rebuild.
const DEFAULT_CORE_STDOUT_CAP: u64 = 64 * 1024 * 1024;

/// Resolve the stdout ceiling, honoring the `VAULTSPEC_CORE_STDOUT_CAP_MIB`
/// override (clamped to a 1 MiB floor so a typo cannot disable the bound).
fn resolve_stdout_cap() -> u64 {
    std::env::var("VAULTSPEC_CORE_STDOUT_CAP_MIB")
        .ok()
        .and_then(|v| v.trim().parse::<u64>().ok())
        .map(|mib| mib.max(1) * 1024 * 1024)
        .unwrap_or(DEFAULT_CORE_STDOUT_CAP)
}

/// Default wall-clock ceiling for a single core verb (B1, resource-hardening):
/// a hung `vaultspec-core` (locked venv, stalled import) must not pin the
/// calling thread forever. On the serve path the verb runs on a Tokio
/// blocking-pool thread; an unbounded hang there saturates the pool and stalls
/// every other blocking task. 120 s mirrors the sibling-proxy timeout already
/// enforced on the async `/ops` path.
const DEFAULT_CORE_TIMEOUT_SECS: u64 = 120;

/// Resolve the per-verb wall-clock timeout, honoring `VAULTSPEC_CORE_TIMEOUT_SECS`.
/// A value of `0` disables the timeout (escape hatch for debugging a genuinely
/// long verb); any other value is the deadline in seconds.
fn resolve_timeout() -> Option<Duration> {
    match std::env::var("VAULTSPEC_CORE_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.trim().parse::<u64>().ok())
    {
        Some(0) => None,
        Some(secs) => Some(Duration::from_secs(secs)),
        None => Some(Duration::from_secs(DEFAULT_CORE_TIMEOUT_SECS)),
    }
}

#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("spawning vaultspec-core: {0}")]
    Spawn(#[from] std::io::Error),
    #[error("vaultspec-core exited {code:?}: {stderr}")]
    Failed { code: Option<i32>, stderr: String },
    #[error("malformed JSON envelope: {0}")]
    Json(#[from] serde_json::Error),
    #[error("unknown schema `{found}` (engine supports: {supported})")]
    UnknownSchema { found: String, supported: String },
    #[error("envelope payload missing `data`")]
    MissingData,
    #[error("vaultspec-core produced over {cap_mib} MiB of output (capped)")]
    OutputTooLarge { cap_mib: u64 },
    #[error("vaultspec-core timed out after {secs}s (killed)")]
    Timeout { secs: u64 },
}

pub type Result<T> = std::result::Result<T, CoreError>;

impl CoreError {
    /// A LEAK-FREE category reason safe to surface in a wire `tiers` block.
    /// The full `Display` of a [`CoreError::Failed`] embeds vaultspec-core's
    /// raw stderr — which carries ABSOLUTE filesystem paths and core's
    /// sibling-workspace hint (e.g. naming an unrelated repo elsewhere on the
    /// machine). That detail belongs in the server log for operators, never in
    /// a client response (sweep MEDIUM, 2026-06-13). This returns only the
    /// failure CATEGORY, with no paths or stderr.
    pub fn wire_reason(&self) -> String {
        match self {
            CoreError::Spawn(_) => "vaultspec-core could not be launched".into(),
            CoreError::Failed { code, .. } => format!(
                "vaultspec-core exited unsuccessfully (code {code:?}); the scope \
                 may not be an initialised vaultspec workspace"
            ),
            CoreError::Json(_) => "vaultspec-core emitted a malformed JSON envelope".into(),
            CoreError::UnknownSchema { found, supported } => format!(
                "vaultspec-core graph schema `{found}` is unsupported (engine supports {supported})"
            ),
            CoreError::MissingData => "vaultspec-core envelope was missing its data payload".into(),
            CoreError::OutputTooLarge { cap_mib } => {
                format!("vaultspec-core produced over {cap_mib} MiB of output")
            }
            CoreError::Timeout { secs } => {
                format!("vaultspec-core did not respond within {secs}s and was stopped")
            }
        }
    }
}

/// The versioned `--json` envelope every core verb emits.
#[derive(Debug, Deserialize)]
pub struct Envelope {
    pub schema: String,
    pub status: String,
    pub data: Option<serde_json::Value>,
}

impl Envelope {
    /// Parse raw stdout and enforce schema pinning (D5.1: loud failure).
    pub fn parse_pinned(raw: &str, supported: &[&str]) -> Result<Self> {
        let envelope: Envelope = serde_json::from_str(raw)?;
        if !supported.contains(&envelope.schema.as_str()) {
            return Err(CoreError::UnknownSchema {
                found: envelope.schema,
                supported: supported.join(", "),
            });
        }
        Ok(envelope)
    }

    /// The payload, required.
    pub fn data(self) -> Result<serde_json::Value> {
        self.data.ok_or(CoreError::MissingData)
    }
}

/// Invocation recipe for the core CLI. `detect()` prefers the bare binary
/// on PATH and falls back to the uv-managed environment, mirroring the
/// project's own runtime guidance.
#[derive(Debug, Clone)]
pub struct CoreRunner {
    /// Program plus leading arguments, e.g. `["vaultspec-core"]` or
    /// `["uv", "run", "--no-sync", "vaultspec-core"]`.
    pub invocation: Vec<String>,
    /// Stdout ceiling in bytes; output past it fails typed (never OOM).
    stdout_cap: u64,
    /// Wall-clock ceiling for a single verb; `None` disables it. A hung child
    /// past this deadline is killed and the call fails typed (never hangs).
    timeout: Option<Duration>,
}

impl CoreRunner {
    pub fn new(invocation: Vec<String>) -> Self {
        CoreRunner {
            invocation,
            stdout_cap: resolve_stdout_cap(),
            timeout: resolve_timeout(),
        }
    }

    /// Override the stdout ceiling (bytes). Used by tests to trip the cap
    /// deterministically without emitting tens of MiB.
    pub fn with_stdout_cap(mut self, cap: u64) -> Self {
        self.stdout_cap = cap;
        self
    }

    /// Override the wall-clock timeout. Used by tests to trip the deadline
    /// deterministically without waiting the production default.
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = Some(timeout);
        self
    }

    pub fn detect() -> Self {
        if which("vaultspec-core") {
            CoreRunner::new(vec!["vaultspec-core".into()])
        } else {
            CoreRunner::new(
                ["uv", "run", "--no-sync", "vaultspec-core"]
                    .map(String::from)
                    .to_vec(),
            )
        }
    }

    /// Run a core verb with `--json` inside `cwd` (the scope's checkout —
    /// scope is per-request, engine-spec §2.3) and return the pinned,
    /// parsed envelope.
    pub fn run_json(&self, cwd: &Path, args: &[&str], supported: &[&str]) -> Result<Envelope> {
        let mut cmd = Command::new(&self.invocation[0]);
        cmd.args(&self.invocation[1..])
            .args(args)
            .arg("--json")
            .current_dir(cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = cmd.spawn()?;

        // Read stdout under the byte ceiling (robustness H1) on a worker thread,
        // so the parent can enforce a wall-clock deadline AND kill a hung child
        // (B1, resource-hardening). A blocking `read_to_end` here would pin this
        // thread forever on a stalled child; on the serve path that thread is a
        // Tokio blocking-pool worker, so an unbounded hang saturates the pool.
        // std `thread` + `mpsc::recv_timeout` gives a portable deadline with no
        // new dependency.
        let cap = self.stdout_cap;
        let stdout_pipe = child.stdout.take().expect("piped stdout");
        let (tx, rx) = mpsc::channel();
        let reader = std::thread::spawn(move || {
            let mut buf = Vec::new();
            let res = stdout_pipe.take(cap).read_to_end(&mut buf).map(|_| buf);
            let _ = tx.send(res);
        });

        let recv = match self.timeout {
            Some(deadline) => rx.recv_timeout(deadline),
            None => rx.recv().map_err(|_| mpsc::RecvTimeoutError::Disconnected),
        };
        let stdout = match recv {
            Ok(Ok(buf)) => buf,
            Ok(Err(io_err)) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = reader.join();
                return Err(io_err.into());
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                // The child outran its deadline: kill it (no zombie, frees the
                // pipe so the reader unblocks) and fail typed rather than hang.
                let _ = child.kill();
                let _ = child.wait();
                let _ = reader.join();
                return Err(CoreError::Timeout {
                    secs: self.timeout.map(|d| d.as_secs()).unwrap_or_default(),
                });
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(CoreError::Failed {
                    code: None,
                    stderr: "vaultspec-core stdout reader terminated unexpectedly".into(),
                });
            }
        };
        let _ = reader.join();
        // Output exceeded the cap: kill the child (no zombie) and fail typed
        // rather than parse a truncated envelope.
        if stdout.len() as u64 >= cap {
            let _ = child.kill();
            let _ = child.wait();
            return Err(CoreError::OutputTooLarge {
                cap_mib: cap.div_ceil(1024 * 1024),
            });
        }

        let status = child.wait()?;
        if !status.success() {
            let stderr = child
                .stderr
                .take()
                .map(|mut e| {
                    let mut buf = String::new();
                    let _ = e.read_to_string(&mut buf);
                    buf
                })
                .unwrap_or_default();
            return Err(CoreError::Failed {
                code: status.code(),
                stderr,
            });
        }
        Envelope::parse_pinned(&String::from_utf8_lossy(&stdout), supported)
    }
}

fn which(program: &str) -> bool {
    let Some(paths) = std::env::var_os("PATH") else {
        return false;
    };
    for dir in std::env::split_paths(&paths) {
        for ext in ["", ".exe", ".cmd", ".bat"] {
            if dir.join(format!("{program}{ext}")).is_file() {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pinned_parse_accepts_supported_schema() {
        let raw =
            r#"{"schema":"vaultspec.vault.stats.v1","status":"unchanged","data":{"total_docs":1}}"#;
        let envelope = Envelope::parse_pinned(raw, &["vaultspec.vault.stats.v1"]).unwrap();
        assert_eq!(envelope.status, "unchanged");
        assert_eq!(envelope.data().unwrap()["total_docs"], 1);
    }

    #[test]
    fn unknown_schema_fails_loud_with_both_sides_named() {
        let raw = r#"{"schema":"vaultspec.vault.graph.v999","status":"ok","data":{}}"#;
        let err = Envelope::parse_pinned(raw, &["vaultspec.vault.graph.v2"]).unwrap_err();
        let message = err.to_string();
        assert!(message.contains("v999"), "names the found schema");
        assert!(message.contains("graph.v2"), "names what is supported");
    }

    #[test]
    fn malformed_json_is_a_typed_error() {
        assert!(matches!(
            Envelope::parse_pinned("not json", &[]),
            Err(CoreError::Json(_))
        ));
    }

    /// A CoreRunner that invokes the OS shell, so `run_json`'s subprocess plumbing
    /// (stdout cap, status inspection) can be exercised without a real
    /// vaultspec-core. The `--json` arg `run_json` appends is harmless to the
    /// shell snippets below (they ignore extra args).
    fn shell_runner(snippet: &str) -> CoreRunner {
        if cfg!(windows) {
            CoreRunner::new(vec!["cmd".into(), "/C".into(), snippet.into()])
        } else {
            CoreRunner::new(vec!["sh".into(), "-c".into(), snippet.into()])
        }
    }

    #[test]
    fn run_json_streams_a_small_envelope_through() {
        // Echo a valid pinned envelope on stdout (success path, status 0).
        let body = r#"{"schema":"x.v1","status":"ok","data":{"n":1}}"#;
        let snippet = if cfg!(windows) {
            // cmd echo keeps the quotes; emit raw JSON via a here-ish trick.
            format!("echo {}", body.replace('"', "\\\""))
        } else {
            format!("printf '%s' '{body}'")
        };
        let runner = shell_runner(&snippet);
        let cwd = std::env::current_dir().unwrap();
        let env = runner.run_json(&cwd, &[], &["x.v1"]);
        // On Windows `echo` may mangle quoting; tolerate that by only asserting
        // the happy path on Unix, where printf is byte-exact. Either way the
        // subprocess plumbing must not panic or hang.
        if cfg!(unix) {
            let env = env.expect("valid envelope parses");
            assert_eq!(env.status, "ok");
            assert_eq!(env.data().unwrap()["n"], 1);
        }
    }

    #[test]
    fn run_json_reports_a_nonzero_exit_as_failed() {
        // A crashed core verb (non-zero exit) is a typed Failed error, never a
        // silently-parsed empty envelope.
        let snippet = "exit 3";
        let runner = shell_runner(snippet);
        let cwd = std::env::current_dir().unwrap();
        let err = runner.run_json(&cwd, &[], &["x.v1"]).unwrap_err();
        assert!(
            matches!(err, CoreError::Failed { code: Some(3), .. })
                || matches!(err, CoreError::Failed { .. }),
            "non-zero exit → Failed, got {err:?}"
        );
    }

    #[test]
    fn run_json_caps_runaway_stdout_instead_of_oom() {
        // A sibling that streams more than the ceiling is stopped and fails
        // typed (OutputTooLarge), never grown to exhaustion. A small per-runner
        // cap (1 MiB) lets the cap trip deterministically while emitting only
        // ~2 MiB, so the test stays fast regardless of the production default.
        let cap: u64 = 1024 * 1024;
        let bytes = (cap + 1024 * 1024) as usize;
        let runner = if cfg!(windows) {
            // PowerShell is reliably present on Windows; emit a long run of 'x'.
            // Wrap in `& { ... }` so the trailing `--json` arg run_json appends
            // lands in the script block's $args (ignored) instead of being
            // concatenated into the expression.
            let ps = format!("& {{ [Console]::Out.Write('x' * {bytes}) }}");
            CoreRunner::new(vec![
                "powershell".into(),
                "-NoProfile".into(),
                "-Command".into(),
                ps,
            ])
            .with_stdout_cap(cap)
        } else {
            shell_runner(&format!("head -c {bytes} /dev/zero | tr '\\0' 'x'")).with_stdout_cap(cap)
        };
        let cwd = std::env::current_dir().unwrap();
        let err = runner.run_json(&cwd, &[], &["x.v1"]).unwrap_err();
        assert!(
            matches!(err, CoreError::OutputTooLarge { .. }),
            "runaway stdout → OutputTooLarge, got {err:?}"
        );
    }

    /// P01.S01 (reproduce) + P02.S05 (fix): a hung core verb is killed at the
    /// wall-clock deadline and fails typed (Timeout), instead of pinning the
    /// calling thread for the child's full lifetime. Proves the deadline frees
    /// the thread promptly — the property that keeps the Tokio blocking pool
    /// from saturating on a stalled subprocess.
    #[test]
    fn run_json_kills_a_hung_child_at_the_timeout() {
        let runner = if cfg!(windows) {
            // `& { ... }` so the trailing `--json` run_json appends lands in the
            // block's $args (ignored) rather than erroring the -Command parse.
            CoreRunner::new(vec![
                "powershell".into(),
                "-NoProfile".into(),
                "-Command".into(),
                "& { Start-Sleep -Seconds 30 }".into(),
            ])
            .with_timeout(Duration::from_millis(400))
        } else {
            // `sh -c "sleep 30"` ignores the trailing `--json` ($0).
            shell_runner("sleep 30").with_timeout(Duration::from_millis(400))
        };
        let cwd = std::env::current_dir().unwrap();
        let start = std::time::Instant::now();
        let err = runner.run_json(&cwd, &[], &["x.v1"]).unwrap_err();
        let elapsed = start.elapsed();
        assert!(
            matches!(err, CoreError::Timeout { .. }),
            "hung child → Timeout, got {err:?}"
        );
        assert!(
            elapsed < Duration::from_secs(10),
            "returned at the deadline (~0.4s), not after the 30s sleep; took {elapsed:?}"
        );
    }
}
