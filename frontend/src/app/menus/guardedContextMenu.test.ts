// @vitest-environment happy-dom

// The selection-guard yield/open matrix (touch-selectability ADR D4): the guard
// yields (handler never runs) exactly when a live non-collapsed selection
// intersects the right-clicked target, and opens (handler runs) on collapsed,
// absent, or elsewhere selections.

import { afterEach, describe, expect, it } from "vitest";

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

describe("selectionForEventTarget", () => {
  it("resolves the document selection for an attached target", () => {
    const { prose } = mountFixture();
    const selection = selectContentsOf(prose);
    expect(selectionForEventTarget(prose)).toBe(selection);
  });
});
