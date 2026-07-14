import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
} from "../../localization/testing";
import {
  resolveActionPresentation,
  type ActionPresentation,
} from "../../platform/actions/action";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { finishEditingAction } from "./editorKeybindings";
import { requestCloseDocumentEditor } from "./unsavedEditGuard";
import { normalizeCommandDescriptor } from "./commandRegistry";

describe("localized command descriptor normalization", () => {
  it("preserves production action presentation and run identity without translating", () => {
    const action = finishEditingAction(requestCloseDocumentEditor, true);
    const command = normalizeCommandDescriptor({ ...action, family: "edit" });

    expect(command).not.toBeNull();
    expect(command).toMatchObject({
      id: action.id,
      family: "edit",
      label: { key: "documents:actions.finishEditing" },
      disabled: true,
      disabledReason: { key: "documents:disabledReasons.openForEditing" },
    });
    expect(command?.run).toBe(requestCloseDocumentEditor);
    expect(command?.label).not.toEqual("Finish editing");
    expect(command?.disabledReason).not.toEqual("Open a document for editing.");

    const source = createTestLocalizationRuntime();
    const alternate = createTestLocalizationRuntime(ltrTestLocale);
    const resolve = (runtime: typeof source, presentation: ActionPresentation) =>
      resolveActionPresentation(presentation, (descriptor) =>
        resolveMessageResult(runtime, descriptor),
      );

    expect(resolve(source, command!.label)).toEqual({
      message: "Finish editing",
      usedFallback: false,
    });
    expect(resolve(alternate, command!.label)).toEqual({
      message: "Terminer la modification",
      usedFallback: false,
    });
    expect(resolve(source, command!.disabledReason!)).toEqual({
      message: "Open a document for editing.",
      usedFallback: false,
    });
    expect(resolve(alternate, command!.disabledReason!)).toEqual({
      message: "Ouvrez un document à modifier.",
      usedFallback: false,
    });
  });
});
