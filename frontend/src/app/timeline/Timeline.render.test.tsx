// @vitest-environment happy-dom
//
// Phase-lane document marks (dashboard-timeline ADR "Representation", W03.P06.S35):
// two contracts the rebuilt timeline must hold.
//
// 1. The 14px GRAYSCALE-BY-SHAPE gate (iconography ADR a11y contract): the
//    doc-type marks the phase lanes draw must be distinguishable in pure grayscale
//    at the 14px legibility floor by SHAPE alone — hue never load-bearing. This is
//    asserted offline through the SHARED `markGate` util (`gateFamily`) over the
//    exact `MarkDef` silhouettes the surface renders, the same way the scene's
//    mark families are gated; no DOM, no Pixi.
//
// 2. The rendered marks are activatable, keyboard-reachable BUTTONS with a
//    descriptive accessible name — fed through the real stores client transport
//    (mockEngine) over the live `/graph/lineage` wire shape, no component-internal
//    doubles, so the mark a11y contract is proven against reality.

import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gateFamily } from "../../scene/field/markGate";
import { DOC_TYPE_MARK_DEFS } from "../../scene/field/marks";
import type { SceneCommand, SceneFieldRenderer } from "../../scene/sceneController";
import { SceneController } from "../../scene/sceneController";
import { useDegradationStore } from "../degradation/matrix";
import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { MockEngine, MOCK_SCOPE } from "../../testing/mockEngine";
import { Playhead } from "./Playhead";
import { RangeSelect } from "./RangeSelect";
import { TimelineControls } from "./TimelineControls";
import { handleNodeClick } from "./eventSelection";
import { MAX_PX_PER_MS, timeToStripX } from "./scrollStrip";
import { Timeline, joinedNodeCount, useTimelineStore } from "./Timeline";
import { arcEndpointLabel } from "./arcs";

// The doc-type marks the six phase lanes actually draw (DocTypeMark): every vault
// doc-type that owns a lane plus the salient kinds. The grayscale gate runs over
// exactly this set — the marks a lineage node can render.
const PHASE_LANE_MARK_DEFS = [
  DOC_TYPE_MARK_DEFS.research,
  DOC_TYPE_MARK_DEFS.reference,
  DOC_TYPE_MARK_DEFS.adr,
  DOC_TYPE_MARK_DEFS.plan,
  DOC_TYPE_MARK_DEFS.exec,
  DOC_TYPE_MARK_DEFS.audit,
];

// Squint-test floor: the minimum admissible Hamming distance between any two
// marks' 14×14 silhouettes (the same 8-cell floor the scene's gate test uses).
const GATE_FLOOR = 8;

describe("phase-lane marks pass the 14px grayscale-by-shape gate (S35)", () => {
  it("keeps every doc-type lane mark distinct in grayscale at 14px by shape", () => {
    const result = gateFamily(PHASE_LANE_MARK_DEFS, GATE_FLOOR);
    // No two doc-type marks collapse to the same silhouette at the legibility
    // floor — a lane reads by shape alone, with hue as redundant reinforcement.
    expect(result.pass).toBe(true);
    // If this ever fails, the closest pair names which two marks collide.
    expect(result.minDistance).toBeGreaterThanOrEqual(GATE_FLOOR);
  });
});

// The mock corpus seeds its first feature's documents from this instant, one per
// day across the pipeline (research 01-05, adr 01-06, plan 01-07, exec 01-08,
// audit 01-09); a fine scale docked on that week renders the marks raw.
const CORPUS_RESEARCH = Date.parse("2026-01-05T09:00:00Z");
const DAY = 24 * 3600 * 1000;

