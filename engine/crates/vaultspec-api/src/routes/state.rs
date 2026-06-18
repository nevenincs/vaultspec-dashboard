//! Bounded dashboard-state session surface (dashboard-state-centralization W01).
//!
//! This route owns only the user's current dashboard intent for the browser
//! session: scope, selection, hover, filters, date range, timeline mode, graph
//! granularity, salience lens/focus, representation mode, panel state, and graph
//! bounds. It never writes `.vault`, git state, or graph semantics; stable node
//! ids are validated against the current live graph before a patch is accepted.

use std::collections::VecDeque;
use std::sync::Arc;

use axum::Json;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use engine_model::NodeId;
use engine_query::filter::{DateRange, Filter};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::app::{AppState, ScopeCell};

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

const DASHBOARD_STATE_SCOPE_CAP: usize = 16;
const MAX_SELECTED_IDS: usize = 256;
const MAX_NODE_ID_LEN: usize = 512;
const MAX_PANEL_TAB_LEN: usize = 32;
const MAX_BOUND_SIZE: f64 = 1_000_000.0;

/// A bounded per-process LRU of dashboard-state snapshots. The cap is declared
/// at creation and enforced on every insert, so a long multi-worktree session
/// cannot accumulate one retained snapshot per visited scope forever.
#[derive(Debug)]
pub struct DashboardStateSlot {
    entries: VecDeque<(String, DashboardState)>,
}

impl DashboardStateSlot {
    pub fn new() -> Self {
        Self {
            entries: VecDeque::with_capacity(DASHBOARD_STATE_SCOPE_CAP),
        }
    }

    fn snapshot_for(&mut self, scope: &str) -> DashboardState {
        if let Some(pos) = self.entries.iter().position(|(stored, _)| stored == scope) {
            let (_, snapshot) = self.entries.remove(pos).expect("position found");
            self.entries
                .push_back((scope.to_string(), snapshot.clone()));
            return snapshot;
        }
        let snapshot = DashboardState::new(scope.to_string());
        self.insert(snapshot.clone());
        snapshot
    }

    fn insert(&mut self, snapshot: DashboardState) {
        if let Some(pos) = self
            .entries
            .iter()
            .position(|(stored, _)| stored == &snapshot.scope)
        {
            self.entries.remove(pos);
        }
        if self.entries.len() == DASHBOARD_STATE_SCOPE_CAP {
            self.entries.pop_front();
        }
        self.entries.push_back((snapshot.scope.clone(), snapshot));
    }
}

