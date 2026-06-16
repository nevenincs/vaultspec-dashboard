//! Read-only, bounded content-fetch route (review-rail-viewers ADR).
//!
//! `GET /nodes/{id}/content?scope=` serves the bytes of one document or source
//! file keyed on the stable node id (`doc:<stem>` / `code:<path>`) — the
//! reserved foundation §11 W1 / code-tree content rev. It is the ONE viewer
//! backend: the markdown reader, the code viewer, and the per-file diff body all
//! consume it through `frontend/src/stores/` (its sole wire client). The listing
//! routes (`/vault-tree`, `/file-tree`) stay metadata-only — content lives only
//! here.
//!
//! The route is assembled entirely from settled primitives (research F4): scope
//! validation (`validate_scope`), the path-traversal guard (`resolve_within_root`
//! semantics), the body reader (`ingest_struct::reader`), the shared
//! `envelope`/`tiers` helpers, and the same bounding discipline `/graph/query`
//! and `/file-tree` apply (`graph-queries-are-bounded-by-default`, generalized).
//!
//! Read-and-infer (`engine-read-and-infer`): it only reads bytes from the
//! worktree (`read_from_worktree`) or, for a ref-only scope, the committed tree
//! (`read_from_ref`); it never writes `.vault/`, never mutates a ref, and grows
//! no sibling semantics.

use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use axum::Json;
use axum::extract::{Path as AxumPath, Query, State};
use axum::http::StatusCode;
use engine_model::ScopeRef;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::app::{AppState, ScopeCell};

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

/// Hard ceiling on the bytes served in one content response (the ADR's
/// `MAX_CONTENT_BYTES`, mirroring `MAX_GRAPH_NODES` / `MAX_LEVEL_CHILDREN`): a
/// pathological file must not produce an unbounded wire body. Beyond this the
/// body is truncated at a UTF-8 char boundary and the `truncated` honesty block
/// states the full size and the served size. 1 MiB is generous for a review
/// surface (the largest vault documents and source files sit far below it) while
/// bounding the response and matching the request-body ceiling's order.
pub const MAX_CONTENT_BYTES: usize = 1024 * 1024;

#[derive(Deserialize, Default)]
pub struct ContentParams {
    /// The worktree scope (optional). Absent resolves to the active scope, the
    /// `/nodes/*` family convention; present is validated through the same
    /// `validate_scope` path the listing routes use so a bad scope 400s
    /// honestly with the tiers block.
    #[serde(default)]
    pub scope: Option<String>,
}

/// The repo-relative path a node id resolves to, plus whether it is a `.vault/`
/// document (so the language hint and the reader/viewer routing are honest).
struct ResolvedTarget {
    rel_path: String,
}

/// Resolve a stable node id (`doc:<stem>` / `code:<path>`) to a repo-relative
/// worktree path. `code:<path>` carries the path directly (stripping any
/// `#symbol` qualifier — content is per-file, not per-symbol). `doc:<stem>`
/// resolves the stem to its `.vault/**/<stem>.md` file by a bounded walk of the
/// corpus, mirroring the structural index's `vault_documents` enumeration so the
/// route and the index agree on what a stem names.
fn resolve_node_path(root: &Path, id: &str) -> Result<ResolvedTarget, ContentError> {
    if let Some(rest) = id.strip_prefix("code:") {
        // A `code:<path>#<symbol>` id names a symbol within a file; content is
        // per-file, so drop the qualifier and serve the whole file.
        let path = rest.split('#').next().unwrap_or(rest);
        if path.is_empty() {
            return Err(ContentError::BadId(id.to_string()));
        }
        return Ok(ResolvedTarget {
            rel_path: path.to_string(),
        });
    }
    if let Some(stem) = id.strip_prefix("doc:") {
        if stem.is_empty() {
            return Err(ContentError::BadId(id.to_string()));
        }
        let filename = format!("{stem}.md");
        return find_vault_doc(root, &filename)
            .map(|rel_path| ResolvedTarget { rel_path })
            .ok_or_else(|| ContentError::NotFound(id.to_string()));
    }
    // Only document and code nodes have file bytes; a feature/commit/plan-
    // container/rule node has no readable file.
    Err(ContentError::NoContent(id.to_string()))
}

