//! Read-only, bounded recent-history route (status-overview ADR).
//!
//! `GET /history?scope=&limit=N` serves the served worktree's last N commits as
//! `{ commits: [ { hash, short_hash, subject, body, ts, node_ids } ],
//! truncated? }`, newest-first. It is the ONE engine gap the status-overview
//! rail needs: the commit *subject* and *body* are not otherwise on the wire
//! (`/events` carries commit events but no message — the engine self-flagged the
//! gap as a deferred git lookup). This route closes it as a bounded, read-only,
//! enveloped addition; the `body` (bounded by [`MAX_COMMIT_BODY_BYTES`]) backs
//! the rail's expandable commit-message dropdown.
//!
//! The route is assembled from settled primitives: scope validation
//! (`validate_scope`), the read-only commit walk (`ingest_git::log::walk`, now
//! subject-bearing), the existing commit→document correlation
//! (`engine_store::events::node_ids_for_paths`), and the shared
//! `envelope`/`tiers` helpers. It applies the same bounding discipline the rest
//! of the wire applies (`graph-queries-are-bounded-by-default`,
//! `bounded-by-default-for-every-accumulator`): a hard `MAX_HISTORY_LIMIT`
//! ceiling, never an unbounded log walk serialized onto the wire.
//!
//! Read-and-infer (`engine-read-and-infer`): it only reads commit metadata from
//! the worktree's git object DB; it never writes `.vault/`, never mutates a ref,
//! and grows no sibling semantics — it is not a general `git log` surface, only
//! a bounded recent-commit read with subjects.

use std::sync::Arc;

use axum::Json;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::app::{AppState, ScopeCell};

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

/// Hard ceiling on commits served in one history response (mirroring
/// `MAX_CONTENT_BYTES` / `MAX_GRAPH_NODES`): a recent-history read is bounded by
/// construction, never an unbounded log walk. A request for more than this many
/// commits is clamped to the ceiling and the response states the clamp in its
/// `truncated` block honestly. 200 is generous for a "what has been committed?"
/// snapshot while keeping the wire body and the walk small.
pub const MAX_HISTORY_LIMIT: usize = 200;

/// The default commit count when the client omits `limit` (the ADR's ~20): the
/// rail shows a short recent-commit list, not the whole log.
pub const DEFAULT_HISTORY_LIMIT: usize = 20;

/// Hard per-commit body ceiling (bytes) on the wire
/// (`bounded-by-default-for-every-accumulator`): a commit message body is
/// served for the rail's expandable dropdown, but a pathological multi-kilobyte
/// body must never balloon the response. Bodies longer than this are truncated
/// at a char boundary with an honest ellipsis; the full message stays in git.
pub const MAX_COMMIT_BODY_BYTES: usize = 4096;

#[derive(Deserialize, Default)]
pub struct HistoryParams {
    /// The worktree scope (required, the read-route convention): validated
    /// through the shared `validate_scope` path so a bad scope 400s honestly
    /// with the tiers block attached.
    pub scope: String,
    /// How many recent commits to serve per page. Absent uses
    /// [`DEFAULT_HISTORY_LIMIT`]; a value above [`MAX_HISTORY_LIMIT`] is clamped
    /// to the ceiling (and the clamp is reported in the `truncated` block).
    #[serde(default)]
    pub limit: Option<usize>,
    /// Opaque pagination cursor for the rail's "show more": the offset into the
    /// bounded recent-commit window to start from. Absent starts at 0. The
    /// response echoes a `next_cursor` while more commits remain within the
    /// cached window ([`MAX_HISTORY_LIMIT`]); its absence means the bounded
    /// window is exhausted. A non-numeric cursor is treated as 0 (start).
    #[serde(default)]
    pub cursor: Option<String>,
}

