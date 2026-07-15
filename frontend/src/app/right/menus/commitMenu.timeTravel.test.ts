// TTR-005a: the commit row's "View project at this version" verb is the sole
// time-travel ENTRY point. This proves the entry WIRING — invoking the built
// descriptor's `run` writes the shared timeline_mode through `movePlayhead(ts,
// scope)`, the one canonical timeline_mode writer (never a second writer).
//
// The engine WIRE is never mocked here (mock-mirrors-live-wire-shape) — `movePlayhead`
// is a client-side view intent, so it is the correct seam to stub to observe the call
// without performing a real dashboard-state write.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../stores/view/timelineIntent", () => ({
  movePlayhead: vi.fn(),
}));

import { movePlayhead } from "../../../stores/view/timelineIntent";
import { commitMenu } from "./commitMenu";

const find = <T extends { id: string }>(actions: T[], id: string): T => {
  const found = actions.find((a) => a.id === id);
  if (!found) throw new Error(`no action ${id}`);
  return found;
};

describe("commitMenu view-at-commit entry (TTR-005a)", () => {
  beforeEach(() => vi.mocked(movePlayhead).mockClear());

  it("run() scrubs the playhead to the commit instant for the active scope", () => {
    const commit = { kind: "commit" as const, id: "abcd", ts: 1_700_000_000_000 };
    const view = find(
      commitMenu(commit, { timeTravel: false, scope: "/repo" }),
      "commit:view-at-commit",
    );
    view.run?.();
    expect(movePlayhead).toHaveBeenCalledTimes(1);
    expect(movePlayhead).toHaveBeenCalledWith(1_700_000_000_000, "/repo");
  });

  it("does not build a runnable entry (so never calls movePlayhead) without a scope", () => {
    const commit = { kind: "commit" as const, id: "abcd", ts: 1_700_000_000_000 };
    const view = find(commitMenu(commit), "commit:view-at-commit");
    expect(view.run).toBeUndefined();
    expect(movePlayhead).not.toHaveBeenCalled();
  });
});
