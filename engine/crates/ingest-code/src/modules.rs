//! Node and edge minting for the code corpus (codebase-graphing ADR D3/D4).
//!
//! Stored graph fact: file nodes (`code:{path}`), module nodes
//! (`code-mod:{dir}`) for every source-bearing directory, `contains` edges
//! (module → direct child file; parent module → nearest descendant module),
//! and deduplicated `imports` edges (file → file, multiplicity-counted).
//! The module-level aggregated import view is NOT minted here — it is a
//! generation-memoized projection at query time, mirroring the vault
//! constellation's `meta_edges`.

use std::collections::{BTreeMap, BTreeSet, HashMap};

use engine_model::{
    CanonicalKey, Edge, Facet, Node, NodeId, NodeKind, Presence, Provenance, RelationKind,
    ResolutionState, ScopeRef, Tier, Timestamp, edge_id, node_id,
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
}

pub struct ImportFact {
    pub target: String,
    /// Byte span of the first import statement that produced this target.
    pub span: (usize, usize),
}

/// The Rust "module key" for the repository root: module keys are
/// repo-relative directory paths, and the root's is `.` (an empty key would
/// vanish inside the `code-mod:{dir}` id form).
pub const ROOT_MODULE_KEY: &str = ".";

fn module_key(dir: &str) -> &str {
    if dir.is_empty() { ROOT_MODULE_KEY } else { dir }
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
/// their MODULE identity — the containing directory, or the crate name for a
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

/// The repo/scope basename, for titling the ROOT module (CGR-004): the literal
/// key "." is an internal token and must never surface (`ui-labels-are-user-facing`).
fn scope_basename(scope: &ScopeRef) -> String {
    let raw = match scope {
        ScopeRef::Worktree { path } => path.as_str(),
        ScopeRef::Ref { name } => name.as_str(),
    };
    let trimmed = raw.trim_end_matches('/');
    let leaf = trimmed.rsplit('/').next().unwrap_or(trimmed);
    if leaf.is_empty() {
        raw.to_string()
    } else {
        leaf.to_string()
    }
}

/// Disambiguated title for a MODULE node (CGR-004): the repository ROOT module
/// is titled by the scope basename (never the literal "."); a directory module
/// is titled `leaf/` when its leaf is unique repo-wide, else by its full key
/// (with a trailing `/`) so the many `src`/`tests`/`utils` directories never
/// collapse into indistinguishable labels. `leaf_counts` is the repo-wide leaf
/// frequency over the module set.
fn module_title(dir: &str, leaf_counts: &BTreeMap<&str, usize>, scope: &ScopeRef) -> String {
    if dir == ROOT_MODULE_KEY {
        return scope_basename(scope);
    }
    let leaf = last_segment(dir);
    if leaf_counts.get(leaf).copied().unwrap_or(0) > 1 {
        format!("{dir}/")
    } else {
        format!("{leaf}/")
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
            dates: None,
            feature_tags: Vec::new(),
            status: None,
            tier: None,
            facets: vec![Facet {
                scope: scope.clone(),
                presence: Presence::Exists,
                content_hash: Some(f.content_hash.clone()),
                lifecycle: None,
            }],
        });
    }

    // ---------------------------------------------------------- module nodes
    // A module is a directory that directly contains at least one source file.
    let mut module_files: BTreeMap<String, Vec<&FileFact>> = BTreeMap::new();
    for f in files {
        module_files
            .entry(module_key(&parent_posix(&f.rel_path)).to_string())
            .or_default()
            .push(f);
    }
    let module_keys: BTreeSet<String> = module_files.keys().cloned().collect();
    // Repo-wide leaf frequency, so a colliding module leaf (many `src`) is
    // titled by its full key instead of an indistinguishable label (CGR-004).
    let mut leaf_counts: BTreeMap<&str, usize> = BTreeMap::new();
    for dir in &module_keys {
        if dir != ROOT_MODULE_KEY {
            *leaf_counts.entry(last_segment(dir)).or_default() += 1;
        }
    }
    for dir in &module_keys {
        nodes.push(Node {
            id: node_id(&CanonicalKey::CodeModule { dir }),
            kind: NodeKind::CodeModule,
            key: dir.clone(),
            title: Some(module_title(dir, &leaf_counts, scope)),
            doc_type: None,
            dates: None,
            feature_tags: Vec::new(),
            status: None,
            tier: None,
            facets: vec![Facet {
                scope: scope.clone(),
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        });
    }

    // ------------------------------------------------------- contains edges
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
    // Module → direct child files.
    for (dir, children) in &module_files {
        let module_id = node_id(&CanonicalKey::CodeModule { dir });
        for f in children {
            let file_id = node_id(&CanonicalKey::CodeArtifact {
                path: &f.rel_path,
                symbol: None,
            });
            edges.push(contains(module_id.clone(), file_id, &f.rel_path));
        }
    }
    // Parent module → nearest descendant module (a connected module forest).
    for dir in &module_keys {
        if dir == ROOT_MODULE_KEY {
            continue;
        }
        let mut ancestor = parent_posix(dir);
        let parent = loop {
            let key = module_key(&ancestor).to_string();
            if module_keys.contains(&key) {
                break Some(key);
            }
            if ancestor.is_empty() {
                break None;
            }
            ancestor = parent_posix(&ancestor);
        };
        if let Some(parent) = parent {
            let src = node_id(&CanonicalKey::CodeModule { dir: &parent });
            let dst = node_id(&CanonicalKey::CodeModule { dir });
            edges.push(contains(src, dst, dir));
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
        }
    }

    #[test]
    fn mints_files_modules_containment_and_deduped_imports() {
        let files = vec![
            fact(
                "src/a.rs",
                &[("src/sub/b.rs", (0, 10)), ("src/sub/b.rs", (11, 20))],
            ),
            fact("src/sub/b.rs", &[]),
            fact("main.py", &[("src/a.rs", (5, 9))]),
        ];
        let (nodes, edges) = mint(&files, &scope(), 42, &HashMap::new());

        let node_ids: Vec<&str> = nodes.iter().map(|n| n.id.0.as_str()).collect();
        assert_eq!(
            node_ids,
            vec![
                "code:src/a.rs",
                "code:src/sub/b.rs",
                "code:main.py",
                "code-mod:.",
                "code-mod:src",
                "code-mod:src/sub",
            ]
        );

        let contains: Vec<(&str, &str)> = edges
            .iter()
            .filter(|e| e.edge.relation == RelationKind::Contains)
            .map(|e| (e.edge.src.0.as_str(), e.edge.dst.0.as_str()))
            .collect();
        assert!(contains.contains(&("code-mod:.", "code:main.py")));
        assert!(contains.contains(&("code-mod:src", "code:src/a.rs")));
        assert!(contains.contains(&("code-mod:src/sub", "code:src/sub/b.rs")));
        assert!(
            contains.contains(&("code-mod:.", "code-mod:src")),
            "module hierarchy"
        );
        assert!(contains.contains(&("code-mod:src", "code-mod:src/sub")));

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

    fn title_of<'a>(nodes: &'a [Node], id: &str) -> &'a str {
        nodes
            .iter()
            .find(|n| n.id.0 == id)
            .and_then(|n| n.title.as_deref())
            .unwrap_or_else(|| panic!("no node {id}"))
    }

    #[test]
    fn entry_files_are_titled_by_package_and_modules_are_disambiguated() {
        // CGR-003 (entry-file titling, all four languages + crate name) and
        // CGR-004 (leaf collision → full key, root module → scope basename).
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
            fact("build.rs", &[]),           // a root-level file mints the `.` module
        ];
        let (nodes, _) = mint(&files, &scope(), 1, &crate_names);

        // Entry files → their MODULE identity, not the bare entry filename.
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

        // Root module → scope basename (never the literal "."). Scope is Y:/repo.
        assert_eq!(title_of(&nodes, "code-mod:."), "repo");
        // Unique leaf → `leaf/`.
        assert_eq!(title_of(&nodes, "code-mod:pkg"), "pkg/");
        assert_eq!(title_of(&nodes, "code-mod:app/util"), "util/");
    }

    #[test]
    fn colliding_module_leaves_are_titled_by_full_key() {
        // Two different `src` directories must not both render as "src/".
        let files = vec![
            fact("engine/crates/a/src/lib.rs", &[]),
            fact("engine/crates/b/src/lib.rs", &[]),
        ];
        let (nodes, _) = mint(&files, &scope(), 1, &HashMap::new());
        assert_eq!(
            title_of(&nodes, "code-mod:engine/crates/a/src"),
            "engine/crates/a/src/"
        );
        assert_eq!(
            title_of(&nodes, "code-mod:engine/crates/b/src"),
            "engine/crates/b/src/"
        );
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
