// FilterSidebar — the stores CONTAINER for the unified ADVANCED-filter flyout
// (filter-controls / left-rail feature-filter campaign; binding Figma
// "graph/Filter menu" 217:633). It reads canonical dashboard-state + the served
// filter vocabulary and feeds the dumb presentational <FilterMenu/>; it never
// fetches and never reads a raw tiers block (dashboard-layer-ownership). Opened by
// the rail's dedicated "Filters" button (never by focus/keyboard), it is PORTALLED
// to <body> and positioned (fixed) to the RIGHT of that button so it flies out
// OVER the stage — the graph and any open documents — instead of being clipped in
// the rail column. An OPAQUE overlay (bg-paper, not a translucent panel that would
// composite see-through over the portal-pinned WebGL graph canvas), light-dismissed
// on Escape or an outside pointer (the button is excluded so its own toggle owns
// open/close).
//
// Sections: KIND (doc types) · STATUS (lifecycle — ADR adjectives + plan
// meta-states) · HEALTH (validity — dangling/orphaned…) · EDITED (date window).
// STATUS/HEALTH render only when the engine serves their vocabulary, so they are
// never dead controls. FEATURE filtering is NOT here — it is authored by the rail's
// feature search bar (filtering-has-one-canonical-surface).

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Popover } from "../kit";
import { useDashboardFilterSidebarIntent } from "../../stores/server/dashboardFilterSidebarIntent";
import {
  useDashboardFilterSidebarView,
  useFiltersVocabularyView,
} from "../../stores/server/queries";
import {
  deriveFilterSidebarMenuSections,
  useFilterSidebarVisualState,
} from "../../stores/view/filterSidebar";
import { FilterMenu } from "./FilterMenu";

// ---------------------------------------------------------------------------

export interface FilterSidebarProps {
  /** Whether the flyout is visible. */
  open: boolean;
  /** Close the flyout. */
  onClose: () => void;
  /** Scope for vocabulary + dashboard-state queries. */
  scope: unknown;
  /** Hidden count — owned by Stage's visibility reduction (the toolbar already
   *  surfaces the recoverable cost; reserved for a future footer). */
  hidden: { nodes: number; edges: number };
}

/** Gap (px) between the Filters button and the flyout's left edge. */
const FLYOUT_ANCHOR_GAP = 8;

interface FlyoutAnchor {
  top: number;
  left: number;
}

function anchorsEqual(a: FlyoutAnchor | null, b: FlyoutAnchor | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.left === b.left;
}

interface FlyoutAnchorState {
  /** The pinned position, or null before the trigger is measured. */
  anchor: FlyoutAnchor | null;
  /** True once the position has settled — the panel stays hidden until then so it
   *  never visibly slides into place across the open-time reflow. */
  ready: boolean;
}

/** Track the rail Filters button's viewport rect while the flyout is open so the
 *  portalled (fixed) panel stays pinned to the RIGHT of the button.
 *
 *  Robust against reflow timing (mirrors the canvas-pin settle loop): the button's
 *  position is NOT stable on the frame the flyout opens — the rail header reflows as
 *  TanStack-driven content (the vault tree, the active-filter badge, web fonts)
 *  lands, which slides the button horizontally. Measuring once on open captured a
 *  pre-settle position that only corrected on a later resize/scroll. Instead we:
 *    • prime synchronously in a layout effect (correct on first paint when steady),
 *    • run a BOUNDED rAF settle loop that re-measures until the rect holds steady,
 *      then stops (no idle animation frame),
 *    • observe the trigger AND the rail container with a ResizeObserver, so any
 *      data-load-driven reflow that moves the button re-pokes the loop, and
 *    • keep the panel HIDDEN until the rect has fully settled (held 6 frames, or a
 *      300ms safety cap), so the open never shows a slide.
 *  setAnchor fires only on a real rect change (stable-selectors), so no render loop. */
