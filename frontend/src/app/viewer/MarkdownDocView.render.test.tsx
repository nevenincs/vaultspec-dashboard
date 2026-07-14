// @vitest-environment happy-dom
//
// Render tests for the redesigned markdown editor view (document-editor-redesign
// P04.S07): edit mode is a full-width body with the formatting toolbar and an
// on-demand (closed-by-default) Properties popover — no permanent metadata column.
// Crucially it guards that the editor does NOT swallow global command chords
// (Mod+K = command palette, Mod+B = left-rail toggle): formatting is a toolbar-only
// surface, so those keys must fall through unchanged (the regression the review
// caught). Runs online against the live engine harness; the corpus hook is left
// idle (scope null) since these assertions do not need it.
//
// W03.P06.S20 addendum: in-editor diff render tests + enrollment guard for
// `editor:toggle-diff` — verifies the diff panel, the keymap chord, and the
// palette command under the one shared action id.

import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
} from "../../localization/testing";
import { en } from "../../locales/en";
import type { ContentView } from "../../stores/server/queries";
import { queryClient } from "../../stores/server/queryClient";
import {
  closeDocumentEditor,
  openDocumentEditor,
  updateEditorDraft,
} from "../../stores/view/editor";
import {
  EDITOR_TOGGLE_DIFF_ACTION_ID,
  deriveEditorKeybindings,
} from "../../stores/view/editorKeybindings";
import {
  resetCommandProviders,
  resolveCommands,
  type CommandContext,
} from "../../stores/view/commandRegistry";
import "../../stores/view/commandProviders/editorCommandProvider";
import { MarkdownDocView } from "./MarkdownDocView";

const NODE_ID = "doc:2026-07-11-sample-plan";
const TOGGLE_CHANGES_LABEL = en.documents.actions.showOrHideChanges;
const BODY = [
  "---",
  "tags:",
  "  - '#plan'",
  "  - '#sample'",
  "---",
  "",
  "Hello world",
].join("\n");

function content(): ContentView {
  return {
    loading: false,
    errored: false,
    degraded: false,
    degradedTiers: [],
    reasons: {},
    path: ".vault/plan/2026-07-11-sample-plan.md",
    blobHash: "abc",
    languageHint: "markdown",
    text: BODY,
    truncated: null,
    available: true,
  };
}

function renderEditing() {
  const runtime = createTestLocalizationRuntime();
  const view = render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider client={queryClient}>
        <MarkdownDocView nodeId={NODE_ID} content={content()} scope={null} trail={[]} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  act(() => openDocumentEditor(NODE_ID, BODY, "abc"));
  return { ...view, runtime };
}

afterEach(() => {
  act(() => closeDocumentEditor());
  cleanup();
  queryClient.clear();
  document.body.innerHTML = "";
});

describe("MarkdownDocView edit mode", () => {
  it("renders a full-width body with the toolbar and NO permanent properties column", () => {
    renderEditing();
    expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeTruthy();
    expect(screen.getByLabelText("document body editor")).toBeTruthy();
    // The properties surface is closed by default — no dialog, no permanent form.
    expect(screen.queryByRole("dialog", { name: "Document properties" })).toBeNull();
  });

  it("opens the Properties popover on demand", () => {
    renderEditing();
    fireEvent.click(screen.getByRole("button", { name: "Document properties" }));
    expect(screen.getByRole("dialog", { name: "Document properties" })).toBeTruthy();
  });

  it("applies a formatting command from the toolbar to the selection", () => {
    renderEditing();
    const textarea = screen.getByLabelText(
      "document body editor",
    ) as HTMLTextAreaElement;
    textarea.setSelectionRange(0, textarea.value.length);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    const updated = screen.getByLabelText(
      "document body editor",
    ) as HTMLTextAreaElement;
    expect(updated.value.startsWith("**")).toBe(true);
    expect(updated.value.endsWith("**")).toBe(true);
  });

  it("does NOT swallow the global Mod+K / Mod+B chords (no bespoke formatting accelerator)", () => {
    renderEditing();
    const textarea = screen.getByLabelText(
      "document body editor",
    ) as HTMLTextAreaElement;
    const before = textarea.value;

    // Mod+K would open the command palette; Mod+B toggles the left rail. Neither
    // must be consumed as a formatting command by the editor.
    fireEvent.keyDown(textarea, { key: "k", ctrlKey: true });
    fireEvent.keyDown(textarea, { key: "b", ctrlKey: true });

    const after = (screen.getByLabelText("document body editor") as HTMLTextAreaElement)
      .value;
    expect(after).toBe(before);
    expect(after.includes("](url)")).toBe(false);
    expect(after.includes("**")).toBe(false);
  });
});

// ── W03.P06.S20 ─────────────────────────────────────────────────────────────
// In-editor diff render tests (authoring-surface ADR D4).

