import { describe, expect, it } from "vitest";

import { EngineError, type EngineStatus } from "../../stores/server/engine";
import { classifyOpsOutcome, deriveRagStatusView } from "../../stores/server/queries";
import { edgesByTier } from "./Inspector";
import { coreCard, gitCard, ragCardView } from "./NowStrip";
import { OPS_WHITELIST } from "./OpsPanel";

const status = (over: Partial<EngineStatus>): EngineStatus => ({
  ok: true,
  nodes: 0,
  edges: 0,
  degradations: [],
  tiers: {},
  ...over,
});

describe("now strip rollups (G2, honest degradation)", () => {
  it("rolls git into clean/drift/dirty tones (live shape: dirty boolean, ahead/behind Option)", () => {
    // Clean tree, no upstream (ahead/behind absent).
    expect(gitCard(status({ git: { branch: "main", dirty: false } }))).toMatchObject({
      tone: "ok",
      detail: "main · clean",
    });
    // Dirty tree with an upstream configured → drift + a dirty mark (no count).
    expect(
      gitCard(status({ git: { branch: "main", ahead: 2, behind: 1, dirty: true } })),
    ).toMatchObject({ tone: "warn", detail: "main · ↑2 ↓1 dirty" });
    expect(gitCard(undefined).tone).toBe("down");
  });

  it("renders core absence as a designed down state, not an error", () => {
    expect(coreCard(status({ core: { reachable: false } })).tone).toBe("down");
    expect(
      coreCard(status({ core: { reachable: true, vault_health: "green" } })).tone,
    ).toBe("ok");
  });

  // The rag rollup is driven by the interpreted RagStatusView the stores layer
  // derives — feed real status snapshots through deriveRagStatusView so the test
  // exercises the stores selector AND the card projection end to end (no raw
  // status interpretation in the card).
  it("renders rag stopped/absent as designed down states, not errors", () => {
    const stopped = deriveRagStatusView(
      status({ rag: { service: "stopped" } }),
      null,
      false,
    );
    expect(ragCardView(stopped)).toMatchObject({ tone: "down", detail: "stopped" });

    const absent = deriveRagStatusView(status({}), null, false);
    expect(ragCardView(absent).tone).toBe("down");
  });

  it("states rag readiness as a composite (running + index + watcher)", () => {
    const ready = deriveRagStatusView(
      status({
        rag: { service: "running", watcher: "watching", index: "fresh", jobs: 2 },
      }),
      null,
      false,
    );
    const card = ragCardView(ready);
    expect(card.tone).toBe("ok");
    expect(card.detail).toBe("ready · watching · index fresh");
    expect(card.jobs).toBe(2);
  });

  it("renders a degraded semantic tier as warn, not a bare error", () => {
    const degraded = deriveRagStatusView(
      status({
        rag: { service: "stopped" },
        tiers: { semantic: { available: false, reason: "model loading" } },
      }),
      null,
      false,
    );
    const card = ragCardView(degraded);
    expect(card.tone).toBe("warn");
    expect(card.detail).toContain("model loading");
  });
});

describe("ops outcome classification (rag-manager ADR, stores-owned tier read)", () => {
  it("classifies a tiers-bearing EngineError as backend-down, not a plain failure", () => {
    const down = new EngineError("/ops/rag/reindex", 502, {
      tiers: { semantic: { available: false, reason: "rag service down" } },
    });
    expect(classifyOpsOutcome({ ok: false, error: down })).toBe("backend-down");
  });

  it("classifies a tiers-less transport fault as a plain failure", () => {
    const fault = new EngineError("/ops/rag/reindex", 500, {});
    expect(classifyOpsOutcome({ ok: false, error: fault })).toBe("failed");
    expect(classifyOpsOutcome({ ok: false, error: new Error("boom") })).toBe("failed");
  });

  it("classifies a resolved envelope by its ok flag", () => {
    expect(classifyOpsOutcome({ ok: true })).toBe("ok");
    expect(classifyOpsOutcome({ ok: false })).toBe("failed");
  });
});

describe("ops whitelist (contract R1)", () => {
  it("is exactly the pillar-2 list — never grown GUI-side", () => {
    expect(OPS_WHITELIST.map((o) => `${o.target}:${o.verb}`)).toEqual([
      "core:vault-check",
      "core:vault-stats",
      "rag:service-start",
      "rag:service-stop",
      "rag:reindex",
      "rag:watcher-reconfigure",
    ]);
  });
});

describe("inspector tier grouping (G3.c)", () => {
  it("groups per tier in fixed order, excluding meta-edges", () => {
    const groups = edgesByTier([
      {
        id: "e1",
        src: "a",
        dst: "b",
        relation: "implements",
        tier: "declared",
        confidence: 1,
      },
      {
        id: "e2",
        src: "a",
        dst: "c",
        relation: "similar-to",
        tier: "semantic",
        confidence: 0.5,
      },
      {
        id: "m1",
        src: "a",
        dst: "d",
        relation: "related",
        tier: "semantic",
        confidence: 0.5,
        meta: { count: 2, breakdown_by_tier: { semantic: 2 } },
      },
    ]);
    expect([...groups.keys()]).toEqual(["declared", "semantic"]);
    expect(groups.get("semantic")!.map((e) => e.id)).toEqual(["e2"]);
  });
});
