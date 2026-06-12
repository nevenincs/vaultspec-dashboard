import { describe, expect, it } from "vitest";

import type { EngineStatus } from "../../stores/server/engine";
import { edgesByTier } from "./Inspector";
import { coreCard, gitCard, ragCard } from "./NowStrip";
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
  it("rolls git into clean/drift/dirty tones", () => {
    expect(
      gitCard(status({ git: { branch: "main", ahead: 0, behind: 0, dirty: [] } })),
    ).toMatchObject({ tone: "ok", detail: "main · clean" });
    expect(
      gitCard(status({ git: { branch: "main", ahead: 2, behind: 1, dirty: ["a"] } })),
    ).toMatchObject({ tone: "warn", detail: "main · ↑2 ↓1 1 dirty" });
    expect(gitCard(undefined).tone).toBe("down");
  });

  it("renders core and rag absence as designed down states, not errors", () => {
    expect(coreCard(status({ core: { reachable: false } })).tone).toBe("down");
    expect(
      coreCard(status({ core: { reachable: true, vault_health: "green" } })).tone,
    ).toBe("ok");
    expect(ragCard(status({ rag: { service: "stopped" } }))).toMatchObject({
      tone: "down",
      detail: "stopped",
    });
    expect(
      ragCard(
        status({
          rag: { service: "running", watcher: "watching", index: "fresh", jobs: 2 },
        }),
      ).detail,
    ).toBe("watching · index fresh · 2 jobs");
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
