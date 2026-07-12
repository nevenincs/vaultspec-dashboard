// @vitest-environment happy-dom
//
// The "New document" dialog (authoring-surface ADR D5/D6). Two contracts:
//   - Store-driven mount: every entry point (context menu, palette, Mod+Alt+N, the
//     new visible create buttons) opens it by flipping `createDocChrome` state.
//   - The feature field is the corpus-fed autocomplete combobox (D6): it lists the
//     live feature vocabulary yet preserves free text so a NEW tag still creates the
//     feature with its first document, and it honours the Features-section focus
//     request (D5) by taking focus on open. Enter with the list closed submits.
//
// The structural contracts run against a no-scope seeded client (deterministic, no
// fetch); the corpus-listing contract runs against the REAL engine over the fixture
// vault (no wire mock) where the feature vocabulary actually exists.

import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import {
  createMenuTestQueryClient,
  MenuTestProviders,
} from "../../testing/menuQueryClient";
import { liveScope } from "../../testing/liveClient";
import { ENGINE_WAIT } from "../../testing/timing";
import {
  openCreateDocDialog,
  resetCreateDocChrome,
  useCreateDocChromeStore,
} from "../../stores/view/createDocChrome";
import { CreateDocDialog } from "./CreateDocDialog";

function renderSeeded() {
  return render(
    <MenuTestProviders client={createMenuTestQueryClient()}>
      <CreateDocDialog />
    </MenuTestProviders>,
  );
}

describe("CreateDocDialog (store-driven mount)", () => {
  afterEach(() => {
    resetCreateDocChrome();
    cleanup();
  });

  it("renders nothing while the chrome store is closed", () => {
    renderSeeded();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opening the store renders the create form with the feature prefill", () => {
    renderSeeded();
    act(() => {
      openCreateDocDialog("editor-demo");
    });
    expect(screen.getByRole("dialog", { name: "New document" })).toBeTruthy();
    expect(screen.getByLabelText("document type")).toBeTruthy();
    expect(screen.getByLabelText("title")).toBeTruthy();
    // The feature field is now a combobox seeded with the prefill.
    const feature = screen.getByRole("combobox", {
      name: "feature",
    }) as HTMLInputElement;
    expect(feature.value).toBe("editor-demo");
  });

  it("takes focus on the feature field when opened with the focus request (D5)", () => {
    renderSeeded();
    act(() => {
      openCreateDocDialog(undefined, { focusFeature: true });
    });
    const feature = screen.getByRole("combobox", { name: "feature" });
    expect(document.activeElement).toBe(feature);
  });

  it("preserves free text so a new tag is committed to the draft (D6)", () => {
    renderSeeded();
    act(() => openCreateDocDialog());
    const feature = screen.getByRole("combobox", { name: "feature" });
    fireEvent.focus(feature);
    fireEvent.change(feature, { target: { value: "brand-new-feature" } });
    // No option arrowed to: Enter commits the typed free text (a new feature tag).
    fireEvent.keyDown(feature, { key: "Enter" });
    expect(useCreateDocChromeStore.getState().feature).toBe("brand-new-feature");
  });

  it("submits the dialog on Enter when the suggestion list is closed", () => {
    renderSeeded();
    act(() => openCreateDocDialog());
    const feature = screen.getByRole("combobox", { name: "feature" });
    // Type a feature (list open), then close the list with Tab (Escape would bubble
    // to the Dialog's own dismiss) so Enter falls through to the host submit rather
    // than a picker commit.
    fireEvent.focus(feature);
    fireEvent.change(feature, { target: { value: "some-feature" } });
    fireEvent.keyDown(feature, { key: "Tab" });
    fireEvent.keyDown(feature, { key: "Enter" });
    // The submit ran: with the title still empty it surfaces the validation error —
    // proof the closed-list Enter routed to the dialog's submit, not a swallow.
    expect(screen.getByRole("alert").textContent).toBe(
      "Feature and title are required",
    );
  });
});

describe("CreateDocDialog feature combobox lists the live corpus (live engine)", () => {
  let scope: string;
  beforeAll(async () => {
    scope = await liveScope();
  });
  afterEach(async () => {
    resetCreateDocChrome();
    cleanup();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0), ENGINE_WAIT);
    queryClient.clear();
    useViewStore.getState().setScope(null);
  });

  it("suggests the fixture vault's feature tags", async () => {
    useViewStore.getState().setScope(scope);
    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(CreateDocDialog),
      ),
    );
    act(() => openCreateDocDialog());
    const feature = screen.getByRole("combobox", { name: "feature" });
    fireEvent.focus(feature);
    // The fixture vault carries the "alpha" feature; it surfaces as a listbox option.
    await waitFor(
      () => expect(screen.getByRole("option", { name: "alpha" })).toBeTruthy(),
      ENGINE_WAIT,
    );
  });
});
