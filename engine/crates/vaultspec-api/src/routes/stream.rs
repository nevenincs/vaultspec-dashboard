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
    Json(json!({
        "ok": true,
        "scope": state.root.to_string_lossy().replace('\\', "/"),
        "index": {
            "nodes": graph.node_count(),
            "edges": graph.edge_count(),
            "generation": state.generation.load(Ordering::SeqCst),
        },
        "backends": {
            "core": {"invocation": core.invocation.join(" ")},
            "rag": rag,
        },
        "watcher": {"running": true, "mode": "resident"},
        "last_seq": state.seq.load(Ordering::SeqCst).saturating_sub(1),
        "tiers": super::query_tiers(&state),
    }))
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

    // Replay-or-gap (contract §7): `since=` resumes from the ring when the
    // requested position is still buffered; otherwise an explicit `gap`
    // event tells the client to re-keyframe.
    let mut backlog: Vec<Event> = Vec::new();
    if let Some(since) = params.since {
        let ring = state.ring.lock().expect("ring lock");
        let oldest = ring.front().map(|e| e.seq);
        match oldest {
            Some(oldest) if since + 1 < oldest => {
                backlog.push(
                    Event::default()
                        .event("gap")
                        .data(json!({"requested": since, "oldest_buffered": oldest}).to_string()),
                );
            }
            _ => {
                for entry in ring.iter().filter(|e| e.seq > since) {
                    backlog.push(
                        Event::default()
                            .event("graph")
                            .id(entry.seq.to_string())
                            .data(serde_json::to_string(entry).expect("entry serializes")),
                    );
                }
            }
        }
    }

    let live = BroadcastStream::new(state.tx.subscribe()).filter_map(move |item| {
        let event = item.ok()?;
        if !wanted.iter().any(|c| c == event.channel) {
            return None;
        }
        Some(Ok(Event::default()
            .event(event.channel)
            .id(event.seq.to_string())
            .data(event.payload.to_string())))
    });

    let combined = tokio_stream::iter(backlog.into_iter().map(Ok)).chain(live);
    Sse::new(combined).keep_alive(axum::response::sse::KeepAlive::default())
}
