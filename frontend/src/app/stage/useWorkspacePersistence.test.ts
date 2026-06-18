// The dock workspace persistence serialize/parse round-trip (editor-dock-workspace
// P06.S27). Pure logic — the open-tab set + active tab survive a serialize ->
// persist -> parse cycle, provisional (preview) tabs are dropped, and a malformed
// or absent blob degrades to null (the default empty workspace), never throws.

import { describe, expect, it } from "vitest";

import type { OpenDoc } from "../../stores/view/viewStore";
import { parseWorkspaceTabs, serializeWorkspaceTabs } from "./useWorkspacePersistence";

const PERMANENT: OpenDoc[] = [
  { nodeId: "doc:a-plan", surface: "markdown", provisional: false },
  { nodeId: "code:src/app.ts", surface: "code", provisional: false },
];

describe("serialize -> parse round-trip", () => {
  it("restores the permanent tab set and active tab", () => {
    const blob = serializeWorkspaceTabs(PERMANENT, "code:src/app.ts");
    const restored = parseWorkspaceTabs(blob);
    expect(restored).toEqual({
      openDocs: PERMANENT,
      activeDocId: "code:src/app.ts",
    });
  });

  it("drops provisional (preview) tabs from the persisted set", () => {
    const withPreview: OpenDoc[] = [
      ...PERMANENT,
      { nodeId: "doc:preview", surface: "markdown", provisional: true },
    ];
    const restored = parseWorkspaceTabs(
      serializeWorkspaceTabs(withPreview, "doc:preview"),
    );
    expect(restored?.openDocs.map((d) => d.nodeId)).toEqual([
      "doc:a-plan",
      "code:src/app.ts",
    ]);
    // The active id pointed at the dropped preview, so it degrades to the first tab.
    expect(restored?.activeDocId).toBe("doc:a-plan");
  });
});

describe("degradation", () => {
  it("returns null for an absent blob", () => {
    expect(parseWorkspaceTabs(null)).toBeNull();
  });

  it("returns null for non-JSON or wrong-version input", () => {
    expect(parseWorkspaceTabs("not json")).toBeNull();
    expect(parseWorkspaceTabs(JSON.stringify({ v: 99, tabs: [] }))).toBeNull();
    expect(parseWorkspaceTabs(JSON.stringify({ v: 1 }))).toBeNull();
  });

  it("skips malformed tab entries rather than throwing", () => {
    const restored = parseWorkspaceTabs(
      JSON.stringify({
        v: 1,
        tabs: [{ nodeId: "doc:ok", surface: "markdown" }, { surface: "code" }, 42],
        active: "doc:ok",
      }),
    );
    expect(restored?.openDocs).toEqual([
      { nodeId: "doc:ok", surface: "markdown", provisional: false },
    ]);
    expect(restored?.activeDocId).toBe("doc:ok");
  });
});
