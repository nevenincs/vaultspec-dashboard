import { describe, expect, it } from "vitest";

import type { VaultTreeEntry } from "../../stores/server/engine";
import {
  compareVaultEntriesBySort,
  deriveVaultRailView,
  projectVaultDocTypeGroups,
  type VaultRailFacets,
} from "../../stores/server/queries";
import {
  docMarkName,
  entryStem,
  filterVaultEntries,
  freshness,
  freshnessToneClass,
  projectFeatureGroups,
} from "./VaultBrowser";
import { createTestLocalizationRuntime } from "../../localization/testing";
import { resolveMessage } from "../../platform/localization/fallback";

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
      tagged(".vault/research/x-research.md", "research", []),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.feature).toBe("(untagged)");
  });

  it("excludes index documents from the feature groups (terminology ADR D5)", () => {
    // `index` is never a displayed node: an index-only set yields no groups, and an
    // index entry alongside real docs never inflates a feature's count or appears as
    // a doc-type sub-group.
    expect(
      projectFeatureGroups([tagged(".vault/index/x.index.md", "index", [])]),
    ).toEqual([]);
    const mixed = projectFeatureGroups([
      tagged(".vault/adr/2026-01-08-grid-adr.md", "adr", ["grid"]),
      tagged(".vault/index/grid.index.md", "index", ["grid"]),
    ]);
    expect(mixed).toHaveLength(1);
    expect(mixed[0]!.count).toBe(1);
    expect(mixed[0]!.docTypes.map((d) => d.docType)).toEqual(["adr"]);
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
    const runtime = createTestLocalizationRuntime();
    const now = Date.parse("2026-06-12T12:00:00Z");
    const rendered = (modified: string | undefined): string | null => {
      const value = freshness(modified, now);
      return value === null ? null : resolveMessage(runtime, value.descriptor);
    };
    expect(rendered("2026-06-12T11:30:00Z")).toBe("Now");
    expect(rendered("2026-06-12T03:00:00Z")).toBe("9h");
    expect(rendered("2026-06-09T12:00:00Z")).toBe("3d");
    expect(rendered("2026-05-30T12:00:00Z")).toBe("1w");
    expect(freshness("2026-01-01T00:00:00Z", now)).toBeNull();
    expect(freshness(undefined, now)).toBeNull();
  });

  it("tints only genuinely-fresh items (the <1h 'now' bucket) with the accent", () => {
    // The accent freshness cue is a purposeful liveness signal tied to real
    // recency, not ambient decoration — only the live bucket is accent-tinted.
    const now = Date.parse("2026-06-12T12:00:00Z");
    expect(freshness("2026-06-12T11:30:00Z", now)?.fresh).toBe(true);
    expect(freshness("2026-06-12T03:00:00Z", now)?.fresh).toBe(false);
    expect(freshness("2026-06-09T12:00:00Z", now)?.fresh).toBe(false);
    expect(freshnessToneClass(true)).toBe("text-state-active");
    expect(freshnessToneClass(false)).toBe("text-ink-muted");
  });

  it("derives the display stem from the path", () => {
    expect(entryStem(".vault/adr/2026-06-12-x-adr.md")).toBe("2026-06-12-x-adr");
  });
});

