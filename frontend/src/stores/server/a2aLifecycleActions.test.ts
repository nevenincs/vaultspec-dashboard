import { afterEach, describe, expect, it } from "vitest";

import { appDispatcher } from "../../platform/dispatch/middleware";
import { liveTransport } from "../../testing/liveClient";
import { engineClient } from "./engine";
import {
  A2A_LIFECYCLE_RUN_ACTION,
  dispatchA2aLifecycleRun,
  isA2aLifecycleRunPayload,
} from "./a2aLifecycleActions";

// The A2A lifecycle dispatch seam routed against the REAL engine
// `/a2a/lifecycle/*` plane (no mock — wire-contract). The one live capability
// exercised is `doctor`: a READ-ONLY op (engine `LifecycleOp::is_read_only`) that
// reports readiness without mutating the machine-global install, so it is safe to
// drive against the shared live serve — never a mutating op (install / remove /
// rollback) that would touch the real product home.

describe("a2a lifecycle dispatch seam", () => {
  afterEach(() => {
    engineClient.useTransport(liveTransport);
  });

  it("registers a handler for the a2a-lifecycle:run action on the app dispatcher", () => {
    expect(appDispatcher.hasHandler(A2A_LIFECYCLE_RUN_ACTION)).toBe(true);
  });

  it("accepts every closed, typed op and nothing else", () => {
    for (const op of [
      "install",
      "ensure",
      "start",
      "stop",
      "restart",
      "repair",
      "update",
      "rollback",
      "remove",
      "doctor",
    ]) {
      expect(isA2aLifecycleRunPayload({ op })).toBe(true);
    }
  });

  it("rejects malformed operations, client paths, free-form args, and implicit deletion", () => {
    // Not a record / empty / missing op.
    expect(isA2aLifecycleRunPayload(null)).toBe(false);
    expect(isA2aLifecycleRunPayload(undefined)).toBe(false);
    expect(isA2aLifecycleRunPayload({})).toBe(false);
    // A malformed / unknown op outside the closed set.
    expect(isA2aLifecycleRunPayload({ op: "delete-everything" })).toBe(false);
    expect(isA2aLifecycleRunPayload({ op: "purge" })).toBe(false);
    expect(isA2aLifecycleRunPayload({ op: 1 })).toBe(false);
    expect(isA2aLifecycleRunPayload({ op: "remove", extra: true })).toBe(false);
    // A smuggled client PATH field — the wire selects a semantic op, never a path.
    expect(isA2aLifecycleRunPayload({ op: "install", path: "/etc/passwd" })).toBe(
      false,
    );
    // A FREE-FORM argument beyond the closed op.
    expect(isA2aLifecycleRunPayload({ op: "start", args: ["--force"] })).toBe(false);
    // An IMPLICIT DATA-DELETION flag riding a remove — refused (remove is bounded;
    // the engine preserves data, and no client purge flag exists).
    expect(isA2aLifecycleRunPayload({ op: "remove", delete_data: true })).toBe(false);
    expect(isA2aLifecycleRunPayload({ op: "remove", purge: true })).toBe(false);
  });

  it("rejects a malformed payload BEFORE it reaches transport", () => {
    const calls: string[] = [];
    engineClient.useTransport((input, init) => {
      if (String(input).includes("/a2a/lifecycle/")) calls.push(String(input));
      return liveTransport(input, init);
    });

    expect(() => dispatchA2aLifecycleRun({ op: "delete-everything" } as never)).toThrow(
      "a2a-lifecycle:run dispatched without a valid lifecycle body",
    );
    expect(() =>
      dispatchA2aLifecycleRun({ op: "remove", delete_data: true } as never),
    ).toThrow("a2a-lifecycle:run dispatched without a valid lifecycle body");
    expect(() =>
      appDispatcher.dispatch({ type: A2A_LIFECYCLE_RUN_ACTION, payload: null }),
    ).toThrow("a2a-lifecycle:run dispatched without a valid lifecycle body");

    expect(calls).toEqual([]);
  });

  it("routes a doctor run through the seam to the real /a2a/lifecycle/run broker", async () => {
    const calls: string[] = [];
    engineClient.useTransport((input, init) => {
      if (String(input).includes("/a2a/lifecycle/")) calls.push(String(input));
      return liveTransport(input, init);
    });

    const result = await dispatchA2aLifecycleRun({ op: "doctor" });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/a2a/lifecycle/run");
    expect(result.job.id.length).toBeGreaterThan(0);
    expect(result.job.op).toBe("doctor");
    expect(["running", "succeeded", "failed"]).toContain(result.job.state);
    expect(typeof result.attached).toBe("boolean");
  });
});
