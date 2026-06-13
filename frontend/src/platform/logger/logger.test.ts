import { describe, expect, it } from "vitest";

import type { LogRecord } from "./logger";
import {
  ConsoleSink,
  Logger,
  RingBufferSink,
  createLogger,
  serializeError,
} from "./logger";

/** A sink that records everything it is handed, for assertions. */
class CaptureSink {
  readonly records: LogRecord[] = [];
  write(record: LogRecord): void {
    this.records.push(record);
  }
}

describe("Logger level gating", () => {
  it("drops records below the min level and keeps those at or above", () => {
    const sink = new CaptureSink();
    const log = createLogger({ minLevel: "warn", sinks: [sink] });
    log.debug("noise");
    log.info("also noise");
    log.warn("kept");
    log.error("kept too");
    expect(sink.records.map((r) => r.level)).toEqual(["warn", "error"]);
  });

  it("re-gates when the min level is lowered at runtime", () => {
    const sink = new CaptureSink();
    const log = createLogger({ minLevel: "error", sinks: [sink] });
    log.info("dropped");
    log.setMinLevel("trace");
    log.info("now kept");
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0].message).toBe("now kept");
  });
});

describe("Logger namespacing", () => {
  it("dot-joins child namespaces and shares the parent's sinks", () => {
    const sink = new CaptureSink();
    const root = createLogger({ namespace: "platform", sinks: [sink] });
    const child = root.child("stores").child("engine");
    child.info("hi");
    expect(sink.records[0].namespace).toBe("platform.stores.engine");
  });

  it("an empty root namespace produces an unprefixed child", () => {
    const sink = new CaptureSink();
    const root = createLogger({ sinks: [sink] });
    root.child("scene").info("hi");
    expect(sink.records[0].namespace).toBe("scene");
  });
});

describe("Logger fields and errors", () => {
  it("attaches non-empty fields and omits empty ones", () => {
    const sink = new CaptureSink();
    const log = createLogger({ sinks: [sink] });
    log.info("with", { a: 1 });
    log.info("without", {});
    expect(sink.records[0].fields).toEqual({ a: 1 });
    expect(sink.records[1].fields).toBeUndefined();
  });

  it("serializes a thrown Error passed to error()", () => {
    const sink = new CaptureSink();
    const log = createLogger({ sinks: [sink] });
    log.error("boom", new TypeError("bad cast"));
    expect(sink.records[0].error).toMatchObject({
      name: "TypeError",
      message: "bad cast",
    });
    expect(sink.records[0].fields).toBeUndefined();
  });

  it("treats a non-Error second arg to error() as fields", () => {
    const sink = new CaptureSink();
    const log = createLogger({ sinks: [sink] });
    log.error("failed", { status: 503 });
    expect(sink.records[0].fields).toEqual({ status: 503 });
    expect(sink.records[0].error).toBeUndefined();
  });
});

describe("RingBufferSink", () => {
  it("evicts oldest records past capacity, keeping the newest", () => {
    const ring = new RingBufferSink(3);
    const log = createLogger({ sinks: [ring] });
    for (let i = 0; i < 5; i += 1) log.info(`m${i}`);
    expect(ring.size).toBe(3);
    expect(ring.snapshot().map((r) => r.message)).toEqual(["m2", "m3", "m4"]);
  });

  it("snapshot returns a copy that does not mutate the buffer", () => {
    const ring = new RingBufferSink(10);
    const log = createLogger({ sinks: [ring] });
    log.info("one");
    const snap = ring.snapshot();
    snap.push({} as LogRecord);
    expect(ring.size).toBe(1);
  });
});

describe("Logger sink fan-out and isolation", () => {
  it("delivers to every sink and a throwing sink never starves the others", () => {
    const good = new CaptureSink();
    const bad = {
      write() {
        throw new Error("sink is broken");
      },
    };
    const log = createLogger({ sinks: [bad, good] });
    expect(() => log.info("survives")).not.toThrow();
    expect(good.records).toHaveLength(1);
  });

  it("ingest re-emits a foreign record under its own namespace and level", () => {
    const sink = new CaptureSink();
    const log = createLogger({ minLevel: "info", sinks: [sink] });
    log.ingest({
      ts: 1,
      level: "error",
      namespace: "scene.fa2-worker",
      message: "duplicate edge",
    });
    log.ingest({ ts: 2, level: "debug", namespace: "scene", message: "dropped" });
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({
      level: "error",
      namespace: "scene.fa2-worker",
    });
  });
});

describe("serializeError", () => {
  it("wraps non-Error throwables without losing them", () => {
    expect(serializeError("just a string")).toEqual({
      name: "NonError",
      message: "just a string",
    });
  });
});

describe("ConsoleSink", () => {
  it("constructs and accepts a record without throwing", () => {
    const sink = new ConsoleSink();
    expect(() =>
      sink.write({ ts: 0, level: "info", namespace: "t", message: "ok" }),
    ).not.toThrow();
  });
});

describe("Logger class direct construction", () => {
  it("is exported for typed consumers", () => {
    expect(typeof Logger).toBe("function");
  });
});
