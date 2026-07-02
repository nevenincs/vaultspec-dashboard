//! Import-path resolution (codebase-graphing ADR D2): map a literal import
//! specification to a repo-relative TARGET FILE that the walk admitted.
//!
//! Resolution probes ONLY the walked-file set — never the filesystem — so it
//! is pure, fast, and consistent with the walk's ignore discipline. An import
//! that resolves to nothing is either EXTERNAL (a package/stdlib reference —
//! normal and counted) or UNRESOLVED (looked internal but no file matched —
//! counted separately as the accuracy signal). Neither mints an edge in v1
//! (ADR D2: dropped with counters).

use std::collections::{HashMap, HashSet};
use std::path::Path;

use crate::extract::ImportSpec;
use crate::lang::Lang;

/// The outcome of resolving one import spec.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Resolution {
    /// A walked file: mint an `imports` edge to `code:{path}`.
    Internal(String),
    /// A package / stdlib / bare specifier — outside the repo by nature.
    External,
    /// Looked repo-internal but no walked file matched (accuracy counter).
    Unresolved,
}

/// The probe index: the walked file set plus the Rust crate-name map.
pub struct ResolveIndex {
    files: HashSet<String>,
    /// Rust crate name (underscore-normalized) → crate src root (POSIX,
    /// repo-relative, e.g. `engine/crates/engine-model/src`).
    rust_crates: HashMap<String, String>,
}

impl ResolveIndex {
    /// Build the index from the walk outcome. Reads each seen `Cargo.toml`
    /// once to learn `[package] name` (hand-parsed line scan: the two fields
    /// we need don't justify a TOML dependency).
    pub fn build(root: &Path, files: &[String], cargo_manifests: &[String]) -> ResolveIndex {
        let mut rust_crates = HashMap::new();
        for manifest in cargo_manifests {
            let Ok(text) = std::fs::read_to_string(root.join(manifest)) else {
                continue;
            };
            if let Some(name) = package_name(&text) {
                let dir = parent_posix(manifest);
                let src = if dir.is_empty() {
                    "src".to_string()
                } else {
                    format!("{dir}/src")
                };
                rust_crates.insert(name.replace('-', "_"), src);
            }
        }
        ResolveIndex {
            files: files.iter().cloned().collect(),
            rust_crates,
        }
    }

    fn exists(&self, path: &str) -> bool {
        self.files.contains(path)
    }

    /// Resolve one import from `src_file` (repo-relative POSIX).
    pub fn resolve(&self, src_file: &str, lang: Lang, spec: &ImportSpec) -> Vec<Resolution> {
        match spec {
            ImportSpec::JsModule(s) => vec![self.resolve_js(src_file, s)],
            ImportSpec::RustMod(name) => vec![self.resolve_rust_mod(src_file, name)],
            ImportSpec::RustUse(text) => expand_rust_use(text)
                .into_iter()
                .map(|path| self.resolve_rust_use(src_file, &path))
                .collect(),
            ImportSpec::PyModule { module, names } => {
                vec![self.resolve_py_absolute(src_file, module, names)]
            }
            ImportSpec::PyRelative {
                dots,
                module,
                names,
            } => vec![self.resolve_py_relative(src_file, *dots, module.as_deref(), names)],
            // Defensive: a spec extracted for one language resolved as another
            // never happens through the public API (specs travel with their
            // file), but keep the match total.
            #[allow(unreachable_patterns)]
            _ => {
                let _ = lang;
                vec![Resolution::Unresolved]
            }
        }
    }

    // ------------------------------------------------------------- TS / JS

