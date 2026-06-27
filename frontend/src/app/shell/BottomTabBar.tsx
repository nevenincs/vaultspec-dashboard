// Compact bottom tab bar (mobile-responsive-layout ADR D2; binding Figma
// `BottomTabBar` component set). The thumb-reachable primary navigation for the
// compact (phone/tablet) shell: five surfaces — Browse · Graph · Timeline ·
// Status · Search — one active at a time. It mirrors the Figma component: a
// safe-area-inset bar of ≥44pt items, the active item carrying the accent-subtle
// pill + accent-text (a non-colour-only cue, redundant with the accent glyph), so
// the active state reads without relying on hue alone.
//
// Layer law (dashboard-layer-ownership): dumb chrome. It takes the active surface
// and an onSelect callback; it fetches nothing, holds no state, reads no `tiers`.
// Iconography composes the centralized kit glyphs only
// (icons-come-from-the-two-sanctioned-families); sizing is rem/token + a
// safe-area env() inset (no hardcoded px — no-hardcoded-px-in-dom-styling).

import type { ComponentType } from "react";
import { useEffect, useState } from "react";

import type { CompactSurface } from "../../stores/view/compactSurface";
import { useFocusZone } from "../chrome/useFocusZone";
import { Books, Calendar, GitBranch, MagnifyingGlass } from "../kit/glyphs";

export type { CompactSurface };

interface TabDef {
  id: CompactSurface;
  label: string;
  Glyph: ComponentType<{ size?: number }>;
}

// Left-to-right order matches the binding Figma BottomTabBar.
const TABS: readonly TabDef[] = [
  { id: "browse", label: "Browse", Glyph: Books },
  { id: "timeline", label: "Timeline", Glyph: Calendar },
  { id: "status", label: "Status", Glyph: GitBranch },
  { id: "search", label: "Search", Glyph: MagnifyingGlass },
];

export interface BottomTabBarProps {
  active: CompactSurface;
  onSelect: (surface: CompactSurface) => void;
}

export function BottomTabBar({ active, onSelect }: BottomTabBarProps) {
  // The five surfaces rove through the one shared FocusZone (keyboard-navigation
  // every-composite-navigates-through-the-one-focuszone): the bar is ONE tab stop
  // and Left/Right arrows move between tabs. Activation is MANUAL (Enter / Space /
  // tap), so arrowing PAST the momentary Search tab never opens the palette — only
  // an explicit activation does. The tab stop defaults to the active surface.
  const [rovingTab, setRovingTab] = useState<CompactSurface>(active);
  useEffect(() => setRovingTab(active), [active]);
  const zone = useFocusZone({
    orientation: "horizontal",
    wrap: true,
    activeKey: rovingTab,
    onActiveKeyChange: (id) => setRovingTab(id as CompactSurface),
  });
  return (
    <nav
      aria-label="Primary"
      data-kit="bottom-tab-bar"
      // border-top + raised ground; safe-area inset keeps the row clear of the
      // home-indicator gesture zone (no px literal: rem floor max()'d with env()).
      className="flex shrink-0 items-stretch gap-fg-1 border-t border-rule bg-paper-raised px-fg-2 pt-fg-2 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
    >
      {TABS.map(({ id, label, Glyph }) => {
        const isActive = id === active;
        const item = zone.rove(id);
        return (
          <button
            key={id}
            ref={item.ref}
            tabIndex={item.tabIndex}
            onKeyDown={item.onKeyDown}
            type="button"
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            data-active={isActive}
            onClick={() => onSelect(id)}
            onFocus={() => setRovingTab(id)}
            // Icon-only (binding Figma BottomTabBar): ≥44pt tap target
            // (min-h-11 = 2.75rem), the glyph centered; active = accent-subtle pill
            // + accent ink so the state survives without colour. The label is the
            // accessible name (aria-label) only.
            className={`flex min-h-11 flex-1 items-center justify-center rounded-fg-md py-fg-1 transition-colors duration-ui-fast ease-settle outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
              isActive
                ? "bg-accent-subtle text-accent-text"
                : "text-ink-muted hover:bg-paper-sunken hover:text-ink"
            }`}
          >
            <Glyph size={24} />
          </button>
        );
      })}
    </nav>
  );
}
