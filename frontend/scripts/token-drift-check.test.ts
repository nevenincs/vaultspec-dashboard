import { describe, expect, it } from "vitest";

// Extensionless imports: the test runs under Vite (vitest), which resolves the .ts
// files; the runtime scripts keep explicit .ts extensions for Node's type stripping.
import { generateCss } from "../style-dictionary.config";
import { diffCss } from "./token-css-diff";

describe("token drift check", () => {
  it("generates deterministic CSS from the DTCG source", async () => {
    const a = await generateCss();
    const b = await generateCss();
    expect(a).toBe(b);
    // Sanity: the generated tier carries the four scopes and the public surface.
    expect(a).toContain(":root {");
    expect(a).toContain('[data-theme="dark"]');
    expect(a).toContain("--color-paper:");
  });

  it("reports no diff when committed equals fresh", async () => {
    const fresh = await generateCss();
    expect(diffCss(fresh, fresh)).toEqual([]);
  });

  it("fails when a token value is mutated (drift detected)", async () => {
    const fresh = await generateCss();
    // Simulate someone hand-editing a generated value (or changing a token without
    // regenerating): the committed copy diverges from a fresh build.
    const mutated = fresh.replace("--color-ink: #312d27;", "--color-ink: #000000;");
    expect(mutated).not.toBe(fresh);
    const diffs = diffCss(mutated, fresh);
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.join("\n")).toContain("--color-ink");
  });

  it("tolerates CRLF vs LF line endings", async () => {
    const fresh = await generateCss();
    const crlf = fresh.replace(/\n/g, "\r\n");
    expect(diffCss(crlf, fresh)).toEqual([]);
  });
});
