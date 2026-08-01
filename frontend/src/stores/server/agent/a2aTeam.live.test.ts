// a2a Team wire slice live-wire tests.
//
// Test-integrity / wire-contract: these run ONLINE against the real `vaultspec
// serve` binary the global setup spawns, never a mocked wire. They exercise the
// genuine `A2aTeamClient` → the engine's `/ops/a2a/*` pass-through end to end.
//
// The live harness spawns the engine WITHOUT a resident a2a gateway, so this is
// the honest DEGRADED-path proof: the pass-through round-trips, carries the tiers
// block on every response, and the tolerant `agent`-tier read renders the Team
// selector disabled-with-reason — exactly the expected posture (single-agent
// authoring keeps working while the team plane is down). The a2a-UP path
// (non-empty presets, a live run) needs a running a2a gateway and is proven by
// the a2a repo's own gateway live tests + the cross-repo e2e, not spawnable
// from this harness.

import { beforeAll, describe, expect, it } from "vitest";

import { liveFetch, liveScope, liveTransport } from "../../../testing/liveClient";
import { A2aTeamClient, readAgentTierAvailability } from "./a2aTeam";

/** A live a2a-team client bound to the spawned engine (bearer via live transport). */
function liveA2aClient(): A2aTeamClient {
  return new A2aTeamClient({ baseUrl: "", fetchImpl: liveTransport });
}

let a2a: A2aTeamClient;

beforeAll(() => {
  a2a = liveA2aClient();
});

describe("a2a team pass-through (live)", () => {
  it("round-trips presets-list with a tiers block, degrading honestly when a2a is absent", async () => {
    const { presets, tiers } = await a2a.listPresets();
    // Every wire response carries the tiers block (wire-contract).
    expect(tiers).toBeDefined();
    expect(Array.isArray(presets)).toBe(true);

    const availability = readAgentTierAvailability(tiers);
    if (!availability.available) {
      // The expected CI state: no resident a2a gateway → the dedicated `agent`
      // tier degrades with a served reason, and no presets are listed. The Team
      // selector reads disabled-with-reason from exactly this.
      expect(typeof availability.reason).toBe("string");
      expect(availability.reason && availability.reason.length).toBeGreaterThan(0);
      expect(presets).toEqual([]);
    } else {
      // A dev box with a2a running: presets are a well-formed (possibly empty) set.
      for (const preset of presets) {
        expect(typeof preset.id).toBe("string");
        expect(typeof preset.loadable).toBe("boolean");
      }
    }
  });

  it("REFUSES the retired service-state verb at the engine whitelist", async () => {
    // This lane used to be proven here — "round-trips service-state with a tiers
    // block" passed against the real engine and kept a verb with a full client
    // stack and zero product consumers looking alive. The test proved the broker
    // worked; nothing ever proved the product needed the broker. So the assertion
    // is inverted rather than deleted: the verb is gone, and the live surface now
    // says so, which is what stops it drifting back in unnoticed.
    const response = await liveFetch("/ops/a2a/service-state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    // 403 specifically, and refused at the whitelist — not a 404 from a missing
    // route, and not a 502 from an absent sibling. The verb is unlisted, so the
    // engine turns it away before any discovery or round-trip.
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toContain("service-state");
  });

  it("round-trips active-runs (reload-recovery discovery) with a tiers block", async () => {
    // The `active-runs` verb is whitelisted on the engine pass-through and scoped
    // engine-side by workspace_root. With no resident a2a (the CI harness), it
    // degrades honestly: a tiers block and an empty list, never an error surface.
    const result = await a2a.activeRuns(await liveScope());
    expect(result.tiers).toBeDefined();
    expect(Array.isArray(result.runs)).toBe(true);
    const availability = readAgentTierAvailability(result.tiers);
    if (!availability.available) {
      expect(result.runs).toEqual([]);
    } else {
      for (const run of result.runs) {
        expect(typeof run.run_id).toBe("string");
        expect(run.run_id.length).toBeGreaterThan(0);
      }
    }
  });
});
