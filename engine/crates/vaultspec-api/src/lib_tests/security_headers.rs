use super::*;

#[tokio::test]
async fn every_response_carries_the_static_security_headers() {
    // #41 security hardening: the standard defense-in-depth trio rides every
    // response (here /health, the one ungated route) so static assets, API
    // payloads, and errors are all covered.
    let (_dir, state) = fixture_state();
    let router = build_router(state);
    let response = router
        .oneshot(
            Request::get("/health")
                .header("host", "127.0.0.1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let headers = response.headers();
    assert_eq!(
        headers
            .get("x-content-type-options")
            .and_then(|v| v.to_str().ok()),
        Some("nosniff"),
    );
    assert_eq!(
        headers.get("x-frame-options").and_then(|v| v.to_str().ok()),
        Some("DENY"),
    );
    assert_eq!(
        headers.get("referrer-policy").and_then(|v| v.to_str().ok()),
        Some("no-referrer"),
    );
    // CSP (single-app-runtime D7): same-origin everything, the SPA's two
    // real allowances (inline style island, data: favicon), nothing else.
    let csp = headers
        .get("content-security-policy")
        .and_then(|v| v.to_str().ok())
        .expect("CSP on every response");
    for directive in [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
    ] {
        assert!(csp.contains(directive), "CSP missing `{directive}`: {csp}");
    }
    assert!(
        !csp.contains("unsafe-eval"),
        "CSP must never allow eval: {csp}"
    );
}

#[tokio::test]
async fn the_served_spa_document_is_loadable_under_the_csp() {
    // Review M4: prove the policy against the SPA DOCUMENT itself, not
    // just an API route. The served index (whichever asset source
    // resolves — embedded, override dir, disk passthrough, or the
    // placeholder) must carry the CSP header AND contain nothing the
    // policy forbids: no inline <script> (script-src 'self' has no
    // unsafe-inline) and no external script/style/img origin.
    let (_dir, state) = fixture_state();
    let router = build_router(state);
    let response = router
        .oneshot(
            Request::get("/")
                .header("host", "127.0.0.1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert!(
        response.headers().get("content-security-policy").is_some(),
        "the SPA document carries the CSP"
    );
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let html = String::from_utf8_lossy(&bytes).to_lowercase();
    // An inline module/script body would be blocked by script-src 'self':
    // every <script> must carry src (the bearer bootstrap is a <meta>
    // tag by design, never an inline script).
    for (i, chunk) in html.split("<script").enumerate() {
        if i == 0 {
            continue;
        }
        let tag = chunk.split('>').next().unwrap_or("");
        assert!(
            tag.contains("src="),
            "inline <script> would be blocked by the CSP: <script{tag}>"
        );
    }
    assert!(
        !html.contains("src=\"http") && !html.contains("href=\"http"),
        "the SPA document must reference no external origin under              default-src 'self'"
    );
}
