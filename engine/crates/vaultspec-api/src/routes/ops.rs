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
use engine_model::{CanonicalKey, node_id};
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
    let rag_envelope = run_sibling(&state, &rag_invocation(), &arg_refs)?;

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
                serde_json::to_value(engine_query::envelope::tiers_block(&[(
                    "semantic",
                    reason.as_str(),
                )]))
                .expect("tiers serialize"),
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
                "rag search response missing results list (shape drift)".to_string()
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
}
