use super::*;
use std::io::Cursor;

#[test]
fn ring_assigns_monotonic_seq_and_evicts_at_cap() {
    let relay = RunRelay::new();
    for i in 0..(RELAY_RING_CAP + 10) {
        let seq = relay.push("progress".to_string(), json!({ "i": i }));
        assert_eq!(seq, i as u64);
    }
    let ring = relay.ring.lock().unwrap();
    assert_eq!(
        ring.frames.len(),
        RELAY_RING_CAP,
        "ring is bounded at the cap"
    );
    // The oldest 10 frames were evicted; the front is seq 10.
    assert_eq!(ring.frames.front().unwrap().seq, 10);
    assert_eq!(ring.frames.back().unwrap().seq, (RELAY_RING_CAP + 9) as u64);
}

#[test]
fn snapshot_since_replays_after_and_gaps_on_eviction() {
    let relay = RunRelay::new();
    for i in 0..5 {
        relay.push("progress".to_string(), json!({ "i": i }));
    }
    // Resume after seq 2 → frames 3 and 4, no gap.
    let (frames, gap) = relay.snapshot_since(Some(2));
    assert!(gap.is_none());
    assert_eq!(frames.iter().map(|f| f.seq).collect::<Vec<_>>(), vec![3, 4]);

    // No since → the whole ring, no gap.
    let (frames, gap) = relay.snapshot_since(None);
    assert!(gap.is_none());
    assert_eq!(frames.len(), 5);

    // A hostile since at u64::MAX saturates → no gap, no frames.
    let (frames, gap) = relay.snapshot_since(Some(u64::MAX));
    assert!(gap.is_none());
    assert!(frames.is_empty());
}

#[test]
fn snapshot_since_emits_a_gap_when_the_resume_point_was_evicted() {
    let relay = RunRelay::new();
    // Overflow the ring so early seqs are evicted.
    for i in 0..(RELAY_RING_CAP + 50) {
        relay.push("progress".to_string(), json!({ "i": i }));
    }
    // Resume from seq 3, long evicted: an explicit gap at the oldest buffered seq.
    let (frames, gap) = relay.snapshot_since(Some(3));
    assert!(frames.is_empty());
    assert_eq!(gap, Some(50), "gap reports the oldest still-buffered seq");
}

#[test]
fn replay_and_global_payload_bytes_remain_within_strict_budgets() {
    let global = Arc::new(AtomicUsize::new(0));
    let relay = RunRelay::new_with_budgets(global.clone(), 1024, 2048, 1536);
    let mut receiver = relay.tx.subscribe();

    relay.push("progress".to_string(), json!({ "payload": "shared" }));
    let broadcast = receiver.try_recv().unwrap();
    let resident = relay.ring.lock().unwrap().frames.back().unwrap().clone();
    assert!(
        Arc::ptr_eq(&resident, &broadcast),
        "ring and broadcast must share one immutable payload"
    );
    let second = RunRelay::new_with_budgets(global.clone(), 1024, 2048, 1536);
    second.push("progress".to_string(), json!({ "payload": "second" }));

    for i in 0..100 {
        let target = if i % 2 == 0 { &relay } else { &second };
        target.push(
            "progress".to_string(),
            json!({ "i": i, "payload": "x".repeat(384) }),
        );
    }

    let ring = relay.ring.lock().unwrap();
    assert!(ring.bytes <= 1024, "replay bytes: {}", ring.bytes);
    assert!(
        relay.retained_bytes.load(Ordering::SeqCst) <= 2048,
        "per-relay retained bytes escaped its ceiling"
    );
    assert!(
        global.load(Ordering::SeqCst) <= 1536,
        "global retained bytes escaped the configured test ceiling"
    );
    assert!(
        ring.frames.len() < 100,
        "byte eviction must precede count cap"
    );
    drop(ring);
    drop(receiver);
    drop(broadcast);
    drop(resident);
    let second_ring = second.ring.lock().unwrap();
    assert!(!second_ring.frames.is_empty());
    assert!(second_ring.bytes <= 1024);
    assert!(second.retained_bytes.load(Ordering::SeqCst) <= 2048);
    assert!(global.load(Ordering::SeqCst) <= 1536);
}

