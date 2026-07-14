import { afterEach, describe, expect, it } from "vitest";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { closeControlPanel, useControlPanels } from "../controlPanels";
import type { CommandContext } from "../commandRegistry";
import { controlPanelsCommandProvider } from "./controlPanelsCommandProvider";

function commands(openControlPanel: CommandContext["openControlPanel"]) {
  return controlPanelsCommandProvider({
    openControlPanel,
  }) as readonly ActionDescriptor[];
}

afterEach(closeControlPanel);

describe("controlPanelsCommandProvider", () => {
  it("projects panel labels solely from the injected open-panel snapshot", () => {
    const closed = commands(null);
    expect(closed.map((command) => command.label)).toEqual([
      { key: "common:actions.showSearchStatus" },
      { key: "common:actions.showApprovals" },
      { key: "common:actions.showSystemStatus" },
      { key: "common:actions.showProjectHealth" },
    ]);

    const approvalsOpen = commands("approvals");
    expect(approvalsOpen.map((command) => command.label)).toEqual([
      { key: "common:actions.showSearchStatus" },
      { key: "common:actions.hideApprovals" },
      { key: "common:actions.showSystemStatus" },
      { key: "common:actions.showProjectHealth" },
    ]);
    expect(approvalsOpen.map((command) => command.id)).toEqual([
      "panel:search-service",
      "panel:approvals",
      "panel:backend-health",
      "panel:vault-health",
    ]);
    expect(
      approvalsOpen.every(
        (command) =>
          (command as ActionDescriptor & { family?: string }).family === "app",
      ),
    ).toBe(true);
  });

  it("runs the real modal panel toggle without reading state for its label", () => {
    const approvals = commands(null).find(
      (command) => command.id === "panel:approvals",
    );
    approvals?.run?.();
    expect(useControlPanels.getState().open).toBe("approvals");

    commands("approvals")
      .find((command) => command.id === "panel:approvals")
      ?.run?.();
    expect(useControlPanels.getState().open).toBeNull();
  });
});
