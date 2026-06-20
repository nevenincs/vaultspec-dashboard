// @vitest-environment happy-dom
//
// Component tests for the read-only code viewer (review-rail-viewers P05): the
// path header + language badge, line-numbered rendering, the truncated honest
// notice, and the tiers-derived degraded / empty / error states. The viewer is
// display-only — these assert there is no editing affordance (no textbox). Uses
// core vitest matchers (no jest-dom), the project convention.

import { cleanup, render, screen } from "@testing-library/react";
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
  it("renders the monospace path header and the language badge", () => {
    render(<CodeViewer content={available("fn main() {}\n")} />);
    expect(screen.getByText("src/auth/mod.rs")).toBeTruthy();
    expect(screen.getByText("rust")).toBeTruthy();
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
    const { unmount } = render(<CodeViewer content={loading} />);
    expect(screen.getByText(/Loading file/)).toBeTruthy();
    unmount();

    render(<CodeViewer content={{ ...loading, loading: false, errored: true }} />);
    expect(screen.getByText(/could not be loaded/)).toBeTruthy();
  });
});
