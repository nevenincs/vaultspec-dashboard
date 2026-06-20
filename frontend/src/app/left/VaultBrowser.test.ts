import { describe, expect, it } from "vitest";

import type { VaultTreeEntry } from "../../stores/server/engine";
import {
  docMarkName,
  entryStem,
  filterVaultEntries,
  freshnessLabel,
  freshnessToneClass,
  isFresh,
  projectFeatureGroups,
} from "./VaultBrowser";

const tagged = (path: string, docType: string, tags: string[]): VaultTreeEntry => ({
  path,
  doc_type: docType,
  feature_tags: tags,
  dates: {},
});

describe("projectFeatureGroups (Vault feature → doc_type → document projection)", () => {
  it("nests entries by feature, then by canonical .vault doc-type order", () => {
    const groups = projectFeatureGroups([
      tagged(".vault/plan/2026-01-08-grid-plan.md", "plan", ["grid"]),
      tagged(".vault/research/2026-01-08-grid-research.md", "research", ["grid"]),
      tagged(".vault/adr/2026-01-08-grid-adr.md", "adr", ["grid"]),
    ]);
    expect(groups).toHaveLength(1);
    const grid = groups[0]!;
    expect(grid.feature).toBe("grid");
    expect(grid.count).toBe(3);
    expect(grid.docTypes.map((d) => d.docType)).toEqual(["research", "adr", "plan"]);
  });

  it("orders features by first appearance in the entry list", () => {
    const groups = projectFeatureGroups([
      tagged(".vault/research/b-research.md", "research", ["beta"]),
      tagged(".vault/research/a-research.md", "research", ["alpha"]),
      tagged(".vault/plan/b-plan.md", "plan", ["beta"]),
    ]);
    expect(groups.map((g) => g.feature)).toEqual(["beta", "alpha"]);
    expect(groups.find((g) => g.feature === "beta")!.count).toBe(2);
  });

  it("places an entry under every one of its feature tags", () => {
    const groups = projectFeatureGroups([
      tagged(".vault/adr/shared-adr.md", "adr", ["one", "two"]),
    ]);
    expect(groups.map((g) => g.feature).sort()).toEqual(["one", "two"]);
    expect(groups.every((g) => g.count === 1)).toBe(true);
  });

  it("collects untagged entries under a single feature bucket rather than dropping them", () => {
    const groups = projectFeatureGroups([
      tagged(".vault/index/x.index.md", "index", []),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.feature).toBe("(untagged)");
  });
});

describe("entry presentation", () => {
  it("gives every canonical doc type a distinct Phosphor mark with a fallback", () => {
    // Grayscale-by-shape gate (iconography ADR): each doc type maps to a
    // shape-distinct Phosphor mark; the squint test is shape, so the marks
    // must not collide. Unknown types fall back to the dashed-file mark.
    const types = ["research", "adr", "plan", "exec", "audit", "reference", "index"];
    const marks = types.map(docMarkName);
    expect(new Set(marks).size).toBe(marks.length);
    // An unknown doc type resolves to the dashed-file fallback mark, which is
    // genuinely distinct from every assigned mark (not an alias of one of them).
    const fallback = docMarkName("mystery");
    expect(fallback).toMatch(/FileDashed/);
    expect(marks).not.toContain(fallback);
  });

  it("labels freshness in compact buckets and cools to silence", () => {
    const now = Date.parse("2026-06-12T12:00:00Z");
    expect(freshnessLabel("2026-06-12T11:30:00Z", now)).toBe("now");
    expect(freshnessLabel("2026-06-12T03:00:00Z", now)).toBe("9h");
    expect(freshnessLabel("2026-06-09T12:00:00Z", now)).toBe("3d");
    expect(freshnessLabel("2026-05-30T12:00:00Z", now)).toBe("1w");
    expect(freshnessLabel("2026-01-01T00:00:00Z", now)).toBe("");
    expect(freshnessLabel(undefined, now)).toBe("");
  });

  it("tints only genuinely-fresh items (the <1h 'now' bucket) with the accent", () => {
    // The accent freshness cue is a purposeful liveness signal tied to real
    // recency, not ambient decoration — only "now" is accent-tinted.
    expect(isFresh("now")).toBe(true);
    expect(isFresh("9h")).toBe(false);
    expect(isFresh("3d")).toBe(false);
    expect(isFresh("")).toBe(false);
    expect(freshnessToneClass("now")).toBe("text-state-active");
    expect(freshnessToneClass("9h")).toBe("text-ink-faint");
    expect(freshnessToneClass("")).toBe("text-ink-faint");
  });

  it("derives the display stem from the path", () => {
    expect(entryStem(".vault/adr/2026-06-12-x-adr.md")).toBe("2026-06-12-x-adr");
  });
});

describe("filterVaultEntries (in-rail filter; client-side, no wire)", () => {
  const entries = [
    tagged(".vault/plan/2026-06-14-left-rail-plan.md", "plan", ["left-rail"]),
    tagged(".vault/adr/2026-06-14-code-tree-adr.md", "adr", ["code-tree"]),
    tagged(".vault/research/2026-06-14-workspace-research.md", "research", [
      "workspace-registry",
    ]),
  ];

  it("returns ALL entries (a copy) for an empty or whitespace filter", () => {
    expect(filterVaultEntries(entries, "")).toHaveLength(3);
    expect(filterVaultEntries(entries, "   ")).toHaveLength(3);
    // a copy, not the same reference (callers may sort/mutate)
    expect(filterVaultEntries(entries, "")).not.toBe(entries);
  });

  it("matches on the stem (case-insensitive)", () => {
    const out = filterVaultEntries(entries, "LEFT-RAIL");
    expect(out.map((e) => e.path)).toEqual([
      ".vault/plan/2026-06-14-left-rail-plan.md",
    ]);
  });

  it("matches on the full path", () => {
    const out = filterVaultEntries(entries, "/adr/");
    expect(out).toHaveLength(1);
    expect(out[0]!.doc_type).toBe("adr");
  });

  it("matches on a feature tag", () => {
    const out = filterVaultEntries(entries, "workspace-registry");
    expect(out.map((e) => e.doc_type)).toEqual(["research"]);
  });

  it("returns an empty list when nothing matches (the distinct filter-empty state)", () => {
    expect(filterVaultEntries(entries, "no-such-thing")).toEqual([]);
  });
});