impl Default for DashboardStateSlot {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DashboardState {
    pub scope: String,
    pub selected_ids: Vec<String>,
    pub hovered_id: Option<String>,
    pub filters: Filter,
    pub date_range: DateRange,
    pub timeline_mode: DashboardTimelineMode,
    pub graph_granularity: GraphGranularity,
    pub salience_lens: SalienceLens,
    pub salience_focus: Option<String>,
    pub representation_mode: RepresentationMode,
    pub panel_state: PanelState,
    pub graph_bounds: GraphBounds,
}

impl DashboardState {
    fn new(scope: String) -> Self {
        Self {
            scope,
            selected_ids: Vec::new(),
            hovered_id: None,
            filters: Filter::default(),
            date_range: DateRange::default(),
            timeline_mode: DashboardTimelineMode::Live,
            graph_granularity: GraphGranularity::Feature,
            salience_lens: SalienceLens::Status,
            salience_focus: None,
            representation_mode: RepresentationMode::Connectivity,
            panel_state: PanelState::default(),
            graph_bounds: GraphBounds::default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum DashboardTimelineMode {
    Live,
    TimeTravel { at: i64 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum GraphGranularity {
    Document,
    Feature,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SalienceLens {
    Status,
    Design,
}

impl SalienceLens {
    fn as_wire(self) -> &'static str {
        match self {
            SalienceLens::Status => "status",
            SalienceLens::Design => "design",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RepresentationMode {
    Connectivity,
    Temporal,
    Lineage,
    Hierarchical,
    Radial,
    Community,
    Semantic,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct PanelState {
    pub left_collapsed: bool,
    pub right_collapsed: bool,
    pub right_tab: String,
}

impl Default for PanelState {
    fn default() -> Self {
        Self {
            left_collapsed: false,
            right_collapsed: false,
            right_tab: "status".to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct GraphBounds {
    pub shape: BoundShape,
    pub size: f64,
}

impl Default for GraphBounds {
    fn default() -> Self {
        Self {
            shape: BoundShape::Free,
            size: 0.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum BoundShape {
    #[default]
    Free,
    Circle,
    Rect,
}

#[derive(Debug, Deserialize, Default)]
pub struct DashboardStateQuery {
    #[serde(default)]
    pub scope: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(deny_unknown_fields, default)]
pub struct DashboardStatePatch {
    pub scope: Option<String>,
    pub selected_ids: Option<Vec<String>>,
    pub hovered_id: PatchValue<String>,
    pub filters: Option<Filter>,
    pub date_range: Option<DateRange>,
    pub timeline_mode: Option<DashboardTimelineMode>,
    pub graph_granularity: Option<GraphGranularity>,
    pub salience_lens: Option<SalienceLens>,
    pub salience_focus: PatchValue<String>,
    pub representation_mode: Option<RepresentationMode>,
    pub panel_state: Option<PanelState>,
    pub graph_bounds: Option<GraphBounds>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum PatchValue<T> {
    #[default]
    Missing,
    Null,
    Value(T),
}

impl<'de, T> Deserialize<'de> for PatchValue<T>
where
    T: Deserialize<'de>,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        Option::<T>::deserialize(deserializer).map(|value| match value {
            Some(value) => PatchValue::Value(value),
            None => PatchValue::Null,
        })
    }
}

pub async fn get_dashboard_state(
    State(state): State<Arc<AppState>>,
    Query(params): Query<DashboardStateQuery>,
) -> ApiResult {
    let scope = resolve_scope_param(&state, params.scope.as_deref());
    let cell = super::query::validate_scope(&state, &scope)?;
    let canonical_scope = super::scope_token(&cell.root);
    let snapshot = {
        let mut slot = state
            .dashboard_state
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        slot.snapshot_for(&canonical_scope)
    };
    Ok(super::envelope(
        serde_json::to_value(snapshot).expect("dashboard state serializes"),
        super::query_tiers(&cell),
        None,
    ))
}

pub async fn patch_dashboard_state(
    State(state): State<Arc<AppState>>,
    Json(patch): Json<DashboardStatePatch>,
) -> ApiResult {
    let scope = resolve_scope_param(&state, patch.scope.as_deref());
    let cell = super::query::validate_scope(&state, &scope)?;
    let canonical_scope = super::scope_token(&cell.root);
    let snapshot = {
        let mut slot = state
            .dashboard_state
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let current = slot.snapshot_for(&canonical_scope);
        let snapshot = apply_patch(&state, &cell, current, patch, canonical_scope)?;
        slot.insert(snapshot.clone());
        snapshot
    };

    Ok(super::envelope(
        serde_json::to_value(snapshot).expect("dashboard state serializes"),
        super::query_tiers(&cell),
        None,
    ))
}

fn resolve_scope_param(state: &AppState, requested: Option<&str>) -> String {
    requested.map(str::to_string).unwrap_or_else(|| {
        state
            .active_scope
            .read()
            .map(|s| s.clone())
            .unwrap_or_else(|e| e.into_inner().clone())
    })
}

fn apply_patch(
    state: &AppState,
    cell: &ScopeCell,
    mut current: DashboardState,
    patch: DashboardStatePatch,
    canonical_scope: String,
) -> Result<DashboardState, (StatusCode, Json<Value>)> {
    current.scope = canonical_scope;
    if let Some(selected_ids) = patch.selected_ids {
        current.selected_ids = validate_selected_ids(state, cell, selected_ids)?;
    }
    match patch.hovered_id {
        PatchValue::Missing => {}
        PatchValue::Null => current.hovered_id = None,
        PatchValue::Value(id) => {
            current.hovered_id = Some(validate_node_id(state, cell, &id, "hovered_id")?)
        }
    }
    if let Some(filters) = patch.filters {
        current.filters = validate_filter(state, filters)?;
    }
    if let Some(date_range) = patch.date_range {
        validate_date_range(state, &date_range, "date_range")?;
        current.date_range = date_range;
    }
    if let Some(timeline_mode) = patch.timeline_mode {
        current.timeline_mode = timeline_mode;
    }
    if let Some(graph_granularity) = patch.graph_granularity {
        current.graph_granularity = graph_granularity;
    }
    if let Some(salience_lens) = patch.salience_lens {
        let raw = salience_lens.as_wire();
        let _ = super::query::parse_lens(state, Some(raw))?;
        current.salience_lens = salience_lens;
    }
    match patch.salience_focus {
        PatchValue::Missing => {}
        PatchValue::Null => current.salience_focus = None,
        PatchValue::Value(id) => {
            current.salience_focus = Some(validate_node_id(state, cell, &id, "salience_focus")?);
        }
    }
    if let Some(representation_mode) = patch.representation_mode {
        current.representation_mode = representation_mode;
    }
    if let Some(panel_state) = patch.panel_state {
        validate_panel_state(state, &panel_state)?;
        current.panel_state = panel_state;
    }
    if let Some(graph_bounds) = patch.graph_bounds {
        validate_graph_bounds(state, &graph_bounds)?;
        current.graph_bounds = graph_bounds;
    }
    validate_date_range(state, &current.date_range, "date_range")?;
    current.filters.date_range = None;
    Ok(current)
}

fn validate_filter(
    state: &AppState,
    mut filter: Filter,
) -> Result<Filter, (StatusCode, Json<Value>)> {
    if let Some(date_range) = filter.date_range.as_ref() {
        validate_date_range(state, date_range, "filters.date_range")?;
    }
    // Dashboard-state owns date intent in the top-level `date_range` field.
    // `Filter` still accepts `date_range` for graph-query wire compatibility, but
    // persisting it inside `filters` gives the dashboard two competing authors.
    filter.date_range = None;
    filter
        .validated()
        .map_err(|err| super::api_error(state, StatusCode::BAD_REQUEST, err.to_string()))
}

fn validate_selected_ids(
    state: &AppState,
    cell: &ScopeCell,
    ids: Vec<String>,
) -> Result<Vec<String>, (StatusCode, Json<Value>)> {
    if ids.len() > MAX_SELECTED_IDS {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "selected_ids has {} entries; maximum is {MAX_SELECTED_IDS}",
                ids.len()
            ),
        ));
    }
    ids.into_iter()
        .map(|id| validate_node_id(state, cell, &id, "selected_ids"))
        .collect()
}

fn validate_node_id(
    state: &AppState,
    cell: &ScopeCell,
    id: &str,
    field: &str,
) -> Result<String, (StatusCode, Json<Value>)> {
    if id.is_empty()
        || id.len() > MAX_NODE_ID_LEN
        || !id.contains(':')
        || id.chars().any(char::is_control)
    {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("{field} `{id}` is not a stable node id"),
        ));
    }
    let graph = cell.graph_arc();
    if graph.node(&NodeId(id.to_string())).is_none() {
        if let Some(tag) = id.strip_prefix("feature:")
            && !tag.is_empty()
            && graph
                .nodes()
                .any(|node| node.feature_tags.iter().any(|feature| feature == tag))
        {
            return Ok(id.to_string());
        }
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("{field} `{id}` is not present in the current graph"),
        ));
    }
    Ok(id.to_string())
}

fn validate_date_range(
    state: &AppState,
    range: &DateRange,
    field: &str,
) -> Result<(), (StatusCode, Json<Value>)> {
    if let Some(from) = range.from.as_deref() {
        validate_iso_date(state, from, &format!("{field}.from"))?;
    }
    if let Some(to) = range.to.as_deref() {
        validate_iso_date(state, to, &format!("{field}.to"))?;
    }
    if let (Some(from), Some(to)) = (range.from.as_deref(), range.to.as_deref())
        && from > to
    {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("{field} `from` must be <= `to`"),
        ));
    }
    Ok(())
}

fn validate_iso_date(
    state: &AppState,
    value: &str,
    field: &str,
) -> Result<(), (StatusCode, Json<Value>)> {
    let valid = value.len() == 10
        && value.as_bytes()[4] == b'-'
        && value.as_bytes()[7] == b'-'
        && value
            .bytes()
            .enumerate()
            .all(|(i, b)| matches!(i, 4 | 7) || b.is_ascii_digit());
    if !valid {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("{field} `{value}` must be an ISO yyyy-mm-dd date"),
        ));
    }
    Ok(())
}

fn validate_panel_state(
    state: &AppState,
    panel_state: &PanelState,
) -> Result<(), (StatusCode, Json<Value>)> {
    if panel_state.right_tab.len() > MAX_PANEL_TAB_LEN
        || !matches!(
            panel_state.right_tab.as_str(),
            "status" | "changes" | "search"
        )
    {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            "panel_state.right_tab must be one of status, changes, search".to_string(),
        ));
    }
    Ok(())
}

