// Follow-mode selection-sync seam (follow-mode-selection-sync). The shared
// stores/view half: the view-local toggle, the rail-feature->graph compose gate,
// and the graph-node->rail reverse helper. SELECTION only — never a filter.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { toggleFollowModeAction } from "./chromeActions";
import { setSceneCommandRunner } from "./sceneCommandBridge";
import {
  followFeatureKeyForNode,
  followModeEnabled,
  selectFeature,
  setFollowMode,
  toggleFollowMode,
} from "./selection";
import { useViewStore } from "./viewStore";

// Capture scene commands the seam forwards through the REAL bridge (the same seam
// the app registers at shell top) — not a scene mock. An OFF/empty gate must forward
// nothing.
const sceneCommands: unknown[] = [];

beforeEach(() => {
  sceneCommands.length = 0;
  setSceneCommandRunner((cmd) => sceneCommands.push(cmd));
});

afterEach(() => {
  setSceneCommandRunner(null);
  setFollowMode(true); // restore the default-ON for the next test
});

describe("follow mode toggle (view-local, default ON)", () => {
  it("defaults to ON", () => {
    expect(followModeEnabled()).toBe(true);
    expect(useViewStore.getState().followMode).toBe(true);
  });

  it("toggles and sets explicitly", () => {
    toggleFollowMode();
    expect(followModeEnabled()).toBe(false);
    toggleFollowMode();
    expect(followModeEnabled()).toBe(true);
    setFollowMode(false);
    expect(followModeEnabled()).toBe(false);
  });

  it("the shared toggle action's label reflects the resulting action", () => {
    setFollowMode(true);
    expect(toggleFollowModeAction().label).toEqual({
      key: "common:actions.disableFollowMode",
    });
    setFollowMode(false);
    expect(toggleFollowModeAction().label).toEqual({
      key: "common:actions.enableFollowMode",
    });
    expect(toggleFollowModeAction().id).toBe("view:follow-mode");
  });
});

describe("followFeatureKeyForNode (graph node -> rail feature key)", () => {
  it("maps a feature node id to its own tag", () => {
    expect(followFeatureKeyForNode("feature:dashboard-timeline")).toBe(
      "dashboard-timeline",
    );
  });

  it("maps a doc node to its FIRST feature tag", () => {
    expect(followFeatureKeyForNode("doc:2026-foo-adr", ["alpha", "beta"])).toBe(
      "alpha",
    );
  });

  it("is null with no feature info, a null id, or follow mode off", () => {
    expect(followFeatureKeyForNode("doc:2026-foo-adr")).toBeNull();
    expect(followFeatureKeyForNode("doc:2026-foo-adr", [])).toBeNull();
    expect(followFeatureKeyForNode(null)).toBeNull();
    setFollowMode(false);
    expect(followFeatureKeyForNode("feature:x")).toBeNull();
  });
});

describe("selectFeature canonical selection (rail feature -> global state)", () => {
  // selectFeature now writes the ONE canonical selection (`selected_ids = [feature:<tag>]`)
  // instead of a scene-only meta-highlight (feature-selection-global-state, reversing #16).
  // The durable cluster spotlight + follow-gated frame are DERIVED from that selection by
  // `projectDashboardSelectionToScene` (covered in selection.test.ts), so this seam itself
  // emits no scene command. A blank tag is a no-op; follow mode no longer gates the SELECTION
  // (it is the global authority) — only the camera frame in the scene projection.
  it("no-ops (no selection write) for a blank/unnormalizable tag", async () => {
    expect(await selectFeature("")).toBe(false);
    expect(await selectFeature("#")).toBe(false);
    expect(await selectFeature(null)).toBe(false);
    expect(sceneCommands).toEqual([]);
  });
});
