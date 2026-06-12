// @vitest-environment happy-dom
//
// Component tests for the ops surface's SAFETY behaviors (finding 026):
// the arm→fire two-step and the time-travel disable are the difference
// between "gated exactly as the ADR demands" being true and being typed.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { MockEngine } from "../../testing/mockEngine";
import { useViewStore } from "../../stores/view/viewStore";
import { OpsPanel } from "./OpsPanel";

function mountPanel() {
  const mock = new MockEngine();
  const opsCalls: string[] = [];
  engineClient.useTransport((input, init) => {
    if (String(input).includes("/ops/")) opsCalls.push(String(input));
    return mock.fetchImpl(input, init);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(createElement(QueryClientProvider, { client }, createElement(OpsPanel)));
  return { opsCalls };
}

describe("OpsPanel safety behaviors (026)", () => {
  beforeEach(() => {
    useViewStore.getState().setTimelineMode({ kind: "live" });
  });
  afterEach(() => {
    cleanup();
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("never fires on the first click: arm, then fire on confirm", async () => {
    const { opsCalls } = mountPanel();
    const button = screen.getByRole("button", { name: "vault check" });
    fireEvent.click(button);
    // Armed, not fired.
    expect(opsCalls).toHaveLength(0);
    const confirm = await screen.findByRole("button", {
      name: "confirm vault check?",
    });
    fireEvent.click(confirm);
    await screen.findByText(/vault-check:/);
    expect(opsCalls).toHaveLength(1);
    expect(opsCalls[0]).toContain("/ops/core/vault-check");
  });

  it("disables every verb in time-travel mode (G4.b)", () => {
    useViewStore.getState().setTimelineMode({ kind: "time-travel", at: 123 });
    const { opsCalls } = mountPanel();
    expect(screen.getByText(/disabled while time travelling/)).toBeTruthy();
    for (const button of screen.getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(opsCalls).toHaveLength(0);
  });
});
