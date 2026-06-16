// IconRail — the far-left 48px primary-navigation bar of the binding AppShell
// (figma-frontend-rewrite W02.P03; board 117:2, `left-icon-bar`). A full-height
// column of kit IconButtons centered in 48px: FOUR primary-view glyphs near the
// top (pitch 48px) and the Gear settings entry pinned to the bottom. The ACTIVE
// primary view shows a 3px accent indicator bar on the cell's left edge.
//
// Layer law (dashboard-layer-ownership / view-rewrite-preserves-the-state-and-
// scene-contract): this is leaf chrome — it composes the centralized kit
// (IconButton + the two sanctioned glyph families) and reads only the props it is
// handed; it never fetches, mints no model, and reads no raw `tiers`.

import { IconButton } from "../kit";
import { Books, Gear, Hierarchy, PanelLeft, TreeStructure } from "../kit/glyphs";

/** The four primary-view identities the top of the rail switches between. The
 *  glyph mapping mirrors the binding board's icon row: an overview/panel glyph,
 *  the vault "Books", the node-graph "Hierarchy", and the document "TreeStructure". */
export type PrimaryView = "overview" | "vault" | "graph" | "tree";

interface PrimaryEntry {
  id: PrimaryView;
  label: string;
  glyph: typeof Books;
}

// Ordered top-to-bottom. PanelLeft stands in for the overview/panel affordance
// (Lucide structural chrome); the remaining three are the Phosphor domain marks.
const PRIMARY_ENTRIES: PrimaryEntry[] = [
  { id: "overview", label: "Overview", glyph: PanelLeft },
  { id: "vault", label: "Vault", glyph: Books },
  { id: "graph", label: "Graph", glyph: Hierarchy },
  { id: "tree", label: "Tree", glyph: TreeStructure },
];

export interface IconRailProps {
  /** The active primary view (drives the accent indicator). */
  active: PrimaryView;
  /** Switch the active primary view. */
  onSelect: (view: PrimaryView) => void;
  /** Open the schema-driven settings dialog (the bottom gear). */
  onOpenSettings: () => void;
}

export function IconRail({ active, onSelect, onOpenSettings }: IconRailProps) {
  return (
    <nav
      aria-label="Primary"
      className="flex w-12 shrink-0 flex-col items-center border-r border-rule bg-paper py-fg-3"
    >
      {/* Top cluster: the four primary-view affordances at a 48px pitch. The
          active cell carries a 3px accent indicator flush to the rail's left edge. */}
      <div className="flex flex-col items-center gap-fg-3">
        {PRIMARY_ENTRIES.map((entry) => {
          const Glyph = entry.glyph;
          const isActive = active === entry.id;
          return (
            <div
              key={entry.id}
              className="relative flex w-12 items-center justify-center"
            >
              {isActive && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-fg-xs bg-accent"
                />
              )}
              <IconButton
                label={entry.label}
                active={isActive}
                onClick={() => onSelect(entry.id)}
              >
                <Glyph size={18} />
              </IconButton>
            </div>
          );
        })}
      </div>

      {/* The settings gear is pinned to the bottom of the rail. */}
      <div className="mt-auto flex items-center justify-center">
        <IconButton label="Settings" onClick={onOpenSettings}>
          <Gear size={18} />
        </IconButton>
      </div>
    </nav>
  );
}
