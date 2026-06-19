import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Structural guard for the filter-consolidation ADR: filtering controls are
// authored from exactly ONE canonical surface — the left rail's filter area —
// which writes the single dashboardState.filters. The graph stage, the timeline,
// and the right activity rail are pure CONSUMERS of that state and must host no
// facet-filter control. This test scans production source so that a future
// "convenience" filter re-introduced on another surface fails the gate instead of
// shipping green. The right rail's semantic Search pillar (POST /search) is a
// distinct concept and is intentionally NOT matched here.

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

  it("keeps the graph stage top bar free of filter controls", () => {
    const navbar = FILES.find((f) => f.rel === "app/stage/StageNavBar.tsx");
    expect(navbar).toBeTruthy();
    expect(
      /<FilterSidebar[\s/>]|<FilterMenu[\s/>]|toggleFilterSidebar|<SearchField[\s/>]/.test(
        navbar!.body,
      ),
    ).toBe(false);
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
});
