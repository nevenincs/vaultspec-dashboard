// Timeline event-mark menu resolver (W03.P09): a pure resolver tested directly.
// We assert the action set, sections, and the honest disabled-with-reason
// branches (no nodes / not truncated / no timestamp) — never the imperative
// effects (those route through the shared selection + timeline store).

import { beforeEach, describe, expect, it } from "vitest";

import type { ActionContext } from "../../../platform/actions/registry";
import {
  resetTimelineViewState,
  setTimelineViewportWidth,
  timelineViewSnapshot,
  timelineViewportForInstant,
} from "../../../stores/view/timeline";
import { eventMarkMenu } from "./eventMarkMenu";

const LIVE: ActionContext = { timeTravel: false };

function byId(actions: ReturnType<typeof eventMarkMenu>, suffix: string) {
  const found = actions.find((a) => a.id.startsWith(`event:${suffix}:`));
  if (!found) throw new Error(`no action for ${suffix}`);
  return found;
}

const FULL = {
  kind: "event",
  id: " evt-1 ",
  nodeIds: [" n1 ", "n2", " n3 "],
  ts: 1_700_000_000_000,
};

describe("eventMarkMenu", () => {
  beforeEach(() => resetTimelineViewState());

  it("offers the full action set with the expected ids and sections", () => {
    const actions = eventMarkMenu(FULL, LIVE);
    const ids = actions.map((a) => a.id);

    expect(ids).toEqual([
      "event:show-touched:evt-1",
      "event:jump-first:evt-1",
      "event:zoom:evt-1",
      "event:show-full-list:evt-1",
      "event:copy-id:evt-1",
      "event:copy-ts:evt-1",
    ]);

    // Navigation group is "navigate"; the copies are "copy".
    expect(byId(actions, "show-touched").section).toBe("navigate");
    expect(byId(actions, "jump-first").section).toBe("navigate");
    expect(byId(actions, "zoom").section).toBe("navigate");
    expect(byId(actions, "show-full-list").section).toBe("navigate");
    expect(byId(actions, "copy-id").section).toBe("copy");
    expect(byId(actions, "copy-ts").section).toBe("copy");
  });

  it("never marks an action disabledInTimeTravel (timeline nav is read-only)", () => {
    const actions = eventMarkMenu(FULL, LIVE);
    expect(actions.every((a) => a.disabledInTimeTravel !== true)).toBe(true);
  });

  it("enables every action when the entity is fully populated", () => {
    const actions = eventMarkMenu({ ...FULL, truncatedNodeIds: 5 }, LIVE);
    // truncated → "Show full node list" enabled.
    expect(byId(actions, "show-full-list").disabled).toBe(false);
    expect(byId(actions, "jump-first").disabled).toBe(false);
    expect(byId(actions, "zoom").disabled).toBe(false);
    expect(byId(actions, "copy-ts").disabled).toBeUndefined();
  });

  it("disables 'Jump to first node' with reason when there are no nodes", () => {
    const actions = eventMarkMenu({ ...FULL, nodeIds: [] }, LIVE);
    const jump = byId(actions, "jump-first");
    expect(jump.disabled).toBe(true);
    expect(jump.disabledReason).toBe("no touched nodes");
    expect(jump.run).toBeUndefined();
  });

  it("disables 'Show full node list' with reason when not truncated", () => {
    // truncatedNodeIds absent.
    const absent = byId(eventMarkMenu(FULL, LIVE), "show-full-list");
    expect(absent.disabled).toBe(true);
    expect(absent.disabledReason).toBe("all nodes shown");

    // truncatedNodeIds === 0 is "complete", also disabled.
    const zero = byId(
      eventMarkMenu({ ...FULL, truncatedNodeIds: 0 }, LIVE),
      "show-full-list",
    );
    expect(zero.disabled).toBe(true);
    expect(zero.disabledReason).toBe("all nodes shown");
  });

  it("enables 'Show full node list' only when truncatedNodeIds > 0", () => {
    const action = byId(
      eventMarkMenu({ ...FULL, truncatedNodeIds: 3 }, LIVE),
      "show-full-list",
    );
    expect(action.disabled).toBe(false);
    expect(action.run).toBeDefined();
  });

  it("disables 'Zoom timeline to event' with reason when there is no ts", () => {
    const noTs = { kind: "event", id: "evt-2", nodeIds: ["n1"] };
    const zoom = byId(eventMarkMenu(noTs, LIVE), "zoom");
    expect(zoom.disabled).toBe(true);
    expect(zoom.disabledReason).toBe("zoom unavailable");
    expect(zoom.run).toBeUndefined();
  });

  it("zooms by writing scroll-strip scale and offset, not legacy window state", () => {
    const viewportWidth = 800;
    const ts = FULL.ts!;
    const now = ts + 10 * 24 * 3600_000;
    const viewport = timelineViewportForInstant(ts, viewportWidth, 24 * 3600_000, now);
    const center = (viewportWidth / 2 + viewport.scrollOffset) / viewport.pxPerMs;
    expect(center).toBeCloseTo(ts, 0);

    setTimelineViewportWidth(viewportWidth);
    const zoom = byId(eventMarkMenu(FULL, LIVE), "zoom");
    zoom.run?.();
    expect(timelineViewSnapshot()).not.toHaveProperty("window");
    expect(timelineViewSnapshot().pxPerMs).toBeGreaterThan(0);
    expect(timelineViewSnapshot().scrollOffset).toBeGreaterThanOrEqual(0);
  });

  it("carries the timestamp text on 'Copy timestamp' when ts is present", () => {
    const copy = byId(eventMarkMenu(FULL, LIVE), "copy-ts");
    expect(copy.disabled).toBeUndefined();
    expect(copy.dispatch?.payload).toMatchObject({
      text: String(FULL.ts),
    });
  });

  it("disables 'Copy timestamp' with reason when ts is absent", () => {
    const noTs = { kind: "event", id: "evt-3", nodeIds: [] };
    const copy = byId(eventMarkMenu(noTs, LIVE), "copy-ts");
    expect(copy.disabled).toBe(true);
    expect(copy.disabledReason).toBe("no timestamp");
    expect(copy.dispatch).toBeUndefined();
  });

  it("copies the event id with the 'id' shape", () => {
    const copy = byId(eventMarkMenu(FULL, LIVE), "copy-id");
    expect(copy.dispatch?.payload).toMatchObject({ text: "evt-1", what: "id" });
  });

  it("rejects malformed and non-event entities at resolver ingress", () => {
    expect(
      eventMarkMenu({ kind: "event", id: "evt-empty", nodeIds: "n1" }, LIVE),
    ).toEqual([]);
    expect(
      eventMarkMenu({ kind: "node", id: "doc:a", nodeIds: ["doc:a"] }, LIVE),
    ).toEqual([]);
    expect(eventMarkMenu(null, LIVE)).toEqual([]);
  });
});
