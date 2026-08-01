//! Bounded single-level worktree listing with SERVED ignore provenance
//! (dashboard-code-tree ADR: "The listing endpoint"; code-tree-legibility ADR
//! D4).
//!
//! The codebase file-tree browser is a thinner read over the same worktree
//! substrate the structural tier already walks (engine-read-and-infer): listing
//! files is inference's own input, not a new capability and never a mutation.
//! Unlike the structural tier's whole-tree walk (`ingest-struct` resolve), this
//! lists exactly ONE directory level per call so the rail can expand lazily and
//! the wire never carries a whole-repo body (the bounded-read discipline the
//! graph already honors via `MAX_GRAPH_NODES`).
//!
//! Ignore handling is gix's OWN exclude machinery (`gix-ignore`, already in the
//! dependency tree), so `.gitignore` gets its real semantics — globs, negation,
//! anchoring, nesting, `.git/info/exclude`, and the user's global excludes file
//! — rather than the bare directory-name subset this walk used to collect. That
//! subset, and the "hide anything that matches" behavior it drove, are RETIRED:
//! an ignored entry is now LISTED and carries [`IgnoreSource`] saying which
//! ignore file claimed it, and the client dims it. Hiding an entry the user can
//! see on disk was never truth; provenance is.
//!
//! `.vaultspecragignore` rides the SAME matcher as a second pattern set and is
//! reported distinctly, so a file excluded from the semantic index reads
//! differently from one git ignores. The tree only reports which ignore file
//! matched — rag remains the sole authority on what it actually indexes.
//!
//! The one entry still withheld is the repository database (`.git`) itself: it
//! is git's storage, not the operator's content, and no ignore file lists it.

use std::path::{Component, Path, PathBuf};

use gix::bstr::ByteSlice;

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

/// Which ignore file claimed an entry. Reported distinctly because the two mean
/// different things to the operator: `Git` is "not in version control", `Rag`
/// is "outside the semantic index".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IgnoreSource {
    /// Matched by git's exclude machinery: a `.gitignore` on the path,
    /// `.git/info/exclude`, or the configured global excludes file.
    Git,
    /// Matched by a `.vaultspecragignore` on the path.
    Rag,
}

impl IgnoreSource {
    /// The stable wire token.
    pub fn as_str(self) -> &'static str {
        match self {
            IgnoreSource::Git => "git",
            IgnoreSource::Rag => "rag",
        }
    }
}

/// The filename carrying rag's exclusion patterns, read with `.gitignore`
/// syntax through the same matcher.
const RAG_IGNORE_FILE: &str = ".vaultspecragignore";

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
    /// For a directory, whether it has at least one child (the
    /// disclosure-affordance hint); always false for a file.
    pub has_children: bool,
    /// Which ignore file claimed this entry; `None` when nothing ignores it.
    pub ignored: Option<IgnoreSource>,
}

/// True for the repository database itself — the one entry the listing
/// withholds. Covers both spellings: a directory in the main checkout, and the
/// `.git` FILE that points at the common dir in a linked worktree.
fn is_repository_database(name: &str) -> bool {
    name == ".git"
}

/// The two ignore matchers for one worktree, both gix's own.
///
/// Built once per listed level and reused for every child and every
/// `has_children` probe, so a level costs one repository open regardless of how
/// many entries it holds.
struct IgnoreOracle {
    /// `None` when the root is not a readable git repository: there is then no
    /// git ignore truth to report, and nothing is claimed as git-ignored rather
    /// than something being guessed.
    repo: Option<gix::Repository>,
    stack: Option<gix::worktree::Stack>,
    /// The `.vaultspecragignore` patterns on the path from the worktree root
    /// down to the listed directory, deepest last so a nested file wins.
    rag: Option<gix::ignore::Search>,
    case: gix::glob::pattern::Case,
}

