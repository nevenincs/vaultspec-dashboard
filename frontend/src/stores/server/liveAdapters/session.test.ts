// @vitest-environment happy-dom is NOT needed (pure adapter unit tests on captured samples).
// Split from liveAdapters.test.ts (module-decomposition mandate, 2026-07-12).

import { describe, expect, it } from "vitest";
import { adaptPipeline, adaptPlanInterior, unwrapEnvelope } from "./index";
import { TIERS } from "./testFixtures";

// --- dashboard-pipeline-wire W05.P12: consumer fidelity ----------------------------

describe("adaptPipeline + /pipeline consumer fidelity (W05.P12.S62)", () => {
  // A live `/pipeline` envelope: an active L3 plan (work started → execute) and a
  // proposed ADR (adr phase). The live route serves `{data: {artifacts}, tiers}`.
  const live = {
    data: {
      artifacts: [
        {
          node_id: "doc:2026-06-14-x-adr",
          stem: "2026-06-14-x-adr",
          title: "x adr",
          doc_type: "adr",
          status: "proposed",
          phase: "adr",
        },
        {
          node_id: "doc:2026-06-14-x-plan",
          stem: "2026-06-14-x-plan",
          title: "x plan",
          doc_type: "plan",
          tier: "L3",
          progress: { done: 2, total: 5 },
          phase: "execute",
        },
      ],
    },
    tiers: TIERS,
  };

  it("unwraps + adapts the live pipeline envelope", () => {
    const adapted = adaptPipeline(unwrapEnvelope(live));
    expect(adapted.artifacts).toHaveLength(2);
    expect(adapted.artifacts[0]).toMatchObject({
      node_id: "doc:2026-06-14-x-adr",
      status: "proposed",
      phase: "adr",
    });
    expect(adapted.artifacts[1]).toMatchObject({
      tier: "L3",
      phase: "execute",
      progress: { done: 2, total: 5 },
    });
    expect(adapted.tiers.semantic.available).toBe(false);
  });

  it("drops malformed pipeline artifacts and normalizes metadata", () => {
    const adapted = adaptPipeline({
      artifacts: [
        {
          node_id: " doc:2026-06-14-x-plan ",
          stem: " 2026-06-14-x-plan ",
          title: " x plan ",
          doc_type: " plan ",
          tier: " L3 ",
          progress: { done: 2, total: Number.NaN },
          phase: " execute ",
          feature_tags: [" work ", "work", "", 7],
          dates: { created: " 2026-06-14 ", modified: " " },
        },
        { stem: "missing-node-id", phase: "adr" },
        null,
      ],
      tiers: TIERS,
    });

    expect(adapted.artifacts).toHaveLength(1);
    expect(adapted.artifacts[0]).toMatchObject({
      node_id: "doc:2026-06-14-x-plan",
      stem: "2026-06-14-x-plan",
      title: "x plan",
      doc_type: "plan",
      tier: "L3",
      feature_tags: ["work"],
      dates: { created: "2026-06-14", modified: undefined },
      phase: "execute",
    });
    expect(adapted.artifacts[0].progress).toBeUndefined();
  });
});

