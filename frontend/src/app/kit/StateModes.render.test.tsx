// @vitest-environment happy-dom
//
// Contracts for the shared state-mode primitives (state-mode-uniformity ADR). The
// Skeleton enforces "loading is UI-only" — its ONLY text is the sr-only label; the
// StateBlock renders one sentence with a shared glyph in the mode's themed tone.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Skeleton, SkeletonRow, StateBlock } from "./index";

afterEach(cleanup);

describe("Skeleton (loading = UI only, no text)", () => {
  it("announces busy with the label ONLY in sr-only — no visible copy", () => {
    const { container, getByRole } = render(
      <Skeleton label="loading activity">
        <SkeletonRow />
        <SkeletonRow boxed />
      </Skeleton>,
    );
    const status = getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    // the only text node is the sr-only label
    const srOnly = container.querySelector(".sr-only");
    expect(srOnly?.textContent).toBe("loading activity");
    // nothing outside sr-only carries text — the skeleton is pure shape
    const visibleText = (status.textContent ?? "")
      .replace(srOnly?.textContent ?? "", "")
      .trim();
    expect(visibleText).toBe("");
  });
});

describe("StateBlock (degraded / empty = shared glyph + one sentence)", () => {
  it("degraded carries the caution mark in the stale tone + the sentence", () => {
    const { container, getByText } = render(
      <StateBlock mode="degraded" message="Showing the documents that loaded." />,
    );
    expect(getByText("Showing the documents that loaded.")).toBeTruthy();
    expect(container.querySelector('[data-state-block="degraded"]')).toBeTruthy();
    // shared glyph rendered in the state-stale tone (not an ad-hoc colour)
    expect(container.querySelector(".text-state-stale")).toBeTruthy();
  });

  it("empty carries a neutral glyph + the sentence", () => {
    const { container, getByText } = render(
      <StateBlock mode="empty" message="No documents in this scope." />,
    );
    expect(getByText("No documents in this scope.")).toBeTruthy();
    expect(container.querySelector('[data-state-block="empty"]')).toBeTruthy();
    expect(container.querySelector(".text-ink-faint")).toBeTruthy();
  });

  it("inline layout is the compact sunken notice", () => {
    const { container } = render(
      <StateBlock mode="degraded" layout="inline" message="Partial data." />,
    );
    const block = container.querySelector('[data-state-block="degraded"]');
    expect(block?.className).toContain("bg-paper-sunken");
  });
});
