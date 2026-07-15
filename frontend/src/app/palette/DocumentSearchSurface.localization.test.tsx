// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import { engineClient } from "../../stores/server/engine";
import { testQueryClient } from "../../stores/server/queries/testFixtures";
import { useCommandPaletteStore } from "../../stores/view/commandPalette";
import { useViewStore } from "../../stores/view/viewStore";
import { liveScope, liveTransport } from "../../testing/liveClient";
import { ENGINE_WAIT } from "../../testing/timing";
import { DocumentSearchSurface } from "./DocumentSearchSurface";

// Search result titles, tags, and explanations are authored data. The type word is
// interface chrome, so it is deliberately excluded from the data-invariance check.
function authoredResultData(
  options: readonly HTMLElement[],
): Array<Array<string | null>> {
  return options.map((option) =>
    Array.from(option.querySelectorAll<HTMLElement>(".select-text")).map(
      (field) => field.textContent,
    ),
  );
}

describe("DocumentSearchSurface localization", () => {
  const client = testQueryClient();
  let scope: string;

  beforeAll(async () => {
    scope = await liveScope();
  });

  beforeEach(() => {
    engineClient.useTransport(liveTransport);
    useCommandPaletteStore.getState().reset();
    useViewStore.getState().setScope(scope);
  });

  afterEach(async () => {
    cleanup();
    await waitFor(() => expect(client.isFetching()).toBe(0), ENGINE_WAIT);
    client.clear();
    useCommandPaletteStore.getState().reset();
    useViewStore.getState().setScope(null);
  });

  function renderSurface() {
    const runtime = createTestLocalizationRuntime();
    const view = render(
      <I18nextProvider i18n={runtime}>
        <QueryClientProvider client={client}>
          <DocumentSearchSurface />
        </QueryClientProvider>
      </I18nextProvider>,
    );
    return { runtime, view };
  }

  it("switches locale in place and preserves the authored query", async () => {
    const { runtime } = renderSurface();
    const dialog = screen.getByRole("dialog", { name: "Find a document" });
    const input = screen.getByRole("combobox") as HTMLInputElement;

    expect(screen.getByText("Search for a document by name.")).toBeTruthy();
    fireEvent.change(input, { target: { value: "No matching / مستند" } });
    expect(
      await screen.findByText(
        "No documents match “No matching / مستند”.",
        undefined,
        ENGINE_WAIT,
      ),
    ).toBeTruthy();

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("dialog", {
        name: ltrTestResources.documents.documentSearch.accessibility.dialog,
      }),
    ).toBe(dialog);
    expect(screen.getByRole("combobox")).toBe(input);
    expect(input.value).toBe("No matching / مستند");
    expect(
      screen.getByText("Aucun document ne correspond à « No matching / مستند »."),
    ).toBeTruthy();

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("dialog", {
        name: rtlTestResources.documents.documentSearch.accessibility.dialog,
      }),
    ).toBe(dialog);
    expect(screen.getByRole("combobox")).toBe(input);
    expect(input.value).toBe("No matching / مستند");
    expect(screen.getByText("لا يوجد مستند يطابق «No matching / مستند».")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(
      /documents:documentSearch|structural tier|provider|—/u,
    );
  });

  it("localizes the live result count without changing result data", async () => {
    const { runtime } = renderSurface();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "alpha" } });

    const listbox = await screen.findByRole("listbox", undefined, ENGINE_WAIT);
    const options = screen.getAllByRole("option");
    const resultData = authoredResultData(options);
    const count = options.length;
    expect(count).toBeGreaterThan(1);
    expect(resultData.every((fields) => fields.length > 0)).toBe(true);
    expect(
      screen.getByText(
        runtime.t("documents:documentSearch.counts.documents", { count }),
      ),
    ).toBeTruthy();

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(screen.getByRole("listbox")).toBe(listbox);
    expect(screen.getAllByRole("option")).toEqual(options);
    expect(authoredResultData(options)).toEqual(resultData);
    expect(
      screen.getByText(
        runtime.t("documents:documentSearch.counts.documents", { count }),
      ),
    ).toBeTruthy();

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(screen.getByRole("listbox")).toBe(listbox);
    expect(screen.getAllByRole("option")).toEqual(options);
    expect(authoredResultData(options)).toEqual(resultData);
    expect(
      screen.getByText(
        runtime.t("documents:documentSearch.counts.documents", { count }),
      ),
    ).toBeTruthy();
  });
});
