// The file-type icon resolver and the generated subset it reads.
//
// These assert the CONTRACT the row depends on - total resolution, filename
// precedence, and inlineable geometry - not the library's mapping choices, which
// belong to `material-icon-theme` and arrive through regeneration.

import { describe, expect, it } from "vitest";

import {
  FILE_ICON_BY_EXTENSION,
  FILE_ICON_BY_FILENAME,
  FILE_ICON_DEFS,
  GENERIC_FILE_ICON,
} from "./fileIcons.generated";
import { resolveFileIconDef, resolveFileIconId } from "./fileIcons";

describe("resolveFileIconId", () => {
  it("resolves a known extension to its own mark, case-insensitively", () => {
    expect(resolveFileIconId("src/main.ts")).toBe(FILE_ICON_BY_EXTENSION.ts);
    expect(resolveFileIconId("SRC/MAIN.TS")).toBe(FILE_ICON_BY_EXTENSION.ts);
    expect(resolveFileIconId("engine/crates/api/src/lib.rs")).toBe(
      FILE_ICON_BY_EXTENSION.rs,
    );
  });

  it("prefers a whole-filename match over the extension", () => {
    // `package.json` is a distinct mark from a plain `.json` file; resolving it
    // by extension would lose exactly the recognition the row exists for.
    expect(FILE_ICON_BY_FILENAME["package.json"]).toBeDefined();
    expect(resolveFileIconId("frontend/package.json")).toBe(
      FILE_ICON_BY_FILENAME["package.json"],
    );
    expect(resolveFileIconId("frontend/package.json")).not.toBe(
      FILE_ICON_BY_EXTENSION.json,
    );
  });

  it("falls back to the generic mark for an unmapped or extension-less path", () => {
    expect(resolveFileIconId("data/fixture.unknownext")).toBe(GENERIC_FILE_ICON);
    expect(resolveFileIconId("NOTICE")).toBe(GENERIC_FILE_ICON);
    expect(resolveFileIconId("")).toBe(GENERIC_FILE_ICON);
  });

  it("resolves a dotfile through the name table, then its trailing segment", () => {
    expect(resolveFileIconId(".gitignore")).toBe(FILE_ICON_BY_FILENAME[".gitignore"]);
    expect(resolveFileIconId("services/.env")).toBe(FILE_ICON_BY_EXTENSION.env);
  });

  it("ignores a trailing slash so a directory-shaped path still resolves", () => {
    expect(resolveFileIconId("src/components/")).toBe(GENERIC_FILE_ICON);
  });
});

describe("the generated icon subset", () => {
  it("defines every icon its mapping tables point at", () => {
    // A mapping entry with no definition would render an empty mark; the
    // generator derives both from one pass, and this holds it to that.
    const referenced = new Set([
      GENERIC_FILE_ICON,
      ...Object.values(FILE_ICON_BY_EXTENSION),
      ...Object.values(FILE_ICON_BY_FILENAME),
    ]);
    for (const id of referenced) {
      expect(FILE_ICON_DEFS[id], `missing definition for ${id}`).toBeDefined();
    }
    expect(Object.keys(FILE_ICON_DEFS).length).toBe(referenced.size);
  });

  it("carries no wrapper element and no unscoped internal id", () => {
    // Every body is inlined into ONE document, so a bare `id="a"` from two icons
    // would collide and repaint the wrong gradient. The generator namespaces
    // them; this proves none escaped.
    for (const [id, def] of Object.entries(FILE_ICON_DEFS)) {
      expect(def.svgBody, `${id} kept its <svg> wrapper`).not.toContain("<svg");
      expect(def.viewBox).toMatch(/^[\d.\-\s]+$/);
      for (const local of def.svgBody.matchAll(/\sid="([^"]+)"/g)) {
        expect(local[1], `${id} has an unscoped id`).toMatch(/^mit-/);
      }
    }
  });

  it("resolves every path to a renderable definition", () => {
    for (const path of ["a.ts", "b.unknown", "Cargo.toml", "x/y/z.rs"]) {
      const def = resolveFileIconDef(path);
      expect(def.svgBody.length).toBeGreaterThan(0);
      expect(def.viewBox.length).toBeGreaterThan(0);
    }
  });
});
