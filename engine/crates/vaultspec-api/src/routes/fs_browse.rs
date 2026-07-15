//! Bounded, read-only directory browsing for the project picker.
//!
//! One route, GET `/fs/list`: without `path` it lists the filesystem ROOTS
//! (drive letters on Windows, `/` elsewhere) plus a `places` block (home
//! directory); with an absolute directory `path` it lists that directory's
//! immediate subdirectories only, never files or recursion. Each row
//! carrying the markers the picker renders (`is_git`, `is_managed`,
//! `is_hidden`, `is_registered`). Two request params narrow a directory level
//! BEFORE the cap applies: `hidden` (include dotfolders / OS-hidden folders,
//! default false) and `q` (case-insensitive substring name filter). A
//! truncated level therefore stays filterable.
//! Everything is still capped ([`MAX_ENTRIES`], stated `truncated`),
//! unreadable children are skipped silently (a picker must not fail on one
//! permission-denied folder), and the route is bearer-gated like every
//! non-health route.
//!
//! Boundary: read-only directory information (`read_dir` plus per-row attributes
//! probes, plus a registry read for `is_registered`). The operator is
//! browsing their own machine over loopback with the bearer. This is the same trust
//! the `/session` `add_workspace` write seam already extends to a typed
//! absolute path; this route just lets them find it.

use std::collections::HashSet;
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
    /// Include hidden (dotfolder / OS-hidden) entries. Default false; applied
    /// BEFORE the cap, so hidden rows never crowd out real ones under the cap.
    #[serde(default)]
    hidden: bool,
    /// Case-insensitive substring filter on the entry name, applied BEFORE
    /// the cap (filtering law: a truncated level must stay filterable).
    #[serde(default)]
    q: Option<String>,
}

/// GET `/fs/list[?path=<absolute dir>][&hidden=true][&q=<substring>]`.
pub(crate) async fn fs_list(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ListParams>,
) -> ApiResult {
    let registered = registered_paths(&state);
    let query = params
        .q
        .as_deref()
        .map(str::trim)
        .filter(|q| !q.is_empty())
        .map(str::to_lowercase);
    let payload = match params.path.as_deref().filter(|p| !p.is_empty()) {
        None => list_roots(&registered),
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
            list_dir(&path, params.hidden, query.as_deref(), &registered)
        }
    };
    Ok(super::envelope(
        payload,
        super::query_tiers(&state.active_cell()),
        None,
    ))
}

/// The registered workspace roots, normalized for path comparison
/// (workspace-picker-dialog D4): the client must not re-derive registration
/// state by raw path comparison (Windows case/format hazards), so this reads
/// the engine's own registry and hands back a comparison-normalized set.
fn registered_paths(state: &AppState) -> HashSet<String> {
    let us = state.user_state.lock().unwrap_or_else(|e| e.into_inner());
    us.list_roots()
        .unwrap_or_default()
        .into_iter()
        .map(|r| normalize_for_compare(&r.path))
        .collect()
}

/// Normalize a path string for cross-platform, format-insensitive comparison:
/// forward slashes, no trailing slash, lowercase on Windows (its filesystem is
/// case-insensitive; a registered root and a browsed row can differ only in
/// case and still name the same folder).
fn normalize_for_compare(path: &str) -> String {
    let cleaned = path.replace('\\', "/");
    let trimmed = cleaned.trim_end_matches('/');
    #[cfg(windows)]
    {
        trimmed.to_lowercase()
    }
    #[cfg(not(windows))]
    {
        trimmed.to_string()
    }
}

/// The operator's actual home directory. This uses the same `USERPROFILE`/`HOME`
/// precedence `vaultspec_session::app_home::app_home_dir` uses, stopping one
/// path segment short of that function's `.vaultspec` join (the picker wants
/// the operator's home, not the engine's app-home).
fn home_dir() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

/// The filesystem roots: existing drive letters on Windows, `/` elsewhere,
/// plus a `places` block (home directory) the picker's places rail renders.
fn list_roots(registered: &HashSet<String>) -> Value {
    let mut entries: Vec<Value> = Vec::new();
    #[cfg(windows)]
    for letter in b'A'..=b'Z' {
        let root = format!("{}:\\", letter as char);
        if Path::new(&root).is_dir() {
            let mut row = entry_row(
                &format!("{}:", letter as char),
                Path::new(&root),
                registered,
            );
            // Windows stamps the hidden attribute on some drive roots; to an
            // operator a drive is never a "hidden folder", so the roots level
            // serves it unhidden rather than badging C: as hidden noise.
            row["is_hidden"] = Value::Bool(false);
            entries.push(row);
        }
    }
    #[cfg(not(windows))]
    entries.push(entry_row("/", Path::new("/"), registered));

    let places: Vec<Value> = home_dir()
        .into_iter()
        .map(|home| json!({ "name": "Home", "path": clean(&home) }))
        .collect();

    json!({
        "path": Value::Null,
        "parent": Value::Null,
        "is_registered": false,
        "entries": entries,
        "truncated": false,
        "places": places,
    })
}

