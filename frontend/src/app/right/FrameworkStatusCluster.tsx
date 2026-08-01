// The rail-footer cluster (activity-rail-realignment ADR D2, narrowed by
// advanced-service-console ADR D2/D3). A slim strip pinned to the activity rail's
// bottom edge — OUTSIDE the scroll region.
//
// It used to carry one chip per FRAMEWORK STATUS surface (Search service, Vault
// health) beside the pending-changes chip. Those were dev status bleeding into
// the user chrome: every operational console now lives behind Settings ▸
// Advanced, and nothing in the product chrome opens one. What SURVIVES here is
// the pending-changes affordance — a served count plus an open-review intent —
// because the review queue feeds the authoring workflow rather than reporting on
// a tool's health (ADR D3; its final form belongs to the in-flight agent-panel
// campaign).
//
// Layer ownership (dashboard-layer-ownership / views-are-projections): this is a
// DUMB app-chrome view. The tone and count come from ONE interpreted stores
// projection (`useApprovalsStatusView`) — it fetches nothing and never inspects
// the raw `tiers` block. The chip dispatches the ONE shared ActionDescriptor
// (`agentPendingChangesAction`), the same verb the command palette and the keymap
// fire — never a bespoke per-surface handler (actions-keymap-palette).
//
// Keyboard (keyboard-navigation): the footer chips are ONE FocusZone tab stop —
// Tab enters/leaves the cluster while Left/Right (Home/End) rove between chips
// (name-as-contract binding Figma frame FrameworkStatusCluster).

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useState } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import {
  useAgentPanelOpen,
  useAgentPendingChangesOpen,
} from "../../stores/view/agentPanel";
import { agentPendingChangesAction } from "../../stores/view/chromeActions";
import {
  useApprovalsStatusView,
  type FrameworkStatusChip,
  type FrameworkStatusTone,
} from "../../stores/server/queries";
import { useFocusZone } from "../chrome/useFocusZone";
import { usePointerCoarse } from "../chrome/RowMenuDisclosure";
import { AgentChip, useAgentChipView } from "../agent/AgentChip";
import { agentTogglePanelAction } from "../../stores/view/agentActions";

/** Tone -> the bound status-dot fill (the health triad; never raw hex). `unknown`
 *  is the pre-resolution muted state. */
const TONE_DOT_CLASS: Record<FrameworkStatusTone, string> = {
  ok: "bg-state-active",
  attention: "bg-state-stale",
  down: "bg-state-broken",
  unknown: "bg-ink-faint",
};

const TONE_MESSAGES: Readonly<Record<FrameworkStatusTone, MessageDescriptor>> = {
  ok: { key: "common:advanced.tones.workingNormally" },
  attention: { key: "common:advanced.tones.needsAttention" },
  down: { key: "common:advanced.tones.unavailable" },
  unknown: { key: "common:advanced.tones.checking" },
};

const GROUP_MESSAGE = { key: "common:advanced.accessibility.group" } as const;
const PANEL_STATUS_MESSAGE = {
  key: "common:advanced.accessibility.panelStatus",
} as const;
const PENDING_LABEL_MESSAGE = { key: "common:agent.pending.label" } as const;

export interface StatusChipProps {
  /** The surface's plain-language name, resolved through the catalog here so the
   *  chip stays a single self-contained presentation unit. */
  label: MessageDescriptor;
  chip: FrameworkStatusChip;
  /** Whether this chip's surface is the open one (for the pending chip, the Agent
   *  panel with its pending-changes region expanded). */
  open: boolean;
  /** Activate this chip's surface (the shared descriptor's run). */
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
  label,
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
  const panel = resolve(label);
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
 * The rail-footer cluster strip: the pending-changes affordance and — while a run
 * streams with the panel collapsed — the agent chip. The two share one FocusZone
 * tab stop with horizontal roving. Mounted as a pinned footer beneath the
 * activity rail scroll region.
 */
export function FrameworkStatusCluster() {
  const pending = useApprovalsStatusView();
  const resolve = useLocalizedMessageResolver();
  const group = resolve(GROUP_MESSAGE);
  // The pending chip's pressed state tracks the Agent panel's expanded
  // pending-changes region (agent-panel D9 — a disclosure inside the one
  // conversation view, not a view), so read the slot + region flags once.
  const agentOpen = useAgentPanelOpen();
  const pendingOpen = useAgentPendingChangesOpen();
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
  // The collapsed-agent chip's presentation, or null when it must not render. The
  // hook is called unconditionally (rules-of-hooks); the render + the rove are
  // gated on its result so a hidden chip never registers a phantom roving item.
  const chipView = useAgentChipView();
  // The ONE shared descriptor, composed here exactly as the command palette
  // composes it, so the chip cannot drift.
  const pendingAction = agentPendingChangesAction();
  const pendingItem = zone.rove("pending");
  if (group.usedFallback) return null;

  return (
    <div
      role="group"
      aria-label={group.message}
      data-framework-status-cluster
      className="flex shrink-0 items-center justify-between gap-fg-1 border-t border-rule bg-paper-raised px-fg-2 py-fg-1-5"
    >
      {pendingAction.run !== undefined && (
        <StatusChip
          label={PENDING_LABEL_MESSAGE}
          chip={pending}
          open={agentOpen && pendingOpen}
          onToggle={pendingAction.run}
          chipRef={pendingItem.ref}
          tabIndex={pendingItem.tabIndex}
          onKeyDown={pendingItem.onKeyDown}
          onFocus={() => setActive("pending")}
          coarse={coarse}
        />
      )}
      {/* The collapsed-agent chip (agentic-authoring-ux ADR D1/D8): renders only
          while a run streams with the panel collapsed, so it is absent from the
          cluster most of the time. When present it is ONE more roving tab stop
          (`zone.rove("agent")`, called after the pending chip so it sits last) and
          fires the SHARED `agent:toggle-panel` descriptor — not a bespoke handler. */}
      {chipView !== null &&
        (() => {
          const item = zone.rove("agent");
          return (
            <AgentChip
              view={chipView}
              onToggle={() => agentTogglePanelAction().run?.()}
              chipRef={item.ref}
              tabIndex={item.tabIndex}
              onKeyDown={item.onKeyDown}
              onFocus={() => setActive("agent")}
            />
          );
        })()}
    </div>
  );
}
