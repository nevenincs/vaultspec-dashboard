//! `vaultspec serve` — the resident HTTP front door (engine-spec §7,
//! contract §1).
//!
//! Single origin on loopback: the engine serves (a) the GUI SPA static
//! bundle, (b) the query API, (c) the transparent ops proxy (`/ops/core/*`,
//! `/ops/rag/*`, whitelisted, envelopes verbatim), and (d) the multiplexed
//! SSE stream. `/health` is ungated; everything else is bearer-gated.
//! No WebSocket in v1 (D7.1).

pub mod app;
pub mod registry;
pub mod routes;

use std::sync::Arc;
use std::time::Duration;

use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post};
use axum::{Json, Router, middleware};
use serde_json::{Value, json};

/// Request-body ceiling (defense-in-depth, 2026-06-13). Every API body —
/// graph-query filters, search, discover — is small JSON; 1 MiB is orders of
/// magnitude of headroom while bounding a pathological body (and the response
/// amplification a huge filter would drive). A 413 still rides the shared
/// envelope via `ensure_tiers_envelope`. The real boundary stays loopback.
const MAX_REQUEST_BODY: usize = 1024 * 1024;

use app::AppState;

/// Default port for the resident service. `--port` with fail-loud
/// conflicts is a contract requirement (R2).
pub const DEFAULT_PORT: u16 = 8767;

/// Route inventory committed by the contract, recorded here so the
/// implementation and the contract drift loudly rather than silently.
pub const CONTRACT_ROUTES: &[&str] = &[
    "/health",
    "/map",
    "/workspaces",
    "/vault-tree",
    "/file-tree",
    "/pipeline",
    "/graph/query",
    "/graph/embeddings",
    "/graph/asof",
    "/graph/diff",
    "/graph/lineage",
    "/filters",
    "/nodes/{id}",
    "/nodes/{id}/content",
    "/nodes/{id}/neighbors",
    "/nodes/{id}/evidence",
    "/nodes/{id}/discover",
    "/nodes/{id}/plan-interior",
    "/events",
    "/status",
    "/stream",
    "/search",
    "/ops/core/{verb}",
    "/ops/core/{verb}/write",
    "/ops/rag/{verb}",
    "/ops/git/{verb}",
    "/session",
    "/settings",
];

async fn health() -> Json<Value> {
    // Liveness ping; enveloped like everything else (L1) with a static
    // all-available tiers block (no per-ping rag discovery on the
    // ungated path).
    Json(json!({
        "data": {"ok": true, "service": "vaultspec", "status": "running"},
        "tiers": serde_json::to_value(engine_query::envelope::tiers_block(&[]))
            .expect("tiers serialize"),
    }))
}

/// Assemble the full single-origin router (contract §1).
pub fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/map", get(routes::query::map))
        // Workspace registry enumeration (dashboard-workspace-registry ADR):
        // the registered project roots with reachability, through the shared
        // envelope. Registry mutation rides /session (config), never here.
        .route("/workspaces", get(routes::registry::list_workspaces))
        .route("/vault-tree", get(routes::query::vault_tree))
        // Read-only codebase file-tree listing (dashboard-code-tree ADR): one
        // bounded, ignore-aware directory level per call, metadata only, through
        // the shared envelope so every response carries the tiers block.
        .route("/file-tree", get(routes::file_tree::file_tree))
        // In-flight pipeline projection (dashboard-pipeline-wire W02): active
        // plans + in-flight ADRs in scope, through the shared envelope.
        .route("/pipeline", get(routes::query::pipeline))
        .route("/graph/query", post(routes::query::graph_query_route))
        // The dedicated bounded embedding route (graph-semantic-embeddings ADR
        // D2): rag's stored dense vectors for the served document node set,
        // tiers-gated, generation-stamped, NEVER inline on /graph/query.
        .route("/graph/embeddings", get(routes::query::graph_embeddings))
        .route("/graph/asof", get(routes::temporal::graph_asof))
        .route("/graph/diff", get(routes::temporal::graph_diff))
        // Bounded temporal-lineage projection (dashboard-timeline ADR, W01.P02):
        // dated nodes in a [from, to] range together with the self-consistent
        // edges among them, through the shared envelope (tiers on success and
        // error), bounded by the document node ceiling, semantic present-only.
        .route("/graph/lineage", get(routes::temporal::graph_lineage))
        .route("/filters", get(routes::query::filters))
        .route("/nodes/{id}", get(routes::query::node_detail))
        // Read-only, bounded content-fetch (review-rail-viewers ADR): the ONE
        // viewer backend — document/file bytes keyed on the stable node id,
        // byte-capped with an honest `truncated` block, tiers on success/error.
        // The listing routes stay metadata-only.
        .route("/nodes/{id}/content", get(routes::content::node_content))
        .route("/nodes/{id}/neighbors", get(routes::query::node_neighbors))
        .route("/nodes/{id}/evidence", get(routes::query::node_evidence))
        .route("/nodes/{id}/discover", post(routes::query::node_discover))
        // Bounded plan-container interior (dashboard-pipeline-wire W03): the
        // wave/phase/step tree of a plan node, under a node ceiling.
        .route(
            "/nodes/{id}/plan-interior",
            get(routes::query::node_plan_interior),
        )
        .route("/events", get(routes::temporal::events))
        // Bounded, read-only recent-commit history with subjects (status-overview
        // ADR): the last N commits as {hash, short_hash, subject, ts, node_ids},
        // newest-first, capped at MAX_HISTORY_LIMIT, tiers-bearing.
        .route("/history", get(routes::history::history))
        .route("/status", get(routes::stream::status))
        .route("/stream", get(routes::stream::stream))
        .route("/search", post(routes::ops::search))
        .route("/ops/core/{verb}", post(routes::ops::ops_core))
        // The core WRITE channel (W02): forward a whitelisted
        // `vaultspec-core vault {set-body,set-frontmatter,edit}` verb through the
        // bounded stdin-writing sibling runner so the editor can save documents.
        // Read-and-infer: the engine validates, bounds, streams the body to the
        // OWNING sibling's stdin, and forwards its envelope verbatim — a
        // conflict/refusal (`status:"failed"`) and a success both ride one 200.
        .route("/ops/core/{verb}/write", post(routes::ops::ops_core_write))
        // The brokered rag control plane (rag-control-plane ADR D2): GET for the
        // read verbs (service-state, jobs, watcher, projects, readiness, logs,
        // metrics), POST for the control verbs (reindex trigger, watcher
        // config, project-evict, quality) over rag's HTTP service, plus the
        // process-lifecycle verbs (server start/stop/status/doctor/install) on
        // the bounded CLI runner. One namespace, tiers-honest, rag envelope
        // verbatim.
        .route(
            "/ops/rag/{verb}",
            post(routes::ops::ops_rag).get(routes::ops::ops_rag_get),
        )
        // Read-only git pass-through (dashboard-pipeline-wire W04): porcelain
        // status, numstat, unified diff — whitelisted, no mutating verb.
        .route("/ops/git/{verb}", post(routes::ops::ops_git))
        // Top-level session + settings surface (user-state-persistence W03):
        // the durable "where am I" session and user settings, both through the
        // shared envelope so every response carries the tiers block.
        .route(
            "/session",
            get(routes::session::get_session).put(routes::session::put_session),
        )
        .route(
            "/settings",
            get(routes::session::get_settings).put(routes::session::put_settings),
        )
        // The engine-owned settings schema registry (dashboard-settings): the
        // single source of truth the client renders controls and defaults from.
        .route(
            "/settings/schema",
            get(routes::session::get_settings_schema),
        )
        .fallback(get(routes::spa::spa_fallback))
        // Panic containment (robustness H2, 2026-06-13): a handler panic must
        // become a contained 500, never a dropped connection AND — critically
        // — never a poisoned lock that cascades into a permanent outage. The
        // layer unwinds the panic at the service boundary so the worker keeps
        // serving. Placed INNER to the tiers guard: the default 500 body
        // carries no tiers block, so `ensure_tiers_envelope` (outermost)
        // re-envelopes it with the truthful per-tier degradation. Inner to the
        // gate so a panic inside the gate is caught too. Paired with
        // poison-recovery lock access (`unwrap_or_else(|e| e.into_inner())`):
        // the catcher stops the panic and the recovery makes any guard that
        // WAS held at panic time still usable.
        .layer(tower_http::catch_panic::CatchPanicLayer::new())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            app::bearer_gate,
        ))
        // Request-body ceiling (defense-in-depth): bound pathological bodies
        // and the response amplification a huge filter would drive. Applied
        // INNER to the tiers guard so a 413 still gets the envelope.
        .layer(DefaultBodyLimit::max(MAX_REQUEST_BODY))
        // OUTERMOST: wraps the gate AND the body-limit, so the tiers block
        // rides EVERY error response — extractor rejections, the bare
        // auth/Host 401/403, and a 413 included (contract §2, codified
        // tiers-block rule).
        .layer(middleware::from_fn_with_state(
            state.clone(),
            app::ensure_tiers_envelope,
        ))
        .with_state(state)
}

