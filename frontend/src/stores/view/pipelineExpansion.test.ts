// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PIPELINE_EXPANSION_AS_OF_MAX_CHARS,
  PIPELINE_EXPANDED_IDS_CAP,
  PIPELINE_EXPANSION_KEY_MAX_CHARS,
  canWritePipelineExpansionIdentity,
  derivePipelineExpansionRows,
  normalizePipelineExpansionAsOf,
  normalizePipelineExpandedIds,
  normalizePipelineExpansionKey,
  normalizePipelineExpansionScope,
  pipelineExpansionKey,
  usePipelineExpansion,
  usePipelineExpansionStore,
} from "./pipelineExpansion";

describe("pipeline expansion store", () => {
  beforeEach(() => usePipelineExpansionStore.getState().reset());
  afterEach(() => cleanup());

  it("derives collision-resistant keys for null, live, and separator-bearing parts", () => {
    expect(pipelineExpansionKey(null)).toBe(
      "pipeline-expansion:scope:null:playhead:live",
    );
    expect(pipelineExpansionKey("none")).toBe(
      "pipeline-expansion:scope:value:none:playhead:live",
    );
    expect(pipelineExpansionKey("null", "live")).toBe(
      "pipeline-expansion:scope:value:null:playhead:value:live",
    );
    expect(pipelineExpansionKey("a::b", "live")).toBe(
      "pipeline-expansion:scope:value:a%3A%3Ab:playhead:value:live",
    );
    expect(pipelineExpansionKey("scope-a", "time::42")).toBe(
      "pipeline-expansion:scope:value:scope-a:playhead:value:time%3A%3A42",
    );
  });

  it("normalizes pipeline expansion scope and playhead before minting state keys", () => {
    expect(normalizePipelineExpansionScope(" scope-a ")).toBe("scope-a");
    expect(normalizePipelineExpansionScope("   ")).toBeNull();
    expect(normalizePipelineExpansionScope({ scope: "scope-a" })).toBeNull();
    expect(normalizePipelineExpansionAsOf(42)).toBe(42);
    expect(normalizePipelineExpansionAsOf(Number.NaN)).toBeUndefined();
    expect(normalizePipelineExpansionAsOf(" time::42 ")).toBe("time::42");
    expect(normalizePipelineExpansionAsOf("   ")).toBeUndefined();
    expect(
      normalizePipelineExpansionAsOf(
        "t".repeat(PIPELINE_EXPANSION_AS_OF_MAX_CHARS + 1),
      ),
    ).toBeUndefined();
    expect(normalizePipelineExpansionAsOf({ at: 42 })).toBeUndefined();
    expect(canWritePipelineExpansionIdentity(" scope-a ", undefined)).toBe(true);
    expect(canWritePipelineExpansionIdentity(null, undefined)).toBe(true);
    expect(canWritePipelineExpansionIdentity("scope-a", 42)).toBe(true);
    expect(canWritePipelineExpansionIdentity("scope-a", " live ")).toBe(true);
    expect(canWritePipelineExpansionIdentity({ scope: "scope-a" }, undefined)).toBe(
      false,
    );
    expect(canWritePipelineExpansionIdentity("scope-a", { at: 42 })).toBe(false);
    expect(canWritePipelineExpansionIdentity("scope-a", null)).toBe(false);
    expect(pipelineExpansionKey(" scope-a ", " live ")).toBe(
      "pipeline-expansion:scope:value:scope-a:playhead:value:live",
    );
    expect(pipelineExpansionKey({ scope: "scope-a" }, { at: 42 })).toBe(
      "pipeline-expansion:scope:null:playhead:live",
    );
  });

  it("keys expanded plan rows by scope and playhead", () => {
    const store = usePipelineExpansionStore.getState();
    const liveKey = pipelineExpansionKey("scope-a");
    const historicalKey = pipelineExpansionKey("scope-a", 42);

    store.toggle(liveKey, "doc:plan-a");
    expect(usePipelineExpansionStore.getState()).toMatchObject({
      key: liveKey,
      expandedIds: ["doc:plan-a"],
    });

    usePipelineExpansionStore.getState().setKey(historicalKey);
    expect(usePipelineExpansionStore.getState()).toMatchObject({
      key: historicalKey,
      expandedIds: [],
    });
  });

  it("prunes expanded ids that are no longer visible in the pipeline projection", () => {
    const key = pipelineExpansionKey("scope-a");
    const store = usePipelineExpansionStore.getState();
    store.toggle(key, "doc:plan-a");
    store.toggle(key, "doc:plan-b");

    usePipelineExpansionStore.getState().pruneVisible(key, ["doc:plan-b"]);

    expect(usePipelineExpansionStore.getState().expandedIds).toEqual(["doc:plan-b"]);
  });

  it("normalizes expanded ids at the pipeline expansion boundary", () => {
    const key = pipelineExpansionKey("scope-a");
    const store = usePipelineExpansionStore.getState();

    expect(normalizePipelineExpansionKey(key)).toBe(key);
    expect(normalizePipelineExpansionKey(` ${key} `)).toBe(key);
    expect(normalizePipelineExpansionKey("")).toBeNull();
    expect(normalizePipelineExpansionKey("   ")).toBeNull();
    expect(
      normalizePipelineExpansionKey(
        "pipeline-expansion:".concat("x".repeat(PIPELINE_EXPANSION_KEY_MAX_CHARS + 1)),
      ),
    ).toBeNull();
    expect(
      pipelineExpansionKey(
        "scope-a",
        "t".repeat(PIPELINE_EXPANSION_AS_OF_MAX_CHARS + 1),
      ),
    ).toBe(pipelineExpansionKey("scope-a"));
    expect(
      pipelineExpansionKey(
        "s".repeat(PIPELINE_EXPANSION_KEY_MAX_CHARS - 300),
        "t".repeat(PIPELINE_EXPANSION_AS_OF_MAX_CHARS),
      ),
    ).toBe(pipelineExpansionKey(null));

    store.toggle("", "doc:plan-empty-key");
    expect(usePipelineExpansionStore.getState()).toMatchObject({
      key: pipelineExpansionKey(null),
      expandedIds: [],
    });

    store.toggle(key, "   ");
    store.toggle(` ${key} `, " doc:plan-a ");
    store.toggle(key, "doc:plan-a");
    store.toggle(key, " doc:plan-b ");

    expect(usePipelineExpansionStore.getState().expandedIds).toEqual(["doc:plan-b"]);

    usePipelineExpansionStore.setState({
      key,
      expandedIds: [" doc:plan-a ", "doc:plan-a", "doc:plan-b", ""],
    });
    usePipelineExpansionStore.getState().pruneVisible("", ["doc:plan-a"]);
    expect(usePipelineExpansionStore.getState().expandedIds).toEqual([
      " doc:plan-a ",
      "doc:plan-a",
      "doc:plan-b",
      "",
    ]);

    usePipelineExpansionStore
      .getState()
      .pruneVisible(` ${key} `, [" doc:plan-a ", "doc:plan-b"]);

    expect(usePipelineExpansionStore.getState().expandedIds).toEqual([
      "doc:plan-a",
      "doc:plan-b",
    ]);
  });

  it("caps expanded ids to a bounded recent set", () => {
    const key = pipelineExpansionKey("scope-a");
    const store = usePipelineExpansionStore.getState();

    for (let i = 0; i < PIPELINE_EXPANDED_IDS_CAP + 4; i += 1) {
      store.toggle(key, `doc:plan-${i}`);
    }

    const expandedIds = usePipelineExpansionStore.getState().expandedIds;
    expect(expandedIds).toHaveLength(PIPELINE_EXPANDED_IDS_CAP);
    expect(expandedIds).not.toContain("doc:plan-0");
    expect(expandedIds[expandedIds.length - 1]).toBe(
      `doc:plan-${PIPELINE_EXPANDED_IDS_CAP + 3}`,
    );
  });

  it("keeps malformed runtime identity inert at the hook write seam", () => {
    const key = pipelineExpansionKey("scope-a");
    usePipelineExpansionStore.getState().toggle(key, "doc:plan-kept");

    const malformedScope = renderHook(() =>
      usePipelineExpansion({ scope: "scope-a" }, undefined, ["doc:plan-bad"]),
    );

    expect(malformedScope.result.current.expanded.size).toBe(0);

    act(() => malformedScope.result.current.toggle("doc:plan-bad"));

    expect(usePipelineExpansionStore.getState()).toMatchObject({
      key,
      expandedIds: ["doc:plan-kept"],
    });

    const malformedAsOf = renderHook(() =>
      usePipelineExpansion("scope-a", { at: 42 }, ["doc:plan-bad"]),
    );

    act(() => malformedAsOf.result.current.toggle("doc:plan-bad"));

    expect(usePipelineExpansionStore.getState()).toMatchObject({
      key,
      expandedIds: ["doc:plan-kept"],
    });
  });

  it("keeps explicit null scope writable for the live pipeline bucket", () => {
    const key = pipelineExpansionKey(null);
    const { result } = renderHook(() =>
      usePipelineExpansion(null, undefined, ["doc:plan-a"]),
    );

    act(() => result.current.toggle("doc:plan-a"));

    expect(usePipelineExpansionStore.getState()).toMatchObject({
      key,
      expandedIds: ["doc:plan-a"],
    });
  });

  it("projects expanded state onto server plan-row and artifact row shapes", () => {
    const expanded = new Set(["doc:plan-b"]);

    expect(
      derivePipelineExpansionRows(
        [
          { nodeId: "doc:plan-a", titleLabel: "Plan A" },
          { nodeId: "doc:plan-b", titleLabel: "Plan B" },
        ],
        expanded,
      ),
    ).toEqual([
      {
        row: { nodeId: "doc:plan-a", titleLabel: "Plan A" },
        nodeId: "doc:plan-a",
        expanded: false,
        statusPlanClassName:
          "overflow-hidden rounded-fg-sm border border-rule bg-paper-raised",
        statusPlanSelectedValue: undefined,
      },
      {
        row: { nodeId: "doc:plan-b", titleLabel: "Plan B" },
        nodeId: "doc:plan-b",
        expanded: true,
        statusPlanClassName:
          "overflow-hidden rounded-fg-sm border border-rule bg-paper-raised",
        statusPlanSelectedValue: "",
      },
    ]);

    expect(
      derivePipelineExpansionRows(
        [
          { node_id: "doc:plan-a", stem: "plan-a" },
          { node_id: " doc:plan-b ", stem: "plan-b" },
        ],
        expanded,
      ).map((row) => ({
        nodeId: row.nodeId,
        expanded: row.expanded,
      })),
    ).toEqual([
      { nodeId: "doc:plan-a", expanded: false },
      { nodeId: "doc:plan-b", expanded: true },
    ]);
  });

  it("keeps the most recent normalized expanded ids under the cap", () => {
    expect(
      normalizePipelineExpandedIds([
        "",
        " doc:old ",
        "doc:old",
        ...Array.from(
          { length: PIPELINE_EXPANDED_IDS_CAP + 3 },
          (_, i) => `doc:plan-${i}`,
        ),
      ]),
    ).toEqual(
      Array.from({ length: PIPELINE_EXPANDED_IDS_CAP }, (_, i) => `doc:plan-${i + 3}`),
    );
    expect(normalizePipelineExpandedIds(null)).toEqual([]);
  });
});
