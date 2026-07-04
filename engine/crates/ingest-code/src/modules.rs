//! Node and edge minting for the code corpus (codebase-graphing ADR D3/D4,
//! amended by the code-graph-files-only cutover).
//!
//! Stored graph fact: FILE nodes (`code:{path}`) only — a directory never
//! becomes a node. Package structure is carried by file→file `contains` edges
//! anchored on PACKAGE ENTRY FILES (`engine_model::PackageIndex`): a package's
//! entry (`__init__.py` / `mod.rs` / `lib.rs` / `main.rs` / `index.*`)
//! contains its member files, and a parent package's entry contains each child
//! package's entry — the layout scaffold and the nesting hierarchy, with zero
//! folder nodes. `imports` edges stay file→file (deduplicated,
//! multiplicity-counted). The package-level aggregated import view is NOT
//! minted here — it is a generation-memoized projection at query time,
//! mirroring the vault constellation's `meta_edges`.

use std::collections::{BTreeMap, HashMap};

use engine_model::{
    CanonicalKey, Edge, Facet, Node, NodeId, NodeKind, PackageIndex, Presence, Provenance,
    RelationKind, ResolutionState, ScopeRef, Tier, Timestamp, edge_id, node_id,
};

/// An edge plus its extraction-granularity multiplicity (the graph layer
/// aggregates multiplicity via `EdgeAttrs`, audit W01P01-003).
#[derive(Debug, Clone)]
pub struct CodeEdge {
    pub edge: Edge,
    pub multiplicity: u32,
}

/// One file's minting input.
pub struct FileFact {
    /// Repo-relative POSIX path.
    pub rel_path: String,
    /// Stable content hash of the file bytes.
    pub content_hash: String,
    /// Resolved internal import targets (repo-relative paths), one entry per
    /// import statement (duplicates aggregate into multiplicity).
    pub imports: Vec<ImportFact>,
    /// Worktree mtime (ms since epoch), already statted by the walk for the
    /// source-tree fingerprint; 0 = unknown. Becomes the node's
    /// `dates.modified` so the timeline range can narrow the code corpus
    /// (code-timeline-range ADR).
    pub mtime_ms: Timestamp,
}

pub struct ImportFact {
    pub target: String,
    /// Byte span of the first import statement that produced this target.
    pub span: (usize, usize),
}

fn parent_posix(path: &str) -> String {
    match path.rfind('/') {
        Some(i) => path[..i].to_string(),
        None => String::new(),
    }
}

