//! SPA static serving (contract R2, W03.P11.S52): fallback routing to
//! `index.html` for unknown non-API paths, correct MIME types, and an
//! embedded-first asset source (dashboard-packaging ADR). A release build
//! compiled with the `embed-spa` feature carries `frontend/dist` inside the
//! binary and serves it from memory; without the feature (dev) the source is
//! the disk passthrough — `VAULTSPEC_SPA_DIR` or `<workspace>/frontend/dist`.
//! The resolution chain is embedded → `VAULTSPEC_SPA_DIR` → `frontend/dist` →
//! placeholder; the traversal guard, MIME map, deep-link fallback, API prefix
//! boundary, and bearer-token injection are identical across both sources.

use std::path::PathBuf;
use std::sync::Arc;

/// The compiled-in SPA bundle for release packaging, embedded from the
/// crate-internal staged directory `assets/spa` (distribution-channels ADR:
/// boundary-clean — the crate never reaches outside itself, so it is
/// packageable). The packaged-build recipe and the CI build step stage
/// `frontend/dist` into it; a feature-on build without staging is a COMPILE
/// ERROR, preserving fail-loud. Present only under the `embed-spa` feature;
/// dev builds omit it and keep the disk passthrough so a UI change needs no
/// engine rebuild.
#[cfg(feature = "embed-spa")]
#[derive(rust_embed::RustEmbed)]
#[folder = "assets/spa"]
pub(crate) struct EmbeddedSpa;

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
    let candidate = state.workspace_root.join("frontend").join("dist");
    candidate.is_dir().then_some(candidate)
}

/// Where SPA assets are read from: the compiled-in store (release packaging
/// via the `embed-spa` feature) or a directory on disk (the dev passthrough
/// and the `VAULTSPEC_SPA_DIR` override). Both sources answer the same two
/// questions the fallback handler asks, so the serving logic is source-blind.
enum SpaSource {
    #[cfg(feature = "embed-spa")]
    Embedded,
    Disk(PathBuf),
}

impl SpaSource {
    /// True when `rel` names a concrete asset in this source — used to decide
    /// asset-vs-deep-link-fallback, never to serve.
    fn contains(&self, rel: &str) -> bool {
        match self {
            #[cfg(feature = "embed-spa")]
            SpaSource::Embedded => EmbeddedSpa::get(rel).is_some(),
            SpaSource::Disk(dir) => dir.join(rel).is_file(),
        }
    }

    /// Read `rel` from this source, or `None` if it is absent.
    fn read(&self, rel: &str) -> Option<Vec<u8>> {
        match self {
            #[cfg(feature = "embed-spa")]
            SpaSource::Embedded => EmbeddedSpa::get(rel).map(|f| f.data.into_owned()),
            SpaSource::Disk(dir) => std::fs::read(dir.join(rel)).ok(),
        }
    }
}

/// Resolve the SPA asset source embedded-first (dashboard-packaging ADR): the
/// compiled-in store when the `embed-spa` feature baked assets in, else the
/// `VAULTSPEC_SPA_DIR` override or `<workspace_root>/frontend/dist` on disk,
/// else `None` → the placeholder page. Dev builds (no feature) skip straight
/// to the disk passthrough, so their behavior is unchanged.
fn resolve_spa_source(state: &AppState) -> Option<SpaSource> {
    #[cfg(feature = "embed-spa")]
    if EmbeddedSpa::get("index.html").is_some() {
        return Some(SpaSource::Embedded);
    }
    spa_dir(state).map(SpaSource::Disk)
}

/// Path traversal guard for the asset lookup: the request must stay a plain
/// relative path under the asset root. Rejects `..` segments, and — because
/// `PathBuf::join` REPLACES the base when handed an absolute or drive-relative
/// path — rejects absolute paths and any `:`-bearing segment (`C:/...`,
/// `C:foo`), which on Windows would otherwise escape the root entirely
/// (P01 review finding, disk-source hardening). No legitimate Vite asset name
/// carries a colon or leads with a separator.
fn is_safe_relative(requested: &str) -> bool {
    !requested.split(['/', '\\']).any(|seg| seg == "..")
        && !std::path::Path::new(requested).is_absolute()
        && !requested.contains(':')
        && !requested.starts_with(['/', '\\'])
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
    // HTML-attribute-escape the token (B10, resource-hardening): the bearer is
    // 32 hex chars today, but escaping makes the injection permanently safe
    // against any future token format that could carry `"`/`<`/`&` and turn a
    // served page into an XSS sink.
    let meta = format!(
        r#"<meta name="vaultspec-token" content="{}">"#,
        escape_attr(token)
    );
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

/// HTML-escape a value destined for a double-quoted attribute (B10): the five
/// characters that could break out of the attribute or the element.
fn escape_attr(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            other => out.push(other),
        }
    }
    out
}

