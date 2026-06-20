import { describe, expect, it } from "vitest";

import {
  stageBoundsCommand,
  stageOverlaysCommand,
  stageRepresentationCommand,
  stageSetDataCommand,
} from "./stageSceneCommands";

describe("stage scene command projections", () => {
  it("projects a graph slice into the locked set-data command", () => {
    expect(
      stageSetDataCommand({
        nodes: [{ id: "doc:a", kind: "document", title: "Doc A" }],
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
      }),
    ).toMatchObject({
      kind: "set-data",
      nodes: [{ id: "doc:a", kind: "document", title: "Doc A" }],
      edges: [{ id: "edge:a-b", src: "doc:a", dst: "doc:b" }],
    });
  });

  it("normalizes malformed graph slices before issuing set-data", () => {
    expect(stageSetDataCommand(null)).toEqual({
      kind: "set-data",
      nodes: [],
      edges: [],
    });
    expect(
      stageSetDataCommand({
        nodes: [{ id: " doc:a ", kind: "document" }, { id: "   " }],
        edges: [
          { id: " edge:a-b ", src: " doc:a ", dst: " doc:b " },
          { id: "edge:bad", src: "", dst: "doc:b" },
        ],
      }),
    ).toMatchObject({
      kind: "set-data",
      nodes: [{ id: "doc:a" }],
      edges: [{ id: "edge:a-b", src: "doc:a", dst: "doc:b" }],
    });
  });

  it("projects representation, bounds, and overlay commands", () => {
    expect(stageRepresentationCommand("semantic")).toEqual({
      kind: "set-representation-mode",
      mode: "semantic",
    });
    expect(stageRepresentationCommand("invalid")).toEqual({
      kind: "set-representation-mode",
      mode: "connectivity",
    });
    expect(stageBoundsCommand(undefined)).toBeNull();
    expect(stageBoundsCommand({ shape: "free", size: 0 })).toEqual({
      kind: "set-bounds",
      shape: "free",
      size: undefined,
    });
    expect(stageBoundsCommand({ shape: "circle", size: 1200 })).toEqual({
      kind: "set-bounds",
      shape: "circle",
      size: 1200,
    });
    expect(
      stageBoundsCommand({ shape: "hex", size: Number.POSITIVE_INFINITY }),
    ).toEqual({
      kind: "set-bounds",
      shape: "free",
      size: undefined,
    });
    expect(
      stageOverlaysCommand({ featureCountries: false, featureHulls: true }),
    ).toEqual({
      kind: "set-overlays",
      featureCountries: false,
      featureHulls: true,
    });
    expect(
      stageOverlaysCommand({
        featureCountries: "false",
        featureHulls: null,
      }),
    ).toEqual({
      kind: "set-overlays",
      featureCountries: true,
      featureHulls: true,
    });
  });
});
