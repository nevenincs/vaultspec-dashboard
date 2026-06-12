//! Workspace discovery (engine-spec §2.1, D2.1).
//!
//! Input is any directory; output is the **workspace**: the repository the
//! directory belongs to, identified by its **common git dir** — not the
//! launch path. Launching from any worktree of the same repository resolves
//! to the same workspace.

use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("git discovery: {0}")]
    Discover(#[from] Box<gix::discover::Error>),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("git: {0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, GitError>;

/// A workspace: one repository, identified by its common git dir.
/// Worktrees and refs are scopes within it, never separate workspaces.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Workspace {
    /// The repository's common git dir — the workspace identity key (D2.1).
    pub common_dir: PathBuf,
}

impl Workspace {
    /// Resolve any launch directory (a worktree root, a subdirectory deep
    /// inside one, or the main checkout) to its workspace.
    pub fn discover(start: &Path) -> Result<Self> {
        let repo = gix::discover(start).map_err(Box::new)?;
        let common_dir = repo.common_dir().to_path_buf();
        // Canonicalize so the identity key is stable regardless of how the
        // launch path spelled it (relative segments, symlinks, case).
        let common_dir = std::fs::canonicalize(&common_dir)?;
        Ok(Workspace { common_dir })
    }

    /// Open the gix repository for this workspace (main worktree view).
    pub fn open(&self) -> Result<gix::Repository> {
        gix::open(&self.common_dir).map_err(|e| GitError::Other(e.to_string()))
    }
}

#[cfg(test)]
pub(crate) mod fixtures {
    //! Fixture repositories for tests. The engine itself never shells out
    //! to `git` (D2.5); building *test fixtures* with the git CLI is fine —
    //! it exercises our gix code against repositories produced by the real
    //! tool users run.

    use std::path::Path;
    use std::process::Command;

    pub fn git(dir: &Path, args: &[&str]) {
        let output = Command::new("git")
            .current_dir(dir)
            .args(args)
            .env("GIT_AUTHOR_NAME", "fixture")
            .env("GIT_AUTHOR_EMAIL", "fixture@test")
            .env("GIT_COMMITTER_NAME", "fixture")
            .env("GIT_COMMITTER_EMAIL", "fixture@test")
            .output()
            .expect("git runs");
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    /// Init a repo with one commit on `main` and return its root.
    pub fn repo_with_commit(root: &Path) {
        git(root, &["init", "-b", "main", "."]);
        std::fs::write(root.join("README.md"), "fixture\n").unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "init"]);
    }
}

#[cfg(test)]
mod tests {
    use super::fixtures::*;
    use super::*;

    #[test]
    fn any_launch_path_resolves_to_the_same_workspace() {
        let dir = tempfile::tempdir().unwrap();
        repo_with_commit(dir.path());
        std::fs::create_dir_all(dir.path().join("src/deep")).unwrap();

        let from_root = Workspace::discover(dir.path()).unwrap();
        let from_deep = Workspace::discover(&dir.path().join("src/deep")).unwrap();
        assert_eq!(from_root, from_deep);
    }

    #[test]
    fn worktrees_of_one_repo_share_a_workspace_identity() {
        let dir = tempfile::tempdir().unwrap();
        let main = dir.path().join("main");
        std::fs::create_dir_all(&main).unwrap();
        repo_with_commit(&main);
        let feature = dir.path().join("feature-x");
        git(
            &main,
            &[
                "worktree",
                "add",
                "-b",
                "feature-x",
                feature.to_str().unwrap(),
            ],
        );

        let a = Workspace::discover(&main).unwrap();
        let b = Workspace::discover(&feature).unwrap();
        assert_eq!(a, b, "worktree and main checkout are one workspace");
    }

    #[test]
    fn non_repository_directories_fail() {
        let dir = tempfile::tempdir().unwrap();
        assert!(Workspace::discover(dir.path()).is_err());
    }
}