/// API path prefixes: unknown paths under these are JSON 404s, never
/// index.html (audit N6 / dogfood DF-3 — R2's fallback is for NON-API
/// paths only; an API typo must fail loud, not render the SPA). The same
/// list is the BEARER boundary (dogfood DF-7): API paths are gated, the
/// static shell is not — it carries the token bootstrap and must be
/// reachable by a clean browser; loopback bind + Host validation is its
/// trust boundary.
///
/// This list is a SECURITY boundary: a registered data/mutation route whose
/// prefix is MISSING here is served bearer-LESS. That drift is exactly what the
/// adversarial sweep found — `/file-tree`, `/pipeline`, `/dashboard-state`,
/// `/history`, `/prs`, `/issues` were registered but absent, so they ran ungated.
/// The `every_contract_route_requires_a_bearer` test now binds this list to the
/// canonical `crate::CONTRACT_ROUTES` inventory so the two cannot drift again:
/// every first path-segment in CONTRACT_ROUTES MUST appear here.
pub(crate) const API_PREFIXES: &[&str] = &[
    "/map",
    "/workspaces",
    "/vault-tree",
    "/code-files",
    "/file-tree",
    "/pipeline",
    "/dashboard-state",
    "/graph",
    "/filters",
    "/nodes",
    "/events",
    "/history",
    "/prs",
    "/issues",
    "/status",
    "/stream",
    "/authoring",
    "/search",
    "/ops",
    // Rides ahead of the in-flight provisioning plane (shared-tree commit
    // sweep, kept deliberately): this list is a bearer boundary, and the
    // /provision routes must never land without their prefix already gated.
    "/provision",
    "/health",
    "/session",
    "/settings",
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
                "tiers": crate::routes::query_tiers(&state.active_cell()),
            })),
        )
            .into_response();
    }
    let Some(source) = resolve_spa_source(&state) else {
        return (
            [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
            inject_token(PLACEHOLDER, &state.bearer),
        )
            .into_response();
    };
    let requested = uri.path().trim_start_matches('/');
    let safe = is_safe_relative(requested);
    // Serve the requested asset when it exists; otherwise fall back to
    // index.html so deep links resolve client-side (contract R2).
    let target = if safe && !requested.is_empty() && source.contains(requested) {
        requested
    } else {
        "index.html"
    };
    match source.read(target) {
        Some(bytes) => {
            // index.html gets the token bootstrap meta tag (DF-6); other
            // assets pass through untouched.
            if target.rsplit('/').next() == Some("index.html") {
                let html = String::from_utf8_lossy(&bytes);
                return (
                    [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
                    inject_token(&html, &state.bearer),
                )
                    .into_response();
            }
            ([(header::CONTENT_TYPE, mime_for(target))], bytes).into_response()
        }
        None => (StatusCode::NOT_FOUND, "no index.html in SPA dir").into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_traversal_guard_rejects_every_root_escape_shape() {
        // The disk arm feeds the request straight into `PathBuf::join`, which
        // REPLACES the base for absolute and drive-relative paths — so the
        // guard must reject them, not just `..` (P01 review, Windows escape).
        for escape in [
            "../secret",
            "assets/../../secret",
            r"assets\..\secret",
            "C:/Windows/win.ini",
            r"C:\Windows\win.ini",
            "C:win.ini",
            "//server/share/file",
            r"\\server\share\file",
        ] {
            assert!(!is_safe_relative(escape), "must reject {escape}");
        }
        for legit in ["index.html", "assets/index-DB4JoJbE.js", "favicon.ico"] {
            assert!(is_safe_relative(legit), "must keep {legit}");
        }
    }

    #[test]
    fn token_injects_before_head_close_and_survives_headless_html() {
        let html = "<html><head><title>x</title></head><body></body></html>";
        let out = inject_token(html, "tok-123");
        assert!(out.contains(r#"<meta name="vaultspec-token" content="tok-123"></head>"#));
        let headless = inject_token("<body>bare</body>", "tok-9");
        assert!(headless.starts_with(r#"<meta name="vaultspec-token""#));
    }

    #[test]
    fn token_with_html_metacharacters_cannot_break_out_of_the_attribute() {
        // B10 (resource-hardening): a token carrying `"`/`<`/`>`/`&` must be
        // escaped so it cannot close the attribute or inject markup — the XSS
        // sink that would open if the token format ever changed.
        let evil = r#"a"><script>alert(1)</script>"#;
        let out = inject_token("<head></head>", evil);
        assert!(
            !out.contains("<script>"),
            "raw script tag must not survive: {out}"
        );
        assert!(out.contains("&quot;"), "the quote is escaped");
        assert!(
            out.contains("&lt;script&gt;"),
            "the angle brackets are escaped"
        );
    }
}
