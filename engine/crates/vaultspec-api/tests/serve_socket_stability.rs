//! Serve socket stability over REAL loopback sockets: the served router is
//! driven through actual TCP connections (not the in-process `oneshot` seam),
//! because the failures this guards are transport-level — a connection dropped
//! mid-flight, or a stop that never drains and has to be killed.
//!
//! Two properties:
//!
//! 1. A watcher-style rebuild-and-swap storm must not disturb live keep-alive
//!    connections. The swap advances the delta clock, broadcasts to stream
//!    subscribers, replaces the graph, and bumps the generation while requests
//!    are in flight on the same connections.
//! 2. A graceful stop must DRAIN, with an endless live stream open. An endless
//!    SSE body that ignores the stop keeps its connection open forever, so the
//!    server future never completes; the caller's bounded wait then expires and
//!    escalates to a kill, which resets every connection still attached —
//!    including unrelated in-flight requests. The stream must therefore end
//!    itself on the stop latch and the body must terminate CLEANLY.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

/// A small multi-document corpus: enough for a rebuild to do real diff,
/// projection, and broadcast work on every swap.
fn fixture(dir: &std::path::Path) {
    std::fs::create_dir_all(dir.join(".vault/plan")).unwrap();
    for i in 0..40 {
        std::fs::write(
            dir.join(format!(
                ".vault/plan/2026-06-{:02}-srv-plan.md",
                (i % 28) + 1
            )),
            format!("---\ntags:\n  - '#plan'\n  - '#srv{i}'\n---\n\nMentions `src/a{i}.rs`.\n"),
        )
        .unwrap();
    }
}

/// Serve the real router on an OS-assigned loopback port, stopping on the
/// state's own shutdown latch — the same wiring the serve loop uses.
async fn serve_state(
    state: Arc<vaultspec_api::app::AppState>,
) -> (std::net::SocketAddr, tokio::task::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let served = state.clone();
    let handle = tokio::spawn(async move {
        let stopping = served.clone();
        axum::serve(listener, vaultspec_api::build_router(served))
            .with_graceful_shutdown(async move { stopping.shutdown.wait().await })
            .await
            .unwrap();
    });
    (addr, handle)
}

/// Read one complete HTTP/1.1 response off a keep-alive connection. An early
/// EOF is the transport-level failure this file exists to catch, so it is
/// reported as such rather than retried.
async fn read_response(stream: &mut TcpStream) -> Result<String, String> {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 4096];
    loop {
        let read = stream
            .read(&mut chunk)
            .await
            .map_err(|e| format!("read failed: {e}"))?;
        if read == 0 {
            return Err(format!(
                "connection closed after {} bytes without a complete response",
                buf.len()
            ));
        }
        buf.extend_from_slice(&chunk[..read]);
        let text = String::from_utf8_lossy(&buf).to_string();
        let Some(head_end) = text.find("\r\n\r\n") else {
            continue;
        };
        let length: usize = text[..head_end]
            .lines()
            .find_map(|line| {
                let (name, value) = line.split_once(':')?;
                name.eq_ignore_ascii_case("content-length")
                    .then(|| value.trim().parse().ok())
                    .flatten()
            })
            .ok_or_else(|| format!("no content-length in response head: {}", &text[..head_end]))?;
        if buf.len() >= head_end + 4 + length {
            return Ok(text);
        }
    }
}

