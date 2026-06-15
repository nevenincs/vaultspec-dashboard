// Shared element-width measurement hook (codebase-centralisation F-S1).
//
// Several chrome surfaces (the timeline, its control bar, the playhead rail)
// each reimplemented the same `ResizeObserver` → `contentRect.width` → state
// effect. This is the single home for that pattern: observe an element's live
// width and report it, treating a pre-layout 0 as "not yet measured" (null) so
// callers apply their own fallback. Returns the measured width in CSS px, or
// `null` until the first real (> 0) measurement.

import { useEffect, useState, type RefObject } from "react";

export function useElementWidth(
  ref: RefObject<HTMLElement | null>,
  opts: { parent?: boolean } = {},
): number | null {
  const { parent = false } = opts;
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = parent ? ref.current?.parentElement : ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [parent, ref]);
  return width;
}
