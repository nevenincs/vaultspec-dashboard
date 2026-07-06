// @vitest-environment happy-dom
//
// DiffLinesView render contract (W03.P40). Wire-free: the pure renderer takes the
// served base/proposed BoundedDocumentText as props, so the diff presentation is
// tested without the store. Asserts the add/remove/context marking, the change
// tally, the honest truncation notice, and the no-change empty state. Core vitest
// matchers only (no jest-dom).

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ENGINE_WAIT } from "../../testing/timing";
import type { BoundedDocumentText } from "../../stores/server/authoring";
import { DiffLinesView } from "./DiffPanel";
import { __resetHighlighterForTests } from "../viewer/useHighlighter";

afterEach(() => {
  cleanup();
  __resetHighlighterForTests();
});

function text(
  body: string,
  over: Partial<BoundedDocumentText> = {},
): BoundedDocumentText {
  const bytes = body.length;
  return {
    text: body,
    truncated: false,
    total_bytes: bytes,
    returned_bytes: bytes,
    ...over,
  };
}

describe("DiffLinesView", () => {
  it("marks added lines and reports the change tally", () => {
    render(
      <DiffLinesView
        base={text("line one\nline two\n")}
        proposed={text("line one\nline two\n\nnew paragraph\n")}
        label=".vault/research/alpha.md"
      />,
    );

    expect(screen.getByText(".vault/research/alpha.md")).toBeTruthy();
    const added = document.querySelector("[data-diff-added]");
    expect(added?.textContent).toContain("2");
    // The appended line is marked as an addition.
    const addLines = document.querySelectorAll('[data-diff-line="add"]');
    expect(addLines.length).toBe(2);
    expect([...addLines].some((n) => n.textContent?.includes("new paragraph"))).toBe(
      true,
    );
  });

  it("marks a replaced line as one remove + one add", () => {
    render(
      <DiffLinesView
        base={text("alpha\nbeta\ngamma\n")}
        proposed={text("alpha\nBETA\ngamma\n")}
        label="doc"
      />,
    );
    expect(document.querySelectorAll('[data-diff-line="remove"]').length).toBe(1);
    expect(document.querySelectorAll('[data-diff-line="add"]').length).toBe(1);
    expect(document.querySelectorAll('[data-diff-line="context"]').length).toBe(2);
  });

  it("renders the honest empty state when there is no textual change", () => {
    render(
      <DiffLinesView base={text("same\n")} proposed={text("same\n")} label="doc" />,
    );
    expect(screen.getByText(/No textual change/)).toBeTruthy();
    expect(document.querySelector("[data-diff-line]")).toBeNull();
  });

  it("surfaces the served truncation honestly", () => {
    render(
      <DiffLinesView
        base={text("a\nb\n", { truncated: true, returned_bytes: 4, total_bytes: 4096 })}
        proposed={text("a\nb\nc\n")}
        label="doc"
      />,
    );
    const notice = screen.getByText(/Preview truncated/);
    expect(notice.textContent).toContain("4");
    expect(notice.textContent).toContain("4096");
  });

  it("highlights snippet text from the document path without losing diff markers", async () => {
    render(
      <DiffLinesView
        base={text("const ready = false\n")}
        proposed={text("const ready: boolean = true\n")}
        label="frontend/src/state.ts"
      />,
    );

    expect(document.querySelector('[data-diff-line="remove"]')).toBeTruthy();
    expect(document.querySelector('[data-diff-line="add"]')).toBeTruthy();

    await waitFor(() => {
      const token = document.querySelector(
        '[data-diff-line="add"] [data-highlight-token]',
      ) as HTMLElement;
      expect(token).toBeTruthy();
      expect(token.getAttribute("style") ?? "").toContain("var(--color-");
    }, ENGINE_WAIT);
  });
});
