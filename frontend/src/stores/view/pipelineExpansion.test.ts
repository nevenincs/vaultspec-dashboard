import { beforeEach, describe, expect, it } from "vitest";

import {
  PIPELINE_EXPANDED_IDS_CAP,
  derivePipelineExpansionRows,
  normalizePipelineExpandedIds,
  pipelineExpansionKey,
  usePipelineExpansionStore,
} from "./pipelineExpansion";

describe("pipeline expansion store", () => {
  beforeEach(() => usePipelineExpansionStore.getState().reset());

  it("derives collision-resistant keys for null, live, and separator-bearing parts", () => {
    expect(pipelineExpansionKey(null)).toBe(
      "pipeline-expansion:scope:null:playhead:live",
    );
    expect(pipelineExpansionKey("none")).toBe(
      "pipeline-expansion:scope:none:playhead:live",
    );
    expect(pipelineExpansionKey("a::b", "live")).toBe(
      "pipeline-expansion:scope:a%3A%3Ab:playhead:live",
    );
    expect(pipelineExpansionKey("scope-a", "time::42")).toBe(
      "pipeline-expansion:scope:scope-a:playhead:time%3A%3A42",
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

    store.toggle(key, "   ");
    store.toggle(key, " doc:plan-a ");
    store.toggle(key, "doc:plan-a");
    store.toggle(key, " doc:plan-b ");

    expect(usePipelineExpansionStore.getState().expandedIds).toEqual(["doc:plan-b"]);

    usePipelineExpansionStore.setState({
      key,
      expandedIds: [" doc:plan-a ", "doc:plan-a", "doc:plan-b", ""],
    });
    usePipelineExpansionStore
      .getState()
      .pruneVisible(key, [" doc:plan-a ", "doc:plan-b"]);

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
        statusPlanClassName: "overflow-hidden",
        statusPlanSelectedValue: undefined,
      },
      {
        row: { nodeId: "doc:plan-b", titleLabel: "Plan B" },
        nodeId: "doc:plan-b",
        expanded: true,
        statusPlanClassName: "overflow-hidden",
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
  });
});