/// Run the resident service on loopback: initial index, watcher-driven
/// rebuild-and-swap (302/303), heartbeat on the discovery file.
pub async fn serve(port: u16, scope: Option<String>) -> std::io::Result<()> {
    // Crash visibility (dogfood DF-4): a panic anywhere must leave a
    // trace, never a silent death. The hook writes a crash log under the
    // engine data dir and stderr before unwinding.
    //
    // `--scope` selects the served worktree explicitly; without it the
    // launch directory is the implicit scope (both resolve to their
    // containing worktree below, exactly like every one-shot verb).
    let cwd = match scope {
        Some(path) => {
            let p = std::path::PathBuf::from(&path);
            if !p.is_dir() {
                return Err(std::io::Error::other(format!(
                    "--scope `{path}` is not a usable worktree (must be an existing \
                     directory inside a git workspace)"
                )));
            }
            p
        }
        None => std::env::current_dir()?,
    };
    // Resolve like every other verb (dogfood DF-2, D2.1): any launch
    // directory inside the workspace resolves to its containing worktree.
    let workspace = ingest_git::workspace::Workspace::discover(&cwd)
        .map_err(|e| std::io::Error::other(format!("not inside a git workspace: {e}")))?;
    // Path-only resolution (worktree-enumeration sweep): the launch root is
    // matched by path, so list roots cheaply rather than inspecting every
    // worktree at serve boot.
    let roots = ingest_git::worktrees::list_roots(&workspace)
        .map_err(|e| std::io::Error::other(e.to_string()))?;
    let cwd_clean = cwd.to_string_lossy().replace('\\', "/");
    let root = roots
        .into_iter()
        .find(|p| {
            let wp = p.to_string_lossy().replace('\\', "/");
            let wp = wp.strip_prefix("//?/").unwrap_or(&wp).to_string();
            let cw = cwd_clean.strip_prefix("//?/").unwrap_or(&cwd_clean);
            cw == wp || cw.starts_with(&format!("{wp}/"))
        })
        .unwrap_or(cwd);
    // Strip Windows extended-length prefixes so the served root compares
    // cleanly with client-supplied scope strings.
    let root = {
        let cleaned = root.to_string_lossy().replace('\\', "/");
        std::path::PathBuf::from(cleaned.strip_prefix("//?/").unwrap_or(&cleaned))
    };
    if !root.join(".vault").is_dir() {
        return Err(std::io::Error::other(format!(
            "no .vault corpus under {} - vaultspec serve runs inside a \
             vaultspec-managed worktree",
            root.display()
        )));
    }

    let crash_log = engine_store::engine_data_dir(&root.join(".vault")).join("crash.log");
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let line = format!(
            "[{}] vaultspec serve panic: {info}\n",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        );
        if let Some(parent) = crash_log.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&crash_log)
            .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
        eprintln!("{line}");
        default_hook(info);
    }));

    // Build the workspace-level state. This opens the SHARED user-state handle
    // once, eagerly builds the launch scope's cell into the registry (cold
    // initial index, the same pipeline the one-shot CLI runs, D2.4), spawns
    // that cell's watcher on its own clock (W02.P04.S13), and pins it as the
    // active scope. We run inside the tokio runtime, so the watcher's rebuild
    // task spawns here.
    let state = app::build_state(root.clone());

    // Restore the persisted active scope through the shared user-state handle
    // (W02.P03.S11): the workspace key is the launch root's token, the stored
    // active scope is a worktree token. Restore it only if it still names a
    // selectable vault-bearing worktree; otherwise fall back to the launch
    // worktree. Persist the resolved active scope back so a first run seeds it.
    let workspace_key = routes::scope_token(&state.workspace_root);
    let launch_token = workspace_key.clone();
    let restored = {
        let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
        us.active_scope(&workspace_key).ok().flatten()
    }
    .filter(|token| registry::validate_scope_token(&state, token).is_ok());
    let active_token = match restored {
        Some(token) if token != launch_token => {
            // A different, still-valid persisted scope: warm it and make it
            // active so reload restores "where I was".
            if registry::get_or_build(&state, &token).is_ok() {
                *state
                    .active_scope
                    .write()
                    .unwrap_or_else(|e| e.into_inner()) = token.clone();
                token
            } else {
                launch_token.clone()
            }
        }
        _ => launch_token.clone(),
    };
    {
        let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
        let _ = us.set_active_scope(&workspace_key, &active_token, app::now_ms());
    }

    // Auto-register the launch workspace as the first registry root
    // (dashboard-workspace-registry ADR, P01.S03), so the single-project
    // experience is unchanged. The stable workspace id is the canonical git
    // common dir (the same identity-bearing derivation the rest of the contract
    // uses), discovered READ-ONLY from the launch root; the label defaults to the
    // launch root's final path component, the path is the launch token. This
    // RECORDS the launch root only; it never mutates the repository. Best-effort:
    // a discovery or store failure degrades to "no registry seeded" and the rail
    // renders the launch workspace as the header fallback. The active workspace
    // is seeded to the launch root when none is selected yet.
    {
        let workspace_id = ingest_git::workspace::Workspace::discover(&state.workspace_root)
            .ok()
            .map(|ws| routes::scope_token(&ws.common_dir));
        if let Some(workspace_id) = workspace_id {
            let label = state
                .workspace_root
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| launch_token.clone());
            let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
            let _ = us.auto_register_launch(&workspace_id, &label, &launch_token, app::now_ms());
            if us.active_workspace().ok().flatten().is_none() {
                let _ = us.set_active_workspace(&workspace_id, app::now_ms());
            }
        }
    }

    // Loopback-only bind FIRST (R2: a port conflict fails loud here) so an
    // OS-assigned ephemeral port (`--port 0`) is resolved to the ACTUAL bound
    // port before discovery is written. service.json then advertises the real
    // port, letting tests (and any caller) bind 0 and avoid fixed-port
    // collisions on concurrent runs.
    let listener =
        tokio::net::TcpListener::bind(std::net::SocketAddr::from(([127, 0, 0, 1], port))).await?;
    let port = listener.local_addr()?.port();

    // Discovery + heartbeat (contract §1), advertising the real bound port.
    app::write_service_json(&state, port)?;

    // Abort-on-drop guard for the heartbeat task (B9, resource-hardening): the
    // loop holds a cloned `Arc<AppState>` and runs forever. Without an abort
    // handle it was a detached task that survives cancellation of this `serve`
    // future (e.g. a test that drops the serve task), keeping the whole
    // AppState — its locks and every warm ScopeCell — alive. The guard aborts
    // the task whether `serve` returns normally or is cancelled.
    struct AbortOnDrop(tokio::task::JoinHandle<()>);
    impl Drop for AbortOnDrop {
        fn drop(&mut self) {
            self.0.abort();
        }
    }
    let _heartbeat = {
        let state = state.clone();
        AbortOnDrop(tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(15)).await;
                let _ = app::write_service_json(&state, port);
            }
        }))
    };

    println!(
        "vaultspec serve: listening on http://127.0.0.1:{port} (bearer token in service.json)"
    );
    axum::serve(listener, build_router(state))
        .await
        .map_err(std::io::Error::other)
}

