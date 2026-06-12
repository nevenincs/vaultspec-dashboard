//! Document body reading (engine-spec §5.1): directly from the working
//! tree for worktree scopes, and from git blobs for ref-only scopes.
//! Reading is not CRUD; this crate still never writes.

use std::path::Path;

#[derive(Debug, thiserror::Error)]
pub enum StructError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("git: {0}")]
    Git(String),
    #[error("`{path}` not found at ref `{reference}`")]
    NotAtRef { reference: String, path: String },
}

pub type Result<T> = std::result::Result<T, StructError>;

/// A document body plus the identity of the bytes it came from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentBody {
    /// Repo-relative path of the document.
    pub path: String,
    pub text: String,
    /// **One namespace on both read paths (audit W01P04-101):** the
    /// git-style blob object id (SHA-1 over `blob {len}\0` + bytes),
    /// whether the bytes came from the working tree or the object DB.
    /// Identical content always gets the identical identity, so facet
    /// divergence (D4.2) and cache dedup (D2.4) compare truthfully.
    pub blob_hash: String,
}

/// Git-style blob object id over raw bytes — the unified `blob_hash`
/// namespace for both read paths.
pub fn blob_oid(bytes: &[u8]) -> String {
    gix::objs::compute_hash(gix::hash::Kind::Sha1, gix::objs::Kind::Blob, bytes)
        .expect("sha1 blob hash over in-memory bytes cannot fail")
        .to_string()
}

/// Read a document from a worktree checkout.
pub fn read_from_worktree(worktree_root: &Path, rel_path: &str) -> Result<DocumentBody> {
    let bytes = std::fs::read(worktree_root.join(rel_path))?;
    Ok(DocumentBody {
        path: rel_path.to_string(),
        blob_hash: blob_oid(&bytes),
        text: String::from_utf8_lossy(&bytes).into_owned(),
    })
}

/// Read a document from a ref's committed tree via the git object DB —
/// the ref-only scope path (D2.2: remote refs have no working tree).
pub fn read_from_ref(repo_dir: &Path, reference: &str, rel_path: &str) -> Result<DocumentBody> {
    let repo = gix::open(repo_dir).map_err(|e| StructError::Git(e.to_string()))?;
    let commit_id = repo
        .rev_parse_single(reference)
        .map_err(|e| StructError::Git(format!("rev-parse {reference}: {e}")))?;
    let commit = repo
        .find_commit(commit_id.detach())
        .map_err(|e| StructError::Git(e.to_string()))?;
    let tree = commit.tree().map_err(|e| StructError::Git(e.to_string()))?;
    let entry = tree
        .lookup_entry_by_path(rel_path)
        .map_err(|e| StructError::Git(e.to_string()))?
        .ok_or_else(|| StructError::NotAtRef {
            reference: reference.to_string(),
            path: rel_path.to_string(),
        })?;
    let object = entry
        .object()
        .map_err(|e| StructError::Git(e.to_string()))?;
    Ok(DocumentBody {
        path: rel_path.to_string(),
        blob_hash: object.id.to_string(),
        text: String::from_utf8_lossy(&object.data).into_owned(),
    })
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
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn reads_from_worktree_and_from_ref_blob() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-b", "main", "."]);
        std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
        std::fs::write(root.join(".vault/plan/p.md"), "committed body\n").unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "init"]);
        // Working tree diverges from the committed blob.
        std::fs::write(root.join(".vault/plan/p.md"), "working-tree body\n").unwrap();

        let wt = read_from_worktree(root, ".vault/plan/p.md").unwrap();
        assert_eq!(wt.text, "working-tree body\n");

        let blob = read_from_ref(root, "main", ".vault/plan/p.md").unwrap();
        assert_eq!(blob.text, "committed body\n");
        assert_ne!(
            wt.blob_hash, blob.blob_hash,
            "different bytes, different identity"
        );
    }

    #[test]
    fn identical_content_has_one_identity_across_both_read_paths() {
        // Audit W01P04-101: worktree reads and ref reads must share one
        // blob_hash namespace, or facet divergence trips falsely.
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-b", "main", "."]);
        std::fs::write(root.join("doc.md"), "same bytes\n").unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "init"]);

        let wt = read_from_worktree(root, "doc.md").unwrap();
        let blob = read_from_ref(root, "main", "doc.md").unwrap();
        assert_eq!(
            wt.blob_hash, blob.blob_hash,
            "identical content, identical identity"
        );
    }

    #[test]
    fn missing_path_at_ref_is_a_typed_error() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-b", "main", "."]);
        std::fs::write(root.join("a.md"), "x\n").unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-m", "init"]);
        assert!(matches!(
            read_from_ref(root, "main", "no/such.md"),
            Err(StructError::NotAtRef { .. })
        ));
    }
}
