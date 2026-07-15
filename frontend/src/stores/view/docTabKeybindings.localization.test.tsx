// @vitest-environment happy-dom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { resetKeybindings } from "../../platform/keymap/registry";
import {
  TAB_CLOSE_ACTION_ID,
  TAB_NEXT_ACTION_ID,
  TAB_PREV_ACTION_ID,
  deriveDocTabKeybindings,
  useDocTabKeybindings,
} from "./docTabKeybindings";
import { resetKeyActions, resolveKeyAction } from "./keymapDispatcher";
import { useViewStore } from "./viewStore";

function DocTabKeybindingHarness() {
  useDocTabKeybindings();
  return null;
}

function resetTabs(): void {
  useViewStore.setState({ openDocs: [], activeDocId: null });
}

afterEach(() => {
  cleanup();
  resetKeyActions();
  resetKeybindings();
  resetTabs();
});

describe("document-tab keybinding localization", () => {
  it("keeps the stable bindings and resolves their catalog-owned presentation", () => {
    const bindings = deriveDocTabKeybindings();
    expect(bindings).toEqual([
      {
        id: TAB_NEXT_ACTION_ID,
        defaultChord: "Mod+Alt+ArrowRight",
        label: { key: "documents:actions.nextTab" },
        group: { key: "documents:shortcutGroups.documents" },
        context: "global",
      },
      {
        id: TAB_PREV_ACTION_ID,
        defaultChord: "Mod+Alt+ArrowLeft",
        label: { key: "documents:actions.previousTab" },
        group: { key: "documents:shortcutGroups.documents" },
        context: "global",
      },
      {
        id: TAB_CLOSE_ACTION_ID,
        defaultChord: "Mod+Alt+Backspace",
        label: { key: "documents:actions.closeActiveTab" },
        group: { key: "documents:shortcutGroups.documents" },
        context: "global",
      },
    ]);

    const runtimes = [
      createTestLocalizationRuntime(),
      createTestLocalizationRuntime(ltrTestLocale),
      createTestLocalizationRuntime(rtlTestLocale),
    ];
    const expected = [
      {
        labels: [
          "Move to next document tab",
          "Move to previous document tab",
          "Close the active document tab",
        ],
        group: "Documents",
        disabledReason: "Open a document first.",
      },
      {
        labels: [
          "Aller à l’onglet de document suivant",
          "Aller à l’onglet de document précédent",
          "Fermer l’onglet du document actif",
        ],
        group: "Documents",
        disabledReason: "Ouvrez d’abord un document.",
      },
      {
        labels: [
          "الانتقال إلى علامة تبويب المستند التالية",
          "الانتقال إلى علامة تبويب المستند السابقة",
          "إغلاق علامة تبويب المستند النشط",
        ],
        group: "المستندات",
        disabledReason: "افتح مستندًا أولاً.",
      },
    ];

    for (const [runtimeIndex, runtime] of runtimes.entries()) {
      const expectedRuntime = expected[runtimeIndex]!;
      expect(
        bindings.map((binding) => resolveMessageResult(runtime, binding.label).message),
      ).toEqual(expectedRuntime.labels);
      expect(resolveMessageResult(runtime, bindings[0]!.group)).toEqual({
        message: expectedRuntime.group,
        usedFallback: false,
      });
      expect(
        resolveMessageResult(runtime, {
          key: "documents:disabledReasons.openDocument",
        }),
      ).toEqual({
        message: expectedRuntime.disabledReason,
        usedFallback: false,
      });
    }
  });

  it("keeps live eligibility and tab execution behind typed action descriptors", () => {
    resetTabs();
    render(<DocTabKeybindingHarness />);

    expect(resolveKeyAction(TAB_CLOSE_ACTION_ID)).toMatchObject({
      id: TAB_CLOSE_ACTION_ID,
      label: { key: "documents:actions.closeActiveTab" },
      disabled: true,
      disabledReason: { key: "documents:disabledReasons.openDocument" },
    });

    act(() => {
      useViewStore.setState({
        openDocs: [
          {
            nodeId: "doc:first",
            surface: "markdown",
            provisional: false,
            scope: null,
          },
          {
            nodeId: "doc:second",
            surface: "markdown",
            provisional: false,
            scope: null,
          },
        ],
        activeDocId: "doc:first",
      });
    });

    expect(resolveKeyAction(TAB_CLOSE_ACTION_ID)?.disabled ?? false).toBe(false);
    for (const binding of deriveDocTabKeybindings()) {
      expect(resolveKeyAction(binding.id)?.label).toEqual(binding.label);
    }

    act(() => resolveKeyAction(TAB_NEXT_ACTION_ID)?.run?.());
    expect(useViewStore.getState().activeDocId).toBe("doc:second");

    act(() => resolveKeyAction(TAB_PREV_ACTION_ID)?.run?.());
    expect(useViewStore.getState().activeDocId).toBe("doc:first");

    act(() => resolveKeyAction(TAB_CLOSE_ACTION_ID)?.run?.());
    expect(useViewStore.getState().openDocs.map(({ nodeId }) => nodeId)).toEqual([
      "doc:second",
    ]);
  });
});
