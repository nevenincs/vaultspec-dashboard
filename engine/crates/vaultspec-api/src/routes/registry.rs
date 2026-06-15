//! Workspace-registry wire surface (dashboard-workspace-registry ADR, P02).
//!
//! Two routes plus the `/map` workspace-resolution helper:
//!
//! - `GET /workspaces` enumerates the durable workspace registry: per root the
//!   stable workspace id, label, absolute path (monospace identity), the
//!   launch-default marker (advisory), and a reachability state with a reason
//!   when degraded. Reachability is re-checked READ-ONLY on every enumeration so
//!   a root that has moved or disappeared on disk renders degraded and
//!   retry-able rather than silently vanishing (the worktree-switcher
//!   degraded-entry precedent).
//! - `GET /map` gains an optional `workspace=` parameter defaulting to the
//!   active workspace, so it lists branches and worktrees within a chosen
//!   REGISTERED root exactly as it does today for the launch workspace — the
//!   existing single-workspace behaviour is the `workspace=active` case,
//!   unchanged. The handler lives in `query.rs` (with its tests); this module
//!   owns the root-resolution helper it delegates to.
//!
//! Every response rides the shared `{data, tiers}` envelope so the per-tier
//! degradation block is always present (every-wire-response-carries-the-tiers-
//! block). The registry is USER-STATE CONFIG (the read-and-infer-exception the
//! orchestration crate owns): registering, selecting, and forgetting write only
//! config rows and never mutate a repository. Reachability re-checks DISCOVER a
//! root read-only; they never clone, init, or modify anything on disk.

use std::path::PathBuf;
use std::sync::Arc;

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde_json::{Value, json};
use vaultspec_session::WorkspaceRoot;

use crate::app::AppState;

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

/// Re-check a registered root's reachability READ-ONLY: it is reachable when its
/// path resolves to a discoverable git workspace with at least one enumerable
/// worktree — the same validation registering a root performs, run fresh on
/// every enumeration so a moved/missing root degrades honestly. Returns
/// `(reachable, reason)`; the reason is `None` when reachable. Never mutates a
/// repository — it only DISCOVERS and ENUMERATES.
fn probe_reachability(path: &str) -> (bool, Option<String>) {
    let root = PathBuf::from(path);
    if !root.is_dir() {
        return (false, Some("path is not a readable directory".to_string()));
    }
    let workspace = match ingest_git::workspace::Workspace::discover(&root) {
        Ok(ws) => ws,
        Err(_) => return (false, Some("not a git workspace".to_string())),
    };
    match ingest_git::worktrees::enumerate(&workspace) {
        Ok(worktrees) if !worktrees.is_empty() => (true, None),
        Ok(_) => (false, Some("no enumerable worktrees".to_string())),
        Err(_) => (false, Some("worktrees are not enumerable".to_string())),
    }
}

/// Project one registered root onto the `/workspaces` wire shape, folding in the
/// freshly-probed reachability.
fn root_to_wire(root: &WorkspaceRoot, reachable: bool, reason: Option<&str>) -> Value {
    json!({
        "id": root.id,
        "label": root.label,
        // Monospace path identity (the worktree-switcher path-on-hover precedent).
        "path": root.path,
        // Advisory launch-default marker — never a selection gate.
        "is_launch": root.is_launch,
        "reachable": reachable,
        "unreachable_reason": reason,
    })
}

// --- GET /workspaces ---------------------------------------------------------

