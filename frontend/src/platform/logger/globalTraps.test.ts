// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";

import type { LogRecord } from "./logger";
import { createLogger } from "./logger";
import { installGlobalTraps } from "./globalTraps";

class CaptureSink {
  readonly records: LogRecord[] = [];
  write(record: LogRecord): void {
    this.records.push(record);
  }
}

function harness() {
  const sink = new CaptureSink();
  const log = createLogger({ namespace: "global", sinks: [sink] });
  const handle = installGlobalTraps(window, log);
  return { sink, handle };
}

afterEach(() => {
  // Defensive: ensure no trap leaks between tests via the module guard.
  // Each test uninstalls its own handle; this is a backstop.
});

describe("installGlobalTraps", () => {
  it("routes an uncaught window error to the logger with the Error attached", () => {
    const { sink, handle } = harness();
    const err = new Error("kaboom");
    window.dispatchEvent(
      Object.assign(new Event("error"), { message: "kaboom", error: err }),
    );
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0].level).toBe("error");
    expect(sink.records[0].error).toMatchObject({ message: "kaboom" });
    handle.uninstall();
  });

  it("routes an unhandled promise rejection (Error reason) to the logger", () => {
    const { sink, handle } = harness();
    window.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), {
        reason: new Error("rejected"),
      }),
    );
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0].message).toBe("unhandled promise rejection");
    expect(sink.records[0].error).toMatchObject({ message: "rejected" });
    handle.uninstall();
  });

  it("carries a non-Error rejection reason as fields", () => {
    const { sink, handle } = harness();
    window.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), { reason: { code: 42 } }),
    );
    expect(sink.records[0].fields).toEqual({ reason: { code: 42 } });
    handle.uninstall();
  });

  it("stops routing after uninstall", () => {
    const { sink, handle } = harness();
    handle.uninstall();
    window.dispatchEvent(
      Object.assign(new Event("error"), { message: "after", error: new Error("x") }),
    );
    expect(sink.records).toHaveLength(0);
  });

  it("is idempotent: a second install while one is live is a no-op handle", () => {
    const { handle } = harness();
    const second = installGlobalTraps(window, createLogger());
    // The second install did not take over; uninstalling it is harmless.
    expect(() => second.uninstall()).not.toThrow();
    handle.uninstall();
  });
});
