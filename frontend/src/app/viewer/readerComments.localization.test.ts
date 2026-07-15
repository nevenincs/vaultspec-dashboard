import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveActionPresentation } from "../../platform/actions/action";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { commentSectionAction } from "./readerComments";

describe("localized reader comment action", () => {
  it("resolves add and open labels through genuine English, French, and Arabic catalogs", () => {
    const runtimes = [
      createTestLocalizationRuntime(),
      createTestLocalizationRuntime(ltrTestLocale),
      createTestLocalizationRuntime(rtlTestLocale),
    ] as const;
    const actions = [
      commentSectionAction({ hasComments: false, onOpen: () => undefined }),
      commentSectionAction({ hasComments: true, onOpen: () => undefined }),
    ] as const;

    for (const action of actions) {
      const results = runtimes.map((runtime) =>
        resolveActionPresentation(action.label, (descriptor) =>
          resolveMessageResult(runtime, descriptor),
        ),
      );
      expect(results.every(({ usedFallback }) => usedFallback === false)).toBe(true);
      expect(new Set(results.map(({ message }) => message)).size).toBe(3);
      for (const { message } of results) {
        expect(message).not.toMatch(
          /viewer:comment-section|private-section-id|\b(?:count|identifier|payload|registry)\b|—/iu,
        );
      }
    }
  });

  it("selects only the catalog key from comment availability", () => {
    expect(
      commentSectionAction({ hasComments: false, onOpen: () => undefined }).label,
    ).toEqual({ key: "documents:actions.addComment" });
    expect(
      commentSectionAction({ hasComments: true, onOpen: () => undefined }).label,
    ).toEqual({ key: "documents:actions.openComments" });
  });
});
