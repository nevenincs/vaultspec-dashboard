// IconRail — the left rail's collapsed state. It is NOT a separate primary
// navigation surface: the two icon buttons map directly to the browser modes the
// expanded LeftRail hosts (Vault and Code). Selecting either icon sets the mode
// and lets AppShell open the full rail.
//
// Layer law (dashboard-layer-ownership / view-rewrite-preserves-the-state-and-
// scene-contract): this is leaf chrome — it composes the centralized kit
// (IconButton + the two sanctioned glyph families) and reads only the props it is
// handed; it never fetches, mints no model, and reads no raw `tiers`.

import {
  BROWSER_MODE_OPTIONS,
  type BrowserMode,
} from "../../stores/view/browserMode";
import { IconButton } from "../kit";
import { Books, TreeStructure } from "../kit/glyphs";

export type CollapsedRailMode = BrowserMode;

const PRIMARY_GLYPHS: Record<CollapsedRailMode, typeof Books> = {
  vault: Books,
  code: TreeStructure,
};

export interface IconRailProps {
  /** The active browser mode (drives the accent indicator). */
  active: CollapsedRailMode;
  /** Switch the active browser mode and open the rail. */
  onSelect: (mode: CollapsedRailMode) => void;
}

export function IconRail({ active, onSelect }: IconRailProps) {
  return (
    <nav
      aria-label="Collapsed scope rail"
      className="flex w-12 shrink-0 flex-col items-center border-r border-rule bg-paper py-fg-3"
    >
      <div className="flex flex-col items-center gap-fg-3">
        {BROWSER_MODE_OPTIONS.map((option) => {
          const Glyph = PRIMARY_GLYPHS[option.id];
          const isActive = active === option.id;
          return (
            <div
              key={option.id}
              className="relative flex w-12 items-center justify-center"
            >
              {isActive && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-5 w-[0.1875rem] -translate-y-1/2 rounded-fg-xs bg-accent"
                />
              )}
              <IconButton
                label={option.label}
                active={isActive}
                onClick={() => onSelect(option.id)}
              >
                <Glyph size={18} />
              </IconButton>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
