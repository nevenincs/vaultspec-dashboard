//! Per-file syntactic import extraction (codebase-graphing ADR D2): parse with
//! the language's tree-sitter grammar, run its import query, and return the
//! captured import specifications with byte spans. Purely syntactic — literal
//! import text, no name resolution (that is `resolve`'s job) — so extraction
//! needs no toolchain, no build, and works on uncommitted working-tree bytes.

use std::collections::HashMap;
use std::sync::OnceLock;

use streaming_iterator::StreamingIterator;
use tree_sitter::{Node as TsNode, Parser, Query, QueryCursor};

use crate::lang::Lang;

/// One extracted import statement, pre-resolution.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawImport {
    pub spec: ImportSpec,
    /// Byte span of the captured import in the source file (provenance).
    pub span: (usize, usize),
}

/// The language-shaped import forms the resolver understands.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ImportSpec {
    /// Rust `use` path text, verbatim (may contain `{..}` groups, `as`, `*`).
    RustUse(String),
    /// Rust out-of-line `mod name;`.
    RustMod(String),
    /// TS/JS module specifier string, verbatim (`./x`, `../y`, `pkg`).
    JsModule(String),
    /// Python absolute `import a.b` / `from a.b import c` — dotted module plus
    /// the imported names (empty for plain `import`; names let the resolver
    /// probe `a/b/c.py` submodule imports).
    PyModule { module: String, names: Vec<String> },
    /// Python relative `from .a import b` / `from .. import c`: leading-dot
    /// count, optional dotted tail, imported names.
    PyRelative {
        dots: usize,
        module: Option<String>,
        names: Vec<String>,
    },
}

/// The result of extracting one file.
#[derive(Debug, Clone)]
pub struct FileExtraction {
    pub imports: Vec<RawImport>,
    /// Stable content hash of the file bytes (provenance `blob_hash`).
    pub content_hash: String,
    /// True when the grammar failed to produce a tree (never fatal: the file
    /// still becomes a node; it just contributes no import edges).
    pub parse_failed: bool,
}

/// Compiled query cache: one `Query` per distinct grammar, compiled once per
/// process (bounded by the fixed language set — never grows past it).
fn query_for(lang: Lang) -> &'static Query {
    static CACHE: OnceLock<HashMap<&'static str, Query>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| {
        let mut m = HashMap::new();
        for l in [
            Lang::Rust,
            Lang::TypeScript,
            Lang::Tsx,
            Lang::JavaScript,
            Lang::Python,
        ] {
            m.entry(cache_key(l)).or_insert_with(|| {
                Query::new(&l.language(), l.query_source())
                    .expect("bundled import query compiles (pinned by lang tests)")
            });
        }
        m
    });
    &cache[cache_key(lang)]
}

/// TS and TSX are distinct grammars (distinct node tables), so they need
/// distinct compiled queries even though the `.scm` source is shared.
fn cache_key(lang: Lang) -> &'static str {
    match lang {
        Lang::Rust => "rust",
        Lang::TypeScript => "typescript",
        Lang::Tsx => "tsx",
        Lang::JavaScript => "javascript",
        Lang::Python => "python",
    }
}

/// Parse one file and extract its imports. Infallible by design: a file the
/// grammar cannot parse yields `parse_failed` plus zero imports, never an
/// error — a broken source file is normal working-tree state.
pub fn extract_file(lang: Lang, bytes: &[u8]) -> FileExtraction {
    let content_hash = engine_model::content_hash(bytes);
    let mut parser = Parser::new();
    if parser.set_language(&lang.language()).is_err() {
        return FileExtraction {
            imports: Vec::new(),
            content_hash,
            parse_failed: true,
        };
    }
    let Some(tree) = parser.parse(bytes, None) else {
        return FileExtraction {
            imports: Vec::new(),
            content_hash,
            parse_failed: true,
        };
    };

    let query = query_for(lang);
    let mut cursor = QueryCursor::new();
    let mut imports = Vec::new();
    let mut matches = cursor.matches(query, tree.root_node(), bytes);
    while let Some(m) = matches.next() {
        for cap in m.captures {
            let name = &query.capture_names()[cap.index as usize];
            let node = cap.node;
            let text = || node_text(node, bytes);
            let span = (node.start_byte(), node.end_byte());
            let spec = match *name {
                "import.use" => Some(ImportSpec::RustUse(text())),
                "import.mod" => Some(ImportSpec::RustMod(text())),
                "import.source" => Some(ImportSpec::JsModule(text())),
                "import.module" => Some(ImportSpec::PyModule {
                    module: text(),
                    names: Vec::new(),
                }),
                "import.from" => Some(ImportSpec::PyModule {
                    module: text(),
                    names: from_statement_names(node, bytes),
                }),
                "import.from.relative" => {
                    let raw = text();
                    let dots = raw.chars().take_while(|c| *c == '.').count();
                    let tail = raw.trim_start_matches('.');
                    Some(ImportSpec::PyRelative {
                        dots,
                        module: (!tail.is_empty()).then(|| tail.to_string()),
                        names: from_statement_names(node, bytes),
                    })
                }
                // Anchor captures (e.g. `_fn` for the require() predicate).
                _ => None,
            };
            if let Some(spec) = spec {
                imports.push(RawImport { spec, span });
            }
        }
    }

    FileExtraction {
        imports,
        content_hash,
        parse_failed: false,
    }
}

