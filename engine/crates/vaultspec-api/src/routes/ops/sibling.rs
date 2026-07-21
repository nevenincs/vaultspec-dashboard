//! The sibling-runner machinery behind the ops proxies: the whitelists, the
//! spawn-bounded-read-kill subprocess helpers, the rag storage-namespace
//! guards, and the rag service lifecycle (start/stop) capture. Split out of
//! `ops.rs` so the runner and the thin HTTP handlers each stay under the
//! module-size cap; the handlers in the parent module compose these through a
//! `pub(super)` surface.

use std::path::Path as FsPath;
use std::time::Duration;

use axum::Json;
use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::app::{AppState, ScopeCell};
use crate::bounded_child::{BoundedLimits, CapPolicy, run_bounded};

use super::{ApiResult, RagControlBody, SIBLING_STDOUT_CAP, SIBLING_TIMEOUT};

/// The `/search` HTTP budget (rag-integration-hardening D1/D2): search now rides
/// the WARM resident rag service over the loopback transport, not a per-query CLI
/// spawn, so it belongs to the Tier-1 READ class — a warm semantic round-trip,
/// never the cold-spawn ceiling the deleted subprocess path needed. Pinned to
/// rag-client's `READ_BUDGET` (10s) so a stalled service degrades the semantic
/// tier quickly while a busy warm query still completes. The client search
/// budget strictly exceeds this so the tiers envelope always lands before the
/// client can abort (D2).
pub(super) const SEARCH_HTTP_BUDGET: Duration = rag_client::control::READ_BUDGET;

/// Destructive-storage budget (rag-storage-broker ADR D4): a `prune` of a large
/// orphaned set or an apply-mode `migrate` of a big shared store legitimately runs
/// longer than the reindex budget, so the storage runner gets a more generous - but
/// still bounded - ceiling rather than the 120s reindex bound killing a destructive
/// apply mid-flight. Still bounded so a wedged storage op cannot pin an async worker
/// forever; a breach kills the child and returns a 504. (A `migrate` is a COPY to the
/// other backend, so a killed apply is recoverable by re-running, never source loss.)
pub(super) const STORAGE_SIBLING_TIMEOUT: Duration = Duration::from_secs(300);

/// Search request query ceiling. The frontend intent store clips at the same
/// user-facing size, but the API is a public boundary and must reject unbounded
/// external callers before building rag argv.
pub(super) const MAX_SEARCH_QUERY_CHARS: usize = 512;

/// Search result ceiling forwarded to rag. Absent `max_results` lets rag use its
/// own default; an explicit request above this API ceiling is rejected before the
/// sibling process is spawned.
pub(super) const MAX_SEARCH_RESULTS: u32 = 50;

/// The R1 core whitelist: vault check + stats. Anything else is a sibling
/// filing, not whitelist growth.
pub(super) const CORE_WHITELIST: &[(&str, &[&str])] = &[
    ("vault-check", &["vault", "check", "all"]),
    ("vault-stats", &["vault", "stats"]),
];

/// The JSON-runner lifecycle whitelist: the process-lifecycle rag verbs that run
/// through the shared bounded `--json` sibling runner (rag-control-plane ADR D1,
/// P02.S13) — you cannot HTTP a service that is not running, so status / doctor /
/// install stay CLI subprocess reads. `server-start` / `server-stop` are ALSO
/// process lifecycle but are dispatched to their OWN dedicated capture handlers
/// (`start_rag_service` / `stop_rag_service` — the machine-singleton
/// attach-never-own discipline, with version-tolerant `--json` on start), so they
/// intercept BEFORE this lookup and are deliberately NOT listed here (RCR-004: a
/// dead row here would only ever fall through to `run_sibling`, which appends
/// `--json` unconditionally — the exact rejection those handlers exist to manage).
/// Every other rag verb — the reindex TRIGGER, job polling, watcher config,
/// project management, and the observability reads — is brokered over rag's HTTP
/// service through the `rag_client::control` module (the HTTP-brokered verbs
/// below), because rag's runtime truth lives on the running service and a reindex
/// is job-based (returns a `job_id`, polled via `/jobs`), never a blocking CLI call.
pub(super) const RAG_CLI_WHITELIST: &[(&str, &[&str])] = &[
    ("server-status", &["server", "status"]),
    ("server-doctor", &["server", "doctor"]),
    ("server-install", &["install"]),
];

