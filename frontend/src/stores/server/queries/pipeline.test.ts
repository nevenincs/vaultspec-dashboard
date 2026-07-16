// @vitest-environment happy-dom
// Split from queries.test.ts (module-decomposition mandate, 2026-07-12).

import { afterEach, describe, expect, it } from "vitest";
import { liveTransport } from "../../../testing/liveClient";
import {
  engineClient,
  type PipelineArtifact,
  type PlanInterior,
  type TiersBlock,
} from "../engine";
import {
  derivePipelineStatusView,
  derivePlanInteriorView,
  derivePlanSummaryView,
  engineKeys,
  normalizePipelineStatusRequestIdentity,
  normalizePlanInteriorRequestIdentity,
  usePipelineStatus,
  usePlanInterior,
} from "./index";
import { renderHook } from "@testing-library/react";
import { planInterior, testQueryClient, wrapper } from "./testFixtures";

afterEach(() => {
  engineClient.useTransport(liveTransport);
});

describe("derivePipelineStatusView (Work surface degradation, W01.P03.S17)", () => {
  const structuralUp: TiersBlock = { structural: { available: true } };
  const structuralDown: TiersBlock = {
    structural: { available: false, reason: "vault index rebuilding" },
  };
  const artifacts: PipelineArtifact[] = [
    {
      node_id: "doc:2026-06-14-x-plan",
      stem: "2026-06-14-x-plan",
      title: "x plan",
      doc_type: "plan",
      tier: "L3",
      progress: { done: 2, total: 5 },
      phase: "execute",
    },
    {
      node_id: "doc:2026-06-14-x-adr",
      stem: "2026-06-14-x-adr",
      title: "x adr",
      doc_type: "adr",
      status: "proposed",
      phase: "adr",
    },
  ];

  it("is not degraded and carries the artifacts when the structural tier is available", () => {
    const view = derivePipelineStatusView(structuralUp, artifacts, false);
    expect(view.degraded).toBe(false);
    expect(view.degradedTiers).toEqual([]);
    expect(view.artifacts).toHaveLength(2);
    expect(view.plans.map((artifact) => artifact.node_id)).toEqual([
      "doc:2026-06-14-x-plan",
    ]);
    expect(view.planRows).toHaveLength(1);
    expect(view.planRows[0]).toMatchObject({
      artifact: view.plans[0],
      nodeId: "doc:2026-06-14-x-plan",
      titleLabel: "x plan",
      modifiedAt: undefined,
      phaseLabel: "execute",
      tierLabel: "L3",
      tierAriaLabel: "tier L3",
      openAriaLabel: "open plan x plan in the reader",
      selectAriaLabel: "select plan x plan on the stage",
      showProgress: true,
      progressDone: 2,
      progressTotal: 5,
      progressTextLabel: "2/5",
      progressLabel: "x plan completion",
      progressPercentLabel: "40%",
    });
    expect(view.planRows[0]!.toggleLabel(false)).toBe("expand steps for x plan");
    expect(view.planRows[0]!.toggleLabel(true)).toBe("collapse steps for x plan");
    expect(view.adrs.map((artifact) => artifact.node_id)).toEqual([
      "doc:2026-06-14-x-adr",
    ]);
    expect(view.adrRows).toEqual([
      {
        artifact: view.adrs[0],
        nodeId: "doc:2026-06-14-x-adr",
        titleLabel: "x adr",
        modifiedAt: undefined,
        selectAriaLabel: "ADR x adr, status proposed",
        statusLabel: "proposed",
        featureLabel: null,
        showStatusPlaceholder: false,
        statusPlaceholderLabel: "status pending",
        rowClassName:
          "flex w-full items-center gap-fg-1-5 rounded-fg-xs border border-rule px-fg-2 py-fg-1 text-left transition-colors duration-ui-fast ease-settle hover:border-rule-strong hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        iconClassName: "shrink-0 text-ink-faint",
        bodyClassName: "min-w-0 flex-1",
        headingClassName: "flex items-center gap-fg-1-5",
        titleClassName: "min-w-0 truncate text-body text-ink",
        statusPlaceholderClassName:
          "shrink-0 rounded-fg-pill border border-rule px-fg-1-5 py-px text-caption text-ink-faint",
        metaClassName: "mt-px flex items-center gap-fg-1-5 text-caption text-ink-faint",
      },
    ]);
    expect(view.planIds).toEqual(["doc:2026-06-14-x-plan"]);
    expect([...view.occupiedPhases]).toEqual(["execute", "adr"]);
    expect(view.count).toBe(2);
    expect(view.workSurfaceState).toBe("list");
    expect(view.showWorkDegraded).toBe(false);
    expect(view.showWorkLoading).toBe(false);
    expect(view.showWorkEmpty).toBe(false);
    expect(view.showWorkList).toBe(true);
    expect(view.liveMessage).toBe("2 in-flight items");
    expect(view.workStatusTitle).toBe("2 in-flight items");
    expect(view.workStatusDetail).toBe("");
    expect(view.openPlansStatusLabel).toBe("1 plan in flight");
    expect(view.workSurfaceAriaLabel).toBe("work pipeline status");
    expect(view.workStatusSectionClassName).toBe(
      "flex flex-col items-center gap-fg-2 px-fg-2 py-fg-6 text-center text-label text-ink-muted",
    );
    expect(view.workListSectionClassName).toBe("space-y-fg-2 text-body");
    expect(view.workLiveRegionClassName).toBe("sr-only");
    expect(view.workStatusIconClassName).toBe("text-ink-faint");
    expect(view.workStatusTitleClassName).toBe("font-medium text-ink");
    expect(view.workStatusDetailClassName).toBe("text-ink-faint");
    expect(view.workListAriaLabel).toBe("in-flight pipeline work");
    expect(view.workListClassName).toBe("space-y-fg-1");
    expect(view.workTabbablePlanId).toBe("doc:2026-06-14-x-plan");
    expect(view.workTabbableAdrId).toBeNull();
  });

  it("derives WorkTab ADR row labels from pipeline artifacts", () => {
    const view = derivePipelineStatusView(
      structuralUp,
      [
        {
          node_id: "doc:adr-with-feature",
          stem: "adr-with-feature",
          title: "`Feature` ADR",
          doc_type: "adr",
          status: "accepted",
          phase: "adr",
          feature_tags: ["graph"],
          dates: { modified: "2026-06-18T00:00:00Z" },
        },
      ],
      false,
    );

    expect(view.adrRows).toEqual([
      {
        artifact: view.adrs[0],
        nodeId: "doc:adr-with-feature",
        titleLabel: "Feature ADR",
        modifiedAt: "2026-06-18T00:00:00Z",
        selectAriaLabel: "ADR Feature ADR, status accepted",
        statusLabel: "accepted",
        featureLabel: "graph",
        showStatusPlaceholder: false,
        statusPlaceholderLabel: "status pending",
        rowClassName:
          "flex w-full items-center gap-fg-1-5 rounded-fg-xs border border-rule px-fg-2 py-fg-1 text-left transition-colors duration-ui-fast ease-settle hover:border-rule-strong hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        iconClassName: "shrink-0 text-ink-faint",
        bodyClassName: "min-w-0 flex-1",
        headingClassName: "flex items-center gap-fg-1-5",
        titleClassName: "min-w-0 truncate text-body text-ink",
        statusPlaceholderClassName:
          "shrink-0 rounded-fg-pill border border-rule px-fg-1-5 py-px text-caption text-ink-faint",
        metaClassName: "mt-px flex items-center gap-fg-1-5 text-caption text-ink-faint",
      },
    ]);
    expect(view.workTabbablePlanId).toBeNull();
    expect(view.workTabbableAdrId).toBe("doc:adr-with-feature");
  });

  it("reports degraded when the structural tier is explicitly unavailable", () => {
    const view = derivePipelineStatusView(structuralDown, artifacts, false);
    expect(view.degraded).toBe(true);
    expect(view.degradedTiers).toContain("structural");
    expect(view.reasons.structural).toBe("vault index rebuilding");
    // While degraded the projection is not trusted: no stale list is rendered.
    expect(view.artifacts).toEqual([]);
    expect(view.plans).toEqual([]);
    expect(view.planRows).toEqual([]);
    expect(view.adrs).toEqual([]);
    expect(view.planIds).toEqual([]);
    expect(view.workTabbablePlanId).toBeNull();
    expect(view.workTabbableAdrId).toBeNull();
    expect(view.count).toBe(0);
    expect(view.workSurfaceState).toBe("degraded");
    expect(view.showWorkDegraded).toBe(true);
    expect(view.showWorkLoading).toBe(false);
    expect(view.showWorkEmpty).toBe(false);
    expect(view.showWorkList).toBe(false);
    expect(view.liveMessage).toBe("pipeline status unavailable");
    expect(view.workStatusTitle).toBe("pipeline status unavailable");
    expect(view.workStatusDetail).toBe(
      "the pipeline read is degraded — vault index rebuilding",
    );
    expect(view.openPlansStatusLabel).toBe("pipeline status unavailable");
  });

  it("carries the designed degraded fallback copy when the tier reason is absent", () => {
    const view = derivePipelineStatusView(
      { structural: { available: false } },
      artifacts,
      false,
    );
    expect(view.workStatusTitle).toBe("pipeline status unavailable");
    expect(view.workStatusDetail).toBe(
      "the pipeline read is degraded; in-flight work will appear here once it recovers",
    );
  });

  it("derives status-tab plan row labels from plan artifacts", () => {
    const view = derivePipelineStatusView(
      structuralUp,
      [
        {
          node_id: "doc:backtick-plan",
          stem: "backtick-plan",
          title: "`Backtick` plan",
          doc_type: "plan",
          phase: "plan",
        },
      ],
      false,
    );

    expect(view.planRows[0]).toMatchObject({
      nodeId: "doc:backtick-plan",
      titleLabel: "Backtick plan",
      modifiedAt: undefined,
      phaseLabel: "plan",
      tierLabel: null,
      tierAriaLabel: null,
      openAriaLabel: "open plan Backtick plan in the reader",
      selectAriaLabel: "select plan Backtick plan on the stage",
      showProgress: false,
      progressDone: 0,
      progressTotal: 0,
      progressTextLabel: "0/0",
      progressLabel: "Backtick plan completion",
      progressPercentLabel: null,
    });
    expect(view.planRows[0]!.toggleLabel(false)).toBe("expand steps for Backtick plan");
  });

  it("derives the WorkTab roving tab stop from the first plan, then first ADR", () => {
    const adrOnly = derivePipelineStatusView(
      structuralUp,
      [
        {
          node_id: "doc:2026-06-14-x-adr",
          stem: "2026-06-14-x-adr",
          title: "x adr",
          doc_type: "adr",
          status: "proposed",
          phase: "adr",
        },
      ],
      false,
    );

    expect(adrOnly.workTabbablePlanId).toBeNull();
    expect(adrOnly.workTabbableAdrId).toBe("doc:2026-06-14-x-adr");
  });

  it("reports degraded when the structural tier is ABSENT from the served block (absence != available)", () => {
    const view = derivePipelineStatusView(
      { semantic: { available: true } },
      artifacts,
      false,
    );
    expect(view.degraded).toBe(true);
    expect(view.degradedTiers).toContain("structural");
  });

  it("does NOT guess degraded from a wholly absent tiers block (transport fault stays a query error)", () => {
    const view = derivePipelineStatusView(undefined, artifacts, false);
    expect(view.degraded).toBe(false);
    // The held artifacts pass through; the surface renders them, not a degraded notice.
    expect(view.artifacts).toHaveLength(2);
  });

  it("the FRESH error envelope tiers win over a stale held-success block (call-site order)", () => {
    // The hook reads `errTiers ?? dataTiers`: a fresh error reporting the tier
    // down outranks a previously held success that reported it up. Exercise the
    // resolved truth the hook passes the selector.
    const heldSuccess = structuralUp;
    const freshError = structuralDown;
    const resolved = freshError ?? heldSuccess;
    const view = derivePipelineStatusView(resolved, artifacts, false);
    expect(view.degraded).toBe(true);
    expect(view.reasons.structural).toBe("vault index rebuilding");
  });

  it("carries the real pending flag through as loading", () => {
    const view = derivePipelineStatusView(structuralUp, [], true);
    expect(view.loading).toBe(true);
    expect(view.workSurfaceState).toBe("loading");
    expect(view.showWorkDegraded).toBe(false);
    expect(view.showWorkLoading).toBe(true);
    expect(view.showWorkEmpty).toBe(false);
    expect(view.showWorkList).toBe(false);
    expect(view.liveMessage).toBe("loading in-flight work");
    expect(view.workStatusTitle).toBe("reading in-flight work…");
    expect(view.workStatusDetail).toBe("");
    expect(view.workStatusSectionClassName).toBe(
      "flex flex-col items-center gap-fg-2 px-fg-2 py-fg-6 text-center text-label text-ink-faint",
    );
    expect(view.workStatusTitleClassName).toBe("animate-pulse-live");
    expect(view.openPlansStatusLabel).toBe("reading in-flight work…");
  });

  it("carries the designed empty-state copy from the stores layer", () => {
    const view = derivePipelineStatusView(structuralUp, [], false);
    expect(view.workSurfaceState).toBe("empty");
    expect(view.showWorkDegraded).toBe(false);
    expect(view.showWorkLoading).toBe(false);
    expect(view.showWorkEmpty).toBe(true);
    expect(view.showWorkList).toBe(false);
    expect(view.liveMessage).toBe("no in-flight work");
    expect(view.workStatusTitle).toBe("no work in flight on this branch");
    expect(view.workStatusDetail).toBe(
      "no in-flight pipeline work in the current scope; active ADRs and plans will appear here as they advance.",
    );
    expect(view.openPlansStatusLabel).toBe("no plans in flight on this branch");
  });

  it("does not expose cached pipeline data when no scope is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.pipeline(""), {
      artifacts,
      tiers: structuralUp,
    });
    client.setQueryData(engineKeys.pipeline("scope-a", "HEAD"), {
      artifacts,
      tiers: structuralUp,
    });

    expect(normalizePipelineStatusRequestIdentity(" scope-a ", " HEAD ")).toEqual({
      scope: "scope-a",
      asOf: "HEAD",
    });
    expect(
      normalizePipelineStatusRequestIdentity({ scope: "scope-a" }, Number.NaN),
    ).toEqual({
      scope: null,
      asOf: undefined,
    });

    const { result } = renderHook(() => usePipelineStatus(null), {
      wrapper: wrapper(client),
    });
    const malformedScope = renderHook(
      () => usePipelineStatus({ scope: "scope-a" }, "HEAD"),
      {
        wrapper: wrapper(client),
      },
    );

    expect(result.current.data).toBeUndefined();
    expect(malformedScope.result.current.data).toBeUndefined();
  });
});

