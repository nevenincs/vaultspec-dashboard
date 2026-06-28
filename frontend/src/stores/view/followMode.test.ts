// Follow-mode selection-sync seam (follow-mode-selection-sync). The shared
// stores/view half: the view-local toggle, the rail-feature->graph compose gate,
// and the graph-node->rail reverse helper. SELECTION only — never a filter.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { toggleFollowModeAction } from "./chromeActions";
import { setSceneCommandRunner } from "./sceneCommandBridge";
import {
  followFeatureKeyForNode,
  followModeEnabled,
  selectFeatureAndFrame,
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
    expect(toggleFollowModeAction().label).toBe("Turn Off Follow Mode");
    setFollowMode(false);
    expect(toggleFollowModeAction().label).toBe("Turn On Follow Mode");
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

describe("selectFeatureAndFrame meta-selection (rail feature -> graph, Issue #16)", () => {
  it("is a no-op (no scene command) when follow mode is OFF", () => {
    setFollowMode(false);
    const ok = selectFeatureAndFrame("feature:x", ["doc:a", "doc:b"], "s");
    expect(ok).toBe(false);
    expect(sceneCommands).toEqual([]);
  });

  it("is a no-op when the feature has no member node ids", () => {
    setFollowMode(true);
    const ok = selectFeatureAndFrame("feature:x", [], "s");
    expect(ok).toBe(false);
    expect(sceneCommands).toEqual([]);
  });

  it("emits a VISUAL meta-highlight + frame (NO selection write) when on", () => {
    setFollowMode(true);
    const ok = selectFeatureAndFrame("feature:x", ["doc:a", "doc:b"], "s");
    expect(ok).toBe(true);
    // Exactly the two scene-visual commands; the meta-highlight + camera frame carry
    // the member set, and NOTHING writes the canonical selection (no set-selected).
    const kinds = sceneCommands.map((c) => (c as { kind: string }).kind);
    expect(kinds).toEqual(["set-meta-highlight", "frame-nodes"]);
    expect(kinds).not.toContain("set-selected");
    for (const c of sceneCommands) {
      expect([...(c as { ids: Set<string> }).ids]).toEqual(["doc:a", "doc:b"]);
    }
  });
});
