import { beforeEach, describe, expect, it } from "vitest";

import type { EngineStatus } from "../../stores/server/engine";
import { HEALTHY, deriveInputs, matrixFor, useDegradationStore } from "./matrix";

const inputs = (over: Partial<typeof HEALTHY>) => ({ ...HEALTHY, ...over });

describe("matrixFor — the ADR §8 table, row by row (G8.a)", () => {
  it("healthy: every surface normal", () => {
    expect(matrixFor(HEALTHY)).toEqual({
      stage: "normal",
      timeline: "normal",
      rail: "normal",
      search: "normal",
    });
  });

  it("rag absent/down: semantic absent, rag card degraded, text fallback", () => {
    expect(matrixFor(inputs({ ragDown: true }))).toEqual({
      stage: "semantic-absent",
      timeline: "normal",
      rail: "rag-degraded-card",
      search: "text-fallback",
    });
  });

  it("core date-mandate not landed: lifecycle lane sparse, pre-landing card", () => {
    expect(matrixFor(inputs({ dateMandateMissing: true }))).toEqual({
      stage: "normal",
      timeline: "lifecycle-sparse",
      rail: "pre-landing-card",
      search: "normal",
    });
  });

  it("structural links broken: warning treatment on stage, rest unaffected", () => {
    const states = matrixFor(inputs({ brokenLinkCount: 3 }));
    expect(states.stage).toBe("broken-highlighted");
    expect(states.timeline).toBe("normal");
  });

  it("engine stream lost: stale everything, LIVE becomes RECONNECTING", () => {
    expect(matrixFor(inputs({ streamLost: true }))).toEqual({
      stage: "stale-cached",
      timeline: "reconnecting",
      rail: "stale-badged",
      search: "degraded",
    });
  });

  it("no vault in worktree: invitation, empty timeline, git still live", () => {
    const states = matrixFor(inputs({ noVault: true }));
    expect(states.stage).toBe("empty-invitation");
    expect(states.timeline).toBe("empty");
    expect(states.rail).toBe("normal");
  });
});

describe("deriveInputs", () => {
  const status = (over: Partial<EngineStatus>): EngineStatus => ({
    ok: true,
    nodes: 10,
    edges: 5,
    degradations: [],
    tiers: { semantic: { available: true } },
    ...over,
  });

  it("reads rag-down from the tier block or the rag rollup", () => {
    expect(
      deriveInputs(status({ tiers: { semantic: { available: false } } })).ragDown,
    ).toBe(true);
    expect(deriveInputs(status({ rag: { service: "stopped" } })).ragDown).toBe(true);
    expect(deriveInputs(undefined).ragDown).toBe(true);
  });

  it("reads no-vault from an empty corpus", () => {
    expect(deriveInputs(status({ nodes: 0 })).noVault).toBe(true);
  });
});

describe("debug overrides (every state reachable, G8.a)", () => {
  beforeEach(() => useDegradationStore.getState().clearOverrides());

  it("overrides combine with real inputs and clear cleanly", () => {
    const store = useDegradationStore.getState();
    store.setOverride("streamLost", true);
    expect(useDegradationStore.getState().resolve(HEALTHY).streamLost).toBe(true);
    expect(matrixFor(useDegradationStore.getState().resolve(HEALTHY)).timeline).toBe(
      "reconnecting",
    );
    useDegradationStore.getState().setOverride("streamLost", null);
    expect(useDegradationStore.getState().overrides).toBeNull();
  });
});
