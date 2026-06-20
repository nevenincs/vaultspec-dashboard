import { describe, expect, it } from "vitest";

import { SceneController } from "./sceneController";

describe("SceneController", () => {
  it("forwards a context-menu event to listeners (W04.P10 additive seam)", () => {
    const scene = new SceneController();
    const seen: unknown[] = [];
    const off = scene.on((e) => seen.push(e));
    scene.emit({
      kind: "context-menu",
      id: "doc:a",
      target: "node",
      clientX: 12,
      clientY: 34,
    });
    scene.emit({
      kind: "context-menu",
      id: null,
      target: "node",
      clientX: 1,
      clientY: 2,
    });
    off();
    expect(seen).toEqual([
      { kind: "context-menu", id: "doc:a", target: "node", clientX: 12, clientY: 34 },
      { kind: "context-menu", id: null, target: "node", clientX: 1, clientY: 2 },
    ]);
  });

  it("accepts graph data without positions — the renderer owns layout (RL-1)", () => {
    const scene = new SceneController();
    scene.command({
      kind: "set-data",
      nodes: [
        { id: "feature:editor-demo", kind: "feature" },
        {
          id: "doc:2026-06-12-editor-demo-plan",
          kind: "plan",
          lifecycle: { state: "active", progress: { done: 7, total: 12 } },
          degreeByTier: { declared: 3, structural: 5 },
        },
      ],
      edges: [
        {
          id: "e1",
          src: "doc:2026-06-12-editor-demo-plan",
          dst: "feature:editor-demo",
          relation: "implements",
          tier: "declared",
          confidence: 1.0,
        },
      ],
    });
    expect(scene.nodeCount).toBe(2);
    expect(scene.edgeCount).toBe(1);
  });

  it("carries the full contract edge shape including structural state (RL-2)", () => {
    const scene = new SceneController();
    scene.command({
      kind: "set-data",
      nodes: [
        { id: "doc:a", kind: "plan" },
        { id: "doc:b", kind: "adr" },
      ],
      edges: [
        {
          id: "e-broken",
          src: "doc:a",
          dst: "doc:b",
          relation: "mentions",
          tier: "structural",
          confidence: 0.5,
          state: "broken",
        },
      ],
    });
    expect(scene.edgeCount).toBe(1);
  });

  it("delivers interaction events to subscribers and supports unsubscribe", () => {
    const scene = new SceneController();
    const seen: string[] = [];
    const off = scene.on((event) => {
      seen.push(event.kind);
    });
    scene.emit({ kind: "select", id: "feature:editor-demo" });
    off();
    scene.emit({ kind: "hover", id: null });
    expect(seen).toEqual(["select"]);
  });

  it("carries the locked RL-5c event union: expand and pin (W01.P01.S04)", () => {
    const scene = new SceneController();
    const seen: string[] = [];
    scene.on((event) => {
      seen.push(event.kind);
    });
    scene.emit({ kind: "expand", id: "feature:editor-demo" });
    scene.emit({ kind: "pin", id: "feature:editor-demo", pinned: true });
    scene.command({ kind: "set-pinned", ids: new Set(["feature:editor-demo"]) });
    expect(seen).toEqual(["expand", "pin"]);
  });

  it("routes selection back through the preserved channel: select out, set-selected in, forwarded to the field (S51)", () => {
    const commands: unknown[] = [];
    const fake = {
      mount: () => {},
      resize: () => {},
      destroy: () => {},
      command: (cmd: unknown) => commands.push(cmd),
    };
    const scene = new SceneController(fake);

    // A canvas click EMITS a select event (the field → store half of the loop).
    const events: (string | null)[] = [];
    scene.on((e) => {
      if (e.kind === "select") events.push(e.id);
    });
    scene.emit({ kind: "select", id: "doc:a" });
    expect(events).toEqual(["doc:a"]);

    // Dashboard-state pushes the shared selection BACK through the EXISTING
    // set-selected command; the controller forwards it to the field (the ring is
    // the renderer's concern).
    scene.command({ kind: "set-selected", ids: new Set(["doc:a"]) });
    expect(commands).toContainEqual({ kind: "set-selected", ids: new Set(["doc:a"]) });

    // A subsequent selection change forwards the replacement set too.
    scene.command({ kind: "set-selected", ids: new Set(["doc:b", "doc:c"]) });
    expect(commands).toContainEqual({
      kind: "set-selected",
      ids: new Set(["doc:b", "doc:c"]),
    });
  });

  it("hover intent routes through the preserved hover event, carrying id or null (S51)", () => {
    const scene = new SceneController();
    const hovered: (string | null)[] = [];
    scene.on((e) => {
      if (e.kind === "hover") hovered.push(e.id);
    });
    scene.emit({ kind: "hover", id: "doc:a" });
    scene.emit({ kind: "hover", id: null });
    expect(hovered).toEqual(["doc:a", null]);
  });

  it("anchors DOM islands via subscription, not polling (RL-4)", () => {
    const scene = new SceneController();
    const anchors: ({ x: number; y: number; scale: number } | null)[] = [];
    const off = scene.trackNode("feature:editor-demo", (a) => anchors.push(a));
    scene.emitAnchor("feature:editor-demo", { x: 10, y: 20, scale: 1.5 });
    scene.emitAnchor("feature:editor-demo", null);
    scene.emitAnchor("feature:other", { x: 0, y: 0, scale: 1 });
    off();
    scene.emitAnchor("feature:editor-demo", { x: 1, y: 1, scale: 1 });
    expect(anchors).toEqual([{ x: 10, y: 20, scale: 1.5 }, null]);
  });

  it("delegates lifecycle to an injected field renderer (W01.P03.S09)", () => {
    const calls: string[] = [];
    const fake = {
      mount: () => calls.push("mount"),
      resize: (w: number, h: number) => calls.push(`resize:${w}x${h}`),
      destroy: () => calls.push("destroy"),
    };
    const scene = new SceneController(fake);
    scene.mount({} as HTMLElement);
    scene.resize(800, 600);
    scene.destroy();
    expect(calls).toEqual(["mount", "resize:800x600", "destroy"]);
  });

  it("destroy clears all subscriptions (RL-5b)", () => {
    const scene = new SceneController();
    let calls = 0;
    scene.on(() => {
      calls += 1;
    });
    scene.trackNode("n1", () => {
      calls += 1;
    });
    scene.destroy();
    scene.emit({ kind: "open", id: "n1" });
    scene.emitAnchor("n1", { x: 0, y: 0, scale: 1 });
    expect(calls).toBe(0);
  });
});
