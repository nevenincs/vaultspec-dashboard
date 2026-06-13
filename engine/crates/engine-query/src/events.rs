//! Event bucketing (contract §5): `bucket=auto|raw|<interval>`. The engine
//! owns downsampling — the timeline must never render ten thousand
//! individual marks; zoomed out it gets per-bucket counts by kind.

use std::collections::BTreeMap;

use engine_store::EventRow;
use serde::Serialize;

/// Bucketing mode requested by the client.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BucketMode {
    /// Raw events (fine zoom; client renders individual marks).
    Raw,
    /// Engine picks an interval targeting [`AUTO_TARGET_BUCKETS`].
    Auto,
    /// Fixed interval in milliseconds (`1h` = 3_600_000, `1d` = 86_400_000).
    Fixed(i64),
}

/// Auto mode aims for at most this many buckets across the range.
pub const AUTO_TARGET_BUCKETS: i64 = 100;

/// One bucket: per-kind counts over [from, to).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Bucket {
    pub from: i64,
    pub to: i64,
    pub counts_by_kind: BTreeMap<String, u64>,
}

/// The bucketed-or-raw response payload.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case", tag = "shape")]
pub enum EventsPayload {
    Raw { events: Vec<RawEvent> },
    Bucketed { buckets: Vec<Bucket> },
}

/// Contract §5 raw event fields: stable id, ts, kind, ref, node_ids.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RawEvent {
    /// Stable event id: the store's monotonic seq, prefixed.
    pub id: String,
    pub ts: i64,
    pub kind: String,
    #[serde(rename = "ref")]
    pub git_ref: String,
    pub node_ids: Vec<String>,
    /// Code-artifact ids dropped by the wire bound (addendum S05);
    /// omitted when nothing was truncated.
    #[serde(skip_serializing_if = "is_zero")]
    pub truncated_node_ids: u64,
}

fn is_zero(n: &u64) -> bool {
    *n == 0
}

impl From<&EventRow> for RawEvent {
    fn from(row: &EventRow) -> Self {
        RawEvent {
            id: format!("ev:{}", row.seq),
            ts: row.ts,
            kind: row.kind.clone(),
            git_ref: row.git_ref.clone(),
            node_ids: row.node_ids.clone(),
            truncated_node_ids: row.truncated_node_ids,
        }
    }
}

/// Bucket (or pass through) events for [from_ts, to_ts].
pub fn bucket_events(
    rows: &[EventRow],
    from_ts: i64,
    to_ts: i64,
    mode: BucketMode,
) -> EventsPayload {
    let interval = match mode {
        BucketMode::Raw => {
            return EventsPayload::Raw {
                events: rows.iter().map(RawEvent::from).collect(),
            };
        }
        BucketMode::Auto => {
            let span = (to_ts - from_ts).max(1);
            (span / AUTO_TARGET_BUCKETS).max(1)
        }
        BucketMode::Fixed(ms) => ms.max(1),
    };

    let mut buckets: BTreeMap<i64, BTreeMap<String, u64>> = BTreeMap::new();
    for row in rows {
        if row.ts < from_ts || row.ts > to_ts {
            continue;
        }
        let start = from_ts + ((row.ts - from_ts) / interval) * interval;
        *buckets
            .entry(start)
            .or_default()
            .entry(row.kind.clone())
            .or_default() += 1;
    }
    EventsPayload::Bucketed {
        buckets: buckets
            .into_iter()
            .map(|(from, counts_by_kind)| Bucket {
                from,
                to: from + interval,
                counts_by_kind,
            })
            .collect(),
    }
}

/// Parse the wire bucket parameter: `raw`, `auto`, `1h`, `1d`, `15m`, `30s`.
pub fn parse_bucket_param(param: &str) -> Option<BucketMode> {
    match param {
        "raw" => Some(BucketMode::Raw),
        "auto" => Some(BucketMode::Auto),
        other => {
            let (digits, unit) = other.split_at(other.len().checked_sub(1)?);
            let n: i64 = digits.parse().ok()?;
            let ms = match unit {
                "s" => n.checked_mul(1_000)?,
                "m" => n.checked_mul(60_000)?,
                "h" => n.checked_mul(3_600_000)?,
                "d" => n.checked_mul(86_400_000)?,
                _ => return None,
            };
            (ms > 0).then_some(BucketMode::Fixed(ms))
        }
    }
}

/// Wire bound on code-artifact ids per commit event (contract §5,
/// addendum S05): doc ids always survive — they are the timeline's join
/// key — while code ids beyond the cap truncate with a count.
pub const CODE_NODE_IDS_CAP: usize = 20;

