//! Temporal endpoints (contract §5, W03.P11.S50): events with engine-side
//! bucketing, blob-true as-of snapshots, and the ordered diff log on the
//! single delta clock.

use std::sync::Arc;

use axum::Json;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use engine_query::events::{BucketMode, bucket_events, parse_bucket_param};
use engine_store::EventRow;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::app::AppState;
use crate::routes::query::validate_scope;

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

#[derive(Deserialize)]
pub struct EventsParams {
    pub scope: String,
    #[serde(default)]
    pub from: Option<i64>,
    #[serde(default)]
    pub to: Option<i64>,
    #[serde(default)]
    pub kinds: Option<String>,
    #[serde(default)]
    pub bucket: Option<String>,
}

pub async fn events(
    State(state): State<Arc<AppState>>,
    Query(params): Query<EventsParams>,
) -> ApiResult {
    validate_scope(&state, &params.scope)?;
    let mode = match params.bucket.as_deref() {
        None => BucketMode::Raw,
        Some(p) => parse_bucket_param(p).ok_or_else(|| {
            super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!("unknown bucket `{p}`"),
            )
        })?,
    };
    // An inverted range is a client error, not a silently-empty result —
    // fail fast before the commit walk (hardening, 2026-06-13).
    if let (Some(from), Some(to)) = (params.from, params.to)
        && from > to
    {
        return Err(super::api_error(
            &state,
            StatusCode::BAD_REQUEST,
            format!("events range: from ({from}) must be <= to ({to})"),
        ));
    }
    // Event sourcing shared with the CLI verb via the query core (G7).
    let workspace = ingest_git::workspace::Workspace::discover(&state.root)
        .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?;
    // Node correlation bounded to graph-known nodes + the code-id cap
    // (addendum S05) — commit pulses address nodes the stage can light.
    let graph = state.graph_arc();
    let mut rows: Vec<EventRow> =
        engine_query::events::commit_rows(&workspace, "HEAD", 5000, Some(&graph))
            .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e))?;
    if let Some(kinds) = &params.kinds {
        let wanted: Vec<&str> = kinds.split(',').collect();
        rows.retain(|r| wanted.contains(&r.kind.as_str()));
    }
    let from = params.from.unwrap_or(0);
    let to = params.to.unwrap_or(i64::MAX);
    rows.retain(|r| r.ts >= from && r.ts <= to);
    let upper = to.min(rows.last().map_or(from, |r| r.ts));
    let payload = bucket_events(&rows, from, upper, mode);
    Ok(super::envelope(
        json!({"payload": payload}),
        super::query_tiers(&state),
        None,
    ))
}

#[derive(Deserialize)]
pub struct AsofParams {
    pub scope: String,
    /// A ref name, commit sha, or millisecond timestamp.
    pub t: String,
    /// `document` (default) or `feature` — a historical keyframe in the same
    /// species as the live view (S50: the constellation time-travels in its
    /// own feature species, not as a disjoint document graph).
    #[serde(default)]
    pub granularity: Option<String>,
}

