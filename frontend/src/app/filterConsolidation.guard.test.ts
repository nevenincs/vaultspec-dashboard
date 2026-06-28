import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Structural guard for the filter-consolidation + unified-filter-plane ADRs.
//
// filter-consolidation: the advanced facet FLYOUT (FilterSidebar/FilterMenu) is
// mounted from exactly ONE surface — the left rail — and the timeline and right rail
// host no facet-flyout control.
//
// unified-filter-plane (D1/D2/D6): the binding invariant is now one canonical
// STATE, not one canonical SURFACE. Any control that narrows the corpus writes the
// single `dashboardState.filters` (the graph category legend authors `doc_types`
// through the shared filter intent, exactly like the rail's KIND section), and
// every corpus-projecting view CONSUMES that one plane. What is forbidden is a
// PRIVATE filter / category-visibility mask that bypasses the canonical state — the
// retired `hiddenCategories` seam is exactly that anti-pattern and must never
// return. This test scans production source so a re-introduced private mask, or a
// timeline that stops consuming the filter, fails the gate instead of shipping
// green. The right rail's semantic Search pillar (POST /search) is a distinct
// concept and is intentionally NOT matched here.

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(HERE, ".."); // frontend/src
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name))) continue;
    if (entry.name.includes(".test.") || entry.name.includes(".stories.")) continue;
    out.push(path);
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const FILES = sourceFiles(SRC_ROOT).map((file) => ({
  rel: relative(SRC_ROOT, file).replaceAll("\\", "/"),
  body: stripComments(readFileSync(file, "utf8")),
}));

// A surface hosts a facet filter if it mounts the flyout or wires the facet plane.
const FACET_CONTROL =
  /<FilterSidebar[\s/>]|<FilterMenu[\s/>]|\btoggleFacet\b|<FacetRow[\s/>]/;

describe("filter-consolidation: one canonical filter surface", () => {
  it("mounts the facet filter only from the left rail (never orphaned, never elsewhere)", () => {
    const mounts = FILES.filter((f) => /<FilterSidebar[\s/>]/.test(f.body)).map(
      (f) => f.rel,
    );
    // It IS mounted somewhere — the facet filter is reachable, not orphaned.
    expect(mounts.length).toBeGreaterThan(0);
    // …and every mount is the canonical left-rail surface.
    for (const rel of mounts) {
      expect(rel.startsWith("app/left/")).toBe(true);
    }
  });

  it("keeps the graph stage chrome free of filter controls", () => {
    // The graph top bar is retired (graph/Hero redesign): the stage is now
    // overlay-only. Its live chrome — the stage host and the graph overlay controls
    // — hosts no filter control. (The retired FilterSidebar/FilterMenu files still
    // on disk under app/stage/ are dead, pending cleanup, and not mounted here.)
    const graphChrome = ["app/stage/Stage.tsx", "app/stage/GraphControls.tsx"];
    for (const rel of graphChrome) {
      const file = FILES.find((f) => f.rel === rel);
      expect(file, `${rel} not found`).toBeTruthy();
      expect(
        /<FilterSidebar[\s/>]|<FilterMenu[\s/>]|toggleFilterSidebar|<SearchField[\s/>]/.test(
          file!.body,
        ),
        `${rel} hosts a filter control`,
      ).toBe(false);
    }
  });

  it("keeps the timeline free of any facet-filter control (Setter only)", () => {
    for (const f of FILES.filter((f) => f.rel.startsWith("app/timeline/"))) {
      expect(FACET_CONTROL.test(f.body), `${f.rel} hosts a facet filter`).toBe(false);
    }
  });

  it("keeps the right activity rail free of any facet-filter control (Search pillar only)", () => {
    for (const f of FILES.filter((f) => f.rel.startsWith("app/right/"))) {
      expect(FACET_CONTROL.test(f.body), `${f.rel} hosts a facet filter`).toBe(false);
    }
  });

  it("forbids any private category-visibility mask that bypasses the canonical filter (unified-filter-plane D2)", () => {
    // The retired canvas-local mask (`hiddenCategories` + its seam) is the exact
    // anti-pattern the one-authority model prohibits: a control that hides corpus
    // nodes without writing `dashboardState.filters`, so the rail/timeline never see
    // it. Category narrowing now flows through the canonical `doc_types` facet. If
    // any of these tokens reappear in production source, a private mask has crept
    // back — fail the gate.
    const PRIVATE_MASK =
      /hiddenCategories|toggleHiddenCategory|setHiddenCategories|useHiddenCategorySet|graphCategoryVisibility|applyHiddenCategories/;
    const offenders = FILES.filter((f) => PRIVATE_MASK.test(f.body)).map((f) => f.rel);
    expect(
      offenders,
      `private category-visibility mask reintroduced in ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps the timeline wired to the canonical filter as the date_range writer (unified-filter-plane D3, Issue #14)", () => {
    // The timeline is now a fixed two-handle date-range selector (Issue #14 rebuild):
    // it does not read a lineage slice anymore, it WRITES the canonical `date_range`
    // through the dashboard-state mutation seam (`setDateRange`), and the graph + rail
    // consume that one record (`dashboardGraphFilter` folds date_range into
    // /graph/query). The timeline is the sole date_range writer
    // (filtering-has-one-canonical-surface). A regression that stops writing the
    // canonical date_range desyncs the surfaces — fail the gate.
    const timeline = FILES.find(
      (f) => f.rel === "app/timeline/TimelineRangeSelector.tsx",
    );
    expect(timeline, "app/timeline/TimelineRangeSelector.tsx not found").toBeTruthy();
    expect(
      /setDateRange/.test(timeline!.body),
      "the timeline no longer writes the canonical date_range filter",
    ).toBe(true);
  });
});