fn last_segment(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// Package-aware title for a FILE node (CGR-003): entry files are titled by
/// their PACKAGE identity — the containing directory, or the crate name for a
/// Rust crate root — so every package's entry file reads as its package instead
/// of an interchangeable "__init__.py" / "index.ts" / "mod.rs" / "lib.rs". The
/// full path stays in the node `key` for hover truth; non-entry files keep their
/// bare filename. `crate_names` maps a crate src root (POSIX, repo-relative) to
/// its `[package] name` (from `ResolveIndex`).
fn file_title(rel_path: &str, crate_names: &HashMap<String, String>) -> String {
    let file = last_segment(rel_path);
    let dir = parent_posix(rel_path);
    let dir_leaf = last_segment(&dir);
    // The containing directory's name, falling back to the bare filename for an
    // entry file that sits at the repository root (no parent to name it by).
    let containing = || {
        if dir_leaf.is_empty() {
            file.to_string()
        } else {
            dir_leaf.to_string()
        }
    };
    match file {
        "__init__.py" | "index.ts" | "index.tsx" | "index.js" | "index.jsx" | "index.mjs"
        | "index.cjs" | "mod.rs" => containing(),
        // A crate root is titled by the crate's real (hyphenated) package name;
        // absent the manifest, fall back to the containing directory.
        "lib.rs" | "main.rs" => crate_names.get(&dir).cloned().unwrap_or_else(containing),
        _ => file.to_string(),
    }
}

/// Mint the stored code graph from per-file facts. Deterministic: sorted
/// inputs produce identically-ordered nodes and edges (stable ids regardless).
pub fn mint(
    files: &[FileFact],
    scope: &ScopeRef,
    observed_at: Timestamp,
    crate_names: &HashMap<String, String>,
) -> (Vec<Node>, Vec<CodeEdge>) {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();

    // ------------------------------------------------------------- file nodes
    for f in files {
        nodes.push(Node {
            id: node_id(&CanonicalKey::CodeArtifact {
                path: &f.rel_path,
                symbol: None,
            }),
            kind: NodeKind::CodeArtifact,
            key: f.rel_path.clone(),
            title: Some(file_title(&f.rel_path, crate_names)),
            doc_type: None,
            // The only date a code file honestly carries: its worktree mtime
            // (code-timeline-range ADR — `created`/`stamped` are vault-document
            // concepts). 0 = the walk could not stat a time → no dates, which
            // the date-range narrow treats as out-of-range (mirrors the vault's
            // missing-date exclusion).
            dates: (f.mtime_ms > 0).then_some(engine_model::Dates {
                created: None,
                modified: Some(f.mtime_ms),
                stamped: None,
            }),
            feature_tags: Vec::new(),
            status: None,
            tier: None,
            size: None,
            facets: vec![Facet {
                scope: scope.clone(),
                presence: Presence::Exists,
                content_hash: Some(f.content_hash.clone()),
                lifecycle: None,
            }],
        });
    }

    // ------------------------------------------------------- contains edges
    // Package containment, file→file (code-graph-files-only): the package's
    // entry FILE contains its member files, and a parent package's entry
    // contains each child package's entry. A standalone file (no packaged
    // ancestor) contains nothing and is contained by nothing — its only
    // structure is its imports.
    let packages = PackageIndex::build(files.iter().map(|f| f.rel_path.as_str()));
    let contains = |src: NodeId, dst: NodeId, target: &str| -> CodeEdge {
        let provenance = Provenance::TreeLayout {
            target: target.to_string(),
        };
        CodeEdge {
            edge: Edge {
                id: edge_id(
                    &src,
                    &dst,
                    &RelationKind::Contains,
                    Tier::Declared,
                    &provenance,
                ),
                src,
                dst,
                relation: RelationKind::Contains,
                tier: Tier::Declared,
                confidence: 1.0,
                state: None,
                provenance,
                scope: scope.clone(),
                observed_at,
            },
            multiplicity: 1,
        }
    };
    let file_node_id = |path: &str| node_id(&CanonicalKey::CodeArtifact { path, symbol: None });
    // Package entry → member file (the entry itself links upward, below).
    for f in files {
        let Some(entry) = packages.package_entry(&f.rel_path) else {
            continue;
        };
        if entry == f.rel_path {
            continue;
        }
        edges.push(contains(
            file_node_id(entry),
            file_node_id(&f.rel_path),
            &f.rel_path,
        ));
    }
    // Parent package entry → child package entry (the nesting hierarchy).
    let package_dirs: Vec<&str> = packages.package_dirs().collect();
    for dir in package_dirs {
        let entry = packages
            .entry_of_dir(dir)
            .expect("every package dir holds its elected entry");
        if let Some(parent_entry) = packages.parent_package_entry(dir) {
            edges.push(contains(
                file_node_id(parent_entry),
                file_node_id(entry),
                entry,
            ));
        }
    }

    // -------------------------------------------------------- imports edges
    for f in files {
        // Dedupe per (src, target): multiplicity counts repeat imports; the
        // first span provides provenance. Self-imports never mint.
        let mut by_target: BTreeMap<&str, (u32, (usize, usize))> = BTreeMap::new();
        for imp in &f.imports {
            if imp.target == f.rel_path {
                continue;
            }
            by_target
                .entry(imp.target.as_str())
                .and_modify(|(n, _)| *n += 1)
                .or_insert((1, imp.span));
        }
        let src = node_id(&CanonicalKey::CodeArtifact {
            path: &f.rel_path,
            symbol: None,
        });
        for (target, (multiplicity, span)) in by_target {
            let dst = node_id(&CanonicalKey::CodeArtifact {
                path: target,
                symbol: None,
            });
            let provenance = Provenance::DocumentBody {
                blob_hash: f.content_hash.clone(),
                span,
                target: target.to_string(),
            };
            edges.push(CodeEdge {
                edge: Edge {
                    id: edge_id(
                        &src,
                        &dst,
                        &RelationKind::Imports,
                        Tier::Structural,
                        &provenance,
                    ),
                    src: src.clone(),
                    dst,
                    relation: RelationKind::Imports,
                    tier: Tier::Structural,
                    // Structural resolved band (engine-graph `edges.rs`): the
                    // target is a walked, existing file by construction.
                    confidence: 0.9,
                    state: Some(ResolutionState::Resolved),
                    provenance,
                    scope: scope.clone(),
                    observed_at,
                },
                multiplicity,
            });
        }
    }

    (nodes, edges)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scope() -> ScopeRef {
        ScopeRef::Worktree {
            path: "Y:/repo".into(),
        }
    }

    fn fact(path: &str, imports: &[(&str, (usize, usize))]) -> FileFact {
        FileFact {
            rel_path: path.into(),
            content_hash: engine_model::content_hash(path.as_bytes()),
            imports: imports
                .iter()
                .map(|(t, span)| ImportFact {
                    target: (*t).to_string(),
                    span: *span,
                })
                .collect(),
            mtime_ms: 1_750_000_000_000, // 2025-06-15 UTC — an arbitrary fixed stat time
        }
    }

    #[test]
    fn mints_only_file_nodes_and_deduped_imports() {
        let files = vec![
            fact(
                "src/a.rs",
                &[("src/sub/b.rs", (0, 10)), ("src/sub/b.rs", (11, 20))],
            ),
            fact("src/sub/b.rs", &[]),
            fact("main.py", &[("src/a.rs", (5, 9))]),
        ];
        let (nodes, edges) = mint(&files, &scope(), 42, &HashMap::new());

        // Files only — no directory ever becomes a node (code-graph-files-only).
        let node_ids: Vec<&str> = nodes.iter().map(|n| n.id.0.as_str()).collect();
        assert_eq!(
            node_ids,
            vec!["code:src/a.rs", "code:src/sub/b.rs", "code:main.py"]
        );
        assert!(nodes.iter().all(|n| n.kind == NodeKind::CodeArtifact));

        // No package entry anywhere in this tree → no contains scaffold.
        assert!(
            edges
                .iter()
                .all(|e| e.edge.relation != RelationKind::Contains)
        );

        let imports: Vec<&CodeEdge> = edges
            .iter()
            .filter(|e| e.edge.relation == RelationKind::Imports)
            .collect();
        assert_eq!(imports.len(), 2);
        let dup = imports
            .iter()
            .find(|e| e.edge.src.0 == "code:src/a.rs")
            .unwrap();
        assert_eq!(dup.multiplicity, 2, "repeat import aggregates");
        assert_eq!(dup.edge.confidence, 0.9);
        assert_eq!(dup.edge.state, Some(ResolutionState::Resolved));
        assert_eq!(dup.edge.tier, Tier::Structural);
    }

    #[test]
    fn contains_scaffold_anchors_on_package_entry_files() {
        let files = vec![
            fact("pkg/__init__.py", &[]),
            fact("pkg/core.py", &[]),
            fact("pkg/sub/__init__.py", &[]),
            fact("pkg/sub/deep.py", &[]),
            fact("pkg/loose/notes.py", &[]), // no entry in loose/ → folds to pkg
            fact("tools/script.py", &[]),    // no packaged ancestor → standalone
            fact("src/lib.rs", &[]),
            fact("src/util.rs", &[]),
        ];
        let (nodes, edges) = mint(&files, &scope(), 1, &HashMap::new());
        assert!(nodes.iter().all(|n| n.id.0.starts_with("code:")));

        let contains: Vec<(&str, &str)> = edges
            .iter()
            .filter(|e| e.edge.relation == RelationKind::Contains)
            .map(|e| (e.edge.src.0.as_str(), e.edge.dst.0.as_str()))
            .collect();
        // Entry → direct members.
        assert!(contains.contains(&("code:pkg/__init__.py", "code:pkg/core.py")));
        assert!(contains.contains(&("code:pkg/sub/__init__.py", "code:pkg/sub/deep.py")));
        assert!(contains.contains(&("code:src/lib.rs", "code:src/util.rs")));
        // A file in an entry-less directory folds up to the nearest package.
        assert!(contains.contains(&("code:pkg/__init__.py", "code:pkg/loose/notes.py")));
        // Parent package entry → child package entry (the nesting hierarchy).
        assert!(contains.contains(&("code:pkg/__init__.py", "code:pkg/sub/__init__.py")));
        // A standalone file is contained by nothing.
        assert!(
            contains
                .iter()
                .all(|(_, dst)| *dst != "code:tools/script.py")
        );
        // An entry file is never contained by its own package (only its parent's).
        assert!(contains.iter().all(|(src, dst)| src != dst));
    }

    fn title_of<'a>(nodes: &'a [Node], id: &str) -> &'a str {
        nodes
            .iter()
            .find(|n| n.id.0 == id)
            .and_then(|n| n.title.as_deref())
            .unwrap_or_else(|| panic!("no node {id}"))
    }

    #[test]
    fn entry_files_are_titled_by_package() {
        // CGR-003 (entry-file titling, all four languages + crate name): an
        // entry file DISPLAYS as the package it defines; the path stays in `key`.
        let mut crate_names = HashMap::new();
        crate_names.insert(
            "engine/crates/engine-model/src".to_string(),
            "engine-model".to_string(),
        );
        let files = vec![
            fact("pkg/__init__.py", &[]),
            fact("frontend/src/stores/index.ts", &[]),
            fact("app/util/mod.rs", &[]),
            fact("engine/crates/engine-model/src/lib.rs", &[]),
            fact("app/util/helper.rs", &[]), // a plain file keeps its filename
        ];
        let (nodes, _) = mint(&files, &scope(), 1, &crate_names);

        // Entry files → their PACKAGE identity, not the bare entry filename.
        assert_eq!(title_of(&nodes, "code:pkg/__init__.py"), "pkg");
        assert_eq!(
            title_of(&nodes, "code:frontend/src/stores/index.ts"),
            "stores"
        );
        assert_eq!(title_of(&nodes, "code:app/util/mod.rs"), "util");
        // A crate root → the crate's real (hyphenated) package name.
        assert_eq!(
            title_of(&nodes, "code:engine/crates/engine-model/src/lib.rs"),
            "engine-model"
        );
        // A non-entry file keeps its bare filename.
        assert_eq!(title_of(&nodes, "code:app/util/helper.rs"), "helper.rs");
    }

    #[test]
    fn edge_ids_are_stable_across_reruns_and_content_changes() {
        // Provenance stable keys exclude the volatile blob hash and span: an
        // edit to the importing file that keeps the import must not re-key.
        let a1 = fact("a.py", &[("b.py", (0, 4))]);
        let mut a2 = fact("a.py", &[("b.py", (100, 140))]);
        a2.content_hash = "different".into();
        let (_, e1) = mint(&[a1], &scope(), 1, &HashMap::new());
        let (_, e2) = mint(&[a2], &scope(), 2, &HashMap::new());
        let i1 = e1
            .iter()
            .find(|e| e.edge.relation == RelationKind::Imports)
            .unwrap();
        let i2 = e2
            .iter()
            .find(|e| e.edge.relation == RelationKind::Imports)
            .unwrap();
        assert_eq!(i1.edge.id, i2.edge.id);
    }
}
