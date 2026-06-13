//! The core subprocess runner (engine-spec §5.1, D5.1).
//!
//! vaultspec-core is Python, the engine is Rust; the process boundary is
//! the only sane seam. Every consumed verb runs as `vaultspec-core …
//! --json` inside the scope's checkout, and every payload passes schema
//! pinning before parsing: unknown schema versions fail loud, never guess.

use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};

use serde::Deserialize;

/// Core stdout ceiling (robustness H1, 2026-06-13): a runaway core verb that
/// streams unbounded stdout would OOM the engine during an index rebuild. Core
/// `--json` envelopes are small; 8 MiB is orders of magnitude of headroom
/// while bounding the pathological case. Output past the cap is a typed error,
/// never a buffer grown to exhaustion.
const CORE_STDOUT_CAP: u64 = 8 * 1024 * 1024;

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
}

impl CoreRunner {
    pub fn new(invocation: Vec<String>) -> Self {
        CoreRunner { invocation }
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

        // Read stdout under an 8 MiB ceiling (robustness H1): a runaway core
        // verb cannot OOM the engine by streaming unbounded stdout. A wall-clock
        // timeout is NOT added here — ingest-core carries no async/threading
        // dependency and a portable blocking-read timeout needs one; deferred as
        // a follow-up (the dependency decision belongs to the engine owners).
        // The async ops.rs path already enforces both cap AND timeout.
        let mut stdout_pipe = child.stdout.take().expect("piped stdout");
        let mut stdout = Vec::new();
        stdout_pipe
            .by_ref()
            .take(CORE_STDOUT_CAP)
            .read_to_end(&mut stdout)?;
        // Output exceeded the cap: kill the child (no zombie) and fail typed
        // rather than parse a truncated envelope.
        if stdout.len() as u64 >= CORE_STDOUT_CAP {
            let _ = child.kill();
            let _ = child.wait();
            return Err(CoreError::OutputTooLarge {
                cap_mib: CORE_STDOUT_CAP / (1024 * 1024),
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
        let snippet = if cfg!(windows) { "exit 3" } else { "exit 3" };
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
        // A sibling that streams more than the 8 MiB ceiling is stopped and
        // fails typed (OutputTooLarge), never grown to exhaustion. We emit ~9
        // MiB so the cap trips deterministically.
        let bytes = (CORE_STDOUT_CAP + 1024 * 1024) as usize;
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
        } else {
            shell_runner(&format!("head -c {bytes} /dev/zero | tr '\\0' 'x'"))
        };
        let cwd = std::env::current_dir().unwrap();
        let err = runner.run_json(&cwd, &[], &["x.v1"]).unwrap_err();
        assert!(
            matches!(err, CoreError::OutputTooLarge { .. }),
            "runaway stdout → OutputTooLarge, got {err:?}"
        );
    }
}
