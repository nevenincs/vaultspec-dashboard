import { describe, expect, it } from "vitest";

import type { EngineEdge, EngineNode, NodeEvidence } from "../server/engine";
import {
  deriveInspectorNeighborTierView,
  type NodeDetailView,
} from "../server/queries";
import {
  deriveInspectorEdgeTierView,
  deriveInspectorEvidenceView,
  deriveInspectorPropertyRows,
  deriveInspectorView,
  eventTouchSummary,
} from "./inspector";

describe("inspector view projection", () => {
  const node: EngineNode = {
    id: "doc:adr-1",
    kind: "adr",
    title: "ADR one",
    lifecycle: { state: "accepted", progress: { done: 1, total: 2 } },
  };
  const readyDetail: NodeDetailView = {
    state: "ready",
    detail: { node, tiers: {} },
    node,
  };
  const tiers = {} as NodeEvidence["tiers"];
  const evidence: NodeEvidence = {
    documents: [
      { path: ".vault/research/2026-topic-research.md", doc_type: "research" },
      { path: ".vault/adr/2026-topic-adr.md", doc_type: "adr" },
      { path: ".vault/plan/2026-topic-plan.md", doc_type: "plan" },
      { path: ".vault/exec/2026-topic-exec.md", doc_type: "exec" },
      { path: ".vault/audit/2026-topic-audit.md", doc_type: "audit" },
      { path: ".vault/archive/extra.md", doc_type: "archive" },
    ],
    code_locations: [],
    commits: [{ sha: "abcdef123456", subject: "land inspector", rule: "touches-doc" }],
    tiers,
  };

  function edge(id: string, tier: EngineEdge["tier"]): EngineEdge {
    return {
      id,
      src: "doc:adr-1",
      dst: `doc:${id}`,
      relation: "relates",
      tier,
      confidence: 0.75,
    };
  }

  it("projects empty, event, and edge selections without node reads", () => {
    const empty = deriveInspectorView(
      null,
      { state: "idle", detail: null, node: null },
      undefined,
      deriveInspectorNeighborTierView(undefined),
    );
    expect(empty).toMatchObject({
      state: "empty",
      nodeId: null,
      tierKeys: [],
      message: "select something to inspect",
      messageClassName: "text-body text-ink-faint",
    });

    const event = deriveInspectorView(
      { kind: "event", id: "commit:1", nodeIds: ["doc:a"] },
      { state: "idle", detail: null, node: null },
      undefined,
      deriveInspectorNeighborTierView(undefined),
    );
    expect(event).toMatchObject({
      state: "event",
      event: { id: "commit:1", nodeIds: ["doc:a"] },
      headerLabel: "event commit:1",
      summaryLabel: "touches doc:a",
      rootClassName: "text-body",
      headerClassName: "font-medium text-ink",
      summaryClassName: "text-ink-muted",
    });

    const selectedEdge = deriveInspectorView(
      { kind: "edge", id: "edge:1" },
      { state: "idle", detail: null, node: null },
      undefined,
      deriveInspectorNeighborTierView(undefined),
    );
    expect(selectedEdge).toMatchObject({
      state: "edge",
      edge: { id: "edge:1" },
      headerLabel: "edge edge:1",
      rootClassName: "text-body",
      headerClassName: "font-medium text-ink",
    });
  });

  it("projects a ready node with bounded evidence, tier groups, and presentation", () => {
    const neighborTiers = deriveInspectorNeighborTierView([
      edge("declared-1", "declared"),
      edge("temporal-1", "temporal"),
    ]);

    const view = deriveInspectorView(
      { kind: "node", id: node.id },
      readyDetail,
      evidence,
      neighborTiers,
    );

    expect(view.state).toBe("ready");
    if (view.state !== "ready") throw new Error("expected ready inspector view");
    expect(view.node).toBe(node);
    expect(view.nodeId).toBe(node.id);
    expect(view.nodeTitle).toBe("ADR one");
    expect(view.nodeTitleAttribute).toBe("doc:adr-1");
    expect(view.nodeAriaLabel).toBe("node ADR one");
    expect(view.nodeEntityTitle).toBe("ADR one");
    expect(view.evidenceSectionLabel).toBe("Evidence");
    expect(view.edgeSectionLabel).toBe("Edges by tier");
    expect(view).toMatchObject({
      rootClassName: "space-y-fg-2 text-body",
      nodePanelClassName:
        "rounded-fg-xs focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      nodeTitleClassName: "truncate font-serif text-title text-ink",
      propertyListClassName: "mt-fg-1",
      evidenceSectionClassName: "text-label",
      edgeSectionClassName: "text-label",
      sectionLabelClassName: "mb-fg-0-5",
      evidenceListClassName: "space-y-fg-0-5 text-ink-muted",
      evidenceItemClassName: "truncate",
      evidenceRuleClassName: "text-ink-faint",
      tierGroupClassName: "mb-fg-0-5",
      tierButtonClassName:
        "flex items-center gap-fg-1 rounded-fg-xs text-ink-muted transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      tierListClassName: "ml-fg-3 mt-fg-0-5 space-y-fg-0-5 text-ink-muted",
      tierEdgeButtonClassName: "truncate text-left hover:underline",
    });
    expect(view.propertyRows).toEqual([
      { label: "kind", value: "adr" },
      { label: "state", value: "accepted" },
      { label: "progress", value: "1/2", tabular: true },
    ]);
    expect(view.tierKeys).toEqual(["declared", "temporal"]);
    expect(view.tiers.get("declared")?.[0]).toMatchObject({
      id: "declared-1",
      label: "relates -> declared-1",
      confidenceLabel: null,
      displayLabel: "relates -> declared-1",
    });
    expect(view.tiers.get("temporal")?.[0]).toMatchObject({
      id: "temporal-1",
      label: "relates -> temporal-1",
      confidenceLabel: "75%",
      displayLabel: "relates -> temporal-1 · 75%",
    });
    expect(view.evidence?.documents).toHaveLength(5);
    expect(view.evidence?.documents[0]).toEqual({
      key: ".vault/research/2026-topic-research.md",
      title: ".vault/research/2026-topic-research.md",
      label: "research: 2026-topic-research.md",
    });
    expect(view.evidence?.commits[0]).toEqual({
      key: "abcdef123456",
      title: "land inspector",
      label: "commit abcdef1: land inspector",
      rule: "touches-doc",
    });
  });

  it("keeps loading and unavailable node states explicit", () => {
    const loading = deriveInspectorView(
      { kind: "node", id: node.id },
      { state: "loading", detail: null, node: null },
      undefined,
      deriveInspectorNeighborTierView([edge("declared-1", "declared")]),
    );
    expect(loading).toMatchObject({
      state: "loading",
      nodeId: node.id,
      tierKeys: ["declared"],
      message: "inspecting...",
      messageClassName: "text-body text-ink-faint",
    });

    const unavailable = deriveInspectorView(
      { kind: "node", id: node.id },
      { state: "unavailable", detail: null, node: null },
      undefined,
      deriveInspectorNeighborTierView(undefined),
    );
    expect(unavailable).toMatchObject({
      state: "unavailable",
      nodeId: node.id,
      tierKeys: [],
      message: "node unavailable",
      messageClassName: "text-body text-state-broken",
    });
  });

  it("does not render a ready node payload for a different canonical selection", () => {
    const view = deriveInspectorView(
      { kind: "node", id: "doc:selected" },
      readyDetail,
      evidence,
      deriveInspectorNeighborTierView([edge("declared-1", "declared")]),
    );

    expect(view).toMatchObject({
      state: "loading",
      nodeId: "doc:selected",
      tierKeys: ["declared"],
      message: "inspecting...",
      messageClassName: "text-body text-ink-faint",
    });
  });

  it("projects no evidence section until the evidence query serves", () => {
    expect(deriveInspectorEvidenceView(undefined)).toBeNull();
  });

  it("derives bounded event summaries and node property rows in the view model", () => {
    expect(eventTouchSummary(["commit:big", "doc:a"], 87)).toBe(
      "touches commit:big, doc:a +87 more",
    );
    expect(eventTouchSummary(["doc:a"], 0)).toBe("touches doc:a");
    expect(eventTouchSummary(["doc:a"])).toBe("touches doc:a");

    expect(
      deriveInspectorPropertyRows({
        id: "doc:modified",
        kind: "doc",
        dates: { modified: "2026-06-19T10:11:12Z" },
      }),
    ).toEqual([
      { label: "kind", value: "doc" },
      { label: "modified", value: "2026-06-19" },
    ]);
  });

  it("derives inspector edge row labels inside the view model", () => {
    const rows = deriveInspectorEdgeTierView(
      deriveInspectorNeighborTierView([
        {
          ...edge("feature-auth", "temporal"),
          dst: "feature:auth",
          state: "resolved",
          confidence: 0.831,
        },
      ]).tiers,
    );

    expect(rows.get("temporal")).toEqual([
      {
        id: "feature-auth",
        relation: "relates",
        dst: "feature:auth",
        tier: "temporal",
        label: "relates -> auth",
        stateLabel: "(resolved)",
        confidenceLabel: "83%",
        displayLabel: "relates -> auth (resolved) · 83%",
      },
    ]);
  });
});
