import { describe, expect, it } from "vitest";

import {
  ltrTestLocale,
  createTestLocalizationRuntime,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { createActionConfirmationDescriptor } from "../../platform/localization/message";
import type { PaletteCommand } from "../../stores/view/commandPaletteCommands";
import {
  filterResolvedPaletteCommands,
  repairCommandPaletteCursorById,
  resolvePaletteCommands,
} from "./commandPalettePresentation";

function command(id: string, key: "common:actions.cancel" | "common:actions.retry") {
  return {
    id,
    label: { key },
    family: "app",
    run: () => undefined,
  } satisfies PaletteCommand;
}

describe("command palette localized presentation", () => {
  it("filters resolved labels from a real alternate-locale runtime", () => {
    const runtime = createTestLocalizationRuntime(ltrTestLocale);
    const resolved = resolvePaletteCommands(
      [command("action:cancel", "common:actions.cancel")],
      (descriptor) => resolveMessageResult(runtime, descriptor),
    );

    expect(resolved).toMatchObject([
      {
        id: "action:cancel",
        label: "Annuler",
        presentationSafe: true,
        fallbackDisabled: false,
      },
    ]);
    expect(
      filterResolvedPaletteCommands(resolved, "ann", "fr").map(({ id }) => id),
    ).toEqual(["action:cancel"]);
  });

  it("retains a fallback row by stable id and disables execution", () => {
    const runtime = createTestLocalizationRuntime(ltrTestLocale);
    runtime.removeResourceBundle(ltrTestLocale, "common");
    runtime.removeResourceBundle("en", "common");

    const [resolved] = resolvePaletteCommands(
      [{ ...command("action:retry", "common:actions.retry"), confirm: true }],
      (descriptor) => resolveMessageResult(runtime, descriptor),
    );

    expect(resolved).toMatchObject({
      id: "action:retry",
      disabled: true,
      presentationSafe: false,
      fallbackDisabled: true,
      legacyConfirmPrompt: expect.any(String),
      disabledReason: expect.any(String),
    });
  });

  it("fails closed when any typed confirmation message cannot be resolved", () => {
    const runtime = createTestLocalizationRuntime(ltrTestLocale);
    runtime.removeResourceBundle(ltrTestLocale, "features");
    runtime.removeResourceBundle("en", "features");
    const confirmation = createActionConfirmationDescriptor({
      kind: "guarded",
      title: {
        key: "features:confirmations.repair.title",
        values: { feature: "feature" },
      },
      body: { key: "features:confirmations.repair.body" },
      confirmLabel: { key: "features:guardedActions.repair" },
      cancelLabel: { key: "common:actions.cancel" },
    });
    expect(confirmation).not.toBeNull();

    const [resolved] = resolvePaletteCommands(
      [
        {
          ...command("action:retry", "common:actions.retry"),
          confirmation: confirmation!,
        },
      ],
      (descriptor) => resolveMessageResult(runtime, descriptor),
    );

    expect(resolved).toMatchObject({
      id: "action:retry",
      disabled: true,
      presentationSafe: false,
      fallbackDisabled: true,
      disabledReason: expect.any(String),
    });
    expect(resolved?.disabledReason).not.toContain("features:");
  });

  it("repairs a moved cursor by command id while honoring query-driven resets", () => {
    const previous = {
      query: "",
      cursor: 1,
      orderedIds: ["first", "active"],
      activeCommandId: "active",
    };
    const reordered = [{ id: "active" }, { id: "first" }] as const;

    expect(repairCommandPaletteCursorById(previous, "", 1, reordered)).toBe(0);
    expect(repairCommandPaletteCursorById(previous, "new", 0, reordered)).toBe(0);
  });

  it("case-folds the query and labels with the active locale", () => {
    const command = {
      id: "city:istanbul",
      label: "İstanbul",
      family: "app" as const,
      run: () => undefined,
      presentationSafe: true,
      fallbackDisabled: false,
      legacyConfirmPrompt: null,
    };

    expect(filterResolvedPaletteCommands([command], "istanbul", "tr")).toEqual([
      command,
    ]);
    expect(filterResolvedPaletteCommands([command], "ıstanbul", "tr")).toEqual([]);
  });
});
