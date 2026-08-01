//! Canonical structural Vault corpus membership.
//!
//! The working-tree and resolved-tree sources deliberately keep their own
//! inclusion policies: generated hidden/data/log worktree directories are not
//! authored corpus, while a resolved git tree reports its committed
//! `.vault/**/*.md` membership exactly as stored at that ref.

use std::path::Path;

/// A failed traversal of a resolved git tree.
#[derive(Debug, thiserror::Error)]
pub enum CorpusError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("git: {0}")]
    Git(String),
}

pub type Result<T> = std::result::Result<T, CorpusError>;

/// Enumerate authored Vault Markdown files from a worktree as normalized,
/// sorted repository-relative paths.
///
/// Hidden directories and files, plus `.vault/data/` and `.vault/logs/`, are
/// engine-owned or auxiliary worktree state rather than authored corpus.
/// Unreadable or absent directories remain absent membership, matching the
/// structural indexer's established best-effort worktree policy.
pub fn worktree_vault_documents(root: &Path) -> Vec<String> {
    enumerate_worktree_vault_documents(root, false)
        .expect("best-effort worktree enumeration suppresses traversal errors")
}

/// Enumerate authored Vault Markdown files from a worktree with typed traversal
/// errors. Consumers that promise strict listing diagnostics use this instead
/// of the structural indexer's best-effort membership policy.
pub fn try_worktree_vault_documents(root: &Path) -> Result<Vec<String>> {
    enumerate_worktree_vault_documents(root, true)
}

fn enumerate_worktree_vault_documents(root: &Path, report_errors: bool) -> Result<Vec<String>> {
    let mut documents = Vec::new();
    let mut stack = vec![root.join(".vault")];
    while let Some(directory) = stack.pop() {
        let entries = match std::fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) if report_errors => return Err(CorpusError::Io(error)),
            Err(_) => continue,
        };
        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) if report_errors => return Err(CorpusError::Io(error)),
                Err(_) => continue,
            };
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if path.is_dir() {
                if !is_excluded_worktree_directory(&name) {
                    stack.push(path);
                }
            } else if !name.starts_with('.')
                && name.ends_with(".md")
                && let Ok(relative) = path.strip_prefix(root)
            {
                documents.push(normalize_relative_path(relative));
            }
        }
    }
    documents.sort();
    Ok(documents)
}

/// Enumerate Vault Markdown files from an already-resolved Git tree as
/// normalized, sorted repository-relative paths.
///
/// This reports committed membership exactly as it stood at the reference.
/// Unlike a worktree walk, it does not apply the worktree-only auxiliary
/// directory exclusions.
pub fn tree_vault_documents(tree: &gix::Tree<'_>) -> Result<Vec<String>> {
    let mut documents = Vec::new();
    for entry in tree
        .traverse()
        .breadthfirst
        .files()
        .map_err(|error| CorpusError::Git(error.to_string()))?
    {
        let path = entry.filepath.to_string();
        if path.starts_with(".vault/") && path.ends_with(".md") {
            documents.push(normalize_tree_path(&path));
        }
    }
    documents.sort();
    Ok(documents)
}

fn is_excluded_worktree_directory(name: &str) -> bool {
    name.starts_with('.') || matches!(name, "data" | "logs")
}

fn normalize_relative_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn normalize_tree_path(path: &str) -> String {
    path.replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn git(dir: &Path, args: &[&str]) {
        let output = Command::new("git")
            .current_dir(dir)
            .args(args)
            .env("GIT_AUTHOR_NAME", "f")
            .env("GIT_AUTHOR_EMAIL", "f@t")
            .env("GIT_COMMITTER_NAME", "f")
            .env("GIT_COMMITTER_EMAIL", "f@t")
            .output()
            .expect("git runs");
        assert!(
            output.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn worktree_and_resolved_tree_membership_are_sorted_and_keep_their_policies() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path();
        git(root, &["init", "-b", "main", "."]);
        for path in [
            ".vault/plan/z-plan.md",
            ".vault/adr/a-adr.md",
            ".vault/nested/b-note.md",
            ".vault/.hidden/ignored.md",
            ".vault/.private.md",
            ".vault/data/cache.md",
            ".vault/logs/run.md",
            ".vault/plan/not-markdown.txt",
        ] {
            let file = root.join(path);
            std::fs::create_dir_all(file.parent().unwrap()).unwrap();
            std::fs::write(file, "body\n").unwrap();
        }
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "vault corpus"]);

        assert_eq!(
            worktree_vault_documents(root),
            vec![
                ".vault/adr/a-adr.md",
                ".vault/nested/b-note.md",
                ".vault/plan/z-plan.md",
            ],
            "worktree corpus excludes hidden/data/log auxiliary state and is sorted"
        );

        let repository = gix::open(root).unwrap();
        let commit_id = repository.rev_parse_single("main").unwrap();
        let commit = repository.find_commit(commit_id.detach()).unwrap();
        let tree = commit.tree().unwrap();
        assert_eq!(
            tree_vault_documents(&tree).unwrap(),
            vec![
                ".vault/.hidden/ignored.md",
                ".vault/.private.md",
                ".vault/adr/a-adr.md",
                ".vault/data/cache.md",
                ".vault/logs/run.md",
                ".vault/nested/b-note.md",
                ".vault/plan/z-plan.md",
            ],
            "resolved tree reports exactly the committed .vault markdown membership"
        );
    }
}
