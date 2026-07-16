// Pure-logic tests for the hover-card host (figma-parity-reconciliation
// W03.P08.S50; binding graph/HoverCard 84:2): the canonical dashboard hover
// projection, dwell→suppress resolution, and the binding evidence-driven card
// projection. No DOM — these exercise the host's pure seams directly, isolating
// the three-intent separation, the open-suppression law, and the identity+evidence
// fold from the timer/render machinery (covered in the .render.test.tsx).

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { EngineNode, NodeEvidence } from "../../stores/server/engine";
import { createLiveClient, liveScope } from "../../testing/liveClient";
import { activateEntity } from "../../stores/view/activateEntity";
import { useViewStore } from "../../stores/view/viewStore";
import {
  cardModelFromEvidence,
  deriveHoverCardLayerView,
  deriveHoverCardView,
} from "../../stores/view/hoverCard";

let scope: string;
let documentNodeId: string;

beforeAll(async () => {
  scope = await liveScope();
  const slice = await createLiveClient().graphQuery({ scope, granularity: "document" });
  const node = slice.nodes.find((entry) => entry.id.startsWith("doc:"));
  if (!node) {
    throw new Error("live hover-card test fixture has no document node");
  }
  documentNodeId = node.id;
});

afterEach(async () => {
  // Reset opened islands + dock tabs between cases (the store is a singleton).
  useViewStore.setState({ openedIds: [], openDocs: [], activeDocId: null });
  await createLiveClient()
    .patchDashboardState({ scope, selected_ids: [], hovered_id: null })
    .catch(() => undefined);
});

describe("deriveHoverCardLayerView — dwell gate + open suppression (P04.S15)", () => {
  it("returns null when nothing is dwelled", () => {
    expect(deriveHoverCardLayerView(null, []).targetId).toBeNull();
  });

  it("returns the dwelled id when it is not opened", () => {
    expect(deriveHoverCardLayerView("doc:adr-1", ["doc:other"]).targetId).toBe(
      "doc:adr-1",
    );
  });

  it("SUPPRESSES the card when the dwelled id is already opened", () => {
    // The opened interior already shows everything the card would — no coexistence.
    expect(deriveHoverCardLayerView("doc:adr-1", ["doc:adr-1"]).targetId).toBeNull();
  });

  it("projects the hover-card host chrome", () => {
    expect(deriveHoverCardLayerView("doc:adr-1", [])).toMatchObject({
      rootClassName: "pointer-events-none absolute inset-0 overflow-hidden",
      cardShellClassName: "pointer-events-none",
    });
  });
});

describe("hover-card open — canonical dock-tab activation", () => {
  it("opens the document as a dock tab and writes dashboard-state selection", async () => {
    // The hover-card open routes through the canonical activateEntity seam (D1): it
    // opens the #15 dock tab (permanent — same as a double-click/open) instead of the
    // retired on-canvas island, and writes the canonical selection.
    await activateEntity(documentNodeId, scope, { permanent: true, frame: false });

    expect(
      useViewStore
        .getState()
        .openDocs.some((d) => d.nodeId === documentNodeId && d.provisional === false),
    ).toBe(true);
    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      selected_ids: [documentNodeId],
    });
    expect(useViewStore.getState().selection).toBeNull();
  });
});

describe("cardModelFromEvidence — binding identity+evidence projection (S50)", () => {
  const adr: EngineNode = {
    id: "doc:2026-01-05-editor-demo-adr",
    kind: "adr",
    title: "Editor demo adr",
    status_value: "accepted",
    status_class: "affirmed",
    authority_class: "design",
    lifecycle: { state: "complete" },
  };

  const tiers = {} as NodeEvidence["tiers"];

  const evidence: NodeEvidence = {
    documents: [{ path: ".vault/research/2026-foo-research.md", doc_type: "research" }],
    code_locations: [
      { path: "src/lib.rs", symbol: "build", line: 42, state: "resolved" },
    ],
    commits: [{ sha: "abcdef1234", subject: "land it" }],
    tiers,
  };

  it("projects internal intent, authored title, and closed presentation", () => {
    const model = cardModelFromEvidence(adr, evidence)!;
    expect(model.id).toBe(adr.id);
    expect(model.markKind).toBe("adr");
    expect(model.typeLabel).toEqual({ key: "documents:documentTypes.adr" });
    expect(model.title).toBe("Editor demo adr");
    expect(model.category).toBe("adr");
  });

  it("reduces enriched evidence to safe counts and authored subjects", () => {
    const model = cardModelFromEvidence(adr, evidence)!;
    expect(model.evidence).toEqual({
      documentCount: 1,
      codeLocationCount: 1,
      commitCount: 1,
      commitSubjects: ["land it"],
    });
    expect(JSON.stringify(model)).not.toContain(".vault/research");
    expect(JSON.stringify(model)).not.toContain("src/lib.rs");
    expect(JSON.stringify(model)).not.toContain("abcdef1234");
  });

  it("uses zero semantic counts when evidence is absent or empty", () => {
    expect(cardModelFromEvidence(adr, undefined)!.evidence).toMatchObject({
      documentCount: 0,
      codeLocationCount: 0,
      commitCount: 0,
    });
    expect(
      cardModelFromEvidence(adr, {
        documents: [],
        code_locations: [],
        commits: [],
        tiers,
      })!.evidence,
    ).toMatchObject({ documentCount: 0, codeLocationCount: 0, commitCount: 0 });
  });

  it("fails closed instead of falling back to the id for a missing title", () => {
    const bare: EngineNode = { id: "doc:research-1", kind: "research" };
    expect(cardModelFromEvidence(bare, undefined)).toBeNull();
    expect(cardModelFromEvidence({ ...bare, title: "   " }, undefined)).toBeNull();
  });

  it("drops a served node payload that does not match the hovered identity", () => {
    expect(deriveHoverCardView("doc:hovered", adr, evidence)).toEqual({
      model: null,
    });
  });

  it("normalizes runtime hovered identity before matching served node detail", () => {
    expect(deriveHoverCardView(` ${adr.id} `, adr, evidence).model).toMatchObject({
      id: adr.id,
      markKind: "adr",
    });
    expect(deriveHoverCardView({ id: adr.id }, adr, evidence)).toEqual({
      model: null,
    });
  });
});
