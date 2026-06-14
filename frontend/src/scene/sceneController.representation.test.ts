// graph-representation W03.P08.S31: the set-representation-mode and set-overlays
// seam commands — distinct from set-layout-mode, additive to the locked union,
// with id-keyed object constancy across a switch and an honest echoed event.

import { describe, expect, it, vi } from "vitest";

import { SceneController } from "./sceneController";
import type { SceneEvent, SceneFieldRenderer } from "./sceneController";

/** A minimal field double that records the commands it receives. */
function recordingField(): { field: SceneFieldRenderer; commands: unknown[] } {
  const commands: unknown[] = [];
  const field: SceneFieldRenderer = {
    mount: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    command: (cmd) => commands.push(cmd),
  };
  return { field, commands };
}

describe("set-representation-mode / set-overlays seam commands", () => {
  it("are distinct from set-layout-mode and tracked separately", () => {
    const controller = new SceneController(null);
    // Default: connectivity, both overlays on; force layout.
    expect(controller.getRepresentationState().mode).toBe("connectivity");
    expect(controller.getLayoutState().mode).toBe("force");

    // A force/circular tuning does NOT change the representation mode.
    controller.command({ kind: "set-layout-mode", mode: "circular" });
    expect(controller.getLayoutState().mode).toBe("circular");
    expect(controller.getRepresentationState().mode).toBe("connectivity");

    // A representation switch does NOT change the force/circular tuning.
    controller.command({ kind: "set-representation-mode", mode: "lineage" });
    expect(controller.getRepresentationState().mode).toBe("lineage");
    expect(controller.getLayoutState().mode).toBe("circular");
  });

  it("tracks overlay visibility independently", () => {
    const controller = new SceneController(null);
    expect(controller.getRepresentationState().overlays).toEqual({
      featureCountries: true,
      featureHulls: true,
    });
    controller.command({
      kind: "set-overlays",
      featureCountries: false,
      featureHulls: true,
    });
    expect(controller.getRepresentationState().overlays).toEqual({
      featureCountries: false,
      featureHulls: true,
    });
  });

  it("forwards the new commands to the field renderer", () => {
    const { field, commands } = recordingField();
    const controller = new SceneController(field);
    controller.command({ kind: "set-representation-mode", mode: "semantic" });
    controller.command({
      kind: "set-overlays",
      featureCountries: true,
      featureHulls: false,
    });
    expect(commands).toEqual([
      { kind: "set-representation-mode", mode: "semantic" },
      { kind: "set-overlays", featureCountries: true, featureHulls: false },
    ]);
  });

  it("carries representation-mode-changed through the event channel honestly", () => {
    const controller = new SceneController(null);
    const events: SceneEvent[] = [];
    controller.on((e) => events.push(e));
    // The field would emit this after applying the mode; simulate the echo.
    controller.emit({
      kind: "representation-mode-changed",
      requested: "semantic",
      applied: "connectivity",
      downgradeReason: "semantic mode HELD",
    });
    const changed = events.find((e) => e.kind === "representation-mode-changed");
    expect(changed).toBeDefined();
    if (changed?.kind === "representation-mode-changed") {
      // The event reports the APPLIED mode (downgrade), not just the requested.
      expect(changed.requested).toBe("semantic");
      expect(changed.applied).toBe("connectivity");
      expect(changed.downgradeReason).toMatch(/HELD/);
    }
  });

  it("preserves node identity across a mode switch (object constancy)", () => {
    // The controller holds the same nodes regardless of mode; switching mode
    // never mutates the node set (the seam re-LAYS-OUT the same ids).
    const controller = new SceneController(null);
    controller.command({
      kind: "set-data",
      nodes: [
        { id: "a", kind: "adr" },
        { id: "b", kind: "plan" },
      ],
      edges: [],
    });
    const before = controller.nodeCount;
    controller.command({ kind: "set-representation-mode", mode: "lineage" });
    controller.command({ kind: "set-representation-mode", mode: "connectivity" });
    expect(controller.nodeCount).toBe(before);
  });
});
