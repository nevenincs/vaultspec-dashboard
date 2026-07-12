// Unit tests for the heading-path block-identity plugin (authoring-surface
// W02.P05.S14). Pure mdast transform — no DOM, no wire; the plugin runs on a
// hand-built tree so the slugging + path stamping are asserted directly.

import { describe, expect, it } from "vitest";
import type { Heading, Root } from "mdast";

import { remarkBlockId, slugifyHeading } from "./remarkBlockId";

/** A minimal heading node. */
function heading(depth: number, text: string): Heading {
  return {
    type: "heading",
    depth: depth as Heading["depth"],
    children: [{ type: "text", value: text }],
  };
}

/** Read a heading node's stamped hProperties. */
function props(node: Heading): Record<string, unknown> {
  return (node.data?.hProperties ?? {}) as Record<string, unknown>;
}

describe("slugifyHeading", () => {
  it("lowercases and hyphenates non-alphanumeric runs, trimming edges", () => {
    expect(slugifyHeading("Wave W01 — Backend seams")).toBe("wave-w01-backend-seams");
    expect(slugifyHeading("  Trailing spaces  ")).toBe("trailing-spaces");
  });

  it("preserves unicode letters and degrades an empty slug to a stable sentinel", () => {
    expect(slugifyHeading("Café")).toBe("café");
    expect(slugifyHeading("—")).toBe("section");
  });

  it("is deterministic for the same input", () => {
    expect(slugifyHeading("Phase P05")).toBe(slugifyHeading("Phase P05"));
  });
});

describe("remarkBlockId", () => {
  it("stamps the ancestor-inclusive heading path and a slug id on every heading", () => {
    const alpha = heading(2, "Alpha");
    const detail = heading(3, "Alpha Detail");
    const beta = heading(2, "Beta");
    const tree: Root = {
      type: "root",
      children: [heading(1, "Title"), alpha, detail, beta],
    };

    remarkBlockId()(tree);

    expect(props(alpha)["data-comment-path"]).toBe(JSON.stringify(["Title", "Alpha"]));
    expect(props(detail)["data-comment-path"]).toBe(
      JSON.stringify(["Title", "Alpha", "Alpha Detail"]),
    );
    expect(props(beta)["data-comment-path"]).toBe(JSON.stringify(["Title", "Beta"]));
    // The id doubles as a stable fragment anchor (D3 copy-link) and the block id.
    expect(props(alpha).id).toBe("title-alpha");
    expect(props(alpha)["data-block-id"]).toBe("title-alpha");
  });

  it("disambiguates two identical heading paths with an occurrence-indexed slug", () => {
    const first = heading(2, "Notes");
    const second = heading(2, "Notes");
    const tree: Root = { type: "root", children: [first, second] };

    remarkBlockId()(tree);

    // Same path text, distinct collision-safe ids — never the same fragment id.
    expect(props(first).id).toBe("notes");
    expect(props(second).id).toBe("notes-2");
    expect(props(first)["data-comment-path"]).toBe(props(second)["data-comment-path"]);
  });

  it("resets the ancestor stack when a shallower heading follows a deeper one", () => {
    const nested = heading(3, "Deep");
    const sibling = heading(2, "Second");
    const tree: Root = {
      type: "root",
      children: [heading(1, "Root"), heading(2, "First"), nested, sibling],
    };

    remarkBlockId()(tree);

    expect(props(nested)["data-comment-path"]).toBe(
      JSON.stringify(["Root", "First", "Deep"]),
    );
    // "Second" pops back to Root's child level — "First" and "Deep" leave the stack.
    expect(props(sibling)["data-comment-path"]).toBe(
      JSON.stringify(["Root", "Second"]),
    );
  });
});
