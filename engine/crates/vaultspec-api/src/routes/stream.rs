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
    // `/status` reports the ACTIVE scope's cell (W02.P04.S13): its live graph,
    // generation, watcher residency, and delta-clock tip. The active cell is
    // always present (pinned, never evicted).
    let cell = state.active_cell();
    let graph = cell.graph_arc();
    // `/status` is an explicit poll (not the per-response hot path), so it pays
    // the authoritative machine-global running-predicate: discovery + heartbeat +
    // an ungated GET /health liveness confirm. This distinguishes a CRASHED
    // service (discovered but not serving) from a genuinely ABSENT one — the
    // distinction the lifecycle/console UI needs to decide attach-vs-start. The
    // per-response `tiers` block stays filesystem-only (query_tiers).
    // `/status` is polled by the console, so its blocking /health probe must not
    // pin an async runtime worker (RCR-001): offload it. A task join failure (a
    // panic in the probe) degrades to honest absence rather than a hang.
    let vault = cell.root.join(".vault");
    let probe = tokio::task::spawn_blocking(move || {
        rag_client::client::probe_machine_state(&vault, std::time::Duration::from_millis(1500))
    })
    .await
    .unwrap_or_else(|_| rag_client::client::RagMachineState::Absent {
        reason: "rag status probe task failed".to_string(),
    });
    let rag = match probe {
        rag_client::client::RagMachineState::Running { info, health } => json!({
            "available": true,
            "state": "running",
            "pid": health.pid.or(info.pid),
            "port": info.port,
        }),
        rag_client::client::RagMachineState::Crashed { reason, info } => json!({
            "available": false,
            "state": "crashed",
            "reason": reason,
            "port": info.as_ref().map(|i| i.port),
        }),
        rag_client::client::RagMachineState::Absent { reason } => json!({
            "available": false,
            "state": "absent",
            "reason": reason,
        }),
    };
    let core = ingest_core::runner::CoreRunner::detect();
    // Git status of the served worktree (contract §6) — front-door parity
    // with the CLI status verb (D6.1, addendum S04). Inspect only the served
    // worktree (status-worktree-latency): `/status` never needed every
    // worktree, so the targeted path keeps latency flat in worktree count.
    let git = ingest_git::workspace::Workspace::discover(&cell.root)
        .ok()
        .and_then(|ws| ingest_git::worktrees::inspect_one(&ws, &cell.root).ok().flatten())
        .map(|wt| json!({"head_ref": wt.head_ref, "dirty": wt.dirty, "ahead": wt.ahead, "behind": wt.behind}))
        .unwrap_or(json!(null));
    let data = json!({
        "ok": true,
        "scope": super::scope_token(&cell.root),
        "git": git,
        "index": {
            "nodes": graph.node_count(),
            "edges": graph.edge_count(),
            "generation": cell.generation.load(Ordering::SeqCst),
        },
        "backends": {
            "core": {"invocation": core.invocation.join(" ")},
            "rag": rag,
            // The dashboard-owned A2A companion (a2a-product-provisioning
            // W02.P04.S32): installation, gateway identity, the one readiness
            // model, and lifecycle admission. A cold worker on a live gateway is
            // READY here, never collapsed into a degraded backend.
            "a2a": state.a2a_lifecycle.stream_facts(),
        },
        // A dead watcher is stated, never papered over (DF-4 residual):
        // heartbeat-alive-but-rebuilds-stopped is a zombie, and the
        // operator needs to know. Reads the active cell's own watcher.
        "watcher": match cell.watcher.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
            Some(handle) if handle.is_alive() => json!({"running": true, "mode": "resident"}),
            Some(_) => json!({
                "running": false,
                "mode": "resident",
                "reason": "watcher thread died; restart the service (rebuilds stopped)",
            }),
            None => json!({"running": false, "mode": "starting"}),
        },
        "last_seq": cell.seq.load(Ordering::SeqCst).saturating_sub(1),
    });
    // Contract §2 envelope (audit L1).
    super::envelope(data, super::query_tiers(&cell), None)
}

// --- GET /stream?channels=&since= -----------------------------------------------