describe("derivePlanSummaryView (plan card metadata from the engine summary)", () => {
  it("maps the served state + counts to presentation, % over served counts", () => {
    const view = derivePlanSummaryView({
      wave_count: 3,
      phase_count: 8,
      step_count: 21,
      done_count: 10,
      plan_state: "in-progress",
    });
    expect(view.hasStructure).toBe(true);
    expect(view.stateLabel).toEqual({
      key: "common:finalWave.planStates.inProgress",
    });
    expect(view.tone).toBe("active");
    expect(view.percent).toBe(48); // round(10/21*100)
    expect(view.percentLabel).toBe("48%");
    expect(view).toMatchObject({
      waveCount: 3,
      phaseCount: 8,
      stepCount: 21,
      doneCount: 10,
    });
  });

  it("derives the percentage from the TRUE counts even when the interior truncated", () => {
    // The summary carries the pre-truncation totals, so the card % is honest where
    // the old client-side count over the served slice would have been wrong.
    const view = derivePlanSummaryView({
      wave_count: 4,
      phase_count: 40,
      step_count: 9001,
      done_count: 4500,
      plan_state: "in-progress",
    });
    expect(view.percent).toBe(Math.round((4500 / 9001) * 100));
    expect(view.stepCount).toBe(9001);
  });

  it("treats a finished plan and a no-step plan honestly", () => {
    const finished = derivePlanSummaryView({
      wave_count: 0,
      phase_count: 2,
      step_count: 6,
      done_count: 6,
      plan_state: "finished",
    });
    expect(finished.stateLabel).toEqual({
      key: "common:finalWave.planStates.finished",
    });
    expect(finished.tone).toBe("complete");
    expect(finished.percentLabel).toBe("100%");

    const empty = derivePlanSummaryView({
      wave_count: 0,
      phase_count: 0,
      step_count: 0,
      done_count: 0,
      plan_state: null,
    });
    // No steps → no invented bar/percentage; falls back to "Not started".
    expect(empty.hasStructure).toBe(false);
    expect(empty.percent).toBeNull();
    expect(empty.percentLabel).toBeNull();
    expect(empty.stateLabel).toEqual({
      key: "common:finalWave.planStates.notStarted",
    });
    expect(empty.tone).toBe("pending");
  });
});

