// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LogRecord } from "../logger/logger";
import { logger } from "../logger/logger";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): ReactNode {
  throw new Error("kaboom");
}

/** Capture the boundary's logs through the shared root logger. */
function captureLogs(): { records: LogRecord[]; detach: () => void } {
  const records: LogRecord[] = [];
  const sink = { write: (r: LogRecord) => records.push(r) };
  logger.addSink(sink);
  return { records, detach: () => logger.removeSink(sink) };
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React prints caught render errors to console.error; silence the noise.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders children when nothing throws", () => {
    render(
      createElement(
        ErrorBoundary,
        { region: "stage" },
        createElement("div", null, "healthy"),
      ),
    );
    expect(screen.getByText("healthy")).toBeTruthy();
  });

  it("contains a thrown render in a region fallback and logs it", () => {
    const cap = captureLogs();
    render(createElement(ErrorBoundary, { region: "stage" }, createElement(Boom)));
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("data-error-region")).toBe("stage");
    expect(screen.getByText("this panel hit an error")).toBeTruthy();
    const errorRecord = cap.records.find((r) => r.level === "error");
    expect(errorRecord?.message).toContain('region "stage"');
    expect(errorRecord?.error).toMatchObject({ message: "kaboom" });
    cap.detach();
  });

  it("renders the full-screen app fallback for the app variant", () => {
    render(
      createElement(
        ErrorBoundary,
        { region: "app", variant: "app" },
        createElement(Boom),
      ),
    );
    expect(screen.getByText("The dashboard hit an unexpected error.")).toBeTruthy();
  });

  it("uses a custom fallback when provided", () => {
    render(
      createElement(
        ErrorBoundary,
        {
          region: "stage",
          fallback: ({ error }: { error: Error }) =>
            createElement("p", null, `custom: ${error.message}`),
        },
        createElement(Boom),
      ),
    );
    expect(screen.getByText("custom: kaboom")).toBeTruthy();
  });

  it("recovers the region on retry once the child stops throwing", () => {
    let shouldThrow = true;
    function Flaky(): ReactNode {
      if (shouldThrow) throw new Error("flaky");
      return createElement("div", null, "recovered");
    }
    render(createElement(ErrorBoundary, { region: "stage" }, createElement(Flaky)));
    expect(screen.getByText("this panel hit an error")).toBeTruthy();
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(screen.getByText("recovered")).toBeTruthy();
  });

  it("does not catch errors thrown by sibling regions", () => {
    // Two independent boundaries: one throws, the other renders normally.
    render(
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
    expect(screen.getByText("this panel hit an error")).toBeTruthy();
    expect(screen.getByText("rail alive")).toBeTruthy();
  });
});
