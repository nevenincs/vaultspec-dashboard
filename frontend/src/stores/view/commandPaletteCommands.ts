import { useMemo } from "react";

import {
  normalizeActionDescriptor,
  type ActionDescriptorBase,
} from "../../platform/actions/action";
import { useCommandPaletteLensIntent } from "../server/commandPaletteLensIntent";
import { featureNodeIdFromTag } from "../server/liveAdapters";
import { OPS_WHITELIST } from "../server/opsActions";
import { useBrowserMode } from "./browserMode";
import {
  browserTreeExpansionKey,
  useBrowserTreeExpansionStore,
} from "./browserTreeExpansion";
import {
  LEFT_RAIL_COLLAPSE_TREE_ACTION_ID,
  LEFT_RAIL_COLLAPSE_TREE_LABEL,
  browseModeAction,
  newDocumentAction,
} from "./leftRailKeybindings";
import {
  useActiveScope,
  useDashboardFilterChoicesView,
  useDashboardTimelineModeView,
  useFiltersVocabularyView,
} from "../server/queries";
import { openKeyboardShortcuts } from "./keyboardShortcuts";
import { getLensChoices, saveCurrentLens, useLenses } from "./lenses";
import { useCommandPaletteOpsRunMutation } from "./opsRun";
import { useDashboardNodeSelection } from "./selection";
import { openSettingsDialog } from "./settingsDialog";
import {
  RIGHT_RAIL_TABS,
  type RailTabId,
  useShellFrameView,
  useShellWindowActions,
} from "./shellLayout";
import {
  normalizeCommandPaletteQuery,
  useCommandPaletteOpsFeedbackBoundary,
} from "./commandPalette";

/** The command families, ordered as they group in the list. */
export type CommandFamily = "navigate" | "filters" | "window" | "core" | "rag" | "app";

// A palette command IS a shared `ActionDescriptor` (dashboard-context-menus ADR
// layer 1) plus the palette-specific `family` grouping. Consuming the shared
// descriptor is what keeps the palette and the context menu from drifting; the
// palette requires `run` and groups by `family`.
export interface PaletteCommand extends ActionDescriptorBase {
  family: CommandFamily;
  run: () => void;
  dispatch?: never;
}

/** Human-facing group heading per family (object-then-action taxonomy). */
export const FAMILY_LABEL: Record<CommandFamily, string> = {
  navigate: "navigate",
  filters: "filters",
  window: "window",
  core: "core ops",
  rag: "rag ops",
  app: "app",
};

const COMMAND_FAMILIES = new Set<CommandFamily>([
  "navigate",
  "filters",
  "window",
  "core",
  "rag",
  "app",
]);

export const COMMAND_PALETTE_SOURCE_ITEMS_CAP = 128;
export const COMMAND_PALETTE_SOURCE_ITEM_MAX_CHARS = 256;

function isCommandPaletteRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function normalizeCommandFamily(value: unknown): CommandFamily | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return COMMAND_FAMILIES.has(normalized as CommandFamily)
    ? (normalized as CommandFamily)
    : null;
}

export function normalizePaletteCommand(command: unknown): PaletteCommand | null {
  if (!isCommandPaletteRecord(command)) return null;
  const family = normalizeCommandFamily(command.family);
  if (family === null) return null;
  const action = normalizeActionDescriptor(command);
  if (action === null || typeof action.run !== "function") return null;
  return { ...action, family };
}

function normalizedPaletteCommands(commands: readonly unknown[]): PaletteCommand[] {
  return commands
    .map((command) => normalizePaletteCommand(command))
    .filter((command): command is PaletteCommand => command !== null);
}

export function normalizeCommandPaletteSourceItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (
      normalized.length === 0 ||
      normalized.length > COMMAND_PALETTE_SOURCE_ITEM_MAX_CHARS ||
      seen.has(normalized)
    ) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= COMMAND_PALETTE_SOURCE_ITEMS_CAP) break;
  }
  return out;
}

export interface PaletteSources {
  featureTags: unknown;
  lensNames: unknown;
  query: unknown;
  canSaveLens?: boolean;
  applyLens: (name: string) => void;
  saveLens: (name: string) => void;
  runOp: (target: "core" | "rag", verb: string) => void;
  navigate: (nodeId: string) => void;
  openSettings: () => void;
}