/// The DESTRUCTIVE rag storage CLI whitelist: verb -> fixed rag base args
/// (rag-storage-broker ADR D1). rag exposes these CLI-only (the destructive
/// storage HTTP routes were deliberately closed), so - like the lifecycle verbs -
/// they run on the bounded subprocess runner, never over HTTP. They live in their
/// OWN whitelist and route, not [`RAG_CLI_WHITELIST`], because each takes a
/// VALIDATED argument (a namespace prefix, a backend enum) and a destructive
/// dry-run/apply gate the argument-free lifecycle verbs do not.
pub(super) const RAG_STORAGE_CLI_WHITELIST: &[(&str, &[&str])] = &[
    ("storage-delete", &["server", "storage", "delete"]),
    ("storage-prune", &["server", "storage", "prune"]),
    ("storage-migrate", &["server", "storage", "migrate"]),
];

pub(super) async fn run_sibling(
    state: &AppState,
    program: &[String],
    args: &[&str],
) -> Result<Value, (StatusCode, Json<Value>)> {
    run_sibling_bounded(state, program, args, SIBLING_TIMEOUT, SIBLING_STDOUT_CAP).await
}

/// Convert a completed [`LifecycleRun`] to the JSON envelope `Value` that
/// [`run_sibling`] would return on success, or an error description string on a
/// non-zero exit.  Pure function — no I/O, no spawning — so the retry logic
/// in [`run_sibling_version_tolerant`] can be exercised in unit tests.
pub(super) fn lifecycle_run_to_envelope(run: &LifecycleRun) -> Result<Value, String> {
    if run.code != Some(0) {
        return Err(format!("exited {:?}", run.code));
    }
    let raw = &run.stdout;
    Ok(serde_json::from_str(raw).unwrap_or_else(|_| json!({ "raw": raw, "exit": run.code })))
}

/// Like [`run_sibling`] but with version-tolerant `--json`: if the first
/// attempt exits 2 (a typer usage-error) or the combined output contains the
/// unknown-option text (detected by [`rag_rejected_json`]), the verb is retried
/// once WITHOUT `--json`.  A genuine non-zero exit — one that does NOT fire
/// [`rag_rejected_json`] — still surfaces as a 502, preserving the contract.
///
/// Uses [`run_rag_lifecycle_capture`] so both stdout AND stderr are available
/// for the rejection heuristic; the final JSON envelope is built from stdout
/// only via [`lifecycle_run_to_envelope`], matching [`run_sibling`] semantics.
pub(super) async fn run_sibling_version_tolerant(
    state: &AppState,
    program: &[String],
    args: &[&str],
) -> Result<Value, (StatusCode, Json<Value>)> {
    let cwd = state.active_cell().root.clone();
    // First attempt: with --json for the structured-output contract.
    let mut args_with_json: Vec<&str> = args.to_vec();
    args_with_json.push("--json");
    let mut run = run_rag_lifecycle_capture(state, &cwd, program, &args_with_json).await?;
    // Version-tolerant retry: an older rag rejects --json with exit 2 (typer
    // usage error) or produces the unknown-option text on a non-standard exit.
    // Retry exactly once without --json (no cross-repo ordering requirement).
    if run.code != Some(0) && rag_rejected_json(&run) {
        run = run_rag_lifecycle_capture(state, &cwd, program, args).await?;
    }
    lifecycle_run_to_envelope(&run).map_err(|msg| {
        super::super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!("{} {}", program[0], msg),
        )
    })
}

/// The bounded sibling runner. `timeout`/`cap` are parameters so tests can
/// inject short bounds; the production wrapper [`run_sibling`] pins the
/// 120s / 8 MiB constants.
pub(super) async fn run_sibling_bounded(
    state: &AppState,
    program: &[String],
    args: &[&str],
    timeout: Duration,
    cap: u64,
) -> Result<Value, (StatusCode, Json<Value>)> {
    let cwd = state.active_cell().root.clone();
    run_sibling_bounded_in_dir(state, &cwd, program, args, timeout, cap).await
}

async fn run_sibling_bounded_in_dir(
    state: &AppState,
    cwd: &FsPath,
    program: &[String],
    args: &[&str],
    timeout: Duration,
    cap: u64,
) -> Result<Value, (StatusCode, Json<Value>)> {
    // The shared bounded runner owns the spawn/drain/kill lifecycle (tokio, so a
    // hung sibling never pins a runtime thread — robustness H1) and drains BOTH
    // streams, so a chatty sibling cannot wedge on a full stderr pipe.
    // The sibling runs in the caller-resolved worktree. Most ops routes pass the
    // active cell; scoped routes such as `/search` pass their validated scope
    // cell so the subprocess cwd matches the cache key/request body.
    let mut command = tokio::process::Command::new(&program[0]);
    command
        .args(&program[1..])
        .args(args)
        .arg("--json")
        .current_dir(cwd);
    let limits = BoundedLimits { cap, timeout };
    // A runaway sibling is a refusal, not a truncated envelope parsed as if it
    // were complete.
    let run = run_bounded(command, None, limits, CapPolicy::Refuse)
        .await
        .map_err(|fault| super::super::bounded_fault_error(state, &program[0], limits, fault))?;

    // Inspect the exit status (M4): a crashed sibling is a 502 degraded
    // envelope, NOT a healthy-looking 200 wrapping a crash. Mirrors
    // `ingest-core::runner::run_json`, which already inspects status.
    let raw = run.stdout_lossy();
    if !run.success {
        return Err(super::super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!("{} exited {:?}", program[0], run.code),
        ));
    }
    // Envelopes pass VERBATIM; non-JSON output is wrapped, never reshaped.
    Ok(serde_json::from_str(&raw).unwrap_or_else(|_| json!({"raw": raw, "exit": run.code})))
}

