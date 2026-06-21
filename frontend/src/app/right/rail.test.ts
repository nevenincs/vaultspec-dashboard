import { describe, expect, it } from "vitest";

import { EngineError, type EngineStatus } from "../../stores/server/engine";
import { OPS_WHITELIST } from "../../stores/server/opsActions";
import {
  classifyOpsOutcome,
  deriveCoreStatusView,
  deriveGitStatusView,
  deriveInspectorNeighborTierView,
  deriveRagStatusView,
  opsReceiptFromError,
  opsReceiptFromResult,
} from "../../stores/server/queries";
import {
  coreCard,
  deriveNowStripView,
  gitCard,
  ragCardView,
} from "../../stores/view/nowStrip";
import { RIGHT_RAIL_TABS } from "../../stores/view/shellLayout";

const status = (over: Partial<EngineStatus>): EngineStatus => ({
  ok: true,
  nodes: 0,
  edges: 0,
  degradations: [],
  tiers: {},
  ...over,
});

describe("rail tab strip IA (binding Figma ActivityRail 244:753)", () => {
  it("is exactly Status, Changes, Search in that order", () => {
    // The figma-frontend-rewrite ActivityRail board (244:753) shows EXACTLY three
    // label-only tabs in this order, superseding the status-overview ADR's prior
    // four-id IA (which added an Inspect pane) and its persistent liveness-pillar
    // header. Status is the primary (leading) tab.
    expect(RIGHT_RAIL_TABS.map((t) => t.label)).toEqual([
      "Status",
      "Changes",
      "Search",
    ]);
    expect(RIGHT_RAIL_TABS.map((t) => t.id)).toEqual(["status", "changes", "search"]);
  });

  it("renders every tab label-only — the board carries no leading tab marks", () => {
    // The binding board paints the tabs as plain labels with an accent underline;
    // none carries a leading glyph.
    expect(
      RIGHT_RAIL_TABS.every(
        (t) => !("mark" in t) || (t as { mark?: unknown }).mark == null,
      ),
    ).toBe(true);
  });
});