#[test]
fn exhausted_control_reserve_records_interior_and_terminal_gaps() {
    let global = Arc::new(AtomicUsize::new(0));
    let relay = RunRelay::new_with_budgets(global.clone(), 4096, 4096, 4096);
    relay.push("progress".to_string(), json!({ "step": 0 }));
    let held_relay = relay.retained_bytes.load(Ordering::SeqCst);
    let held_global = global.load(Ordering::SeqCst);

    // Deterministically model other retained broadcast references consuming the
    // remaining hard budget. Both the normal payload and control reserve fail.
    relay.retained_bytes.store(4096, Ordering::SeqCst);
    global.store(4096, Ordering::SeqCst);
    assert_eq!(relay.push("progress".to_string(), json!({ "step": 1 })), 1);
    relay.retained_bytes.store(held_relay, Ordering::SeqCst);
    global.store(held_global, Ordering::SeqCst);
    relay.push("progress".to_string(), json!({ "step": 2 }));
    let after_recovery_relay = relay.retained_bytes.load(Ordering::SeqCst);
    let after_recovery_global = global.load(Ordering::SeqCst);

    let (frames, gap) = relay.snapshot_since(Some(0));
    assert!(
        frames.is_empty(),
        "an interior hole must never replay around itself"
    );
    assert_eq!(gap, Some(1));

    relay.retained_bytes.store(4096, Ordering::SeqCst);
    global.store(4096, Ordering::SeqCst);
    relay.push(
        "thread_terminal".to_string(),
        json!({ "status": "completed" }),
    );
    relay
        .retained_bytes
        .store(after_recovery_relay, Ordering::SeqCst);
    global.store(after_recovery_global, Ordering::SeqCst);
    assert!(
        relay.is_terminal(),
        "authoritative terminal recovery must be triggered"
    );
    let (_, terminal_gap) = relay.snapshot_since(Some(2));
    assert_eq!(terminal_gap, Some(3));
    assert!(relay.retained_bytes.load(Ordering::SeqCst) <= 4096);
    assert!(global.load(Ordering::SeqCst) <= 4096);
}

#[test]
fn replay_snapshot_clones_only_shared_frame_handles() {
    let relay = RunRelay::new();
    relay.push(
        "progress".to_string(),
        json!({ "payload": "x".repeat(64 * 1024) }),
    );
    let resident = relay.ring.lock().unwrap().frames[0].clone();
    let before = Arc::strong_count(&resident);
    let snapshot = relay.snapshot_since(None).0;
    assert_eq!(snapshot.len(), 1);
    assert!(Arc::ptr_eq(&resident, &snapshot[0]));
    assert_eq!(Arc::strong_count(&resident), before + 1);
}

#[test]
fn producer_exit_restarts_for_a_reconnect_and_churn_frees_capacity() {
    let mut registry = RelayRegistry::new();
    let relay = registry.get_or_insert("reopen").unwrap();
    assert!(relay.claim_producer());
    let receiver = relay.tx.subscribe();

    assert!(
        registry.reader_finished("reopen", &relay, true),
        "a subscriber arriving in the exit race requires a replacement"
    );
    assert!(
        relay.claim_producer(),
        "the replacement can claim ownership"
    );
    drop(receiver);
    assert!(!registry.reader_finished("reopen", &relay, true));
    assert!(!registry.entries.contains_key("reopen"));

    let degraded = registry.get_or_insert("degraded").unwrap();
    assert!(degraded.claim_producer());
    let degraded_receiver = degraded.tx.subscribe();
    assert!(
        !registry.reader_finished("degraded", &degraded, false),
        "a degraded relay retires so the browser retry owns reconnection"
    );
    assert!(!registry.entries.contains_key("degraded"));
    drop(degraded_receiver);

    for i in 0..MAX_CONCURRENT_RELAYS {
        let resident = registry.get_or_insert(&format!("run-{i}")).unwrap();
        resident.producer_running.store(true, Ordering::SeqCst);
    }
    assert!(registry.get_or_insert("run-at-cap").is_none());
    for resident in registry.entries.values() {
        resident.producer_running.store(false, Ordering::SeqCst);
    }
    assert!(
        registry.get_or_insert("run-65").is_some(),
        "producerless non-terminal tombstones must not hold 64 slots"
    );
    assert_eq!(registry.entries.len(), 1);
}