impl IgnoreOracle {
    fn build(root: &Path, rel: &Path) -> Self {
        let repo = gix::open(root).ok();
        let case = repo
            .as_ref()
            .map(|repo| {
                if repo
                    .config_snapshot()
                    .boolean("core.ignoreCase")
                    .unwrap_or(false)
                {
                    gix::glob::pattern::Case::Fold
                } else {
                    gix::glob::pattern::Case::Sensitive
                }
            })
            .unwrap_or(gix::glob::pattern::Case::Sensitive);
        let stack = repo.as_ref().and_then(|repo| {
            let index = repo.index_or_empty().ok()?;
            let stack = repo
                .excludes(
                    &index,
                    None,
                    gix::worktree::stack::state::ignore::Source::WorktreeThenIdMappingIfNotSkipped,
                )
                .ok()?;
            Some(stack.detach())
        });
        IgnoreOracle {
            repo,
            stack,
            rag: build_rag_search(root, rel),
            case,
        }
    }

    /// Which ignore file claims `rel_path`, if any. Git wins when both match:
    /// version-control truth is the stronger statement about a file, and the
    /// two are reported on one channel.
    fn ignored(&mut self, rel_path: &str, is_dir: bool) -> Option<IgnoreSource> {
        if self.git_ignored(rel_path, is_dir) {
            return Some(IgnoreSource::Git);
        }
        if self.rag_ignored(rel_path, is_dir) {
            return Some(IgnoreSource::Rag);
        }
        None
    }

    fn git_ignored(&mut self, rel_path: &str, is_dir: bool) -> bool {
        let (Some(stack), Some(repo)) = (self.stack.as_mut(), self.repo.as_ref()) else {
            return false;
        };
        let mode = is_dir.then_some(gix::index::entry::Mode::DIR);
        stack
            .at_path(rel_path, mode, &repo.objects)
            .map(|platform| platform.is_excluded())
            .unwrap_or(false)
    }

    fn rag_ignored(&self, rel_path: &str, is_dir: bool) -> bool {
        let Some(search) = self.rag.as_ref() else {
            return false;
        };
        search
            .pattern_matching_relative_path(rel_path.as_bytes().as_bstr(), Some(is_dir), self.case)
            .is_some_and(|matched| !matched.pattern.is_negative())
    }
}

