// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { liveTransport } from "../../../testing/liveClient";
import { engineClient } from "../engine";
import type { DashboardState, SessionState } from "../engine";
import {
  dashboardEditedWindowRange,
  dashboardGraphDefaultsInitializationIdentity,
  dashboardStateSessionIdentity,
  deriveDashboardDateRangeView,
  deriveDashboardFilterSidebarView,
  deriveDashboardFilterSummaryView,
  deriveDashboardGraphControlsView,
  deriveDashboardGraphDefaultsInitializationView,
  deriveDashboardPlayheadView,
  deriveDashboardRangeSelectView,
  deriveDashboardShellChromeView,
  deriveDashboardStageSceneView,
  deriveDashboardTimelineModeView,
  engineKeys,
  normalizeDashboardStateRequestIdentity,
  useDashboardFilterChoicesView,
  useDashboardFilterSidebarView,
  useDashboardGraphControlsView,
  useDashboardShellChromeView,
  useDashboardStageSceneView,
  useDashboardState,
  useDashboardTimelineModeView,
} from "./index";
import { dashboardState, sessionState, testQueryClient, wrapper } from "./testFixtures";

afterEach(() => {
  engineClient.useTransport(liveTransport);
});

describe("deriveDashboardDateRangeView (dashboard date display)", () => {
  const fallback = {
    fromMs: Date.parse("2026-06-01T00:00:00.000Z"),
    toMs: Date.parse("2026-06-30T00:00:00.000Z"),
  };

  it("uses the canonical dashboard date range when both ends are present", () => {
    expect(
      deriveDashboardDateRangeView({ from: "2026-06-10", to: "2026-06-18" }, fallback),
    ).toEqual({
      fromMs: Date.parse("2026-06-10"),
      toMs: Date.parse("2026-06-18"),
      source: "dashboard",
    });
  });

  it("falls back to the visible window when dashboard date intent is incomplete", () => {
    expect(deriveDashboardDateRangeView({ from: "2026-06-10" }, fallback)).toEqual({
      ...fallback,
      source: "fallback",
    });
    expect(deriveDashboardDateRangeView(undefined, fallback)).toEqual({
      ...fallback,
      source: "fallback",
    });
  });

  it("normalizes dashboard date range before parsing display ticks", () => {
    expect(
      deriveDashboardDateRangeView({ from: "2026-06-30", to: "2026-06-01" }, fallback),
    ).toEqual({
      fromMs: Date.parse("2026-06-01"),
      toMs: Date.parse("2026-06-30"),
      source: "dashboard",
    });
    expect(
      deriveDashboardDateRangeView(
        { from: "2026-06-01T00:00:00Z", to: "2026-06-30" },
        fallback,
      ),
    ).toEqual({
      fromMs: Date.parse("2026-06-01"),
      toMs: Date.parse("2026-06-30"),
      source: "dashboard",
    });
  });
});

describe("deriveDashboardFilterSummaryView (stage filter toolbar)", () => {
  it("counts active advanced-flyout facets for the Filters button badge", () => {
    expect(
      deriveDashboardFilterSummaryView({
        filters: {
          doc_types: ["adr", "plan"],
          feature_tags: ["state"],
          statuses: ["accepted"],
          health: ["dangling"],
          relations: ["references"],
          structural_state: ["broken"],
          // The feature query is the search bar's own state, not an advanced
          // facet — it must NOT be counted on the Filters button badge.
          feature_query: { value: "*centralize*", mode: "glob" },
        },
        date_range: {},
      }),
    ).toEqual({
      activeFilterCount: 7,
      dateRangeLabel: null,
    });
  });

  it("formats the timeline date chip without adding it to the facet badge count", () => {
    expect(
      deriveDashboardFilterSummaryView({
        filters: {},
        date_range: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-18" },
      }),
    ).toEqual({
      activeFilterCount: 0,
      dateRangeLabel: "2026-06-01 → 2026-06-18",
    });
  });

  it("keeps the empty summary stable before dashboard state loads", () => {
    expect(deriveDashboardFilterSummaryView(undefined)).toEqual({
      activeFilterCount: 0,
      dateRangeLabel: null,
    });
  });
});

