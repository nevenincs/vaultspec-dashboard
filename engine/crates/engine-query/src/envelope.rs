//! The response envelope (contract §2): cursor pagination for anything
//! unbounded, and the per-tier degradation block carried on **every**
//! response so absent tiers render truthfully, never as errors.

use std::collections::BTreeMap;

use serde::Serialize;

/// Per-tier availability, e.g.
/// `{"semantic": {"available": false, "reason": "rag service down"}}`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TierStatus {
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

pub type TiersBlock = BTreeMap<&'static str, TierStatus>;

/// Build a degradation block. `unavailable` lists (tier, reason) pairs;
/// every other tier reports available.
pub fn tiers_block(unavailable: &[(&'static str, &str)]) -> TiersBlock {
    let mut block = TiersBlock::new();
    for tier in ["declared", "structural", "temporal", "semantic"] {
        block.insert(
            tier,
            TierStatus {
                available: true,
                reason: None,
            },
        );
    }
    for (tier, reason) in unavailable {
        block.insert(
            tier,
            TierStatus {
                available: false,
                reason: Some((*reason).to_string()),
            },
        );
    }
    block
}

/// The envelope every serve/CLI payload travels in.
#[derive(Debug, Clone, Serialize)]
pub struct Envelope<T: Serialize> {
    pub data: T,
    /// Truthful per-tier degradation (contract §2) — always present.
    pub tiers: TiersBlock,
    /// Cursor for the next page; `None` when the listing is exhausted.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

/// One page of an id-ordered listing. `cursor` is the last id of the
/// previous page (exclusive); ids must arrive sorted.
pub fn paginate<T: Clone>(
    items: &[T],
    id_of: impl Fn(&T) -> &str,
    cursor: Option<&str>,
    page_size: usize,
) -> (Vec<T>, Option<String>) {
    let start = match cursor {
        None => 0,
        Some(cursor) => items
            .iter()
            .position(|item| id_of(item) > cursor)
            .unwrap_or(items.len()),
    };
    let page: Vec<T> = items
        .iter()
        .skip(start)
        .take(page_size.max(1))
        .cloned()
        .collect();
    let next = if start + page.len() < items.len() {
        page.last().map(|item| id_of(item).to_string())
    } else {
        None
    };
    (page, next)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pagination_walks_the_full_listing_without_gaps_or_overlap() {
        let items: Vec<String> = (0..25).map(|i| format!("id-{i:02}")).collect();
        let mut seen = Vec::new();
        let mut cursor: Option<String> = None;
        loop {
            let (page, next) = paginate(&items, |s| s.as_str(), cursor.as_deref(), 10);
            seen.extend(page);
            match next {
                Some(c) => cursor = Some(c),
                None => break,
            }
        }
        assert_eq!(seen, items, "every item exactly once, in order");
    }

    #[test]
    fn degradation_block_reports_every_tier_truthfully() {
        let block = tiers_block(&[("semantic", "rag service down")]);
        assert!(block["declared"].available);
        assert!(!block["semantic"].available);
        assert_eq!(
            block["semantic"].reason.as_deref(),
            Some("rag service down")
        );
        // Always all four tiers — absent tiers are stated, never implied.
        assert_eq!(block.len(), 4);
    }

    #[test]
    fn envelope_serializes_with_tiers_always_present() {
        let envelope = Envelope {
            data: vec!["x"],
            tiers: tiers_block(&[]),
            next_cursor: None,
        };
        let json = serde_json::to_string(&envelope).unwrap();
        assert!(json.contains("\"tiers\""));
        assert!(
            !json.contains("next_cursor"),
            "exhausted listing omits cursor"
        );
    }
}