#[test]
fn frame_event_annotates_seq_into_the_data_for_client_dedup() {
    // The seq must ride the DATA (not only the SSE id) so the fetch-stream
    // client can dedup a reconnect replay; upstream fields stay intact.
    let relay = RunRelay::new();
    relay.seq.store(7, Ordering::SeqCst);
    relay.push(
        "progress".to_string(),
        json!({ "phase": "research", "type": "progress" }),
    );
    let frame = relay.snapshot_since(None).0.pop().unwrap();
    let rendered = format!("{:?}", frame_event(&frame));
    assert!(rendered.contains("\\\"seq\\\":7") || rendered.contains("seq"));
    assert!(rendered.contains("research"), "upstream fields preserved");
}

#[test]
fn lagged_live_item_becomes_a_gap_not_a_silent_drop() {
    let mapped = map_live_frame(Err(BroadcastStreamRecvError::Lagged(9)), None)
        .expect("lag must yield an item")
        .expect("infallible");
    let rendered = format!("{mapped:?}");
    assert!(rendered.contains("gap"), "lag → gap event: {rendered}");
    assert!(rendered.contains('9'), "the gap reports the dropped count");
}

#[test]
fn dedup_threshold_drops_already_replayed_frames() {
    // A live frame at/below the replayed threshold is a duplicate, dropped.
    let relay = RunRelay::new();
    relay.seq.store(2, Ordering::SeqCst);
    relay.push("progress".to_string(), json!({}));
    let dup = relay.snapshot_since(None).0.pop().unwrap();
    assert!(map_live_frame(Ok(dup), Some(2)).is_none());
    // A frame past the threshold passes through.
    relay.push("progress".to_string(), json!({}));
    let fresh = relay.snapshot_since(Some(2)).0.pop().unwrap();
    assert!(map_live_frame(Ok(fresh), Some(2)).is_some());
}

#[test]
fn sse_accumulator_extracts_frames_across_chunk_boundaries() {
    let mut acc = SseAccumulator::new();
    // A frame split across two byte pushes surfaces only once complete.
    assert!(
        acc.push_bytes(b"event: progress\ndata: {\"phase\":")
            .is_empty()
    );
    let out = acc.push_bytes(b"\"research\"}\n\n");
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].0, "progress");
    assert_eq!(out[0].1["phase"], "research");
}

#[test]
fn sse_accumulator_handles_crlf_and_multiple_frames() {
    let mut acc = SseAccumulator::new();
    let out =
        acc.push_bytes(b"event: a\r\ndata: {\"n\":1}\r\n\r\nevent: b\r\ndata: {\"n\":2}\r\n\r\n");
    assert_eq!(out.len(), 2);
    assert_eq!(out[0].0, "a");
    assert_eq!(out[0].1["n"], 1);
    assert_eq!(out[1].0, "b");
    assert_eq!(out[1].1["n"], 2);
}

#[test]
fn upstream_progress_dropped_sentinel_passes_through_unaltered() {
    // The upstream's oversized-frame sentinel is a small frame; it must relay
    // VERBATIM (event name + JSON), never re-wrapped or dropped.
    let mut acc = SseAccumulator::new();
    let sentinel = r#"{"api_version":"v1","type":"progress_dropped","reason":"frame_exceeds_cap","dropped_type":"agent_message"}"#;
    let out = acc.push_bytes(format!("event: progress_dropped\ndata: {sentinel}\n\n").as_bytes());
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].0, "progress_dropped");
    assert_eq!(out[0].1["type"], "progress_dropped");
    assert_eq!(out[0].1["reason"], "frame_exceeds_cap");
    assert_eq!(out[0].1["dropped_type"], "agent_message");
}

#[test]
fn frame_without_event_line_falls_back_to_payload_type() {
    let mut acc = SseAccumulator::new();
    let out = acc.push_bytes(b"data: {\"type\":\"heartbeat\",\"uptime\":3}\n\n");
    assert_eq!(out.len(), 1);
    assert_eq!(
        out[0].0, "heartbeat",
        "event name falls back to payload type"
    );
}

