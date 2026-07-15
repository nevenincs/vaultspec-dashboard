// @vitest-environment happy-dom
//
// GS-006 chip-trail honesty: a working-set chip whose node is FILTERED OUT of the
// visible set (the same visibleNodeIds truth GS-004 uses on the canvas) renders DIMMED
// with a "hidden by filter" affordance, so the trail never implies a filter-hidden node
// is on stage at full strength. Presentation-only — the working-set membership itself is
// unchanged. Rendered directly (the trail is pure view-store + component; no wire).

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { I18nextProvider } from "react-i18next";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { clearWorkingSet, expandWorkingSet } from "../../stores/view/workingSet";
import { WorkingSet } from "./WorkingSet";

function renderWorkingSet(
  props: Parameters<typeof WorkingSet>[0] = {},
  locale?: typeof ltrTestLocale | typeof rtlTestLocale,
) {
  const runtime = createTestLocalizationRuntime(locale);
  return render(
    <I18nextProvider i18n={runtime}>
      <WorkingSet {...props} />
    </I18nextProvider>,
  );
}

describe("WorkingSet chip-trail filter-hidden dimming (GS-006)", () => {
  beforeEach(() => {
    clearWorkingSet();
  });
  afterEach(() => {
    cleanup();
    clearWorkingSet();
  });

  it("dims the chip of a filtered-out node and leaves a visible node's chip untouched", () => {
    expandWorkingSet("doc:alpha");
    expandWorkingSet("doc:beta");

    // Only doc:alpha is in the visible set → doc:beta's chip is filter-hidden.
    const { container } = renderWorkingSet({
      visibleNodeIds: new Set(["doc:alpha"]),
    });

    // Exactly one chip is marked hidden, dimmed, and carries the affordance.
    const hidden = container.querySelectorAll("[data-working-set-hidden]");
    expect(hidden).toHaveLength(1);
    const hiddenChip = hidden[0] as HTMLElement;
    expect(hiddenChip.className).toContain("opacity-50");
    expect(hiddenChip.getAttribute("title")).toBe("Hidden by the active filter");
    expect(hiddenChip.getAttribute("aria-label")).toBe(
      "beta is hidden by the active filter.",
    );

    // The visible node's chip (its collapse button labels it) is NOT dimmed.
    const visibleCollapse = container.querySelector(
      '[aria-label="Remove alpha from working set"]',
    )!;
    const visibleChip = visibleCollapse.parentElement as HTMLElement;
    expect(visibleChip.hasAttribute("data-working-set-hidden")).toBe(false);
    expect(visibleChip.className).not.toContain("opacity-50");
  });

  it("dims no chip when no visibility membership is supplied", () => {
    expandWorkingSet("doc:alpha");
    expandWorkingSet("doc:beta");

    const { container } = renderWorkingSet();
    expect(container.querySelectorAll("[data-working-set-hidden]")).toHaveLength(0);
    expect(container.innerHTML).not.toContain("opacity-50");
  });

  it("resolves complete working-set copy in English, French, and Arabic", () => {
    const cases = [
      [
        undefined,
        "Working set",
        "Clear working set",
        "Hidden by the active filter",
        "beta is hidden by the active filter.",
        "2",
        "2 items in working set",
      ],
      [
        ltrTestLocale,
        "Ensemble de travail",
        "Effacer l’ensemble de travail",
        "Masqué par le filtre actif",
        "beta est masqué par le filtre actif.",
        "2",
        "2 éléments dans l’ensemble de travail",
      ],
      [
        rtlTestLocale,
        "مجموعة العمل",
        "مسح مجموعة العمل",
        "مخفي بواسطة عامل التصفية النشط",
        "beta مخفي بواسطة عامل التصفية النشط.",
        "2",
        "2 من العناصر في مجموعة العمل",
      ],
    ] as const;

    for (const [
      locale,
      navLabel,
      clearLabel,
      hiddenHint,
      hiddenLabel,
      countText,
      countLabel,
    ] of cases) {
      clearWorkingSet();
      expandWorkingSet("doc:alpha");
      expandWorkingSet("doc:beta");
      const { container, unmount } = renderWorkingSet(
        { visibleNodeIds: new Set(["doc:alpha"]) },
        locale,
      );

      expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe(navLabel);
      expect(container.querySelector("nav > button:last-child")?.textContent).toBe(
        clearLabel,
      );
      const count = container.querySelector("[data-tabular]");
      expect(count?.textContent).toBe(countText);
      expect(count?.getAttribute("aria-label")).toBe(countLabel);
      const hidden = container.querySelector("[data-working-set-hidden]");
      expect(hidden?.getAttribute("title")).toBe(hiddenHint);
      expect(hidden?.getAttribute("aria-label")).toBe(hiddenLabel);
      expect(hidden?.getAttribute("aria-label")).not.toContain("—");
      unmount();
    }
  });

  it("never renders or interpolates unsupported stable ids", () => {
    expandWorkingSet("commit:0123456789abcdef");
    expandWorkingSet("internal:private-id");
    const { container } = renderWorkingSet({ visibleNodeIds: new Set<string>() });

    expect(container.textContent).toContain("Item");
    expect(
      container.querySelectorAll('[aria-label="Remove item from working set"]'),
    ).toHaveLength(2);
    expect(
      container.querySelectorAll('[aria-label="Item is hidden by the active filter."]'),
    ).toHaveLength(2);
    expect(container.innerHTML).not.toContain("0123456789abcdef");
    expect(container.innerHTML).not.toContain("internal:");
    expect(container.innerHTML).not.toContain("private-id");
  });
});
