import { describe, expect, it } from "vitest";

import { NODE_ID_MAX_CHARS, normalizeNodeId, normalizeNodeIds } from "./nodeIds";

describe("node id normalization", () => {
  it("trims single ids and rejects empty/non-string values", () => {
    expect(normalizeNodeId(" doc:a ")).toBe("doc:a");
    expect(normalizeNodeId("x".repeat(NODE_ID_MAX_CHARS))).toHaveLength(
      NODE_ID_MAX_CHARS,
    );
    expect(normalizeNodeId("x".repeat(NODE_ID_MAX_CHARS + 1))).toBeNull();
    expect(normalizeNodeId("   ")).toBeNull();
    expect(normalizeNodeId(null)).toBeNull();
  });

  it("dedupes normalized ids and applies the caller cap", () => {
    expect(
      normalizeNodeIds(
        [" doc:a ", "", "doc:a", "x".repeat(NODE_ID_MAX_CHARS + 1), "doc:b", "doc:c"],
        2,
      ),
    ).toEqual(["doc:a", "doc:b"]);
    expect(normalizeNodeIds(["doc:a"], 0)).toEqual([]);
  });
});