function dockOn(targetMs: number) {
  // A fine scale (well inside the zoom band) so the corpus week spreads out, and
  // a scroll offset that docks `targetMs` near the LEFT of the viewport so the
  // following days fall in range. origin = 0 (epoch), matching the component.
  const pxPerMs = MAX_PX_PER_MS / 8; // ~8h across 100px — same-week marks resolve
  // Put the target ~80px from the left edge: viewport left strip-x = target-x-80.
  const scrollOffset = timeToStripX(targetMs, 0, pxPerMs) - 80;
  useTimelineStore.getState().setPxPerMs(pxPerMs);
  useTimelineStore.getState().setScrollOffset(Math.max(0, scrollOffset));
}

function renderTimeline() {
  return render(
    <QueryClientProvider client={queryClient}>
      <div style={{ position: "relative", width: "800px", height: "150px" }}>
        <Timeline />
      </div>
    </QueryClientProvider>,
  );
}

describe("phase-lane marks render as activatable buttons (S34/S35)", () => {
  beforeEach(() => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    useViewStore.getState().setScope(MOCK_SCOPE);
    dockOn(CORPUS_RESEARCH);
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
    useTimelineStore.getState().setHoveredNode(null);
    engineClient.useTransport((input, init) => fetch(input, init));
    vi.restoreAllMocks();
  });

  it("renders each dated document as a button naming its kind, date, and degree", async () => {
    renderTimeline();
    // Every lineage mark is reachable as a BUTTON; the name spells the doc-type,
    // the human date, and the lineage degree (the a11y announcement contract).
    const marks = await screen.findAllByRole("button", {
      name: /at .* lineage degree \d+/i,
    });
    expect(marks.length).toBeGreaterThan(0);
    // The marks live under the lineage-marks group, which names them without
    // overriding their native button role (a listitem would mask it).
    const group = screen.getByRole("group", { name: "lineage marks" });
    expect(group.querySelector('[role="listitem"]')).toBeNull();
    // Each rendered mark carries its doc-type as a data attribute, shape-first.
    expect(group.querySelector("[data-doc-type]")).not.toBeNull();
  });

  it("places the corpus research document mark in range, dated by shape", async () => {
    renderTimeline();
    // A research document dated 2026-01-05 resolves by its name — proving the
    // lineage marks are DATED and positioned (not events): a research-lane mark
    // at its blob-true creation instant.
    const mark = await screen.findByRole("button", {
      name: /research .* at 2026-01-05.* lineage degree \d+/i,
    });
    expect(mark).toBeTruthy();
    expect(mark.getAttribute("data-doc-type")).toBe("research");
  });

  it("positions later pipeline docs in range when the scale docks on the week", async () => {
    // Dock one day earlier so the adr (2026-01-06) day also falls inside the
    // visible window — the pipeline marks spread across their phase lanes.
    dockOn(CORPUS_RESEARCH - DAY);
    renderTimeline();
    const adr = await screen.findByRole("button", {
      name: /adr .* at 2026-01-06.* lineage degree \d+/i,
    });
    expect(adr.getAttribute("data-doc-type")).toBe("adr");
  });
});

// =============================================================================
// W04.P09: honest states, a11y contract, reduced-motion (S57-S67)
// =============================================================================

const PHASE_BAND_LANES = ["research", "adr", "plan", "exec", "review", "codify"];

function withTimeline() {
  engineClient.useTransport(new MockEngine().fetchImpl);
  useViewStore.getState().setScope(MOCK_SCOPE);
  dockOn(CORPUS_RESEARCH - DAY);
}

function resetTimeline() {
  cleanup();
  queryClient.clear();
  useViewStore.getState().setScope(null);
  useViewStore.getState().setTimelineMode({ kind: "live" });
  useTimelineStore.getState().setHoveredNode(null);
  useTimelineStore.getState().setLastStepInstant(false);
  useDegradationStore.getState().clearOverrides();
  engineClient.useTransport((input, init) => fetch(input, init));
  vi.restoreAllMocks();
}

