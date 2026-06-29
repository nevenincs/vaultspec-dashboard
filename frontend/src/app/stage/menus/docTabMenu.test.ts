// @vitest-environment happy-dom
//
// Doc-tab context-menu resolver (#15): a pure resolver over the descriptor, with the
// keep-open / close-others gates read from the tab store at resolve time. These assert
// the verb set, the shared ids, and the disabled-with-reason gates.

import { afterEach, describe, expect, it } from "vitest";

import { useViewStore } from "../../../stores/view/viewStore";
import { docTabMenu } from "./docTabMenu";

afterEach(() => {
  useViewStore.setState({ openDocs: [], activeDocId: null });
});

describe("docTabMenu", () => {
  it("returns no actions for a non-doc-tab entity", () => {
    expect(docTabMenu({ kind: "node", id: "x" })).toEqual([]);
  });

  it("enrolls keep-open / reload / close / close-others / close-all under shared ids", () => {
    useViewStore.setState({
      openDocs: [
        { nodeId: "doc:a", surface: "markdown", provisional: false },
        { nodeId: "doc:b", surface: "markdown", provisional: true },
      ],
    });
    const actions = docTabMenu({
      kind: "doc-tab",
      id: "doc:b",
      nodeId: "doc:b",
      scope: "s",
    });
    expect(actions.map((a) => a.id)).toEqual([
      "doc-tab:keep-open",
      "doc-tab:reload",
      "doc-tab:close",
      "doc-tab:close-others",
      "doc-tab:close-all",
    ]);
    // doc:b IS provisional → keep-open enabled; another tab exists → close-others enabled.
    expect(actions.find((a) => a.id === "doc-tab:keep-open")?.disabled).toBeFalsy();
    expect(actions.find((a) => a.id === "doc-tab:close-others")?.disabled).toBeFalsy();
  });

  it("disables keep-open for a permanent tab and close-others for the lone tab", () => {
    useViewStore.setState({
      openDocs: [{ nodeId: "doc:a", surface: "markdown", provisional: false }],
    });
    const actions = docTabMenu({
      kind: "doc-tab",
      id: "doc:a",
      nodeId: "doc:a",
      scope: null,
    });
    const keep = actions.find((a) => a.id === "doc-tab:keep-open");
    const others = actions.find((a) => a.id === "doc-tab:close-others");
    expect(keep?.disabled).toBe(true);
    expect(keep?.disabledReason).toBe("already a permanent tab");
    expect(others?.disabled).toBe(true);
  });
});
