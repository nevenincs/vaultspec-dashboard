// @vitest-environment happy-dom
//
// The left rail's DESIGNED modes (binding `LeftRail` State collection: Loading /
// Empty / Degraded) render as first-class states — a skeleton, a centered glyph +
// message, and an AlertTriangle notice — NOT a copy-toned sentence and NEVER a raw
// tier reason. Both rail tabs (Vault + Files) consume these same components, so the
// mode concept is one shared feature; this proves the components respond to each
// state.

import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { RailDegradedNotice, RailMessage, RailSkeleton } from "./railStates";

afterEach(cleanup);

describe("left-rail designed modes", () => {
  it("LOADING renders an accessible skeleton (aria-busy, no spinner text)", () => {
    const { container } = render(createElement(RailSkeleton, { label: "Loading…" }));
    const root = container.querySelector('[data-rail-state="loading"]');
    expect(root).toBeTruthy();
    expect(root!.getAttribute("aria-busy")).toBe("true");
    // Skeleton bars, not a sentence: the visible content is pulse blocks.
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(2);
    // The label is screen-reader-only, never rendered as visible body copy.
    expect(screen.getByText("Loading…").className).toContain("sr-only");
  });

  it("EMPTY renders a centered glyph + one plain sentence", () => {
    render(
      createElement(RailMessage, {
        tone: "empty",
        label: "No documents in this scope yet.",
      }),
    );
    const root = document.querySelector('[data-rail-state="empty"]');
    expect(root).toBeTruthy();
    expect(root!.querySelector("svg")).toBeTruthy();
    expect(screen.getByText("No documents in this scope yet.")).toBeTruthy();
  });

  it("DEGRADED (full) renders the AlertTriangle state with a plain sentence", () => {
    render(
      createElement(RailMessage, {
        tone: "degraded",
        label: "Files are unavailable for this scope.",
      }),
    );
    const root = document.querySelector('[data-rail-state="degraded"]');
    expect(root).toBeTruthy();
    expect(root!.getAttribute("role")).toBe("status");
    expect(root!.querySelector("svg")).toBeTruthy();
    expect(screen.getByText("Files are unavailable for this scope.")).toBeTruthy();
  });

  it("DEGRADED (inline notice) renders a compact AlertTriangle row, no raw reason", () => {
    render(
      createElement(RailDegradedNotice, {
        label: "Some documents are temporarily unavailable.",
      }),
    );
    const root = document.querySelector('[data-rail-state="degraded-notice"]');
    expect(root).toBeTruthy();
    expect(root!.getAttribute("role")).toBe("status");
    expect(root!.querySelector("svg")).toBeTruthy();
    const text = screen.getByText("Some documents are temporarily unavailable.");
    expect(text).toBeTruthy();
    // No engineering vocabulary ever leaks into the degraded copy.
    expect(root!.textContent).not.toMatch(/service\.json|rag service|tier/i);
  });
});