function useFlyoutAnchor(open: boolean): FlyoutAnchorState {
  const [anchor, setAnchor] = useState<FlyoutAnchor | null>(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null);
      setReady(false);
      return;
    }
    const trigger = document.querySelector<HTMLElement>("[data-rail-filter-trigger]");
    if (!trigger) {
      setAnchor(null);
      setReady(false);
      return;
    }

    let frame = 0;
    let stableFrames = 0;
    let stopped = false;
    let revealed = false;
    let current: FlyoutAnchor | null = null;

    const measure = (): FlyoutAnchor => {
      const rect = trigger.getBoundingClientRect();
      return { top: rect.top, left: rect.right + FLYOUT_ANCHOR_GAP };
    };
    const apply = (next: FlyoutAnchor): boolean => {
      if (anchorsEqual(current, next)) return false;
      current = next;
      setAnchor(next);
      return true;
    };
    // Latch visible once — after the first reveal the panel tracks (visible)
    // without ever hiding again, so ongoing scroll/resize never flickers it.
    const reveal = (): void => {
      if (!revealed) {
        revealed = true;
        setReady(true);
      }
    };
    const tick = (): void => {
      if (stopped) return;
      if (apply(measure())) {
        stableFrames = 0;
      } else if (++stableFrames >= 6) {
        // The rect has held for 6 frames — it has truly settled (not a transient
        // pause mid-creep). Reveal at the correct final position, then stop.
        reveal();
        frame = 0;
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    const poke = (): void => {
      stableFrames = 0;
      if (!frame) frame = requestAnimationFrame(tick);
    };

    // The rail header that holds the trigger — the element whose reflow moves it.
    const railContainer =
      trigger.closest<HTMLElement>("[data-rail-filter-area]") ??
      (trigger.offsetParent as HTMLElement | null);
    const resizeObserver = new ResizeObserver(poke);
    resizeObserver.observe(trigger);
    if (railContainer) resizeObserver.observe(railContainer);
    resizeObserver.observe(document.documentElement);
    window.addEventListener("resize", poke);
    window.addEventListener("scroll", poke, true);
    // Safety cap: never leave the panel hidden indefinitely if the layout never
    // perfectly settles (a continuously animating ancestor).
    const safety = window.setTimeout(reveal, 300);

    // Prime synchronously so the portal is positioned before its first paint,
    // then settle through the post-open reflow.
    apply(measure());
    poke();

    return () => {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(safety);
      resizeObserver.disconnect();
      window.removeEventListener("resize", poke);
      window.removeEventListener("scroll", poke, true);
    };
  }, [open]);
  return { anchor, ready };
}

export function FilterSidebar({ open, onClose, scope }: FilterSidebarProps) {
  const vocabulary = useFiltersVocabularyView(scope);
  const filterView = useDashboardFilterSidebarView(scope);
  const filterIntent = useDashboardFilterSidebarIntent(scope);
  // Reset the disclosure store when the scoped vocabulary changes so the flyout's
  // visual state never rides across a different corpus.
  const visualStateKey = useFilterSidebarVisualState(
    scope,
    vocabulary.docTypes,
    vocabulary.featureTags,
    vocabulary.statuses,
    vocabulary.health,
  );
  const presentation = filterView.presentation;
  const { anchor, ready } = useFlyoutAnchor(open);

  const sections = deriveFilterSidebarMenuSections({
    vocabulary,
    filterView,
    onToggleFacet: (facet, value) => void filterIntent.toggleFacet(facet, value),
  });

  if (!open || anchor === null) return null;

  // Portalled to <body> so the fixed panel escapes the rail column's clipping and
  // overlays the stage. The shared kit Popover owns the light-dismiss wiring
  // (Escape + outside pointer); `ignoreSelector` excludes the rail Filters button
  // so its own toggle owns open/close without a dismiss-then-reopen race.
  return createPortal(
    <Popover
      open={open}
      onDismiss={onClose}
      ignoreSelector="[data-rail-filter-trigger]"
      role="dialog"
      aria-label={presentation.panelAriaLabel}
      aria-modal={false}
      className={`${presentation.panelClassName}${ready ? " animate-fade-in" : ""}`}
      style={{
        top: anchor.top,
        left: anchor.left,
        visibility: ready ? undefined : "hidden",
      }}
      data-filter-sidebar
    >
      <FilterMenu
        key={visualStateKey}
        title={presentation.titleLabel}
        anyActive={filterView.anyActive}
        onClearAll={() => {
          // Clears only the facet filters; the date window is the timeline's to own
          // (filtering-has-one-canonical-surface: one date writer).
          void filterIntent.clearFilters();
        }}
        sections={sections}
        maxHeight="calc(100vh - 3.5rem)"
      />
    </Popover>,
    document.body,
  );
}
