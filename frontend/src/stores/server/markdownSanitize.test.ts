// Unit tests for the editorial reader sanitizer (document-reader hardening):
// heading text reduces to plain text, intra-word underscores survive, HTML
// comments are stripped in read mode, and fenced code blocks pass through.

import { describe, expect, it } from "vitest";

import {
  deriveEditorialTitle,
  sanitizeHeadingText,
  sanitizeReaderBody,
} from "./markdownSanitize";

describe("sanitizeHeadingText", () => {
  it("strips inline code backticks, keeping the inner text", () => {
    expect(sanitizeHeadingText("`foo` adr: `bar`")).toBe("foo adr: bar");
    expect(sanitizeHeadingText("Engine (`vaultspec` CLI) — draft 1")).toBe(
      "Engine (vaultspec CLI) — draft 1",
    );
  });

  it("strips bold/italic/strike/highlight markers", () => {
    expect(sanitizeHeadingText("**bold** and *em*")).toBe("bold and em");
    expect(sanitizeHeadingText("__b__ and _i_")).toBe("b and i");
    expect(sanitizeHeadingText("***both*** and ___both___")).toBe("both and both");
    expect(sanitizeHeadingText("~~old~~ new")).toBe("old new");
    expect(sanitizeHeadingText("==mark== it")).toBe("mark it");
  });

  it("preserves intra-word underscores (snake_case is not emphasis)", () => {
    expect(sanitizeHeadingText("the snake_case name")).toBe("the snake_case name");
    expect(sanitizeHeadingText("a_b_c and d_e")).toBe("a_b_c and d_e");
  });

  it("reduces links, wiki links, and images to their text", () => {
    expect(sanitizeHeadingText("[text](https://x.test)")).toBe("text");
    expect(sanitizeHeadingText("[ref][id]")).toBe("ref");
    expect(sanitizeHeadingText("[[stem|Alias]]")).toBe("Alias");
    expect(sanitizeHeadingText("[[a-stem]]")).toBe("a-stem");
    expect(sanitizeHeadingText("![alt text](pic.png)")).toBe("alt text");
  });

  it("strips raw HTML tags and unescapes backslash escapes", () => {
    expect(sanitizeHeadingText("a <b>c</b> d")).toBe("a c d");
    expect(sanitizeHeadingText("a \\* b \\_ c")).toBe("a * b _ c");
  });

  it("handles the real binding-title shape end to end", () => {
    expect(
      sanitizeHeadingText(
        "`dashboard-foundation` adr: `kickoff decisions register` | (**status:** `accepted`)",
      ),
    ).toBe("dashboard-foundation adr: kickoff decisions register | (status: accepted)");
  });

  it("is idempotent", () => {
    const once = sanitizeHeadingText("**`x`** [[a|B]] ~~y~~");
    expect(sanitizeHeadingText(once)).toBe(once);
  });
});

describe("deriveEditorialTitle", () => {
  it("reduces the vaultspec H1 template to the clean narrative", () => {
    expect(
      deriveEditorialTitle(
        "`dashboard-foundation` adr: `kickoff decisions register` | (**status:** `accepted`)",
      ),
    ).toBe("Kickoff decisions register");
    expect(deriveEditorialTitle("`dashboard-gui` audit: `W01.P01 review`")).toBe(
      "W01.P01 review",
    );
    expect(deriveEditorialTitle("`graph-scale-hardening` plan")).toBe(
      "Graph-scale-hardening plan",
    );
  });

  it("keeps a narrative colon and capitalizes the result", () => {
    expect(
      deriveEditorialTitle("engine-hardening adr: engine hardening: conformance-in-CI"),
    ).toBe("Engine hardening: conformance-in-CI");
  });

  it("leaves a non-template H1 (an exec action sentence) as plain text", () => {
    expect(
      deriveEditorialTitle("add an ontology module with an authority_class map"),
    ).toBe("Add an ontology module with an authority_class map");
  });

  it("strips a trailing status block even without a doctype prefix", () => {
    expect(deriveEditorialTitle("A plain title | (status: accepted)")).toBe(
      "A plain title",
    );
  });

  it("preserves bare angle-bracket placeholders (content, not HTML)", () => {
    expect(deriveEditorialTitle("Derive `code:<path>` through the node_id rule")).toBe(
      "Derive code:<path> through the node_id rule",
    );
  });
});

describe("sanitizeReaderBody", () => {
  it("strips single-line HTML comments", () => {
    expect(sanitizeReaderBody("alpha <!-- hидden --> beta")).toBe("alpha  beta");
  });

  it("strips multi-line HTML comment blocks (template annotations)", () => {
    const body = [
      "intro",
      "<!-- FRONTMATTER RULES:",
      "  keep these",
      "  out of the reader -->",
      "outro",
    ].join("\n");
    expect(sanitizeReaderBody(body)).toBe(["intro", "", "outro"].join("\n"));
  });

  it("rewrites headings at every level to plain text", () => {
    const body = ["# `H1` **x**", "## _H2_", "###### a~~b~~c"].join("\n");
    expect(sanitizeReaderBody(body)).toBe(["# H1 x", "## H2", "###### abc"].join("\n"));
  });

  it("strips a trailing ATX closing-hash sequence", () => {
    expect(sanitizeReaderBody("## Title ##")).toBe("## Title");
  });

  it("passes fenced code blocks through verbatim (no heading/comment rewrite)", () => {
    const body = ["```md", "# not a heading", "<!-- not a comment -->", "```"].join(
      "\n",
    );
    expect(sanitizeReaderBody(body)).toBe(body);
  });

  it("does not treat intra-word underscores in headings as emphasis", () => {
    expect(sanitizeReaderBody("# the dashboard_foundation plan")).toBe(
      "# the dashboard_foundation plan",
    );
  });
});
