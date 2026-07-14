// Registry + descriptor units (W01.P01.S05): a resolver registered by entity
// kind is the only thing that produces a menu; an unregistered kind yields a
// quiet empty list; the disposer removes the resolver. The central time-travel
// gate is tested separately (W02.P06.S26).

import { afterEach, describe, expect, it } from "vitest";

import {
  ACTION_DESCRIPTOR_ACCELERATOR_MAX_CHARS,
  ACTION_DESCRIPTOR_ID_MAX_CHARS,
  ACTION_DESCRIPTOR_LABEL_MAX_CHARS,
  ACTION_DESCRIPTOR_META_TEXT_MAX_CHARS,
  LEGACY_ACTION_PRESENTATION_MAX_CHARS,
  fireActionDescriptor,
  isRunnable,
  legacyActionPresentation,
  normalizeActionDescriptorId,
  normalizeActionDescriptorLabel,
  normalizeActionDescriptorText,
  normalizeActionDescriptor,
  normalizeLegacyActionPresentation,
  resolveActionPresentation,
  type ActionDescriptor,
  type LegacyActionPresentation,
} from "./action";
import {
  resolveMessageResult,
  SAFE_FALLBACK_SOURCE_MESSAGE,
} from "../localization/fallback";
import type { MessageDescriptor } from "../localization/message";
import { createLocalizationRuntime } from "../localization/runtime";
import {
  ENTITY_DESCRIPTOR_HUNK_MAX_CHARS,
  ENTITY_DESCRIPTOR_ID_MAX_CHARS,
  ENTITY_DESCRIPTOR_PATH_MAX_CHARS,
  ENTITY_DESCRIPTOR_TEXT_MAX_CHARS,
} from "./entity";
import type { NodeEntity } from "./entity";
import {
  hasResolver,
  normalizeActionEntity,
  normalizeEntityKind,
  registerGlobalTailActions,
  registerResolver,
  resetResolvers,
  resolveActions,
  type ActionContext,
} from "./registry";

const LIVE: ActionContext = { timeTravel: false };

afterEach(() => resetResolvers());

