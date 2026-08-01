//! The typed working-tree status snapshot: ONE bounded gix status run per
//! call, classified into the served `git_status` vocabulary.
//!
//! This is the engine's single status source (engine-spec D2.5: pure-Rust
//! `gix`, never a `git` subprocess). Both consumers ride it: the code-heat
//! recency key's dirty-path enumeration ([`worktrees::dirty_paths`]) reads the
//! reported path set, and the code file tree's per-entry `git_status` join
//! reads the classification. There is no second status walk.
//!
//! Bounded at creation like every accumulator: collection stops at `cap`
//! entries and the snapshot says so (`truncated`), a broken status entry is
//! skipped rather than fatal, and the diff parallelism is the same B5b bound
//! the worktree inspection uses.

use std::collections::BTreeMap;
use std::path::Path;

use crate::workspace::{GitError, Result};

/// The served per-entry working-tree state vocabulary. Absent (`None`) means
/// clean — a clean file carries no token at all rather than a `"clean"` one, so
/// the overwhelmingly common case costs nothing on the wire.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum FileStatus {
    /// Tracked and changed in the working tree or staged against HEAD.
    Modified,
    /// Staged as a new path against HEAD (including `--intent-to-add`).
    Added,
    /// Gone from the working tree, or staged for deletion.
    Deleted,
    /// Detected by rename/copy tracking as moved from another path.
    Renamed,
    /// Present on disk, in no index — git does not track it yet.
    Untracked,
    /// Carrying unresolved merge stages.
    Conflicted,
}

impl FileStatus {
    /// The stable wire token. Identity-bearing: never reused for another
    /// meaning, and the frontend maps token to presentation only.
    pub fn as_str(self) -> &'static str {
        match self {
            FileStatus::Modified => "modified",
            FileStatus::Added => "added",
            FileStatus::Deleted => "deleted",
            FileStatus::Renamed => "renamed",
            FileStatus::Untracked => "untracked",
            FileStatus::Conflicted => "conflicted",
        }
    }

    /// Precedence when one path is reported by BOTH halves of the status (a
    /// staged change against HEAD and a further working-tree change): the more
    /// urgent state wins, so a conflicted path never presents as merely
    /// modified. Higher is stronger.
    fn severity(self) -> u8 {
        match self {
            FileStatus::Untracked => 1,
            FileStatus::Modified => 2,
            FileStatus::Added => 3,
            FileStatus::Renamed => 4,
            FileStatus::Deleted => 5,
            FileStatus::Conflicted => 6,
        }
    }
}

/// One worktree's status, as a path-keyed snapshot.
///
/// Keys are repo-relative POSIX paths exactly as git reports them, which means
/// a collapsed untracked DIRECTORY arrives with a trailing `/` (gix's default
/// `UntrackedFiles::Collapsed`, matching `git status`). [`Self::get`] resolves
/// both spellings, so a caller joining a directory row does not have to know.
///
/// The value is `Option<FileStatus>`: `Some(_)` for a real change, `None` for a
/// path the iterator reported without a change to classify (a racily-clean
/// entry whose index stat merely wants refreshing). Both are "paths git
/// touched" — the dirty-set enumeration wants the whole key set, the tree join
/// wants only the classified ones.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StatusSnapshot {
    entries: BTreeMap<String, Option<FileStatus>>,
    truncated: bool,
}

impl StatusSnapshot {
    /// The status of one repo-relative path, or `None` when it is clean.
    /// `is_dir` lets a directory row also match git's collapsed `dir/` key.
    pub fn get(&self, path: &str, is_dir: bool) -> Option<FileStatus> {
        if let Some(status) = self.entries.get(path) {
            return *status;
        }
        if is_dir {
            let mut with_slash = String::with_capacity(path.len() + 1);
            with_slash.push_str(path);
            with_slash.push('/');
            if let Some(status) = self.entries.get(&with_slash) {
                return *status;
            }
        }
        None
    }

