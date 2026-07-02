//! The transparent, whitelisted ops proxies and the search pass-through
//! (contract §6/§8, W03.P11.S53): sibling envelopes verbatim, no engine
//! semantics — the engine is only the server-side hand a browser SPA
//! lacks (D7.5).
//!
//! Rag verbs run through rag's CLI with `--json` (audit N5): the CLI is
//! rag's documented, guaranteed control surface — its loopback HTTP routes
//! are monitoring-only. The whitelist is R1 exactly: service lifecycle,
//! reindex, watcher status/tuning.

use std::collections::HashMap;
use std::path::Path as FsPath;
use std::sync::Arc;
use std::time::Duration;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use engine_model::{CanonicalKey, node_id};
use serde_json::{Value, json};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::app::{AppState, ScopeCell};

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

/// Sibling stdout ceiling (robustness H1, 2026-06-13): a runaway sibling that
/// streams unbounded stdout would OOM the engine. Sibling `--json` envelopes
/// are small; 8 MiB is orders of magnitude of headroom while bounding the
/// pathological case. Output past the cap is a truncated read, surfaced as a
/// 502 degraded envelope rather than buffered to exhaustion.
const SIBLING_STDOUT_CAP: u64 = 8 * 1024 * 1024;

/// Sibling wall-clock ceiling (robustness H1): an unbounded, untimed sibling
/// subprocess is a DoS + zombie vector — a hung CLI pins an async worker
/// forever. 120s covers a cold rag reindex while still bounding a hang; on
/// timeout the child is killed and a 504 degraded envelope is returned.
const SIBLING_TIMEOUT: Duration = Duration::from_secs(120);

/// Interactive search budget: `/search` is a degradable, user-facing read. A
/// hung or cold rag sibling should return a semantic-tier degradation quickly
/// instead of pinning the dashboard or its live conformance gate behind the
/// generic lifecycle/reindex subprocess ceiling.
const SEARCH_SIBLING_TIMEOUT: Duration = Duration::from_secs(8);

/// Destructive-storage budget (rag-storage-broker ADR D4): a `prune` of a large
/// orphaned set or an apply-mode `migrate` of a big shared store legitimately runs
/// longer than the reindex budget, so the storage runner gets a more generous - but
/// still bounded - ceiling rather than the 120s reindex bound killing a destructive
/// apply mid-flight. Still bounded so a wedged storage op cannot pin an async worker
/// forever; a breach kills the child and returns a 504. (A `migrate` is a COPY to the
/// other backend, so a killed apply is recoverable by re-running, never source loss.)
const STORAGE_SIBLING_TIMEOUT: Duration = Duration::from_secs(300);

/// Search request query ceiling. The frontend intent store clips at the same
/// user-facing size, but the API is a public boundary and must reject unbounded
/// external callers before building rag argv.
const MAX_SEARCH_QUERY_CHARS: usize = 512;

/// Search result ceiling forwarded to rag. Absent `max_results` lets rag use its
/// own default; an explicit request above this API ceiling is rejected before the
/// sibling process is spawned.
const MAX_SEARCH_RESULTS: u32 = 50;

/// The R1 core whitelist: vault check + stats. Anything else is a sibling
/// filing, not whitelist growth.
const CORE_WHITELIST: &[(&str, &[&str])] = &[
    ("vault-check", &["vault", "check", "all"]),
    ("vault-stats", &["vault", "stats"]),
];

/// The core WRITE whitelist (W02): the small set of save verbs the dashboard
/// editor forwards through the sibling proxy. Each entry maps a verb name to its
/// FIXED core args; the route appends the validated `REF`, the typed flags, and
/// `--json`. The engine stays READ-AND-INFER: it only forwards a body to the
/// sibling that OWNS the write (`vaultspec-core vault …`) — it persists nothing,
/// mutates no ref, grows no sibling semantics. The owning sibling enforces the
/// conflict/validation policy; the engine is a transparent forwarder
/// (`engine-read-and-infer`). A verb not in this set 403s before any subprocess.
const CORE_WRITE_WHITELIST: &[(&str, &[&str])] = &[
    ("set-body", &["vault", "set-body"]),
    ("set-frontmatter", &["vault", "set-frontmatter"]),
    ("edit", &["vault", "edit"]),
    ("rename", &["vault", "rename"]),
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
const RAG_CLI_WHITELIST: &[(&str, &[&str])] = &[
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
const RAG_STORAGE_CLI_WHITELIST: &[(&str, &[&str])] = &[
    ("storage-delete", &["server", "storage", "delete"]),
    ("storage-prune", &["server", "storage", "prune"]),
    ("storage-migrate", &["server", "storage", "migrate"]),
];

async fn run_sibling(
    state: &AppState,
    program: &[String],
    args: &[&str],
) -> Result<Value, (StatusCode, Json<Value>)> {
    run_sibling_bounded(state, program, args, SIBLING_TIMEOUT, SIBLING_STDOUT_CAP).await
}

/// The bounded sibling runner. `timeout`/`cap` are parameters so tests can
/// inject short bounds; the production wrapper [`run_sibling`] pins the
/// 120s / 8 MiB constants.
async fn run_sibling_bounded(
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
    // tokio::process so the spawn + bounded-read + timeout never blocks the
    // async worker (robustness H1): a hung sibling no longer pins a runtime
    // thread, and stdout is read through a ceiling rather than buffered whole.
    // The sibling runs in the caller-resolved worktree. Most ops routes pass the
    // active cell; scoped routes such as `/search` pass their validated scope
    // cell so the subprocess cwd matches the cache key/request body.
    let mut child = tokio::process::Command::new(&program[0])
        .args(&program[1..])
        .args(args)
        .arg("--json")
        .current_dir(cwd)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            super::api_error(
                state,
                StatusCode::BAD_GATEWAY,
                format!("spawning {}: {e}", program[0]),
            )
        })?;

    // Read stdout under the byte ceiling AND a wall-clock timeout. On either
    // bound the child is killed so it cannot linger as a zombie.
    let stdout = child.stdout.take().expect("piped stdout");
    let collect = async {
        let mut buf = Vec::new();
        // `AsyncReadExt::take` consumes the reader and bounds the read at the
        // cap; the child's exit status is awaited separately below.
        let read = stdout.take(cap).read_to_end(&mut buf).await;
        (read, buf)
    };

    let (read_result, buf) = match tokio::time::timeout(timeout, collect).await {
        Ok(result) => result,
        Err(_) => {
            // Timed out: kill the child (no zombie) and degrade truthfully.
            let _ = child.kill().await;
            return Err(super::api_error(
                state,
                StatusCode::GATEWAY_TIMEOUT,
                format!("{} timed out after {}s", program[0], timeout.as_secs()),
            ));
        }
    };
    read_result.map_err(|e| {
        super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!("reading {} output: {e}", program[0]),
        )
    })?;

    // Output exceeded the cap: a runaway sibling. Kill it and degrade rather
    // than parse a truncated envelope as if it were complete.
    if buf.len() as u64 >= cap {
        let _ = child.kill().await;
        return Err(super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!(
                "{} produced over {} bytes of output (capped)",
                program[0], cap
            ),
        ));
    }

    // Await the exit status (M4): a crashed sibling is a 502 degraded
    // envelope, NOT a healthy-looking 200 wrapping a crash. Mirrors
    // `ingest-core::runner::run_json`, which already inspects status.
    let status = child.wait().await.map_err(|e| {
        super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!("awaiting {} exit: {e}", program[0]),
        )
    })?;
    let raw = String::from_utf8_lossy(&buf);
    if !status.success() {
        return Err(super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!("{} exited {:?}", program[0], status.code()),
        ));
    }
    // Envelopes pass VERBATIM; non-JSON output is wrapped, never reshaped.
    Ok(serde_json::from_str(&raw).unwrap_or_else(|_| json!({"raw": raw, "exit": status.code()})))
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
async fn run_sibling_write_bounded(
    state: &AppState,
    cell: &ScopeCell,
    program: &[String],
    args: &[&str],
    body: Option<&str>,
    timeout: Duration,
    cap: u64,
) -> Result<Value, (StatusCode, Json<Value>)> {
    let cwd = cell.root.clone();
    let mut child = tokio::process::Command::new(&program[0])
        .args(&program[1..])
        .args(args)
        .arg("--json")
        .current_dir(&cwd)
        // Force the sibling's Python into UTF-8 mode so it reads the streamed body
        // from stdin (and writes its stdout envelope) as UTF-8 rather than the
        // host locale (cp1252 on Windows) — otherwise non-ASCII body bytes
        // (em-dash, curly quotes, accents, CJK, emoji) are mojibake'd on write.
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            super::api_error(
                state,
                StatusCode::BAD_GATEWAY,
                format!("spawning {}: {e}", program[0]),
            )
        })?;

    // Write the new body to the child's stdin and CLOSE it (drop the handle) so
    // the sibling's `--body-stdin` read terminates at EOF. A `None` body (a
    // frontmatter-only save) writes nothing and still closes stdin. A broken
    // pipe here (the sibling exited before reading) is not fatal on its own — the
    // exit-status / envelope inspection below decides the outcome.
    {
        let mut stdin = child.stdin.take().expect("piped stdin");
        if let Some(text) = body {
            let _ = stdin.write_all(text.as_bytes()).await;
        }
        // Explicit drop closes the pipe (EOF for the child); also flush first so
        // the bytes are not lost on some platforms.
        let _ = stdin.flush().await;
        drop(stdin);
    }

    let stdout = child.stdout.take().expect("piped stdout");
    let collect = async {
        let mut buf = Vec::new();
        let read = stdout.take(cap).read_to_end(&mut buf).await;
        (read, buf)
    };

    let (read_result, buf) = match tokio::time::timeout(timeout, collect).await {
        Ok(result) => result,
        Err(_) => {
            let _ = child.kill().await;
            return Err(super::api_error(
                state,
                StatusCode::GATEWAY_TIMEOUT,
                format!("{} timed out after {}s", program[0], timeout.as_secs()),
            ));
        }
    };
    read_result.map_err(|e| {
        super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!("reading {} output: {e}", program[0]),
        )
    })?;

    if buf.len() as u64 >= cap {
        let _ = child.kill().await;
        return Err(super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!(
                "{} produced over {} bytes of output (capped)",
                program[0], cap
            ),
        ));
    }

    let status = child.wait().await.map_err(|e| {
        super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!("awaiting {} exit: {e}", program[0]),
        )
    })?;
    let raw = String::from_utf8_lossy(&buf);

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
    if !status.success() {
        return Err(super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!(
                "{} exited {:?} with no parseable envelope",
                program[0],
                status.code()
            ),
        ));
    }
    Err(super::api_error(
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
fn is_rag_envelope(value: &Value) -> bool {
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
async fn run_storage_sibling_bounded(
    state: &AppState,
    cwd: &FsPath,
    program: &[String],
    args: &[String],
    timeout: Duration,
    cap: u64,
) -> Result<Value, (StatusCode, Json<Value>)> {
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let mut child = tokio::process::Command::new(&program[0])
        .args(&program[1..])
        .args(&arg_refs)
        .arg("--json")
        .current_dir(cwd)
        // Force the sibling's Python into UTF-8 so a path/prefix with non-ASCII
        // bytes round-trips, matching the write runner.
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            super::api_error(
                state,
                StatusCode::BAD_GATEWAY,
                format!("spawning {}: {e}", program[0]),
            )
        })?;

    let stdout = child.stdout.take().expect("piped stdout");
    let collect = async {
        let mut buf = Vec::new();
        let read = stdout.take(cap).read_to_end(&mut buf).await;
        (read, buf)
    };
    let (read_result, buf) = match tokio::time::timeout(timeout, collect).await {
        Ok(result) => result,
        Err(_) => {
            let _ = child.kill().await;
            return Err(super::api_error(
                state,
                StatusCode::GATEWAY_TIMEOUT,
                format!("{} timed out after {}s", program[0], timeout.as_secs()),
            ));
        }
    };
    read_result.map_err(|e| {
        super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!("reading {} output: {e}", program[0]),
        )
    })?;
    if buf.len() as u64 >= cap {
        let _ = child.kill().await;
        return Err(super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!(
                "{} produced over {} bytes of output (capped)",
                program[0], cap
            ),
        ));
    }
    let status = child.wait().await.map_err(|e| {
        super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!("awaiting {} exit: {e}", program[0]),
        )
    })?;
    let raw = String::from_utf8_lossy(&buf);
    storage_outcome(&raw, status.success()).map_err(|reason| {
        super::api_error(
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
fn storage_outcome(raw: &str, success: bool) -> Result<Value, String> {
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

/// The READ-ONLY git whitelist (dashboard-pipeline-wire W04.P09.S48), mirroring
/// `CORE_WHITELIST` / `RAG_WHITELIST`: porcelain status (per-file `XY`), numstat
/// (`+adds`/`-dels` per file), and unified diff for a path. Every verb is a pure
/// read of the working tree — NO mutating git verb (add, commit, checkout,
/// reset, stash) is reachable, by construction (`engine-read-and-infer`). The
/// `diff` verb takes a validated path argument appended by `git_args_for`; the
/// others take none.
///
/// `--no-color` keeps the output machine-parseable; `--porcelain=v1` /
/// `-z`-free porcelain is the stable per-file `XY` format the diff browser
/// consumes. No working-tree mutation flag is ever present.
const GIT_WHITELIST: &[(&str, &[&str])] = &[
    ("status", &["status", "--porcelain=v1", "--branch"]),
    // numstat is HEAD-relative (`git diff HEAD`), so the per-file line tallies
    // cover BOTH staged (index-vs-HEAD) and unstaged (worktree-vs-index) changes
    // in one read — matching the full working-tree picture `status --porcelain`
    // reports. A bare `git diff --numstat` saw only unstaged changes, so every
    // staged file reconciled to null tallies (dashboard git-backend audit HIGH-1).
    // Untracked files are still absent (not in HEAD); they carry no diff tally by
    // construction and the client renders them without one.
    ("numstat", &["diff", "HEAD", "--numstat", "--no-color"]),
    // The per-file working-tree diff is HEAD-relative too, so a STAGED change still
    // renders its diff (a bare `git diff -- <path>` showed nothing once a change was
    // staged). Combined staged+unstaged vs HEAD is the "what changed in this file
    // since the last commit" the browser wants; `git_args_for` appends `-- <path>`.
    ("diff", &["diff", "HEAD", "--no-color"]),
    // The bounded read-only HISTORICAL text diff (figma-parity-reconciliation
    // S14): a two-rev `git diff <from> <to> -- <path>` over the git object DB.
    // Pure read-and-infer — the engine implements no diff algorithm and exposes
    // no mutating git verb. Both revs and the path are validated before they are
    // appended (`git_args_for`); the fixed args carry no write flag.
    ("histdiff", &["diff", "--no-color"]),
];

/// Verbs in [`GIT_WHITELIST`] that accept a single trailing path argument:
/// `diff` (working-tree) and `histdiff` (two-rev historical). The others are
/// argument-free. A verb not in this set forwards its fixed args verbatim and
/// rejects any supplied path.
const GIT_PATH_VERBS: &[&str] = &["diff", "histdiff"];

/// Verbs in [`GIT_WHITELIST`] that take a two-rev range (`<from> <to>`) before
/// the `-- <path>` separator. Only `histdiff` does; the others take no rev.
const GIT_REV_VERBS: &[&str] = &["histdiff"];

/// Locate the git binary: the PATH `git` (every dev/CI host has it). Mirrors
/// `rag_invocation`'s PATH-first shape. NO working-tree mutation flag is ever
/// appended anywhere — the whitelist args are the only args, plus a validated
/// path for the `diff` verb.
fn git_invocation() -> Vec<String> {
    vec!["git".into()]
}

/// Validate the optional `path` argument for the `diff` verb (W04.P09.S50): only
/// a bounded, in-tree relative path may be forwarded, never an arbitrary git
/// argument channel. Rejects absolute paths, parent-dir traversal (`..`),
/// and any token that begins with `-` (which git would read as a flag/option,
/// the injection vector this guard closes). Returns the validated path, or an
/// error envelope.
fn validate_diff_path(state: &AppState, path: &str) -> Result<String, (StatusCode, Json<Value>)> {
    let bad = path.is_empty()
        || path.starts_with('-')
        || path.starts_with('/')
        || path.starts_with('\\')
        // A Windows drive-absolute path (`C:\...`).
        || path.chars().nth(1) == Some(':')
        || path.split(['/', '\\']).any(|seg| seg == "..");
    if bad {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "diff path `{path}` must be a bounded, in-tree relative path \
                 (no leading `-`, no absolute path, no `..` traversal)"
            ),
        ));
    }
    Ok(path.to_string())
}

/// Validate a single git revision token for the historical-diff verb
/// (figma-parity-reconciliation S14): a rev names a commit/ref/tag the two-rev
/// `git diff` reads, never a flag or an argument channel. Rejects an empty
/// token, anything beginning with `-` (which git would read as a flag — the
/// injection vector), and a `..`/`...` range expression (the route forms the
/// range from two SEPARATE validated revs, so a smuggled range is rejected).
/// The token is otherwise a bounded ref-grammar string; an unresolvable rev is
/// caught by git itself and degraded as a sibling fault, never a 500.
fn validate_rev(state: &AppState, rev: &str) -> Result<String, (StatusCode, Json<Value>)> {
    let bad = rev.is_empty()
        || rev.starts_with('-')
        || rev.contains("..")
        || rev.contains(char::is_whitespace);
    if bad {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "git rev `{rev}` must be a single bounded revision \
                 (no leading `-`, no `..` range, no whitespace)"
            ),
        ));
    }
    Ok(rev.to_string())
}

