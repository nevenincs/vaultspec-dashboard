//! Code-corpus ingestion (codebase-graphing ADR D2-D4, code-graph-files-only):
//! in-process tree-sitter extraction of file-level import edges and
//! package-entry containment from the working tree. Fully disconnected from
//! the vault `LinkageGraph` corpus — this crate emits `code:` FILE nodes only
//! (never a directory node) with `imports` / `contains` (entry-file→member)
//! edges, and never reads `.vault/`.
//!
//! A parse is a read: no subprocess, no toolchain, no build system, works on
//! uncommitted working-tree bytes (`engine-read-and-infer`,
//! `present-view-graph-reads-one-corpus-snapshot`). Every stage is bounded at
//! creation (`bounded-by-default-for-every-accumulator`): the walk caps file
//! count and file size, extraction parallelism is rayon's bounded pool, and
//! the honest counters ride the result for the tiers/truncation story.

pub mod extract;
pub mod fingerprint;
pub mod lang;
pub mod modules;
pub mod resolve;
pub mod walk;

use std::path::Path;

use rayon::prelude::*;

use engine_model::{Node, ScopeRef, now_ms, scope_token};

pub use modules::CodeEdge;
pub use walk::WalkCaps;

/// Honest extraction counters (ADR D8): served alongside the graph so the
/// wire can state truncation and accuracy rather than implying completeness.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ExtractionStats {
    /// Source files admitted by the walk (== file node count).
    pub files: usize,
    /// True when the walk stopped at its file-count ceiling.
    pub capped: bool,
    /// Files skipped unread for exceeding the size cap.
    pub skipped_too_large: usize,
    /// Files the grammar could not parse (still nodes; zero import edges).
    pub parse_errors: usize,
    /// Total import statements extracted.
    pub imports_total: usize,
    /// Imports resolved to a walked file (edge-minting).
    pub imports_internal: usize,
    /// Imports referencing packages/stdlib outside the repo (normal).
    pub imports_external: usize,
    /// Imports that looked repo-internal but matched no walked file (the
    /// resolver-accuracy signal).
    pub imports_unresolved: usize,
}

/// The extracted code corpus: stored-graph fact plus cache key and counters.
#[derive(Debug)]
pub struct CodeGraphData {
    pub nodes: Vec<Node>,
    pub edges: Vec<CodeEdge>,
    pub stats: ExtractionStats,
    /// Source-tree fingerprint (ADR D6): the extraction cache key.
    pub fingerprint: String,
}

