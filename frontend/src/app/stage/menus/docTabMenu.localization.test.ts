// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";

import type {
  ActionDescriptor,
  ActionPresentation,
} from "../../../platform/actions/action";
import { resolveActionPresentation } from "../../../platform/actions/action";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../../localization/testing";
import { resolveMessageResult } from "../../../platform/localization/fallback";
import { useViewStore } from "../../../stores/view/viewStore";
import { docTabMenu } from "./docTabMenu";

afterEach(() => {
  useViewStore.setState({ openDocs: [], activeDocId: null });
});

function action(actions: readonly ActionDescriptor[], id: string): ActionDescriptor {
  const match = actions.find((candidate) => candidate.id === id);
  if (match === undefined) throw new Error(`Missing action: ${id}`);
  return match;
}

function migratedPresentations(): readonly ActionPresentation[] {
  useViewStore.setState({
    openDocs: [{ nodeId: "doc:private-id", surface: "markdown", provisional: false }],
  });
  const actions = docTabMenu({
    kind: "doc-tab",
    id: "doc:private-id",
    nodeId: "doc:private-id",
    scope: "internal-scope",
  });
  return [
    ...actions.map(({ label }) => label),
    action(actions, "doc-tab:keep-open").disabledReason!,
    action(actions, "doc-tab:close-others").disabledReason!,
  ];
}

describe("localized document-tab menu", () => {
  it("resolves every migrated presentation through genuine English, French, and Arabic catalogs", () => {
    const runtimes = [
      createTestLocalizationRuntime(),
      createTestLocalizationRuntime(ltrTestLocale),
      createTestLocalizationRuntime(rtlTestLocale),
    ] as const;

    for (const presentation of migratedPresentations()) {
      const results = runtimes.map((runtime) =>
        resolveActionPresentation(presentation, (descriptor) =>
          resolveMessageResult(runtime, descriptor),
        ),
      );
      expect(results.every(({ usedFallback }) => usedFallback === false)).toBe(true);
      expect(new Set(results.map(({ message }) => message)).size).toBe(3);
      for (const { message } of results) {
        expect(message).not.toMatch(
          /doc:private-id|internal-scope|\b(?:id|scope)\b|—/iu,
        );
      }
    }
  });
});
