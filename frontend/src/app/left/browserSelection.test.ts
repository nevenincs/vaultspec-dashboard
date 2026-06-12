import { beforeEach, describe, expect, it } from "vitest";

import type { VaultTreeEntry } from "../../stores/server/engine";
import { useViewStore } from "../../stores/view/viewStore";
import {
  handleEntryClick,
  highlightedPathFor,
  nodeIdToStem,
  pathToNodeId,
} from "./browserSelection";

const entry = (path: string): VaultTreeEntry => ({
  path,
  doc_type: "adr",
  feature_tags: [],
  dates: {},
});

describe("id derivation (contract identity guarantees)", () => {
  it("derives the document node id from the vault stem and back", () => {
    expect(pathToNodeId(".vault/adr/2026-06-12-x-adr.md")).toBe("doc:2026-06-12-x-adr");
    expect(nodeIdToStem("doc:2026-06-12-x-adr")).toBe("2026-06-12-x-adr");
    expect(nodeIdToStem("feature:x")).toBeNull();
  });
});

describe("bidirectional selection (G2.b)", () => {
  beforeEach(() => useViewStore.getState().select(null));

  it("browser click selects the document node", () => {
    handleEntryClick(entry(".vault/adr/2026-06-12-x-adr.md"));
    expect(useViewStore.getState().selection).toEqual({
      kind: "node",
      id: "doc:2026-06-12-x-adr",
    });
  });

  it("selection highlights its browser row, document nodes only", () => {
    const entries = [entry(".vault/adr/2026-06-12-x-adr.md")];
    expect(highlightedPathFor(entries, "doc:2026-06-12-x-adr")).toBe(
      ".vault/adr/2026-06-12-x-adr.md",
    );
    expect(highlightedPathFor(entries, "feature:x")).toBeNull();
    expect(highlightedPathFor(entries, null)).toBeNull();
    expect(highlightedPathFor(undefined, "doc:2026-06-12-x-adr")).toBeNull();
  });
});
