// @vitest-environment happy-dom
//
// DiffView render contract (agentic-authoring-ux ADR D7). Wire-free: the one diff
// primitive takes the base/proposed BoundedDocumentText as props, so the diff
// presentation is tested without the store. Asserts the add/remove/context
// marking, the change tally, the honest truncation notice, and the no-change
// empty state — and that BOTH sources (the in-editor draft-vs-saved toggle and
// the agent proposal preview) render through this ONE component. Core vitest
// matchers only (no jest-dom).

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ENGINE_WAIT } from "../../testing/timing";
import type { BoundedDocumentText } from "../../stores/server/authoring";
import { DiffView } from "./DiffView";
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

describe("DiffView", () => {
  it("marks added lines and reports the change tally", () => {
    render(
      <DiffView
        source="proposal-preview"
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
      <DiffView
        source="proposal-preview"
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
      <DiffView
        source="proposal-preview"
        base={text("same\n")}
        proposed={text("same\n")}
        label="doc"
      />,
    );
    expect(screen.getByText(/No textual change/)).toBeTruthy();
    expect(document.querySelector("[data-diff-line]")).toBeNull();
  });

  it("surfaces the served truncation honestly", () => {
    render(
      <DiffView
        source="proposal-preview"
        base={text("a\nb\n", { truncated: true, returned_bytes: 4, total_bytes: 4096 })}
        proposed={text("a\nb\nc\n")}
        label="doc"
      />,
    );
    const notice = screen.getByText(/Preview truncated/);
    // The byte counts render locale-grouped ("4,096"); assert the spec digits
    // (returned 4, total 4096) independent of the grouping separator.
    const digits = (notice.textContent ?? "").replace(/[\s,٬]/g, "");
    expect(digits).toContain("4");
    expect(digits).toContain("4096");
  });

  it("highlights snippet text from the document path without losing diff markers", async () => {
    render(
      <DiffView
        source="proposal-preview"
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

  it("renders the same primitive for both diff sources, tagging each with its origin", () => {
    // The in-editor draft-vs-saved toggle and the agent proposal preview both
    // mount THIS component (ADR D7): one line-diff implementation, one grammar,
    // distinguished only by `source`.
    const { rerender } = render(
      <DiffView
        source="draft-vs-saved"
        base={text("alpha\n")}
        proposed={text("alpha\nbeta\n")}
        label="draft"
      />,
    );
    expect(document.querySelector('[data-diff-source="draft-vs-saved"]')).toBeTruthy();
    expect(document.querySelectorAll('[data-diff-line="add"]').length).toBe(1);

    rerender(
      <DiffView
        source="proposal-preview"
        base={text("alpha\n")}
        proposed={text("alpha\nbeta\n")}
        label="proposal"
      />,
    );
    expect(
      document.querySelector('[data-diff-source="proposal-preview"]'),
    ).toBeTruthy();
    expect(document.querySelectorAll('[data-diff-line="add"]').length).toBe(1);
  });
});
