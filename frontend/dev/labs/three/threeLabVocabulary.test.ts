import { describe, expect, it } from "vitest";

import {
  APPEARANCE_CONTROLS,
  APPEARANCE_CONTROL_GROUPS,
} from "../../scene/three/appearanceControls";
import { FORCE_CONTROLS, FORCE_CONTROL_GROUPS } from "../../scene/three/forceControls";
import { controlsFor } from "../../scene/three/graphControlSchema";
import {
  APPEARANCE_CONTROL_SECTION_MESSAGES,
  FORCE_CONTROL_SECTION_MESSAGES,
  LAB_GRAPH_CONTROL_MESSAGES,
  LAB_GRAPH_CONTROL_OPTION_MESSAGES,
} from "./threeLabVocabulary";

describe("Three Lab vocabulary", () => {
  it("covers the exact Lab control schema", () => {
    const expected = controlsFor("simulation")
      .concat(controlsFor("visualisation"))
      .filter((control) => control.exposure.includes("lab"))
      .map((control) => control.id)
      .sort();

    expect(Object.keys(LAB_GRAPH_CONTROL_MESSAGES).sort()).toEqual(expected);
    expect(expected).toHaveLength(26);
    expect(FORCE_CONTROLS.map((control) => control.controlId)).toHaveLength(17);
    expect(APPEARANCE_CONTROLS.map((control) => control.controlId)).toHaveLength(9);
  });

  it("uses exact typed section and option maps", () => {
    expect(Object.keys(FORCE_CONTROL_SECTION_MESSAGES).sort()).toEqual(
      [...FORCE_CONTROL_GROUPS].sort(),
    );
    expect(Object.keys(APPEARANCE_CONTROL_SECTION_MESSAGES).sort()).toEqual(
      [...APPEARANCE_CONTROL_GROUPS].sort(),
    );
    expect(Object.keys(LAB_GRAPH_CONTROL_OPTION_MESSAGES)).toEqual([
      "solid",
      "gradient",
      "category",
      "recency",
    ]);
  });
});
