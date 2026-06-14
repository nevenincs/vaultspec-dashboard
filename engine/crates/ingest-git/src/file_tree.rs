//! Bounded, ignore-aware single-level worktree listing (dashboard-code-tree
//! ADR: "The listing endpoint").
//!
//! The codebase file-tree browser is a thinner read over the same worktree
//! substrate the structural tier already walks (engine-read-and-infer): listing
//! files is inference's own input, not a new capability and never a mutation.
//! Unlike the structural tier's whole-tree walk (`ingest-struct` resolve), this
//! lists exactly ONE directory level per call so the rail can expand lazily and
//! the wire never carries a whole-repo body (the bounded-read discipline the
//! graph already honors via `MAX_GRAPH_NODES`).
//!
//! Ignore honoring is the same bounded discipline `ingest-struct` applies (audit
//! W01P04-104): `.git` and other dot-directories (except `.vault`, the corpus),
//! the common dependency/build trees, plus simple directory-name and `dir/`
//! entries collected from every `.gitignore` on the path from the worktree root
//! down to the listed directory. Glob and negation patterns are out of v1 scope
//! (they would need a dedicated ignore engine); this keeps the tree the
//! operator's source rather than its `.git`/build noise without pulling in a
//! second ignore implementation.

use std::path::{Component, Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum ListError {
    #[error("`{0}` escapes the worktree root")]
    Escapes(String),
    #[error("`{0}` is not a directory in the worktree")]
    NotADir(String),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, ListError>;

/// One child of a listed directory level. Metadata only — never file bytes
/// (the ADR's read-only/no-content constraint; content preview is reserved to a
/// future foundation rev). `path` is the repo-relative POSIX path; `is_dir`
/// distinguishes a directory from a file; `has_children` is the cheap
/// expand-affordance hint for a directory (false for files).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChildEntry {
    /// Repo-relative POSIX path (forward slashes), e.g. `src/main.rs`.
    pub path: String,
    /// True for a directory, false for a file.
    pub is_dir: bool,
    /// For a directory, whether it has at least one non-ignored child (the
    /// disclosure-affordance hint); always false for a file.
    pub has_children: bool,
}

/// Directory-name ignore patterns collected from the `.gitignore` files on the
/// path from the worktree root down to (and including) the listed directory.
/// Bounded honoring (audit W01P04-104): bare directory names and `dir/`
/// patterns; glob/negation/path patterns are out of v1 scope.
fn collect_ignored_dir_names(root: &Path, rel: &Path) -> Vec<String> {
    let mut names = Vec::new();
    let mut dir = root.to_path_buf();
    // The root `.gitignore`, then each ancestor segment's `.gitignore`.
    let mut dirs = vec![dir.clone()];
    for component in rel.components() {
        if let Component::Normal(seg) = component {
            dir = dir.join(seg);
            dirs.push(dir.clone());
        }
    }
    for d in dirs {
        let Ok(text) = std::fs::read_to_string(d.join(".gitignore")) else {
            continue;
        };
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty()
                || line.starts_with('#')
                || line.starts_with('!')
                || line.contains('*')
                || line.contains('[')
            {
                continue;
            }
            let name = line.trim_matches('/');
            // Only simple directory names (no nested path); a `dir/` or bare
            // `dir` entry. Path-bearing patterns need a real ignore engine.
            if !name.is_empty() && !name.contains('/') {
                names.push(name.to_string());
            }
        }
    }
    names
}

/// The hard-coded always-ignored directory names: build/dependency trees that
/// drown the operator's source even when no `.gitignore` lists them. Mirrors
/// the `ingest-struct` resolve walk's set so the file tree and the structural
/// index agree on what is noise.
const ALWAYS_IGNORED_DIRS: &[&str] = &["node_modules", "target", "dist", "__pycache__", "venv"];

