//! Top-level session and settings endpoints (user-state-persistence W03.P06).
//!
//! These are the orchestration-crate surface the foundation contract reserved
//! (§9): the durable "where am I and what am I looking at" session and the user
//! settings, read and written through the shared [`vaultspec_session::UserState`]
//! handle. They persist ONLY session/settings rows in the best-effort store —
//! never `.vault/` documents, never git refs (the read-and-infer fence the
//! orchestration crate inherits).
//!
//! Every response — success AND error — rides the shared `{data, tiers}`
//! envelope so the per-tier degradation block is always present
//! (every-wire-response-carries-the-tiers-block). The tiers come from the
//! active-scope cell, exactly like the other workspace-level routes.
//!
//! # Mutex discipline (load-bearing)
//!
//! The shared `user_state` handle wraps a `rusqlite::Connection` behind a std
//! `Mutex` (it is `!Sync`). A std `MutexGuard` held across an `.await` is a
//! correctness bug — it would block the async runtime and risks a deadlock —
//! so every handler reads/writes user-state inside a SCOPED block that drops
//! the guard before any `.await`. The handlers here are not themselves async
//! over the lock (no `.await` between lock and unlock), but the discipline is
//! kept explicit so a future edit cannot quietly introduce one.

use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::app::AppState;

/// Cap the opaque dock workspace-layout blob (editor-dock-workspace,
/// bounded-by-default): the serialized open-tab set is a small bounded list of
/// node ids, so 64 KiB is generous headroom while keeping the per-scope durable
/// session blob bounded.
const MAX_WORKSPACE_LAYOUT_LEN: usize = 64 * 1024;

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

/// The workspace key under which session/settings rows are stored: the launch
/// root's canonical token. One workspace, one key (matching boot in `lib.rs`).
fn workspace_key(state: &AppState) -> String {
    super::scope_token(&state.workspace_root)
}

/// The currently-active scope token (the default scope when a request supplies
/// none).
fn active_scope_token(state: &AppState) -> String {
    state
        .active_scope
        .read()
        .map(|s| s.clone())
        .unwrap_or_else(|e| e.into_inner().clone())
}

/// A scope/path token still resolves on disk. The backend must never surface a
/// scope it cannot deliver — a removed worktree would otherwise strand the picker.
/// Read-only `is_dir` stat over the forward-slash token (Windows resolves it).
fn path_token_exists(token: &str) -> bool {
    !token.is_empty() && std::path::Path::new(token).is_dir()
}

/// The validated session selections the backend will surface. PURE (no I/O, no
/// lock) so the validate-before-surface policy is unit-testable with an injected
/// existence predicate. `session_data` calls it with the real `path_token_exists`.
struct ValidatedSelections {
    active_workspace: Option<String>,
    active_scope: String,
    recent_scopes: Vec<(String, String)>,
}

/// Sanitize the persisted selections against deliverable reality:
///  - `active_workspace`: kept only if it still names a REGISTERED root, else the
///    deterministic `fallback_ws` (launch / first registered / none).
///  - `active_scope`: kept only if it still resolves on disk, else cleared.
///  - `recent_scopes`: drop any whose workspace is unregistered OR whose worktree
///    no longer resolves on disk.
fn validate_session_selections(
    registered: &std::collections::HashSet<String>,
    fallback_ws: Option<String>,
    active_workspace_raw: Option<String>,
    active_scope_raw: &str,
    global_recents: Vec<(String, String)>,
    exists: impl Fn(&str) -> bool,
) -> ValidatedSelections {
    let active_workspace = match active_workspace_raw {
        Some(ws) if registered.contains(&ws) => Some(ws),
        _ => fallback_ws,
    };
    let active_scope = if exists(active_scope_raw) {
        active_scope_raw.to_string()
    } else {
        String::new()
    };
    let recent_scopes = global_recents
        .into_iter()
        .filter(|(ws, scope)| registered.contains(ws) && exists(scope))
        .collect();
    ValidatedSelections {
        active_workspace,
        active_scope,
        recent_scopes,
    }
}

