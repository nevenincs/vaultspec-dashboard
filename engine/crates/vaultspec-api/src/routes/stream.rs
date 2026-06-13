//! `/status` and the multiplexed SSE stream (contract §6–§7,
//! W03.P11.S51): channels, monotonic sequence numbers, and `since=`
//! resume-or-gap on the single delta clock.

use std::convert::Infallible;
use std::sync::Arc;
use std::sync::atomic::Ordering;

use axum::Json;
use axum::extract::{Query, State};
use axum::response::sse::{Event, Sse};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio_stream::StreamExt;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::wrappers::errors::BroadcastStreamRecvError;

use crate::app::AppState;

// --- GET /status (the recovery snapshot, contract §6) -------------------------

pub async fn status(State(state): State<Arc<AppState>>) -> Json<Value> {
    let graph = state.graph_arc();
    let rag = match rag_client::client::discover(&state.root.join(".vault")).0 {
        rag_client::RagAvailability::Available => json!({"available": true}),
        rag_client::RagAvailability::Unavailable { reason } => {
            json!({"available": false, "reason": reason})
        }
    };
    let core = ingest_core::runner::CoreRunner::detect();
    // Git status of the served worktree (contract §6) — front-door parity
    // with the CLI status verb (D6.1, addendum S04).
    let served = super::scope_token(&state.root);
    let git = ingest_git::workspace::Workspace::discover(&state.root)
        .ok()
        .and_then(|ws| ingest_git::worktrees::enumerate(&ws).ok())
        .and_then(|wts| {
            wts.into_iter()
                .find(|wt| super::scope_token(&wt.path) == served)
        })
        .map(|wt| json!({"head_ref": wt.head_ref, "dirty": wt.dirty}))
        .unwrap_or(json!(null));
    let data = json!({
        "ok": true,
        "scope": super::scope_token(&state.root),
        "git": git,
        "index": {
            "nodes": graph.node_count(),
            "edges": graph.edge_count(),
            "generation": state.generation.load(Ordering::SeqCst),
        },
        "backends": {
            "core": {"invocation": core.invocation.join(" ")},
            "rag": rag,
        },
        // A dead watcher is stated, never papered over (DF-4 residual):
        // heartbeat-alive-but-rebuilds-stopped is a zombie, and the
        // operator needs to know.
        "watcher": match state.watcher.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
            Some(handle) if handle.is_alive() => json!({"running": true, "mode": "resident"}),
            Some(_) => json!({
                "running": false,
                "mode": "resident",
                "reason": "watcher thread died; restart the service (rebuilds stopped)",
            }),
            None => json!({"running": false, "mode": "starting"}),
        },
        "last_seq": state.seq.load(Ordering::SeqCst).saturating_sub(1),
    });
    // Contract §2 envelope (audit L1).
    super::envelope(data, super::query_tiers(&state), None)
}

// --- GET /stream?channels=&since= -----------------------------------------------

#[derive(Deserialize)]
pub struct StreamParams {
    #[serde(default)]
    pub channels: Option<String>,
    #[serde(default)]
    pub since: Option<u64>,
}

