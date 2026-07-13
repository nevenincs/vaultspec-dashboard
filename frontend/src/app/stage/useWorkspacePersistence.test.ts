// The dock workspace persistence serialize/parse round-trip (editor-dock-workspace
// P06.S27). Pure logic — the open-tab set + active tab survive a serialize ->
// persist -> parse cycle, provisional (preview) tabs are dropped, and a malformed
// or absent blob degrades to null (the default empty workspace), never throws.

import { describe, expect, it } from "vitest";

import type { OpenDoc } from "../../stores/view/viewStore";
import {
  isSamePersistedWorkspaceLayout,
  parseWorkspaceTabs,
  serializeWorkspaceTabs,
  shouldPersistWorkspaceTabsLayout,
} from "./useWorkspacePersistence";

const PERMANENT: OpenDoc[] = [
  { nodeId: "doc:a-plan", surface: "markdown", provisional: false, scope: null },
  { nodeId: "code:src/app.ts", surface: "code", provisional: false, scope: null },
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
      { nodeId: "doc:ok", surface: "markdown", provisional: false, scope: null },
    ]);
    expect(restored?.activeDocId).toBe("doc:ok");
  });
});

describe("workspace layout persistence identity", () => {
  it("treats identical tab blobs in different scopes as distinct writes", () => {
    const blob = JSON.stringify({
      v: 1,
      tabs: [{ nodeId: "doc:shared", surface: "markdown" }],
      active: "doc:shared",
    });

    expect(
      isSamePersistedWorkspaceLayout({ scope: "scope-a", blob }, "scope-a", blob),
    ).toBe(true);
    expect(
      isSamePersistedWorkspaceLayout({ scope: "scope-a", blob }, "scope-b", blob),
    ).toBe(false);
    expect(
      isSamePersistedWorkspaceLayout({ scope: "scope-a", blob }, " scope-a ", blob),
    ).toBe(true);
    expect(
      isSamePersistedWorkspaceLayout(
        { scope: "scope-a", blob },
        { scope: "scope-a" },
        blob,
      ),
    ).toBe(false);
  });

  it("keeps the no-clobber persist decision behind the tab codec seam", () => {
    const emptyBlob = serializeWorkspaceTabs([], null);
    const populatedBlob = serializeWorkspaceTabs(PERMANENT, "doc:a-plan");

    expect(shouldPersistWorkspaceTabsLayout(null, "scope-a", emptyBlob)).toBe(false);
    expect(shouldPersistWorkspaceTabsLayout(null, "scope-a", populatedBlob)).toBe(true);
    expect(
      shouldPersistWorkspaceTabsLayout(null, { scope: "scope-a" }, populatedBlob),
    ).toBe(false);
    expect(shouldPersistWorkspaceTabsLayout(null, " scope-a ", populatedBlob)).toBe(
      true,
    );
    expect(
      shouldPersistWorkspaceTabsLayout(
        { scope: "scope-a", blob: populatedBlob },
        "scope-a",
        populatedBlob,
      ),
    ).toBe(false);
    expect(
      shouldPersistWorkspaceTabsLayout(
        { scope: "scope-a", blob: populatedBlob },
        "scope-b",
        populatedBlob,
      ),
    ).toBe(true);
  });
});
