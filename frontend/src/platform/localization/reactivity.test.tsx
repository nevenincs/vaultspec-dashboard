// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react";
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
import { LocalizationProvider, useLocalizedMessage } from "./LocalizationProvider";
import { localization } from "./runtime";

const languageUtility = localization.services
  .languageUtils as typeof localization.services.languageUtils & {
  supportedLngs: false | readonly string[];
};
const productionSupportedLanguages = localization.options.supportedLngs;
const productionLanguageUtilitySupportedLanguages = languageUtility.supportedLngs;

function LocalizedRetry(): React.JSX.Element {
  return <p>{useLocalizedMessage({ key: "common:actions.retry" })}</p>;
}

async function restoreProductionRuntime(): Promise<void> {
  await localization.changeLanguage(sourceLocale);
  localization.removeResourceBundle(ltrTestLocale, "common");
  localization.removeResourceBundle(ltrTestLocale, "errors");
  localization.options.supportedLngs = productionSupportedLanguages;
  languageUtility.supportedLngs = productionLanguageUtilitySupportedLanguages;
}

afterEach(async () => {
  cleanup();
  await restoreProductionRuntime();
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
  });

  it("reacts to a real languageChanged event on the application runtime", async () => {
    localization.options.supportedLngs = [sourceLocale, ltrTestLocale];
    languageUtility.supportedLngs = [sourceLocale, ltrTestLocale];
    localization.addResourceBundle(
      ltrTestLocale,
      "common",
      structuredClone(ltrTestResources.common),
      true,
      true,
    );
    localization.addResourceBundle(
      ltrTestLocale,
      "errors",
      structuredClone(ltrTestResources.errors),
      true,
      true,
    );

    render(
      <LocalizationProvider>
        <LocalizedRetry />
      </LocalizationProvider>,
    );

    await act(async () => {
      await localization.changeLanguage(ltrTestLocale);
    });

    expect(screen.getByText(ltrTestResources.common.actions.retry)).toBeTruthy();
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
    const message = runtime.t("errors:unexpectedSection.message", {
      section: "السجل",
    });

    expect(message).toBe("حاول فتح السجل مرة أخرى.");
    expect(message).not.toContain("{{");
    expect(message).not.toContain("errors:");
    expect(message).not.toContain("\u2014");
    expect(rtlTestResources.errors.fallback.contentUnavailable).not.toContain("\u2014");
  });
});
