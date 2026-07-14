// @vitest-environment happy-dom
//
// Panels guard (rag-job-dashboard W03.P05.S14). The Search service control panel is
// the rag job dashboard, NOT the retired rail console: this pins that ControlPanels
// mounts the wide dashboard shell with all three body regions (jobs, log, footer)
// when the search-service panel is open. The console composition was deleted
// outright (no-deprecation-bridges), so its markers must be absent. Runs online
// against the real `vaultspec serve` fixture — structure only, never asserting the
// fixture's live rag lifecycle state.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { queryClient } from "../../stores/server/queryClient";
import { closeControlPanel, openControlPanel } from "../../stores/view/controlPanels";
import { ControlPanels } from "./ControlPanels";

afterEach(() => {
  closeControlPanel();
  cleanup();
});

describe("ControlPanels — Search service panel is the rag job dashboard", () => {
  it("mounts the dashboard shell with all three regions and the footer", () => {
    openControlPanel("search-service");
    const { container } = render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(ControlPanels),
      ),
    );

    // The wide dashboard shell mounts (not the glance console).
    expect(container.querySelector("[data-rag-job-dashboard]")).toBeTruthy();
    expect(container.querySelector("[data-rag-dashboard-header]")).toBeTruthy();

    // All three regions mount: jobs + log in the body, footer in the Dialog's
    // pinned footer slot.
    expect(container.querySelector("[data-rag-jobs-region]")).toBeTruthy();
    expect(container.querySelector("[data-rag-log-region]")).toBeTruthy();
    expect(container.querySelector("[data-rag-footer-region]")).toBeTruthy();

    // The retired console's Details fold body id must never resurface.
    expect(container.querySelector("#rag-ops-details")).toBeNull();
  });

  it("mounts nothing dashboard-shaped while the panel is closed (mount-gated)", () => {
    const { container } = render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(ControlPanels),
      ),
    );
    expect(container.querySelector("[data-rag-job-dashboard]")).toBeNull();
    expect(container.querySelector("[data-rag-footer-region]")).toBeNull();
  });
});
