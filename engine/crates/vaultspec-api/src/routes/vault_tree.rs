//! The `/vault-tree` listing and its generation-keyed delta (vault-tree-delta ADR
//! D1/D3). Extracted from `routes/query.rs` so the full-listing handler and the
//! delta handler live together; the row projection, the snapshot ring, and the
//! diff live in `crate::vault_rows`.
//!
//! `/vault-tree` serves the stem-sorted, filter-independent doc-row projection,
//! paginated per request, additionally carrying the serving `generation` (D1) so a
//! client can later ask for a delta against it. `/vault-tree/delta?scope=&since=`
//! diffs the client's held generation against the current rows (D3): a stem-keyed
//! `{since, generation, changed, removed}`, an empty delta when `since` is already
//! current, or `{generation, full_required: true}` when `since` is no longer
//! retained (evicted, never served, or from a previous process). Both routes are
//! read-only.

use std::sync::Arc;

use axum::Json;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::app::AppState;
use crate::vault_rows::VaultTreeDelta;

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

#[derive(Deserialize)]
pub struct VaultTreeParams {
    pub scope: String,
    #[serde(default)]
    pub cursor: Option<String>,
    #[serde(default)]
    pub page_size: Option<usize>,
}

pub async fn vault_tree(
    State(state): State<Arc<AppState>>,
    Query(params): Query<VaultTreeParams>,
) -> ApiResult {
    let cell = super::query::validate_scope(&state, &params.scope)?;
    // The stem-sorted doc-row projection is filter-independent and changes only on
    // a graph rebuild, so it is memoized per generation (build_vault_tree_rows +
    // the vault_tree_rows ring) instead of re-projecting + re-sorting every `doc:`
    // node on each poll. `vault_tree_rows_at` returns the rows AND the generation
    // they belong to as ONE consistent pair (D1) — a bare `generation.load()`
    // beside a separate rows read could report a newer generation than the served
    // rows, poisoning a client's delta baseline. The handler paginates the cached
    // slice per request.
    let (generation, entries) = cell.vault_tree_rows_at();
    // Cursor pagination on the unbounded listing (contract §2, audit N8). Clamp the
    // page size (robustness M2): a client-supplied page_size must not defeat the
    // cursor cap and pull the whole listing in one response. 2000 is a generous
    // upper bound; the default stays 500.
    let page_size = params.page_size.unwrap_or(500).min(2000);
    let (page, next_cursor) = engine_query::envelope::paginate(
        &entries,
        |e| e["stem"].as_str().unwrap_or_default(),
        params.cursor.as_deref(),
        page_size,
    );
    Ok(super::envelope(
        json!({"entries": page, "generation": generation}),
        super::query_tiers(&cell),
        next_cursor,
    ))
}

#[derive(Deserialize)]
pub struct VaultTreeDeltaParams {
    pub scope: String,
    /// The client's held generation — the baseline to diff the current rows against.
    pub since: u64,
}