    fn resolve_js(&self, src_file: &str, spec: &str) -> Resolution {
        if !(spec.starts_with("./") || spec.starts_with("../")) {
            // Bare specifier: an npm package (or a tsconfig path alias, which
            // v1 deliberately does not honor — counted as external).
            return Resolution::External;
        }
        let base = normalize_join(&parent_posix(src_file), spec);
        let Some(base) = base else {
            return Resolution::Unresolved;
        };
        // Probe order: exact; ESM `.js`-suffixed → TS source swap; TS/JS
        // extensions; directory index files.
        let mut candidates: Vec<String> = vec![base.clone()];
        for stripped_ext in ["js", "jsx", "mjs", "cjs"] {
            if let Some(stem) = base.strip_suffix(&format!(".{stripped_ext}")) {
                candidates.push(format!("{stem}.ts"));
                candidates.push(format!("{stem}.tsx"));
            }
        }
        for ext in ["ts", "tsx", "js", "jsx", "mjs", "cjs", "d.ts"] {
            candidates.push(format!("{base}.{ext}"));
        }
        for index in [
            "index.ts", "index.tsx", "index.js", "index.jsx", "index.mjs",
        ] {
            candidates.push(format!("{base}/{index}"));
        }
        for c in candidates {
            if self.exists(&c) {
                return Resolution::Internal(c);
            }
        }
        Resolution::Unresolved
    }

    // ---------------------------------------------------------------- Rust

    fn resolve_rust_mod(&self, src_file: &str, name: &str) -> Resolution {
        let base = rust_module_dir(src_file);
        for candidate in [format!("{base}{name}.rs"), format!("{base}{name}/mod.rs")] {
            if self.exists(&candidate) {
                return Resolution::Internal(candidate);
            }
        }
        Resolution::Unresolved
    }

    fn resolve_rust_use(&self, src_file: &str, path: &str) -> Resolution {
        let segments: Vec<&str> = path.split("::").filter(|s| !s.is_empty()).collect();
        let Some((first, rest)) = segments.split_first() else {
            return Resolution::Unresolved;
        };
        match *first {
            "crate" => match self.crate_src_root(src_file) {
                Some(root) => self.probe_rust_segments(&root, rest),
                None => Resolution::Unresolved,
            },
            "self" => self.probe_rust_segments(rust_module_dir(src_file).trim_end_matches('/'), rest),
            "super" => {
                // Each leading `super` pops one module level.
                let mut dir = rust_module_dir(src_file);
                let mut rest = rest;
                loop {
                    dir = parent_posix(dir.trim_end_matches('/'));
                    match rest.split_first() {
                        Some((&"super", tail)) => rest = tail,
                        _ => break,
                    }
                }
                self.probe_rust_segments(&dir, rest)
            }
            "std" | "core" | "alloc" => Resolution::External,
            other => {
                let key = other.replace('-', "_");
                // A workspace crate by name?
                if let Some(src_root) = self.rust_crates.get(&key) {
                    let r = self.probe_rust_segments(src_root, rest);
                    if let Resolution::Internal(_) = r {
                        return r;
                    }
                    // The crate exists in-workspace; land on its root file.
                    for root_file in [format!("{src_root}/lib.rs"), format!("{src_root}/main.rs")] {
                        if self.exists(&root_file) {
                            return Resolution::Internal(root_file);
                        }
                    }
                    return Resolution::Unresolved;
                }
                // A sibling top-level module of this crate? (2015-edition style
                // or a re-export chain: `use walk::X` inside the same crate.)
                if let Some(root) = self.crate_src_root(src_file) {
                    let with_self: Vec<&str> = std::iter::once(other).chain(rest.iter().copied()).collect();
                    if let Resolution::Internal(p) = self.probe_rust_segments(&root, &with_self) {
                        return Resolution::Internal(p);
                    }
                }
                // Unknown first segment: an external crate.
                Resolution::External
            }
        }
    }