/// Build the session `data` block from the shared user-state handle, VALIDATING
/// every persisted selection against deliverable reality before surfacing it
/// (the backend-underpins-the-frontend mandate). The user-state store is
/// best-effort and can drift from disk (a worktree moves, a project is forgotten,
/// the DB is hand-edited), so a raw read would hand the frontend a workspace /
/// scope / recent it cannot actually deliver — and the frontend would then strand.
/// Sanitization is cheap and read-only:
///  - `active_workspace` is kept only if it still names a REGISTERED root; else it
///    falls back to the launch root (or the first registered), else null.
///  - `active_scope` is kept only if its path still exists on disk; else cleared,
///    so the client resolves the active workspace's default instead of dangling.
///  - `recent_scopes` drops any entry whose workspace is no longer registered OR
///    whose worktree no longer exists on disk.
///
/// Filesystem stats run OUTSIDE the user-state lock (never block other writers),
/// and are bounded (one active scope + at most `MAX_RECENTS` recents).
fn session_data(state: &AppState) -> Value {
    let workspace = workspace_key(state);
    let active_scope_raw = active_scope_token(state);
    // SCOPED guard: every user-state read happens here; the guard drops at the
    // close brace BEFORE any filesystem stat (so a slow/UNC stat never holds it).
    let (scope_context, recents, active_workspace_raw, global_recents, registered_ids, fallback_ws) = {
        let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
        let roots = us.list_roots().unwrap_or_default();
        let registered_ids: std::collections::HashSet<String> =
            roots.iter().map(|r| r.id.clone()).collect();
        // The deterministic fallback workspace when the active one is stale: the
        // launch root, else the first registered root, else none.
        let fallback_ws = roots
            .iter()
            .find(|r| r.is_launch)
            .or_else(|| roots.first())
            .map(|r| r.id.clone());
        let context = us
            .scope_context(&workspace, &active_scope_raw)
            .unwrap_or_default();
        let recents = us.recents(&workspace).unwrap_or_default();
        let active_workspace_raw = us.active_workspace().ok().flatten();
        let global_recents = us.global_recents().unwrap_or_default();
        (
            context,
            recents,
            active_workspace_raw,
            global_recents,
            registered_ids,
            fallback_ws,
        )
    };

    // --- validate-before-surface (filesystem stats are OUTSIDE the lock) --------
    let validated = validate_session_selections(
        &registered_ids,
        fallback_ws,
        active_workspace_raw,
        &active_scope_raw,
        global_recents,
        path_token_exists,
    );
    let recent_scopes: Vec<Value> = validated
        .recent_scopes
        .into_iter()
        .map(|(ws, scope)| json!({ "workspace": ws, "scope": scope }))
        .collect();

    json!({
        "workspace": workspace,
        "active_scope": validated.active_scope,
        "active_workspace": validated.active_workspace,
        "recent_scopes": recent_scopes,
        "scope_context": {
            "folder": scope_context.active_folder,
            "feature_tags": scope_context.feature_tags,
            "workspace_layout": scope_context.workspace_layout,
        },
        "recents": recents,
    })
}

// --- GET /session -------------------------------------------------------------

/// Read the current session: active workspace/scope, the active scope's folder
/// and its feature-tag contexts, and the recents — the "where am I" state the
/// dashboard restores on load instead of recomputing a default.
pub async fn get_session(State(state): State<Arc<AppState>>) -> ApiResult {
    let data = session_data(&state);
    Ok(super::envelope(
        data,
        super::query_tiers(&state.active_cell()),
        None,
    ))
}

// --- PUT /session -------------------------------------------------------------

