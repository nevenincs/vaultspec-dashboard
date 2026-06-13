import { describe, expect, it } from "vitest";

import type { LogRecord } from "./logger";
import { createLogger } from "./logger";
import {
  WORKER_LOG_TAG,
  isWorkerLogEnvelope,
  postWorkerLog,
  type WorkerLogEnvelope,
} from "./workerBridge";

describe("postWorkerLog", () => {
  it("posts a tagged envelope carrying a structured record", () => {
    let sent: WorkerLogEnvelope | null = null;
    postWorkerLog(
      (m) => {
        sent = m;
      },
      "scene.fa2-worker",
      "error",
      "duplicate edge id in keyframe: e1",
    );
    expect(sent).not.toBeNull();
    const envelope = sent as unknown as WorkerLogEnvelope;
    expect(envelope.tag).toBe(WORKER_LOG_TAG);
    expect(envelope.record).toMatchObject({
      level: "error",
      namespace: "scene.fa2-worker",
      message: "duplicate edge id in keyframe: e1",
    });
  });

  it("omits empty fields", () => {
    let sent: WorkerLogEnvelope | null = null;
    postWorkerLog((m) => (sent = m), "scene", "warn", "x", {});
    expect((sent as unknown as WorkerLogEnvelope).record.fields).toBeUndefined();
  });
});

describe("isWorkerLogEnvelope", () => {
  it("accepts a real envelope and rejects layout/other messages", () => {
    const env: WorkerLogEnvelope = {
      tag: WORKER_LOG_TAG,
      record: { ts: 1, level: "info", namespace: "n", message: "m" },
    };
    expect(isWorkerLogEnvelope(env)).toBe(true);
    expect(isWorkerLogEnvelope({ kind: "positions", ids: [], coords: [] })).toBe(false);
    expect(isWorkerLogEnvelope(null)).toBe(false);
    expect(isWorkerLogEnvelope("string")).toBe(false);
    expect(isWorkerLogEnvelope({ tag: WORKER_LOG_TAG })).toBe(false);
  });
});

describe("worker -> main round trip", () => {
  it("an envelope posted in the worker re-emits through the main logger", () => {
    const records: LogRecord[] = [];
    const log = createLogger({ sinks: [{ write: (r) => records.push(r) }] });

    // Worker side posts; the channel is just a function here.
    let channel: WorkerLogEnvelope | null = null;
    postWorkerLog((m) => (channel = m), "scene.fa2-worker", "error", "boom");

    // Main side receives and ingests if it is a log envelope.
    const data: unknown = channel;
    if (isWorkerLogEnvelope(data)) log.ingest(data.record);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      level: "error",
      namespace: "scene.fa2-worker",
      message: "boom",
    });
  });
});
