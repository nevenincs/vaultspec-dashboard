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
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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
      name: "feature",
    }) as HTMLInputElement;
    expect(feature.value).toBe("editor-demo");
    // The pipeline coverage card is present on stage 1.
    expect(screen.getByRole("region", { name: "Pipeline coverage" })).toBeTruthy();
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
    const windowSpy = vi.fn();
    window.addEventListener("keydown", windowSpy);
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
      expect(windowSpy).not.toHaveBeenCalled();

      // Control: the SAME key on the title input (which does not consume arrows) DOES
      // reach the window listener — proving the spy is live and the radiogroup's
      // suppression is specific, not a dead assertion.
      const title = screen.getByLabelText("title");
      fireEvent.keyDown(title, { key: "ArrowDown" });
      expect(windowSpy).toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", windowSpy);
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
    expect(screen.getByText(/Checking this feature/i)).toBeTruthy();
    expect(screen.queryByText(/unavailable right now/i)).toBeNull();
    expect(screen.queryByText(/No documents yet/i)).toBeNull();
  });

  it("degraded shows the honest unavailable line, never an empty-pipeline claim", () => {
    render(<CoverageCard feature="fresh" coverageView={degradedView()} />);
    expect(screen.getByText(/unavailable right now/i)).toBeTruthy();
    expect(screen.queryByText(/Checking this feature/i)).toBeNull();
    expect(screen.queryByText(/No documents yet/i)).toBeNull();
  });

  it("a served all-missing feature shows the new-feature note (distinct from degraded)", () => {
    render(<CoverageCard feature="fresh" coverageView={newFeatureView()} />);
    expect(screen.getByText(/No documents yet/i)).toBeTruthy();
    expect(screen.queryByText(/unavailable right now/i)).toBeNull();
    expect(screen.queryByText(/Checking this feature/i)).toBeNull();
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
    const feature = screen.getByRole("combobox", { name: "feature" });
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
    const card = screen.getByRole("region", { name: "Pipeline coverage" });
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
    const card = screen.getByRole("region", { name: "Pipeline coverage" });
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
      "Needs a research or reference document first",
    );
    expect(reason).toBeTruthy();
    expect(adr.getAttribute("aria-describedby")).toBe(reason.id);
    adr.focus();
    expect(document.activeElement).toBe(adr);
    // Activating the ineligible type is a no-op — it is never selectable or
    // submittable (the selection stays on the eligible entry point).
    fireEvent.click(adr);
    expect(adr.getAttribute("aria-checked")).toBe("false");
    expect(useCreateDocChromeStore.getState().docType).not.toBe("adr");
  });
});
