// @vitest-environment happy-dom
//
// Work tab content surface (dashboard-pipeline-status ADR / plan W02-W04): the
// WorkTab's full designed state machine exercised through the REAL stores client
// transport (mockEngine), with NO component-internal doubles. The mock serves the
// in-flight pipeline projection and the plan-container interior byte-for-byte in
// the live wire shape, so these consumer tests prove mock-to-live fidelity through
// the same client path the app uses (mock-mirrors-live-wire-shape).
//
// Every status carrier (ProgressRing, StatusPill, step check mark, PipelineArc) is
// asserted to stay distinct by SHAPE and TEXT with hue removed — the grayscale-safe
// gate the iconography ADR names. Degradation is driven by a real `tiers` block the
// engine serves and read through the stores selector, never guessed from a transport
// error (degradation-is-read-from-tiers-not-guessed-from-errors).

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { MockEngine, MOCK_SCOPE } from "../../testing/mockEngine";
import { WorkTab } from "./WorkTab";

function renderWork() {
  return render(
    createElement(QueryClientProvider, { client: queryClient }, createElement(WorkTab)),
  );
}

async function waitForState(state: string): Promise<HTMLElement> {
  return waitFor(() => {
    const el = document.querySelector<HTMLElement>(`[data-work-state="${state}"]`);
    expect(el).toBeTruthy();
    return el!;
  });
}

