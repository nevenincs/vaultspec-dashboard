//! Section selector schema and ATX heading-path resolver
//! (section-scoped-operations ADR).
//!
//! A [`SectionSelector`] is the structural anchor a `SectionEdit` draft resolves
//! against a document body: a heading path (the target section's heading text,
//! prefixed by however many ancestor heading texts disambiguate a duplicate),
//! a base-relative range hint (ADVISORY evidence only, never resolution input —
//! offsets alone are unstable, per the change-format ADR), and an expected
//! content hash the resolved section's bytes must match exactly. Resolution is
//! EXACT-OR-CONFLICT: a missing anchor, an ambiguous anchor, or a hash mismatch
//! all fail closed with a typed [`SectionResolveError`] carrying the evidence a
//! reviewer needs — never a fuzzy patch.
//!
//! A "section" is the heading line ITSELF plus everything up to (but excluding)
//! the next heading of the SAME OR SHALLOWER level, or the end of the document —
//! i.e. the heading plus its full nested content, mirroring how a reviewer
//! thinks of "the Phase P02 section" as including its own subheadings. A
//! replacement therefore supplies its own heading line as the first line of the
//! new content, exactly as a `ReplaceBody` draft supplies the whole document.
#![allow(dead_code)]

use ingest_struct::reader::blob_oid;
use serde::{Deserialize, Serialize};

/// The bounded number of ATX headings a single resolve scans (resource-bounds):
/// a document past this cap has its EXCESS headings ignored for resolution
/// purposes (never a panic, never unbounded work) — well beyond any vault
/// document this feature targets.
const MAX_HEADING_SECTIONS: usize = 4096;

/// The structural anchor + advisory evidence + exact-match fence a `SectionEdit`
/// draft resolves against a document body.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SectionSelector {
    /// The target section's heading text, prefixed by however many ancestor
    /// heading texts are needed to disambiguate a duplicate heading (outermost
    /// first, target heading last). A single-element path resolves by heading
    /// text alone when it is unique in the document. Never empty.
    pub heading_path: Vec<String>,
    /// A base-relative byte range the section was expected to occupy at
    /// selector-authoring time. ADVISORY ONLY — carried as review evidence,
    /// never consulted by resolution: the section-scoped operations ADR is
    /// explicit that offsets alone are unstable (duplicate headings, moved
    /// sections, and regenerated prose invalidate them), so `heading_path` is
    /// the sole resolution input. A drifted range hint does not itself fail
    /// resolution.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range_hint: Option<SectionRangeHint>,
    /// The expected content hash ([`blob_oid`], the SAME digest a whole
    /// document's blob hash uses) of the resolved section's bytes. Resolution
    /// succeeds only when the resolved section's hash equals this value.
    pub expected_content_hash: String,
}

/// A base-relative byte span, ADVISORY-only evidence on a [`SectionSelector`]
/// (see its docs) — never itself a resolution input.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SectionRangeHint {
    pub start: u64,
    pub end: u64,
}

/// A section resolved exactly against a document body: the byte range
/// `[content_start, content_end)` — the heading line through its full nested
/// content — its current bytes, and their hash (which, on success, equals the
/// selector's `expected_content_hash`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedSection {
    pub heading_path: Vec<String>,
    pub content_start: usize,
    pub content_end: usize,
    pub content: String,
    pub content_hash: String,
}

/// A section selector that did not resolve EXACTLY against a document body —
/// the section-scoped operations ADR's hard invariant: missing, ambiguous, or
/// hash-mismatched anchors are always a typed conflict, never a fuzzy apply.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SectionResolveError {
    #[error("section selector heading path is empty")]
    EmptyHeadingPath,
    #[error("section anchor `{}` did not resolve against any heading", heading_path.join(" > "))]
    MissingAnchor { heading_path: Vec<String> },
    #[error(
        "section anchor `{}` is ambiguous across {candidate_count} headings; add ancestor \
         headings to disambiguate",
        heading_path.join(" > ")
    )]
    AmbiguousAnchor {
        heading_path: Vec<String>,
        candidate_count: usize,
        candidate_paths: Vec<Vec<String>>,
    },
    #[error(
        "section anchor `{}` content hash mismatch: expected {expected}, observed {observed}",
        heading_path.join(" > ")
    )]
    ContentHashMismatch {
        heading_path: Vec<String>,
        expected: String,
        observed: String,
    },
}

pub type Result<T> = std::result::Result<T, SectionResolveError>;

