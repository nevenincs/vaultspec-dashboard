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
use std::sync::Arc;
use std::time::Duration;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use engine_model::{CanonicalKey, node_id};
use serde_json::{Value, json};
use tokio::io::AsyncReadExt;

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

/// The R1 core whitelist: vault check + stats. Anything else is a sibling
/// filing, not whitelist growth.
const CORE_WHITELIST: &[(&str, &[&str])] = &[
    ("vault-check", &["vault", "check", "all"]),
    ("vault-stats", &["vault", "stats"]),
];

/// The rag CLI whitelist is now PROCESS LIFECYCLE ONLY (rag-control-plane ADR
/// D1, P02.S13): you cannot HTTP a service that is not running, so start / stop
/// / status / doctor / install stay the bounded CLI subprocess runner. Every
/// other rag verb — the reindex TRIGGER, job polling, watcher config, project
/// management, and the observability reads — is brokered over rag's HTTP service
/// through the `rag_client::control` module (the HTTP-brokered verbs below),
/// because rag's runtime truth lives on the running service and a reindex is
/// job-based (returns a `job_id`, polled via `/jobs`), never a blocking CLI call.
const RAG_CLI_WHITELIST: &[(&str, &[&str])] = &[
    ("server-start", &["server", "start"]),
    ("server-stop", &["server", "stop"]),
    ("server-status", &["server", "status"]),
    ("server-doctor", &["server", "doctor"]),
    ("server-install", &["install"]),
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
    // tokio::process so the spawn + bounded-read + timeout never blocks the
    // async worker (robustness H1): a hung sibling no longer pins a runtime
    // thread, and stdout is read through a ceiling rather than buffered whole.
    // The sibling runs in the ACTIVE scope's worktree (the target for the
    // subprocess working dir, W02.P05.S18): the ops routes carry no scope
    // param, so they forward to core/rag in the currently-selected scope. The
    // read-and-infer fence holds — the engine only FORWARDS to the sibling; it
    // grows no sibling semantics.
    let cwd = state.active_cell().root.clone();
    let mut child = tokio::process::Command::new(&program[0])
        .args(&program[1..])
        .args(args)
        .arg("--json")
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
    ("numstat", &["diff", "--numstat", "--no-color"]),
    ("diff", &["diff", "--no-color"]),
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
    program: &[String],
    args: &[String],
    timeout: Duration,
    cap: u64,
) -> Result<String, (StatusCode, Json<Value>)> {
    let cwd = state.active_cell().root.clone();
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
    if buf.len() as u64 >= cap {
        let _ = child.kill().await;
        return Err(super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!(
                "{} produced over {cap} bytes of output (capped)",
                program[0]
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
    if !status.success() {
        return Err(super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!("{} exited {:?}", program[0], status.code()),
        ));
    }
    Ok(String::from_utf8_lossy(&buf).to_string())
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
}

/// Watcher debounce ceiling: 10 minutes. A larger value is almost certainly a
/// client bug (ms vs s confusion) and would make the watcher feel dead.
const MAX_WATCH_DEBOUNCE_MS: u64 = 600_000;
/// Watcher cooldown ceiling: 1 hour.
const MAX_WATCH_COOLDOWN_S: f64 = 3_600.0;

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
];

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

    let job_id = params.get("job_id").map(String::as_str);
    let limit = params.get("limit").and_then(|v| v.parse::<u32>().ok());
    let lines = params.get("lines").and_then(|v| v.parse::<u32>().ok());

    use rag_client::control;
    let result = match verb.as_str() {
        "service-state" => control::service_state(&transport, &project_root),
        "jobs" => control::jobs(&transport, job_id, limit),
        "watcher" => control::watcher_get(&transport, &project_root),
        "projects" => control::projects(&transport),
        "readiness" => control::readiness(&transport),
        "logs" => control::logs(&transport, lines, job_id),
        // Prometheus text is not JSON; forward it verbatim under a string field.
        "metrics" => control::metrics(&transport).map(|text| json!({ "metrics": text })),
        _ => unreachable!("RAG_READ_VERBS membership is checked above"),
    };
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
        let result = match verb.as_str() {
            "reindex" => control::reindex(
                &transport,
                &control::ReindexArgs {
                    project_root: &project_root,
                    reindex_type,
                    clean: body.clean.unwrap_or(false),
                    initiator_kind,
                },
            ),
            "watcher-start" => control::watcher_start(&transport, &project_root),
            "watcher-stop" => control::watcher_stop(&transport, &project_root),
            "watcher-reconfigure" => control::watcher_reconfigure(
                &transport,
                &project_root,
                body.debounce_ms,
                body.cooldown_s,
            ),
            "project-evict" => control::projects_evict(&transport, &evict_root),
            "quality" => control::quality(&transport),
            _ => unreachable!("http_verb set guards the match"),
        };
        return Ok(brokered_envelope(&cell, result));
    }

    // Process-lifecycle verbs: the bounded CLI subprocess runner (a dead service
    // cannot be reached over HTTP, ADR D1).
    let Some((_, args)) = RAG_CLI_WHITELIST.iter().find(|(name, _)| *name == verb) else {
        return Err(super::api_error(
            &state,
            StatusCode::FORBIDDEN,
            format!("verb `{verb}` is not whitelisted (rag control plane)"),
        ));
    };
    let envelope = run_sibling(&state, &rag_invocation(), args).await?;
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
    let GitOpBody { path, from, to } = body.map(|Json(b)| b).unwrap_or_default();
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
    let output = run_git_bounded(
        &state,
        &git_invocation(),
        &args,
        SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await?;
    // S15: the success envelope carries the per-tier degradation block through
    // the shared `envelope` helper, and every error path above degrades through
    // `api_error` (which always attaches the tiers block) — so the historical
    // diff route, like every other front door, carries tiers on success AND
    // error (every-wire-response-carries-the-tiers-block). No body is ever
    // hand-built; the histdiff verb shares this single envelope construction.
    Ok(super::envelope(
        json!({"verb": name, "output": output}),
        super::query_tiers(&state.active_cell()),
        None,
    ))
}

