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

/// The four always-available-by-default corpus tiers.
const DEFAULT_AVAILABLE_TIERS: &[&str] = &["declared", "structural", "temporal", "semantic"];

/// The reason the `agent` tier carries when no controller context has resolved
/// the real A2A orchestration state. The seeded default is DEGRADED, never
/// optimistic (a2a-product-provisioning W02.P04.S29): absence of a resolution
/// must never masquerade as availability. A response served with a live product
/// controller (the seated dashboard) overwrites this with the real classification.
const AGENT_TIER_UNRESOLVED: &str = "a2a orchestration state not resolved on this response";

/// Build a degradation block. `unavailable` lists (tier, reason) pairs; every
/// other corpus tier reports available.
///
/// The dedicated `agent` orchestration tier (a2a-product-provisioning) is ALWAYS
/// present, seeded DEGRADED-honest: absence of an explicit `agent` entry in
/// `unavailable` leaves it unavailable-with-reason, never available. The API
/// layer overlays the real product-controller classification onto this seed so a
/// live gateway reports available; an engine-query consumer without a controller
/// keeps the honest degraded default rather than a false "up".
pub fn tiers_block(unavailable: &[(&'static str, &str)]) -> TiersBlock {
    let mut block = TiersBlock::new();
    for tier in DEFAULT_AVAILABLE_TIERS {
        block.insert(
            tier,
            TierStatus {
                available: true,
                reason: None,
            },
        );
    }
    // The agent tier is seeded degraded-honest and only flips to available when a
    // controller resolves a usable gateway (overlaid in the API tiers builder).
    block.insert(
        "agent",
        TierStatus {
            available: false,
            reason: Some(AGENT_TIER_UNRESOLVED.to_string()),
        },
    );
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

/// The degradation block for HISTORICAL (`as_of`) views (audit
/// W02P07-402): the semantic tier is present-only by design (D7.3), and
/// the structural tier carries the v1 as-of bound note so the GUI renders
/// it truthfully rather than as full-fidelity history.
pub fn asof_tiers_block() -> TiersBlock {
    let mut block = tiers_block(&[(
        "semantic",
        "present-only by design; excluded from historical views",
    )]);
    block.insert(
        "structural",
        TierStatus {
            available: true,
            reason: Some(
                "step and symbol resolution degraded to stale at T (v1 as-of bound)".to_string(),
            ),
        },
    );
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
        // The four corpus tiers plus the always-present dedicated `agent` tier —
        // absent tiers are stated, never implied.
        assert_eq!(block.len(), 5);
    }

    #[test]
    fn agent_tier_is_always_present_and_seeded_degraded_honest() {
        // With no explicit agent degradation, the tier is still present and
        // DEGRADED — absence of a controller resolution can never masquerade as
        // availability (a2a-product-provisioning W02.P04.S29).
        let block = tiers_block(&[]);
        let agent = &block["agent"];
        assert!(
            !agent.available,
            "the seeded agent tier is degraded, never optimistically available"
        );
        assert!(
            agent.reason.as_deref().is_some_and(|r| !r.is_empty()),
            "the degraded agent tier always carries a reason"
        );
        // An explicit agent reason (the API degraded builder) overrides the seed.
        let explicit = tiers_block(&[("agent", "gateway stopped")]);
        assert_eq!(explicit["agent"].reason.as_deref(), Some("gateway stopped"));
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
