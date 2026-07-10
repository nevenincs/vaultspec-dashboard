//! The core subprocess runner (engine-spec §5.1, D5.1).
//!
//! vaultspec-core is Python, the engine is Rust; the process boundary is
//! the only sane seam. Every consumed verb runs as `vaultspec-core …
//! --json` inside the scope's checkout, and every payload passes schema
//! pinning before parsing: unknown schema versions fail loud, never guess.

use std::io::Read;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{OnceLock, mpsc};
use std::time::Duration;

use serde::Deserialize;

/// Kill the child and, on Unix, its whole process group. The child is spawned
/// as a group leader (`process_group(0)`), so a grandchild that inherited the
/// stdout pipe (e.g. a shell's `sleep`, or the Python core under a `uv run`
/// launcher) is signalled too and the reader thread unblocks at the deadline
/// instead of waiting for that grandchild to exit. On Windows `Child::kill`
/// calls `TerminateProcess`, which terminates ONLY the target process — a
/// grandchild (the `uv`/console-script launcher's Python child) SURVIVES; a true
/// subtree kill there needs a Job Object, which this runner deliberately does not
/// take (dependency-free). Exposed `pub` so the fenced authoring core adapter can
/// reuse this exact group-kill semantics rather than reinvent a weaker one.
pub fn terminate(child: &mut Child) {
    #[cfg(unix)]
    {
        use nix::sys::signal::{Signal, killpg};
        use nix::unistd::Pid;
        // The child is its own group leader (`process_group(0)`), so its pid is
        // the pgid; signalling the group reaps the shell AND its grandchildren.
        // An already-reaped group yields ESRCH, which is ignored.
        let _ = killpg(Pid::from_raw(child.id() as i32), Signal::SIGKILL);
    }
    let _ = child.kill();
}

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

    /// Resolve the core invocation, PREFERRING the project-pinned (uv-managed)
    /// environment over an arbitrary `PATH` binary, and VERIFYING the chosen
    /// invocation actually ships the document write verbs.
    ///
    /// This closes the document-edit-hardening F1 defect: the prior `detect()`
    /// preferred a bare `vaultspec-core` on `PATH`, which is commonly a stale
    /// global (e.g. a `uv tool` install) that lacks the `vault set-body` /
    /// `set-frontmatter` / `edit` verbs. Reads kept working against the old verbs,
    /// so the staleness was invisible until a write failed with a cryptic non-zero
    /// exit. The engine must broker the version the project pins, not whatever
    /// binary happens to be first on `PATH`.
    ///
    /// The resolution is memoized (the capability probe spawns a subprocess once),
    /// so per-call cost stays a clone. When no candidate is capable the uv-run
    /// invocation is returned so the failure surfaces through the normal typed
    /// error path (the write boundary degrades with an advisory) rather than
    /// silently selecting a stale binary.
    pub fn detect() -> Self {
        static RESOLVED: OnceLock<Vec<String>> = OnceLock::new();
        let invocation = RESOLVED.get_or_init(resolve_core_invocation).clone();
        CoreRunner::new(invocation)
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
        // Put the child in its own process group (Unix) so a timeout kills the
        // WHOLE tree, not just the direct child. A shell verb like `sh -c "..."`
        // spawns its real work as a grandchild that inherits the stdout pipe;
        // killing only the shell orphans the grandchild, which holds the pipe
        // open and blocks the reader thread until it exits on its own. Killing
        // the group reaps both, so the deadline frees the thread promptly.
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt as _;
            cmd.process_group(0);
        }
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
                terminate(&mut child);
                let _ = child.wait();
                let _ = reader.join();
                return Err(io_err.into());
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                // The child outran its deadline: kill the whole group (no zombie,
                // frees the pipe so the reader unblocks) and fail typed rather
                // than hang.
                terminate(&mut child);
                let _ = child.wait();
                let _ = reader.join();
                return Err(CoreError::Timeout {
                    secs: self.timeout.map(|d| d.as_secs()).unwrap_or_default(),
                });
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                // The reader thread ended (panicked) — that is WHY the channel
                // disconnected — so the join returns immediately; kept for
                // symmetry with the other exit arms (no orphaned thread).
                terminate(&mut child);
                let _ = child.wait();
                let _ = reader.join();
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
            terminate(&mut child);
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

