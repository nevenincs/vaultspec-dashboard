import { beforeEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { WORKING_SET_CAP, useViewStore } from "./viewStore";
import {
  WORKING_SET_COLLAPSE_LAST_ACTION_ID,
  WORKING_SET_EXPAND_SELECTION_ACTION_ID,
  WORKING_SET_COLLAPSE_LAST_LABEL,
  WORKING_SET_EXPAND_SELECTION_LABEL,
  WORKING_SET_KEYBINDINGS,
  clearWorkingSet,
  collapseWorkingSet,
  expandWorkingSet,
  isInWorkingSet,
  lastWorkingSetEntry,
  normalizeWorkingSetIds,
  workingSetKeyAction,
  workingSetRows,
  workingSetView,
} from "./workingSet";

describe("working-set intent seam", () => {
  beforeEach(() => {
    useViewStore.getState().clearWorkingSet();
  });

  it("expands, deduplicates, collapses, and clears through one seam", () => {
    expandWorkingSet("doc:a");
    expandWorkingSet("doc:a");
    expandWorkingSet("doc:b");

    expect(useViewStore.getState().workingSet).toEqual(["doc:a", "doc:b"]);
    expect(isInWorkingSet(" doc:a ")).toBe(true);

    collapseWorkingSet(" doc:a ");
    expect(useViewStore.getState().workingSet).toEqual(["doc:b"]);

    clearWorkingSet();
    expect(useViewStore.getState().workingSet).toEqual([]);
  });

  it("normalizes public working-set write ids at the seam boundary", () => {
    expandWorkingSet(" doc:a ");
    expect(useViewStore.getState().workingSet).toEqual(["doc:a"]);

    expandWorkingSet({ id: "doc:b" });
    expect(useViewStore.getState().workingSet).toEqual(["doc:a"]);

    collapseWorkingSet({ id: "doc:a" });
    expect(useViewStore.getState().workingSet).toEqual(["doc:a"]);

    collapseWorkingSet(" doc:a ");
    expect(useViewStore.getState().workingSet).toEqual([]);

    expect(isInWorkingSet({ id: "doc:a" })).toBe(false);
  });

  it("keeps the store's bounded most-recent contract", () => {
    for (let i = 0; i < WORKING_SET_CAP + 3; i += 1) {
      expandWorkingSet(`doc:${i}`);
    }

    const workingSet = useViewStore.getState().workingSet;
    expect(workingSet).toHaveLength(WORKING_SET_CAP);
    expect(workingSet).not.toContain("doc:0");
    expect(workingSet.at(-1)).toBe(`doc:${WORKING_SET_CAP + 2}`);
  });

  it("normalizes malformed working-set reads at the seam boundary", () => {
    const raw = [
      "",
      " doc:old ",
      "doc:old",
      ...Array.from({ length: WORKING_SET_CAP + 2 }, (_, i) => `doc:${i}`),
      "   ",
    ];

    const normalized = normalizeWorkingSetIds(raw);

    expect(normalized).toHaveLength(WORKING_SET_CAP);
    expect(normalized).not.toContain("");
    expect(normalized).not.toContain("doc:old");
    expect(normalized[0]).toBe("doc:2");
    expect(normalized.at(-1)).toBe(`doc:${WORKING_SET_CAP + 1}`);

    useViewStore.setState({ workingSet: raw as string[] });
    expect(lastWorkingSetEntry()).toBe(`doc:${WORKING_SET_CAP + 1}`);
    expect(isInWorkingSet(" doc:2 ")).toBe(true);
    expect(isInWorkingSet("doc:old")).toBe(false);
  });

  it("projects compact working-set chip labels behind the seam", () => {
    expect(workingSetRows(["doc:alpha", "feature:beta", "code:src/app.ts"])).toEqual([
      {
        id: "doc:alpha",
        label: { kind: "user-data", value: "alpha" },
        collapseLabel: {
          key: "graph:actions.removeNamedItemFromWorkingSet",
          values: { item: "alpha" },
        },
        rootClassName:
          "flex items-center gap-fg-1 rounded-fg-pill border border-rule bg-paper-raised px-fg-2 py-fg-0-5 text-caption text-ink shadow-fg-raised",
        collapseButtonClassName:
          "flex items-center text-ink-faint hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      },
      {
        id: "feature:beta",
        label: { kind: "user-data", value: "beta" },
        collapseLabel: {
          key: "graph:actions.removeNamedItemFromWorkingSet",
          values: { item: "beta" },
        },
        rootClassName:
          "flex items-center gap-fg-1 rounded-fg-pill border border-rule bg-paper-raised px-fg-2 py-fg-0-5 text-caption text-ink shadow-fg-raised",
        collapseButtonClassName:
          "flex items-center text-ink-faint hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      },
      {
        id: "code:src/app.ts",
        label: { kind: "user-data", value: "src/app.ts" },
        collapseLabel: {
          key: "graph:actions.removeNamedItemFromWorkingSet",
          values: { item: "src/app.ts" },
        },
        rootClassName:
          "flex items-center gap-fg-1 rounded-fg-pill border border-rule bg-paper-raised px-fg-2 py-fg-0-5 text-caption text-ink shadow-fg-raised",
        collapseButtonClassName:
          "flex items-center text-ink-faint hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      },
    ]);
  });

  it("uses generic localized presentation for unsupported stable ids", () => {
    expect(workingSetRows(["commit:0123456789abcdef", "internal:private-id"])).toEqual([
      expect.objectContaining({
        id: "commit:0123456789abcdef",
        label: { kind: "message", descriptor: { key: "graph:labels.item" } },
        collapseLabel: { key: "graph:actions.removeItemFromWorkingSet" },
      }),
      expect.objectContaining({
        id: "internal:private-id",
        label: { kind: "message", descriptor: { key: "graph:labels.item" } },
        collapseLabel: { key: "graph:actions.removeItemFromWorkingSet" },
      }),
    ]);
    const [hidden] = workingSetRows(["commit:0123456789abcdef"], new Set<string>());
    expect(hidden.hiddenLabel).toEqual({
      key: "graph:accessibility.workingSetItemHidden",
    });
  });

  it("projects chip-trail presentation behind the seam", () => {
    expect(workingSetView(["doc:alpha", "feature:beta"])).toEqual({
      rows: [
        {
          id: "doc:alpha",
          label: { kind: "user-data", value: "alpha" },
          collapseLabel: {
            key: "graph:actions.removeNamedItemFromWorkingSet",
            values: { item: "alpha" },
          },
          rootClassName:
            "flex items-center gap-fg-1 rounded-fg-pill border border-rule bg-paper-raised px-fg-2 py-fg-0-5 text-caption text-ink shadow-fg-raised",
          collapseButtonClassName:
            "flex items-center text-ink-faint hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        },
        {
          id: "feature:beta",
          label: { kind: "user-data", value: "beta" },
          collapseLabel: {
            key: "graph:actions.removeNamedItemFromWorkingSet",
            values: { item: "beta" },
          },
          rootClassName:
            "flex items-center gap-fg-1 rounded-fg-pill border border-rule bg-paper-raised px-fg-2 py-fg-0-5 text-caption text-ink shadow-fg-raised",
          collapseButtonClassName:
            "flex items-center text-ink-faint hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        },
      ],
      visible: true,
      navClassName:
        "pointer-events-auto absolute top-9 left-2 z-10 flex flex-wrap items-center gap-1",
      navLabel: { key: "graph:accessibility.workingSet" },
      countClassName:
        "rounded-fg-pill bg-paper-sunken px-fg-1-5 py-fg-0-5 text-caption tabular-nums text-ink-muted",
      count: 2,
      countAriaLabel: {
        key: "graph:accessibility.workingSetCount",
        values: { count: 2 },
      },
      clearButtonClassName:
        "rounded-fg-pill border border-rule bg-paper-sunken px-fg-2 py-fg-0-5 text-caption text-ink-muted hover:text-ink transition-colors duration-ui-fast ease-settle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      clearLabel: { key: "graph:actions.clearWorkingSet" },
    });
  });

  it("hides the chip trail when no working-set entries exist", () => {
    expect(workingSetView([])).toMatchObject({
      rows: [],
      visible: false,
      count: 0,
      countAriaLabel: {
        key: "graph:accessibility.workingSetCount",
        values: { count: 0 },
      },
    });
  });

  it("dims a chip whose node is filtered out of the visible set (GS-006)", () => {
    // The un-dimmed base row class (derived from a null-membership call so the test does
    // not duplicate the private class literal).
    const baseClass = workingSetRows(["doc:seed"])[0].rootClassName;
    const rows = workingSetRows(["doc:alpha", "doc:beta"], new Set(["doc:alpha"]));

    // In the visible set → NOT hidden: base class, no hidden/hiddenHint fields.
    expect(rows[0].hidden).toBeUndefined();
    expect(rows[0].hiddenHint).toBeUndefined();
    expect(rows[0].rootClassName).toBe(baseClass);

    // Filtered OUT → hidden:true, a plain-language affordance, and the dim utility appended.
    expect(rows[1].hidden).toBe(true);
    expect(rows[1].hiddenHint).toEqual({
      key: "graph:accessibility.hiddenByActiveFilter",
    });
    expect(rows[1].hiddenLabel).toEqual({
      key: "graph:accessibility.namedWorkingSetItemHidden",
      values: { item: "beta" },
    });
    expect(rows[1].rootClassName).toBe(`${baseClass} opacity-50`);
  });

  it("dims nothing when no visibility membership is supplied (null → shape unchanged)", () => {
    const baseClass = workingSetRows(["doc:seed"])[0].rootClassName;
    const [row] = workingSetRows(["doc:alpha"]);
    expect(row.hidden).toBeUndefined();
    expect(row.hiddenHint).toBeUndefined();
    expect(row.rootClassName).toBe(baseClass);
    // The same holds through the view projection.
    expect(workingSetView(["doc:alpha"]).rows[0].hidden).toBeUndefined();
  });

  it("declares working-set keyboard verbs behind the keymap registry shape", () => {
    expect(WORKING_SET_KEYBINDINGS).toEqual([
      {
        id: WORKING_SET_EXPAND_SELECTION_ACTION_ID,
        defaultChord: "E",
        label: WORKING_SET_EXPAND_SELECTION_LABEL,
        group: { key: "graph:shortcutGroups.workingSet" },
        context: "global",
      },
      {
        id: WORKING_SET_COLLAPSE_LAST_ACTION_ID,
        defaultChord: "Backspace",
        label: WORKING_SET_COLLAPSE_LAST_LABEL,
        group: { key: "graph:shortcutGroups.workingSet" },
        context: "global",
      },
    ]);
    expect(WORKING_SET_KEYBINDINGS[0]?.label).toBe(WORKING_SET_EXPAND_SELECTION_LABEL);
    expect(WORKING_SET_KEYBINDINGS[1]?.label).toBe(WORKING_SET_COLLAPSE_LAST_LABEL);
    expect(WORKING_SET_KEYBINDINGS[0]?.group).toBe(WORKING_SET_KEYBINDINGS[1]?.group);
  });

  it("projects working-set keyboard actions from current store state", () => {
    const expand = workingSetKeyAction(
      WORKING_SET_EXPAND_SELECTION_ACTION_ID,
      " doc:selected ",
    );
    expect(expand).toMatchObject({
      id: WORKING_SET_EXPAND_SELECTION_ACTION_ID,
      label: WORKING_SET_EXPAND_SELECTION_LABEL,
    });

    expand?.run?.();
    expect(useViewStore.getState().workingSet).toEqual(["doc:selected"]);

    const collapse = workingSetKeyAction(WORKING_SET_COLLAPSE_LAST_ACTION_ID, null);
    expect(collapse).toMatchObject({
      id: WORKING_SET_COLLAPSE_LAST_ACTION_ID,
      label: WORKING_SET_COLLAPSE_LAST_LABEL,
    });

    collapse?.run?.();
    expect(useViewStore.getState().workingSet).toEqual([]);
    expect(expand?.label).toBe(WORKING_SET_EXPAND_SELECTION_LABEL);
    expect(collapse?.label).toBe(WORKING_SET_COLLAPSE_LAST_LABEL);
  });

  it("resolves working-set bindings through genuine English, French, and Arabic resources", () => {
    const runtimes = [
      createTestLocalizationRuntime(),
      createTestLocalizationRuntime(ltrTestLocale),
      createTestLocalizationRuntime(rtlTestLocale),
    ] as const;
    for (const binding of WORKING_SET_KEYBINDINGS) {
      const labels = runtimes.map(
        (runtime) => resolveMessageResult(runtime, binding.label).message,
      );
      const groups = runtimes.map(
        (runtime) => resolveMessageResult(runtime, binding.group).message,
      );
      expect(new Set(labels).size).toBe(3);
      expect(new Set(groups).size).toBe(3);
    }
  });

  it("keeps working-set keyboard actions inert without actionable state", () => {
    expect(
      workingSetKeyAction(WORKING_SET_EXPAND_SELECTION_ACTION_ID, null),
    ).toBeNull();
    expect(
      workingSetKeyAction(WORKING_SET_EXPAND_SELECTION_ACTION_ID, "   "),
    ).toBeNull();
    expect(
      workingSetKeyAction(WORKING_SET_COLLAPSE_LAST_ACTION_ID, "doc:selected"),
    ).toBeNull();
    expect(workingSetKeyAction("unknown", "doc:selected")).toBeNull();
  });
});
