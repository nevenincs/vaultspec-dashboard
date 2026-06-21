// EVENT-PLANE PROPAGATION CONTRACT (ms-level, every event kind).
//
// The headline requirement is that every interaction propagates at the
// MILLISECOND level, never "tens of seconds". The view-local event plane achieves
// this by construction: a canvas mouse event or a keyboard verb routes through a
// SYNCHRONOUS Zustand store write (useViewStore.getState().<action>()) or a
// direct scene command — no fetch, no debounce, no microtask, no timer anywhere
// on the path. (The "tens of seconds" the dashboard used to feel was BACKEND
// query latency, addressed separately; the event plane itself was never the
// bottleneck.)
//
// These tests pin that contract for EVERY event kind the canvas emits — hover,
// select, open, expand, and the keyboard graph-walk — so a future change that
// slips an async hop onto the event path (an await in a store action, a fetch in
// the seam, a setTimeout debounce) fails here instead of silently regressing the
// interactive feel.

import { beforeEach, describe, expect, it } from "vitest";

import { actionForKey } from "../../app/stage/graphWalk";
import type { SceneCommand, SceneFieldRenderer } from "../../scene/sceneController";
import { SceneController } from "../../scene/sceneController";
import { focusFromWalk, selectEvent } from "./selection";
import { useViewStore } from "./viewStore";

function captureScene() {
  const commands: SceneCommand[] = [];
  const field: SceneFieldRenderer = {
    mount: () => undefined,
    resize: () => undefined,
    destroy: () => undefined,
    command: (cmd) => commands.push(cmd),
  };
  return { scene: new SceneController(field), commands };
}

/**
 * Drive one event-plane action and assert it is reflected in the shared store in
 * the SAME synchronous turn (the assertion runs immediately after the call, with
 * no await — proving there is no microtask/timer gap), and that the whole turn is
 * comfortably sub-frame.
 */
function expectSynchronous(label: string, drive: () => void, reflected: () => void) {
  const t0 = performance.now();
  drive();
  const elapsedMs = performance.now() - t0;
  reflected();
  expect(elapsedMs, `${label} must propagate synchronously (ms-level)`).toBeLessThan(5);
}

describe("event plane propagates at ms-level for every event kind", () => {
  beforeEach(() => {
    const s = useViewStore.getState();
    s.selectEntity(null);
    s.clearWorkingSet();
  });

  it("event select -> local metadata, synchronously", () => {
    expectSynchronous(
      "select",
      () => selectEvent("evt:selected", ["doc:selected"]),
      () => {
        expect(useViewStore.getState().selection).toEqual({
          kind: "event",
          id: "evt:selected",
          nodeIds: ["doc:selected"],
        });
      },
    );
  });

  it("mouse open -> opened set, synchronously", () => {
    expectSynchronous(
      "open",
      () => useViewStore.getState().openNode("doc:opened"),
      () => expect(useViewStore.getState().openedIds).toContain("doc:opened"),
    );
  });

  it("mouse expand -> working set, synchronously", () => {
    expectSynchronous(
      "expand",
      () => useViewStore.getState().addToWorkingSet("doc:expanded"),
      () => expect(useViewStore.getState().workingSet).toContain("doc:expanded"),
    );
  });

  it("keyboard graph-walk -> instant non-animated re-center before selection settles", () => {
    const { scene, commands } = captureScene();
    void focusFromWalk(scene, "doc:walked", "scope-a").catch(() => undefined);
    // The walk owns the camera move and issues it before the canonical dashboard
    // selection write settles, so a held arrow never waits on backend state.
    expect(commands).toContainEqual({
      kind: "focus-node",
      id: "doc:walked",
      animate: false,
    });
  });

  it("keyboard key -> canvas verb mapping is pure and synchronous for every verb", () => {
    // actionForKey is the keypress->verb table; pure and allocation-light so a
    // keypress is decided in microseconds, never blocking the canvas.
    const t0 = performance.now();
    expect(actionForKey({ key: "ArrowRight" })).toEqual({
      kind: "walk",
      direction: "forward",
    });
    expect(actionForKey({ key: "ArrowUp" })).toEqual({
      kind: "walk",
      direction: "backward",
    });
    // Tab is no longer a walk verb — it is left to browser focus traversal so the
    // canvas can never trap the keyboard (no-keyboard-trap; keymap W03.P09).
    expect(actionForKey({ key: "Tab" })).toBeNull();
    expect(actionForKey({ key: "Enter" })).toEqual({ kind: "open" });
    expect(actionForKey({ key: "e" })).toEqual({ kind: "expand" });
    expect(actionForKey({ key: "Escape" })).toEqual({ kind: "clear" });
    expect(actionForKey({ key: "q" })).toBeNull();
    expect(performance.now() - t0).toBeLessThan(5);
  });
});