describe("honest states (S57-S60)", () => {
  beforeEach(withTimeline);
  afterEach(resetTimeline);

  it("renders the six-lane scaffold immediately, never a flash of empty (S57)", () => {
    // The lane scaffold is present on first paint (before the lineage resolves):
    // every phase lane label is drawn, so the surface never flashes empty while
    // the first slice loads.
    renderTimeline();
    for (const lane of PHASE_BAND_LANES) {
      expect(screen.getByText(lane)).toBeTruthy();
    }
    // The liveness cue is shown while loading — a quiet status, not a blank.
    const loading = document.querySelector("[data-timeline-loading]");
    expect(loading?.getAttribute("role")).toBe("status");
  });

  it("renders the empty/no-history state approachably, never an error (S58)", async () => {
    // Dock on a range with no corpus documents (a far-future week): the in-range
    // filter excludes every node, so the slice resolves EMPTY — the approachable
    // no-history copy renders, and no alert (error) is shown.
    dockOn(Date.parse("2099-01-01T00:00:00Z"));
    renderTimeline();
    const empty = await screen.findByText(/no lineage in this range yet/i);
    expect(empty.closest("[data-timeline-empty]")?.getAttribute("role")).toBe("status");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the degraded-from-tiers state read pre-derived from the matrix (S59)", async () => {
    // streamLost -> matrix yields timeline: "reconnecting" — the DESIGNED degraded
    // state. The surface reads that pre-derived truth (never a transport error):
    // a quiet, polite status badge, NOT an alert and NOT a blanked surface.
    useDegradationStore.getState().setOverride("streamLost", true);
    renderTimeline();
    const badge = await screen.findByText(/reconnecting — showing the last lineage/i);
    const region = badge.closest("[data-timeline-degraded]");
    expect(region?.getAttribute("role")).toBe("status");
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(screen.queryByRole("alert")).toBeNull();
    // The lane scaffold stays behind the badge (not blanked).
    expect(screen.getByText("research")).toBeTruthy();
  });

  it("renders a contained, retry-able error scoped to the timeline (S60)", async () => {
    // A genuine request FAILURE (the transport rejects): the surface shows a
    // contained, copy-toned, retry-able message scoped to the timeline — it does
    // not blank the lane scaffold, and the message is the only alert.
    engineClient.useTransport(() => Promise.reject(new Error("network down")));
    renderTimeline();
    const error = await screen.findByText(/couldn’t load the timeline/i);
    expect(error.closest("[data-timeline-error]")?.getAttribute("role")).toBe("alert");
    expect(screen.getByRole("button", { name: "retry" })).toBeTruthy();
    // The lane scaffold is still drawn behind the contained error.
    expect(screen.getByText("research")).toBeTruthy();
  });
});

describe("accessibility contract (S62-S65)", () => {
  beforeEach(withTimeline);
  afterEach(resetTimeline);

  it("marks announce kind, date, joined-node count, and lineage degree (S63)", async () => {
    renderTimeline();
    // The mark accessible name spells the kind, the human date, the joined-node
    // count, AND the lineage degree (the full S63 announcement contract).
    const mark = await screen.findByRole("button", {
      name: /research .* at 2026-01-05.* \d+ joined nodes?, lineage degree \d+/i,
    });
    expect(mark.getAttribute("data-doc-type")).toBe("research");
  });

  it("announces each arc's relation + endpoint from its endpoint mark (S64)", async () => {
    renderTimeline();
    // The arcs are aria-hidden decorative paint — reachable through their
    // endpoints. A mark with incident arcs names the relation and the joined
    // endpoint (e.g. "... to <name>" / "... from <name>") so the relation is
    // announced without the arc being its own tab-stop.
    const marks = await screen.findAllByRole("button", { name: /lineage degree/i });
    const withIncident = marks.find((m) =>
      /\b(to|from)\b/i.test(m.getAttribute("aria-label") ?? ""),
    );
    expect(withIncident).toBeTruthy();
    // The arcs group carries aria-hidden (the announcement lives on the marks).
    const arcsGroup = document.querySelector("[data-timeline-arcs]");
    expect(arcsGroup?.getAttribute("aria-hidden")).toBe("true");
  });

  it("derives the joined-node count from distinct 1-hop neighbours (S63, pure)", () => {
    // joinedNodeCount counts DISTINCT neighbours, not raw incident edges: a node
    // joined to one neighbour by two arcs counts once.
    const arcs = [
      { id: "a", src: "n1", dst: "n2", tier: "declared", confidence: 1 },
      { id: "b", src: "n1", dst: "n2", tier: "temporal", confidence: 1 },
      { id: "c", src: "n1", dst: "n3", tier: "declared", confidence: 1 },
      { id: "d", src: "n4", dst: "n5", tier: "declared", confidence: 1 },
    ];
    expect(joinedNodeCount(arcs, "n1")).toBe(2);
    expect(joinedNodeCount(arcs, "n6")).toBe(0);
  });

  it("arcEndpointLabel announces the relation + direction from each end (S64, pure)", () => {
    const arc = {
      id: "x",
      src: "doc:a",
      dst: "doc:b",
      tier: "declared",
      confidence: 1,
      relation: "authorizes",
    };
    const nameOf = (id: string) => (id === "doc:a" ? "the ADR" : "the plan");
    expect(arcEndpointLabel(arc, "src", nameOf)).toBe("authorizes to the plan");
    expect(arcEndpointLabel(arc, "dst", nameOf)).toBe("authorizes from the ADR");
  });
});

