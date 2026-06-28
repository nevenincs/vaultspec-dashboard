// @vitest-environment happy-dom
//
// Component tests for the read-only code viewer (review-rail-viewers P05): the
// path header + language badge, line-numbered rendering, the truncated honest
// notice, and the tiers-derived degraded / empty / error states. The viewer is
// display-only — these assert there is no editing affordance (no textbox). Uses
// core vitest matchers (no jest-dom), the project convention.

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ContentView } from "../../stores/server/queries";
import { CodeViewer } from "./CodeViewer";

afterEach(cleanup);

function available(
  text: string,
  truncated: ContentView["truncated"] = null,
): ContentView {
  return {
    loading: false,
    errored: false,
    degraded: false,
    degradedTiers: [],
    reasons: {},
    path: "src/auth/mod.rs",
    blobHash: "abc",
    languageHint: "rust",
    text,
    truncated,
    available: true,
  };
}

describe("CodeViewer", () => {
  it("renders the binding filename header, language badge, and status footer", () => {
    const { container } = render(<CodeViewer content={available("fn main() {}\n")} />);
    // Binding CodeViewer (270:927): the header shows the FILENAME (not the full
    // path) plus a capitalized language badge; the status footer carries the
    // language · encoding · line count · read-only line.
    const header = container.querySelector("header")!;
    expect(within(header).getByText("mod.rs")).toBeTruthy();
    expect(within(header).getByText("Rust")).toBeTruthy();
    const footer = container.querySelector("footer")!;
    expect(footer.textContent).toContain("UTF-8");
    expect(footer.textContent).toContain("Rust");
  });

  it("renders line numbers for each line", () => {
    render(<CodeViewer content={available("line one\nline two\nline three\n")} />);
    // The gutter renders a 1-based number per line (the first window is visible).
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("is display-only — exposes no editing affordance", () => {
    render(<CodeViewer content={available("fn main() {}\n")} />);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("renders the honest truncated notice from the truncated block", () => {
    const view = available("x".repeat(100), {
      total_bytes: 2_000_000,
      returned_bytes: 1_048_576,
      reason: "content byte ceiling",
    });
    const { container } = render(<CodeViewer content={view} />);
    // The notice text is interpolated across nodes (two toLocaleString numbers),
    // so assert on the full rendered text using the store projection's explicit
    // `en-US` byte-count contract.
    const text = container.textContent ?? "";
    expect(text).toContain("Truncated to the first");
    expect(text).toContain((1_048_576).toLocaleString("en-US"));
    expect(text).toContain((2_000_000).toLocaleString("en-US"));
  });

  it("renders the degraded state from the structural tier", () => {
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
    render(<CodeViewer content={view} />);
    expect(screen.getByText(/worktree not listable/)).toBeTruthy();
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
    const { container, unmount } = render(<CodeViewer content={loading} />);
    // Loading is UI-ONLY (state-mode-uniformity ADR D2): a kit Skeleton, never
    // on-screen "Loading…" text. The skeleton announces busy to AT and carries the
    // human label ONLY in its `sr-only` span.
    const skeleton = container.querySelector("[data-skeleton]");
    expect(skeleton).toBeTruthy();
    expect(skeleton!.getAttribute("role")).toBe("status");
    expect(skeleton!.getAttribute("aria-busy")).toBe("true");
    expect(skeleton!.querySelector(".sr-only")?.textContent).toMatch(/Loading file/);
    // The loading copy is NOT visible body text — it lives only in the sr-only label.
    const visibleText = Array.from(container.querySelectorAll("*"))
      .filter((el) => el.children.length === 0 && !el.closest(".sr-only"))
      .map((el) => el.textContent ?? "")
      .join(" ");
    expect(visibleText).not.toMatch(/Loading file/);
    unmount();

    // Error stays a plain sentence (only loading is skeletonized).
    const { container: errored } = render(
      <CodeViewer content={{ ...loading, loading: false, errored: true }} />,
    );
    expect(errored.querySelector("[data-skeleton]")).toBeNull();
    expect(screen.getByText(/could not be loaded/)).toBeTruthy();
  });
});
