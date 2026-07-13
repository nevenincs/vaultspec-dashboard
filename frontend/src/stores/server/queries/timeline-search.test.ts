// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { liveTransport } from "../../../testing/liveClient";
import { engineClient } from "../engine";
import type { LineageSlice } from "../engine";
import { adaptLineageSlice, unwrapEnvelope } from "../liveAdapters";
import {
  deriveTimelineLineageView,
  deriveTimelineSurfaceChromeView,
  engineKeys,
  normalizeTimelineLineageRequestIdentity,
  useTimelineLineage,
} from "./index";
import { lineageSlice, testQueryClient, wrapper } from "./testFixtures";

afterEach(() => {
  engineClient.useTransport(liveTransport);
});

describe("deriveTimelineLineageView (timeline lineage read model)", () => {
  const slice: LineageSlice = {
    nodes: [
      {
        id: "doc:research",
        doc_type: "research",
        phase: "research",
        dates: { created: "2026-06-18" },
        degree: 1,
      },
    ],
    arcs: [
      {
        id: "edge:1",
        src: "doc:research",
        dst: "doc:adr",
        relation: "references",
        tier: "structural",
        confidence: 1,
      },
    ],
    tiers: {},
    truncated: null,
  };

  it("projects raw lineage query state into stable timeline inputs", () => {
    const retry = () => undefined;
    expect(deriveTimelineLineageView(slice, false, false, retry)).toEqual({
      loading: false,
      errored: false,
      nodes: slice.nodes,
      arcs: slice.arcs,
      retry,
    });
  });

  it("falls back to empty node and arc arrays before lineage data arrives", () => {
    expect(deriveTimelineLineageView(undefined, true, false)).toMatchObject({
      loading: true,
      errored: false,
      nodes: [],
      arcs: [],
    });
  });

  it("does not expose held lineage while a new lineage read is loading", () => {
    expect(deriveTimelineLineageView(slice, true, false)).toMatchObject({
      loading: true,
      errored: false,
      nodes: [],
      arcs: [],
    });
  });

  it("does not expose held lineage after a lineage read errors", () => {
    expect(deriveTimelineLineageView(slice, false, true)).toMatchObject({
      loading: false,
      errored: true,
      nodes: [],
      arcs: [],
    });
  });

  it("does not expose cached lineage data when no scope is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.lineage("", {}), lineageSlice());
    client.setQueryData(
      engineKeys.lineage(
        "scope-a",
        { from: "2026-06-01", to: "2026-06-30" },
        "filter",
        "HEAD",
      ),
      lineageSlice(),
    );

    expect(
      normalizeTimelineLineageRequestIdentity(
        " scope-a ",
        { from: " 2026-06-01 ", to: " 2026-06-30 " },
        " filter ",
        " HEAD ",
      ),
    ).toEqual({
      scope: "scope-a",
      range: { from: "2026-06-01", to: "2026-06-30" },
      filter: "filter",
      asOf: "HEAD",
    });
    expect(
      normalizeTimelineLineageRequestIdentity(
        { scope: "scope-a" },
        { from: 1, to: { value: "2026-06-30" } },
        { filter: "ignored" },
        Number.NaN,
      ),
    ).toEqual({
      scope: null,
      range: { from: undefined, to: undefined },
      filter: undefined,
      asOf: undefined,
    });

    const { result } = renderHook(() => useTimelineLineage(null), {
      wrapper: wrapper(client),
    });
    const malformedScope = renderHook(
      () =>
        useTimelineLineage(
          { scope: "scope-a" },
          { from: "2026-06-01", to: "2026-06-30" },
          "filter",
          "HEAD",
        ),
      {
        wrapper: wrapper(client),
      },
    );

    expect(result.current.data).toBeUndefined();
    expect(malformedScope.result.current.data).toBeUndefined();
  });
});