describe("MarkdownDocView diff panel (S20)", () => {
  it("shows the diff toggle button in edit mode", () => {
    renderEditing();
    expect(screen.getByRole("button", { name: TOGGLE_CHANGES_LABEL })).toBeTruthy();
  });

  it("reactively localizes the diff toggle without replacing it", async () => {
    const { runtime } = renderEditing();
    const toggle = screen.getByRole("button", { name: TOGGLE_CHANGES_LABEL });

    await act(async () => runtime.changeLanguage(ltrTestLocale));

    const localized = screen.getByRole("button", {
      name: "Afficher ou masquer les modifications",
    });
    expect(localized).toBe(toggle);
    expect(localized.getAttribute("title")).toBe(
      "Afficher ou masquer les modifications",
    );
  });

  it("does NOT mount the diff section before the toggle fires", () => {
    renderEditing();
    expect(document.querySelector("[data-editor-diff-section]")).toBeNull();
  });

  it("renders added diff hunks after toggling when the draft diverges from the base", () => {
    const { container } = renderEditing();
    // Diverge the draft from the base text by appending a new line.
    act(() => updateEditorDraft(BODY + "\nAdded line from draft"));
    fireEvent.click(screen.getByRole("button", { name: TOGGLE_CHANGES_LABEL }));
    // At least one added hunk must be present.
    expect(container.querySelectorAll('[data-diff-line="add"]').length).toBeGreaterThan(
      0,
    );
  });

  it("collapses the diff section when the toggle fires a second time", () => {
    renderEditing();
    act(() => updateEditorDraft(BODY + "\nAdded line from draft"));
    const btn = screen.getByRole("button", { name: TOGGLE_CHANGES_LABEL });
    fireEvent.click(btn);
    // Diff section is visible.
    expect(document.querySelector("[data-editor-diff-section]")).not.toBeNull();
    fireEvent.click(btn);
    // Diff section is hidden again.
    expect(document.querySelector("[data-editor-diff-section]")).toBeNull();
  });

  it("does not mount the diff toggle or section in read mode (editor closed)", () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <QueryClientProvider client={queryClient}>
          <MarkdownDocView
            nodeId={NODE_ID}
            content={content()}
            scope={null}
            trail={[]}
          />
        </QueryClientProvider>
      </I18nextProvider>,
    );
    // Not in edit mode — neither the diff button nor the diff section appears.
    expect(screen.queryByRole("button", { name: TOGGLE_CHANGES_LABEL })).toBeNull();
    expect(document.querySelector("[data-editor-diff-section]")).toBeNull();
  });
});

// Enrollment guard: one shared id under keymap and palette (actions-keymap-palette).
const noop = () => undefined;
function editorCommandContext(): CommandContext {
  return {
    scope: "all",
    timeTravel: false,
    keybindingOverrides: {},
    graphFrozen: false,
    openControlPanel: null,
    shell: {
      leftRailVisible: true,
      leftCollapsed: false,
      rightCollapsed: false,
      timelineVisible: true,
      graphVisible: true,
    },
    intents: {
      collapseTree: noop,
      resetFilters: noop,
      clearFeatureFilter: noop,
      clearProjectHistory: noop,
      setTheme: noop,
      runOp: noop,
      closeDocument: noop,
      closeAllDocuments: noop,
      reloadActiveDocument: noop,
      keepActiveDocumentOpen: noop,
      setGraphFrozen: noop,
      jumpToLive: noop,
      fitTimelineToCorpus: noop,
      setTimelineRangeDays: noop,
      clearDateRange: noop,
      toggleLeftRail: noop,
      toggleLeftCollapsed: noop,
      toggleRightRail: noop,
      toggleTimeline: noop,
      toggleGraph: noop,
      setRightTab: noop,
      resetLayout: noop,
      showKeyboardShortcuts: noop,
    },
  };
}

describe("editor:toggle-diff enrollment guard (S20)", () => {
  afterAll(() => resetCommandProviders());

  it("is enrolled in the keymap registry under the canonical id with Mod+Shift+D", () => {
    const binding = deriveEditorKeybindings().find(
      (b) => b.id === EDITOR_TOGGLE_DIFF_ACTION_ID,
    );
    expect(binding).toBeTruthy();
    expect(binding?.defaultChord).toBe("Mod+Shift+D");
  });

  it("is enrolled in the palette under the same shared id in the edit family", () => {
    const commands = resolveCommands(editorCommandContext());
    const command = commands.find((c) => c.id === EDITOR_TOGGLE_DIFF_ACTION_ID);
    expect(command).toBeTruthy();
    expect(command?.family).toBe("edit");
  });
});

// ── W03.P06.S19 ceiling closure ──────────────────────────────────────────────
// Verifies the debounce that bounds per-keystroke O(n·m) line-LCS cost:
// rapid draft edits must not recompute the diff immediately; the diff must
// settle to the final draft after the 250ms trailing window.

describe("MarkdownDocView diff debounce (S19 ceiling closure)", () => {
  it("debounces proposed text: rapid edits do not immediately recompute the diff, then settle after 250ms", async () => {
    const { container } = renderEditing();
    // Open the diff panel: leading flush renders the current draft (same as base —
    // no divergence yet, so no added hunks).
    fireEvent.click(screen.getByRole("button", { name: TOGGLE_CHANGES_LABEL }));
    expect(container.querySelectorAll('[data-diff-line="add"]').length).toBe(0);

    // Rapid successive keystrokes — all within the 250ms window.
    act(() => updateEditorDraft(BODY + "\nFirst added line"));
    act(() => updateEditorDraft(BODY + "\nSecond added line"));
    act(() => updateEditorDraft(BODY + "\nFinal added line"));

    // Debounce timer has NOT elapsed: diff still reflects the open-flush snapshot (no hunks).
    expect(container.querySelectorAll('[data-diff-line="add"]').length).toBe(0);

    // Diff has now settled to the final draft: at least one added hunk is visible.
    await waitFor(
      () =>
        expect(
          container.querySelectorAll('[data-diff-line="add"]').length,
        ).toBeGreaterThan(0),
      { timeout: 1_000 },
    );
  });
});
