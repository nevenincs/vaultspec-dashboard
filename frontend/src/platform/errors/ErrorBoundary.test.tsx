// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import type { LogRecord } from "../logger/logger";
import { logger } from "../logger/logger";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import {
  DefaultFallback,
  ErrorBoundary,
  type FallbackRenderProps,
} from "./ErrorBoundary";

function Boom(): ReactNode {
  throw Object.assign(new Error("EngineError: failed at /private/path"), {
    actionId: "internal:private-action",
  });
}

function renderLocalized(node: ReactNode) {
  const runtime = createTestLocalizationRuntime();
  return {
    runtime,
    ...render(<I18nextProvider i18n={runtime}>{node}</I18nextProvider>),
  };
}

/** Capture the boundary's real structured records through the shared root logger. */
function captureLogs(): { records: LogRecord[]; detach: () => void } {
  const records: LogRecord[] = [];
  const sink = { write: (record: LogRecord) => records.push(record) };
  logger.addSink(sink);
  return { records, detach: () => logger.removeSink(sink) };
}

describe("ErrorBoundary", () => {
  afterEach(cleanup);

  it("renders children when nothing throws", () => {
    renderLocalized(
      createElement(
        ErrorBoundary,
        { region: "stage" },
        createElement("div", null, "healthy"),
      ),
    );

    expect(screen.getByText("healthy")).toBeTruthy();
  });

  it("contains a thrown render in a localized region and preserves structured diagnostics", async () => {
    const cap = captureLogs();
    try {
      const { runtime } = renderLocalized(
        createElement(ErrorBoundary, { region: "stage" }, createElement(Boom)),
      );
      const alert = screen.getByRole("alert");
      const title = screen.getByText(runtime.t("errors:unexpectedSection.title"));
      const message = screen.getByText(runtime.t("errors:unexpectedSection.message"));
      const action = screen.getByRole("button", {
        name: runtime.t("common:actions.retry"),
      });

      await act(async () => runtime.changeLanguage(ltrTestLocale));
      expect(screen.getByText(ltrTestResources.errors.unexpectedSection.title)).toBe(
        title,
      );
      expect(screen.getByText(ltrTestResources.errors.unexpectedSection.message)).toBe(
        message,
      );
      expect(
        screen.getByRole("button", {
          name: ltrTestResources.common.actions.retry,
        }),
      ).toBe(action);

      await act(async () => runtime.changeLanguage(rtlTestLocale));
      expect(screen.getByText(rtlTestResources.errors.unexpectedSection.title)).toBe(
        title,
      );
      expect(screen.getByText(rtlTestResources.errors.unexpectedSection.message)).toBe(
        message,
      );
      expect(
        screen.getByRole("button", {
          name: rtlTestResources.common.actions.retry,
        }),
      ).toBe(action);
      expect(screen.getByRole("alert")).toBe(alert);

      const errorRecord = cap.records.find((record) => record.level === "error");
      const stackRecord = cap.records.find(
        (record) => record.message === "component stack",
      );
      expect(errorRecord?.message).toContain('region "stage"');
      expect(errorRecord?.error).toMatchObject({
        message: "EngineError: failed at /private/path",
      });
      expect(stackRecord?.fields?.region).toBe("stage");
      expect(stackRecord?.fields?.componentStack).toEqual(expect.any(String));
    } finally {
      cap.detach();
    }
  });

  it("renders a truthful localized full-page recovery action", async () => {
    const { runtime } = renderLocalized(
      createElement(
        ErrorBoundary,
        { region: "app", variant: "app" },
        createElement(Boom),
      ),
    );

    const alert = screen.getByRole("alert");
    const title = screen.getByText(runtime.t("errors:unexpectedApplication.title"));
    const message = screen.getByText(runtime.t("errors:unexpectedApplication.message"));
    const action = screen.getByRole("button", {
      name: runtime.t("common:actions.reloadPage"),
    });

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(screen.getByText(ltrTestResources.errors.unexpectedApplication.title)).toBe(
      title,
    );
    expect(
      screen.getByText(ltrTestResources.errors.unexpectedApplication.message),
    ).toBe(message);
    expect(
      screen.getByRole("button", {
        name: ltrTestResources.common.actions.reloadPage,
      }),
    ).toBe(action);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(screen.getByText(rtlTestResources.errors.unexpectedApplication.title)).toBe(
      title,
    );
    expect(
      screen.getByText(rtlTestResources.errors.unexpectedApplication.message),
    ).toBe(message);
    expect(
      screen.getByRole("button", {
        name: rtlTestResources.common.actions.reloadPage,
      }),
    ).toBe(action);
    expect(screen.getByRole("alert")).toBe(alert);
  });

  it("never exposes raw diagnostics or metadata from the default fallback", () => {
    const error = Object.assign(new Error("EngineError: failed at /private/path"), {
      actionId: "internal:private-action",
    });
    error.stack = "Error: private stack\n at Secret (/private/source.tsx:1:2)";
    const props: FallbackRenderProps = {
      error,
      region: "private-region-receipt-123",
      variant: "region",
      reset: () => undefined,
    };

    renderLocalized(createElement(DefaultFallback, props));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).not.toMatch(
      /EngineError|private\/path|private stack|Secret|private-action|private-region|receipt-123/,
    );
    expect(screen.getByRole("button").textContent).not.toMatch(
      /private-action|private-region|receipt-123/,
    );
  });

  it("preserves the explicit custom fallback contract", () => {
    renderLocalized(
      createElement(
        ErrorBoundary,
        {
          region: "stage",
          fallback: ({ error }: FallbackRenderProps) =>
            createElement("p", null, `custom: ${error.message}`),
        },
        createElement(Boom),
      ),
    );

    expect(
      screen.getByText("custom: EngineError: failed at /private/path"),
    ).toBeTruthy();
  });

  it("recovers only the failed region when retry is chosen", () => {
    let shouldThrow = true;
    function Flaky(): ReactNode {
      if (shouldThrow) throw new Error("flaky");
      return createElement("div", null, "recovered");
    }
    const { runtime } = renderLocalized(
      createElement(ErrorBoundary, { region: "stage" }, createElement(Flaky)),
    );

    shouldThrow = false;
    fireEvent.click(
      screen.getByRole("button", { name: runtime.t("common:actions.retry") }),
    );

    expect(screen.getByText("recovered")).toBeTruthy();
  });

  it("keeps sibling regions available after one region fails", () => {
    const { runtime } = renderLocalized(
      createElement(
        "div",
        null,
        createElement(ErrorBoundary, { region: "stage" }, createElement(Boom)),
        createElement(
          ErrorBoundary,
          { region: "right-rail" },
          createElement("div", null, "rail alive"),
        ),
      ),
    );

    expect(screen.getByText(runtime.t("errors:unexpectedSection.title"))).toBeTruthy();
    expect(screen.getByText("rail alive")).toBeTruthy();
  });
});