#[cfg(test)]
mod tests {
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

    async fn get_with_token(
        router: Router,
        path: &str,
        token: Option<&str>,
    ) -> (StatusCode, Value) {
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

    #[tokio::test]
    async fn graph_asof_echoes_the_resolved_sha_and_interpretation_for_both_token_forms() {
        // ADD-901: /graph/asof MUST echo the chosen interpretation (revision
        // vs ms-timestamp) AND the resolved 40-char sha, for BOTH a revision
        // token (`HEAD`) and a millisecond-timestamp token.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-b", "main", "."]);
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::write(
            root.join(".vault/plan/2026-06-12-asof-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#asof'\n---\n\nbody\n",
        )
        .unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "fixture"]);

        let head_sha = {
            let out = std::process::Command::new("git")
                .current_dir(root)
                .args(["rev-parse", "HEAD"])
                .output()
                .unwrap();
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        };

        // build_state warms + indexes the launch scope's cell eagerly.
        let state = app::build_state(root.to_path_buf());
        let token = state.bearer.clone();
        let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
        let router = build_router(state);

        // Revision token: resolves to HEAD's sha, interpretation `revision`.
        let (status, body) = get_with_token(
            router.clone(),
            &format!("/graph/asof?scope={}&t=HEAD", urlencode(&scope)),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "revision token: {body}");
        assert_eq!(body["data"]["resolved_sha"], head_sha, "echoes HEAD sha");
        assert_eq!(body["data"]["interpretation"], "revision");
        assert_eq!(body["data"]["t"], "HEAD", "raw t echo preserved");

        // Millisecond-timestamp token: a far-future epoch-ms resolves to the
        // latest commit (HEAD), interpretation `timestamp`.
        let future_ms = (app::now_ms() + 1_000_000).to_string();
        let (status, body) = get_with_token(
            router,
            &format!("/graph/asof?scope={}&t={future_ms}", urlencode(&scope)),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "timestamp token: {body}");
        assert_eq!(
            body["data"]["resolved_sha"], head_sha,
            "epoch-ms resolves to the latest commit's sha"
        );
        assert_eq!(body["data"]["interpretation"], "timestamp");
    }

    #[tokio::test]
    async fn history_serves_bounded_subject_bearing_commits_newest_first() {
        // status-overview ADR: GET /history?scope=&limit=N returns the last N
        // commits as {hash, short_hash, subject, ts, node_ids}, newest-first,
        // enveloped with the tiers block, bounded by a hard ceiling. The
        // subject is the one new datum — the commit message's first line — that
        // /events never carried.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-b", "main", "."]);
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();

        // Commit 1: a vault doc -> correlates to a doc node id.
        std::fs::write(
            root.join(".vault/plan/2026-06-16-hist-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#hist'\n---\n\nbody\n",
        )
        .unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "feat: add the hist plan"]);

