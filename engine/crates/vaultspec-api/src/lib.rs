//! `vaultspec serve` — the resident HTTP front door (engine-spec §7,
//! contract §1).
//!
//! Single origin on loopback: the engine serves (a) the GUI SPA static
//! bundle, (b) the query API, (c) the transparent ops proxy (`/ops/core/*`,
//! `/ops/rag/*`, whitelisted, envelopes verbatim), and (d) the multiplexed
//! SSE stream. `/health` is ungated; everything else is bearer-gated.
//! No WebSocket in v1 (D7.1).

mod a2a_run_leases;
pub mod app;
mod authoring;
pub mod boot;
mod bounded_child;
pub mod discovery;
mod graph_delta;
pub mod handshake;
pub mod registry;
pub mod routes;
mod row_delta;
mod search_bounds;
pub mod seat;

use std::sync::Arc;

use axum::extract::DefaultBodyLimit;
use axum::routing::{get, post};
use axum::{Json, Router, middleware};
use serde_json::{Value, json};

/// Request-body ceiling (defense-in-depth, 2026-06-13). Every API body —
/// graph-query filters, search — is small JSON; 1 MiB is orders of
/// magnitude of headroom while bounding a pathological body (and the response
/// amplification a huge filter would drive). A 413 still rides the shared
/// envelope via `ensure_tiers_envelope`. The real boundary stays loopback.
const MAX_REQUEST_BODY: usize = 1024 * 1024;

use app::AppState;

pub use boot::{bootstrap_root, serve};

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
    "/vault-tree/delta",
    "/code-files",
    "/code-files/delta",
    "/file-tree",
    "/fs/list",
    "/pipeline",
    "/dashboard-state",
    "/graph/query",
    "/graph/query/delta",
    "/graph/embeddings",
    "/graph/asof",
    "/graph/diff",
    "/graph/lineage",
    "/filters",
    "/features",
    "/nodes/{id}",
    "/nodes/{id}/content",
    "/nodes/{id}/neighbors",
    "/nodes/{id}/evidence",
    "/nodes/{id}/plan-interior",
    "/events",
    "/history",
    "/prs",
    "/issues",
    "/status",
    "/stream",
    "/shutdown",
    "/authoring/status",
    "/search",
    "/ops/core/{verb}",
    "/ops/core/autofix",
    "/ops/core/archive",
    "/ops/rag/{verb}",
    "/ops/rag/storage/{verb}",
    "/ops/a2a/{verb}",
    "/ops/a2a/runs/{run_id}/stream",
    "/ops/git/{verb}",
    "/a2a/lifecycle/status",
    "/a2a/lifecycle/run",
    "/a2a/lifecycle/jobs/{id}",
    "/internal/a2a/run-terminal",
    "/provision/status",
    "/provision/run",
    "/provision/jobs/{id}",
    "/session",
    "/settings",
    "/settings/schema",
];

