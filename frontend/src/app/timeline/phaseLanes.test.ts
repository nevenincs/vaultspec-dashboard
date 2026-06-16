import { describe, expect, it } from "vitest";

import {
  GROUP_LANE_HEIGHT,
  LANE_HEIGHT,
  PHASE_LANES,
  TIMELINE_LANE_GROUPS,
  groupIdOfPhase,
  groupIndexOf,
  groupIndexOfId,
  groupLaneCenterY,
  groupLanesHeight,
  laneCenterY,
  laneDescriptor,
  laneIndex,
  laneLabel,
  laneOf,
  laneY,
  lanesHeight,
  phaseForDocType,
} from "./phaseLanes";

describe("phase-lane order (S32, dashboard-timeline ADR: few, fixed, pipeline order)", () => {
  it("lists the six pipeline phases top-to-bottom in pipeline order", () => {
    expect([...PHASE_LANES]).toEqual([
      "research",
      "adr",
      "plan",
      "exec",
      "review",
      "codify",
    ]);
  });

  it("maps each phase token to its vertical lane index, null for a non-lane token", () => {
    expect(laneIndex("research")).toBe(0);
    expect(laneIndex("adr")).toBe(1);
    expect(laneIndex("plan")).toBe(2);
    expect(laneIndex("exec")).toBe(3);
    expect(laneIndex("review")).toBe(4);
    expect(laneIndex("codify")).toBe(5);
    expect(laneIndex("commit")).toBeNull();
    expect(laneIndex(undefined)).toBeNull();
    expect(laneIndex(null)).toBeNull();
  });
});

describe("doc-type fallback (S33, mirrors engine phase_for_doc_type)", () => {
  it("maps every pipeline doc-type to its phase lane", () => {
    expect(phaseForDocType("research")).toBe("research");
    // reference shares the research lane (it grounds the work).
    expect(phaseForDocType("reference")).toBe("research");
    expect(phaseForDocType("adr")).toBe("adr");
    expect(phaseForDocType("plan")).toBe("plan");
    expect(phaseForDocType("exec")).toBe("exec");
    // audit is the review phase; rule is the codify phase.
    expect(phaseForDocType("audit")).toBe("review");
    expect(phaseForDocType("rule")).toBe("codify");
  });

  it("returns null for ambient/unknown/absent doc-types (no invented phase)", () => {
    expect(phaseForDocType("commit")).toBeNull();
    expect(phaseForDocType("index")).toBeNull();
    expect(phaseForDocType("nonsense")).toBeNull();
    expect(phaseForDocType("")).toBeNull();
    expect(phaseForDocType(undefined)).toBeNull();
    expect(phaseForDocType(null)).toBeNull();
  });
});

describe("laneOf: wire phase authoritative, doc-type the fallback", () => {
  it("uses the authoritative wire phase when present", () => {
    expect(laneOf({ phase: "plan", doc_type: "adr" })).toBe(2);
    expect(laneOf({ phase: "codify" })).toBe(5);
  });

  it("falls back to the doc-type mapping when phase is absent or unrecognized", () => {
    expect(laneOf({ doc_type: "audit" })).toBe(4);
    expect(laneOf({ phase: "commit", doc_type: "rule" })).toBe(5);
    expect(laneOf({ phase: undefined, doc_type: "research" })).toBe(0);
  });

  it("returns null for a node that belongs to no phase lane", () => {
    expect(laneOf({ doc_type: "commit" })).toBeNull();
    expect(laneOf({ phase: "commit", doc_type: "index" })).toBeNull();
    expect(laneOf({})).toBeNull();
  });
});

