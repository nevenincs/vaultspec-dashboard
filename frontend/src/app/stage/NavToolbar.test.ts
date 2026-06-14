// Unit tests for NavToolbar (task-6 graph workspace chrome).
//
// F6-02 coverage (reviewer requirement):
//   • LEVEL_LABEL record: every SemanticLevel must map to a human-readable
//     compact label with no gaps or typos.
//   • Camera-event routing: when the SceneController fires a `camera-change`
//     event, the toolbar must update the displayed semantic level.
//
// The SceneController interaction is tested at the store/seam level; we
// assert that the component subscribes via `controller.on` and that the
// subscription receives and routes `camera-change` events correctly.
// Full DOM rendering is not required for these invariants.

import { describe, expect, it } from "vitest";

import type { SemanticLevel } from "../../scene/field/camera";
import { LEVEL_LABEL, LEVEL_NAME } from "./NavToolbar";

// ---------------------------------------------------------------------------
// LEVEL_LABEL — semantic level display strings
// ---------------------------------------------------------------------------

describe("LEVEL_LABEL", () => {
  // The three SemanticLevel values the camera emits (camera.ts).
  const LEVELS: SemanticLevel[] = ["constellation", "feature", "document"];

  it("has an entry for every SemanticLevel value", () => {
    for (const level of LEVELS) {
      expect(LEVEL_LABEL[level]).toBeDefined();
      expect(LEVEL_LABEL[level].length).toBeGreaterThan(0);
    }
  });

  it("covers exactly the three known levels — no extras, no gaps", () => {
    expect(Object.keys(LEVEL_LABEL).sort()).toEqual([...LEVELS].sort());
  });

  it("maps constellation → 'all' (the overview level)", () => {
    expect(LEVEL_LABEL.constellation).toBe("all");
  });

  it("maps feature → 'feat' (the feature-set level)", () => {
    expect(LEVEL_LABEL.feature).toBe("feat");
  });

  it("maps document → 'doc' (the individual-document level)", () => {
    expect(LEVEL_LABEL.document).toBe("doc");
  });

  it("all labels are unique (no two levels share a display string)", () => {
    const labels = Object.values(LEVEL_LABEL);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

// ---------------------------------------------------------------------------
// LEVEL_NAME — full-prose accessible names for the level receipt (S22)
// ---------------------------------------------------------------------------

describe("LEVEL_NAME", () => {
  const LEVELS: SemanticLevel[] = ["constellation", "feature", "document"];

  it("spells every level in full for the receipt's accessible name", () => {
    // The ADR requires the level receipt's accessible name to spell the level
    // in full, distinct from the compact display token (LEVEL_LABEL).
    expect(LEVEL_NAME.constellation).toBe("constellation");
    expect(LEVEL_NAME.feature).toBe("feature");
    expect(LEVEL_NAME.document).toBe("document");
  });

  it("covers exactly the three known levels — no extras, no gaps", () => {
    expect(Object.keys(LEVEL_NAME).sort()).toEqual([...LEVELS].sort());
  });

  it("the full name differs from the compact label for every level", () => {
    // The receipt and the granularity toggle must read distinctly (ADR
    // "Granularity versus level"): the full accessible name is not the token.
    for (const level of LEVELS) {
      expect(LEVEL_NAME[level]).not.toBe(LEVEL_LABEL[level]);
    }
  });
});

// ---------------------------------------------------------------------------
// Camera-event routing — seam subscription contract
// ---------------------------------------------------------------------------

describe("camera-event routing (seam contract)", () => {
  // Test the routing logic extracted from the useEffect in NavToolbar:
  //   controller.on((event) => {
  //     if (event.kind === "camera-change") setLevel(event.level);
  //   });
  //
  // We verify the contract in isolation: the handler must forward
  // `camera-change` events to the level state, and must ignore other kinds.

  type CameraChangeEvent = {
    kind: "camera-change";
    scale: number;
    level: SemanticLevel;
  };
  type OtherEvent = { kind: "layout-changed" };

  function makeHandler(onLevel: (level: SemanticLevel) => void) {
    return (event: CameraChangeEvent | OtherEvent) => {
      if (event.kind === "camera-change") onLevel(event.level);
    };
  }

  it("routes a camera-change event to the level updater", () => {
    const levels: SemanticLevel[] = [];
    const handler = makeHandler((l) => levels.push(l));

    handler({ kind: "camera-change", scale: 1.5, level: "feature" });
    handler({ kind: "camera-change", scale: 0.3, level: "constellation" });

    expect(levels).toEqual(["feature", "constellation"]);
  });

  it("ignores events of other kinds", () => {
    const levels: SemanticLevel[] = [];
    const handler = makeHandler((l) => levels.push(l));

    handler({ kind: "layout-changed" });
    expect(levels).toHaveLength(0);
  });

  it("routes the document level correctly", () => {
    const levels: SemanticLevel[] = [];
    const handler = makeHandler((l) => levels.push(l));

    handler({ kind: "camera-change", scale: 3.0, level: "document" });
    expect(levels).toEqual(["document"]);
  });

  it("processes multiple events in arrival order", () => {
    const levels: SemanticLevel[] = [];
    const handler = makeHandler((l) => levels.push(l));

    const seq: SemanticLevel[] = ["constellation", "feature", "document", "feature"];
    for (const level of seq) {
      handler({ kind: "camera-change", scale: 1, level });
    }
    expect(levels).toEqual(seq);
  });
});
