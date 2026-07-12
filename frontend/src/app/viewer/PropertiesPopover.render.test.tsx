// @vitest-environment happy-dom
//
// Render tests for the on-demand Properties popover (document-editor-redesign
// P02.S03/S04): CLOSED by default (no permanent column), opens on demand from the
// Properties button into a vertical form, shows the read-only directory tag, edits
// the feature tag while preserving it, and dismisses on Escape.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EditorLinkingCorpus } from "../../stores/server/queries";
import type { MarkdownEditorFrontmatterDraft } from "../../stores/view/editor";
import { PropertiesPopover } from "./PropertiesPopover";

afterEach(cleanup);

const CORPUS: EditorLinkingCorpus = {
  documents: [{ stem: "alpha-plan", title: "Alpha plan", feature: "alpha" }],
  featureTags: ["alpha", "beta", "document-editor-redesign"],
};

function renderPopover(
  overrides: {
    draft?: Partial<MarkdownEditorFrontmatterDraft>;
    onFrontmatterChange?: (patch: Partial<MarkdownEditorFrontmatterDraft>) => void;
    onSaveProperties?: () => void;
  } = {},
) {
  const draft: MarkdownEditorFrontmatterDraft = {
    tags: "#plan, #old-feature",
    date: "2026-07-11",
    related: "",
    ...overrides.draft,
  };
  return render(
    <PropertiesPopover
      frontmatterDraft={draft}
      onFrontmatterChange={overrides.onFrontmatterChange ?? (() => undefined)}
      onSaveProperties={overrides.onSaveProperties ?? (() => undefined)}
      savingProperties={false}
      renameDraft="2026-07-11-x-plan"
      onRenameChange={() => undefined}
      onRename={() => undefined}
      renaming={false}
      renameDisabled
      corpus={CORPUS}
      selfStem="2026-07-11-x-plan"
    />,
  );
}

describe("PropertiesPopover", () => {
  it("is closed by default and opens on demand", () => {
    renderPopover();
    expect(screen.queryByRole("dialog", { name: "Document properties" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Document properties" }));
    expect(screen.getByRole("dialog", { name: "Document properties" })).toBeTruthy();
    // The read-only directory tag row is shown, never an editable field.
    expect(screen.getByText("#plan")).toBeTruthy();
    expect(screen.getByLabelText("document name")).toBeTruthy();
  });

  it("edits the feature tag while preserving the directory tag", () => {
    const onFrontmatterChange = vi.fn();
    renderPopover({ onFrontmatterChange });
    fireEvent.click(screen.getByRole("button", { name: "Document properties" }));

    const input = screen.getByRole("combobox", {
      name: "set the document feature tag",
    });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "beta" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: "beta" }));

    expect(onFrontmatterChange).toHaveBeenCalledWith({ tags: "#plan, #beta" });
  });

  it("dismisses on Escape", () => {
    renderPopover();
    fireEvent.click(screen.getByRole("button", { name: "Document properties" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("saves properties on demand", () => {
    const onSaveProperties = vi.fn();
    renderPopover({ onSaveProperties });
    fireEvent.click(screen.getByRole("button", { name: "Document properties" }));
    fireEvent.click(screen.getByRole("button", { name: "Save properties" }));
    expect(onSaveProperties).toHaveBeenCalledTimes(1);
  });
});
