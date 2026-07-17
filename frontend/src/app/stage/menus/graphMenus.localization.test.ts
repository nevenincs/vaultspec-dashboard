import { describe, expect, it } from "vitest";

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
import { canvasMenu } from "./canvasMenu";
import { graphNodeMenu } from "./graphNodeMenu";
import { metaEdgeMenu } from "./metaEdgeMenu";

function action(actions: readonly ActionDescriptor[], id: string): ActionDescriptor {
  const match = actions.find((candidate) => candidate.id === id);
  if (match === undefined) throw new Error(`Missing action: ${id}`);
  return match;
}

function migratedPresentations(): readonly ActionPresentation[] {
  const defaultNode = graphNodeMenu({
    kind: "node",
    id: "doc:transport-value",
    title: "Private authored title",
  });
  const activeNode = graphNodeMenu({
    kind: "node",
    id: "doc:transport-value",
    title: "Private authored title",
    isOpen: true,
    isPinned: true,
    inWorkingSet: true,
  });
  const untitledNode = graphNodeMenu({ kind: "node", id: "doc:transport-value" });
  const unavailableConnection = metaEdgeMenu({ kind: "meta-edge", id: "edge:raw" });

  return [
    ...canvasMenu()
      .slice(0, 4)
      .map(({ label }) => label),
    ...["node:focus", "node:open", "node:pin", "node:expand-ego"].map(
      (id) => action(defaultNode, id).label,
    ),
    ...["node:close-island", "node:unpin", "node:collapse-ego"].map(
      (id) => action(activeNode, id).label,
    ),
    action(untitledNode, "node:copy-title").disabledReason!,
    action(unavailableConnection, "meta-edge:goto-src").label,
    action(unavailableConnection, "meta-edge:goto-src").disabledReason!,
    action(unavailableConnection, "meta-edge:goto-dst").label,
    action(unavailableConnection, "meta-edge:goto-dst").disabledReason!,
    action(unavailableConnection, "meta-edge:copy-summary").disabledReason!,
  ];
}

describe("localized graph stage menus", () => {
  it("resolves migrated presentation through genuine English, French, and Arabic catalogs", () => {
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
      if (
        typeof presentation === "object" &&
        presentation !== null &&
        presentation.key.startsWith("graph:")
      ) {
        expect(
          new Set(results.map(({ message }) => message)).size,
          JSON.stringify({ presentation, results }),
        ).toBe(3);
      }
      for (const { message } of results) {
        expect(message).not.toMatch(
          /doc:transport-value|edge:raw|Private authored title/,
        );
      }
    }
  });

  it("preserves temporary copy actions while their safety decision is pending", () => {
    const node = graphNodeMenu({
      kind: "node",
      id: "doc:transport-value",
      title: "Title",
    });
    const connection = metaEdgeMenu({ kind: "meta-edge", id: "edge:raw" });

    expect(node.map(({ id }) => id).slice(0, 6)).toEqual([
      "node:focus",
      "node:open",
      "node:pin",
      "node:expand-ego",
      "node:copy-title",
      "node:copy-document-name",
    ]);
    // A document node copies its document name (an approved public reference),
    // never its raw internal id.
    expect(action(node, "node:copy-document-name").dispatch).toMatchObject({
      type: "action:copy",
      payload: { text: "transport-value", what: "stem" },
    });
    // A meta-connection has no public reference, so no copy-id action exists.
    expect(connection.map(({ id }) => id)).toEqual([
      "meta-edge:goto-src",
      "meta-edge:goto-dst",
      "meta-edge:copy-summary",
    ]);
  });
});
