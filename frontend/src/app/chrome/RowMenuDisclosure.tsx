// RowMenuDisclosure (touch-selectability ADR D3): the deliberate touch entry to
// the context-menu plane. iOS never fires `contextmenu` and long-press is
// reserved for the platform text-selection gesture, so on coarse pointers a
// menu-bearing row renders this one shared affordance instead of overloading
// long-press. It is pure chrome over the existing `openContextMenu` seam — no
// new resolver, no new dispatch path — and renders nothing on fine-pointer
// devices, where right-click already serves the plane.

import { EllipsisVertical } from "lucide-react";
import { useSyncExternalStore } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { openContextMenu } from "../../stores/view/contextMenu";
import { IconButton } from "../kit/IconButton";

// One matchMedia-backed signal, mirroring `viewportClass`: a primitive boolean
// snapshot so no fresh reference escapes (frontend-store-selectors).
const COARSE_POINTER_QUERY = "(pointer: coarse)";

function hasMatchMedia(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function getSnapshot(): boolean {
  return hasMatchMedia() && window.matchMedia(COARSE_POINTER_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => undefined;
  const mql = window.matchMedia(COARSE_POINTER_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** True on touch-first devices (the primary pointer is coarse). */
export function usePointerCoarse(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export interface RowMenuDisclosureProps {
  /** The entity descriptor the row's own `onContextMenu` would open. */
  entity: unknown;
  /** Accessible name — required; the caller resolves a localized row label. */
  label: string;
}

/**
 * The per-row menu disclosure: renders only on coarse pointers and opens the
 * SAME resolver menu the row's right-click path serves, anchored at the button.
 */
export function RowMenuDisclosure({ entity, label }: RowMenuDisclosureProps) {
  const coarse = usePointerCoarse();
  if (!coarse) return null;
  const open = (event: ReactMouseEvent<HTMLButtonElement>) => {
    // The disclosure is an explicit tap target, never a right-click hijack, so
    // the selection guard does not apply: opening here is always deliberate.
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    openContextMenu(entity, { x: rect.left, y: rect.bottom });
  };
  return (
    <IconButton label={label} data-row-menu-disclosure onClick={open}>
      <EllipsisVertical aria-hidden size={14} strokeWidth={1.5} />
    </IconButton>
  );
}