describe("adaptPlanInterior + plan-interior consumer fidelity (W05.P12.S63)", () => {
  // A live `/nodes/{id}/plan-interior` envelope: an L3 interior (one wave, one
  // phase, two steps) with a truncated block. The route wraps under `interior`.
  const live = {
    data: {
      interior: {
        plan_node_id: "doc:2026-06-14-x-plan",
        waves: [
          {
            node_id: "plan:2026-06-14-x-plan/W01",
            id: "W01",
            heading: "the wave",
            phases: [
              {
                node_id: "plan:2026-06-14-x-plan/W01/P01",
                id: "P01",
                heading: "the phase",
                steps: [
                  {
                    node_id: "plan:2026-06-14-x-plan/W01/P01/S01",
                    id: "S01",
                    action: "did it",
                    done: true,
                    exec_node_id: "doc:2026-06-14-x-W01-P01-S01",
                  },
                  {
                    node_id: "plan:2026-06-14-x-plan/W01/P01/S02",
                    id: "S02",
                    action: "todo",
                    done: false,
                  },
                ],
                rollup: { done: 1, total: 2 },
              },
            ],
            rollup: { done: 1, total: 2 },
          },
        ],
        phases: [],
        steps: [],
        summary: {
          wave_count: 1,
          phase_count: 1,
          step_count: 9001,
          done_count: 1,
          plan_state: "in-progress",
        },
        truncated: {
          total_nodes: 9001,
          returned_nodes: 2000,
          reason: "plan interior node ceiling",
        },
      },
    },
    tiers: TIERS,
  };

  it("unwraps + adapts the live plan-interior envelope, folding the truncated block", () => {
    const adapted = adaptPlanInterior(unwrapEnvelope(live));
    expect(adapted.interior.plan_node_id).toBe("doc:2026-06-14-x-plan");
    expect(adapted.interior.waves).toHaveLength(1);
    const steps = adapted.interior.waves[0].phases[0].steps;
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({
      id: "S01",
      done: true,
      exec_node_id: "doc:2026-06-14-x-W01-P01-S01",
    });
    expect(steps[1].done).toBe(false);
    // The engine-served rollups + summary fold through (the summary counts the
    // TRUE pre-truncation total, not the 2 steps the truncated tree serialized).
    expect(adapted.interior.waves[0].rollup).toEqual({ done: 1, total: 2 });
    expect(adapted.interior.waves[0].phases[0].rollup).toEqual({ done: 1, total: 2 });
    expect(adapted.interior.summary).toEqual({
      wave_count: 1,
      phase_count: 1,
      step_count: 9001,
      done_count: 1,
      plan_state: "in-progress",
    });
    expect(adapted.interior.truncated).toEqual({
      total_nodes: 9001,
      returned_nodes: 2000,
      reason: "plan interior node ceiling",
    });
  });

  it("drops malformed plan-interior rows and normalizes renderable ids", () => {
    const adapted = adaptPlanInterior({
      interior: {
        plan_node_id: " doc:plan ",
        waves: [
          {
            node_id: " plan:wave ",
            id: " W01 ",
            heading: " Wave ",
            phases: [
              {
                node_id: " plan:phase ",
                id: " P01 ",
                heading: " Phase ",
                steps: [
                  {
                    node_id: " plan:step ",
                    id: " S01 ",
                    action: " Do work ",
                    exec_node_id: " doc:exec ",
                    done: true,
                  },
                  { id: "S02", done: false },
                ],
              },
              { node_id: "   ", id: "P02", steps: [] },
            ],
          },
          { id: "W02", phases: [] },
        ],
        phases: [{ node_id: " plan:flat-phase ", id: " P99 ", steps: [null] }],
        steps: [{ node_id: " plan:flat-step ", id: " S99 ", action: " Flat " }, null],
      },
      tiers: TIERS,
    });

    expect(adapted.interior.plan_node_id).toBe("doc:plan");
    expect(adapted.interior.waves).toHaveLength(1);
    expect(adapted.interior.waves[0]).toMatchObject({
      node_id: "plan:wave",
      id: "W01",
      heading: "Wave",
    });
    expect(adapted.interior.waves[0].phases).toHaveLength(1);
    expect(adapted.interior.waves[0].phases[0]).toMatchObject({
      node_id: "plan:phase",
      id: "P01",
      heading: "Phase",
    });
    expect(adapted.interior.waves[0].phases[0].steps).toEqual([
      {
        node_id: "plan:step",
        id: "S01",
        action: "Do work",
        exec_node_id: "doc:exec",
        done: true,
      },
    ]);
    expect(adapted.interior.phases).toEqual([
      {
        node_id: "plan:flat-phase",
        id: "P99",
        steps: [],
        rollup: { done: 0, total: 0 },
      },
    ]);
    expect(adapted.interior.steps).toEqual([
      { node_id: "plan:flat-step", id: "S99", action: "Flat", done: false },
    ]);
  });
});
