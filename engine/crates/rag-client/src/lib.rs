//! Semantic-tier client for vaultspec-rag (engine-spec §5.2).
//!
//! Rag is consumed via its resident loopback HTTP service (bearer-token
//! routes, `service.json` discovery) — never via Python import, never
//! bundled; the published wheel's torch-free guarantee is untouchable.
//! Absence or death of rag means the semantic tier is absent plus a truthful
//! `/status` entry; everything else functions fully without it (D5.2).
//! The engine builds no embeddings, ever.

pub mod client;
pub mod discover;
pub mod search;

/// Semantic confidence is capped below structural (engine-spec §3, D3.5).
pub const SEMANTIC_CONFIDENCE_CAP: f32 = 0.7;

/// Availability of the semantic tier, surfaced verbatim in the per-response
/// `tiers` degradation block (contract §2).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RagAvailability {
    Available,
    /// Rag absent or its service down — a designed, truthful state.
    Unavailable {
        reason: String,
    },
}

/// Clamp a raw rag score into the engine's semantic confidence band.
pub fn semantic_confidence(raw_score: f32) -> f32 {
    raw_score.clamp(0.0, SEMANTIC_CONFIDENCE_CAP)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semantic_confidence_is_capped_below_structural() {
        assert_eq!(semantic_confidence(0.95), SEMANTIC_CONFIDENCE_CAP);
        assert_eq!(semantic_confidence(0.4), 0.4);
        assert_eq!(semantic_confidence(-1.0), 0.0);
    }
}
