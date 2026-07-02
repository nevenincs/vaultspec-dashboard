//! Language registry: which files we parse, with which grammar, and which
//! import query (codebase-graphing ADR D2).
//!
//! Adding a language is a deliberate, bounded addition: one enum variant, one
//! grammar crate, one `.scm` query file, one resolution strategy arm.

use std::path::Path;

/// The pilot language set (ADR D2): Rust, TypeScript (+TSX), JavaScript
/// (+JSX via the JS grammar), Python.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Lang {
    Rust,
    TypeScript,
    Tsx,
    JavaScript,
    Python,
}

impl Lang {
    /// Classify a file by extension; `None` means "not a source file we parse".
    pub fn from_path(path: &Path) -> Option<Lang> {
        let ext = path.extension()?.to_str()?;
        match ext {
            "rs" => Some(Lang::Rust),
            "ts" | "mts" | "cts" => Some(Lang::TypeScript),
            "tsx" => Some(Lang::Tsx),
            "js" | "mjs" | "cjs" | "jsx" => Some(Lang::JavaScript),
            "py" => Some(Lang::Python),
            _ => None,
        }
    }

    /// The tree-sitter grammar for this language.
    pub fn language(&self) -> tree_sitter::Language {
        match self {
            Lang::Rust => tree_sitter_rust::LANGUAGE.into(),
            Lang::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
            Lang::Tsx => tree_sitter_typescript::LANGUAGE_TSX.into(),
            Lang::JavaScript => tree_sitter_javascript::LANGUAGE.into(),
            Lang::Python => tree_sitter_python::LANGUAGE.into(),
        }
    }

    /// The import-extraction query source for this language. TypeScript, TSX,
    /// and JavaScript share one query: their import/export/require surface is
    /// the same node vocabulary in all three grammars.
    pub fn query_source(&self) -> &'static str {
        match self {
            Lang::Rust => include_str!("../queries/rust.scm"),
            Lang::TypeScript | Lang::Tsx | Lang::JavaScript => {
                include_str!("../queries/typescript.scm")
            }
            Lang::Python => include_str!("../queries/python.scm"),
        }
    }

    /// The wire token for the language facet (served by the code corpus's
    /// filter vocabulary; presentation mapping is the frontend's job).
    pub fn as_str(&self) -> &'static str {
        match self {
            Lang::Rust => "rust",
            Lang::TypeScript | Lang::Tsx => "typescript",
            Lang::JavaScript => "javascript",
            Lang::Python => "python",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classification_covers_the_pilot_set() {
        let cases = [
            ("src/main.rs", Some(Lang::Rust)),
            ("a/b.ts", Some(Lang::TypeScript)),
            ("a/b.tsx", Some(Lang::Tsx)),
            ("a/b.js", Some(Lang::JavaScript)),
            ("a/b.mjs", Some(Lang::JavaScript)),
            ("pkg/mod.py", Some(Lang::Python)),
            ("README.md", None),
            ("Cargo.toml", None),
            ("noext", None),
        ];
        for (path, expected) in cases {
            assert_eq!(Lang::from_path(Path::new(path)), expected, "{path}");
        }
    }

    #[test]
    fn every_language_query_parses_against_its_grammar() {
        // A malformed .scm is a build defect, not a runtime surprise: compile
        // every query against its grammar here so the gate catches it.
        for lang in [
            Lang::Rust,
            Lang::TypeScript,
            Lang::Tsx,
            Lang::JavaScript,
            Lang::Python,
        ] {
            tree_sitter::Query::new(&lang.language(), lang.query_source())
                .unwrap_or_else(|e| panic!("{lang:?} query failed to compile: {e}"));
        }
    }
}
