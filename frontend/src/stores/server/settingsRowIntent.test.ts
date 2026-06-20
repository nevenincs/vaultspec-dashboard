import { describe, expect, it } from "vitest";

import { EngineError } from "./engine";
import {
  DEFAULT_SETTINGS_WRITE_ERROR,
  SETTINGS_WRITE_ERROR_MESSAGE_CAP,
  normalizeSettingsWriteErrorText,
  normalizeSettingsRowWrite,
  settingsWriteErrorMessage,
} from "./settingsRowIntent";

describe("settings row write intent", () => {
  it("normalizes row write payloads before settings mutation dispatch", () => {
    expect(
      normalizeSettingsRowWrite({
        key: " theme ",
        value: "dark",
        target: "scope",
        activeScope: " workspace-a ",
      }),
    ).toEqual({
      key: "theme",
      value: "dark",
      scope: "workspace-a",
    });
  });

  it("preserves literal setting values while degrading invalid targets to global", () => {
    expect(
      normalizeSettingsRowWrite({
        key: "label_filter",
        value: "  semantic only  ",
        target: "workspace" as "global",
        activeScope: "workspace-a",
      }),
    ).toEqual({
      key: "label_filter",
      value: "  semantic only  ",
      scope: undefined,
    });
  });

  it("omits scoped writes when no active scope can receive the row update", () => {
    expect(
      normalizeSettingsRowWrite({
        key: "theme",
        value: "light",
        target: "scope",
        activeScope: null,
      }),
    ).toEqual({
      key: "theme",
      value: "light",
      scope: undefined,
    });
    expect(
      normalizeSettingsRowWrite({
        key: "theme",
        value: "light",
        target: "scope",
        activeScope: "   ",
      }),
    ).toEqual({
      key: "theme",
      value: "light",
      scope: undefined,
    });
    expect(
      normalizeSettingsRowWrite({
        key: "theme",
        value: "light",
        target: "scope",
        activeScope: { scope: "workspace-a" },
      }),
    ).toEqual({
      key: "theme",
      value: "light",
      scope: undefined,
    });
  });

  it("drops malformed row write payloads before the mutation seam", () => {
    expect(normalizeSettingsRowWrite("theme")).toBeNull();
    expect(normalizeSettingsRowWrite(["theme", "dark"])).toBeNull();
    expect(
      normalizeSettingsRowWrite({
        key: "   ",
        value: "dark",
        target: "global",
        activeScope: null,
      }),
    ).toBeNull();
    expect(
      normalizeSettingsRowWrite({
        key: "theme",
        value: 42 as unknown as string,
        target: "global",
        activeScope: null,
      }),
    ).toBeNull();
  });

  it("prefers the engine's served error message when present", () => {
    const err = new EngineError("/settings", 400, {
      body: { error: "invalid theme" },
    });

    expect(settingsWriteErrorMessage(err)).toBe("invalid theme");
  });

  it("falls back to the thrown error message", () => {
    expect(settingsWriteErrorMessage(new Error("network down"))).toBe("network down");
  });

  it("normalizes malformed thrown values to a settings write fallback", () => {
    expect(settingsWriteErrorMessage("failed")).toBe(DEFAULT_SETTINGS_WRITE_ERROR);
    expect(settingsWriteErrorMessage({ message: "  schema refused  " })).toBe(
      "schema refused",
    );
    expect(settingsWriteErrorMessage({ errorMessage: " invalid value " })).toBe(
      "invalid value",
    );
  });

  it("bounds settings write error text before row chrome stores it", () => {
    expect(normalizeSettingsWriteErrorText(null)).toBeNull();
    expect(normalizeSettingsWriteErrorText("   ")).toBeNull();

    const long = "x".repeat(SETTINGS_WRITE_ERROR_MESSAGE_CAP + 10);
    const normalized = normalizeSettingsWriteErrorText(` ${long} `);
    expect(normalized).toHaveLength(SETTINGS_WRITE_ERROR_MESSAGE_CAP);
    expect(normalized?.endsWith("…")).toBe(true);

    const err = new EngineError("/settings", 400, {
      body: { error: ` ${long} ` },
    });
    expect(settingsWriteErrorMessage(err)).toBe(normalized);
  });
});