/// The bounded sibling runner for a WRITE verb (W02): like
/// [`run_sibling_bounded`] in its spawn-bounds-kill lifecycle (8 MiB stdout cap
/// AND 120s wall-clock timeout, `subprocess-calls-carry-cap-and-timeout`) but
/// with two differences the write channel requires:
///
/// 1. STDIN is PIPED, not nulled: the new document `body` is written to the
///    child's stdin and the handle is CLOSED (dropped), so the sibling's
///    `--body-stdin` read sees EOF. When `body` is `None` (a frontmatter-only
///    save) nothing is written and stdin is closed immediately.
///
/// 2. A `status:"failed"` envelope that the sibling emits while exiting 1 — a
///    blob-hash CONFLICT or a validation REFUSAL — is a VALID business response
///    to forward VERBATIM, not a gateway error. So on process completion the
///    stdout is parsed: if it parses to a JSON OBJECT carrying a `status` field,
///    it is returned `Ok` REGARDLESS of the exit code. Only an empty/unparseable
///    stdout, a spawn failure, a timeout, or a capped runaway is an `Err`
///    (502/504), exactly like the read runner — those are genuine engine/sibling
///    faults the client must see degraded, never a forged success.
///
/// `timeout`/`cap` are parameters so tests can inject short bounds; the route
/// pins the 120s / 8 MiB production constants.
pub(super) async fn run_sibling_write_bounded(
    state: &AppState,
    cell: &ScopeCell,
    program: &[String],
    args: &[&str],
    body: Option<&str>,
    timeout: Duration,
    cap: u64,
) -> Result<Value, (StatusCode, Json<Value>)> {
    let cwd = cell.root.clone();
    let mut command = tokio::process::Command::new(&program[0]);
    command
        .args(&program[1..])
        .args(args)
        .arg("--json")
        .current_dir(&cwd)
        // Force the sibling's Python into UTF-8 mode so it reads the streamed body
        // from stdin (and writes its stdout envelope) as UTF-8 rather than the
        // host locale (cp1252 on Windows) — otherwise non-ASCII body bytes
        // (em-dash, curly quotes, accents, CJK, emoji) are mojibake'd on write.
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8");
    let limits = BoundedLimits { cap, timeout };
    // The shared runner pipes stdin for a `Some` body, writes it, and CLOSES the
    // handle so the sibling's `--body-stdin` read terminates at EOF; the write
    // runs concurrently with both output drains, so neither a large body nor a
    // chatty stderr can deadlock. A `None` body (a frontmatter-only save) nulls
    // stdin, which the sibling reads as an immediate EOF.
    let run = run_bounded(command, body, limits, CapPolicy::Refuse)
        .await
        .map_err(|fault| super::super::bounded_fault_error(state, &program[0], limits, fault))?;
    let raw = run.stdout_lossy();

    // KEY DIFFERENCE from the read runner: a `status`-bearing envelope is a VALID
    // business response — `status:"updated"`/`"unchanged"` (exit 0) OR
    // `status:"failed"` (a conflict/refusal that exits 1). Both forward VERBATIM.
    // We branch on the ENVELOPE, not the exit code, so a refusal that exits 1 is
    // not mistaken for an engine fault.
    if let Ok(parsed) = serde_json::from_str::<Value>(&raw)
        && parsed.get("status").is_some_and(|s| s.is_string())
    {
        return Ok(parsed);
    }

    // No parseable `status` envelope on stdout: this is a genuine fault, not a
    // business refusal. A non-zero exit (a real crash) and an empty/garbage
    // stdout both degrade to a 502 — never a forged success.
    if !run.success {
        return Err(super::super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!(
                "{} exited {:?} with no parseable envelope",
                program[0], run.code
            ),
        ));
    }
    Err(super::super::api_error(
        state,
        StatusCode::BAD_GATEWAY,
        format!("{} produced no parseable write envelope", program[0]),
    ))
}