fn validate_graph_bounds(
    state: &AppState,
    bounds: &GraphBounds,
) -> Result<(), (StatusCode, Json<Value>)> {
    if !bounds.size.is_finite() || !(0.0..=MAX_BOUND_SIZE).contains(&bounds.size) {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("graph_bounds.size must be finite and between 0 and {MAX_BOUND_SIZE}"),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use serde_json::{Value, json};
    use tower::ServiceExt;

    fn fixture_state() -> (tempfile::TempDir, Arc<AppState>) {
        let dir = tempfile::tempdir().unwrap();
        let vault = dir.path().join(".vault");
        std::fs::create_dir_all(vault.join("plan")).unwrap();
        std::fs::write(
            vault.join("plan/2026-06-17-state-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#state'\n---\n\nDashboard state fixture.\n",
        )
        .unwrap();
        let state = crate::app::build_state(dir.path().to_path_buf());
        (dir, state)
    }

    async fn request_json(
        router: axum::Router,
        method: axum::http::Method,
        path: &str,
        token: &str,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        let mut builder = Request::builder()
            .method(method)
            .uri(path)
            .header("host", "127.0.0.1")
            .header("authorization", format!("Bearer {token}"));
        let body = match body {
            Some(value) => {
                builder = builder.header("content-type", "application/json");
                Body::from(value.to_string())
            }
            None => Body::empty(),
        };
        let response = router.oneshot(builder.body(body).unwrap()).await.unwrap();
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .unwrap();
        let body = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        (status, body)
    }

    fn scope(state: &AppState) -> String {
        state.workspace_root.to_string_lossy().replace('\\', "/")
    }

    #[tokio::test]
    async fn get_serves_the_default_snapshot_with_the_tiers_block() {
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let path = format!("/dashboard-state?scope={}", scope(&state));
        let router = crate::build_router(state);

        let (status, body) =
            request_json(router, axum::http::Method::GET, &path, &token, None).await;
        assert_eq!(status, StatusCode::OK, "GET dashboard-state: {body}");
        assert_eq!(body["data"]["selected_ids"], json!([]));
        assert_eq!(body["data"]["timeline_mode"]["kind"], "live");
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "success envelope carries tiers: {body}"
        );
    }

    #[tokio::test]
    async fn patch_updates_the_snapshot_without_leaving_the_envelope_path() {
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let served_scope = scope(&state);
        let router = crate::build_router(state);
        let body = json!({
            "scope": served_scope,
            "selected_ids": ["doc:2026-06-17-state-plan"],
            "hovered_id": "doc:2026-06-17-state-plan",
            "filters": {
                "feature_tags": ["state"],
                "date_range": {"from": "2025-01-01", "to": "2025-01-31"}
            },
            "date_range": {"from": "2026-06-01", "to": "2026-06-30"},
            "timeline_mode": {"kind": "time-travel", "at": 42},
            "graph_granularity": "feature",
            "salience_lens": "design",
            "salience_focus": "doc:2026-06-17-state-plan",
            "representation_mode": "radial",
            "panel_state": {
                "left_collapsed": true,
                "right_collapsed": false,
                "right_tab": "changes"
            },
            "graph_bounds": {"shape": "rect", "size": 2500.0}
        });

        let (status, body) = request_json(
            router.clone(),
            axum::http::Method::PATCH,
            "/dashboard-state",
            &token,
            Some(body),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "PATCH dashboard-state: {body}");
        assert_eq!(body["data"]["selected_ids"][0], "doc:2026-06-17-state-plan");
        assert_eq!(body["data"]["filters"]["feature_tags"][0], "state");
        assert!(
            body["data"]["filters"]["date_range"].is_null(),
            "date intent is owned by top-level date_range only: {body}"
        );
        assert_eq!(body["data"]["date_range"]["from"], "2026-06-01");
        assert_eq!(body["data"]["date_range"]["to"], "2026-06-30");
        assert_eq!(body["data"]["salience_lens"], "design");
        assert_eq!(body["data"]["panel_state"]["right_tab"], "changes");
        assert_eq!(body["data"]["graph_bounds"]["shape"], "rect");
        assert_eq!(body["data"]["graph_bounds"]["size"], 2500.0);
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "patch success envelope carries tiers: {body}"
        );
    }

    #[tokio::test]
    async fn partial_patches_merge_against_the_latest_snapshot() {
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let served_scope = scope(&state);
        let router = crate::build_router(state);

        let filters_patch = request_json(
            router.clone(),
            axum::http::Method::PATCH,
            "/dashboard-state",
            &token,
            Some(json!({
                "scope": served_scope,
                "filters": {"feature_tags": ["state"]}
            })),
        );
        let range_patch = request_json(
            router.clone(),
            axum::http::Method::PATCH,
            "/dashboard-state",
            &token,
            Some(json!({
                "scope": served_scope,
                "date_range": {"from": "2026-06-01", "to": "2026-06-30"}
            })),
        );
        let ((filters_status, filters_body), (range_status, range_body)) =
            tokio::join!(filters_patch, range_patch);
        assert_eq!(
            filters_status,
            StatusCode::OK,
            "filters patch succeeds: {filters_body}"
        );
        assert_eq!(
            range_status,
            StatusCode::OK,
            "date range patch succeeds: {range_body}"
        );

        let path = format!("/dashboard-state?scope={served_scope}");
        let (status, body) =
            request_json(router, axum::http::Method::GET, &path, &token, None).await;
        assert_eq!(status, StatusCode::OK, "GET merged dashboard-state: {body}");
        assert_eq!(body["data"]["filters"]["feature_tags"][0], "state");
        assert_eq!(body["data"]["date_range"]["from"], "2026-06-01");
        assert_eq!(body["data"]["date_range"]["to"], "2026-06-30");
    }

    #[tokio::test]
    async fn feature_granularity_selection_accepts_synthesized_feature_ids() {
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let served_scope = scope(&state);
        let router = crate::build_router(state);

        let (status, body) = request_json(
            router.clone(),
            axum::http::Method::PATCH,
            "/dashboard-state",
            &token,
            Some(json!({
                "scope": served_scope,
                "selected_ids": ["feature:state"],
                "hovered_id": "feature:state"
            })),
        )
        .await;
        assert_eq!(
            status,
            StatusCode::OK,
            "feature node selection is accepted: {body}"
        );
        assert_eq!(body["data"]["selected_ids"][0], "feature:state");
        assert_eq!(body["data"]["hovered_id"], "feature:state");
    }

    #[tokio::test]
    async fn validation_errors_are_tiered_400s() {
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let served_scope = scope(&state);
        let router = crate::build_router(state);

        let (status, body) = request_json(
            router.clone(),
            axum::http::Method::PATCH,
            "/dashboard-state",
            &token,
            Some(json!({
                "scope": served_scope,
                "salience_focus": "doc:not-present"
            })),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "unknown node id: {body}");
        assert!(body["error"].is_string());
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "validation error carries tiers: {body}"
        );
    }

    #[tokio::test]
    async fn selected_ids_and_date_ranges_are_bounded_and_rejected_when_invalid() {
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let served_scope = scope(&state);
        let router = crate::build_router(state);
        let too_many = vec!["doc:2026-06-17-state-plan"; MAX_SELECTED_IDS + 1];

        let (status, body) = request_json(
            router.clone(),
            axum::http::Method::PATCH,
            "/dashboard-state",
            &token,
            Some(json!({
                "scope": served_scope,
                "selected_ids": too_many
            })),
        )
        .await;
        assert_eq!(
            status,
            StatusCode::BAD_REQUEST,
            "selected id cap rejects: {body}"
        );
        assert!(body["tiers"].is_object(), "cap error carries tiers: {body}");

        let (status, body) = request_json(
            router.clone(),
            axum::http::Method::PATCH,
            "/dashboard-state",
            &token,
            Some(json!({
                "scope": served_scope,
                "date_range": {"from": "2026-06-30", "to": "2026-06-01"}
            })),
        )
        .await;
        assert_eq!(
            status,
            StatusCode::BAD_REQUEST,
            "inverted date range rejects: {body}"
        );
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "date error carries tiers: {body}"
        );

        let (status, body) = request_json(
            router,
            axum::http::Method::PATCH,
            "/dashboard-state",
            &token,
            Some(json!({
                "scope": served_scope,
                "filters": {
                    "date_range": {"from": "2026-06-30", "to": "2026-06-01"}
                }
            })),
        )
        .await;
        assert_eq!(
            status,
            StatusCode::BAD_REQUEST,
            "duplicate filters.date_range still validates before normalization: {body}"
        );
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "filters.date_range error carries tiers: {body}"
        );
    }
}
