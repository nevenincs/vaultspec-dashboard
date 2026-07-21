// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { liveTransport } from "../../testing/liveClient";
import { engineClient } from "./engine";
import type { A2aLifecycleStatus } from "./engine";
import {
  deriveA2aLifecycleView,
  useA2aLifecycleJob,
  useA2aLifecycleRun,
  useA2aLifecycleStatus,
} from "./a2aLifecycle";
import { engineKeys } from "./queries";
import { testQueryClient, wrapper } from "./queries/testFixtures";

afterEach(() => {
  engineClient.useTransport(liveTransport);
});

// --- pure projection (status interpretation; spec-derived expectations) ---------
//
// The install-level state and readiness the controller serves drive which ops the
// panel offers. Expected values are derived from the ADR's state model, NOT copied
// from any run output.

function status(overrides: Partial<A2aLifecycleStatus>): A2aLifecycleStatus {
  return {
    installed: true,
    installed_known: true,
    install_state: "settled",
    recovery_required: false,
    degraded: false,
    readiness: { state: "gateway-ready", worker: "ready" },
    ownership: { owner: "root", retained: true },
    active_generation: "g1",
    tiers: { agent: { available: true } },
    ...overrides,
  };
}

describe("deriveA2aLifecycleView (status interpretation)", () => {
  it("an absent install offers only install (plus the read-only doctor)", () => {
    const view = deriveA2aLifecycleView(
      status({
        installed: false,
        install_state: "absent",
        readiness: { state: "uninstalled" },
        ownership: { owner: "root", retained: false },
        active_generation: null,
        tiers: { agent: { available: false, reason: "not installed" } },
      }),
    );
    expect(view.installState).toBe("absent");
    expect([...view.eligibleOps].sort()).toEqual(["doctor", "install"]);
    expect(view.owned).toBe(false);
    expect(view.orchestration).toEqual({ available: false, reason: "not installed" });
    expect(view.destructiveOps.size).toBe(0);
  });

  it("a live gateway with a COLD worker is still service-ready and offers process control", () => {
    const view = deriveA2aLifecycleView(
      status({ readiness: { state: "gateway-ready", worker: "cold" } }),
    );
    // A cold worker does not collapse readiness to a degradation.
    expect(view.readiness).toEqual({ state: "gateway-ready", worker: "cold" });
    expect(view.degraded).toBe(false);
    expect(view.eligibleOps.has("stop")).toBe(true);
    expect(view.eligibleOps.has("restart")).toBe(true);
    expect(view.eligibleOps.has("start")).toBe(false);
    expect(view.eligibleOps.has("install")).toBe(false);
    // Destructive ops are surfaced for the confirm affordance.
    expect([...view.destructiveOps].sort()).toEqual(["remove", "rollback"]);
  });

  it("an installed-but-stopped generation offers start, not stop/restart", () => {
    const view = deriveA2aLifecycleView(
      status({ readiness: { state: "installed-stopped" } }),
    );
    expect(view.eligibleOps.has("start")).toBe(true);
    expect(view.eligibleOps.has("stop")).toBe(false);
    expect(view.eligibleOps.has("restart")).toBe(false);
  });

  it("a FOREIGN-immutable gateway reads unavailable from the tiers block, not a guess", () => {
    const reason =
      "a foreign a2a gateway holds the runtime and stays immutable: protocol or state-schema mismatch";
    const view = deriveA2aLifecycleView(
      status({ tiers: { agent: { available: false, reason } } }),
    );
    // Orchestration availability is read from tiers.agent (canonical reader).
    expect(view.orchestration).toEqual({ available: false, reason });
    // The install itself is settled and still offers maintenance ops.
    expect(view.installState).toBe("settled");
    expect(view.eligibleOps.has("doctor")).toBe(true);
  });

  it("a recovery-required install is degraded and offers only repair + doctor", () => {
    const view = deriveA2aLifecycleView(
      status({
        installed: null,
        install_state: "recovery-required",
        recovery_required: true,
        degraded: true,
        readiness: null,
      }),
    );
    expect(view.degraded).toBe(true);
    expect(view.recoveryRequired).toBe(true);
    expect([...view.eligibleOps].sort()).toEqual(["doctor", "repair"]);
  });

  it("a busy install authority offers only the read-only doctor", () => {
    const view = deriveA2aLifecycleView(
      status({
        installed: null,
        install_state: "busy",
        degraded: true,
        readiness: null,
      }),
    );
    expect(view.degraded).toBe(true);
    expect([...view.eligibleOps]).toEqual(["doctor"]);
  });

  it("an unread status is unknown, offers doctor, and reads orchestration as available", () => {
    const view = deriveA2aLifecycleView(undefined);
    expect(view.installState).toBe("unknown");
    expect(view.installed).toBeNull();
    expect([...view.eligibleOps]).toEqual(["doctor"]);
    // readAgentTierAvailability(undefined) is tolerant-available (no served block).
    expect(view.orchestration).toEqual({ available: true });
  });
});

// --- live wire (bounded polling, job settlement, invalidation) ------------------

describe("a2a lifecycle store against the live engine", () => {
  it("reads a conformant lifecycle projection carrying the agent tier", async () => {
    const client = testQueryClient();
    const { result, unmount } = renderHook(() => useA2aLifecycleStatus(), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const projection = result.current.data!;
    expect([
      "absent",
      "settled",
      "recovery-required",
      "busy",
      "unverifiable",
    ]).toContain(projection.install_state);
    expect(typeof projection.installed_known).toBe("boolean");
    expect(typeof projection.ownership.owner).toBe("string");
    // The agent orchestration tier rides the same envelope (degraded-by-default).
    expect(projection.tiers?.agent).toBeDefined();
    expect(deriveA2aLifecycleView(projection).eligibleOps.has("doctor")).toBe(true);
    unmount();
    client.clear();
  });

  it("settles a doctor job, stops polling once terminal, and invalidates the status", async () => {
    const client = testQueryClient();
    const statusHook = renderHook(() => useA2aLifecycleStatus(), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(statusHook.result.current.isSuccess).toBe(true));
    const before = client.getQueryState(engineKeys.a2aLifecycleStatus())!.dataUpdatedAt;

    // Dispatch a read-only doctor run (safe against the shared serve).
    const run = renderHook(() => useA2aLifecycleRun(), { wrapper: wrapper(client) });
    let jobId = "";
    await act(async () => {
      const res = await run.result.current.mutateAsync({ op: "doctor" });
      jobId = res.job.id;
    });
    expect(jobId.length).toBeGreaterThan(0);

    // Poll the job to a terminal state through the production hook.
    const job = renderHook(() => useA2aLifecycleJob(jobId), {
      wrapper: wrapper(client),
    });
    await waitFor(
      () => {
        const state = job.result.current.data?.state;
        expect(state === "succeeded" || state === "failed").toBe(true);
      },
      { timeout: 15_000 },
    );
    expect(["succeeded", "failed"]).toContain(job.result.current.data!.state);
    // Bounded polling: the interval resolver returns false once terminal.
    expect(job.result.current.fetchStatus).toBe("idle");

    // Settlement invalidates the status projection → the mounted query re-reads.
    await waitFor(() => {
      const after = client.getQueryState(
        engineKeys.a2aLifecycleStatus(),
      )!.dataUpdatedAt;
      expect(after).toBeGreaterThan(before);
    });

    statusHook.unmount();
    run.unmount();
    job.unmount();
    client.clear();
  });
});