        // Commit 2: a plain edit -> the newest commit.
        std::fs::write(root.join("README.md"), "readme\n").unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "docs: add a readme"]);

        let head_sha = {
            let out = std::process::Command::new("git")
                .current_dir(root)
                .args(["rev-parse", "HEAD"])
                .output()
                .unwrap();
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        };

        let state = app::build_state(root.to_path_buf());
        let token = state.bearer.clone();
        let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
        let router = build_router(state);

        let (status, body) = get_with_token(
            router.clone(),
            &format!("/history?scope={}", urlencode(&scope)),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "history ok: {body}");

        // Every response carries the tiers block (shared envelope).
        assert!(body["tiers"].is_object(), "tiers block present: {body}");

        let commits = body["data"]["commits"].as_array().expect("commits array");
        assert_eq!(commits.len(), 2, "both commits served");

        // Newest-first: the README commit is first, with its subject line.
        assert_eq!(commits[0]["hash"], head_sha, "newest commit first");
        assert_eq!(
            commits[0]["short_hash"],
            head_sha.chars().take(8).collect::<String>()
        );
        assert_eq!(commits[0]["subject"], "docs: add a readme");
        assert!(
            commits[0]["ts"].as_i64().unwrap() > 1_000_000_000_000,
            "ms ts"
        );

        // The older vault-touching commit carries its subject AND correlates to
        // the document node (the commit→doc cross-link the rail uses).
        assert_eq!(commits[1]["subject"], "feat: add the hist plan");
        let node_ids: Vec<String> = commits[1]["node_ids"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap().to_string())
            .collect();
        assert!(
            node_ids.iter().any(|id| id.starts_with("commit:")),
            "the commit's own node id is present: {node_ids:?}"
        );
        assert!(
            node_ids.contains(&"doc:2026-06-16-hist-plan".to_string()),
            "the touched vault doc is correlated: {node_ids:?}"
        );

        // No truncation when the request is within the ceiling.
        assert!(body["data"]["truncated"].is_null(), "no truncation: {body}");
    }

    #[tokio::test]
    async fn history_clamps_an_over_ceiling_limit_and_reports_it() {
        // bounded-by-default / graph-queries-are-bounded-by-default: a request
        // above MAX_HISTORY_LIMIT is clamped to the ceiling and the clamp is
        // stated in the truncated block, never an unbounded walk.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-b", "main", "."]);
        std::fs::write(root.join("a.txt"), "a\n").unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "one"]);

        let state = app::build_state(root.to_path_buf());
        let token = state.bearer.clone();
        let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
        let router = build_router(state);

        let over = routes::history::MAX_HISTORY_LIMIT + 50;
        let (status, body) = get_with_token(
            router,
            &format!("/history?scope={}&limit={over}", urlencode(&scope)),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "history ok: {body}");
        assert_eq!(
            body["data"]["truncated"]["requested"].as_u64().unwrap() as usize,
            over,
            "the over-ceiling request is reported"
        );
        // Only one commit exists, so the returned count reflects the real walk,
        // not the ceiling — but the clamp is still honestly reported.
        assert_eq!(body["data"]["commits"].as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn history_unknown_scope_is_a_tiered_400() {
        // A bad scope 400s honestly with the tiers block (shared envelope),
        // distinguishable from a backend-down degradation.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-b", "main", "."]);
        std::fs::write(root.join("a.txt"), "a\n").unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "one"]);

        let state = app::build_state(root.to_path_buf());
        let token = state.bearer.clone();
        let router = build_router(state);

        let (status, body) =
            get_with_token(router, "/history?scope=/no/such/worktree", Some(&token)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "bad scope 400: {body}");
        assert!(body["tiers"].is_object(), "error carries tiers: {body}");
    }

    #[tokio::test]
    async fn graph_query_as_of_echoes_the_resolved_sha_and_interpretation() {
        // M-F1 / ADD-901: the POST /graph/query as_of path must echo the same
        // resolution facts /graph/asof carries — the 40-char resolved_sha and
        // the chosen interpretation — for BOTH a millisecond-timestamp token
        // and a revision token. The present (no-as_of) view echoes neither
        // (null), so the additive fields never lie about resolution.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-b", "main", "."]);
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::write(
            root.join(".vault/plan/2026-06-12-q-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#q'\n---\n\nbody\n",
        )
        .unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "fixture"]);

        let head_sha = {
            let out = std::process::Command::new("git")
                .current_dir(root)
                .args(["rev-parse", "HEAD"])
                .output()
                .unwrap();
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        };

        // build_state warms + indexes the launch scope's cell eagerly.
        let state = app::build_state(root.to_path_buf());
        let token = state.bearer.clone();
        let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
        let router = build_router(state);

        // Revision token (`HEAD`): resolves to HEAD's sha, interpretation
        // `revision`; the raw as_of echo is preserved.
        let (status, body) = post_json_with_token(
            router.clone(),
            "/graph/query",
            json!({"scope": scope, "as_of": "HEAD"}),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "revision as_of: {body}");
        assert_eq!(
            body["data"]["resolved_sha"], head_sha,
            "echoes HEAD sha for a revision as_of"
        );
        assert_eq!(body["data"]["interpretation"], "revision");
        assert_eq!(body["data"]["as_of"], "HEAD", "raw as_of echo preserved");

        // Millisecond-timestamp token: a far-future epoch-ms resolves to the
        // latest commit (HEAD), interpretation `timestamp`.
        let future_ms = (app::now_ms() + 1_000_000).to_string();
        let (status, body) = post_json_with_token(
            router.clone(),
            "/graph/query",
            json!({"scope": scope, "as_of": future_ms.clone()}),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "timestamp as_of: {body}");
        assert_eq!(
            body["data"]["resolved_sha"], head_sha,
            "epoch-ms as_of resolves to the latest commit's sha"
        );
        assert_eq!(body["data"]["interpretation"], "timestamp");
        assert_eq!(body["data"]["as_of"], future_ms, "raw as_of echo preserved");

        // Present view (no as_of): both fields are null — there is no token to
        // resolve, and the additive fields must not invent a resolution.
        let (status, body) = post_json_with_token(
            router,
            "/graph/query",
            json!({"scope": scope}),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "present view: {body}");
        assert!(
            body["data"]["resolved_sha"].is_null(),
            "no resolved_sha without as_of"
        );
        assert!(
            body["data"]["interpretation"].is_null(),
            "no interpretation without as_of"
        );
    }

    #[tokio::test]
    async fn graph_lineage_carries_the_tiers_block_on_the_success_envelope() {
        // W01.P02.S14: GET /graph/lineage returns the dated nodes + the arcs
        // among them through the SHARED envelope, so the per-tier tiers block
        // rides the success body. Semantic is reported present-only (excluded
        // from the range lineage) while declared stays truthful per scope.
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
        std::fs::create_dir_all(dir.path().join(".vault/adr")).unwrap();
        // Two dated, lane-owning documents in range.
        std::fs::write(
            dir.path().join(".vault/adr/2026-06-12-lin-adr.md"),
            "---\ntags:\n  - '#adr'\n  - '#lin'\ndate: '2026-06-12'\n---\n\n# `lin` adr\n\nbody\n",
        )
        .unwrap();
        std::fs::write(
            dir.path().join(".vault/plan/2026-06-13-lin-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#lin'\ndate: '2026-06-13'\n---\n\n# `lin` plan\n\nbody\n",
        )
        .unwrap();
        let state = app::build_state(dir.path().to_path_buf());
        let token = state.bearer.clone();
        let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
        let router = build_router(state);

        let (status, body) = get_with_token(
            router,
            &format!(
                "/graph/lineage?scope={}&from=2026-06-01&to=2026-06-30",
                urlencode(&scope)
            ),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "lineage success: {body}");
        // The dated nodes ride the data payload.
        assert!(
            body["data"]["nodes"].is_array(),
            "the lineage nodes ride the data payload"
        );
        assert!(body["data"]["arcs"].is_array(), "the arcs ride the payload");
        // Tiers block on success, built through the shared envelope.
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "the success envelope carries the tiers block"
        );
        assert_eq!(
            body["tiers"]["semantic"]["available"], false,
            "semantic is present-only, excluded from the range lineage"
        );
        assert!(
            body["tiers"]["declared"]["available"].is_boolean(),
            "declared tier reported truthfully per scope"
        );
    }

    #[tokio::test]
    async fn graph_lineage_unknown_scope_400s_with_the_tiers_block() {
        // W01.P02.S15: the lineage ERROR path (an unknown scope) also returns
        // through the shared envelope, so the tiers block rides the error body —
        // a healthy-looking error never ships without degradation truth.
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let router = build_router(state);

        let (status, body) = get_with_token(
            router,
            "/graph/lineage?scope=/nowhere/at/all&from=2026-06-01&to=2026-06-30",
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(body["error"].is_string(), "honest error message");
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "the 400 still carries the tiers block"
        );
    }

    #[tokio::test]
    async fn graph_lineage_inverted_range_and_bad_filter_400_with_the_tiers_block() {
        // W01.P02.S11/S15: a client-error on a VALID scope (inverted range or a
        // malformed/unknown-facet filter) also rides the shared error envelope.
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
        let router = build_router(state);

        // Inverted range: from > to is a 400, not a silently-empty slice.
        let (status, body) = get_with_token(
            router.clone(),
            &format!(
                "/graph/lineage?scope={}&from=2026-06-30&to=2026-06-01",
                urlencode(&scope)
            ),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "inverted range: {body}");
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "the inverted-range 400 carries the tiers block"
        );

        // An unknown filter facet is rejected by the projection's validation and
        // shaped through the shared envelope. The JSON value is fully
        // percent-encoded so the query string is a valid URI.
        let bad_filter = percent_encode(r#"{"tiers":{"not-a-tier":true}}"#);
        let (status, body) = get_with_token(
            router,
            &format!(
                "/graph/lineage?scope={}&filter={bad_filter}",
                urlencode(&scope)
            ),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "bad filter: {body}");
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "the bad-filter 400 carries the tiers block"
        );
    }

    #[tokio::test]
    async fn graph_lineage_asof_serves_a_bounded_slice_with_the_tiers_block_and_resolved_sha() {
        // dashboard-timeline ADR deferred fast-follow: GET /graph/lineage with a
        // `t` token serves the BLOB-TRUE lineage as of T — the historical graph
        // resolved from the git object DB, projected by the same bounded lineage
        // projection — through the SHARED envelope. The as-of tiers block rides
        // the success body (semantic present-only/excluded, structural stale-at-T)
        // and the resolved sha + interpretation are echoed, matching /graph/asof.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-b", "main", "."]);
        std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::write(
            root.join(".vault/adr/2026-06-12-asoflin-adr.md"),
            "---\ntags:\n  - '#adr'\n  - '#asoflin'\ndate: '2026-06-12'\n---\n\n# `asoflin` adr\n\nbody\n",
        )
        .unwrap();
        std::fs::write(
            root.join(".vault/plan/2026-06-13-asoflin-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#asoflin'\ndate: '2026-06-13'\n---\n\n# `asoflin` plan\n\nbody\n",
        )
        .unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "fixture"]);

        let head_sha = {
            let out = std::process::Command::new("git")
                .current_dir(root)
                .args(["rev-parse", "HEAD"])
                .output()
                .unwrap();
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        };

        let state = app::build_state(root.to_path_buf());
        let token = state.bearer.clone();
        let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
        let router = build_router(state);

        let (status, body) = get_with_token(
            router,
            &format!(
                "/graph/lineage?scope={}&from=2026-06-01&to=2026-06-30&t=HEAD",
                urlencode(&scope)
            ),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "as-of lineage success: {body}");
        assert!(
            body["data"]["nodes"].is_array(),
            "the as-of lineage nodes ride the data payload"
        );
        assert!(
            body["data"]["arcs"].is_array(),
            "the as-of arcs ride the payload"
        );
        // The historical graph resolved from the git object DB is non-empty: the
        // two committed, in-range, lane-owning documents are projected.
        assert_eq!(
            body["data"]["nodes"].as_array().unwrap().len(),
            2,
            "the blob-true as-of slice projects the committed documents"
        );
        // Resolved-sha + interpretation echoed, matching /graph/asof (ADD-901).
        assert_eq!(
            body["data"]["resolved_sha"], head_sha,
            "the as-of lineage echoes the resolved HEAD sha"
        );
        assert_eq!(body["data"]["interpretation"], "revision");
        // The as-of tiers block rides the success envelope: semantic excluded
        // (present-only) and structural reported (degraded-to-stale-at-T).
        assert_eq!(
            body["tiers"]["semantic"]["available"], false,
            "semantic is present-only, excluded from the historical lineage"
        );
        assert!(
            body["tiers"]["structural"]["reason"].is_string(),
            "structural carries the stale-at-T reason in the as-of view"
        );
    }

    #[tokio::test]
    async fn graph_lineage_asof_unresolvable_token_400s_with_the_tiers_block() {
        // The as-of lineage ERROR path: an unresolvable `t` token is a client
        // error shaped through the shared revision_error helper, so the error
        // body carries the tiers block — a healthy-looking error never ships
        // without degradation truth.
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
        let router = build_router(state);

        let (status, body) = get_with_token(
            router,
            &format!(
                "/graph/lineage?scope={}&t=not-a-real-ref-or-sha",
                urlencode(&scope)
            ),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "unresolvable t: {body}");
        assert!(body["error"].is_string(), "honest revision error message");
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "the unresolvable-t 400 still carries the tiers block"
        );
    }

    #[tokio::test]
    async fn graph_lineage_present_view_echoes_null_resolution() {
        // The no-`t` (present) path is unchanged and echoes neither resolution
        // field — the additive fields never invent a resolution that did not
        // happen (mirrors the graph_query present branch's null echoes).
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".vault/adr")).unwrap();
        std::fs::write(
            dir.path().join(".vault/adr/2026-06-12-presentlin-adr.md"),
            "---\ntags:\n  - '#adr'\n  - '#presentlin'\ndate: '2026-06-12'\n---\n\n# `presentlin` adr\n\nbody\n",
        )
        .unwrap();
        let state = app::build_state(dir.path().to_path_buf());
        let token = state.bearer.clone();
        let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
        let router = build_router(state);

        let (status, body) = get_with_token(
            router,
            &format!(
                "/graph/lineage?scope={}&from=2026-06-01&to=2026-06-30",
                urlencode(&scope)
            ),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "present lineage: {body}");
        assert!(
            body["data"]["resolved_sha"].is_null(),
            "no resolved_sha without t"
        );
        assert!(
            body["data"]["interpretation"].is_null(),
            "no interpretation without t"
        );
    }

    #[tokio::test]
    async fn health_is_ungated_everything_else_is_bearer_gated() {
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let router = build_router(state);

        let (status, _) = get_with_token(router.clone(), "/health", None).await;
        assert_eq!(status, StatusCode::OK, "/health ungated");

        let (status, _) = get_with_token(router.clone(), "/status", None).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED, "gated without bearer");

        let (status, body) = get_with_token(router, "/status", Some(&token)).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            body["data"]["watcher"]["mode"], "starting",
            "no watcher in test state"
        );
        assert!(body["tiers"]["semantic"]["available"].is_boolean());
    }

    #[tokio::test]
    async fn node_family_serves_from_the_live_graph() {
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let router = build_router(state);
        let (status, body) = get_with_token(
            router.clone(),
            "/nodes/doc:2026-06-12-srv-plan",
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            body["data"]["detail"]["bundle"]["node"]["id"],
            "doc:2026-06-12-srv-plan"
        );

        let (status, _) = get_with_token(router, "/nodes/doc:nope", Some(&token)).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "unknown node: truthful 404");
    }

    #[tokio::test]
    async fn scope_validation_rejects_unserved_scopes() {
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let served = state.workspace_root.to_string_lossy().replace('\\', "/");
        let router = build_router(state);
        let (status, _) = get_with_token(
            router.clone(),
            "/filters?scope=/somewhere/else",
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        let (status, body) = get_with_token(
            router,
            &format!("/filters?scope={}", urlencode(&served)),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert!(body["data"]["vocabulary"]["tiers"].is_array());
    }

    #[tokio::test]
    async fn graph_embeddings_carries_generation_and_degrades_semantic_when_rag_is_down() {
        // graph-semantic-embeddings ADR D7/D8: /graph/embeddings rides the shared
        // envelope so the tiers block is carried on every response, stamps the
        // graph generation it was read at, and — with rag/Qdrant down in this
        // test environment — reports the semantic tier Unavailable and returns NO
        // vectors (honest degradation, never a bare error). The bad-scope path
        // still 400s honestly with the tiers block attached.
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let served = state.workspace_root.to_string_lossy().replace('\\', "/");
        let router = build_router(state);

        // Unknown scope: a tiered 400 (the bad-scope honesty path).
        let (status, _) = get_with_token(
            router.clone(),
            "/graph/embeddings?scope=/nowhere",
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);

        // Served scope, rag absent: 200 with an empty embedding set, the
        // generation stamp, and the semantic tier reported Unavailable.
        let (status, body) = get_with_token(
            router,
            &format!("/graph/embeddings?scope={}", urlencode(&served)),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        // The shared envelope carries the tiers block (every-wire-response rule);
        // semantic is Unavailable because rag/Qdrant is not running here (D7).
        assert_eq!(body["tiers"]["semantic"]["available"], Value::Bool(false));
        // No vectors served while rag is down — honest absence, not an error.
        assert_eq!(
            body["data"]["embeddings"].as_array().map(|a| a.len()),
            Some(0)
        );
        // The generation stamp the client caches per generation (D8) is present
        // and is an integer (read off the cell's generation counter).
        assert!(body["data"]["generation"].is_u64());
        // truncated is null on a degraded read (no bound fired).
        assert_eq!(body["data"]["truncated"], Value::Null);
    }

    #[tokio::test]
    async fn pipeline_returns_active_artifacts_with_the_tiers_block_on_success() {
        // W02.P05.S25: /pipeline returns the in-flight artifacts (active plan +
        // proposed ADR) with the tiers block on success. A complete plan and a
        // rejected ADR must be excluded — the projection is bounded to active.
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
        std::fs::create_dir_all(dir.path().join(".vault/adr")).unwrap();
        // Active plan (one open step), tier L3.
        std::fs::write(
            dir.path().join(".vault/plan/2026-06-14-w-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#w'\ntier: L3\n---\n\n- [x] `S01` - did it.\n- [ ] `S02` - todo.\n",
        )
        .unwrap();
        // Complete plan — excluded.
        std::fs::write(
            dir.path().join(".vault/plan/2026-06-14-done-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#w'\ntier: L1\n---\n\n- [x] `S01` - done.\n",
        )
        .unwrap();
        // Proposed ADR — included.
        std::fs::write(
            dir.path().join(".vault/adr/2026-06-14-w-adr.md"),
            "---\ntags:\n  - '#adr'\n  - '#w'\n---\n\n# `w` adr: `t` | (**status:** `proposed`)\n\nbody\n",
        )
        .unwrap();
        // Rejected ADR — excluded.
        std::fs::write(
            dir.path().join(".vault/adr/2026-06-14-no-adr.md"),
            "---\ntags:\n  - '#adr'\n  - '#w'\n---\n\n# `no` adr: `t` | (**status:** `rejected`)\n\nbody\n",
        )
        .unwrap();
        let state = app::build_state(dir.path().to_path_buf());
        let token = state.bearer.clone();
        let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
        let router = build_router(state);

        let (status, body) = get_with_token(
            router,
            &format!("/pipeline?scope={}", urlencode(&scope)),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "pipeline success: {body}");
        let artifacts = body["data"]["artifacts"].as_array().unwrap();
        let stems: Vec<&str> = artifacts
            .iter()
            .map(|a| a["stem"].as_str().unwrap())
            .collect();
        assert_eq!(
            stems,
            vec!["2026-06-14-w-adr", "2026-06-14-w-plan"],
            "active plan + proposed ADR only, sorted by stable id"
        );
        // The active plan carries tier, progress, and the execute phase.
        let plan = artifacts
            .iter()
            .find(|a| a["stem"] == "2026-06-14-w-plan")
            .unwrap();
        assert_eq!(plan["tier"], "L3");
        assert_eq!(plan["progress"]["done"], 1);
        assert_eq!(plan["progress"]["total"], 2);
        assert_eq!(plan["phase"], "execute");
        // The proposed ADR carries its status and the adr phase.
        let adr = artifacts
            .iter()
            .find(|a| a["stem"] == "2026-06-14-w-adr")
            .unwrap();
        assert_eq!(adr["status"], "proposed");
        assert_eq!(adr["phase"], "adr");
        // Tiers block present on success.
        assert!(body["tiers"]["semantic"]["available"].is_boolean());
    }

    #[tokio::test]
    async fn plan_interior_carries_the_tiers_block_and_404s_an_unknown_node() {
        // W03.P08.S47: /nodes/{id}/plan-interior carries the tiers block on
        // success and 404s an unknown node, through the shared envelope.
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
        std::fs::write(
            dir.path().join(".vault/plan/2026-06-14-pi-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#pi'\ntier: L3\n---\n\n# `pi` plan\n\n\
             ## Wave `W01` - w\n\n### Phase `W01.P01` - p\n\n\
             - [x] `W01.P01.S01` - done it.\n- [ ] `W01.P01.S02` - todo.\n",
        )
        .unwrap();
        let state = app::build_state(dir.path().to_path_buf());
        let token = state.bearer.clone();
        let router = build_router(state);

        let (status, body) = get_with_token(
            router.clone(),
            "/nodes/doc:2026-06-14-pi-plan/plan-interior",
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "plan interior: {body}");
        let interior = &body["data"]["interior"];
        assert_eq!(interior["plan_node_id"], "doc:2026-06-14-pi-plan");
        let waves = interior["waves"].as_array().unwrap();
        assert_eq!(waves.len(), 1);
        let steps = waves[0]["phases"][0]["steps"].as_array().unwrap();
        assert_eq!(steps.len(), 2);
        assert_eq!(steps[0]["id"], "S01");
        assert_eq!(steps[0]["done"], true);
        assert_eq!(steps[1]["done"], false);
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "tiers block on success"
        );

        // Unknown node → truthful 404 with the tiers block.
        let (status, body) = get_with_token(
            router.clone(),
            "/nodes/doc:nope/plan-interior",
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert!(body["tiers"]["semantic"]["available"].is_boolean());

        // A non-plan node (the wave container itself) also 404s — it has no
        // plan interior.
        let (status, _) = get_with_token(
            router,
            "/nodes/plan:2026-06-14-pi-plan%2FW01/plan-interior",
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND, "a container is not a plan");
    }

    #[tokio::test]
    async fn pipeline_unknown_scope_400s_with_the_tiers_block() {
        // W02.P05.S26: an unknown scope 400s with the tiers block attached,
        // never a hand-built body — the shared envelope/api_error path.
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let router = build_router(state);
        let (status, body) =
            get_with_token(router, "/pipeline?scope=/nowhere/at/all", Some(&token)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(body["error"].is_string(), "honest error message");
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "the 400 still carries the tiers block"
        );
    }

    #[tokio::test]
    async fn ops_whitelist_rejects_unlisted_verbs() {
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let router = build_router(state);
        let response = router
            .oneshot(
                Request::post("/ops/core/vault-archive")
                    .header("host", "127.0.0.1")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN, "R1 whitelist");
    }

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
            "/search",
            "/ops/core/{verb}",
        ] {
            assert!(CONTRACT_ROUTES.contains(&family), "missing {family}");
        }
    }

    #[tokio::test]
    async fn a_poisoned_lock_degrades_instead_of_cascading_into_a_permanent_outage() {
        // Robustness H2 regression: a panic while a lock guard is held poisons
        // that lock. WITHOUT poison recovery, every later `.lock()/.read()`
        // re-panics → one transient panic = permanent total outage. With the
        // `unwrap_or_else(|e| e.into_inner())` recovery (paired with the
        // CatchPanicLayer), the engine keeps serving.
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        // The per-scope live locks now live on the active scope's cell.
        let cell = state.active_cell();

        // Poison the graph, meta-cache, and ring locks by panicking while each
        // guard is held — exactly the shape of a handler panicking mid-commit.
        // The catch must NOT propagate; we catch the unwind at the seam.
        for poisoner in [
            {
                let c = cell.clone();
                std::thread::spawn(move || {
                    let _g = c.graph.write().unwrap();
                    panic!("poison the graph lock");
                })
            },
            {
                let c = cell.clone();
                std::thread::spawn(move || {
                    let _g = c.meta_cache.lock().unwrap();
                    panic!("poison the meta-cache lock");
                })
            },
            {
                let c = cell.clone();
                std::thread::spawn(move || {
                    let _g = c.ring.lock().unwrap();
                    panic!("poison the ring lock");
                })
            },
        ] {
            assert!(
                poisoner.join().is_err(),
                "poisoner thread must have panicked"
            );
        }

        // The locks are now poisoned. Direct accessors must recover, not panic.
        let graph = cell.graph_arc();
        assert!(
            graph.node_count() > 0,
            "graph_arc recovers a poisoned RwLock"
        );
        let meta = cell.meta_edges();
        let _ = meta.len(); // meta_edges recovers the poisoned Mutex

        // And the live front door still serves a request end-to-end despite the
        // three poisoned locks — the cascade is contained.
        let router = build_router(state);
        let (status, body) = get_with_token(router.clone(), "/status", Some(&token)).await;
        assert_eq!(
            status,
            StatusCode::OK,
            "engine still serves after a lock-poison event"
        );
        assert_eq!(body["data"]["ok"], true);
        assert!(body["tiers"]["semantic"]["available"].is_boolean());
    }

    // --- workspace registry wire surface (dashboard-workspace-registry P02) ---

    /// Build a real one-commit git workspace with a vault doc at `root`.
    fn vault_git_repo(root: &std::path::Path) {
        git(root, &["init", "-b", "main", "."]);
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::write(
            root.join(".vault/plan/2026-06-14-ws-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#ws'\n---\n\nMentions `src/a.rs`.\n",
        )
        .unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "fixture"]);
    }

    #[tokio::test]
    async fn workspaces_route_lists_the_launch_root_with_tiers_and_active_marker() {
        // GET /workspaces enumerates the registry through the shared envelope:
        // the boot-auto-registered launch root with its id/label/path, the
        // launch-default marker, a reachability state, the active-workspace id,
        // and the per-tier tiers block (every-wire-response-carries-the-tiers).
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        vault_git_repo(root);

        let state = app::build_state(root.to_path_buf());
        // Mirror the boot auto-register (build_state alone does not run it; the
        // serve() boot path does — replicate it here so the route has a root).
        let ws_id = {
            let ws = ingest_git::workspace::Workspace::discover(&state.workspace_root).unwrap();
            routes::scope_token(&ws.common_dir)
        };
        let launch_token = routes::scope_token(&state.workspace_root);
        {
            let us = state.user_state.lock().unwrap();
            us.auto_register_launch(&ws_id, "main", &launch_token, app::now_ms())
                .unwrap();
            us.set_active_workspace(&ws_id, app::now_ms()).unwrap();
        }
        let token = state.bearer.clone();
        let router = build_router(state);

        let (status, body) = get_with_token(router, "/workspaces", Some(&token)).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        let roots = body["data"]["workspaces"]
            .as_array()
            .expect("workspaces array");
        assert_eq!(roots.len(), 1, "only the launch root is registered");
        assert_eq!(roots[0]["id"], ws_id);
        assert_eq!(roots[0]["is_launch"], true, "launch-default marker present");
        assert_eq!(roots[0]["reachable"], true, "launch root probes reachable");
        assert_eq!(body["data"]["active_workspace"], ws_id);
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "carries the tiers block"
        );
    }

    #[tokio::test]
    async fn map_default_workspace_is_unchanged_and_unknown_workspace_400s() {
        // /map without `workspace=` is the unchanged single-workspace default
        // (it enumerates the launch root's worktrees); an unknown registered id
        // 400s honestly with the tiers block.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        vault_git_repo(root);
        let state = app::build_state(root.to_path_buf());
        let token = state.bearer.clone();
        let router = build_router(state);

        let (status, body) = get_with_token(router.clone(), "/map", Some(&token)).await;
        assert_eq!(status, StatusCode::OK, "default /map unchanged: {body}");
        assert!(
            body["data"]["worktrees"]
                .as_array()
                .is_some_and(|w| !w.is_empty()),
            "default /map lists the launch root's worktrees"
        );

        let (status, body) =
            get_with_token(router, "/map?workspace=not-a-registered-root", Some(&token)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "unknown workspace 400s");
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "the 400 still carries the tiers block"
        );
    }

    #[tokio::test]
    async fn put_session_registers_a_sibling_then_forgets_it_read_only() {
        // PUT /session add_workspace registers a real sibling git workspace
        // read-only (it appears on /workspaces); forget_workspace removes it.
        // Neither touches the repository on disk — registering only records the
        // operator-supplied path.
        let workspace = tempfile::tempdir().unwrap();
        let main = workspace.path().join("main");
        std::fs::create_dir_all(&main).unwrap();
        vault_git_repo(&main);
        // A SEPARATE git workspace the operator will register.
        let sibling = workspace.path().join("other-project");
        std::fs::create_dir_all(&sibling).unwrap();
        vault_git_repo(&sibling);

        let state = app::build_state(main.clone());
        // Seed the launch root so the registry is non-empty (boot parity).
        let launch_id = {
            let ws = ingest_git::workspace::Workspace::discover(&state.workspace_root).unwrap();
            routes::scope_token(&ws.common_dir)
        };
        {
            let us = state.user_state.lock().unwrap();
            us.auto_register_launch(
                &launch_id,
                "main",
                &routes::scope_token(&state.workspace_root),
                app::now_ms(),
            )
            .unwrap();
        }
        let token = state.bearer.clone();
        let router = build_router(state);

        let sibling_path = routes::scope_token(&std::fs::canonicalize(&sibling).unwrap());
        let (status, body) = put_json_with_token(
            router.clone(),
            "/session",
            json!({ "add_workspace": sibling_path }),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "registering a sibling: {body}");

        let (_, body) = get_with_token(router.clone(), "/workspaces", Some(&token)).await;
        let roots = body["data"]["workspaces"].as_array().unwrap();
        assert_eq!(roots.len(), 2, "launch + the registered sibling");
        let sibling_id = roots
            .iter()
            .find(|r| r["is_launch"] == false)
            .expect("the sibling root")["id"]
            .as_str()
            .unwrap()
            .to_string();

        // The sibling repo on disk is untouched by registration: still exactly
        // the one fixture commit, no new refs/worktrees created by the engine.
        let sibling_commits = {
            let out = std::process::Command::new("git")
                .current_dir(&sibling)
                .args(["rev-list", "--count", "HEAD"])
                .output()
                .unwrap();
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        };
        assert_eq!(sibling_commits, "1", "registration never mutated the repo");

        // Forget the sibling: a config delete only; the registry returns to one.
        let (status, body) = put_json_with_token(
            router.clone(),
            "/session",
            json!({ "forget_workspace": sibling_id }),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "forgetting the sibling: {body}");
        let (_, body) = get_with_token(router, "/workspaces", Some(&token)).await;
        assert_eq!(
            body["data"]["workspaces"].as_array().unwrap().len(),
            1,
            "the sibling is forgotten; the launch root remains"
        );
    }

    // --- content-fetch route (review-rail-viewers P01) ---

    #[tokio::test]
    async fn content_route_serves_a_vault_doc_and_a_code_file_with_tiers() {
        // P01.S06: GET /nodes/{id}/content serves the bytes of a doc:<stem> and a
        // code:<path> node through the shared envelope, with path/blob_hash/
        // byte_len/language_hint/text and the tiers block on success.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
        std::fs::create_dir_all(root.join("src")).unwrap();
        let doc_body = "---\ntags:\n  - '#adr'\n  - '#c'\n---\n\n# `c` adr\n\nthe document body\n";
        std::fs::write(root.join(".vault/adr/2026-06-16-c-adr.md"), doc_body).unwrap();
        std::fs::write(root.join("src/main.rs"), "fn main() {}\n").unwrap();

        let state = app::build_state(root.to_path_buf());
        let token = state.bearer.clone();
        let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
        let router = build_router(state);

        // doc:<stem> resolves to the .vault/adr/<stem>.md file.
        let (status, body) = get_with_token(
            router.clone(),
            &format!(
                "/nodes/doc:2026-06-16-c-adr/content?scope={}",
                urlencode(&scope)
            ),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "doc content: {body}");
        assert_eq!(body["data"]["path"], ".vault/adr/2026-06-16-c-adr.md");
        assert_eq!(body["data"]["text"], doc_body);
        assert_eq!(body["data"]["language_hint"], "markdown");
        assert_eq!(body["data"]["byte_len"], doc_body.len());
        assert!(
            body["data"]["blob_hash"].is_string(),
            "carries the blob_hash"
        );
        assert!(
            body["data"]["truncated"].is_null(),
            "a small doc is not truncated"
        );
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "the success envelope carries the tiers block"
        );

        // code:<path> resolves to the worktree file directly. A code id carries
        // slashes, so the client percent-encodes them into one path segment.
        let (status, body) = get_with_token(
            router,
            &format!(
                "/nodes/{}/content?scope={}",
                percent_encode("code:src/main.rs"),
                urlencode(&scope)
            ),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "code content: {body}");
        assert_eq!(body["data"]["path"], "src/main.rs");
        assert_eq!(body["data"]["text"], "fn main() {}\n");
        assert_eq!(body["data"]["language_hint"], "rust");
    }

    #[tokio::test]
    async fn content_route_byte_caps_a_large_file_with_an_honest_truncated_block() {
        // P01.S06: a file beyond MAX_CONTENT_BYTES is truncated with a truncated
        // block stating the full and served sizes — never an unbounded body.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("src")).unwrap();
        let big = "x".repeat(routes::content::MAX_CONTENT_BYTES + 4096);
        std::fs::write(root.join("src/big.txt"), &big).unwrap();

        let state = app::build_state(root.to_path_buf());
        let token = state.bearer.clone();
        let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
        let router = build_router(state);

        // The served body is ~MAX_CONTENT_BYTES (1 MiB), so read it with a
        // generous limit beyond the default 1 MiB the small helpers use.
        let response = router
            .oneshot(
                Request::get(format!(
                    "/nodes/{}/content?scope={}",
                    percent_encode("code:src/big.txt"),
                    urlencode(&scope)
                ))
                .header("host", "127.0.0.1")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
            )
            .await
            .unwrap();
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), 8 << 20)
            .await
            .unwrap();
        let body: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        assert_eq!(status, StatusCode::OK, "byte-cap: {body}");
        assert_eq!(body["data"]["byte_len"], big.len(), "full size reported");
        assert_eq!(
            body["data"]["truncated"]["total_bytes"],
            big.len(),
            "truncated block states the full size"
        );
        assert_eq!(
            body["data"]["truncated"]["returned_bytes"],
            routes::content::MAX_CONTENT_BYTES,
            "served exactly the cap"
        );
        assert_eq!(
            body["data"]["text"].as_str().unwrap().len(),
            routes::content::MAX_CONTENT_BYTES,
            "the served text is exactly the cap"
        );
    }

    #[tokio::test]
    async fn content_route_rejects_path_traversal_with_a_tiered_400() {
        // P01.S06: a code id whose path escapes the worktree root is a tiered
        // 400 (request error), distinct from degradation, carrying the tiers
        // block — never a read outside the root.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::write(
            root.join(".vault/plan/2026-06-16-t-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#t'\n---\n\nbody\n",
        )
        .unwrap();
        let state = app::build_state(root.to_path_buf());
        let token = state.bearer.clone();
        let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
        let router = build_router(state);

        let (status, body) = get_with_token(
            router,
            &format!(
                "/nodes/code:..%2F..%2Fsecrets.txt/content?scope={}",
                urlencode(&scope)
            ),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "traversal 400: {body}");
        assert!(body["error"].is_string(), "honest error message");
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "the traversal 400 carries the tiers block"
        );
    }

    #[tokio::test]
    async fn content_route_degrades_structural_on_an_unreadable_path() {
        // P01.S06: a code id naming a path that does not exist on disk degrades
        // the STRUCTURAL tier honestly (the substrate could not resolve it),
        // returning the structural degradation reason in the tiers block rather
        // than a bare 500.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::write(
            root.join(".vault/plan/2026-06-16-d-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#d'\n---\n\nbody\n",
        )
        .unwrap();
        let state = app::build_state(root.to_path_buf());
        let token = state.bearer.clone();
        let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
        let router = build_router(state);

        let (status, body) = get_with_token(
            router,
            &format!(
                "/nodes/{}/content?scope={}",
                percent_encode("code:src/does-not-exist.rs"),
                urlencode(&scope)
            ),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "unreadable: {body}");
        assert_eq!(
            body["tiers"]["structural"]["available"], false,
            "the structural tier degrades honestly"
        );
        assert!(
            body["tiers"]["structural"]["reason"].is_string(),
            "the structural degradation carries a reason"
        );
    }

    #[tokio::test]
    async fn content_route_404s_an_unknown_doc_stem_and_400s_a_non_content_node() {
        // P01.S06: an unknown doc stem is a 404; a non-content node kind (a
        // feature) is a 400 — both with the tiers block.
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
        let router = build_router(state);

        let (status, body) = get_with_token(
            router.clone(),
            &format!("/nodes/doc:nope/content?scope={}", urlencode(&scope)),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND, "unknown stem: {body}");
        assert!(body["tiers"]["semantic"]["available"].is_boolean());

        let (status, body) = get_with_token(
            router,
            &format!("/nodes/feature:srv/content?scope={}", urlencode(&scope)),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "non-content node: {body}");
        assert!(body["tiers"]["semantic"]["available"].is_boolean());
    }

    #[tokio::test]
    async fn put_session_refuses_forgetting_the_last_launch_root() {
        // The launch workspace cannot be forgotten while it is the only root — a
        // tiered 400, never a disk operation.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        vault_git_repo(root);
        let state = app::build_state(root.to_path_buf());
        let launch_id = {
            let ws = ingest_git::workspace::Workspace::discover(&state.workspace_root).unwrap();
            routes::scope_token(&ws.common_dir)
        };
        {
            let us = state.user_state.lock().unwrap();
            us.auto_register_launch(
                &launch_id,
                "main",
                &routes::scope_token(&state.workspace_root),
                app::now_ms(),
            )
            .unwrap();
        }
        let token = state.bearer.clone();
        let router = build_router(state);

        let (status, body) = put_json_with_token(
            router,
            "/session",
            json!({ "forget_workspace": launch_id }),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "the refusal carries the tiers block"
        );
    }
}