fn node_text(node: TsNode, bytes: &[u8]) -> String {
    String::from_utf8_lossy(&bytes[node.byte_range()]).into_owned()
}

/// For a captured `module_name` node, walk up to the `import_from_statement`
/// and collect the first segment of every imported name (`name:` children,
/// unwrapping `aliased_import`). Done in code rather than as extra query
/// patterns so one statement yields one import record, not one per name.
fn from_statement_names(module_node: TsNode, bytes: &[u8]) -> Vec<String> {
    let Some(stmt) = module_node.parent() else {
        return Vec::new();
    };
    let mut names = Vec::new();
    let mut cursor = stmt.walk();
    for child in stmt.children_by_field_name("name", &mut cursor) {
        let name_node = if child.kind() == "aliased_import" {
            child.child_by_field_name("name").unwrap_or(child)
        } else {
            child
        };
        let text = node_text(name_node, bytes);
        // First dotted segment only: `from a import b.c` is not legal Python,
        // but be tolerant of grammar surprises.
        let first = text.split('.').next().unwrap_or(&text).trim();
        // A wildcard import names no submodule to probe.
        if !first.is_empty() && first != "*" {
            names.push(first.to_string());
        }
    }
    names
}

#[cfg(test)]
mod tests {
    use super::*;

    fn specs(lang: Lang, src: &str) -> Vec<ImportSpec> {
        let ex = extract_file(lang, src.as_bytes());
        assert!(!ex.parse_failed, "parse failed for {lang:?}");
        ex.imports.into_iter().map(|i| i.spec).collect()
    }

    #[test]
    fn rust_use_and_mod_forms() {
        let got = specs(
            Lang::Rust,
            "use crate::a::b::C;\nuse super::x;\nmod walk;\nmod inline { }\nuse other_crate::{d, e::F};\n",
        );
        assert_eq!(
            got,
            vec![
                ImportSpec::RustUse("crate::a::b::C".into()),
                ImportSpec::RustUse("super::x".into()),
                ImportSpec::RustMod("walk".into()),
                ImportSpec::RustUse("other_crate::{d, e::F}".into()),
            ],
            "inline mod contributes nothing; both use paths captured verbatim"
        );
    }

    #[test]
    fn typescript_import_export_require_dynamic() {
        let got = specs(
            Lang::TypeScript,
            "import { a } from \"./a\";\nimport \"./side-effect\";\nexport { b } from \"../b\";\nconst c = require(\"./c\");\nconst d = await import(\"./d\");\n",
        );
        assert_eq!(
            got,
            vec![
                ImportSpec::JsModule("./a".into()),
                ImportSpec::JsModule("./side-effect".into()),
                ImportSpec::JsModule("../b".into()),
                ImportSpec::JsModule("./c".into()),
                ImportSpec::JsModule("./d".into()),
            ]
        );
    }

    #[test]
    fn tsx_and_javascript_share_the_query() {
        assert_eq!(
            specs(
                Lang::Tsx,
                "import A from \"./a\";\nexport const x = <div/>;\n"
            ),
            vec![ImportSpec::JsModule("./a".into())]
        );
        assert_eq!(
            specs(Lang::JavaScript, "const a = require(\"./a\");\n"),
            vec![ImportSpec::JsModule("./a".into())]
        );
    }

    #[test]
    fn python_absolute_relative_and_from_forms() {
        let got = specs(
            Lang::Python,
            "import a.b\nimport c.d as x\nfrom e.f import g, h\nfrom . import i\nfrom ..j import k\nfrom m import *\n",
        );
        assert_eq!(
            got,
            vec![
                ImportSpec::PyModule {
                    module: "a.b".into(),
                    names: vec![]
                },
                ImportSpec::PyModule {
                    module: "c.d".into(),
                    names: vec![]
                },
                ImportSpec::PyModule {
                    module: "e.f".into(),
                    names: vec!["g".into(), "h".into()]
                },
                ImportSpec::PyRelative {
                    dots: 1,
                    module: None,
                    names: vec!["i".into()]
                },
                ImportSpec::PyRelative {
                    dots: 2,
                    module: Some("j".into()),
                    names: vec!["k".into()]
                },
                ImportSpec::PyModule {
                    module: "m".into(),
                    names: vec![]
                },
            ]
        );
    }

    #[test]
    fn a_broken_file_degrades_to_zero_imports_never_errors() {
        // tree-sitter is error-tolerant: garbage still parses (with ERROR
        // nodes), so extraction returns cleanly with whatever it can see.
        let ex = extract_file(Lang::Rust, b"use ??? not rust at all {{{");
        assert!(!ex.parse_failed);
        assert!(ex.content_hash.len() == 32);
    }
}
