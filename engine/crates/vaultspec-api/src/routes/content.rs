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

use crate::app::{AppState, DocBasenameIndex, ScopeCell};

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
fn resolve_node_path(
    doc_index: &DocBasenameIndex,
    id: &str,
) -> Result<ResolvedTarget, ContentError> {
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
        return doc_index
            .get(&filename)
            .map(|rel_path| ResolvedTarget {
                rel_path: rel_path.clone(),
            })
            .ok_or_else(|| ContentError::NotFound(id.to_string()));
    }
    // Only document and code nodes have file bytes; a feature/commit/plan-
    // container/rule node has no readable file.
    Err(ContentError::NoContent(id.to_string()))
}

/// Build the `.vault` document basename -> repo-relative path index by walking
/// the corpus once, the same bounded way the structural index does (`.vault`,
/// skipping dot-dirs and the engine's `data`/`logs`). For a `<stem>.md` basename
/// that appears under multiple paths the lexicographically-smallest (sorted-first)
/// path wins, reproducing the prior per-request `find_vault_doc` `sort()+first()`
/// determinism. This is a standalone reimplementation of that ordering, not a
/// shared call into the resolver's own `find_by_basename` index. Cached per
/// generation on the `ScopeCell` (`doc_basename_index`) so the walk is paid once
/// per rebuild, not on every content fetch (backend-hotpath-hardening F1).
pub(crate) fn build_doc_basename_index(root: &Path) -> DocBasenameIndex {
    let vault = root.join(".vault");
    let mut index: DocBasenameIndex = DocBasenameIndex::new();
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
            } else if name.ends_with(".md")
                && let Ok(rel) = path.strip_prefix(root)
            {
                let rel = rel.to_string_lossy().replace('\\', "/");
                // Sorted-first wins (matches the old sort()+first()): keep the
                // lexicographically smallest path for a shared basename.
                index
                    .entry(name)
                    .and_modify(|existing| {
                        if rel < *existing {
                            *existing = rel.clone();
                        }
                    })
                    .or_insert(rel);
            }
        }
    }
    index
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
            ingest_struct::reader::read_from_worktree(&cell.root, rel_path).map_err(|e| {
                // A file MISSING from the working tree is a not-found request
                // error (404), NOT a substrate-unreadable degradation (400) —
                // mirroring the ref arm's `NotAtRef -> NotFound`. The dominant
                // case is a `code:` node minted from a doc mention of a
                // since-DELETED path (e.g. a removed test file): without this
                // distinction the content fetch 400s and floods the console,
                // instead of the viewer rendering its designed "file
                // unavailable" 404 state. A genuine IO failure (permissions,
                // etc.) still degrades the structural tier as Unreadable.
                match e {
                    ingest_struct::reader::StructError::Io(io)
                        if io.kind() == std::io::ErrorKind::NotFound =>
                    {
                        ContentError::NotFound(rel_path.to_string())
                    }
                    other => ContentError::Unreadable(format!("worktree read failed: {other}")),
                }
            })
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

/// Hard cap on the headline summary's character length: a one-line headline, not
/// a paragraph. Beyond it the line is cut at a char boundary with an ellipsis; the
/// hover card line-clamps further on its own width.
const SUMMARY_MAX_CHARS: usize = 240;

/// The lazy one-line headline summary for a `doc:` node — the document body's
/// FIRST prose line. Reuses the same bounded, read-only path resolution + byte
/// read the content route uses (`engine-read-and-infer`: it only reads worktree
/// bytes), then strips the YAML frontmatter, ATX headings (the H1 title and any
/// sub-headings before prose), blank lines, and template HTML-comment annotation
/// blocks, returning the first real prose line. `None` for a non-`doc:` id, an
/// unreadable/missing file, or a body with no prose — an HONEST absence the hover
/// card renders by omitting the line. NEVER errors: a summary is a nicety, not a
/// contract tier, so any failure degrades to `None` rather than failing the
/// node-detail response.
pub(crate) fn doc_summary(cell: &ScopeCell, id: &str) -> Option<String> {
    // Doc nodes only: code/feature/commit/container nodes carry no doc-body prose
    // worth a headline (the route-fill is scoped to documents).
    if !id.starts_with("doc:") {
        return None;
    }
    let target = resolve_node_path(&cell.doc_basename_index(), id).ok()?;
    let rel_path = guard_within_root(&target.rel_path).ok()?;
    let body = read_bytes(cell, &rel_path).ok()?;
    first_prose_line(&body.text)
}

/// The first prose PARAGRAPH of a vault markdown body, collapsed to one headline
/// line: skip a leading `--- … ---` YAML frontmatter block, ATX `#` headings, blank
/// lines, and `<!-- … -->` annotation blocks (single- or multi-line); then collect
/// the first run of consecutive prose lines (vault prose is hard-wrapped, so a
/// single sentence spans several lines) into one space-joined, length-capped
/// string. Collecting the paragraph rather than a single physical line keeps the
/// headline from cutting off mid-sentence at a wrap boundary. `None` when nothing
/// prose-like remains.
fn first_prose_line(text: &str) -> Option<String> {
    let mut lines = text.lines();
    // Peek for a leading YAML frontmatter fence and consume through its close.
    let mut first = lines.next();
    if matches!(first, Some(l) if l.trim() == "---") {
        for l in lines.by_ref() {
            if l.trim() == "---" {
                break;
            }
        }
        first = lines.next();
    }
    let mut in_comment = false;
    let mut paragraph: Vec<&str> = Vec::new();
    // Re-thread the first post-frontmatter line back into the scan.
    let rest = first.into_iter().chain(lines);
    for raw in rest {
        let line = raw.trim();
        if line.is_empty() {
            // A blank line closes the first prose paragraph; before any prose it is
            // just leading whitespace to skip.
            if paragraph.is_empty() {
                continue;
            }
            break;
        }
        if in_comment {
            if line.contains("-->") {
                in_comment = false;
            }
            continue;
        }
        if line.starts_with("<!--") {
            // A self-closing `<!-- … -->` is a single annotation line; an open one
            // starts a block whose close we skip to.
            if !line.contains("-->") {
                in_comment = true;
            }
            continue;
        }
        // The H1 title and any leading sub-headings are not prose; a heading reached
        // mid-collection closes the paragraph.
        if line.starts_with('#') {
            if paragraph.is_empty() {
                continue;
            }
            break;
        }
        paragraph.push(line);
    }
    if paragraph.is_empty() {
        return None;
    }
    Some(truncate_summary(&paragraph.join(" "), SUMMARY_MAX_CHARS))
}

