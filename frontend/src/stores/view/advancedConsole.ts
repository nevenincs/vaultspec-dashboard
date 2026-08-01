// Shared expansion state for the Settings ▸ Advanced consoles
// (advanced-service-console ADR D1). Advanced is the ONE home for every
// operational surface: the index console (the indexing tool's own face), the
// system-status block, the project-health block, and the agent lifecycle
// console. The retired modal `ControlPanels` host and its rail-footer status
// chips are gone — nothing opens an operational panel outside this section any
// more (ADR D2, no legacy alias).
//
// The consoles are an ACCORDION: at most one is expanded, so the open state is
// one nullable id rather than four flags. Expansion is also the MOUNT GATE — a
// collapsed console renders nothing, so its heavy reads (the jobs/log/ops-state
// polls, the agent lifecycle status) never run for someone who just opened
// Settings (data-loading-activity: a heavy data hook lives only under the tree
// that renders its data). Non-persisted, like the settings dialog itself.

import { create } from "zustand";

import type { MessageDescriptor } from "../../platform/localization/message";
import { openSettingsDialog } from "./settingsDialog";

/** The four consoles hosted by the Advanced section (ADR D4/D5/D6). */
export type AdvancedConsoleId = "index" | "system" | "project" | "agent";

/** Every console id, in rendered order. */
export const ADVANCED_CONSOLE_IDS: readonly AdvancedConsoleId[] = [
  "index",
  "system",
  "project",
  "agent",
];

/** The console whose deep link the palette command runs — the one the owner's
 *  notes single out as the operational face worth one keystroke. */
export const PRIMARY_ADVANCED_CONSOLE: AdvancedConsoleId = "index";

/** The plain-language name of each console, resolved at the render boundary. The
 *  index console names itself from this catalog label alone: the served component
 *  handshake carries the backend package identifier, which the labels law keeps
 *  off screen (ADR D4 as amended — never "Search", and never the package name). */
export const ADVANCED_CONSOLE_LABELS: Readonly<
  Record<AdvancedConsoleId, MessageDescriptor>
> = Object.freeze({
  index: Object.freeze({ key: "operations:searchMaintenance.identity.title" }),
  system: Object.freeze({ key: "common:advanced.labels.systemStatus" }),
  project: Object.freeze({ key: "common:advanced.labels.projectHealth" }),
  agent: Object.freeze({ key: "common:advanced.labels.agentService" }),
} as const);

/** Validate unknown input at the boundary (a palette id, a persisted blob). */
export function normalizeAdvancedConsoleId(value: unknown): AdvancedConsoleId | null {
  return typeof value === "string" &&
    (ADVANCED_CONSOLE_IDS as readonly string[]).includes(value)
    ? (value as AdvancedConsoleId)
    : null;
}

interface AdvancedConsoleState {
  /** The single expanded console, or `null` when every console is collapsed. */
  expanded: AdvancedConsoleId | null;
  expand: (id: unknown) => void;
  collapse: () => void;
  toggle: (id: unknown) => void;
}

export const useAdvancedConsole = create<AdvancedConsoleState>((set) => ({
  expanded: null,
  expand: (id) =>
    set((state) => {
      const normalized = normalizeAdvancedConsoleId(id);
      return normalized === null || state.expanded === normalized
        ? state
        : { expanded: normalized };
    }),
  collapse: () =>
    set((state) => (state.expanded === null ? state : { expanded: null })),
  toggle: (id) =>
    set((state) => {
      const normalized = normalizeAdvancedConsoleId(id);
      if (normalized === null) return state;
      return { expanded: state.expanded === normalized ? null : normalized };
    }),
}));

/** The currently expanded console id, or `null` when all are collapsed. */
export function useExpandedAdvancedConsole(): AdvancedConsoleId | null {
  return useAdvancedConsole((state) => state.expanded);
}

export function expandAdvancedConsole(id: unknown): void {
  useAdvancedConsole.getState().expand(id);
}

export function collapseAdvancedConsoles(): void {
  useAdvancedConsole.getState().collapse();
}

export function toggleAdvancedConsole(id: unknown): void {
  useAdvancedConsole.getState().toggle(id);
}

/** The one access path the palette command runs (ADR D7): open Settings with the
 *  primary console already expanded. Settings itself opens from existing chrome;
 *  this is the deep link to the console within it. */
export function openAdvancedSettings(): void {
  openSettingsDialog();
  expandAdvancedConsole(PRIMARY_ADVANCED_CONSOLE);
}
