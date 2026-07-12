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

import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { ContentView } from "../../stores/server/queries";
import { queryClient } from "../../stores/server/queryClient";
import { openDocumentEditor, closeDocumentEditor } from "../../stores/view/editor";
import { MarkdownDocView } from "./MarkdownDocView";

const NODE_ID = "doc:2026-07-11-sample-plan";
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
  const view = render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MarkdownDocView, {
        nodeId: NODE_ID,
        content: content(),
        scope: null,
        trail: [],
      }),
    ),
  );
  act(() => openDocumentEditor(NODE_ID, BODY, "abc"));
  return view;
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
