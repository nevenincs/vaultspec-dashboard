use super::*;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;

fn fixture_state() -> (tempfile::TempDir, Arc<AppState>) {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
    std::fs::write(
        dir.path().join(".vault/plan/2026-06-12-srv-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#srv'\n---\n\nMentions `src/a.rs`.\n",
    )
    .unwrap();
    // build_state warms + indexes the launch scope's cell eagerly.
    let state = app::build_state(dir.path().to_path_buf());
    (dir, state)
}

async fn get_with_token(router: Router, path: &str, token: Option<&str>) -> (StatusCode, Value) {
    let mut builder = Request::get(path).header("host", "127.0.0.1");
    if let Some(token) = token {
        builder = builder.header("authorization", format!("Bearer {token}"));
    }
    let response = router
        .oneshot(builder.body(Body::empty()).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
        .await
        .unwrap();
    let value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (status, value)
}

async fn post_json_with_token(
    router: Router,
    path: &str,
    json_body: Value,
    token: Option<&str>,
) -> (StatusCode, Value) {
    let mut builder = Request::post(path)
        .header("host", "127.0.0.1")
        .header("content-type", "application/json");
    if let Some(token) = token {
        builder = builder.header("authorization", format!("Bearer {token}"));
    }
    let response = router
        .oneshot(builder.body(Body::from(json_body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
        .await
        .unwrap();
    let value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (status, value)
}

async fn put_json_with_token(
    router: Router,
    path: &str,
    json_body: Value,
    token: Option<&str>,
) -> (StatusCode, Value) {
    let mut builder = Request::put(path)
        .header("host", "127.0.0.1")
        .header("content-type", "application/json");
    if let Some(token) = token {
        builder = builder.header("authorization", format!("Bearer {token}"));
    }
    let response = router
        .oneshot(builder.body(Body::from(json_body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
        .await
        .unwrap();
    let value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (status, value)
}

fn git(dir: &std::path::Path, args: &[&str]) {
    let output = std::process::Command::new("git")
        .current_dir(dir)
        .args(args)
        .env("GIT_AUTHOR_NAME", "f")
        .env("GIT_AUTHOR_EMAIL", "f@t")
        .env("GIT_COMMITTER_NAME", "f")
        .env("GIT_COMMITTER_EMAIL", "f@t")
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn urlencode(s: &str) -> String {
    s.replace(':', "%3A").replace('/', "%2F")
}

/// Percent-encode every non-unreserved byte (RFC 3986) so an arbitrary
/// value (e.g. a JSON filter) is a valid query-string component.
fn percent_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

mod auth_and_query;
mod browser_and_contract;
mod provision_and_recovery;
mod security_headers;
mod temporal_history;
mod workspace_and_content;
