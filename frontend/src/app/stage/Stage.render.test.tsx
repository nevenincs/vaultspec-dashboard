// @vitest-environment happy-dom
//
// Dashboard-state centralization S42: graph/timeline selection intent must write
// the backend-owned dashboard selection, and right-rail subscribers must read
// that same canonical state through TanStack.

import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement, useRef } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  dashboardDocumentStateResetPatch,
  dashboardSelectionId,
} from "../../stores/server/dashboardState";
import type { EngineNode, LineageNode } from "../../stores/server/engine";
import { useActiveScope, useDashboardState } from "../../stores/server/queries";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { createLiveClient, liveScope } from "../../testing/liveClient";
import { handleNodeClick } from "../timeline/eventSelection";
import { getScene, useSceneSelectionBridge } from "./Stage";
import { restoredSessionContextSeed } from "../../stores/server/sessionContext";
import { ENGINE_WAIT } from "../../testing/timing";

async function realDocumentNode(scope: string): Promise<EngineNode> {
  const slice = await createLiveClient().graphQuery({ scope, granularity: "document" });
  const node = slice.nodes.find((entry) => entry.id.startsWith("doc:"));
  if (!node) {
    throw new Error("live Stage selection test fixture has no document node");
  }
  return node;
}

async function realFeatureNode(scope: string): Promise<EngineNode> {
  const slice = await createLiveClient().graphQuery({ scope, granularity: "feature" });
  const node = slice.nodes.find((entry) => entry.id.startsWith("feature:"));
  if (!node) {
    throw new Error("live Stage selection test fixture has no feature node");
  }
  return node;
}

function renderSelectionBridgeWithRightRailProbe() {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(SceneSelectionBridgeWithRightRailProbe),
    ),
  );
}

function RightRailSelectionProbe() {
  const activeScope = useActiveScope();
  const dashboardState = useDashboardState(activeScope);
  return (
    <output aria-label="right rail selected node">
      {dashboardSelectionId(dashboardState.data) ?? ""}
    </output>
  );
}

function SceneSelectionBridgeWithRightRailProbe() {
  const activeScope = useActiveScope();
  const sceneSelectionOriginatedRef = useRef(false);
  useSceneSelectionBridge(activeScope, sceneSelectionOriginatedRef);
  return <RightRailSelectionProbe />;
}

let scope: string;
let node: EngineNode;
let featureNode: EngineNode;

beforeAll(async () => {
  scope = await liveScope();
  node = await realDocumentNode(scope);
  featureNode = await realFeatureNode(scope);
});

beforeEach(async () => {
  queryClient.clear();
  useViewStore.getState().setScope(scope);
  await createLiveClient().patchDashboardState(dashboardDocumentStateResetPatch(scope));
});

afterEach(async () => {
  cleanup();
  queryClient.clear();
  await createLiveClient()
    .patchDashboardState(dashboardDocumentStateResetPatch(scope))
    .catch(() => undefined);
});

afterAll(() => {
  useViewStore.getState().setScope(null);
});

describe("Stage selection synchronization", () => {
  it("writes graph scene selection to dashboard-state and right-rail readers", async () => {
    renderSelectionBridgeWithRightRailProbe();

    act(() => {
      getScene().controller.emit({ kind: "select", id: node.id });
    });

    await waitFor(async () => {
      const state = await createLiveClient().dashboardState(scope);
      expect(state.selected_ids).toEqual([node.id]);
    }, ENGINE_WAIT);
    await waitFor(() => {
      expect(screen.getByLabelText("right rail selected node").textContent).toBe(
        node.id,
      );
    }, ENGINE_WAIT);
  });

  it("writes default feature-granularity scene selection to dashboard-state", async () => {
    await createLiveClient().patchDashboardState({
      ...dashboardDocumentStateResetPatch(scope),
      graph_granularity: "feature",
    });
    renderSelectionBridgeWithRightRailProbe();

    act(() => {
      getScene().controller.emit({ kind: "select", id: featureNode.id });
    });

    await waitFor(async () => {
      const state = await createLiveClient().dashboardState(scope);
      expect(state.selected_ids).toEqual([featureNode.id]);
    }, ENGINE_WAIT);
    await waitFor(() => {
      expect(screen.getByLabelText("right rail selected node").textContent).toBe(
        featureNode.id,
      );
    }, ENGINE_WAIT);
  });

  it("writes timeline mark selection to the same dashboard-state selection", async () => {
    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(RightRailSelectionProbe),
      ),
    );

    handleNodeClick(node as unknown as LineageNode, [], getScene().controller);

    await waitFor(async () => {
      const state = await createLiveClient().dashboardState(scope);
      expect(state.selected_ids).toEqual([node.id]);
    }, ENGINE_WAIT);
    await waitFor(() => {
      expect(screen.getByLabelText("right rail selected node").textContent).toBe(
        node.id,
      );
    }, ENGINE_WAIT);
    expect(useViewStore.getState().selection).toBeNull();
  });
});

describe("Stage session context restore", () => {
  const restoredSession = {
    workspace: "workspace-a",
    active_scope: "persisted-scope",
    active_workspace: "workspace-a",
    scope_context: {
      folder: "adr",
      feature_tags: ["scope-context"],
    },
    recents: [],
    tiers: {},
  };

  it("seeds restored session context when no in-session scope was picked", () => {
    expect(restoredSessionContextSeed(null, restoredSession)).toEqual({
      workspace: "workspace-a",
      scope: "persisted-scope",
      folder: "adr",
      featureTags: ["scope-context"],
      // editor-dock-workspace: the seed also restores the dock workspace tabs
      // from the durable session `workspace_layout` (absent here → no tabs).
      openDocs: [],
      activeDocId: null,
    });
  });

  it("does not let a late session restore overwrite an explicit scope pick", () => {
    expect(restoredSessionContextSeed("picked-scope", restoredSession)).toBeNull();
  });
});