describe("resolver registry", () => {
  it("normalizes entity kinds and descriptors at the registry seam", () => {
    expect(normalizeEntityKind(" node ")).toBe("node");
    expect(normalizeEntityKind("unknown")).toBeNull();
    expect(
      normalizeActionEntity({
        kind: " node ",
        id: " doc:n1 ",
        title: " Alpha ",
        scope: " scope-a ",
        rogue: "local payload",
      }),
    ).toEqual({
      kind: "node",
      id: "doc:n1",
      scope: "scope-a",
      title: "Alpha",
    });
    expect(normalizeActionEntity({ kind: "canvas", id: "ignored" })).toEqual({
      kind: "canvas",
      id: "canvas",
    });
    expect(normalizeActionEntity({ kind: "node", id: "   " })).toBeNull();
    expect(
      normalizeActionEntity({
        kind: "vault-doc",
        id: "doc:1",
        path: "   ",
        stem: "ADR",
      }),
    ).toBeNull();
    expect(
      normalizeActionEntity({
        kind: "event",
        id: "evt:1",
        nodeIds: [" doc:a ", "", "doc:a", 5, "doc:b"],
        truncatedNodeIds: 2.8,
        rogue: "local payload",
      }),
    ).toEqual({
      kind: "event",
      id: "evt:1",
      nodeIds: ["doc:a", "doc:b"],
      truncatedNodeIds: 2,
    });
    expect(
      normalizeActionEntity({
        kind: "search-result",
        id: "result:1",
        source: "search",
        nodeId: { id: "doc:a" },
      }),
    ).toEqual({
      kind: "search-result",
      id: "result:1",
      source: "search",
    });
    expect(
      normalizeActionEntity({
        kind: "edge",
        id: "edge:1",
        relation: "links",
        dst: " doc:target ",
      }),
    ).toEqual({
      kind: "edge",
      id: "edge:1",
      relation: "links",
      dst: "doc:target",
    });
    expect(
      normalizeActionEntity({
        kind: "workspace",
        id: "x".repeat(ENTITY_DESCRIPTOR_ID_MAX_CHARS + 1),
      }),
    ).toBeNull();
    expect(
      normalizeActionEntity({
        kind: "vault-doc",
        id: "doc:1",
        path: "x".repeat(ENTITY_DESCRIPTOR_PATH_MAX_CHARS + 1),
        stem: "ADR",
      }),
    ).toBeNull();
    expect(
      normalizeActionEntity({
        kind: "node",
        id: "doc:n1",
        title: "x".repeat(ENTITY_DESCRIPTOR_TEXT_MAX_CHARS + 1),
      }),
    ).toEqual({
      kind: "node",
      id: "doc:n1",
    });
    expect(
      normalizeActionEntity({
        kind: "change",
        id: "change:1",
        path: "src/app.ts",
        hunk: "x".repeat(ENTITY_DESCRIPTOR_HUNK_MAX_CHARS + 1),
      }),
    ).toEqual({
      kind: "change",
      id: "change:1",
      path: "src/app.ts",
    });
  });

  it("resolves a kind through its registered resolver", () => {
    registerResolver("node", (entity) => [
      { id: `focus:${entity.id}`, label: `focus ${entity.title ?? entity.id}` },
    ]);
    const entity: NodeEntity = { kind: "node", id: "n1", title: "Alpha" };
    const actions = resolveActions(entity, LIVE);
    expect(actions).toHaveLength(1);
    expect(actions[0].label).toBe("focus Alpha");
  });

  it("uses normalized kinds for registration, lookup, resolution, and disposal", () => {
    const dispose = registerResolver(" node " as unknown, (entity: NodeEntity) => [
      { id: `focus:${entity.id}`, label: `focus ${entity.id}` },
    ]);

    expect(hasResolver(" node ")).toBe(true);
    expect(
      resolveActions({ kind: " node ", id: " n1 " }, LIVE).map((a) => a.id),
    ).toEqual(["focus:n1"]);

    dispose();
    expect(hasResolver("node")).toBe(false);
  });

  it("returns an empty list for an unregistered kind (quiet, not an error)", () => {
    expect(resolveActions({ kind: "canvas", id: "canvas" }, LIVE)).toEqual([]);
    expect(hasResolver("canvas")).toBe(false);
  });

  it("quietly ignores malformed runtime entities during resolution", () => {
    registerResolver("node", () => [{ id: "focus", label: "Focus" }]);

    expect(resolveActions({ kind: "unknown", id: "n1" }, LIVE)).toEqual([]);
    expect(resolveActions({ kind: "node", id: "   " }, LIVE)).toEqual([]);
    expect(resolveActions(null, LIVE)).toEqual([]);
  });

  it("throws on malformed resolver registration kinds", () => {
    expect(() => registerResolver(" unknown " as unknown, () => [])).toThrow(
      /malformed entity kind/,
    );
  });

  it("ignores malformed resolver registrations at the registry seam", () => {
    const dispose = registerResolver("node", { resolve: () => [] });

    expect(hasResolver("node")).toBe(false);
    expect(resolveActions({ kind: "node", id: "n1" }, LIVE)).toEqual([]);

    dispose();
  });

  it("passes the action context through to the resolver", () => {
    let seen: ActionContext | null = null;
    registerResolver("node", (_e, ctx) => {
      seen = ctx;
      return [];
    });
    resolveActions({ kind: "node", id: "n1" }, { timeTravel: true });
    expect(seen).toEqual({ timeTravel: true });
  });

  it("the disposer removes the resolver", () => {
    const dispose = registerResolver("edge", () => [{ id: "x", label: "x" }]);
    expect(hasResolver("edge")).toBe(true);
    dispose();
    expect(hasResolver("edge")).toBe(false);
    expect(resolveActions({ kind: "edge", id: "e1" }, LIVE)).toEqual([]);
  });

  it("re-registering a kind replaces the prior resolver", () => {
    registerResolver("node", () => [{ id: "a", label: "first" }]);
    registerResolver("node", () => [{ id: "b", label: "second" }]);
    const actions = resolveActions({ kind: "node", id: "n1" }, LIVE);
    expect(actions.map((a) => a.label)).toEqual(["second"]);
  });

  it("normalizes resolver-produced descriptors before consumers see them", () => {
    const run = () => undefined;
    registerResolver(
      "node",
      () =>
        [
          {
            id: " focus ",
            label: " Focus ",
            section: " copy ",
            disabledReason: " no target ",
            accelerator: " F ",
            run,
            rogue: "local payload",
          },
          { id: "bad", label: "   ", run },
          { id: "dispatch", label: " Dispatch ", dispatch: { type: " host:reveal " } },
          { id: "ambiguous", label: " Ambiguous ", run, dispatch: { type: "noop" } },
        ] as unknown as ActionDescriptor[],
    );

    const actions = resolveActions({ kind: "node", id: "n1" }, LIVE);

    expect(actions).toEqual([
      {
        id: "focus",
        label: "Focus",
        section: "copy",
        disabledReason: "no target",
        accelerator: "F",
        run,
      },
      {
        id: "dispatch",
        label: "Dispatch",
        dispatch: { type: "host:reveal" },
      },
      {
        id: "ambiguous",
        label: "Ambiguous",
      },
    ]);
  });
});