/// Source commit events from a workspace ref into contract-shaped rows
/// (audit G7: event sourcing lives in the query core; both front doors
/// delegate here — D6.1, no capability in only one door).
///
/// `known` bounds the correlation (S05): when given, code-artifact ids
/// keep only graph-known nodes; the survivors cap at
/// [`CODE_NODE_IDS_CAP`] with the dropped count reported on the row. Doc
/// and commit ids are never truncated.
pub fn commit_rows(
    workspace: &ingest_git::workspace::Workspace,
    reference: &str,
    limit: usize,
    known: Option<&engine_graph::LinkageGraph>,
) -> Result<Vec<EventRow>, String> {
    let commits = ingest_git::log::walk(workspace, reference, limit).map_err(|e| e.to_string())?;
    let mut rows: Vec<EventRow> = commits
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let correlated = engine_store::events::node_ids_for_paths(
                c.touched_paths.iter().map(String::as_str),
            );
            let (docs, code): (Vec<String>, Vec<String>) = correlated
                .into_iter()
                .partition(|id| !id.starts_with("code:"));
            let mut code: Vec<String> = match known {
                Some(graph) => code
                    .into_iter()
                    .filter(|id| graph.node(&engine_model::NodeId(id.clone())).is_some())
                    .collect(),
                None => code,
            };
            let truncated = code.len().saturating_sub(CODE_NODE_IDS_CAP) as u64;
            code.truncate(CODE_NODE_IDS_CAP);
            let mut node_ids = Vec::with_capacity(1 + docs.len() + code.len());
            node_ids.push(format!("commit:{}", c.sha));
            node_ids.extend(docs);
            node_ids.extend(code);
            EventRow {
                seq: i as i64 + 1,
                ts: c.ts,
                kind: c.kind.to_string(),
                git_ref: c.git_ref.clone(),
                node_ids,
                truncated_node_ids: truncated,
            }
        })
        .collect();
    rows.sort_by_key(|r| r.ts);
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(seq: i64, ts: i64, kind: &str) -> EventRow {
        EventRow {
            seq,
            ts,
            kind: kind.into(),
            git_ref: "main".into(),
            node_ids: vec![format!("doc:{seq}")],
            truncated_node_ids: 0,
        }
    }

    #[test]
    fn raw_mode_passes_contract_shaped_events_through() {
        let rows = [row(1, 1000, "commit"), row(2, 2000, "doc-modified")];
        let EventsPayload::Raw { events } = bucket_events(&rows, 0, 3000, BucketMode::Raw) else {
            panic!("raw expected");
        };
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].id, "ev:1");
        assert_eq!(events[0].node_ids, vec!["doc:1"]);
    }

    #[test]
    fn fixed_interval_buckets_count_by_kind() {
        let rows = [
            row(1, 500, "commit"),
            row(2, 900, "commit"),
            row(3, 900, "doc-modified"),
            row(4, 1500, "commit"),
            row(5, 99_999, "commit"), // outside range: dropped
        ];
        let EventsPayload::Bucketed { buckets } =
            bucket_events(&rows, 0, 2000, BucketMode::Fixed(1000))
        else {
            panic!("bucketed expected");
        };
        assert_eq!(buckets.len(), 2);
        assert_eq!(buckets[0].from, 0);
        assert_eq!(buckets[0].to, 1000);
        assert_eq!(buckets[0].counts_by_kind["commit"], 2);
        assert_eq!(buckets[0].counts_by_kind["doc-modified"], 1);
        assert_eq!(buckets[1].counts_by_kind["commit"], 1);
    }

    #[test]
    fn auto_mode_caps_bucket_count() {
        let rows: Vec<EventRow> = (0..1000).map(|i| row(i, i * 1000, "commit")).collect();
        let EventsPayload::Bucketed { buckets } =
            bucket_events(&rows, 0, 1_000_000, BucketMode::Auto)
        else {
            panic!("bucketed expected");
        };
        assert!(buckets.len() as i64 <= AUTO_TARGET_BUCKETS + 1);
        let total: u64 = buckets.iter().flat_map(|b| b.counts_by_kind.values()).sum();
        assert_eq!(total, 1000, "no event lost to bucketing");
    }

    #[test]
    fn bucket_param_grammar() {
        assert_eq!(parse_bucket_param("raw"), Some(BucketMode::Raw));
        assert_eq!(parse_bucket_param("auto"), Some(BucketMode::Auto));
        assert_eq!(parse_bucket_param("1h"), Some(BucketMode::Fixed(3_600_000)));
        assert_eq!(
            parse_bucket_param("1d"),
            Some(BucketMode::Fixed(86_400_000))
        );
        assert_eq!(parse_bucket_param("15m"), Some(BucketMode::Fixed(900_000)));
        assert_eq!(parse_bucket_param("bogus"), None);
        assert_eq!(parse_bucket_param("0h"), None);
    }
}
