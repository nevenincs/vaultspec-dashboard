import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import {
  FOLDER_BROWSER_MESSAGES,
  folderBrowserBadgeMessage,
  folderBrowserRowAriaMessage,
  folderBrowserTruncatedMessage,
  type FolderBrowserBadge,
  type FolderBrowserRowView,
} from "./FolderBrowser";
import { PLACES_RAIL_MESSAGES } from "./PickerPlacesRail";

const BADGES: readonly FolderBrowserBadge[] = [
  "already-added",
  "project",
  "git-repository",
  "hidden",
];

function row(badge: FolderBrowserBadge | null): FolderBrowserRowView {
  return {
    key: `C:/Authored folder`,
    label: "Authored folder",
    path: "C:/Authored folder",
    isHidden: badge === "hidden",
    isRegistered: badge === "already-added",
    badge,
  };
}

describe("FolderBrowser localization", () => {
  it("resolves genuine English, French, and Arabic messages without fallback", () => {
    const runtimes = [
      createTestLocalizationRuntime(),
      createTestLocalizationRuntime(ltrTestLocale),
      createTestLocalizationRuntime(rtlTestLocale),
    ] as const;
    const messages = [
      ...Object.values(FOLDER_BROWSER_MESSAGES),
      ...Object.values(PLACES_RAIL_MESSAGES),
      ...BADGES.map((badge) => folderBrowserRowAriaMessage(row(badge))),
      ...BADGES.map((badge) => folderBrowserBadgeMessage(badge)),
      folderBrowserTruncatedMessage(),
    ].filter((message) => message !== null);

    for (const descriptor of messages) {
      const results = runtimes.map((runtime) =>
        resolveMessageResult(runtime, descriptor),
      );
      expect(results.every((result) => result.usedFallback === false)).toBe(true);
      expect(results.every((result) => result.message.length > 0)).toBe(true);
      expect(results.map((result) => result.message).join(" ")).not.toMatch(
        /projects:folderBrowser|projects:placesRail|git-repository|already-added|—/u,
      );
    }
  });

  it("interpolates only the intended filesystem name and locale-formatted limit", () => {
    const runtimes = [
      createTestLocalizationRuntime(),
      createTestLocalizationRuntime(ltrTestLocale),
      createTestLocalizationRuntime(rtlTestLocale),
    ] as const;
    const gitRow = row("git-repository");

    for (const runtime of runtimes) {
      const rowLabel = resolveMessageResult(
        runtime,
        folderBrowserRowAriaMessage(gitRow)!,
      ).message;
      const truncated = resolveMessageResult(
        runtime,
        folderBrowserTruncatedMessage(),
      ).message;
      expect(rowLabel).toContain("Authored folder");
      expect(rowLabel).not.toContain(gitRow.path);
      expect(truncated).toMatch(/256|٢٥٦/u);
      expect(`${rowLabel} ${truncated}`).not.toMatch(/\{\{|\}\}|—/u);
    }
  });

  it("carries no aria qualifier for a plain folder (its name is data, not copy)", () => {
    expect(folderBrowserRowAriaMessage(row(null))).toBeNull();
    expect(folderBrowserBadgeMessage(null)).toBeNull();
  });

  it("uses safe catalog copy for failure and never accepts diagnostic input", () => {
    const runtime = createTestLocalizationRuntime();
    const error = resolveMessageResult(
      runtime,
      FOLDER_BROWSER_MESSAGES.readFailed,
    ).message;

    expect(error).toBe("This folder could not be opened.");
    expect(error).not.toMatch(/private\/path|receipt|tier|GET \/fs\/list|—/u);
  });
});
