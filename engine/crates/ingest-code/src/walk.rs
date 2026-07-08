//! Bounded, ignore-aware source-tree walk (codebase-graphing ADR D3/D8).
//!
//! Mirrors the `/file-tree` listing's ignore discipline (`ingest-git`
//! `file_tree.rs`, audit W01P04-104): dot-directories, the always-ignored
//! build/dependency trees, plus simple directory-name and `dir/` entries from
//! `.gitignore` files — applied from the directory that declares them down
//! through its subtree. Glob and negation patterns stay out of scope (no second
//! ignore engine). Unlike the file tree's one-level listing this walks the
//! whole tree, so it is bounded at creation: a max file count (the walk STOPS
//! and reports truncation) and a max per-file byte size (oversized files are
//! counted, never read).
//!
//! One deliberate delta from the file-tree set: `.vault` is ALSO ignored here.
//! The vault corpus owns `.vault/`; the code corpus is the source tree, and the
//! two datasets never share content (the disconnection invariant).

use std::path::{Path, PathBuf};

use crate::lang::Lang;

/// Walk bounds (ADR D8): every accumulator bounded at creation.
#[derive(Debug, Clone)]
pub struct WalkCaps {
    /// Hard ceiling on parsed source files; the walk stops here and the
    /// outcome reports truncation.
    pub max_files: usize,
    /// Files larger than this are counted and skipped, never read.
    pub max_file_bytes: u64,
}

impl Default for WalkCaps {
    fn default() -> Self {
        WalkCaps {
            // Generous for real repos (this workspace is ~3k source files);
            // a 100k-file monorepo truncates honestly rather than stalling.
            max_files: 50_000,
            max_file_bytes: 1_048_576,
        }
    }
}

/// One source file the walk admitted.
#[derive(Debug, Clone)]
pub struct WalkedFile {
    /// Repo-relative POSIX path (forward slashes), e.g. `src/main.rs`.
    pub rel_path: String,
    pub abs_path: PathBuf,
    pub lang: Lang,
    pub len: u64,
    /// Filesystem mtime in ms since epoch (0 when unavailable) — a cache-key
    /// ingredient, never identity.
    pub mtime_ms: i64,
}

/// The walk's result plus its honesty counters.
#[derive(Debug, Default)]
pub struct WalkOutcome {
    /// Admitted source files, in deterministic (sorted-traversal) order.
    pub files: Vec<WalkedFile>,
    /// True when `max_files` stopped the walk early.
    pub capped: bool,
    /// Files whose size exceeded `max_file_bytes` (skipped, unread).
    pub skipped_too_large: usize,
    /// `Cargo.toml` manifests seen during the walk — the Rust resolver's
    /// crate-name map input, collected here so resolution never re-walks.
    pub cargo_manifests: Vec<String>,
}

const ALWAYS_IGNORED_DIRS: &[&str] = &["node_modules", "target", "dist", "__pycache__", "venv"];

fn dir_is_ignored(name: &str, ignore_stack: &[Vec<String>]) -> bool {
    name.starts_with('.')
        || ALWAYS_IGNORED_DIRS.contains(&name)
        || ignore_stack.iter().flatten().any(|p| p == name)
}

/// Bounded honoring of one directory's `.gitignore`: bare names and `dir/`
/// entries only (same subset as the file-tree listing).
fn simple_gitignore_names(dir: &Path) -> Vec<String> {
    let Ok(text) = std::fs::read_to_string(dir.join(".gitignore")) else {
        return Vec::new();
    };
    text.lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty()
                || line.starts_with('#')
                || line.starts_with('!')
                || line.contains('*')
                || line.contains('[')
            {
                return None;
            }
            let name = line.trim_matches('/');
            (!name.is_empty() && !name.contains('/')).then(|| name.to_string())
        })
        .collect()
}

/// Hard ceiling on directory nesting (review L4, bounded-by-default): the
/// recursion is per-directory, so a pathological deep chain must stop rather
/// than exhaust the stack. Real source trees sit far below this.
const MAX_WALK_DEPTH: usize = 64;

/// Walk the source tree under `root`, depth-first in sorted order (stable
/// output ⇒ stable fingerprints). Read-only; never follows a symlink —
/// directory or file (review L1: a file symlink could alias content outside
/// the tree into the corpus).
pub fn walk_source_tree(root: &Path, caps: &WalkCaps) -> std::io::Result<WalkOutcome> {
    let mut outcome = WalkOutcome::default();
    let mut ignore_stack = vec![simple_gitignore_names(root)];
    walk_dir(root, root, caps, &mut ignore_stack, &mut outcome, 0)?;
    Ok(outcome)
}