/// Enumerate the registry. Reachability is re-probed READ-ONLY per root on every
/// call (a registered root can move between sessions), and the refreshed state
/// is persisted back so the next reader sees the last-seen truth without a
/// re-probe. A root that has moved or disappeared is kept and rendered degraded,
/// never dropped.
pub async fn list_workspaces(State(state): State<Arc<AppState>>) -> ApiResult {
    let roots = {
        let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
        us.list_roots().unwrap_or_default()
    };

    let now = crate::app::now_ms();
    let mut wire: Vec<Value> = Vec::with_capacity(roots.len());
    for root in &roots {
        let (reachable, reason) = probe_reachability(&root.path);
        // Persist the refreshed reachability (best-effort config write; a failure
        // just means the next reader re-probes). Never touches the repository.
        {
            let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
            let _ = us.set_root_reachability(&root.id, reachable, reason.as_deref(), now);
        }
        wire.push(root_to_wire(root, reachable, reason.as_deref()));
    }

    let active_workspace = {
        let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
        us.active_workspace().ok().flatten()
    };

    Ok(super::envelope(
        json!({
            "workspaces": wire,
            // The active-workspace id the rail highlights (advisory; the picker
            // reads it to mark the current root). Null when none is selected.
            "active_workspace": active_workspace,
        }),
        super::query_tiers(&state.active_cell()),
        None,
    ))
}

/// Resolve the launch root path `/map` should enumerate, honouring the optional
/// `workspace=` parameter (dashboard-workspace-registry ADR, P02.S07).
///
/// - Absent or `"active"`: the active workspace's registered root, falling back
///   to the engine's launch `workspace_root` when no registry/active selection
///   exists yet (the unchanged single-workspace `workspace=active` case).
/// - A registered workspace id: that root's path.
/// - An unknown id: an honest 400 (the caller maps the `Err`).
///
/// This NEVER mutates anything; it READS the registry config and returns a path
/// the existing `/map` handler discovers read-only.
pub fn resolve_map_workspace_root(
    state: &AppState,
    workspace: Option<&str>,
) -> Result<PathBuf, (StatusCode, Json<Value>)> {
    let launch = || state.workspace_root.clone();
    match workspace {
        None | Some("") | Some("active") => {
            // Default: the active workspace's root, else the launch workspace.
            let active = {
                let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
                us.active_workspace().ok().flatten()
            };
            let Some(active) = active else {
                return Ok(launch());
            };
            let root = {
                let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
                us.root(&active).ok().flatten()
            };
            // The active id should always name a registered root, but fall back
            // to the launch workspace rather than 400 on a torn registry.
            Ok(root.map(|r| PathBuf::from(r.path)).unwrap_or_else(launch))
        }
        Some(id) => {
            let root = {
                let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
                us.root(id).ok().flatten()
            };
            match root {
                Some(r) => Ok(PathBuf::from(r.path)),
                None => Err(super::api_error(
                    state,
                    StatusCode::BAD_REQUEST,
                    format!("workspace `{id}` is not a registered project root"),
                )),
            }
        }
    }
}

/// Register a project root from an operator-supplied absolute path
/// (dashboard-workspace-registry ADR, P02.S09). READ-ONLY: it DISCOVERS the path
/// as a git workspace and ENUMERATES its worktrees to validate it; on success it
/// persists ONE registry config row (the stable id is the canonical git common
/// dir, the label defaults to the path's final component). It NEVER clones,
/// inits, creates, or modifies anything on disk — registering only records a
/// path the operator points at. Refuses with an honest reason when the path is
/// not a discoverable git workspace / not readable / has no enumerable worktree,
/// never partially registering. Returns the registered workspace id.
pub fn register_root(state: &AppState, path: &str) -> Result<String, (StatusCode, Json<Value>)> {
    let refuse = |reason: &str| {
        super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("cannot register `{path}`: {reason}"),
        )
    };

    let raw = PathBuf::from(path);
    if !raw.is_dir() {
        return Err(refuse("path is not a readable directory"));
    }
    // READ-ONLY discovery: resolve the workspace (its canonical common dir is the
    // stable id) and confirm at least one worktree is enumerable.
    let workspace = ingest_git::workspace::Workspace::discover(&raw)
        .map_err(|_| refuse("not a git workspace"))?;
    let worktrees = ingest_git::worktrees::enumerate(&workspace)
        .map_err(|_| refuse("worktrees are not enumerable"))?;
    if worktrees.is_empty() {
        return Err(refuse("no enumerable worktrees"));
    }

    let id = super::scope_token(&workspace.common_dir);
    // The canonical registered path is the operator-supplied root in scope-token
    // form, so it matches the worktree tokens the registry routes on.
    let canonical_path = super::scope_token(&raw);
    let label = raw
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| canonical_path.clone());

    let root = WorkspaceRoot {
        id: id.clone(),
        label,
        path: canonical_path,
        // A newly-registered root is never the launch default; the launch root
        // is auto-registered at boot. A repeat registration of the launch id
        // preserves its launch marker via add_root's in-place upsert? No —
        // add_root sets is_launch from the passed value. Guard below.
        is_launch: false,
        reachable: true,
        unreachable_reason: None,
    };
    // Preserve the launch marker if this id is already the launch root (a
    // re-register of the launch workspace must not demote it).
    let root = {
        let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
        let preserved_launch = us
            .root(&id)
            .ok()
            .flatten()
            .map(|existing| existing.is_launch)
            .unwrap_or(false);
        WorkspaceRoot {
            is_launch: preserved_launch,
            ..root
        }
    };
    {
        let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
        us.add_root(&root, crate::app::now_ms()).map_err(|e| {
            super::api_error(
                state,
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("registry write failed: {e}"),
            )
        })?;
    }
    Ok(id)
}

