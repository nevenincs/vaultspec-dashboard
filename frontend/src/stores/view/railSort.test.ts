// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { sortTreeActions } from "./leftRailKeybindings";
import {
  DEFAULT_RAIL_SORT,
  RAIL_SORT_KEYS,
  RAIL_SORT_PRESENTATION,
  naturalRailSortDirection,
  normalizeRailSortKey,
  railSortPresentation,
  resetRailSort,
  setRailSortKey,
  useRailSortStore,
} from "./railSort";

beforeEach(() => {
  resetRailSort();
});

describe("rail sort presentation", () => {
  it("preserves the frozen raw order, default, and presentation identities", () => {
    expect(RAIL_SORT_KEYS).toEqual([
      "recency",
      "docs",
      "name",
      "created",
      "modified",
      "size",
      "weight",
    ]);
    expect(DEFAULT_RAIL_SORT).toEqual({ key: "recency", direction: "desc" });
    expect(Object.isFrozen(DEFAULT_RAIL_SORT)).toBe(true);
    expect(Object.isFrozen(RAIL_SORT_KEYS)).toBe(true);
    expect(Object.isFrozen(RAIL_SORT_PRESENTATION)).toBe(true);
    for (const id of RAIL_SORT_KEYS) {
      const presentation = RAIL_SORT_PRESENTATION[id];
      expect(Object.isFrozen(presentation)).toBe(true);
      expect(Object.isFrozen(presentation.label)).toBe(true);
      expect(Object.isFrozen(presentation.actionLabel)).toBe(true);
      expect(Object.isFrozen(presentation.triggerLabel)).toBe(true);
      expect(railSortPresentation(id)).toBe(presentation);
    }
  });

  it("rejects non-exact presentation identities without changing state normalization", () => {
    expect(railSortPresentation(" recency ")).toBeNull();
    expect(railSortPresentation("latest")).toBeNull();
    expect(railSortPresentation(null)).toBeNull();
    expect(normalizeRailSortKey(" recency ")).toBe("recency");
    expect(normalizeRailSortKey("latest")).toBeNull();
  });

  it("resolves every complete label in English, French, and Arabic", () => {
    const english = createTestLocalizationRuntime();
    const french = createTestLocalizationRuntime(ltrTestLocale);
    const arabic = createTestLocalizationRuntime(rtlTestLocale);

    for (const id of RAIL_SORT_KEYS) {
      const presentation = RAIL_SORT_PRESENTATION[id];
      for (const descriptor of [
        presentation.label,
        presentation.actionLabel,
        presentation.triggerLabel,
      ]) {
        const source = resolveMessageResult(english, descriptor);
        const alternate = resolveMessageResult(french, descriptor);
        const rtl = resolveMessageResult(arabic, descriptor);
        expect(source.usedFallback, descriptor.key).toBe(false);
        expect(alternate.usedFallback, descriptor.key).toBe(false);
        expect(rtl.usedFallback, descriptor.key).toBe(false);
        expect(alternate.message, descriptor.key).not.toBe(source.message);
        expect(rtl.message, descriptor.key).not.toBe(source.message);
      }
    }
  });
});

describe("rail sort state behavior", () => {
  it("preserves natural directions, re-selection flipping, and reset", () => {
    expect(
      Object.fromEntries(
        RAIL_SORT_KEYS.map((key) => [key, naturalRailSortDirection(key)]),
      ),
    ).toEqual({
      recency: "desc",
      docs: "desc",
      name: "asc",
      created: "desc",
      modified: "desc",
      size: "desc",
      weight: "desc",
    });

    setRailSortKey("name");
    expect(useRailSortStore.getState().value).toEqual({
      key: "name",
      direction: "asc",
    });
    setRailSortKey("name");
    expect(useRailSortStore.getState().value).toEqual({
      key: "name",
      direction: "desc",
    });
    setRailSortKey(" created ");
    expect(useRailSortStore.getState().value).toEqual({
      key: "created",
      direction: "desc",
    });
    setRailSortKey("unknown");
    expect(useRailSortStore.getState().value).toEqual({
      key: "created",
      direction: "desc",
    });
    resetRailSort();
    expect(useRailSortStore.getState().value).toBe(DEFAULT_RAIL_SORT);
  });

  it("preserves the persisted key/value shape and storage identity", () => {
    const options = useRailSortStore.persist.getOptions();
    expect(options.name).toBe("vaultspec:left-rail-sort");
    expect(options.partialize?.(useRailSortStore.getState())).toEqual({
      value: DEFAULT_RAIL_SORT,
    });
    expect(
      options.merge?.(
        { value: { key: "modified", direction: "asc" } },
        useRailSortStore.getState(),
      ).value,
    ).toEqual({ key: "modified", direction: "asc" });
  });

  it("keeps sort action ids, descriptor labels, and raw callbacks aligned", () => {
    const actions = sortTreeActions();
    expect(actions.map((action) => action.id)).toEqual(
      RAIL_SORT_KEYS.map((key) => `left-rail:sort-${key}`),
    );
    expect(actions.map((action) => action.label)).toEqual(
      RAIL_SORT_KEYS.map((key) => RAIL_SORT_PRESENTATION[key].actionLabel),
    );

    actions[2]!.run?.();
    expect(useRailSortStore.getState().value).toEqual({
      key: "name",
      direction: "asc",
    });
    actions[2]!.run?.();
    expect(useRailSortStore.getState().value).toEqual({
      key: "name",
      direction: "desc",
    });
  });
});