/// Whether a parsed stdout value is a rag `--json` envelope (rag-storage-broker
/// ADR D4). rag's storage verbs emit `{ok, command, data|error, ...}`; we key on a
/// top-level `ok` boolean AND a `command` string. This is the storage analog of the
/// write runner's top-level-`status` key — rag's storage envelope nests `status`
/// under `data`, so the write runner's key would not match here.
pub(super) fn is_rag_envelope(value: &Value) -> bool {
    value.get("ok").is_some_and(Value::is_boolean)
        && value.get("command").is_some_and(Value::is_string)
}

/// The bounded runner for a DESTRUCTIVE rag storage verb (rag-storage-broker ADR
/// D4). Like [`run_sibling_bounded_in_dir`] in its spawn-bounds-kill lifecycle (the
/// 8 MiB stdout cap AND the 120s wall-clock timeout), but with the exit-handling the
/// rag storage CLI requires: rag emits its result envelope and THEN exits 1 on a
/// non-applied preview (`would_remove`) or a refusal. So on completion stdout is
/// parsed: a rag envelope ([`is_rag_envelope`]) is forwarded VERBATIM REGARDLESS of
/// the exit code (a `would_remove` preview is a business outcome, not a fault). Only
/// an unparseable/empty stdout with a non-zero exit, a spawn failure, a timeout, or a
/// capped runaway is a 502 — never a forged success and never a flattened preview.
pub(super) async fn run_storage_sibling_bounded(
    state: &AppState,
    cwd: &FsPath,
    program: &[String],
    args: &[String],
    timeout: Duration,
    cap: u64,
) -> Result<Value, (StatusCode, Json<Value>)> {
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let mut command = tokio::process::Command::new(&program[0]);
    command
        .args(&program[1..])
        .args(&arg_refs)
        .arg("--json")
        .current_dir(cwd)
        // Force the sibling's Python into UTF-8 so a path/prefix with non-ASCII
        // bytes round-trips, matching the write runner.
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8");
    let limits = BoundedLimits { cap, timeout };
    let run = run_bounded(command, None, limits, CapPolicy::Refuse)
        .await
        .map_err(|fault| super::super::bounded_fault_error(state, &program[0], limits, fault))?;
    let raw = run.stdout_lossy();
    storage_outcome(&raw, run.success).map_err(|reason| {
        super::super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!("{}: {reason}", program[0]),
        )
    })
}

/// Decide a storage subprocess's outcome from its stdout and exit success
/// (rag-storage-broker ADR D4), as a pure function so the load-bearing
/// exit-1-with-envelope decision is unit-tested without a subprocess. A rag
/// envelope ([`is_rag_envelope`]) forwards verbatim REGARDLESS of the exit code (a
/// `would_remove` preview exits 1 but is a business outcome); otherwise a non-zero
/// exit (a real crash) or an unparseable/empty stdout is a stated fault the runner
/// maps to a 502.
pub(super) fn storage_outcome(raw: &str, success: bool) -> Result<Value, String> {
    if let Ok(parsed) = serde_json::from_str::<Value>(raw)
        && is_rag_envelope(&parsed)
    {
        return Ok(parsed);
    }
    if !success {
        return Err("exited non-zero with no parseable rag envelope".to_string());
    }
    Err("produced no parseable rag storage envelope".to_string())
}

/// Validate a rag storage namespace prefix (rag-storage-broker ADR D2): the
/// `storage-delete` verb targets exactly one namespace by its canonical
/// `r{12-lowercase-hex}_` prefix (rag's blake2b-6 `root_collection_prefix`).
/// Validating it confines the destructive target to a real namespace shape AND
/// closes the flag-injection vector (a `-`-prefixed value rag would read as an
/// option) before the subprocess spawns. A non-matching value is a 400 the route
/// degrades through the shared error helper.
pub(super) fn validate_namespace_prefix(
    state: &AppState,
    prefix: &str,
) -> Result<String, (StatusCode, Json<Value>)> {
    let valid = prefix.len() == 14
        && prefix.starts_with('r')
        && prefix.ends_with('_')
        && prefix
            .get(1..13)
            .is_some_and(|hex| hex.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f')));
    if !valid {
        return Err(super::super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "namespace prefix `{prefix}` must be rag's canonical \
                 `r{{12-lowercase-hex}}_` form"
            ),
        ));
    }
    Ok(prefix.to_string())
}

