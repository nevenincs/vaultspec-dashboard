// @vitest-environment happy-dom

import { I18nextProvider } from "react-i18next";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import type { SearchResult } from "../../stores/server/engine";
import { deriveSearchPillView } from "../../stores/server/searchPill";
import { SearchResultPill } from "./SearchResultPill";

function result(overrides: Partial<SearchResult>): SearchResult {
  return { node_id: "doc:result", score: 0.5, source: "private-source", ...overrides };
}

describe("localized search result pill", () => {
  it.each([
    [undefined, "Open Exact user title"],
    [ltrTestLocale, "Ouvrir Exact user title"],
    [rtlTestLocale, "فتح Exact user title"],
  ] as const)(
    "gives the actual result button a localized name in %s",
    (locale, name) => {
      const runtime = createTestLocalizationRuntime(locale);
      const view = deriveSearchPillView(result({ title: "Exact user title" }), 0, null);
      render(
        <I18nextProvider i18n={runtime}>
          <button type="button" disabled={!view.selectable}>
            <SearchResultPill view={view} selected={false} />
          </button>
        </I18nextProvider>,
      );

      expect(screen.getByRole("button", { name })).toBeTruthy();
    },
  );

  it("marks an unavailable result button disabled and hides internal identity", () => {
    const runtime = createTestLocalizationRuntime();
    const view = deriveSearchPillView(
      result({ node_id: null, title: undefined, excerpt: undefined }),
      0,
      null,
    );
    render(
      <I18nextProvider i18n={runtime}>
        <button type="button" disabled={!view.selectable}>
          <SearchResultPill view={view} selected={false} />
        </button>
      </I18nextProvider>,
    );

    const button = screen.getByRole("button", { name: "Cannot open Untitled result." });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.textContent).not.toContain("private-source");
  });

  it.each([
    [undefined, "yesterday"],
    [ltrTestLocale, "hier"],
    [rtlTestLocale, "أمس"],
  ] as const)("formats relative dates with the active locale in %s", (locale, date) => {
    const runtime = createTestLocalizationRuntime(locale);
    const view = deriveSearchPillView(
      result({
        node_id: "commit:private-id",
        title: "Exact change title",
        date: new Date(Date.now() - 86_400_000).toISOString(),
      }),
      0,
      null,
    );
    render(
      <I18nextProvider i18n={runtime}>
        <button type="button">
          <SearchResultPill view={view} selected={false} />
        </button>
      </I18nextProvider>,
    );

    expect(screen.getByText(date)).toBeTruthy();
  });
});
