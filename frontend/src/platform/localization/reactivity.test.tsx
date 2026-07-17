// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import { sourceLocale } from "../../locales/en";
import { bindDocumentLanguage, applyDocumentLanguage } from "./documentLanguage";
import {
  LocalizationProvider,
  useLocalizedMessage,
  useLocalizedMessageResolver,
} from "./LocalizationProvider";
import { localization } from "./runtime";

function LocalizedRetry(): React.JSX.Element {
  return <p>{useLocalizedMessage({ key: "common:actions.retry" })}</p>;
}

function BulkLocalizedRetry(): React.JSX.Element {
  const resolve = useLocalizedMessageResolver();
  const result = resolve({ key: "common:actions.retry" });
  return <p data-used-fallback={String(result.usedFallback)}>{result.message}</p>;
}

afterEach(() => {
  cleanup();
  document.documentElement.lang = "";
  document.documentElement.dir = "";
});

describe.sequential("React localization and document language", () => {
  it("renders source copy on the provider's first render", () => {
    render(
      <LocalizationProvider>
        <LocalizedRetry />
      </LocalizationProvider>,
    );

    expect(screen.getByText("Retry")).toBeTruthy();
    expect(localization.language).toBe(sourceLocale);
    expect(localization.hasResourceBundle(ltrTestLocale, "common")).toBe(false);
  });

  it("reacts through the production hook to real locale changes", async () => {
    const runtime = createTestLocalizationRuntime();

    render(
      <I18nextProvider i18n={runtime}>
        <LocalizedRetry />
      </I18nextProvider>,
    );
    expect(screen.getByText("Retry")).toBeTruthy();

    await act(async () => {
      await runtime.changeLanguage(ltrTestLocale);
    });
    expect(screen.getByText(ltrTestResources.common.actions.retry)).toBeTruthy();

    await act(async () => {
      await runtime.changeLanguage(rtlTestLocale);
    });
    expect(screen.getByText(rtlTestResources.common.actions.retry)).toBeTruthy();

    expect(localization.language).toBe(sourceLocale);
    expect(localization.hasResourceBundle(ltrTestLocale, "common")).toBe(false);
  });

  it("reacts through the bulk descriptor resolver to real locale changes", async () => {
    const runtime = createTestLocalizationRuntime();

    render(
      <I18nextProvider i18n={runtime}>
        <BulkLocalizedRetry />
      </I18nextProvider>,
    );
    expect(screen.getByText("Retry").dataset.usedFallback).toBe("false");

    await act(async () => {
      await runtime.changeLanguage(ltrTestLocale);
    });
    expect(
      screen.getByText(ltrTestResources.common.actions.retry).dataset.usedFallback,
    ).toBe("false");

    await act(async () => {
      await runtime.changeLanguage(rtlTestLocale);
    });
    expect(
      screen.getByText(rtlTestResources.common.actions.retry).dataset.usedFallback,
    ).toBe("false");
  });

  it("applies language and direction and follows locale changes", async () => {
    const runtime = createTestLocalizationRuntime();
    const root = document.documentElement;

    expect(applyDocumentLanguage(runtime, root)).toBe(true);
    expect(root.lang).toBe(sourceLocale);
    expect(root.dir).toBe("ltr");

    const unbind = bindDocumentLanguage(runtime, root);
    await runtime.changeLanguage(rtlTestLocale);
    expect(root.lang).toBe(rtlTestLocale);
    expect(root.dir).toBe("rtl");

    await runtime.changeLanguage(ltrTestLocale);
    expect(root.lang).toBe(ltrTestLocale);
    expect(root.dir).toBe("ltr");
    unbind();
  });

  it("keeps one listener until the final binding releases its reference", async () => {
    const runtime = createTestLocalizationRuntime();
    const root = document.documentElement;
    const unbindFirst = bindDocumentLanguage(runtime, root);
    const unbindSecond = bindDocumentLanguage(runtime, root);

    unbindFirst();
    await runtime.changeLanguage(rtlTestLocale);
    expect(root.lang).toBe(rtlTestLocale);
    expect(root.dir).toBe("rtl");

    unbindSecond();
    root.lang = "released";
    root.dir = "ltr";
    await runtime.changeLanguage(sourceLocale);
    expect(root.lang).toBe("released");
    expect(root.dir).toBe("ltr");
  });

  it("uses real right-to-left test resources without unresolved copy", async () => {
    const runtime = createTestLocalizationRuntime(rtlTestLocale);
    const message = runtime.t("common:finalWave.history.openCommit", {
      commit: "السجل",
    });

    expect(message).toBe("فتح السجل");
    expect(message).not.toContain("{{");
    expect(message).not.toContain("common:");
    expect(message).not.toContain("\u2014");
    expect(rtlTestResources.errors.fallback.contentUnavailable).not.toContain("\u2014");
  });
});
