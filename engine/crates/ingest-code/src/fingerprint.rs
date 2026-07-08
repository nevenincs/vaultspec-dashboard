//! Source-tree fingerprint (codebase-graphing ADR D6): the extraction cache
//! key, mirroring the vault's `worktree_corpus_fingerprint` discipline in a
//! DISTINCT key space (a code fingerprint can never collide into the vault
//! fold's cache).
//!
//! Composition: `(rel_path, len, mtime_ms)` per walked file, in the walk's
//! deterministic order. Length+mtime rather than content bytes is the
//! build-system-standard fast key: checking it costs one directory walk, not a
//! full re-read of every source file. The accepted trade-off (recorded in ADR
//! D6): an editor that rewrites a file preserving BOTH size and mtime would
//! false-hit — tooling-standard behavior (make, cargo) and vanishingly rare in
//! practice; content hashes still ride each node's facet for exact provenance.

use crate::walk::WalkedFile;

/// Fingerprint the walked set. Any add, remove, rename, edit (mtime), or
/// truncation-state change produces a different value.
pub fn source_tree_fingerprint(files: &[WalkedFile], capped: bool) -> String {
    let mut buf = String::with_capacity(files.len() * 48);
    for f in files {
        buf.push_str(&f.rel_path);
        buf.push('\0');
        buf.push_str(&f.len.to_string());
        buf.push('\0');
        buf.push_str(&f.mtime_ms.to_string());
        buf.push('\n');
    }
    // A capped walk over the same prefix is a different corpus than an
    // uncapped one — the flag is part of the key.
    buf.push_str(if capped { "capped" } else { "complete" });
    engine_model::content_hash(buf.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lang::Lang;
    use std::path::PathBuf;

    fn wf(path: &str, len: u64, mtime: i64) -> WalkedFile {
        WalkedFile {
            rel_path: path.into(),
            abs_path: PathBuf::from(path),
            lang: Lang::Rust,
            len,
            mtime_ms: mtime,
        }
    }

    #[test]
    fn fingerprint_changes_on_any_corpus_delta() {
        let base = vec![wf("a.rs", 10, 100), wf("b.rs", 20, 200)];
        let fp = source_tree_fingerprint(&base, false);
        assert_eq!(fp, source_tree_fingerprint(&base, false), "deterministic");

        let edited = vec![wf("a.rs", 10, 999), wf("b.rs", 20, 200)];
        assert_ne!(fp, source_tree_fingerprint(&edited, false), "mtime");
        let grown = vec![wf("a.rs", 11, 100), wf("b.rs", 20, 200)];
        assert_ne!(fp, source_tree_fingerprint(&grown, false), "len");
        let removed = vec![wf("a.rs", 10, 100)];
        assert_ne!(fp, source_tree_fingerprint(&removed, false), "removal");
        assert_ne!(fp, source_tree_fingerprint(&base, true), "cap state");
    }
}
