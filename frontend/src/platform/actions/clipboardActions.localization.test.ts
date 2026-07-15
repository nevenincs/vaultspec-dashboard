import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import {
  copyLocalizedMessageAction,
  isCopyPayload,
  normalizeCopyPayload,
  resolveCopyPayloadText,
} from "./clipboardActions";

describe("localized clipboard payloads", () => {
  it("preserves raw caller text byte for byte", () => {
    const text = "\t  node:alpha  \r\n";

    expect(normalizeCopyPayload({ text })).toEqual({ text });
    expect(resolveCopyPayloadText({ text })).toBe(text);
  });

  it("resolves catalog content against the locale used by the terminal effect", () => {
    const payload = { message: { key: "documents:documentTypes.adr" } } as const;

    expect(resolveCopyPayloadText(payload, createTestLocalizationRuntime())).toBe(
      "Decisions",
    );
    expect(
      resolveCopyPayloadText(payload, createTestLocalizationRuntime(ltrTestLocale)),
    ).toBe("Décisions");
    expect(
      resolveCopyPayloadText(payload, createTestLocalizationRuntime(rtlTestLocale)),
    ).toBe("القرارات");
  });

  it("builds a typed localized dispatch without storing source-locale text", () => {
    const action = copyLocalizedMessageAction({
      id: "copy-category",
      label: { key: "common:actions.copyCategoryName" },
      message: { key: "documents:documentTypes.adr" },
    });

    expect(action.dispatch?.payload).toEqual({
      message: { key: "documents:documentTypes.adr" },
    });
    expect(action.dispatch?.payload).not.toHaveProperty("text");
  });

  it("rejects mixed, incomplete, and extended payload shapes", () => {
    for (const payload of [
      {},
      { text: "Decisions", message: { key: "documents:documentTypes.adr" } },
      { text: "Decisions", unexpected: true },
      { message: { key: "documents:documentTypes.adr" }, unexpected: true },
      { message: { key: "not-a-message-key" } },
    ]) {
      expect(isCopyPayload(payload)).toBe(false);
      expect(normalizeCopyPayload(payload)).toBeNull();
      expect(resolveCopyPayloadText(payload)).toBeNull();
    }
  });

  it("accepts only closed plain data records", () => {
    const symbolExtended = { text: "Decisions", [Symbol("unexpected")]: true };
    const hiddenExtended = { text: "Decisions" };
    Object.defineProperty(hiddenExtended, "unexpected", {
      value: true,
      enumerable: false,
    });
    const customPrototype = Object.create({ inherited: true }) as {
      text: string;
    };
    customPrototype.text = "Decisions";
    const accessorPayload = Object.defineProperty({}, "text", {
      get: () => "Decisions",
      enumerable: true,
    });

    for (const payload of [
      symbolExtended,
      hiddenExtended,
      customPrototype,
      accessorPayload,
    ]) {
      expect(isCopyPayload(payload)).toBe(false);
      expect(normalizeCopyPayload(payload)).toBeNull();
    }

    const nullPrototype = Object.assign(Object.create(null) as object, {
      text: "Decisions",
    });
    expect(isCopyPayload(nullPrototype)).toBe(true);
    expect(normalizeCopyPayload(nullPrototype)).toEqual({ text: "Decisions" });
  });
});
