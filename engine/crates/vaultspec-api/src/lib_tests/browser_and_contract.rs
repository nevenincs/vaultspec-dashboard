use super::*;

#[cfg(not(feature = "embed-spa"))]
#[tokio::test]
async fn spa_fallback_serves_placeholder_without_a_bundle() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);
    let response = router
        .oneshot(
            Request::get("/some/deep/link")
                .header("host", "localhost")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let content_type = response
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    assert!(content_type.starts_with("text/html"));
}

/// P01.S04 (dashboard-packaging): the embedded bundle serves standalone —
/// index with the token bootstrap, assets with correct MIME, deep links
/// falling back to the shell, and the API prefix boundary staying JSON.
#[cfg(feature = "embed-spa")]
mod embedded_spa {
    use super::*;

    async fn get_raw(path: &str) -> (StatusCode, String, Vec<u8>) {
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let router = build_router(state);
        let response = router
            .oneshot(
                Request::get(path)
                    .header("host", "127.0.0.1")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let content_type = response
            .headers()
            .get("content-type")
            .map(|v| v.to_str().unwrap().to_string())
            .unwrap_or_default();
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 26)
            .await
            .unwrap()
            .to_vec();
        (status, content_type, bytes)
    }

    #[tokio::test]
    async fn embedded_index_serves_with_the_token_bootstrap() {
        let (status, content_type, body) = get_raw("/").await;
        assert_eq!(status, StatusCode::OK);
        assert!(content_type.starts_with("text/html"));
        let html = String::from_utf8_lossy(&body);
        assert!(
            html.contains(r#"<meta name="vaultspec-token""#),
            "token bootstrap is injected into the embedded index"
        );
        assert!(
            !html.contains("No SPA bundle found"),
            "the placeholder is unreachable with an embedded bundle"
        );
    }

    #[tokio::test]
    async fn embedded_asset_serves_with_correct_mime() {
        let asset = crate::routes::spa::EmbeddedSpa::iter()
            .find(|name| name.starts_with("assets/") && name.ends_with(".js"))
            .expect("the built bundle carries at least one hashed JS chunk");
        let (status, content_type, body) = get_raw(&format!("/{asset}")).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(content_type, "text/javascript");
        assert!(!body.is_empty(), "asset bytes come from the embedded store");
    }

    #[tokio::test]
    async fn embedded_deep_link_falls_back_to_the_shell() {
        let (status, content_type, body) = get_raw("/some/deep/link").await;
        assert_eq!(status, StatusCode::OK);
        assert!(content_type.starts_with("text/html"));
        assert!(
            String::from_utf8_lossy(&body).contains(r#"<meta name="vaultspec-token""#),
            "deep links resolve to the embedded shell with the bootstrap"
        );
    }

    #[tokio::test]
    async fn api_prefixes_stay_a_json_boundary_with_an_embedded_bundle() {
        let (status, content_type, body) = get_raw("/graph/definitely-not-a-route").await;
        assert_eq!(status, StatusCode::NOT_FOUND, "API typos fail loud");
        assert!(
            content_type.starts_with("application/json"),
            "never the SPA shell for an API path: {content_type}"
        );
        let value: Value = serde_json::from_slice(&body).unwrap();
        assert!(
            value["tiers"]["semantic"]["available"].is_boolean(),
            "the JSON 404 carries the tiers block"
        );
    }
}

#[tokio::test]
async fn stale_tokens_and_foreign_hosts_are_rejected() {
    // DF-6: a token from a previous process generation (restart) is a
    // 401 — the canonical stale-token reload signal — and a foreign
    // Host header is a 403 on every path, /health included.
    let (_dir_a, state_a) = fixture_state();
    let stale_token = state_a.bearer.clone();
    drop(state_a);
    let (_dir_b, state_b) = fixture_state();
    let router = build_router(state_b);

    let (status, _) = get_with_token(router.clone(), "/status", Some(&stale_token)).await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "stale token after restart"
    );

    let response = router
        .clone()
        .oneshot(
            Request::get("/health")
                .header("host", "evil.example")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::FORBIDDEN,
        "DNS-rebinding guard"
    );

    // The served index.html carries the token bootstrap meta tag.
    let (_dir_c, state_c) = fixture_state();
    let token_c = state_c.bearer.clone();
    let router_c = build_router(state_c);
    let response = router_c
        .oneshot(
            Request::get("/")
                .header("host", "127.0.0.1")
                .header("authorization", format!("Bearer {token_c}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
        .await
        .unwrap();
    let html = String::from_utf8_lossy(&bytes);
    assert!(
        html.contains(&format!(
            r#"<meta name="vaultspec-token" content="{token_c}">"#
        )),
        "DF-6 token bootstrap injected"
    );
}

#[tokio::test]
async fn clean_browser_bootstrap_flow_works_end_to_end() {
    // DF-7 acceptance (team-lead's exact flow): from a clean browser
    // (no headers beyond Host), GET / renders the shell WITH the
    // injected token, and the first authenticated API call with that
    // token succeeds.
    let (_dir, state) = fixture_state();
    let router = build_router(state);

    let response = router
        .clone()
        .oneshot(
            Request::get("/")
                .header("host", "127.0.0.1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK, "shell is ungated (DF-7)");
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
        .await
        .unwrap();
    let html = String::from_utf8_lossy(&bytes);
    let token = html
        .split(r#"<meta name="vaultspec-token" content=""#)
        .nth(1)
        .and_then(|rest| rest.split('"').next())
        .expect("token meta tag present")
        .to_string();

    let (status, body) = get_with_token(router, "/status", Some(&token)).await;
    assert_eq!(status, StatusCode::OK, "injected token authenticates");
    assert_eq!(body["data"]["ok"], true);
}

#[test]
fn contract_route_inventory_matches_the_router() {
    for family in [
        "/map",
        "/graph/query",
        "/events",
        "/stream",
        "/authoring/status",
        "/search",
        "/ops/core/{verb}",
    ] {
        assert!(CONTRACT_ROUTES.contains(&family), "missing {family}");
    }
}

#[test]
fn every_router_route_is_in_the_contract_inventory() {
    // 2nd-order anti-drift guard (rag audit). `every_contract_route_requires_a_bearer`
    // binds the bearer gate to CONTRACT_ROUTES, but CONTRACT_ROUTES is itself
    // hand-maintained PARALLEL to `build_router`: a `.route()` added to the router
    // but forgotten in CONTRACT_ROUTES escapes the bearer guard entirely (it is
    // never iterated). The sibling `contract_route_inventory_matches_the_router`
    // only spot-checks a handful of families, so it cannot catch this. Bind the
    // inventory to the router SOURCE: every `.route("…")` path registered in
    // production code MUST appear in CONTRACT_ROUTES. Source-introspected because
    // axum exposes no route enumeration; scoped to pre-`#[cfg(test)]` code so the
    // test module's own string literals can never self-match.
    let src = include_str!("../lib.rs");
    let prod = src.split("#[cfg(test)]").next().unwrap_or(src);
    let marker = ".route(";
    for (idx, _) in prod.match_indices(marker) {
        let after = prod[idx + marker.len()..].trim_start();
        let Some(rest) = after.strip_prefix('"') else {
            continue;
        };
        let Some(end) = rest.find('"') else {
            continue;
        };
        let path = &rest[..end];
        assert!(
            CONTRACT_ROUTES.contains(&path),
            "router route `{path}` is registered in build_router but missing from \
                 CONTRACT_ROUTES — add it, or it escapes authentication inventory",
        );
    }
}

#[tokio::test]
async fn every_machine_bearer_contract_route_requires_a_bearer() {
    // Anti-drift guard (adversarial sweep): the bearer-gate allowlist
    // (`spa::API_PREFIXES`) is hand-maintained PARALLEL to the router, and it
    // had DRIFTED — `/file-tree`, `/pipeline`, `/dashboard-state`, `/history`,
    // `/prs`, `/issues` were registered but absent from the allowlist, so they
    // shipped served bearer-LESS. Bind the gate to the canonical route
    // inventory: EVERY machine-bearer `CONTRACT_ROUTES` path (except the
    // by-design ungated `/health` liveness ping and the explicitly classified
    // attach-control callbacks) MUST reject a tokenless request with 401. A new
    // route whose prefix is missing from API_PREFIXES fails here instead of
    // silently shipping ungated. The gate runs as middleware BEFORE method
    // routing, so a tokenless GET is rejected even on POST-only routes. The
    // excluded attach-control class has its own direct authentication proof
    // below; it is not removed from the canonical route inventory.
    let (_dir, state) = fixture_state();
    let router = build_router(state);
    for route in CONTRACT_ROUTES {
        if *route == "/health" || ATTACH_CONTROL_ROUTES.contains(route) {
            continue;
        }
        let path = route.replace("{id}", "x").replace("{verb}", "status");
        let (status, _) = get_with_token(router.clone(), &path, None).await;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "route `{route}` is served without a bearer — add its prefix to spa::API_PREFIXES",
        );
    }
}

#[tokio::test]
async fn every_attach_control_contract_route_rejects_other_bearers() {
    for route in ATTACH_CONTROL_ROUTES {
        assert!(
            CONTRACT_ROUTES.contains(route),
            "attach-control route `{route}` is missing from CONTRACT_ROUTES"
        );
    }

    let (_dir, state) = fixture_state();
    let machine_bearer = state.bearer.clone();
    let router = build_router(state);
    for route in ATTACH_CONTROL_ROUTES {
        for bearer in [None, Some(machine_bearer.as_str())] {
            let mut request = Request::post(*route)
                .header("host", "127.0.0.1")
                .header("content-type", "application/json");
            if let Some(bearer) = bearer {
                request = request.header("authorization", format!("Bearer {bearer}"));
            }
            let response = router
                .clone()
                .oneshot(request.body(Body::from("{}")).unwrap())
                .await
                .unwrap();
            assert_eq!(
                response.status(),
                StatusCode::UNAUTHORIZED,
                "attach-control route `{route}` accepted a missing or machine bearer"
            );
        }
    }
}
