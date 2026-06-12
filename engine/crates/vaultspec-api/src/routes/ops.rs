//! The transparent, whitelisted ops proxies and the search pass-through
//! (contract §6/§8, W03.P11.S53): sibling envelopes verbatim, no engine
//! semantics — the engine is only the server-side hand a browser SPA
//! lacks (D7.5).

use std::sync::Arc;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::app::AppState;

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

/// The R1 whitelist, exactly the brief's pillar-2 verb list: core vault
/// check + stats. Anything else is a sibling filing, not whitelist growth.
const CORE_WHITELIST: &[(&str, &[&str])] = &[
    ("vault-check", &["vault", "check", "all"]),
    ("vault-stats", &["vault", "stats"]),
];

/// Rag control whitelist (R1): reindex + watcher tuning surfaces.
const RAG_WHITELIST: &[&str] = &["reindex", "watcher-status"];

pub async fn ops_core(State(state): State<Arc<AppState>>, Path(verb): Path<String>) -> ApiResult {
    let Some((_, args)) = CORE_WHITELIST.iter().find(|(name, _)| *name == verb) else {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": format!("verb `{verb}` is not whitelisted (R1)")})),
        ));
    };
    let runner = ingest_core::runner::CoreRunner::detect();
    // Schema pinning is per-verb; the proxy passes envelopes VERBATIM, so
    // it parses for transport errors only, never re-shapes.
    let output = std::process::Command::new(&runner.invocation[0])
        .args(&runner.invocation[1..])
        .args(*args)
        .arg("--json")
        .current_dir(&state.root)
        .output()
        .map_err(|e| {
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({"error": format!("spawning vaultspec-core: {e}")})),
            )
        })?;
    let raw = String::from_utf8_lossy(&output.stdout);
    let envelope: Value = serde_json::from_str(&raw)
        .unwrap_or_else(|_| json!({"raw": raw, "exit": output.status.code()}));
    Ok(Json(json!({
        "envelope": envelope,
        "tiers": super::query_tiers(&state),
    })))
}

pub async fn ops_rag(
    State(state): State<Arc<AppState>>,
    Path(verb): Path<String>,
    body: String,
) -> ApiResult {
    if !RAG_WHITELIST.contains(&verb.as_str()) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": format!("verb `{verb}` is not whitelisted (R1)")})),
        ));
    }
    let (transport, reason) = rag_transport(&state);
    let Some(transport) = transport else {
        // 502-with-tier-block when rag is down (contract §6).
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(json!({
                "error": reason,
                "tiers": super::query_tiers(&state),
            })),
        ));
    };
    let payload = if body.is_empty() {
        "{}".to_string()
    } else {
        body
    };
    match rag_client::client::RagTransport::post_json(&transport, &format!("/{verb}"), &payload) {
        Ok(raw) => {
            let envelope: Value =
                serde_json::from_str(&raw).unwrap_or_else(|_| json!({"raw": raw}));
            Ok(Json(json!({
                "envelope": envelope,
                "tiers": super::query_tiers(&state),
            })))
        }
        Err(e) => Err((
            StatusCode::BAD_GATEWAY,
            Json(json!({
                "error": rag_client::search::degradation_reason(&e),
                "tiers": super::query_tiers(&state),
            })),
        )),
    }
}

pub async fn search(State(state): State<Arc<AppState>>, body: String) -> ApiResult {
    let (transport, reason) = rag_transport(&state);
    let Some(transport) = transport else {
        // Degrades to the tier block, never a dead control (contract §8).
        return Ok(Json(json!({
            "results": [],
            "tiers": serde_json::to_value(engine_query::envelope::tiers_block(&[(
                "semantic",
                reason.as_str(),
            )]))
            .expect("tiers serialize"),
        })));
    };
    match rag_client::search::forward_search(&transport, &body) {
        Ok(envelope) => Ok(Json(json!({
            "envelope": envelope,
            "tiers": super::query_tiers(&state),
        }))),
        Err(e) => Err((
            StatusCode::BAD_GATEWAY,
            Json(json!({
                "error": rag_client::search::degradation_reason(&e),
                "tiers": super::query_tiers(&state),
            })),
        )),
    }
}

fn rag_transport(state: &AppState) -> (Option<rag_client::client::LoopbackTransport>, String) {
    match rag_client::client::discover(&state.root.join(".vault")) {
        (rag_client::RagAvailability::Available, Some(info)) => (
            Some(rag_client::client::LoopbackTransport {
                port: info.port,
                bearer: info.service_token,
                timeout: std::time::Duration::from_secs(60),
            }),
            String::new(),
        ),
        (rag_client::RagAvailability::Unavailable { reason }, _) => (None, reason),
        _ => (None, "rag discovery inconsistent".to_string()),
    }
}