    /// Greedy longest-prefix probe: the deepest `a/b/c.rs` or `a/b/c/mod.rs`
    /// that exists wins (trailing segments are items, not modules). An empty
    /// segment list means "the module base itself" and probes its root file.
    /// A non-empty miss stays a miss — falling back to the base's root file
    /// here would false-resolve every unknown path to `lib.rs`.
    fn probe_rust_segments(&self, base: &str, segments: &[&str]) -> Resolution {
        let base = base.trim_end_matches('/');
        if segments.is_empty() {
            return self.probe_rust_root(base);
        }
        for k in (1..=segments.len()).rev() {
            let joined = segments[..k].join("/");
            let prefix = if base.is_empty() {
                joined
            } else {
                format!("{base}/{joined}")
            };
            for candidate in [format!("{prefix}.rs"), format!("{prefix}/mod.rs")] {
                if self.exists(&candidate) {
                    return Resolution::Internal(candidate);
                }
            }
        }
        Resolution::Unresolved
    }

    /// The module base's own file: `lib.rs`/`main.rs` for a crate src root,
    /// `mod.rs` for a module directory.
    fn probe_rust_root(&self, base: &str) -> Resolution {
        for root_file in [
            format!("{base}/lib.rs"),
            format!("{base}/main.rs"),
            format!("{base}/mod.rs"),
        ] {
            if self.exists(&root_file) {
                return Resolution::Internal(root_file);
            }
        }
        Resolution::Unresolved
    }

    /// The `src` root of the crate `src_file` belongs to: the registered crate
    /// root that prefixes it, else the nearest ancestor directory holding
    /// `lib.rs` or `main.rs`.
    fn crate_src_root(&self, src_file: &str) -> Option<String> {
        if let Some(root) = self
            .rust_crates
            .values()
            .filter(|root| src_file.starts_with(&format!("{root}/")))
            .max_by_key(|root| root.len())
        {
            return Some(root.clone());
        }
        let mut dir = parent_posix(src_file);
        loop {
            if self.exists(&format!("{dir}/lib.rs")) || self.exists(&format!("{dir}/main.rs")) {
                return Some(dir);
            }
            if dir.is_empty() {
                return None;
            }
            dir = parent_posix(&dir);
        }
    }

    // -------------------------------------------------------------- Python

    fn resolve_py_absolute(&self, src_file: &str, module: &str, names: &[String]) -> Resolution {
        let dotted = module.replace('.', "/");
        // Candidate roots, nearest first: the importing file's ancestor
        // package dirs (deepest → root), then the conventional `src` layout.
        let mut roots: Vec<String> = Vec::new();
        let mut dir = parent_posix(src_file);
        loop {
            roots.push(dir.clone());
            if dir.is_empty() {
                break;
            }
            dir = parent_posix(&dir);
        }
        roots.push("src".into());

        let mut saw_candidate = false;
        for root in &roots {
            let base = if root.is_empty() {
                dotted.clone()
            } else {
                format!("{root}/{dotted}")
            };
            if let Some(hit) = self.probe_py_base(&base, names) {
                return Resolution::Internal(hit);
            }
            // Track whether the module's top-level package exists anywhere we
            // probed: `import numpy` should read external, not unresolved.
            let top = module.split('.').next().unwrap_or(module);
            let top_base = if root.is_empty() {
                top.to_string()
            } else {
                format!("{root}/{top}")
            };
            if self.exists(&format!("{top_base}/__init__.py")) || self.exists(&format!("{top_base}.py")) {
                saw_candidate = true;
            }
        }
        if saw_candidate {
            Resolution::Unresolved
        } else {
            Resolution::External
        }
    }

    fn resolve_py_relative(
        &self,
        src_file: &str,
        dots: usize,
        module: Option<&str>,
        names: &[String],
    ) -> Resolution {
        // One dot = the current package dir; each further dot pops one level.
        let mut dir = parent_posix(src_file);
        for _ in 1..dots {
            if dir.is_empty() {
                return Resolution::Unresolved;
            }
            dir = parent_posix(&dir);
        }
        let base = match module {
            Some(m) => {
                let m = m.replace('.', "/");
                if dir.is_empty() { m } else { format!("{dir}/{m}") }
            }
            None => dir.clone(),
        };
        match self.probe_py_base(&base, names) {
            Some(hit) => Resolution::Internal(hit),
            None => Resolution::Unresolved,
        }
    }