describe("lane display descriptors (Figma 17:647: label + doc-type mark)", () => {
  it("labels and marks the pipeline lanes with the doc-type the phase owns", () => {
    // research/adr/plan/exec read their own name + mark.
    expect(laneDescriptor("research")).toEqual({
      token: "research",
      label: "research",
      markKind: "research",
    });
    expect(laneDescriptor("exec")).toEqual({
      token: "exec",
      label: "exec",
      markKind: "exec",
    });
    // The `review` phase owns the `audit` documents — the rail reads "audit" with
    // the audit mark (Figma lane row + the `.vault/audit/` directory name).
    expect(laneDescriptor("review")).toEqual({
      token: "review",
      label: "audit",
      markKind: "audit",
    });
    // The `codify` phase owns `rule` documents; no rule mark ships in-family, so
    // the lane renders label-only (markKind null).
    expect(laneDescriptor("codify")).toEqual({
      token: "codify",
      label: "codify",
      markKind: null,
    });
  });

  it("exposes the display label for every lane (the rail + chip text)", () => {
    expect(laneLabel("review")).toBe("audit");
    expect(laneLabel("research")).toBe("research");
    expect(PHASE_LANES.map(laneLabel)).toEqual([
      "research",
      "adr",
      "plan",
      "exec",
      "audit",
      "codify",
    ]);
  });
});

describe("lane geometry (S32)", () => {
  it("computes the top-of-band y from the lane index and top padding", () => {
    expect(laneY(0)).toBe(0);
    expect(laneY(2)).toBe(2 * LANE_HEIGHT);
    expect(laneY(2, 10)).toBe(2 * LANE_HEIGHT + 10);
  });

  it("centers a mark in the middle of its lane band", () => {
    expect(laneCenterY(0)).toBe(LANE_HEIGHT / 2);
    expect(laneCenterY(3, 4)).toBe(3 * LANE_HEIGHT + LANE_HEIGHT / 2 + 4);
  });

  it("sizes the whole phase-lane band from the lane count and padding", () => {
    expect(lanesHeight()).toBe(PHASE_LANES.length * LANE_HEIGHT);
    expect(lanesHeight(12)).toBe(PHASE_LANES.length * LANE_HEIGHT + 12);
  });
});

describe("two-lane grouping (figma-frontend-rewrite W03.P08.S11, AppShell 117:2)", () => {
  it("collapses the six phases into a design lane over an execution lane", () => {
    expect(TIMELINE_LANE_GROUPS.map((g) => g.id)).toEqual(["design", "execution"]);
    expect(TIMELINE_LANE_GROUPS[0].label).toBe("Research · Decisions · Plans · Audits");
    expect(TIMELINE_LANE_GROUPS[1].label).toBe("Execution · Summaries");
    // Every phase token lands in exactly one group; no phase is dropped.
    const grouped = TIMELINE_LANE_GROUPS.flatMap((g) => g.phases);
    expect([...grouped].sort()).toEqual([...PHASE_LANES].sort());
  });

  it("maps each phase token to its visual lane group", () => {
    expect(groupIdOfPhase("research")).toBe("design");
    expect(groupIdOfPhase("adr")).toBe("design");
    expect(groupIdOfPhase("plan")).toBe("design");
    expect(groupIdOfPhase("review")).toBe("design");
    expect(groupIdOfPhase("exec")).toBe("execution");
    expect(groupIdOfPhase("codify")).toBe("execution");
  });

  it("indexes the design lane above the execution lane", () => {
    expect(groupIndexOfId("design")).toBe(0);
    expect(groupIndexOfId("execution")).toBe(1);
  });

  it("resolves a node's visual lane group from its phase or doc-type fallback", () => {
    expect(groupIndexOf({ phase: "research" })).toBe(0);
    // review -> design (audit doc), codify -> execution (rule doc).
    expect(groupIndexOf({ doc_type: "audit" })).toBe(0);
    expect(groupIndexOf({ phase: "exec" })).toBe(1);
    expect(groupIndexOf({ doc_type: "rule" })).toBe(1);
    // A node that owns no phase lane belongs to no visual lane.
    expect(groupIndexOf({ doc_type: "commit" })).toBeNull();
    expect(groupIndexOf({})).toBeNull();
  });

  it("stacks the two group rows from the row height and top padding", () => {
    expect(groupLaneCenterY(0)).toBe(GROUP_LANE_HEIGHT / 2);
    expect(groupLaneCenterY(1, 8)).toBe(GROUP_LANE_HEIGHT + GROUP_LANE_HEIGHT / 2 + 8);
    expect(groupLanesHeight()).toBe(2 * GROUP_LANE_HEIGHT);
    expect(groupLanesHeight(8)).toBe(2 * GROUP_LANE_HEIGHT + 8);
  });
});
