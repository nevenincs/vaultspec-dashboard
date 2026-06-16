import { describe, expect, it } from "vitest";

// Extensionless imports: the test runs under Vite (vitest), which resolves the .ts files;
// the runtime scripts keep explicit .ts extensions for Node's type stripping.
import { generateFoundation, generateRegions } from "../style-dictionary.config";
import { compareDecls, parseScopedDecls } from "./token-css-diff";

describe("token drift check", () => {
  it("generates deterministic color regions from the DTCG source", async () => {
    const a = await generateRegions();
    const b = await generateRegions();
    expect(a).toEqual(b);
    expect(a.colors).toContain("--color-paper:");
    expect(a.colors).toContain("--color-canvas-bg: #fdfaf6;");
    expect(a.themes).toContain('[data-theme="dark"]');
    expect(a.themes).toContain('[data-theme="high-contrast"]');
  });

  it("parses scoped declarations and reports no diff for identical regions", async () => {
    const { themes } = await generateRegions();
    const a = parseScopedDecls(themes, ":root");
    const b = parseScopedDecls(themes, ":root");
    expect(a.size).toBeGreaterThan(0);
    expect(compareDecls(a, b)).toEqual([]);
  });

  it("detects drift when a token value is mutated", async () => {
    const { themes } = await generateRegions();
    const committed = parseScopedDecls(themes, ":root");
    // Simulate a token changed in the source without regenerating styles.css.
    const mutated = parseScopedDecls(
      themes.replace("--color-canvas-bg: #1a1713;", "--color-canvas-bg: #000000;"),
      ":root",
    );
    const diffs = compareDecls(committed, mutated);
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.join("\n")).toContain("--color-canvas-bg");
  });

  it("is formatting-agnostic (indentation changes are not drift)", async () => {
    const { colors } = await generateRegions();
    const reindented = colors.replace(/\n {2}/g, "\n      ");
    expect(compareDecls(parseScopedDecls(colors, ":root"), parseScopedDecls(reindented, ":root"))).toEqual([]);
  });

  it("generates the deterministic Figma-binding non-color foundation region", () => {
    const a = generateFoundation();
    const b = generateFoundation();
    expect(a).toEqual(b);
    // Figma role-named type scale (research F1 binding values).
    expect(a).toContain("--text-fg-display: 1.25rem;");
    expect(a).toContain("--text-fg-title: 0.9375rem;");
    expect(a).toContain("--text-fg-meta--line-height: 0.875rem;");
    expect(a).toContain("--font-fg-sans:");
    expect(a).toContain("--font-fg-mono:");
    // Figma radius scale incl. the new pill18.
    expect(a).toContain("--radius-fg-md: 0.4375rem;");
    expect(a).toContain("--radius-fg-pill: 1.125rem;");
    // Three Figma elevation levels.
    expect(a).toContain("--shadow-fg-raised:");
    expect(a).toContain("--shadow-fg-overlay:");
    expect(a).toContain("--shadow-fg-popover:");
    // Spacing brought under the pipeline, values unchanged.
    expect(a).toContain("--spacing-fg-4: 1rem;");
  });

  it("coalesces wrapped multi-line declarations (font/shadow stacks)", () => {
    const wrapped = [
      "  --font-fg-sans:",
      '    Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;',
    ].join("\n");
    const inline =
      '  --font-fg-sans: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;';
    expect(
      compareDecls(parseScopedDecls(wrapped, ":root"), parseScopedDecls(inline, ":root")),
    ).toEqual([]);
  });
});
