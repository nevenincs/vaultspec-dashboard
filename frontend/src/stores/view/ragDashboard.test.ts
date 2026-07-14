// The rag job-dashboard view-local presentation store (rag-job-dashboard ADR D7):
// boundary normalizers (unknown-tolerant, length-capped, enum-clamped), facet
// toggling in canonical order, and raw stable selectors. Pure store tests — no
// render, no wire; this state is presentation only and never a corpus filter.

import { afterEach, describe, expect, it } from "vitest";

import {
  RAG_DASHBOARD_FILTER_MAX_CHARS,
  RAG_DASHBOARD_JOB_ID_MAX_CHARS,
  RAG_DASHBOARD_LINES_DEFAULT,
  RAG_LOG_LINES_CHOICES,
  normalizeRagDashboardFilterText,
  normalizeRagJobSort,
  normalizeRagLogLinesChoice,
  normalizeRagPhaseFacet,
  normalizeRagPhaseFacets,
  normalizeRagSelectedJobId,
  useRagDashboard,
} from "./ragDashboard";

function reset(): void {
  useRagDashboard.getState().reset();
}

afterEach(reset);

describe("rag dashboard boundary normalizers", () => {
  it("clamps the sort key to the known enum, defaulting to recency", () => {
    expect(normalizeRagJobSort("duration")).toBe("duration");
    expect(normalizeRagJobSort("recency")).toBe("recency");
    expect(normalizeRagJobSort("bogus")).toBe("recency");
    expect(normalizeRagJobSort(42)).toBe("recency");
  });

  it("accepts only known phase facets", () => {
    expect(normalizeRagPhaseFacet("running")).toBe("running");
    expect(normalizeRagPhaseFacet("failed")).toBe("failed");
    expect(normalizeRagPhaseFacet("nope")).toBeNull();
    expect(normalizeRagPhaseFacet(null)).toBeNull();
  });

  it("canonicalizes a facet set: known-only, deduped, in chip order", () => {
    expect(normalizeRagPhaseFacets(["failed", "running", "failed", "junk"])).toEqual([
      "running",
      "failed",
    ]);
    expect(normalizeRagPhaseFacets("running")).toEqual([]);
    expect(normalizeRagPhaseFacets([])).toEqual([]);
  });

  it("length-caps filter text and coerces non-strings to empty", () => {
    expect(normalizeRagDashboardFilterText(" hi ")).toBe(" hi ");
    expect(normalizeRagDashboardFilterText(123)).toBe("");
    expect(
      normalizeRagDashboardFilterText("x".repeat(RAG_DASHBOARD_FILTER_MAX_CHARS + 50))
        .length,
    ).toBe(RAG_DASHBOARD_FILTER_MAX_CHARS);
  });

  it("normalizes a selected job id, trimming and capping length", () => {
    expect(normalizeRagSelectedJobId(" job-9 ")).toBe("job-9");
    expect(normalizeRagSelectedJobId("   ")).toBeNull();
    expect(normalizeRagSelectedJobId(9)).toBeNull();
    expect(
      normalizeRagSelectedJobId("x".repeat(RAG_DASHBOARD_JOB_ID_MAX_CHARS + 1)),
    ).toBeNull();
  });

  it("clamps the lines choice to the discrete window set", () => {
    for (const choice of RAG_LOG_LINES_CHOICES) {
      expect(normalizeRagLogLinesChoice(choice)).toBe(choice);
      expect(normalizeRagLogLinesChoice(String(choice))).toBe(choice);
    }
    expect(normalizeRagLogLinesChoice(75)).toBe(RAG_DASHBOARD_LINES_DEFAULT);
    expect(normalizeRagLogLinesChoice("lots")).toBe(RAG_DASHBOARD_LINES_DEFAULT);
  });
});

describe("rag dashboard store mutations", () => {
  it("starts from the presentation defaults", () => {
    expect(useRagDashboard.getState()).toMatchObject({
      sort: "recency",
      facets: [],
      jobsFilter: "",
      logFilter: "",
      selectedJobId: null,
      lines: RAG_DASHBOARD_LINES_DEFAULT,
    });
  });

  it("toggles facets, keeping the stored set in canonical chip order", () => {
    const { toggleFacet } = useRagDashboard.getState();
    toggleFacet("failed");
    toggleFacet("running");
    expect(useRagDashboard.getState().facets).toEqual(["running", "failed"]);
    toggleFacet("failed");
    expect(useRagDashboard.getState().facets).toEqual(["running"]);
    // An unknown facet is a no-op that preserves the exact array reference.
    const before = useRagDashboard.getState().facets;
    toggleFacet("junk");
    expect(useRagDashboard.getState().facets).toBe(before);
  });

  it("holds the same facets reference when a toggle does not change the set", () => {
    const { setFacets } = useRagDashboard.getState();
    setFacets(["running"]);
    const ref = useRagDashboard.getState().facets;
    setFacets(["running"]);
    expect(useRagDashboard.getState().facets).toBe(ref);
  });

  it("normalizes writes through the store boundary", () => {
    const s = useRagDashboard.getState();
    s.setSort("duration");
    s.setJobsFilter("  find  ");
    s.setLogFilter("err");
    s.selectJob(" job-42 ");
    s.setLines("500");
    expect(useRagDashboard.getState()).toMatchObject({
      sort: "duration",
      jobsFilter: "  find  ",
      logFilter: "err",
      selectedJobId: "job-42",
      lines: 500,
    });
    // A malformed sort write is clamped, not rejected into an invalid state.
    s.setSort("garbage");
    expect(useRagDashboard.getState().sort).toBe("recency");
  });

  it("clears a selected job when handed a blank id", () => {
    const s = useRagDashboard.getState();
    s.selectJob("job-1");
    expect(useRagDashboard.getState().selectedJobId).toBe("job-1");
    s.selectJob("   ");
    expect(useRagDashboard.getState().selectedJobId).toBeNull();
  });

  it("resets every field back to the presentation defaults", () => {
    const s = useRagDashboard.getState();
    s.setSort("duration");
    s.toggleFacet("running");
    s.setJobsFilter("x");
    s.selectJob("job-1");
    s.setLines(50);
    s.reset();
    expect(useRagDashboard.getState()).toMatchObject({
      sort: "recency",
      facets: [],
      jobsFilter: "",
      logFilter: "",
      selectedJobId: null,
      lines: RAG_DASHBOARD_LINES_DEFAULT,
    });
  });
});
