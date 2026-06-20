import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_GRAPH_OVERLAYS,
  normalizeGraphOverlays,
  setGraphOverlays,
  type GraphOverlayState,
} from "./graphOverlays";
import { useViewStore } from "./viewStore";

describe("graph overlay seam", () => {
  afterEach(() => {
    setGraphOverlays(DEFAULT_GRAPH_OVERLAYS);
  });

  it("copies overlay state at the seam boundary", () => {
    const overlays: GraphOverlayState = {
      featureCountries: false,
      featureHulls: true,
    };

    setGraphOverlays(overlays);
    overlays.featureCountries = true;

    expect(useViewStore.getState().overlays).toEqual({
      featureCountries: false,
      featureHulls: true,
    });
  });

  it("normalizes malformed overlay payloads back to declared defaults", () => {
    expect(
      normalizeGraphOverlays({
        featureCountries: "false",
        featureHulls: null,
      }),
    ).toEqual(DEFAULT_GRAPH_OVERLAYS);

    setGraphOverlays({ featureCountries: false });

    expect(useViewStore.getState().overlays).toEqual({
      featureCountries: false,
      featureHulls: true,
    });

    setGraphOverlays({
      featureCountries: "false",
      featureHulls: null,
    });

    expect(useViewStore.getState().overlays).toEqual(DEFAULT_GRAPH_OVERLAYS);
  });
});