export function buildCommands(sources: PaletteSources): PaletteCommand[] {
  const commands: unknown[] = [];
  const normalizedQuery = normalizeCommandPaletteQuery(sources.query);
  const featureTags = normalizeCommandPaletteSourceItems(sources.featureTags);
  const lensNames = normalizeCommandPaletteSourceItems(sources.lensNames);
  for (const feature of featureTags) {
    commands.push({
      id: `nav:${feature}`,
      label: `go to ${feature}`,
      family: "navigate",
      run: () => sources.navigate(featureNodeIdFromTag(feature)),
    });
  }
  for (const name of lensNames) {
    commands.push({
      id: `lens:${name}`,
      label: `lens: ${name}`,
      family: "filters",
      run: () => sources.applyLens(name),
    });
  }
  for (const { target, verb, label } of OPS_WHITELIST) {
    commands.push({
      id: `ops:${target}:${verb}`,
      label: `ops: ${label}`,
      family: target,
      confirm: true,
      disabledInTimeTravel: true,
      run: () => sources.runOp(target, verb),
    });
  }
  commands.push({
    id: "app:settings",
    label: "open settings",
    family: "app",
    run: () => sources.openSettings(),
  });
  if (normalizedQuery.length > 0 && sources.canSaveLens !== false) {
    commands.push({
      id: `save-lens:${normalizedQuery}`,
      label: `save current filters as lens "${normalizedQuery}"`,
      family: "filters",
      run: () => sources.saveLens(normalizedQuery),
    });
  }
  return normalizedPaletteCommands(commands);
}

/**
 * The window-management command sources: the current shell-layout truth (so each
 * toggle command can name its inverse — "hide" vs "show") plus the intent
 * callbacks that mutate it. These ride the same `ActionDescriptor` plane as every
 * other palette command, so cmd+K is the single surface that exposes every
 * window-management action (toggle, collapse, hide, switch tab, reset) — not the
 * top-left flyout alone.
 */
export interface WindowCommandSources {
  leftRailVisible: boolean;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  timelineVisible: boolean;
  toggleLeftRail: () => void;
  toggleLeftCollapsed: () => void;
  toggleRightRail: () => void;
  toggleTimeline: () => void;
  setRightTab: (tab: unknown) => void;
  resetLayout: () => void;
  showKeyboardShortcuts: () => void;
}

export function normalizeCommandPaletteRightRailTab(tab: unknown): RailTabId | null {
  if (typeof tab !== "string") return null;
  const normalized = tab.trim();
  return RIGHT_RAIL_TABS.find((candidate) => candidate.id === normalized)?.id ?? null;
}

export function commandPaletteRightRailCommandId(tab: unknown): string | null {
  const normalizedTab = normalizeCommandPaletteRightRailTab(tab);
  return normalizedTab === null ? null : `window:rail-${normalizedTab}`;
}

export function buildWindowCommands(w: WindowCommandSources): PaletteCommand[] {
  const commands: unknown[] = [
    {
      id: "window:left-rail",
      label: w.leftRailVisible ? "hide left rail" : "show left rail",
      family: "window",
      run: w.toggleLeftRail,
    },
  ];
  // Collapse only applies while the left rail is mounted (mirrors the flyout's
  // `showLeftCollapseControl` gate).
  if (w.leftRailVisible) {
    commands.push({
      id: "window:left-collapse",
      label: w.leftCollapsed ? "expand left rail" : "collapse left rail",
      family: "window",
      run: w.toggleLeftCollapsed,
    });
  }
  commands.push(
    {
      id: "window:right-rail",
      label: w.rightCollapsed ? "show right rail" : "hide right rail",
      family: "window",
      run: w.toggleRightRail,
    },
    {
      id: "window:timeline",
      label: w.timelineVisible ? "hide timeline" : "show timeline",
      family: "window",
      run: w.toggleTimeline,
    },
    ...RIGHT_RAIL_TABS.flatMap(({ id, label }) => {
      const commandId = commandPaletteRightRailCommandId(id);
      const tab = normalizeCommandPaletteRightRailTab(id);
      return commandId === null || tab === null
        ? []
        : [
            {
              id: commandId,
              label: `activity rail: ${label.toLowerCase()}`,
              family: "window" as const,
              run: () => w.setRightTab(tab),
            },
          ];
    }),
    {
      id: "window:reset-layout",
      label: "reset layout",
      family: "window",
      run: w.resetLayout,
    },
    {
      id: "window:keyboard-shortcuts",
      label: "keyboard shortcuts",
      family: "window",
      run: w.showKeyboardShortcuts,
    },
  );
  return normalizedPaletteCommands(commands);
}