#[test]
fn an_oversized_frame_becomes_an_engine_drop_sentinel() {
    let huge = "x".repeat(MAX_RELAY_FRAME_BYTES + 1);
    let raw = format!("event: progress\ndata: {huge}");
    let (event, data) = parse_sse_frame(&raw).expect("oversized frame yields a sentinel");
    assert_eq!(event, "progress_dropped");
    assert_eq!(data["reason"], "relay_frame_exceeds_cap");
}

#[test]
fn delimiter_free_frame_is_drained_at_the_ceiling_then_recovers() {
    let mut acc = SseAccumulator::new();
    let fragment = vec![b'x'; 4096];
    for _ in 0..=(MAX_RELAY_FRAME_BYTES / fragment.len()) {
        assert!(acc.push_bytes(&fragment).is_empty());
        assert!(acc.buffered_bytes() <= MAX_RELAY_FRAME_BYTES);
    }
    assert_eq!(acc.buffered_bytes(), 0, "overflow switches to drain mode");

    let out = acc.push_bytes(b"\n\nevent: progress\ndata: {\"phase\":\"plan\"}\n\n");
    assert_eq!(out.len(), 2);
    assert_eq!(out[0].0, "progress_dropped");
    assert_eq!(out[0].1["reason"], "relay_frame_exceeds_cap");
    assert_eq!(out[1].0, "progress");
    assert_eq!(out[1].1["phase"], "plan");
}

#[test]
fn dense_tiny_frames_cap_each_push_and_reserve_one_drop_sentinel() {
    let mut acc = SseAccumulator::new();
    let body = "event: progress\ndata: {}\n\n".repeat(MAX_SSE_OUTPUTS_PER_PUSH + 100);
    assert!(body.len() < MAX_HTTP_CHUNK_BYTES);

    let out = acc.push_bytes(body.as_bytes());
    assert_eq!(out.len(), MAX_SSE_OUTPUTS_PER_PUSH);
    assert!(
        out[..MAX_SSE_OUTPUTS_PER_PUSH - 1]
            .iter()
            .all(|(event, _)| event == "progress")
    );
    assert_eq!(out.last().unwrap().0, "progress_dropped");
    assert_eq!(
        out.last().unwrap().1["reason"],
        "relay_push_output_exceeds_cap"
    );

    let restored = acc.push_bytes(b"event: progress\ndata: {\"next\":true}\n\n");
    assert_eq!(restored.len(), 1);
    assert_eq!(restored[0].1["next"], true);
}

#[test]
fn read_http_head_parses_status_and_chunked() {
    let raw = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n\
                   Transfer-Encoding: chunked\r\n\r\nbody-follows";
    let mut reader = Cursor::new(raw.as_bytes());
    let head = read_http_head(&mut reader).unwrap();
    assert_eq!(head.status, 200);
    assert!(head.chunked);

    let raw = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
    let mut reader = Cursor::new(raw.as_bytes());
    let head = read_http_head(&mut reader).unwrap();
    assert_eq!(head.status, 404);
    assert!(!head.chunked);
}

#[test]
fn http_head_rejects_oversized_lines_and_aggregate_headers() {
    let oversized_line = format!(
        "HTTP/1.1 200 OK\r\nX-Runaway: {}\r\n\r\n",
        "x".repeat(MAX_HTTP_HEADER_LINE_BYTES)
    );
    let error = read_http_head(&mut Cursor::new(oversized_line.into_bytes())).unwrap_err();
    assert!(error.to_string().contains("byte ceiling"));

    let header = format!("X-Bounded: {}\r\n", "x".repeat(1024));
    let aggregate = format!("HTTP/1.1 200 OK\r\n{}\r\n", header.repeat(40));
    let error = read_http_head(&mut Cursor::new(aggregate.into_bytes())).unwrap_err();
    assert!(error.to_string().contains("byte ceiling"));
}