/// Validate a rag storage namespace prefix (rag-storage-broker ADR D2): the
/// `storage-delete` verb targets exactly one namespace by its canonical
/// `r{12-lowercase-hex}_` prefix (rag's blake2b-6 `root_collection_prefix`).
/// Validating it confines the destructive target to a real namespace shape AND
/// closes the flag-injection vector (a `-`-prefixed value rag would read as an
/// option) before the subprocess spawns. A non-matching value is a 400 the route
/// degrades through the shared error helper.
fn validate_namespace_prefix(
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
        return Err(super::api_error(
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
fn storage_args_for(
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
                super::api_error(
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
                    return Err(super::api_error(
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
            return Err(super::api_error(
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

/// Build the full git argument vector for a whitelisted verb: its fixed
/// whitelist args, plus — for a rev verb — the two validated revs, plus — for a
/// path verb — the `--` separator and the validated path so the path can never
/// be read as a flag. A path or revs supplied to a verb that does not take them
/// is rejected (no silent ignore).
fn git_args_for(
    state: &AppState,
    verb: &str,
    fixed: &[&str],
    path: Option<&str>,
    revs: Option<(&str, &str)>,
) -> Result<Vec<String>, (StatusCode, Json<Value>)> {
    let mut args: Vec<String> = fixed.iter().map(|s| s.to_string()).collect();
    // A two-rev historical diff appends `<from> <to>` BEFORE the `-- <path>`
    // separator. Each rev is validated; a rev verb without revs is rejected, and
    // a non-rev verb that is handed revs is rejected.
    match (GIT_REV_VERBS.contains(&verb), revs) {
        (true, Some((from, to))) => {
            args.push(validate_rev(state, from)?);
            args.push(validate_rev(state, to)?);
        }
        (true, None) => {
            return Err(super::api_error(
                state,
                StatusCode::BAD_REQUEST,
                format!("git `{verb}` requires `from` and `to` revisions"),
            ));
        }
        (false, Some(_)) => {
            return Err(super::api_error(
                state,
                StatusCode::BAD_REQUEST,
                format!("git `{verb}` takes no revisions"),
            ));
        }
        (false, None) => {}
    }
    match (GIT_PATH_VERBS.contains(&verb), path) {
        (true, Some(p)) => {
            let validated = validate_diff_path(state, p)?;
            args.push("--".into());
            args.push(validated);
        }
        (true, None) => {
            return Err(super::api_error(
                state,
                StatusCode::BAD_REQUEST,
                format!("git `{verb}` requires a `path` argument"),
            ));
        }
        (false, Some(_)) => {
            return Err(super::api_error(
                state,
                StatusCode::BAD_REQUEST,
                format!("git `{verb}` takes no path argument"),
            ));
        }
        (false, None) => {}
    }
    Ok(args)
}

/// Run a whitelisted, read-only git invocation under the same bounds as the
/// sibling runner (timeout + stdout cap) but WITHOUT appending `--json` (git
/// has no such flag): git output is text, returned verbatim as a string for the
/// client to parse. Mirrors `run_sibling_bounded`'s lifecycle exactly — spawn,
/// bounded+timed read, kill-on-bound, exit-status check — so a hung or runaway
/// git degrades the same way a sibling does.
async fn run_git_bounded(
    state: &AppState,
    cell: &ScopeCell,
    program: &[String],
    args: &[String],
    timeout: Duration,
    cap: u64,
) -> Result<(String, bool), (StatusCode, Json<Value>)> {
    let cwd = cell.root.clone();
    let mut child = tokio::process::Command::new(&program[0])
        .args(&program[1..])
        .args(args)
        .current_dir(&cwd)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            super::api_error(
                state,
                StatusCode::BAD_GATEWAY,
                format!("spawning {}: {e}", program[0]),
            )
        })?;

    let stdout = child.stdout.take().expect("piped stdout");
    let collect = async {
        let mut buf = Vec::new();
        let read = stdout.take(cap).read_to_end(&mut buf).await;
        (read, buf)
    };
    let (read_result, buf) = match tokio::time::timeout(timeout, collect).await {
        Ok(result) => result,
        Err(_) => {
            let _ = child.kill().await;
            return Err(super::api_error(
                state,
                StatusCode::GATEWAY_TIMEOUT,
                format!("{} timed out after {}s", program[0], timeout.as_secs()),
            ));
        }
    };
    read_result.map_err(|e| {
        super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!("reading {} output: {e}", program[0]),
        )
    })?;
    // Cap reached: stop the child and return the BOUNDED PARTIAL rather than
    // failing the whole read with a 502. The caller marks the response truncated
    // so the client degrades honestly (shows what it got + a truncation notice)
    // instead of rendering a healthy-looking transport error. A read that stayed
    // under the cap still has its exit status checked — a genuine git fault is a
    // degraded error, not a silent empty result.
    let truncated = buf.len() as u64 >= cap;
    if truncated {
        let _ = child.kill().await;
    } else {
        let status = child.wait().await.map_err(|e| {
            super::api_error(
                state,
                StatusCode::BAD_GATEWAY,
                format!("awaiting {} exit: {e}", program[0]),
            )
        })?;
        if !status.success() {
            return Err(super::api_error(
                state,
                StatusCode::BAD_GATEWAY,
                format!("{} exited {:?}", program[0], status.code()),
            ));
        }
    }
    Ok((String::from_utf8_lossy(&buf).to_string(), truncated))
}

/// Locate the rag CLI: PATH binary, else the uv-managed environment.
fn rag_invocation() -> Vec<String> {
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
const RAG_LIFECYCLE_HEALTH_TIMEOUT: Duration = Duration::from_millis(1500);

/// The captured outcome of a rag lifecycle subprocess (`server start`/`stop`):
/// the exit code and the human stdout. Unlike [`run_sibling`], a non-zero exit is
/// NOT auto-mapped to 502 — the lifecycle handler interprets it against the
/// machine-global running-predicate (an already-running `server start` exits 1 by
/// design and must ATTACH, not error). This runner appends NO `--json` itself (the
/// shared [`run_sibling`] does); the `server start` caller adds `--json` to its own
/// arg list version-tolerantly (retrying without it when an older rag rejects the
/// option), and reads both streams so that retry heuristic can scan the error text.
struct LifecycleRun {
    code: Option<i32>,
    stdout: String,
    stderr: String,
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
async fn run_rag_lifecycle_capture(
    state: &AppState,
    cwd: &FsPath,
    program: &[String],
    args: &[&str],
) -> Result<LifecycleRun, (StatusCode, Json<Value>)> {
    let mut child = tokio::process::Command::new(&program[0])
        .args(&program[1..])
        .args(args)
        .current_dir(cwd)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            super::api_error(
                state,
                StatusCode::BAD_GATEWAY,
                format!("spawning {}: {e}", program[0]),
            )
        })?;
    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    // Read BOTH streams concurrently and bounded: the lifecycle handler scans the
    // human text (rag prints the needs-install hint and error text to stderr), and
    // an undrained stderr pipe would otherwise let a chatty child block on its write
    // until the timeout kills it.
    let collect = async {
        let mut obuf = Vec::new();
        let mut ebuf = Vec::new();
        let mut otake = stdout.take(SIBLING_STDOUT_CAP);
        let mut etake = stderr.take(SIBLING_STDOUT_CAP);
        let (oread, eread) =
            tokio::join!(otake.read_to_end(&mut obuf), etake.read_to_end(&mut ebuf),);
        (oread, eread, obuf, ebuf)
    };
    let (oread, eread, obuf, ebuf) = match tokio::time::timeout(SIBLING_TIMEOUT, collect).await {
        Ok(result) => result,
        Err(_) => {
            let _ = child.kill().await;
            return Err(super::api_error(
                state,
                StatusCode::GATEWAY_TIMEOUT,
                format!(
                    "{} timed out after {}s",
                    program[0],
                    SIBLING_TIMEOUT.as_secs()
                ),
            ));
        }
    };
    for read in [oread, eread] {
        read.map_err(|e| {
            super::api_error(
                state,
                StatusCode::BAD_GATEWAY,
                format!("reading {} output: {e}", program[0]),
            )
        })?;
    }
    if obuf.len() as u64 >= SIBLING_STDOUT_CAP || ebuf.len() as u64 >= SIBLING_STDOUT_CAP {
        let _ = child.kill().await;
        return Err(super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!(
                "{} produced over {} bytes of output (capped)",
                program[0], SIBLING_STDOUT_CAP
            ),
        ));
    }
    let status = child.wait().await.map_err(|e| {
        super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!("awaiting {} exit: {e}", program[0]),
        )
    })?;
    Ok(LifecycleRun {
        code: status.code(),
        stdout: String::from_utf8_lossy(&obuf).trim().to_string(),
        stderr: String::from_utf8_lossy(&ebuf).trim().to_string(),
    })
}

/// Re-probe the machine-global running-predicate with a small bounded settle: a
/// just-started or just-won-the-race rag service may still be loading models when
/// the first `/health` probe fires, so a single probe would misreport a slow-but-
/// successful start as failed. Bounded at a few attempts with short gaps.
async fn reprobe_rag_until_running(vault: &FsPath) -> rag_client::client::RagMachineState {
    const ATTEMPTS: usize = 4;
    let gap = Duration::from_millis(500);
    let mut last = rag_client::client::RagMachineState::Absent {
        reason: "rag start re-probe pending".to_string(),
    };
    for i in 0..ATTEMPTS {
        last = rag_client::client::probe_machine_state(vault, RAG_LIFECYCLE_HEALTH_TIMEOUT);
        if last.is_running() {
            return last;
        }
        if i + 1 < ATTEMPTS {
            tokio::time::sleep(gap).await;
        }
    }
    last
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
fn rag_start_args(body: &RagControlBody) -> Result<Vec<String>, String> {
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
fn rag_rejected_json(run: &LifecycleRun) -> bool {
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
fn rag_start_failure(stdout: &str) -> Option<(String, Value)> {
    let parsed: Value = serde_json::from_str(stdout).ok()?;
    if parsed.get("ok").and_then(Value::as_bool) == Some(false) {
        let error = parsed.get("error")?.as_str()?.to_string();
        let data = parsed.get("data").cloned().unwrap_or(Value::Null);
        return Some((error, data));
    }
    None
}

async fn start_rag_service(state: &AppState, cell: &ScopeCell, body: &RagControlBody) -> ApiResult {
    // Validate the start flags BEFORE anything else: a bad port is a tiers-carrying
    // 400 that never reaches rag (mirrors the reindex/search arg guards).
    let args = rag_start_args(body)
        .map_err(|reason| super::api_error(state, StatusCode::BAD_REQUEST, reason))?;
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();

    let vault = cell.root.join(".vault");
    // Gate: a running machine service is managed, not restarted (the start flags
    // are moot when we attach to an existing service). The /health probe is
    // blocking socket I/O — offload it (RCR-001).
    let gate_probe = rag_offload(state, {
        let vault = vault.clone();
        move || rag_client::client::probe_machine_state(&vault, RAG_LIFECYCLE_HEALTH_TIMEOUT)
    })
    .await?;
    if let rag_client::client::RagMachineState::Running { info, health } = gate_probe {
        return Ok(super::envelope(
            json!({ "envelope": {
                "status": "already_running",
                "attached": true,
                "pid": health.pid.or(info.pid),
                "port": info.port,
            }}),
            super::query_tiers(cell),
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
        let post_probe = rag_offload(state, {
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
        return Ok(super::envelope(
            json!({ "envelope": {
                "status": "started",
                "attached": true,
                "pid": pid,
                "port": port,
                "output": run.combined(),
            }}),
            super::query_tiers(cell),
            None,
        ));
    }

    // Non-zero exit: either we lost the race (a CLI/MCP/other dashboard owns the
    // machine, rag's lock refused our second service) or a genuine failure. Re-probe
    // with a bounded settle — a just-won race may still be warming — before deciding.
    match reprobe_rag_until_running(&cell.root.join(".vault")).await {
        rag_client::client::RagMachineState::Running { info, health } => Ok(super::envelope(
            json!({ "envelope": {
                "status": "machine_owned",
                "attached": true,
                "pid": health.pid.or(info.pid),
                "port": info.port,
                "output": run.combined(),
            }}),
            super::query_tiers(cell),
            None,
        )),
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
            Ok(super::envelope(
                json!({ "envelope": envelope }),
                super::degraded_tiers(cell, &reason),
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
async fn stop_rag_service(state: &AppState, cell: &ScopeCell) -> ApiResult {
    let run = run_rag_lifecycle_capture(state, &cell.root, &rag_invocation(), &["server", "stop"])
        .await?;
    Ok(super::envelope(
        json!({ "envelope": {
            "status": if run.code == Some(0) { "stopped" } else { "stop_failed" },
            "exit_code": run.code,
            "output": run.combined(),
        }}),
        super::query_tiers(cell),
        None,
    ))
}

pub async fn ops_core(State(state): State<Arc<AppState>>, Path(verb): Path<String>) -> ApiResult {
    let Some((_, args)) = CORE_WHITELIST.iter().find(|(name, _)| *name == verb) else {
        return Err(super::api_error(
            &state,
            StatusCode::FORBIDDEN,
            format!("verb `{verb}` is not whitelisted (R1)"),
        ));
    };
    let runner = ingest_core::runner::CoreRunner::detect();
    let envelope = run_sibling(&state, &runner.invocation, args).await?;
    Ok(super::envelope(
        json!({"envelope": envelope}),
        super::query_tiers(&state.active_cell()),
        None,
    ))
}

/// The typed request body for `POST /ops/core/{verb}/write` (W02): the document
/// `ref` (a stem or in-tree relative path), the optional new markdown `body`
/// (streamed to the sibling's stdin via `--body-stdin` when present), the
/// optional `expected_blob_hash` for optimistic-concurrency conflict detection,
/// and the optional frontmatter fields (`date`, `tags`, `related`). Every field
/// is validated/bounded BEFORE the subprocess spawns (the injection-guard
/// surface, mirroring the git proxy's `validate_*` discipline).
#[derive(serde::Deserialize, Default)]
pub struct CoreWriteBody {
    /// Optional explicit worktree scope. Absent preserves the active-scope
    /// fallback for legacy callers; frontend scoped mutations always send it.
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(rename = "ref")]
    pub doc_ref: String,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub expected_blob_hash: Option<String>,
    #[serde(default)]
    pub date: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub related: Option<Vec<String>>,
    /// The new identity-bearing stem for the `rename` verb (forwarded as `--to`).
    /// Absent for non-rename verbs; a bare stem (no path separator, no `.md`).
    #[serde(default, rename = "to")]
    pub new_stem: Option<String>,
}

fn resolve_core_ops_cell(
    state: &AppState,
    scope: Option<&str>,
) -> Result<Arc<ScopeCell>, (StatusCode, Json<Value>)> {
    match scope {
        Some(scope) => crate::registry::get_or_build(state, scope)
            .map_err(|reason| super::api_error(state, StatusCode::BAD_REQUEST, reason)),
        None => Ok(state.active_cell()),
    }
}

/// Validate the document `ref` (W02): the write target is a doc stem or a
/// bounded, in-tree relative PATH — never an arbitrary CLI argument channel.
/// Rejects an empty token, anything beginning with `-` (which the CLI would read
/// as a flag — the injection vector this guard closes), an absolute path
/// (POSIX `/`, Windows `\` or `C:\`), and any `..` parent-dir traversal segment.
/// Mirrors `validate_diff_path` exactly so the read and write proxies share one
/// path-safety discipline.
fn validate_doc_ref(state: &AppState, doc_ref: &str) -> Result<String, (StatusCode, Json<Value>)> {
    let bad = doc_ref.is_empty()
        || doc_ref.starts_with('-')
        || doc_ref.starts_with('/')
        || doc_ref.starts_with('\\')
        || doc_ref.chars().nth(1) == Some(':')
        || doc_ref.split(['/', '\\']).any(|seg| seg == "..");
    if bad {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "write `ref` `{doc_ref}` must be a doc stem or a bounded, in-tree \
                 relative path (no leading `-`, no absolute path, no `..` traversal)"
            ),
        ));
    }
    Ok(doc_ref.to_string())
}

/// Validate an optional `expected_blob_hash` (W02): if present it MUST be a
/// 40-char lowercase hex git blob OID — never a flag or an argument channel. An
/// absent hash is fine (an unconditional save); a malformed one is a 400 before
/// any subprocess.
fn validate_blob_hash(state: &AppState, hash: &str) -> Result<String, (StatusCode, Json<Value>)> {
    let ok = hash.len() == 40
        && hash
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase());
    if !ok {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("`expected_blob_hash` `{hash}` must be a 40-char lowercase hex git blob OID"),
        ));
    }
    Ok(hash.to_string())
}

/// Validate a single frontmatter list entry (`tags`/`related`) (W02): non-empty
/// and not flag-shaped (no leading `-`), so it can never be read by the sibling
/// CLI as an option. The named `field` is woven into the error message.
fn validate_list_entry(
    state: &AppState,
    field: &str,
    entry: &str,
) -> Result<String, (StatusCode, Json<Value>)> {
    if entry.is_empty() || entry.starts_with('-') {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "`{field}` entry `{entry}` must be non-empty and not flag-shaped (no leading `-`)"
            ),
        ));
    }
    Ok(entry.to_string())
}

/// POST `/ops/core/{verb}/write` — the core WRITE channel (W02): forward a
/// whitelisted `vaultspec-core vault {set-body,set-frontmatter,edit}` verb
/// through the bounded stdin-writing sibling runner so the dashboard editor can
/// save documents. The engine stays READ-AND-INFER — it validates and bounds the
/// request, streams the body to the OWNING sibling's stdin, and forwards the
/// sibling's envelope VERBATIM under `data.envelope`. It persists nothing,
/// mutates no ref, grows no write semantics: the conflict/validation policy lives
/// entirely in the sibling (`engine-read-and-infer`).
///
/// A success (`status:"updated"`/`"unchanged"`) and a business refusal/conflict
/// (`status:"failed"` with `data.conflict`/`data.refused`/`data.checks`) BOTH
/// ride the SAME HTTP 200 forwarded envelope — the client branches on
/// `envelope.status`, never on the HTTP code. No HTTP 409 or engine-side
/// `error_kind` is invented for a business refusal; the refusal travels inside
/// the forwarded envelope. Only a genuine engine/sibling fault (spawn failure,
/// timeout, capped runaway, or an unparseable crash) degrades through `api_error`
/// to a tiers-carrying 5xx. A non-whitelisted verb 403s before any subprocess.
pub async fn ops_core_write(
    State(state): State<Arc<AppState>>,
    Path(verb): Path<String>,
    Json(body): Json<CoreWriteBody>,
) -> ApiResult {
    let Some((_, fixed)) = CORE_WRITE_WHITELIST.iter().find(|(name, _)| *name == verb) else {
        return Err(super::api_error(
            &state,
            StatusCode::FORBIDDEN,
            format!("write verb `{verb}` is not whitelisted (W02)"),
        ));
    };
    let cell = resolve_core_ops_cell(&state, body.scope.as_deref())?;

    // Validate every field BEFORE spawning (the injection-guard surface): the
    // ref, the optional blob hash, and each frontmatter list entry. A bad value
    // is a tiers-carrying 400 that never reaches the sibling.
    let doc_ref = validate_doc_ref(&state, &body.doc_ref)?;
    let expected = match body.expected_blob_hash.as_deref() {
        Some(h) => Some(validate_blob_hash(&state, h)?),
        None => None,
    };
    let date = match body.date.as_deref() {
        // A date is a bounded value the sibling parses; only the flag-injection
        // guard applies at the boundary (the sibling rejects a malformed date).
        Some(d) if d.is_empty() || d.starts_with('-') => {
            return Err(super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!("`date` `{d}` must be non-empty and not flag-shaped (no leading `-`)"),
            ));
        }
        Some(d) => Some(d.to_string()),
        None => None,
    };
    let mut tags: Vec<String> = Vec::new();
    if let Some(list) = &body.tags {
        for entry in list {
            tags.push(validate_list_entry(&state, "tags", entry)?);
        }
    }
    let mut related: Vec<String> = Vec::new();
    if let Some(list) = &body.related {
        for entry in list {
            related.push(validate_list_entry(&state, "related", entry)?);
        }
    }
    // The rename target stem (`--to`): a bare identity-bearing stem, validated at
    // the boundary so it can never escape the doc's directory or inject a flag.
    let new_stem = match body.new_stem.as_deref() {
        Some(s)
            if s.is_empty()
                || s.starts_with('-')
                || s.contains('/')
                || s.contains('\\')
                || s.contains("..")
                || s.ends_with(".md") =>
        {
            return Err(super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!(
                    "`to` `{s}` must be a bare stem (no path separator, no leading `-`, no `.md`)"
                ),
            ));
        }
        Some(s) => Some(s.to_string()),
        None => None,
    };

    // Assemble the sibling argv: the whitelist fixed args + REF + the typed flags
    // + `--body-stdin` (only when a body is present) + `--json` (appended by the
    // runner). The argv is value-only — every token is either a fixed whitelist
    // arg or a validated input; no client string is ever read as a flag.
    let mut args: Vec<String> = fixed.iter().map(|s| s.to_string()).collect();
    args.push(doc_ref);
    if let Some(s) = &new_stem {
        args.push("--to".into());
        args.push(s.clone());
    }
    if let Some(h) = &expected {
        args.push("--expected-blob-hash".into());
        args.push(h.clone());
    }
    if let Some(d) = &date {
        args.push("--date".into());
        args.push(d.clone());
    }
    for t in &tags {
        args.push("--tags".into());
        args.push(t.clone());
    }
    for r in &related {
        args.push("--related".into());
        args.push(r.clone());
    }
    if body.body.is_some() {
        args.push("--body-stdin".into());
    }
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();

    let runner = ingest_core::runner::CoreRunner::detect();
    let envelope = run_sibling_write_bounded(
        &state,
        &cell,
        &runner.invocation,
        &arg_refs,
        body.body.as_deref(),
        SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await?;

    // Forward VERBATIM: identical to `ops_core`'s success shape, so a refusal
    // (`status:"failed"`) and a success (`status:"updated"`) BOTH ride this 200
    // envelope. The client branches on `envelope.status` +
    // `data.conflict`/`data.refused`/`data.checks`.
    Ok(super::envelope(
        json!({ "envelope": envelope }),
        super::query_tiers(&cell),
        None,
    ))
}

/// The typed request body for `POST /ops/core/autofix` (W04.P06.S15): the optional
/// worktree `scope` and the `feature` tag whose documents are repaired. The feature
/// is validated/bounded BEFORE the subprocess spawns (the injection-guard surface).
#[derive(serde::Deserialize, Default)]
pub struct CoreAutofixBody {
    #[serde(default)]
    pub scope: Option<String>,
    pub feature: String,
    /// Preview the repairs without writing (dry-run-discipline): forwards
    /// `--dry-run` so the editor can show what `--fix` WOULD change before it is
    /// applied. A bulk auto-repair should be previewable, not fire-and-forget.
    #[serde(default)]
    pub dry_run: bool,
}

/// POST `/ops/core/autofix` — forward `vault check all --fix --feature <tag>`
/// through the engine broker so the editor's `fixable` conformance advisories can be
/// repaired without exposing the frontend to vaultspec-core. FEATURE-SCOPED (never
/// the whole vault) to bound the blast radius; the watcher re-ingests the fixed docs
/// and the generation bump signals the frontend. The forwarded envelope rides the
/// shared tiers helper like every other op (read-and-infer preserved: the engine
/// invents no fix semantics — it forwards the sibling's repair verb verbatim).
pub async fn ops_core_autofix(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CoreAutofixBody>,
) -> ApiResult {
    let cell = resolve_core_ops_cell(&state, body.scope.as_deref())?;
    let feature = validate_token(&state, "feature", &body.feature)?;
    let mut args: Vec<String> = vec![
        "vault".into(),
        "check".into(),
        "all".into(),
        "--fix".into(),
        "--feature".into(),
        feature,
    ];
    if body.dry_run {
        args.push("--dry-run".into());
    }
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let runner = ingest_core::runner::CoreRunner::detect();
    let envelope = run_sibling_write_bounded(
        &state,
        &cell,
        &runner.invocation,
        &arg_refs,
        None,
        SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await?;
    Ok(super::envelope(
        json!({ "envelope": envelope }),
        super::query_tiers(&cell),
        None,
    ))
}

/// The typed request body for `POST /ops/core/archive`: the optional worktree
/// `scope`, the `feature` tag whose documents are archived, and an optional
/// `dry_run` preview flag. The feature is validated/bounded BEFORE the subprocess
/// spawns (the injection-guard surface).
#[derive(serde::Deserialize, Default)]
pub struct CoreArchiveBody {
    #[serde(default)]
    pub scope: Option<String>,
    pub feature: String,
    /// Preview the archive without moving anything (vaultspec-archive-discipline):
    /// forwards `--dry-run` so the dashboard can show WHICH documents move and
    /// WHICH incoming cross-feature `related:` links would break BEFORE applying a
    /// feature-wide retirement. The discipline this destructive verb requires.
    #[serde(default)]
    pub dry_run: bool,
}

/// POST `/ops/core/archive` — forward `vault feature archive <tag>` through the
/// engine broker so the dashboard's left rail can archive a completed feature's
/// documents without exposing the frontend to vaultspec-core. FEATURE-SCOPED (the
/// only archive grain vaultspec-core has — there is no per-document archive verb).
/// Read-and-infer preserved: the engine validates and bounds the feature token and
/// forwards the sibling's envelope VERBATIM under `data.envelope`; it persists
/// nothing and grows no archive semantics. A success and a business refusal
/// (`status:"failed"`, e.g. an unknown tag) BOTH ride one HTTP 200 — the client
/// branches on `envelope.status`, never the HTTP code. The watcher re-ingests the
/// moved documents and the generation bump signals the frontend.
pub async fn ops_core_archive(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CoreArchiveBody>,
) -> ApiResult {
    let cell = resolve_core_ops_cell(&state, body.scope.as_deref())?;
    let feature = validate_token(&state, "feature", &body.feature)?;
    let mut args: Vec<String> = vec!["vault".into(), "feature".into(), "archive".into(), feature];
    if body.dry_run {
        args.push("--dry-run".into());
    }
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let runner = ingest_core::runner::CoreRunner::detect();
    let envelope = run_sibling_write_bounded(
        &state,
        &cell,
        &runner.invocation,
        &arg_refs,
        None,
        SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await?;
    Ok(super::envelope(
        json!({ "envelope": envelope }),
        super::query_tiers(&cell),
        None,
    ))
}

/// The typed request body for `POST /ops/core/unarchive`: the optional worktree
/// `scope` and the `feature` tag to restore. The feature is validated/bounded
/// BEFORE the subprocess spawns (the injection-guard surface).
#[derive(serde::Deserialize, Default)]
pub struct CoreUnarchiveBody {
    #[serde(default)]
    pub scope: Option<String>,
    pub feature: String,
}

/// POST `/ops/core/unarchive` — forward `vault feature unarchive <tag>` through the
/// engine broker: the REVERSIBILITY half of archive (mutation/destruction audit
/// D5). A mistaken feature archive is undone IN-PRODUCT rather than only via git,
/// so a feature-wide retirement is no longer a one-way door from the dashboard.
/// Read-and-infer preserved: the engine validates and bounds the feature token and
/// forwards the sibling's envelope VERBATIM under `data.envelope`; it persists
/// nothing and grows no archive semantics. A success and a business refusal
/// (`status:"failed"`, e.g. a tag that was never archived) BOTH ride one HTTP 200 —
/// the client branches on `envelope.status`. The watcher re-ingests the restored
/// documents and the generation bump signals the frontend.
pub async fn ops_core_unarchive(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CoreUnarchiveBody>,
) -> ApiResult {
    let cell = resolve_core_ops_cell(&state, body.scope.as_deref())?;
    let feature = validate_token(&state, "feature", &body.feature)?;
    let args = ["vault", "feature", "unarchive", feature.as_str()];
    let runner = ingest_core::runner::CoreRunner::detect();
    let envelope = run_sibling_write_bounded(
        &state,
        &cell,
        &runner.invocation,
        &args,
        None,
        SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await?;
    Ok(super::envelope(
        json!({ "envelope": envelope }),
        super::query_tiers(&cell),
        None,
    ))
}

/// The typed request body for `POST /ops/core/link`: the optional worktree
/// `scope` and the `src`/`dst` document stems of a `related:` edge. Both stems are
/// validated/bounded BEFORE the subprocess spawns (the injection-guard surface).
#[derive(serde::Deserialize, Default)]
pub struct CoreLinkBody {
    #[serde(default)]
    pub scope: Option<String>,
    pub src: String,
    pub dst: String,
}

/// POST `/ops/core/link` — forward `vault link add <src> <dst>` through the engine
/// broker so the dashboard can add a `related:` edge between two documents without
/// exposing the frontend to vaultspec-core. Read-and-infer preserved: the engine
/// validates and bounds the two stems and forwards the sibling's envelope VERBATIM
/// under `data.envelope`; it persists nothing and grows no edge semantics (the
/// dangling-edge refusal and resolution policy live in the sibling). A success and
/// a business refusal (e.g. a dangling target) BOTH ride one HTTP 200 — the client
/// branches on `envelope.status`. The watcher re-ingests the edited source and the
/// generation bump signals the frontend.
pub async fn ops_core_link(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CoreLinkBody>,
) -> ApiResult {
    let cell = resolve_core_ops_cell(&state, body.scope.as_deref())?;
    let src = validate_token(&state, "src", &body.src)?;
    let dst = validate_token(&state, "dst", &body.dst)?;
    let args = ["vault", "link", "add", src.as_str(), dst.as_str()];
    let runner = ingest_core::runner::CoreRunner::detect();
    let envelope = run_sibling_write_bounded(
        &state,
        &cell,
        &runner.invocation,
        &args,
        None,
        SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await?;
    Ok(super::envelope(
        json!({ "envelope": envelope }),
        super::query_tiers(&cell),
        None,
    ))
}

/// The typed request body for `POST /ops/core/create` (W02): the typed params of
/// `vaultspec-core vault add <type> --feature <tag> [--title <t>] [--related …]`.
/// Unlike the write channel this carries NO body/stdin — `vault add` scaffolds a
/// new document from typed create params alone. Every field is validated/bounded
/// BEFORE the subprocess spawns (the same injection-guard surface as the write
/// body).
#[derive(serde::Deserialize, Default)]
pub struct CoreCreateBody {
    /// Optional explicit worktree scope. Absent preserves the active-scope
    /// fallback for legacy callers; frontend scoped mutations always send it.
    #[serde(default)]
    pub scope: Option<String>,
    pub doc_type: String,
    pub feature: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub related: Option<Vec<String>>,
}

/// Validate a bounded kebab/word token (`doc_type`, `feature`) for the create
/// channel (W02): non-empty, not flag-shaped (no leading `-` — the injection
/// vector), and restricted to the kebab/word grammar `[A-Za-z0-9_-]+` so it can
/// never carry a path separator, whitespace, or shell-meaningful character into
/// the sibling argv. The named `field` is woven into the error message.
fn validate_token(
    state: &AppState,
    field: &str,
    token: &str,
) -> Result<String, (StatusCode, Json<Value>)> {
    let ok = !token.is_empty()
        && !token.starts_with('-')
        && token
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    if !ok {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "`{field}` `{token}` must be a non-empty kebab/word token \
                 (letters, digits, `-`, `_`; no leading `-`)"
            ),
        ));
    }
    Ok(token.to_string())
}

/// POST `/ops/core/create` — the core CREATE channel (W02): forward a
/// `vaultspec-core vault add <type> --feature <tag> [--title <t>] [--related …]`
/// through the bounded sibling runner so the dashboard editor can scaffold a new
/// document. The engine stays READ-AND-INFER — it validates and bounds the typed
/// create params (no stdin body) and forwards the sibling's envelope VERBATIM
/// under `data.envelope`. It persists nothing and grows no create semantics: the
/// scaffolding/validation policy lives entirely in the sibling
/// (`engine-read-and-infer`).
///
/// Identical contract to the write channel: a success (`status:"created"`) and a
/// business refusal (`status:"failed"`) BOTH ride the SAME HTTP 200 forwarded
/// envelope — the client branches on `envelope.status`, never the HTTP code. Only
/// a genuine engine/sibling fault (spawn failure, timeout, capped runaway, or an
/// unparseable crash) degrades through `api_error` to a tiers-carrying 5xx.
pub async fn ops_core_create(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CoreCreateBody>,
) -> ApiResult {
    let cell = resolve_core_ops_cell(&state, body.scope.as_deref())?;
    // Validate every field BEFORE spawning (the injection-guard surface): the
    // required doc_type and feature tokens, the optional title (flag-injection
    // guard only — the title is free prose the sibling stores verbatim), and each
    // related entry. A bad value is a tiers-carrying 400 that never reaches the
    // sibling.
    let doc_type = validate_token(&state, "doc_type", &body.doc_type)?;
    let feature = validate_token(&state, "feature", &body.feature)?;
    let title = match body.title.as_deref() {
        Some(t) if t.is_empty() || t.starts_with('-') => {
            return Err(super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!("`title` `{t}` must be non-empty and not flag-shaped (no leading `-`)"),
            ));
        }
        Some(t) => Some(t.to_string()),
        None => None,
    };
    let mut related: Vec<String> = Vec::new();
    if let Some(list) = &body.related {
        for entry in list {
            related.push(validate_list_entry(&state, "related", entry)?);
        }
    }

    // Assemble the sibling argv: `vault add <doc_type> --feature <feature>
    // [--title <title>] [--related <r>]* --json`. Every token is a fixed verb arg
    // or a validated input; no client string is ever read as a flag.
    let mut args: Vec<String> = vec!["vault".into(), "add".into(), doc_type];
    args.push("--feature".into());
    args.push(feature);
    if let Some(t) = &title {
        args.push("--title".into());
        args.push(t.clone());
    }
    for r in &related {
        args.push("--related".into());
        args.push(r.clone());
    }
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();

    // No stdin body — `vault add` takes its params from argv. The same bounded
    // runner forwards verbatim: a parseable `status`-bearing envelope (created OR
    // failed) is Ok; only a true crash is an Err.
    let runner = ingest_core::runner::CoreRunner::detect();
    let envelope = run_sibling_write_bounded(
        &state,
        &cell,
        &runner.invocation,
        &arg_refs,
        None,
        SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await?;

    Ok(super::envelope(
        json!({ "envelope": envelope }),
        super::query_tiers(&cell),
        None,
    ))
}

// --- /ops/rag/* brokering (rag-control-plane ADR D1/D2) ----------------------
//
// One namespace, two transports: GET reads + POST controls go over rag's HTTP
// service through `rag_client::control` (rag owns its runtime truth, indexing is
// job-based); POST process-lifecycle verbs stay the bounded CLI runner. Every
// response — success, rag-down degradation, and validation error — carries the
// `tiers` block through the shared envelope helper, and rag's envelope passes
// through VERBATIM under `data.envelope` (engine-read-and-infer: zero rag
// semantics; the engine validates, bounds, and forwards).

/// The optional request body for a POST `/ops/rag/{verb}` control verb. Absent
/// for the lifecycle verbs and `quality`. Every field is validated/bounded
/// before it reaches rag (P02.S12); the reindex/watcher `project_root`/`root`
/// is the ENGINE-controlled active scope root unless an explicit evict target
/// is named, so the frontend can never point rag at an arbitrary path through
/// reindex or the watcher.
#[derive(serde::Deserialize, Default)]
pub struct RagControlBody {
    #[serde(default)]
    pub clean: Option<bool>,
    #[serde(default, rename = "type")]
    pub reindex_type: Option<String>,
    #[serde(default)]
    pub initiator_kind: Option<String>,
    #[serde(default)]
    pub debounce_ms: Option<u64>,
    #[serde(default)]
    pub cooldown_s: Option<f64>,
    /// The evict target root (for `project-evict`). Other control verbs operate
    /// on the active scope root and ignore this.
    #[serde(default)]
    pub root: Option<String>,
    /// `server-start` only (D5 arg pass-through): use rag's on-disk local-only
    /// backend (no managed Qdrant) — the only workable backend on CI/offline/
    /// air-gapped hosts. Ignored by every other verb.
    #[serde(default)]
    pub local_only: Option<bool>,
    /// `server-start` only: the service port to bind (bounded, non-privileged).
    #[serde(default)]
    pub port: Option<u16>,
    /// `server-start` only: download the managed Qdrant binary if it is missing,
    /// rather than failing with a needs-install hint.
    #[serde(default)]
    pub qdrant_auto_provision: Option<bool>,
}

/// Watcher debounce ceiling: 10 minutes. A larger value is almost certainly a
/// client bug (ms vs s confusion) and would make the watcher feel dead.
const MAX_WATCH_DEBOUNCE_MS: u64 = 600_000;
/// Watcher cooldown ceiling: 1 hour.
const MAX_WATCH_COOLDOWN_S: f64 = 3_600.0;
/// Brokered rag job snapshots are an activity strip, not an unbounded audit log.
const MAX_RAG_JOBS_LIMIT: u32 = 50;
/// Brokered rag log reads are diagnostic snippets, never an unbounded log stream.
const MAX_RAG_LOG_LINES: u32 = 500;

fn bounded_rag_read_u32(params: &HashMap<String, String>, key: &str, max: u32) -> Option<u32> {
    params
        .get(key)
        .and_then(|value| value.parse::<u32>().ok())
        .map(|value| value.min(max))
}

/// Discover rag and build a bounded control transport to its SERVICE port with
/// `budget` as the per-verb wall-clock, or the truthful "rag unavailable"
/// reason. Degradation is read from discovery (`degradation-is-read-from-tiers`),
/// never guessed from a transport error: a missing/stale `service.json` is the
/// honest "semantic tier down" fact.
fn rag_control_transport(
    cell: &ScopeCell,
    budget: Duration,
) -> Result<rag_client::client::LoopbackTransport, String> {
    match rag_client::client::discover(&cell.root.join(".vault")) {
        (rag_client::RagAvailability::Available, Some(info)) => {
            Ok(rag_client::client::LoopbackTransport {
                port: info.port,
                bearer: info.service_token,
                timeout: budget,
            })
        }
        (rag_client::RagAvailability::Unavailable { reason }, _) => Err(reason),
        _ => Err("rag service discovery returned no service info".to_string()),
    }
}

/// Wrap a brokered rag control result in the shared envelope: rag's value passes
/// through VERBATIM under `data.envelope` with the live tiers block on success;
/// a rag transport/shape fault degrades the `semantic` tier with an empty
/// envelope (never a hard 5xx — the control plane reads degraded state from the
/// tiers block, not an error).
fn brokered_envelope(cell: &ScopeCell, result: rag_client::client::Result<Value>) -> Json<Value> {
    match result {
        Ok(value) => super::envelope(json!({ "envelope": value }), super::query_tiers(cell), None),
        Err(e) => {
            let reason = rag_client::search::degradation_reason(&e);
            super::envelope(
                json!({ "envelope": Value::Null }),
                super::degraded_tiers(cell, reason.as_str()),
                None,
            )
        }
    }
}

/// Offload a blocking rag transport call chain onto the blocking pool (RCR-001).
/// The rag loopback transport is synchronous `std::net` I/O — bounded by a socket
/// timeout + the `MAX_RAG_BODY` cap — but running it DIRECTLY on a Tokio async
/// worker lets a burst of slow/stalled rag reads pin every worker and stall the
/// whole engine (every route, not just rag) up to the largest in-flight budget.
/// The closure OWNS its transport + args; a task join failure (a panic in the
/// blocking call) surfaces as a 500 through the shared error helper. Mirrors the
/// `spawn_blocking` discipline already used for the code-corpus + declared folds.
async fn rag_offload<T: Send + 'static>(
    state: &AppState,
    f: impl FnOnce() -> T + Send + 'static,
) -> Result<T, (StatusCode, Json<Value>)> {
    tokio::task::spawn_blocking(f).await.map_err(|e| {
        super::api_error(
            state,
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("rag read task failed: {e}"),
        )
    })
}

/// GET `/ops/rag/collection-health?collection=<name>` — Tier-2 Qdrant-native
/// health (rag-service-management D6 / W02.P05). Reads Qdrant's documented
/// `GET /collections/{name}` DIRECTLY on its loopback port, but GATED on the
/// Qdrant version reported by rag's `/health`: an unknown/unsupported Qdrant major
/// degrades honestly (`supported:false`, version stated) instead of risking the
/// silent break a rag-side Qdrant change could cause. The collection name is
/// supplied by the caller (sourced from the storage survey) and validated as a
/// single path segment (injection guard). Returns the optimizer/segment/
/// indexed-vs-total health the operations console reads as the "needs repair"
/// signal.
async fn rag_collection_health(
    state: &AppState,
    cell: &ScopeCell,
    params: &HashMap<String, String>,
) -> ApiResult {
    // Validate the collection name as a single, conservative path segment.
    let collection = match params.get("collection") {
        Some(c)
            if !c.is_empty()
                && c.len() <= 256
                && c.chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-') =>
        {
            c.as_str()
        }
        _ => {
            return Err(super::api_error(
                state,
                StatusCode::BAD_REQUEST,
                "collection-health requires a `collection` query param (alphanumeric, `_`, `-`; <=256 chars)".to_string(),
            ));
        }
    };
    // Qdrant health is only meaningful when rag is running (rag owns Qdrant). The
    // /health probe is blocking socket I/O — offload it (RCR-001).
    let vault = cell.root.join(".vault");
    let probe = rag_offload(state, move || {
        rag_client::client::probe_machine_state(&vault, RAG_LIFECYCLE_HEALTH_TIMEOUT)
    })
    .await?;
    let rag_client::client::RagMachineState::Running { info, health } = probe else {
        return Ok(super::envelope(
            json!({ "envelope": { "supported": false, "reason": "rag service is not running" } }),
            super::degraded_tiers(cell, "rag service is not running (no Qdrant)"),
            None,
        ));
    };
    let version = health.qdrant.as_ref().and_then(|q| q.version.as_deref());
    // Capability/version gate (D6): fail closed on an unrecognized Qdrant major.
    if !rag_client::vectors::qdrant_collection_api_supported(version) {
        return Ok(super::envelope(
            json!({ "envelope": {
                "supported": false,
                "qdrant_version": version,
                "reason": "Qdrant version is not a recognized 1.x; Tier-2 health degraded",
            }}),
            super::query_tiers(cell),
            None,
        ));
    }
    // Reachability gate: in local-only mode there is no Qdrant HTTP endpoint, so a
    // direct read would dial a port nothing listens on. Report `supported:false`
    // honestly with a clear reason rather than degrading on a connection refusal.
    if !health.qdrant.as_ref().is_some_and(|q| q.http_reachable()) {
        return Ok(super::envelope(
            json!({ "envelope": {
                "supported": false,
                "qdrant_version": version,
                "reason": "Qdrant has no HTTP endpoint (local-only mode); Tier-2 health needs server mode",
            }}),
            super::query_tiers(cell),
            None,
        ));
    }
    // Supported: read Qdrant's collection-info directly on its loopback port.
    let transport = rag_client::client::LoopbackTransport {
        port: info.qdrant_port(),
        bearer: None,
        timeout: rag_client::control::READ_BUDGET,
    };
    // Direct Qdrant collection read — blocking socket I/O, offload it (RCR-001).
    // The cheap `.map` result shaping stays on the async thread.
    let collection_owned = collection.to_string();
    let health = rag_offload(state, move || {
        rag_client::vectors::read_collection_health(&transport, &collection_owned)
    })
    .await?;
    let result = health.map(|h| {
        json!({
            "supported": true,
            "qdrant_version": version,
            "collection": collection,
            "health": h,
        })
    });
    Ok(brokered_envelope(cell, result))
}

/// GET `/ops/rag/{verb}` — the brokered rag READ verbs (rag-control-plane ADR
/// D2): service-state, jobs, watcher, projects, readiness, logs, metrics. Each
/// is a bounded HTTP read of rag's resident service, forwarded verbatim with the
/// tiers block. A read against a down rag degrades the semantic tier honestly;
/// an unknown verb 403s before any round-trip.
/// The brokered rag GET read verbs (rag-control-plane ADR D2).
const RAG_READ_VERBS: &[&str] = &[
    "service-state",
    "jobs",
    "watcher",
    "projects",
    "readiness",
    "logs",
    "metrics",
    // The Rust-aggregated size/state snapshot (one call vs six) and the raw
    // per-namespace storage survey (orphan/size detail).
    "ops-state",
    "storage-survey",
    // Tier-2 Qdrant-native collection health (optimizer/segments/indexed), gated
    // on the Qdrant version — the "needs repair" signal rag does not expose.
    "collection-health",
];

/// Storage-survey namespace ceiling for the raw `storage-survey` read verb (the
/// aggregated `ops-state` uses its own bounded survey limit).
const MAX_RAG_SURVEY_LIMIT: u32 = 256;

pub async fn ops_rag_get(
    State(state): State<Arc<AppState>>,
    Path(verb): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> ApiResult {
    // An unknown read verb 403s BEFORE any discovery or round-trip — the tiers
    // block rides the 403 through the shared error helper.
    if !RAG_READ_VERBS.contains(&verb.as_str()) {
        return Err(super::api_error(
            &state,
            StatusCode::FORBIDDEN,
            format!("rag read verb `{verb}` is not brokered (GET /ops/rag)"),
        ));
    }
    let cell = state.active_cell();
    let project_root = cell.root.to_string_lossy().to_string();

    // collection-health is a Tier-2 Qdrant-native read on a DIFFERENT transport
    // (Qdrant's loopback port) gated on the Qdrant version, so it handles its own
    // discovery + transport rather than the standard rag-service one below.
    if verb == "collection-health" {
        return rag_collection_health(&state, &cell, &params).await;
    }

    // Per-verb wall-clock budget (ADR honest difficulty: a fast `/jobs` poll and
    // a slow `/quality` probe need different bounds). Reads are fast.
    let transport = match rag_control_transport(&cell, rag_client::control::READ_BUDGET) {
        Ok(t) => t,
        // rag down/absent: every read degrades to the tier block, never a 5xx.
        Err(reason) => {
            return Ok(super::envelope(
                json!({ "envelope": Value::Null }),
                super::degraded_tiers(&cell, reason.as_str()),
                None,
            ));
        }
    };

    let job_id = params.get("job_id").cloned();
    let limit = bounded_rag_read_u32(&params, "limit", MAX_RAG_JOBS_LIMIT);
    let lines = bounded_rag_read_u32(&params, "lines", MAX_RAG_LOG_LINES);
    let survey_limit = bounded_rag_read_u32(&params, "limit", MAX_RAG_SURVEY_LIMIT);

    // Offload the blocking transport reads onto the blocking pool (RCR-001): the
    // closure owns the transport + args so a slow/stalled read cannot pin a worker.
    let result = rag_offload(&state, move || {
        use rag_client::control;
        match verb.as_str() {
            "service-state" => control::service_state(&transport, &project_root),
            "jobs" => control::jobs(&transport, job_id.as_deref(), limit),
            "watcher" => control::watcher_get(&transport, &project_root),
            "projects" => control::projects(&transport),
            "readiness" => control::readiness(&transport),
            "logs" => control::logs(&transport, lines, job_id.as_deref()),
            // Prometheus text is not JSON; forward it verbatim under a string field.
            "metrics" => control::metrics(&transport).map(|text| json!({ "metrics": text })),
            "storage-survey" => control::storage_survey(&transport, survey_limit),
            // The Rust-aggregated size/state snapshot: fetch + derive, then serialize.
            "ops-state" => control::fetch_rag_ops_state(&transport, &project_root)
                .and_then(|state| serde_json::to_value(state).map_err(Into::into)),
            _ => unreachable!("RAG_READ_VERBS membership is checked above"),
        }
    })
    .await?;
    Ok(brokered_envelope(&cell, result))
}

/// POST `/ops/rag/{verb}` — the brokered rag CONTROL verbs over HTTP (reindex,
/// watcher start/stop/reconfigure, project-evict, quality) and, falling through,
/// the PROCESS-LIFECYCLE verbs on the bounded CLI runner (server start/stop/
/// status/doctor/install). HTTP control args are validated against rag's
/// vocabulary and bounded before forwarding (P02.S12); rag's envelope passes
/// through verbatim with the tiers block.
pub async fn ops_rag(
    State(state): State<Arc<AppState>>,
    Path(verb): Path<String>,
    body: Option<Json<RagControlBody>>,
) -> ApiResult {
    let cell = state.active_cell();
    let project_root = cell.root.to_string_lossy().to_string();
    let body = body.map(|Json(b)| b).unwrap_or_default();

    use rag_client::control;

    // HTTP-brokered control verbs (rag's runtime truth, job-based reindex). Each
    // is validated, then forwarded over the bounded control transport.
    let http_verb = matches!(
        verb.as_str(),
        "reindex"
            | "watcher-start"
            | "watcher-stop"
            | "watcher-reconfigure"
            | "project-evict"
            | "quality"
    );
    if http_verb {
        // Validate args BEFORE building the transport so a bad value is a
        // tiers-carrying 400 that never reaches rag (mirrors the search target
        // guard). The dash-prefix guard closes the flag-injection vector.
        let reindex_type = match body.reindex_type.as_deref() {
            None => "vault",
            Some(t @ ("vault" | "code")) => t,
            Some(other) => {
                return Err(super::api_error(
                    &state,
                    StatusCode::BAD_REQUEST,
                    format!("reindex `type` `{other}` must be `vault` or `code`"),
                ));
            }
        };
        let initiator_kind = match body.initiator_kind.as_deref() {
            None => "service",
            Some(k @ ("cli" | "mcp" | "service" | "watcher")) => k,
            Some(other) => {
                return Err(super::api_error(
                    &state,
                    StatusCode::BAD_REQUEST,
                    format!(
                        "reindex `initiator_kind` `{other}` must be one of cli, mcp, service, watcher"
                    ),
                ));
            }
        };
        if let Some(ms) = body.debounce_ms
            && ms > MAX_WATCH_DEBOUNCE_MS
        {
            return Err(super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!(
                    "watcher `debounce_ms` {ms} exceeds the {MAX_WATCH_DEBOUNCE_MS} ms ceiling"
                ),
            ));
        }
        if let Some(s) = body.cooldown_s
            && !(0.0..=MAX_WATCH_COOLDOWN_S).contains(&s)
        {
            return Err(super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!("watcher `cooldown_s` {s} must be within 0..={MAX_WATCH_COOLDOWN_S}"),
            ));
        }
        // The evict target: an explicit body root (a listed project), or the
        // active scope. A dash-prefixed value is rejected as a flag-injection
        // guard, mirroring the diff-path/rev guards.
        let evict_root = match body.root.as_deref() {
            Some(r) if r.starts_with('-') || r.is_empty() => {
                return Err(super::api_error(
                    &state,
                    StatusCode::BAD_REQUEST,
                    format!("evict `root` `{r}` must be a non-empty path (no leading `-`)"),
                ));
            }
            Some(r) => r.to_string(),
            None => project_root.clone(),
        };

        let budget = match verb.as_str() {
            "quality" => control::QUALITY_BUDGET,
            _ => control::CONTROL_BUDGET,
        };
        let transport = match rag_control_transport(&cell, budget) {
            Ok(t) => t,
            Err(reason) => {
                return Ok(super::envelope(
                    json!({ "envelope": Value::Null }),
                    super::degraded_tiers(&cell, reason.as_str()),
                    None,
                ));
            }
        };
        // Offload the blocking control round-trip onto the blocking pool (RCR-001):
        // the closure owns the transport + owned copies of the validated args, so a
        // slow rag control call cannot pin an async worker — matters most for
        // `/quality` (a 60s budget) that several concurrent panels can trigger.
        let reindex_type = reindex_type.to_string();
        let initiator_kind = initiator_kind.to_string();
        let clean = body.clean.unwrap_or(false);
        let debounce_ms = body.debounce_ms;
        let cooldown_s = body.cooldown_s;
        let project_root = project_root.clone();
        let verb_owned = verb.clone();
        let result = rag_offload(&state, move || match verb_owned.as_str() {
            "reindex" => control::reindex(
                &transport,
                &control::ReindexArgs {
                    project_root: &project_root,
                    reindex_type: &reindex_type,
                    clean,
                    initiator_kind: &initiator_kind,
                },
            ),
            "watcher-start" => control::watcher_start(&transport, &project_root),
            "watcher-stop" => control::watcher_stop(&transport, &project_root),
            "watcher-reconfigure" => {
                control::watcher_reconfigure(&transport, &project_root, debounce_ms, cooldown_s)
            }
            "project-evict" => control::projects_evict(&transport, &evict_root),
            "quality" => control::quality(&transport),
            _ => unreachable!("http_verb set guards the match"),
        })
        .await?;
        return Ok(brokered_envelope(&cell, result));
    }

    // Process-lifecycle verbs (a dead service cannot be reached over HTTP, ADR
    // D1). server-start/stop carry the machine-singleton attach-never-own
    // discipline through their dedicated capture handlers: start appends `--json`
    // VERSION-TOLERANTLY (retrying without it when an older rag exits 2 rejecting
    // the option, per `rag_rejected_json`), stop carries no `--json`.
    // status/doctor/install keep the shared JSON sibling runner (RAG_CLI_WHITELIST).
    match verb.as_str() {
        "server-start" => start_rag_service(&state, &cell, &body).await,
        "server-stop" => stop_rag_service(&state, &cell).await,
        "server-status" | "server-doctor" | "server-install" => {
            let (_, args) = RAG_CLI_WHITELIST
                .iter()
                .find(|(name, _)| *name == verb)
                .expect("verb is in the JSON-runner lifecycle set");
            let envelope = run_sibling(&state, &rag_invocation(), args).await?;
            Ok(super::envelope(
                json!({ "envelope": envelope }),
                super::query_tiers(&cell),
                None,
            ))
        }
        _ => Err(super::api_error(
            &state,
            StatusCode::FORBIDDEN,
            format!("verb `{verb}` is not whitelisted (rag control plane)"),
        )),
    }
}

/// POST `/ops/rag/storage/{verb}` — the DESTRUCTIVE rag storage broker
/// (rag-storage-broker ADR): `storage-delete`/`storage-prune`/`storage-migrate` run
/// on the bounded CLI subprocess runner (rag exposes them CLI-only), with their
/// arguments validated before the spawn and the dry-run-default/explicit-apply gate
/// applied. A non-whitelisted verb 403s before any subprocess; a malformed argument
/// 400s; rag's `{ok, command, ...}` envelope (including a `would_remove` preview that
/// exits 1) forwards verbatim with the tiers block, and only a genuine
/// spawn/timeout/crash degrades to a gateway error. delete/prune are MACHINE-scoped
/// (no `project_root` derivation); migrate sources its root from the active cell. The
/// engine forwards a validated request to the sibling that OWNS the destructive op and
/// decides no storage policy of its own (`engine-read-and-infer`).
pub async fn ops_rag_storage(
    State(state): State<Arc<AppState>>,
    Path(verb): Path<String>,
    body: Option<Json<RagStorageBody>>,
) -> ApiResult {
    let Some((_, fixed)) = RAG_STORAGE_CLI_WHITELIST
        .iter()
        .find(|(name, _)| *name == verb)
    else {
        return Err(super::api_error(
            &state,
            StatusCode::FORBIDDEN,
            format!("storage verb `{verb}` is not whitelisted (rag storage broker)"),
        ));
    };
    let cell = state.active_cell();
    let cell_root = cell.root.to_string_lossy().to_string();
    let body = body.map(|Json(b)| b).unwrap_or_default();
    let args = storage_args_for(&state, &verb, fixed, &cell_root, &body)?;
    let envelope = run_storage_sibling_bounded(
        &state,
        &cell.root,
        &rag_invocation(),
        &args,
        STORAGE_SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await?;
    Ok(super::envelope(
        json!({ "envelope": envelope }),
        super::query_tiers(&cell),
        None,
    ))
}

/// The optional request body for `/ops/git/{verb}`: the `diff`/`histdiff`
/// verb's path, plus the two revs the `histdiff` (historical) verb diffs
/// between. Absent for argument-free verbs (status, numstat). The body is
/// optional so a GET-shaped status call need not carry one.
#[derive(serde::Deserialize, Default)]
pub struct GitOpBody {
    /// Optional explicit worktree scope. Absent preserves the active-scope fallback
    /// for legacy callers; frontend scoped caches always send it.
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
    /// The `from` revision for the two-rev historical diff (`histdiff`).
    #[serde(default)]
    pub from: Option<String>,
    /// The `to` revision for the two-rev historical diff (`histdiff`).
    #[serde(default)]
    pub to: Option<String>,
}

/// POST `/ops/git/{verb}` — the read-only git pass-through (dashboard-pipeline-
/// wire W04.P10.S52; historical diff figma-parity-reconciliation S14): forward a
/// whitelisted, read-only git verb through the bounded runner and the shared
/// envelope helper, returning git's output VERBATIM inside `{data: {output,
/// verb}}` with the tiers block. The `histdiff` verb runs a two-rev `git diff
/// <from> <to> -- <path>` over the object DB (both revs and the path validated).
/// A non-whitelisted verb 403s before any subprocess; a git fault degrades to a
/// tiers-carrying error envelope. The engine implements no diff algorithm and
/// exposes no mutating git verb — `engine-read-and-infer`.
pub async fn ops_git(
    State(state): State<Arc<AppState>>,
    Path(verb): Path<String>,
    body: Option<Json<GitOpBody>>,
) -> ApiResult {
    let Some((name, fixed)) = GIT_WHITELIST.iter().find(|(name, _)| *name == verb) else {
        return Err(super::api_error(
            &state,
            StatusCode::FORBIDDEN,
            format!("git verb `{verb}` is not whitelisted (read-only ops/git)"),
        ));
    };
    let GitOpBody {
        scope,
        path,
        from,
        to,
    } = body.map(|Json(b)| b).unwrap_or_default();
    let cell = match scope.as_deref() {
        Some(scope) => crate::registry::get_or_build(&state, scope)
            .map_err(|reason| super::api_error(&state, StatusCode::BAD_REQUEST, reason))?,
        None => state.active_cell(),
    };
    // A two-rev historical diff carries both revs; either alone is a 400 before
    // any subprocess. `git_args_for` rejects revs handed to a non-rev verb.
    let revs = match (from.as_deref(), to.as_deref()) {
        (Some(f), Some(t)) => Some((f, t)),
        (None, None) => None,
        _ => {
            return Err(super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                "a historical diff requires BOTH `from` and `to` revisions".to_string(),
            ));
        }
    };
    let args = git_args_for(&state, name, fixed, path.as_deref(), revs)?;
    let (output, truncated) = run_git_bounded(
        &state,
        &cell,
        &git_invocation(),
        &args,
        SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await?;
    // Honest bounded-output block when git exceeded the stdout cap: the client
    // renders the partial it got plus a truncation notice rather than a transport
    // error (graph-queries-are-bounded-by-default applied to the git pass-through).
    let truncated_block = truncated.then(|| {
        json!({
            "returned_chars": output.len(),
            "reason": format!(
                "git output exceeded {SIBLING_STDOUT_CAP} bytes; bounded to the cap — narrow the request"
            ),
        })
    });
    // S15: the success envelope carries the per-tier degradation block through
    // the shared `envelope` helper, and every error path above degrades through
    // `api_error` (which always attaches the tiers block) — so the historical
    // diff route, like every other front door, carries tiers on success AND
    // error (every-wire-response-carries-the-tiers-block). No body is ever
    // hand-built; the histdiff verb shares this single envelope construction.
    let mut data = json!({"verb": name, "output": output});
    if let Some(block) = truncated_block {
        data["truncated"] = block;
    }
    Ok(super::envelope(data, super::query_tiers(&cell), None))
}

#[derive(serde::Deserialize)]
pub struct SearchBody {
    #[serde(default)]
    pub scope: Option<String>,
    pub query: String,
    /// `vault` or `code` (rag's vocabulary, forwarded intact).
    #[serde(default, rename = "type")]
    pub target: Option<String>,
    #[serde(default)]
    pub max_results: Option<u32>,
}

fn search_args_for(
    state: &AppState,
    body: &SearchBody,
) -> Result<Vec<String>, (StatusCode, Json<Value>)> {
    let query = body.query.trim();
    if query.is_empty() {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            "search query must not be empty".to_string(),
        ));
    }
    if query.chars().count() > MAX_SEARCH_QUERY_CHARS {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("search query exceeds the {MAX_SEARCH_QUERY_CHARS} character ceiling"),
        ));
    }
    if let Some(target) = &body.target
        && !matches!(target.as_str(), "vault" | "code")
    {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("search target `{target}` must be `vault` or `code`"),
        ));
    }
    if let Some(max_results) = body.max_results
        && max_results > MAX_SEARCH_RESULTS
    {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "search `max_results` {max_results} exceeds the {MAX_SEARCH_RESULTS} result ceiling"
            ),
        ));
    }

    let mut args: Vec<String> = vec!["search".into(), query.to_string()];
    if let Some(target) = &body.target {
        args.push("--type".into());
        args.push(target.clone());
    }
    if let Some(n) = body.max_results {
        args.push("--max-results".into());
        args.push(n.to_string());
    }
    Ok(args)
}

