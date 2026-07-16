// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import { formatNumber } from "../../platform/localization/formatters";
import {
  FILTER_MESSAGES,
  authoredFilterLabel,
} from "../../stores/view/filterPresentation";
import { FilterMenu, type FilterMenuSection } from "./FilterMenu";

afterEach(cleanup);

function FilterHarness({ loading = false }: { loading?: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const sections: FilterMenuSection[] = [
    {
      type: "checkbox",
      key: "feature",
      label: FILTER_MESSAGES.sections.feature,
      options: loading
        ? []
        : [
            {
              value: "feature/مؤلف",
              label: authoredFilterLabel("feature/مؤلف"),
              count: 1234,
            },
          ],
      selected,
      onToggle: (value) =>
        setSelected((current) =>
          current.includes(value)
            ? current.filter((item) => item !== value)
            : [...current, value],
        ),
      loading,
    },
  ];
  return <FilterMenu sections={sections} />;
}

function setup(loading = false) {
  const runtime = createTestLocalizationRuntime();
  const view = render(
    <I18nextProvider i18n={runtime}>
      <FilterHarness loading={loading} />
    </I18nextProvider>,
  );
  return { runtime, ...view };
}

describe("FilterMenu localization", () => {
  it("renders a loading section as localized text-free skeleton chrome", () => {
    const { container } = setup(true);
    const skeleton = container.querySelector("[data-skeleton]");
    expect(skeleton?.getAttribute("role")).toBe("status");
    expect(skeleton?.getAttribute("aria-busy")).toBe("true");
    expect(skeleton?.querySelector(".sr-only")?.textContent).toBe(
      "Loading filter choices…",
    );
  });

  it("keeps authored tags byte-exact and updates the same localized nodes", async () => {
    const { runtime } = setup();
    const title = screen.getByText("Filter documents");
    const section = screen.getByText("Feature");
    const authored = screen.getByText("feature/مؤلف");
    const count = screen.getByText(formatNumber("en", 1234) ?? "");

    await act(() => runtime.changeLanguage(ltrTestLocale));
    expect(title.textContent).toBe(ltrTestResources.graph.filters.title);
    expect(section.textContent).toBe(ltrTestResources.graph.filters.sections.feature);
    expect(authored.textContent).toBe("feature/مؤلف");
    expect(count.textContent).toBe(formatNumber(ltrTestLocale, 1234));

    await act(() => runtime.changeLanguage(rtlTestLocale));
    expect(title.textContent).toBe(rtlTestResources.graph.filters.title);
    expect(section.textContent).toBe(rtlTestResources.graph.filters.sections.feature);
    expect(authored.textContent).toBe("feature/مؤلف");
    expect(count.textContent).toBe(formatNumber(rtlTestLocale, 1234));
  });
});