describe("reduced-motion instant behaviour (S66)", () => {
  beforeEach(withTimeline);
  afterEach(resetTimeline);

  function stubReducedMotion(reduced: boolean) {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reduced : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
  }

  it("drops the mark transition class under prefers-reduced-motion (S66)", async () => {
    stubReducedMotion(true);
    renderTimeline();
    const marks = await screen.findAllByRole("button", { name: /lineage degree/i });
    // The transition-utility is swapped for an instant change: no transition class
    // on the marks, so the ego-highlight opacity change is a cut, not a tween.
    for (const mark of marks) {
      expect(mark.className).not.toMatch(/transition-\[color,opacity\]/);
    }
  });

  it("keeps the mark transition class when motion is allowed (S66 control)", async () => {
    stubReducedMotion(false);
    renderTimeline();
    const marks = await screen.findAllByRole("button", { name: /lineage degree/i });
    await waitFor(() => {
      for (const mark of marks) {
        expect(mark.className).toMatch(/transition-\[color,opacity\]/);
      }
    });
  });
});

// =============================================================================
// arc-growth reveal: keyboard steps are instant, drag/play scrubs ease
// =============================================================================
//
// The animated arc-growth reveal fades lineage nodes/arcs in as the playhead time
// T crosses their birth. The ADR motion grammar makes a KEYBOARD-initiated step a
// HARD CUT ("keyboard-initiated steps are instant — never animate"), while a
// pointer-drag scrub and a play-the-range sweep are deliberate EASED reveals. The
// surface reads `useTimelineStore.lastStepInstant` (set true by the keyboard
// handlers, false by drag/play/return-to-live) and, with the OS motion floor,
// derives a `revealInstant` that (a) hard-cuts the reveal fade data and (b) drops
// the mark/arc OPACITY transition so the reveal does not tween on a keyboard step.