    /// Every repo-relative path the status reported, sorted and deduplicated —
    /// the dirty/untracked enumeration, including racily-clean entries.
    pub fn reported_paths(&self) -> impl Iterator<Item = &str> {
        self.entries.keys().map(String::as_str)
    }

    /// True when collection stopped at the cap: the snapshot is a prefix of the
    /// real status and says so rather than presenting as complete.
    pub fn truncated(&self) -> bool {
        self.truncated
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    fn record(&mut self, path: String, status: Option<FileStatus>) {
        self.entries
            .entry(path)
            .and_modify(|held| {
                *held = match (*held, status) {
                    (Some(a), Some(b)) if a.severity() >= b.severity() => Some(a),
                    (Some(_), Some(b)) => Some(b),
                    (Some(a), None) => Some(a),
                    (None, next) => next,
                };
            })
            .or_insert(status);
    }
}

/// Run ONE bounded status over the worktree at `root` and classify it.
///
/// Same configuration as the worktree inspection: untracked entries included
/// (an untracked file is exactly the divergence the tree must show), the
/// index-vs-worktree diff parallelism bounded (B5b), collection capped at
/// `cap`. `Err` only when the worktree is not a readable git repository — the
/// caller degrades honestly rather than presenting an unknown state as clean.
pub fn snapshot(root: &Path, cap: usize) -> Result<StatusSnapshot> {
    let repo = gix::open(root).map_err(|e| GitError::Other(e.to_string()))?;
    let platform = repo
        .status(gix::progress::Discard)
        .map_err(|e| GitError::Other(e.to_string()))?
        .index_worktree_options_mut(|opts| {
            opts.thread_limit = crate::worktrees::git_status_thread_limit();
        });
    let iter = platform
        .into_iter(None)
        .map_err(|e| GitError::Other(e.to_string()))?;

    let mut out = StatusSnapshot::default();
    for item in iter {
        let Ok(item) = item else { continue };
        if out.len() >= cap {
            out.truncated = true;
            break;
        }
        let path = item.location().to_string();
        out.record(path, classify(&item));
    }
    Ok(out)
}

/// Map one status item onto the served vocabulary. `None` = the item carries no
/// change to display (a racily-clean entry, or a dirwalk entry that is neither
/// untracked nor changed).
fn classify(item: &gix::status::Item) -> Option<FileStatus> {
    use gix::status::plumbing::index_as_worktree::{Change, EntryStatus};

    match item {
        // HEAD-tree vs index: what is STAGED.
        gix::status::Item::TreeIndex(change) => Some(match change {
            gix::diff::index::Change::Addition { .. } => FileStatus::Added,
            gix::diff::index::Change::Deletion { .. } => FileStatus::Deleted,
            gix::diff::index::Change::Modification { .. } => FileStatus::Modified,
            gix::diff::index::Change::Rewrite { .. } => FileStatus::Renamed,
        }),
        // Index vs worktree: what is UNSTAGED, plus the directory walk.
        gix::status::Item::IndexWorktree(item) => match item {
            gix::status::index_worktree::Item::Modification { status, .. } => match status {
                EntryStatus::Conflict { .. } => Some(FileStatus::Conflicted),
                EntryStatus::Change(Change::Removed) => Some(FileStatus::Deleted),
                EntryStatus::Change(
                    Change::Type { .. }
                    | Change::Modification { .. }
                    | Change::SubmoduleModification(_),
                ) => Some(FileStatus::Modified),
                EntryStatus::IntentToAdd => Some(FileStatus::Added),
                // Unchanged; only the index stat wants refreshing. Reported so
                // the dirty enumeration keeps its long-standing key set, but
                // there is no change to display.
                EntryStatus::NeedsUpdate(_) => None,
            },
            gix::status::index_worktree::Item::DirectoryContents { entry, .. } => {
                matches!(entry.status, gix::dir::entry::Status::Untracked)
                    .then_some(FileStatus::Untracked)
            }
            gix::status::index_worktree::Item::Rewrite { .. } => Some(FileStatus::Renamed),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::fixtures::git;
    use std::path::PathBuf;

    /// A real repository with one commit — the status classification has to run
    /// against actual git state, never a stand-in.
    fn repo_with_commit() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        git(&root, &["init", "-b", "main", "."]);
        write(&root.join("tracked.rs"), "fn main() {}\n");
        write(&root.join("kept.md"), "# kept\n");
        git(&root, &["add", "."]);
        git(&root, &["commit", "-m", "seed"]);
        (dir, root)
    }

    fn write(path: &Path, body: &str) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, body).unwrap();
    }

