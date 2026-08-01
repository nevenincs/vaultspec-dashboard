// @vitest-environment happy-dom
//
// The feature-group panel (feature-group-authoring ADR D1/D3/D4/D5). Contracts:
//   - Store-driven mount: every entry point opens it by flipping `createDocChrome`
//     state; a feature-scoped entry (openCreateDocDialog(feature)) pre-answers stage 1.
//   - Two-stage flow: stage 1 selects-or-creates a feature (corpus-fed combobox, free
//     text preserved) and shows the served pipeline coverage; Continue / Enter advances
//     to stage 2, Back returns.
//   - Stage 2 offers ONLY the eligible pipeline types (exec never offered, ADR D4); an
//     ineligible type is disabled with its served reason and cannot be selected; the
//     pre-filled cross-links render as removable chips.
//
// The structural contracts run against a no-scope seeded client (deterministic, no
// fetch); the coverage-bearing contracts run against the REAL engine over the fixture
// vault (no wire mock) where per-feature coverage actually exists.

import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { queryClient } from "../../stores/server/queryClient";
import { deriveFeatureCoverageView } from "../../stores/server/queries";
import type { FeatureCoverage } from "../../stores/server/engine";
import { useViewStore } from "../../stores/view/viewStore";
import {
  createMenuTestQueryClient,
  MenuTestProviders,
} from "../../testing/menuQueryClient";
import { liveScope } from "../../testing/liveClient";
import { ENGINE_WAIT } from "../../testing/timing";
import {
  goToCreateDocDocumentStage,
  openCreateDocDialog,
  resetCreateDocChrome,
  setCreateDocRelated,
  setCreateDocType,
  useCreateDocChromeStore,
} from "../../stores/view/createDocChrome";
import { CoverageCard, CreateDocDialog } from "./CreateDocDialog";

function renderSeeded() {
  return render(
    <MenuTestProviders client={createMenuTestQueryClient()}>
      <CreateDocDialog />
    </MenuTestProviders>,
  );
}

