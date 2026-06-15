import { describe, expect, it } from "vitest";

import type { VaultTreeEntry } from "../../stores/server/engine";
import { filterTreeEntries, projectFeatureGroups } from "./TreeBrowser";

const entry = (
  path: string,
  docType: string,
  features: string[],
  modified?: string,
): VaultTreeEntry => ({
  path,
  doc_type: docType,
  feature_tags: features,
  dates: { modified },
});

describe("projectFeatureGroups (the feature → doc_type → document projection)", () => {
  it("nests entries by feature, then by canonical .vault doc-type order", () => {
    const groups = projectFeatureGroups([
      entry(".vault/plan/2026-01-08-grid-plan.md", "plan", ["grid"]),
      entry(".vault/research/2026-01-08-grid-research.md", "research", ["grid"]),
      entry(".vault/adr/2026-01-08-grid-adr.md", "adr", ["grid"]),
    ]);
    expect(groups).toHaveLength(1);
    const grid = groups[0]!;
    expect(grid.feature).toBe("grid");
    expect(grid.count).toBe(3);
    // Canonical order: research → adr → plan (not the input order).
    expect(grid.docTypes.map((d) => d.docType)).toEqual(["research", "adr", "plan"]);
  });

  it("orders features by FIRST appearance in the entry list (stable corpus order)", () => {
    const groups = projectFeatureGroups([
      entry(".vault/research/b-research.md", "research", ["beta"]),
      entry(".vault/research/a-research.md", "research", ["alpha"]),
      entry(".vault/plan/b-plan.md", "plan", ["beta"]),
    ]);
    expect(groups.map((g) => g.feature)).toEqual(["beta", "alpha"]);
    expect(groups.find((g) => g.feature === "beta")!.count).toBe(2);
  });

  it("sorts the document rows within a doc-type group by path", () => {
    const groups = projectFeatureGroups([
      entry(".vault/exec/x/S02.md", "exec", ["x"]),
      entry(".vault/exec/x/S01.md", "exec", ["x"]),
    ]);
    const exec = groups[0]!.docTypes.find((d) => d.docType === "exec")!;
    expect(exec.entries.map((e) => e.path)).toEqual([
      ".vault/exec/x/S01.md",
      ".vault/exec/x/S02.md",
    ]);
  });

  it("places an entry under every one of its feature tags (never silently dropped)", () => {
    const groups = projectFeatureGroups([
      entry(".vault/adr/shared-adr.md", "adr", ["one", "two"]),
    ]);
    expect(groups.map((g) => g.feature).sort()).toEqual(["one", "two"]);
    expect(groups.every((g) => g.count === 1)).toBe(true);
  });

  it("collects untagged entries under a single (untagged) feature rather than dropping them", () => {
    const groups = projectFeatureGroups([
      entry(".vault/index/x.index.md", "index", []),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.feature).toBe("(untagged)");
    expect(groups[0]!.count).toBe(1);
  });

  it("returns an empty projection for an empty listing", () => {
    expect(projectFeatureGroups([])).toEqual([]);
  });
});

describe("filterTreeEntries (in-rail filter; client-side, no wire)", () => {
  const entries = [
    entry(".vault/plan/2026-06-14-left-rail-plan.md", "plan", ["left-rail"]),
    entry(".vault/adr/2026-06-14-code-tree-adr.md", "adr", ["code-tree"]),
  ];

  it("returns ALL entries (a copy) for an empty or whitespace filter", () => {
    expect(filterTreeEntries(entries, "")).toHaveLength(2);
    expect(filterTreeEntries(entries, "  ")).toHaveLength(2);
    expect(filterTreeEntries(entries, "")).not.toBe(entries);
  });

  it("matches on stem, full path, and feature tag (case-insensitive)", () => {
    expect(filterTreeEntries(entries, "LEFT-RAIL").map((e) => e.doc_type)).toEqual([
      "plan",
    ]);
    expect(filterTreeEntries(entries, "/adr/")).toHaveLength(1);
    expect(filterTreeEntries(entries, "code-tree").map((e) => e.doc_type)).toEqual([
      "adr",
    ]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterTreeEntries(entries, "no-such-thing")).toEqual([]);
  });
});
