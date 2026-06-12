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

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::app::AppState;

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

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

fn run_sibling(
    state: &AppState,
    program: &[String],
    args: &[&str],
) -> Result<Value, (StatusCode, Json<Value>)> {
    let output = std::process::Command::new(&program[0])
        .args(&program[1..])
        .args(args)
        .arg("--json")
        .current_dir(&state.root)
        .output()
        .map_err(|e| {
            super::api_error(
                state,
                StatusCode::BAD_GATEWAY,
                format!("spawning {}: {e}", program[0]),
            )
        })?;
    let raw = String::from_utf8_lossy(&output.stdout);
    // Envelopes pass VERBATIM; non-JSON output is wrapped, never reshaped.
    Ok(serde_json::from_str(&raw)
        .unwrap_or_else(|_| json!({"raw": raw, "exit": output.status.code()})))
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
    let envelope = run_sibling(&state, &runner.invocation, args)?;
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
    let envelope = run_sibling(&state, &rag_invocation(), args)?;
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
            serde_json::to_value(engine_query::envelope::tiers_block(&[(
                "semantic",
                reason.as_str(),
            )]))
            .expect("tiers serialize"),
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
    let mut envelope = run_sibling(&state, &rag_invocation(), &arg_refs)?;

    // The engine's ONLY addition (contract §8): per-result node ids.
    if let Some(results) = envelope
        .pointer_mut("/data/results")
        .and_then(Value::as_array_mut)
    {
        for result in results {
            let node_id = result
                .get("source")
                .and_then(Value::as_str)
                .map(|s| rag_client::discover::target_node_id(s).0);
            if let Some(obj) = result.as_object_mut() {
                obj.insert(
                    "node_id".to_string(),
                    node_id.map(Value::String).unwrap_or(Value::Null),
                );
            }
        }
    }
    Ok(super::envelope(
        json!({"envelope": envelope}),
        super::query_tiers(&state),
        None,
    ))
}