describe("derivePlanInteriorView (step-tree rollup + truncation, W01.P02.S11)", () => {
  it("passes through the engine-served rollups across the L3 wave/phase shape", () => {
    const interior: PlanInterior = {
      plan_node_id: "doc:x-plan",
      waves: [
        {
          node_id: "x#W01",
          id: "W01",
          heading: "wave one",
          phases: [
            {
              node_id: "x#W01/P01",
              id: "P01",
              heading: "phase one",
              steps: [
                { node_id: "x#S01", id: "S01", done: true },
                { node_id: "x#S02", id: "S02", done: false },
                { node_id: "x#S03", id: "S03", done: true },
              ],
              rollup: { done: 2, total: 3 },
            },
          ],
          rollup: { done: 2, total: 3 },
        },
      ],
      phases: [],
      steps: [],
      summary: {
        wave_count: 1,
        phase_count: 1,
        step_count: 3,
        done_count: 2,
        plan_state: "in-progress",
      },
      truncated: null,
    };
    const view = derivePlanInteriorView(interior, false);
    // Rollups are READ FROM THE WIRE, not re-counted client-side.
    expect(view.waves[0].phases[0].rollup).toEqual({ done: 2, total: 3 });
    expect(view.waves[0].rollup).toEqual({ done: 2, total: 3 });
    expect(view.hasUngroupedSteps).toBe(false);
    // The plan-level rollup comes from the engine summary.
    expect(view.rollup).toEqual({ done: 2, total: 3 });
    expect(view.truncated).toBeNull();
  });

  it("takes the plan rollup from the engine summary, honest under truncation", () => {
    // The interior serialized only 2 of 9001 steps, but the engine summary counts
    // the TRUE pre-truncation totals — so the plan rollup is NOT the undercount the
    // old client-side `rollupSteps(served)` would have produced ({1, 2}).
    const interior: PlanInterior = {
      plan_node_id: "doc:x-plan",
      waves: [],
      phases: [],
      steps: [
        {
          node_id: "x#S01",
          id: "S01",
          done: true,
          action: "wire the plan",
          exec_node_id: "doc:exec-a",
        },
        { node_id: "x#S02", id: "S02", done: false },
      ],
      summary: {
        wave_count: 0,
        phase_count: 0,
        step_count: 9001,
        done_count: 4500,
        plan_state: "in-progress",
      },
      truncated: { total_nodes: 9001, returned_nodes: 2000, reason: "node ceiling" },
    };
    const view = derivePlanInteriorView(interior, false);
    expect(view.rollup).toEqual({ done: 4500, total: 9001 });
    expect(view.empty).toBe(false);
    expect(view.hasUngroupedSteps).toBe(true);
    expect(view.listAriaLabel).toBe("plan steps");
    expect(view.steps).toMatchObject([
      {
        targetNodeId: "doc:exec-a",
        selectable: true,
        headingLabel: {
          key: "common:finalWave.planSteps.named",
          values: { step: "wire the plan" },
        },
        rowAriaLabel: {
          key: "common:finalWave.planSteps.openRecord",
          values: { step: "wire the plan" },
        },
        rowClassName:
          "flex w-full items-center gap-fg-1-5 rounded-fg-xs px-fg-1 py-fg-0-5 text-left text-label transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus hover:bg-paper-sunken",
      },
      {
        targetNodeId: null,
        selectable: false,
        headingLabel: {
          key: "common:finalWave.planSteps.generic",
        },
        rowAriaLabel: {
          key: "common:finalWave.planSteps.genericRecordUnavailable",
        },
        rowClassName:
          "flex w-full items-center gap-fg-1-5 rounded-fg-xs px-fg-1 py-fg-0-5 text-left text-label transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus cursor-default opacity-80",
      },
    ]);
    const presentation = view.steps.map(({ headingLabel, rowAriaLabel }) => ({
      headingLabel,
      rowAriaLabel,
    }));
    expect(JSON.stringify(presentation)).not.toContain("S01");
    expect(JSON.stringify(presentation)).not.toContain("S02");
    expect(JSON.stringify(presentation)).not.toContain("doc:exec-a");
    expect(view.truncated).toEqual({
      total_nodes: 9001,
      returned_nodes: 2000,
      reason: "node ceiling",
    });
    expect(view.truncatedMessage).toBe(
      "showing 2000 of 9001 nodes - this plan exceeds the interior ceiling; open it on the stage to see the full tree.",
    );
  });

  it("is the inert empty view while loading with no held interior", () => {
    const view = derivePlanInteriorView(undefined, true);
    expect(view.loading).toBe(true);
    expect(view.served).toBe(true);
    expect(view.empty).toBe(true);
    expect(view.loadingMessage).toBe("loading steps...");
    expect(view.placeholderMessage).toBe(
      "step tree pending - the plan interior is not yet served.",
    );
    expect(view.emptyMessage).toBe("no steps in this plan yet.");
    expect(view.listAriaLabel).toBe("plan steps");
    expect(view.truncatedMessage).toBeNull();
    expect(view.rollup).toEqual({ done: 0, total: 0 });
    expect(view.waves).toEqual([]);
    expect(view.hasUngroupedSteps).toBe(false);
  });

  it("does not expose cached plan interior data when the row is collapsed", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.planInterior("scope-a", ""), {
      interior: planInterior(),
      tiers: {},
    });
    client.setQueryData(engineKeys.planInterior("scope-a", "feature:state"), {
      interior: planInterior(),
      tiers: {},
    });
    client.setQueryData(engineKeys.planInterior("scope-a", "doc:plan"), {
      interior: planInterior(),
      tiers: {},
    });

    expect(normalizePlanInteriorRequestIdentity(" doc:plan ", " scope-a ")).toEqual({
      scope: "scope-a",
      planId: "doc:plan",
    });
    expect(
      normalizePlanInteriorRequestIdentity({ id: "doc:plan" }, { scope: "scope-a" }),
    ).toEqual({
      scope: null,
      planId: null,
    });
    expect(normalizePlanInteriorRequestIdentity("feature:state", "scope-a")).toEqual({
      scope: "scope-a",
      planId: null,
    });

    const { result } = renderHook(() => usePlanInterior(null, "scope-a"), {
      wrapper: wrapper(client),
    });
    const featureNode = renderHook(() => usePlanInterior("feature:state", "scope-a"), {
      wrapper: wrapper(client),
    });
    const malformedScope = renderHook(
      () => usePlanInterior("doc:plan", { scope: "scope-a" }),
      {
        wrapper: wrapper(client),
      },
    );

    expect(result.current.data).toBeUndefined();
    expect(featureNode.result.current.data).toBeUndefined();
    expect(malformedScope.result.current.data).toBeUndefined();
  });
});