/// A partial session update: any absent field leaves that part of the session
/// untouched. `active_scope` retargets and persists the active scope (and is
/// validated through the registry); `scope_context` persists a scope's folder +
/// feature-tag contexts (defaulting to the active scope); `push_recent` pushes
/// one value onto the workspace recents.
#[derive(Deserialize, Default)]
pub struct SessionUpdate {
    #[serde(default)]
    pub active_scope: Option<String>,
    #[serde(default)]
    pub scope_context: Option<ScopeContextUpdate>,
    /// Persist the dock workspace layout for a scope (editor-dock-workspace).
    /// MERGED into the scope's session context so it never clobbers the
    /// folder/feature-tag context (and the folder-context update never clobbers
    /// it). Durable: written to the SQLite-backed per-scope session blob, so the
    /// workspace restores across reloads AND engine restarts.
    #[serde(default)]
    pub set_workspace_layout: Option<WorkspaceLayoutUpdate>,
    #[serde(default)]
    pub push_recent: Option<String>,
    /// Select the active WORKSPACE (dashboard-workspace-registry ADR): the
    /// registered root the dashboard is pointed at. Validated against the
    /// registry — an unregistered id is a tiered 400, leaving the selection
    /// unchanged. Persisted on the global-settings surface, the same config
    /// mechanism the active scope already uses.
    #[serde(default)]
    pub active_workspace: Option<String>,
    /// Register a new project root from an operator-supplied absolute path
    /// (read-only: validates a discoverable git workspace, records ONE config
    /// row, never mutates the repository). An invalid path is a tiered 400.
    #[serde(default)]
    pub add_workspace: Option<String>,
    /// Forget a registered project root by its stable id (config delete only;
    /// never touches disk; the last launch root is refused; warm cells evicted).
    #[serde(default)]
    pub forget_workspace: Option<String>,
    /// Remove ONE entry from the machine-global, cross-project recents (history
    /// CRUD). Config delete only — it prunes a recent the operator no longer
    /// wants, never touching any repository.
    #[serde(default)]
    pub remove_recent_scope: Option<RecentScopeRef>,
    /// Clear the ENTIRE machine-global recents list (history CRUD). A config
    /// delete only.
    #[serde(default)]
    pub clear_recent_scopes: Option<bool>,
}

/// A reference to one cross-project recents entry (history CRUD remove).
#[derive(Deserialize, Default)]
pub struct RecentScopeRef {
    #[serde(default)]
    pub workspace: String,
    #[serde(default)]
    pub scope: String,
}

/// The scope-context part of a session update. `scope` names which scope the
/// context belongs to (default: the active scope). `folder` is the active vault
/// folder (an explicit `null` clears it); `feature_tags` is its associated
/// feature-tag contexts.
#[derive(Deserialize, Default)]
pub struct ScopeContextUpdate {
    #[serde(default)]
    pub scope: Option<String>,
    /// The active vault folder for this scope. The context is set wholesale, so
    /// an absent or `null` `folder` clears it (no folder selected).
    #[serde(default)]
    pub folder: Option<String>,
    #[serde(default)]
    pub feature_tags: Vec<String>,
}

/// A dock workspace-layout update (editor-dock-workspace). `scope` names which
/// scope the layout belongs to (default: the active scope); `layout` is the
/// opaque serialized layout blob, or `null` to clear it. Applied as a MERGE into
/// the scope's session context, so it preserves the folder + feature-tag context
/// (and the folder-context update preserves the layout).
#[derive(Deserialize, Default)]
pub struct WorkspaceLayoutUpdate {
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(default)]
    pub layout: Option<String>,
}