#[derive(Deserialize)]
pub struct StreamParams {
    #[serde(default)]
    pub channels: Option<String>,
    #[serde(default)]
    pub since: Option<u64>,
    /// The scope to stream (W02.P04.S14). WIRE CHANGE: per-scope live state
    /// means the client passes `scope` to stream a specific worktree. Absent,
    /// it falls back to the active scope — backward-compatible for a single-
    /// scope client. `since=` resume is against THIS scope's own monotonic
    /// clock, so resume stays correct and independent per scope.
    #[serde(default)]
    pub scope: Option<String>,
}

/// Decide whether a `since=` resume falls in a GAP, returning the oldest buffered
/// seq when it does (for the gap event payload) and `None` when replay is possible.
/// A gap means the NEXT seq the client needs (`since + 1`) is older than the
/// oldest still buffered — the ring has evicted it, so the client must re-keyframe
/// (contract §7).
///
/// `saturating_add`, NOT `since + 1`: `since` is an UNSANITIZED wire `u64`, so a
/// hostile/absurd `since = u64::MAX` would overflow the increment — a panic in
/// debug (a 500 on stream setup) and a SILENT wrap to 0 in release (overflow-checks
/// off) that fabricates a spurious gap. Saturating keeps the predicate total: a
/// `since` at/above every buffered seq simply yields no gap (no replay, no
/// re-keyframe). Same wire-arithmetic discipline as the events bucketer's
/// `saturating_sub` (robustness M3) and the `saturating_sub` on `last_seq` above.
fn gap_oldest(since: u64, oldest: Option<u64>) -> Option<u64> {
    oldest.filter(|&oldest| since.saturating_add(1) < oldest)
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

    // Resolve the streamed scope's cell (W02.P04.S14). An explicit `scope`
    // resolves through the registry (building it warm if cold); absent or
    // unresolvable, the active scope's cell is the fallback — a stream is never
    // an error surface, so a bad scope degrades to the active scope rather than
    // failing the SSE handshake. The cell owns the `tx`/`ring`/`seq` this
    // stream subscribes to and resumes from, so per-scope resume is correct.
    let cell = match params.scope.as_deref() {
        Some(scope) => {
            crate::registry::get_or_build(&state, scope).unwrap_or_else(|_| state.active_cell())
        }
        None => state.active_cell(),
    };

    // Splice order matters (audit N1): SUBSCRIBE FIRST, snapshot the ring
    // SECOND — a rebuild landing between the two is then present in the
    // live receiver's queue rather than silently lost. De-duplication by
    // sequence threshold removes the overlap between snapshot and queue.
    let receiver = cell.tx.subscribe();

    let mut backlog: Vec<Event> = Vec::new();
    let mut emitted_up_to: u64 = params.since.unwrap_or(0);
    if let Some(since) = params.since {
        // Poison recovery (robustness H2): a poisoned ring lock must not wedge
        // SSE resume; recover the inner buffer instead of panicking.
        let ring = cell.ring.lock().unwrap_or_else(|e| e.into_inner());
        // Ring entries are `(seq, payload)` across BOTH granularity species
        // (S50); resume and gap-detection are on the GLOBAL seq, application is
        // per-granularity client-side.
        let oldest = ring.front().map(|(seq, _)| *seq);
        if let Some(oldest) = gap_oldest(since, oldest) {
            // Replay impossible: explicit gap, client re-keyframes (contract §7).
            backlog.push(
                Event::default()
                    .event("gap")
                    .data(json!({"requested": since, "oldest_buffered": oldest}).to_string()),
            );
        } else {
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
    fn gap_oldest_detects_replay_gaps_and_saturates_a_hostile_since() {
        // No ring → never a gap (nothing buffered to compare against).
        assert_eq!(gap_oldest(5, None), None);
        // The next needed seq (since+1=6) is older than oldest(7) → GAP.
        assert_eq!(gap_oldest(5, Some(7)), Some(7));
        // since+1 == oldest: the next needed seq IS still buffered → replay, no gap.
        assert_eq!(gap_oldest(5, Some(6)), None);
        // Caught up (oldest <= since) → no gap.
        assert_eq!(gap_oldest(5, Some(5)), None);
        assert_eq!(gap_oldest(9, Some(3)), None);
        // Hostile/absurd wire `since = u64::MAX`: saturating_add must NOT overflow
        // (no debug panic, no release wrap-to-0 fabricating a spurious gap). A
        // since at/above every buffered seq simply yields no gap.
        assert_eq!(gap_oldest(u64::MAX, Some(7)), None);
        assert_eq!(gap_oldest(u64::MAX, None), None);
    }

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
