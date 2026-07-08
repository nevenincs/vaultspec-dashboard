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
      expect(token.getAttribute("style") ?? "").toContain("var(--color-");
    }, ENGINE_WAIT);

    fireEvent.change(editor, {
      target: { value: "# Changed\n\n```rs\nfn main() {}\n```" },
    });
    expect(editor.value).toContain("fn main");
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
