// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { focusableDescendants, trapTabFocus } from "./focusTrap";

describe("focusTrap", () => {
  function rootWithControls(): HTMLElement {
    const root = document.createElement("div");
    root.innerHTML = `
      <button type="button">first</button>
      <button type="button" disabled>disabled</button>
      <a href="#x">link</a>
      <button type="button" tabindex="-1">programmatic</button>
      <input aria-label="last" />
    `;
    document.body.replaceChildren(root);
    return root;
  }

  it("returns tab-order descendants only", () => {
    const root = rootWithControls();

    expect(
      focusableDescendants(root).map((el) => el.textContent || el.tagName),
    ).toEqual(["first", "link", "INPUT"]);
  });

  it("wraps Tab from the last focusable to the first", () => {
    const root = rootWithControls();
    const focusables = focusableDescendants(root);
    focusables.at(-1)?.focus();
    const preventDefault = vi.fn();

    expect(trapTabFocus(root, { key: "Tab", shiftKey: false, preventDefault })).toBe(
      true,
    );

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(focusables[0]);
  });

  it("wraps Shift+Tab from the first focusable to the last", () => {
    const root = rootWithControls();
    const focusables = focusableDescendants(root);
    focusables[0]?.focus();
    const preventDefault = vi.fn();

    trapTabFocus(root, { key: "Tab", shiftKey: true, preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(focusables.at(-1));
  });

  it("ignores non-Tab keys", () => {
    const root = rootWithControls();
    const preventDefault = vi.fn();

    expect(trapTabFocus(root, { key: "Escape", shiftKey: false, preventDefault })).toBe(
      false,
    );
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
