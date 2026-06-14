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
use vaultspec_session::ScopeContext;

use crate::app::AppState;

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

/// Build the session `data` block from the shared user-state handle. Reads the
/// active scope, that scope's folder/feature-tag context, and the recents — all
/// inside ONE scoped guard, dropped before the caller envelopes the result.
fn session_data(state: &AppState) -> Value {
    let workspace = workspace_key(state);
    let active_scope = active_scope_token(state);
    // SCOPED guard: every user-state read happens here, and the guard drops at
    // the close brace — never held across the `.await`-free envelope below, and
    // never across any future `.await`.
    let (scope_context, recents) = {
        let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
        let context = us
            .scope_context(&workspace, &active_scope)
            .unwrap_or_default();
        let recents = us.recents(&workspace).unwrap_or_default();
        (context, recents)
    };
    json!({
        "workspace": workspace,
        "active_scope": active_scope,
        "scope_context": {
            "folder": scope_context.active_folder,
            "feature_tags": scope_context.feature_tags,
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
    #[serde(default)]
    pub push_recent: Option<String>,
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

pub async fn put_session(
    State(state): State<Arc<AppState>>,
    Json(update): Json<SessionUpdate>,
) -> ApiResult {
    let workspace = workspace_key(&state);
    let now = crate::app::now_ms();

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
        }
        if let Some(ctx) = update.scope_context.as_ref() {
            // The context's own `scope` field selects which scope it applies to;
            // absent, it is the (possibly just-updated) active scope.
            let target = ctx
                .scope
                .clone()
                .unwrap_or_else(|| active_scope_token(&state));
            let context = ScopeContext {
                active_folder: ctx.folder.clone(),
                feature_tags: ctx.feature_tags.clone(),
            };
            let _ = us.set_scope_context(&workspace, &target, &context, now);
        }
        if let Some(value) = update.push_recent.as_deref() {
            let _ = us.push_recent(&workspace, value);
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
