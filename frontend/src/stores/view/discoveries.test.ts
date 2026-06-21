import { beforeAll, afterEach, describe, expect, it } from "vitest";

import { createLiveClient, liveScope } from "../../testing/liveClient";
import {
  closeDiscoveryPanel,
  discoveryCandidateRows,
  normalizeDiscoveryPanelTarget,
  normalizeDiscoveryEdges,
  normalizePinnedDiscoveries,
  openDiscoveryPanel,
  pinDiscoveryCandidate,
  resetDiscoveryPanel,
  selectDiscoveryCandidate,
  unpinDiscoveryCandidate,
  useDiscoveryPanelStore,
} from "./discoveries";
import { DISCOVERY_EDGE_ID_MAX_CHARS } from "./discoveryEdges";
import { selectEvent } from "./selection";
import { PINNED_DISCOVERIES_CAP, useViewStore } from "./viewStore";

let scope: string;
let documentNodeId: string;

beforeAll(async () => {
  scope = await liveScope();
  const slice = await createLiveClient().graphQuery({ scope, granularity: "document" });
  const node = slice.nodes.find((entry) => entry.id.startsWith("doc:"));
  if (!node) {
    throw new Error("live discovery test fixture has no document node");
  }
  documentNodeId = node.id;
});

afterEach(async () => {
  await createLiveClient()
    .patchDashboardState({ scope, selected_ids: [], hovered_id: null })
    .catch(() => undefined);
  useViewStore.getState().selectEntity(null);
  useViewStore.getState().setScope(null);
  resetDiscoveryPanel();
});

