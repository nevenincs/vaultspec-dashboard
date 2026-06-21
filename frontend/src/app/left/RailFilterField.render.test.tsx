// @vitest-environment happy-dom
//
// The rail filter field is the ONE canonical filter surface (a FEATURE filter, not
// a semantic search). Its write is canonical dashboard-state intent on
// `filters.feature_query` (the backend glob/regex feature filter): a plain term
// becomes a substring glob, sibling filter facets are preserved (dashboard-state
// stores `filters` as one object), and the shared debounced draft cancels a pending
// write on clear and when a canonical value lands from elsewhere.

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
  it("writes a canonical feature query without dropping existing filter facets", async () => {
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
    // A plain term becomes a substring glob (`*edge*`) over feature tags.
    fireEvent.change(input, { target: { value: "edge" } });

    await waitFor(async () => {
      const state = await createLiveClient().dashboardState(scope);
      expect(state.filters.feature_query).toEqual({ value: "*edge*", mode: "glob" });
      expect(state.filters.doc_types).toEqual([docType]);
    });
  });

  it("clear cancels a pending feature-query write", async () => {
    render(
      createElement(QueryClientProvider, {
        client: queryClient,
        children: createElement(RailFilterField),
      }),
    );

    const input = await screen.findByLabelText(FILTER_LABEL);
    fireEvent.change(input, { target: { value: "stale" } });
    fireEvent.click(screen.getByRole("button", { name: "clear search" }));

    await waitFor(async () => {
      const state = await createLiveClient().dashboardState(scope);
      expect(state.filters.feature_query).toBeUndefined();
    });

    await new Promise((resolve) => setTimeout(resolve, 260));

    const afterDebounceWindow = await createLiveClient().dashboardState(scope);
    expect(afterDebounceWindow.filters.feature_query).toBeUndefined();
  });

  it("canonical feature-query changes re-seed the field echo", async () => {
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
    fireEvent.change(input, { target: { value: "stale" } });

    const canonical = await createLiveClient().patchDashboardState({
      scope,
      filters: { feature_query: { value: "winner", mode: "glob" } },
    });
    queryClient.setQueryData(
      engineKeys.dashboardState(scope, sessionIdentity),
      canonical,
    );

    // The field echoes the inverse text of the canonical glob ("winner").
    await waitFor(() => expect(input.value).toBe("winner"));
    await new Promise((resolve) => setTimeout(resolve, 260));

    const afterDebounceWindow = await createLiveClient().dashboardState(scope);
    expect(afterDebounceWindow.filters.feature_query).toEqual({
      value: "winner",
      mode: "glob",
    });
  });
});