/// Truncate at a char boundary with a trailing ellipsis when over the cap; the
/// input is already trimmed.
fn truncate_summary(s: &str, max_chars: usize) -> String {
    let mut out = String::with_capacity(s.len().min(max_chars * 4));
    for (i, c) in s.chars().enumerate() {
        if i >= max_chars {
            out.push('…');
            break;
        }
        out.push(c);
    }
    out
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

    // Resolve through the per-generation basename index cached on the cell
    // (backend-hotpath-hardening F1): the `.vault` tree walk runs once per
    // rebuild, not on every content fetch.
    let target = resolve_node_path(&cell.doc_basename_index(), &id)
        .map_err(|e| content_error(&state, &cell, e))?;
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
    fn first_prose_line_skips_frontmatter_heading_and_comments() {
        // A canonical vault doc: YAML frontmatter, an annotation comment, an H1
        // title, blank lines, then the first prose paragraph (hard-wrapped over two
        // lines, collapsed into one headline; the next paragraph is excluded).
        let body = "---\ntags:\n  - '#adr'\n---\n\n<!-- a template annotation -->\n# foo decision: the headline\n\nThis is the first prose line\nworth a summary.\n\nA later paragraph that is excluded.\n";
        assert_eq!(
            first_prose_line(body).as_deref(),
            Some("This is the first prose line worth a summary."),
        );
    }

    #[test]
    fn first_prose_line_skips_a_multi_line_comment_block() {
        let body = "# title\n<!--\nmulti\nline\nannotation\n-->\nThe prose after the block.\n";
        assert_eq!(
            first_prose_line(body).as_deref(),
            Some("The prose after the block."),
        );
    }

    #[test]
    fn first_prose_line_stops_the_paragraph_at_a_following_heading() {
        let body = "Intro prose.\n## A section heading\nmore prose under it.\n";
        assert_eq!(first_prose_line(body).as_deref(), Some("Intro prose."));
    }

    #[test]
    fn first_prose_line_none_for_a_heading_only_body() {
        assert_eq!(first_prose_line("# only a title\n\n"), None);
    }

    #[test]
    fn truncate_summary_caps_at_a_char_boundary_with_an_ellipsis() {
        let s = "x".repeat(300);
        let out = truncate_summary(&s, SUMMARY_MAX_CHARS);
        // 240 kept chars + the ellipsis.
        assert_eq!(out.chars().count(), SUMMARY_MAX_CHARS + 1);
        assert!(out.ends_with('…'));
        // A short line is returned unchanged.
        assert_eq!(truncate_summary("short", SUMMARY_MAX_CHARS), "short");
    }

    #[test]
    fn resolve_code_node_strips_symbol_qualifier() {
        // `code:` ids carry their path; the doc index is unused for them.
        let idx = std::collections::HashMap::new();
        let target = resolve_node_path(&idx, "code:src/main.rs#main").unwrap();
        assert_eq!(target.rel_path, "src/main.rs");
        let target = resolve_node_path(&idx, "code:src/main.rs").unwrap();
        assert_eq!(target.rel_path, "src/main.rs");
    }

    #[test]
    fn resolve_doc_node_resolves_the_stem_through_the_index() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
        std::fs::write(root.join(".vault/adr/2026-06-16-x-adr.md"), "body\n").unwrap();
        let idx = build_doc_basename_index(root);
        let target = resolve_node_path(&idx, "doc:2026-06-16-x-adr").unwrap();
        assert_eq!(target.rel_path, ".vault/adr/2026-06-16-x-adr.md");
    }

    #[test]
    fn doc_index_tie_break_keeps_the_sorted_first_path() {
        // A stem under two doc-type dirs (adr/ + plan/) merges to one node; the
        // index keeps the lexicographically smallest path, matching the prior
        // per-request sort()+first() determinism.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::write(root.join(".vault/plan/dup.md"), "p\n").unwrap();
        std::fs::write(root.join(".vault/adr/dup.md"), "a\n").unwrap();
        let idx = build_doc_basename_index(root);
        let target = resolve_node_path(&idx, "doc:dup").unwrap();
        assert_eq!(
            target.rel_path, ".vault/adr/dup.md",
            "adr/ sorts before plan/"
        );
    }

    #[test]
    fn resolve_unknown_doc_stem_is_not_found() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".vault/adr")).unwrap();
        let idx = build_doc_basename_index(dir.path());
        assert!(matches!(
            resolve_node_path(&idx, "doc:nope"),
            Err(ContentError::NotFound(_))
        ));
    }

    #[test]
    fn non_content_node_kinds_have_no_content() {
        let idx = std::collections::HashMap::new();
        assert!(matches!(
            resolve_node_path(&idx, "feature:editor-demo"),
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
