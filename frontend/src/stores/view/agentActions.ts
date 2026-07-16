// Shared agent action builders. Each verb is authored once and composed across
// the surfaces where it is eligible: the command palette, the
// keymap (toggle-panel only), the footer chip (toggle-panel), and the in-panel
// controls (End conversation, New session), so the displayed verb, chord, and every
// surface fire ONE seam and cannot drift (actions-keymap-palette). It lives in
// stores/view because it depends only on stores + platform (no app import),
// mirroring the sibling `chromeActions` builders.
//
// Sessions are transient and never become standing palette commands.

import { useEffect } from "react";
import { Bot, Plus, Square } from "lucide-react";

import { type ActionDescriptor } from "../../platform/actions/action";
import { chordToKeycaps } from "../../platform/keymap/chord";
import {
  effectiveChord,
  getKeybinding,
  registerKeybindings,
  type KeybindingDef,
} from "../../platform/keymap/registry";
import { getKeymapOverrides, registerKeyAction } from "./keymapDispatcher";
import { queryClient } from "../server/queryClient";
import {
  agentClient,
  agentKeys,
  invalidateAgent,
  type RunStatus,
  type SessionSnapshot,
} from "../server/agent";
import { ensureActorToken } from "../server/authoring";
import {
  openAgentPanel,
  setAgentCurrentSession,
  toggleAgentPanel,
  useAgentPanel,
} from "./agentPanel";

export const AGENT_TOGGLE_PANEL_ACTION_ID = "agent:toggle-panel";
export const AGENT_STOP_RUN_ACTION_ID = "agent:stop-run";
export const AGENT_NEW_SESSION_ACTION_ID = "agent:new-session";

/** The registry-derived accelerator for an action id, or undefined when unbound
 *  (mirrors `chromeActions.acceleratorFor` — palette accelerators DERIVE from the
 *  one keymap registry, never hand-typed). */
function acceleratorFor(id: string): ActionDescriptor["accelerator"] {
  const def = getKeybinding(id);
  if (def === undefined) return undefined;
  const keycaps = chordToKeycaps(effectiveChord(def, getKeymapOverrides()));
  return keycaps.length > 0 ? keycaps : undefined;
}

function withAccelerator(action: ActionDescriptor): ActionDescriptor {
  const accelerator = acceleratorFor(action.id);
  return accelerator ? { ...action, accelerator } : action;
}

/** The run states that count as a live, stoppable run (bounded served enum). A
 *  settled run (completed/cancelled/failed) is not stoppable. */
const STOPPABLE_RUN_STATUS: Readonly<Record<RunStatus, boolean>> = {
  active: true,
  cancel_requested: false,
  cancelled: false,
  completed: false,
  failed: false,
};

/** The current session's active run when one is live and stoppable, else null.
 *  Read from the SESSION SNAPSHOT in the query cache (there is no run-status route
 *  on this plane); a pure read, never a mutation. */
function stoppableActiveRun(): SessionSnapshot["active_run"] {
  const sessionId = useAgentPanel.getState().currentSessionId;
  if (sessionId === null) return null;
  const snapshot = queryClient.getQueryData<SessionSnapshot>(
    agentKeys.session(sessionId),
  );
  const run = snapshot?.active_run ?? null;
  return run !== null && STOPPABLE_RUN_STATUS[run.status] ? run : null;
}

/** Whether a live run is stoppable right now — the eligibility gate the palette
 *  Stop command reads so it is offered only when it can act (never a disabled lie). */
export function hasStoppableAgentRun(): boolean {
  return stoppableActiveRun() !== null;
}

// --- imperative seams (fired by the descriptors + the in-panel controls) --------

/** Stop (cancel) the current session's active run. The ONE seam the composer's
 *  Stop button and the `Stop agent` command both fire — one verb, one seam. A
 *  no-op when nothing is stoppable, so a stray fire is harmless. */
