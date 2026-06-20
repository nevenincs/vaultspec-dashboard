import { beforeEach, describe, expect, it } from "vitest";

import type { KeyValueStore } from "../../scene/positionCache";
import type { SceneCommand, SceneFieldRenderer } from "../../scene/sceneController";
import { SceneController } from "../../scene/sceneController";
import {
  bindPinsToScene,
  loadPins,
  normalizePinnedNodeIds,
  PINNED_IDS_CAP,
  savePins,
  usePinStore,
} from "./pins";

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
    savePins(store, "ws", "scope-a", [" n1 ", "", "n1", "n2"]);
    expect(loadPins(store, "ws", "scope-a")).toEqual(["n1", "n2"]);
    expect(loadPins(store, "ws", "scope-b")).toEqual([]);
  });

  it("normalizes persistence workspace and scope identity", () => {
    const store = new MemoryStore();
    savePins(store, " ws ", " scope-a ", ["n1"]);
    savePins(store, null, undefined, ["fallback"]);

    expect(loadPins(store, "ws", "scope-a")).toEqual(["n1"]);
    expect(loadPins(store, "default", "default")).toEqual(["fallback"]);
  });

  it("reads corrupt blobs as no pins and clears them", () => {
    const store = new MemoryStore();
    store.map.set("vaultspec-dashboard:pins:ws:s", "{nope");
    expect(loadPins(store, "ws", "s")).toEqual([]);
    expect(store.map.size).toBe(0);
  });

  it("caps persisted pins to the most recent unique ids", () => {
    const store = new MemoryStore();
    const ids = Array.from({ length: PINNED_IDS_CAP + 10 }, (_, i) => `n${i}`);

    savePins(store, "ws", "scope-a", [...ids, "n250"]);

    const loaded = loadPins(store, "ws", "scope-a");
    expect(loaded).toHaveLength(PINNED_IDS_CAP);
    expect(loaded).not.toContain("n0");
    expect(loaded.at(-1)).toBe("n250");
    expect(loaded.filter((id) => id === "n250")).toHaveLength(1);
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
    scene.emit({ kind: "pin", id: " n1 ", pinned: true });
    expect(usePinStore.getState().pinnedIds).toEqual(["n1"]);
    expect(commands.at(-1)).toEqual({ kind: "set-pinned", ids: new Set(["n1"]) });
    expect(usePinStore.getState().isPinned(" n1 ")).toBe(true);
    scene.emit({ kind: "pin", id: "n1", pinned: false });
    expect(usePinStore.getState().pinnedIds).toEqual([]);
    expect(commands.at(-1)).toEqual({ kind: "set-pinned", ids: new Set() });
    scene.emit({ kind: "pin", id: "   ", pinned: true });
    expect(usePinStore.getState().pinnedIds).toEqual([]);
    off();
  });

  it("caps toggled pins to bound scene membership fan-out", () => {
    for (let i = 0; i < PINNED_IDS_CAP + 5; i += 1) {
      usePinStore.getState().togglePin(`n${i}`);
    }

    expect(usePinStore.getState().pinnedIds).toHaveLength(PINNED_IDS_CAP);
    expect(usePinStore.getState().pinnedIds).not.toContain("n0");
    expect(usePinStore.getState().pinnedIds.at(-1)).toBe(`n${PINNED_IDS_CAP + 4}`);
  });

  it("normalizes the active scoped key on store re-key", () => {
    usePinStore.getState().setScopeKey(" ws ", " scope-a ");

    expect(usePinStore.getState()).toMatchObject({
      workspace: "ws",
      scope: "scope-a",
      pinnedIds: [],
    });
  });

  it("normalizes externally seeded pin reads before membership and scene fan-out", () => {
    const raw = [
      "",
      " doc:old ",
      "doc:old",
      ...Array.from({ length: PINNED_IDS_CAP + 3 }, (_, i) => `doc:${i}`),
      "   ",
    ];
    const normalized = normalizePinnedNodeIds(raw);

    expect(normalized).toHaveLength(PINNED_IDS_CAP);
    expect(normalized).not.toContain("");
    expect(normalized).not.toContain("doc:old");
    expect(normalized[0]).toBe("doc:3");
    expect(normalized.at(-1)).toBe("doc:258");

    usePinStore.setState({ pinnedIds: raw as string[] });
    expect(usePinStore.getState().isPinned(" doc:3 ")).toBe(true);
    expect(usePinStore.getState().isPinned("doc:old")).toBe(false);

    const commands: SceneCommand[] = [];
    const field: SceneFieldRenderer = {
      mount: () => undefined,
      resize: () => undefined,
      destroy: () => undefined,
      command: (cmd) => commands.push(cmd),
    };
    const off = bindPinsToScene(new SceneController(field));
    off();

    expect(commands.at(-1)).toEqual({
      kind: "set-pinned",
      ids: new Set(normalized),
    });
  });
});
