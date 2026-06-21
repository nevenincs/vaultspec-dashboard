import { beforeEach, describe, expect, it } from "vitest";

import { usePinStore } from "./pins";
import { stageContextMenuIntent } from "./stageSceneEvents";
import { useViewStore } from "./viewStore";

beforeEach(() => {
  useViewStore.setState({ openedIds: [], workingSet: [] });
  usePinStore.setState({ pinnedIds: [] });
});

describe("stage scene-event bridge", () => {
  it("projects a node context-menu event through the canonical node entity view", () => {
    const intent = stageContextMenuIntent(
      {
        kind: "context-menu",
        id: "doc:alpha",
        target: "node",
        clientX: 24,
        clientY: 48,
      },
      "scope-a",
    );

    expect(intent.anchor).toEqual({ x: 24, y: 48 });
    expect(intent.entity).toEqual({
      kind: "node",
      id: "doc:alpha",
      scope: "scope-a",
      title: undefined,
      isOpen: false,
      isPinned: false,
      inWorkingSet: false,
    });
  });

  it("projects an EDGE context-menu event through the edge entity (#14)", () => {
    const intent = stageContextMenuIntent(
      {
        kind: "context-menu",
        id: "edge:doc:a->doc:b",
        target: "edge",
        clientX: 12,
        clientY: 34,
      },
      "scope-a",
    );
    expect(intent.anchor).toEqual({ x: 12, y: 34 });
    expect(intent.entity).toEqual({ kind: "edge", id: "edge:doc:a->doc:b" });
  });

  it("projects an empty-field context-menu event as the singleton canvas entity", () => {
    expect(
      stageContextMenuIntent(
        {
          kind: "context-menu",
          id: null,
          target: "node",
          clientX: 3,
          clientY: 5,
        },
        "scope-a",
      ),
    ).toEqual({
      anchor: { x: 3, y: 5 },
      entity: { kind: "canvas", id: "canvas" },
    });
  });

  it("falls back to the canvas entity for malformed node context-menu ids", () => {
    expect(
      stageContextMenuIntent(
        {
          kind: "context-menu",
          id: "   ",
          target: "node",
          clientX: 8,
          clientY: 13,
        },
        "scope-a",
      ),
    ).toEqual({
      anchor: { x: 8, y: 13 },
      entity: { kind: "canvas", id: "canvas" },
    });
  });
});
