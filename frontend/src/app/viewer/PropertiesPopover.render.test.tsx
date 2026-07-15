// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { en } from "../../locales/en";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
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
    savingProperties?: boolean;
    renaming?: boolean;
    renameDisabled?: boolean;
  } = {},
) {
  const runtime = createTestLocalizationRuntime();
  const frontmatterPatches: Array<Partial<MarkdownEditorFrontmatterDraft>> = [];
  const renameValues: string[] = [];
  let saveCount = 0;
  let renameCount = 0;
  const draft: MarkdownEditorFrontmatterDraft = {
    tags: "#plan, #old-feature",
    date: "2026-07-11",
    related: "",
    ...overrides.draft,
  };
  const result = render(
    <I18nextProvider i18n={runtime}>
      <PropertiesPopover
        frontmatterDraft={draft}
        onFrontmatterChange={(patch) => frontmatterPatches.push(patch)}
        onSaveProperties={() => {
          saveCount += 1;
        }}
        savingProperties={overrides.savingProperties ?? false}
        renameDraft="2026-07-11-x-plan"
        onRenameChange={(value) => renameValues.push(value)}
        onRename={() => {
          renameCount += 1;
        }}
        renaming={overrides.renaming ?? false}
        renameDisabled={overrides.renameDisabled ?? false}
        corpus={CORPUS}
        selfStem="2026-07-11-x-plan"
      />
    </I18nextProvider>,
  );

  return {
    ...result,
    runtime,
    frontmatterPatches,
    renameValues,
    saveCount: () => saveCount,
    renameCount: () => renameCount,
  };
}

function openPopover() {
  fireEvent.click(
    screen.getByRole("button", {
      name: en.documents.viewer.accessibility.documentProperties,
    }),
  );
  return screen.getByRole("dialog", {
    name: en.documents.viewer.accessibility.documentProperties,
  });
}

function displayedDocumentType(): Element | null {
  const label = screen.getByText(en.documents.viewer.properties.labels.documentType);
  return label.parentElement?.lastElementChild ?? null;
}

describe("PropertiesPopover", () => {
  it("localizes the open form in place while preserving document data", async () => {
    const { runtime } = renderPopover();
    expect(
      screen.queryByRole("dialog", {
        name: en.documents.viewer.accessibility.documentProperties,
      }),
    ).toBeNull();

    const dialog = openPopover();
    const nameInput = screen.getByLabelText(
      en.documents.viewer.properties.labels.documentName,
    );
    const featureInput = screen.getByRole("combobox", {
      name: en.documents.viewer.accessibility.featureTag,
    });
    const dateInput = screen.getByLabelText(en.documents.viewer.properties.labels.date);
    const saveButton = screen.getByRole("button", {
      name: en.documents.viewer.properties.actions.save,
    });

    const documentType = displayedDocumentType();
    expect(documentType?.textContent).toBe(
      en.documents.createDialog.documentTypes.plan,
    );
    expect(screen.queryByText("#plan")).toBeNull();
    expect(featureInput.getAttribute("placeholder")).toBe(
      en.documents.viewer.properties.placeholders.featureTag,
    );
    expect(dateInput.getAttribute("placeholder")).toBe(
      en.documents.viewer.properties.placeholders.date,
    );

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("dialog", {
        name: ltrTestResources.documents.viewer.accessibility.documentProperties,
      }),
    ).toBe(dialog);
    expect(
      screen.getByLabelText(
        ltrTestResources.documents.viewer.properties.labels.documentName,
      ),
    ).toBe(nameInput);
    expect(
      screen.getByRole("combobox", {
        name: ltrTestResources.documents.viewer.accessibility.featureTag,
      }),
    ).toBe(featureInput);
    expect(
      screen.getByLabelText(ltrTestResources.documents.viewer.properties.labels.date),
    ).toBe(dateInput);
    expect(
      screen.getByRole("button", {
        name: ltrTestResources.documents.viewer.properties.actions.save,
      }),
    ).toBe(saveButton);
    expect(documentType?.textContent).toBe(
      ltrTestResources.documents.createDialog.documentTypes.plan,
    );

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("dialog", {
        name: rtlTestResources.documents.viewer.accessibility.documentProperties,
      }),
    ).toBe(dialog);
    expect(
      screen.getByLabelText(
        rtlTestResources.documents.viewer.properties.labels.documentName,
      ),
    ).toBe(nameInput);
    expect(
      screen.getByRole("combobox", {
        name: rtlTestResources.documents.viewer.accessibility.featureTag,
      }),
    ).toBe(featureInput);
    expect(
      screen.getByLabelText(rtlTestResources.documents.viewer.properties.labels.date),
    ).toBe(dateInput);
    expect(
      screen.getByRole("button", {
        name: rtlTestResources.documents.viewer.properties.actions.save,
      }),
    ).toBe(saveButton);
    expect(documentType?.textContent).toBe(
      rtlTestResources.documents.createDialog.documentTypes.plan,
    );
    expect(nameInput.getAttribute("value")).toBe("2026-07-11-x-plan");
    expect(dateInput.getAttribute("value")).toBe("2026-07-11");
  });

  it.each([
    ["research", en.documents.createDialog.documentTypes.research],
    ["adr", en.documents.createDialog.documentTypes.adr],
    ["plan", en.documents.createDialog.documentTypes.plan],
    ["exec", en.documents.createDialog.documentTypes.exec],
    ["audit", en.documents.createDialog.documentTypes.audit],
    ["reference", en.documents.createDialog.documentTypes.reference],
  ] as const)("shows the singular detail label for %s documents", (tag, expected) => {
    renderPopover({ draft: { tags: `#${tag}, #feature` } });
    openPopover();
    expect(displayedDocumentType()?.textContent).toBe(expected);
  });

  it.each([
    ["index", "#index, #feature"],
    ["unknown", "#custom, #feature"],
    ["missing", "#feature"],
  ] as const)("shows Not set for %s document types", (rawValue, tags) => {
    renderPopover({ draft: { tags } });
    openPopover();
    const value = displayedDocumentType()?.textContent;
    expect(value).toBe(en.documents.viewer.properties.states.notSet);
    expect(value).not.toBe(en.documents.createDialog.documentTypes.document);
    expect(value).not.toBe(rawValue);
  });

  it("preserves the document type while editing and saving properties", () => {
    const result = renderPopover();
    openPopover();

    const featureInput = screen.getByRole("combobox", {
      name: en.documents.viewer.accessibility.featureTag,
    });
    fireEvent.focus(featureInput);
    fireEvent.change(featureInput, { target: { value: "beta" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: "beta" }));
    expect(result.frontmatterPatches).toEqual([{ tags: "#plan, #beta" }]);

    const nameInput = screen.getByLabelText(
      en.documents.viewer.properties.labels.documentName,
    );
    fireEvent.change(nameInput, { target: { value: "renamed-plan" } });
    fireEvent.click(
      screen.getByRole("button", {
        name: en.documents.viewer.properties.actions.rename,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: en.documents.viewer.properties.actions.save,
      }),
    );

    expect(result.renameValues).toEqual(["renamed-plan"]);
    expect(result.renameCount()).toBe(1);
    expect(result.saveCount()).toBe(1);
  });

  it("uses clear pending labels for unavailable actions", () => {
    renderPopover({ savingProperties: true, renaming: true });
    openPopover();

    expect(
      (
        screen.getByRole("button", {
          name: en.documents.viewer.properties.states.renaming,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: en.documents.viewer.properties.states.saving,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("dismisses on Escape", () => {
    renderPopover();
    openPopover();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
