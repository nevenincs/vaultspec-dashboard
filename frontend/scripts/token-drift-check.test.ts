import { describe, expect, it } from "vitest";

// Extensionless imports: the test runs under Vite (vitest), which resolves the .ts files;
// the runtime scripts keep explicit .ts extensions for Node's type stripping.
import { generateRegions } from "../style-dictionary.config";
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
});