describe("deriveTimelineSurfaceChromeView (timeline status chrome)", () => {
  it("projects loading and auto-fit pending as the same quiet loading state", () => {
    expect(
      deriveTimelineSurfaceChromeView({
        scopePresent: true,
        loading: false,
        errored: false,
        autoFitPending: true,
        hasMarks: false,
        surface: "normal",
      }),
    ).toMatchObject({
      showLoading: true,
      // Loading is UI-only: the label is the screen-reader name of the shared
      // Skeleton, with no presentation className carried (state-mode-uniformity ADR).
      loadingLabel: "reading the timeline…",
      showEmpty: false,
      showError: false,
    });
  });

  it("projects empty copy from the surface state", () => {
    expect(
      deriveTimelineSurfaceChromeView({
        scopePresent: true,
        loading: false,
        errored: false,
        autoFitPending: false,
        hasMarks: false,
        surface: "lifecycle-sparse",
      }),
    ).toMatchObject({
      showEmpty: true,
      // Empty renders through the shared StateBlock; only the sentence is the
      // deriver's, presentation is the kit's (state-mode-uniformity ADR).
      emptyLabel: "lineage appears as documents gain dates",
    });

    expect(
      deriveTimelineSurfaceChromeView({
        scopePresent: true,
        loading: false,
        errored: false,
        autoFitPending: false,
        hasMarks: false,
        surface: "normal",
      }),
    ).toMatchObject({
      showEmpty: true,
      emptyLabel: "no lineage in this range yet",
    });
  });

  it("projects degraded reconnecting and real error states distinctly", () => {
    expect(
      deriveTimelineSurfaceChromeView({
        scopePresent: true,
        loading: false,
        errored: false,
        autoFitPending: false,
        hasMarks: true,
        surface: "reconnecting",
      }),
    ).toMatchObject({
      // Degraded renders through the shared StateBlock inline notice; only the
      // sentence is the deriver's (state-mode-uniformity ADR).
      showDegraded: true,
      degradedLabel: "reconnecting — showing the last lineage",
      showError: false,
    });

    expect(
      deriveTimelineSurfaceChromeView({
        scopePresent: true,
        loading: false,
        errored: true,
        autoFitPending: false,
        hasMarks: false,
        surface: "reconnecting",
      }),
    ).toMatchObject({
      showDegraded: false,
      showError: true,
      errorLabel: "couldn’t load the timeline",
      errorClassName:
        "absolute left-fg-2 top-1/2 flex -translate-y-1/2 items-center gap-fg-2 text-caption text-ink-muted",
      retryLabel: "retry",
      retryButtonClassName:
        "rounded-fg-xs bg-paper-sunken px-fg-1-5 py-fg-0-5 text-ink transition-colors duration-ui-fast ease-settle hover:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
    });
  });
});

// ---------------------------------------------------------------------------
// adaptLineageSlice + /graph/lineage consumer fidelity (dashboard-timeline
// W02.P04.S24).
//
// A sample CAPTURED from the live `/graph/lineage` wire shape (the engine
// `graph_lineage` route's `{data: {nodes, arcs, truncated}, tiers}` envelope) is
// fed through the SAME unwrap + adapter path the app uses.
// ---------------------------------------------------------------------------

describe("adaptLineageSlice + /graph/lineage consumer fidelity (W02.P04.S24)", () => {
  // A live `/graph/lineage` envelope: two dated, lane-owning document nodes in
  // range and ONE self-consistent structural arc between them. The live route
  // serves `{data: {nodes, arcs, truncated}, tiers}`; the semantic tier is
  // present-only (degraded) in the range lineage. `dates.modified` is the engine
  // `Timestamp` (epoch-ms NUMBER), and the arc carries NO `derivation` field
  // (the graceful fallback until the node-semantics field ships).
  const liveLineageTiers = {
    declared: { available: true },
    structural: { available: true },
    temporal: { available: true },
    semantic: {
      available: false,
      reason: "present-only by design; excluded from the range lineage",
    },
  };
  const live = {
    data: {
      nodes: [
        {
          id: "doc:2026-06-10-x-research",
          doc_type: "research",
          phase: "research",
          dates: { created: "2026-06-10", modified: 1718000000000 },
          title: "x research",
          degree: 2,
        },
        {
          id: "doc:2026-06-12-x-adr",
          doc_type: "adr",
          phase: "adr",
          dates: { created: "2026-06-12" },
          title: "x adr",
          degree: 2,
        },
      ],
      arcs: [
        {
          id: "edge:abc",
          src: "doc:2026-06-12-x-adr",
          dst: "doc:2026-06-10-x-research",
          relation: "mentions",
          tier: "structural",
          confidence: 0.9,
        },
      ],
      truncated: null,
    },
    tiers: liveLineageTiers,
  };

  it("unwraps + adapts the live lineage envelope through the app's client path", () => {
    const slice = adaptLineageSlice(unwrapEnvelope(live)) as LineageSlice;
    expect(slice.nodes).toHaveLength(2);
    expect(slice.nodes[0]).toMatchObject({
      id: "doc:2026-06-10-x-research",
      phase: "research",
      degree: 2,
    });
    // The numeric epoch-ms modified tick survives as a number, not a string.
    expect(slice.nodes[0].dates.modified).toBe(1718000000000);
    // The undated-modified node tolerates the absent optional.
    expect(slice.nodes[1].dates.modified).toBeUndefined();
    expect(slice.arcs).toHaveLength(1);
    expect(slice.arcs[0].derivation).toBeUndefined(); // graceful fallback
    expect(slice.tiers.semantic.available).toBe(false);
    expect(slice.truncated).toBeNull();
  });
});
