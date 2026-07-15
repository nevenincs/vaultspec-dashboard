// @vitest-environment happy-dom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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
import { EditorToolbar } from "./EditorToolbar";
import type { MarkdownFormatCommand } from "./markdownFormatting";

afterEach(cleanup);

describe("EditorToolbar", () => {
  it("localizes controls in place without changing their commands", async () => {
    const commands: MarkdownFormatCommand[] = [];
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <EditorToolbar onCommand={(command) => commands.push(command)} />
      </I18nextProvider>,
    );

    const toolbar = screen.getByRole("toolbar", {
      name: en.documents.editor.accessibility.formattingToolbar,
    });
    const buttons = within(toolbar).getAllByRole("button");

    for (const button of buttons) fireEvent.click(button);
    expect(commands).toEqual([
      "bold",
      "italic",
      "code",
      "heading",
      "bulletList",
      "orderedList",
      "quote",
      "link",
      "wikiLink",
    ]);

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("toolbar", {
        name: ltrTestResources.documents.editor.accessibility.formattingToolbar,
      }),
    ).toBe(toolbar);
    expect(
      Object.values(ltrTestResources.documents.editor.actions).map((name) =>
        screen.getByRole("button", { name }),
      ),
    ).toEqual(buttons);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("toolbar", {
        name: rtlTestResources.documents.editor.accessibility.formattingToolbar,
      }),
    ).toBe(toolbar);
    expect(
      Object.values(rtlTestResources.documents.editor.actions).map((name) =>
        screen.getByRole("button", { name }),
      ),
    ).toEqual(buttons);

    fireEvent.click(buttons[0]!);
    fireEvent.click(buttons[8]!);
    expect(commands.slice(-2)).toEqual(["bold", "wikiLink"]);
  });

  it("is a single toolbar landmark with exactly one tab stop", () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <EditorToolbar onCommand={() => undefined} />
      </I18nextProvider>,
    );
    const toolbar = screen.getByRole("toolbar", {
      name: en.documents.editor.accessibility.formattingToolbar,
    });
    const buttons = Array.from(toolbar.querySelectorAll("button"));
    const tabbable = buttons.filter((b) => b.tabIndex === 0);
    expect(buttons.length).toBeGreaterThan(0);
    expect(tabbable.length).toBe(1);
  });

  it("disables every control when disabled", () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <EditorToolbar onCommand={() => undefined} disabled />
      </I18nextProvider>,
    );
    const toolbar = screen.getByRole("toolbar", {
      name: en.documents.editor.accessibility.formattingToolbar,
    });
    for (const button of toolbar.querySelectorAll("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("does not expose localization keys when editor messages are unavailable", () => {
    const runtime = createTestLocalizationRuntime();
    runtime.removeResourceBundle("en", "documents");
    runtime.removeResourceBundle(ltrTestLocale, "documents");
    runtime.removeResourceBundle(rtlTestLocale, "documents");

    render(
      <I18nextProvider i18n={runtime}>
        <EditorToolbar onCommand={() => undefined} />
      </I18nextProvider>,
    );

    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(document.body.textContent).not.toContain("documents:editor");
  });
});
