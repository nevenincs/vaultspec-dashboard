// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BROWSER_TREE_EXPANDED_KEYS_CAP,
  BROWSER_TREE_ITEM_KEY_MAX_CHARS,
  BROWSER_TREE_KEY_MAX_CHARS,
  browserTreeExpansionKey,
  canWriteBrowserTreeExpansionScope,
  deriveAllVaultBrowserTreeKeys,
  deriveBrowserTreeExpansionItem,
  deriveBrowserTreeKeyboardTarget,
  deriveBrowserTreeRovingKey,
  deriveCodeBrowserTreeNavKey,
  deriveCodeBrowserTreeRowView,
  deriveVaultBrowserTreeNavOrder,
  normalizeBrowserTreeActiveKey,
  normalizeBrowserTreeExpansionKey,
  normalizeBrowserTreeItemKey,
  normalizeBrowserTreeMode,
  normalizeBrowserTreeScope,
  useBrowserTreeExpansion,
  useBrowserTreeExpansionStore,
  VAULT_BROWSER_TREE_SECTION_KEYS,
} from "./browserTreeExpansion";

describe("deriveAllVaultBrowserTreeKeys", () => {
  it("returns the two sections plus every feature and doc-type folder key", () => {
    expect(
      deriveAllVaultBrowserTreeKeys({
        features: ["alpha", "beta"],
        docTypes: ["adr", "plan"],
      }),
    ).toEqual([
      "sec:features",
      "sec:documents",
      "feat:alpha",
      "feat:beta",
      "type:adr",
      "type:plan",
    ]);
  });

  it("is just the section keys when the tree has no groups", () => {
    expect(deriveAllVaultBrowserTreeKeys({ features: [], docTypes: [] })).toEqual([
      ...VAULT_BROWSER_TREE_SECTION_KEYS,
    ]);
  });
});

describe("browser tree expand/collapse all", () => {
  beforeEach(() => useBrowserTreeExpansionStore.getState().reset());

  it("expandKeys sets then merges the expanded set; collapseAll clears it", () => {
    const key = browserTreeExpansionKey(null, "vault");
    const store = useBrowserTreeExpansionStore.getState();
    store.expandKeys(key, ["sec:features", "feat:alpha"]);
    expect(new Set(useBrowserTreeExpansionStore.getState().expandedKeys)).toEqual(
      new Set(["sec:features", "feat:alpha"]),
    );
    store.expandKeys(key, ["feat:alpha", "type:adr"]);
    expect(new Set(useBrowserTreeExpansionStore.getState().expandedKeys)).toEqual(
      new Set(["sec:features", "feat:alpha", "type:adr"]),
    );
    store.collapseAll(key);
    expect(useBrowserTreeExpansionStore.getState().expandedKeys).toEqual([]);
  });

  it("drops malformed item keys at the expandKeys boundary", () => {
    const key = browserTreeExpansionKey(null, "vault");
    useBrowserTreeExpansionStore.getState().expandKeys(key, ["ok", "", 5, null]);
    expect(useBrowserTreeExpansionStore.getState().expandedKeys).toEqual(["ok"]);
  });
});

