import { describe, expect, it } from "vitest";

import {
  adaptInterrupt,
  adaptInterruptListPage,
  adaptOperationMode,
  adaptRunRecord,
  adaptSessionRecord,
  adaptSessionSnapshot,
} from "./wireTypes";

describe("agent lifecycle status adapters", () => {
  it("preserves served bounded session and run states", () => {
    expect(adaptSessionRecord({ status: "active" }).status).toBe("active");
    expect(adaptSessionRecord({ status: "cancelled" }).status).toBe("cancelled");
    expect(adaptRunRecord({ status: "cancel_requested" }).status).toBe(
      "cancel_requested",
    );
    expect(adaptRunRecord({ status: "completed" }).status).toBe("completed");
  });

  it("fails closed for missing or unknown lifecycle states", () => {
    expect(adaptSessionRecord({ status: "future_state" }).status).toBe("closed");
    expect(adaptSessionRecord({}).status).toBe("closed");
    expect(adaptRunRecord({ status: "future_state", active: true })).toMatchObject({
      status: "failed",
      active: false,
    });
    expect(adaptRunRecord({ active: true })).toMatchObject({
      status: "failed",
      active: false,
    });
  });
});

describe("queued_turn_ids adapter (S37/S39)", () => {
  it("reads the served queue state, defaulting to empty", () => {
    expect(
      adaptSessionSnapshot({ queued_turn_ids: ["turn:a", "turn:b", 42] })
        .queued_turn_ids,
    ).toEqual(["turn:a", "turn:b"]);
    expect(adaptSessionSnapshot({}).queued_turn_ids).toEqual([]);
  });
});

describe("interrupt-list adapters (S41)", () => {
  it("projects a typed tool_permission decision", () => {
    const interrupt = adaptInterrupt({
      interrupt_id: "interrupt:1",
      run_id: "run:1",
      kind: "tool_permission",
      tool_call_id: "tool:1",
      resume_state: "resolved",
      decision: { kind: "tool_permission", decision: "approve", comment: "ok" },
      created_at_ms: 10,
      updated_at_ms: 20,
    });
    expect(interrupt.resume_state).toBe("resolved");
    expect(interrupt.decision).toEqual({
      kind: "tool_permission",
      decision: "approve",
      comment: "ok",
    });
  });

  it("projects a typed steer decision and degrades an unknown projection", () => {
    expect(
      adaptInterrupt({ decision: { kind: "steer", prompt: "keep going" } }).decision,
    ).toEqual({ kind: "steer", prompt: "keep going" });
    expect(adaptInterrupt({ decision: { kind: "some_future_kind" } }).decision).toEqual(
      { kind: "decision_unreadable" },
    );
  });

  it("flags a pending interrupt with no decision", () => {
    const interrupt = adaptInterrupt({ resume_state: "pending", decision: null });
    expect(interrupt.resume_state).toBe("pending");
    expect(interrupt.decision).toBeNull();
  });

  it("adapts a bounded interrupt list page with its truncation marker", () => {
    const page = adaptInterruptListPage({
      items: [{ interrupt_id: "i1", resume_state: "pending" }],
      cap: 50,
      truncated: true,
      tiers: {},
    });
    expect(page.items).toHaveLength(1);
    expect(page.cap).toBe(50);
    expect(page.truncated).toBe(true);
  });
});

describe("operation-mode adapter (S43)", () => {
  it("passes the served mode token through for the autonomy control", () => {
    const mode = adaptOperationMode({
      scope_id: "scope:x",
      mode: "apply_automatically",
      policy_id: "policy:1",
      policy_version: 3,
      updated_at_ms: 99,
      tiers: {},
    });
    expect(mode.mode).toBe("apply_automatically");
    expect(mode.policy_version).toBe(3);
  });
});
