// @vitest-environment happy-dom
//
// Component tests for the frontmatter-aware markdown reader (review-rail-viewers
// P07.S34): structured frontmatter rendering (tags pills, dates, clickable
// related wiki-links), in-body double-bracket wiki-link navigation, GFM task-list
// checkboxes (the plan checkbox/step structure), and the tiers-derived
// degraded/empty/error states. Code-highlighting-across-themes is proven in
// `highlighterTheme.test.tsx` (the token-bound theme renders the same
// var(--color-*) foregrounds under light/dark/high-contrast). Uses core vitest
// matchers only (no jest-dom), the project convention.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ContentView } from "../../stores/server/queries";
import { useViewStore } from "../../stores/view/viewStore";
import { MarkdownReader } from "./MarkdownReader";

afterEach(cleanup);
beforeEach(() => {
  useViewStore.getState().closeViewer();
});

/** A content view in the available state carrying `text`. */
function available(text: string): ContentView {
  return {
    loading: false,
    errored: false,
    degraded: false,
    degradedTiers: [],
    reasons: {},
    path: ".vault/adr/2026-06-16-x-adr.md",
    blobHash: "abc",
    languageHint: "markdown",
    text,
    truncated: null,
    available: true,
  };
}

const DOC = [
  "---",
  "tags:",
  "  - '#adr'",
  "  - '#review-rail-viewers'",
  "date: '2026-06-16'",
  "modified: '2026-06-16'",
  "related:",
  "  - '[[2026-06-16-review-rail-viewers-plan]]'",
  "---",
  "",
  "# Heading",
  "",
  "A paragraph linking to [[2026-06-16-other-doc|the other doc]].",
  "",
  "- [x] a finished step",
  "- [ ] a pending step",
  "",
].join("\n");

describe("MarkdownReader frontmatter chrome", () => {
  it("renders tags as pills, dates as stamps, and related as clickable wiki-links", () => {
    render(<MarkdownReader content={available(DOC)} />);
    // Tags become pills (the `#` prefix preserved on the pill text).
    expect(screen.getByText("#adr")).toBeTruthy();
    expect(screen.getByText("#review-rail-viewers")).toBeTruthy();
    // Dates become stamps.
    expect(screen.getByText("created")).toBeTruthy();
    expect(screen.getByText("modified")).toBeTruthy();
    // Related renders the target stem as a clickable control.
    expect(
      screen.getByRole("button", { name: "2026-06-16-review-rail-viewers-plan" }),
    ).toBeTruthy();
  });

  it("opens the related document in the reader on click (in-app navigation)", () => {
    render(<MarkdownReader content={available(DOC)} />);
    fireEvent.click(
      screen.getByRole("button", { name: "2026-06-16-review-rail-viewers-plan" }),
    );
    const target = useViewStore
      .getState()
      .openDocs.find((d) => d.nodeId === "doc:2026-06-16-review-rail-viewers-plan");
    expect(target).toBeTruthy();
    expect(target?.surface).toBe("markdown");
  });
});

describe("MarkdownReader body", () => {
  it("rewrites in-body double-bracket wiki-links to in-app navigation", () => {
    render(<MarkdownReader content={available(DOC)} />);
    // The `[[stem|label]]` form renders its label as a clickable control.
    const link = screen.getByRole("button", { name: "the other doc" });
    fireEvent.click(link);
    const target = useViewStore
      .getState()
      .openDocs.find((d) => d.nodeId === "doc:2026-06-16-other-doc");
    expect(target).toBeTruthy();
    expect(target?.surface).toBe("markdown");
  });

  it("renders GFM task-list checkboxes (the plan step structure)", () => {
    render(<MarkdownReader content={available(DOC)} />);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(2);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(false);
    // The step text renders alongside the checkboxes.
    expect(screen.getByText(/a finished step/)).toBeTruthy();
    expect(screen.getByText(/a pending step/)).toBeTruthy();
  });
});

describe("MarkdownReader states (read from the tiers-derived view)", () => {
  it("renders the degraded state from the content view's structural degradation", () => {
    const view: ContentView = {
      loading: false,
      errored: false,
      degraded: true,
      degradedTiers: ["structural"],
      reasons: { structural: "worktree not listable" },
      languageHint: null,
      text: "",
      truncated: null,
      available: false,
    };
    render(<MarkdownReader content={view} />);
    expect(screen.getByText(/worktree not listable/)).toBeTruthy();
  });

  it("renders the loading and error states", () => {
    const loading: ContentView = {
      loading: true,
      errored: false,
      degraded: false,
      degradedTiers: [],
      reasons: {},
      languageHint: null,
      text: "",
      truncated: null,
      available: false,
    };
    const { unmount } = render(<MarkdownReader content={loading} />);
    expect(screen.getByText(/Loading document/)).toBeTruthy();
    unmount();

    const errored: ContentView = { ...loading, loading: false, errored: true };
    render(<MarkdownReader content={errored} />);
    expect(screen.getByText(/could not be loaded/)).toBeTruthy();
  });
});