/// Find a `.vault/**/<filename>` document by basename, walking the corpus the
/// same bounded way the structural index does (`.vault`, skipping dot-dirs and
/// the engine's `data`/`logs`). First match in sorted order wins, matching the
/// resolver's `find_by_basename` first-match determinism.
fn find_vault_doc(root: &Path, filename: &str) -> Option<String> {
    let vault = root.join(".vault");
    let mut matches: Vec<String> = Vec::new();
    let mut stack = vec![vault];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if path.is_dir() {
                if !name.starts_with('.') && name != "data" && name != "logs" {
                    stack.push(path);
                }
            } else if name == filename
                && let Ok(rel) = path.strip_prefix(root)
            {
                matches.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    matches.sort();
    matches.into_iter().next()
}

/// Guard a repo-relative path against traversal before any read, the same
/// `resolve_within_root` discipline `/file-tree` applies: reject `..` and
/// absolute components outright. Resolution input only — never touches disk.
fn guard_within_root(rel: &str) -> Result<String, ContentError> {
    let rel = rel.trim_matches('/');
    let rel_path = PathBuf::from(rel.replace('\\', "/"));
    for component in rel_path.components() {
        match component {
            Component::Normal(_) | Component::CurDir => {}
            _ => return Err(ContentError::Escapes(rel.to_string())),
        }
    }
    Ok(rel_path.to_string_lossy().replace('\\', "/"))
}

/// Derive the highlighter language hint from the path extension (so the client
/// picks the grammar without re-parsing). The hint is advisory; the client maps
/// it to a Shiki grammar and degrades to plain text on an unknown hint.
fn language_hint(rel_path: &str) -> Option<String> {
    let ext = rel_path.rsplit('.').next()?;
    if ext == rel_path {
        return None; // no extension
    }
    let hint = match ext.to_ascii_lowercase().as_str() {
        "rs" => "rust",
        "py" | "pyi" => "python",
        "js" | "mjs" | "cjs" => "javascript",
        "ts" | "mts" | "cts" => "typescript",
        "jsx" => "jsx",
        "tsx" => "tsx",
        "sh" | "bash" => "bash",
        "bat" | "cmd" => "batch",
        "ps1" | "psm1" | "psd1" => "powershell",
        "c" | "h" => "c",
        "cc" | "cpp" | "cxx" | "hpp" | "hxx" => "cpp",
        "json" => "json",
        "toml" => "toml",
        "yaml" | "yml" => "yaml",
        "md" | "markdown" => "markdown",
        "css" => "css",
        "html" | "htm" => "html",
        _ => return None,
    };
    Some(hint.to_string())
}

/// Truncate `text` to at most `cap` bytes at a UTF-8 char boundary, returning
/// the kept prefix and the kept byte length. Never splits a codepoint.
fn truncate_at_char_boundary(text: &str, cap: usize) -> (&str, usize) {
    if text.len() <= cap {
        return (text, text.len());
    }
    let mut end = cap;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    (&text[..end], end)
}

#[derive(Debug)]
enum ContentError {
    /// The id is malformed (e.g. `code:` with no path).
    BadId(String),
    /// The path escapes the worktree root (traversal/absolute).
    Escapes(String),
    /// A document stem resolved to no file in the corpus.
    NotFound(String),
    /// The node kind carries no file bytes (feature/commit/container/rule).
    NoContent(String),
    /// The worktree could not be read (degrade the structural tier).
    Unreadable(String),
}

/// Read the resolved path's bytes from this scope's substrate: the working tree
/// for a worktree scope, the committed tree for a ref-only scope (D2.2 — a ref
/// has no checkout). A read failure degrades the STRUCTURAL tier honestly.
fn read_bytes(
    cell: &ScopeCell,
    rel_path: &str,
) -> Result<ingest_struct::reader::DocumentBody, ContentError> {
    match &cell.scope {
        ScopeRef::Worktree { .. } => {
            ingest_struct::reader::read_from_worktree(&cell.root, rel_path)
                .map_err(|e| ContentError::Unreadable(format!("worktree read failed: {e}")))
        }
        ScopeRef::Ref { name } => {
            ingest_struct::reader::read_from_ref(&cell.root, name, rel_path).map_err(|e| {
                // A path missing at the ref is a not-found request error, not a
                // substrate-unreadable degradation.
                match e {
                    ingest_struct::reader::StructError::NotAtRef { .. } => {
                        ContentError::NotFound(rel_path.to_string())
                    }
                    other => ContentError::Unreadable(format!("ref read failed: {other}")),
                }
            })
        }
    }
}

/// `GET /nodes/{id}/content?scope=` — one document/file's bytes, bounded,
/// read-only, through the shared envelope with the tiers block on success and
/// error.
pub async fn node_content(
    State(state): State<Arc<AppState>>,
    AxumPath(id): AxumPath<String>,
    Query(params): Query<ContentParams>,
) -> ApiResult {
    // Resolve the scope: an explicit `scope=` is validated through the shared
    // path (a bad scope 400s with the tiers block); absent uses the active
    // scope, the `/nodes/*` family convention.
    let cell = match params.scope.as_deref() {
        Some(scope) => super::query::validate_scope(&state, scope)?,
        None => state.active_cell(),
    };

    let target = resolve_node_path(&cell.root, &id).map_err(|e| content_error(&state, &cell, e))?;
    let rel_path =
        guard_within_root(&target.rel_path).map_err(|e| content_error(&state, &cell, e))?;
    let lang = language_hint(&rel_path);

    let body = match read_bytes(&cell, &rel_path) {
        Ok(body) => body,
        Err(e) => return Err(content_error(&state, &cell, e)),
    };

    let byte_len = body.text.len();
    let (text, served_len) = truncate_at_char_boundary(&body.text, MAX_CONTENT_BYTES);
    let truncated = if served_len < byte_len {
        Some(json!({
            "total_bytes": byte_len,
            "returned_bytes": served_len,
            "reason": "content byte ceiling: the file exceeds the served cap and \
                       is truncated; open the file directly for the full body",
        }))
    } else {
        None
    };

    Ok(super::envelope(
        json!({
            "path": rel_path,
            "blob_hash": body.blob_hash,
            "byte_len": byte_len,
            "language_hint": lang,
            "text": text,
            "truncated": truncated,
        }),
        super::query_tiers(&cell),
        None,
    ))
}

/// Map a content-resolution error to the right tiered response: a malformed id,
/// a traversal, a missing path, or a non-content node is a tiered 400/404; an
/// unreadable worktree degrades the STRUCTURAL tier honestly (not a bare 500),
/// exactly the 400-vs-degrade split `/file-tree` models.
fn content_error(
    state: &AppState,
    cell: &ScopeCell,
    err: ContentError,
) -> (StatusCode, Json<Value>) {
    match err {
        ContentError::BadId(id) => super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("node id `{id}` is not a content-bearing id (`doc:` or `code:`)"),
        ),
        ContentError::Escapes(p) => super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("path `{p}` escapes the worktree root"),
        ),
        ContentError::NotFound(id) => super::api_error(
            state,
            StatusCode::NOT_FOUND,
            format!("no readable content for `{id}` in this scope"),
        ),
        ContentError::NoContent(id) => super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("node `{id}` has no file content (only documents and code files do)"),
        ),
        ContentError::Unreadable(reason) => {
            // The substrate is gone (a ref scope with no checkout reach, an
            // unreadable path): degrade the structural tier and return a tiered
            // 400 so the viewer renders a designed degraded state, never a bare
            // 500. The tiers block carries the structural degradation reason.
            (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": reason.clone(),
                    "tiers": super::degraded_tiers_for(cell, "structural", reason.as_str()),
                })),
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_code_node_strips_symbol_qualifier() {
        let dir = tempfile::tempdir().unwrap();
        let target = resolve_node_path(dir.path(), "code:src/main.rs#main").unwrap();
        assert_eq!(target.rel_path, "src/main.rs");
        let target = resolve_node_path(dir.path(), "code:src/main.rs").unwrap();
        assert_eq!(target.rel_path, "src/main.rs");
    }

    #[test]
    fn resolve_doc_node_walks_the_corpus_for_the_stem() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
        std::fs::write(root.join(".vault/adr/2026-06-16-x-adr.md"), "body\n").unwrap();
        let target = resolve_node_path(root, "doc:2026-06-16-x-adr").unwrap();
        assert_eq!(target.rel_path, ".vault/adr/2026-06-16-x-adr.md");
    }

    #[test]
    fn resolve_unknown_doc_stem_is_not_found() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".vault/adr")).unwrap();
        assert!(matches!(
            resolve_node_path(dir.path(), "doc:nope"),
            Err(ContentError::NotFound(_))
        ));
    }

    #[test]
    fn non_content_node_kinds_have_no_content() {
        let dir = tempfile::tempdir().unwrap();
        assert!(matches!(
            resolve_node_path(dir.path(), "feature:editor-demo"),
            Err(ContentError::NoContent(_))
        ));
    }

    #[test]
    fn traversal_paths_are_rejected_before_any_read() {
        assert!(matches!(
            guard_within_root("../secrets"),
            Err(ContentError::Escapes(_))
        ));
        assert!(matches!(
            guard_within_root("../../etc/passwd"),
            Err(ContentError::Escapes(_))
        ));
        assert_eq!(guard_within_root("src/main.rs").unwrap(), "src/main.rs");
        assert_eq!(guard_within_root("/src/main.rs").unwrap(), "src/main.rs");
    }

    #[test]
    fn language_hint_covers_the_required_set() {
        for (path, expected) in [
            ("a.rs", Some("rust")),
            ("a.py", Some("python")),
            ("a.ts", Some("typescript")),
            ("a.tsx", Some("tsx")),
            ("a.jsx", Some("jsx")),
            ("a.js", Some("javascript")),
            ("a.sh", Some("bash")),
            ("a.bat", Some("batch")),
            ("a.ps1", Some("powershell")),
            ("a.c", Some("c")),
            ("a.cpp", Some("cpp")),
            ("a.json", Some("json")),
            ("a.toml", Some("toml")),
            ("a.yaml", Some("yaml")),
            ("a.yml", Some("yaml")),
            ("a.md", Some("markdown")),
            ("README", None),
            ("a.unknownext", None),
        ] {
            assert_eq!(
                language_hint(path).as_deref(),
                expected,
                "language hint for {path}"
            );
        }
    }

    #[test]
    fn truncation_never_splits_a_codepoint() {
        // A multi-byte char straddling the cap must not be split.
        let text = "aé"; // 'a' = 1 byte, 'é' = 2 bytes (total 3)
        let (kept, len) = truncate_at_char_boundary(text, 2);
        assert_eq!(kept, "a", "the partial codepoint is dropped");
        assert_eq!(len, 1);
        let (kept, len) = truncate_at_char_boundary(text, 3);
        assert_eq!(kept, "aé");
        assert_eq!(len, 3);
    }
}
