// The unified activate-entity seam (unified-selection plane). These cover the
// engine-free branches — the pure surface resolver, the `feature:` descent fork, and
// the reject paths — asserting the seam never opens a tab / touches the scene / the
// working set on a feature descent or a non-addressable id. The document-open branch
// (a)+(b)+(c) drives the #15 tab seam against the live engine and is covered in the
// live activation pass (mock-mirrors-live-wire-shape: no engine double here).

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { activateEntity, activationSurfaceForNodeId } from "./activateEntity";
import { setSceneCommandRunner } from "./sceneCommandBridge";
import { useViewStore } from "./viewStore";

const sceneCommands: unknown[] = [];

beforeEach(() => {
  sceneCommands.length = 0;
  setSceneCommandRunner((cmd) => sceneCommands.push(cmd));
  useViewStore.getState().clearWorkingSet();
});

afterEach(() => {
  setSceneCommandRunner(null);
  useViewStore.getState().clearWorkingSet();
});

describe("activationSurfaceForNodeId", () => {
  it("maps doc:/code: nodes to their viewer and everything else to null", () => {
    expect(activationSurfaceForNodeId("doc:2026-foo-plan")).toBe("markdown");
    expect(activationSurfaceForNodeId("code:src/main.rs")).toBe("code");
    expect(activationSurfaceForNodeId("feature:dashboard")).toBeNull();
    expect(activationSurfaceForNodeId("event:abc")).toBeNull();
    expect(activationSurfaceForNodeId("nonsense")).toBeNull();
  });
});

describe("activateEntity feature + reject branches (engine-free)", () => {
  it("descends the slice for a feature node — no tab, no scene frame, no working-set", async () => {
    const descended: unknown[] = [];
    const ok = await activateEntity("feature:dashboard-timeline", "scope-1", {
      frame: true,
      featureDescent: {
        descendFeatureTag: (t) => (descended.push(t), Promise.resolve()),
      },
    });
    expect(ok).toBe(true);
    expect(descended).toEqual(["dashboard-timeline"]);
    // A feature node carries no document and never frames as a doc: no scene command,
    // no working-set materialize.
    expect(sceneCommands).toEqual([]);
    expect(useViewStore.getState().workingSet).toEqual([]);
  });

  it("rejects a feature node with no descent intent (no-op)", async () => {
    const ok = await activateEntity("feature:x", "scope-1", { frame: true });
    expect(ok).toBe(false);
    expect(sceneCommands).toEqual([]);
    expect(useViewStore.getState().workingSet).toEqual([]);
  });

  it("rejects a null / non-addressable id (no-op)", async () => {
    expect(await activateEntity(null, "scope-1", { frame: true })).toBe(false);
    expect(await activateEntity("event:xyz", "scope-1", { frame: true })).toBe(false);
    expect(sceneCommands).toEqual([]);
    expect(useViewStore.getState().workingSet).toEqual([]);
  });
});