pub async fn put_session(
    State(state): State<Arc<AppState>>,
    Json(update): Json<SessionUpdate>,
) -> ApiResult {
    let workspace = workspace_key(&state);
    let now = crate::app::now_ms();

    // Registry mutations route through the user-state CONFIG surface (P02.S09),
    // NOT the read-only graph API and NOT the /ops proxy. All are read-only over
    // repository content: register DISCOVERS a path and records a config row;
    // forget removes a config row and evicts warm cells; select records the
    // active-workspace pointer. Each can fail with a client error, so they run
    // before the persistence block (and before the user-state lock is taken for
    // the scope writes), failing fast and honestly.

    // forget first (so a forget+select in one request lands cleanly).
    if let Some(id) = update.forget_workspace.as_deref() {
        crate::routes::registry::forget_root(&state, id)?;
    }

    // add: register the operator-supplied path read-only.
    if let Some(path) = update.add_workspace.as_deref() {
        crate::routes::registry::register_root(&state, path)?;
    }

    // active_workspace: validate it names a registered root, then persist the
    // active-workspace pointer (config write). The frontend fires the wholesale
    // scope reset around this; the engine only records the selection.
    if let Some(ws) = update.active_workspace.as_deref() {
        let registered = {
            let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
            us.root(ws).ok().flatten().is_some()
        };
        if !registered {
            return Err(super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!("workspace `{ws}` is not a registered project root"),
            ));
        }
        {
            let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
            let _ = us.set_active_workspace(ws, now);
        }
        // A bare project swap (active_workspace WITHOUT an explicit active_scope) must
        // never leave the active scope dangling on the OLD project — a (workspace,
        // scope) mismatch is what stranded the picker. Clear the active scope so the
        // client resolves the NEW project's default worktree; the explicit-scope swap
        // path below is untouched. Persisted clear lands in the scoped guard.
        if update.active_scope.is_none() {
            *state
                .active_scope
                .write()
                .unwrap_or_else(|e| e.into_inner()) = String::new();
        }
    }

    // Bound the opaque workspace-layout blob at ingress (bounded-by-default),
    // before any lock is taken — an over-length blob is a tiered 400 and persists
    // nothing.
    if let Some(layout) = update
        .set_workspace_layout
        .as_ref()
        .and_then(|u| u.layout.as_ref())
        && layout.len() > MAX_WORKSPACE_LAYOUT_LEN
    {
        return Err(super::api_error(
            &state,
            StatusCode::BAD_REQUEST,
            format!(
                "set_workspace_layout.layout is {} bytes; maximum is {MAX_WORKSPACE_LAYOUT_LEN}",
                layout.len()
            ),
        ));
    }

    // active_scope: validate + warm through the registry FIRST (this is the one
    // step that can fail with a client error), then retarget the active scope
    // and persist it. Done before taking the user-state lock so the registry
    // build (which may index a cold scope) never happens under that lock.
    if let Some(scope) = update.active_scope.as_deref() {
        crate::registry::get_or_build(&state, scope)
            .map_err(|reason| super::api_error(&state, StatusCode::BAD_REQUEST, reason))?;
        *state
            .active_scope
            .write()
            .unwrap_or_else(|e| e.into_inner()) = scope.to_string();
    }

    // SCOPED guard: all persistence happens inside this block; the guard drops
    // at the close brace, never held across an `.await`.
    {
        let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(scope) = update.active_scope.as_deref() {
            let _ = us.set_active_scope(&workspace, scope, now);
        } else if update.active_workspace.is_some() {
            // Persist the bare-project-swap scope clear (mirrors the in-memory clear
            // above), so a reload doesn't restore the OLD project's scope.
            let _ = us.set_active_scope(&workspace, "", now);
        }
        if let Some(ctx) = update.scope_context.as_ref() {
            // The context's own `scope` field selects which scope it applies to;
            // absent (or an empty-string sentinel that would collide with the
            // active-scope pointer's PK row), it is the (possibly just-updated)
            // active scope.
            let target = ctx
                .scope
                .clone()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| active_scope_token(&state));
            // MERGE: the folder-context flow sets folder + feature_tags wholesale,
            // but PRESERVES the dock workspace_layout the workspace flow owns, so
            // the two per-scope writers never clobber each other's field.
            let mut context = us.scope_context(&workspace, &target).unwrap_or_default();
            context.active_folder = ctx.folder.clone();
            context.feature_tags = ctx.feature_tags.clone();
            let _ = us.set_scope_context(&workspace, &target, &context, now);
        }
        if let Some(layout) = update.set_workspace_layout.as_ref() {
            let target = layout
                .scope
                .clone()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| active_scope_token(&state));
            // MERGE: set the workspace layout, PRESERVING the folder + feature-tag
            // context so the dock-workspace persist never clears the folder context.
            let mut context = us.scope_context(&workspace, &target).unwrap_or_default();
            context.workspace_layout = layout.layout.clone();
            let _ = us.set_scope_context(&workspace, &target, &context, now);
        }
        if let Some(value) = update.push_recent.as_deref() {
            let _ = us.push_recent(&workspace, value);
        }
        // History CRUD (cross-project recents): clear-all and remove-one. Config
        // deletes only — they prune the operator's recent list and never touch a
        // repository. Clear runs before remove so a combined request is well-defined.
        if update.clear_recent_scopes == Some(true) {
            let _ = us.clear_global_recents();
        }
        if let Some(entry) = update.remove_recent_scope.as_ref()
            && !entry.workspace.is_empty()
            && !entry.scope.is_empty()
        {
            let _ = us.remove_global_recent(&entry.workspace, &entry.scope);
        }
        // Record the navigation on the machine-global, cross-project recents
        // (dashboard-workspace-registry): a worktree switch and a project swap both
        // persist an `active_scope`, so this single hook attributes every scope the
        // operator lands on to the (now-)active registry workspace. The dashboard
        // renders one unified "Recent" list from it, the way every editor does.
        if let Some(scope) = update.active_scope.as_deref()
            && let Some(ws) = us.active_workspace().ok().flatten()
        {
            let _ = us.push_global_recent(&ws, scope);
        }
    }

    // Return the updated session — the same shape GET serves.
    let data = session_data(&state);
    Ok(super::envelope(
        data,
        super::query_tiers(&state.active_cell()),
        None,
    ))
}

