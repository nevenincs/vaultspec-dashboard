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

/// Token bootstrap (contract DF-6 amendment): the engine injects the
/// service token into served `index.html` as a meta tag, so the SPA can
/// authenticate without reading `service.json` (which a browser cannot).
/// Dev proxies inject Authorization themselves; meta-tag absence is legal.
pub fn inject_token(html: &str, token: &str) -> String {
    let meta = format!(r#"<meta name="vaultspec-token" content="{token}">"#);
    if let Some(pos) = html.find("</head>") {
        let mut out = String::with_capacity(html.len() + meta.len());
        out.push_str(&html[..pos]);
        out.push_str(&meta);
        out.push_str(&html[pos..]);
        out
    } else {
        // Headless HTML: prepend, never drop the bootstrap.
        format!("{meta}{html}")
    }
}

/// API path prefixes: unknown paths under these are JSON 404s, never
/// index.html (audit N6 / dogfood DF-3 — R2's fallback is for NON-API
/// paths only; an API typo must fail loud, not render the SPA). The same
/// list is the BEARER boundary (dogfood DF-7): API paths are gated, the
/// static shell is not — it carries the token bootstrap and must be
/// reachable by a clean browser; loopback bind + Host validation is its
/// trust boundary.
pub(crate) const API_PREFIXES: &[&str] = &[
    "/map",
    "/vault-tree",
    "/graph",
    "/filters",
    "/nodes",
    "/events",
    "/status",
    "/stream",
    "/search",
    "/ops",
    "/health",
];

/// The SPA fallback handler: serve the asset when it exists, otherwise
/// `index.html` (deep links resolve client-side, contract R2).
pub async fn spa_fallback(State(state): State<Arc<AppState>>, uri: Uri) -> Response {
    let path = uri.path();
    if API_PREFIXES
        .iter()
        .any(|p| path == *p || path.starts_with(&format!("{p}/")))
    {
        return (
            StatusCode::NOT_FOUND,
            axum::Json(serde_json::json!({
                "error": format!("unknown API path `{path}`"),
                "tiers": crate::routes::query_tiers(&state),
            })),
        )
            .into_response();
    }
    let Some(dist) = spa_dir(&state) else {
        return (
            [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
            inject_token(PLACEHOLDER, &state.bearer),
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
        Ok(bytes) => {
            // index.html gets the token bootstrap meta tag (DF-6); other
            // assets pass through untouched.
            if target.file_name().and_then(|n| n.to_str()) == Some("index.html") {
                let html = String::from_utf8_lossy(&bytes);
                return (
                    [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
                    inject_token(&html, &state.bearer),
                )
                    .into_response();
            }
            (
                [(header::CONTENT_TYPE, mime_for(&target.to_string_lossy()))],
                bytes,
            )
                .into_response()
        }
        Err(_) => (StatusCode::NOT_FOUND, "no index.html in SPA dir").into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_injects_before_head_close_and_survives_headless_html() {
        let html = "<html><head><title>x</title></head><body></body></html>";
        let out = inject_token(html, "tok-123");
        assert!(out.contains(r#"<meta name="vaultspec-token" content="tok-123"></head>"#));
        let headless = inject_token("<body>bare</body>", "tok-9");
        assert!(headless.starts_with(r#"<meta name="vaultspec-token""#));
    }
}