describe("discovery intent seam", () => {
  it("opens, closes, and resets the discovery panel target through one seam", () => {
    openDiscoveryPanel("doc:alpha");
    expect(useDiscoveryPanelStore.getState().openFor).toBe("doc:alpha");

    closeDiscoveryPanel();
    expect(useDiscoveryPanelStore.getState().openFor).toBeNull();

    openDiscoveryPanel("doc:beta");
    resetDiscoveryPanel();
    expect(useDiscoveryPanelStore.getState().openFor).toBeNull();
  });

  it("normalizes discovery panel targets through the shared graph-id seam", () => {
    expect(normalizeDiscoveryPanelTarget(" doc:alpha ")).toBe("doc:alpha");
    expect(normalizeDiscoveryPanelTarget("   ")).toBeNull();

    openDiscoveryPanel(" doc:alpha ");
    expect(useDiscoveryPanelStore.getState().openFor).toBe("doc:alpha");

    openDiscoveryPanel("   ");
    expect(useDiscoveryPanelStore.getState().openFor).toBe("doc:alpha");

    openDiscoveryPanel(null);
    expect(useDiscoveryPanelStore.getState().openFor).toBe("doc:alpha");
  });

  it("selects candidates through canonical dashboard-state", async () => {
    useViewStore.getState().setScope(null);
    selectEvent("evt-stale", ["doc:old"]);
    await createLiveClient().patchDashboardState({ scope, selected_ids: [] });

    await expect(selectDiscoveryCandidate(documentNodeId, scope)).resolves.toBe(true);

    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      selected_ids: [documentNodeId],
    });
    expect(useViewStore.getState().selection).toBeNull();
  });

  it("normalizes candidate selection scope before dashboard-state writes", async () => {
    useViewStore.getState().setScope(null);
    await createLiveClient().patchDashboardState({ scope, selected_ids: [] });

    await expect(
      selectDiscoveryCandidate(` ${documentNodeId} `, ` ${scope} `),
    ).resolves.toBe(true);

    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      selected_ids: [documentNodeId],
    });

    await expect(selectDiscoveryCandidate(documentNodeId, { scope })).resolves.toBe(
      false,
    );

    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      selected_ids: [documentNodeId],
    });
  });

  it("drops malformed candidate selection ids before dashboard-state writes", async () => {
    await createLiveClient().patchDashboardState({ scope, selected_ids: [] });

    await expect(selectDiscoveryCandidate(null, scope)).resolves.toBe(false);

    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      selected_ids: [],
    });
  });

  it("projects discovery candidate row labels and pin state behind the seam", () => {
    const candidate = {
      id: "edge:semantic",
      src: "doc:source",
      dst: "feature:target",
      relation: "related",
      tier: "temporal" as const,
      confidence: 0.874,
    };

    expect(discoveryCandidateRows([candidate], [candidate])).toEqual([
      {
        candidate,
        targetLabel: "target",
        confidenceLabel: "87%",
        pinned: true,
      },
    ]);
    expect(discoveryCandidateRows([candidate], [])[0]?.pinned).toBe(false);
  });

  it("normalizes discovery edge rows before presentation", () => {
    const overlongId = "e".repeat(DISCOVERY_EDGE_ID_MAX_CHARS + 1);
    const rows = discoveryCandidateRows(
      [
        {
          id: " edge:semantic ",
          src: " doc:source ",
          dst: " feature:target ",
          relation: "related",
          tier: "temporal" as const,
          confidence: 1.7,
        },
        {
          id: "edge:semantic",
          src: "doc:source",
          dst: "feature:duplicate",
          relation: "related",
          tier: "temporal" as const,
          confidence: 0.5,
        },
        {
          id: "edge:invalid",
          src: "",
          dst: "feature:target",
          relation: "related",
          tier: "temporal" as const,
          confidence: Number.NaN,
        },
        {
          id: overlongId,
          src: "doc:source",
          dst: "feature:overlong",
          relation: "related",
          tier: "temporal" as const,
          confidence: 0.9,
        },
      ],
      [
        {
          id: " edge:semantic ",
          src: " doc:pinned-source ",
          dst: " feature:pinned-target ",
          relation: "related",
          tier: "temporal" as const,
          confidence: Number.POSITIVE_INFINITY,
        },
      ],
    );

    expect(rows).toEqual([
      {
        candidate: expect.objectContaining({
          id: "edge:semantic",
          src: "doc:source",
          dst: "feature:target",
          confidence: 1,
        }),
        targetLabel: "target",
        confidenceLabel: "100%",
        pinned: true,
      },
    ]);
  });

  it("normalizes session-pinned discoveries as a bounded most-recent read model", () => {
    const raw = [
      {
        id: "old",
        src: "doc:old",
        dst: "feature:old",
        relation: "related",
        tier: "temporal" as const,
        confidence: 0.1,
      },
      ...Array.from({ length: PINNED_DISCOVERIES_CAP + 3 }, (_, i) => ({
        id: `edge:${i}`,
        src: ` doc:${i} `,
        dst: ` feature:${i} `,
        relation: "related",
        tier: "temporal" as const,
        confidence: i / 100,
      })),
      {
        id: "edge:52",
        src: "doc:duplicate-tail",
        dst: "feature:duplicate-tail",
        relation: "related",
        tier: "temporal" as const,
        confidence: 0.7,
      },
      {
        id: "invalid",
        src: "   ",
        dst: "feature:bad",
        relation: "related",
        tier: "temporal" as const,
        confidence: 0.5,
      },
    ];

    const normalized = normalizePinnedDiscoveries(raw);

    expect(normalized).toHaveLength(PINNED_DISCOVERIES_CAP);
    expect(normalized.some((edge) => edge.id === "old")).toBe(false);
    expect(normalized.some((edge) => edge.id === "invalid")).toBe(false);
    expect(normalized.at(-1)).toEqual(
      expect.objectContaining({
        id: "edge:52",
        src: "doc:duplicate-tail",
        dst: "feature:duplicate-tail",
      }),
    );
    expect(normalized.filter((edge) => edge.id === "edge:52")).toHaveLength(1);
  });

  it("normalizes discovery edge ids on unpin intent", () => {
    useViewStore.setState({
      pinnedDiscoveries: normalizeDiscoveryEdges([
        {
          id: "edge:semantic",
          src: "doc:source",
          dst: "feature:target",
          relation: "related",
          tier: "temporal" as const,
          confidence: 0.8,
        },
      ]),
    });

    unpinDiscoveryCandidate(" edge:semantic ");

    expect(useViewStore.getState().pinnedDiscoveries).toEqual([]);

    unpinDiscoveryCandidate(null);
    expect(useViewStore.getState().pinnedDiscoveries).toEqual([]);
  });

  it("normalizes discovery edge ids before pinning into the view store", () => {
    pinDiscoveryCandidate({
      id: " edge:semantic ",
      src: " doc:source ",
      dst: " feature:target ",
      relation: "related",
      tier: "temporal",
      confidence: 0.8,
    });
    pinDiscoveryCandidate({
      id: "edge:semantic",
      src: "doc:source",
      dst: "feature:target",
      relation: "related",
      tier: "temporal",
      confidence: 0.8,
    });

    expect(useViewStore.getState().pinnedDiscoveries).toEqual([
      expect.objectContaining({
        id: "edge:semantic",
        src: "doc:source",
        dst: "feature:target",
      }),
    ]);

    unpinDiscoveryCandidate(" edge:semantic ");
    expect(useViewStore.getState().pinnedDiscoveries).toEqual([]);
  });
});
