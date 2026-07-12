//! Bounded, read-only directory browsing for the add-project picker
//! (single-app-runtime S24, closing ADR option O6).
//!
//! One route, GET `/fs/list`: without `path` it lists the filesystem ROOTS
//! (drive letters on Windows, `/` elsewhere); with an absolute directory
//! `path` it lists that directory's immediate SUBDIRECTORIES only — never
//! files, never recursion — each row carrying the two markers the picker
//! renders (`is_git`, `is_managed`). Everything is capped ([`MAX_ENTRIES`],
//! stated `truncated`), unreadable children are skipped silently (a picker
//! must not fail on one permission-denied folder), and the route is
//! bearer-gated like every non-health route.
//!
//! Boundary: READ-ONLY metadata (`read_dir` + two `is_dir` probes per row).
//! The operator is browsing their own machine over loopback with the bearer
//! — the same trust the `/session` `add_workspace` write seam already
//! extends to a typed absolute path; this route just lets them find it.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::Json;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::app::AppState;

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

/// Hard cap on returned rows (resource-bounds law): far above any real
/// directory a human browses, low enough that a pathological node_modules
/// costs nothing.
const MAX_ENTRIES: usize = 256;

#[derive(Debug, Default, Deserialize)]
pub(crate) struct ListParams {
    #[serde(default)]
    path: Option<String>,
}

/// GET `/fs/list[?path=<absolute dir>]`.
pub(crate) async fn fs_list(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ListParams>,
) -> ApiResult {
    let payload = match params.path.as_deref().filter(|p| !p.is_empty()) {
        None => list_roots(),
        Some(raw) => {
            let path = PathBuf::from(raw);
            if !path.is_absolute() {
                return Err(super::api_error(
                    &state,
                    StatusCode::BAD_REQUEST,
                    format!("`{raw}` is not an absolute path"),
                ));
            }
            if !path.is_dir() {
                return Err(super::api_error(
                    &state,
                    StatusCode::BAD_REQUEST,
                    format!("`{raw}` is not a browsable folder"),
                ));
            }
            list_dir(&path)
        }
    };
    Ok(super::envelope(
        payload,
        super::query_tiers(&state.active_cell()),
        None,
    ))
}

/// The filesystem roots: existing drive letters on Windows, `/` elsewhere.
fn list_roots() -> Value {
    let mut entries: Vec<Value> = Vec::new();
    #[cfg(windows)]
    for letter in b'A'..=b'Z' {
        let root = format!("{}:\\", letter as char);
        if Path::new(&root).is_dir() {
            entries.push(entry_row(&format!("{}:", letter as char), Path::new(&root)));
        }
    }
    #[cfg(not(windows))]
    entries.push(entry_row("/", Path::new("/")));
    json!({
        "path": Value::Null,
        "parent": Value::Null,
        "entries": entries,
        "truncated": false,
    })
}

/// One directory level: immediate subdirectories only, name-sorted, capped.
fn list_dir(path: &Path) -> Value {
    let mut names: Vec<(String, PathBuf)> = std::fs::read_dir(path)
        .map(|iter| {
            iter.filter_map(|e| e.ok())
                // Unreadable / non-directory children are skipped silently:
                // the picker browses PAST problems, it never trips on them.
                .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
                .map(|e| (e.file_name().to_string_lossy().to_string(), e.path()))
                .collect()
        })
        .unwrap_or_default();
    names.sort_by_key(|(name, _)| name.to_lowercase());
    let truncated = names.len() > MAX_ENTRIES;
    names.truncate(MAX_ENTRIES);
    let entries: Vec<Value> = names
        .iter()
        .map(|(name, child)| entry_row(name, child))
        .collect();
    json!({
        "path": clean(path),
        "parent": path.parent().map(clean),
        "entries": entries,
        "truncated": truncated,
    })
}

fn entry_row(name: &str, path: &Path) -> Value {
    json!({
        "name": name,
        "path": clean(path),
        // The two markers the picker renders: a vaultspec-managed project
        // (has a vault) and a plain git repository (registrable, not yet
        // managed — the provisioning plane's audience). Both probes FOLLOW
        // symlinks/junctions (std is_dir/exists semantics) — deliberate and
        // harmless here: read-only metadata, one non-recursive level, the
        // operator's own machine.
        "is_managed": path.join(".vault").is_dir(),
        "is_git": path.join(".git").exists(),
    })
}

fn clean(path: &Path) -> String {
    let s = path.to_string_lossy().replace('\\', "/");
    s.strip_prefix("//?/").unwrap_or(&s).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_level_directories_only_sorted_capped_with_markers() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("beta/.git")).unwrap();
        std::fs::create_dir_all(dir.path().join("alpha/.vault")).unwrap();
        std::fs::write(dir.path().join("a-file.txt"), "x").unwrap();
        let v = list_dir(dir.path());
        let entries = v["entries"].as_array().unwrap();
        assert_eq!(
            entries
                .iter()
                .map(|e| e["name"].as_str().unwrap())
                .collect::<Vec<_>>(),
            vec!["alpha", "beta"],
            "directories only, name-sorted, no files: {v}"
        );
        assert_eq!(entries[0]["is_managed"], true);
        assert_eq!(entries[0]["is_git"], false);
        assert_eq!(entries[1]["is_managed"], false);
        assert_eq!(entries[1]["is_git"], true);
        assert_eq!(v["truncated"], false);
        assert!(v["parent"].is_string(), "a non-root dir has a parent");
    }

    #[test]
    fn the_row_cap_is_enforced_and_stated() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..(MAX_ENTRIES + 10) {
            std::fs::create_dir(dir.path().join(format!("d{i:04}"))).unwrap();
        }
        let v = list_dir(dir.path());
        assert_eq!(v["entries"].as_array().unwrap().len(), MAX_ENTRIES);
        assert_eq!(v["truncated"], true, "truncation is STATED, never silent");
    }

    #[test]
    fn roots_listing_names_at_least_one_browsable_root() {
        let v = list_roots();
        let entries = v["entries"].as_array().unwrap();
        assert!(!entries.is_empty(), "at least one filesystem root: {v}");
        assert!(entries.iter().all(|e| e["path"].as_str().is_some()));
    }
}