fn walk_dir(
    root: &Path,
    dir: &Path,
    caps: &WalkCaps,
    ignore_stack: &mut Vec<Vec<String>>,
    outcome: &mut WalkOutcome,
    depth: usize,
) -> std::io::Result<()> {
    if depth >= MAX_WALK_DEPTH {
        return Ok(());
    }
    let mut entries: Vec<_> = std::fs::read_dir(dir)?.filter_map(Result::ok).collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        if outcome.capped {
            return Ok(());
        }
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        let path = entry.path();
        let Ok(meta) = entry.metadata() else { continue };

        if meta.is_dir() {
            if dir_is_ignored(name, ignore_stack) {
                continue;
            }
            // Never follow directory symlinks: a link out of the tree could
            // make the walk unbounded or escape the root.
            if path.is_symlink() {
                continue;
            }
            ignore_stack.push(simple_gitignore_names(&path));
            walk_dir(root, &path, caps, ignore_stack, outcome, depth + 1)?;
            ignore_stack.pop();
            continue;
        }

        // Never admit a file symlink (review L1): reading it would follow the
        // link and pull bytes from outside the tree into the corpus.
        if path.is_symlink() {
            continue;
        }

        if name == "Cargo.toml" {
            if let Some(rel) = rel_posix(root, &path) {
                outcome.cargo_manifests.push(rel);
            }
            continue;
        }
        let Some(lang) = Lang::from_path(&path) else {
            continue;
        };
        if meta.len() > caps.max_file_bytes {
            outcome.skipped_too_large += 1;
            continue;
        }
        if outcome.files.len() >= caps.max_files {
            outcome.capped = true;
            return Ok(());
        }
        let mtime_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let Some(rel_path) = rel_posix(root, &path) else {
            continue;
        };
        outcome.files.push(WalkedFile {
            rel_path,
            abs_path: path,
            lang,
            len: meta.len(),
            mtime_ms,
        });
    }
    Ok(())
}

fn rel_posix(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?;
    Some(rel.to_string_lossy().replace('\\', "/"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn touch(root: &Path, rel: &str, content: &str) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, content).unwrap();
    }

    #[test]
    fn walk_admits_source_skips_noise_and_collects_manifests() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        touch(root, "src/main.rs", "fn main() {}");
        touch(root, "src/lib.py", "x = 1");
        touch(root, "web/app.ts", "export {}");
        touch(root, "README.md", "# no");
        touch(root, "Cargo.toml", "[package]\nname = \"demo\"\n");
        touch(root, "node_modules/pkg/index.js", "x");
        touch(root, "target/debug/gen.rs", "x");
        touch(root, ".vault/doc.md", "x");
        touch(root, ".gitignore", "generated\n");
        touch(root, "generated/out.ts", "x");

        let out = walk_source_tree(root, &WalkCaps::default()).unwrap();
        let paths: Vec<&str> = out.files.iter().map(|f| f.rel_path.as_str()).collect();
        assert_eq!(paths, vec!["src/lib.py", "src/main.rs", "web/app.ts"]);
        assert_eq!(out.cargo_manifests, vec!["Cargo.toml"]);
        assert!(!out.capped);
        assert_eq!(out.skipped_too_large, 0);
    }

    #[test]
    fn caps_stop_the_walk_and_report_honestly() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        for i in 0..5 {
            touch(root, &format!("src/f{i}.rs"), "fn a() {}");
        }
        touch(root, "src/big.rs", &"x".repeat(64));

        let caps = WalkCaps {
            max_files: 3,
            max_file_bytes: 32,
        };
        let out = walk_source_tree(root, &caps).unwrap();
        assert!(out.capped, "walk stops at the ceiling");
        assert_eq!(out.files.len(), 3);
        assert_eq!(out.skipped_too_large, 1, "oversized file counted, unread");
    }

    #[test]
    fn nested_gitignore_applies_to_its_subtree() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        touch(root, "a/.gitignore", "skipme\n");
        touch(root, "a/skipme/x.rs", "fn a() {}");
        touch(root, "a/keep/y.rs", "fn b() {}");
        touch(root, "skipme/z.rs", "fn c() {}");

        let out = walk_source_tree(root, &WalkCaps::default()).unwrap();
        let paths: Vec<&str> = out.files.iter().map(|f| f.rel_path.as_str()).collect();
        assert_eq!(
            paths,
            vec!["a/keep/y.rs", "skipme/z.rs"],
            "a/'s ignore hides a/skipme but not the root-level skipme"
        );
    }
}
