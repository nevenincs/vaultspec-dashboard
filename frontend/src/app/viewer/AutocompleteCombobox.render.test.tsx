// @vitest-environment happy-dom
//
// The shared AutocompleteCombobox primitive's floating-listbox contract
// (create-panel-hardening P01.S02): the suggestion list is PORTALED to the
// body with fixed positioning so no dialog body or scroll container can clip
// it; its height is space-aware (capped to the measured room below the field,
// flipping above when below is too tight); `aria-controls` names the listbox
// only while it is rendered; and option rows grow to the 2.75rem touch floor
// on coarse pointers. Rects and media queries are stubbed (happy-dom has no
// layout); the assertions target the placement/portal contract, not pixels.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AutocompleteCombobox, type ComboOption } from "./AutocompleteCombobox";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const OPTIONS: readonly ComboOption[] = [
  { value: "alpha", primary: "alpha" },
  { value: "beta", primary: "beta" },
];

function stubFieldRect(rect: { top: number; bottom: number; left?: number }) {
  const container = document.querySelector("[data-editor-combobox]") as HTMLElement;
  container.getBoundingClientRect = () =>
    ({
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left ?? 20,
      right: (rect.left ?? 20) + 300,
      width: 300,
      height: rect.bottom - rect.top,
      x: rect.left ?? 20,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect;
}

function renderCombobox() {
  return render(
    <AutocompleteCombobox
      options={OPTIONS}
      onCommit={vi.fn()}
      placeholder="pick"
      ariaLabel="feature"
    />,
  );
}

describe("AutocompleteCombobox floating listbox", () => {
  it("portals the open listbox to the body with fixed, space-capped placement", () => {
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    renderCombobox();
    stubFieldRect({ top: 100, bottom: 130 });
    fireEvent.focus(screen.getByRole("combobox"));

    const listbox = screen.getByRole("listbox");
    // Portaled: NOT a descendant of the combobox container.
    const container = document.querySelector("[data-editor-combobox]") as HTMLElement;
    expect(container.contains(listbox)).toBe(false);
    expect(document.body.contains(listbox)).toBe(true);
    expect(listbox.style.position).toBe("fixed");
    // Placed below the field, height capped at the 16rem ceiling (room is ample).
    expect(listbox.style.top).toBe("134px");
    expect(listbox.style.maxHeight).toBe("256px");
    expect(listbox.style.width).toBe("300px");
  });

  it("caps the height to the room below on a short viewport", () => {
    Object.defineProperty(window, "innerHeight", { value: 360, configurable: true });
    renderCombobox();
    stubFieldRect({ top: 100, bottom: 130 });
    fireEvent.focus(screen.getByRole("combobox"));

    const listbox = screen.getByRole("listbox");
    // Room below = 360 - 130 - 8 = 222 -> capped there, not the 256 ceiling.
    expect(listbox.style.maxHeight).toBe("222px");
  });

  it("flips above the field when the room below is too tight", () => {
    Object.defineProperty(window, "innerHeight", { value: 300, configurable: true });
    renderCombobox();
    stubFieldRect({ top: 250, bottom: 280 });
    fireEvent.focus(screen.getByRole("combobox"));

    const listbox = screen.getByRole("listbox");
    // Below = 300-280-8 = 12 (< the 96 floor); above = 250-8 = 242 -> flip.
    expect(listbox.style.bottom).toBe("54px"); // 300 - 250 + 4
    expect(listbox.style.top).toBe("");
    expect(listbox.style.maxHeight).toBe("242px");
  });

  it("names the listbox via aria-controls only while it is rendered", () => {
    renderCombobox();
    const input = screen.getByRole("combobox");
    expect(input.getAttribute("aria-controls")).toBeNull();
    stubFieldRect({ top: 100, bottom: 130 });
    fireEvent.focus(input);
    const listbox = screen.getByRole("listbox");
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
  });

  it("owns the portaled listbox via aria-owns so activedescendant announces", () => {
    // The portal breaks DOM descendancy, which aria-activedescendant requires;
    // aria-owns re-establishes it (review fast-follow).
    renderCombobox();
    const input = screen.getByRole("combobox");
    expect(input.getAttribute("aria-owns")).toBeNull();
    stubFieldRect({ top: 100, bottom: 130 });
    fireEvent.focus(input);
    expect(input.getAttribute("aria-owns")).toBe(screen.getByRole("listbox").id);
  });

  it("consumes Escape while the list is open so a host dialog stays open", () => {
    const documentSpy = vi.fn();
    document.addEventListener("keydown", documentSpy);
    try {
      renderCombobox();
      const input = screen.getByRole("combobox");
      stubFieldRect({ top: 100, bottom: 130 });
      fireEvent.focus(input);
      expect(screen.getByRole("listbox")).toBeTruthy();
      // First Escape dismisses the LIST only and never reaches the document
      // (a hosting Dialog's dismiss listener lives there).
      fireEvent.keyDown(input, { key: "Escape" });
      expect(screen.queryByRole("listbox")).toBeNull();
      expect(documentSpy).not.toHaveBeenCalled();
      // A second Escape, list closed, propagates to the document (control
      // assertion: the spy is live and the host dismiss still works).
      fireEvent.keyDown(input, { key: "Escape" });
      expect(documentSpy).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener("keydown", documentSpy);
    }
  });

  it("grows option rows to the touch floor on coarse pointers", () => {
    const realMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes("pointer: coarse"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        onchange: null,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
    try {
      renderCombobox();
      stubFieldRect({ top: 100, bottom: 130 });
      fireEvent.focus(screen.getByRole("combobox"));
      const option = screen.getByRole("option", { name: "alpha" });
      expect(option.className).toContain("min-h-[2.75rem]");
    } finally {
      window.matchMedia = realMatchMedia;
    }
  });
});
