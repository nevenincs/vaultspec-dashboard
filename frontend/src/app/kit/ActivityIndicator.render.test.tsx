// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { ActivityIndicator } from "./ActivityIndicator";

afterEach(cleanup);

function renderIndicator(rowsLoaded?: number | null) {
  const runtime = createTestLocalizationRuntime();
  const view = render(
    <I18nextProvider i18n={runtime}>
      <ActivityIndicator visible rowsLoaded={rowsLoaded} />
    </I18nextProvider>,
  );
  return { runtime, ...view };
}

describe("ActivityIndicator", () => {
  it("renders nothing while the debounced visibility contract is false", () => {
    const runtime = createTestLocalizationRuntime();
    const { container } = render(
      <I18nextProvider i18n={runtime}>
        <ActivityIndicator visible={false} rowsLoaded={2_000} />
      </I18nextProvider>,
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("pins the non-blocking viewport-top pulse appearance", () => {
    const { container } = renderIndicator();
    const indicator = container.querySelector('[data-kit="activity-indicator"]');
    const pulse = indicator?.querySelector(":scope > div");

    expect(indicator?.className).toBe("pointer-events-none fixed inset-x-0 top-0 z-50");
    expect(pulse?.getAttribute("aria-hidden")).toBe("true");
    expect(pulse?.className).toBe(
      "h-[0.125rem] w-full bg-accent motion-safe:animate-pulse-live",
    );
    expect(indicator?.getAttribute("style")).toBeNull();
  });

  it("announces one static polite status and exposes no progressbar semantics", () => {
    const { container } = renderIndicator();
    const status = screen.getByRole("status");

    expect(status.textContent).toBe("Loading data");
    expect(status.className).toBe("sr-only");
    expect(status.getAttribute("aria-live")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it("keeps indeterminate activity free of fabricated numeric progress", () => {
    const { container } = renderIndicator(null);
    const indicator = container.querySelector('[data-kit="activity-indicator"]');

    expect(indicator?.children).toHaveLength(2);
    expect(indicator?.textContent).toBe("Loading data");
    expect(indicator?.querySelector("[aria-valuenow]")).toBeNull();
    expect(indicator?.querySelector("[aria-valuemax]")).toBeNull();
  });

  it("renders honest-so-far row counts visually without adding live announcements", () => {
    const { container, rerender, runtime } = renderIndicator(1);
    const status = screen.getByRole("status");
    const indicator = container.querySelector('[data-kit="activity-indicator"]');
    const countShell = indicator?.lastElementChild;
    const count = countShell?.firstElementChild;

    expect(countShell?.getAttribute("aria-hidden")).toBe("true");
    expect(countShell?.className).toBe("flex justify-end pe-fg-2 pt-fg-1");
    expect(count?.className).toBe(
      "rounded-fg-sm border border-rule bg-paper-raised/95 px-fg-2 py-fg-0-5 text-label text-ink-muted shadow-fg-overlay",
    );
    expect(count?.textContent).toBe(
      resolveMessageResult(runtime, {
        key: "common:kit.activity.rowsLoaded",
        values: { count: 1 },
      }).message,
    );

    rerender(
      <I18nextProvider i18n={runtime}>
        <ActivityIndicator visible rowsLoaded={2_000} />
      </I18nextProvider>,
    );
    expect(screen.getByRole("status")).toBe(status);
    expect(status.textContent).toBe("Loading data");
    expect(count?.textContent).toBe(
      resolveMessageResult(runtime, {
        key: "common:kit.activity.rowsLoaded",
        values: { count: 2_000 },
      }).message,
    );
  });

  it("updates localized status and count copy without replacing their nodes", async () => {
    const { container, runtime } = renderIndicator(2);
    const status = screen.getByRole("status");
    const count = container.querySelector(
      '[data-kit="activity-indicator"] > [aria-hidden]:last-child > span',
    );

    for (const locale of [ltrTestLocale, rtlTestLocale]) {
      await act(() => runtime.changeLanguage(locale));
      expect(screen.getByRole("status")).toBe(status);
      expect(status.textContent).toBe(
        resolveMessageResult(runtime, {
          key: "common:kit.activity.loading",
        }).message,
      );
      expect(count?.textContent).toBe(
        resolveMessageResult(runtime, {
          key: "common:kit.activity.rowsLoaded",
          values: { count: 2 },
        }).message,
      );
    }
  });
});
