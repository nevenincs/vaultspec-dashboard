// @vitest-environment happy-dom

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  graphAffordanceNodeIds,
  reconcileGraphAffordances,
  useGraphAffordanceReconciliation,
} from "./graphAffordances";
import { useViewStore } from "./viewStore";

afterEach(() => {
  cleanup();
  useViewStore.setState({
    selection: null,
    workingSet: [],
    openedIds: [],
  });
});

describe("graph-affordance reconciliation seam", () => {
  it("prunes local visual subscriptions against the held graph model", () => {
    useViewStore.setState({
      selection: {
        kind: "event",
        id: "evt-stale",
        nodeIds: ["doc:keep", "doc:missing"],
      },
      workingSet: ["doc:keep", "doc:missing"],
      openedIds: ["doc:keep", "doc:missing"],
    });

    reconcileGraphAffordances(["doc:keep", "doc:related"]);

    expect(useViewStore.getState()).toMatchObject({
      selection: { kind: "event", id: "evt-stale", nodeIds: ["doc:keep"] },
      workingSet: ["doc:keep"],
      openedIds: ["doc:keep"],
    });
  });

  it("projects node ids from the held graph before pruning", () => {
    expect(
      graphAffordanceNodeIds({
        nodes: [{ id: " doc:a " }, { id: "" }, { id: "doc:a" }, { id: "doc:b" }],
      }),
    ).toEqual(["doc:a", "doc:b"]);
    expect(graphAffordanceNodeIds(null)).toBeNull();
  });

  it("normalizes projected node ids before pruning local visual subscriptions", () => {
    useViewStore.setState({
      workingSet: ["doc:keep", "doc:stale"],
      openedIds: ["doc:keep", "doc:stale"],
    });

    reconcileGraphAffordances([" doc:keep ", "", "doc:keep"]);

    expect(useViewStore.getState()).toMatchObject({
      workingSet: ["doc:keep"],
      openedIds: ["doc:keep"],
    });
  });

  it("runs graph-affordance reconciliation from the held graph model", () => {
    useViewStore.setState({
      workingSet: ["doc:keep", "doc:stale"],
      openedIds: ["doc:keep", "doc:stale"],
    });

    renderHook(() => useGraphAffordanceReconciliation({ nodes: [{ id: "doc:keep" }] }));

    expect(useViewStore.getState()).toMatchObject({
      workingSet: ["doc:keep"],
      openedIds: ["doc:keep"],
    });
  });
});
