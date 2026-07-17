// @vitest-environment happy-dom
//
// Real-render coverage for the shared highlighted editor layer. These tests keep
// the native textarea as the editing authority while proving the visible layer is
// fed by the real Shiki highlighter.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { ENGINE_WAIT } from "../../testing/timing";
import { HighlightedTextarea, splitHighlightedTextLines } from "./HighlightedCode";
import { __resetHighlighterForTests } from "./useHighlighter";

afterEach(() => {
  cleanup();
  __resetHighlighterForTests();
});

function StatefulEditor() {
  const [value, setValue] = useState(
    ["# Example", "", "```ts", "const ready: boolean = true", "```"].join("\n"),
  );
  return (
    <HighlightedTextarea
      value={value}
      languageHint="markdown"
      onChange={setValue}
      ariaLabel="document body editor"
    />
  );
}

describe("HighlightedTextarea", () => {
  it("preserves the editable textarea while rendering Shiki tokens underneath", async () => {
    render(<StatefulEditor />);

    const editor = screen.getByRole("textbox", {
      name: "document body editor",
    }) as HTMLTextAreaElement;
    expect(editor.value).toContain("const ready");
    expect(document.querySelector("[data-highlighted-editor-layer]")).toBeTruthy();

    await waitFor(() => {
      const token = document.querySelector("[data-highlight-token]") as HTMLElement;
      expect(token).toBeTruthy();
      // Multi-theme tokens carry one foreground variable per theme; styles.css
      // selects one by [data-theme]. No baked colour on the span.
      expect(token.getAttribute("style") ?? "").toContain("--shiki-light:");
      expect(token.getAttribute("style") ?? "").toContain("--shiki-dark:");
    }, ENGINE_WAIT);

    fireEvent.change(editor, {
      target: { value: "# Changed\n\n```rs\nfn main() {}\n```" },
    });
    expect(editor.value).toContain("fn main");
  });
});

describe("change-marker gutter", () => {
  it("renders no marker when there are no changes", () => {
    render(
      <HighlightedTextarea
        value={"a\nb\nc"}
        languageHint="markdown"
        onChange={() => {}}
        ariaLabel="doc"
        changes={[]}
      />,
    );
    expect(document.querySelector("[data-change-marker]")).toBeNull();
  });

  it("marks each changed line with the right tone, on the right row", () => {
    // A modified line 1 and an added line 2 (in draft space).
    render(
      <HighlightedTextarea
        value={"a\nB\nnew\nc"}
        languageHint="markdown"
        onChange={() => {}}
        ariaLabel="doc"
        changes={[
          { line: 1, kind: "modified", span: 1 },
          { line: 2, kind: "added", span: 1 },
        ]}
      />,
    );
    const lines = document.querySelectorAll("[data-highlight-line]");
    // Marker lives INSIDE its line's flow block (so it tracks wrap + scroll), not
    // in a separate absolutely-positioned column.
    expect(lines[0].querySelector("[data-change-marker]")).toBeNull();
    expect(lines[1].querySelector('[data-change-marker="modified"]')).toBeTruthy();
    expect(lines[2].querySelector('[data-change-marker="added"]')).toBeTruthy();
    expect(lines[1].querySelector("[data-change-marker]")?.className).toContain(
      "bg-diff-modified",
    );
  });

  it("renders a deletion as a tick on the line it sits above", () => {
    render(
      <HighlightedTextarea
        value={"a\nc"}
        languageHint="markdown"
        onChange={() => {}}
        ariaLabel="doc"
        changes={[{ line: 1, kind: "removed", span: 0 }]}
      />,
    );
    const tick = document.querySelector('[data-change-marker="removed"]');
    expect(tick).toBeTruthy();
    // A tick, not a full-height bar: it carries the remove tone and zero-ish height.
    expect(tick?.className).toContain("bg-diff-remove");
  });

  it("distinguishes an unseen agent change with a dot and full emphasis (D5)", () => {
    render(
      <HighlightedTextarea
        value={"a\nB\nc"}
        languageHint="markdown"
        onChange={() => {}}
        ariaLabel="doc"
        changes={[
          { line: 1, kind: "modified", span: 1, origin: "agent", unseen: true },
        ]}
      />,
    );
    const bar = document.querySelector('[data-change-marker="modified"]');
    expect(bar?.getAttribute("data-change-origin")).toBe("agent");
    // The dot is the ONLY state that adds a glyph — an unacknowledged agent edit.
    expect(document.querySelector("[data-change-unseen]")).toBeTruthy();
    // Full emphasis (not muted) while unseen.
    expect(bar?.className).not.toContain("opacity-50");
  });

  it("mutes a seen agent change and drops the dot (D5)", () => {
    render(
      <HighlightedTextarea
        value={"a\nB\nc"}
        languageHint="markdown"
        onChange={() => {}}
        ariaLabel="doc"
        changes={[
          { line: 1, kind: "modified", span: 1, origin: "agent", unseen: false },
        ]}
      />,
    );
    const bar = document.querySelector('[data-change-marker="modified"]');
    expect(bar?.getAttribute("data-change-origin")).toBe("agent");
    // Seen agent change: reduced emphasis, no dot.
    expect(bar?.className).toContain("opacity-50");
    expect(document.querySelector("[data-change-unseen]")).toBeNull();
  });
});

describe("splitHighlightedTextLines", () => {
  it("preserves a trailing editor line unless the caller asks for viewer behavior", () => {
    expect(splitHighlightedTextLines("line\n")).toEqual(["line", ""]);
    expect(splitHighlightedTextLines("line\n", { dropFinalNewline: true })).toEqual([
      "line",
    ]);
  });
});