// --- settings ----------------------------------------------------------------

/// Build the settings `data` block from the shared user-state handle: the
/// global keys plus a per-scope map of the warm scopes' scoped keys. Read inside
/// ONE scoped guard, dropped before the caller envelopes the result.
///
/// `global` is a flat `{ key: value }` map; `scoped` is `{ scope: { key: value } }`
/// over every scope that has at least one scoped setting (discovered from the
/// warm registry's resident tokens). A scope with no scoped settings is simply
/// absent from `scoped` rather than carrying an empty object.
fn settings_data(state: &AppState) -> Value {
    // The scopes worth listing are the warm ones: the active scope plus any
    // other resident cell. A cold scope has no settings the client is browsing.
    let mut scopes: Vec<String> = {
        let reg = state.registry.read().unwrap_or_else(|e| e.into_inner());
        reg.scope_tokens()
    };
    let active = active_scope_token(state);
    if !scopes.contains(&active) {
        scopes.push(active);
    }

    // SCOPED guard: every settings read happens here and the guard drops at the
    // close brace, never held across an `.await`.
    let (global, scoped) = {
        let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
        let global = settings_map(&us.list_settings(GLOBAL_SCOPE_KEY).unwrap_or_default());
        let mut scoped = serde_json::Map::new();
        for scope in scopes {
            let entries = us.list_settings(&scope).unwrap_or_default();
            if !entries.is_empty() {
                scoped.insert(scope, settings_map(&entries));
            }
        }
        (global, Value::Object(scoped))
    };
    json!({ "global": global, "scoped": scoped })
}

/// The sentinel scope under which global settings live — `vaultspec_session`'s
/// `GLOBAL_SCOPE` (the empty string). Named locally so the API never threads the
/// sentinel by hand.
const GLOBAL_SCOPE_KEY: &str = "";

/// Collapse an ordered `Setting` list into a `{ key: value }` JSON object.
fn settings_map(entries: &[vaultspec_session::Setting]) -> Value {
    let mut map = serde_json::Map::new();
    for setting in entries {
        map.insert(setting.key.clone(), Value::String(setting.value.clone()));
    }
    Value::Object(map)
}

// --- GET /settings ------------------------------------------------------------

/// Read user settings: the global keys and, per warm scope, the scoped keys.
pub async fn get_settings(State(state): State<Arc<AppState>>) -> ApiResult {
    let data = settings_data(&state);
    Ok(super::envelope(
        data,
        super::query_tiers(&state.active_cell()),
        None,
    ))
}

// --- PUT /settings ------------------------------------------------------------

/// A single settings write: a `key`/`value` pair, global when `scope` is absent,
/// scope-scoped otherwise. A global key applies workspace-wide; a scoped key
/// overrides it for one worktree (no implicit fallback — the client composes the
/// precedence it wants).
#[derive(Deserialize)]
pub struct SettingUpdate {
    #[serde(default)]
    pub scope: Option<String>,
    pub key: String,
    pub value: String,
}

pub async fn put_settings(
    State(state): State<Arc<AppState>>,
    Json(update): Json<SettingUpdate>,
) -> ApiResult {
    let now = crate::app::now_ms();

    // Validate against the engine-owned schema registry BEFORE any write
    // (dashboard-settings): an unknown key, a scope on a global-only setting, or
    // an out-of-constraint value is a typed 400 carrying the machine-readable
    // `error_kind` — never a silent accept. Validation returns the CANONICAL
    // stored form (e.g. a normalized integer), which is what we persist.
    let scoped = update.scope.as_deref().is_some_and(|s| !s.is_empty());
    let canonical =
        vaultspec_session::settings_schema::validate(&update.key, &update.value, scoped).map_err(
            |err| super::api_error_kind(&state, StatusCode::BAD_REQUEST, err.kind(), err.message()),
        )?;

    // SCOPED guard: the write happens here; the guard drops at the close brace,
    // never held across an `.await`.
    {
        let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
        match update.scope.as_deref().filter(|s| !s.is_empty()) {
            Some(scope) => {
                let _ = us.set_scoped_setting(scope, &update.key, &canonical, now);
            }
            None => {
                let _ = us.set_global_setting(&update.key, &canonical, now);
            }
        }
    }
    // Return the updated settings — the same shape GET serves.
    let data = settings_data(&state);
    Ok(super::envelope(
        data,
        super::query_tiers(&state.active_cell()),
        None,
    ))
}

