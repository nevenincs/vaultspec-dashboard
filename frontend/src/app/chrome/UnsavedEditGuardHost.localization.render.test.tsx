// @vitest-environment happy-dom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { en } from "../../locales/en";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import {
  closeDocumentEditor,
  openDocumentEditor,
  updateEditorDraft,
} from "../../stores/view/editor";
import {
  guardUnsavedDiscard,
  useUnsavedEditGuardStore,
} from "../../stores/view/unsavedEditGuard";
import { UnsavedEditGuardHost } from "./UnsavedEditGuardHost";

function openDirtyEditor(): void {
  openDocumentEditor("doc:guard", "Original", "hash-1");
  updateEditorDraft("Changed");
}

beforeEach(() => {
  useUnsavedEditGuardStore.setState({ pending: null });
  closeDocumentEditor();
});

afterEach(() => {
  cleanup();
  useUnsavedEditGuardStore.setState({ pending: null });
  closeDocumentEditor();
});

describe("UnsavedEditGuardHost localization", () => {
  it("localizes one confirmation in place and preserves the staged action", async () => {
    let proceeded = 0;
    const runtime = createTestLocalizationRuntime();
    openDirtyEditor();
    render(
      <I18nextProvider i18n={runtime}>
        <UnsavedEditGuardHost />
      </I18nextProvider>,
    );
    act(() =>
      guardUnsavedDiscard(() => {
        proceeded += 1;
      }),
    );

    const dialog = screen.getByRole("dialog", {
      name: en.documents.confirmations.discardUnsavedChanges.title,
    });
    const confirm = screen.getByRole("button", {
      name: en.common.destructiveActions.discardChanges,
    });
    const cancel = screen.getByRole("button", { name: en.common.actions.cancel });

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("dialog", {
        name: ltrTestResources.documents.confirmations.discardUnsavedChanges.title,
      }),
    ).toBe(dialog);
    expect(
      screen.getByRole("button", {
        name: ltrTestResources.common.destructiveActions.discardChanges,
      }),
    ).toBe(confirm);
    expect(
      screen.getByRole("button", { name: ltrTestResources.common.actions.cancel }),
    ).toBe(cancel);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("dialog", {
        name: rtlTestResources.documents.confirmations.discardUnsavedChanges.title,
      }),
    ).toBe(dialog);
    expect(
      screen.getByRole("button", {
        name: rtlTestResources.common.destructiveActions.discardChanges,
      }),
    ).toBe(confirm);
    expect(
      screen.getByRole("button", { name: rtlTestResources.common.actions.cancel }),
    ).toBe(cancel);

    fireEvent.click(confirm);
    expect(proceeded).toBe(1);
    expect(useUnsavedEditGuardStore.getState().pending).toBeNull();
  });

  it("cancels the pending action when confirmation copy is unavailable", async () => {
    let proceeded = 0;
    const runtime = createTestLocalizationRuntime();
    runtime.removeResourceBundle("en", "documents");
    openDirtyEditor();
    render(
      <I18nextProvider i18n={runtime}>
        <UnsavedEditGuardHost />
      </I18nextProvider>,
    );
    act(() =>
      guardUnsavedDiscard(() => {
        proceeded += 1;
      }),
    );

    await waitFor(() => expect(useUnsavedEditGuardStore.getState().pending).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(proceeded).toBe(0);
    expect(document.body.textContent).not.toContain("documents:confirmations");
  });
});