describe("deriveDashboardFilterSidebarView (stage filter sidebar)", () => {
  const now = Date.parse("2026-06-18T12:00:00.000Z");

  it("projects canonical dashboard filters into selected facets and active badges", () => {
    const view = deriveDashboardFilterSidebarView(
      {
        filters: {
          doc_types: ["adr"],
          feature_tags: ["state", "filters"],
          text: "centralize",
        },
        date_range: dashboardEditedWindowRange("7d", now),
      },
      now,
    );

    expect(view.docTypes).toEqual(["adr"]);
    expect(view.featureTags).toEqual(["state", "filters"]);
    expect(view.editedWindow).toBe("7d");
    expect(view.editedWindowRows).toEqual([
      {
        key: "any",
        label: "Any time",
        active: false,
        inputClassName: "accent-accent",
        labelClassName:
          "flex cursor-pointer items-center gap-fg-2 rounded-fg-xs px-fg-1 py-fg-0-5 text-label hover:bg-paper-sunken",
        valueClassName: "text-ink-muted",
      },
      {
        key: "7d",
        label: "Last 7 days",
        active: true,
        inputClassName: "accent-accent",
        labelClassName:
          "flex cursor-pointer items-center gap-fg-2 rounded-fg-xs px-fg-1 py-fg-0-5 text-label hover:bg-paper-sunken",
        valueClassName: "text-ink",
      },
      {
        key: "30d",
        label: "Last 30 days",
        active: false,
        inputClassName: "accent-accent",
        labelClassName:
          "flex cursor-pointer items-center gap-fg-2 rounded-fg-xs px-fg-1 py-fg-0-5 text-label hover:bg-paper-sunken",
        valueClassName: "text-ink-muted",
      },
      {
        key: "year",
        label: "This year",
        active: false,
        inputClassName: "accent-accent",
        labelClassName:
          "flex cursor-pointer items-center gap-fg-2 rounded-fg-xs px-fg-1 py-fg-0-5 text-label hover:bg-paper-sunken",
        valueClassName: "text-ink-muted",
      },
    ]);
    expect(view.dateActive).toBe(true);
    expect(view.anyActive).toBe(true);
    expect(view.presentation).toMatchObject({
      panelAriaLabel: "filter panel",
      panelClassName: "pointer-events-auto fixed z-50",
      headerClassName:
        "flex items-center justify-between border-b border-rule px-fg-3 py-fg-1-5",
      titleClassName: "text-body font-medium text-ink",
      headerActionsClassName: "flex items-center gap-fg-2",
      titleLabel: "Filter documents",
      clearAllClassName:
        "text-caption text-accent-text underline-offset-2 hover:underline",
      clearAllLabel: "Clear all",
      clearAllAriaLabel: "clear all filters",
      closeButtonClassName:
        "rounded-fg-xs p-fg-0-5 text-ink-faint hover:bg-paper-sunken hover:text-ink",
      closeAriaLabel: "close filter panel",
      sectionClassName: "border-b border-rule",
      sectionButtonClassName:
        "flex w-full items-center justify-between px-fg-3 py-fg-1-5 text-left text-label font-medium tracking-wider text-ink-muted hover:bg-paper-sunken",
      sectionMetaClassName: "flex items-center gap-fg-1-5",
      sectionBadgeClassName:
        "rounded-fg-pill bg-paper-sunken px-fg-1-5 py-fg-0-5 text-caption font-normal text-ink-muted",
      sectionIconClassName: "text-ink-faint",
      sectionBodyClassName: "pb-2",
      kindSectionLabel: "Type",
      featureSectionLabel: "Feature",
      editedSectionLabel: "Edited",
      editedWindowAriaLabel: "edited window",
      facetEmptyClassName: "px-fg-3 py-fg-1 text-label italic text-ink-faint",
      facetListClassName: "space-y-fg-0-5 px-fg-3",
      facetOverflowButtonClassName:
        "ml-fg-1 text-label text-ink-faint underline hover:text-ink-muted",
      footerClassName: "border-t border-rule px-fg-3 py-fg-1-5",
      footerTextClassName: "text-label text-state-stale",
      editedWindows: [
        { key: "any", label: "Any time" },
        { key: "7d", label: "Last 7 days" },
        { key: "30d", label: "Last 30 days" },
        { key: "year", label: "This year" },
      ],
    });
  });

  it("treats top-level dashboard date range as active filter intent", () => {
    expect(deriveDashboardFilterSidebarView(undefined, now)).toMatchObject({
      docTypes: [],
      featureTags: [],
      editedWindow: "any",
      dateActive: false,
      anyActive: false,
    });
    expect(
      deriveDashboardFilterSidebarView(
        { filters: {}, date_range: { from: "2026-06-01", to: "2026-06-30" } },
        now,
      ),
    ).toMatchObject({
      editedWindow: "any",
      dateActive: true,
      anyActive: true,
    });
  });
});

