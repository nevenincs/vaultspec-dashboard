//! The bounded cache of rag's machine-global semantic freshness epoch.
//!
//! Split out of `app.rs`: one value, one TTL, two readers. It touches nothing
//! else in the serve state, and the bound that keeps it honest (a single slot,
//! never a per-scope map) is easier to hold onto when it is not buried in a
//! file about scope registries.

use std::sync::Mutex;

/// The freshness window for the cached semantic epoch.
/// rag's index epoch only advances when a
/// reindex COMPLETES — a minutes-long operation — so serving an epoch up to a
/// few seconds stale is negligible against the build it tracks, while the window
/// collapses a burst of `/search` freshness annotations and `/graph/embeddings`
/// polls onto a single `/jobs` round-trip.
const SEMANTIC_EPOCH_TTL: std::time::Duration = std::time::Duration::from_secs(5);

/// The value + read instant of a cached semantic epoch.
struct CachedEpoch {
    epoch: u64,
    read_at: std::time::Instant,
}

/// A bounded, single-value, short-TTL cache of rag's machine-global semantic
/// freshness epoch. The epoch is ONE fact for the
/// resident service — the newest terminal reindex timestamp across its `/jobs`,
/// derived by [`rag_client::control::semantic_epoch`] — so the whole cache is a
/// single `(epoch, read_at)` slot, never a growing per-scope map
/// (`every-accumulator-is-bounded`: one value plus a TTL bound). Both the
/// `/graph/embeddings` vector-cache key and the `/search` freshness annotation
/// read the epoch through this one seam, so the derivation lives in exactly one
/// place and a warm read costs no round-trip.
#[derive(Default)]
pub struct SemanticEpochCache {
    slot: Mutex<Option<CachedEpoch>>,
}

impl SemanticEpochCache {
    /// The cached epoch IF it was read within [`SEMANTIC_EPOCH_TTL`], else `None`
    /// (a cold or expired slot). A `None` is each caller's cue to refresh on its
    /// own terms: `/graph/embeddings` does the one bounded `/jobs` read and
    /// [`SemanticEpochCache::store`]s it; `/search` annotates an honest absent
    /// marker rather than adding a second blocking round-trip on the search path.
    pub fn fresh(&self) -> Option<u64> {
        // Poison recovery (robustness H2): see `graph_arc`.
        let slot = self.slot.lock().unwrap_or_else(|e| e.into_inner());
        slot.as_ref()
            .filter(|c| c.read_at.elapsed() < SEMANTIC_EPOCH_TTL)
            .map(|c| c.epoch)
    }

    /// Store a freshly-read epoch, opening a new TTL window. Only a genuinely
    /// read epoch is stored — a legitimate `0` ("nothing reindexed yet") included;
    /// a FAILED read is never stored, so a rag flake leaves the slot cold and
    /// `/search` reports absent rather than a fabricated `0`.
    pub fn store(&self, epoch: u64) {
        let mut slot = self.slot.lock().unwrap_or_else(|e| e.into_inner());
        *slot = Some(CachedEpoch {
            epoch,
            read_at: std::time::Instant::now(),
        });
    }
}