/// Resolve `selector` against `body`: locate the section by `heading_path`,
/// then verify its current bytes hash to `expected_content_hash`. Exact-or-
/// conflict — see the module docs and [`SectionResolveError`].
pub fn resolve_section(body: &str, selector: &SectionSelector) -> Result<ResolvedSection> {
    if selector.heading_path.is_empty() {
        return Err(SectionResolveError::EmptyHeadingPath);
    }
    let headings = parse_heading_sections(body);
    let matches: Vec<&HeadingSection> = headings
        .iter()
        .filter(|heading| path_tail_matches(&heading.path, &selector.heading_path))
        .collect();
    match matches.len() {
        0 => Err(SectionResolveError::MissingAnchor {
            heading_path: selector.heading_path.clone(),
        }),
        1 => {
            let heading = matches[0];
            let content = body[heading.content_start..heading.content_end].to_string();
            let observed_hash = blob_oid(content.as_bytes());
            if observed_hash != selector.expected_content_hash {
                return Err(SectionResolveError::ContentHashMismatch {
                    heading_path: selector.heading_path.clone(),
                    expected: selector.expected_content_hash.clone(),
                    observed: observed_hash,
                });
            }
            Ok(ResolvedSection {
                heading_path: heading.path.clone(),
                content_start: heading.content_start,
                content_end: heading.content_end,
                content,
                content_hash: observed_hash,
            })
        }
        candidate_count => Err(SectionResolveError::AmbiguousAnchor {
            heading_path: selector.heading_path.clone(),
            candidate_count,
            candidate_paths: matches.iter().map(|heading| heading.path.clone()).collect(),
        }),
    }
}

/// One resolved ATX heading: its full ancestor-inclusive path and the byte
/// range of the section it anchors (its own heading line through the end of
/// its nested content).
#[derive(Debug, Clone, PartialEq, Eq)]
struct HeadingSection {
    path: Vec<String>,
    content_start: usize,
    content_end: usize,
}

/// One raw ATX heading line, before section boundaries are derived.
struct RawHeading {
    level: u8,
    text: String,
    line_start: usize,
}

/// Parse every ATX heading (`#` through `######`, CommonMark-style — a run of
/// 1-6 `#` followed by a space/tab or end of line) in `body`, skipping lines
/// inside fenced code blocks (``` or ~~~) so a commented-out heading-looking
/// line never becomes a false anchor. Bounded at [`MAX_HEADING_SECTIONS`].
fn parse_heading_sections(body: &str) -> Vec<HeadingSection> {
    let mut raw = Vec::new();
    let mut in_fence = false;
    let mut offset = 0usize;
    for line in body.split_inclusive('\n') {
        let line_start = offset;
        offset += line.len();
        let content = line.trim_end_matches(['\n', '\r']);
        let trimmed = content.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence || raw.len() >= MAX_HEADING_SECTIONS {
            continue;
        }
        if let Some((level, text)) = parse_atx_heading_line(content) {
            raw.push(RawHeading {
                level,
                text,
                line_start,
            });
        }
    }

    let mut stack: Vec<(u8, String)> = Vec::new();
    let mut sections = Vec::with_capacity(raw.len());
    for (index, heading) in raw.iter().enumerate() {
        while stack
            .last()
            .is_some_and(|(level, _)| *level >= heading.level)
        {
            stack.pop();
        }
        let mut path: Vec<String> = stack.iter().map(|(_, text)| text.clone()).collect();
        path.push(heading.text.clone());
        stack.push((heading.level, heading.text.clone()));

        let content_end = raw[index + 1..]
            .iter()
            .find(|next| next.level <= heading.level)
            .map(|next| next.line_start)
            .unwrap_or(body.len());
        sections.push(HeadingSection {
            path,
            content_start: heading.line_start,
            content_end,
        });
    }
    sections
}

/// Parse one line as an ATX heading: 1-6 leading `#` characters immediately
/// followed by a space/tab or end of line (CommonMark's own ATX rule — `#tag`
/// is not a heading). Returns the level and the trimmed heading text, or
/// `None` when the line is not an ATX heading or the heading text is empty.
fn parse_atx_heading_line(line: &str) -> Option<(u8, String)> {
    let hashes = line.chars().take_while(|ch| *ch == '#').count();
    if hashes == 0 || hashes > 6 {
        return None;
    }
    let rest = &line[hashes..];
    if !rest.is_empty() && !rest.starts_with([' ', '\t']) {
        return None;
    }
    let text = rest.trim().to_string();
    if text.is_empty() {
        return None;
    }
    Some((hashes as u8, text))
}

/// `suffix` matches the TAIL of `full` exactly (contiguous, same order) — how
/// a selector's `heading_path` is checked against a heading's full ancestor
/// path: a one-element selector matches by heading text alone, a longer one
/// disambiguates by ancestor chain.
fn path_tail_matches(full: &[String], suffix: &[String]) -> bool {
    if suffix.len() > full.len() {
        return false;
    }
    full[full.len() - suffix.len()..] == *suffix
}

#[cfg(test)]
mod tests {
    use super::*;