/// One directory level: immediate subdirectories only, name-sorted. `hidden`
/// and `query` narrow the candidate set BEFORE the cap applies, so a
/// truncated level stays filterable/showable rather than silently dropping
/// matches beyond the first [`MAX_ENTRIES`] names.
fn list_dir(
    path: &Path,
    include_hidden: bool,
    query: Option<&str>,
    registered: &HashSet<String>,
) -> Value {
    let mut names: Vec<(String, PathBuf)> = std::fs::read_dir(path)
        .map(|iter| {
            iter.filter_map(|e| e.ok())
                // Unreadable / non-directory children are skipped silently:
                // the picker browses PAST problems, it never trips on them.
                .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
                .map(|e| (e.file_name().to_string_lossy().to_string(), e.path()))
                .filter(|(name, child)| include_hidden || !is_hidden(name, child))
                .filter(|(name, _)| match query {
                    Some(q) => name.to_lowercase().contains(q),
                    None => true,
                })
                .collect()
        })
        .unwrap_or_default();
    names.sort_by_key(|(name, _)| name.to_lowercase());
    let truncated = names.len() > MAX_ENTRIES;
    names.truncate(MAX_ENTRIES);
    let entries: Vec<Value> = names
        .iter()
        .map(|(name, child)| entry_row(name, child, registered))
        .collect();
    json!({
        "path": clean(path),
        "parent": path.parent().map(clean),
        "is_registered": registered.contains(&normalize_for_compare(&clean(path))),
        "entries": entries,
        "truncated": truncated,
    })
}

/// A dotfolder name, or (Windows only) a folder carrying the OS hidden file
/// attribute. It is read from the same directory entry information as the other
/// folder markers.
fn is_hidden(name: &str, path: &Path) -> bool {
    if name.starts_with('.') {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
        if let Ok(meta) = std::fs::metadata(path) {
            return meta.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0;
        }
    }
    false
}

fn entry_row(name: &str, path: &Path, registered: &HashSet<String>) -> Value {
    let clean_path = clean(path);
    json!({
        "name": name,
        "path": clean_path,
        // Mark managed and Git folders. Both probes follow symlinks and
        // junctions using standard path semantics and remain read-only.
        "is_managed": path.join(".vault").is_dir(),
        "is_git": path.join(".git").exists(),
        "is_hidden": is_hidden(name, path),
        "is_registered": registered.contains(&normalize_for_compare(&clean_path)),
    })
}

