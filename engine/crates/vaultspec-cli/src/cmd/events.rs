//! `vaultspec events [--from --to --kinds --bucket]` — the temporal event
//! stream in the contract §5 shape, with engine-side bucketing.

use engine_query::events::{BucketMode, bucket_events, parse_bucket_param};
use engine_store::EventRow;
use engine_store::events::node_ids_for_paths;
use ingest_git::workspace::Workspace;
use serde_json::{Value, json};

use super::{CliError, Ctx};

const WALK_LIMIT: usize = 5000;

pub fn run(
    ctx: &Ctx,
    from: Option<i64>,
    to: Option<i64>,
    kinds: &[String],
    bucket: Option<&str>,
) -> Result<Value, CliError> {
    let mode = match bucket {
        None => BucketMode::Raw,
        Some(param) => parse_bucket_param(param).ok_or_else(|| {
            CliError::Other(format!("unknown bucket `{param}` (raw|auto|30s|15m|1h|1d)"))
        })?,
    };

    // Live commit events from the scope's HEAD (the temporal source; the
    // persisted event log is the serve mode's accumulator).
    let workspace = Workspace::discover(&ctx.root)?;
    let head = "HEAD";
    let commits = ingest_git::log::walk(&workspace, head, WALK_LIMIT)?;
    let mut rows: Vec<EventRow> = commits
        .iter()
        .enumerate()
        .map(|(i, c)| EventRow {
            seq: i as i64 + 1,
            ts: c.ts,
            kind: c.kind.to_string(),
            git_ref: c.git_ref.clone(),
            node_ids: {
                let mut ids = node_ids_for_paths(c.touched_paths.iter().map(String::as_str));
                ids.insert(0, format!("commit:{}", c.sha));
                ids
            },
        })
        .collect();
    rows.sort_by_key(|r| r.ts);

    if !kinds.is_empty() {
        rows.retain(|r| kinds.contains(&r.kind));
    }
    let from_ts = from.unwrap_or(0);
    let to_ts = to.unwrap_or(i64::MAX);
    rows.retain(|r| r.ts >= from_ts && r.ts <= to_ts);

    let payload = bucket_events(
        &rows,
        from_ts,
        to_ts.min(rows.last().map_or(from_ts, |r| r.ts)),
        mode,
    );
    Ok(json!({
        "from": from_ts,
        "to": to,
        "kinds": kinds,
        "payload": payload,
    }))
}
