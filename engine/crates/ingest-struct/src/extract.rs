//! The four structural extractors (engine-spec §3): file paths, canonical
//! step identifiers, wiki-link stems, and code symbols — deterministic,
//! each mention carrying byte-span provenance into the source document.
//!
//! v1 scope per the ADR: paths and step ids parse exactly; symbols match
//! by qualified name; tree-sitter-grade resolution is a v2 upgrade.

use crate::is_step_identifier;

/// What a mention refers to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MentionKind {
    /// A repo-relative file path.
    Path(String),
    /// A canonical step identifier (`W##.P##.S##` family).
    StepId(String),
    /// An Obsidian wiki-link stem.
    WikiLink(String),
    /// A code symbol referenced by qualified name.
    Symbol(String),
}

/// One extracted mention with byte-span provenance into the document.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExtractedMention {
    pub kind: MentionKind,
    /// Byte span (start, end) of the mention text within the document.
    pub span: (usize, usize),
}

/// Run all four extractors over a document body.
///
/// Deterministic scan: wiki-links from `[[…]]` anywhere; paths, step ids
/// and symbols from inline backtick code spans (the vault's own LINK RULES
/// mandate backtick spans for those references, so code spans are the
/// high-precision channel; bare prose tokens are not extracted in v1).
pub fn extract(text: &str) -> Vec<ExtractedMention> {
    let mut mentions = Vec::new();
    extract_wiki_links(text, &mut mentions);
    extract_code_spans(text, &mut mentions);
    mentions.sort_by_key(|m| m.span.0);
    mentions
}

fn extract_wiki_links(text: &str, out: &mut Vec<ExtractedMention>) {
    let bytes = text.as_bytes();
    let mut i = 0;
    while let Some(open) = find_from(bytes, i, b"[[") {
        let Some(close) = find_from(bytes, open + 2, b"]]") else {
            break;
        };
        let inner = &text[open + 2..close];
        // `[[stem]]` or `[[stem|alias]]`; stems never span lines.
        let stem = inner.split('|').next().unwrap_or(inner).trim();
        if !stem.is_empty() && !stem.contains('\n') {
            out.push(ExtractedMention {
                kind: MentionKind::WikiLink(stem.to_string()),
                span: (open, close + 2),
            });
        }
        i = close + 2;
    }
}

fn extract_code_spans(text: &str, out: &mut Vec<ExtractedMention>) {
    let bytes = text.as_bytes();
    let mut i = 0;
    while let Some(open) = find_from(bytes, i, b"`") {
        // Skip fenced blocks (``` …): treat a triple backtick as opaque.
        if bytes[open..].starts_with(b"```") {
            let after = open + 3;
            let Some(end) = find_from(bytes, after, b"```") else {
                break;
            };
            i = end + 3;
            continue;
        }
        let Some(close) = find_from(bytes, open + 1, b"`") else {
            break;
        };
        let token = text[open + 1..close].trim();
        let span = (open + 1, close);
        if let Some(kind) = classify_token(token) {
            out.push(ExtractedMention { kind, span });
        }
        i = close + 1;
    }
}

/// Classify a backtick token into a mention kind, or `None` for plain code.
fn classify_token(token: &str) -> Option<MentionKind> {
    if token.is_empty() || token.contains(char::is_whitespace) {
        return None;
    }
    if is_step_identifier(token) {
        return Some(MentionKind::StepId(token.to_string()));
    }
    // Qualified symbol: module path (`a::b::c`) or call form (`foo()`).
    if token.contains("::") && !token.contains('/') {
        return Some(MentionKind::Symbol(
            token.trim_end_matches("()").to_string(),
        ));
    }
    if let Some(name) = token.strip_suffix("()")
        && !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '.')
    {
        return Some(MentionKind::Symbol(name.to_string()));
    }
    // Repo-relative path: has a separator and a file-ish final segment,
    // and is not an absolute/URL-like token.
    if token.contains('/')
        && !token.starts_with('/')
        && !token.contains("://")
        && !token.ends_with('/')
    {
        let last = token.rsplit('/').next().unwrap_or("");
        if last.contains('.')
            || last
                .chars()
                .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
        {
            return Some(MentionKind::Path(token.to_string()));
        }
    }
    None
}

fn find_from(haystack: &[u8], from: usize, needle: &[u8]) -> Option<usize> {
    if from >= haystack.len() {
        return None;
    }
    haystack[from..]
        .windows(needle.len())
        .position(|w| w == needle)
        .map(|p| p + from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_all_four_kinds_with_correct_spans() {
        let text = "Plan `W01.P02.S03` touches `src/lib.rs` via `engine::graph::insert` \
                    and `main()`; see [[2026-06-12-demo-plan]].";
        let mentions = extract(text);
        let kinds: Vec<&MentionKind> = mentions.iter().map(|m| &m.kind).collect();
        assert!(matches!(kinds[0], MentionKind::StepId(s) if s == "W01.P02.S03"));
        assert!(matches!(kinds[1], MentionKind::Path(p) if p == "src/lib.rs"));
        assert!(matches!(kinds[2], MentionKind::Symbol(s) if s == "engine::graph::insert"));
        assert!(matches!(kinds[3], MentionKind::Symbol(s) if s == "main"));
        assert!(matches!(kinds[4], MentionKind::WikiLink(w) if w == "2026-06-12-demo-plan"));
        // Spans point at the exact mention text.
        for m in &mentions {
            let slice = &text[m.span.0..m.span.1];
            match &m.kind {
                MentionKind::WikiLink(w) => assert!(slice.contains(w.as_str())),
                MentionKind::StepId(s) => assert_eq!(slice, s),
                MentionKind::Path(p) => assert_eq!(slice, p),
                MentionKind::Symbol(_) => assert!(!slice.is_empty()),
            }
        }
    }

    #[test]
    fn fenced_code_blocks_are_opaque_and_plain_tokens_ignored() {
        let text = "```\n`src/inside/fence.rs`\n```\nThen `just-a-word` and `two words`.";
        let mentions = extract(text);
        assert!(mentions.is_empty(), "{mentions:?}");
    }

    #[test]
    fn wiki_link_alias_form_extracts_the_stem() {
        let mentions = extract("see [[2026-06-12-x-adr|the ADR]] for detail");
        assert_eq!(mentions.len(), 1);
        assert!(matches!(
            &mentions[0].kind,
            MentionKind::WikiLink(w) if w == "2026-06-12-x-adr"
        ));
    }
}