// --- GET /settings/schema -----------------------------------------------------

/// Serve the settings schema registry: the single source of truth for every
/// declared setting (dashboard-settings). The client renders its controls and
/// synthesizes defaults from this; the engine validates writes against it. Rides
/// the shared `{data, tiers}` envelope like every other response.
///
/// Shape: `{ data: { settings: [ <def> ... ], groups: [ <name> ... ] }, tiers }`.
/// Each `<def>` carries `key`, `value_type` (tagged), `default`, `scope_eligible`,
/// `control`, `label`, `description`, `group`, `order`, and optional slider
/// `step`/`unit`.
pub async fn get_settings_schema(State(state): State<Arc<AppState>>) -> ApiResult {
    let settings = serde_json::to_value(vaultspec_session::settings_schema::registry())
        .expect("settings schema serialize");
    let groups = serde_json::to_value(vaultspec_session::settings_schema::groups())
        .expect("settings groups serialize");
    let data = json!({ "settings": settings, "groups": groups });
    Ok(super::envelope(
        data,
        super::query_tiers(&state.active_cell()),
        None,
    ))
}

#[cfg(test)]
mod validate_tests {
    use super::*;
    use std::collections::HashSet;

    fn registered(ids: &[&str]) -> HashSet<String> {
        ids.iter().map(|s| s.to_string()).collect()
    }
    fn pair(ws: &str, scope: &str) -> (String, String) {
        (ws.to_string(), scope.to_string())
    }

    #[test]
    fn drops_recents_for_unregistered_workspace_or_missing_worktree() {
        let reg = registered(&["wsA", "wsB"]);
        // wsC is not registered (project forgotten); /gone is removed on disk.
        let exists = |s: &str| s != "/gone";
        let v = validate_session_selections(
            &reg,
            Some("wsA".into()),
            Some("wsA".into()),
            "wsA/main",
            vec![
                pair("wsA", "wsA/main"), // registered + exists -> kept
                pair("wsC", "wsC/main"), // workspace forgotten -> dropped
                pair("wsB", "/gone"),    // worktree removed -> dropped
            ],
            exists,
        );
        assert_eq!(v.recent_scopes, vec![pair("wsA", "wsA/main")]);
    }

    #[test]
    fn active_workspace_falls_back_when_unregistered() {
        let reg = registered(&["launch", "wsB"]);
        // The persisted active workspace was forgotten -> fall back to launch.
        let v = validate_session_selections(
            &reg,
            Some("launch".into()),
            Some("ghost".into()),
            "",
            vec![],
            |_| true,
        );
        assert_eq!(v.active_workspace.as_deref(), Some("launch"));
        // A registered active workspace is kept as-is.
        let v2 = validate_session_selections(
            &reg,
            Some("launch".into()),
            Some("wsB".into()),
            "",
            vec![],
            |_| true,
        );
        assert_eq!(v2.active_workspace.as_deref(), Some("wsB"));
    }

    #[test]
    fn active_scope_cleared_when_missing_on_disk() {
        let reg = registered(&["wsA"]);
        // A removed worktree path -> cleared so the client resolves a default.
        let v = validate_session_selections(
            &reg,
            Some("wsA".into()),
            Some("wsA".into()),
            "wsA/gone",
            vec![],
            |s| s != "wsA/gone",
        );
        assert_eq!(v.active_scope, "");
        // An existing scope is kept.
        let v2 = validate_session_selections(
            &reg,
            Some("wsA".into()),
            Some("wsA".into()),
            "wsA/main",
            vec![],
            |_| true,
        );
        assert_eq!(v2.active_scope, "wsA/main");
    }

    #[test]
    fn empty_registry_yields_no_active_and_no_recents() {
        let reg = registered(&[]);
        let v = validate_session_selections(
            &reg,
            None,
            Some("anything".into()),
            "some/scope",
            vec![pair("anything", "some/scope")],
            |_| true,
        );
        assert_eq!(v.active_workspace, None);
        assert!(v.recent_scopes.is_empty());
    }
}
