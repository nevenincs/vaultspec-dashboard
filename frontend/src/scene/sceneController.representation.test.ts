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
  it("tracks the representation mode at the seam", () => {
    const controller = new SceneController(null);
    // Default: connectivity, both overlays on.
    expect(controller.getRepresentationState().mode).toBe("connectivity");

    // A representation switch updates the tracked mode.
    controller.command({ kind: "set-representation-mode", mode: "lineage" });
    expect(controller.getRepresentationState().mode).toBe("lineage");
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
    controller.command({ kind: "set-representation-mode", mode: "lineage" });
    controller.command({
      kind: "set-overlays",
      featureCountries: true,
      featureHulls: false,
    });
    expect(commands).toEqual([
      { kind: "set-representation-mode", mode: "lineage" },
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
      requested: "radial",
      applied: "connectivity",
      downgradeReason: "radial mode HELD",
    });
    const changed = events.find((e) => e.kind === "representation-mode-changed");
    expect(changed).toBeDefined();
    if (changed?.kind === "representation-mode-changed") {
      // The event reports the APPLIED mode (downgrade), not just the requested.
      expect(changed.requested).toBe("radial");
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

  it("tracks temporal as a graph representation without changing topology state", () => {
    const controller = new SceneController(null);
    controller.command({
      kind: "set-data",
      nodes: [
        {
          id: "doc:a",
          kind: "document",
          seedPosition: { x: 10, y: 20 },
          temporal: { bucket: "2026-06-17" },
        },
        {
          id: "doc:b",
          kind: "document",
          seedPosition: { x: 24, y: 30 },
          temporal: { bucket: "2026-06-17" },
        },
      ],
      edges: [
        {
          id: "edge:a-b",
          src: "doc:a",
          dst: "doc:b",
          relation: "references",
          tier: "declared",
          confidence: 1,
        },
      ],
    });

    controller.command({ kind: "set-representation-mode", mode: "temporal" });

    expect(controller.getRepresentationState().mode).toBe("temporal");
    expect(controller.nodeCount).toBe(2);
  });
});
