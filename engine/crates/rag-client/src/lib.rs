//! Semantic-tier client for vaultspec-rag (engine-spec §5.2).
//!
//! Rag is consumed via its resident loopback HTTP service (bearer-token
//! routes, `service.json` discovery) — never via Python import, never
//! bundled; the published wheel's torch-free guarantee is untouchable.
//! Absence or death of rag means the semantic tier is absent plus a truthful
//! `/status` entry; everything else functions fully without it (D5.2).
//! The engine builds no embeddings, ever.

pub mod client;
pub mod control;
pub mod search;
pub mod vectors;

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
