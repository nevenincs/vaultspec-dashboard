// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { moveRovingFocus } from "./rovingFocus";

describe("moveRovingFocus", () => {
  function renderList() {
    const root = document.createElement("div");
    root.setAttribute("data-list", "");
    root.innerHTML = `
      <button data-row>one</button>
      <button data-row>two</button>
      <button data-row disabled>disabled</button>
      <button data-row>three</button>
    `;
    document.body.replaceChildren(root);
    const rows = Array.from(
      root.querySelectorAll<HTMLButtonElement>("button[data-row]"),
    );
    return { rows };
  }

  it("moves focus through matched candidates", () => {
    const { rows } = renderList();
    rows[0]?.focus();

    moveRovingFocus(rows[0]!, 1, {
      container: "[data-list]",
      items: "button[data-row]:not(:disabled)",
    });

    expect(document.activeElement).toBe(rows[1]);
  });

  it("skips candidates excluded by the item selector", () => {
    const { rows } = renderList();
    rows[1]?.focus();

    moveRovingFocus(rows[1]!, 1, {
      container: "[data-list]",
      items: "button[data-row]:not(:disabled)",
    });

    expect(document.activeElement).toBe(rows[3]);
  });

  it("clamps at list edges", () => {
    const { rows } = renderList();
    rows[0]?.focus();

    moveRovingFocus(rows[0]!, -1, {
      container: "[data-list]",
      items: "button[data-row]:not(:disabled)",
    });

    expect(document.activeElement).toBe(rows[0]);
  });
});
