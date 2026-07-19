import { afterEach, describe, expect, it } from "vitest";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { closeControlPanel, useControlPanels } from "../controlPanels";
import { useAgentPanel } from "../agentPanel";
import type { CommandContext } from "../commandRegistry";
import { controlPanelsCommandProvider } from "./controlPanelsCommandProvider";

function commands(openControlPanel: CommandContext["openControlPanel"]) {
  return controlPanelsCommandProvider({
    openControlPanel,
  }) as readonly ActionDescriptor[];
}

afterEach(() => {
  closeControlPanel();
  useAgentPanel.setState({ open: false, panelView: "transcript" });
});

describe("controlPanelsCommandProvider", () => {
  it("surfaces the three modal panels plus the review inbox, under the app family", () => {
    // The three modal panels' labels track the open-panel snapshot; the review
    // inbox (review-surface-flow ADR F1) opens the Agent pending view, so its
    // label is snapshot-independent and it sits last.
    const closed = commands(null);
    expect(closed.map((command) => command.label)).toEqual([
      { key: "common:controlPanels.actions.showSearch" },
      { key: "common:controlPanels.actions.showSystemStatus" },
      { key: "common:controlPanels.actions.showProjectHealth" },
      { key: "common:controlPanels.actions.showApprovals" },
    ]);
    expect(closed.map((command) => command.id)).toEqual([
      "panel:search-service",
      "panel:backend-health",
      "panel:vault-health",
      "panel:approvals",
    ]);

    const searchOpen = commands("search-service");
    expect(searchOpen.map((command) => command.label)).toEqual([
      { key: "common:controlPanels.actions.hideSearch" },
      { key: "common:controlPanels.actions.showSystemStatus" },
      { key: "common:controlPanels.actions.showProjectHealth" },
      // The review inbox never flips to a hide label — it is an open, not a toggle.
      { key: "common:controlPanels.actions.showApprovals" },
    ]);
    expect(
      searchOpen.every(
        (command) =>
          (command as ActionDescriptor & { family?: string }).family === "app",
      ),
    ).toBe(true);
  });

  it("runs the modal toggle for a panel and the pending-view open for the review inbox", () => {
    commands(null)
      .find((command) => command.id === "panel:search-service")
      ?.run?.();
    expect(useControlPanels.getState().open).toBe("search-service");

    commands(null)
      .find((command) => command.id === "panel:approvals")
      ?.run?.();
    // The review inbox opens the Agent panel's pending view — never a modal.
    expect(useAgentPanel.getState().open).toBe(true);
    expect(useAgentPanel.getState().panelView).toBe("pending");
    expect(useControlPanels.getState().open).toBe("search-service");
  });
});
