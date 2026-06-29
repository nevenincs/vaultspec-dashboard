// @vitest-environment happy-dom
//
// FilterMenu loading-state render test: a checkbox section whose vocabulary is still
// loading must render the text-free kit Skeleton (state-mode-uniformity ADR D2) — a
// busy region with the human label ONLY in `sr-only`, never an on-screen "loading…"
// string. The empty (not-loading) case stays a plain sentence. Core vitest matchers
// only (no jest-dom), the project convention.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FilterMenu, type FilterMenuSection } from "./FilterMenu";

afterEach(cleanup);

function checkboxSection(over: Partial<FilterMenuSection> = {}): FilterMenuSection {
  return {
    type: "checkbox",
    key: "kind",
    label: "Type",
    options: [],
    selected: [],
    onToggle: () => {},
    ...over,
  } as FilterMenuSection;
}

/** Visible (non sr-only) leaf text of a container. */
function visibleText(container: HTMLElement): string {
  return Array.from(container.querySelectorAll("*"))
    .filter((el) => el.children.length === 0 && !el.closest(".sr-only"))
    .map((el) => el.textContent ?? "")
    .join(" ");
}

describe("FilterMenu loading state", () => {
  it("renders a loading section as a text-free skeleton, not 'loading…' text", () => {
    const { container } = render(
      <FilterMenu sections={[checkboxSection({ loading: true, options: [] })]} />,
    );
    const skeleton = container.querySelector("[data-skeleton]");
    expect(skeleton).toBeTruthy();
    expect(skeleton!.getAttribute("role")).toBe("status");
    expect(skeleton!.getAttribute("aria-busy")).toBe("true");
    expect(skeleton!.querySelector(".sr-only")?.textContent).toMatch(/Loading filter/);
    // No visible "loading…" text — the label lives only in the sr-only span.
    expect(visibleText(container)).not.toMatch(/loading/i);
  });

  it("renders the empty (not-loading) section as a plain sentence, no skeleton", () => {
    const { container } = render(
      <FilterMenu
        sections={[
          checkboxSection({
            loading: false,
            options: [],
            emptyLabel: "none in corpus",
          }),
        ]}
      />,
    );
    expect(container.querySelector("[data-skeleton]")).toBeNull();
    expect(visibleText(container)).toMatch(/none in corpus/);
  });
});
