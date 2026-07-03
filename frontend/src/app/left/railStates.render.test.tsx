// @vitest-environment happy-dom
//
// The left rail's DESIGNED modes (binding `LeftRail` State collection: Loading / Empty /
// Degraded) now compose the shared state-mode kit (state-mode-uniformity ADR): a
// `Skeleton` (UI-only, no text), and `StateBlock`s (shared glyph + one sentence). This
// proves the rail responds to each state through the ONE canonical kit — uniform pulse,
// tone, and glyph with every other surface.

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { RailDegradedNotice, RailMessage, RailSkeleton } from "./railStates";

afterEach(cleanup);

describe("left-rail designed modes (composed from the shared kit)", () => {
  it("LOADING renders an accessible skeleton (aria-busy, uniform pulse, no spinner text)", () => {
    const { container } = render(createElement(RailSkeleton, { label: "Loading…" }));
    const root = container.querySelector("[data-skeleton]");
    expect(root).toBeTruthy();
    expect(root!.getAttribute("aria-busy")).toBe("true");
    // The pulse is the uniform `animate-pulse-live` on the wrapper (was a per-bar
    // `animate-pulse` — standardized by the kit).
    expect(root!.className).toContain("animate-pulse-live");
    // Pure shape: several skeleton fills, no sentence.
    expect(container.querySelectorAll(".bg-rule-strong").length).toBeGreaterThan(2);
    // The label is screen-reader-only, never visible body copy.
    expect(screen.getByText("Loading…").className).toContain("sr-only");
  });

  it("EMPTY renders a centered shared glyph + one plain sentence", () => {
    render(
      createElement(RailMessage, {
        tone: "empty",
        label: "No documents in this worktree yet.",
      }),
    );
    const root = document.querySelector('[data-state-block="empty"]');
    expect(root).toBeTruthy();
    expect(root!.querySelector("svg")).toBeTruthy();
    expect(screen.getByText("No documents in this worktree yet.")).toBeTruthy();
  });

  it("DEGRADED (full) renders the caution glyph state with a plain sentence", () => {
    render(
      createElement(RailMessage, {
        tone: "degraded",
        label: "Files are unavailable for this scope.",
      }),
    );
    const root = document.querySelector('[data-state-block="degraded"]');
    expect(root).toBeTruthy();
    expect(root!.getAttribute("role")).toBe("status");
    expect(root!.querySelector("svg")).toBeTruthy();
    expect(screen.getByText("Files are unavailable for this scope.")).toBeTruthy();
  });

  it("DEGRADED (inline notice) renders a compact caution row, no raw reason", () => {
    render(
      createElement(RailDegradedNotice, {
        label: "Some documents are temporarily unavailable.",
      }),
    );
    const root = document.querySelector('[data-state-block="degraded"]');
    expect(root).toBeTruthy();
    expect(root!.getAttribute("role")).toBe("status");
    // The inline notice rides the sunken pill (its distinguishing layout).
    expect(root!.className).toContain("bg-paper-sunken");
    expect(root!.querySelector("svg")).toBeTruthy();
    expect(
      screen.getByText("Some documents are temporarily unavailable."),
    ).toBeTruthy();
    // No engineering vocabulary ever leaks into the degraded copy.
    expect(root!.textContent).not.toMatch(/service\.json|rag service|tier/i);
  });
});
