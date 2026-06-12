//! `vaultspec events [--from --to --kinds --bucket]` — the temporal event
//! stream in the contract §5 shape, with engine-side bucketing.

use engine_query::events::{BucketMode, bucket_events, parse_bucket_param};
use engine_store::EventRow;
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

    // Event sourcing lives in the query core (audit G7 / D6.1): both
    // front doors delegate to the same function. The one-shot verb reads
    // the live walk by design (cold start is a feature); the serve mode's
    // persisted event log is its resident accumulator — that parity
    // rationale is recorded in the S45 record (G6).
    let workspace = Workspace::discover(&ctx.root)?;
    let mut rows: Vec<EventRow> = engine_query::events::commit_rows(&workspace, "HEAD", WALK_LIMIT)
        .map_err(CliError::Other)?;

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
