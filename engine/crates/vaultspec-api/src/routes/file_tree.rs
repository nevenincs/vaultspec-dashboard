//! Read-only codebase file-tree listing (dashboard-code-tree ADR).
//!
//! `GET /file-tree?scope=&path=&cursor=&page_size=` returns the children of one
//! directory level within a worktree scope: per child its repo-relative path, a
//! kind (`dir` | `file`), a `has_children` hint for directories, and the
//! `code:<path>` node id the path maps to through the SHARED `node_id`
//! derivation (`engine_model::node_id` over a `CanonicalKey::CodeArtifact`) — no
//! private identity convention, so a file row joins the graph exactly as the
//! vault browser's `doc:<stem>` row does.
//!
//! It mirrors the `/vault-tree` shape (scope-keyed, metadata-only, `tiers`-
//! bearing, cursor-paginated through the shared `envelope`/`paginate` helpers)
//! with two ADR-mandated deltas: it is a DIRECTORY HIERARCHY (one level per call,
//! the rail expands lazily) and it is BOUNDED (a pathological directory is
//! hard-capped per level with a `truncated`-style honesty marker, mirroring the
//! graph's `MAX_GRAPH_NODES` discipline). It never returns file bytes (read-only,
//! no content — content preview is reserved to a future foundation rev) and
//! never mutates anything.
//!
//! Honest degradation: the code tree is a worktree-only capability. A scope with
//! no readable working tree (a remote-ref scope, or a structural tier that
//! cannot list the worktree) degrades through the `tiers` block — the
//! `structural` tier marked unavailable with a reason, an empty listing rather
//! than a healthy-looking populated one — never a bare error.

use std::sync::Arc;

use axum::Json;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use engine_model::{CanonicalKey, node_id};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::app::AppState;

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

/// Hard ceiling on the number of children serialized for one directory level
/// (ADR "Every read is bounded", mirroring the graph's `MAX_GRAPH_NODES`): a
/// pathologically large directory must not produce an unbounded wire body. The
/// level truncates to this and states it honestly; the client cursor-paginates
/// the remainder. 2000 matches the `/vault-tree` page-size clamp.
const MAX_LEVEL_CHILDREN: usize = 2000;

/// The default page size when the client supplies none — the same generous
/// default `/vault-tree` uses. The client-supplied `page_size` is clamped to
/// `MAX_LEVEL_CHILDREN` so it can never defeat the per-level cap.
const DEFAULT_PAGE_SIZE: usize = 500;

#[derive(Deserialize)]
pub struct FileTreeParams {
    /// The worktree scope (required, stateless — contract §3).
    pub scope: String,
    /// The repo-relative directory to list; absent/empty is the worktree root.
    #[serde(default)]
    pub path: Option<String>,
    /// Cursor: the last child path of the previous page (exclusive).
    #[serde(default)]
    pub cursor: Option<String>,
    /// Optional per-page size, clamped to `MAX_LEVEL_CHILDREN`.
    #[serde(default)]
    pub page_size: Option<usize>,
}

/// Project one listed child onto the wire shape: its repo-relative path, the
/// kind, the `has_children` disclosure hint, and the `code:<path>` node id —
/// derived through the SHARED `node_id` rule (P02.S06), never a private
/// convention. The interlink id is the path-only `CodeArtifact` key
/// (`code:<path>`); a symbol-qualified `code:<path>#<symbol>` is a future
/// per-file outline facet, not this listing.
fn child_to_wire(child: &ingest_git::file_tree::ChildEntry) -> Value {
    let id = node_id(&CanonicalKey::CodeArtifact {
        path: &child.path,
        symbol: None,
    });
    json!({
        "path": child.path,
        "kind": if child.is_dir { "dir" } else { "file" },
        "has_children": child.has_children,
        // The interlink: the stable graph node id this path maps to. Present
        // for navigation even when no `code:` node yet exists in the graph
        // (unindexed / below the structural tier's reach) — the frontend renders
        // a quiet absent-interlink state for those, never an error.
        "node_id": id.0,
    })
}

/// `GET /file-tree?scope=&path=&cursor=&page_size=` — one directory level,
/// bounded, ignore-aware, metadata-only, through the shared envelope.
pub async fn file_tree(
    State(state): State<Arc<AppState>>,
    Query(params): Query<FileTreeParams>,
) -> ApiResult {
    // Resolve the scope to its warm cell exactly as `/vault-tree` does: an
    // unknown or non-worktree (e.g. remote-ref) scope 400s honestly with the
    // tiers block attached, via the shared validate_scope/api_error path.
    let cell = super::query::validate_scope(&state, &params.scope)?;
    let rel = params.path.as_deref().unwrap_or("");

    // List one level under the worktree root, ignore-aware. A worktree whose
    // working tree cannot be listed (the structural-tier substrate is absent)
    // degrades honestly: the `structural` tier is marked unavailable with the
    // reason, the listing is empty, and the response is NOT an error — the code
    // mode renders a designed degraded state, never a healthy-looking empty.
    let children = match ingest_git::file_tree::list_dir(&cell.root, rel) {
        Ok(children) => children,
        Err(ingest_git::file_tree::ListError::Escapes(p)) => {
            // A traversal/absolute path is a malformed REQUEST (the client asked
            // to escape the root), distinct from degradation: a tiered 400.
            return Err(super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!("path `{p}` escapes the worktree root"),
            ));
        }
        Err(ingest_git::file_tree::ListError::NotADir(p)) => {
            return Err(super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!("path `{p}` is not a directory in this worktree"),
            ));
        }
        Err(ingest_git::file_tree::ListError::Io(e)) => {
            // The worktree directory is not readable: degrade the structural
            // tier honestly (no working tree to resolve against) rather than
            // 500-ing or presenting an empty tree as healthy.
            let reason = format!("worktree not listable: {e}");
            return Ok(super::envelope(
                json!({"entries": [], "path": rel, "truncated": Value::Null}),
                super::degraded_tiers_for(&cell, "structural", reason.as_str()),
                None,
            ));
        }
    };

    let total = children.len();
    // Hard-cap the level (the bounded-read invariant). Beyond the ceiling the
    // level truncates to it and states it honestly with a `truncated`-style
    // marker, mirroring `/graph/query`'s `truncated` block.
    let capped: Vec<&ingest_git::file_tree::ChildEntry> =
        children.iter().take(MAX_LEVEL_CHILDREN).collect();
    let truncated = if total > MAX_LEVEL_CHILDREN {
        Some(json!({
            "total_children": total,
            "returned_children": MAX_LEVEL_CHILDREN,
            "reason": "directory level child ceiling: expand a subdirectory to \
                       narrow; the level is capped to keep the wire bounded",
        }))
    } else {
        None
    };

    // Cursor pagination over the capped, already-sorted children (contract §2),
    // the same `paginate` helper `/vault-tree` uses. The page size is clamped to
    // the per-level ceiling so a client cannot defeat the cap.
    let page_size = params
        .page_size
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .min(MAX_LEVEL_CHILDREN);
    let (page, next_cursor) = engine_query::envelope::paginate(
        &capped,
        |c| c.path.as_str(),
        params.cursor.as_deref(),
        page_size,
    );
    let entries: Vec<Value> = page.iter().map(|c| child_to_wire(c)).collect();

    Ok(super::envelope(
        json!({
            "entries": entries,
            "path": rel,
            "truncated": truncated,
        }),
        super::query_tiers(&cell),
        next_cursor,
    ))
}
