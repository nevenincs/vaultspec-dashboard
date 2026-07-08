import { afterEach, describe, expect, it, vi } from "vitest";

import type { LogRecord } from "../logger/logger";
import { logger } from "../logger/logger";
import { Dispatcher } from "./dispatch";
import {
  createAppDispatcher,
  createConfirmGuard,
  isArmedResult,
  loggingMiddleware,
  traceMiddleware,
} from "./middleware";

function captureLogs(): { records: LogRecord[]; detach: () => void } {
  const records: LogRecord[] = [];
  const sink = { write: (r: LogRecord) => records.push(r) };
  logger.addSink(sink);
  return { records, detach: () => logger.removeSink(sink) };
}

describe("loggingMiddleware", () => {
  it("logs the dispatched action at debug", () => {
    const cap = captureLogs();
    const d = new Dispatcher();
    d.use(loggingMiddleware);
    d.register("save", () => "done");
    d.dispatch({ type: "save" });
    expect(cap.records.some((r) => r.message.includes("dispatch save"))).toBe(true);
    cap.detach();
  });

  it("logs and re-throws a handler failure (never swallows)", () => {
    const cap = captureLogs();
    const d = new Dispatcher();
    d.use(loggingMiddleware);
    d.register("boom", () => {
      throw new Error("handler exploded");
    });
    expect(() => d.dispatch({ type: "boom" })).toThrowError("handler exploded");
    const err = cap.records.find((r) => r.level === "error");
    expect(err?.message).toContain('action "boom" failed');
    expect(err?.error).toMatchObject({ message: "handler exploded" });
    cap.detach();
  });

  it("logs and re-rejects an ASYNC handler failure (KAR-007)", async () => {
    const cap = captureLogs();
    const d = new Dispatcher();
    d.use(loggingMiddleware);
    d.register("async-boom", () => Promise.reject(new Error("async exploded")));
    await expect(
      d.dispatch({ type: "async-boom" }) as Promise<unknown>,
    ).rejects.toThrowError("async exploded");
    const err = cap.records.find((r) => r.level === "error");
    expect(err?.message).toContain('action "async-boom" failed');
    expect(err?.error).toMatchObject({ message: "async exploded" });
    cap.detach();
  });

  it("passes an async handler's resolution through unchanged", async () => {
    const d = new Dispatcher();
    d.use(loggingMiddleware);
    d.register("async-ok", () => Promise.resolve("done"));
    await expect(d.dispatch({ type: "async-ok" }) as Promise<unknown>).resolves.toBe(
      "done",
    );
  });
});

describe("traceMiddleware", () => {
  it("stamps a monotonically increasing trace id and a timestamp", () => {
    const d = new Dispatcher();
    const seen: number[] = [];
    d.use(traceMiddleware);
    d.register("t", (a) => {
      seen.push(a.meta?.traceId as number);
      expect(typeof a.meta?.ts).toBe("number");
    });
    d.dispatch({ type: "t" });
    d.dispatch({ type: "t" });
    expect(seen[1]).toBeGreaterThan(seen[0]);
  });
});

describe("createConfirmGuard (arm-to-confirm)", () => {
  it("arms on first dispatch and fires on the second", () => {
    const guard = createConfirmGuard();
    const d = new Dispatcher();
    d.use(guard.middleware);
    const fired = vi.fn(() => "fired");
    d.register("danger", fired);

    const first = d.dispatch({ type: "danger", meta: { guard: "confirm" } });
    expect(isArmedResult(first)).toBe(true);
    expect(fired).not.toHaveBeenCalled();
    expect(guard.isArmed("danger")).toBe(true);

    const second = d.dispatch({ type: "danger", meta: { guard: "confirm" } });
    expect(second).toBe("fired");
    expect(fired).toHaveBeenCalledTimes(1);
    expect(guard.isArmed("danger")).toBe(false);
  });

  it("passes non-guarded actions straight through", () => {
    const guard = createConfirmGuard();
    const d = new Dispatcher();
    d.use(guard.middleware);
    const fired = vi.fn(() => "ok");
    d.register("safe", fired);
    expect(d.dispatch({ type: "safe" })).toBe("ok");
    expect(fired).toHaveBeenCalledTimes(1);
  });

  it("reset() disarms everything", () => {
    const guard = createConfirmGuard();
    const d = new Dispatcher();
    d.use(guard.middleware);
    d.register("danger", () => "fired");
    d.dispatch({ type: "danger", meta: { guard: "confirm" } });
    guard.reset();
    expect(guard.isArmed("danger")).toBe(false);
  });
});

describe("createAppDispatcher", () => {
  afterEach(() => vi.restoreAllMocks());

  it("wires trace + logging + guard: a guarded action arms then fires", () => {
    const guard = createConfirmGuard();
    const d = createAppDispatcher(guard);
    const fired = vi.fn(() => "fired");
    d.register("danger", fired);
    expect(
      isArmedResult(d.dispatch({ type: "danger", meta: { guard: "confirm" } })),
    ).toBe(true);
    expect(d.dispatch({ type: "danger", meta: { guard: "confirm" } })).toBe("fired");
  });
});
