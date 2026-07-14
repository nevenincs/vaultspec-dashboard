// The rag job-dashboard jobs-table derivation (rag-job-dashboard ADR D3): pure
// functions over explicit vectors — sort, text filter, phase facets, group
// counts, and the honest served-vs-total truncation bound. No render, no wire.

import { describe, expect, it } from "vitest";

import type { RagJobsSnapshot } from "./ragControl";
import {
  RAG_JOB_PHASE_GROUPS,
  RAG_JOB_SORT_KEYS,
  deriveRagJobsTable,
  ragJobPhaseGroup,
  type RagJobsTableViewState,
} from "./ragDashboardView";

const ALL_SORTS = RAG_JOB_SORT_KEYS;

function view(over: Partial<RagJobsTableViewState> = {}): RagJobsTableViewState {
  return { sort: "recency", facets: [], filterText: "", ...over };
}

const SNAPSHOT: RagJobsSnapshot = {
  total: 6,
  returned: 4,
  jobs: [
    {
      id: "job-run",
      phase: "running",
      trigger: "watcher",
      started_at: 300,
      runtime_seconds: 5,
      progress: { step: "embedding", completed: 2, total: 8 },
    },
    { id: "job-queue", phase: "queued", source: "manual", started_at: 400 },
    {
      id: "job-done",
      phase: "done",
      trigger: "cli",
      started_at: 100,
      runtime_seconds: 42,
    },
    {
      id: "job-fail",
      phase: "error",
      trigger: "watcher",
      started_at: 200,
      runtime_seconds: 3,
    },
  ],
};

describe("ragJobPhaseGroup", () => {
  it("maps the served phase vocabulary onto facet groups", () => {
    expect(ragJobPhaseGroup("running")).toBe("running");
    expect(ragJobPhaseGroup("queued")).toBe("queued");
    expect(ragJobPhaseGroup("pending")).toBe("queued");
    expect(ragJobPhaseGroup("done")).toBe("done");
    expect(ragJobPhaseGroup("ok")).toBe("done");
    expect(ragJobPhaseGroup("error")).toBe("failed");
    expect(ragJobPhaseGroup("failed")).toBe("failed");
    expect(ragJobPhaseGroup("cancelled")).toBe("failed");
    // An unknown/in-flight phase defaults to running (a live, non-terminal job).
    expect(ragJobPhaseGroup(undefined)).toBe("running");
  });
});

describe("deriveRagJobsTable", () => {
  it("projects served jobs into presentation rows with progress fraction", () => {
    const table = deriveRagJobsTable(SNAPSHOT, view());
    const run = table.rows.find((r) => r.id === "job-run");
    expect(run).toMatchObject({
      phase: "running",
      group: "running",
      step: "embedding",
      kind: "watcher",
      durationSeconds: 5,
    });
    expect(run?.fraction).toBeCloseTo(0.25);
  });

  it("sorts by recency (newest start first) by default", () => {
    const table = deriveRagJobsTable(SNAPSHOT, view({ sort: "recency" }));
    expect(table.rows.map((r) => r.id)).toEqual([
      "job-queue",
      "job-run",
      "job-fail",
      "job-done",
    ]);
  });

  it("sorts by duration (longest runtime first)", () => {
    const table = deriveRagJobsTable(SNAPSHOT, view({ sort: "duration" }));
    expect(table.rows.map((r) => r.id)).toEqual([
      "job-done",
      "job-run",
      "job-fail",
      "job-queue",
    ]);
  });

  it("text-filters over id, step, and kind case-insensitively", () => {
    // "embedding" matches only the running job's step.
    expect(
      deriveRagJobsTable(SNAPSHOT, view({ filterText: "EMBED" })).rows.map((r) => r.id),
    ).toEqual(["job-run"]);
    // "watcher" is the kind of two jobs.
    expect(
      new Set(
        deriveRagJobsTable(SNAPSHOT, view({ filterText: "watcher" })).rows.map(
          (r) => r.id,
        ),
      ),
    ).toEqual(new Set(["job-run", "job-fail"]));
  });

  it("phase-facets to the active groups, empty facet set showing all", () => {
    expect(deriveRagJobsTable(SNAPSHOT, view({ facets: [] })).rows).toHaveLength(4);
    expect(
      deriveRagJobsTable(SNAPSHOT, view({ facets: ["failed"] })).rows.map((r) => r.id),
    ).toEqual(["job-fail"]);
    expect(
      new Set(
        deriveRagJobsTable(SNAPSHOT, view({ facets: ["running", "queued"] })).rows.map(
          (r) => r.id,
        ),
      ),
    ).toEqual(new Set(["job-run", "job-queue"]));
  });

  it("counts groups over the text-filtered set so the chips reflect the search", () => {
    const table = deriveRagJobsTable(SNAPSHOT, view({ filterText: "watcher" }));
    expect(table.groupCounts).toEqual({
      running: 1,
      queued: 0,
      done: 0,
      failed: 1,
    });
  });

  it("reports the served-vs-total truncation bound, never re-counting", () => {
    const table = deriveRagJobsTable(SNAPSHOT, view());
    expect(table.servedCount).toBe(4);
    expect(table.total).toBe(6);
    expect(table.truncated).toBe(true);

    const complete = deriveRagJobsTable({ jobs: SNAPSHOT.jobs, total: 4 }, view());
    expect(complete.truncated).toBe(false);
  });

  it("drops idless/malformed jobs and tolerates an empty or absent snapshot", () => {
    const table = deriveRagJobsTable(
      { jobs: [{ id: "", phase: "running" }, { phase: "done" } as never] },
      view(),
    );
    expect(table.rows).toEqual([]);
    expect(deriveRagJobsTable(undefined, view()).rows).toEqual([]);
    expect(deriveRagJobsTable(null, view()).truncated).toBe(false);
  });

  it("only enrolls known facets in the returned facet metadata", () => {
    const table = deriveRagJobsTable(SNAPSHOT, view({ facets: ["failed", "running"] }));
    // Returned in canonical chip order regardless of the input order.
    expect(table.facets).toEqual(
      RAG_JOB_PHASE_GROUPS.filter((g) => g === "running" || g === "failed"),
    );
  });

  it("carries the active sort key through in the view metadata", () => {
    for (const sort of ALL_SORTS) {
      expect(deriveRagJobsTable(SNAPSHOT, view({ sort })).sort).toBe(sort);
    }
  });
});
