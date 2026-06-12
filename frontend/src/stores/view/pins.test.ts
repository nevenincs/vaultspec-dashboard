import { beforeEach, describe, expect, it } from "vitest";

import type { KeyValueStore } from "../../scene/positionCache";
import type { SceneCommand, SceneFieldRenderer } from "../../scene/sceneController";
import { SceneController } from "../../scene/sceneController";
import { bindPinsToScene, loadPins, savePins, usePinStore } from "./pins";

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

describe("pin persistence (G5.d, client-side only)", () => {
  it("round-trips pins per workspace and scope", () => {
    const store = new MemoryStore();
    savePins(store, "ws", "scope-a", ["n1", "n2"]);
    expect(loadPins(store, "ws", "scope-a")).toEqual(["n1", "n2"]);
    expect(loadPins(store, "ws", "scope-b")).toEqual([]);
  });

  it("reads corrupt blobs as no pins and clears them", () => {
    const store = new MemoryStore();
    store.map.set("vaultspec-dashboard:pins:ws:s", "{nope");
    expect(loadPins(store, "ws", "s")).toEqual([]);
    expect(store.map.size).toBe(0);
  });
});

describe("pin store + scene binding", () => {
  beforeEach(() => {
    usePinStore.setState({ pinnedIds: [], workspace: "default", scope: "default" });
  });

  it("toggles pins on seam pin events and pushes set-pinned back", () => {
    const commands: SceneCommand[] = [];
    const field: SceneFieldRenderer = {
      mount: () => undefined,
      resize: () => undefined,
      destroy: () => undefined,
      command: (cmd) => commands.push(cmd),
    };
    const scene = new SceneController(field);
    const off = bindPinsToScene(scene);
    scene.emit({ kind: "pin", id: "n1", pinned: true });
    expect(usePinStore.getState().pinnedIds).toEqual(["n1"]);
    expect(commands.at(-1)).toEqual({ kind: "set-pinned", ids: new Set(["n1"]) });
    scene.emit({ kind: "pin", id: "n1", pinned: false });
    expect(usePinStore.getState().pinnedIds).toEqual([]);
    expect(commands.at(-1)).toEqual({ kind: "set-pinned", ids: new Set() });
    off();
  });
});