#[test]
fn chunked_body_decoder_dechunks_and_ends_on_zero_chunk() {
    // Two well-formed chunks (each `<hex-size>\r\n<bytes>\r\n`) then the
    // terminating zero chunk. The decoder concatenates the chunk bodies and
    // stops at the zero chunk.
    let c1 = "event: a\n";
    let c2 = "data: 1\n\n";
    let raw = format!(
        "{:x}\r\n{c1}\r\n{:x}\r\n{c2}\r\n0\r\n\r\n",
        c1.len(),
        c2.len()
    );
    let mut reader = Cursor::new(raw.into_bytes());
    let mut decoder = BodyDecoder::new(true);
    let mut decoded = Vec::new();
    while let Some(chunk) = decoder.next_chunk(&mut reader).unwrap() {
        decoded.extend_from_slice(&chunk);
    }
    assert_eq!(String::from_utf8(decoded).unwrap(), "event: a\ndata: 1\n\n");
}

#[test]
fn chunk_decoder_rejects_declared_size_before_body_allocation_or_read() {
    let declaration = format!("{:x}\r\n", MAX_HTTP_CHUNK_BYTES + 1);
    let mut decoder = BodyDecoder::new(true);
    let error = decoder
        .next_chunk(&mut Cursor::new(declaration.into_bytes()))
        .unwrap_err();
    assert!(error.to_string().contains("declared HTTP chunk exceeds"));
}

#[test]
fn live_socket_rejects_endless_header_and_giant_chunk_declaration() {
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let server = std::thread::spawn(move || {
        let (mut header_socket, _) = listener.accept().unwrap();
        let mut request = [0u8; 1024];
        let _ = header_socket.read(&mut request);
        let response = format!(
            "HTTP/1.1 200 OK\r\nX-Runaway: {}",
            "x".repeat(MAX_HTTP_HEADER_LINE_BYTES + 1)
        );
        let _ = header_socket.write_all(response.as_bytes());
        drop(header_socket);

        let (mut chunk_socket, _) = listener.accept().unwrap();
        let _ = chunk_socket.read(&mut request);
        let response = format!(
            "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n{:x}\r\n",
            MAX_HTTP_CHUNK_BYTES + 1
        );
        chunk_socket.write_all(response.as_bytes()).unwrap();
    });

    let first = TcpStream::connect(("127.0.0.1", port)).unwrap();
    first
        .try_clone()
        .unwrap()
        .write_all(b"GET /stream HTTP/1.1\r\nHost: localhost\r\n\r\n")
        .unwrap();
    let error = read_http_head(&mut BufReader::new(first)).unwrap_err();
    assert!(error.to_string().contains("byte ceiling"));

    let second = TcpStream::connect(("127.0.0.1", port)).unwrap();
    second
        .try_clone()
        .unwrap()
        .write_all(b"GET /stream HTTP/1.1\r\nHost: localhost\r\n\r\n")
        .unwrap();
    let mut reader = BufReader::new(second);
    let head = read_http_head(&mut reader).unwrap();
    let error = BodyDecoder::new(head.chunked)
        .next_chunk(&mut reader)
        .unwrap_err();
    assert!(error.to_string().contains("declared HTTP chunk exceeds"));
    server.join().unwrap();
}

#[test]
fn pump_sse_over_a_chunked_body_yields_frames_and_stops_on_terminal() {
    // A full chunked HTTP body: two progress frames then a terminal frame.
    let body = "event: progress\ndata: {\"phase\":\"research\"}\n\n\
                    event: progress\ndata: {\"phase\":\"adr\"}\n\n\
                    event: thread_terminal\ndata: {\"status\":\"completed\"}\n\n";
    // One chunk carrying the whole body, then the zero terminator.
    let chunked = format!("{:x}\r\n{}\r\n0\r\n\r\n", body.len(), body);
    let mut reader = Cursor::new(chunked.into_bytes());
    let mut seen: Vec<(String, Value)> = Vec::new();
    let end = pump_sse(
        &mut reader,
        true,
        Instant::now() + Duration::from_secs(5),
        |event, data| {
            let terminal = event == "thread_terminal";
            seen.push((event, data));
            if terminal {
                PumpControl::Terminal
            } else {
                PumpControl::Continue
            }
        },
    )
    .unwrap();
    assert!(matches!(end, StreamEnd::Terminal));
    assert_eq!(seen.len(), 3);
    assert_eq!(seen[0].0, "progress");
    assert_eq!(seen[2].0, "thread_terminal");
    assert_eq!(seen[2].1["status"], "completed");
}