/// Walk, parse, resolve, and mint the code graph for the worktree at `root`.
///
/// IO errors surface only from the top-level walk; per-file read/parse
/// failures degrade to counters (a broken file is normal working-tree state,
/// never a failed extraction).
pub fn extract_code_graph(root: &Path, caps: &WalkCaps) -> std::io::Result<CodeGraphData> {
    let outcome = walk::walk_source_tree(root, caps)?;
    let fingerprint = fingerprint::source_tree_fingerprint(&outcome.files, outcome.capped);
    let scope = ScopeRef::Worktree {
        path: scope_token(root),
    };

    // Parse + extract in parallel (rayon's bounded pool); read failures and
    // parse failures both degrade to per-file counters.
    let extractions: Vec<(usize, Option<extract::FileExtraction>)> = outcome
        .files
        .par_iter()
        .enumerate()
        .map(|(i, f)| {
            let ex = std::fs::read(&f.abs_path)
                .ok()
                .map(|bytes| extract::extract_file(f.lang, &bytes));
            (i, ex)
        })
        .collect();

    let rel_paths: Vec<String> = outcome.files.iter().map(|f| f.rel_path.clone()).collect();
    let index = resolve::ResolveIndex::build(root, &rel_paths, &outcome.cargo_manifests);

    let mut stats = ExtractionStats {
        files: outcome.files.len(),
        capped: outcome.capped,
        skipped_too_large: outcome.skipped_too_large,
        ..Default::default()
    };

    let mut facts = Vec::with_capacity(outcome.files.len());
    for (i, extraction) in extractions {
        let file = &outcome.files[i];
        let (content_hash, imports) = match extraction {
            Some(ex) => {
                if ex.parse_failed {
                    stats.parse_errors += 1;
                }
                let mut resolved = Vec::new();
                for raw in &ex.imports {
                    for r in index.resolve(&file.rel_path, file.lang, &raw.spec) {
                        stats.imports_total += 1;
                        match r {
                            resolve::Resolution::Internal(target) => {
                                stats.imports_internal += 1;
                                resolved.push(modules::ImportFact {
                                    target,
                                    span: raw.span,
                                });
                            }
                            resolve::Resolution::External => stats.imports_external += 1,
                            resolve::Resolution::Unresolved => stats.imports_unresolved += 1,
                        }
                    }
                }
                (ex.content_hash, resolved)
            }
            None => {
                stats.parse_errors += 1;
                (engine_model::content_hash(&[]), Vec::new())
            }
        };
        facts.push(modules::FileFact {
            rel_path: file.rel_path.clone(),
            content_hash,
            imports,
            mtime_ms: file.mtime_ms,
        });
    }

    let (nodes, edges) = modules::mint(&facts, &scope, now_ms(), index.crate_names_by_src_root());
    Ok(CodeGraphData {
        nodes,
        edges,
        stats,
        fingerprint,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_model::RelationKind;
    use std::fs;
    use std::path::Path;

    fn touch(root: &Path, rel: &str, content: &str) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, content).unwrap();
    }

    /// End-to-end over a small polyglot tree: walk → parse → resolve → mint.
    #[test]
    fn extracts_a_polyglot_fixture_tree() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        // Rust crate.
        touch(root, "Cargo.toml", "[package]\nname = \"demo\"\n");
        touch(root, "src/lib.rs", "mod util;\nuse crate::util::helper;\n");
        touch(root, "src/util.rs", "pub fn helper() {}\n");
        // TypeScript.
        touch(
            root,
            "web/app.ts",
            "import { g } from \"./graph\";\nimport React from \"react\";\n",
        );
        touch(root, "web/graph.ts", "export const g = 1;\n");
        // Python.
        touch(root, "py/pkg/__init__.py", "");
        touch(root, "py/pkg/core.py", "from . import sibling\nimport os\n");
        touch(root, "py/pkg/sibling.py", "x = 1\n");

        let data = extract_code_graph(root, &WalkCaps::default()).unwrap();

        assert_eq!(data.stats.files, 7);
        assert!(!data.stats.capped);
        assert_eq!(data.stats.parse_errors, 0);

        let imports: Vec<(String, String)> = data
            .edges
            .iter()
            .filter(|e| e.edge.relation == RelationKind::Imports)
            .map(|e| (e.edge.src.0.clone(), e.edge.dst.0.clone()))
            .collect();
        assert!(imports.contains(&("code:src/lib.rs".into(), "code:src/util.rs".into())));
        assert!(imports.contains(&("code:web/app.ts".into(), "code:web/graph.ts".into())));
        assert!(imports.contains(&(
            "code:py/pkg/core.py".into(),
            "code:py/pkg/sibling.py".into()
        )));
        // `mod util;` + `use crate::util::helper` dedupe into ONE edge with
        // multiplicity 2; react/os are external.
        let rs = data
            .edges
            .iter()
            .find(|e| e.edge.src.0 == "code:src/lib.rs" && e.edge.relation == RelationKind::Imports)
            .unwrap();
        assert_eq!(rs.multiplicity, 2);
        assert_eq!(data.stats.imports_external, 2, "react + os");
        assert_eq!(data.stats.imports_unresolved, 0);

        // Files are the ONLY node kind (code-graph-files-only): no directory
        // ever becomes a node. Package structure rides file→file contains
        // edges anchored on the entry files.
        assert!(data.nodes.iter().all(|n| n.id.0.starts_with("code:")));
        let contains: Vec<(String, String)> = data
            .edges
            .iter()
            .filter(|e| e.edge.relation == RelationKind::Contains)
            .map(|e| (e.edge.src.0.clone(), e.edge.dst.0.clone()))
            .collect();
        assert!(contains.contains(&(
            "code:py/pkg/__init__.py".into(),
            "code:py/pkg/core.py".into()
        )));
        assert!(contains.contains(&("code:src/lib.rs".into(), "code:src/util.rs".into())));
        // web/ has no entry file → its files are standalone (imports only).
        assert!(
            contains
                .iter()
                .all(|(_, dst)| !dst.starts_with("code:web/"))
        );

        // Fingerprint changes when a file is edited.
        let fp1 = data.fingerprint.clone();
        std::thread::sleep(std::time::Duration::from_millis(20));
        touch(root, "web/graph.ts", "export const g = 2; // edited\n");
        let data2 = extract_code_graph(root, &WalkCaps::default()).unwrap();
        assert_ne!(fp1, data2.fingerprint);
    }
}