/// The request body for the destructive storage broker (rag-storage-broker ADR
/// D2/D3). `prefix` is the `storage-delete` target (validated); `to` is the
/// `storage-migrate` backend (`server`|`local`); `apply` is the explicit
/// dry-run-default override (absent/false previews, `true` applies). `migrate`'s
/// root is the engine's active scope cell, never a body field — the caller never
/// supplies a path.
#[derive(serde::Deserialize, Default)]
pub struct RagStorageBody {
    #[serde(default)]
    pub prefix: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
    #[serde(default)]
    pub apply: Option<bool>,
}

/// Assemble the validated argv for a destructive storage verb (ADR D2/D3). Starts
/// from the verb's fixed base args and appends, per verb: the validated namespace
/// prefix (`delete`); the engine-controlled active-cell root and the `server|local`
/// backend enum (`migrate`). Then the dry-run discipline: rag's `--json` mode
/// REQUIRES `--yes` (it means non-interactive, so no confirmation prompt corrupts
/// the stream), so `--yes` is ALWAYS passed and `--dry-run` is added for a preview
/// (the default) and omitted only on an explicit `apply: true`. `--allow-unknown` is
/// never assembled. A missing/invalid argument is a 400 before any subprocess; the
/// runner appends `--json`.
pub(super) fn storage_args_for(
    state: &AppState,
    verb: &str,
    fixed: &[&str],
    cell_root: &str,
    body: &RagStorageBody,
) -> Result<Vec<String>, (StatusCode, Json<Value>)> {
    let mut args: Vec<String> = fixed.iter().map(|s| s.to_string()).collect();
    match verb {
        "storage-delete" => {
            let prefix = body.prefix.as_deref().ok_or_else(|| {
                super::super::api_error(
                    state,
                    StatusCode::BAD_REQUEST,
                    "storage-delete requires a `prefix`".to_string(),
                )
            })?;
            args.push(validate_namespace_prefix(state, prefix)?);
        }
        "storage-migrate" => {
            // The root is the engine-controlled active scope — never a caller path,
            // closing the traversal vector exactly as the reindex `project_root` does.
            args.push(cell_root.to_string());
            let to = match body.to.as_deref() {
                Some(t @ ("server" | "local")) => t,
                _ => {
                    return Err(super::super::api_error(
                        state,
                        StatusCode::BAD_REQUEST,
                        "storage-migrate requires `to` = `server` or `local`".to_string(),
                    ));
                }
            };
            args.push("--to".to_string());
            args.push(to.to_string());
        }
        "storage-prune" => {}
        _ => {
            return Err(super::super::api_error(
                state,
                StatusCode::FORBIDDEN,
                format!("storage verb `{verb}` is not whitelisted (rag storage broker)"),
            ));
        }
    }
    // rag's `--json` requires `--yes` (non-interactive); `--dry-run` is the preview
    // switch, present by default and dropped only on an explicit apply.
    args.push("--yes".to_string());
    if body.apply != Some(true) {
        args.push("--dry-run".to_string());
    }
    Ok(args)
}

/// Locate the rag CLI: PATH binary, else the uv-managed environment.
pub(super) fn rag_invocation() -> Vec<String> {
    let on_path = std::env::var_os("PATH").is_some_and(|paths| {
        std::env::split_paths(&paths).any(|dir| {
            ["", ".exe", ".cmd", ".bat"]
                .iter()
                .any(|ext| dir.join(format!("vaultspec-rag{ext}")).is_file())
        })
    });
    if on_path {
        vec!["vaultspec-rag".into()]
    } else {
        ["uv", "run", "--no-sync", "vaultspec-rag"]
            .map(String::from)
            .to_vec()
    }
}

/// The `/health` liveness budget for the lifecycle running-predicate (the
/// `probe_machine_state` round-trip): short, because it is a loopback call to a
/// service we just discovered.
pub(super) const RAG_LIFECYCLE_HEALTH_TIMEOUT: Duration = Duration::from_millis(1500);

/// The captured outcome of a rag lifecycle subprocess (`server start`/`stop`):
/// the exit code and the human stdout. Unlike [`run_sibling`], a non-zero exit is
/// NOT auto-mapped to 502 — the lifecycle handler interprets it against the
/// machine-global running-predicate (an already-running `server start` exits 1 by
/// design and must ATTACH, not error). This runner appends NO `--json` itself (the
/// shared [`run_sibling`] does); the `server start` caller adds `--json` to its own
/// arg list version-tolerantly (retrying without it when an older rag rejects the
/// option), and reads both streams so that retry heuristic can scan the error text.
pub(super) struct LifecycleRun {
    pub(super) code: Option<i32>,
    pub(super) stdout: String,
    pub(super) stderr: String,
}

