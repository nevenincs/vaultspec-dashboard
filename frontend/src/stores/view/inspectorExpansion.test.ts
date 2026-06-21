// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  INSPECTOR_EXPANSION_KEY_MAX_CHARS,
  canWriteInspectorExpansionIdentity,
  inspectorExpansionKey,
  normalizeInspectorExpansionKey,
  normalizeInspectorExpansionNodeId,
  normalizeInspectorExpansionScope,
  normalizeInspectorExpansionTier,
  normalizeInspectorExpansionTiers,
  useInspectorExpansionStore,
  useInspectorTierExpansion,
} from "./inspectorExpansion";

describe("inspector expansion store", () => {
  beforeEach(() => useInspectorExpansionStore.getState().reset());
  afterEach(() => cleanup());

  it("derives collision-resistant keys for null and separator-bearing parts", () => {
    expect(inspectorExpansionKey(null, null)).toBe(
      "inspector-expansion:scope:null:node:null",
    );
    expect(inspectorExpansionKey("none", "none")).toBe(
      "inspector-expansion:scope:value:none:node:value:none",
    );
    expect(inspectorExpansionKey("null", "doc:null")).toBe(
      "inspector-expansion:scope:value:null:node:value:doc%3Anull",
    );
    expect(inspectorExpansionKey("a::b", "doc:x::y")).toBe(
      "inspector-expansion:scope:value:a%3A%3Ab:node:value:doc%3Ax%3A%3Ay",
    );
  });

  it("normalizes inspector scope and node identity before minting state keys", () => {
    expect(normalizeInspectorExpansionScope(" scope-a ")).toBe("scope-a");
    expect(normalizeInspectorExpansionScope("   ")).toBeNull();
    expect(normalizeInspectorExpansionScope({ scope: "scope-a" })).toBeNull();
    expect(normalizeInspectorExpansionNodeId(" doc:plan-a ")).toBe("doc:plan-a");
    expect(normalizeInspectorExpansionNodeId("   ")).toBeNull();
    expect(normalizeInspectorExpansionNodeId({ id: "doc:plan-a" })).toBeNull();
    expect(canWriteInspectorExpansionIdentity(" scope-a ", " doc:plan-a ")).toBe(true);
    expect(canWriteInspectorExpansionIdentity(null, "doc:plan-a")).toBe(true);
    expect(canWriteInspectorExpansionIdentity({ scope: "scope-a" }, "doc:plan-a")).toBe(
      false,
    );
    expect(canWriteInspectorExpansionIdentity("scope-a", { id: "doc:plan-a" })).toBe(
      false,
    );
    expect(canWriteInspectorExpansionIdentity("scope-a", null)).toBe(false);
    expect(inspectorExpansionKey(" scope-a ", " doc:plan-a ")).toBe(
      "inspector-expansion:scope:value:scope-a:node:value:doc%3Aplan-a",
    );
    expect(inspectorExpansionKey({ scope: "scope-a" }, { id: "doc:plan-a" })).toBe(
      "inspector-expansion:scope:null:node:null",
    );
    expect(
      inspectorExpansionKey(
        "s".repeat(INSPECTOR_EXPANSION_KEY_MAX_CHARS),
        "doc:plan-a",
      ),
    ).toBe("inspector-expansion:scope:null:node:null");
  });

  it("keys expanded tiers by scope and inspected node", () => {
    const firstKey = inspectorExpansionKey("scope-a", "doc:plan-a");
    const secondKey = inspectorExpansionKey("scope-a", "doc:plan-b");

    useInspectorExpansionStore.getState().toggleTier(firstKey, "structural");
    expect(useInspectorExpansionStore.getState()).toMatchObject({
      key: firstKey,
      expandedTiers: ["structural"],
    });

    useInspectorExpansionStore.getState().setKey(secondKey);
    expect(useInspectorExpansionStore.getState()).toMatchObject({
      key: secondKey,
      expandedTiers: [],
    });
  });

  it("prunes expanded tiers no longer present on the inspected node", () => {
    const key = inspectorExpansionKey("scope-a", "doc:plan-a");
    const store = useInspectorExpansionStore.getState();

    store.toggleTier(key, "structural");
    store.toggleTier(key, "semantic");
    useInspectorExpansionStore.getState().pruneVisible(key, ["semantic"]);

    expect(useInspectorExpansionStore.getState().expandedTiers).toEqual(["semantic"]);
  });

  it("normalizes inspector tier expansion at the store boundary", () => {
    expect(normalizeInspectorExpansionKey("inspector:scope")).toBe("inspector:scope");
    expect(normalizeInspectorExpansionKey(" inspector:scope ")).toBe("inspector:scope");
    expect(
      normalizeInspectorExpansionKey("x".repeat(INSPECTOR_EXPANSION_KEY_MAX_CHARS + 1)),
    ).toBeNull();
    expect(normalizeInspectorExpansionKey("")).toBeNull();
    expect(normalizeInspectorExpansionKey("   ")).toBeNull();
    expect(normalizeInspectorExpansionKey(null)).toBeNull();
    expect(normalizeInspectorExpansionTier(" semantic ")).toBe("semantic");
    expect(normalizeInspectorExpansionTier("git")).toBeNull();
    expect(normalizeInspectorExpansionTier(null)).toBeNull();
    expect(
      normalizeInspectorExpansionTiers([
        " semantic ",
        "declared",
        "semantic",
        "unknown",
        "temporal",
        "structural",
        "extra",
      ]),
    ).toEqual(["semantic", "declared", "temporal", "structural"]);

    const key = inspectorExpansionKey("scope-a", "doc:plan-a");
    const store = useInspectorExpansionStore.getState();

    store.setKey(null);
    expect(useInspectorExpansionStore.getState().key).toBe(
      inspectorExpansionKey(null, null),
    );
    store.setKey(` ${key} `);
    expect(useInspectorExpansionStore.getState().key).toBe(key);

    store.toggleTier(null, "semantic");
    store.toggleTier("x".repeat(INSPECTOR_EXPANSION_KEY_MAX_CHARS + 1), "semantic");
    expect(useInspectorExpansionStore.getState().expandedTiers).toEqual([]);

    store.toggleTier(` ${key} `, " semantic ");
    store.toggleTier(key, "git");
    store.toggleTier(key, null);
    store.toggleTier(key, "semantic");
    expect(useInspectorExpansionStore.getState().expandedTiers).toEqual([]);

    store.toggleTier(key, " semantic ");
    useInspectorExpansionStore.setState({
      key,
      expandedTiers: [" semantic ", "semantic", "unknown", "declared"],
    });
    store.pruneVisible(key, [" semantic ", "declared"]);
    expect(useInspectorExpansionStore.getState().expandedTiers).toEqual([
      "semantic",
      "declared",
    ]);

    store.pruneVisible(null, ["declared"]);
    expect(useInspectorExpansionStore.getState().expandedTiers).toEqual([
      "semantic",
      "declared",
    ]);
  });

  it("keeps malformed runtime identity inert at the hook write seam", () => {
    const key = inspectorExpansionKey("scope-a", "doc:plan-a");
    useInspectorExpansionStore.getState().toggleTier(key, "semantic");

    const { result } = renderHook(() =>
      useInspectorTierExpansion({ scope: "scope-a" }, "doc:plan-a", ["semantic"]),
    );

    expect(result.current.expanded.size).toBe(0);

    act(() => result.current.toggle("declared"));

    expect(useInspectorExpansionStore.getState()).toMatchObject({
      key,
      expandedTiers: ["semantic"],
    });

    const malformedNode = renderHook(() =>
      useInspectorTierExpansion("scope-a", { id: "doc:plan-a" }, ["semantic"]),
    );

    act(() => malformedNode.result.current.toggle("structural"));

    expect(useInspectorExpansionStore.getState()).toMatchObject({
      key,
      expandedTiers: ["semantic"],
    });
  });

  it("keeps null inspected node inert because tier expansion is node-scoped", () => {
    const key = inspectorExpansionKey("scope-a", "doc:plan-a");
    useInspectorExpansionStore.getState().toggleTier(key, "semantic");

    const { result } = renderHook(() =>
      useInspectorTierExpansion("scope-a", null, ["semantic"]),
    );

    act(() => result.current.toggle("declared"));

    expect(useInspectorExpansionStore.getState()).toMatchObject({
      key,
      expandedTiers: ["semantic"],
    });
  });

  it("keeps explicit null scope writable when the inspected node is valid", () => {
    const key = inspectorExpansionKey(null, "doc:plan-a");
    const { result } = renderHook(() =>
      useInspectorTierExpansion(null, "doc:plan-a", ["semantic"]),
    );

    act(() => result.current.toggle("semantic"));

    expect(useInspectorExpansionStore.getState()).toMatchObject({
      key,
      expandedTiers: ["semantic"],
    });
  });
});
