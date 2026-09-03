// @vitest-environment happy-dom
//
// The log tail's render guard (advanced-service-console ADR D4). It pins the two
// honesty rules the tail carries: an UNPARSED level is left untoned rather than
// dressed up as a severity, and the four render modes stay distinct — degraded
// (read from the tiers block, never from a transport error), loading, empty, and
// the populated window.

import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { en } from "../../locales/en";
import { createTestLocalizationRuntime } from "../../localization/testing";
import type { RagLogsHookView } from "../../stores/server/ragControl";
import { IndexLogTailBody } from "./IndexLogTail";

const LOG = en.operations.searchMaintenance.log;

afterEach(cleanup);

const BASE: RagLogsHookView = {
  lines: [],
  total: 0,
  jobFilter: null,
  semanticOffline: false,
  pending: false,
};

function renderTail(view: Partial<RagLogsHookView>, scopedToSelection = false) {
  const runtime = createTestLocalizationRuntime();
  render(
    <I18nextProvider i18n={runtime}>
      <IndexLogTailBody
        view={{ ...BASE, ...view }}
        scopedToSelection={scopedToSelection}
      />
    </I18nextProvider>,
  );
}

function lineTones(): string[] {
  return Array.from(document.querySelectorAll("[data-index-log-line]")).map(
    (el) => el.getAttribute("data-index-log-line") ?? "",
  );
}

describe("IndexLogTailBody", () => {
  it("renders the served window as a log region", () => {
    renderTail({
      lines: [
        { text: "2026-08-01 10:00:00,000 INFO started", level: "info" },
        { text: "2026-08-01 10:00:01,000 ERROR failed", level: "error" },
      ],
      total: 2,
    });
    expect(screen.getByRole("log")).toBeTruthy();
    expect(lineTones()).toEqual(["info", "error"]);
  });

  it("leaves an unparsed line untoned rather than inventing a severity", () => {
    renderTail({ lines: [{ text: "a line with no recognizable level" }], total: 1 });
    expect(lineTones()).toEqual([""]);
    const line = document.querySelector("[data-index-log-line]");
    // The neutral ink, not any of the level tones.
    expect(line?.className).toContain("text-ink-muted");
    expect(line?.className).not.toContain("text-state-broken");
    expect(line?.className).not.toContain("text-state-stale");
  });

  it("tones each recognized level with its bound token", () => {
    renderTail({
      lines: [
        { text: "d", level: "debug" },
        { text: "i", level: "info" },
        { text: "w", level: "warning" },
        { text: "e", level: "error" },
        { text: "c", level: "critical" },
      ],
      total: 5,
    });
    const classes = Array.from(document.querySelectorAll("[data-index-log-line]")).map(
      (el) => el.className,
    );
    expect(classes[0]).toContain("text-ink-faint");
    expect(classes[1]).toContain("text-ink-muted");
    expect(classes[2]).toContain("text-state-stale");
    expect(classes[3]).toContain("text-state-broken");
    expect(classes[4]).toContain("text-state-broken");
  });

  it("states that the window is narrowed to the selected update", () => {
    renderTail({ lines: [{ text: "line" }], total: 1 }, true);
    expect(screen.getByText(LOG.scopedToSelection)).toBeTruthy();
  });

  it("says nothing about narrowing when the tail is unscoped", () => {
    renderTail({ lines: [{ text: "line" }], total: 1 });
    expect(screen.queryByText(LOG.scopedToSelection)).toBeNull();
  });

  it("renders the degraded state from the tiers-derived flag, not a log region", () => {
    renderTail({ semanticOffline: true, lines: [{ text: "stale" }], total: 1 });
    expect(screen.queryByRole("log")).toBeNull();
    expect(screen.getByText(LOG.unavailable)).toBeTruthy();
  });

  it("renders the empty state when the window came back with no lines", () => {
    renderTail({});
    expect(screen.queryByRole("log")).toBeNull();
    expect(screen.getByText(LOG.empty)).toBeTruthy();
  });

  it("renders a shimmer while the first window is in flight", () => {
    renderTail({ pending: true });
    expect(screen.queryByRole("log")).toBeNull();
    expect(screen.getByText(LOG.loading)).toBeTruthy();
  });
});