fn clean(path: &Path) -> String {
    let s = path.to_string_lossy().replace('\\', "/");
    s.strip_prefix("//?/").unwrap_or(&s).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn no_registered() -> HashSet<String> {
        HashSet::new()
    }

    #[test]
    fn one_level_directories_only_sorted_capped_with_markers() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("beta/.git")).unwrap();
        std::fs::create_dir_all(dir.path().join("alpha/.vault")).unwrap();
        std::fs::write(dir.path().join("a-file.txt"), "x").unwrap();
        let v = list_dir(dir.path(), false, None, &no_registered());
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
        let v = list_dir(dir.path(), false, None, &no_registered());
        assert_eq!(v["entries"].as_array().unwrap().len(), MAX_ENTRIES);
        assert_eq!(v["truncated"], true, "truncation is STATED, never silent");
    }

    #[test]
    fn roots_listing_names_at_least_one_browsable_root() {
        let v = list_roots(&no_registered());
        let entries = v["entries"].as_array().unwrap();
        assert!(!entries.is_empty(), "at least one filesystem root: {v}");
        assert!(entries.iter().all(|e| e["path"].as_str().is_some()));
        // A drive/filesystem root is never served as a "hidden folder", even
        // when the OS stamps the hidden attribute on it.
        assert!(
            entries.iter().all(|e| e["is_hidden"] == false),
            "roots are never hidden: {v}"
        );
    }

    #[test]
    fn roots_listing_carries_a_places_block_with_home() {
        // USERPROFILE/HOME is always set in CI/dev, so the home place is
        // present; this does not mutate process env (parallel-test-safe).
        let v = list_roots(&no_registered());
        let places = v["places"].as_array().expect("places is an array");
        assert!(
            places
                .iter()
                .any(|p| p["name"] == "Home" && p["path"].is_string()),
            "places names at least Home: {v}"
        );
    }

    #[test]
    fn hidden_entries_are_excluded_by_default_and_included_with_the_flag() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("visible")).unwrap();
        std::fs::create_dir_all(dir.path().join(".dotfolder")).unwrap();

        let default_view = list_dir(dir.path(), false, None, &no_registered());
        let default_names: Vec<&str> = default_view["entries"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["name"].as_str().unwrap())
            .collect();
        assert_eq!(
            default_names,
            vec!["visible"],
            "dotfolders are excluded by default: {default_view}"
        );

        let shown_view = list_dir(dir.path(), true, None, &no_registered());
        let shown_names: Vec<&str> = shown_view["entries"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["name"].as_str().unwrap())
            .collect();
        assert_eq!(
            shown_names,
            vec![".dotfolder", "visible"],
            "hidden=true includes dotfolders: {shown_view}"
        );
        let dotfolder = shown_view["entries"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["name"] == ".dotfolder")
            .unwrap();
        assert_eq!(dotfolder["is_hidden"], true);
        let visible = shown_view["entries"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["name"] == "visible")
            .unwrap();
        assert_eq!(visible["is_hidden"], false);
    }

    #[cfg(windows)]
    #[test]
    fn the_os_hidden_attribute_marks_a_non_dotfolder_hidden() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("attrib-hidden");
        std::fs::create_dir_all(&target).unwrap();
        let status = std::process::Command::new("attrib")
            .args(["+h", target.to_str().unwrap()])
            .status()
            .expect("attrib runs on Windows");
        assert!(status.success(), "attrib +h succeeds");

        let shown = list_dir(dir.path(), true, None, &no_registered());
        let row = shown["entries"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["name"] == "attrib-hidden")
            .expect("the OS-hidden folder is still listed with hidden=true");
        assert_eq!(
            row["is_hidden"], true,
            "the OS hidden attribute marks a non-dotfolder hidden: {row}"
        );
    }

    #[test]
    fn q_filters_pre_cap_so_matches_beyond_the_cap_still_return() {
        let dir = tempfile::tempdir().unwrap();
        // More than MAX_ENTRIES noise names, plus a handful of matches that
        // would sort AFTER the cap if filtering ran post-cap.
        for i in 0..(MAX_ENTRIES + 10) {
            std::fs::create_dir(dir.path().join(format!("zzz-noise-{i:04}"))).unwrap();
        }
        for i in 0..5 {
            std::fs::create_dir(dir.path().join(format!("zzz-target-{i}"))).unwrap();
        }

        let unfiltered = list_dir(dir.path(), false, None, &no_registered());
        assert_eq!(unfiltered["truncated"], true, "unfiltered level truncates");

        let filtered = list_dir(dir.path(), false, Some("target"), &no_registered());
        let names: Vec<&str> = filtered["entries"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["name"].as_str().unwrap())
            .collect();
        assert_eq!(
            names.len(),
            5,
            "q narrows BEFORE the cap, so all 5 matches return: {filtered}"
        );
        assert!(names.iter().all(|n| n.contains("target")));
        assert_eq!(
            filtered["truncated"], false,
            "a filtered level below the cap is not truncated: {filtered}"
        );
    }

    #[test]
    fn is_registered_marks_a_row_whose_path_matches_the_registry() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("project")).unwrap();
        let project_path = clean(&dir.path().join("project"));
        let mut registered = HashSet::new();
        registered.insert(normalize_for_compare(&project_path));

        let v = list_dir(dir.path(), false, None, &registered);
        let row = v["entries"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["name"] == "project")
            .unwrap();
        assert_eq!(row["is_registered"], true);
    }

    #[test]
    fn is_registered_marks_the_listed_directory_from_registry_truth() {
        let dir = tempfile::tempdir().unwrap();
        let listed_path = clean(dir.path());
        let mut registered = HashSet::new();
        registered.insert(normalize_for_compare(&listed_path));

        let v = list_dir(dir.path(), false, None, &registered);

        assert_eq!(v["path"], listed_path);
        assert_eq!(v["is_registered"], true);
    }

    #[test]
    fn normalize_for_compare_is_slash_and_trailing_slash_insensitive() {
        assert_eq!(
            normalize_for_compare("C:/foo/bar/"),
            normalize_for_compare("C:\\foo\\bar")
        );
    }
}
