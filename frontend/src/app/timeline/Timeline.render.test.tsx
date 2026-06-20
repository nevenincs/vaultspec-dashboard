// @vitest-environment happy-dom
//
// Dashboard-state centralization S41: a date range written by the timeline
// RangeSelect must be the same canonical dashboard-state value read by timeline
// controls and by graph query variable projection. The test runs against the live
// engine and TanStack hooks; no local state double is involved.

import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  dashboardDocumentStateResetPatch,
  dashboardGraphQueryVariables,
} from "../../stores/server/dashboardState";
import {
  dashboardStateSessionIdentity,
  engineKeys,
  useDashboardState,
} from "../../stores/server/queries";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import {
  createLiveClient,
  liveDegradedScope,
  liveScope,
} from "../../testing/liveClient";
import { useActiveScope } from "../../stores/server/queries";
import { formatDayMonth } from "./TimelineControls";
import { RangeSelect, dashboardDateString, rangeFromDrag } from "./RangeSelect";
import { DEFAULT_PX_PER_MS, useTimelineStore } from "../../stores/view/timeline";

function GraphDateRangeProjection() {
  const scope = useActiveScope();
  const dashboardState = useDashboardState(scope);
  const variables = dashboardState.data
    ? dashboardGraphQueryVariables(dashboardState.data)
    : null;
  const range = variables?.filter.date_range;
  return (
    <output aria-label="graph date range">
      {range?.from ?? ""}|{range?.to ?? ""}
    </output>
  );
}

function PanelDateRangeProjection() {
  const scope = useActiveScope();
  const dashboardState = useDashboardState(scope);
  const range = dashboardState.data?.date_range;
  const from = range?.from ? formatDayMonth(Date.parse(range.from)) : "";
  const to = range?.to ? formatDayMonth(Date.parse(range.to)) : "";
  return (
    <output aria-label="panel date range">
      {from}|{to}
    </output>
  );
}

function TimelineDateRangeHarness() {
  return (
    <QueryClientProvider client={queryClient}>
      <PanelDateRangeProjection />
      <div data-testid="timeline-drag-host">
        <RangeSelect />
      </div>
      <GraphDateRangeProjection />
    </QueryClientProvider>
  );
}

let scope: string;
let alternateScope: string;

beforeAll(async () => {
  scope = await liveScope();
  alternateScope = await liveDegradedScope();
});

beforeEach(async () => {
  queryClient.clear();
  useViewStore.getState().setScope(scope);
  useTimelineStore.getState().setPxPerMs(DEFAULT_PX_PER_MS);
  useTimelineStore.getState().setScrollOffset(0);
  await createLiveClient().patchDashboardState(dashboardDocumentStateResetPatch(scope));
});

afterEach(async () => {
  cleanup();
  queryClient.clear();
  await createLiveClient()
    .patchDashboardState(dashboardDocumentStateResetPatch(scope))
    .catch(() => undefined);
});

afterAll(() => {
  useViewStore.getState().setScope(null);
});

describe("Timeline date-range state synchronization", () => {
  it("propagates a timeline drag range to graph variables and panel readers", async () => {
    const session = await createLiveClient().session();
    const sessionIdentity = dashboardStateSessionIdentity(session);
    const initialState = await createLiveClient().dashboardState(scope);
    queryClient.setQueryData(engineKeys.session(), session);
    queryClient.setQueryData(
      engineKeys.dashboardState(scope, sessionIdentity),
      initialState,
    );
    render(createElement(TimelineDateRangeHarness));

    const host = screen.getByTestId("timeline-drag-host");
    const scale = useTimelineStore.getState().pxPerMs;
    const scrollOffset = useTimelineStore.getState().scrollOffset;
    const selected = rangeFromDrag(100, 300, scale, scrollOffset);
    const expected = {
      from: dashboardDateString(selected.fromMs),
      to: dashboardDateString(selected.toMs),
    };

    fireEvent.pointerDown(host, { clientX: 100, shiftKey: true });
    fireEvent.pointerMove(globalThis as unknown as Window, { clientX: 300 });
    fireEvent.pointerUp(globalThis as unknown as Window, { clientX: 300 });

    await waitFor(() => {
      expect(screen.getByLabelText("graph date range").textContent).toBe(
        `${expected.from}|${expected.to}`,
      );
    });

    const panelText = `${formatDayMonth(selected.fromMs)}|${formatDayMonth(selected.toMs)}`;
    expect(screen.getByLabelText("panel date range").textContent).toBe(panelText);
    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      date_range: expected,
    });
  });

  it("clears an in-progress range drag when the active scope changes", async () => {
    const session = await createLiveClient().session();
    const sessionIdentity = dashboardStateSessionIdentity(session);
    const initialState = await createLiveClient().dashboardState(scope);
    queryClient.setQueryData(engineKeys.session(), session);
    queryClient.setQueryData(
      engineKeys.dashboardState(scope, sessionIdentity),
      initialState,
    );
    const { container } = render(createElement(TimelineDateRangeHarness));

    const host = screen.getByTestId("timeline-drag-host");
    fireEvent.pointerDown(host, { clientX: 100, shiftKey: true });
    fireEvent.pointerMove(globalThis as unknown as Window, { clientX: 300 });

    await waitFor(() => {
      expect(container.querySelector("[data-range-band]")).toBeTruthy();
    });

    act(() => {
      useViewStore.getState().setScope(alternateScope);
    });

    await waitFor(() => {
      expect(container.querySelector("[data-range-band]")).toBeNull();
    });
  });
});