/// Forget a registered workspace by its stable id (dashboard-workspace-registry
/// ADR, P02.S09). A CONFIG DELETE only: it removes the registry row and NEVER
/// touches the repository on disk. The launch workspace cannot be forgotten
/// while it is the only registered root (an honest refusal). Any warm scope
/// cells belonging to the forgotten workspace are evicted so the forgotten
/// project's corpus does not linger warm. If the forgotten root WAS the active
/// workspace, the active-workspace pointer is re-pointed engine-side to the
/// launch root (review M1), so the stored selection never names a forgotten id
/// and the invariant does not depend on the caller pairing the forget with an
/// active re-select; the frontend swap still drives the wholesale UI reset.
pub fn forget_root(state: &AppState, id: &str) -> Result<(), (StatusCode, Json<Value>)> {
    // Resolve the forgotten root's path BEFORE deleting it, so we can scope the
    // warm-cell eviction to its worktree subtree.
    let forgotten_path = {
        let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
        us.root(id).ok().flatten().map(|r| r.path)
    };

    let outcome = {
        let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
        us.forget_root(id).map_err(|e| {
            super::api_error(
                state,
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("registry write failed: {e}"),
            )
        })?
    };
    if let Err(refusal) = outcome {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            refusal.to_string(),
        ));
    }

    // Evict any warm scope cells under the forgotten workspace's root subtree.
    // The active scope cell is pinned and never evicted here.
    if let Some(prefix) = forgotten_path {
        let active = {
            state
                .active_scope
                .read()
                .map(|s| s.clone())
                .unwrap_or_else(|e| e.into_inner().clone())
        };
        let normalized = prefix.trim_end_matches('/').to_string();
        let mut reg = state.registry.write().unwrap_or_else(|e| e.into_inner());
        reg.evict_where(&active, |token| {
            let t = token.trim_end_matches('/');
            t == normalized || t.starts_with(&format!("{normalized}/"))
        });
    }

    // Engine-side guard (review M1): if the forgotten root was the active
    // workspace, re-point the active-workspace pointer to the launch root so the
    // persisted pointer never names a forgotten id. The active scope cell already
    // falls back to the launch root, so this only keeps the stored selection
    // honest and self-contained instead of depending on the caller pairing a
    // forget with an active re-select.
    {
        let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
        if us.active_workspace().ok().flatten().as_deref() == Some(id) {
            let roots = us.list_roots().unwrap_or_default();
            let target = roots.iter().find(|r| r.is_launch).or_else(|| roots.first());
            if let Some(target) = target {
                let _ = us.set_active_workspace(&target.id, crate::app::now_ms());
            }
        }
    }
    Ok(())
}