describe("the vault sort plane (left-rail-tree-controls ADR D3)", () => {
  const NO_FACETS: VaultRailFacets = {
    featureQuery: null,
    docTypes: [],
    statuses: [],
    featureTags: [],
    dateRange: {},
    dateField: "created",
  };
  const entry = (
    path: string,
    docType: string,
    extra: Partial<VaultTreeEntry> = {},
  ): VaultTreeEntry => ({
    path,
    doc_type: docType,
    feature_tags: extra.feature_tags ?? ["f"],
    dates: extra.dates ?? {},
    ...extra,
  });
  const docs = [
    entry(".vault/adr/2026-01-02-bravo-adr.md", "adr", {
      title: "Bravo",
      dates: { created: "2026-01-02", modified: "2026-01-09" },
      size: { bytes: 100, words: 50 },
    }),
    entry(".vault/adr/2026-01-05-alpha-adr.md", "adr", {
      title: "Alpha",
      dates: { created: "2026-01-05", modified: "2026-01-07" },
      size: { bytes: 900, words: 400 },
    }),
    entry(".vault/adr/2026-01-01-carol-adr.md", "adr", {
      title: "Carol",
      dates: { created: "2026-01-01", modified: "2026-01-08" },
    }),
  ];

  it("defaults to the historical newest-modified-first order byte-for-byte", () => {
    const groups = projectVaultDocTypeGroups(docs);
    expect(groups[0]!.entries.map((e) => e.title)).toEqual(["Bravo", "Carol", "Alpha"]);
  });

  it("sorts by name, created, and size with direction; absent facts sort last", () => {
    const byName = projectVaultDocTypeGroups(docs, { key: "name", direction: "asc" });
    expect(byName[0]!.entries.map((e) => e.title)).toEqual(["Alpha", "Bravo", "Carol"]);
    const byCreated = projectVaultDocTypeGroups(docs, {
      key: "created",
      direction: "desc",
    });
    expect(byCreated[0]!.entries.map((e) => e.title)).toEqual([
      "Alpha",
      "Bravo",
      "Carol",
    ]);
    // Size: Carol carries no served weight → sorts LAST in both directions.
    const bySize = projectVaultDocTypeGroups(docs, { key: "size", direction: "desc" });
    expect(bySize[0]!.entries.map((e) => e.title)).toEqual(["Alpha", "Bravo", "Carol"]);
    const bySizeAsc = projectVaultDocTypeGroups(docs, {
      key: "size",
      direction: "asc",
    });
    expect(bySizeAsc[0]!.entries.map((e) => e.title)).toEqual([
      "Bravo",
      "Alpha",
      "Carol",
    ]);
  });

  it("sorts by corpus weight (summed bytes) with unweighed folders last, and exposes the share denominator", () => {
    const view = deriveVaultRailView(
      [
        entry(".vault/adr/2026-01-02-x-adr.md", "adr", {
          feature_tags: ["small"],
          size: { bytes: 100, words: 20 },
        }),
        entry(".vault/adr/2026-01-05-y-adr.md", "adr", {
          feature_tags: ["big"],
          size: { bytes: 900, words: 200 },
        }),
        entry(".vault/adr/2026-01-06-z-adr.md", "adr", {
          feature_tags: ["unmeasured"],
        }),
      ],
      NO_FACETS,
      { key: "weight", direction: "desc" },
    );
    expect(view.featureGroups.map((g) => g.feature)).toEqual([
      "big",
      "small",
      "unmeasured",
    ]);
    expect(view.featureGroups[0]!.weightBytes).toBe(900);
    expect(view.totalCorpusBytes).toBe(1000);
  });

  it("orders feature folders by explicit document count under the docs key", () => {
    const view = deriveVaultRailView(
      [
        entry(".vault/adr/2026-01-02-x-adr.md", "adr", { feature_tags: ["solo"] }),
        entry(".vault/adr/2026-01-05-y-adr.md", "adr", { feature_tags: ["pair"] }),
        entry(".vault/plan/2026-01-06-z-plan.md", "plan", { feature_tags: ["pair"] }),
      ],
      NO_FACETS,
      { key: "docs", direction: "asc" },
    );
    expect(view.featureGroups.map((g) => g.feature)).toEqual(["solo", "pair"]);
  });

  it("ties break on path so the order is stable", () => {
    const a = entry(".vault/adr/a-adr.md", "adr", { title: "Same" });
    const b = entry(".vault/adr/b-adr.md", "adr", { title: "Same" });
    expect(
      compareVaultEntriesBySort({ key: "name", direction: "asc" }, a, b),
    ).toBeLessThan(0);
  });

  it("orders feature folders by the same sort value (name + newest member date)", () => {
    const view = deriveVaultRailView(
      [
        entry(".vault/adr/2026-01-02-x-adr.md", "adr", {
          feature_tags: ["zeta"],
          dates: { created: "2026-01-02" },
        }),
        entry(".vault/adr/2026-01-05-y-adr.md", "adr", {
          feature_tags: ["alpha"],
          dates: { created: "2026-01-05" },
        }),
      ],
      NO_FACETS,
      { key: "name", direction: "asc" },
    );
    expect(view.featureGroups.map((g) => g.feature)).toEqual(["alpha", "zeta"]);
    const byCreated = deriveVaultRailView(
      [
        entry(".vault/adr/2026-01-02-x-adr.md", "adr", {
          feature_tags: ["zeta"],
          dates: { created: "2026-01-02" },
        }),
        entry(".vault/adr/2026-01-05-y-adr.md", "adr", {
          feature_tags: ["alpha"],
          dates: { created: "2026-01-05" },
        }),
      ],
      NO_FACETS,
      { key: "created", direction: "desc" },
    );
    expect(byCreated.featureGroups.map((g) => g.feature)).toEqual(["alpha", "zeta"]);
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
