import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { sourceLocale } from "../../locales/en";
import type { SettingDef } from "../server/engine";
import {
  SETTINGS_GROUP_MESSAGES,
  SETTING_ENUM_MESSAGES,
  SETTING_MESSAGES,
  settingEnumMessageDescriptors,
  settingPresentationDescriptors,
} from "./settingsPresentation";

const theme: SettingDef = {
  key: "theme",
  value_type: { type: "enum", members: ["system", "light", "dark"] },
  default: "system",
  scope_eligible: false,
  control: "segmented",
  display: {
    id: "appearance.theme",
    group: "appearance",
    enum_members: [
      { value: "system", id: "theme.system" },
      { value: "light", id: "theme.light" },
      { value: "dark", id: "theme.dark" },
    ],
  },
  order: 1,
};

describe("settings presentation vocabulary", () => {
  it("resolves every descriptor in English, French, and Arabic without fallback", () => {
    const descriptors = [
      ...Object.values(SETTINGS_GROUP_MESSAGES),
      ...Object.values(SETTING_MESSAGES).flatMap((entry) => [
        entry.label,
        entry.description,
        ...("placeholder" in entry ? [entry.placeholder] : []),
      ]),
      ...Object.values(SETTING_ENUM_MESSAGES),
    ];

    for (const locale of [sourceLocale, ltrTestLocale, rtlTestLocale] as const) {
      const runtime = createTestLocalizationRuntime(locale);
      for (const message of descriptors) {
        expect(
          resolveMessageResult(runtime, message).usedFallback,
          `${locale}:${message.key}`,
        ).toBe(false);
      }
    }
  });

  it("uses genuine localized setting metadata", () => {
    const french = createTestLocalizationRuntime(ltrTestLocale);
    const arabic = createTestLocalizationRuntime(rtlTestLocale);
    expect(
      resolveMessageResult(french, SETTING_MESSAGES["graph.confidenceFloor"].label)
        .message,
    ).toBe("Certitude minimale des connexions");
    expect(
      resolveMessageResult(arabic, SETTING_MESSAGES["graph.labelFilter"].label).message,
    ).toBe("تصفية الاسم");
  });

  it("fails closed when enum presentation does not exactly match raw values", () => {
    expect(settingPresentationDescriptors(theme)).toBe(
      SETTING_MESSAGES["appearance.theme"],
    );
    expect(settingEnumMessageDescriptors(theme)?.size).toBe(3);
    expect(
      settingEnumMessageDescriptors({
        ...theme,
        display: {
          ...theme.display,
          enum_members: [
            { value: "system", id: "theme.system" },
            { value: "light", id: "theme.dark" },
            { value: "dark", id: "theme.light" },
          ],
        },
      }),
    ).toBeNull();
  });
});
