use super::*;

/// The per-scope working-tree status snapshot, memoized so a tree EXPANSION
/// costs one status walk rather than one per level (code-tree-legibility ADR
/// D5).
///
/// Every `/file-tree` level joins its entries against this one snapshot. Two
/// invalidations, both cheap:
///
/// * **HEAD moved** — a commit changes what "modified" means for every path, so
///   a different HEAD sha always recomputes, immediately.
/// * **The freshness window elapsed** — working-tree edits do not move HEAD, so
///   past [`GIT_STATUS_FRESHNESS_MS`] the next level recomputes. Within the
///   window (one user expanding a tree) every level reads the held snapshot.
///
/// The git SSE channel drives the client's refetch; this cell decides whether
/// that refetch pays for a walk. Nothing here spawns a subprocess — the
/// snapshot is pure-Rust `gix` (engine-spec D2.5) — and the walk is capped at
/// [`GIT_STATUS_PATHS_CAP`] entries, so the accumulator is bounded at creation.
pub struct GitStatusCell {
    /// `(HEAD sha, computed-at ms, snapshot)`. `None` before the first
    /// successful walk.
    cache: Mutex<Option<(String, i64, Arc<ingest_git::status::StatusSnapshot>)>>,
}

/// Ceiling on the enumerated status set (`bounded-by-default-for-every-
/// accumulator`). Shares the code corpus's dirty-path cap: the same status walk
/// feeds both, so one bound governs.
pub const GIT_STATUS_PATHS_CAP: usize = CODE_DIRTY_PATHS_CAP;

/// How long a held status snapshot serves further levels before the next read
/// recomputes it. Sized to cover one interactive tree expansion.
pub const GIT_STATUS_FRESHNESS_MS: i64 = 2_000;

impl GitStatusCell {
    pub(super) fn new() -> Self {
        GitStatusCell {
            cache: Mutex::new(None),
        }
    }

    /// The status snapshot for this scope's worktree, computed or reused.
    ///
    /// `None` when the worktree is not a readable git repository or its status
    /// could not be walked — the caller then serves entries with NO status
    /// token rather than presenting unknown state as clean-looking truth by
    /// some other route. BLOCKING (an index-vs-worktree diff plus a directory
    /// walk); request paths call it via `spawn_blocking`.
    pub fn ensure(
        &self,
        root: &std::path::Path,
    ) -> Option<Arc<ingest_git::status::StatusSnapshot>> {
        let head = engine_graph::asof::resolve_ref(root, "HEAD").unwrap_or_default();
        let now = now_ms();
        {
            let cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
            if let Some((held_head, computed_ms, held)) = cache.as_ref()
                && *held_head == head
                && now.saturating_sub(*computed_ms) < GIT_STATUS_FRESHNESS_MS
            {
                return Some(held.clone());
            }
        }
        let fresh = Arc::new(ingest_git::status::snapshot(root, GIT_STATUS_PATHS_CAP).ok()?);
        *self.cache.lock().unwrap_or_else(|e| e.into_inner()) =
            Some((head, now_ms(), fresh.clone()));
        Some(fresh)
    }
}
