// @vitest-environment happy-dom
//
// The rail filter field is the ONE canonical filter surface (a FEATURE filter, not
// a semantic search). Its text write is canonical dashboard-state intent: it must
// preserve sibling filter facets (dashboard-state stores `filters` as one object),
// and the shared debounced draft must cancel a pending write on clear and when a
// canonical value lands from elsewhere.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

import { dashboardDocumentStateResetPatch } from "../../stores/server/dashboardState";
import { dashboardStateSessionIdentity, engineKeys } from "../../stores/server/queries";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { createLiveClient, liveScope } from "../../testing/liveClient";
import { RailFilterField } from "./RailFilterField";

const FILTER_LABEL = "filter the vault by feature";

let scope: string;
let docType: string;

beforeAll(async () => {
  scope = await liveScope();
  const slice = await createLiveClient().graphQuery({
    scope,
    granularity: "document",
  });
  docType =
    slice.nodes.find((node) => typeof node.doc_type === "string")?.doc_type ?? "adr";
});

beforeEach(async () => {
  queryClient.clear();
  useViewStore.getState().setScope(scope);
  await createLiveClient().patchDashboardState({
    ...dashboardDocumentStateResetPatch(scope),
    filters: { doc_types: [docType] },
  });
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

describe("RailFilterField (the canonical feature filter)", () => {
  it("writes canonical text without dropping existing dashboard filter facets", async () => {
    const session = await createLiveClient().session();
    const sessionIdentity = dashboardStateSessionIdentity(session);
    const initialState = await createLiveClient().dashboardState(scope);
    queryClient.setQueryData(engineKeys.session(), session);
    queryClient.setQueryData(
      engineKeys.dashboardState(scope, sessionIdentity),
      initialState,
    );

    render(
      createElement(QueryClientProvider, {
        client: queryClient,
        children: createElement(RailFilterField),
      }),
    );

    const input = await screen.findByLabelText(FILTER_LABEL);
    fireEvent.change(input, { target: { value: "edge text" } });

    await waitFor(async () => {
      const state = await createLiveClient().dashboardState(scope);
      expect(state.filters.text).toBe("edge text");
      expect(state.filters.doc_types).toEqual([docType]);
    });
  });

  it("clear cancels a pending rail text write", async () => {
    render(
      createElement(QueryClientProvider, {
        client: queryClient,
        children: createElement(RailFilterField),
      }),
    );

    const input = await screen.findByLabelText(FILTER_LABEL);
    fireEvent.change(input, { target: { value: "stale rail text" } });
    fireEvent.click(screen.getByRole("button", { name: "clear search" }));

    await waitFor(async () => {
      const state = await createLiveClient().dashboardState(scope);
      expect(state.filters.text).toBeUndefined();
    });

    await new Promise((resolve) => setTimeout(resolve, 260));

    const afterDebounceWindow = await createLiveClient().dashboardState(scope);
    expect(afterDebounceWindow.filters.text).toBeUndefined();
  });

  it("canonical text changes cancel a pending rail write", async () => {
    const session = await createLiveClient().session();
    const sessionIdentity = dashboardStateSessionIdentity(session);
    const initialState = await createLiveClient().dashboardState(scope);
    queryClient.setQueryData(engineKeys.session(), session);
    queryClient.setQueryData(
      engineKeys.dashboardState(scope, sessionIdentity),
      initialState,
    );

    render(
      createElement(QueryClientProvider, {
        client: queryClient,
        children: createElement(RailFilterField),
      }),
    );

    const input = (await screen.findByLabelText(FILTER_LABEL)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "stale browser text" } });

    const canonical = await createLiveClient().patchDashboardState({
      scope,
      filters: { text: "stage text wins" },
    });
    queryClient.setQueryData(
      engineKeys.dashboardState(scope, sessionIdentity),
      canonical,
    );

    await waitFor(() => expect(input.value).toBe("stage text wins"));
    await new Promise((resolve) => setTimeout(resolve, 260));

    const afterDebounceWindow = await createLiveClient().dashboardState(scope);
    expect(afterDebounceWindow.filters.text).toBe("stage text wins");
  });
});