impl LifecycleRun {
    /// The human output across both streams (rag prints the needs-install hint and
    /// error text to stderr), for the heuristic + the surfaced `output`.
    fn combined(&self) -> String {
        match (self.stdout.is_empty(), self.stderr.is_empty()) {
            (false, false) => format!("{}\n{}", self.stdout, self.stderr),
            (false, true) => self.stdout.clone(),
            (true, false) => self.stderr.clone(),
            (true, true) => String::new(),
        }
    }
}

/// Spawn a rag lifecycle verb (`server start`/`stop`) with the same
/// spawn-bounded-read-kill lifecycle as [`run_sibling_bounded_in_dir`] but
/// WITHOUT appending `--json` and WITHOUT mapping a non-zero exit to 502: the
/// caller decides the outcome from the running-predicate. Spawn / read / timeout
/// faults are still honest 502/504s (the engine genuinely could not run it).
pub(super) async fn run_rag_lifecycle_capture(
    state: &AppState,
    cwd: &FsPath,
    program: &[String],
    args: &[&str],
) -> Result<LifecycleRun, (StatusCode, Json<Value>)> {
    let mut command = tokio::process::Command::new(&program[0]);
    command.args(&program[1..]).args(args).current_dir(cwd);
    let limits = BoundedLimits {
        cap: SIBLING_STDOUT_CAP,
        timeout: SIBLING_TIMEOUT,
    };
    // The shared runner reads BOTH streams concurrently and bounded, which this
    // handler needs twice over: it scans the human text (rag prints the
    // needs-install hint and its error text to stderr), and an undrained stderr
    // pipe would let a chatty child block on its own write until the timeout.
    let run = run_bounded(command, None, limits, CapPolicy::Refuse)
        .await
        .map_err(|fault| super::super::bounded_fault_error(state, &program[0], limits, fault))?;
    Ok(LifecycleRun {
        code: run.code,
        stdout: run.stdout_lossy().trim().to_string(),
        stderr: run.stderr_lossy().trim().to_string(),
    })
}

/// Re-probe the machine-global running-predicate with a small bounded settle: a
/// just-started or just-won-the-race rag service may still be loading models when
/// the first `/health` probe fires, so a single probe would misreport a slow-but-
/// successful start as failed. Bounded at a few attempts with short gaps.
///
/// Each `probe_machine_state` call is blocking std::net I/O — offloaded via
/// `rag_offload` (spawn_blocking) so the ≈7.5s worst-case probe loop never pins
/// a Tokio async worker (ADR D5 / T1-R2). The inter-probe sleeps stay async
/// (tokio::time::sleep).
async fn reprobe_rag_until_running(
    state: &AppState,
    vault: &FsPath,
) -> Result<rag_client::client::RagMachineState, (StatusCode, Json<Value>)> {
    const ATTEMPTS: usize = 4;
    let gap = Duration::from_millis(500);
    let mut last = rag_client::client::RagMachineState::Absent {
        reason: "rag start re-probe pending".to_string(),
    };
    for i in 0..ATTEMPTS {
        let vault_clone = vault.to_owned();
        last = super::rag_offload(state, move || {
            rag_client::client::probe_machine_state(&vault_clone, RAG_LIFECYCLE_HEALTH_TIMEOUT)
        })
        .await?;
        if last.is_running() {
            return Ok(last);
        }
        if i + 1 < ATTEMPTS {
            tokio::time::sleep(gap).await;
        }
    }
    Ok(last)
}

/// `server-start` with the machine-singleton, attach-never-own discipline
/// (rag-service-management ADR D1/D2). The dashboard manages whatever rag service
/// is running on the machine and starts its OWN only when one is genuinely
/// absent: it NEVER starts speculatively. It gates on the machine-global
/// running-predicate; an already-running service ATTACHES and succeeds (whether
/// or not the dashboard started it); a start that loses the race (machine-owned,
/// exit 1) re-discovers and attaches; only a re-probe that still finds no running
/// service is a failure (carried as an honest `status:"failed"` envelope with the
/// captured output + degraded tier, never a forged success and never a 502 for an
/// already-running service).
/// Build the validated, bounded `server start` flag list from the request body
/// (D5 arg pass-through). Exactly three flags are forwarded — `--local-only`,
/// `--port`, `--qdrant-auto-provision` — and nothing else from the body reaches
/// the start command. The port is bounded to the non-privileged range. The result
/// always begins with `["server", "start"]`.
pub(super) fn rag_start_args(body: &RagControlBody) -> Result<Vec<String>, String> {
    let mut args: Vec<String> = vec!["server".into(), "start".into()];
    if body.local_only == Some(true) {
        args.push("--local-only".into());
    }
    if body.qdrant_auto_provision == Some(true) {
        args.push("--qdrant-auto-provision".into());
    }
    if let Some(port) = body.port {
        if !(1024..=65535).contains(&port) {
            return Err(format!(
                "server start `port` {port} must be within 1024..=65535 (non-privileged)"
            ));
        }
        args.push("--port".into());
        args.push(port.to_string());
    }
    // Request the structured start outcome so a non-zero exit carries rag's stated
    // reason (machine_owned / port_in_use / qdrant_missing). An older rag that
    // predates the JSON-start contract rejects this option, which the spawn path
    // detects and retries without it (version-tolerant — no cross-repo ordering).
    args.push("--json".into());
    Ok(args)
}

