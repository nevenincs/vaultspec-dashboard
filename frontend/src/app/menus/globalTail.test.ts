// End-to-end verification of the context-menu global tail (global-context-actions
// P03.S13): Refresh is the SOLE tail member (the heavy rag-reindex is NOT in the tail,
// D5), and the seam surfaces it LAST under the terminal `global` section on every
// resolved kind (D2/D3).

import { afterEach, describe, expect, it } from "vitest";

import {
  registerGlobalTailActions,
  registerResolver,
  resetResolvers,
  resolveActions,
  type ActionContext,
} from "../../platform/actions/registry";
import { globalTailActions } from "./globalTail";

const LIVE: ActionContext = { timeTravel: false };

afterEach(() => resetResolvers());

describe("context-menu global tail (Refresh)", () => {
  it("is Refresh ONLY - the heavy rag-reindex verb is never in the tail (D5)", () => {
    const tail = globalTailActions();
    expect(tail.map((a) => a.id)).toEqual(["reload:refresh-data"]);
    expect(tail[0].section).toBe("global");
    expect(tail.some((a) => a.id.includes("reindex"))).toBe(false);
  });

  it("surfaces Refresh LAST under the global section on every resolved kind", () => {
    registerGlobalTailActions(() => globalTailActions());
    registerResolver("node", () => [
      { id: "node:focus", label: "Focus", section: "navigate", run: () => {} },
    ]);
    registerResolver("commit", (() => [
      { id: "commit:copy-hash", label: "Copy hash", section: "copy", run: () => {} },
    ]) as never);

    for (const entity of [
      { kind: "node", id: "doc:a" },
      { kind: "commit", id: "abc1230000" },
    ]) {
      const actions = resolveActions(entity, LIVE);
      const ids = actions.map((a) => a.id);
      expect(ids[ids.length - 1]).toBe("reload:refresh-data");
      expect(actions[actions.length - 1].section).toBe("global");
    }
  });

  it("Refresh is non-mutating, so it survives time-travel (not gated)", () => {
    registerGlobalTailActions(() => globalTailActions());
    registerResolver("node", () => [
      { id: "node:focus", label: "Focus", section: "navigate", run: () => {} },
    ]);
    const travel = resolveActions({ kind: "node", id: "doc:a" }, { timeTravel: true });
    expect(travel.map((a) => a.id)).toContain("reload:refresh-data");
  });
});
