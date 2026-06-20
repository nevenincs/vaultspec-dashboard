import { describe, expect, it } from "vitest";

import {
  GRAPH_CONTROLS_APPEARANCE_DEFAULTS,
  GRAPH_CONTROLS_TUNE_DEFAULTS,
} from "../../stores/view/graphControlsChrome";
import {
  buildGraphControlOverrides,
  stableGraphControlOverrides,
} from "./graphControlsPersistence";

describe("graph-controls persistence helpers", () => {
  it("builds an EMPTY override map when every value equals the schema default", () => {
    expect(
      buildGraphControlOverrides(
        GRAPH_CONTROLS_TUNE_DEFAULTS,
        GRAPH_CONTROLS_APPEARANCE_DEFAULTS,
      ),
    ).toEqual({});
  });

  it("persists only non-default values (sparse), with repulsion→charge sign", () => {
    const overrides = buildGraphControlOverrides(
      { ...GRAPH_CONTROLS_TUNE_DEFAULTS, repulsion: 200 }, // charge default -120
      { ...GRAPH_CONTROLS_APPEARANCE_DEFAULTS, edgeColorMode: "solid" }, // default gradient
    );
    expect(overrides).toEqual({ charge: -200, edgeColorMode: "solid" });
  });

  it("serializes compactly with sorted keys (engine wire form)", () => {
    expect(stableGraphControlOverrides({ linkStrength: 1.5, charge: -200 })).toBe(
      '{"charge":-200,"linkStrength":1.5}',
    );
    expect(stableGraphControlOverrides({})).toBe("{}");
  });
});
