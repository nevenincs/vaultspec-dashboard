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

  it("bare layout drops the chip framing but keeps the glyph + sentence", () => {
    const { container, getByText } = render(
      <StateBlock mode="degraded" layout="bare" message="Could not load timeline" />,
    );
    const block = container.querySelector('[data-state-block="degraded"]');
    expect(block?.getAttribute("data-state-block-layout")).toBe("bare");
    // No rounded plate and no surface fill — the host strip is the only surface.
    expect(block?.className).not.toContain("bg-paper-sunken");
    expect(block?.className).not.toContain("rounded-fg-xs");
    expect(getByText("Could not load timeline")).toBeTruthy();
    expect(container.querySelector(".text-state-stale")).toBeTruthy();
  });
});

describe("ghost rows never paint a settled surface", () => {
  it("a boxed skeleton row keeps the card footprint but no raised fill", () => {
    const { container } = render(
      <Skeleton label="loading activity">
        <SkeletonRow boxed />
      </Skeleton>,
    );
    const row = container.querySelector(".rounded-fg-sm");
    expect(row).toBeTruthy();
    // The outline stays (the row still stands in for a card) — the fill does not.
    expect(row?.className).toContain("border-rule");
    expect(row?.className).not.toContain("bg-paper-raised");
  });
});
