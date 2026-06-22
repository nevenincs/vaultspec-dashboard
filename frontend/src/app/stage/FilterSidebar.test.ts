// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
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

describe("FilterSidebar advanced flyout (no FEATURE section)", () => {
  afterEach(() => {
    cleanup();
    queryClient.clear();
    document.body.innerHTML = "";
  });

  it("opens anchored to the rail Filters button and hosts no feature control", async () => {
    // The flyout portals to <body> and anchors to the rail's Filters button; a
    // stand-in trigger lets `useFlyoutAnchor` measure a rect and render.
    const trigger = document.createElement("button");
    trigger.setAttribute("data-rail-filter-trigger", "");
    document.body.appendChild(trigger);

    const scope = await liveScope();
    await seedSidebarQueries(
      scope,
      vocabularyWithFeatureTags(["delta-sync", "design-system", "timeline"]),
    );

    render(renderSidebar(scope));

    // The advanced flyout renders (panel title is always present); FEATURE filtering
    // is no longer here — there is no in-flyout feature search field, and category
    // (Type) + date (Edited) sections are gone (legend + timeline own those).
    expect(await screen.findByText("Filter documents")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Search features…")).toBeNull();
    expect(screen.queryByText("delta-sync")).toBeNull();
  });
});