/**
 * The left-rail commands on the palette: New document, the two direct browse-mode
 * sets, and Collapse vault tree. They reuse the SAME shared `ActionDescriptor`
 * builders the keymap and context menus use (the unified action plane), so cmd+K
 * exposes the rail's create/navigate verbs without re-authoring them. Expand-all
 * is deliberately absent — it needs the loaded tree key set, so it lives as a tree
 * control + chord where that data is in hand.
 */
export function buildLeftRailCommands(collapseTree: () => void): PaletteCommand[] {
  const commands: unknown[] = [
    { ...newDocumentAction(), family: "app" },
    { ...browseModeAction("vault"), family: "navigate" },
    { ...browseModeAction("code"), family: "navigate" },
    {
      id: LEFT_RAIL_COLLAPSE_TREE_ACTION_ID,
      label: LEFT_RAIL_COLLAPSE_TREE_LABEL,
      family: "navigate",
      run: collapseTree,
    },
  ];
  return normalizedPaletteCommands(commands);
}

export function gateCommandsForTimeTravel(
  commands: readonly PaletteCommand[],
  timeTravel: boolean,
): PaletteCommand[] {
  if (!timeTravel) return [...commands];
  return commands.filter((command) => command.disabledInTimeTravel !== true);
}

export function filterCommands(
  commands: readonly PaletteCommand[],
  query: unknown,
): PaletteCommand[] {
  const needle = normalizeCommandPaletteQuery(query).toLowerCase();
  if (!needle) return [...commands];
  const tokens = needle.split(/\s+/).filter(Boolean);
  return commands.filter((command) => {
    const label = command.label.toLowerCase();
    return tokens.every((token) => label.includes(token));
  });
}

const FAMILY_ORDER: CommandFamily[] = [
  "navigate",
  "filters",
  "window",
  "core",
  "rag",
  "app",
];

export function groupByFamily(
  commands: readonly PaletteCommand[],
): { family: CommandFamily; commands: PaletteCommand[] }[] {
  return FAMILY_ORDER.map((family) => ({
    family,
    commands: commands.filter((command) => command.family === family),
  })).filter((group) => group.commands.length > 0);
}

export interface CommandPaletteCommandView {
  groups: { family: CommandFamily; commands: PaletteCommand[] }[];
  ordered: PaletteCommand[];
  matchedResults: PaletteCommand[];
  noMatch: boolean;
  navLoading: boolean;
}

export interface CommandPaletteRowView {
  command: PaletteCommand;
  id: string;
  optionDomIdPart: string;
  index: number;
  label: string;
  rowClassName: string;
  labelClassName: string | undefined;
  selected: boolean;
  armed: boolean;
  confirmShortcutLabel: string | null;
  selectionHintVisible: boolean;
}

export interface CommandPaletteRowGroupView {
  family: CommandFamily;
  label: string;
  rows: CommandPaletteRowView[];
}

export interface CommandPalettePresentationView {
  safeCursor: number;
  activeCommand: PaletteCommand | undefined;
  rowGroups: CommandPaletteRowGroupView[];
  noMatch: boolean;
  navLoading: boolean;
  noMatchMessage: string;
  navLoadingMessage: string;
  inputPlaceholder: string;
  dialogLabel: string;
  listboxLabel: string;
  liveMessage: string;
  activeOptionDomIdPart: string | null;
  footerHints: {
    navigate: string;
    open: string;
    close: string;
  };
}

export type CommandPaletteActivationView =
  | { kind: "ignore" }
  | { kind: "arm"; cursor: number; commandId: string }
  | { kind: "run"; cursor: number; command: PaletteCommand; closeAfterRun: boolean };

export type CommandPaletteKeyboardIntent =
  | { kind: "move-cursor"; delta: 1 | -1 }
  | { kind: "run-active" };

export interface CommandPaletteArmedRepair {
  clearArmedCommandId: boolean;
  disarm: boolean;
}

export function commandPaletteRowLabel(
  command: PaletteCommand,
  armed: boolean,
): string {
  return armed ? `confirm ${command.label}?` : command.label;
}

export function commandPaletteOptionDomIdPart(commandId: string): string {
  return encodeURIComponent(commandId);
}

export function commandPaletteSafeCursor(length: number, cursor: number): number {
  return length === 0 ? -1 : Math.min(Math.max(0, cursor), length - 1);
}

