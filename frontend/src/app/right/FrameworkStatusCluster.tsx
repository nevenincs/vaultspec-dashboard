// The rail-footer framework status cluster (activity-rail-realignment ADR D2). A
// slim strip pinned to the activity rail's bottom edge — OUTSIDE the scroll region
// — with one chip per FOOTER control panel: Search service, Approvals, Vault
// health. Each chip shows only a served health tone (the standard status-dot
// vocabulary) plus at most one served count, and toggles its modal panel. Backend
// health is NOT a footer chip — its engine-status read unclearly, so it was pulled
// from the strip (user UX decision); the Cmd+K palette is its only surfacing path.
//
// Layer ownership (dashboard-layer-ownership / views-are-projections): this is a
// DUMB app-chrome view. Tones and counts come from ONE interpreted stores
// projection (`useFrameworkStatusView`) — it fetches nothing and never inspects
// the raw `tiers` block. Each chip dispatches the ONE shared ActionDescriptor per
// panel (`controlPanelToggleAction`), the same verb the command palette and the
// keymap fire — never a bespoke per-surface handler (actions-keymap-palette).
//
// Keyboard (keyboard-navigation): the footer chips are ONE FocusZone tab stop —
// Tab enters/leaves the cluster while Left/Right (Home/End) rove between chips
// (name-as-contract binding Figma frame FrameworkStatusCluster).

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useState } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import {
  FOOTER_CHIP_IDS,
  useOpenControlPanel,
  type ControlPanelId,
  type FooterChipId,
} from "../../stores/view/controlPanels";
import { CONTROL_PANEL_VOCABULARY } from "../../stores/view/controlPanelVocabulary";
import { controlPanelToggleAction } from "../../stores/view/chromeActions";
import {
  useFrameworkStatusView,
  type FrameworkStatusChip,
  type FrameworkStatusTone,
} from "../../stores/server/queries";
import { useFocusZone } from "../chrome/useFocusZone";
import { usePointerCoarse } from "../chrome/RowMenuDisclosure";

/** Tone -> the bound status-dot fill (the health triad; never raw hex). `unknown`
 *  is the pre-resolution muted state. */
const TONE_DOT_CLASS: Record<FrameworkStatusTone, string> = {
  ok: "bg-state-active",
  attention: "bg-state-stale",
  down: "bg-state-broken",
  unknown: "bg-ink-faint",
};

const TONE_MESSAGES: Readonly<Record<FrameworkStatusTone, MessageDescriptor>> = {
  ok: { key: "common:controlPanels.tones.workingNormally" },
  attention: { key: "common:controlPanels.tones.needsAttention" },
  down: { key: "common:controlPanels.tones.unavailable" },
  unknown: { key: "common:controlPanels.tones.checking" },
};

const GROUP_MESSAGE = { key: "common:controlPanels.accessibility.group" } as const;
const PANEL_STATUS_MESSAGE = {
  key: "common:controlPanels.accessibility.panelStatus",
} as const;

export interface StatusChipProps {
  id: ControlPanelId;
  chip: FrameworkStatusChip;
  /** Whether this chip's panel is the open one. */
  open: boolean;
  /** Toggle this chip's panel (the shared descriptor's run). */
  onToggle: () => void;
  /** FocusZone item ref registering the button in the roving order. */
  chipRef: (el: HTMLElement | null) => void;
  tabIndex: 0 | -1;
  onKeyDown: (event: ReactKeyboardEvent) => void;
  onFocus: () => void;
  /** On coarse pointers the chip grows to the 2.75rem touch-target floor; the slim
   *  strip is kept on fine (mouse) pointers. */
  coarse?: boolean;
}

/** One cluster chip: a tone dot, the plain-language plane label, and at most one
 *  served count. Pure presentation — the parent supplies the served chip, the
 *  open flag, and the shared toggle so the chip stays wire- and store-free. */
export function StatusChip({
  id,
  chip,
  open,
  onToggle,
  chipRef,
  tabIndex,
  onKeyDown,
  onFocus,
  coarse = false,
}: StatusChipProps) {
  const resolve = useLocalizedMessageResolver();
  const panel = resolve(CONTROL_PANEL_VOCABULARY[id].label);
  const status = resolve(TONE_MESSAGES[chip.tone]);
  const accessibleName = resolve({
    ...PANEL_STATUS_MESSAGE,
    values: { panel: panel.message, status: status.message },
  });

  if (panel.usedFallback || status.usedFallback || accessibleName.usedFallback) {
    return null;
  }

  return (
    <button
      type="button"
      ref={chipRef as (el: HTMLButtonElement | null) => void}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onClick={onToggle}
      aria-pressed={open}
      aria-label={accessibleName.message}
      data-framework-chip
      data-tone={chip.tone}
      className={`flex min-w-0 items-center gap-fg-1 rounded-fg-sm px-fg-1-5 py-fg-1 transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-pressed:bg-paper-sunken${
        coarse ? " min-h-[2.75rem]" : ""
      }`}
    >
      <span
        aria-hidden
        className={`size-fg-2 shrink-0 rounded-full ${TONE_DOT_CLASS[chip.tone]}`}
      />
      <span className="min-w-0 truncate text-meta font-medium text-ink-muted">
        {panel.message}
      </span>
      {chip.count !== undefined && (
        <span className="shrink-0 text-caption tabular-nums text-ink-faint">
          {chip.count}
        </span>
      )}
    </button>
  );
}

/**
 * The framework status cluster strip. Renders one chip per FOOTER control panel
 * from the served projection; the chips share one FocusZone tab stop with
 * horizontal roving. Mounted as a pinned footer beneath the activity rail scroll
 * region.
 */
export function FrameworkStatusCluster() {
  const view = useFrameworkStatusView();
  const resolve = useLocalizedMessageResolver();
  const group = resolve(GROUP_MESSAGE);
  // The panels are MODAL (single-open), so one selector yields the open id and
  // each chip's open flag is a value compare — no per-chip store hook in a loop.
  const openPanel = useOpenControlPanel();
  // On touch-first devices the chips grow to the 2.75rem tap floor (the compact
  // rail pins this same strip as its footer); mouse pointers keep the slim strip.
  const coarse = usePointerCoarse();
  const [active, setActive] = useState<string | null>(null);
  const zone = useFocusZone({
    orientation: "horizontal",
    wrap: false,
    activeKey: active,
    onActiveKeyChange: setActive,
  });
  if (group.usedFallback) return null;

  return (
    <div
      role="group"
      aria-label={group.message}
      data-framework-status-cluster
      className="flex shrink-0 items-center justify-between gap-fg-1 border-t border-rule bg-paper-raised px-fg-2 py-fg-1-5"
    >
      {FOOTER_CHIP_IDS.map((id: FooterChipId) => {
        const item = zone.rove(id);
        // The ONE shared toggle descriptor for this panel — composed here exactly
        // as the command palette and keymap compose it, so the chip cannot drift.
        const action = controlPanelToggleAction(id, openPanel);
        if (action.run === undefined) return null;
        return (
          <StatusChip
            key={id}
            id={id}
            chip={view[id]}
            open={openPanel === id}
            onToggle={action.run}
            chipRef={item.ref}
            tabIndex={item.tabIndex}
            onKeyDown={item.onKeyDown}
            onFocus={() => setActive(id)}
            coarse={coarse}
          />
        );
      })}
    </div>
  );
}