/// The document write verb whose presence distinguishes a project-pinned core
/// that can serve the editor from a stale global that cannot. Probing one verb is
/// sufficient: the edit verbs (`set-body` / `set-frontmatter` / `edit`) shipped
/// together, so `set-body` is a faithful capability sentinel.
const CAPABILITY_SENTINEL_VERB: &str = "set-body";

/// Wall-clock bound for the capability probe (B1/B2, resource-hardening;
/// subprocess-calls-carry-cap-and-timeout). `--help` returns near-instantly on a
/// healthy core, but a stale/broken core (a stalled venv import, a wedged
/// interpreter) can hang it forever; without a deadline the probe would pin the
/// caller — on the serve path a Tokio blocking-pool worker — indefinitely, the
/// exact hang `run_json` was hardened against. A breach kills the child and
/// reports not-capable; `resolve_core_invocation` then falls back to the uv-run
/// invocation so the real failure surfaces through the typed `run_json` path.
/// Generous (covers a cold `uv run` resolve) yet finite.
const CAPABILITY_PROBE_TIMEOUT: Duration = Duration::from_secs(30);

/// Probe whether an invocation's core ships the document write verbs by asking it
/// to describe the sentinel verb (`vault set-body --help`). A core that ships the
/// verb exits 0; a stale core answers "No such command" with a non-zero exit. An
/// invocation that cannot spawn — or that outruns [`CAPABILITY_PROBE_TIMEOUT`] —
/// is not capable.
///
/// Bounded like `run_json`: stdout is drained on a worker thread so the parent can
/// enforce a wall-clock deadline AND kill a hung child, rather than blocking on a
/// stalled `--help`. No new dependency (std `thread` + `mpsc::recv_timeout`).
fn provides_write_verb(invocation: &[String]) -> bool {
    let Some((program, leading)) = invocation.split_first() else {
        return false;
    };
    let spawned = Command::new(program)
        .args(leading)
        .args(["vault", CAPABILITY_SENTINEL_VERB, "--help"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn();
    let Ok(mut child) = spawned else {
        return false;
    };
    // Drain stdout on a worker thread; `--help` output is tiny, so a small
    // ceiling guards a pathological child while keeping the pipe from filling.
    let stdout_pipe = child.stdout.take().expect("piped stdout");
    let (tx, rx) = mpsc::channel();
    let reader = std::thread::spawn(move || {
        let mut sink = Vec::new();
        let _ = stdout_pipe.take(64 * 1024).read_to_end(&mut sink);
        let _ = tx.send(());
    });
    let drained = rx.recv_timeout(CAPABILITY_PROBE_TIMEOUT).is_ok();
    if !drained {
        // The probe outran its deadline: kill the child (frees the pipe so the
        // reader unblocks) and report not-capable rather than hang forever.
        let _ = child.kill();
    }
    let status = child.wait();
    let _ = reader.join();
    drained && status.map(|s| s.success()).unwrap_or(false)
}

/// Resolve the core invocation once: prefer the project-pinned uv-managed core,
/// then a bare `PATH` core, accepting the FIRST that actually ships the write
/// verbs. The ordering is the fix for F1 — the uv-managed env carries the version
/// the project pins, while a bare `PATH` core may be a stale global. When neither
/// candidate is capable, return the uv-run invocation (when `uv` is available) so
/// the capability failure surfaces through the normal typed error path rather than
/// silently binding a stale binary.
fn resolve_core_invocation() -> Vec<String> {
    let uv_run: Vec<String> = ["uv", "run", "--no-sync", "vaultspec-core"]
        .map(String::from)
        .to_vec();
    let bare: Vec<String> = vec!["vaultspec-core".to_string()];

    if which("uv") && provides_write_verb(&uv_run) {
        return uv_run;
    }
    if which("vaultspec-core") && provides_write_verb(&bare) {
        return bare;
    }
    if which("uv") { uv_run } else { bare }
}

/// The minimum core version whose working-tree `vault graph` is verified
/// DOCUMENT-READ-ONLY — it mutates no `.vault/` document (graph-worktree-edge-consistency
/// ADR; the `modified:` stamp and `.gitignore` rewrite the 2026-06-13 finding hit belong
/// to `vault check --fix` / `vault repair`, never to `graph`). The present-view
/// working-tree declared read is gated on this floor; an older or unknown core falls
/// back to the committed `HEAD` read so a regressed/old core can never silently mutate
/// the corpus on every edit. Verified empirically against the installed 0.1.34.
pub const MIN_READONLY_WORKTREE_GRAPH: (u64, u64, u64) = (0, 1, 34);

/// The resolved core's `MAJOR.MINOR.PATCH` version, memoized. `None` when the version
/// cannot be obtained or parsed (treated conservatively as "unknown"). Probes the SAME
/// invocation [`CoreRunner::detect`] resolves, so the version reflects the core the
/// engine actually brokers.
pub fn core_version() -> Option<(u64, u64, u64)> {
    static VERSION: OnceLock<Option<(u64, u64, u64)>> = OnceLock::new();
    *VERSION.get_or_init(probe_core_version_uncached)
}

/// The uncached core-version probe: re-resolve the invocation and run
/// `--version` fresh every call, never touching a memo. This is the
/// post-provision reconciliation seam (project-provisioning ADR D6): after a
/// dashboard-driven `uv tool install`/`upgrade` of `vaultspec-core`, the
/// memoized [`core_version`] and the handshake's memoized probe both still
/// report the pre-install version, so the reconciler re-probes through here to
/// learn the just-installed version WITHOUT a process restart. It re-resolves
/// the invocation from scratch ([`resolve_core_invocation`], not the memoized
/// [`CoreRunner::detect`]) so a FIRST-EVER install — where `detect` cached a
/// "core absent" fallback at boot — is picked up too.
pub fn core_version_fresh() -> Option<(u64, u64, u64)> {
    probe_core_version_uncached()
}

/// Spawn `<core> --version` bounded (output cap + wall-clock deadline,
/// resource-bounds) and parse the triple. `None` when the version cannot be
/// obtained or parsed (treated conservatively as "unknown"). Re-resolves the
/// invocation each call so it reflects the core the engine WOULD broker right
/// now, not the one cached at boot.
fn probe_core_version_uncached() -> Option<(u64, u64, u64)> {
    // Bounded like the capability probe (resource-bounds: every subprocess
    // carries an output cap AND a wall-clock deadline). This probe sits on
    // the serve startup gate (dashboard-packaging D3), so a stuck child —
    // e.g. a stalled cold `uv run` resolve — must be killed and reported
    // as unknown, never allowed to hang startup.
    let invocation = resolve_core_invocation();
    let (program, leading) = invocation.split_first()?;
    let mut child = Command::new(program)
        .args(leading)
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let stdout_pipe = child.stdout.take().expect("piped stdout");
    let (tx, rx) = mpsc::channel();
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let res = stdout_pipe
            .take(64 * 1024)
            .read_to_end(&mut buf)
            .map(|_| buf);
        let _ = tx.send(res);
    });
    let drained = rx.recv_timeout(CAPABILITY_PROBE_TIMEOUT);
    if drained.is_err() {
        let _ = child.kill();
    }
    let status = child.wait();
    let _ = reader.join();
    let bytes = drained.ok()?.ok()?;
    if !status.map(|s| s.success()).unwrap_or(false) {
        return None;
    }
    parse_semver(&String::from_utf8_lossy(&bytes))
}