describe("time-travel gate (W02.P06.S26)", () => {
  it("removes disabledInTimeTravel actions in time-travel, keeps them live", () => {
    registerResolver("node", () => [
      { id: "focus", label: "Focus" },
      { id: "copy", label: "Copy id", section: "copy" },
      { id: "pin", label: "Pin", section: "transform", disabledInTimeTravel: true },
      { id: "remove", label: "Remove", section: "danger", disabledInTimeTravel: true },
    ]);
    const node = { kind: "node", id: "n1" } as const;
    expect(resolveActions(node, { timeTravel: false }).map((a) => a.id)).toEqual([
      "focus",
      "copy",
      "pin",
      "remove",
    ]);
    expect(resolveActions(node, { timeTravel: true }).map((a) => a.id)).toEqual([
      "focus",
      "copy",
    ]);
  });
});

describe("isRunnable", () => {
  const base = {
    id: "i",
    label: legacyActionPresentation("l"),
  } satisfies ActionDescriptor;
  it("normalizes raw action descriptor presentation and execution lanes", () => {
    const run = () => {};

    expect(
      normalizeActionDescriptor({
        id: " x ",
        label: " X ",
        section: " danger ",
        confirm: true,
        disabled: true,
        disabledReason: " wait ",
        disabledInTimeTravel: true,
        accelerator: " Mod+X ",
        run,
      }),
    ).toEqual({
      id: "x",
      label: "X",
      section: "danger",
      confirm: true,
      disabled: true,
      disabledReason: "wait",
      disabledInTimeTravel: true,
      accelerator: "Mod+X",
      run,
    });

    expect(normalizeActionDescriptor({ id: "x", label: "   " })).toBeNull();
    expect(
      normalizeActionDescriptor({
        id: "x".repeat(ACTION_DESCRIPTOR_ID_MAX_CHARS + 1),
        label: "X",
      }),
    ).toBeNull();
    expect(
      normalizeActionDescriptor({
        id: "x",
        label: "x".repeat(ACTION_DESCRIPTOR_LABEL_MAX_CHARS + 1),
      }),
    ).toBeNull();
    expect(
      normalizeActionDescriptor({
        id: "x",
        label: "X",
        disabledReason: "x".repeat(ACTION_DESCRIPTOR_META_TEXT_MAX_CHARS + 1),
        accelerator: "x".repeat(ACTION_DESCRIPTOR_ACCELERATOR_MAX_CHARS + 1),
      }),
    ).toEqual({ id: "x", label: "X" });
    expect(
      normalizeActionDescriptorId(
        "x".repeat(ACTION_DESCRIPTOR_ID_MAX_CHARS + 1),
        "fallback",
      ),
    ).toBe("fallback");
    expect(
      normalizeActionDescriptorLabel(
        "x".repeat(ACTION_DESCRIPTOR_LABEL_MAX_CHARS + 1),
        "Fallback",
      ),
    ).toBe("Fallback");
    expect(
      normalizeActionDescriptorText("x".repeat(ACTION_DESCRIPTOR_LABEL_MAX_CHARS + 1)),
    ).toHaveLength(ACTION_DESCRIPTOR_LABEL_MAX_CHARS + 1);
    expect(
      normalizeActionDescriptor({
        id: "ambiguous",
        label: "Ambiguous",
        run,
        dispatch: { type: "noop" },
      }),
    ).toEqual({ id: "ambiguous", label: "Ambiguous" });
  });

  it("normalizes typed presentation and discriminated confirmations", () => {
    const normalized = normalizeActionDescriptor({
      id: "archive",
      label: { key: "features:destructiveActions.archive" },
      disabledReason: { key: "features:disabledReasons.selectFeature" },
      confirmation: {
        kind: "destructive",
        title: {
          key: "features:confirmations.archive.title",
          values: { feature: "Alpha" },
        },
        body: { key: "features:confirmations.archive.body" },
        confirmLabel: { key: "features:destructiveActions.archive" },
        cancelLabel: { key: "common:actions.cancel" },
      },
    });

    expect(normalized).toMatchObject({
      id: "archive",
      label: { key: "features:destructiveActions.archive" },
      disabledReason: { key: "features:disabledReasons.selectFeature" },
      confirmation: {
        kind: "destructive",
        confirmLabel: { key: "features:destructiveActions.archive" },
      },
    });
    expect(
      normalizeActionDescriptor({
        id: "invalid",
        label: { key: "features:guardedActions.repair" },
        confirm: true,
        confirmation: {
          kind: "guarded",
          title: { key: "features:confirmations.repair.title" },
          body: { key: "features:confirmations.repair.body" },
          confirmLabel: { key: "features:guardedActions.repair" },
          cancelLabel: { key: "common:actions.cancel" },
        },
      }),
    ).toBeNull();
  });

  it("resolves transitional action presentation through the localization runtime", () => {
    const runtime = createLocalizationRuntime();
    const resolveDescriptor = (descriptor: MessageDescriptor) =>
      resolveMessageResult(runtime, descriptor);

    expect(
      resolveActionPresentation(
        legacyActionPresentation(" Legacy label "),
        resolveDescriptor,
      ),
    ).toEqual({ message: "Legacy label", usedFallback: false });
    expect(
      resolveActionPresentation({ key: "common:actions.retry" }, resolveDescriptor),
    ).toEqual({ message: "Retry", usedFallback: false });
  });

  it("bounds legacy presentation and safely resolves invalid bridge data", () => {
    expect(normalizeLegacyActionPresentation(" Legacy label ")).toBe("Legacy label");
    expect(normalizeLegacyActionPresentation("   ")).toBeNull();
    expect(
      normalizeLegacyActionPresentation({ key: "common:actions.retry" }),
    ).toBeNull();
    expect(
      normalizeLegacyActionPresentation(
        "x".repeat(LEGACY_ACTION_PRESENTATION_MAX_CHARS + 1),
      ),
    ).toBeNull();
    expect(
      normalizeLegacyActionPresentation(
        "x".repeat(LEGACY_ACTION_PRESENTATION_MAX_CHARS + 1),
        LEGACY_ACTION_PRESENTATION_MAX_CHARS + 1,
      ),
    ).toBeNull();

    const runtime = createLocalizationRuntime();
    const invalidBridgePresentation = " " as LegacyActionPresentation;
    expect(
      resolveActionPresentation(invalidBridgePresentation, (descriptor) =>
        resolveMessageResult(runtime, descriptor),
      ),
    ).toEqual({ message: SAFE_FALLBACK_SOURCE_MESSAGE, usedFallback: true });
  });

  it("is true for a run action", () => {
    expect(isRunnable({ ...base, run: () => {} })).toBe(true);
  });
  it("is true for a dispatch action", () => {
    expect(isRunnable({ ...base, dispatch: { type: "t" } })).toBe(true);
  });
  it("is false when disabled", () => {
    expect(isRunnable({ ...base, run: () => {}, disabled: true })).toBe(false);
  });
  it("is false for a bare placeholder", () => {
    expect(isRunnable(base)).toBe(false);
  });
  it("is false for an ambiguous run-plus-dispatch descriptor", () => {
    const ambiguous = {
      ...base,
      run: () => {},
      dispatch: { type: "t" },
    } as unknown as ActionDescriptor;

    expect(isRunnable(ambiguous)).toBe(false);
  });

  it("normalizes and gates direct descriptor execution", () => {
    const calls: string[] = [];
    const run = () => calls.push("run");

    expect(
      fireActionDescriptor({
        id: " x ",
        label: " X ",
        run,
      }),
    ).toBe(1);
    fireActionDescriptor({ id: "disabled", label: "Disabled", disabled: true, run });
    fireActionDescriptor({ id: "bad", label: "   ", run });
    fireActionDescriptor({
      id: "ambiguous",
      label: "Ambiguous",
      run,
      dispatch: { type: "noop" },
    });

    expect(calls).toEqual(["run"]);
  });
});

