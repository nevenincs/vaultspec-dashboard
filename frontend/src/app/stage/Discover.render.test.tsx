// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { queryClient } from "../../stores/server/queryClient";
import { resetDiscoveryPanel } from "../../stores/view/discoveries";
import { createLiveClient, liveScope } from "../../testing/liveClient";
import { Discover } from "./Discover";

function discoverLabel(id: string): string {
  return `discovery — ${id.replace(/^(feature|doc):/, "")}`;
}

function renderDiscover(selectedId: string | null, scope: string | null) {
  return (
    <QueryClientProvider client={queryClient}>
      <Discover selectedId={selectedId} scope={scope} />
    </QueryClientProvider>
  );
}

describe("Discover", () => {
  let scope: string;
  let firstNodeId: string;
  let secondNodeId: string;

  beforeAll(async () => {
    scope = await liveScope();
    const slice = await createLiveClient().graphQuery({
      scope,
      granularity: "document",
    });
    const nodes = slice.nodes.map((node) => node.id);
    if (nodes.length < 2) {
      throw new Error("live Discover test fixture needs at least two graph nodes");
    }
    firstNodeId = nodes[0]!;
    secondNodeId = nodes.find((id) => id !== firstNodeId)!;
  });

  afterEach(() => {
    cleanup();
    resetDiscoveryPanel();
    queryClient.clear();
  });

  it("rekeys an open discovery panel when canonical selection changes", async () => {
    const { rerender } = render(renderDiscover(firstNodeId, scope));

    fireEvent.click(screen.getByRole("button", { name: /discover related/i }));

    await screen.findByRole("dialog", { name: /semantic discovery/i });
    expect(screen.getByText(discoverLabel(firstNodeId))).toBeTruthy();

    rerender(renderDiscover(secondNodeId, scope));

    await waitFor(() =>
      expect(screen.getByText(discoverLabel(secondNodeId))).toBeTruthy(),
    );
  });
});
