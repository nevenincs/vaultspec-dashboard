import { describe, expect, it } from "vitest";

import { adaptRunRecord, adaptSessionRecord } from "./wireTypes";

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
