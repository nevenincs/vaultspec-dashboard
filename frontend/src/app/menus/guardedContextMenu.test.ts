// @vitest-environment happy-dom

// The selection-guard yield/open matrix (touch-selectability ADR D4): the guard
// yields (handler never runs) exactly when a live non-collapsed selection
// intersects the right-clicked target, and opens (handler runs) on collapsed,
// absent, or elsewhere selections.

import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { isIslandMenuTarget } from "../islands/IslandLayer";
import {
  guardedContextMenu,
  selectionForEventTarget,
  shouldYieldContextMenuToSelection,
} from "./guardedContextMenu";

function mountFixture() {
  const host = document.createElement("div");
  const prose = document.createElement("p");
  prose.textContent = "selectable corpus prose";
  const sibling = document.createElement("p");
  sibling.textContent = "unrelated sibling text";
  host.append(prose, sibling);
  document.body.appendChild(host);
  return { host, prose, sibling };
}

function selectContentsOf(node: Node): Selection {
  const selection = document.getSelection();
  if (selection === null) throw new Error("test environment has no Selection");
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});

describe("shouldYieldContextMenuToSelection", () => {
  it("does not yield with no target or no selection", () => {
    const { prose } = mountFixture();
    expect(shouldYieldContextMenuToSelection(null, document.getSelection())).toBe(
      false,
    );
    expect(shouldYieldContextMenuToSelection(prose, null)).toBe(false);
  });

  it("does not yield on a collapsed selection", () => {
    const { prose } = mountFixture();
    const selection = selectContentsOf(prose);
    selection.collapseToStart();
    expect(shouldYieldContextMenuToSelection(prose, selection)).toBe(false);
  });

  it("yields when the selection covers the target", () => {
    const { prose } = mountFixture();
    const selection = selectContentsOf(prose);
    expect(shouldYieldContextMenuToSelection(prose, selection)).toBe(true);
  });

  it("yields when the target is an ancestor containing the selection", () => {
    const { host, prose } = mountFixture();
    const selection = selectContentsOf(prose);
    expect(shouldYieldContextMenuToSelection(host, selection)).toBe(true);
  });

  it("does not yield when the selection lives in a sibling", () => {
    const { prose, sibling } = mountFixture();
    const selection = selectContentsOf(sibling);
    expect(shouldYieldContextMenuToSelection(prose, selection)).toBe(false);
  });
});

describe("guardedContextMenu", () => {
  it("runs the handler when no selection is live", () => {
    const { prose } = mountFixture();
    let ran = 0;
    const handler = guardedContextMenu(() => {
      ran += 1;
    });
    handler({ target: prose } as unknown as MouseEvent);
    expect(ran).toBe(1);
  });

  it("suppresses the handler when the selection intersects the target", () => {
    const { prose } = mountFixture();
    selectContentsOf(prose);
    let ran = 0;
    const handler = guardedContextMenu(() => {
      ran += 1;
    });
    handler({ target: prose } as unknown as MouseEvent);
    expect(ran).toBe(0);
  });

  it("runs the handler when the selection is elsewhere", () => {
    const { prose, sibling } = mountFixture();
    selectContentsOf(sibling);
    let ran = 0;
    const handler = guardedContextMenu(() => {
      ran += 1;
    });
    handler({ target: prose } as unknown as MouseEvent);
    expect(ran).toBe(1);
  });
});

describe("touch-selectability law sweep (ADR D4)", () => {
  const appDir = path.resolve(__dirname, "..");

  function appSourceFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name))
          out.push(full);
      }
    };
    walk(appDir);
    return out;
  }

  it("every surface that opens the resolver menu from onContextMenu routes through the guard", () => {
    const offenders: string[] = [];
    for (const file of appSourceFiles()) {
      const source = fs.readFileSync(file, "utf-8");
      // The law binds files that BOTH attach a native context-menu handler and
      // open the app menu; the shared helpers themselves are the guard's home.
      if (!/onContextMenu=/.test(source)) continue;
      if (!/openContextMenu\(/.test(source)) continue;
      if (file.endsWith("guardedContextMenu.ts")) continue;
      if (!/guardedContextMenu/.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("menu-bearing data surfaces keep the select-text re-enable", () => {
    // The D2 convention fence: each audited menu-online surface (or the module
    // that owns its derived row class) re-enables selection explicitly. A
    // removal — or a new surface reverting to UA button suppression — fails here.
    const mustCarrySelectText = [
      "left/TreeBrowser.tsx",
      "right/StatusTab.tsx",
      "stage/DockWorkspace.tsx",
      "islands/NodeInterior.tsx",
      "palette/SearchResultPill.tsx",
      // The worktree-picker and code-tree row classes live at their derived
      // source in stores, not in the components that render them (the queries
      // monolith was decomposed into per-domain submodules; the row class lives
      // in the workspaces submodule).
      "../stores/server/queries/workspaces.ts",
      "../stores/view/browserTreeExpansion.ts",
    ];
    const missing = mustCarrySelectText.filter(
      (rel) =>
        !fs
          .readFileSync(path.join(appDir, ...rel.split("/")), "utf-8")
          .includes("select-text"),
    );
    expect(missing).toEqual([]);
  });

  it("every surface that opens the resolver menu offers the coarse-pointer disclosure", () => {
    // The D3 fence: a surface whose right-click opens the app menu must also
    // mount RowMenuDisclosure (touch cannot right-click; iOS never fires
    // contextmenu). Exemptions carry their reason inline.
    const exempt = new Set([
      // The guard helper itself and the background empty-space menus: empty
      // space has no row to carry a per-row affordance.
      "menus/guardedContextMenu.ts",
      "menus/backgroundContextMenu.ts",
      // The menu host suppresses the native menu inside the open panel; it
      // opens nothing.
      "menu/ContextMenuHost.tsx",
    ]);
    const offenders: string[] = [];
    for (const file of appSourceFiles()) {
      const rel = path.relative(appDir, file).replaceAll("\\", "/");
      if (exempt.has(rel)) continue;
      const source = fs.readFileSync(file, "utf-8");
      if (!/onContextMenu=/.test(source)) continue;
      if (!/openContextMenu\(/.test(source)) continue;
      if (!/RowMenuDisclosure/.test(source)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

describe("isIslandMenuTarget", () => {
  it("accepts the island surface and its plain data text", () => {
    const island = document.createElement("div");
    const title = document.createElement("span");
    title.textContent = "node-id";
    island.appendChild(title);
    document.body.appendChild(island);
    expect(isIslandMenuTarget({ target: island })).toBe(true);
    expect(isIslandMenuTarget({ target: title })).toBe(true);
  });

  it("rejects nested interactive targets so they are not blanketed", () => {
    const island = document.createElement("div");
    const chip = document.createElement("button");
    const chipLabel = document.createElement("span");
    chip.appendChild(chipLabel);
    island.appendChild(chip);
    document.body.appendChild(island);
    expect(isIslandMenuTarget({ target: chip })).toBe(false);
    expect(isIslandMenuTarget({ target: chipLabel })).toBe(false);
  });

  it("rejects a null or non-element target", () => {
    expect(isIslandMenuTarget({ target: null })).toBe(false);
  });
});

describe("selectionForEventTarget", () => {
  it("resolves the document selection for an attached target", () => {
    const { prose } = mountFixture();
    const selection = selectContentsOf(prose);
    expect(selectionForEventTarget(prose)).toBe(selection);
  });
});