/// Contract routes authenticated by the dashboard attach-control credential
/// rather than the browser/machine bearer. Keeping this class explicit prevents
/// an internal callback from disappearing from `CONTRACT_ROUTES` while also
/// preventing it from being accidentally folded into the wrong bearer boundary.
pub const ATTACH_CONTROL_ROUTES: &[&str] = &["/internal/a2a/run-terminal"];

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
    use routes::{code_files, graph, vault_tree};
    Router::new()
        .route("/health", get(health))
        .route("/map", get(routes::query::map))
        // Workspace registry enumeration (dashboard-workspace-registry ADR):
        // the registered project roots with reachability, through the shared
        // envelope. Registry mutation rides /session (config), never here.
        .route("/workspaces", get(routes::registry::list_workspaces))
        // Graceful stop (single-app-runtime D5): bearer-gated signal; the
        // drain itself is the serve loop's one shared shutdown path.
        .route("/shutdown", post(routes::lifecycle::shutdown))
        .route("/vault-tree", get(vault_tree::vault_tree))
        .route("/vault-tree/delta", get(vault_tree::vault_tree_delta))
        .route("/code-files", get(code_files::code_files))
        .route("/code-files/delta", get(code_files::code_files_delta))
        // Read-only codebase file-tree listing (dashboard-code-tree ADR): one
        // bounded, ignore-aware directory level per call, metadata only, through
        // the shared envelope so every response carries the tiers block.
        .route("/file-tree", get(routes::file_tree::file_tree))
        // Bounded read-only directory browsing for the add-project picker
        // (single-app-runtime S24, ADR O6 closure).
        .route("/fs/list", get(routes::fs_browse::fs_list))
        // In-flight pipeline projection (dashboard-pipeline-wire W02): active
        // plans + in-flight ADRs in scope, through the shared envelope.
        .route("/pipeline", get(routes::query::pipeline))
        // Bounded, transient dashboard intent session state (dashboard-state-
        // centralization W01): read/patch through the shared envelope, never
        // persisted into vault content or graph semantics.
        .route(
            "/dashboard-state",
            get(routes::state::get_dashboard_state).patch(routes::state::patch_dashboard_state),
        )
        .route("/graph/query", post(graph::graph_query_route))
        .route("/graph/query/delta", post(graph::graph_query_delta_route))
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
        .route("/features", get(routes::query::features))
        .route("/nodes/{id}", get(routes::query::node_detail))
        // Read-only, bounded content-fetch (review-rail-viewers ADR): the ONE
        // viewer backend — document/file bytes keyed on the stable node id,
        // byte-capped with an honest `truncated` block, tiers on success/error.
        // The listing routes stay metadata-only.
        .route("/nodes/{id}/content", get(routes::content::node_content))
        .route("/nodes/{id}/neighbors", get(routes::query::node_neighbors))
        .route("/nodes/{id}/evidence", get(routes::query::node_evidence))
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
        // Read-only GitHub work items for the status rail (right-rail redesign):
        // open / recently-merged pull requests and open issues, brokered through
        // the bounded `gh` CLI, reshaped to a bounded wire shape, enveloped with
        // the tiers block. Read-and-infer: list-only, never a forge mutation;
        // gh-unavailable degrades to `{items:[], available:false}` honestly.
        .route("/prs", get(routes::github::prs))
        .route("/issues", get(routes::github::issues))
        .route("/status", get(routes::stream::status))
        .route("/stream", get(routes::stream::stream))
        // Fenced agentic authoring backend (agentic-spec-authoring-backend),
        // MOUNTED at W03.P39: the enabled status shell + the propose → review →
        // apply → rollback command routes, nested as one `/authoring` subtree. Its
        // `resolve_principal_layer` runs AFTER this router's `bearer_gate` (the nest
        // sits under it), so a valid machine bearer is required first, then the
        // actor principal resolves per command. Still NOT an `/ops/core/*` alias.
        .nest(
            "/authoring",
            authoring::http::authoring_router(state.clone()),
        )
        .route("/search", post(routes::ops::search))
        .route("/ops/core/{verb}", post(routes::ops::ops_core))
        // Feature-scoped conformance autofix (W04.P06.S15): forwards
        // `vault check all --fix --feature <tag>` so the editor's fixable
        // advisories can be repaired through the broker; watcher re-ingests.
        // RETAINED vault-maintenance op (out-of-ledger by design, W04.P11 ADR):
        // every CONTENT edit verb (write/create/link/unarchive) is ledgered
        // through `/authoring/*` (W02-W04); this route family is not.
        .route("/ops/core/autofix", post(routes::ops::ops_core_autofix))
        // Feature archive: forwards `vault feature archive <tag>` so the left rail
        // can retire a completed feature's documents through the broker. Feature-
        // scoped (the only archive grain vaultspec-core has); watcher re-ingests.
        // RETAINED vault-maintenance op — see the autofix route's note above.
        .route("/ops/core/archive", post(routes::ops::ops_core_archive))
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
        // Destructive rag storage broker (rag-storage-broker ADR): delete/prune/
        // migrate on the bounded CLI runner, validated args, dry-run-default, rag
        // envelope verbatim. A 4-segment path, distinct from `/ops/rag/{verb}`.
        .route(
            "/ops/rag/storage/{verb}",
            post(routes::ops::ops_rag_storage),
        )
        // The a2a orchestration control pass-through (a2a-orchestration-edge ADR
        // D1/D2): five whitelisted control verbs (run-start / run-status /
        // run-cancel / presets-list / service-state) plus bounded active-runs
        // discovery forwarded to the resident vaultspec-a2a
        // gateway, the sibling envelope verbatim inside the tiers envelope,
        // sibling-down degraded at 200, run-start actor-token provisioning. The rag
        // ops template retargeted at an HTTP sibling; attach-never-own discovery.
        .route("/ops/a2a/{verb}", post(routes::ops::ops_a2a))
        // The a2a run-progress relay (a2a-orchestration-edge ADR D3): a new engine
        // SSE channel re-serving the resident gateway's run-stream verb with the
        // engine's seq + since-replay + gap contract and non-authoritative frames;
        // the browser owns degraded run-status polling. The CompressionLayer's
        // DefaultPredicate skips text/event-stream, so this stream is not buffered.
        .route(
            "/ops/a2a/runs/{run_id}/stream",
            get(routes::ops::a2a_run_stream),
        )
        // Read-only git pass-through (dashboard-pipeline-wire W04): porcelain
        // status, numstat, unified diff — whitelisted, no mutating verb.
        .route("/ops/git/{verb}", post(routes::ops::ops_git))
        // The A2A component lifecycle plane (a2a-product-provisioning W01.P03):
        // typed install/ensure/start/stop/.../doctor as bounded, atomically-
        // admitted, component-single-flight jobs over the vaultspec-product
        // controller. A DEDICATED namespace, deliberately SEPARATE from the fixed
        // six-member `/ops/a2a` whitelist above — no lifecycle verb here.
        // Bearer-gated by the same middleware as every other data route.
        .route(
            "/a2a/lifecycle/status",
            get(routes::a2a_lifecycle::a2a_lifecycle_status),
        )
        .route(
            "/a2a/lifecycle/run",
            post(routes::a2a_lifecycle::a2a_lifecycle_run),
        )
        .route(
            "/a2a/lifecycle/jobs/{id}",
            get(routes::a2a_lifecycle::a2a_lifecycle_job),
        )
        // The authenticated A2A terminal-settlement callback (a2a-product-
        // provisioning W02.P05.S41/S153): the RECEIVING end of the gateway's
        // fire-and-forget terminal-settlement emission. A DISTINCT internal
        // namespace — NOT a sixth `/ops/a2a` public verb, and NOT machine-bearer-
        // gated: `/internal` is deliberately ABSENT from `spa::API_PREFIXES`, so
        // the machine gate passes it through and the handler authenticates the
        // dashboard-created ATTACH-CONTROL credential itself (rejecting the machine
        // bearer, the worker-IPC secret, and unrelated credentials). Its prefix is
        // reserved from the SPA fallback so a misrouted callback fails loud (S154).
        .route(
            "/internal/a2a/run-terminal",
            post(routes::a2a_settlement::a2a_run_terminal),
        )
        // The framework acquisition + provisioning plane (project-provisioning
        // ADR): a served status projection over a registry-resolved target, and
        // job-shaped install/upgrade/migrate/acquire that BROKERS the owning
        // installer (vaultspec-core / uv) — the engine writes nothing. A dedicated
        // family, sibling to /ops/* (a provisioning target may be a non-servable
        // scope, the work is long-running/job-shaped, it is a state machine).
        .route(
            "/provision/status",
            get(routes::provision::provision_status),
        )
        .route("/provision/run", post(routes::provision::provision_run))
        .route(
            "/provision/jobs/{id}",
            get(routes::provision::provision_job),
        )
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
        // OUTERMOST: response compression. The graph/query document slice is a
        // multi-megabyte JSON body (thousands of nodes + tens of thousands of
        // edges) that previously shipped UNCOMPRESSED — a 12 MB transfer on this
        // workspace, larger on a big corpus, the dominant graph-load cost. gzip
        // compresses that JSON ~6-8x on the wire (the browser auto-decompresses).
        // Placed outside `ensure_tiers_envelope` so the tiers middleware still
        // inspects/rewrites the UNCOMPRESSED body before it is compressed.
        // tower-http's DefaultPredicate skips small bodies and `text/event-stream`,
        // so the SSE `/stream` + `/status` channels are NOT buffered/compressed.
        .layer(tower_http::compression::CompressionLayer::new())
        // Static security headers (defense-in-depth, #41). The engine is already
        // loopback-only, Host-validated (DNS-rebinding 403), and bearer-gated,
        // but the SPA it serves benefits from the standard hardening trio:
        // `nosniff` stops MIME-confusion on served assets, `DENY` blocks
        // clickjacking via framing, and `no-referrer` keeps loopback URLs out of
        // any cross-origin referrer. Applied OUTERMOST so every response — static
        // asset, API, error, and SSE — carries them.
        //
        // CSP (single-app-runtime D7, closing the deferral recorded here):
        // authored against the embedded SPA's ACTUAL needs — every script and
        // stylesheet is a same-origin chunk (shiki grammars arrive via
        // same-origin dynamic import); the pre-hydration boot shell is one
        // inline <style> island and React styles are attributes (both under
        // style-src 'unsafe-inline'); the favicon is a data: URI; SSE rides
        // connect-src 'self'; the browser never contacts an external host
        // (core and rag are reached by the ENGINE process, not the page).
        // frame-ancestors 'none' mirrors X-Frame-Options DENY.
        .layer(tower_http::set_header::SetResponseHeaderLayer::overriding(
            axum::http::header::CONTENT_SECURITY_POLICY,
            axum::http::HeaderValue::from_static(concat!(
                "default-src 'self'; script-src 'self'; ",
                "style-src 'self' 'unsafe-inline'; ",
                "img-src 'self' data:; font-src 'self' data:; ",
                "connect-src 'self'; worker-src 'self' blob:; ",
                "frame-ancestors 'none'; base-uri 'self'; ",
                "form-action 'self'; object-src 'none'"
            )),
        ))
        .layer(tower_http::set_header::SetResponseHeaderLayer::overriding(
            axum::http::header::X_CONTENT_TYPE_OPTIONS,
            axum::http::HeaderValue::from_static("nosniff"),
        ))
        .layer(tower_http::set_header::SetResponseHeaderLayer::overriding(
            axum::http::header::X_FRAME_OPTIONS,
            axum::http::HeaderValue::from_static("DENY"),
        ))
        .layer(tower_http::set_header::SetResponseHeaderLayer::overriding(
            axum::http::header::REFERRER_POLICY,
            axum::http::HeaderValue::from_static("no-referrer"),
        ))
        .with_state(state)
}

#[cfg(test)]
#[path = "lib_tests/mod.rs"]
mod tests;
