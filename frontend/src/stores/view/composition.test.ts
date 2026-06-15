// graph-representation W03.P09.S34: the lens x mode composition sequencer. Every
// lens is viewable in every mode (no forbidden combination); a lens switch
// re-queries then re-lays-out; a mode switch re-lays-out only.

import { describe, expect, it } from "vitest";

import type { SalienceLens } from "../server/engine";
import type { RepresentationMode } from "../../scene/field/representationLayout";
import {
  requiresRequery,
  sequenceComposition,
  type CompositionState,
} from "./composition";

const LENSES: SalienceLens[] = ["status", "design"];
const MODES: RepresentationMode[] = ["connectivity", "lineage", "semantic"];

describe("sequenceComposition", () => {
  it("re-queries then re-lays-out on a lens switch", () => {
    const steps = sequenceComposition(
      { lens: "status", mode: "connectivity" },
      { lens: "design", mode: "connectivity" },
    );
    expect(steps).toEqual([
      { kind: "requery", lens: "design" },
      { kind: "relayout", mode: "connectivity" },
    ]);
  });

  it("re-lays-out only (no re-query) on a mode switch", () => {
    const steps = sequenceComposition(
      { lens: "status", mode: "connectivity" },
      { lens: "status", mode: "lineage" },
    );
    expect(steps).toEqual([{ kind: "relayout", mode: "lineage" }]);
  });

  it("re-queries first when BOTH lens and mode change (the new set is laid out)", () => {
    const steps = sequenceComposition(
      { lens: "status", mode: "connectivity" },
      { lens: "design", mode: "semantic" },
    );
    expect(steps[0]).toEqual({ kind: "requery", lens: "design" });
    expect(steps[1]).toEqual({ kind: "relayout", mode: "semantic" });
  });

  it("produces no steps when nothing changed", () => {
    expect(
      sequenceComposition(
        { lens: "status", mode: "lineage" },
        { lens: "status", mode: "lineage" },
      ),
    ).toEqual([]);
  });

  it("makes every lens viewable in every mode (no forbidden combination)", () => {
    for (const lens of LENSES) {
      for (const mode of MODES) {
        const target: CompositionState = { lens, mode };
        // From any starting state, the target is reachable: the sequence either
        // re-queries+re-lays-out or re-lays-out, never refusing the combination.
        const steps = sequenceComposition(
          { lens: "status", mode: "connectivity" },
          target,
        );
        // The final laid-out mode is always the requested mode.
        const relayout = steps.find((s) => s.kind === "relayout");
        if (lens !== "status" || mode !== "connectivity") {
          expect(relayout).toBeDefined();
          if (relayout?.kind === "relayout") expect(relayout.mode).toBe(mode);
        }
      }
    }
  });

  it("flags a re-query exactly when the lens changes", () => {
    expect(
      requiresRequery(
        { lens: "status", mode: "lineage" },
        { lens: "design", mode: "lineage" },
      ),
    ).toBe(true);
    expect(
      requiresRequery(
        { lens: "status", mode: "lineage" },
        { lens: "status", mode: "semantic" },
      ),
    ).toBe(false);
  });
});
