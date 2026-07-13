// Reader scroll-to-section intent (authoring-surface W04.P09.S31).
//
// Following a wiki-link that carries a `#slug` fragment must scroll the TARGET
// document's reader to that heading — but the target opens asynchronously (the
// content query resolves a beat later), and the click originates in one reader
// while the scroll happens in the target's reader (possibly a different mount). So
// the fragment intent rides this small view-local signal: the click records a
// pending (nodeId, slug); the target reader consumes it once its content is ready.
//
// Layer law (dashboard-layer-ownership): a pure view-local signal — no wire, no
// query cache, no `tiers`. One intent at a time (a single navigation), so a fresh
// follow supersedes any unconsumed prior. `useReaderSectionScroll` returns a
// PRIMITIVE (the slug string or null), value-compared, so no fresh reference
// escapes the selector (frontend-store-selectors).

import { useSyncExternalStore } from "react";

interface SectionScrollIntent {
  nodeId: string;
  slug: string;
}

let pending: SectionScrollIntent | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Record the intent to scroll `nodeId`'s reader to the `slug` heading once it
 *  renders. Supersedes any unconsumed prior intent (one navigation at a time). */
export function requestSectionScroll(nodeId: string, slug: string): void {
  pending = { nodeId, slug };
  emit();
}

/** Clear the pending intent for `nodeId` (the target reader consumed it — whether
 *  or not the heading was found, so a missing anchor never lingers as a stale
 *  target). A no-op when the pending intent targets a different document. */
export function clearSectionScroll(nodeId: string): void {
  if (pending?.nodeId === nodeId) {
    pending = null;
    emit();
  }
}

/** The pending scroll slug for `nodeId`, or null. Primitive-returning subscription
 *  so the reader re-renders when a fragment follow targets it. */
export function useReaderSectionScroll(nodeId: string | null): string | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () =>
      pending !== null && nodeId !== null && pending.nodeId === nodeId
        ? pending.slug
        : null,
    () => null,
  );
}