export async function stopActiveAgentRun(): Promise<void> {
  const run = stoppableActiveRun();
  if (run === null) return;
  try {
    await agentClient.cancelRun(
      run.run_id,
      { reason: "operator_stop" },
      { actorToken: await ensureActorToken() },
    );
  } finally {
    invalidateAgent();
  }
}

/** Start a NEW agent conversation: clear the current-session pointer (a fresh,
 *  blank composer) and open the panel. The durable session is created by the
 *  composer on the first prompt (with a prompt-derived title) — an empty session
 *  with no messages is never persisted. Synchronous, no wire call, no title. */
export function startNewAgentSession(): void {
  setAgentCurrentSession(null);
  openAgentPanel();
}

// --- descriptor builders (one per verb, across eligible planes) -----------------

/** Open/close the docked Agent panel. The label reflects the resulting action so
 *  the current state reads from the verb (the `toggleGraphAction` precedent). */
export function agentTogglePanelAction(): ActionDescriptor {
  return withAccelerator({
    id: AGENT_TOGGLE_PANEL_ACTION_ID,
    label: {
      key: useAgentPanel.getState().open
        ? "common:agent.actions.closePanel"
        : "common:agent.actions.openPanel",
    },
    section: "navigate",
    icon: Bot,
    run: toggleAgentPanel,
  });
}

/** Stop the streaming agent run. No default chord (sparse); reached from Cmd+K
 *  and the in-panel Stop button, both firing the one `stopActiveAgentRun` seam. */
export function agentStopRunAction(): ActionDescriptor {
  return withAccelerator({
    id: AGENT_STOP_RUN_ACTION_ID,
    label: { key: "common:agent.actions.stopRun" },
    section: "danger",
    icon: Square,
    run: () => {
      void stopActiveAgentRun();
    },
  });
}

/** Start a new agent conversation. Reached from Cmd+K and the panel header's New
 *  session control, both firing the one `startNewAgentSession` seam. */
export function agentNewSessionAction(): ActionDescriptor {
  return withAccelerator({
    id: AGENT_NEW_SESSION_ACTION_ID,
    label: { key: "common:agent.actions.newSession" },
    section: "navigate",
    icon: Plus,
    run: startNewAgentSession,
  });
}

// --- keymap: the one default chord (toggle-panel) -------------------------------

/**
 * The agent keybindings: only `agent:toggle-panel` carries a default chord
 * (`Mod+Alt+A`); Stop and New session are palette + in-panel controls (sparse, no
 * chord). `Mod+Alt+A` is not in `platform/keymap/reservedChords.ts` (the only reserved
 * `Mod+Alt` entry is `Mod+Alt+D`, the macOS Dock toggle), and it is unused in-app
 * — the taken `Mod+Alt` letters are S/F (palette + document search), G (editor
 * diff), N (new document), W (editor close), O/P (project), none of them A, and it
 * is not among the vetted-out candidates B/K/E/C/M/H/D. It is `global` context and
 * rebindable through the engine `keybindings` override map like every other
 * command shortcut. The two guards (`reservedKeybindingDenylist` +
 * `defaultKeybindingConflicts`) cover it via `assembleDefaultKeybindings`.
 */
export function deriveAgentKeybindings(): KeybindingDef[] {
  return [
    {
      id: AGENT_TOGGLE_PANEL_ACTION_ID,
      defaultChord: "Mod+Alt+A",
      label: { key: "common:agent.actions.togglePanel" },
      group: { key: "common:shortcutGroups.window" },
      context: "global",
    },
  ];
}

/** Mount the agent-panel toggle chord (and its legend entry) for the app's
 *  lifetime, wiring the shared descriptor as its keymap action. */
export function useAgentKeybindings(): void {
  useEffect(() => {
    const disposeBindings = registerKeybindings(deriveAgentKeybindings());
    const disposeAction = registerKeyAction(AGENT_TOGGLE_PANEL_ACTION_ID, () =>
      agentTogglePanelAction(),
    );
    return () => {
      disposeAction();
      disposeBindings();
    };
  }, []);
}