describe("deriveDashboardTimelineModeView (timeline-mode consumers)", () => {
  it("treats missing and live timeline mode as live operation state", () => {
    expect(deriveDashboardTimelineModeView(undefined)).toEqual({
      mode: { kind: "live" },
      timeTravel: false,
      opsDisabled: false,
      asOf: undefined,
    });
    expect(deriveDashboardTimelineModeView({ kind: "live" })).toEqual({
      mode: { kind: "live" },
      timeTravel: false,
      opsDisabled: false,
      asOf: undefined,
    });
  });

  it("derives historical asOf and operation disablement from one mode reading", () => {
    expect(deriveDashboardTimelineModeView({ kind: "time-travel", at: 42 })).toEqual({
      mode: { kind: "time-travel", at: 42 },
      timeTravel: true,
      opsDisabled: true,
      asOf: 42,
    });
  });
});

describe("deriveDashboardGraphControlsView (stage graph controls)", () => {
  it("projects graph bounds and live Network freeze availability from dashboard-state", () => {
    expect(
      deriveDashboardGraphControlsView({
        graph_bounds: { shape: "rect", size: 1800 },
        representation_mode: "connectivity",
        timeline_mode: { kind: "live" },
        graph_granularity: "feature",
      }),
    ).toEqual({
      graphBounds: { shape: "rect", size: 1800 },
      timeline: {
        mode: { kind: "live" },
        timeTravel: false,
        opsDisabled: false,
        asOf: undefined,
      },
      representationMode: "connectivity",
      freezeAvailable: true,
      granularity: "feature",
    });
  });

  it("falls back to free bounds and disables freeze outside live Network", () => {
    expect(deriveDashboardGraphControlsView(undefined)).toMatchObject({
      graphBounds: { shape: "free", size: 0 },
      representationMode: "connectivity",
      freezeAvailable: true,
    });

    expect(
      deriveDashboardGraphControlsView({
        graph_bounds: { shape: "circle", size: 1200 },
        representation_mode: "lineage",
        timeline_mode: { kind: "live" },
        graph_granularity: "document",
      }).freezeAvailable,
    ).toBe(false);

    expect(
      deriveDashboardGraphControlsView({
        graph_bounds: { shape: "circle", size: 1200 },
        representation_mode: "connectivity",
        timeline_mode: { kind: "time-travel", at: 42 },
        graph_granularity: "document",
      }).freezeAvailable,
    ).toBe(false);
  });

  it("normalizes malformed graph bounds before graph controls consume them", () => {
    expect(
      deriveDashboardGraphControlsView({
        graph_bounds: { shape: "rect", size: Number.NaN },
        representation_mode: "connectivity",
        timeline_mode: { kind: "live" },
        graph_granularity: "document",
      }).graphBounds,
    ).toEqual({ shape: "rect", size: 0 });

    expect(
      deriveDashboardGraphControlsView({
        graph_bounds: { shape: "hex" as "circle", size: 1200 },
        representation_mode: "connectivity",
        timeline_mode: { kind: "live" },
        graph_granularity: "document",
      }).graphBounds,
    ).toEqual({ shape: "free", size: 0 });
  });
});