/// Whether a non-zero `server start` exit is an OLDER rag rejecting the unknown
/// `--json` option (it predates the JSON-start contract), so the caller retries the
/// plain start. The PRIMARY signal is text-independent: typer/click exits 2 on a
/// usage error (an unknown option), and the engine adds exactly one option rag might
/// not know - `--json` - while validating its own port, so an exit-2 from this
/// invocation IS the `--json` rejection with near-certainty. A usage error means no
/// service started, so the plain retry is always safe. The unknown-option text scan
/// is a belt-and-suspenders for a non-standard exit code. rag's own `--json` FAILURE
/// envelopes exit 1 (not 2), so this never misfires on a real start failure.
pub(super) fn rag_rejected_json(run: &LifecycleRun) -> bool {
    if run.code == Some(2) {
        return true;
    }
    let lower = run.combined().to_ascii_lowercase();
    lower.contains("no such option") && lower.contains("--json")
}

/// rag's authoritative `server start --json` FAILURE envelope, when present:
/// `{ok:false, error, data}`. Returns `(error, data)` for an `ok:false` envelope
/// carrying a string `error`; `None` for a success/non-envelope output (an older
/// rag's human text), so the caller degrades to the inferred reason.
pub(super) fn rag_start_failure(stdout: &str) -> Option<(String, Value)> {
    let parsed: Value = serde_json::from_str(stdout).ok()?;
    if parsed.get("ok").and_then(Value::as_bool) == Some(false) {
        let error = parsed.get("error")?.as_str()?.to_string();
        let data = parsed.get("data").cloned().unwrap_or(Value::Null);
        return Some((error, data));
    }
    None
}