describe("arc-growth reveal: keyboard-instant vs eased scrub", () => {
  beforeEach(() => {
    engineClient.useTransport(new MockEngine().fetchImpl);
    useViewStore.getState().setScope(MOCK_SCOPE);
    // A scale that fits the corpus week (research 01-05 … audit 01-09) inside the
    // 800px viewport so consecutive pipeline docs AND the arcs between them are
    // CO-VISIBLE (an arc resolves only when both endpoints are positioned), which
    // the fine same-day `dockOn` does not guarantee.
    const pxPerMs = 700 / (7 * DAY);
    const scrollOffset = timeToStripX(CORPUS_RESEARCH - DAY, 0, pxPerMs);
    useTimelineStore.getState().setPxPerMs(pxPerMs);
    useTimelineStore.getState().setScrollOffset(Math.max(0, scrollOffset));
  });
  afterEach(resetTimeline);

  // Time-travel a few days past the corpus research doc's birth so the early
  // pipeline docs AND the arcs between them are REVEALED (both endpoints' birth
  // instants crossed) — the regime where the keyboard-vs-eased distinction and
  // the under-gate arc flag are observable.
  function timeTravelPastResearch() {
    useViewStore
      .getState()
      .setTimelineMode({ kind: "time-travel", at: CORPUS_RESEARCH + 5 * DAY });
  }

  it("hard-cuts the reveal on a keyboard step: no opacity transition on marks/arcs", async () => {
    renderTimeline();
    const marks = await screen.findAllByRole("button", { name: /lineage degree/i });
    // A keyboard step: time-travel the playhead AND raise the keyboard-instant
    // signal, exactly as the Playhead keyboard handler does (set true, then move).
    act(() => {
      useTimelineStore.getState().setLastStepInstant(true);
      timeTravelPastResearch();
    });
    await waitFor(() => {
      for (const mark of marks) {
        // The OPACITY tween is dropped (reveal is a cut); color still eases so the
        // mark keeps `transition-colors`, never `transition-[color,opacity]`.
        expect(mark.className).not.toMatch(/transition-\[color,opacity\]/);
        expect(mark.className).toMatch(/transition-colors/);
      }
    });
    // The revealed arcs (under the gate) also drop their opacity transition class.
    const arcs = Array.from(document.querySelectorAll("[data-timeline-arc]"));
    expect(arcs.length).toBeGreaterThan(0);
    for (const arc of arcs) {
      expect(arc.getAttribute("class") ?? "").not.toMatch(/transition-opacity/);
    }
  });

  it("eases the reveal on a pointer-drag scrub: marks/arcs keep the opacity transition", async () => {
    renderTimeline();
    const marks = await screen.findAllByRole("button", { name: /lineage degree/i });
    // A drag scrub: time-travel the playhead with the keyboard-instant signal
    // CLEARED, exactly as the drag handler does (set false on grab/move, then move).
    act(() => {
      useTimelineStore.getState().setLastStepInstant(false);
      timeTravelPastResearch();
    });
    await waitFor(() => {
      for (const mark of marks) {
        // The reveal eases: the mark carries the full color+opacity transition.
        expect(mark.className).toMatch(/transition-\[color,opacity\]/);
      }
    });
    // The revealed arcs keep their opacity transition class (the eased fade).
    const arcs = Array.from(document.querySelectorAll("[data-timeline-arc]"));
    expect(arcs.length).toBeGreaterThan(0);
    expect(
      arcs.some((arc) => /transition-opacity/.test(arc.getAttribute("class") ?? "")),
    ).toBe(true);
  });

  it("marks the under-gate arcs with data-arc-gated in time-travel (not in LIVE)", async () => {
    renderTimeline();
    await screen.findAllByRole("button", { name: /lineage degree/i });
    // LIVE (ungated): no arc carries the time-travel gate attribute.
    act(() => {
      useTimelineStore.getState().setLastStepInstant(false);
      useViewStore.getState().setTimelineMode({ kind: "live" });
    });
    await waitFor(() => {
      const liveArcs = Array.from(document.querySelectorAll("[data-timeline-arc]"));
      expect(liveArcs.length).toBeGreaterThan(0);
      for (const arc of liveArcs) {
        expect(arc.getAttribute("data-arc-gated")).toBeNull();
      }
    });
    // Time-travel: the revealed arcs are flagged as under the reveal gate.
    act(() => {
      timeTravelPastResearch();
    });
    await waitFor(() => {
      const ttArcs = Array.from(document.querySelectorAll("[data-timeline-arc]"));
      expect(ttArcs.some((arc) => arc.getAttribute("data-arc-gated") === "true")).toBe(
        true,
      );
    });
  });
});

