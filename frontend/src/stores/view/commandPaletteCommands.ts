import { useMemo } from "react";

import type { ActionDescriptor } from "../../platform/actions/action";
import type { DashboardPanelState } from "../server/engine";
import { useDashboardStateMutations } from "../server/dashboardState";
import { featureNodeIdFromTag } from "../server/liveAdapters";
import { OPS_WHITELIST } from "../server/opsActions";
import { useShellPanelIntent } from "../server/panelStateIntent";
import {
  useActiveScope,
  useDashboardTimelineModeView,
  useFiltersVocabularyView,
} from "../server/queries";
import { useDashboardFilterChoicesView } from "./dashboardFilterChoices";
import { dashboardFiltersFromChoices } from "./filters";
import { openKeyboardShortcuts } from "./keyboardShortcuts";
import { getLensChoices, saveCurrentLens, useLenses } from "./lenses";
import { useCommandPaletteOpsRunMutation } from "./opsRun";
import { useDashboardNodeSelection } from "./selection";
import { openSettingsDialog } from "./settingsDialog";
import {
  resetShellLayout,
  setShellLeftRailVisible,
  setShellTimelineVisible,
  useShellFrameView,
} from "./shellLayout";
import { useCommandPaletteOpsFeedbackBoundary } from "./commandPalette";

/** The command families, ordered as they group in the list. */
export type CommandFamily = "navigate" | "filters" | "window" | "core" | "rag" | "app";

// A palette command IS a shared `ActionDescriptor` (dashboard-context-menus ADR
// layer 1) plus the palette-specific `family` grouping. Consuming the shared
// descriptor is what keeps the palette and the context menu from drifting; the
// palette requires `run` and groups by `family`.
export interface PaletteCommand extends ActionDescriptor {
  family: CommandFamily;
  run: () => void;
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

export interface PaletteSources {
  featureTags: readonly string[];
  lensNames: readonly string[];
  query: string;
  canSaveLens?: boolean;
  applyLens: (name: string) => void;
  saveLens: (name: string) => void;
  runOp: (target: "core" | "rag", verb: string) => void;
  navigate: (nodeId: string) => void;
  openSettings: () => void;
}

export function buildCommands(sources: PaletteSources): PaletteCommand[] {
  const commands: PaletteCommand[] = [];
  for (const feature of sources.featureTags) {
    commands.push({
      id: `nav:${feature}`,
      label: `go to ${feature}`,
      family: "navigate",
      run: () => sources.navigate(featureNodeIdFromTag(feature)),
    });
  }
  for (const name of sources.lensNames) {
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
  const trimmed = sources.query.trim();
  if (trimmed.length > 0 && sources.canSaveLens !== false) {
    commands.push({
      id: `save-lens:${trimmed}`,
      label: `save current filters as lens "${trimmed}"`,
      family: "filters",
      run: () => sources.saveLens(trimmed),
    });
  }
  return commands;
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
  setRightTab: (tab: DashboardPanelState["right_tab"]) => void;
  resetLayout: () => void;
  showKeyboardShortcuts: () => void;
}

export function buildWindowCommands(w: WindowCommandSources): PaletteCommand[] {
  const commands: PaletteCommand[] = [
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
    {
      id: "window:rail-status",
      label: "activity rail: status",
      family: "window",
      run: () => w.setRightTab("status"),
    },
    {
      id: "window:rail-changes",
      label: "activity rail: changes",
      family: "window",
      run: () => w.setRightTab("changes"),
    },
    {
      id: "window:rail-search",
      label: "activity rail: search",
      family: "window",
      run: () => w.setRightTab("search"),
    },
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
  return commands;
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
  query: string,
): PaletteCommand[] {
  const needle = query.trim().toLowerCase();
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

export function commandPaletteRowLabel(
  command: PaletteCommand,
  armed: boolean,
): string {
  return armed ? `confirm ${command.label}?` : command.label;
}

export function commandPaletteOptionDomIdPart(commandId: string): string {
  return encodeURIComponent(commandId);
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
  const safeCursor =
    commandView.ordered.length === 0
      ? -1
      : Math.min(state.cursor, commandView.ordered.length - 1);
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
 * Stores-owned command-palette read model. The palette surface owns input,
 * cursor, focus and confirmation UX; this selector owns command assembly from
 * dashboard/lens/ops state, time-travel gating, grouping, and search projection.
 */
export function useCommandPaletteCommandView(query: string): CommandPaletteCommandView {
  const scope = useActiveScope();
  const vocabulary = useFiltersVocabularyView(scope);
  const dashboardFilterChoices = useDashboardFilterChoicesView(scope);
  const timeline = useDashboardTimelineModeView(scope);
  const dashboardMutations = useDashboardStateMutations(scope);
  const selectNode = useDashboardNodeSelection(scope);
  const lenses = useLenses();
  const runPaletteOp = useCommandPaletteOpsRunMutation();
  const shellFrame = useShellFrameView(scope);
  const panelIntent = useShellPanelIntent(scope);
  const timeTravel = timeline.opsDisabled;
  useCommandPaletteOpsFeedbackBoundary(scope, timeTravel);

  const commands = useMemo(() => {
    const baseCommands = buildCommands({
      featureTags: vocabulary.featureTags,
      lensNames: lenses.map((lens) => lens.name),
      query,
      canSaveLens: dashboardFilterChoices.loaded,
      applyLens: (name) => {
        const choices = getLensChoices(name);
        if (!choices || !scope) return;
        void dashboardMutations
          .setFiltersAndDateRange(
            dashboardFiltersFromChoices(choices),
            choices.dateRange,
          )
          .catch(() => undefined);
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
    const ignore = () => undefined;
    const windowCommands = buildWindowCommands({
      leftRailVisible: shellFrame.leftRailVisible,
      leftCollapsed: shellFrame.leftCollapsed,
      rightCollapsed: shellFrame.rightCollapsed,
      timelineVisible: shellFrame.timelineVisible,
      toggleLeftRail: () => setShellLeftRailVisible(!shellFrame.leftRailVisible),
      toggleLeftCollapsed: () => {
        void panelIntent.setLeftCollapsed(!shellFrame.leftCollapsed).catch(ignore);
      },
      toggleRightRail: () => {
        void panelIntent.setRightCollapsed(!shellFrame.rightCollapsed).catch(ignore);
      },
      toggleTimeline: () => setShellTimelineVisible(!shellFrame.timelineVisible),
      setRightTab: (tab) => {
        // Switching a tab also reveals the rail if it is collapsed, so the chosen
        // pane is actually visible after the command runs.
        void panelIntent.setRightTab(tab).catch(ignore);
        void panelIntent.setRightCollapsed(false).catch(ignore);
      },
      resetLayout: () => {
        resetShellLayout();
        void panelIntent.setLeftCollapsed(false).catch(ignore);
        void panelIntent.setRightCollapsed(false).catch(ignore);
        void panelIntent.setRightTab("status").catch(ignore);
      },
      showKeyboardShortcuts: openKeyboardShortcuts,
    });
    const all = [...baseCommands, ...windowCommands];
    const gated = gateCommandsForTimeTravel(all, timeTravel);
    return filterCommands(gated, query);
  }, [
    dashboardFilterChoices,
    dashboardMutations,
    lenses,
    panelIntent,
    query,
    runPaletteOp,
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
