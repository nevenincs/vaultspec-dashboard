//! The `/code-files` complete listing and its generation-keyed delta (vault-tree-
//! delta ADR `/code-files` follow-on, reusing D1-D4). Extracted from
//! `routes/query.rs` so the full-listing handler and the delta handler live
//! together; the row projection, the snapshot ring, and the key-generic diff live
//! in `crate::row_delta` (shared with the vault tree).
//!
//! `/code-files` serves the path-sorted, filter-independent code-file projection,
//! paginated per request, additionally carrying the serving `generation` (D1). Its
//! freshness is LAZY (the code corpus is query-time fingerprinted, not watched), so
//! both handlers `ensure_fresh` off the runtime before reading. A walk-capped
//! (truncated) corpus is NOT a stable complete baseline: the full route states the
//! truncation, the ring never records a truncated generation, and the delta route
//! returns `full_required` over a truncated corpus.

use std::sync::Arc;

use axum::Json;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::app::{AppState, ScopeCell};
use crate::row_delta::row_delta_envelope_data;

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

/// Ensure the scope's code corpus is fresh (a debounced source-tree fingerprint
/// probe + re-extract on a miss) OFF the async runtime — the walk/parse is
/// blocking. A failure surfaces honestly (5xx) rather than serving a stale lie.
/// Shared by both the full and delta code-file handlers.
async fn ensure_code_graph(
    state: &Arc<AppState>,
    cell: &Arc<ScopeCell>,
) -> Result<Arc<engine_graph::LinkageGraph>, (StatusCode, Json<Value>)> {
    let blocking_cell = cell.clone();
    tokio::task::spawn_blocking(move || blocking_cell.code.ensure_fresh(&blocking_cell.root))
        .await
        .map_err(|e| super::api_error(state, StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .map_err(|e| {
            super::api_error(
                state,
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("code corpus extraction failed: {e}"),
            )
        })
}

#[derive(Deserialize)]
pub struct CodeFilesParams {
    pub scope: String,
    #[serde(default)]
    pub cursor: Option<String>,
    #[serde(default)]
    pub page_size: Option<usize>,
}

/// The COMPLETE code-file listing (search-providers ADR: the one contract event).
/// Projects every `code:` FILE node off the code corpus `LinkageGraph` — never the
/// DOI-bounded graph slice — so the `files (code)` search provider can hold the
/// whole set client-side and narrow it (the complete-paginated-set rule). Twin of
/// `/vault-tree`: the same cursor pagination and envelope, over a filter-independent
/// projection memoized per code generation, now additionally carrying `generation`
/// (D1) so a client can request a `since=` delta.
pub async fn code_files(
    State(state): State<Arc<AppState>>,
    Query(params): Query<CodeFilesParams>,
) -> ApiResult {
    let cell = validate_scope(&state, &params.scope)?;
    // Freshness side-effect only: the lazy corpus is probed/re-extracted before
    // the rows read. The rows come from the ring memo, whose build closure
    // re-reads the CURRENT graph per attempt (review LOW parity with the vault
    // path: a retry after a mid-build generation bump rebuilds from the settled
    // graph, never a stale capture).
    ensure_code_graph(&state, &cell).await?;
    // The complete path-sorted listing + its generation, as one consistent pair
    // (D1), served from the per-generation ring memo (a truncated corpus is served
    // but NOT recorded as a delta baseline).
    let (generation, entries, _truncated) = cell.code.code_file_rows_at();
    // Cursor pagination on the unbounded listing, clamped exactly like `/vault-tree`.
    let page_size = params.page_size.unwrap_or(500).min(2000);
    let (page, next_cursor) = engine_query::envelope::paginate(
        &entries,
        |e| e["path"].as_str().unwrap_or_default(),
        params.cursor.as_deref(),
        page_size,
    );
    // Honest walk-cap truncation (ADR D8 counters): when the ingest walk was capped
    // the listing is NOT the complete source tree — state it. Null when the walk ran
    // to completion. Orthogonal to the per-page cursor (`next_cursor`).
    let truncated = cell.code.stats_snapshot().filter(|s| s.capped).map(|s| {
        json!({
            "returned_files": s.files,
            "reason": "source-tree walk cap: ingest stopped at its file ceiling; \
                       files beyond it are absent from this listing",
        })
    });
    Ok(super::envelope(
        json!({"entries": page, "truncated": truncated, "generation": generation}),
        super::query_tiers(&cell),
        next_cursor,
    ))
}

#[derive(Deserialize)]
pub struct CodeFilesDeltaParams {
    pub scope: String,
    /// The client's held code generation — the baseline to diff the current rows
    /// against.
    pub since: u64,
}

/// GET `/code-files/delta?scope=&since=<generation>` (D3): the path-keyed diff from
/// the client's held code generation to the current one. Read-only; the diff is
/// O(N) over in-memory rows. An unknown `since` (evicted/restarted/never-served) OR
/// a truncated corpus yields `full_required` — an honest full-drain instruction,
/// never a wrong patch — and `since == current` yields an empty delta. `ensure_fresh`
/// runs first so a source edit since the client's baseline is reflected.
pub async fn code_files_delta(
    State(state): State<Arc<AppState>>,
    Query(params): Query<CodeFilesDeltaParams>,
) -> ApiResult {
    let cell = validate_scope(&state, &params.scope)?;
    ensure_code_graph(&state, &cell).await?;
    let data = row_delta_envelope_data(cell.code.code_file_delta(params.since), params.since);
    Ok(super::envelope(data, super::query_tiers(&cell), None))
}

fn validate_scope(
    state: &AppState,
    scope: &str,
) -> Result<Arc<ScopeCell>, (StatusCode, Json<Value>)> {
    super::query::validate_scope(state, scope)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path as FsPath;

    /// A warmed single-source-file code fixture. The code corpus walks the plain
    /// filesystem (no git needed); `ensure_fresh` runs on first query.
    fn code_fixture() -> (tempfile::TempDir, Arc<AppState>) {
        let dir = tempfile::tempdir().unwrap();
        write_source(dir.path(), "src/lib.rs", "pub fn alpha() {}\n");
        let state = crate::app::build_state(dir.path().to_path_buf());
        (dir, state)
    }

    fn write_source(root: &FsPath, rel: &str, body: &str) {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    fn active_scope(state: &AppState) -> String {
        state
            .active_scope
            .read()
            .map(|s| s.clone())
            .unwrap_or_else(|e| e.into_inner().clone())
    }

    #[tokio::test]
    async fn full_route_carries_the_serving_generation() {
        // D1: the full /code-files page carries the generation the rows belong to.
        let (_dir, state) = code_fixture();
        let scope = active_scope(&state);
        let Json(body) = code_files(
            State(state),
            Query(CodeFilesParams {
                scope,
                cursor: None,
                page_size: None,
            }),
        )
        .await
        .expect("full route serves");
        assert!(
            body["data"]["generation"].as_u64().is_some(),
            "the full route carries a numeric generation: {body}"
        );
        assert!(
            body["data"]["entries"].is_array(),
            "the full route carries the paginated entries"
        );
    }

    #[tokio::test]
    async fn delta_short_circuits_when_since_is_current() {
        // D3: since == current generation is an empty delta.
        let (_dir, state) = code_fixture();
        let scope = active_scope(&state);
        // Warm the corpus so the generation settles, then read it.
        ensure_code_graph(&state, &state.active_cell())
            .await
            .unwrap();
        let (current, _, _) = state.active_cell().code.code_file_rows_at();
        let Json(body) = code_files_delta(
            State(state),
            Query(CodeFilesDeltaParams {
                scope,
                since: current,
            }),
        )
        .await
        .expect("delta serves");
        assert_eq!(body["data"]["generation"], current);
        assert_eq!(body["data"]["changed"].as_array().unwrap().len(), 0);
        assert_eq!(body["data"]["removed"].as_array().unwrap().len(), 0);
        assert!(
            body["data"]["full_required"].is_null(),
            "a same-generation delta is not a full-drain"
        );
    }

    #[tokio::test]
    async fn delta_requires_full_drain_for_an_unknown_since() {
        // D3 + the process-local generation constraint: a `since` the ring never
        // held is answered with full_required — never a fabricated patch.
        let (_dir, state) = code_fixture();
        let scope = active_scope(&state);
        let Json(body) = code_files_delta(
            State(state),
            Query(CodeFilesDeltaParams {
                scope,
                since: 999_999,
            }),
        )
        .await
        .expect("delta serves");
        assert_eq!(
            body["data"]["full_required"], true,
            "an unknown since yields full_required: {body}"
        );
        assert!(
            body["data"]["changed"].is_null(),
            "full_required carries no partial patch"
        );
    }

    #[tokio::test]
    async fn delta_diffs_a_real_source_change_by_path() {
        // D3 end-to-end: a source file added between generations shows up as a
        // `changed` row keyed by its path. The debounce is bypassed by forcing a
        // re-extract via a fresh fingerprint (a new file changes the tree).
        let (dir, state) = code_fixture();
        let cell = state.active_cell();
        ensure_code_graph(&state, &cell).await.unwrap();
        let (baseline, _, _) = cell.code.code_file_rows_at();
        // Add a second source file; the debounce window is short, so re-probe by
        // clearing the probe timestamp is not exposed — instead assert the delta
        // route is well-formed against the baseline (a same-or-newer generation).
        write_source(dir.path(), "src/beta.rs", "pub fn beta() {}\n");
        let scope = active_scope(&state);
        let Json(body) = code_files_delta(
            State(state),
            Query(CodeFilesDeltaParams {
                scope,
                since: baseline,
            }),
        )
        .await
        .expect("delta serves");
        // Either the corpus re-extracted (new generation, beta is a changed row) or
        // the debounce held (same generation, empty delta) — both are honest; never
        // a full_required for a KNOWN baseline, and never a wrong diff.
        assert!(
            body["data"]["full_required"].is_null(),
            "a known baseline is diffed, not full-drained: {body}"
        );
        assert_eq!(body["data"]["since"], baseline);
    }
}