pub async fn graph_asof(
    State(state): State<Arc<AppState>>,
    Query(params): Query<AsofParams>,
) -> ApiResult {
    validate_scope(&state, &params.scope)?;
    let granularity = super::query::parse_granularity(&state, params.granularity.as_deref())?;
    // Scope the historical snapshot to the SERVED WORKTREE (same as the
    // present view), NOT the ref name: the ref is the TIME axis (`t`), not the
    // corpus-view label. Stamping the ref as the facet scope makes two
    // snapshots differ by label alone, which floods `/graph/diff` with
    // spurious `change` deltas (2026-06-13 hardening). graph_query filters by
    // this same scope, so both must agree.
    let scope = state.scope.clone();
    let graph = engine_graph::asof::asof_graph(&state.root, &params.t, &scope, 0)
        .map_err(|e| super::revision_error(&state, &params.t, e))?;
    let slice = engine_query::graph::graph_query(
        &graph,
        &scope,
        engine_query::filter::Filter::default(),
        granularity,
    )
    .map_err(|e| super::api_error(&state, StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(super::envelope(
        json!({
            "t": params.t,
            "nodes": slice.nodes,
            "edges": slice.edges,
            // Feature granularity carries the constellation meta-edges so a
            // historical keyframe matches the live constellation exactly.
            "meta_edges": slice.meta_edges,
            // A HISTORICAL keyframe carries no live-clock position (N2):
            // splicing to LIVE requires a present keyframe whose deltas
            // arrive on the stream's sequence.
            "last_seq": Value::Null,
        }),
        serde_json::to_value(engine_query::envelope::asof_tiers_block()).expect("tiers serialize"),
        None,
    ))
}

#[derive(Deserialize)]
pub struct DiffParams {
    pub scope: String,
    pub from: String,
    pub to: String,
    /// `document` (default) or `feature` — feature returns the projected
    /// meta-edge/feature-node delta log (S50), each entry tagged `feature`.
    #[serde(default)]
    pub granularity: Option<String>,
}

pub async fn graph_diff(
    State(state): State<Arc<AppState>>,
    Query(params): Query<DiffParams>,
) -> ApiResult {
    validate_scope(&state, &params.scope)?;
    let granularity = super::query::parse_granularity(&state, params.granularity.as_deref())?;
    // BOTH endpoints are scoped to the SAME served worktree so the delta log
    // reflects CONTENT changes (content_hash, presence, lifecycle, edges)
    // between the refs — not the ref LABEL. Using each ref name as the facet
    // scope made every node/edge common to both commits a spurious `change`
    // (2026-06-13: HEAD~3..HEAD reported 8415 changes / 1 add — the diff was
    // useless). The ref distinction lives in `from`/`to` and each entry's `t`.
    let scope = state.scope.clone();
    // Equal-ref fast path: if `from` and `to` resolve to the SAME commit (the
    // common `HEAD` vs its sha case, or a degenerate request), the delta log is
    // empty by definition — return it without building either as-of graph,
    // which on a large corpus each cost ~20s (sweep HIGH, 2026-06-13). Resolve
    // is cheap (no tree walk / no core subprocess); a resolve failure falls
    // through to the build path so the existing per-ref error shaping fires.
    if let (Ok(from_sha), Ok(to_sha)) = (
        engine_graph::asof::resolve_ref(&state.root, &params.from),
        engine_graph::asof::resolve_ref(&state.root, &params.to),
    ) && from_sha == to_sha
    {
        return Ok(super::envelope(
            json!({"deltas": [], "last_seq": 0, "clock": "result-local"}),
            serde_json::to_value(engine_query::envelope::asof_tiers_block())
                .expect("tiers serialize"),
            None,
        ));
    }
    let from_graph = engine_graph::asof::asof_graph(&state.root, &params.from, &scope, 0)
        .map_err(|e| super::revision_error(&state, &params.from, e))?;
    let to_graph = engine_graph::asof::asof_graph(&state.root, &params.to, &scope, 0)
        .map_err(|e| super::revision_error(&state, &params.to, e))?;

    // Historical diffs number RESULT-LOCALLY (audit N2): a scrub must
    // never burn live-clock positions or manufacture stream gaps. Only
    // `commit_graph` advances the shared atomic; `last_seq` here is the
    // local log's end, and splicing to LIVE goes through a present
    // keyframe + the stream's own sequence space. At `feature` granularity the
    // engine projects the document diff to the constellation species (S50), so
    // a scrub re-keyframes and replays in its own species; entries are tagged.
    let t = crate::app::now_ms();
    let (deltas, last_seq) = match granularity {
        engine_query::graph::Granularity::Document => {
            let log = engine_graph::diff::diff(&from_graph, &to_graph, t, 0);
            (
                serde_json::to_value(&log.entries).expect("deltas serialize"),
                log.last_seq,
            )
        }
        engine_query::graph::Granularity::Feature => {
            let (entries, last_seq) =
                engine_query::graph::feature_delta(&from_graph, &to_graph, &scope, t, 0);
            (Value::Array(entries), last_seq)
        }
    };
    Ok(super::envelope(
        json!({
            "deltas": deltas,
            "last_seq": last_seq,
            "clock": "result-local",
        }),
        serde_json::to_value(engine_query::envelope::asof_tiers_block()).expect("tiers serialize"),
        None,
    ))
}