    /// Probe a dotted-module base: the module file itself, its package
    /// `__init__.py`, and (for `from X import name`) each name as a submodule.
    fn probe_py_base(&self, base: &str, names: &[String]) -> Option<String> {
        for name in names {
            for candidate in [
                format!("{base}/{name}.py"),
                format!("{base}/{name}/__init__.py"),
            ] {
                if self.exists(&candidate) {
                    return Some(candidate);
                }
            }
        }
        for candidate in [format!("{base}.py"), format!("{base}/__init__.py")] {
            if self.exists(&candidate) {
                return Some(candidate);
            }
        }
        None
    }
}

/// `[package] name = "..."` from a Cargo manifest, line-scanned within the
/// `[package]` table only.
fn package_name(toml: &str) -> Option<String> {
    let mut in_package = false;
    for line in toml.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_package = line == "[package]";
            continue;
        }
        if in_package
            && let Some(rest) = line.strip_prefix("name")
        {
            let rest = rest.trim_start();
            if let Some(rest) = rest.strip_prefix('=') {
                return Some(rest.trim().trim_matches('"').to_string());
            }
        }
    }
    None
}

/// Expand a Rust `use` argument's brace groups into flat paths:
/// `a::{b, c::D}` → `["a::b", "a::c::D"]`. Renames (`as x`) are dropped;
/// `self` inside a group refers to the group prefix itself.
fn expand_rust_use(text: &str) -> Vec<String> {
    fn strip_rename(s: &str) -> &str {
        match s.find(" as ") {
            Some(i) => &s[..i],
            None => s,
        }
    }
    fn expand(prefix: &str, text: &str, out: &mut Vec<String>) {
        let text = text.trim();
        if let Some(open) = text.find('{') {
            let head = text[..open].trim().trim_end_matches("::");
            let Some(close) = text.rfind('}') else {
                return;
            };
            let inner = &text[open + 1..close];
            let joined = if prefix.is_empty() {
                head.to_string()
            } else if head.is_empty() {
                prefix.to_string()
            } else {
                format!("{prefix}::{head}")
            };
            // Split the group body at top-level commas (nested braces respected).
            let mut depth = 0usize;
            let mut start = 0usize;
            for (i, c) in inner.char_indices() {
                match c {
                    '{' => depth += 1,
                    '}' => depth = depth.saturating_sub(1),
                    ',' if depth == 0 => {
                        expand(&joined, &inner[start..i], out);
                        start = i + 1;
                    }
                    _ => {}
                }
            }
            expand(&joined, &inner[start..], out);
        } else {
            let path = strip_rename(text).trim();
            if path.is_empty() {
                return;
            }
            let full = if path == "self" {
                prefix.to_string()
            } else if prefix.is_empty() {
                path.to_string()
            } else {
                format!("{prefix}::{path}")
            };
            if !full.is_empty() {
                out.push(full);
            }
        }
    }
    let mut out = Vec::new();
    expand("", text, &mut out);
    out
}

/// The Rust "module directory" of a file: where its child modules live.
/// `a/b.rs` → `a/b/`; `a/mod.rs`, `src/lib.rs`, `src/main.rs` → their dir.
fn rust_module_dir(src_file: &str) -> String {
    let stem = src_file.rsplit('/').next().unwrap_or(src_file);
    let dir = parent_posix(src_file);
    let anchored = matches!(stem, "mod.rs" | "lib.rs" | "main.rs");
    if anchored {
        if dir.is_empty() { String::new() } else { format!("{dir}/") }
    } else {
        let stem = stem.trim_end_matches(".rs");
        if dir.is_empty() {
            format!("{stem}/")
        } else {
            format!("{dir}/{stem}/")
        }
    }
}

fn parent_posix(path: &str) -> String {
    match path.rfind('/') {
        Some(i) => path[..i].to_string(),
        None => String::new(),
    }
}