describe("CreateDocDialog feature-group panel (store-driven mount)", () => {
  afterEach(() => {
    resetCreateDocChrome();
    cleanup();
  });

  it("renders nothing while the chrome store is closed", () => {
    renderSeeded();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens at the feature stage pre-answered from a feature-scoped entry point", () => {
    renderSeeded();
    act(() => {
      openCreateDocDialog("editor-demo");
    });
    // Stage 1 header + the corpus-fed feature combobox seeded with the prefill.
    expect(screen.getByRole("dialog", { name: "Add to a feature" })).toBeTruthy();
    const feature = screen.getByRole("combobox", {
      name: "Feature",
    }) as HTMLInputElement;
    expect(feature.value).toBe("editor-demo");
    // The pipeline coverage card is present on stage 1.
    expect(screen.getByRole("region", { name: "Pipeline progress" })).toBeTruthy();
  });

  it("takes focus on the feature field when opened with the focus request (D5)", () => {
    renderSeeded();
    act(() => {
      openCreateDocDialog(undefined, { focusFeature: true });
    });
    const feature = screen.getByRole("combobox", { name: "Feature" });
    expect(document.activeElement).toBe(feature);
  });

  it("preserves free text so a new tag is committed to the draft (D6)", () => {
    renderSeeded();
    act(() => openCreateDocDialog());
    const feature = screen.getByRole("combobox", { name: "Feature" });
    fireEvent.focus(feature);
    fireEvent.change(feature, { target: { value: "brand-new-feature" } });
    // No option arrowed to: Enter commits the typed free text (a new feature tag) and,
    // with the list closed, advances to the document stage.
    fireEvent.keyDown(feature, { key: "Enter" });
    expect(useCreateDocChromeStore.getState().feature).toBe("brand-new-feature");
  });

  it("advances to the document stage on Continue and returns on Back", () => {
    renderSeeded();
    act(() => openCreateDocDialog("some-feature"));
    expect(screen.getByRole("dialog", { name: "Add to a feature" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    // Stage 2: the header changes and the eligible-type radiogroup appears.
    expect(screen.getByRole("dialog", { name: "Add a document" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Document type" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back to feature" }));
    expect(screen.getByRole("dialog", { name: "Add to a feature" })).toBeTruthy();
  });

  it("Continue is blocked until a feature is chosen", () => {
    renderSeeded();
    act(() => openCreateDocDialog());
    const cont = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(cont.disabled).toBe(true);
  });

  it("focuses the feature combobox on EVERY open, not the header close button", () => {
    // Hardening audit default-initial-focus-is-close-button: a palette/keymap/menu
    // open (no focusFeature flag) must land on the stage's primary field.
    renderSeeded();
    act(() => openCreateDocDialog());
    expect(document.activeElement).toBe(
      screen.getByRole("combobox", { name: "Feature" }),
    );
  });

  it("re-homes focus across stage transitions (audit focus-loss HIGH)", () => {
    renderSeeded();
    act(() => openCreateDocDialog("some-feature"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    // Entering stage 2 focuses the selected type radio (research, the default).
    expect(document.activeElement).toBe(
      screen.getByRole("radio", { name: "Research" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to feature" }));
    // Returning focuses the feature combobox, never document.body.
    expect(document.activeElement).toBe(
      screen.getByRole("combobox", { name: "Feature" }),
    );
  });

  it("announces the stage through a polite live region", () => {
    renderSeeded();
    act(() => openCreateDocDialog("some-feature"));
    const dialog = screen.getByRole("dialog");
    const live = dialog.querySelector('[aria-live="polite"].sr-only') as HTMLElement;
    expect(live.textContent).toBe("Step 1 of 2: add to a feature");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(live.textContent).toBe("Step 2 of 2: add a document");
  });

  it("Home and End rove to the first and last type rows without leaking", () => {
    let windowKeydownCount = 0;
    const countWindowKeydown = () => {
      windowKeydownCount += 1;
    };
    window.addEventListener("keydown", countWindowKeydown);
    try {
      renderSeeded();
      act(() => openCreateDocDialog("some-feature"));
      act(() => goToCreateDocDocumentStage());
      const group = screen.getByRole("radiogroup", { name: "Document type" });
      fireEvent.keyDown(group, { key: "End" });
      expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Audit" }));
      fireEvent.keyDown(group, { key: "Home" });
      expect(document.activeElement).toBe(
        screen.getByRole("radio", { name: "Research" }),
      );
      expect(windowKeydownCount).toBe(0);
    } finally {
      window.removeEventListener("keydown", countWindowKeydown);
    }
  });

  it("Escape preserves the draft; reopen restores it at stage 1", () => {
    // Hardening ADR: dismiss must never wipe typed work.
    renderSeeded();
    act(() => openCreateDocDialog("kept-feature"));
    act(() => goToCreateDocDocumentStage());
    act(() => setCreateDocRelated(["2026-01-01-kept-research"]));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(useCreateDocChromeStore.getState().open).toBe(false);
    expect(useCreateDocChromeStore.getState().feature).toBe("kept-feature");
    act(() => openCreateDocDialog());
    expect(screen.getByRole("dialog", { name: "Add to a feature" })).toBeTruthy();
    expect(
      (screen.getByRole("combobox", { name: "Feature" }) as HTMLInputElement).value,
    ).toBe("kept-feature");
    expect(useCreateDocChromeStore.getState().related).toEqual([
      "2026-01-01-kept-research",
    ]);
  });

  it("offers a corpus-fed add-link field so removed links are recoverable", () => {
    renderSeeded();
    act(() => openCreateDocDialog("some-feature"));
    act(() => goToCreateDocDocumentStage());
    // The affordance is always present (keyboard re-add, hardening follow-on);
    // the seeded no-scope corpus is empty so it degrades to the empty label.
    expect(
      screen.getByRole("combobox", { name: "Add a linked document" }),
    ).toBeTruthy();
  });

  it("never offers exec in the document-type list (ADR D4)", () => {
    renderSeeded();
    act(() => openCreateDocDialog("some-feature"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const group = screen.getByRole("radiogroup", { name: "Document type" });
    // The always-open entry points are offered; exec / "Step record" is not.
    expect(within(group).getByRole("radio", { name: "Research" })).toBeTruthy();
    expect(within(group).getByRole("radio", { name: "Reference" })).toBeTruthy();
    expect(within(group).queryByRole("radio", { name: /step/i })).toBeNull();
  });

  it("renders the pre-filled cross-links as removable chips", () => {
    renderSeeded();
    act(() => openCreateDocDialog("some-feature"));
    // Seed the editable related list AFTER the open-time seed has settled, then reach
    // the document stage (a stage change does not re-seed, so the chips persist).
    act(() =>
      setCreateDocRelated(["2026-01-01-alpha-research", "2026-01-05-beta-adr"]),
    );
    act(() => goToCreateDocDocumentStage());

    const links = screen.getByRole("list", { name: "Linked documents" });
    expect(within(links).getAllByRole("listitem")).toHaveLength(2);

    fireEvent.click(
      screen.getByRole("button", { name: "Remove 2026-01-01-alpha-research" }),
    );
    expect(useCreateDocChromeStore.getState().related).toEqual(["2026-01-05-beta-adr"]);
    expect(within(links).getAllByRole("listitem")).toHaveLength(1);
  });

  it("arrow keys rove the type selection without leaking to the global keymap dispatcher", () => {
    // The one global dispatcher owns bare Arrow{Up,Down,Left,Right} (feature/neighbor
    // navigation) through a `window` keydown listener (keymapDispatcher). This asserts
    // against that REAL mechanism: a window-level keydown spy is the dispatcher's entry
    // point. Arrowing between the type radios must move the selection AND be stopped
    // by the composite so it never reaches the window listener (actions-keymap-palette
    // law) — otherwise roving the radios would also mutate the graph selection.
    let windowKeydownCount = 0;
    const countWindowKeydown = () => {
      windowKeydownCount += 1;
    };
    window.addEventListener("keydown", countWindowKeydown);
    try {
      renderSeeded();
      act(() => openCreateDocDialog("some-feature"));
      act(() => goToCreateDocDocumentStage());

      // With no served coverage the always-open entry points are the eligible radios:
      // research (default) → reference.
      const group = screen.getByRole("radiogroup", { name: "Document type" });
      expect(useCreateDocChromeStore.getState().docType).toBe("research");

      fireEvent.keyDown(group, { key: "ArrowDown" });
      // The selection moved (roving worked) ...
      expect(useCreateDocChromeStore.getState().docType).toBe("reference");
      // ... and the arrow was stopped before the window dispatcher.
      expect(windowKeydownCount).toBe(0);

      // Control: the SAME key on the title input (which does not consume arrows) DOES
      // reach the window listener — proving the spy is live and the radiogroup's
      // suppression is specific, not a dead assertion.
      const title = screen.getByLabelText("Title");
      fireEvent.keyDown(title, { key: "ArrowDown" });
      expect(windowKeydownCount).toBe(1);
    } finally {
      window.removeEventListener("keydown", countWindowKeydown);
    }
  });
});

describe("CreateDocDialog coverage card renders distinct honest states", () => {
  afterEach(() => cleanup());

  // A wire-shaped tiers block fed to the REAL `deriveFeatureCoverageView` derivation
  // (test data + the production reducer, not a wire mock): a degraded `structural`
  // tier is how the coverage projection reports unavailability.
  function loadingView() {
    return deriveFeatureCoverageView(undefined, undefined, true);
  }
  function degradedView() {
    return deriveFeatureCoverageView(
      { structural: { available: false, reason: "core offline" } },
      undefined,
      false,
    );
  }
  function newFeatureView() {
    const coverage: FeatureCoverage = {
      feature: "fresh",
      types: [
        { doc_type: "research", present: false, count: 0, eligible: true },
        { doc_type: "reference", present: false, count: 0, eligible: true },
        { doc_type: "adr", present: false, count: 0, eligible: false },
        { doc_type: "plan", present: false, count: 0, eligible: false },
        { doc_type: "exec", present: false, count: 0, eligible: false },
        { doc_type: "audit", present: false, count: 0, eligible: true },
      ],
      missing: ["research", "reference", "adr", "plan", "exec", "audit"],
    };
    return deriveFeatureCoverageView(
      { structural: { available: true } },
      coverage,
      false,
    );
  }

  it("loading shows the checking line only", () => {
    render(<CoverageCard feature="fresh" coverageView={loadingView()} />);
    expect(screen.getByText(/Checking feature progress/i)).toBeTruthy();
    expect(screen.queryByText(/Project progress is unavailable/i)).toBeNull();
    expect(screen.queryByText(/No documents yet/i)).toBeNull();
  });

  it("degraded shows the honest unavailable line, never an empty-pipeline claim", () => {
    render(<CoverageCard feature="fresh" coverageView={degradedView()} />);
    expect(screen.getByText(/Project progress is unavailable/i)).toBeTruthy();
    expect(screen.queryByText(/Checking feature progress/i)).toBeNull();
    expect(screen.queryByText(/No documents yet/i)).toBeNull();
  });

  it("a served all-missing feature shows the new-feature note (distinct from degraded)", () => {
    render(<CoverageCard feature="fresh" coverageView={newFeatureView()} />);
    expect(screen.getByText(/No documents yet/i)).toBeTruthy();
    expect(screen.queryByText(/Project progress is unavailable/i)).toBeNull();
    expect(screen.queryByText(/Checking feature progress/i)).toBeNull();
  });
});

describe("CreateDocDialog feature-group panel (live engine coverage)", () => {
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

  function renderLive() {
    return render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(CreateDocDialog),
      ),
    );
  }

  it("suggests the fixture vault's feature tags in the combobox", async () => {
    useViewStore.getState().setScope(scope);
    renderLive();
    act(() => openCreateDocDialog());
    const feature = screen.getByRole("combobox", { name: "Feature" });
    fireEvent.focus(feature);
    await waitFor(
      () => expect(screen.getByRole("option", { name: "alpha" })).toBeTruthy(),
      ENGINE_WAIT,
    );
  });

  it("renders served pipeline coverage rows for a covered feature", async () => {
    useViewStore.getState().setScope(scope);
    renderLive();
    // The fixture "alpha" feature carries research/adr/plan/exec/audit.
    act(() => openCreateDocDialog("alpha"));
    const card = screen.getByRole("region", { name: "Pipeline progress" });
    await waitFor(
      () => expect(within(card).getByText("2026-01-01-alpha-research")).toBeTruthy(),
      ENGINE_WAIT,
    );
    // The present pipeline slots read as Present (served, not client-derived).
    expect(within(card).getAllByText("Present").length).toBeGreaterThan(0);
  });

  it("disables an ineligible type with its served reason and keeps it unselectable", async () => {
    useViewStore.getState().setScope(scope);
    renderLive();
    // A brand-new feature the engine has never observed serves all-missing coverage:
    // research/reference are the always-open entry points; adr is ineligible.
    act(() => openCreateDocDialog("fresh-unseen-feature"));
    // Wait for served coverage so eligibility comes from the wire, not the fallback.
    const card = screen.getByRole("region", { name: "Pipeline progress" });
    await waitFor(
      () => expect(within(card).getByText(/No documents yet/i)).toBeTruthy(),
      ENGINE_WAIT,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    const group = screen.getByRole("radiogroup", { name: "Document type" });
    const adr = within(group).getByRole("radio", {
      name: "Decision record",
    }) as HTMLButtonElement;
    // aria-disabled, NOT hard-disabled (hardening audit HIGH): the row stays
    // focusable so keyboard/screen-reader users can REACH it and hear its served
    // reason, which is programmatically associated via aria-describedby.
    expect(adr.disabled).toBe(false);
    expect(adr.getAttribute("aria-disabled")).toBe("true");
    const reason = within(group).getByText(
      "Add a research or reference document first.",
    );
    expect(reason).toBeTruthy();
    expect(adr.getAttribute("aria-describedby")).toBe(reason.id);
    adr.focus();
    expect(document.activeElement).toBe(adr);
    // Activating the ineligible type NEVER selects it — it routes to the
    // prerequisite instead (one-click path, asserted in its own test below).
    fireEvent.click(adr);
    expect(adr.getAttribute("aria-checked")).toBe("false");
    expect(useCreateDocChromeStore.getState().docType).not.toBe("adr");
  });

  it("one-click routes an ineligible type to its eligible prerequisite (ADR D3)", async () => {
    useViewStore.getState().setScope(scope);
    renderLive();
    act(() => openCreateDocDialog("fresh-unseen-feature"));
    const card = screen.getByRole("region", { name: "Pipeline progress" });
    await waitFor(
      () => expect(within(card).getByText(/No documents yet/i)).toBeTruthy(),
      ENGINE_WAIT,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    // Move the selection off the entry point first so the routing is observable.
    act(() => setCreateDocType("audit"));
    const group = screen.getByRole("radiogroup", { name: "Document type" });
    const adr = within(group).getByRole("radio", { name: "Decision record" });
    fireEvent.click(adr);
    // adr's gate is research-or-reference: the click selects and focuses research.
    expect(useCreateDocChromeStore.getState().docType).toBe("research");
    expect(document.activeElement).toBe(
      within(group).getByRole("radio", { name: "Research" }),
    );
  });

  it("re-adds a removed link through the corpus-fed add field", async () => {
    useViewStore.getState().setScope(scope);
    renderLive();
    act(() => openCreateDocDialog("alpha"));
    const card = screen.getByRole("region", { name: "Pipeline progress" });
    await waitFor(
      () => expect(within(card).getByText("2026-01-01-alpha-research")).toBeTruthy(),
      ENGINE_WAIT,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    // The default type (research) seeds no links; pick a stem from the live corpus
    // through the add field and commit it — the chip appears, removable again.
    const add = screen.getByRole("combobox", { name: "Add a linked document" });
    fireEvent.focus(add);
    fireEvent.change(add, { target: { value: "alpha-research" } });
    await waitFor(() => expect(screen.getByRole("listbox")).toBeTruthy(), ENGINE_WAIT);
    const option = screen
      .getAllByRole("option")
      .find((node) => node.textContent?.includes("2026-01-01-alpha-research"));
    expect(option).toBeTruthy();
    fireEvent.mouseDown(option!);
    expect(useCreateDocChromeStore.getState().related).toContain(
      "2026-01-01-alpha-research",
    );
    expect(
      screen.getByRole("button", { name: "Remove 2026-01-01-alpha-research" }),
    ).toBeTruthy();
  });
});
