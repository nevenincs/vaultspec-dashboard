//! The transparent, whitelisted ops proxies and the search pass-through
//! (contract §6/§8, W03.P11.S53): sibling envelopes verbatim, no engine
//! semantics — the engine is only the server-side hand a browser SPA
//! lacks (D7.5).
//!
//! Rag verbs run through rag's CLI with `--json` (audit N5): the CLI is
//! rag's documented, guaranteed control surface — its loopback HTTP routes
//! are monitoring-only. The whitelist is R1 exactly: service lifecycle,
//! reindex, watcher status/tuning.

use std::sync::Arc;
use std::time::Duration;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use engine_model::{CanonicalKey, node_id};
use serde_json::{Value, json};
use tokio::io::AsyncReadExt;

use crate::app::AppState;

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

/// The R1 rag whitelist: lifecycle, reindex, watcher status. (Watcher
/// reconfigure needs validated arguments; deferred with rationale in the
/// step record rather than shipping an unvalidated argument channel.)
const RAG_WHITELIST: &[(&str, &[&str])] = &[
    ("server-start", &["server", "start"]),
    ("server-stop", &["server", "stop"]),
    ("server-status", &["server", "status"]),
    ("reindex", &["index"]),
    ("watcher-status", &["server", "watcher", "status"]),
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
    let mut child = tokio::process::Command::new(&program[0])
        .args(&program[1..])
        .args(args)
        .arg("--json")
        .current_dir(&state.root)
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
        super::query_tiers(&state),
        None,
    ))
}

pub async fn ops_rag(State(state): State<Arc<AppState>>, Path(verb): Path<String>) -> ApiResult {
    let Some((_, args)) = RAG_WHITELIST.iter().find(|(name, _)| *name == verb) else {
        return Err(super::api_error(
            &state,
            StatusCode::FORBIDDEN,
            format!("verb `{verb}` is not whitelisted (R1)"),
        ));
    };
    let envelope = run_sibling(&state, &rag_invocation(), args).await?;
    Ok(super::envelope(
        json!({"envelope": envelope}),
        super::query_tiers(&state),
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
    // Degrade to the tier block when rag is absent — never a dead control
    // (contract §8).
    if let rag_client::RagAvailability::Unavailable { reason } =
        rag_client::client::discover(&state.root.join(".vault")).0
    {
        return Ok(super::envelope(
            json!({"results": []}),
            super::degraded_tiers(&state, reason.as_str()),
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
                super::degraded_tiers(&state, reason),
                None,
            ));
        }
    };

    // Flatten rag's envelope to the contract §2 shape and annotate each hit
    // with its engine node id (§8 value-add). A shape miss degrades the
    // `semantic` tier truthfully — never a healthy-looking empty result and
    // never a foreign envelope passed through unflattened.
    match flatten_and_annotate(&rag_envelope) {
        Ok(data) => Ok(super::envelope(data, super::query_tiers(&state), None)),
        Err(miss) => {
            let reason = miss.reason();
            Ok(super::envelope(
                json!({"results": []}),
                super::degraded_tiers(&state, reason.as_str()),
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
}
