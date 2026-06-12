//! SPA static serving (contract R2, W03.P11.S52): fallback routing to
//! `index.html` for unknown non-API paths, correct MIME types,
//! filesystem-dir serving (the dev passthrough; asset embedding is
//! bundling-time work under D9.2's deferred mechanics).

use std::path::PathBuf;
use std::sync::Arc;

use axum::extract::State;
use axum::http::{StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};

use crate::app::AppState;

/// Resolve the SPA dist directory: `VAULTSPEC_SPA_DIR` override, else
/// `frontend/dist` beside the workspace root, else none (placeholder).
pub fn spa_dir(state: &AppState) -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("VAULTSPEC_SPA_DIR") {
        let p = PathBuf::from(dir);
        return p.is_dir().then_some(p);
    }
    let candidate = state.root.join("frontend").join("dist");
    candidate.is_dir().then_some(candidate)
}

fn mime_for(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript",
        "css" => "text/css",
        "json" | "map" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "wasm" => "application/wasm",
        _ => "application/octet-stream",
    }
}

const PLACEHOLDER: &str = "<!doctype html><html><head><title>vaultspec</title></head>\
<body><h1>vaultspec engine</h1><p>No SPA bundle found. Build the frontend \
(<code>npm run build</code> in <code>frontend/</code>) or set \
<code>VAULTSPEC_SPA_DIR</code>.</p></body></html>";

/// The SPA fallback handler: serve the asset when it exists, otherwise
/// `index.html` (deep links resolve client-side, contract R2).
pub async fn spa_fallback(State(state): State<Arc<AppState>>, uri: Uri) -> Response {
    let Some(dist) = spa_dir(&state) else {
        return (
            [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
            PLACEHOLDER,
        )
            .into_response();
    };
    let requested = uri.path().trim_start_matches('/');
    // Path traversal guard: reject any segment escaping the dist dir.
    let safe = !requested.split(['/', '\\']).any(|seg| seg == "..");
    let candidate = dist.join(requested);
    let target = if safe && !requested.is_empty() && candidate.is_file() {
        candidate
    } else {
        dist.join("index.html")
    };
    match std::fs::read(&target) {
        Ok(bytes) => (
            [(header::CONTENT_TYPE, mime_for(&target.to_string_lossy()))],
            bytes,
        )
            .into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "no index.html in SPA dir").into_response(),
    }
}
