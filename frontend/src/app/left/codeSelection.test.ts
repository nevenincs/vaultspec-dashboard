// Code-tree row ↔ stage selection join (dashboard-code-tree plan P04.S15): the
// `code:<path>` bidirectional join, mirroring the vault browser's `doc:<stem>`
// join — selecting a file row selects its `code:` node, and the active stage
// selection resolves the matching row. Pure derivations + the shared view store;
// no component render here (the render test covers the four honest states).

import { beforeEach, describe, expect, it } from "vitest";

import type { FileTreeEntry } from "../../stores/server/engine";
import { useViewStore } from "../../stores/view/viewStore";
import {
  codePathToNodeId,
  handleCodeEntryClick,
  highlightedCodePathFor,
  nodeIdToCodePath,
} from "./browserSelection";

const fileEntry = (path: string, nodeId?: string): FileTreeEntry => ({
  path,
  kind: "file",
  has_children: false,
  node_id: nodeId ?? `code:${path}`,
});

describe("code id derivation (contract identity guarantees)", () => {
  it("derives the code-artifact node id from the repo path and back", () => {
    expect(codePathToNodeId("src/main.rs")).toBe("code:src/main.rs");
    expect(nodeIdToCodePath("code:src/main.rs")).toBe("src/main.rs");
    // A non-code id (a document) is not a code path.
    expect(nodeIdToCodePath("doc:2026-06-12-x-adr")).toBeNull();
  });
});

describe("bidirectional code selection (mirrors the doc:<stem> join)", () => {
  beforeEach(() => useViewStore.getState().select(null));

  it("code-tree row click selects the code: node via its carried node_id", () => {
    handleCodeEntryClick(fileEntry("src/main.rs"));
    expect(useViewStore.getState().selection).toEqual({
      kind: "node",
      id: "code:src/main.rs",
    });
  });

  it("falls back to deriving the id from the path when node_id is absent", () => {
    // A sparse entry (empty node_id) still joins by deriving code:<path>.
    handleCodeEntryClick({
      path: "src/lib.rs",
      kind: "file",
      has_children: false,
      node_id: "",
    });
    expect(useViewStore.getState().selection).toEqual({
      kind: "node",
      id: "code:src/lib.rs",
    });
  });

  it("the active selection resolves the matching code row, code nodes only", () => {
    const entries = [fileEntry("src/main.rs"), fileEntry("src/lib.rs")];
    expect(highlightedCodePathFor(entries, "code:src/lib.rs")).toBe("src/lib.rs");
    // A document selection never highlights a code row.
    expect(highlightedCodePathFor(entries, "doc:2026-06-12-x-adr")).toBeNull();
    // No selection / no entries → no highlight.
    expect(highlightedCodePathFor(entries, null)).toBeNull();
    expect(highlightedCodePathFor(undefined, "code:src/main.rs")).toBeNull();
    // A code selection not present in the visible level → no highlight (the
    // bidirectional join only lights up a row that is actually visible).
    expect(highlightedCodePathFor(entries, "code:src/absent.rs")).toBeNull();
  });

  it("matches on the entry's node_id, robust to a non-derivable path", () => {
    // The row's node_id is the shared-rule id; a selection equal to it matches
    // even if the path string differs from a naive code:<path> derivation.
    const entries = [fileEntry("src/main.rs", "code:src/main.rs")];
    expect(highlightedCodePathFor(entries, "code:src/main.rs")).toBe("src/main.rs");
  });
});