/// Join `spec` (starting with `./` or `../`) onto `dir`, normalizing `.` and
/// `..` without touching the filesystem. `None` when `..` escapes the root.
fn normalize_join(dir: &str, spec: &str) -> Option<String> {
    let mut parts: Vec<&str> = if dir.is_empty() {
        Vec::new()
    } else {
        dir.split('/').collect()
    };
    for seg in spec.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            s => parts.push(s),
        }
    }
    Some(parts.join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn index(files: &[&str], crates: &[(&str, &str)]) -> ResolveIndex {
        ResolveIndex {
            files: files.iter().map(|s| s.to_string()).collect(),
            rust_crates: crates
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
        }
    }

    #[test]
    fn expand_rust_use_flattens_groups_and_renames() {
        assert_eq!(expand_rust_use("crate::a::b::C"), vec!["crate::a::b::C"]);
        assert_eq!(
            expand_rust_use("engine_model::{Node, id::CanonicalKey}"),
            vec!["engine_model::Node", "engine_model::id::CanonicalKey"]
        );
        assert_eq!(
            expand_rust_use("a::{self, b as c, d::{e, f}}"),
            vec!["a", "a::b", "a::d::e", "a::d::f"]
        );
    }

    #[test]
    fn rust_crate_and_cross_crate_use_resolution() {
        let idx = index(
            &[
                "engine/crates/engine-model/src/lib.rs",
                "engine/crates/engine-model/src/id.rs",
                "engine/crates/ingest-code/src/lib.rs",
                "engine/crates/ingest-code/src/walk.rs",
            ],
            &[
                ("engine_model", "engine/crates/engine-model/src"),
                ("ingest_code", "engine/crates/ingest-code/src"),
            ],
        );
        let from = "engine/crates/ingest-code/src/walk.rs";
        // Cross-crate deep path → the module file.
        assert_eq!(
            idx.resolve(from, Lang::Rust, &ImportSpec::RustUse("engine_model::id::CanonicalKey".into())),
            vec![Resolution::Internal("engine/crates/engine-model/src/id.rs".into())]
        );
        // Cross-crate item at root → lib.rs.
        assert_eq!(
            idx.resolve(from, Lang::Rust, &ImportSpec::RustUse("engine_model::Node".into())),
            vec![Resolution::Internal("engine/crates/engine-model/src/lib.rs".into())]
        );
        // crate:: within the same crate.
        assert_eq!(
            idx.resolve(from, Lang::Rust, &ImportSpec::RustUse("crate::walk".into())),
            vec![Resolution::Internal("engine/crates/ingest-code/src/walk.rs".into())]
        );
        // std is external.
        assert_eq!(
            idx.resolve(from, Lang::Rust, &ImportSpec::RustUse("std::path::Path".into())),
            vec![Resolution::External]
        );
        // Unknown crate is external.
        assert_eq!(
            idx.resolve(from, Lang::Rust, &ImportSpec::RustUse("serde::Serialize".into())),
            vec![Resolution::External]
        );
    }

    #[test]
    fn rust_mod_and_super_resolution() {
        let idx = index(
            &[
                "src/lib.rs",
                "src/a.rs",
                "src/a/b.rs",
                "src/a/c/mod.rs",
            ],
            &[("demo", "src")],
        );
        assert_eq!(
            idx.resolve("src/lib.rs", Lang::Rust, &ImportSpec::RustMod("a".into())),
            vec![Resolution::Internal("src/a.rs".into())]
        );
        assert_eq!(
            idx.resolve("src/a.rs", Lang::Rust, &ImportSpec::RustMod("b".into())),
            vec![Resolution::Internal("src/a/b.rs".into())]
        );
        assert_eq!(
            idx.resolve("src/a.rs", Lang::Rust, &ImportSpec::RustMod("c".into())),
            vec![Resolution::Internal("src/a/c/mod.rs".into())]
        );
        // super:: from a child module reaches its parent's siblings.
        assert_eq!(
            idx.resolve("src/a/b.rs", Lang::Rust, &ImportSpec::RustUse("super::c::Thing".into())),
            vec![Resolution::Internal("src/a/c/mod.rs".into())]
        );
    }

    #[test]
    fn js_relative_probing_and_bare_specifiers() {
        let idx = index(
            &[
                "frontend/src/app/App.tsx",
                "frontend/src/stores/graph.ts",
                "frontend/src/stores/index.ts",
                "frontend/src/util/x.js",
            ],
            &[],
        );
        let from = "frontend/src/app/App.tsx";
        assert_eq!(
            idx.resolve(from, Lang::Tsx, &ImportSpec::JsModule("../stores/graph".into())),
            vec![Resolution::Internal("frontend/src/stores/graph.ts".into())]
        );
        // Directory import → index file.
        assert_eq!(
            idx.resolve(from, Lang::Tsx, &ImportSpec::JsModule("../stores".into())),
            vec![Resolution::Internal("frontend/src/stores/index.ts".into())]
        );
        // ESM .js suffix meaning a .ts source.
        assert_eq!(
            idx.resolve(from, Lang::Tsx, &ImportSpec::JsModule("../stores/graph.js".into())),
            vec![Resolution::Internal("frontend/src/stores/graph.ts".into())]
        );
        assert_eq!(
            idx.resolve(from, Lang::Tsx, &ImportSpec::JsModule("react".into())),
            vec![Resolution::External]
        );
        assert_eq!(
            idx.resolve(from, Lang::Tsx, &ImportSpec::JsModule("./missing".into())),
            vec![Resolution::Unresolved]
        );
    }

    #[test]
    fn python_absolute_relative_and_submodule_probing() {
        let idx = index(
            &[
                "src/pkg/__init__.py",
                "src/pkg/core.py",
                "src/pkg/sub/__init__.py",
                "src/pkg/sub/deep.py",
                "tools/script.py",
            ],
            &[],
        );
        // Absolute via the src root.
        assert_eq!(
            idx.resolve("tools/script.py", Lang::Python, &ImportSpec::PyModule { module: "pkg.core".into(), names: vec![] }),
            vec![Resolution::Internal("src/pkg/core.py".into())]
        );
        // from pkg import core → submodule probe wins over pkg/__init__.py.
        assert_eq!(
            idx.resolve("tools/script.py", Lang::Python, &ImportSpec::PyModule { module: "pkg".into(), names: vec!["core".into()] }),
            vec![Resolution::Internal("src/pkg/core.py".into())]
        );
        // Relative: from . import core (inside the package).
        assert_eq!(
            idx.resolve("src/pkg/sub/deep.py", Lang::Python, &ImportSpec::PyRelative { dots: 2, module: None, names: vec!["core".into()] }),
            vec![Resolution::Internal("src/pkg/core.py".into())]
        );
        assert_eq!(
            idx.resolve("src/pkg/core.py", Lang::Python, &ImportSpec::PyRelative { dots: 1, module: Some("sub".into()), names: vec![] }),
            vec![Resolution::Internal("src/pkg/sub/__init__.py".into())]
        );
        // numpy: no such package anywhere in the walk → external.
        assert_eq!(
            idx.resolve("tools/script.py", Lang::Python, &ImportSpec::PyModule { module: "numpy".into(), names: vec![] }),
            vec![Resolution::External]
        );
        // pkg exists but pkg.nothing doesn't → unresolved, not external.
        assert_eq!(
            idx.resolve("tools/script.py", Lang::Python, &ImportSpec::PyModule { module: "pkg.nothing".into(), names: vec![] }),
            vec![Resolution::Unresolved]
        );
    }

    #[test]
    fn manifest_package_name_parses_the_package_table_only() {
        let toml = "[workspace]\nname = \"nope\"\n[package]\nname = \"engine-model\"\nversion = \"1\"\n[dependencies]\nname = \"also-nope\"\n";
        assert_eq!(package_name(toml), Some("engine-model".into()));
    }
}