describe("deriveDashboardStageSceneView (Stage scene owner)", () => {
  const state: DashboardState = {
    scope: "scope-a",
    selected_ids: ["node:a", "node:b"],
    hovered_id: null,
    filters: {
      doc_types: ["adr"],
      tiers: { structural: false },
      feature_query: { value: "state-*", mode: "glob" },
      statuses: ["draft"],
      plan_tiers: ["wave-1"],
      health: ["orphaned"],
      text: "centralize",
    },
    date_range: { from: "2026-06-01", to: "2026-06-18" },
    timeline_mode: { kind: "time-travel", at: 42 },
    graph_granularity: "document",
    corpus: "vault",
    salience_lens: "design",
    salience_focus: "node:a",
    representation_mode: "lineage",
    panel_state: {
      left_collapsed: false,
      right_collapsed: false,
      right_tab: "status",
    },
    graph_bounds: { shape: "rect", size: 1200 },
    tiers: {},
  };

  it("projects the scene read model from the canonical dashboard state", () => {
    expect(deriveDashboardStageSceneView(state)).toEqual({
      selectedIds: ["node:a", "node:b"],
      selectedNodeId: "node:a",
      graphQuery: {
        scope: "scope-a",
        filter: {
          doc_types: ["adr"],
          tiers: { structural: false },
          feature_query: { value: "state-*", mode: "glob" },
          statuses: ["draft"],
          plan_tiers: ["wave-1"],
          health: ["orphaned"],
          text: "centralize",
          date_range: { from: "2026-06-01", to: "2026-06-18" },
        },
        asOf: 42,
        granularity: "document",
        lens: "design",
        focus: "node:a",
        corpus: "vault",
      },
      granularity: "document",
      activeRepresentationMode: "lineage",
      graphBounds: { shape: "rect", size: 1200 },
      timeline: {
        mode: { kind: "time-travel", at: 42 },
        timeTravel: true,
        opsDisabled: true,
        asOf: 42,
      },
      liveTimeline: false,
    });
  });

  it("falls back without issuing a graph query before dashboard state loads", () => {
    expect(deriveDashboardStageSceneView(undefined)).toEqual({
      selectedIds: [],
      selectedNodeId: null,
      graphQuery: null,
      granularity: "feature",
      activeRepresentationMode: "connectivity",
      graphBounds: undefined,
      timeline: {
        mode: { kind: "live" },
        timeTravel: false,
        opsDisabled: false,
        asOf: undefined,
      },
      liveTimeline: true,
    });
  });

  it("normalizes graph bounds before the Stage scene-owner view consumes them", () => {
    expect(
      deriveDashboardStageSceneView({
        ...state,
        graph_bounds: { shape: "circle", size: Number.NEGATIVE_INFINITY },
      }).graphBounds,
    ).toEqual({ shape: "circle", size: 0 });

    expect(
      deriveDashboardStageSceneView({
        ...state,
        graph_bounds: { shape: "invalid" as "rect", size: 100 },
      }).graphBounds,
    ).toEqual({ shape: "free", size: 0 });
  });

  it("normalizes representation mode before the Stage scene-owner view consumes it", () => {
    expect(
      deriveDashboardStageSceneView({
        ...state,
        representation_mode: "invalid" as "connectivity",
      }).activeRepresentationMode,
    ).toBe("connectivity");
  });
});

describe("deriveDashboardRangeSelectView (timeline range selector)", () => {
  it("clones the committed dashboard date range for the range band", () => {
    const source = { date_range: { from: "2026-06-01", to: "2026-06-18" } };
    const view = deriveDashboardRangeSelectView(source);

    expect(view).toEqual({
      dateRange: { from: "2026-06-01", to: "2026-06-18" },
    });
    expect(view.dateRange).not.toBe(source.date_range);
  });

  it("normalizes committed dashboard date range for the range band", () => {
    expect(
      deriveDashboardRangeSelectView({
        date_range: { from: "2026-06-30", to: "2026-06-01" },
      }),
    ).toEqual({
      dateRange: { from: "2026-06-01", to: "2026-06-30" },
    });
  });

  it("falls back to an empty committed range before dashboard state loads", () => {
    expect(deriveDashboardRangeSelectView(undefined)).toEqual({
      dateRange: {},
    });
  });
});

describe("deriveDashboardGraphDefaultsInitializationView (settings effects)", () => {
  it("marks a loaded fresh dashboard-state scope as eligible for graph defaults", () => {
    expect(
      deriveDashboardGraphDefaultsInitializationView(
        {
          graph_granularity: "feature",
          filters: {},
        },
        "scope-session",
      ),
    ).toEqual({ loaded: true, fresh: true, identity: "scope-session" });
  });

  it("rejects unloaded or user-owned dashboard graph/filter intent", () => {
    expect(deriveDashboardGraphDefaultsInitializationView(undefined)).toEqual({
      loaded: false,
      fresh: false,
      identity: null,
    });
    expect(
      deriveDashboardGraphDefaultsInitializationView({
        graph_granularity: "document",
        filters: {},
      }),
    ).toEqual({ loaded: true, fresh: false, identity: null });
    expect(
      deriveDashboardGraphDefaultsInitializationView({
        graph_granularity: "feature",
        filters: { text: "user-owned" },
      }),
    ).toEqual({ loaded: true, fresh: false, identity: null });
  });

  it("keys graph-default initialization by scope plus session identity", () => {
    const sessionA = sessionState("scope-a");
    const sessionB: SessionState = {
      ...sessionA,
      active_workspace: "workspace-b",
      workspace: "workspace-b",
    };

    expect(
      dashboardGraphDefaultsInitializationIdentity("scope-a", sessionA),
    ).not.toEqual(dashboardGraphDefaultsInitializationIdentity("scope-a", sessionB));
    expect(dashboardGraphDefaultsInitializationIdentity(null, sessionA)).toBeNull();
    expect(
      dashboardGraphDefaultsInitializationIdentity("scope-a", undefined),
    ).toBeNull();
    expect(dashboardGraphDefaultsInitializationIdentity(" scope-a ", sessionA)).toEqual(
      dashboardGraphDefaultsInitializationIdentity("scope-a", sessionA),
    );
    expect(
      dashboardGraphDefaultsInitializationIdentity({ scope: "scope-a" }, sessionA),
    ).toBeNull();
  });
});

