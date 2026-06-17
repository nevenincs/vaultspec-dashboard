// @vitest-environment happy-dom
//
// Changes tab (binding ActivityRail Changes state, Figma 244:751): the board's
// working-tree pane — a "<N> files · <M> documents +A −D" summary over two flat
// lists ("changed files" / "changed documents"), each row opening its source or
// reader. Exercised through the REAL stores client transport (mockEngine), no
// component doubles. Git state is read through the stores seam (never the raw
// tiers block); git is NOT a tier, so availability tracks the git payload.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { MockEngine, MOCK_SCOPE } from "../../testing/mockEngine";
import { ChangesOverview } from "./ChangesOverview";

function renderChanges() {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ChangesOverview),
    ),
  );
}

describe("ChangesOverview — board Changes tab (244:751)", () => {
  beforeEach(() => {
    useViewStore.getState().setScope(MOCK_SCOPE);
    useViewStore.getState().select(null);
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    useViewStore.getState().setScope(null);
    useViewStore.getState().select(null);
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("shows an approachable clean-tree state with no changed lists when the tree is clean", async () => {
    const mock = new MockEngine();
    mock.setGitDirty(false);
    engineClient.useTransport(mock.fetchImpl);
    renderChanges();
    await waitFor(() => {
      const clean = document.querySelector("[data-git-clean]");
      expect(clean?.textContent).toMatch(/working tree clean/i);
    });
    expect(document.querySelector("[data-working-changes]")).toBeNull();
    expect(document.querySelector("[data-changed-documents]")).toBeNull();
    expect(document.querySelector("[data-changes-summary]")).toBeNull();
  });

  it("renders the summary line and the changed lists for a dirty working tree", async () => {
    const mock = new MockEngine();
    mock.setGitDirty(true);
    engineClient.useTransport(mock.fetchImpl);
    renderChanges();
    // The summary line ("<N> files · <M> documents +A −D") appears once changes load.
    const summary = await waitFor(() => {
      const el = document.querySelector("[data-changes-summary]");
      expect(el).toBeTruthy();
      return el!;
    });
    expect(summary.textContent).toMatch(/document/);
    // The dirty fixture is a vault plan doc → it lands in the changed-documents
    // list (board "open reader"), rendered as a readable title row.
    const docs = await screen.findByRole("list", { name: "changed documents" });
    expect(docs.querySelectorAll("li").length).toBeGreaterThan(0);
    // The summary totals the numstat with the sacred diff hues (+adds / −dels).
    expect(summary.textContent).toMatch(/\+\d/);
  });
});
