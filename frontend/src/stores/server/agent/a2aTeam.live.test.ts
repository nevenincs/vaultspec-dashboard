// a2a Team wire slice live-wire tests.
//
// Test-integrity / wire-contract: these run ONLINE against the real `vaultspec
// serve` binary the global setup spawns, never a mocked wire. They exercise the
// genuine `A2aTeamClient` → the engine's `/ops/a2a/*` pass-through end to end.
//
// The live harness spawns the engine WITHOUT a resident a2a gateway, so most of
// this file is the honest DEGRADED-path proof: the pass-through round-trips,
// carries the tiers block on every response, and the tolerant `agent`-tier read
// renders the Team selector disabled-with-reason — exactly the expected posture
// (single-agent authoring keeps working while the team plane is down).
//
// The last case is the a2a-UP path, and it needs three things this harness cannot
// create for itself: an engine bound to a live a2a gateway (attach with
// `ENGINE_BASE_URL`/`ENGINE_TOKEN` rather than letting the setup spawn one), a
// selectable execution lane, and a provider standing ready to REFUSE. It states
// each missing precondition and skips rather than failing, because an unproven
// chain must report as unproven — never as proven, and never as a crash.

import { beforeAll, describe, expect, it } from "vitest";

import { liveFetch, liveScope, liveTransport } from "../../../testing/liveClient";
import {
  A2aTeamClient,
  createTeamRunId,
  isProviderCatalogSelectable,
  isTeamRunTerminalStatus,
  readAgentTierAvailability,
  selectionFromCatalogEntry,
  type ProviderCatalogRecord,
  type ProviderCatalogSelection,
} from "./a2aTeam";
import { PROVIDER_CONDITIONS } from "./providerCondition";

/** A live a2a-team client bound to the spawned engine (bearer via live transport). */
function liveA2aClient(): A2aTeamClient {
  return new A2aTeamClient({ baseUrl: "", fetchImpl: liveTransport });
}

let a2a: A2aTeamClient;

beforeAll(() => {
  a2a = liveA2aClient();
});

/** The refusal the operator has arranged for this run to provoke, named as one
 *  member of the closed vocabulary.
 *
 *  Declared rather than assumed, for two reasons. Refusals are not equally
 *  summonable — an exhausted balance and a rate limit need different standing
 *  arrangements — so welding the case to one of them makes it undrivable the
 *  moment that one is out of reach. And starting this run spends a real
 *  credential against a real provider, so its absence is the default: an ordinary
 *  suite run against a healthy stack must not burn quota to discover that nothing
 *  was arranged. */
const EXPECTED_CONDITION = process.env["A2A_EXPECTED_PROVIDER_CONDITION"];

/** The one preset this case may drive. A preset declaring an authoring capability
 *  is refused at run-start for a missing per-role actor token, which reads as a
 *  provider problem and is not one. This preset drives a single worker straight at
 *  the lane, which is the whole subject here. */
const PROBE_PRESET = "provider-condition-probe";

/** A refusal is a round trip through a real provider, so the budget is the run's,
 *  not a wire call's. Polled rather than assumed prompt. */
const REFUSAL_DEADLINE_MS = 180_000;
const REFUSAL_POLL_MS = 2_000;

/** The first lane that can currently mint a selection, with an entry to select.
 *  Selectability is the production algebra's verdict, not a health field read by
 *  hand: a lane whose catalog has gone stale cannot lawfully start a run, and a
 *  hand-built selection naming a turned-over revision is refused at admission. */
function selectableLane(
  providers: readonly ProviderCatalogRecord[],
): { record: ProviderCatalogRecord; selection: ProviderCatalogSelection } | null {
  for (const record of providers) {
    if (!isProviderCatalogSelectable(record)) continue;
    for (const entry of record.catalog.models) {
      const selection = selectionFromCatalogEntry(record, entry.entry_id);
      if (selection !== null) return { record, selection };
    }
  }
  return null;
}

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