/// True when a directory entry is ignored: a dot-directory other than the
/// `.vault` corpus, an always-ignored build/dependency tree, or a collected
/// `.gitignore` directory name.
fn dir_is_ignored(name: &str, ignored: &[String]) -> bool {
    (name.starts_with('.') && name != ".vault")
        || ALWAYS_IGNORED_DIRS.contains(&name)
        || ignored.iter().any(|p| p == name)
}

/// Resolve the requested repo-relative path against the worktree root, refusing
/// any path that escapes the root via `..` or an absolute component. Returns the
/// absolute directory path plus the normalized repo-relative path (empty for the
/// root). Read-only: it only joins and canonicalizes against the root.
fn resolve_within_root(root: &Path, rel: &str) -> Result<(PathBuf, PathBuf)> {
    let rel = rel.trim_matches('/');
    let rel_path = PathBuf::from(rel.replace('\\', "/"));
    // Reject traversal/absolute components before touching disk.
    for component in rel_path.components() {
        match component {
            Component::Normal(_) => {}
            // CurDir is harmless; everything else escapes or is absolute.
            Component::CurDir => {}
            _ => return Err(ListError::Escapes(rel.to_string())),
        }
    }
    let abs = root.join(&rel_path);
    if !abs.is_dir() {
        return Err(ListError::NotADir(rel.to_string()));
    }
    Ok((abs, rel_path))
}

/// Does the directory have at least one non-ignored child? Cheap: stops at the
/// first kept entry. A directory whose every child is ignored reports no
/// children (the disclosure affordance is then absent, honestly).
fn has_non_ignored_child(dir: &Path, ignored: &[String]) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_dir = entry.path().is_dir();
        if is_dir {
            if !dir_is_ignored(&name, ignored) {
                return true;
            }
        } else {
            return true;
        }
    }
    false
}