describe("useDashboardState cache boundaries", () => {
  it("normalizes dashboard-state request identity at the stores boundary", () => {
    const session = sessionState("scope-a");

    expect(normalizeDashboardStateRequestIdentity(" scope-a ", session)).toEqual({
      scope: "scope-a",
      sessionIdentity: dashboardStateSessionIdentity(session),
    });
    expect(normalizeDashboardStateRequestIdentity("", session).scope).toBeNull();
    expect(
      normalizeDashboardStateRequestIdentity({ scope: "scope-a" } as unknown, session)
        .scope,
    ).toBeNull();
  });

  it("does not expose cached dashboard intent when no scope is selected", () => {
    const client = testQueryClient();
    const session = sessionState("scope-a");
    const sessionIdentity = dashboardStateSessionIdentity(session);
    client.setQueryData(engineKeys.session(), session);
    client.setQueryData(
      engineKeys.dashboardState("", sessionIdentity),
      dashboardState(""),
    );

    const { result } = renderHook(() => useDashboardState(null), {
      wrapper: wrapper(client),
    });

    expect(result.current.data).toBeUndefined();
  });

  it("does not expose cached dashboard intent for malformed runtime scope", () => {
    const client = testQueryClient();
    const session = sessionState("scope-a");
    const sessionIdentity = dashboardStateSessionIdentity(session);
    client.setQueryData(engineKeys.session(), session);
    client.setQueryData(
      engineKeys.dashboardState("", sessionIdentity),
      dashboardState(""),
    );

    const { result } = renderHook(() => useDashboardState({ scope: "scope-a" }), {
      wrapper: wrapper(client),
    });

    expect(result.current.data).toBeUndefined();
  });

  it("does not expose cached dashboard intent through derived selectors for malformed runtime scope", () => {
    const client = testQueryClient();
    const session = sessionState("scope-a");
    const sessionIdentity = dashboardStateSessionIdentity(session);
    client.setQueryData(engineKeys.session(), session);
    client.setQueryData(engineKeys.dashboardState("", sessionIdentity), {
      ...dashboardState(""),
      selected_ids: ["doc:cached"],
      filters: { text: "cached-filter", feature_tags: ["cached"] },
      date_range: { from: "2026-06-01", to: "2026-06-18" },
      timeline_mode: { kind: "time-travel", at: 42 },
      graph_bounds: { shape: "circle", size: 900 },
      representation_mode: "radial",
      salience_lens: "design",
    });

    const stage = renderHook(() => useDashboardStageSceneView({ scope: "scope-a" }), {
      wrapper: wrapper(client),
    });
    expect(stage.result.current).toMatchObject({
      selectedIds: [],
      selectedNodeId: null,
      graphQuery: null,
      granularity: "feature",
      activeRepresentationMode: "connectivity",
      graphBounds: undefined,
      liveTimeline: true,
    });

    const graphControls = renderHook(
      () => useDashboardGraphControlsView({ scope: "scope-a" }),
      { wrapper: wrapper(client) },
    );
    expect(graphControls.result.current).toMatchObject({
      graphBounds: { shape: "free", size: 0 },
      representationMode: "connectivity",
      freezeAvailable: true,
      timeline: { timeTravel: false },
    });

    const filterChoices = renderHook(
      () => useDashboardFilterChoicesView({ scope: "scope-a" }),
      { wrapper: wrapper(client) },
    );
    expect(filterChoices.result.current).toMatchObject({
      loaded: false,
      choices: {
        featureTags: [],
        textMatch: "",
        dateRange: {},
      },
    });

    const sidebar = renderHook(
      () => useDashboardFilterSidebarView({ scope: "scope-a" }),
      { wrapper: wrapper(client) },
    );
    expect(sidebar.result.current).toMatchObject({
      filters: {},
      dateRange: {},
      anyActive: false,
    });

    const timeline = renderHook(
      () => useDashboardTimelineModeView({ scope: "scope-a" }),
      { wrapper: wrapper(client) },
    );
    expect(timeline.result.current).toEqual({
      mode: { kind: "live" },
      timeTravel: false,
      opsDisabled: false,
      asOf: undefined,
    });
  });

  it("does not expose cached dashboard intent while session identity is pending", () => {
    const client = testQueryClient();
    client.setQueryDefaults(engineKeys.session(), { enabled: false });
    client.setQueryData(
      engineKeys.dashboardState("scope-a", dashboardStateSessionIdentity(undefined)),
      dashboardState("scope-a"),
    );

    const { result } = renderHook(() => useDashboardState("scope-a"), {
      wrapper: wrapper(client),
    });

    expect(result.current.data).toBeUndefined();
  });
});

