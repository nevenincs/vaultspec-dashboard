// Shared element-width measurement hook (codebase-centralisation F-S1).
//
// Several chrome surfaces (the timeline, its control bar, the playhead rail)
// each reimplemented the same `ResizeObserver` → `contentRect.width` → state
// effect. This is the single home for that pattern: observe an element's live
// width and report it, treating a pre-layout 0 as "not yet measured" (null) so
// callers apply their own fallback. Returns the measured width in CSS px, or
// `null` until the first real (> 0) measurement.

import { useMemo, useSyncExternalStore, type RefObject } from "react";

function borderBoxInlineSize(
  entry: ResizeObserverEntry | undefined,
): number | undefined {
  const box = entry?.borderBoxSize as
    | ResizeObserverSize
    | readonly ResizeObserverSize[]
    | undefined;
  if (Array.isArray(box)) {
    const first = box[0] as ResizeObserverSize | undefined;
    return first?.inlineSize;
  }
  const single = box as ResizeObserverSize | undefined;
  return single?.inlineSize;
}

type ElementMeasurement = "width" | "height";

interface ElementMeasurementStore {
  getSnapshot: () => number | null;
  subscribe: (listener: () => void) => () => void;
}

function resolveObservedElement(
  ref: RefObject<Element | null>,
  parent: boolean,
): Element | null {
  return parent ? (ref.current?.parentElement ?? null) : ref.current;
}

function measuredSize(
  measurement: ElementMeasurement,
  box: "content" | "border",
  entry: ResizeObserverEntry | undefined,
  el: Element,
): number | null {
  const raw =
    measurement === "height"
      ? entry?.contentRect.height
      : box === "border"
        ? (borderBoxInlineSize(entry) ?? el.getBoundingClientRect().width)
        : entry?.contentRect.width;
  return raw && raw > 0 ? raw : null;
}

function createElementMeasurementStore(
  ref: RefObject<Element | null>,
  measurement: ElementMeasurement,
  opts: { parent: boolean; box: "content" | "border" },
): ElementMeasurementStore {
  let snapshot: number | null = null;

  const setSnapshot = (next: number | null, listener: () => void) => {
    if (next === null || next === snapshot) return;
    snapshot = next;
    listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      const el = resolveObservedElement(ref, opts.parent);
      if (!el || typeof ResizeObserver === "undefined") return () => undefined;
      const observer = new ResizeObserver((entries) => {
        setSnapshot(measuredSize(measurement, opts.box, entries[0], el), listener);
      });
      observer.observe(el);
      return () => observer.disconnect();
    },
  };
}

export function useElementWidth(
  ref: RefObject<Element | null>,
  opts: { parent?: boolean; box?: "content" | "border" } = {},
): number | null {
  const { parent = false, box = "content" } = opts;
  const store = useMemo(
    () => createElementMeasurementStore(ref, "width", { parent, box }),
    [box, parent, ref],
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => null);
}

/**
 * The height twin of [`useElementWidth`]: observe an element's live height and
 * report it in CSS px, treating a pre-layout 0 as "not yet measured" (null) so
 * callers apply their own fallback. The timeline uses it to size its dot-pack row
 * budget against the live chart height, so the layout adapts when the surface is
 * resized.
 */
export function useElementHeight(
  ref: RefObject<Element | null>,
  opts: { parent?: boolean } = {},
): number | null {
  const { parent = false } = opts;
  const store = useMemo(
    () => createElementMeasurementStore(ref, "height", { parent, box: "content" }),
    [parent, ref],
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => null);
}
