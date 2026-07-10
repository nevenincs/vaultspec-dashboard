import { afterEach, describe, expect, it } from "vitest";

import { appDispatcher } from "../../platform/dispatch/middleware";
import { liveTransport } from "../../testing/liveClient";
import { engineClient } from "./engine";
import {
  PROVISION_RUN_ACTION,
  dispatchProvisionRun,
  isProvisionRunPayload,
} from "./provisionActions";

// The provisioning dispatch seam routed against the REAL engine `/provision/*`
// broker (no mock). A `migrate` run against the fixture vault is the SAME safe
// live capability the engine's own `provision_run_is_job_shaped_and_pollable`
// test uses: the fixture has no pending migrations, so it settles as a genuine
// no-op (`unchanged`, empty items) rather than mutating the shared fixture.

describe("provisioning dispatch seam", () => {
  afterEach(() => {
    engineClient.useTransport(liveTransport);
  });

  it("registers a handler for the provision:run action on the app dispatcher", () => {
    expect(appDispatcher.hasHandler(PROVISION_RUN_ACTION)).toBe(true);
  });

  it("validates the run body's typed/bounded shape before it reaches transport", () => {
    expect(isProvisionRunPayload({ action: "migrate" })).toBe(true);
    expect(isProvisionRunPayload({ action: "install", provider: "all" })).toBe(true);
    expect(
      isProvisionRunPayload({ action: "acquire", tool: "core", upgrade: true }),
    ).toBe(true);
    expect(
      isProvisionRunPayload({
        action: "install",
        provider: "all",
        force: true,
        confirm: "confirm-force",
      }),
    ).toBe(true);
    expect(isProvisionRunPayload(null)).toBe(false);
    expect(isProvisionRunPayload({})).toBe(false);
    expect(isProvisionRunPayload({ action: "delete-everything" })).toBe(false);
    expect(isProvisionRunPayload({ action: "install", provider: "bogus" })).toBe(false);
    expect(isProvisionRunPayload({ action: "acquire", tool: "bogus" })).toBe(false);
    expect(isProvisionRunPayload({ action: "migrate", upgrade: "yes" })).toBe(false);
    expect(isProvisionRunPayload({ action: "migrate", force: "yes" })).toBe(false);
    expect(isProvisionRunPayload({ action: "migrate", confirm: 1 })).toBe(false);
    expect(isProvisionRunPayload({ action: "migrate", workspace: 1 })).toBe(false);
    expect(isProvisionRunPayload({ action: "migrate", worktree: 1 })).toBe(false);
  });

  it("rejects a malformed payload before transport", () => {
    const calls: string[] = [];
    engineClient.useTransport((input, init) => {
      if (String(input).includes("/provision/")) calls.push(String(input));
      return liveTransport(input, init);
    });

    expect(() =>
      dispatchProvisionRun({ action: "delete-everything" } as never),
    ).toThrow("provision:run dispatched without a valid provisioning body");
    expect(() =>
      appDispatcher.dispatch({ type: PROVISION_RUN_ACTION, payload: null }),
    ).toThrow("provision:run dispatched without a valid provisioning body");

    expect(calls).toEqual([]);
  });

  it("routes a migrate run through the seam to the real /provision/run broker", async () => {
    const calls: string[] = [];
    engineClient.useTransport((input, init) => {
      if (String(input).includes("/provision/")) calls.push(String(input));
      return liveTransport(input, init);
    });

    const result = await dispatchProvisionRun({ action: "migrate" });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/provision/run");
    expect(result.job.id.length).toBeGreaterThan(0);
    expect(["running", "succeeded", "failed"]).toContain(result.job.state);
  });
});