describe("now strip rollups (G2, honest degradation)", () => {
  it("rolls git into clean/drift/dirty tones (live shape: dirty boolean, ahead/behind Option)", () => {
    // Clean tree, no upstream (ahead/behind absent).
    expect(
      gitCard(
        deriveGitStatusView(
          status({ git: { branch: "main", dirty: false } }),
          undefined,
          false,
        ),
      ),
    ).toMatchObject({
      tone: "ok",
      detail: "main · clean",
    });
    // Dirty tree with an upstream configured → drift + a dirty mark (no count).
    expect(
      gitCard(
        deriveGitStatusView(
          status({ git: { branch: "main", ahead: 2, behind: 1, dirty: true } }),
          undefined,
          false,
        ),
      ),
    ).toMatchObject({ tone: "warn", detail: "main · ↑2 ↓1 dirty" });
    expect(gitCard(deriveGitStatusView(status({}), undefined, false)).tone).toBe(
      "down",
    );
  });

  it("renders core absence as a designed down state, not an error", () => {
    expect(
      coreCard(
        deriveCoreStatusView(status({ core: { reachable: false } }), undefined, false),
      ).tone,
    ).toBe("down");
    expect(
      coreCard(
        deriveCoreStatusView(
          status({ core: { reachable: true, vault_health: "green" } }),
          undefined,
          false,
        ),
      ).tone,
    ).toBe("ok");
  });

  // The rag rollup is driven by the interpreted RagStatusView the stores layer
  // derives — feed real status snapshots through deriveRagStatusView so the test
  // exercises the stores selector AND the card projection end to end (no raw
  // status interpretation in the card).
  it("renders rag stopped/absent as designed down states, not errors", () => {
    const stopped = deriveRagStatusView(
      status({
        rag: { service: "stopped" },
        tiers: { semantic: { available: true } },
      }),
      null,
      false,
    );
    expect(ragCardView(stopped)).toMatchObject({ tone: "down", detail: "stopped" });

    const absent = deriveRagStatusView(
      status({ tiers: { semantic: { available: true } } }),
      null,
      false,
    );
    expect(ragCardView(absent).tone).toBe("down");
  });

  it("states rag readiness as a composite (running + index + watcher)", () => {
    const ready = deriveRagStatusView(
      status({
        rag: { service: "running", watcher: "watching", index: "fresh", jobs: 2 },
        tiers: { semantic: { available: true } },
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

  it("treats an absent semantic tier in a served status block as degraded", () => {
    const degraded = deriveRagStatusView(
      status({
        rag: { service: "running", watcher: "watching", index: "fresh" },
        tiers: { structural: { available: true } },
      }),
      null,
      false,
    );

    expect(degraded).toMatchObject({
      degraded: true,
      ready: false,
      running: true,
    });
    expect(ragCardView(degraded).tone).toBe("warn");
  });

  it("projects now-strip chrome and card classes in the stores view", () => {
    const view = deriveNowStripView({
      engineUnreachable: false,
      degradations: ["semantic"],
      git: {
        ...deriveGitStatusView(
          status({ git: { branch: "main", dirty: false } }),
          undefined,
          false,
        ),
        retry: () => undefined,
      },
      core: deriveCoreStatusView(
        status({ core: { reachable: true, vault_health: "green" } }),
        undefined,
        false,
      ),
      rag: deriveRagStatusView(
        status({
          rag: { service: "running", watcher: "watching", index: "fresh", jobs: 1 },
          tiers: { semantic: { available: true } },
        }),
        null,
        false,
      ),
    });

    expect(view.rootClassName).toBe("space-y-fg-1 text-label");
    expect(view.liveRegionClassName).toBe("sr-only");
    expect(view.degradationClassName).toBe(
      "flex items-start gap-fg-1-5 text-state-broken",
    );
    expect(view.degradationIconClassName).toBe("mt-px shrink-0");
    expect(view.degradationLabel).toBe("degraded: semantic");
    expect(view.cards[2]).toMatchObject({ jobsLabel: "1 job" });
    expect(view.cards[2]!.card).toMatchObject({
      rootClassName:
        "flex items-center justify-between gap-fg-2 rounded-fg-md border px-fg-2 py-fg-1 shadow-fg-raised transition-colors duration-ui-fast ease-settle border-rule bg-paper-raised text-ink",
      identityClassName: "flex min-w-0 items-center gap-fg-1-5",
      leadMarkClassName: "shrink-0 text-ink-faint",
      labelClassName: "font-medium text-ink",
      detailRootClassName: "flex min-w-0 items-center gap-fg-1-5 text-label",
      detailClassName: "min-w-0 truncate text-ink-muted",
      jobsClassName:
        "shrink-0 rounded-fg-xs bg-paper-sunken px-fg-1 text-caption text-ink-muted",
      toneMarkClassName: "shrink-0 text-state-active",
      loadingMarkClassName: undefined,
    });

    const unreachable = deriveNowStripView({
      ...view,
      engineUnreachable: true,
      git: {
        ...deriveGitStatusView(status({}), undefined, false),
        retry: () => undefined,
      },
      core: deriveCoreStatusView(status({}), undefined, false),
      rag: deriveRagStatusView(status({}), null, false),
    });
    expect(unreachable.engineUnreachableClassName).toBe("text-label text-state-broken");
    expect(unreachable.engineCommandClassName).toBe("font-mono");
  });
});

describe("ops outcome classification (rag-manager ADR, stores-owned tier read)", () => {
  it("classifies a tiers-bearing EngineError as backend-down, not a plain failure", () => {
    const down = new EngineError("/ops/rag/reindex", 502, {
      tiers: { semantic: { available: false, reason: "rag service down" } },
    });
    expect(classifyOpsOutcome({ error: down })).toBe("backend-down");
  });

  it("classifies a tiers-less transport fault as a plain failure", () => {
    const fault = new EngineError("/ops/rag/reindex", 500, {});
    expect(classifyOpsOutcome({ error: fault })).toBe("failed");
    expect(classifyOpsOutcome({ error: new Error("boom") })).toBe("failed");
  });

  it("classifies a resolved stores result by its ok flag and tiers", () => {
    const up = { semantic: { available: true } };
    expect(classifyOpsOutcome({ ok: true, tiers: up })).toBe("ok");
    expect(classifyOpsOutcome({ ok: false, tiers: up })).toBe("failed");
    expect(
      classifyOpsOutcome({
        ok: true,
        tiers: { semantic: { available: false, reason: "rag service down" } },
      }),
    ).toBe("backend-down");
  });

  it("builds one stores-owned receipt projection for every ops surface", () => {
    const up = { semantic: { available: true } };
    const down = new EngineError("/ops/rag/reindex", 502, {
      tiers: { semantic: { available: false, reason: "rag service down" } },
    });
    expect(opsReceiptFromResult("reindex", { ok: true, tiers: up })).toEqual({
      verb: "reindex",
      tone: "ok",
      text: "ok",
    });
    expect(opsReceiptFromResult("reindex", { ok: false, tiers: up })).toEqual({
      verb: "reindex",
      tone: "failed",
      text: "failed",
    });
    expect(opsReceiptFromError("reindex", down)).toEqual({
      verb: "reindex",
      tone: "down",
      text: "rag is down — start it first",
    });
    expect(opsReceiptFromError("reindex", new Error("boom"))).toEqual({
      verb: "reindex",
      tone: "failed",
      text: "boom",
    });
  });
});

describe("ops whitelist (contract R1)", () => {
  it("is exactly the pillar-2 list — never grown GUI-side", () => {
    expect(OPS_WHITELIST.map((o) => `${o.target}:${o.verb}`)).toEqual([
      "core:vault-check",
      "core:vault-stats",
      "rag:server-start",
      "rag:server-stop",
      "rag:reindex",
      "rag:watcher-reconfigure",
    ]);
  });
});

describe("inspector tier grouping (G3.c)", () => {
  it("groups per tier in fixed order, excluding meta-edges", () => {
    const view = deriveInspectorNeighborTierView([
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
        tier: "temporal",
        confidence: 0.5,
      },
      {
        id: "m1",
        src: "a",
        dst: "d",
        relation: "related",
        tier: "temporal",
        confidence: 0.5,
        meta: { count: 2, breakdown_by_tier: { temporal: 2 } },
      },
    ]);
    expect(view.tierKeys).toEqual(["declared", "temporal"]);
    expect(view.tiers.get("temporal")!.map((e) => e.id)).toEqual(["e2"]);
  });
});
