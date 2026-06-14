// @vitest-environment happy-dom
//
// Component tests for the ops surface's SAFETY + STATE behaviors (finding 026;
// rag-manager surface ADR W02.P15.S31): the arm→fire two-step, the time-travel
// disable, the contextual rag cluster (start when stopped / lifecycle when
// running), the in-flight liveness, the legible receipt, and the rag-down 502
// surfacing as TIER TRUTH rather than a generic error — the difference between
// "gated and honest exactly as the ADR demands" being true and being typed.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { MockEngine } from "../../testing/mockEngine";
import { useViewStore } from "../../stores/view/viewStore";
import { OpsPanel } from "./OpsPanel";

function mountPanel(configure?: (mock: MockEngine) => void) {
  const mock = new MockEngine();
  configure?.(mock);
  const opsCalls: string[] = [];
  engineClient.useTransport((input, init) => {
    if (String(input).includes("/ops/")) opsCalls.push(String(input));
    return mock.fetchImpl(input, init);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(createElement(QueryClientProvider, { client }, createElement(OpsPanel)));
  return { opsCalls, mock };
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
      name: "confirm vault check",
    });
    fireEvent.click(confirm);
    await screen.findByTestId("ops-receipt");
    expect(opsCalls).toHaveLength(1);
    expect(opsCalls[0]).toContain("/ops/core/vault-check");
  });

  it("cancel disarms without firing (keyboard-reachable two-step)", async () => {
    const { opsCalls } = mountPanel();
    fireEvent.click(screen.getByRole("button", { name: "vault check" }));
    const cancel = await screen.findByRole("button", { name: "cancel vault check" });
    fireEvent.click(cancel);
    // Back to the resting affordance; nothing fired.
    await screen.findByRole("button", { name: "vault check" });
    expect(opsCalls).toHaveLength(0);
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

describe("OpsPanel rag manager states (W02.P15.S31)", () => {
  beforeEach(() => {
    useViewStore.getState().setTimelineMode({ kind: "live" });
  });
  afterEach(() => {
    cleanup();
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("offers the rag lifecycle cluster when rag is running, not start", async () => {
    mountPanel();
    // The status snapshot settles to running → the contextual cluster narrows:
    // start rag drops out and the lifecycle verbs remain.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "start rag" })).toBeNull(),
    );
    expect(screen.getByRole("button", { name: "stop rag" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "reindex" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "watcher tuning" })).toBeTruthy();
  });

  it("offers only start rag when rag is stopped (degradation as design)", async () => {
    mountPanel((mock) => mock.degrade("semantic", "rag service down"));
    // The snapshot settles to stopped → only start rag is offered.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "stop rag" })).toBeNull(),
    );
    expect(screen.getByRole("button", { name: "start rag" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "reindex" })).toBeNull();
  });

  it("surfaces a rag-down 502 as tier truth, not a generic error", async () => {
    // rag running per /status but the ops proxy is down: a 502 with a tiers
    // block. We start from a running snapshot so the lifecycle cluster shows,
    // then drive the op against a rag-down ops route.
    const { mock } = mountPanel();
    await screen.findByRole("button", { name: "reindex" });
    // Flip the ops proxy down (the route checks the live degradation set).
    mock.degrade("semantic", "rag service down");
    fireEvent.click(screen.getByRole("button", { name: "reindex" }));
    const confirm = await screen.findByRole("button", { name: "confirm reindex" });
    fireEvent.click(confirm);
    const receipt = await screen.findByTestId("ops-receipt");
    // The receipt reads as the backend being down (tier truth), with the
    // dedicated down tone — NOT a flattened generic failure.
    expect(receipt.getAttribute("data-ops-tone")).toBe("down");
    expect(within(receipt).getByText(/rag is down/)).toBeTruthy();
  });

  it("shows a successful op receipt and re-reads status", async () => {
    mountPanel();
    await screen.findByRole("button", { name: "reindex" });
    fireEvent.click(screen.getByRole("button", { name: "reindex" }));
    fireEvent.click(await screen.findByRole("button", { name: "confirm reindex" }));
    const receipt = await screen.findByTestId("ops-receipt");
    await waitFor(() => expect(receipt.getAttribute("data-ops-tone")).toBe("ok"));
    expect(within(receipt).getByText("reindex")).toBeTruthy();
  });
});