describe("global-tail seam (global-context-actions D2/D3)", () => {
  const refreshTail = (): ActionDescriptor[] => [
    {
      id: "reload:refresh-data",
      label: legacyActionPresentation("refresh"),
      section: "global",
      run: () => {},
    },
  ];

  it("appends the tail AFTER the per-kind body, last, for a resolved kind", () => {
    registerResolver("node", () => [
      { id: "node:focus", label: "Focus", section: "navigate", run: () => {} },
    ]);
    registerGlobalTailActions(refreshTail);

    const actions = resolveActions({ kind: "node", id: "doc:a" }, LIVE);
    expect(actions.map((a) => a.id)).toEqual(["node:focus", "reload:refresh-data"]);
    expect(actions[actions.length - 1].section).toBe("global");
  });

  it("reaches EVERY resolved kind (kind-agnostic)", () => {
    registerResolver("node", () => [
      { id: "node:focus", label: "Focus", run: () => {} },
    ]);
    registerResolver("change", () => [
      { id: "change:open", label: "Open", path: "a.ts", run: () => {} } as never,
    ]);
    registerGlobalTailActions(refreshTail);

    for (const entity of [
      { kind: "node", id: "doc:a" },
      { kind: "change", id: "c1", path: "a.ts" },
    ]) {
      expect(resolveActions(entity, LIVE).map((a) => a.id)).toContain(
        "reload:refresh-data",
      );
    }
  });

  it("does NOT spawn a tail-only menu for an unregistered kind", () => {
    registerGlobalTailActions(refreshTail);
    expect(resolveActions({ kind: "node", id: "doc:a" }, LIVE)).toEqual([]);
  });

  it("inherits the ONE time-travel gate: a disabledInTimeTravel tail action is filtered", () => {
    registerResolver("node", () => [
      { id: "node:focus", label: "Focus", run: () => {} },
    ]);
    registerGlobalTailActions(() => [
      {
        id: "x:mutate",
        label: legacyActionPresentation("Mutate"),
        section: "global",
        disabledInTimeTravel: true,
        dispatch: { type: "noop" },
      },
    ]);

    const live = resolveActions({ kind: "node", id: "doc:a" }, { timeTravel: false });
    expect(live.map((a) => a.id)).toContain("x:mutate");
    const travel = resolveActions({ kind: "node", id: "doc:a" }, { timeTravel: true });
    expect(travel.map((a) => a.id)).not.toContain("x:mutate");
  });

  it("the disposer removes the tail contributor", () => {
    registerResolver("node", () => [
      { id: "node:focus", label: "Focus", run: () => {} },
    ]);
    const dispose = registerGlobalTailActions(refreshTail);
    expect(
      resolveActions({ kind: "node", id: "doc:a" }, LIVE).map((a) => a.id),
    ).toContain("reload:refresh-data");
    dispose();
    expect(
      resolveActions({ kind: "node", id: "doc:a" }, LIVE).map((a) => a.id),
    ).not.toContain("reload:refresh-data");
  });
});