/// Assemble the `.vaultspecragignore` pattern sets on the path from the
/// worktree root down to (and including) the listed directory. Each file's
/// patterns are anchored at the directory that declares them, exactly as
/// `.gitignore` nesting works, because they ride the same `gix-ignore` parser.
fn build_rag_search(root: &Path, rel: &Path) -> Option<gix::ignore::Search> {
    let mut search = gix::ignore::Search::default();
    let mut found = false;
    let mut dir = root.to_path_buf();
    let mut dirs = vec![dir.clone()];
    for component in rel.components() {
        if let Component::Normal(segment) = component {
            dir = dir.join(segment);
            dirs.push(dir.clone());
        }
    }
    for directory in dirs {
        let source = directory.join(RAG_IGNORE_FILE);
        let Ok(bytes) = std::fs::read(&source) else {
            continue;
        };
        search.add_patterns_buffer(
            &bytes,
            source,
            Some(root),
            gix::ignore::search::Ignore::default(),
        );
        found = true;
    }
    found.then_some(search)
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

/// Does the directory hold anything the listing would show? Cheap: stops at the
/// first entry. Ignored entries COUNT — they are listed now, so a directory
/// holding only ignored content still discloses (and the user sees why).
fn has_listable_child(dir: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    entries
        .flatten()
        .any(|entry| !is_repository_database(entry.file_name().to_string_lossy().as_ref()))
}

/// List the immediate children of `rel` (repo-relative; empty/`"/"` for the
/// worktree root) under the worktree `root`, ONE level deep, every entry
/// carrying its ignore provenance.
///
/// Children are returned sorted: directories before files, each group
/// case-sensitively by path, so the listing is deterministic and the cursor
/// pagination (applied by the caller) is stable. Each child carries its
/// repo-relative POSIX path, its kind, a cheap `has_children` hint for
/// directories, and which ignore file (if any) claims it. Metadata only; no
/// bytes are read.
pub fn list_dir(root: &Path, rel: &str) -> Result<Vec<ChildEntry>> {
    let (abs, rel_path) = resolve_within_root(root, rel)?;
    let mut oracle = IgnoreOracle::build(root, &rel_path);
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&abs)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_repository_database(&name) {
            continue;
        }
        let path = entry.path();
        let is_dir = path.is_dir();
        let rel_str = rel_path.join(&name).to_string_lossy().replace('\\', "/");
        let ignored = oracle.ignored(&rel_str, is_dir);
        out.push(ChildEntry {
            path: rel_str,
            is_dir,
            has_children: is_dir && has_listable_child(&path),
            ignored,
        });
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
    use crate::workspace::fixtures::git;

    fn touch(path: &Path) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, "x").unwrap();
    }

    /// Ignore truth comes from git, so the fixtures are real repositories.
    fn repo(root: &Path) {
        git(root, &["init", "-b", "main", "."]);
    }

    fn find<'a>(children: &'a [ChildEntry], path: &str) -> &'a ChildEntry {
        children
            .iter()
            .find(|c| c.path == path)
            .unwrap_or_else(|| panic!("`{path}` is listed"))
    }

    #[test]
    fn lists_one_level_dirs_before_files_sorted() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        repo(root);
        touch(&root.join("README.md"));
        touch(&root.join("Cargo.toml"));
        touch(&root.join("src/main.rs"));
        touch(&root.join("docs/guide.md"));

        let children = list_dir(root, "").unwrap();
        let paths: Vec<&str> = children.iter().map(|c| c.path.as_str()).collect();
        // Dirs first (docs, src), then files (Cargo.toml, README.md).
        assert_eq!(paths, vec!["docs", "src", "Cargo.toml", "README.md"]);
        // Only the immediate level — src/main.rs is NOT in the root listing.
        assert!(!paths.iter().any(|p| p.contains("main.rs")));
        assert!(children[0].is_dir && children[0].has_children);
        assert!(children[1].is_dir && children[1].has_children);
        // Nothing ignores any of it.
        assert!(children.iter().all(|c| c.ignored.is_none()));
    }

    #[test]
    fn descends_one_level_into_a_subdirectory() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        repo(root);
        touch(&root.join("src/main.rs"));
        touch(&root.join("src/lib.rs"));
        touch(&root.join("src/inner/deep.rs"));

        let children = list_dir(root, "src").unwrap();
        let paths: Vec<&str> = children.iter().map(|c| c.path.as_str()).collect();
        assert_eq!(paths, vec!["src/inner", "src/lib.rs", "src/main.rs"]);
        assert!(children[0].is_dir && children[0].has_children);
    }

    #[test]
    fn a_gitignored_file_and_directory_are_shown_and_marked() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        repo(root);
        std::fs::write(root.join(".gitignore"), "build/\n*.log\n").unwrap();
        touch(&root.join("src/main.rs"));
        touch(&root.join("build/out.o"));
        touch(&root.join("debug.log"));

        let children = list_dir(root, "").unwrap();
        let paths: Vec<&str> = children.iter().map(|c| c.path.as_str()).collect();
        assert!(
            paths.contains(&"build") && paths.contains(&"debug.log"),
            "ignored entries are SHOWN, not hidden: {paths:?}"
        );
        assert_eq!(find(&children, "build").ignored, Some(IgnoreSource::Git));
        assert_eq!(
            find(&children, "debug.log").ignored,
            Some(IgnoreSource::Git)
        );
        assert_eq!(find(&children, "src").ignored, None);
        assert_eq!(find(&children, ".gitignore").ignored, None);
    }

    #[test]
    fn glob_and_negation_patterns_are_honored_not_skipped() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        repo(root);
        // The retired collector dropped every line containing `*` or `!`; gix's
        // machinery evaluates both, so these three files differ.
        std::fs::write(root.join(".gitignore"), "*.tmp\n!keep.tmp\n").unwrap();
        touch(&root.join("scratch.tmp"));
        touch(&root.join("keep.tmp"));
        touch(&root.join("main.rs"));

        let children = list_dir(root, "").unwrap();
        assert_eq!(
            find(&children, "scratch.tmp").ignored,
            Some(IgnoreSource::Git),
            "a glob pattern matches"
        );
        assert_eq!(
            find(&children, "keep.tmp").ignored,
            None,
            "a negation re-includes"
        );
        assert_eq!(find(&children, "main.rs").ignored, None);
    }

    #[test]
    fn a_nested_gitignore_applies_to_its_own_subtree() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        repo(root);
        touch(&root.join("pkg/notes.md"));
        touch(&root.join("notes.md"));
        std::fs::write(root.join("pkg/.gitignore"), "notes.md\n").unwrap();

        assert_eq!(
            find(&list_dir(root, "pkg").unwrap(), "pkg/notes.md").ignored,
            Some(IgnoreSource::Git)
        );
        assert_eq!(
            find(&list_dir(root, "").unwrap(), "notes.md").ignored,
            None,
            "the nested rule does not leak upward"
        );
    }

    #[test]
    fn a_ragignored_entry_reports_rag_not_git() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        repo(root);
        std::fs::write(root.join(RAG_IGNORE_FILE), "fixtures/\n*.snap\n").unwrap();
        touch(&root.join("fixtures/big.json"));
        touch(&root.join("render.snap"));
        touch(&root.join("main.rs"));

        let children = list_dir(root, "").unwrap();
        assert_eq!(find(&children, "fixtures").ignored, Some(IgnoreSource::Rag));
        assert_eq!(
            find(&children, "render.snap").ignored,
            Some(IgnoreSource::Rag)
        );
        assert_eq!(find(&children, "main.rs").ignored, None);
    }

    #[test]
    fn git_wins_when_both_ignore_files_claim_one_entry() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        repo(root);
        std::fs::write(root.join(".gitignore"), "shared/\n").unwrap();
        std::fs::write(root.join(RAG_IGNORE_FILE), "shared/\n").unwrap();
        touch(&root.join("shared/thing.txt"));

        let children = list_dir(root, "").unwrap();
        assert_eq!(find(&children, "shared").ignored, Some(IgnoreSource::Git));
    }

    #[test]
    fn the_repository_database_is_the_one_withheld_entry() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        repo(root);
        touch(&root.join("src/main.rs"));
        touch(&root.join(".vault/plan/p.md"));
        touch(&root.join(".github/workflows/ci.yml"));

        let children = list_dir(root, "").unwrap();
        let paths: Vec<&str> = children.iter().map(|c| c.path.as_str()).collect();
        assert!(
            !paths.contains(&".git"),
            ".git is git's storage, not content"
        );
        assert!(paths.contains(&".vault"), "the corpus dot-dir is listed");
        assert!(
            paths.contains(&".github"),
            "ordinary dot-directories are listed now, not hidden"
        );
    }

    #[test]
    fn a_directory_of_only_ignored_children_still_discloses() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        repo(root);
        std::fs::write(root.join(".gitignore"), "node_modules/\n").unwrap();
        touch(&root.join("pkg/node_modules/dep/index.js"));

        let level = list_dir(root, "").unwrap();
        let pkg = find(&level, "pkg");
        assert!(pkg.is_dir);
        assert!(
            pkg.has_children,
            "its ignored child is listed, so the affordance is honest"
        );
        let inside = list_dir(root, "pkg").unwrap();
        assert_eq!(
            find(&inside, "pkg/node_modules").ignored,
            Some(IgnoreSource::Git)
        );
    }

    #[test]
    fn a_worktree_without_a_repository_lists_without_claiming_ignore_truth() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        // No `git init`: there is no git ignore authority here.
        std::fs::write(root.join(".gitignore"), "build/\n").unwrap();
        touch(&root.join("build/out.o"));
        touch(&root.join("main.rs"));

        let children = list_dir(root, "").unwrap();
        assert!(
            children
                .iter()
                .all(|c| c.ignored != Some(IgnoreSource::Git)),
            "nothing is claimed git-ignored without a repository to say so"
        );
        assert!(children.iter().any(|c| c.path == "build"));
    }

    #[test]
    fn ragignore_still_applies_without_a_git_repository() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::write(root.join(RAG_IGNORE_FILE), "vendor/\n").unwrap();
        touch(&root.join("vendor/lib.js"));
        touch(&root.join("main.rs"));

        let children = list_dir(root, "").unwrap();
        assert_eq!(find(&children, "vendor").ignored, Some(IgnoreSource::Rag));
        assert_eq!(find(&children, "main.rs").ignored, None);
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