pub(super) async fn start_rag_service(
    state: &AppState,
    cell: &ScopeCell,
    body: &RagControlBody,
) -> ApiResult {
    // Validate the start flags BEFORE anything else: a bad port is a tiers-carrying
    // 400 that never reaches rag (mirrors the reindex/search arg guards).
    let args = rag_start_args(body)
        .map_err(|reason| super::super::api_error(state, StatusCode::BAD_REQUEST, reason))?;
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();

    let vault = cell.root.join(".vault");
    // Gate: a running machine service is managed, not restarted (the start flags
    // are moot when we attach to an existing service). The /health probe is
    // blocking socket I/O — offload it (RCR-001).
    let gate_probe = super::rag_offload(state, {
        let vault = vault.clone();
        move || rag_client::client::probe_machine_state(&vault, RAG_LIFECYCLE_HEALTH_TIMEOUT)
    })
    .await?;
    if let rag_client::client::RagMachineState::Running { info, health } = gate_probe {
        return Ok(super::super::envelope(
            json!({ "envelope": {
                "status": "already_running",
                "attached": true,
                "pid": health.pid.or(info.pid),
                "port": info.port,
            }}),
            super::super::query_tiers(cell),
            None,
        ));
    }
    // Genuinely absent (crashed is treated as absent for start purposes): start
    // our own.
    let mut run =
        run_rag_lifecycle_capture(state, &cell.root, &rag_invocation(), &args_ref).await?;
    // Version-tolerant `--json`: an older rag that predates the JSON-start contract
    // rejects the unknown option, so retry the plain start once without it. This
    // keeps the adoption safe against any rag version (no cross-repo release order).
    if run.code != Some(0) && rag_rejected_json(&run) {
        let plain: Vec<&str> = args_ref
            .iter()
            .copied()
            .filter(|a| *a != "--json")
            .collect();
        run = run_rag_lifecycle_capture(state, &cell.root, &rag_invocation(), &plain).await?;
    }

    // Exit 0 is the CLI's authoritative "started" (or "already running") — rag only
    // exits non-zero on a real failure. A COLD start then loads the GPU models,
    // which can take far longer than a single `/health` probe window, so we MUST NOT
    // downgrade a slow-but-successful start to "failed": trust exit 0 and harvest
    // pid/port best-effort without blocking on readiness.
    if run.code == Some(0) {
        // Best-effort pid/port harvest — blocking /health probe, offload it (RCR-001).
        let post_probe = super::rag_offload(state, {
            let vault = vault.clone();
            move || rag_client::client::probe_machine_state(&vault, RAG_LIFECYCLE_HEALTH_TIMEOUT)
        })
        .await?;
        let (pid, port) = match post_probe {
            rag_client::client::RagMachineState::Running { info, health } => {
                (health.pid.or(info.pid), Some(info.port))
            }
            other => (None, other.service_info().map(|i| i.port)),
        };
        return Ok(super::super::envelope(
            json!({ "envelope": {
                "status": "started",
                "attached": true,
                "pid": pid,
                "port": port,
                "output": run.combined(),
            }}),
            super::super::query_tiers(cell),
            None,
        ));
    }

    // Non-zero exit: either we lost the race (a CLI/MCP/other dashboard owns the
    // machine, rag's lock refused our second service) or a genuine failure. Re-probe
    // with a bounded settle — a just-won race may still be warming — before deciding.
    // Probes run under rag_offload so blocking I/O stays off the async worker (T1-R2).
    match reprobe_rag_until_running(state, &cell.root.join(".vault")).await? {
        rag_client::client::RagMachineState::Running { info, health } => {
            Ok(super::super::envelope(
                json!({ "envelope": {
                    "status": "machine_owned",
                    "attached": true,
                    "pid": health.pid.or(info.pid),
                    "port": info.port,
                    "output": run.combined(),
                }}),
                super::super::query_tiers(cell),
                None,
            ))
        }
        other => {
            // Still not running: a genuine failure (a non-rag process holds the
            // port, a missing Qdrant binary, ...). Honest structured envelope with
            // the captured output and the degraded tier.
            let reason = match other {
                rag_client::client::RagMachineState::Crashed { reason, .. }
                | rag_client::client::RagMachineState::Absent { reason } => reason,
                rag_client::client::RagMachineState::Running { .. } => unreachable!(),
            };
            // needs-install chain (D5): when the start failed because the managed
            // Qdrant binary is missing, rag's output (on stdout OR stderr) points at
            // install. Surface a distinct `needs_install` status (best-effort
            // heuristic) so the UI can offer `server qdrant install` or a retry with
            // `--qdrant-auto-provision`.
            let combined = run.combined();
            let lower = combined.to_ascii_lowercase();
            let needs_install = lower.contains("qdrant")
                && (lower.contains("install") || lower.contains("provision"));
            let mut envelope = json!({
                "status": if needs_install { "needs_install" } else { "failed" },
                "attached": false,
                "exit_code": run.code,
                "reason": reason,
                "output": combined,
            });
            // Authoritative failure cause from rag's `--json` start envelope (when the
            // running rag supports it): rag's STATED error + data (e.g. the
            // `machine_owned` holder pid, the `port_in_use` port), surfaced alongside
            // the inferred reason. Read stdout then stderr (rag may emit the envelope
            // on either). Absent on an older rag, so this is purely additive.
            if let Some((rag_error, rag_data)) =
                rag_start_failure(&run.stdout).or_else(|| rag_start_failure(&run.stderr))
            {
                envelope["rag_error"] = json!(rag_error);
                if !rag_data.is_null() {
                    envelope["rag_data"] = rag_data;
                }
            }
            Ok(super::super::envelope(
                json!({ "envelope": envelope }),
                super::super::degraded_tiers(cell, &reason),
                None,
            ))
        }
    }
}

/// `server-stop`: stop the ONE machine-global rag service — which stops it for
/// EVERY consumer (this dashboard, the CLI, MCP, and any other dashboard). The
/// machine-wide blast radius is surfaced in the UI copy (the stores/console
/// layer), not here. `server stop` carries no `--json` on rag 0.2.25, so the
/// human output is captured and wrapped.
pub(super) async fn stop_rag_service(state: &AppState, cell: &ScopeCell) -> ApiResult {
    let run = run_rag_lifecycle_capture(state, &cell.root, &rag_invocation(), &["server", "stop"])
        .await?;
    // TIERS-ON-STOP-FAILED (ADR D5 / T1-R3): the tiers block reports the TRUE
    // current service state from discovery (`query_tiers`), NOT the outcome of
    // this stop attempt.  When stop fails and rag is still running, the semantic
    // tier correctly shows available — this is the decided, correct behavior.
    // Callers MUST read the envelope `status` field ("stopped" vs "stop_failed")
    // to learn the operation result; inferring from tiers would be wrong.  The
    // stop failure lives in the envelope, not in the tiers.
    Ok(super::super::envelope(
        json!({ "envelope": {
            "status": if run.code == Some(0) { "stopped" } else { "stop_failed" },
            "exit_code": run.code,
            "output": run.combined(),
        }}),
        super::super::query_tiers(cell),
        None,
    ))
}
