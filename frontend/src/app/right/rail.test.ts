import { describe, expect, it } from "vitest";

import { EngineError } from "../../stores/server/engine";
import { OPS_WHITELIST } from "../../stores/server/opsActions";
import {
  classifyOpsOutcome,
  deriveInspectorNeighborTierView,
  deriveStatusTabSectionsView,
  opsReceiptFromError,
  opsReceiptFromResult,
} from "../../stores/server/queries";
import { CONTROL_PANEL_IDS, FOOTER_CHIP_IDS } from "../../stores/view/controlPanels";
import { normalizeStatusSectionId } from "../../stores/view/statusTabChrome";
import {
  RIGHT_RAIL_TABS,
  RIGHT_RAIL_TAB_PRESENTATION,
} from "../../stores/view/shellLayout";

describe("rail tab strip IA (binding Figma ActivityRail 244:753)", () => {
  it("is exactly Status, Changes in that order", () => {
    // The figma-frontend-rewrite ActivityRail board (244:753) shows the label-only
    // tabs in this order. The vestigial Search tab was deleted with the dead
    // right-rail search pillar (search-providers ADR D3): search is the Cmd+K
    // plane, not a rail tab. Status is the primary (leading) tab.
    expect(RIGHT_RAIL_TABS).toEqual([
      RIGHT_RAIL_TAB_PRESENTATION.status,
      RIGHT_RAIL_TAB_PRESENTATION.changes,
    ]);
    expect(RIGHT_RAIL_TAB_PRESENTATION).toEqual({
      status: {
        id: "status",
        label: { key: "common:activityTabs.status" },
        actionLabel: { key: "common:actions.showStatus" },
      },
      changes: {
        id: "changes",
        label: { key: "common:activityTabs.changes" },
        actionLabel: { key: "common:actions.showChanges" },
      },
    });
  });

  it("renders every tab label-only — the board carries no leading tab marks", () => {
    // The binding board paints the tabs as plain labels with an accent underline;
    // none carries a leading glyph.
    expect(
      Object.values(RIGHT_RAIL_TAB_PRESENTATION).every(
        (presentation) => !("mark" in presentation),
      ),
    ).toBe(true);
  });
});

describe("status-only rail composition (activity-rail-realignment ADR D1/D3)", () => {
  it("its populated status sections are exactly Plans, Pull requests, Issues, Commits", () => {
    // The rail is status-only: the four derived section cards (Changes rides above
    // them as a structural fold, and the footer cluster below). The two admin
    // consoles moved into modal control panels, so no admin SectionCard is derived.
    const sections = deriveStatusTabSectionsView({
      openPlans: 3,
      openPrs: 2,
      openIssues: 1,
    });
    expect([
      sections.openPlans,
      sections.pullRequests,
      sections.openIssues,
      sections.recentCommits,
    ]).toEqual([
      {
        id: "open-plans",
        title: { key: "common:finalWave.statusSections.plans" },
        count: 3,
      },
      {
        id: "pull-requests",
        title: { key: "common:finalWave.statusSections.pullRequests" },
        count: 2,
      },
      {
        id: "open-issues",
        title: { key: "common:finalWave.statusSections.issues" },
        count: 1,
      },
      {
        id: "recent-commits",
        title: { key: "common:finalWave.statusSections.commits" },
      },
    ]);
  });

  it("no longer resolves the retired admin rail-section ids", () => {
    // The `rag-ops` and `authoring-review` rail-section ids retired with the eviction
    // (ADR D1); `rag-ops:details` then retired too when the rag job dashboard replaced
    // the console outright (rag-job-dashboard ADR D1) — its view state lives in its own
    // view-local store, so no rail-section id survives for it. The normalizer drops all
    // three, so a persisted/legacy blob can never re-mount a retired fold.
    expect(normalizeStatusSectionId("rag-ops")).toBeNull();
    expect(normalizeStatusSectionId("authoring-review")).toBeNull();
    expect(normalizeStatusSectionId("rag-ops:details")).toBeNull();
    // The live status sub-folds still resolve.
    expect(normalizeStatusSectionId("open-plans")).toBe("open-plans");
    expect(normalizeStatusSectionId("pull-requests")).toBe("pull-requests");
    expect(normalizeStatusSectionId("open-issues")).toBe("open-issues");
    expect(normalizeStatusSectionId("recent-commits")).toBe("recent-commits");
  });

  it("registers four modal panels and pins three footer chips (review is not modal)", () => {
    // Review is no longer a modal control panel (review-surface-flow ADR F1): its
    // queue folded into the Agent panel as a pending-changes view, so `approvals`
    // is a footer-chip id only. The modal set is the three global consoles plus the
    // agent-service lifecycle panel (a2a-product-provisioning W05.P12), a modal
    // identity that is deliberately NOT a footer chip.
    expect(CONTROL_PANEL_IDS).toEqual([
      "search-service",
      "backend-health",
      "vault-health",
      "agent-service",
    ]);
    // The footer cluster keeps its three chips UNCHANGED: Search service and Vault
    // health open their modal panels; the Review chip opens the Agent pending view.
    // Backend health and the agent-service panel are NOT footer chips — they surface
    // only through the palette.
    expect(FOOTER_CHIP_IDS).toEqual(["search-service", "approvals", "vault-health"]);
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