#[test]
fn run_id_validation_matches_the_pass_through_grammar() {
    assert!(run_id_is_valid("run_abc-123"));
    for bad in ["", "-x", "../escape", "run/x", "run id", &"a".repeat(129)] {
        assert!(!run_id_is_valid(bad), "`{bad}` must be rejected");
    }
}

#[test]
fn live_socket_relay_streams_chunked_sse_into_the_ring_with_replay_and_sentinel() {
    // A real TcpListener stands in for the a2a gateway's run-stream: a real
    // chunked `text/event-stream` response over a real socket, read by the real
    // BufReader pump into a real RunRelay. This is a LIVE loopback of the
    // streaming path end to end (the rag-client socket-test precedent); it does
    // NOT stand up the Python gateway (that cross-process live proof is the a2a
    // repo's own harness + the frontend e2e — see the report). It proves: the
    // chunked SSE decode, verbatim frame relay INCLUDING the upstream
    // `progress_dropped` sentinel unaltered, the terminal latch, and since-replay
    // off the resulting ring.
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};

    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let server = std::thread::spawn(move || {
        let (mut sock, _) = listener.accept().unwrap();
        // Drain the request head.
        let mut buf = [0u8; 1024];
        let _ = sock.read(&mut buf);
        // A chunked SSE body: a progress frame, the upstream oversized-frame
        // sentinel (must pass through VERBATIM), then the terminal frame.
        let body = "event: progress\ndata: {\"phase\":\"research\"}\n\n\
                        event: progress_dropped\ndata: {\"api_version\":\"v1\",\"type\":\"progress_dropped\",\"reason\":\"frame_exceeds_cap\",\"dropped_type\":\"agent_message\"}\n\n\
                        event: thread_terminal\ndata: {\"status\":\"completed\"}\n\n";
        let framed = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n{:x}\r\n{}\r\n0\r\n\r\n",
            body.len(),
            body
        );
        sock.write_all(framed.as_bytes()).unwrap();
    });

    let relay = RunRelay::new();
    let stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    let mut reader = BufReader::new(stream);
    // Write the GET so the server's read completes, then read the response.
    reader
        .get_ref()
        .try_clone()
        .unwrap()
        .write_all(b"GET /v1/runs/run-1/stream HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
        .unwrap();
    let head = read_http_head(&mut reader).unwrap();
    assert_eq!(head.status, 200);
    assert!(head.chunked);
    let end = pump_sse(
        &mut reader,
        head.chunked,
        Instant::now() + Duration::from_secs(5),
        |event, data| {
            let terminal = event == "thread_terminal";
            relay.push(event, data);
            if terminal {
                PumpControl::Terminal
            } else {
                PumpControl::Continue
            }
        },
    )
    .unwrap();
    assert!(matches!(end, StreamEnd::Terminal));
    assert!(relay.is_terminal(), "the terminal frame latched the relay");

    // Three frames in the ring at seq 0,1,2.
    {
        let ring = relay.ring.lock().unwrap();
        assert_eq!(ring.frames.len(), 3);
        assert_eq!(ring.frames[0].event.as_ref(), "progress");
        // The upstream sentinel relayed VERBATIM — event name + JSON untouched.
        assert_eq!(ring.frames[1].event.as_ref(), "progress_dropped");
        let sentinel: Value = serde_json::from_str(&ring.frames[1].data).unwrap();
        assert_eq!(sentinel["type"], "progress_dropped");
        assert_eq!(sentinel["dropped_type"], "agent_message");
        assert_eq!(ring.frames[2].event.as_ref(), "thread_terminal");
    }

    // since-replay off the resulting ring: resume after seq 0 → frames 1,2.
    let (frames, gap) = relay.snapshot_since(Some(0));
    assert!(gap.is_none());
    assert_eq!(frames.iter().map(|f| f.seq).collect::<Vec<_>>(), vec![1, 2]);

    server.join().unwrap();
}