/// List the immediate children of `rel` (repo-relative; empty/`"/"` for the
/// worktree root) under the worktree `root`, ignore-aware and ONE level deep.
///
/// Children are returned sorted: directories before files, each group
/// case-sensitively by path, so the listing is deterministic and the cursor
/// pagination (applied by the caller) is stable. Each child carries its
/// repo-relative POSIX path, its kind, and — for a directory — a cheap
/// `has_children` hint. Metadata only; no bytes are read.
pub fn list_dir(root: &Path, rel: &str) -> Result<Vec<ChildEntry>> {
    let (abs, rel_path) = resolve_within_root(root, rel)?;
    let ignored = collect_ignored_dir_names(root, &rel_path);
    // The listed directory's OWN `.gitignore` already folded into `ignored` by
    // collect_ignored_dir_names; children's ignore checks reuse it (a child's
    // own nested `.gitignore` only matters when that child is itself listed).
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&abs)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = entry.path();
        let is_dir = path.is_dir();
        if is_dir {
            if dir_is_ignored(&name, &ignored) {
                continue;
            }
            // The child directory's own nested ignores extend the set for the
            // has_children probe, so a directory whose only children are ignored
            // reports no children.
            let child_ignored = {
                let child_rel = rel_path.join(&name);
                collect_ignored_dir_names(root, &child_rel)
            };
            let rel_str = rel_path.join(&name).to_string_lossy().replace('\\', "/");
            out.push(ChildEntry {
                path: rel_str,
                is_dir: true,
                has_children: has_non_ignored_child(&path, &child_ignored),
            });
        } else {
            let rel_str = rel_path.join(&name).to_string_lossy().replace('\\', "/");
            out.push(ChildEntry {
                path: rel_str,
                is_dir: false,
                has_children: false,
            });
        }
    }
    // Directories first, then files; each group sorted by path. Stable, so the
    // caller's cursor pagination is deterministic across calls.
    out.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.path.cmp(&b.path),
    });
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn touch(path: &Path) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, "x").unwrap();
    }

    #[test]
    fn lists_one_level_dirs_before_files_sorted() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        touch(&root.join("README.md"));
        touch(&root.join("Cargo.toml"));
        std::fs::create_dir_all(root.join("src")).unwrap();
        touch(&root.join("src/main.rs"));
        std::fs::create_dir_all(root.join("docs")).unwrap();
        touch(&root.join("docs/guide.md"));

        let children = list_dir(root, "").unwrap();
        let paths: Vec<&str> = children.iter().map(|c| c.path.as_str()).collect();
        // Dirs first (docs, src), then files (Cargo.toml, README.md).
        assert_eq!(paths, vec!["docs", "src", "Cargo.toml", "README.md"]);
        // Only the immediate level — src/main.rs is NOT in the root listing.
        assert!(!paths.iter().any(|p| p.contains("main.rs")));
        // Directories carry the has_children hint.
        assert!(
            children[0].is_dir && children[0].has_children,
            "docs has a child"
        );
        assert!(
            children[1].is_dir && children[1].has_children,
            "src has a child"
        );
    }

    #[test]
    fn descends_one_level_into_a_subdirectory() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        touch(&root.join("src/main.rs"));
        touch(&root.join("src/lib.rs"));
        std::fs::create_dir_all(root.join("src/inner")).unwrap();
        touch(&root.join("src/inner/deep.rs"));

        let children = list_dir(root, "src").unwrap();
        let paths: Vec<&str> = children.iter().map(|c| c.path.as_str()).collect();
        assert_eq!(paths, vec!["src/inner", "src/lib.rs", "src/main.rs"]);
        let inner = &children[0];
        assert!(inner.is_dir && inner.has_children, "src/inner has a child");
    }

    #[test]
    fn excludes_git_build_and_gitignored_directories() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::write(root.join(".gitignore"), "build\nsecret-dir/\n").unwrap();
        touch(&root.join("src/main.rs"));
        // .git and build noise that must never appear.
        touch(&root.join(".git/config"));
        touch(&root.join("node_modules/dep/index.js"));
        touch(&root.join("target/debug/app"));
        touch(&root.join("build/out.o"));
        touch(&root.join("secret-dir/leaked.txt"));
        // .vault is the corpus — it is the one dot-dir that is NOT excluded.
        touch(&root.join(".vault/plan/p.md"));

        let children = list_dir(root, "").unwrap();
        let names: Vec<&str> = children.iter().map(|c| c.path.as_str()).collect();
        assert!(names.contains(&"src"), "real source listed");
        assert!(names.contains(&".vault"), "the corpus dot-dir is listed");
        assert!(!names.contains(&".git"), ".git excluded");
        assert!(!names.contains(&"node_modules"), "node_modules excluded");
        assert!(!names.contains(&"target"), "target excluded");
        assert!(!names.contains(&"build"), "gitignored build excluded");
        assert!(!names.contains(&"secret-dir"), "gitignored dir/ excluded");
    }

    #[test]
    fn a_directory_of_only_ignored_children_reports_no_children() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("pkg/node_modules/dep")).unwrap();
        touch(&root.join("pkg/node_modules/dep/index.js"));
        let children = list_dir(root, "").unwrap();
        let pkg = children.iter().find(|c| c.path == "pkg").unwrap();
        assert!(pkg.is_dir);
        assert!(
            !pkg.has_children,
            "pkg's only child is the ignored node_modules — no disclosure affordance"
        );
    }

    #[test]
    fn refuses_a_path_that_escapes_the_root() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        touch(&root.join("src/main.rs"));
        assert!(matches!(
            list_dir(root, "../etc"),
            Err(ListError::Escapes(_))
        ));
        assert!(matches!(
            list_dir(root, "src/../../up"),
            Err(ListError::Escapes(_))
        ));
    }

    #[test]
    fn a_missing_or_file_path_is_not_a_dir() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        touch(&root.join("src/main.rs"));
        assert!(matches!(list_dir(root, "nope"), Err(ListError::NotADir(_))));
        assert!(matches!(
            list_dir(root, "src/main.rs"),
            Err(ListError::NotADir(_))
        ));
    }
}