#[derive(serde::Deserialize)]
pub struct SearchBody {
    pub query: String,
    /// `vault` or `code` (rag's vocabulary, forwarded intact).
    #[serde(default, rename = "type")]
    pub target: Option<String>,
    #[serde(default)]
    pub max_results: Option<u32>,
}

pub async fn search(State(state): State<Arc<AppState>>, Json(body): Json<SearchBody>) -> ApiResult {
    // Search runs against the ACTIVE scope (no scope param, W02.P05.S18): rag
    // discovery and the tiers block both read that cell's root.
    let cell = state.active_cell();
    // Validate the search target against rag's vocabulary BEFORE anything else
    // (B10, resource-hardening): an unknown or dash-prefixed `--type` value is a
    // client error (400), never forwarded to the sibling. Argv passing already
    // blocks shell injection; this closes the value-validation gap and mirrors
    // the whitelist discipline the ops proxy applies to every sibling verb.
    if let Some(target) = &body.target
        && !matches!(target.as_str(), "vault" | "code")
    {
        return Err(super::api_error(
            &state,
            StatusCode::BAD_REQUEST,
            format!("search target `{target}` must be `vault` or `code`"),
        ));
    }
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
    let mut args: Vec<String> = vec!["search".into(), body.query.clone()];
    if let Some(target) = &body.target {
        args.push("--type".into());
        args.push(target.clone());
    }
    if let Some(n) = body.max_results {
        args.push("--max-results".into());
        args.push(n.to_string());
    }
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    // A sibling fault (crash, timeout, capped runaway — now surfaced as a
    // run_sibling Err per H1/M4) must DEGRADE the semantic tier here, never a
    // hard 502/504: search is a degradable surface (contract §8), the rest of
    // the engine is fully available. The error message rides the tier reason.
    let rag_envelope = match run_sibling(&state, &rag_invocation(), &arg_refs).await {
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
/// (`vault` | `code`), NOT a path. The path lives in `path` (with code
/// symbols in `function_name` / `class_name`). An earlier annotation read
/// `source` as a path and mis-derived every id.
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
        Some("code") => {
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
        assert_eq!(results.len(), 4, "every hit survives; none dropped");

        // Vault hit → doc node from the PATH STEM, not the "vault"
        // discriminator. rag fields pass through verbatim alongside node_id.
        assert_eq!(results[0]["node_id"], "doc:2026-06-05-x-adr");
        assert_eq!(results[0]["doc_type"], "adr");
        assert_eq!(results[0]["score"], 0.548);

        // Code hit with a symbol → code-artifact id qualified by `#symbol`.
        assert_eq!(results[1]["node_id"], "code:src/lib.rs#alpha");
        // Code hit without a symbol → bare path.
        assert_eq!(results[2]["node_id"], "code:src/lib.rs");
        // Unknown discriminator → explicit null (typed miss), never guessed.
        assert_eq!(results[3]["node_id"], Value::Null);
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
}