    #[test]
    fn classifies_untracked_modified_and_deleted() {
        let (_dir, root) = repo_with_commit();
        write(&root.join("fresh.txt"), "new\n");
        write(&root.join("tracked.rs"), "fn main() { changed(); }\n");
        std::fs::remove_file(root.join("kept.md")).unwrap();

        let snap = snapshot(&root, 1000).unwrap();
        assert_eq!(snap.get("fresh.txt", false), Some(FileStatus::Untracked));
        assert_eq!(snap.get("tracked.rs", false), Some(FileStatus::Modified));
        assert_eq!(snap.get("kept.md", false), Some(FileStatus::Deleted));
        // A clean, unchanged path carries no token at all.
        assert_eq!(snap.get("nothing-here.txt", false), None);
    }

    #[test]
    fn classifies_a_staged_addition_as_added() {
        let (_dir, root) = repo_with_commit();
        write(&root.join("staged.rs"), "pub fn added() {}\n");
        git(&root, &["add", "staged.rs"]);

        let snap = snapshot(&root, 1000).unwrap();
        assert_eq!(snap.get("staged.rs", false), Some(FileStatus::Added));
    }

    #[test]
    fn an_untracked_directory_resolves_for_its_directory_row() {
        let (_dir, root) = repo_with_commit();
        write(&root.join("newdir/a.txt"), "a\n");
        write(&root.join("newdir/b.txt"), "b\n");

        let snap = snapshot(&root, 1000).unwrap();
        // git collapses the untracked directory to `newdir/`; the directory row
        // resolves it without knowing that spelling.
        assert_eq!(snap.get("newdir", true), Some(FileStatus::Untracked));
    }

    #[test]
    fn collection_stops_at_the_cap_and_says_so() {
        let (_dir, root) = repo_with_commit();
        for i in 0..12 {
            write(&root.join(format!("f{i}.txt")), "x\n");
        }
        let snap = snapshot(&root, 3).unwrap();
        assert!(snap.truncated(), "a capped snapshot states its truncation");
        assert!(snap.len() <= 3, "collection stopped at the cap");

        let whole = snapshot(&root, 1000).unwrap();
        assert!(!whole.truncated());
        assert!(whole.len() >= 12);
    }

    #[test]
    fn the_stronger_state_wins_when_both_halves_report_one_path() {
        let mut snap = StatusSnapshot::default();
        snap.record("a".to_string(), Some(FileStatus::Modified));
        snap.record("a".to_string(), Some(FileStatus::Conflicted));
        snap.record("b".to_string(), Some(FileStatus::Conflicted));
        snap.record("b".to_string(), Some(FileStatus::Modified));
        assert_eq!(snap.get("a", false), Some(FileStatus::Conflicted));
        assert_eq!(snap.get("b", false), Some(FileStatus::Conflicted));
    }

    #[test]
    fn a_reported_but_unclassified_path_still_joins_the_dirty_enumeration() {
        let mut snap = StatusSnapshot::default();
        snap.record("racy.rs".to_string(), None);
        assert_eq!(snap.get("racy.rs", false), None, "no change to display");
        assert_eq!(
            snap.reported_paths().collect::<Vec<_>>(),
            vec!["racy.rs"],
            "but it is still a path git touched"
        );
    }

    #[test]
    fn a_non_repository_is_an_error_not_a_clean_lie() {
        let dir = tempfile::tempdir().unwrap();
        assert!(snapshot(dir.path(), 100).is_err());
    }
}