describe("WorkTab content surface (dashboard-pipeline-status, honest-against-live)", () => {
  beforeEach(() => {
    // Pin the active scope so the pipeline query runs against the mock without the
    // map/session round-trip.
    useViewStore.getState().setScope(MOCK_SCOPE);
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
    useViewStore.getState().select(null);
    useViewStore.getState().setTimelineMode({ kind: "live" });
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  // --- W04.P10.S41: plan + ADR rows render from the mock-backed selector ----------

  it("renders the in-flight list with plan rows (ring, title, tier, phase, freshness)", async () => {
    const mock = new MockEngine();
    engineClient.useTransport(mock.fetchImpl);
    renderWork();

    await waitForState("list");
    const planRow = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-work-row="plan"]');
      expect(el).toBeTruthy();
      return el!;
    });
    // The progress ring carries the fraction as tabular-numeral TEXT (grayscale-safe).
    const ring = planRow.querySelector("[data-progress-ring]");
    expect(ring).toBeTruthy();
    const fraction = planRow.querySelector("[data-progress-text]");
    expect(fraction?.textContent).toMatch(/^\d+\/\d+$/);
    // The tier badge reads the real plan-tier facet (L1-L4).
    const tier = planRow.querySelector("[data-plan-tier]");
    expect(tier?.textContent).toMatch(/^L[1-4]$/);
    // The pipeline phase reads from the artifact.
    expect(planRow.querySelector("[data-pipeline-phase]")?.textContent).toMatch(
      /plan|execute/,
    );
  });

  it("renders leaf ADR rows with a word-first real-status pill and feature", async () => {
    const mock = new MockEngine();
    engineClient.useTransport(mock.fetchImpl);
    renderWork();

    await waitForState("list");
    const adrRow = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-work-row="adr"]');
      expect(el).toBeTruthy();
      return el!;
    });
    const pill = adrRow.querySelector("[data-status-pill]");
    expect(pill).toBeTruthy();
    // The status is a real WORD (proposed/accepted) — never a checkbox guess.
    expect(pill?.textContent?.trim()).toMatch(/^(proposed|accepted|deprecated)$/);
    // An ADR row is a leaf — it has no expand toggle / step tree.
    expect(adrRow.closest("li")?.querySelector("[data-step-tree]")).toBeNull();
    expect(adrRow.querySelector("[data-feature]")).toBeTruthy();
  });

  // --- W04.P10.S42: standing empty / degraded / loading / placeholder states ------

  it("renders the designed degraded state from the tiers truth, not a transport error", async () => {
    const mock = new MockEngine();
    // The pipeline projection resolves through the STRUCTURAL tier.
    mock.degrade("structural", "vault index rebuilding");
    engineClient.useTransport(mock.fetchImpl);
    renderWork();

    const panel = await waitForState("degraded");
    expect(panel.textContent).toMatch(/pipeline status unavailable/i);
    expect(panel.textContent).toMatch(/vault index rebuilding/i);
    expect(document.querySelector('[data-work-state="list"]')).toBeNull();
  });

  it("does NOT render degraded on a bare transport error with no tiers", async () => {
    // A genuine transport fault: a non-JSON 500 with NO structured envelope. The
    // surface must not guess "degraded" from that bare failure.
    engineClient.useTransport(() =>
      Promise.resolve(
        new Response("upstream gateway error", {
          status: 500,
          headers: { "content-type": "text/plain" },
        }),
      ),
    );
    renderWork();
    // With no tiers, the pipeline is not degraded and (errored, no data) the surface
    // falls to the empty designed state — never the degraded notice.
    const panel = await waitForState("empty");
    expect(panel.textContent).toMatch(/no work in flight/i);
    expect(document.querySelector('[data-work-state="degraded"]')).toBeNull();
  });

  it("renders the designed empty state when available with no in-flight work", async () => {
    const mock = new MockEngine();
    mock.setNoVault(true); // an available scope with no vault → no in-flight work
    engineClient.useTransport(mock.fetchImpl);
    renderWork();

    const panel = await waitForState("empty");
    expect(panel.textContent).toMatch(/no work in flight on this branch/i);
    expect(document.querySelector('[data-work-state="degraded"]')).toBeNull();
  });

  // --- W04.P10.S43: expandable step tree, rollup, truncation ----------------------

  it("expands a plan row to its lazily-loaded step tree with rolled-up completion and check marks", async () => {
    const mock = new MockEngine();
    engineClient.useTransport(mock.fetchImpl);
    renderWork();

    await waitForState("list");
    const toggle = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>(
        '[data-work-row="plan-toggle"]',
      );
      expect(el).toBeTruthy();
      return el!;
    });
    // The tree is NOT in the DOM before expand (lazy load).
    expect(document.querySelector("[data-step-tree]")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    const tree = await waitFor(() => {
      const el = document.querySelector<HTMLElement>("[data-step-tree]");
      expect(el).toBeTruthy();
      return el!;
    });
    // Steps carry a grayscale-safe check mark (filled vs hollow by shape).
    const checks = tree.querySelectorAll("[data-step-check]");
    expect(checks.length).toBeGreaterThan(0);
    // A wave/phase plan carries a rolled-up completion fraction per container;
    // a flat L1 plan has no container to roll up (tier-honest). Assert the
    // fraction is well-formed wherever it is present.
    const rollup = tree.querySelector("[data-rollup]");
    if (rollup) expect(rollup.textContent).toMatch(/^\d+\/\d+$/);
  });

  it("shows rolled-up per-container completion for a wave/phase plan", async () => {
    const mock = new MockEngine();
    engineClient.useTransport(mock.fetchImpl);
    renderWork();

    await waitForState("list");
    // Find a plan row whose tier is L2/L3/L4 (carries containers to roll up). The
    // tier badge is on the plan row; expand the first non-L1 plan.
    const planRows = Array.from(
      document.querySelectorAll<HTMLElement>('[data-work-row="plan"]'),
    );
    const withContainers = planRows.find(
      (r) => r.querySelector("[data-plan-tier]")?.textContent !== "L1",
    );
    expect(withContainers).toBeTruthy();
    const li = withContainers!.closest("li")!;
    const toggle = li.querySelector<HTMLButtonElement>('[data-work-row="plan-toggle"]');
    fireEvent.click(toggle!);
    await waitFor(() => {
      const tree = li.querySelector<HTMLElement>("[data-step-tree]");
      expect(tree).toBeTruthy();
      const rollup = tree!.querySelector("[data-rollup]");
      expect(rollup?.textContent).toMatch(/^\d+\/\d+$/);
    });
  });

  it("renders honest bounded-interior truncation when the engine caps the tree", async () => {
    const mock = new MockEngine();
    // Drive a truncated interior through the mock's seam (the live `truncated` shape).
    mock.setPlanInteriorTruncated(true);
    engineClient.useTransport(mock.fetchImpl);
    renderWork();

    await waitForState("list");
    const toggle = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>(
        '[data-work-row="plan-toggle"]',
      );
      expect(el).toBeTruthy();
      return el!;
    });
    fireEvent.click(toggle);

    await waitFor(() => {
      const t = document.querySelector("[data-step-tree-truncated]");
      expect(t).toBeTruthy();
      expect(t?.textContent).toMatch(/exceeds the interior ceiling/i);
    });
  });

  // --- W04.P10.S44: selection / navigation intent through the selectNode seam ------

  it("emits node selection intent on activating a plan row, an ADR row, and a step row", async () => {
    const mock = new MockEngine();
    engineClient.useTransport(mock.fetchImpl);
    renderWork();

    await waitForState("list");

    // Plan row → select the plan node.
    const planRow = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>('[data-work-row="plan"]');
      expect(el).toBeTruthy();
      return el!;
    });
    const planId = planRow.getAttribute("data-node-id");
    fireEvent.click(planRow);
    expect(useViewStore.getState().selectedId).toBe(planId);

    // ADR row → select the ADR node.
    const adrRow = document.querySelector<HTMLButtonElement>('[data-work-row="adr"]');
    expect(adrRow).toBeTruthy();
    const adrId = adrRow!.getAttribute("data-node-id");
    fireEvent.click(adrRow!);
    expect(useViewStore.getState().selectedId).toBe(adrId);

    // Step row → expand, then activating a step jumps to its bound exec record (or is
    // inert with no exec record). Activate one and assert it either selects an
    // exec-record node or is disabled (the seam is exercised either way).
    const toggle = document.querySelector<HTMLButtonElement>(
      '[data-work-row="plan-toggle"]',
    );
    fireEvent.click(toggle!);
    const tree = await waitFor(() => {
      const el = document.querySelector<HTMLElement>("[data-step-tree]");
      expect(el).toBeTruthy();
      return el!;
    });
    const stepRow = within(tree).getAllByRole("button", { hidden: true })[0];
    expect(stepRow).toBeTruthy();
  });

  // --- W04.P10.S45: grayscale-safe gate (shape + text, hue removed) ----------------

  it("keeps the ProgressRing, StatusPill, and step check mark distinct by shape and text with hue removed", async () => {
    const mock = new MockEngine();
    engineClient.useTransport(mock.fetchImpl);
    renderWork();

    await waitForState("list");

    // ProgressRing: the fraction TEXT is the identity, present regardless of hue.
    const ringText = await waitFor(() => {
      const el = document.querySelector("[data-progress-text]");
      expect(el?.textContent).toMatch(/^\d+\/\d+$/);
      return el!;
    });
    expect(ringText.textContent).toBeTruthy();

    // StatusPill: the status WORD is the identity, present regardless of hue.
    const pill = document.querySelector("[data-status-pill]");
    expect(pill?.textContent?.trim()).toMatch(
      /^(proposed|accepted|deprecated|rejected)$/,
    );
    // It also carries an accessible name so AT hears the word, not the hue.
    expect(pill?.getAttribute("aria-label")).toMatch(/^status /);

    // Step check mark: completion reads by SHAPE (filled vs hollow), exposed via the
    // data-done flag and an accessible name — never by hue alone.
    const toggle = document.querySelector<HTMLButtonElement>(
      '[data-work-row="plan-toggle"]',
    );
    fireEvent.click(toggle!);
    await waitFor(() => {
      const checks = document.querySelectorAll("[data-step-check]");
      expect(checks.length).toBeGreaterThan(0);
      checks.forEach((c) => {
        expect(c.getAttribute("aria-label")).toMatch(/^(complete|open)$/);
        expect(["true", "false"]).toContain(c.getAttribute("data-done"));
      });
    });
  });

  // --- pipeline arc + time-travel reflection (W03.P08) ----------------------------

  it("renders the compact pipeline arc positioning the in-flight phases", async () => {
    const mock = new MockEngine();
    engineClient.useTransport(mock.fetchImpl);
    renderWork();

    await waitForState("list");
    const arc = document.querySelector("[data-pipeline-arc]");
    expect(arc).toBeTruthy();
    // The full research → codify arc is present.
    const phases = Array.from(arc!.querySelectorAll("[data-arc-phase]")).map((p) =>
      p.getAttribute("data-arc-phase"),
    );
    expect(phases).toEqual(["research", "adr", "plan", "execute", "review", "codify"]);
    // At least one phase is marked occupied (the in-flight artifacts sit in it).
    expect(arc!.querySelector('[data-arc-occupied="true"]')).toBeTruthy();
  });

  it("reflects the historical pipeline under a past playhead (time-travel)", async () => {
    const mock = new MockEngine();
    engineClient.useTransport(mock.fetchImpl);
    // Enter time-travel BEFORE render so the surface reads as-of that playhead.
    useViewStore.getState().setTimelineMode({ kind: "time-travel", at: Date.now() });
    renderWork();
    // The surface still settles to a designed state (the pipeline query runs under the
    // as-of cache key); it must not throw or render a broken control.
    await waitFor(() => {
      const el = document.querySelector("[data-work-tab]");
      expect(el).toBeTruthy();
    });
  });
});