/// Parse the first `MAJOR.MINOR.PATCH` triple from version output, tolerant of a
/// leading program name / `version` prefix (e.g. `vaultspec-core 0.1.34`, `v0.1.34`)
/// and a pre-release/build suffix on the patch (e.g. `0.1.34-rc1`).
fn parse_semver(s: &str) -> Option<(u64, u64, u64)> {
    for token in s.split(|c: char| c.is_whitespace() || c == ',') {
        let core = token.trim().trim_start_matches('v');
        let mut parts = core.split('.');
        // A token without three dot-separated parts is not a version — skip it
        // (e.g. a leading program name like `vaultspec-core`) rather than aborting
        // the whole scan.
        let (Some(a), Some(b), Some(c)) = (parts.next(), parts.next(), parts.next()) else {
            continue;
        };
        let patch_num: String = c.chars().take_while(|ch| ch.is_ascii_digit()).collect();
        if let (Ok(a), Ok(b), Ok(p)) =
            (a.parse::<u64>(), b.parse::<u64>(), patch_num.parse::<u64>())
        {
            return Some((a, b, p));
        }
    }
    None
}

/// Whether the resolved core's working-tree `vault graph` is verified
/// document-read-only (version ≥ [`MIN_READONLY_WORKTREE_GRAPH`]). An unknown or older
/// version returns `false` so the caller falls back to the committed `HEAD` read —
/// fail-safe: never issue a working-tree read against a core that might mutate.
pub fn supports_readonly_worktree_graph() -> bool {
    core_version().is_some_and(|v| v >= MIN_READONLY_WORKTREE_GRAPH)
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
    fn semver_parse_and_readonly_floor() {
        // The version gate is the fail-safe for the present-view working-tree read
        // (graph-worktree-edge-consistency ADR): only a core at or above the verified
        // read-only floor may issue it; anything older/unparseable falls back to HEAD.
        assert_eq!(parse_semver("0.1.34\n"), Some((0, 1, 34)));
        assert_eq!(parse_semver("vaultspec-core 0.1.36"), Some((0, 1, 36)));
        assert_eq!(parse_semver("v0.1.34-rc1"), Some((0, 1, 34)));
        assert_eq!(parse_semver("not a version"), None);
        // The installed-and-verified version is exactly the floor → supported.
        assert!((0, 1, 34) >= MIN_READONLY_WORKTREE_GRAPH);
        // A pre-floor core is NOT trusted for the working-tree read (falls back).
        assert!((0, 1, 33) < MIN_READONLY_WORKTREE_GRAPH);
        // A later core is trusted.
        assert!((0, 2, 0) >= MIN_READONLY_WORKTREE_GRAPH);
    }

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

    /// W01.P01: the capability probe reads the sentinel verb's exit status, so a
    /// stale core (non-zero "No such command") is rejected and only a capable core
    /// is accepted. Exercised through the OS shell so the exit-status branch is
    /// deterministic without a real vaultspec-core; the non-spawnable and empty
    /// cases are cross-platform.
    #[test]
    fn provides_write_verb_reads_exit_status() {
        if cfg!(unix) {
            // `sh -c "exit 0" vault set-body --help` runs "exit 0" (extra args are
            // positional and ignored) -> exit 0 -> capable.
            assert!(
                provides_write_verb(&["sh".into(), "-c".into(), "exit 0".into()]),
                "a zero exit means the verb is present -> capable"
            );
            assert!(
                !provides_write_verb(&["sh".into(), "-c".into(), "exit 7".into()]),
                "a non-zero exit (No such command) -> not capable"
            );
        }
        // A core that cannot even spawn, or an empty invocation, is never capable.
        assert!(!provides_write_verb(&[
            "definitely-not-a-real-program-xyzzy".into()
        ]));
        assert!(!provides_write_verb(&[]));
    }
}