// =============================================================================
// W05.P10.S69: integration — the Timeline mounted as the AppShell wires it
// =============================================================================
//
// The AppShell mounts the relational timeline as: the TimelineControls bar docked
// at the region's top edge, the Timeline surface below it wiring the marks'
// onNodeClick to eventSelection.handleNodeClick (the deferred S45 wiring), with the
// RangeSelect + Playhead transport in the overlay. These tests mount that exact
// composition through the REAL stores client transport (mockEngine over the live
// /graph/lineage wire shape — no component-internal doubles) and assert: the
// control bar renders, the lane scaffold shows, and a mark click flows into the ONE
// shared Selection plus a BOUNDED stage ego pulse. The scene is a capturing double
// supplied through the same handler the AppShell wires, so the bounded `node_ids`
// pulse is observed deterministically without a mounted Pixi renderer.

function captureScene() {
  const commands: SceneCommand[] = [];
  const field: SceneFieldRenderer = {
    mount: () => undefined,
    resize: () => undefined,
    destroy: () => undefined,
    command: (cmd) => commands.push(cmd),
  };
  return { scene: new SceneController(field), commands };
}

describe("Timeline mounted in the AppShell composition (S69)", () => {
  beforeEach(withTimeline);
  afterEach(resetTimeline);

  it("renders the control bar, the lane scaffold, and the dated marks together", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <div style={{ position: "relative", width: "800px", height: "200px" }}>
          <TimelineControls />
          <div style={{ position: "relative", height: "150px" }}>
            <Timeline
              onNodeClick={handleNodeClick}
              overlay={
                <>
                  <RangeSelect />
                  <Playhead />
                </>
              }
            />
          </div>
        </div>
      </QueryClientProvider>,
    );
    // The control bar is present (the surface's docked instrument bar).
    expect(document.querySelector("[data-timeline-controls]")).not.toBeNull();
    // The six-lane scaffold is drawn — the surface shows its structure, not empty.
    // Scope to the lineage svg so the lane labels are the surface's own scaffold
    // text, not the control bar's lane-toggle labels (both name the lanes).
    const surface = screen.getByRole("img", { name: "lineage timeline" });
    const laneLabels = Array.from(surface.querySelectorAll("text")).map(
      (t) => t.textContent,
    );
    for (const lane of PHASE_BAND_LANES) {
      expect(laneLabels).toContain(lane);
    }
    // The dated lineage marks resolve through the real client transport.
    const marks = await screen.findAllByRole("button", { name: /lineage degree/i });
    expect(marks.length).toBeGreaterThan(0);
  });

  it("flows a mark click into the ONE shared selection + a bounded stage pulse", async () => {
    const { scene, commands } = captureScene();
    render(
      <QueryClientProvider client={queryClient}>
        <div style={{ position: "relative", width: "800px", height: "150px" }}>
          {/* Wire exactly as the AppShell does — onNodeClick is handleNodeClick —
              but route its bounded pulse to a capturing scene so the cross-
              highlight is observed without a mounted renderer. */}
          <Timeline onNodeClick={(node, arcs) => handleNodeClick(node, arcs, scene)} />
        </div>
      </QueryClientProvider>,
    );
    const research = await screen.findByRole("button", {
      name: /research .* at 2026-01-05.* lineage degree \d+/i,
    });
    fireEvent.click(research);
    // The shared Selection now holds the clicked document as a node — selecting
    // here focuses everywhere (the inspector, the stage) through the one concept.
    const selection = useViewStore.getState().selection;
    expect(selection).toMatchObject({ kind: "node" });
    expect(selection?.id).toMatch(/^doc:/);
    // The stage receives a BOUNDED ego pulse including the selected node itself.
    const pulses = commands.filter((c) => c.kind === "pulse");
    expect(pulses.length).toBeGreaterThan(0);
    const pulse = pulses[0];
    if (pulse.kind === "pulse") {
      expect(pulse.ids.has(selection?.id ?? "")).toBe(true);
    }
  });
});
