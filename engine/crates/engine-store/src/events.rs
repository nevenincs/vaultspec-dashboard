//! Temporal event log persistence (engine-spec §8; contract §5 raw event
//! shape), correlating events to engine node ids.
//!
//! Audit carry W01P01-002 is closed here: corrupt `node_ids` rows are a
//! loud, typed error on read — `node_ids` is contract-load-bearing
//! (timeline click → pulse the stage nodes), so silent emptiness would
//! corrupt the join key.

use crate::{EventRow, Result, Store, StoreError};

/// One event ready for persistence: the contract §5 raw shape minus the
/// store-assigned monotonic `seq`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventRecord {
    /// Milliseconds since the Unix epoch (`engine_model::Timestamp` unit).
    pub ts: i64,
    /// Event kind (`commit`, `doc-modified`, lifecycle kinds, …).
    pub kind: String,
    /// The ref/sha/path the event is about.
    pub git_ref: String,
    /// Engine node ids the event correlates to.
    pub node_ids: Vec<String>,
}

/// Derive the engine node ids a set of touched repo-relative paths
/// correlates to: vault documents become document nodes (by stem),
/// everything else becomes a code-artifact node (by path).
pub fn node_ids_for_paths<'a>(paths: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    use engine_model::{CanonicalKey, node_id};
    paths
        .into_iter()
        .map(|path| {
            if let Some(stem) = path
                .strip_prefix(".vault/")
                .and_then(|rest| rest.split('/').next_back())
                .and_then(|file| file.strip_suffix(".md"))
            {
                node_id(&CanonicalKey::Document { stem }).0
            } else {
                node_id(&CanonicalKey::CodeArtifact { path, symbol: None }).0
            }
        })
        .collect()
}

/// Append a batch of events; returns their assigned monotonic sequence
/// numbers, in order.
pub fn persist_events(store: &Store, events: &[EventRecord]) -> Result<Vec<i64>> {
    events
        .iter()
        .map(|e| store.append_event(e.ts, &e.kind, &e.git_ref, &e.node_ids))
        .collect()
}

/// Read events in a time range, failing loud on corrupt `node_ids`
/// (audit W01P01-002).
pub fn events_in_range_strict(store: &Store, from_ts: i64, to_ts: i64) -> Result<Vec<EventRow>> {
    store.events_in_range(from_ts, to_ts)
}

impl Store {
    /// Internal row decoder used by every event read path. Corrupt
    /// `node_ids` JSON is a typed error, never a silent empty vec.
    pub(crate) fn decode_node_ids(seq: i64, raw: &str) -> Result<Vec<String>> {
        serde_json::from_str(raw).map_err(|e| StoreError::CorruptEventRow {
            seq,
            detail: e.to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::DB_FILENAME;

    fn temp_store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open_at(&dir.path().join(DB_FILENAME)).unwrap();
        (dir, store)
    }

    #[test]
    fn node_id_correlation_separates_vault_docs_from_code() {
        let ids = node_ids_for_paths([".vault/plan/2026-06-12-x-plan.md", "src/lib.rs"]);
        assert_eq!(ids, vec!["doc:2026-06-12-x-plan", "code:src/lib.rs"]);
    }

    #[test]
    fn batch_persistence_assigns_monotonic_seqs() {
        let (_dir, store) = temp_store();
        let seqs = persist_events(
            &store,
            &[
                EventRecord {
                    ts: 1_700_000_000_000,
                    kind: "commit".into(),
                    git_ref: "main".into(),
                    node_ids: vec!["commit:abc".into(), "doc:x".into()],
                },
                EventRecord {
                    ts: 1_700_000_001_000,
                    kind: "doc-modified".into(),
                    git_ref: ".vault/plan/x.md".into(),
                    node_ids: vec!["doc:x".into()],
                },
            ],
        )
        .unwrap();
        assert!(seqs.windows(2).all(|w| w[1] > w[0]));
        let rows = events_in_range_strict(&store, 0, i64::MAX).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].node_ids, vec!["commit:abc", "doc:x"]);
    }

    #[test]
    fn corrupt_node_ids_fail_loud_not_silent_empty() {
        let (_dir, store) = temp_store();
        store
            .append_event(1000, "commit", "main", &["doc:x".into()])
            .unwrap();
        // Corrupt the row behind the API's back.
        store
            .conn_for_tests()
            .execute("UPDATE temporal_events SET node_ids = 'not-json'", [])
            .unwrap();
        match events_in_range_strict(&store, 0, i64::MAX) {
            Err(StoreError::CorruptEventRow { seq, .. }) => assert_eq!(seq, 1),
            other => panic!("expected loud corrupt-row error, got {other:?}"),
        }
    }
}
