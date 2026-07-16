// Compact bottom tab bar (mobile-responsive-layout ADR D2; mobile-unified-rail ADR).
// The thumb-reachable primary navigation for the compact (phone/tablet) shell: three
// surfaces — Home · Timeline · Search — one active at a time (the graph is
// desktop-only, D4 — no tab). Home is the unified rail (the former Browse and Status
// surfaces merged into one scroll), so the former Status tab is retired. It
// mirrors the Figma component idiom: a safe-area-inset bar of ≥44pt icon-only items,
// the active item carrying a COMPACT accent-subtle pill + accent-text (a
// non-colour-only cue, redundant with the accent glyph), so the active state
// reads without relying on hue alone.
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
import { Calendar, Home, MagnifyingGlass } from "../kit/glyphs";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";

export type { CompactSurface };

interface TabDef {
  id: CompactSurface;
  label: MessageDescriptor;
  Glyph: ComponentType<{ size?: number }>;
}

// Left-to-right order: the unified Home landing, the timeline scrubber, then search.
const TABS: readonly TabDef[] = [
  { id: "home", label: { key: "common:shell.navigation.home" }, Glyph: Home },
  { id: "timeline", label: { key: "timeline:labels.timeline" }, Glyph: Calendar },
  {
    id: "search",
    label: { key: "common:shell.navigation.search" },
    Glyph: MagnifyingGlass,
  },
];

export interface BottomTabBarProps {
  active: CompactSurface;
  onSelect: (surface: CompactSurface) => void;
}

export function BottomTabBar({ active, onSelect }: BottomTabBarProps) {
  const resolveMessage = useLocalizedMessageResolver();
  // The three surfaces rove through the one shared FocusZone (keyboard-navigation
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
      aria-label={
        resolveMessage({ key: "common:shell.accessibility.primaryNavigation" }).message
      }
      data-kit="bottom-tab-bar"
      // border-top + raised ground; safe-area inset keeps the row clear of the
      // home-indicator gesture zone (no px literal: rem floor max()'d with env()).
      className="flex shrink-0 items-stretch gap-fg-1 border-t border-rule bg-paper-raised px-fg-2 pt-fg-2 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
    >
      {TABS.map(({ id, label, Glyph }) => {
        const localizedLabel = resolveMessage(label).message;
        const isActive = id === active;
        const item = zone.rove(id);
        return (
          <button
            key={id}
            ref={item.ref}
            tabIndex={item.tabIndex}
            onKeyDown={item.onKeyDown}
            type="button"
            aria-label={localizedLabel}
            aria-current={isActive ? "page" : undefined}
            data-active={isActive}
            onClick={() => onSelect(id)}
            onFocus={() => setRovingTab(id)}
            // Icon-only (binding Figma BottomTabBar): the button is the ≥44pt tap
            // target (min-h-11) spanning its share of the bar; the active state is a
            // COMPACT centered pill hugging the glyph (not a full-width fill), so it
            // reads like the binding design. The label is the accessible name only.
            className="flex min-h-11 flex-1 items-center justify-center outline-none focus-visible:rounded-fg-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            <span
              className={`flex items-center justify-center rounded-fg-md px-fg-4 py-fg-1-5 transition-colors duration-ui-fast ease-settle ${
                isActive ? "bg-accent-subtle text-accent-text" : "text-ink-muted"
              }`}
            >
              <Glyph size={24} />
            </span>
          </button>
        );
      })}
    </nav>
  );
}