export function commandPaletteMovedCursor(
  length: number,
  cursor: number,
  delta: 1 | -1,
): number {
  if (length === 0) return -1;
  return commandPaletteSafeCursor(length, cursor + delta);
}

export function deriveCommandPaletteKeyboardIntent(
  key: unknown,
): CommandPaletteKeyboardIntent | null {
  if (key === "ArrowDown") return { kind: "move-cursor", delta: 1 };
  if (key === "ArrowUp") return { kind: "move-cursor", delta: -1 };
  if (key === "Enter") return { kind: "run-active" };
  return null;
}

export function deriveCommandPaletteActivation(
  ordered: readonly PaletteCommand[],
  index: number,
  state: {
    confirmArmed: boolean;
    armedCommandId: string | null;
  },
): CommandPaletteActivationView {
  const cursor = commandPaletteSafeCursor(ordered.length, index);
  if (cursor < 0) return { kind: "ignore" };
  const command = ordered[cursor];
  if (!command || command.disabled === true) return { kind: "ignore" };
  if (command.confirm && (!state.confirmArmed || state.armedCommandId !== command.id)) {
    return { kind: "arm", cursor, commandId: command.id };
  }
  return {
    kind: "run",
    cursor,
    command,
    closeAfterRun: command.confirm !== true,
  };
}

export function deriveCommandPaletteArmedRepair(
  activeCommand: PaletteCommand | undefined,
  state: {
    confirmArmed: boolean;
    armedCommandId: string | null;
  },
): CommandPaletteArmedRepair {
  if (!state.confirmArmed) {
    return { clearArmedCommandId: state.armedCommandId !== null, disarm: false };
  }
  if (state.armedCommandId === null) {
    return { clearArmedCommandId: false, disarm: false };
  }
  return {
    clearArmedCommandId: false,
    disarm:
      activeCommand?.id !== state.armedCommandId || activeCommand.confirm !== true,
  };
}

export function deriveCommandPalettePresentationView(
  commandView: Pick<
    CommandPaletteCommandView,
    "groups" | "ordered" | "matchedResults" | "noMatch" | "navLoading"
  >,
  state: {
    cursor: number;
    confirmArmed: boolean;
    armedCommandId: string | null;
  },
): CommandPalettePresentationView {
  const safeCursor = commandPaletteSafeCursor(commandView.ordered.length, state.cursor);
  const activeCommand = safeCursor >= 0 ? commandView.ordered[safeCursor] : undefined;
  const rows = commandView.ordered.map((command, index): CommandPaletteRowView => {
    const armed = state.confirmArmed && state.armedCommandId === command.id;
    const selected = index === safeCursor;
    const confirmShortcutLabel = command.confirm ? "⏎ ⏎" : null;
    return {
      command,
      id: command.id,
      optionDomIdPart: commandPaletteOptionDomIdPart(command.id),
      index,
      label: commandPaletteRowLabel(command, armed),
      rowClassName: `flex h-[30px] w-full items-center justify-between rounded-fg-md px-fg-4 text-left transition-colors duration-ui-fast ease-settle ${
        selected
          ? "bg-accent-subtle text-ink"
          : "text-ink-muted hover:bg-paper-sunken hover:text-ink"
      }`,
      labelClassName: armed ? "text-state-stale" : undefined,
      selected,
      armed,
      confirmShortcutLabel,
      selectionHintVisible: selected && confirmShortcutLabel === null,
    };
  });
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const activeRow = safeCursor >= 0 ? rows[safeCursor] : undefined;
  const rowGroups = commandView.groups.map((group) => ({
    family: group.family,
    label: FAMILY_LABEL[group.family],
    rows: group.commands
      .map((command) => rowsById.get(command.id))
      .filter((row): row is CommandPaletteRowView => row !== undefined),
  }));
  const resultCountLabel = `${commandView.matchedResults.length} command${
    commandView.matchedResults.length === 1 ? "" : "s"
  }`;

  let liveMessage = resultCountLabel;
  if (commandView.noMatch) {
    const saveLens = commandView.ordered.find((command) =>
      command.id.startsWith("save-lens:"),
    );
    liveMessage = saveLens ? `no matches — ${saveLens.label}` : "nothing matches";
  } else if (
    activeCommand &&
    state.confirmArmed &&
    state.armedCommandId === activeCommand.id
  ) {
    liveMessage = `${resultCountLabel}. ${commandPaletteRowLabel(activeCommand, true)}`;
  } else if (activeCommand) {
    liveMessage = `${resultCountLabel}. ${activeCommand.label}`;
  }

  return {
    safeCursor,
    activeCommand,
    rowGroups,
    noMatch: commandView.noMatch,
    navLoading: commandView.navLoading,
    noMatchMessage: "nothing matches",
    navLoadingMessage: "loading navigation…",
    inputPlaceholder: "type a command, feature, or lens…",
    dialogLabel: "command palette",
    listboxLabel: "commands",
    liveMessage,
    activeOptionDomIdPart: activeRow?.optionDomIdPart ?? null,
    footerHints: {
      navigate: "navigate",
      open: "open",
      close: "close",
    },
  };
}