/// GET `/vault-tree/delta?scope=&since=<generation>` (D3): the stem-keyed diff from
/// the client's held generation to the current one. Read-only; the diff is O(N)
/// over in-memory rows. An unknown `since` (evicted/restarted/never-served) yields
/// `full_required` — an honest full-drain instruction, never a wrong patch — and
/// `since == current` yields an empty delta. Every response rides the shared
/// envelope with the tiers block.
pub async fn vault_tree_delta(
    State(state): State<Arc<AppState>>,
    Query(params): Query<VaultTreeDeltaParams>,
) -> ApiResult {
    let cell = super::query::validate_scope(&state, &params.scope)?;
    let data = match cell.vault_tree_delta(params.since) {
        VaultTreeDelta::Unchanged { generation } => json!({
            "since": params.since,
            "generation": generation,
            "changed": [],
            "removed": [],
        }),
        VaultTreeDelta::FullRequired { generation } => json!({
            "generation": generation,
            "full_required": true,
        }),
        VaultTreeDelta::Delta {
            since,
            generation,
            changed,
            removed,
        } => json!({
            "since": since,
            "generation": generation,
            "changed": changed,
            "removed": removed,
        }),
    };
    Ok(super::envelope(data, super::query_tiers(&cell), None))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path as FsPath;

    /// A warmed single-doc vault fixture, indexed once (generation bumped past 0).
    fn vault_fixture() -> (tempfile::TempDir, Arc<AppState>) {
        let dir = tempfile::tempdir().unwrap();
        write_doc(dir.path(), "2026-06-12-a-plan", "a");
        let state = crate::app::build_state(dir.path().to_path_buf());
        state.active_cell().rebuild_and_swap().unwrap();
        (dir, state)
    }

    /// The active-scope registry token the handlers resolve (mirrors the ops.rs
    /// git tests) — `ScopeRef` itself is not a wire token.
    fn active_scope(state: &AppState) -> String {
        state
            .active_scope
            .read()
            .map(|s| s.clone())
            .unwrap_or_else(|e| e.into_inner().clone())
    }

    fn write_doc(root: &FsPath, stem: &str, feature: &str) {
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::write(
            root.join(format!(".vault/plan/{stem}.md")),
            format!("---\ntags:\n  - '#plan'\n  - '#{feature}'\n---\n\nbody\n"),
        )
        .unwrap();
    }

    #[tokio::test]
    async fn full_route_carries_the_serving_generation() {
        // D1: the full /vault-tree page carries the generation the rows belong to,
        // so a client can use it as a delta baseline.
        let (_dir, state) = vault_fixture();
        let scope = active_scope(&state);
        let result = vault_tree(
            State(state),
            Query(VaultTreeParams {
                scope,
                cursor: None,
                page_size: None,
            }),
        )
        .await
        .expect("full route serves");
        let Json(body) = result;
        assert!(
            body["data"]["generation"].as_u64().is_some(),
            "the full route carries a numeric generation: {body}"
        );
        assert!(
            body["data"]["entries"].is_array(),
            "the full route still carries the paginated entries"
        );
    }

    #[tokio::test]
    async fn delta_short_circuits_when_since_is_current() {
        // D3: since == current generation is an empty delta, never a full re-drain.
        let (_dir, state) = vault_fixture();
        let cell = state.active_cell();
        let current = cell.vault_tree_rows_at().0;
        let scope = active_scope(&state);
        let result = vault_tree_delta(
            State(state),
            Query(VaultTreeDeltaParams {
                scope,
                since: current,
            }),
        )
        .await
        .expect("delta serves");
        let Json(body) = result;
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
        // held (a previous process, or evicted) is answered with full_required —
        // an honest instruction, never a fabricated patch.
        let (_dir, state) = vault_fixture();
        let scope = active_scope(&state);
        let result = vault_tree_delta(
            State(state),
            Query(VaultTreeDeltaParams {
                scope,
                since: 999_999,
            }),
        )
        .await
        .expect("delta serves");
        let Json(body) = result;
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
    async fn delta_diffs_a_real_rebuild_by_stem() {
        // D3 end-to-end: a doc added between generations shows up as a `changed`
        // row keyed by its stem when diffing the prior generation against current.
        let (dir, state) = vault_fixture();
        let cell = state.active_cell();
        let baseline = cell.vault_tree_rows_at().0;
        // Add a second document and reindex — a new generation with a new row.
        write_doc(dir.path(), "2026-06-13-b-plan", "b");
        cell.rebuild_and_swap().unwrap();
        let scope = active_scope(&state);
        let result = vault_tree_delta(
            State(state),
            Query(VaultTreeDeltaParams {
                scope,
                since: baseline,
            }),
        )
        .await
        .expect("delta serves");
        let Json(body) = result;
        assert_eq!(body["data"]["since"], baseline);
        let changed = body["data"]["changed"].as_array().unwrap();
        assert!(
            changed.iter().any(|row| row["stem"] == "2026-06-13-b-plan"),
            "the added doc is a changed row: {body}"
        );
        assert_eq!(
            body["data"]["removed"].as_array().unwrap().len(),
            0,
            "nothing was removed"
        );
    }
}
