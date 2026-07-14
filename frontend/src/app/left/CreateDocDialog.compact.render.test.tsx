// @vitest-environment happy-dom
//
// The feature-group panel's COMPACT presentation (create-panel-hardening P03.S08).
// The user-approved compact frame is a NARROW CENTERED MODAL (the audit's design
// ruling), so the compact contract is the hardened Dialog + touch behavior, not a
// sheet fork: the primary action is pinned outside the scrolling body (reachable
// with the soft keyboard up), the suggestion listbox portals out of the clipping
// scroll container, touch affordances meet the 2.75rem floor, and the panel clamps
// to the viewport width. `matchMedia` is stubbed to a compact viewport + coarse
// pointer (the CompactUnifiedRail idiom); happy-dom has no layout, so the
// assertions target the structural contract, not pixels.

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  goToCreateDocDocumentStage,
  openCreateDocDialog,
  resetCreateDocChrome,
  setCreateDocRelated,
} from "../../stores/view/createDocChrome";
import {
  createMenuTestQueryClient,
  MenuTestProviders,
} from "../../testing/menuQueryClient";
import { CreateDocDialog } from "./CreateDocDialog";

const realMatchMedia = window.matchMedia;

beforeAll(() => {
  // Compact viewport class + coarse primary pointer, the shell's two compact
  // signals (the CompactUnifiedRail stub idiom).
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes("max-width") || query.includes("pointer: coarse"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
});

afterAll(() => {
  window.matchMedia = realMatchMedia;
});

afterEach(() => {
  resetCreateDocChrome();
  cleanup();
});

function renderCompact() {
  return render(
    <MenuTestProviders client={createMenuTestQueryClient()}>
      <CreateDocDialog />
    </MenuTestProviders>,
  );
}

describe("CreateDocDialog compact presentation", () => {
  it("pins the primary action outside the scrolling body (soft-keyboard reachability)", () => {
    renderCompact();
    act(() => openCreateDocDialog("some-feature"));
    act(() => goToCreateDocDocumentStage());
    const dialog = screen.getByRole("dialog");
    const scroller = dialog.querySelector(".overflow-y-auto") as HTMLElement;
    const createButton = screen.getByRole("button", { name: "Create" });
    // The audit's compact-submit-behind-keyboard HIGH: the footer must never live
    // inside the one scrolling region, so it cannot scroll behind the keyboard.
    expect(scroller.contains(createButton)).toBe(false);
    expect(dialog.contains(createButton)).toBe(true);
    // The pinned region carries the safe-area inset.
    const footer = createButton.closest('[class*="safe-area-inset-bottom"]');
    expect(footer).toBeTruthy();
  });

  it("clamps the panel to the viewport width (narrow centered modal, not a sheet)", () => {
    renderCompact();
    act(() => openCreateDocDialog());
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-w-[calc(100vw-2rem)]");
    // The approved compact frame is the centered Dialog — no sheet chrome.
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("portals the feature-suggestion listbox out of the clipping scroll container", () => {
    renderCompact();
    act(() => openCreateDocDialog());
    const input = screen.getByRole("combobox", { name: "feature" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "anything" } });
    const listbox = screen.getByRole("listbox");
    const dialog = screen.getByRole("dialog");
    // Fixed + portaled to the body: the dialog's overflow can never cut it off.
    expect(dialog.contains(listbox)).toBe(false);
    expect(document.body.contains(listbox)).toBe(true);
    expect(listbox.style.position).toBe("fixed");
  });

  it("meets the 2.75rem touch floor on the back, chip-remove, and option rows", () => {
    renderCompact();
    act(() => openCreateDocDialog("some-feature"));
    act(() => setCreateDocRelated(["2026-01-01-alpha-research"]));
    act(() => goToCreateDocDocumentStage());
    const back = screen.getByRole("button", { name: "Back to feature" });
    expect(back.className).toContain("min-h-[2.75rem]");
    const remove = screen.getByRole("button", {
      name: "Remove 2026-01-01-alpha-research",
    });
    expect(remove.className).toContain("min-h-[2.75rem]");
    expect(remove.className).toContain("min-w-[2.75rem]");
    // The doc-type radios already exceed the floor via their two-line padding; the
    // shared combobox options grow through the primitive's coarse branch (locked in
    // the AutocompleteCombobox suite).
    const group = screen.getByRole("radiogroup", { name: "Document type" });
    expect(within(group).getAllByRole("radio").length).toBeGreaterThan(0);
  });
});