describe("browser tree expansion store", () => {
  beforeEach(() => useBrowserTreeExpansionStore.getState().reset());
  afterEach(() => cleanup());

  it("derives collision-resistant keys for null and separator-bearing scopes", () => {
    expect(browserTreeExpansionKey(null, "vault")).toBe(
      "browser-tree:scope:null:vault",
    );
    expect(browserTreeExpansionKey("none", "vault")).toBe(
      "browser-tree:scope:value:none:vault",
    );
    expect(browserTreeExpansionKey("null", "vault")).toBe(
      "browser-tree:scope:value:null:vault",
    );
    expect(browserTreeExpansionKey("a::b", "code")).toBe(
      "browser-tree:scope:value:a%3A%3Ab:code",
    );
  });

  it("normalizes browser-tree scope and mode before minting state keys", () => {
    expect(normalizeBrowserTreeScope(" scope-a ")).toBe("scope-a");
    expect(normalizeBrowserTreeScope("   ")).toBeNull();
    expect(normalizeBrowserTreeScope({ scope: "scope-a" })).toBeNull();
    expect(normalizeBrowserTreeMode("code")).toBe("code");
    expect(normalizeBrowserTreeMode("unknown")).toBe("vault");
    expect(canWriteBrowserTreeExpansionScope(null)).toBe(true);
    expect(canWriteBrowserTreeExpansionScope(" scope-a ")).toBe(true);
    expect(canWriteBrowserTreeExpansionScope({ scope: "scope-a" })).toBe(false);
    expect(canWriteBrowserTreeExpansionScope("   ")).toBe(false);
    expect(browserTreeExpansionKey(" scope-a ", "code")).toBe(
      "browser-tree:scope:value:scope-a:code",
    );
    expect(browserTreeExpansionKey({ scope: "scope-a" }, "other")).toBe(
      "browser-tree:scope:null:vault",
    );
    expect(
      browserTreeExpansionKey("s".repeat(BROWSER_TREE_KEY_MAX_CHARS), "code"),
    ).toBe("browser-tree:scope:null:vault");
  });

  it("keys disclosure state by scope and browser mode", () => {
    const vaultKey = browserTreeExpansionKey("scope-a", "vault");
    const codeKey = browserTreeExpansionKey("scope-a", "code");

    useBrowserTreeExpansionStore.getState().toggle(vaultKey, "f:auth");
    useBrowserTreeExpansionStore.getState().setActiveKey(vaultKey, "f:auth");
    expect(useBrowserTreeExpansionStore.getState()).toMatchObject({
      key: vaultKey,
      expandedKeys: ["f:auth"],
      activeKey: "f:auth",
    });

    useBrowserTreeExpansionStore.getState().setKey(codeKey);
    expect(useBrowserTreeExpansionStore.getState()).toMatchObject({
      key: codeKey,
      expandedKeys: [],
      activeKey: null,
    });
  });

  it("caps disclosure state to a bounded recent set", () => {
    const key = browserTreeExpansionKey("scope-a", "code");

    for (let i = 0; i < BROWSER_TREE_EXPANDED_KEYS_CAP + 3; i += 1) {
      useBrowserTreeExpansionStore.getState().toggle(key, `src/dir-${i}`);
    }

    const expandedKeys = useBrowserTreeExpansionStore.getState().expandedKeys;
    expect(expandedKeys).toHaveLength(BROWSER_TREE_EXPANDED_KEYS_CAP);
    expect(expandedKeys).not.toContain("src/dir-0");
    expect(expandedKeys[expandedKeys.length - 1]).toBe(
      `src/dir-${BROWSER_TREE_EXPANDED_KEYS_CAP + 2}`,
    );
  });

  it("stores roving active key behind the same scoped browser tree seam", () => {
    const key = browserTreeExpansionKey("scope-a", "vault");

    useBrowserTreeExpansionStore.getState().setActiveKey(key, "r:.vault/foo.md");
    expect(useBrowserTreeExpansionStore.getState()).toMatchObject({
      key,
      activeKey: "r:.vault/foo.md",
    });

    useBrowserTreeExpansionStore.getState().reset();
    expect(useBrowserTreeExpansionStore.getState()).toMatchObject({
      activeKey: null,
      expandedKeys: [],
    });
  });

  it("rejects empty disclosure and active keys at the store boundary", () => {
    const key = browserTreeExpansionKey("scope-a", "vault");

    expect(normalizeBrowserTreeExpansionKey(key)).toBe(key);
    expect(normalizeBrowserTreeExpansionKey("")).toBeNull();
    expect(normalizeBrowserTreeExpansionKey(` ${key} `)).toBe(key);
    expect(
      normalizeBrowserTreeExpansionKey("x".repeat(BROWSER_TREE_KEY_MAX_CHARS + 1)),
    ).toBeNull();
    expect(normalizeBrowserTreeExpansionKey("   ")).toBeNull();
    expect(normalizeBrowserTreeItemKey("f:auth")).toBe("f:auth");
    expect(normalizeBrowserTreeItemKey(" f:auth ")).toBe("f:auth");
    expect(
      normalizeBrowserTreeItemKey("x".repeat(BROWSER_TREE_ITEM_KEY_MAX_CHARS + 1)),
    ).toBeNull();
    expect(normalizeBrowserTreeItemKey("   ")).toBeNull();
    expect(normalizeBrowserTreeItemKey(null)).toBeNull();
    expect(normalizeBrowserTreeActiveKey("r:.vault/foo.md")).toBe("r:.vault/foo.md");
    expect(normalizeBrowserTreeActiveKey(" r:.vault/foo.md ")).toBe("r:.vault/foo.md");
    expect(normalizeBrowserTreeActiveKey("   ")).toBeNull();
    expect(normalizeBrowserTreeActiveKey("")).toBeNull();
    expect(normalizeBrowserTreeActiveKey(null)).toBeNull();

    useBrowserTreeExpansionStore.getState().toggle(` ${key} `, " f:auth ");
    expect(useBrowserTreeExpansionStore.getState()).toMatchObject({
      key,
      expandedKeys: ["f:auth"],
    });
    useBrowserTreeExpansionStore.getState().reset();

    useBrowserTreeExpansionStore.getState().toggle(key, "");
    useBrowserTreeExpansionStore.getState().toggle(key, "   ");
    useBrowserTreeExpansionStore.getState().toggle(key, null);
    useBrowserTreeExpansionStore.getState().toggle("", "f:auth");
    useBrowserTreeExpansionStore.getState().toggle("   ", "f:auth");
    useBrowserTreeExpansionStore
      .getState()
      .toggle("x".repeat(BROWSER_TREE_KEY_MAX_CHARS + 1), "f:auth");
    useBrowserTreeExpansionStore
      .getState()
      .toggle(key, "x".repeat(BROWSER_TREE_ITEM_KEY_MAX_CHARS + 1));
    expect(useBrowserTreeExpansionStore.getState()).toMatchObject({
      key: browserTreeExpansionKey(null, "vault"),
      expandedKeys: [],
    });

    useBrowserTreeExpansionStore
      .getState()
      .setActiveKey(` ${key} `, " r:.vault/foo.md ");
    expect(useBrowserTreeExpansionStore.getState()).toMatchObject({
      key,
      expandedKeys: [],
      activeKey: "r:.vault/foo.md",
    });

    useBrowserTreeExpansionStore.getState().setActiveKey(key, "");
    expect(useBrowserTreeExpansionStore.getState()).toMatchObject({
      key,
      expandedKeys: [],
      activeKey: null,
    });

    useBrowserTreeExpansionStore.getState().setKey("");
    useBrowserTreeExpansionStore.getState().setKey("   ");
    expect(useBrowserTreeExpansionStore.getState()).toMatchObject({
      key,
      expandedKeys: [],
      activeKey: null,
    });
  });

  it("keeps malformed runtime scope inert at the hook write seam", () => {
    const key = browserTreeExpansionKey("scope-a", "vault");
    useBrowserTreeExpansionStore.getState().toggle(key, "f:kept");

    const { result } = renderHook(() =>
      useBrowserTreeExpansion({ scope: "scope-a" }, "vault"),
    );

    expect(result.current.expanded.size).toBe(0);
    expect(result.current.activeKey).toBeNull();

    act(() => {
      result.current.toggle("f:bad");
      result.current.setActiveKey("f:bad");
    });

    expect(useBrowserTreeExpansionStore.getState()).toMatchObject({
      key,
      expandedKeys: ["f:kept"],
      activeKey: null,
    });
  });

  it("keeps explicit null scope writable as the intentional no-scope bucket", () => {
    const key = browserTreeExpansionKey(null, "vault");
    const { result } = renderHook(() => useBrowserTreeExpansion(null, "vault"));

    act(() => {
      result.current.toggle("f:null-scope");
      result.current.setActiveKey("f:null-scope");
    });

    expect(useBrowserTreeExpansionStore.getState()).toMatchObject({
      key,
      expandedKeys: ["f:null-scope"],
      activeKey: "f:null-scope",
    });
  });

  it("projects expanded state for browser tree row keys", () => {
    const expanded = new Set(["f:auth"]);

    expect(deriveBrowserTreeExpansionItem("f:auth", expanded)).toEqual({
      key: "f:auth",
      expanded: true,
    });
    expect(deriveBrowserTreeExpansionItem("d:auth/adr", expanded)).toEqual({
      key: "d:auth/adr",
      expanded: false,
    });
  });

  it("derives the visible vault-tree nav order from expansion state", () => {
    const groups = [
      {
        feature: "auth",
        docTypes: [
          {
            docType: "adr",
            entries: [{ path: ".vault/adr/auth.md" }],
          },
          {
            docType: "plan",
            entries: [{ path: ".vault/plan/auth.md" }],
          },
        ],
      },
      {
        feature: "search",
        docTypes: [
          {
            docType: "research",
            entries: [{ path: ".vault/research/search.md" }],
          },
        ],
      },
    ];

    expect(deriveVaultBrowserTreeNavOrder(groups, new Set())).toEqual([
      "f:auth",
      "f:search",
    ]);

    expect(
      deriveVaultBrowserTreeNavOrder(
        groups,
        new Set(["f:auth", "d:auth/adr", "f:search"]),
      ),
    ).toEqual([
      "f:auth",
      "d:auth/adr",
      "r:.vault/adr/auth.md",
      "d:auth/plan",
      "f:search",
      "d:search/research",
    ]);
  });

  it("derives the roving key from the visible order", () => {
    expect(deriveBrowserTreeRovingKey("d:auth/adr", ["f:auth", "d:auth/adr"])).toBe(
      "d:auth/adr",
    );
    expect(deriveBrowserTreeRovingKey("r:missing.md", ["f:auth"])).toBe("f:auth");
    expect(deriveBrowserTreeRovingKey(null, [])).toBeNull();
  });

  it("projects keyboard roving targets from the visible browser-tree order", () => {
    const order = ["f:auth", "d:auth/adr", "r:.vault/adr/auth.md"];

    expect(deriveBrowserTreeKeyboardTarget(order, "f:auth", "ArrowDown")).toBe(
      "d:auth/adr",
    );
    expect(deriveBrowserTreeKeyboardTarget(order, "d:auth/adr", "ArrowUp")).toBe(
      "f:auth",
    );
    expect(deriveBrowserTreeKeyboardTarget(order, "f:auth", "ArrowUp")).toBe("f:auth");
    expect(
      deriveBrowserTreeKeyboardTarget(order, "r:.vault/adr/auth.md", "ArrowDown"),
    ).toBe("r:.vault/adr/auth.md");
  });

  it("keeps malformed keyboard roving targets inert", () => {
    const order = ["f:auth", "d:auth/adr"];

    expect(deriveBrowserTreeKeyboardTarget(order, "f:auth", "Enter")).toBeNull();
    expect(deriveBrowserTreeKeyboardTarget(order, "missing", "ArrowDown")).toBeNull();
    expect(deriveBrowserTreeKeyboardTarget(order, "   ", "ArrowDown")).toBeNull();
    expect(deriveBrowserTreeKeyboardTarget([], "f:auth", "ArrowDown")).toBeNull();
    expect(
      deriveBrowserTreeKeyboardTarget(order, { key: "f:auth" }, "ArrowDown"),
    ).toBeNull();
  });

  it("derives code-tree nav keys by kind and path", () => {
    expect(
      deriveCodeBrowserTreeNavKey({
        path: "src",
        kind: "dir",
        node_id: "code:src",
      }),
    ).toBe("d:src");
    expect(
      deriveCodeBrowserTreeNavKey({
        path: "src/app.ts",
        kind: "file",
        node_id: "code:src/app.ts",
      }),
    ).toBe("f:src/app.ts");
  });

  it("derives code-tree row state and chrome from tree inputs", () => {
    const file = {
      path: "src/components/Button.tsx",
      kind: "file" as const,
      node_id: "code:src/components/Button.tsx",
    };

    expect(
      deriveCodeBrowserTreeRowView(file, {
        depth: 1,
        filter: "button",
        highlightPath: "src/components/Button.tsx",
        expanded: new Set(),
        linkedNodeIds: new Set(["code:src/components/Button.tsx"]),
        chevronPx: 12,
      }),
    ).toMatchObject({
      navKey: "f:src/components/Button.tsx",
      isDir: false,
      expanded: false,
      linked: true,
      highlighted: true,
      visible: true,
      rowStyle: { paddingLeft: "0.25rem" },
      rowClassName:
        "flex h-[30px] w-full items-center gap-fg-1 truncate rounded-fg-xs pr-fg-1 text-meta text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus bg-accent-subtle font-medium text-ink",
      selectionCueClassName: "h-3 w-0.5 shrink-0 rounded-full bg-accent",
      chevronClassName: "shrink-0 text-ink-faint",
      chevronSpacerStyle: { display: "inline-block", width: 12 },
      markClassName: "shrink-0 text-ink-faint",
      labelClassName: "min-w-0 truncate font-mono",
      linkedCueClassName: "ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70",
      linkedCueAriaLabel: "has graph linkage",
    });
  });

  it("keeps directories visible while filtering and derives expansion state", () => {
    const dir = {
      path: "src/components",
      kind: "dir" as const,
      node_id: "code:src/components",
    };
    const hiddenFile = {
      path: "src/routes/Home.tsx",
      kind: "file" as const,
      node_id: "code:src/routes/Home.tsx",
    };

    expect(
      deriveCodeBrowserTreeRowView(dir, {
        depth: 0,
        filter: "button",
        highlightPath: null,
        expanded: new Set(["src/components"]),
        chevronPx: 12,
      }),
    ).toMatchObject({
      navKey: "d:src/components",
      isDir: true,
      expanded: true,
      linked: false,
      highlighted: false,
      visible: true,
      selectionCueClassName: "h-3 w-0.5 shrink-0 rounded-full bg-transparent",
    });

    expect(
      deriveCodeBrowserTreeRowView(hiddenFile, {
        depth: 0,
        filter: "button",
        highlightPath: null,
        expanded: new Set(),
        chevronPx: 12,
      }).visible,
    ).toBe(false);
  });

  it("normalizes code-tree filter text inside the row projection", () => {
    const file = {
      path: "src/components/Button.tsx",
      kind: "file" as const,
      node_id: "code:src/components/Button.tsx",
    };

    expect(
      deriveCodeBrowserTreeRowView(file, {
        depth: 0,
        filter: "  BUTTON  ",
        highlightPath: null,
        expanded: new Set(),
        chevronPx: 12,
      }).visible,
    ).toBe(true);
  });
});
