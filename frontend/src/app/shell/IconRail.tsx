// IconRail — the left rail's collapsed state. It is NOT a separate primary
// navigation surface: the two icon buttons map directly to the browser modes the
// expanded LeftRail hosts (Documents and Files). Selecting either icon sets the mode
// and lets AppShell open the full rail.
//
// Layer law (dashboard-layer-ownership / view-rewrite-preserves-the-state-and-
// scene-contract): this is leaf chrome — it composes the centralized kit
// (IconButton + the two sanctioned glyph families) and reads only the props it is
// handed; it never fetches, mints no model, and reads no raw `tiers`.

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import {
  BROWSER_MODES,
  browserModePresentation,
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
  const resolveMessage = useLocalizedMessageResolver();

  return (
    <nav
      aria-label="Collapsed scope rail"
      className="flex w-12 shrink-0 flex-col items-center border-r border-rule bg-paper py-fg-3"
    >
      <div className="flex flex-col items-center gap-fg-3">
        {BROWSER_MODES.map((mode) => {
          const presentation = browserModePresentation(mode);
          if (presentation === null) return null;
          const label = resolveMessage(presentation.label);
          if (label.usedFallback) return null;
          const Glyph = PRIMARY_GLYPHS[mode];
          const isActive = active === mode;
          return (
            <div key={mode} className="relative flex w-12 items-center justify-center">
              {isActive && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-5 w-[0.1875rem] -translate-y-1/2 rounded-fg-xs bg-accent"
                />
              )}
              <IconButton
                label={label.message}
                active={isActive}
                onClick={() => onSelect(mode)}
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
