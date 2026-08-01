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
  it("renders exactly the SERVED eligible set, never a locally derived one", () => {
    const view = deriveA2aLifecycleView(
      status({
        installed: false,
        install_state: "absent",
        readiness: { state: "uninstalled" },
        ownership: { owner: "root", retained: false },
        active_generation: null,
        tiers: { agent: { available: false, reason: "not installed" } },
        eligible_ops: ["doctor", "install"],
      }),
    );
    expect(view.installState).toBe("absent");
    expect([...view.eligibleOps].sort()).toEqual(["doctor", "install"]);
    expect(view.owned).toBe(false);
    expect(view.orchestration).toEqual({ available: false, reason: "not installed" });
    expect(view.destructiveOps.size).toBe(0);
  });

  it("a live gateway with a COLD worker is still service-ready", () => {
    const view = deriveA2aLifecycleView(
      status({ readiness: { state: "gateway-ready", worker: "cold" } }),
    );
    // A cold worker does not collapse readiness to a degradation.
    expect(view.readiness).toEqual({ state: "gateway-ready", worker: "cold" });
    expect(view.degraded).toBe(false);
  });

  it("does NOT offer process control the engine withheld, however ready it looks", () => {
    // The defect this replaced: a gateway-ready readiness made the panel offer
    // stop and restart locally, against a plane that refused both. Readiness is
    // only half the answer and the client cannot see the other half, so a served
    // set that omits them is final.
    const view = deriveA2aLifecycleView(
      status({
        readiness: { state: "gateway-ready", worker: "ready" },
        eligible_ops: ["doctor"],
      }),
    );
    expect(view.eligibleOps.has("stop")).toBe(false);
    expect(view.eligibleOps.has("restart")).toBe(false);
    expect([...view.eligibleOps]).toEqual(["doctor"]);
  });

  it("fails CLOSED when the engine serves no eligible set", () => {
    // Offering nothing is recoverable; offering a control that refuses is not.
    const view = deriveA2aLifecycleView(
      status({ readiness: { state: "gateway-ready", worker: "ready" } }),
    );
    expect(view.eligibleOps.size).toBe(0);
    expect(view.destructiveOps.size).toBe(0);
  });

  it("drops a served token this client cannot render", () => {
    const view = deriveA2aLifecycleView(
      status({
        readiness: { state: "installed-stopped" },
        eligible_ops: ["start", "quantum-defrag"],
      }),
    );
    expect([...view.eligibleOps]).toEqual(["start"]);
  });

  it("surfaces destructive ops for the confirm affordance only when offered", () => {
    const view = deriveA2aLifecycleView(
      status({ eligible_ops: ["doctor", "remove", "rollback"] }),
    );
    expect([...view.destructiveOps].sort()).toEqual(["remove", "rollback"]);
  });

  it("a FOREIGN-immutable gateway reads unavailable from the tiers block, not a guess", () => {
    const reason =
      "a foreign a2a gateway holds the runtime and stays immutable: protocol or state-schema mismatch";
    const view = deriveA2aLifecycleView(
      status({
        tiers: { agent: { available: false, reason } },
        eligible_ops: ["doctor"],
      }),
    );
    // Orchestration availability is read from tiers.agent (canonical reader).
    expect(view.orchestration).toEqual({ available: false, reason });
    // The install itself is settled and still offers what the engine serves.
    expect(view.installState).toBe("settled");
    expect(view.eligibleOps.has("doctor")).toBe(true);
  });

  it("a recovery-required install is degraded and offers what the engine serves", () => {
    const view = deriveA2aLifecycleView(
      status({
        installed: null,
        install_state: "recovery-required",
        recovery_required: true,
        degraded: true,
        readiness: null,
        eligible_ops: ["doctor", "repair"],
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
        eligible_ops: ["doctor"],
      }),
    );
    expect(view.degraded).toBe(true);
    expect([...view.eligibleOps]).toEqual(["doctor"]);
  });

  it("an unread status is unknown and offers NOTHING until the engine answers", () => {
    const view = deriveA2aLifecycleView(undefined);
    expect(view.installState).toBe("unknown");
    expect(view.installed).toBeNull();
    // Before the first read there is no served set, so there is nothing honest
    // to offer — not even doctor, which this used to assume locally.
    expect([...view.eligibleOps]).toEqual([]);
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
