// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary";
import { CrashInjector, CrashZone, useCrashStore } from "./CrashInjector";

describe("useCrashStore", () => {
  beforeEach(() => useCrashStore.getState().disarmAll());

  it("arms, disarms, and clears regions", () => {
    const store = useCrashStore.getState();
    store.arm("stage");
    expect(useCrashStore.getState().armed.stage).toBe(true);
    store.disarm("stage");
    expect(useCrashStore.getState().armed.stage).toBe(false);
    store.arm("left-rail");
    store.arm("timeline");
    useCrashStore.getState().disarmAll();
    expect(useCrashStore.getState().armed).toEqual({});
  });
});

describe("CrashZone", () => {
  beforeEach(() => {
    useCrashStore.getState().disarmAll();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders nothing when its region is not armed", () => {
    const { container } = render(
      createElement(
        ErrorBoundary,
        { region: "stage" },
        createElement(CrashZone, { region: "stage" }),
        createElement("div", null, "stage content"),
      ),
    );
    expect(screen.getByText("stage content")).toBeTruthy();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("throws into the surrounding boundary when armed", () => {
    useCrashStore.getState().arm("stage");
    render(
      createElement(
        ErrorBoundary,
        { region: "stage" },
        createElement(CrashZone, { region: "stage" }),
        createElement("div", null, "stage content"),
      ),
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("this panel hit an error")).toBeTruthy();
  });
});

describe("CrashInjector", () => {
  afterEach(() => cleanup());

  it("renders an arm button per region in development", () => {
    render(createElement(CrashInjector));
    for (const region of ["left-rail", "stage", "right-rail", "timeline"]) {
      expect(screen.getByRole("button", { name: region })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "clear" })).toBeTruthy();
  });

  it("arms a region's store flag when its button is clicked", () => {
    useCrashStore.getState().disarmAll();
    render(createElement(CrashInjector));
    fireEvent.click(screen.getByRole("button", { name: "stage" }));
    expect(useCrashStore.getState().armed.stage).toBe(true);
  });

  it("renders nothing in a production build (dev-gated)", () => {
    vi.stubEnv("DEV", false);
    const { container } = render(createElement(CrashInjector));
    expect(container.querySelector("[data-crash-injector]")).toBeNull();
    vi.unstubAllEnvs();
  });
});
