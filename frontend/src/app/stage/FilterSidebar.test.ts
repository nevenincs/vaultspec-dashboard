// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { dashboardFiltersWithFacetToggled } from "../../stores/server/dashboardState";
import type { FiltersVocabulary } from "../../stores/server/engine";
import { dashboardStateSessionIdentity, engineKeys } from "../../stores/server/queries";
import { queryClient } from "../../stores/server/queryClient";
import { DEFAULT_CHOICES } from "../../stores/view/filters";
import { createLiveClient, liveScope } from "../../testing/liveClient";
import { FilterSidebar } from "./FilterSidebar";

function vocabularyWithFeatureTags(featureTags: string[]): FiltersVocabulary {
  return {
    relations: [],
    tiers: [],
    doc_types: ["adr"],
    feature_tags: featureTags,
    kinds: [],
  };
}

function renderSidebar(scope: string) {
  return createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(FilterSidebar, {
      open: true,
      onClose: () => undefined,
      scope,
      hidden: { nodes: 0, edges: 0 },
    }),
  );
}

async function seedSidebarQueries(
  scope: string,
  vocabulary: FiltersVocabulary,
): Promise<void> {
  const client = createLiveClient();
  const session = await client.session();
  const sessionIdentity = dashboardStateSessionIdentity(session);
  const dashboardState = await client.dashboardState(scope);

  queryClient.setQueryData(engineKeys.session(), session);
  queryClient.setQueryData(
    engineKeys.dashboardState(scope, sessionIdentity),
    dashboardState,
  );
  queryClient.setQueryData(engineKeys.filters(scope), vocabulary);
}

describe("FilterSidebar facet toggle logic", () => {
  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  it("uses the canonical dashboard-state facet toggle helper", () => {
    const added = dashboardFiltersWithFacetToggled(
      { doc_types: ["adr"] },
      "feature_tags",
      "state",
    );
    expect(added).toEqual({
      doc_types: ["adr"],
      feature_tags: ["state"],
    });

    expect(dashboardFiltersWithFacetToggled(added, "feature_tags", "state")).toEqual({
      doc_types: ["adr"],
    });
  });

  it("keeps independent facet defaults empty", () => {
    const choices = structuredClone(DEFAULT_CHOICES);
    const filters = dashboardFiltersWithFacetToggled({}, "doc_types", "adr");
    expect(filters.doc_types).toEqual(["adr"]);
    expect(choices.docTypes).toEqual([]);
    expect(choices.featureTags).toEqual([]);
  });

  it("DEFAULT_CHOICES is the clear-all baseline", () => {
    expect(DEFAULT_CHOICES.relations).toEqual([]);
    expect(DEFAULT_CHOICES.docTypes).toEqual([]);
    expect(DEFAULT_CHOICES.featureTags).toEqual([]);
    expect(DEFAULT_CHOICES.textMatch).toBe("");
  });
});

describe("FilterSidebar topic search", () => {
  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  it("narrows the TOPIC facet list client-side as the topic search filters", async () => {
    const scope = await liveScope();
    await seedSidebarQueries(
      scope,
      vocabularyWithFeatureTags(["delta-sync", "design-system", "timeline"]),
    );

    render(renderSidebar(scope));

    // The unified flyout renders every topic flat (no collapse, no "+N more").
    expect(await screen.findByText("delta-sync")).toBeTruthy();
    expect(screen.getByText("design-system")).toBeTruthy();
    expect(screen.getByText("timeline")).toBeTruthy();

    // Typing in the in-section topic search narrows the list to matches only.
    fireEvent.change(screen.getByPlaceholderText("Search topics…"), {
      target: { value: "design" },
    });

    await waitFor(() => expect(screen.queryByText("delta-sync")).toBeNull());
    expect(screen.getByText("design-system")).toBeTruthy();
    expect(screen.queryByText("timeline")).toBeNull();
  });
});
