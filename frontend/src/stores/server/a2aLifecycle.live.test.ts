// A2A lifecycle client live-wire tests (a2a-product-provisioning W05.P11.S95).
//
// Test-integrity / wire-contract: these run ONLINE against the real `vaultspec
// serve` the global setup spawns, never a mocked wire. They exercise the genuine
// `EngineClient` lifecycle methods → the engine's `/a2a/lifecycle/*` plane end to
// end, and PROVE the browser never opens a direct transport to the a2a gateway: the
// dashboard reaches the component ONLY through the engine (ADR D3), so every request
// this client makes rides the ENGINE origin.
//
// The live harness spawns the engine WITHOUT a resident a2a gateway, so this is the
// honest path: the lifecycle plane round-trips (status, a read-only doctor job, job
// poll), carries the tiers block on every response, and degrades honestly when no
// capsule is live. The capsule-UP path (an owned live gateway answering process
// control) needs a real A2A desktop capsule and is proven by the a2a repo's own
// gateway live tests + the cross-repo e2e, not spawnable from this frontend harness.

import { describe, expect, it } from "vitest";

import { LIVE_BASE_URL, liveTransport } from "../../testing/liveClient";
import { EngineClient, type FetchLike } from "./engine";
import { readAgentTierAvailability } from "./agent/a2aTeam";

/** A live lifecycle client that RECORDS every request URL, so the test can prove
 *  the client only ever touches the engine origin (no direct browser→A2A sibling
 *  request). */
function recordingClient(): { client: EngineClient; seen: string[] } {
  const seen: string[] = [];
  const capturing: FetchLike = (input, init) => {
    seen.push(input);
    return liveTransport(input, init);
  };
  return {
    client: new EngineClient({ baseUrl: LIVE_BASE_URL, fetchImpl: capturing }),
    seen,
  };
}

describe("a2a lifecycle client (live)", () => {
  it("reads the served status projection with the agent tier, degrading honestly", async () => {
    const { client } = recordingClient();
    const status = await client.a2aLifecycleStatus();

    // Every wire response carries the tiers block, including the dedicated agent
    // tier (wire-contract). Degradation is read from it, never guessed.
    expect(status.tiers?.agent).toBeDefined();
    const availability = readAgentTierAvailability(status.tiers);
    expect(typeof availability.available).toBe("boolean");
    if (!availability.available) {
      expect(typeof availability.reason).toBe("string");
      expect(availability.reason && availability.reason.length).toBeGreaterThan(0);
    }
    // The install-state projection conforms to the served enum regardless of the
    // machine's real product state.
    expect([
      "absent",
      "settled",
      "recovery-required",
      "busy",
      "unverifiable",
    ]).toContain(status.install_state);
    expect(typeof status.ownership.owner).toBe("string");
  });

  it("drives the engine job plane for a read-only doctor run without a direct sibling request", async () => {
    const { client, seen } = recordingClient();

    const dispatched = await client.a2aLifecycleRun({ op: "doctor" });
    expect(dispatched.job.op).toBe("doctor");
    expect(dispatched.job.id.length).toBeGreaterThan(0);
    expect(typeof dispatched.attached).toBe("boolean");

    // Poll the job through the engine's jobs plane to a terminal state (bounded).
    let job = dispatched.job;
    for (let attempt = 0; attempt < 40 && job.state === "running"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      job = (await client.a2aLifecycleJob(job.id)).job;
    }
    expect(["succeeded", "failed"]).toContain(job.state);

    // EVERY request rode the engine origin and the lifecycle plane — the browser
    // never opened a direct transport to the a2a gateway (no cross-origin sibling
    // call). This is the structural proof of ADR D3's browser→engine-only edge.
    expect(seen.length).toBeGreaterThan(0);
    for (const url of seen) {
      expect(url.startsWith(LIVE_BASE_URL)).toBe(true);
      expect(url).toContain("/a2a/lifecycle/");
    }
  });
});
