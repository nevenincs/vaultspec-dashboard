//! Structural-tier ingestion: deterministic extraction from document bodies
//! (engine-spec §3).
//!
//! v1 resolves file paths and canonical step identifiers (`W##.P##.S##`)
//! exactly, and symbols by qualified-name match; tree-sitter-grade symbol
//! resolution is a v2 upgrade, not a v1 gate. Resolution state is signal:
//! stale/broken edges are kept and surfaced, not dropped (D3.3).

pub mod extract;
pub mod plan_structure;
pub mod reader;
pub mod resolve;

/// Fixed structural confidence bands (engine-spec §3, D3.2).
pub const CONFIDENCE_RESOLVED: f32 = 0.9;
pub const CONFIDENCE_STALE: f32 = 0.5;

/// A structural mention extracted from a document body — the closed vocabulary
/// the extraction pipeline emits (paths, canonical step ids, wiki-links, and
/// code symbols).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Mention {
    /// A repo-relative file path mentioned in prose.
    Path(String),
    /// A canonical step identifier (`W##.P##.S##` — parse-stable by core's
    /// exec-record filename schema).
    StepId(String),
    /// An Obsidian-style wiki-link stem.
    WikiLink(String),
    /// A code symbol, matched by qualified name in v1.
    Symbol(String),
}

/// Recognize a canonical step identifier of the form `W##.P##.S##`,
/// `P##.S##`, or `S##` (zero-padded to at least two digits).
pub fn is_step_identifier(token: &str) -> bool {
    let mut segments = token.split('.').peekable();
    let mut seen = 0u8;
    let order = ['W', 'P', 'S'];
    let mut order_idx = 0usize;
    for seg in segments.by_ref() {
        let mut chars = seg.chars();
        let Some(prefix) = chars.next() else {
            return false;
        };
        // Each segment letter must appear in W < P < S order.
        let Some(pos) = order[order_idx..].iter().position(|&c| c == prefix) else {
            return false;
        };
        order_idx += pos + 1;
        let digits: String = chars.collect();
        if digits.len() < 2 || !digits.chars().all(|c| c.is_ascii_digit()) {
            return false;
        }
        seen += 1;
    }
    // Must end on an S segment and contain at least one segment.
    seen > 0 && order_idx == order.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_canonical_step_identifiers() {
        assert!(is_step_identifier("W01.P02.S03"));
        assert!(is_step_identifier("P01.S14"));
        assert!(is_step_identifier("S01"));
        assert!(!is_step_identifier("S1"));
        assert!(!is_step_identifier("W01"));
        assert!(!is_step_identifier("S01.P01"));
        assert!(!is_step_identifier("X01.S01"));
    }
}