pub async fn stream(
    State(state): State<Arc<AppState>>,
    Query(params): Query<StreamParams>,
) -> Sse<impl futures_core::Stream<Item = Result<Event, Infallible>>> {
    let wanted: Vec<String> = params
        .channels
        .as_deref()
        .unwrap_or("graph,fs,git,backends,index")
        .split(',')
        .map(str::to_string)
        .collect();

    // Splice order matters (audit N1): SUBSCRIBE FIRST, snapshot the ring
    // SECOND — a rebuild landing between the two is then present in the
    // live receiver's queue rather than silently lost. De-duplication by
    // sequence threshold removes the overlap between snapshot and queue.
    let receiver = state.tx.subscribe();

    let mut backlog: Vec<Event> = Vec::new();
    let mut emitted_up_to: u64 = params.since.unwrap_or(0);
    if let Some(since) = params.since {
        // Poison recovery (robustness H2): a poisoned ring lock must not wedge
        // SSE resume; recover the inner buffer instead of panicking.
        let ring = state.ring.lock().unwrap_or_else(|e| e.into_inner());
        // Ring entries are `(seq, payload)` across BOTH granularity species
        // (S50); resume and gap-detection are on the GLOBAL seq, application is
        // per-granularity client-side.
        let oldest = ring.front().map(|(seq, _)| *seq);
        match oldest {
            Some(oldest) if since + 1 < oldest => {
                // Replay impossible: explicit gap, client re-keyframes
                // (contract §7).
                backlog.push(
                    Event::default()
                        .event("gap")
                        .data(json!({"requested": since, "oldest_buffered": oldest}).to_string()),
                );
            }
            _ => {
                for (seq, payload) in ring.iter().filter(|(seq, _)| *seq > since) {
                    emitted_up_to = emitted_up_to.max(*seq);
                    backlog.push(
                        Event::default()
                            .event("graph")
                            .id(seq.to_string())
                            .data(payload.to_string()),
                    );
                }
            }
        }
    }

    let dedup_threshold = if params.since.is_some() {
        Some(emitted_up_to)
    } else {
        None
    };
    let live = BroadcastStream::new(receiver)
        .filter_map(move |item| map_live_item(item, &wanted, dedup_threshold));

    let combined = tokio_stream::iter(backlog.into_iter().map(Ok)).chain(live);
    Sse::new(combined).keep_alive(axum::response::sse::KeepAlive::default())
}

/// Map one live `BroadcastStream` item to an SSE event.
///
/// A slow consumer that falls behind the broadcast ring yields
/// `Err(Lagged(n))`: `n` deltas were dropped from this receiver. The old
/// `item.ok()?` swallowed that marker, desyncing the client without telling
/// it. Mirror the `since=` resume contract (contract §7) and emit a `gap`
/// event so the client re-keyframes instead of silently diverging.
fn map_live_item(
    item: Result<crate::app::StreamEvent, BroadcastStreamRecvError>,
    wanted: &[String],
    dedup_threshold: Option<u64>,
) -> Option<Result<Event, Infallible>> {
    match item {
        Ok(event) => {
            if !wanted.iter().any(|c| c == event.channel) {
                return None;
            }
            // Drop graph deltas already replayed from the snapshot.
            if event.channel == "graph"
                && let Some(threshold) = dedup_threshold
                && event.seq <= threshold
            {
                return None;
            }
            Some(Ok(Event::default()
                .event(event.channel)
                .id(event.seq.to_string())
                .data(event.payload.to_string())))
        }
        Err(BroadcastStreamRecvError::Lagged(n)) => Some(Ok(Event::default()
            .event("gap")
            .data(json!({"lagged": n, "reason": "broadcast lag"}).to_string()))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app::StreamEvent;
    use tokio::sync::broadcast;

    #[test]
    fn lagged_item_maps_to_a_gap_event_not_a_silent_drop() {
        // A slow consumer falling behind must produce a `gap` event, not be
        // silently filtered out (the old `item.ok()?` desync bug).
        let mapped = map_live_item(Err(BroadcastStreamRecvError::Lagged(7)), &[], None);
        let event = mapped
            .expect("lag must yield an item, never be dropped")
            .expect("infallible");
        let rendered = format!("{event:?}");
        assert!(
            rendered.contains("gap"),
            "lag must surface as a `gap` event: {rendered}"
        );
        assert!(
            rendered.contains('7'),
            "the gap event reports the dropped count: {rendered}"
        );
    }

    #[tokio::test]
    async fn slow_consumer_overflow_yields_a_gap_through_the_real_broadcast_stream() {
        // Drive an actual overflow through BroadcastStream end-to-end: a tiny
        // channel, fill past capacity before consuming, then assert the first
        // item the slow receiver sees is our `gap` marker.
        let (tx, rx) = broadcast::channel::<StreamEvent>(2);
        for seq in 0..5 {
            let _ = tx.send(StreamEvent {
                channel: "graph",
                payload: json!({"seq": seq}),
                seq,
            });
        }
        let wanted = vec!["graph".to_string()];
        let mut stream =
            BroadcastStream::new(rx).filter_map(move |item| map_live_item(item, &wanted, None));
        let first = stream
            .next()
            .await
            .expect("a lagged receiver yields at least the gap marker")
            .expect("infallible");
        let rendered = format!("{first:?}");
        assert!(
            rendered.contains("gap"),
            "the overflowed receiver re-keyframes via a gap event: {rendered}"
        );
    }
}
