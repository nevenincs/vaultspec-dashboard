//! Package identity for the CODE corpus (code-graph-files-only cutover).
//!
//! The graph's hard rule is that every code node is a FILE — directories never
//! become nodes. A PACKAGE is therefore represented by its entry file: the
//! `__init__.py` / `mod.rs` / `lib.rs` / `main.rs` / `index.*` that a language's
//! import machinery treats as the package itself (which is also where the
//! resolver already lands package imports). This module is the ONE definition
//! of "entry file" and "which package does a file belong to", shared by the
//! ingest crate (containment minting) and the query projection (package
//! rollup and per-node annotations) so the two can never drift — the
//! `language_token` discipline (CGR-007).

use std::collections::BTreeMap;

/// Entry-file precedence within one directory, best (lowest) first. A single
/// directory holding several candidates (e.g. `lib.rs` beside `main.rs`)
/// deterministically elects one representative.
const ENTRY_PRECEDENCE: [&str; 10] = [
    "__init__.py",
    "lib.rs",
    "main.rs",
    "mod.rs",
    "index.ts",
    "index.tsx",
    "index.js",
    "index.jsx",
    "index.mjs",
    "index.cjs",
];

/// The precedence rank of a file NAME when it is a package entry file;
/// `None` for a plain source file.
pub fn package_entry_rank(file_name: &str) -> Option<usize> {
    ENTRY_PRECEDENCE.iter().position(|e| *e == file_name)
}

fn file_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

fn parent_dir(path: &str) -> Option<&str> {
    path.rfind('/').map(|i| &path[..i])
}

/// The package structure of a walked file set: which directories are packages
/// (hold an entry file) and which entry file represents each.
#[derive(Debug, Clone, Default)]
pub struct PackageIndex {
    /// Package directory (repo-relative POSIX; `""` = repository root) → the
    /// repo-relative path of its elected entry file.
    entry_by_dir: BTreeMap<String, String>,
}

impl PackageIndex {
    /// Build from repo-relative POSIX file paths. Bounded by the walked set.
    pub fn build<'a>(paths: impl IntoIterator<Item = &'a str>) -> PackageIndex {
        let mut entry_by_dir: BTreeMap<String, (usize, String)> = BTreeMap::new();
        for path in paths {
            let Some(rank) = package_entry_rank(file_name(path)) else {
                continue;
            };
            let dir = parent_dir(path).unwrap_or("").to_string();
            match entry_by_dir.get(&dir) {
                Some((held, _)) if *held <= rank => {}
                _ => {
                    entry_by_dir.insert(dir, (rank, path.to_string()));
                }
            }
        }
        PackageIndex {
            entry_by_dir: entry_by_dir
                .into_iter()
                .map(|(dir, (_, path))| (dir, path))
                .collect(),
        }
    }

    /// Whether `path` is the elected entry file of its own directory.
    pub fn is_entry(&self, path: &str) -> bool {
        let dir = parent_dir(path).unwrap_or("");
        self.entry_by_dir.get(dir).is_some_and(|e| e == path)
    }

    /// The nearest package DIRECTORY a file belongs to: its own directory if
    /// that is a package, else the closest ancestor that is; `None` when no
    /// ancestor (including the root) holds an entry file (a standalone file).
    /// An entry file belongs to the package it defines.
    pub fn package_root(&self, path: &str) -> Option<&str> {
        let mut dir = parent_dir(path).unwrap_or("");
        loop {
            if let Some((key, _)) = self.entry_by_dir.get_key_value(dir) {
                return Some(key.as_str());
            }
            match parent_dir(dir) {
                Some(up) => dir = up,
                None if !dir.is_empty() => dir = "",
                None => return None,
            }
        }
    }

    /// The entry FILE representing the package `path` belongs to (its own path
    /// when it is that entry); `None` for a standalone file.
    pub fn package_entry(&self, path: &str) -> Option<&str> {
        self.package_root(path)
            .and_then(|dir| self.entry_by_dir.get(dir))
            .map(String::as_str)
    }

    /// The entry file of the package that is the PARENT of the package rooted
    /// at `dir` — the nearest ancestor package's entry. `None` for a top
    /// package (no packaged ancestor).
    pub fn parent_package_entry(&self, dir: &str) -> Option<&str> {
        if dir.is_empty() {
            return None;
        }
        let mut dir = parent_dir(dir).unwrap_or("");
        loop {
            if let Some(entry) = self.entry_by_dir.get(dir) {
                return Some(entry.as_str());
            }
            match parent_dir(dir) {
                Some(up) => dir = up,
                None if !dir.is_empty() => dir = "",
                None => return None,
            }
        }
    }

    /// Every package directory, in key order.
    pub fn package_dirs(&self) -> impl Iterator<Item = &str> {
        self.entry_by_dir.keys().map(String::as_str)
    }

    /// The elected entry file of a package directory.
    pub fn entry_of_dir(&self, dir: &str) -> Option<&str> {
        self.entry_by_dir.get(dir).map(String::as_str)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn index(paths: &[&str]) -> PackageIndex {
        PackageIndex::build(paths.iter().copied())
    }

    #[test]
    fn entry_files_elect_one_representative_per_directory() {
        let idx = index(&["src/lib.rs", "src/main.rs", "src/util.rs"]);
        assert_eq!(
            idx.entry_of_dir("src"),
            Some("src/lib.rs"),
            "lib beats main"
        );
        assert!(idx.is_entry("src/lib.rs"));
        assert!(
            !idx.is_entry("src/main.rs"),
            "outranked candidate is a member"
        );
        assert!(!idx.is_entry("src/util.rs"));
    }

    #[test]
    fn package_root_walks_to_the_nearest_packaged_ancestor() {
        let idx = index(&[
            "pkg/__init__.py",
            "pkg/core.py",
            "pkg/sub/deep.py", // sub has NO entry → folds up to pkg
            "loose/notes.py",  // no packaged ancestor anywhere → standalone
        ]);
        assert_eq!(idx.package_root("pkg/core.py"), Some("pkg"));
        assert_eq!(idx.package_entry("pkg/core.py"), Some("pkg/__init__.py"));
        assert_eq!(idx.package_root("pkg/sub/deep.py"), Some("pkg"));
        assert_eq!(idx.package_root("loose/notes.py"), None);
        assert_eq!(idx.package_entry("loose/notes.py"), None);
        // The entry file belongs to the package it defines.
        assert_eq!(idx.package_root("pkg/__init__.py"), Some("pkg"));
    }

    #[test]
    fn root_level_entry_makes_the_repository_root_a_package() {
        let idx = index(&["index.ts", "app.ts", "sub/x.ts"]);
        assert_eq!(idx.package_root("app.ts"), Some(""));
        assert_eq!(idx.package_entry("sub/x.ts"), Some("index.ts"));
    }

    #[test]
    fn parent_package_entry_links_nested_packages() {
        let idx = index(&[
            "pkg/__init__.py",
            "pkg/sub/__init__.py",
            "pkg/sub/deeper/leaf/__init__.py", // gap at `deeper` still folds up
        ]);
        assert_eq!(idx.parent_package_entry("pkg/sub"), Some("pkg/__init__.py"));
        assert_eq!(
            idx.parent_package_entry("pkg/sub/deeper/leaf"),
            Some("pkg/sub/__init__.py")
        );
        assert_eq!(idx.parent_package_entry("pkg"), None, "top package");
    }
}
