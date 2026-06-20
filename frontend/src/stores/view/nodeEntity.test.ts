import { beforeEach, describe, expect, it } from "vitest";

import { usePinStore } from "./pins";
import { nodeEntityView } from "./nodeEntity";
import { useViewStore } from "./viewStore";

describe("node entity context descriptor", () => {
  beforeEach(() => {
    useViewStore.setState({ openedIds: [], workingSet: [] });
    usePinStore.setState({ pinnedIds: [] });
  });

  it("projects open, pinned, and working-set membership from one store seam", () => {
    useViewStore.setState({
      openedIds: ["doc:a"],
      workingSet: ["doc:a"],
    });
    usePinStore.setState({ pinnedIds: ["doc:a"] });

    expect(
      nodeEntityView({ id: " doc:a ", scope: " scope-a ", title: " Doc A " }),
    ).toEqual({
      kind: "node",
      id: "doc:a",
      scope: "scope-a",
      title: "Doc A",
      isOpen: true,
      isPinned: true,
      inWorkingSet: true,
    });
  });

  it("rejects malformed ids before publishing a node descriptor", () => {
    expect(nodeEntityView({ id: "   ", scope: "scope-a" })).toBeNull();
    expect(nodeEntityView({ id: { id: "doc:a" }, scope: "scope-a" })).toBeNull();
    expect(nodeEntityView(null)).toBeNull();
  });

  it("keeps absent membership explicit for resolver labels", () => {
    expect(
      nodeEntityView({ id: "doc:b", scope: { scope: "scope-a" }, title: "" }),
    ).toEqual({
      kind: "node",
      id: "doc:b",
      scope: null,
      title: undefined,
      isOpen: false,
      isPinned: false,
      inWorkingSet: false,
    });
  });
});
