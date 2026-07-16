// The shell focus-region registry and F6 region cycling (keyboard-navigation
// W01.P02). The dashboard is a multi-pane app; per the ARIA two-tier model,
// Tab/Shift+Tab and arrow keys move WITHIN a region while F6/Shift+F6 move
// BETWEEN the major regions. Each region marks its container in the DOM with
// `data-focus-region="<id>"`; this module owns the canonical order, the
// visible-aware cycle, the per-region entry memory (re-entering a region returns
// to its last-focused child), and moving focus into a region.
//
// Layer: app/chrome — it composes the sibling `focusableDescendants` DOM helper
// and is consumed by the region-cycle keybindings and the shell. The Class-A F6
// bindings that DRIVE this live in `regionCycleKeybindings`, registered through
// the one keymap registry; this module holds no global listener of its own.

import { focusableDescendants } from "./focusTrap";
import type { MessageDescriptor } from "../../platform/localization/message";

/** A major focusable region of the shell. */
export interface FocusRegionDef {
  /** Stable id, matched against the `data-focus-region` attribute. */
  id: string;
  /** Human-facing region name (announce region / future aria use). */
  label: MessageDescriptor;
}

export const FOCUS_REGION_ATTR = "data-focus-region";

/**
 * Canonical region order: F6 visits them in this sequence, skipping any that are
 * currently hidden (collapsed rail, hidden timeline). The skip link targets
 * `stage`. The graph canvas is a single tab stop WITHIN `stage` and is handled by
 * the canvas focus contract, so it is not a separate top-level region here.
 */
export const FOCUS_REGIONS: readonly FocusRegionDef[] = [
  { id: "left-rail", label: { key: "common:shell.regions.fileBrowser" } },
  { id: "stage", label: { key: "common:shell.regions.workspace" } },
  { id: "right-rail", label: { key: "common:shell.regions.activity" } },
  { id: "timeline", label: { key: "common:shell.regions.timeline" } },
];

// Entry memory: the last-focused element per region, so re-entering returns the
// user where they left off. Bounded at creation by the fixed region count — at
// most one entry per region (bounded-by-default-for-every-accumulator).
const entryMemory = new Map<string, HTMLElement>();

/** Test-only: clear the retained entry memory. */
export function resetRegionEntryMemory(): void {
  entryMemory.clear();
}

function regionElement(id: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(`[${FOCUS_REGION_ATTR}="${id}"]`);
}

/** Present in the DOM and not display:none (offsetParent is null when hidden). */
function isVisible(el: HTMLElement | null): el is HTMLElement {
  return el !== null && el.offsetParent !== null;
}

/** Record the focused element for whichever region currently contains it. */
export function rememberRegionFocus(target: EventTarget | null): void {
  if (!(target instanceof HTMLElement)) return;
  const host = target.closest<HTMLElement>(`[${FOCUS_REGION_ATTR}]`);
  const id = host?.getAttribute(FOCUS_REGION_ATTR);
  if (id) entryMemory.set(id, target);
}

/** The region id currently holding focus, or null when focus is outside all. */
export function activeRegionId(): string | null {
  if (typeof document === "undefined") return null;
  const active = document.activeElement as HTMLElement | null;
  const host = active?.closest?.(`[${FOCUS_REGION_ATTR}]`) ?? null;
  return host?.getAttribute(FOCUS_REGION_ATTR) ?? null;
}

/** The ordered ids of regions currently visible in the DOM. */
export function visibleRegionIds(): string[] {
  return FOCUS_REGIONS.map((region) => region.id).filter((id) =>
    isVisible(regionElement(id)),
  );
}

/**
 * Move focus INTO a region: its remembered child if still present and visible,
 * else its first focusable descendant, else the region container itself (made
 * programmatically focusable). Returns whether focus landed.
 */
export function focusRegion(id: string): boolean {
  const host = regionElement(id);
  if (!isVisible(host)) return false;

  const remembered = entryMemory.get(id);
  if (remembered && host.contains(remembered) && isVisible(remembered)) {
    remembered.focus();
    return true;
  }

  const [first] = focusableDescendants(host);
  if (first) {
    first.focus();
    return true;
  }

  // No focusable child: focus the container itself so the region is never a
  // dead end and a visible focused element always exists.
  if (!host.hasAttribute("tabindex")) host.tabIndex = -1;
  host.focus();
  return true;
}

/**
 * Cycle focus to the next (dir=1) or previous (dir=-1) VISIBLE region relative to
 * the one currently focused, wrapping around the ends. Returns the focused region
 * id, or null when no region is focusable.
 */
export function cycleFocusRegion(dir: 1 | -1): string | null {
  const visible = visibleRegionIds();
  if (visible.length === 0) return null;

  const current = activeRegionId();
  const at = current === null ? -1 : visible.indexOf(current);
  const nextIndex =
    at === -1
      ? dir === 1
        ? 0
        : visible.length - 1
      : (at + dir + visible.length) % visible.length;

  const target = visible[nextIndex];
  return target !== undefined && focusRegion(target) ? target : null;
}
