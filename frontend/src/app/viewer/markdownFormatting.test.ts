import { describe, expect, it } from "vitest";

import { applyMarkdownFormat, type MarkdownSelection } from "./markdownFormatting";

const PLACEHOLDERS = {
  bold: "bold text",
  italic: "italic text",
  code: "code",
  document: "document",
  linkText: "text",
  linkUrl: "url",
} as const;

function format(
  command: Parameters<typeof applyMarkdownFormat>[0],
  selection: MarkdownSelection,
) {
  return applyMarkdownFormat(command, selection, PLACEHOLDERS);
}

/** Build a selection from a body where `[` and `]` mark the selection bounds (the
 *  markers are stripped). `wrap("a[bc]d")` selects "bc" at offsets 1..3. */
function sel(marked: string): MarkdownSelection {
  const selStart = marked.indexOf("[");
  const withoutStart = marked.replace("[", "");
  const selEnd = withoutStart.indexOf("]");
  const text = withoutStart.replace("]", "");
  return { text, selStart, selEnd };
}

describe("applyMarkdownFormat inline wraps", () => {
  it("wraps a selection in bold markers and keeps the body selected", () => {
    const result = format("bold", sel("a [word] z"));
    expect(result.text).toBe("a **word** z");
    expect(result.text.slice(result.selStart, result.selEnd)).toBe("word");
  });

  it("inserts a placeholder for an empty italic selection and selects it", () => {
    const result = format("italic", {
      text: "ab",
      selStart: 1,
      selEnd: 1,
    });
    expect(result.text).toBe("a*italic text*b");
    expect(result.text.slice(result.selStart, result.selEnd)).toBe("italic text");
  });

  it("wraps a selection as inline code", () => {
    const result = format("code", sel("run [foo] now"));
    expect(result.text).toBe("run `foo` now");
  });

  it("wraps a selection as a wiki-link", () => {
    const result = format("wikiLink", sel("see [plan] here"));
    expect(result.text).toBe("see [[plan]] here");
    expect(result.text.slice(result.selStart, result.selEnd)).toBe("plan");
  });

  it("builds a link with the caret on the url slot", () => {
    const result = format("link", sel("go [home] now"));
    expect(result.text).toBe("go [home](url) now");
    expect(result.text.slice(result.selStart, result.selEnd)).toBe("url");
  });
});

describe("applyMarkdownFormat line prefixes", () => {
  it("prefixes a single line as a heading", () => {
    const result = format("heading", {
      text: "title",
      selStart: 0,
      selEnd: 0,
    });
    expect(result.text).toBe("# title");
  });

  it("prefixes each selected line as a bullet list", () => {
    const result = format("bulletList", sel("[one\ntwo]"));
    expect(result.text).toBe("- one\n- two");
  });

  it("numbers each selected line for an ordered list", () => {
    const result = format("orderedList", sel("[one\ntwo\nthree]"));
    expect(result.text).toBe("1. one\n2. two\n3. three");
  });

  it("prefixes a quote and expands a mid-line selection to the whole line", () => {
    const result = format("quote", {
      text: "hello world",
      selStart: 6,
      selEnd: 6,
    });
    expect(result.text).toBe("> hello world");
  });
});

describe("applyMarkdownFormat guards", () => {
  it("clamps and orders an inverted / out-of-range selection", () => {
    const result = format("bold", {
      text: "abc",
      selStart: 99,
      selEnd: -5,
    });
    // Clamped to [0, 3] and ordered → the whole string is wrapped.
    expect(result.text).toBe("**abc**");
  });
});
