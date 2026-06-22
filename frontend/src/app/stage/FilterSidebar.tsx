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

import { useEffect, useState } from "react";
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

/** Track the rail Filters button's viewport rect while the flyout is open so the
 *  portalled (fixed) panel stays pinned to the RIGHT of the button across scroll
 *  and resize. Returns null until the trigger is measured. */
function useFlyoutAnchor(open: boolean): FlyoutAnchor | null {
  const [anchor, setAnchor] = useState<FlyoutAnchor | null>(null);
  useEffect(() => {
    if (!open) {
      setAnchor(null);
      return;
    }
    const update = () => {
      const trigger = document.querySelector("[data-rail-filter-trigger]");
      if (!trigger) {
        setAnchor(null);
        return;
      }
      const rect = trigger.getBoundingClientRect();
      setAnchor({ top: rect.top, left: rect.right + FLYOUT_ANCHOR_GAP });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);
  return anchor;
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
  const anchor = useFlyoutAnchor(open);

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
      className={presentation.panelClassName}
      style={{ top: anchor.top, left: anchor.left }}
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