describe("deriveDashboardPlayheadView (timeline playhead)", () => {
  it("projects live and historical dashboard timeline modes to playhead state", () => {
    expect(deriveDashboardPlayheadView({ timeline_mode: { kind: "live" } })).toEqual({
      loaded: true,
      playhead: "live",
    });
    expect(
      deriveDashboardPlayheadView({ timeline_mode: { kind: "time-travel", at: 42 } }),
    ).toEqual({
      loaded: true,
      playhead: 42,
    });
  });

  it("marks an unloaded dashboard read without forcing a local playhead reset", () => {
    expect(deriveDashboardPlayheadView(undefined)).toEqual({
      loaded: false,
      playhead: "live",
    });
  });
});

describe("deriveDashboardShellChromeView (AppShell chrome)", () => {
  it("falls back to expanded panels and live mode before dashboard state loads", () => {
    expect(deriveDashboardShellChromeView(undefined)).toEqual({
      panelState: {
        left_collapsed: false,
        right_collapsed: false,
        right_tab: "status",
      },
      timeline: {
        mode: { kind: "live" },
        timeTravel: false,
        opsDisabled: false,
        asOf: undefined,
      },
    });
  });

  it("projects panel collapse/tab state and interpreted time-travel mode", () => {
    expect(
      deriveDashboardShellChromeView({
        panel_state: {
          left_collapsed: true,
          right_collapsed: true,
          right_tab: "changes",
        },
        timeline_mode: { kind: "time-travel", at: 123 },
      }),
    ).toEqual({
      panelState: {
        left_collapsed: true,
        right_collapsed: true,
        right_tab: "changes",
      },
      timeline: {
        mode: { kind: "time-travel", at: 123 },
        timeTravel: true,
        opsDisabled: true,
        asOf: 123,
      },
    });
  });

  it("normalizes malformed panel state before AppShell chrome consumes it", () => {
    expect(
      deriveDashboardShellChromeView({
        panel_state: {
          left_collapsed: "yes" as unknown as boolean,
          right_collapsed: true,
          right_tab: "invalid" as "status",
        },
        timeline_mode: { kind: "live" },
      }),
    ).toMatchObject({
      panelState: {
        left_collapsed: false,
        right_collapsed: true,
        right_tab: "status",
      },
    });
  });

  it("normalizes runtime scope before shell chrome subscribes to dashboard state", () => {
    const client = testQueryClient();
    const session = sessionState("scope-a");
    const sessionIdentity = dashboardStateSessionIdentity(session);
    client.setQueryData(engineKeys.session(), session);
    client.setQueryData(engineKeys.dashboardState("", sessionIdentity), {
      ...dashboardState(""),
      panel_state: {
        left_collapsed: true,
        right_collapsed: true,
        right_tab: "search",
      },
    });

    const { result } = renderHook(
      () => useDashboardShellChromeView({ scope: "scope-a" }),
      { wrapper: wrapper(client) },
    );

    expect(result.current.panelState).toEqual({
      left_collapsed: false,
      right_collapsed: false,
      right_tab: "status",
    });
  });
});
