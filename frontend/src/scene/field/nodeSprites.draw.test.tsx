// @vitest-environment happy-dom
//
// The node BODY draw + SELECTED-ring lifecycle (graph/Hero 85:2,
// graph/Node-items 83:2). happy-dom supplies the DOM Pixi needs; no GPU upload
// is reached (we never init an Application or generateTexture), so this
// exercises the real Graphics geometry and the container child bookkeeping —
// matching how the progress-ring / texture-seam tests stop at the Graphics.

import { describe, expect, it } from "vitest";
import { Container, Graphics } from "pixi.js";

import { SceneGraphModel } from "../graphModel";
import type { SceneNodeData } from "../sceneController";
import { NodeSpriteLayer } from "./nodeSprites";

function model(nodes: SceneNodeData[]): SceneGraphModel {
  const m = new SceneGraphModel();
  m.setData(nodes, []);
  return m;
}

/** Count Graphics children of the layer container (bodies + rings; the canvas
 *  status stamp was removed in the Hero redesign, so only bodies and the
 *  selected accent ring are Graphics here). */
function graphicsChildren(world: Container): Graphics[] {
  const layerContainer = world.children[0] as Container;
  return layerContainer.children.filter((c): c is Graphics => c instanceof Graphics);
}

describe("NodeSpriteLayer — category-coloured body circle", () => {
  it("draws one filled-circle body per node, sized by salience", () => {
    const world = new Container();
    const layer = new NodeSpriteLayer(world);
    layer.sync(
      model([
        { id: "a", kind: "adr", salience: 0.2 },
        { id: "b", kind: "feature", salience: 0.9 },
      ]),
      Date.now(),
    );
    const bodies = graphicsChildren(world);
    expect(bodies.length).toBe(2);
    // The high-salience body has a larger footprint than the low-salience one.
    const [a, b] = bodies;
    expect(b.getLocalBounds().width).toBeGreaterThan(a.getLocalBounds().width);
    layer.destroy();
  });

  it("removes a node's body when it leaves the model", () => {
    const world = new Container();
    const layer = new NodeSpriteLayer(world);
    layer.sync(model([{ id: "a", kind: "adr" }]), Date.now());
    expect(layer.count).toBe(1);
    layer.sync(model([]), Date.now());
    expect(layer.count).toBe(0);
    layer.destroy();
  });
});

describe("NodeSpriteLayer.setSelected — the concentric accent ring", () => {
  it("adds a ring child when a node is selected and removes it when deselected", () => {
    const world = new Container();
    const layer = new NodeSpriteLayer(world);
    layer.sync(model([{ id: "a", kind: "adr", salience: 0.5 }]), Date.now());
    const before = graphicsChildren(world).length; // body only
    expect(before).toBe(1);

    layer.setSelected(new Set(["a"]));
    const ringed = graphicsChildren(world);
    expect(ringed.length).toBe(2); // body + ring
    // The ring's footprint is larger than the body's (it surrounds it with a gap).
    const widths = ringed.map((g) => g.getLocalBounds().width).sort((x, y) => x - y);
    expect(widths[1]).toBeGreaterThan(widths[0]);

    layer.setSelected(new Set()); // deselect
    expect(graphicsChildren(world).length).toBe(1); // ring torn down
    layer.destroy();
  });

  it("rings only the selected node, not its peers", () => {
    const world = new Container();
    const layer = new NodeSpriteLayer(world);
    layer.sync(
      model([
        { id: "a", kind: "adr" },
        { id: "b", kind: "plan" },
      ]),
      Date.now(),
    );
    layer.setSelected(new Set(["b"]));
    // 2 bodies + 1 ring = 3 graphics.
    expect(graphicsChildren(world).length).toBe(3);
    layer.destroy();
  });

  it("keeps the ring across a re-sync (selection survives a data refresh)", () => {
    const world = new Container();
    const layer = new NodeSpriteLayer(world);
    layer.sync(model([{ id: "a", kind: "adr" }]), Date.now());
    layer.setSelected(new Set(["a"]));
    expect(graphicsChildren(world).length).toBe(2);
    // A keyframe re-sync of the same node must not drop the ring.
    layer.sync(model([{ id: "a", kind: "adr" }]), Date.now());
    expect(graphicsChildren(world).length).toBe(2);
    layer.destroy();
  });
});