/**
 * Stores-owned command-palette read model. The command-palette store owns input,
 * cursor, and confirmation-row state; this selector owns command assembly from
 * dashboard/lens/ops state, time-travel gating, grouping, and search projection.
 */
export function useCommandPaletteCommandView(
  query: unknown,
): CommandPaletteCommandView {
  const scope = useActiveScope();
  const browserMode = useBrowserMode();
  const normalizedQuery = normalizeCommandPaletteQuery(query);
  const vocabulary = useFiltersVocabularyView(scope);
  const dashboardFilterChoices = useDashboardFilterChoicesView(scope);
  const timeline = useDashboardTimelineModeView(scope);
  const lensIntent = useCommandPaletteLensIntent(scope);
  const selectNode = useDashboardNodeSelection(scope);
  const lenses = useLenses();
  const runPaletteOp = useCommandPaletteOpsRunMutation();
  const shellFrame = useShellFrameView(scope);
  const shellActions = useShellWindowActions(scope, shellFrame);
  const timeTravel = timeline.opsDisabled;
  useCommandPaletteOpsFeedbackBoundary(scope, timeTravel);

  const commands = useMemo(() => {
    const baseCommands = buildCommands({
      featureTags: vocabulary.featureTags,
      lensNames: lenses.map((lens) => lens.name),
      query: normalizedQuery,
      canSaveLens: dashboardFilterChoices.loaded,
      applyLens: (name) => {
        const choices = getLensChoices(name);
        if (!choices) return;
        void lensIntent.applyLensChoices(choices).catch(() => undefined);
      },
      saveLens: (name) => {
        if (!dashboardFilterChoices.loaded) return;
        saveCurrentLens(name, dashboardFilterChoices.choices);
      },
      runOp: (target, verb) => {
        runPaletteOp.mutate({ target, verb });
      },
      navigate: (nodeId) => {
        void selectNode(nodeId).catch(() => undefined);
      },
      openSettings: openSettingsDialog,
    });
    const windowCommands = buildWindowCommands({
      leftRailVisible: shellFrame.leftRailVisible,
      leftCollapsed: shellFrame.leftCollapsed,
      rightCollapsed: shellFrame.rightCollapsed,
      timelineVisible: shellFrame.timelineVisible,
      toggleLeftRail: shellActions.toggleLeftRail,
      toggleLeftCollapsed: shellActions.toggleLeftCollapsed,
      toggleRightRail: shellActions.toggleRightRail,
      toggleTimeline: shellActions.toggleTimeline,
      setRightTab: shellActions.setRightTab,
      resetLayout: shellActions.resetLayout,
      showKeyboardShortcuts: openKeyboardShortcuts,
    });
    const leftRailCommands = buildLeftRailCommands(() => {
      const key = browserTreeExpansionKey(scope, browserMode);
      useBrowserTreeExpansionStore.getState().collapseAll(key);
    });
    const all = [...baseCommands, ...windowCommands, ...leftRailCommands];
    const gated = gateCommandsForTimeTravel(all, timeTravel);
    return filterCommands(gated, normalizedQuery);
  }, [
    browserMode,
    dashboardFilterChoices,
    lensIntent,
    lenses,
    normalizedQuery,
    runPaletteOp,
    shellActions,
    scope,
    selectNode,
    shellFrame,
    timeTravel,
    vocabulary.featureTags,
  ]);

  return useMemo(() => {
    const groups = groupByFamily(commands);
    const ordered = groups.flatMap((group) => group.commands);
    const matchedResults = ordered.filter(
      (command) => !command.id.startsWith("save-lens:"),
    );
    return {
      groups,
      ordered,
      matchedResults,
      noMatch: matchedResults.length === 0,
      navLoading: vocabulary.loading,
    };
  }, [commands, vocabulary.loading]);
}