/// `GET /history?scope=&limit=N` — the last N commits as
/// `{ commits: [ { hash, short_hash, subject, body, ts, node_ids } ],
/// truncated? }`, newest-first, bounded, read-only, through the shared envelope
/// with the tiers block on success and error.
pub async fn history(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HistoryParams>,
) -> ApiResult {
    let cell = super::query::validate_scope(&state, &params.scope)?;

    // Bound the request at creation: clamp the requested limit to the ceiling
    // and record whether the clamp fired, so the response never serializes an
    // unbounded walk and a clamped request is reported honestly.
    let requested = params.limit.unwrap_or(DEFAULT_HISTORY_LIMIT);
    let limit = requested.min(MAX_HISTORY_LIMIT);
    // Pagination offset (the rail's "show more"): parse the opaque cursor as the
    // window offset, clamped to the cache ceiling so it can never index past the
    // bounded window. A non-numeric cursor starts at 0.
    let offset = params
        .cursor
        .as_deref()
        .and_then(|c| c.parse::<usize>().ok())
        .unwrap_or(0)
        .min(MAX_HISTORY_LIMIT);

    // The HEAD commit walk is a LIVE git read, so it is memoized per generation on
    // the cell (cache-until-invalidated): `/history` no longer walks the object DB
    // on every poll — the recent commits (capped at the ceiling) are walked once
    // per rebuild and the handler correlates + slices in-memory. A scope with no
    // readable git workspace (a ref-only or detached substrate), or a walk
    // failure, returns UNCACHED Err and degrades the STRUCTURAL tier honestly
    // rather than 500ing or returning a healthy-looking empty list (status-overview
    // ADR). An unborn HEAD is an empty history, not a failure (`walk` handles it).
    let recent = match cell.recent_commits() {
        Ok(commits) => commits,
        Err(e) => return Err(history_degraded(&cell, &e)),
    };

    // Slice the cached recent commits (newest-first, walked at the ceiling) to the
    // bounded request limit, then correlate each to the graph-known nodes it
    // touched — the correlation runs in-memory over the cached graph, bounding the
    // per-commit node-id list the same way the event sourcer does (the commit id
    // plus its touched documents/code, the code ids capped) so a single commit's
    // correlation cannot balloon the wire body.
    let graph = cell.graph_arc();
    let rows: Vec<Value> = recent
        .iter()
        .skip(offset)
        .take(limit)
        .map(|c| {
            let node_ids = correlate_node_ids(c, &graph);
            json!({
                "hash": c.sha,
                "short_hash": short_hash(&c.sha),
                "subject": c.subject,
                "body": cap_body(&c.body),
                "ts": c.ts,
                "node_ids": node_ids,
            })
        })
        .collect();

    // Honest truncation: the walk yielded exactly `limit` commits AND the client
    // asked for more than the ceiling allowed. (We cannot know the total commit
    // count without an unbounded walk — which the ceiling exists to avoid — so
    // truncation is reported only for the clamp, the bound we DO know.)
    let truncated = if requested > MAX_HISTORY_LIMIT {
        Some(json!({
            "requested": requested,
            "returned": rows.len(),
            "reason": "history limit ceiling: the request exceeds the served cap \
                       and is clamped; narrow the limit for a bounded read",
        }))
    } else {
        None
    };

    // Pagination cursor for "show more": there is another page while the window
    // beyond this slice still holds commits (bounded by the cached ceiling). When
    // the slice reaches the end of the cached window, `next_cursor` is absent —
    // an honest "no more in the bounded recent window".
    let next_offset = offset + rows.len();
    let next_cursor = if rows.len() == limit && next_offset < recent.len() {
        Some(next_offset.to_string())
    } else {
        None
    };

    Ok(super::envelope(
        json!({
            "commits": rows,
            "truncated": truncated,
        }),
        super::query_tiers(&cell),
        next_cursor,
    ))
}

/// Bound the commit body on the wire to [`MAX_COMMIT_BODY_BYTES`]: a body within
/// the ceiling passes through unchanged; a longer one is cut at a char boundary
/// at or below the byte ceiling and marked with an ellipsis so the rail shows a
/// bounded, honest preview. Empty bodies stay empty.
fn cap_body(body: &str) -> String {
    if body.len() <= MAX_COMMIT_BODY_BYTES {
        return body.to_string();
    }
    let mut end = MAX_COMMIT_BODY_BYTES;
    while end > 0 && !body.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &body[..end])
}

/// Short (8-char) hash, mirroring the client's commit-label shortening so the
/// rail renders a stable identity without re-deriving it. A sha shorter than 8
/// chars (never expected from gix) passes through unchanged.
fn short_hash(sha: &str) -> String {
    sha.chars().take(8).collect()
}

/// The bounded node-id list for a commit: the commit's own `commit:<sha>` id,
/// plus the graph-known documents and (capped) code artifacts it touched —
/// reusing the same correlation + cap the event sourcer applies so the rail can
/// cross-link a commit into the graph without minting a new correlation.
fn correlate_node_ids(
    c: &ingest_git::log::CommitEvent,
    graph: &engine_graph::LinkageGraph,
) -> Vec<String> {
    let correlated =
        engine_store::events::node_ids_for_paths(c.touched_paths.iter().map(String::as_str));
    let (docs, code): (Vec<String>, Vec<String>) = correlated
        .into_iter()
        .partition(|id| !id.starts_with("code:"));
    let docs: Vec<String> = docs
        .into_iter()
        .filter(|id| graph_has_node(graph, id))
        .collect();
    let mut code: Vec<String> = code
        .into_iter()
        .filter(|id| graph_has_node(graph, id))
        .collect();
    code.truncate(engine_query::events::CODE_NODE_IDS_CAP);
    let mut node_ids = Vec::with_capacity(1 + docs.len() + code.len());
    node_ids.push(format!("commit:{}", c.sha));
    node_ids.extend(docs);
    node_ids.extend(code);
    node_ids
}

fn graph_has_node(graph: &engine_graph::LinkageGraph, id: &str) -> bool {
    graph.node(&engine_model::NodeId(id.to_string())).is_some()
}

/// Degrade the STRUCTURAL tier honestly when the worktree's git history is
/// unreadable (a ref-only/detached substrate, or a discover/walk failure):
/// return a tiered 400 so the rail renders a designed degraded state rather than
/// a bare 500 or a healthy-looking empty list (status-overview ADR; mirrors
/// `content.rs`'s `Unreadable` branch).
fn history_degraded(cell: &ScopeCell, reason: &str) -> (StatusCode, Json<Value>) {
    (
        StatusCode::BAD_REQUEST,
        Json(json!({
            "error": format!("recent history unavailable: {reason}"),
            "tiers": super::degraded_tiers_for(cell, "structural", reason),
        })),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_hash_takes_eight_chars() {
        assert_eq!(
            short_hash("0123456789abcdef0123456789abcdef01234567"),
            "01234567"
        );
        assert_eq!(short_hash("abc"), "abc");
    }
}
