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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentView } from "../../stores/server/queries";
import { useViewStore } from "../../stores/view/viewStore";
import { MarkdownReader } from "./MarkdownReader";

afterEach(cleanup);
beforeEach(() => {
  useViewStore.setState({ openDocs: [], activeDocId: null });
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
  "status: accepted",
  "related:",
  "  - '[[2026-06-16-review-rail-viewers-plan]]'",
  "---",
  "",
  "# Heading",
  "",
  "A dek paragraph lifted into the reader header.",
  "",
  "A body paragraph linking to [[2026-06-16-other-doc|the other doc]].",
  "",
  "- [x] a finished step",
  "- [ ] a pending step",
  "",
].join("\n");

describe("MarkdownReader frontmatter chrome", () => {
  it("renders tags as pills, dates as stamps, and related as clickable wiki-links", () => {
    render(<MarkdownReader content={available(DOC)} />);
    // The doc-type tag becomes the reader eyebrow; remaining feature tags stay pills.
    expect(screen.getByText("Decision")).toBeTruthy();
    expect(screen.getByText("#review-rail-viewers")).toBeTruthy();
    // Reader meta is projected by the stores-owned reader view.
    expect(screen.getByText("16 June 2026")).toBeTruthy();
    expect(screen.getByText("accepted")).toBeTruthy();
    // Related renders the target stem as a clickable, selectable anchor.
    expect(
      screen.getByRole("link", { name: "2026-06-16-review-rail-viewers-plan" }),
    ).toBeTruthy();
  });

  it("opens the related document in the reader on click (in-app navigation)", () => {
    render(<MarkdownReader content={available(DOC)} />);
    fireEvent.click(
      screen.getByRole("link", { name: "2026-06-16-review-rail-viewers-plan" }),
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
    // The `[[stem|label]]` form renders its label as a clickable, selectable anchor.
    const link = screen.getByRole("link", { name: "the other doc" });
    fireEvent.click(link);
    const target = useViewStore
      .getState()
      .openDocs.find((d) => d.nodeId === "doc:2026-06-16-other-doc");
    expect(target).toBeTruthy();
    expect(target?.surface).toBe("markdown");
  });

  it("renders GFM task-list steps with the shared check mark (no native checkbox)", () => {
    const { container } = render(<MarkdownReader content={available(DOC)} />);
    // The native (disabled) checkbox is replaced by the shared StepCheckMark, so the
    // reader and the right-rail step tree show a step identically.
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    const marks = container.querySelectorAll("[data-step-check]");
    expect(marks.length).toBe(2);
    // The done step carries `data-done="true"` (filled disc + check); the pending
    // step `data-done="false"` (hollow ring). The done-row treatment keys on this.
    expect(screen.getByRole("img", { name: "complete" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "open" })).toBeTruthy();
    expect(
      container.querySelectorAll('[data-step-check][data-done="true"]').length,
    ).toBe(1);
    // The step text renders alongside the marks.
    expect(screen.getByText(/a finished step/)).toBeTruthy();
    expect(screen.getByText(/a pending step/)).toBeTruthy();
  });

  it("sanitizes a javascript: URL in a body link (no stored-XSS via href)", () => {
    // A doc body (possibly shared or cloned from an untrusted source) carrying a
    // `javascript:` link must never render as a live href. The reader's
    // `urlTransform` delegates every non-wiki scheme to react-markdown's default
    // sanitizer; an identity passthrough (the prior bug) would have disabled this.
    const doc = [
      "---",
      "tags:",
      "  - '#adr'",
      "date: '2026-06-16'",
      "modified: '2026-06-16'",
      "---",
      "",
      "# Heading",
      "",
      "An intro dek paragraph.",
      "",
      "Body para with [click me](javascript:alert(document.cookie)) and",
      "[safe link](https://example.com) inline.",
    ].join("\n");
    render(<MarkdownReader content={available(doc)} />);
    const malicious = screen.getByText("click me").closest("a");
    expect((malicious?.getAttribute("href") ?? "").toLowerCase()).not.toMatch(
      /^javascript:/,
    );
    // A legitimate http(s) link is preserved — sanitization never breaks real links.
    const safe = screen.getByText("safe link").closest("a");
    expect(safe?.getAttribute("href")).toBe("https://example.com");
  });

  it("copies the fenced code block to the clipboard via the Copy button", () => {
    // The fenced-code Copy affordance must actually write to the clipboard — it was a
    // bare <span> (a dead control that looked actionable but did nothing), unlike the
    // wired CodeViewer Copy. happy-dom may not implement navigator.clipboard, so install
    // a spy.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const doc = [
      "---",
      "tags:",
      "  - '#adr'",
      "date: '2026-06-16'",
      "modified: '2026-06-16'",
      "---",
      "",
      "# Heading",
      "",
      "An intro dek.",
      "",
      "```ts",
      "const answer = 42;",
      "```",
    ].join("\n");
    render(<MarkdownReader content={available(doc)} />);
    const copy = screen.getByRole("button", { name: "Copy" });
    fireEvent.click(copy);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain("const answer = 42;");
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

  it("renders the not-in-workspace state on a 404, never a blank body (per-tab-scope-binding)", () => {
    const view: ContentView = {
      loading: false,
      errored: false,
      notFound: true,
      degraded: false,
      degradedTiers: [],
      reasons: {},
      languageHint: null,
      text: "",
      truncated: null,
      available: false,
    };
    render(<MarkdownReader content={view} />);
    expect(screen.getByText(/isn't in this workspace/)).toBeTruthy();
  });

  it("renders the loading state as a text-free skeleton and the error state as a sentence", () => {
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
    const { container, unmount } = render(<MarkdownReader content={loading} />);
    // Loading is UI-ONLY (state-mode-uniformity ADR D2): a kit Skeleton, never
    // on-screen "Loading…" text. The skeleton announces busy to AT and carries the
    // human label ONLY in its `sr-only` span.
    const skeleton = container.querySelector("[data-skeleton]");
    expect(skeleton).toBeTruthy();
    expect(skeleton!.getAttribute("role")).toBe("status");
    expect(skeleton!.getAttribute("aria-busy")).toBe("true");
    expect(skeleton!.querySelector(".sr-only")?.textContent).toMatch(
      /Loading document/,
    );
    // The loading copy is NOT visible body text — it lives only in the sr-only label.
    const visibleText = Array.from(container.querySelectorAll("*"))
      .filter((el) => el.children.length === 0 && !el.closest(".sr-only"))
      .map((el) => el.textContent ?? "")
      .join(" ");
    expect(visibleText).not.toMatch(/Loading document/);
    unmount();

    // Error stays a plain sentence (only loading is skeletonized).
    const errored: ContentView = { ...loading, loading: false, errored: true };
    const { container: erroredContainer } = render(
      <MarkdownReader content={errored} />,
    );
    expect(erroredContainer.querySelector("[data-skeleton]")).toBeNull();
    expect(screen.getByText(/could not be loaded/)).toBeTruthy();
  });
});
