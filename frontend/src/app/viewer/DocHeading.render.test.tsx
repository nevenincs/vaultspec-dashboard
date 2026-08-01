// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { DocHeading, type DocHeadingView } from "./DocHeading";

afterEach(cleanup);

function renderHeading(overrides: Partial<DocHeadingView> = {}) {
  const runtime = createTestLocalizationRuntime();
  const heading: DocHeadingView = {
    title: "centralize state plan",
    docType: "plan",
    typeLabel: "Plan",
    category: "plan",
    featureTags: ["centralize-state"],
    path: ".vault/plan/2026-06-18-centralize-state-plan.md",
    ...overrides,
  };
  return render(
    <I18nextProvider i18n={runtime}>
      <DocHeading heading={heading} />
    </I18nextProvider>,
  );
}

describe("DocHeading", () => {
  it("states the title once, with the type and feature pills beside it", () => {
    renderHeading();
    const title = screen.getByRole("heading", { name: "centralize state plan" });
    expect(title).toBeTruthy();
    // The tab already carries the title; the chrome no longer repeats a
    // Vault / <type> / <title> trail alongside it.
    expect(document.querySelector("nav")).toBeNull();

    const pills = Array.from(document.querySelectorAll('[data-kit="chip"]'));
    expect(pills.map((pill) => pill.textContent)).toEqual([
      "Plan",
      "#centralize-state",
    ]);
    expect(pills[0]?.getAttribute("data-category")).toBe("plan");
    expect(pills[1]?.getAttribute("data-category")).toBe("feature");
  });

  it("puts the repo-relative path on its own smaller second line", () => {
    renderHeading();
    const path = document.querySelector("[data-doc-heading-path]");
    expect(path?.textContent).toBe(".vault/plan/2026-06-18-centralize-state-plan.md");
    expect(path?.className).toContain("text-meta");
  });

  it("omits the type pill and the path rather than inventing either", () => {
    renderHeading({ typeLabel: null, category: null, path: null, featureTags: [] });
    expect(document.querySelectorAll('[data-kit="chip"]').length).toBe(0);
    expect(document.querySelector("[data-doc-heading-path]")).toBeNull();
    expect(screen.getByRole("heading", { name: "centralize state plan" })).toBeTruthy();
  });

  it("renders every feature tag the node carries", () => {
    renderHeading({ featureTags: ["alpha", "beta"] });
    const pills = Array.from(document.querySelectorAll('[data-kit="chip"]'));
    expect(pills.map((pill) => pill.textContent)).toEqual(["Plan", "#alpha", "#beta"]);
  });
});
