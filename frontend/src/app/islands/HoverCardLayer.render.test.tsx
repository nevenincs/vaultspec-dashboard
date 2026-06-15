// @vitest-environment happy-dom
//
// The hover-card host (node-visual-richness P04), exercised through the REAL
// stores client transport (mockEngine) and a REAL SceneController seam — no
// component-internal doubles. Asserts the P04 contract end to end: the card
// mounts for a hovered id only AFTER the dwell, dismisses on hover-out, is
// SUPPRESSED for an opened id (no coexistence with the interior), fires the
// existing open intent through its affordance, and projects its content from the
// node-detail stores hook (never fetching itself).
//
// Real timers are used (not fake): the host's dwell rides a real setTimeout and
// the node-detail query resolves through the async mock transport, so
// `waitFor`'s polling and the dwell both settle naturally. The dwell window is
// short enough that a real wait is cheap.

import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { SceneController } from "../../scene/sceneController";
import { useViewStore } from "../../stores/view/viewStore";
import { MockEngine } from "../../testing/mockEngine";
import { HOVER_DWELL_MS, HoverCardLayer } from "./HoverCardLayer";

// A real adr node in the seeded corpus (editor-demo, fi=0 → accepted/affirmed).
const ADR_ID = "doc:2026-01-05-editor-demo-adr";
const PLAN_ID = "doc:2026-01-05-editor-demo-plan";

function renderLayer(scene: SceneController) {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      <HoverCardLayer scene={scene} />,
    ),
  );
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Hover a node through the store slice (modeling Stage's `hover` handler),
 *  satisfy the real dwell, then give the node an on-stage anchor through the
 *  REAL seam so the card can position. */
async function hoverAndDwell(scene: SceneController, id: string) {
  act(() => {
    useViewStore.getState().setHoveredId(id);
  });
  // Let the real dwell elapse (a small margin over the threshold).
  await act(async () => {
    await wait(HOVER_DWELL_MS + 20);
  });
  act(() => {
    scene.emitAnchor(id, { x: 100, y: 80, scale: 1 });
  });
}

describe("HoverCardLayer — dwell, dismiss, suppression, open intent", () => {
  beforeEach(() => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    useViewStore.setState({ hoveredId: null, openedIds: [], selection: null });
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.setState({ hoveredId: null, openedIds: [], selection: null });
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("does NOT mount the card before the dwell elapses", async () => {
    const scene = new SceneController();
    renderLayer(scene);
    act(() => {
      useViewStore.getState().setHoveredId(ADR_ID);
    });
    // Anchor available immediately, but the dwell has not elapsed.
    act(() => {
      scene.emitAnchor(ADR_ID, { x: 10, y: 10, scale: 1 });
    });
    await act(async () => {
      await wait(HOVER_DWELL_MS / 2);
    });
    expect(document.querySelector("[data-hover-card-for]")).toBeNull();
  });

  it("mounts the card for a hovered id after the dwell, projecting node-detail content", async () => {
    const scene = new SceneController();
    renderLayer(scene);
    await hoverAndDwell(scene, ADR_ID);
    // The detail query resolves through the real mock transport; the card then
    // surfaces the projected status value ("accepted").
    await waitFor(() => {
      const chip = document.querySelector("[data-status-chip]");
      expect(chip).toBeTruthy();
      expect(chip?.textContent).toContain("accepted");
    });
    // The card is anchored to the hovered node.
    expect(document.querySelector(`[data-hover-card-for="${ADR_ID}"]`)).toBeTruthy();
  });

  it("dismisses the card on hover-out (hoveredId → null)", async () => {
    const scene = new SceneController();
    renderLayer(scene);
    await hoverAndDwell(scene, ADR_ID);
    await waitFor(() => {
      expect(document.querySelector("[data-hover-card]")).toBeTruthy();
    });
    act(() => {
      useViewStore.getState().setHoveredId(null);
    });
    await waitFor(() => {
      expect(document.querySelector("[data-hover-card]")).toBeNull();
    });
  });

  it("SUPPRESSES the hover card when the same node is opened (no coexistence)", async () => {
    const scene = new SceneController();
    renderLayer(scene);
    // Open the node first, then hover it: the interior already shows everything.
    act(() => {
      useViewStore.getState().openNode(ADR_ID);
    });
    await hoverAndDwell(scene, ADR_ID);
    // Even after the dwell + anchor, the card is suppressed for the opened id.
    expect(useViewStore.getState().openedIds).toContain(ADR_ID);
    expect(document.querySelector("[data-hover-card-for]")).toBeNull();
  });

  it("fires the open intent (openedIds) when the card's open affordance is clicked", async () => {
    const scene = new SceneController();
    renderLayer(scene);
    await hoverAndDwell(scene, ADR_ID);
    let openButton: HTMLElement | null = null;
    await waitFor(() => {
      openButton = document.querySelector("[data-hover-open]");
      expect(openButton).toBeTruthy();
    });
    act(() => {
      fireEvent.click(openButton!);
    });
    // The affordance routes through the SAME open intent the scene `open` event
    // uses — the node lands in openedIds, never just a transient.
    expect(useViewStore.getState().openedIds).toContain(ADR_ID);
  });

  it("remounts the card (fresh bloom) when the hover moves to a different node", async () => {
    const scene = new SceneController();
    renderLayer(scene);
    await hoverAndDwell(scene, ADR_ID);
    await waitFor(() => {
      expect(document.querySelector(`[data-hover-card-for="${ADR_ID}"]`)).toBeTruthy();
    });
    await hoverAndDwell(scene, PLAN_ID);
    await waitFor(() => {
      expect(document.querySelector(`[data-hover-card-for="${PLAN_ID}"]`)).toBeTruthy();
      expect(document.querySelector(`[data-hover-card-for="${ADR_ID}"]`)).toBeNull();
    });
  });
});
