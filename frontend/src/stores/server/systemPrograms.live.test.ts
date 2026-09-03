// Live-wire proof for the system-status console's program identity.
//
// The pure tests in `systemPrograms.test.ts` pin how the projection BEHAVES. This
// one pins the premise those tests rest on: that the engine really serves the
// facts the console attributes to each program, at the paths it reads them from.
// That premise is exactly the kind that rots silently — a wire rename would leave
// every pure test green while the console quietly showed nothing — so it is
// proven against the real `vaultspec serve` the global setup spawns, never a mock
// (wire-contract: tests exercise the live wire).
//
// It also pins the honest GAPS. The app's own server reports no version, no
// listening address and no running time anywhere, which is why the console states
// those as unreported. If a future engine starts serving them, this test fails and
// tells whoever added them that the console can now stop apologising — which is
// the point of asserting an absence rather than leaving it undocumented.

import { describe, expect, it } from "vitest";

import { liveFetch } from "../../testing/liveClient";
import { adaptStatus } from "./liveAdapters/lineageMapStatus";

async function statusBody(): Promise<Record<string, unknown>> {
  const response = await liveFetch("/status");
  expect(response.ok).toBe(true);
  const envelope = (await response.json()) as { data?: unknown; tiers?: unknown };
  const data = (envelope.data ?? {}) as Record<string, unknown>;
  // `tiers` rides the envelope beside `data`; the adapter sees them merged.
  return { ...data, tiers: envelope.tiers };
}

function record(value: unknown): Record<string, unknown> {
  expect(typeof value === "object" && value !== null).toBe(true);
  return value as Record<string, unknown>;
}

describe("the served status envelope carries what the system-status console shows", () => {
  it("states whether the indexing program is available, in every case", async () => {
    // `available` and `state` are the two fields the engine serves whatever the
    // program is doing - running, crashed, or never installed. Everything else
    // in the block is conditional on them, so the console can always render a
    // row even when there is no process to point at.
    const body = await statusBody();
    const rag = record(record(body.backends).rag);

    expect(typeof rag.available).toBe("boolean");
    expect(["running", "crashed", "absent"]).toContain(rag.state);
    expect(rag.available).toBe(rag.state === "running");
  });

  it("serves the indexing program's own port and process id WHEN it is running", async () => {
    // The console's whole answer to "how do I relate this row to a real process"
    // is these two fields, so when the program IS running their presence is the
    // contract, not merely their type.
    //
    // Asserted against the running branch only, deliberately. rag is a GPU-only
    // service and the live-engine global setup spawns `vaultspec serve` without
    // provisioning it, so in this suite the engine truthfully reports `absent`.
    // Demanding port/pid unconditionally asserted the one branch that never
    // occurs here, which is why this file could not pass at all.
    const body = await statusBody();
    const rag = record(record(body.backends).rag);

    if (rag.available === true) {
      expect(Object.keys(rag)).toEqual(expect.arrayContaining(["port", "pid"]));
      expect(typeof rag.port).toBe("number");
      expect(typeof rag.pid).toBe("number");
      return;
    }

    // The other half of the same contract: a row with no process must still say
    // WHY, or the console has nothing to show in place of the identity.
    expect(typeof rag.reason).toBe("string");
    expect((rag.reason as string).length).toBeGreaterThan(0);
  });

  it("carries that port and process id through the tolerant adapter", async () => {
    // The adapter used to drop both on the floor: they were served and unread.
    const body = await statusBody();
    const rag = record(record(body.backends).rag);
    const status = adaptStatus(body);

    if (rag.available === true) {
      expect(status.rag?.port).toBe(rag.port);
      expect(status.rag?.pid).toBe(rag.pid);
      return;
    }

    // Nothing served, nothing to carry - and the adapter must not invent one.
    expect(status.rag?.port).toBeUndefined();
    expect(status.rag?.pid).toBeUndefined();
  });

  it("serves the project tools' version and required floor on the declared tier", async () => {
    const body = await statusBody();
    const declared = record(record(record(body.tiers).declared).component);
    expect(typeof declared.version).toBe("string");
    expect(typeof declared.floor).toBe("string");
  });

  it("serves an agent handshake whose gateway block is the only address source", async () => {
    const body = await statusBody();
    const agent = record(body.tiers).agent;
    // The agent tier is always present; its `gateway` is null until one is
    // discovered, which is precisely why the row states an address only when the
    // wire carried one.
    expect(agent).toBeDefined();
    const component = record(record(agent).component);
    expect(Object.keys(component)).toEqual(
      expect.arrayContaining(["gateway", "install_state", "installed"]),
    );
  });

  it("serves no version, address, or running time for the app's own server", async () => {
    // The stated gap, asserted. `/health` is the only route that describes the
    // server itself, and it answers with a liveness word and nothing more.
    const response = await liveFetch("/health");
    expect(response.ok).toBe(true);
    const envelope = (await response.json()) as { data?: unknown };
    const data = record(envelope.data);
    for (const absent of [
      "version",
      "port",
      "host",
      "uptime",
      "uptime_ms",
      "started_at",
    ]) {
      expect(data[absent], absent).toBeUndefined();
    }
    const body = await statusBody();
    for (const absent of ["version", "port", "host", "uptime", "started_at"]) {
      expect(body[absent], absent).toBeUndefined();
    }
  });
});