pub async fn search(State(state): State<Arc<AppState>>, Json(body): Json<SearchBody>) -> ApiResult {
    // Search is scoped by the frontend query key/body; absent scope preserves the
    // older active-cell behavior for external callers.
    let cell = match body.scope.as_deref() {
        Some(scope) => crate::registry::get_or_build(&state, scope)
            .map_err(|reason| super::api_error(&state, StatusCode::BAD_REQUEST, reason))?,
        None => state.active_cell(),
    };
    // Validate and bound every user-controlled search argument BEFORE anything
    // reaches rag. Argv passing already blocks shell injection; these guards keep
    // query size, result count, and target vocabulary inside the API contract.
    let args = search_args_for(&state, &body)?;
    // Degrade to the tier block when rag is absent — never a dead control
    // (contract §8).
    if let rag_client::RagAvailability::Unavailable { reason } =
        rag_client::client::discover(&cell.root.join(".vault")).0
    {
        return Ok(super::envelope(
            json!({"results": []}),
            super::degraded_tiers(&cell, reason.as_str()),
            None,
        ));
    }

    // rag's CLI search with --json, vocabulary forwarded intact.
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    // A sibling fault (crash, timeout, capped runaway — now surfaced as a
    // run_sibling Err per H1/M4) must DEGRADE the semantic tier here, never a
    // hard 502/504: search is a degradable surface (contract §8), the rest of
    // the engine is fully available. The error message rides the tier reason.
    let rag_envelope = match run_sibling_bounded_in_dir(
        &state,
        &cell.root,
        &rag_invocation(),
        &arg_refs,
        SEARCH_SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await
    {
        Ok(envelope) => envelope,
        Err((_, body)) => {
            let reason = body.0["error"].as_str().unwrap_or("rag search failed");
            return Ok(super::envelope(
                json!({"results": []}),
                super::degraded_tiers(&cell, reason),
                None,
            ));
        }
    };

    // Flatten rag's envelope to the contract §2 shape and annotate each hit
    // with its engine node id (§8 value-add). A shape miss degrades the
    // `semantic` tier truthfully — never a healthy-looking empty result and
    // never a foreign envelope passed through unflattened.
    match flatten_and_annotate(&rag_envelope) {
        Ok(data) => Ok(super::envelope(data, super::query_tiers(&cell), None)),
        Err(miss) => {
            let reason = miss.reason();
            Ok(super::envelope(
                json!({"results": []}),
                super::degraded_tiers(&cell, reason.as_str()),
                None,
            ))
        }
    }
}

/// A rag search hit in rag's real `search --json` shape (recorded 2026-06-13
/// against a live rag service). The engine reads only the fields it needs to
/// derive the click-through node id; every field of the original hit passes
/// through to the client verbatim (the hit travels as its JSON `Value`).
///
/// The trap this shape documents: `source` is the search-type DISCRIMINATOR
/// (`vault` for docs, `codebase` — historically `code` — for code), NOT a path.
/// The path lives in `path` (with code symbols in `function_name` /
/// `class_name`). An earlier annotation read `source` as a path and mis-derived
/// every id; a later one matched only `code` and null-id'd every live `codebase`
/// hit.
#[derive(Debug, Default, serde::Deserialize)]
struct RagHitShape {
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    source_path: Option<String>,
    #[serde(default)]
    function_name: Option<String>,
    #[serde(default)]
    class_name: Option<String>,
}

/// Derive the engine node id a rag hit clicks through to, or `None` on a
/// typed miss — shape drift where the discriminator is unknown/absent, or the
/// path the discriminator requires is missing. A miss is annotated as an
/// explicit `null`, never a dropped or guessed id.
fn hit_node_id(hit: &RagHitShape) -> Option<String> {
    match hit.source.as_deref() {
        Some("vault") => {
            let path = hit.path.as_deref()?;
            let file = path.rsplit(['/', '\\']).next().unwrap_or(path);
            let stem = file.strip_suffix(".md").unwrap_or(file);
            Some(node_id(&CanonicalKey::Document { stem }).0)
        }
        // The live rag service emits `codebase` for the code corpus; an older
        // recorded fixture used `code`. Accept both so a code hit always clicks
        // through (a `code`-only match silently null-ids every live code result).
        Some("code") | Some("codebase") => {
            let path = hit.path.as_deref().or(hit.source_path.as_deref())?;
            let symbol = hit.function_name.as_deref().or(hit.class_name.as_deref());
            Some(node_id(&CanonicalKey::CodeArtifact { path, symbol }).0)
        }
        _ => None,
    }
}

/// A typed miss reading rag's search envelope: rag reported its own failure,
/// or the response did not carry the `data.results` list the contract §8
/// pass-through requires. Surfaced as a `semantic`-tier degradation so the
/// client never reads a shape drift as a healthy empty result.
#[derive(Debug)]
enum SearchShapeMiss {
    RagError(String),
    NoResults,
}

impl SearchShapeMiss {
    fn reason(&self) -> String {
        match self {
            SearchShapeMiss::RagError(m) => format!("rag search failed: {m}"),
            SearchShapeMiss::NoResults => {
                // rag is up (it answered) but the payload carried no results
                // list: most often the scope is not yet indexed, otherwise a
                // genuine response-shape drift. An `ok:true` empty results
                // list is NOT this case — it is a healthy zero-match success.
                "rag returned no results payload (scope unindexed, or response shape drift)"
                    .to_string()
            }
        }
    }
}

/// Flatten rag's search envelope to the contract §2 `data` payload: a flat
/// `results` list where each hit keeps its original rag fields and gains the
/// engine's one value-add (`node_id`). rag's own `query`/`search_type`/`via`
/// context fields pass through. The nested foreign envelope is dropped.
fn flatten_and_annotate(rag: &Value) -> Result<Value, SearchShapeMiss> {
    // `ok: false` is rag reporting its own failure — surface it, never
    // present it as a healthy empty result.
    if rag.get("ok") == Some(&Value::Bool(false)) {
        let msg = rag
            .get("error")
            .or_else(|| rag.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("rag reported failure")
            .to_string();
        return Err(SearchShapeMiss::RagError(msg));
    }
    let data = rag.get("data").ok_or(SearchShapeMiss::NoResults)?;
    let results = data
        .get("results")
        .and_then(Value::as_array)
        .ok_or(SearchShapeMiss::NoResults)?;

    let annotated: Vec<Value> = results
        .iter()
        .map(|hit| {
            let nid = serde_json::from_value::<RagHitShape>(hit.clone())
                .ok()
                .and_then(|shape| hit_node_id(&shape));
            let mut hit = hit.clone();
            if let Some(obj) = hit.as_object_mut() {
                obj.insert(
                    "node_id".to_string(),
                    nid.map(Value::String).unwrap_or(Value::Null),
                );
            }
            hit
        })
        .collect();

    let mut out = data.clone();
    out["results"] = Value::Array(annotated);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Recorded 2026-06-13 against a live rag service
    // (`vaultspec-rag search --type vault --json`), trimmed to the
    // annotation-relevant fields plus a synthetic code hit. `source` is the
    // vault|code DISCRIMINATOR, never a path — the fixture exists to pin that.
    const RAG_REAL: &str = r#"{
        "ok": true, "command": "search",
        "data": {
            "query": "test", "search_type": "vault", "via": "service",
            "results": [
                {"id": "adr/2026-06-05-x-adr",
                 "path": "adr/2026-06-05-x-adr.md",
                 "score": 0.548, "source": "vault",
                 "doc_type": "adr", "feature": "f", "date": "2026-06-05"},
                {"path": "src/lib.rs", "score": 0.40, "source": "code",
                 "function_name": "alpha", "language": "rust"},
                {"path": "src/lib.rs", "score": 0.30, "source": "code"},
                {"path": "src/main.rs", "score": 0.25, "source": "codebase",
                 "class_name": "Server", "language": "rust"},
                {"score": 0.10, "source": "unknown-future-kind"}
            ]
        }
    }"#;

    #[test]
    fn flattens_and_annotates_rags_real_shape() {
        let rag: Value = serde_json::from_str(RAG_REAL).unwrap();
        let out = flatten_and_annotate(&rag).expect("real shape flattens");

        // §2 flat shape: results sit directly under data; rag's context
        // fields pass through; no nested foreign `envelope`.
        assert_eq!(out["query"], "test");
        assert_eq!(out["search_type"], "vault");
        let results = out["results"].as_array().unwrap();
        assert_eq!(results.len(), 5, "every hit survives; none dropped");

        // Vault hit → doc node from the PATH STEM, not the "vault"
        // discriminator. rag fields pass through verbatim alongside node_id.
        assert_eq!(results[0]["node_id"], "doc:2026-06-05-x-adr");
        assert_eq!(results[0]["doc_type"], "adr");
        assert_eq!(results[0]["score"], 0.548);

        // Code hit with a symbol → code-artifact id qualified by `#symbol`.
        assert_eq!(results[1]["node_id"], "code:src/lib.rs#alpha");
        // Code hit without a symbol → bare path.
        assert_eq!(results[2]["node_id"], "code:src/lib.rs");
        // The LIVE rag discriminator is `codebase` (not `code`); it must still
        // click through, qualified by its class symbol.
        assert_eq!(results[3]["node_id"], "code:src/main.rs#Server");
        // Unknown discriminator → explicit null (typed miss), never guessed.
        assert_eq!(results[4]["node_id"], Value::Null);
    }

    #[test]
    fn rag_reported_failure_is_a_typed_miss() {
        let rag = json!({"ok": false, "error": "index cold"});
        let miss = flatten_and_annotate(&rag).unwrap_err();
        assert!(miss.reason().contains("index cold"));
        assert!(matches!(miss, SearchShapeMiss::RagError(_)));
    }

    #[test]
    fn missing_results_list_is_a_typed_miss_not_an_empty_success() {
        let rag = json!({"ok": true, "data": {"query": "x"}});
        assert!(matches!(
            flatten_and_annotate(&rag).unwrap_err(),
            SearchShapeMiss::NoResults
        ));
        // A response with no `data` at all is the same shape drift.
        assert!(matches!(
            flatten_and_annotate(&json!({"raw": "not json", "exit": 1})).unwrap_err(),
            SearchShapeMiss::NoResults
        ));
    }

    #[test]
    fn search_args_are_bounded_before_rag_spawn() {
        let (_dir, state) = sibling_state();
        let args = search_args_for(
            &state,
            &SearchBody {
                scope: None,
                query: "  graph state  ".to_string(),
                target: Some("vault".to_string()),
                max_results: Some(7),
            },
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "search",
                "graph state",
                "--type",
                "vault",
                "--max-results",
                "7"
            ]
        );

        for body in [
            SearchBody {
                scope: None,
                query: "   ".to_string(),
                target: Some("vault".to_string()),
                max_results: None,
            },
            SearchBody {
                scope: None,
                query: "x".repeat(MAX_SEARCH_QUERY_CHARS + 1),
                target: Some("vault".to_string()),
                max_results: None,
            },
            SearchBody {
                scope: None,
                query: "graph".to_string(),
                target: Some("--code".to_string()),
                max_results: None,
            },
            SearchBody {
                scope: None,
                query: "graph".to_string(),
                target: Some("code".to_string()),
                max_results: Some(MAX_SEARCH_RESULTS + 1),
            },
        ] {
            assert!(
                search_args_for(&state, &body).is_err(),
                "invalid search body must be rejected before rag spawn"
            );
        }
    }

    #[test]
    fn brokered_rag_read_numbers_are_clamped_before_forwarding() {
        let mut params = HashMap::new();
        params.insert("limit".to_string(), (MAX_RAG_JOBS_LIMIT + 500).to_string());
        params.insert("lines".to_string(), (MAX_RAG_LOG_LINES + 500).to_string());
        params.insert("bad".to_string(), "not-a-number".to_string());

        assert_eq!(
            bounded_rag_read_u32(&params, "limit", MAX_RAG_JOBS_LIMIT),
            Some(MAX_RAG_JOBS_LIMIT)
        );
        assert_eq!(
            bounded_rag_read_u32(&params, "lines", MAX_RAG_LOG_LINES),
            Some(MAX_RAG_LOG_LINES)
        );
        assert_eq!(bounded_rag_read_u32(&params, "bad", 10), None);
        assert_eq!(bounded_rag_read_u32(&params, "missing", 10), None);
    }

    // --- W04: read-only /ops/git pass-through -------------------------------

    #[test]
    fn every_whitelisted_git_verb_is_read_only_and_no_mutating_verb_is_reachable() {
        // W04.P09.S51: every whitelisted git verb is a pure read; no mutating
        // git verb (add/commit/checkout/reset/stash) is reachable, and no
        // working-tree mutation flag is present in any whitelist entry.
        const MUTATING: &[&str] = &[
            "add",
            "commit",
            "checkout",
            "reset",
            "stash",
            "rm",
            "mv",
            "merge",
            "rebase",
            "push",
            "pull",
            "fetch",
            "clean",
            "apply",
            "restore",
            "switch",
            "tag",
            "branch",
            "cherry-pick",
            "revert",
            "gc",
            "prune",
            "init",
            "clone",
            "config",
        ];
        const READ_ONLY_FIRST_ARGS: &[&str] = &["status", "diff"];
        for (verb, args) in GIT_WHITELIST {
            // The leading git subcommand is read-only.
            let first = args[0];
            assert!(
                READ_ONLY_FIRST_ARGS.contains(&first),
                "whitelist verb `{verb}` leads with a non-read subcommand `{first}`"
            );
            assert!(
                !MUTATING.contains(&first),
                "whitelist verb `{verb}` is a mutating git subcommand"
            );
            // No argument is a mutating subcommand or a write flag.
            for arg in *args {
                assert!(
                    !MUTATING.contains(arg),
                    "whitelist verb `{verb}` carries the mutating token `{arg}`"
                );
            }
        }
        // A mutating verb name is simply not in the whitelist (so it 403s).
        for m in MUTATING {
            assert!(
                !GIT_WHITELIST.iter().any(|(name, _)| name == m),
                "mutating verb `{m}` must not be whitelisted"
            );
        }
    }

    #[test]
    fn diff_path_validation_rejects_flags_absolute_and_traversal() {
        // W04.P09.S50: the diff path argument is bounded — no leading `-`
        // (flag injection), no absolute path, no `..` traversal.
        let (_dir, state) = sibling_state();
        for bad in [
            "",
            "--output=/etc/passwd",
            "-x",
            "/etc/passwd",
            "C:\\Windows\\System32",
            "../../secret",
            "a/../../b",
        ] {
            assert!(
                validate_diff_path(&state, bad).is_err(),
                "`{bad}` must be rejected"
            );
        }
        // A bounded in-tree relative path is accepted.
        assert_eq!(
            validate_diff_path(&state, "src/lib.rs").unwrap(),
            "src/lib.rs"
        );
        assert_eq!(
            validate_diff_path(&state, ".vault/plan/x.md").unwrap(),
            ".vault/plan/x.md"
        );
    }

    #[test]
    fn git_args_for_appends_a_dash_dash_path_only_for_the_diff_verb() {
        // W04.P09: the diff verb gets `-- <path>` so a path can never be read as
        // a flag; non-path verbs reject a supplied path; diff requires one.
        let (_dir, state) = sibling_state();
        let diff_args = git_args_for(
            &state,
            "diff",
            &["diff", "--no-color"],
            Some("src/a.rs"),
            None,
        )
        .unwrap();
        assert_eq!(diff_args, vec!["diff", "--no-color", "--", "src/a.rs"]);
        // status takes no path.
        let status_args =
            git_args_for(&state, "status", &["status", "--porcelain=v1"], None, None).unwrap();
        assert_eq!(status_args, vec!["status", "--porcelain=v1"]);
        // status with a path is rejected, diff with no path is rejected.
        assert!(git_args_for(&state, "status", &["status"], Some("x"), None).is_err());
        assert!(git_args_for(&state, "diff", &["diff"], None, None).is_err());
    }

    #[test]
    fn histdiff_builds_a_two_rev_diff_with_a_dash_dash_path() {
        // S14: histdiff forms `diff --no-color <from> <to> -- <path>` from two
        // SEPARATE validated revs; the path still follows `--` so it can never be
        // read as a flag, and the revs precede the separator.
        let (_dir, state) = sibling_state();
        let args = git_args_for(
            &state,
            "histdiff",
            &["diff", "--no-color"],
            Some(".vault/plan/x.md"),
            Some(("HEAD~1", "HEAD")),
        )
        .unwrap();
        assert_eq!(
            args,
            vec![
                "diff",
                "--no-color",
                "HEAD~1",
                "HEAD",
                "--",
                ".vault/plan/x.md"
            ]
        );
        // histdiff requires BOTH revs and a path.
        assert!(
            git_args_for(&state, "histdiff", &["diff"], Some("x"), None).is_err(),
            "histdiff without revs is rejected"
        );
        assert!(
            git_args_for(&state, "histdiff", &["diff"], None, Some(("a", "b"))).is_err(),
            "histdiff without a path is rejected"
        );
        // A non-rev verb handed revs is rejected (no silent ignore).
        assert!(
            git_args_for(&state, "diff", &["diff"], Some("x"), Some(("a", "b"))).is_err(),
            "the working-tree diff verb takes no revs"
        );
    }

    #[test]
    fn validate_rev_rejects_flags_ranges_and_whitespace() {
        // S14: a rev is a single bounded revision token — never a flag, a `..`
        // range expression, or a whitespace-bearing argument channel.
        let (_dir, state) = sibling_state();
        for bad in [
            "",
            "-x",
            "--output=/etc/passwd",
            "HEAD~1..HEAD",
            "a b",
            "x...y",
        ] {
            assert!(
                validate_rev(&state, bad).is_err(),
                "`{bad}` must be rejected"
            );
        }
        // Bounded ref-grammar tokens are accepted.
        assert_eq!(validate_rev(&state, "HEAD").unwrap(), "HEAD");
        assert_eq!(validate_rev(&state, "HEAD~3").unwrap(), "HEAD~3");
        assert_eq!(
            validate_rev(&state, "0123456789abcdef0123456789abcdef01234567").unwrap(),
            "0123456789abcdef0123456789abcdef01234567"
        );
        assert_eq!(
            validate_rev(&state, "refs/heads/main").unwrap(),
            "refs/heads/main"
        );
    }

    fn git_repo_state() -> (tempfile::TempDir, Arc<AppState>) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let run = |args: &[&str]| {
            let out = std::process::Command::new("git")
                .current_dir(root)
                .args(args)
                .env("GIT_AUTHOR_NAME", "f")
                .env("GIT_AUTHOR_EMAIL", "f@t")
                .env("GIT_COMMITTER_NAME", "f")
                .env("GIT_COMMITTER_EMAIL", "f@t")
                .output()
                .expect("git runs");
            assert!(out.status.success(), "git {args:?}");
        };
        run(&["init", "-b", "main", "."]);
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::write(
            root.join(".vault/plan/2026-06-14-g-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#g'\n---\n\nbody\n",
        )
        .unwrap();
        run(&["add", "."]);
        run(&["commit", "-m", "fixture"]);
        // Leave a dirty change so status/diff have something to report.
        std::fs::write(
            root.join(".vault/plan/2026-06-14-g-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#g'\n---\n\nbody changed\n",
        )
        .unwrap();
        let state = crate::app::build_state(root.to_path_buf());
        (dir, state)
    }

    #[tokio::test]
    async fn a_whitelisted_status_verb_forwards_git_output_verbatim_in_the_envelope() {
        // W04.P10.S55: a whitelisted status verb forwards git output verbatim
        // inside the envelope with the tiers block.
        let (_dir, state) = git_repo_state();
        let scope = state
            .active_scope
            .read()
            .map(|s| s.clone())
            .unwrap_or_else(|e| e.into_inner().clone());
        let result = ops_git(State(state.clone()), Path("status".to_string()), None)
            .await
            .expect("status forwards");
        let Json(body) = result;
        // The verbatim git porcelain output names the dirty plan file.
        let output = body["data"]["output"].as_str().unwrap();
        assert!(
            output.contains("2026-06-14-g-plan.md"),
            "git status output forwarded verbatim: {output}"
        );
        assert_eq!(body["data"]["verb"], "status");
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "tiers block on success"
        );

        // The diff verb forwards a path-scoped unified diff verbatim.
        let result = ops_git(
            State(state),
            Path("diff".to_string()),
            Some(Json(GitOpBody {
                scope: Some(scope),
                path: Some(".vault/plan/2026-06-14-g-plan.md".into()),
                ..Default::default()
            })),
        )
        .await
        .expect("diff forwards");
        let Json(body) = result;
        let diff = body["data"]["output"].as_str().unwrap();
        assert!(
            diff.contains("body changed"),
            "unified diff forwarded: {diff}"
        );
    }

    /// Build a two-commit fixture repo (one file rewritten between commits) for
    /// the historical-diff tests, returning the dir guard, the warmed state, and
    /// the in-tree file path.
    fn histdiff_repo_state() -> (tempfile::TempDir, Arc<AppState>, &'static str) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let run = |args: &[&str]| {
            let out = std::process::Command::new("git")
                .current_dir(root)
                .args(args)
                .env("GIT_AUTHOR_NAME", "f")
                .env("GIT_AUTHOR_EMAIL", "f@t")
                .env("GIT_COMMITTER_NAME", "f")
                .env("GIT_COMMITTER_EMAIL", "f@t")
                .output()
                .expect("git runs");
            assert!(out.status.success(), "git {args:?}");
        };
        run(&["init", "-b", "main", "."]);
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        let file = ".vault/plan/2026-06-14-g-plan.md";
        std::fs::write(root.join(file), "original line\n").unwrap();
        run(&["add", "."]);
        run(&["commit", "-m", "first"]);
        std::fs::write(root.join(file), "rewritten line\n").unwrap();
        run(&["add", "."]);
        run(&["commit", "-m", "second"]);
        let state = crate::app::build_state(root.to_path_buf());
        (dir, state, file)
    }

    #[tokio::test]
    async fn histdiff_forwards_a_two_rev_historical_diff_verbatim() {
        // S14: the bounded historical text-diff verb runs a two-rev
        // `git diff <from> <to> -- <path>` over the object DB, forwarding git's
        // output VERBATIM inside the envelope.
        let (_dir, state, file) = histdiff_repo_state();
        let result = ops_git(
            State(state),
            Path("histdiff".to_string()),
            Some(Json(GitOpBody {
                path: Some(file.into()),
                from: Some("HEAD~1".into()),
                to: Some("HEAD".into()),
                ..Default::default()
            })),
        )
        .await
        .expect("histdiff forwards");
        let Json(body) = result;
        assert_eq!(body["data"]["verb"], "histdiff");
        let diff = body["data"]["output"].as_str().unwrap();
        // The two-rev diff names BOTH the removed original and the added rewrite.
        assert!(diff.contains("-original line"), "removed line: {diff}");
        assert!(diff.contains("+rewritten line"), "added line: {diff}");
    }

    #[tokio::test]
    async fn histdiff_carries_the_tiers_block_on_success_and_error_envelopes() {
        // S15: the historical-diff route carries the per-tier degradation block
        // through the shared envelope helper on BOTH the success envelope and the
        // error envelope (a missing rev is a 400 before any subprocess) —
        // every-wire-response-carries-the-tiers-block.
        let (_dir, state, file) = histdiff_repo_state();
        let result = ops_git(
            State(state.clone()),
            Path("histdiff".to_string()),
            Some(Json(GitOpBody {
                path: Some(file.into()),
                from: Some("HEAD~1".into()),
                to: Some("HEAD".into()),
                ..Default::default()
            })),
        )
        .await
        .expect("histdiff forwards");
        let Json(body) = result;
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "tiers block on the historical-diff success envelope"
        );

        // A histdiff with a missing rev is a 400 BEFORE any subprocess, and the
        // error envelope still carries the tiers block (shared helper).
        let err = ops_git(
            State(state),
            Path("histdiff".to_string()),
            Some(Json(GitOpBody {
                path: Some(file.into()),
                from: Some("HEAD~1".into()),
                to: None,
                ..Default::default()
            })),
        )
        .await
        .unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_REQUEST, "missing rev → 400");
        assert!(
            err.1.0["tiers"]["semantic"]["available"].is_boolean(),
            "the 400 error envelope carries the tiers block"
        );
    }

    #[tokio::test]
    async fn a_non_whitelisted_git_verb_403s_before_the_subprocess() {
        // W04.P10.S54: a non-whitelisted git verb 403s with the tiers block,
        // never reaching the subprocess.
        let (_dir, state) = sibling_state();
        for mutating in ["commit", "add", "checkout", "reset", "stash", "push"] {
            let err = ops_git(State(state.clone()), Path(mutating.to_string()), None)
                .await
                .unwrap_err();
            assert_eq!(err.0, StatusCode::FORBIDDEN, "`{mutating}` must be denied");
            assert!(
                err.1.0["tiers"]["semantic"]["available"].is_boolean(),
                "the 403 carries the tiers block"
            );
            assert!(err.1.0["error"].as_str().unwrap().contains(mutating));
        }
    }

    #[tokio::test]
    async fn a_git_fault_degrades_to_a_tiers_carrying_error_envelope() {
        // W04.P10.S56: a sibling (git) fault degrades to a tiers-carrying error
        // envelope, never a hand-built body. Running git in a NON-git directory
        // makes `git status` exit non-zero — the bounded runner surfaces it as a
        // 502 error envelope through the shared api_error helper (which always
        // attaches the tiers block).
        let (_dir, state) = sibling_state(); // no `git init` here
        let err = ops_git(State(state), Path("status".to_string()), None)
            .await
            .unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_GATEWAY, "git fault → 502");
        assert!(
            err.1.0["tiers"]["semantic"]["available"].is_boolean(),
            "the error envelope carries the tiers block"
        );
        assert!(err.1.0["error"].is_string(), "honest error message");
    }

    // --- H1 / M4: bounded sibling subprocess --------------------------------

    fn sibling_state() -> (tempfile::TempDir, Arc<AppState>) {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
        let state = crate::app::build_state(dir.path().to_path_buf());
        (dir, state)
    }

    // --- rag-storage-broker (destructive storage verbs) ---------------------

    #[test]
    fn namespace_prefix_guard_accepts_canonical_and_rejects_everything_else() {
        let (_dir, state) = sibling_state();
        // rag's canonical r{12-lowercase-hex}_ form.
        assert_eq!(
            validate_namespace_prefix(&state, "rabc123def456_").unwrap(),
            "rabc123def456_"
        );
        for bad in [
            "",
            "-x",
            "--allow-unknown",
            "rABC123DEF456_",           // uppercase hex rejected
            "rabc123def456",            // missing trailing underscore
            "abc123def456_",            // missing leading r
            "rabc123def45_",            // 11 hex, too short
            "rabc123def4567_",          // 13 hex, too long
            "rabc123def45g6_",          // non-hex char
            "rabc123def456_; rm -rf /", // shell metacharacters
        ] {
            assert!(
                validate_namespace_prefix(&state, bad).is_err(),
                "`{bad}` must be rejected"
            );
        }
    }

    #[test]
    fn storage_args_assembles_validated_argv_per_verb() {
        let (_dir, state) = sibling_state();
        let base = |v: &str| {
            RAG_STORAGE_CLI_WHITELIST
                .iter()
                .find(|(n, _)| *n == v)
                .map(|(_, a)| *a)
                .unwrap()
        };

        // delete: validated prefix, then --yes (required by --json) and --dry-run
        // (preview default).
        let body = RagStorageBody {
            prefix: Some("rabc123def456_".into()),
            ..Default::default()
        };
        let args = storage_args_for(
            &state,
            "storage-delete",
            base("storage-delete"),
            "/r",
            &body,
        )
        .unwrap();
        assert_eq!(
            args,
            [
                "server",
                "storage",
                "delete",
                "rabc123def456_",
                "--yes",
                "--dry-run"
            ]
        );
        assert!(!args.iter().any(|a| a == "--allow-unknown"));

        // delete with apply: --yes and NO --dry-run.
        let apply = RagStorageBody {
            prefix: Some("rabc123def456_".into()),
            apply: Some(true),
            ..Default::default()
        };
        let args = storage_args_for(
            &state,
            "storage-delete",
            base("storage-delete"),
            "/r",
            &apply,
        )
        .unwrap();
        assert_eq!(
            args,
            ["server", "storage", "delete", "rabc123def456_", "--yes"]
        );

        // prune: no positional, preview by default.
        let args = storage_args_for(
            &state,
            "storage-prune",
            base("storage-prune"),
            "/r",
            &RagStorageBody::default(),
        )
        .unwrap();
        assert_eq!(args, ["server", "storage", "prune", "--yes", "--dry-run"]);

        // migrate: the ENGINE-CONTROLLED cell root (not a body field) + the enum.
        let migrate = RagStorageBody {
            to: Some("server".into()),
            ..Default::default()
        };
        let args = storage_args_for(
            &state,
            "storage-migrate",
            base("storage-migrate"),
            "/active/scope",
            &migrate,
        )
        .unwrap();
        assert_eq!(
            args,
            [
                "server",
                "storage",
                "migrate",
                "/active/scope",
                "--to",
                "server",
                "--yes",
                "--dry-run"
            ]
        );
    }

    #[test]
    fn storage_args_reject_missing_or_invalid_required_values() {
        let (_dir, state) = sibling_state();
        // delete with no prefix → 400.
        assert!(
            storage_args_for(
                &state,
                "storage-delete",
                &["server", "storage", "delete"],
                "/r",
                &RagStorageBody::default(),
            )
            .is_err()
        );
        // migrate with a bad backend → 400.
        let bad = RagStorageBody {
            to: Some("s3".into()),
            ..Default::default()
        };
        assert!(
            storage_args_for(
                &state,
                "storage-migrate",
                &["server", "storage", "migrate"],
                "/r",
                &bad,
            )
            .is_err()
        );
    }

    #[test]
    fn rag_envelope_detection_and_storage_outcome() {
        // is_rag_envelope keys on top-level ok(bool) + command(string).
        let env = serde_json::json!({"ok": false, "command": "storage.delete",
            "data": {"status": "would_remove", "prefix": "rabc123def456_"}});
        assert!(is_rag_envelope(&env));
        assert!(!is_rag_envelope(
            &serde_json::json!({"status": "would_remove"})
        ));
        assert!(!is_rag_envelope(
            &serde_json::json!({"ok": "yes", "command": 1})
        ));

        // A would_remove preview EXITS 1 but is a forwarded business outcome.
        let raw = env.to_string();
        assert_eq!(storage_outcome(&raw, false).unwrap(), env);
        // An applied result on exit 0 forwards too.
        assert!(storage_outcome(&raw, true).is_ok());
        // A genuine crash (non-zero exit, no envelope) is a stated fault → 502.
        assert!(storage_outcome("Traceback...\nKeyError", false).is_err());
        // Empty stdout on exit 0 is also a fault (never a forged success).
        assert!(storage_outcome("", true).is_err());
    }

    #[tokio::test]
    async fn storage_route_403s_unknown_verb_and_400s_a_bad_prefix_before_spawning() {
        let (_dir, state) = sibling_state();
        // An unknown storage verb 403s before any subprocess.
        let err = ops_rag_storage(State(state.clone()), Path("storage-nuke".to_string()), None)
            .await
            .unwrap_err();
        assert_eq!(err.0, StatusCode::FORBIDDEN);

        // A whitelisted verb with a malformed prefix 400s before any subprocess.
        let err = ops_rag_storage(
            State(state.clone()),
            Path("storage-delete".to_string()),
            Some(Json(RagStorageBody {
                prefix: Some("not-a-prefix".into()),
                ..Default::default()
            })),
        )
        .await
        .unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
    }

    /// A program that ignores the trailing `--json` run_sibling appends.
    fn shell(snippet: &str) -> Vec<String> {
        if cfg!(windows) {
            vec!["cmd".into(), "/C".into(), snippet.into()]
        } else {
            vec!["sh".into(), "-c".into(), snippet.into()]
        }
    }

    #[tokio::test]
    async fn a_hung_sibling_is_killed_on_timeout_not_left_to_pin_the_worker() {
        // Robustness H1: an untimed sibling pins an async worker forever. With a
        // (here, short) timeout the child is killed and a 504 degraded envelope
        // is returned instead of hanging.
        let (_dir, state) = sibling_state();
        // Sleep well past the injected 200ms timeout.
        let prog = if cfg!(windows) {
            // PowerShell script block swallows the trailing `--json` into $args
            // (ignored) and holds the stdout pipe open for 5s, so the read
            // blocks until the 200ms timeout fires.
            vec![
                "powershell".into(),
                "-NoProfile".into(),
                "-Command".into(),
                "& { Start-Sleep -Seconds 5 }".into(),
            ]
        } else {
            shell("sleep 5")
        };
        let err = run_sibling_bounded(
            &state,
            &prog,
            &[],
            Duration::from_millis(200),
            SIBLING_STDOUT_CAP,
        )
        .await
        .unwrap_err();
        assert_eq!(err.0, StatusCode::GATEWAY_TIMEOUT, "hung sibling → 504");
        assert!(err.1.0["error"].as_str().unwrap().contains("timed out"));
    }

    #[tokio::test]
    async fn a_crashed_sibling_is_a_502_not_a_healthy_200(/* M4 */) {
        // M4: a non-zero sibling exit is a 502 degraded envelope, never a 200
        // wrapping a crash.
        let (_dir, state) = sibling_state();
        let prog = shell("exit 7");
        let err = run_sibling_bounded(&state, &prog, &[], SIBLING_TIMEOUT, SIBLING_STDOUT_CAP)
            .await
            .unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_GATEWAY, "crashed sibling → 502");
        assert!(err.1.0["error"].as_str().unwrap().contains("exited"));
    }

    #[tokio::test]
    async fn a_runaway_sibling_stdout_is_capped_not_buffered_to_oom() {
        // Robustness H1: stdout past the cap is killed + degraded, never grown
        // to exhaustion. Inject a tiny 4 KiB cap and emit far more.
        let (_dir, state) = sibling_state();
        let prog = if cfg!(windows) {
            vec![
                "powershell".into(),
                "-NoProfile".into(),
                "-Command".into(),
                "& { [Console]::Out.Write('x' * 65536) }".into(),
            ]
        } else {
            shell("head -c 65536 /dev/zero | tr '\\0' 'x'")
        };
        let err = run_sibling_bounded(&state, &prog, &[], SIBLING_TIMEOUT, 4096)
            .await
            .unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_GATEWAY, "runaway stdout → 502");
        assert!(err.1.0["error"].as_str().unwrap().contains("capped"));
    }

    #[tokio::test]
    async fn a_well_behaved_sibling_envelope_passes_through() {
        // The bounded runner must not regress the happy path: a small JSON
        // envelope on stdout, exit 0, passes through verbatim.
        let (_dir, state) = sibling_state();
        let prog = if cfg!(windows) {
            vec![
                "powershell".into(),
                "-NoProfile".into(),
                "-Command".into(),
                r#"& { [Console]::Out.Write('{"ok":true}') }"#.into(),
            ]
        } else {
            shell(r#"printf '%s' '{"ok":true}'"#)
        };
        let value = run_sibling_bounded(&state, &prog, &[], SIBLING_TIMEOUT, SIBLING_STDOUT_CAP)
            .await
            .expect("clean sibling passes through");
        assert_eq!(value["ok"], true);
    }

    // --- P02: brokered /ops/rag/* control plane -----------------------------

    #[tokio::test]
    async fn reindex_with_a_bad_type_is_a_tiered_400_before_any_round_trip() {
        // P02.S12/S15: arg validation rejects an unknown `type` BEFORE the
        // transport is built, as a tiers-carrying 400 (mirrors the search target
        // guard) — the bad value never reaches rag.
        let (_dir, state) = sibling_state();
        let err = ops_rag(
            State(state),
            Path("reindex".to_string()),
            Some(Json(RagControlBody {
                reindex_type: Some("bogus".into()),
                ..Default::default()
            })),
        )
        .await
        .unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
        assert!(err.1.0["error"].as_str().unwrap().contains("bogus"));
        assert!(
            err.1.0["tiers"]["semantic"]["available"].is_boolean(),
            "the 400 carries the tiers block"
        );
    }

    #[tokio::test]
    async fn reindex_with_a_bad_initiator_kind_is_a_tiered_400() {
        let (_dir, state) = sibling_state();
        let err = ops_rag(
            State(state),
            Path("reindex".to_string()),
            Some(Json(RagControlBody {
                initiator_kind: Some("intruder".into()),
                ..Default::default()
            })),
        )
        .await
        .unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
        assert!(
            err.1.0["error"]
                .as_str()
                .unwrap()
                .contains("initiator_kind")
        );
    }

    #[tokio::test]
    async fn watcher_reconfigure_out_of_bounds_args_are_tiered_400s() {
        // P02.S12/S15: bound enforcement — a debounce past the ceiling and a
        // negative cooldown are each a tiers-carrying 400 before forwarding.
        let (_dir, state) = sibling_state();
        let err = ops_rag(
            State(state.clone()),
            Path("watcher-reconfigure".to_string()),
            Some(Json(RagControlBody {
                debounce_ms: Some(MAX_WATCH_DEBOUNCE_MS + 1),
                ..Default::default()
            })),
        )
        .await
        .unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
        assert!(err.1.0["error"].as_str().unwrap().contains("debounce_ms"));

        let err = ops_rag(
            State(state),
            Path("watcher-reconfigure".to_string()),
            Some(Json(RagControlBody {
                cooldown_s: Some(-1.0),
                ..Default::default()
            })),
        )
        .await
        .unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
        assert!(err.1.0["error"].as_str().unwrap().contains("cooldown_s"));
    }

    #[tokio::test]
    async fn evict_with_a_dash_prefixed_root_is_a_tiered_400() {
        // P02.S12: the flag-injection guard — a dash-prefixed evict root is
        // rejected, mirroring the diff-path/rev guards.
        let (_dir, state) = sibling_state();
        let err = ops_rag(
            State(state),
            Path("project-evict".to_string()),
            Some(Json(RagControlBody {
                root: Some("--force".into()),
                ..Default::default()
            })),
        )
        .await
        .unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
        assert!(err.1.0["error"].as_str().unwrap().contains("root"));
    }

    #[tokio::test]
    async fn an_unknown_read_verb_403s_before_any_round_trip() {
        // P02.S15: an unknown GET read verb 403s with the tiers block, never
        // reaching discovery or rag.
        let (_dir, state) = sibling_state();
        let err = ops_rag_get(
            State(state),
            Path("not-a-verb".to_string()),
            Query(HashMap::new()),
        )
        .await
        .unwrap_err();
        assert_eq!(err.0, StatusCode::FORBIDDEN);
        assert!(err.1.0["error"].as_str().unwrap().contains("not-a-verb"));
        assert!(err.1.0["tiers"]["semantic"]["available"].is_boolean());
    }

    #[tokio::test]
    async fn an_unknown_post_verb_403s_with_the_tiers_block() {
        let (_dir, state) = sibling_state();
        let err = ops_rag(State(state), Path("not-a-verb".to_string()), None)
            .await
            .unwrap_err();
        assert_eq!(err.0, StatusCode::FORBIDDEN);
        assert!(err.1.0["tiers"]["semantic"]["available"].is_boolean());
    }

    #[test]
    fn brokered_envelope_forwards_rags_value_verbatim_with_tiers() {
        // P02.S15: on success rag's envelope passes through VERBATIM under
        // `data.envelope` (unreshaped), with the tiers block attached
        // (engine-read-and-infer + every-wire-response-carries-the-tiers-block).
        let (_dir, state) = sibling_state();
        let cell = state.active_cell();
        let rag_value = json!({
            "ok": true, "job_id": "j-9", "status": "queued", "custom": [1, 2, 3]
        });
        let Json(body) = brokered_envelope(&cell, Ok(rag_value.clone()));
        assert_eq!(
            body["data"]["envelope"], rag_value,
            "rag's envelope is forwarded byte-for-byte, not reshaped"
        );
        assert!(body["tiers"]["semantic"]["available"].is_boolean());
    }

    #[test]
    fn brokered_envelope_degrades_the_semantic_tier_on_a_rag_fault() {
        // P02.S15: a rag transport/shape fault degrades the semantic tier with an
        // empty envelope — never a hard 5xx (degradation-is-read-from-tiers). The
        // declared tier still reports truthfully through the shared overlay.
        let (_dir, state) = sibling_state();
        let cell = state.active_cell();
        let err = rag_client::client::RagError::Io(std::io::Error::other("connection refused"));
        let Json(body) = brokered_envelope(&cell, Err(err));
        assert_eq!(body["data"]["envelope"], Value::Null, "no value on a fault");
        assert_eq!(
            body["tiers"]["semantic"]["available"], false,
            "the semantic tier is reported unavailable, not an error"
        );
    }

    // --- W02: core WRITE channel (/ops/core/{verb}/write) -------------------

    #[tokio::test]
    async fn a_non_whitelisted_write_verb_403s_before_the_subprocess() {
        // W02: a write verb outside CORE_WRITE_WHITELIST 403s with the tiers
        // block, never reaching the subprocess. Mirrors `ops_core`'s guard.
        let (_dir, state) = sibling_state();
        for verb in ["delete", "archive", "set-body-evil", "vault-check"] {
            let err = ops_core_write(
                State(state.clone()),
                Path(verb.to_string()),
                Json(CoreWriteBody {
                    doc_ref: "adr/2026-06-16-x-adr".into(),
                    ..Default::default()
                }),
            )
            .await
            .unwrap_err();
            assert_eq!(err.0, StatusCode::FORBIDDEN, "`{verb}` must be denied");
            assert!(
                err.1.0["tiers"]["semantic"]["available"].is_boolean(),
                "the 403 carries the tiers block"
            );
            assert!(err.1.0["error"].as_str().unwrap().contains(verb));
        }
    }

    #[tokio::test]
    async fn write_field_validation_rejects_dangerous_inputs_with_a_tiered_400() {
        // W02: per-field validation BEFORE the subprocess — a `-`-prefixed ref
        // (flag injection), a `..` traversal, an absolute path, and a malformed
        // blob hash are each a tiers-carrying 400.
        let (_dir, state) = sibling_state();
        let cases: &[CoreWriteBody] = &[
            CoreWriteBody {
                doc_ref: "--output=/etc/passwd".into(),
                ..Default::default()
            },
            CoreWriteBody {
                doc_ref: "../../secret".into(),
                ..Default::default()
            },
            CoreWriteBody {
                doc_ref: "/etc/passwd".into(),
                ..Default::default()
            },
            CoreWriteBody {
                doc_ref: "".into(),
                ..Default::default()
            },
            CoreWriteBody {
                doc_ref: "adr/x-adr".into(),
                expected_blob_hash: Some("not-a-real-oid".into()),
                ..Default::default()
            },
            CoreWriteBody {
                doc_ref: "adr/x-adr".into(),
                expected_blob_hash: Some("C245AABBCCDDEEFF00112233445566778899AABB".into()),
                ..Default::default()
            },
            CoreWriteBody {
                doc_ref: "adr/x-adr".into(),
                tags: Some(vec!["--force".into()]),
                ..Default::default()
            },
            CoreWriteBody {
                doc_ref: "adr/x-adr".into(),
                related: Some(vec!["".into()]),
                ..Default::default()
            },
        ];
        for case in cases {
            let body = CoreWriteBody {
                scope: case.scope.clone(),
                doc_ref: case.doc_ref.clone(),
                body: case.body.clone(),
                expected_blob_hash: case.expected_blob_hash.clone(),
                date: case.date.clone(),
                tags: case.tags.clone(),
                related: case.related.clone(),
                new_stem: case.new_stem.clone(),
            };
            let bad_ref = body.doc_ref.clone();
            let err = ops_core_write(
                State(state.clone()),
                Path("set-body".to_string()),
                Json(body),
            )
            .await
            .unwrap_err();
            assert_eq!(
                err.0,
                StatusCode::BAD_REQUEST,
                "case `{bad_ref}` must be a 400"
            );
            assert!(
                err.1.0["tiers"]["semantic"]["available"].is_boolean(),
                "the 400 carries the tiers block"
            );
        }
        // A 40-char lowercase hex OID and a clean stem pass validation (the
        // subprocess is exercised by the round-trip test below).
        assert!(
            validate_blob_hash(&state, "c245aabbccddeeff00112233445566778899aabb").is_ok(),
            "a valid lowercase 40-hex OID is accepted"
        );
        assert!(validate_doc_ref(&state, "adr/2026-06-16-x-adr").is_ok());
        assert!(validate_doc_ref(&state, "2026-06-16-x-adr").is_ok());
    }

    /// A stub sibling that reads its whole stdin and echoes it back inside a
    /// `status:"updated"` envelope under `data.stdin`, exiting 0. Used to prove
    /// the body round-trips to the child's stdin. The trailing `--json` the
    /// runner appends is ignored.
    fn stdin_echo_updated() -> Vec<String> {
        if cfg!(windows) {
            vec![
                "powershell".into(),
                "-NoProfile".into(),
                "-Command".into(),
                // Read all of stdin, JSON-escape it via ConvertTo-Json, and emit
                // a status:"updated" envelope carrying it under data.stdin.
                "& { $i = [Console]::In.ReadToEnd(); $e = $i | ConvertTo-Json; \
                 [Console]::Out.Write('{\"schema\":\"x\",\"status\":\"updated\",\"data\":{\"stdin\":' + $e + '}}') }".into(),
            ]
        } else {
            // jq-free: read stdin, base64 it would need a decoder; instead use a
            // small python one-liner if present, else a portable printf with the
            // raw text known to be JSON-safe in our test. We pass plain text and
            // rely on python for robust JSON escaping.
            shell(
                "body=$(cat); printf '{\"schema\":\"x\",\"status\":\"updated\",\"data\":{\"stdin\":\"%s\"}}' \"$body\"",
            )
        }
    }

    #[tokio::test]
    async fn the_body_is_forwarded_to_the_child_stdin() {
        // W02: the new document body is written to the child's stdin and the
        // sibling reads it. The stub echoes stdin back under data.stdin; the
        // route forwards the envelope verbatim under data.envelope.
        let (_dir, state) = sibling_state();
        let cell = state.active_cell();
        let marker = "ROUND_TRIP_BODY_MARKER";
        let value = run_sibling_write_bounded(
            &state,
            &cell,
            &stdin_echo_updated(),
            &[],
            Some(marker),
            SIBLING_TIMEOUT,
            SIBLING_STDOUT_CAP,
        )
        .await
        .expect("stdin-echo sibling produces a status envelope");
        assert_eq!(value["status"], "updated");
        let echoed = value["data"]["stdin"].as_str().unwrap_or_default();
        assert!(
            echoed.contains(marker),
            "the body round-tripped through the child's stdin: {echoed}"
        );
    }

    /// A stub sibling that exits 1 emitting a `status:"failed"` CONFLICT
    /// envelope — the load-bearing case: a business refusal that exits non-zero
    /// must forward VERBATIM as a 200, NOT a 502.
    fn conflict_failed_exit1() -> Vec<String> {
        let payload = r#"{"schema":"vaultspec.vault.set-body.v1","status":"failed","data":{"message":"Blob-hash conflict","conflict":true,"expected":"aaa","actual":"bbb","path":"adr/x-adr.md"}}"#;
        if cfg!(windows) {
            vec![
                "powershell".into(),
                "-NoProfile".into(),
                "-Command".into(),
                format!(
                    "& {{ [Console]::Out.Write('{}'); exit 1 }}",
                    payload.replace('\'', "''")
                ),
            ]
        } else {
            shell(&format!("printf '%s' '{payload}'; exit 1"))
        }
    }

    #[tokio::test]
    async fn a_failed_conflict_envelope_exiting_1_is_forwarded_verbatim_not_a_502() {
        // W02 (the load-bearing test): a `status:"failed"` conflict that exits 1
        // is a VALID business response forwarded VERBATIM under data.envelope on a
        // 200, never a 502. The client branches on envelope.status + data.conflict.
        let (_dir, state) = sibling_state();
        let cell = state.active_cell();
        let value = run_sibling_write_bounded(
            &state,
            &cell,
            &conflict_failed_exit1(),
            &[],
            None,
            SIBLING_TIMEOUT,
            SIBLING_STDOUT_CAP,
        )
        .await
        .expect("a status:failed conflict envelope is Ok (forwarded), not an Err");
        assert_eq!(value["status"], "failed");
        assert_eq!(value["data"]["conflict"], true);
        assert_eq!(value["data"]["expected"], "aaa");
    }

    #[tokio::test]
    async fn a_crash_with_no_parseable_envelope_is_a_502_with_tiers() {
        // W02: a sibling that exits non-zero with NO parseable status envelope is
        // a genuine fault — a 502 degraded envelope carrying the tiers block,
        // never a forged success. This is the boundary the conflict case must not
        // cross.
        let (_dir, state) = sibling_state();
        let cell = state.active_cell();
        let err = run_sibling_write_bounded(
            &state,
            &cell,
            &shell("echo not-an-envelope 1>&2; exit 9"),
            &[],
            None,
            SIBLING_TIMEOUT,
            SIBLING_STDOUT_CAP,
        )
        .await
        .unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_GATEWAY, "crash → 502");
        assert!(
            err.1.0["tiers"]["semantic"]["available"].is_boolean(),
            "the 502 carries the tiers block"
        );
    }

    /// A stub sibling that emits a `status:"updated"` success envelope, exit 0.
    fn success_updated() -> Vec<String> {
        let payload = r#"{"schema":"vaultspec.vault.set-body.v1","status":"updated","data":{"path":"adr/x-adr.md","blob_hash":"c245aabbccddeeff00112233445566778899aabb","checks":[]}}"#;
        if cfg!(windows) {
            vec![
                "powershell".into(),
                "-NoProfile".into(),
                "-Command".into(),
                format!(
                    "& {{ [Console]::Out.Write('{}') }}",
                    payload.replace('\'', "''")
                ),
            ]
        } else {
            shell(&format!("printf '%s' '{payload}'"))
        }
    }

    #[tokio::test]
    async fn a_success_write_carries_the_tiers_block_under_a_forwarded_envelope() {
        // W02: a success (`status:"updated"`) rides the same 200 forwarded
        // envelope as a refusal, with the tiers block attached. We drive the
        // runner directly (the route's verb whitelist + validation are covered
        // above) and assert the verbatim-forward shape the route emits.
        let (_dir, state) = sibling_state();
        let cell = state.active_cell();
        let value = run_sibling_write_bounded(
            &state,
            &cell,
            &success_updated(),
            &[],
            Some("# new body\n"),
            SIBLING_TIMEOUT,
            SIBLING_STDOUT_CAP,
        )
        .await
        .expect("success envelope is forwarded");
        // The route wraps this verbatim under data.envelope with tiers.
        let Json(body) = super::super::envelope(
            json!({ "envelope": value }),
            super::super::query_tiers(&state.active_cell()),
            None,
        );
        assert_eq!(body["data"]["envelope"]["status"], "updated");
        assert_eq!(
            body["data"]["envelope"]["data"]["blob_hash"],
            "c245aabbccddeeff00112233445566778899aabb"
        );
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "tiers block on the success envelope"
        );
    }

    #[tokio::test]
    async fn a_hung_write_sibling_is_killed_on_timeout() {
        // W02 + subprocess-calls-carry-cap-and-timeout: the write runner keeps the
        // wall-clock timeout — a hung sibling is killed and degrades to a 504, not
        // left to pin the worker.
        let (_dir, state) = sibling_state();
        let prog = if cfg!(windows) {
            vec![
                "powershell".into(),
                "-NoProfile".into(),
                "-Command".into(),
                "& { Start-Sleep -Seconds 5 }".into(),
            ]
        } else {
            shell("sleep 5")
        };
        let cell = state.active_cell();
        let err = run_sibling_write_bounded(
            &state,
            &cell,
            &prog,
            &[],
            None,
            Duration::from_millis(200),
            SIBLING_STDOUT_CAP,
        )
        .await
        .unwrap_err();
        assert_eq!(
            err.0,
            StatusCode::GATEWAY_TIMEOUT,
            "hung write sibling → 504"
        );
        assert!(err.1.0["error"].as_str().unwrap().contains("timed out"));
    }

    // --- W02: core CREATE channel (/ops/core/create) ------------------------

    #[tokio::test]
    async fn create_with_a_missing_required_field_400s_with_tiers() {
        // W02: a missing required `doc_type`/`feature` (empty after deserialize)
        // is a tiers-carrying 400 before any subprocess.
        let (_dir, state) = sibling_state();
        // Missing doc_type.
        let err = ops_core_create(
            State(state.clone()),
            Json(CoreCreateBody {
                doc_type: "".into(),
                feature: "editor-demo".into(),
                ..Default::default()
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_REQUEST, "missing doc_type → 400");
        assert!(err.1.0["error"].as_str().unwrap().contains("doc_type"));
        assert!(
            err.1.0["tiers"]["semantic"]["available"].is_boolean(),
            "the 400 carries the tiers block"
        );
        // Missing feature.
        let err = ops_core_create(
            State(state),
            Json(CoreCreateBody {
                doc_type: "adr".into(),
                feature: "".into(),
                ..Default::default()
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_REQUEST, "missing feature → 400");
        assert!(err.1.0["error"].as_str().unwrap().contains("feature"));
    }

    #[tokio::test]
    async fn create_field_validation_rejects_dangerous_inputs_with_a_tiered_400() {
        // W02: a flag-shaped or out-of-grammar doc_type/feature, a flag-shaped
        // title, and a flag-shaped related entry are each a tiers-carrying 400.
        let (_dir, state) = sibling_state();
        let cases: &[CoreCreateBody] = &[
            CoreCreateBody {
                doc_type: "--force".into(),
                feature: "f".into(),
                ..Default::default()
            },
            CoreCreateBody {
                doc_type: "adr/evil".into(),
                feature: "f".into(),
                ..Default::default()
            },
            CoreCreateBody {
                doc_type: "adr".into(),
                feature: "--feature=x".into(),
                ..Default::default()
            },
            CoreCreateBody {
                doc_type: "adr".into(),
                feature: "has space".into(),
                ..Default::default()
            },
            CoreCreateBody {
                doc_type: "adr".into(),
                feature: "f".into(),
                title: Some("--title-injection".into()),
                ..Default::default()
            },
            CoreCreateBody {
                doc_type: "adr".into(),
                feature: "f".into(),
                related: Some(vec!["--related-injection".into()]),
                ..Default::default()
            },
        ];
        for case in cases {
            let body = CoreCreateBody {
                scope: case.scope.clone(),
                doc_type: case.doc_type.clone(),
                feature: case.feature.clone(),
                title: case.title.clone(),
                related: case.related.clone(),
            };
            let label = format!("{}/{}", body.doc_type, body.feature);
            let err = ops_core_create(State(state.clone()), Json(body))
                .await
                .unwrap_err();
            assert_eq!(
                err.0,
                StatusCode::BAD_REQUEST,
                "case `{label}` must be a 400"
            );
            assert!(
                err.1.0["tiers"]["semantic"]["available"].is_boolean(),
                "the 400 carries the tiers block"
            );
        }
        // Clean kebab/word tokens pass validation; the subprocess is exercised by
        // the forward tests below (which drive the runner directly).
        assert!(validate_token(&state, "doc_type", "adr").is_ok());
        assert!(validate_token(&state, "feature", "editor-demo").is_ok());
        assert!(validate_token(&state, "feature", "grid_layout").is_ok());
    }

    // --- core ARCHIVE channel (/ops/core/archive) ---------------------------

    #[tokio::test]
    async fn archive_field_validation_rejects_bad_features_with_a_tiered_400() {
        // An empty, flag-shaped, or out-of-grammar feature is a tiers-carrying 400
        // before any subprocess (the same injection-guard surface as create).
        let (_dir, state) = sibling_state();
        for bad in ["", "--force", "feat/evil", "has space", "--feature=x"] {
            let err = ops_core_archive(
                State(state.clone()),
                Json(CoreArchiveBody {
                    feature: bad.into(),
                    ..Default::default()
                }),
            )
            .await
            .unwrap_err();
            assert_eq!(
                err.0,
                StatusCode::BAD_REQUEST,
                "feature `{bad}` must be a 400"
            );
            assert!(err.1.0["error"].as_str().unwrap().contains("feature"));
            assert!(
                err.1.0["tiers"]["semantic"]["available"].is_boolean(),
                "the 400 carries the tiers block"
            );
        }
        // A clean kebab/word feature tag passes validation.
        assert!(validate_token(&state, "feature", "editor-demo").is_ok());
    }

    // --- core LINK channel (/ops/core/link) ---------------------------------

    #[tokio::test]
    async fn link_field_validation_rejects_bad_stems_with_a_tiered_400() {
        // An empty, flag-shaped, or out-of-grammar src/dst stem is a tiers-carrying
        // 400 before any subprocess (the same injection-guard surface as create).
        let (_dir, state) = sibling_state();
        let cases: &[(&str, &str)] = &[
            ("", "b"),
            ("a", ""),
            ("--force", "b"),
            ("a", "b/evil"),
            ("a b", "c"),
        ];
        for (src, dst) in cases {
            let err = ops_core_link(
                State(state.clone()),
                Json(CoreLinkBody {
                    src: (*src).into(),
                    dst: (*dst).into(),
                    ..Default::default()
                }),
            )
            .await
            .unwrap_err();
            assert_eq!(
                err.0,
                StatusCode::BAD_REQUEST,
                "`{src}`→`{dst}` must be a 400"
            );
            assert!(
                err.1.0["tiers"]["semantic"]["available"].is_boolean(),
                "the 400 carries the tiers block"
            );
        }
        // Clean kebab/word stems pass validation.
        assert!(validate_token(&state, "src", "2026-06-20-editor-demo-adr").is_ok());
    }

    /// A stub `vault add` that emits a `status:"created"` success envelope, exit
    /// 0, carrying the new doc path/stem under `data` — vault add's real shape.
    fn create_success() -> Vec<String> {
        let payload = r#"{"schema":"vaultspec.vault.add.v1","status":"created","data":{"path":".vault/adr/2026-06-16-editor-demo-adr.md","stem":"2026-06-16-editor-demo-adr"}}"#;
        if cfg!(windows) {
            vec![
                "powershell".into(),
                "-NoProfile".into(),
                "-Command".into(),
                format!(
                    "& {{ [Console]::Out.Write('{}') }}",
                    payload.replace('\'', "''")
                ),
            ]
        } else {
            shell(&format!("printf '%s' '{payload}'"))
        }
    }

    #[tokio::test]
    async fn a_create_success_is_forwarded_verbatim_under_data_envelope_with_tiers() {
        // W02: a `status:"created"` success forwards VERBATIM under data.envelope
        // with the tiers block — identical contract to the write channel. We drive
        // the runner directly (the route's field validation is covered above) and
        // assert the verbatim-forward shape the route emits.
        let (_dir, state) = sibling_state();
        let cell = state.active_cell();
        let value = run_sibling_write_bounded(
            &state,
            &cell,
            &create_success(),
            &[],
            None,
            SIBLING_TIMEOUT,
            SIBLING_STDOUT_CAP,
        )
        .await
        .expect("create success envelope is forwarded");
        let Json(body) = super::super::envelope(
            json!({ "envelope": value }),
            super::super::query_tiers(&state.active_cell()),
            None,
        );
        assert_eq!(body["data"]["envelope"]["status"], "created");
        assert_eq!(
            body["data"]["envelope"]["data"]["stem"],
            "2026-06-16-editor-demo-adr"
        );
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "tiers block on the create success envelope"
        );
    }

    /// A stub `vault add` that exits 1 emitting a `status:"failed"` envelope — a
    /// business refusal that must forward VERBATIM as a 200, NOT a 502.
    fn create_failed_exit1() -> Vec<String> {
        let payload = r#"{"schema":"vaultspec.vault.add.v1","status":"failed","data":{"refused":true,"errors":["unknown doc type"],"checks":[]}}"#;
        if cfg!(windows) {
            vec![
                "powershell".into(),
                "-NoProfile".into(),
                "-Command".into(),
                format!(
                    "& {{ [Console]::Out.Write('{}'); exit 1 }}",
                    payload.replace('\'', "''")
                ),
            ]
        } else {
            shell(&format!("printf '%s' '{payload}'; exit 1"))
        }
    }

    #[tokio::test]
    async fn a_failed_create_envelope_exiting_1_is_forwarded_verbatim_not_a_502() {
        // W02 (the load-bearing test): a `status:"failed"` create that exits 1 is
        // a VALID business refusal forwarded VERBATIM under data.envelope on a 200,
        // never a 502. The client branches on envelope.status + data.refused.
        let (_dir, state) = sibling_state();
        let cell = state.active_cell();
        let value = run_sibling_write_bounded(
            &state,
            &cell,
            &create_failed_exit1(),
            &[],
            None,
            SIBLING_TIMEOUT,
            SIBLING_STDOUT_CAP,
        )
        .await
        .expect("a status:failed create envelope is Ok (forwarded), not an Err");
        assert_eq!(value["status"], "failed");
        assert_eq!(value["data"]["refused"], true);
        assert_eq!(value["data"]["errors"][0], "unknown doc type");
    }

    // --- rag-affordance-adoption: version-tolerant --json start --------------

    #[test]
    fn rag_start_args_appends_json_after_the_validated_flags() {
        let args = rag_start_args(&RagControlBody::default()).unwrap();
        assert_eq!(args, ["server", "start", "--json"]);

        let with_flags = rag_start_args(&RagControlBody {
            local_only: Some(true),
            port: Some(9000),
            ..Default::default()
        })
        .unwrap();
        assert_eq!(
            with_flags,
            [
                "server",
                "start",
                "--local-only",
                "--port",
                "9000",
                "--json"
            ]
        );
        // The port bound still rejects a privileged port before --json is reached.
        assert!(
            rag_start_args(&RagControlBody {
                port: Some(80),
                ..Default::default()
            })
            .is_err()
        );
    }

    #[test]
    fn rag_rejected_json_detects_an_older_rag_unknown_option() {
        // PRIMARY signal: a typer usage error exits 2 -> retry without --json, even
        // with no recognizable text.
        let exit2 = LifecycleRun {
            code: Some(2),
            stdout: String::new(),
            stderr: String::new(),
        };
        assert!(rag_rejected_json(&exit2));
        // Belt-and-suspenders: the unknown-option text on a non-standard exit code.
        let by_text = LifecycleRun {
            code: Some(1),
            stdout: String::new(),
            stderr: "Error: No such option: --json".to_string(),
        };
        assert!(rag_rejected_json(&by_text));
        // A genuine rag --json FAILURE exits 1 and does not name --json: NOT a
        // rejection (rag's structured failures exit 1, never 2).
        let genuine = LifecycleRun {
            code: Some(1),
            stdout: r#"{"ok": false, "error": "port_in_use"}"#.to_string(),
            stderr: String::new(),
        };
        assert!(!rag_rejected_json(&genuine));
    }

    #[test]
    fn rag_start_failure_lifts_the_structured_reason() {
        // rag's --json failure envelope: the stated error + data are surfaced.
        let envelope = r#"{"ok": false, "command": "service.start",
            "error": "machine_owned", "message": "...",
            "data": {"holder_pid": 4242}}"#;
        let (error, data) =
            rag_start_failure(envelope).expect("an ok:false envelope yields a reason");
        assert_eq!(error, "machine_owned");
        assert_eq!(data["holder_pid"], 4242);
        // A success envelope or human text yields no failure reason (degrade to the
        // inferred reason).
        assert!(rag_start_failure(r#"{"ok": true, "command": "service.start"}"#).is_none());
        assert!(rag_start_failure("Service start failed\nPort in use").is_none());
    }
}
