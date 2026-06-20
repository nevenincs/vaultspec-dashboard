//! Structural extractors (engine-spec §3): canonical step identifiers and
//! wiki-link stems, each mention carrying byte-span provenance into the source
//! document.
//!
//! Code paths and code symbols are intentionally not structural graph inputs:
//! vault documents may name files or functions in prose, but that does not
//! create a graph relationship.

use crate::is_step_identifier;

use serde::{Deserialize, Serialize};

/// What a structural mention refers to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MentionKind {
    /// A canonical step identifier (`W##.P##.S##` family).
    StepId(String),
    /// An Obsidian wiki-link stem.
    WikiLink(String),
}

/// One extracted mention with byte-span provenance into the document.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExtractedMention {
    pub kind: MentionKind,
    /// Byte span (start, end) of the mention text within the document.
    pub span: (usize, usize),
}

/// Run structural extractors over a document body.
///
/// Deterministic scan: wiki-links from `[[...]]` anywhere, and step ids from
/// inline backtick code spans. Bare prose tokens are not extracted in v1.
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
    fn extracts_structural_step_ids_and_wiki_links_with_correct_spans() {
        let text = "Plan `W01.P02.S03` touches `src/lib.rs` via `engine::graph::insert` \
                    and `main()`; see [[2026-06-12-demo-plan]].";
        let mentions = extract(text);
        let kinds: Vec<&MentionKind> = mentions.iter().map(|m| &m.kind).collect();
        assert_eq!(
            kinds.len(),
            2,
            "code paths and symbols are not graph mentions"
        );
        assert!(matches!(kinds[0], MentionKind::StepId(s) if s == "W01.P02.S03"));
        assert!(matches!(kinds[1], MentionKind::WikiLink(w) if w == "2026-06-12-demo-plan"));
        // Spans point at the exact mention text.
        for m in &mentions {
            let slice = &text[m.span.0..m.span.1];
            match &m.kind {
                MentionKind::WikiLink(w) => assert!(slice.contains(w.as_str())),
                MentionKind::StepId(s) => assert_eq!(slice, s),
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