#[tokio::test]
async fn keepalive_connections_survive_a_rebuild_and_swap_storm() {
    let dir = tempfile::tempdir().unwrap();
    fixture(dir.path());
    let state = vaultspec_api::app::build_state(dir.path().to_path_buf());
    let (addr, server) = serve_state(state.clone()).await;
    let token = state.bearer.clone();

    // The watcher's work, driven directly and continuously: rebuild the scope's
    // graph, commit it (diff + clock advance + broadcast + swap + generation
    // bump), and warm the per-generation projections.
    let stop_churn = Arc::new(AtomicBool::new(false));
    let swaps = Arc::new(AtomicU64::new(0));
    let churn = {
        let cell = state.active_cell();
        let stop_churn = stop_churn.clone();
        let swaps = swaps.clone();
        tokio::task::spawn_blocking(move || {
            while !stop_churn.load(Ordering::Relaxed) {
                cell.rebuild_and_swap().expect("rebuild the fixture scope");
                cell.warm_projections();
                swaps.fetch_add(1, Ordering::Relaxed);
            }
        })
    };

    let mut clients = Vec::new();
    for _ in 0..8 {
        let token = token.clone();
        clients.push(tokio::spawn(async move {
            let mut stream = TcpStream::connect(addr).await.unwrap();
            let mut served = 0u32;
            for _ in 0..60 {
                let request = format!(
                    "GET /status HTTP/1.1\r\nHost: 127.0.0.1\r\n\
                     Authorization: Bearer {token}\r\nConnection: keep-alive\r\n\r\n"
                );
                stream
                    .write_all(request.as_bytes())
                    .await
                    .map_err(|e| format!("write failed after {served} responses: {e}"))?;
                let response = read_response(&mut stream)
                    .await
                    .map_err(|e| format!("after {served} responses on this connection: {e}"))?;
                if !response.starts_with("HTTP/1.1 200") {
                    return Err(format!(
                        "unexpected status after {served} responses: {}",
                        response.lines().next().unwrap_or_default()
                    ));
                }
                served += 1;
            }
            Ok::<u32, String>(served)
        }));
    }

    let mut failures = Vec::new();
    let mut responses = 0u32;
    for client in clients {
        match client.await.unwrap() {
            Ok(served) => responses += served,
            Err(e) => failures.push(e),
        }
    }
    stop_churn.store(true, Ordering::Relaxed);
    churn.await.unwrap();

    assert!(
        failures.is_empty(),
        "rebuild-and-swap churn dropped live connections: {failures:?}"
    );
    assert_eq!(responses, 8 * 60, "every request must be answered in full");
    assert!(
        swaps.load(Ordering::Relaxed) > 0,
        "the storm must have committed at least one swap under the load"
    );

    state.shutdown.signal();
    tokio::time::timeout(Duration::from_secs(10), server)
        .await
        .expect("the server drains after the load")
        .unwrap();
}

#[tokio::test]
async fn a_graceful_stop_drains_an_open_live_stream() {
    let dir = tempfile::tempdir().unwrap();
    fixture(dir.path());
    let state = vaultspec_api::app::build_state(dir.path().to_path_buf());
    let (addr, server) = serve_state(state.clone()).await;
    let token = state.bearer.clone();

    // An open, endless SSE body — exactly what a live dashboard (and the live
    // frontend suite) holds while it works.
    let mut stream = TcpStream::connect(addr).await.unwrap();
    stream
        .write_all(
            format!(
                "GET /stream HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {token}\r\n\r\n"
            )
            .as_bytes(),
        )
        .await
        .unwrap();
    let mut head = [0u8; 512];
    let read = tokio::time::timeout(Duration::from_secs(10), stream.read(&mut head))
        .await
        .expect("the stream answers its handshake")
        .unwrap();
    let head = String::from_utf8_lossy(&head[..read]).to_string();
    assert!(
        head.starts_with("HTTP/1.1 200"),
        "the live stream must be open before the stop: {head}"
    );

    let stopping = Instant::now();
    state.shutdown.signal();

    // The stop must converge on its own. A stop that hangs here is the defect:
    // the caller's bounded wait expires and escalates to a kill, resetting every
    // connection still attached.
    tokio::time::timeout(Duration::from_secs(5), server)
        .await
        .expect("the stop drains with a live stream open")
        .unwrap();

    // ...and the stream's body ended CLEANLY: the chunked terminator, not a
    // truncated body cut off by a reset connection.
    let mut tail = Vec::new();
    tokio::time::timeout(Duration::from_secs(5), stream.read_to_end(&mut tail))
        .await
        .expect("the stream body ends within the drain")
        .expect("the stream body ends without a transport error");
    let tail = String::from_utf8_lossy(&tail).to_string();
    assert!(
        tail.ends_with("0\r\n\r\n"),
        "the live body must terminate cleanly on the stop, got tail: {tail:?}"
    );
    assert!(
        stopping.elapsed() < Duration::from_secs(5),
        "the drain must finish well inside a caller's stop wait"
    );
}
