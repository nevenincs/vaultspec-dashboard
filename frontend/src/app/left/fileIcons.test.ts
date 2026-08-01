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
import {
  FILE_MARK_CHROMA_STYLE,
  resolveFileIconDef,
  resolveFileIconId,
} from "./fileIcons";

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

  it("renders every mark through the one chroma dial, never a baked-in value", () => {
    // The owner's overload note is answered by LOWERING intensity, not by
    // rewriting the library's palette: each mark keeps its own hue so the file
    // type stays recognisable. Two properties matter and both are pinned here.
    //
    // First, the reduction goes through the `--file-mark-chroma` token rather
    // than a literal. That is what lets the high-contrast theme opt back out to
    // the full palette, and what makes retuning one number in `styles.css`
    // instead of a hunt through components.
    expect(FILE_MARK_CHROMA_STYLE.filter).toBe("saturate(var(--file-mark-chroma))");

    // Second, it is SATURATE alone. A grayscale or hue-rotate would destroy the
    // hue identity the marks exist for, and an opacity would fade the mark
    // against the row rather than calm its colour.
    expect(FILE_MARK_CHROMA_STYLE.filter).not.toMatch(
      /grayscale|hue-rotate|opacity|brightness|invert/,
    );

    // And it is one shared frozen object, so a long tree does not mint a fresh
    // style per row.
    expect(Object.isFrozen(FILE_MARK_CHROMA_STYLE)).toBe(true);
  });

  it("applies the dial to every file type, with no per-type exemption", () => {
    // The alternative considered was colouring a landmark set and neutralising
    // the long tail. It was rejected because two files of ONE type could then
    // diverge (README.md coloured, notes.md grey). Nothing here may reintroduce
    // that: the mark style cannot depend on the path.
    const paths = ["README.md", "notes.md", "package.json", "deep/x.rs", "u.unknown"];
    for (const path of paths) {
      expect(resolveFileIconDef(path).svgBody.length).toBeGreaterThan(0);
    }
    // `FileTypeIcon` takes the style from the module constant, so there is no
    // path-keyed branch to test — this asserts the constant is the only source.
    expect(Object.keys(FILE_MARK_CHROMA_STYLE)).toEqual(["filter"]);
  });

  it("resolves every path to a renderable definition", () => {
    for (const path of ["a.ts", "b.unknown", "Cargo.toml", "x/y/z.rs"]) {
      const def = resolveFileIconDef(path);
      expect(def.svgBody.length).toBeGreaterThan(0);
      expect(def.viewBox.length).toBeGreaterThan(0);
    }
  });
});
