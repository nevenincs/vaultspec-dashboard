// The panel's ONLY idle-state trace: it lives in the `FrameworkStatusCluster`
// footer grammar (a tone dot + label), renders NOTHING when no session is current
// or no run is streaming, and while a run streams (with the panel collapsed) shows
// a `status/active` dot + "Agent working" + the served run state. It is ONE roving
// tab stop in the cluster's FocusZone (props supplied by the parent) and fires the
// shared `agent:toggle-panel` descriptor.
//
// Layer ownership: a DUMB app-chrome view. `useAgentChipView` reads run STATE from
// the session snapshot (`stores/server/agent` — there is no run-status route) and
// maps the served `RunStatus` token to a plain label exactly like `EditorStatus`;
// it never client-derives status. The parent gates the render (and the rove) on
// the view being non-null, so a hidden chip never registers a phantom tab stop.

import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import { useSession, type RunStatus } from "../../stores/server/agent";
import {
  useAgentCurrentSessionId,
  useAgentPanelOpen,
} from "../../stores/view/agentPanel";

/** The streaming run states — the only ones that surface the chip. A settled run
 *  (completed/cancelled/failed) shows nothing (the work is done). */
const STREAMING_STATUS: Readonly<Record<RunStatus, boolean>> = {
  active: true,
  cancel_requested: true,
  cancelled: false,
  completed: false,
  failed: false,
};

/** Served run token -> plain label (mapped like `EditorStatus`, never derived). */
const RUN_STATE_MESSAGE: Readonly<Partial<Record<RunStatus, MessageDescriptor>>> = {
  active: { key: "common:agent.chip.status.active" },
  cancel_requested: { key: "common:agent.chip.status.cancelRequested" },
};

/** The presentation model of the collapsed-agent chip, or `null` when it must not
 *  render (no current session, no streaming run, or the panel is already open). */
export interface AgentChipView {
  runStatus: RunStatus;
  workingLabel: string;
  stateLabel: string | null;
  accessibleName: string;
}

/** Resolve the chip's presentation, or `null` when it is hidden. The parent calls
 *  this once and gates BOTH the render and the FocusZone rove on the result, so a
 *  hidden chip never becomes a phantom roving item. */
export function useAgentChipView(): AgentChipView | null {
  const resolve = useLocalizedMessageResolver();
  const currentSessionId = useAgentCurrentSessionId();
  const open = useAgentPanelOpen();
  const session = useSession(currentSessionId);

  const run = session.data?.active_run ?? null;
  const streaming = run !== null && STREAMING_STATUS[run.status];
  if (currentSessionId === null || open || !streaming || run === null) return null;

  const working = resolve({ key: "common:agent.chip.working" });
  const stateDescriptor = RUN_STATE_MESSAGE[run.status];
  const state = stateDescriptor ? resolve(stateDescriptor) : null;
  const accessibleName = resolve({
    key: "common:agent.chip.label",
    values: { state: state?.message ?? working.message },
  });
  if (working.usedFallback || accessibleName.usedFallback) return null;

  return {
    runStatus: run.status,
    workingLabel: working.message,
    stateLabel: state && !state.usedFallback ? state.message : null,
    accessibleName: accessibleName.message,
  };
}

export interface AgentChipProps {
  view: AgentChipView;
  /** Fire the shared `agent:toggle-panel` verb (opens the panel — the chip only
   *  shows while collapsed). */
  onToggle: () => void;
  /** FocusZone item ref registering the chip in the roving order. */
  chipRef: (el: HTMLElement | null) => void;
  tabIndex: 0 | -1;
  onKeyDown: (event: ReactKeyboardEvent) => void;
  onFocus: () => void;
}

/** The chip button — pure presentation. The parent supplies the resolved view and
 *  the roving props; the chip owns no store or wire read. */
export function AgentChip({
  view,
  onToggle,
  chipRef,
  tabIndex,
  onKeyDown,
  onFocus,
}: AgentChipProps) {
  return (
    <button
      type="button"
      ref={chipRef as (el: HTMLButtonElement | null) => void}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onClick={onToggle}
      aria-label={view.accessibleName}
      data-agent-chip
      data-run-status={view.runStatus}
      className="flex min-w-0 items-center gap-fg-1 rounded-fg-sm px-fg-1-5 py-fg-1 transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
    >
      <span aria-hidden className="size-fg-2 shrink-0 rounded-full bg-state-active" />
      <span className="min-w-0 truncate text-meta font-medium text-ink-muted">
        {view.workingLabel}
      </span>
      {view.stateLabel !== null && (
        <span className="shrink-0 text-caption text-ink-faint">{view.stateLabel}</span>
      )}
    </button>
  );
}