    fn selector(heading_path: &[&str], expected_content_hash: &str) -> SectionSelector {
        SectionSelector {
            heading_path: heading_path.iter().map(|s| s.to_string()).collect(),
            range_hint: None,
            expected_content_hash: expected_content_hash.to_string(),
        }
    }

    const DOC: &str = "# Title\n\nintro\n\n## Alpha\n\nalpha body\n\n### Alpha Detail\n\nnested\n\n## Beta\n\nbeta body\n";

    #[test]
    fn exact_anchor_resolves_the_heading_through_its_nested_content() {
        let alpha_section = "## Alpha\n\nalpha body\n\n### Alpha Detail\n\nnested\n\n";
        let hash = blob_oid(alpha_section.as_bytes());
        let resolved = resolve_section(DOC, &selector(&["Alpha"], &hash)).unwrap();
        assert_eq!(
            resolved.heading_path,
            vec!["Title".to_string(), "Alpha".to_string()]
        );
        assert_eq!(resolved.content, alpha_section);
        assert_eq!(resolved.content_hash, hash);
    }

    #[test]
    fn exact_anchor_resolves_a_leaf_heading_alone() {
        let beta_section = "## Beta\n\nbeta body\n";
        let hash = blob_oid(beta_section.as_bytes());
        let resolved = resolve_section(DOC, &selector(&["Beta"], &hash)).unwrap();
        assert_eq!(resolved.content, beta_section);
    }

    #[test]
    fn missing_anchor_fails_closed_with_typed_evidence() {
        let err = resolve_section(DOC, &selector(&["Gamma"], "irrelevant")).unwrap_err();
        assert!(matches!(
            err,
            SectionResolveError::MissingAnchor { heading_path } if heading_path == vec!["Gamma".to_string()]
        ));
    }

    #[test]
    fn ambiguous_duplicate_heading_requires_a_disambiguating_path() {
        let doc =
            "# Root\n\n## Section A\n\n### Item\n\nfirst\n\n## Section B\n\n### Item\n\nsecond\n";
        let err = resolve_section(doc, &selector(&["Item"], "irrelevant")).unwrap_err();
        match err {
            SectionResolveError::AmbiguousAnchor {
                candidate_count,
                candidate_paths,
                ..
            } => {
                assert_eq!(candidate_count, 2);
                assert_eq!(
                    candidate_paths,
                    vec![
                        vec![
                            "Root".to_string(),
                            "Section A".to_string(),
                            "Item".to_string()
                        ],
                        vec![
                            "Root".to_string(),
                            "Section B".to_string(),
                            "Item".to_string()
                        ],
                    ]
                );
            }
            other => panic!("expected ambiguous anchor, got {other:?}"),
        }

        // The longer, disambiguating path resolves exactly.
        let resolved = resolve_section(
            doc,
            &selector(&["Section B", "Item"], &blob_oid(b"### Item\n\nsecond\n")),
        )
        .unwrap();
        assert_eq!(resolved.content, "### Item\n\nsecond\n");
    }

    #[test]
    fn content_hash_mismatch_fails_closed_with_expected_and_observed() {
        let err = resolve_section(DOC, &selector(&["Beta"], "not-the-real-hash")).unwrap_err();
        match err {
            SectionResolveError::ContentHashMismatch {
                expected, observed, ..
            } => {
                assert_eq!(expected, "not-the-real-hash");
                assert_eq!(observed, blob_oid(b"## Beta\n\nbeta body\n"));
            }
            other => panic!("expected content hash mismatch, got {other:?}"),
        }
    }

    #[test]
    fn a_drifted_range_hint_never_fails_resolution_the_anchor_alone_governs() {
        let beta_section = "## Beta\n\nbeta body\n";
        let hash = blob_oid(beta_section.as_bytes());
        let mut selector = selector(&["Beta"], &hash);
        selector.range_hint = Some(SectionRangeHint {
            start: 9_999,
            end: 10_050,
        });
        let resolved = resolve_section(DOC, &selector).unwrap();
        assert_eq!(resolved.content, beta_section);
    }

    #[test]
    fn empty_heading_path_is_rejected_before_any_scan() {
        let err = resolve_section(DOC, &selector(&[], "irrelevant")).unwrap_err();
        assert!(matches!(err, SectionResolveError::EmptyHeadingPath));
    }

    #[test]
    fn heading_lines_inside_fenced_code_blocks_are_not_anchors() {
        let doc = "# Title\n\n```\n# not a heading\n```\n\n## Real Heading\n\nbody\n";
        let hash = blob_oid(b"## Real Heading\n\nbody\n");
        let resolved = resolve_section(doc, &selector(&["Real Heading"], &hash)).unwrap();
        assert_eq!(resolved.content, "## Real Heading\n\nbody\n");
        let err = resolve_section(doc, &selector(&["not a heading"], "irrelevant")).unwrap_err();
        assert!(matches!(err, SectionResolveError::MissingAnchor { .. }));
    }
}