describe("a2a provider refusal (live, arranged)", () => {
  it(
    "serves a real refusal's classification on run-status with no stream attached",
    async (ctx) => {
      // Every gate below states what is MISSING rather than what failed. In CI
      // there is no a2a gateway and no arranged refusal, and that must read as
      // "not proven here", which is true, instead of red.
      if (EXPECTED_CONDITION === undefined) {
        ctx.skip(
          "A2A_EXPECTED_PROVIDER_CONDITION is unset — no refusal is arranged for " +
            "this run, and starting one would spend a real credential to discover " +
            "that; declare the member the standing arrangement provokes to drive it",
        );
        return;
      }
      // A declared member outside the closed vocabulary can never be satisfied, so
      // it is an operator error and fails rather than skipping. A silent skip here
      // would make a typo indistinguishable from an unarranged machine.
      expect(
        PROVIDER_CONDITIONS as readonly string[],
        `A2A_EXPECTED_PROVIDER_CONDITION=${EXPECTED_CONDITION} is not a member of ` +
          `the closed refusal vocabulary, so no run could ever satisfy it`,
      ).toContain(EXPECTED_CONDITION);

      const { presets, tiers } = await a2a.listPresets();
      const availability = readAgentTierAvailability(tiers);
      if (!availability.available) {
        ctx.skip(
          `no resident a2a gateway on this engine (${
            availability.reason ?? "the " + "agent tier is degraded"
          }) — attach to an engine bound to a live ` +
            `gateway with ENGINE_BASE_URL/ENGINE_TOKEN to drive a refusal`,
        );
        return;
      }
      const preset = presets.find((candidate) => candidate.id === PROBE_PRESET);
      if (preset === undefined || !preset.loadable) {
        ctx.skip(
          `the ${PROBE_PRESET} preset is ${preset === undefined ? "not served" : "not loadable"} ` +
            `on this gateway (${preset?.unavailable_reason ?? "no reason served"}) — ` +
            `a refusal cannot be driven through a preset that will not load`,
        );
        return;
      }

      const scope = await liveScope();
      const catalog = await a2a.listProviderCatalog(scope);
      const lane = selectableLane(catalog.providers);
      if (lane === null) {
        ctx.skip(
          `no execution lane can currently mint a selection (served: ` +
            `${catalog.providers.map((p) => p.provider_id).join(", ") || "none"}) — ` +
            `a refusal needs a lane healthy enough to be dispatched to and then ` +
            `turned away`,
        );
        return;
      }

      // A fresh identity per attempt: run-start is idempotent by run id, so
      // reusing one would return the earlier run's outcome instead of driving a
      // new refusal.
      const runId = createTeamRunId();
      const started = await a2a.startRun({
        run_id: runId,
        team_preset: PROBE_PRESET,
        message: "Reply with the single word ready.",
        expected_scope: scope,
        selection: lane.selection,
      });
      expect(
        started.ok,
        `run-start refused (${started.sibling_status ?? "no status"}): ` +
          `${started.refusal_detail ?? "no detail served"}`,
      ).toBe(true);
      expect(started.run_id).toBe(runId);
      // The run was dispatched to the lane the catalog offered, and the frozen
      // evidence says so — otherwise a refusal could be attributed to a lane that
      // never ran.
      expect(started.frozen_assignment?.assignments[0]?.provider_id).toBe(
        lane.record.provider_id,
      );

      // Read the AUTHORITATIVE snapshot only. No stream is opened anywhere in this
      // case: a classification observed solely on a frame proves a channel that a
      // reloading client cannot depend on, which is the opposite of the claim.
      const deadline = Date.now() + REFUSAL_DEADLINE_MS;
      let status = await a2a.runStatus(runId);
      while (!isTeamRunTerminalStatus(status.status) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, REFUSAL_POLL_MS));
        status = await a2a.runStatus(runId);
      }

      expect(
        isTeamRunTerminalStatus(status.status),
        `run ${runId} was still ${status.status} after ` +
          `${REFUSAL_DEADLINE_MS}ms — the refusal was never reached`,
      ).toBe(true);
      expect(status.status).toBe("failed");
      expect(
        status.provider_condition,
        `run ${runId} failed without the arranged classification; served reason: ` +
          `${status.failure_reason ?? "none"}`,
      ).toBe(EXPECTED_CONDITION);
    },
    REFUSAL_DEADLINE_MS + 60_000,
  );
});
