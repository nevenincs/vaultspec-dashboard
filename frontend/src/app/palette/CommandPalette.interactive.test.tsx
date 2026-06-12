// @vitest-environment happy-dom
//
// Interactive palette tests (finding 032): the palette duplicates the
// arm-to-confirm and time-travel-gate semantics; these tests cover the
// palette's own copy, mirroring the OpsPanel 026 suite.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { MockEngine } from "../../testing/mockEngine";
import { useViewStore } from "../../stores/view/viewStore";
import { CommandPalette } from "./CommandPalette";

function mountPalette() {
  const mock = new MockEngine();
  const opsCalls: string[] = [];
  engineClient.useTransport((input, init) => {
    if (String(input).includes("/ops/")) opsCalls.push(String(input));
    return mock.fetchImpl(input, init);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(createElement(QueryClientProvider, { client }, createElement(CommandPalette)));
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  return { opsCalls };
}

describe("CommandPalette safety semantics (032)", () => {
  beforeEach(() => {
    useViewStore.getState().setTimelineMode({ kind: "live" });
  });
  afterEach(() => {
    cleanup();
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("arms ops verbs on first activation and fires only on confirm", async () => {
    const { opsCalls } = mountPalette();
    const verb = await screen.findByText("ops: vault check");
    fireEvent.click(verb);
    expect(opsCalls).toHaveLength(0); // armed, not fired
    const armed = await screen.findByText("confirm: ops: vault check?");
    fireEvent.click(armed);
    expect(opsCalls).toHaveLength(1);
    expect(opsCalls[0]).toContain("/ops/core/vault-check");
  });

  it("hides ops verbs entirely in time-travel mode (G4.b)", async () => {
    useViewStore.getState().setTimelineMode({ kind: "time-travel", at: 1 });
    mountPalette();
    const input = await screen.findByPlaceholderText(/type a command/);
    fireEvent.change(input, { target: { value: "ops" } });
    expect(screen.queryByText(/^ops:/)).toBeNull();
  });
});
