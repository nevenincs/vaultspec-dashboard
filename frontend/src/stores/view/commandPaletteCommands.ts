import { useMemo } from "react";

import {
  resolveCommands,
  normalizeCommandDescriptor,
  normalizeCommandFamily,
  type CommandContext,
  type CommandDescriptor,
  type CommandFamily,
} from "./commandRegistry";
import { useDashboardFilterSidebarIntent } from "../server/dashboardFilterSidebarIntent";
import { useDashboardFeatureFilterDraft } from "./dashboardFeatureFilter";
import { useThemeSettingIntent } from "../server/themeSettingIntent";
import { useBrowserMode } from "./browserMode";
import {
  browserTreeExpansionKey,
  useBrowserTreeExpansionStore,
} from "./browserTreeExpansion";
import {
  LEFT_RAIL_COLLAPSE_TREE_ACTION_ID,
  LEFT_RAIL_COLLAPSE_TREE_LABEL,
  browseModeAction,
  clearFilterAction,
  focusFilterAction,
  newDocumentAction,
  resetFiltersAction,
  toggleFacetsAction,
} from "./leftRailKeybindings";
import {
  useActiveScope,
  useDashboardTimelineModeView,
  useFiltersVocabularyView,
} from "../server/queries";
import { openKeyboardShortcuts } from "./keyboardShortcuts";
import { useCommandPaletteOpsRunMutation } from "./opsRun";
import { closeDocumentEditor } from "./editor";
import {
  graphFitToView,
  graphResetView,
  graphZoomIn,
  graphZoomOut,
  setGraphFrozen,
} from "./graphCommands";
import { useGraphControlsFrozen } from "./graphControlsChrome";
import { getKeymapOverrides } from "./keymapDispatcher";
import { focusRightRailSearch } from "./rightRailKeybindings";
import { useShellPanelIntent } from "../server/panelStateIntent";
import {
  type KeybindingOverrides,
  effectiveChord,
  getKeybinding,
} from "../../platform/keymap/registry";
import { chordToKeycaps } from "../../platform/keymap/chord";
import {
  orderedTimelineDateInputRange,
  timelineCorpusFitKey,
  timelineViewSnapshot,
} from "./timeline";
import {
  fitTimelineNavigationToDateRange,
  fitTimelineScopeToCorpus,
  movePlayhead,
} from "./timelineIntent";
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

// Re-export the command-plane vocabulary from its canonical home (the registry) so
// existing importers keep resolving these names from this module.
export type { CommandContext, CommandDescriptor, CommandFamily };
export { normalizeCommandFamily };
/** A palette command IS a registry CommandDescriptor (the shared shape every plane
 *  consumes); this alias preserves the historical name. */
export type PaletteCommand = CommandDescriptor;

/** Human-facing group heading per family (object-then-action taxonomy). */
export const FAMILY_LABEL: Record<CommandFamily, string> = {
  navigate: "navigate",
  filters: "filters",
  focus: "focus",
  window: "window",
  edit: "edit",
  reload: "reload",
  settings: "settings",
  search: "search",
  core: "core ops",
  rag: "rag ops",
  help: "help",
  app: "app",
};

export const COMMAND_PALETTE_SOURCE_ITEMS_CAP = 128;
export const COMMAND_PALETTE_SOURCE_ITEM_MAX_CHARS = 256;

/** Normalize one palette command. Delegates to the registry's canonical
 *  normalizer; preserved as a named export for existing importers. */
export function normalizePaletteCommand(command: unknown): PaletteCommand | null {
  return normalizeCommandDescriptor(command);
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

// Corpus fence (command-palette-providers + command-palette-planes ADRs): the old
// `buildCommands` enrolled one `go to <feature>` and one `lens: <name>` per corpus
// item plus a `save current filters as lens` command directly into the command
// plane. That transient vault vocabulary is no longer a standing command — feature
// and document navigation belong to the document-search plane, and lens apply/save
// is a filters-surface concern. The remaining real verbs (the whitelisted ops and
// open-settings) are contributed by the ops command provider. See the corpus-fence
// guard test for the structural backstop.

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
      // The legend is a HELP verb per the action taxonomy (help = keyboard
      // shortcuts, about), not a window-layout verb; it groups under the help
      // family. The id keeps its `window:` stem so the registry-derived
      // accelerator mapping is unchanged.
      id: "window:keyboard-shortcuts",
      label: "keyboard shortcuts",
      family: "help",
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
export interface LeftRailCommandEffects {
  /** Collapse the whole vault tree (scope+mode-bound, computed by the selector). */
  collapseTree: () => void;
  /** Reset the canonical dashboard filters to empty (scope-bound write seam). */
  resetFilters: () => void;
  /** Clear the left-rail feature-filter draft (scope-bound write seam). */
  clearFilter: () => void;
}

export function buildLeftRailCommands(
  effects: LeftRailCommandEffects,
): PaletteCommand[] {
  const commands: unknown[] = [
    { ...newDocumentAction(), family: "app" },
    { ...browseModeAction("vault"), family: "navigate" },
    { ...browseModeAction("code"), family: "navigate" },
    // Focus / clear the document filter — keymap-enrolled verbs now reachable from the
    // palette under their SHARED ids (so their accelerators derive). Focus is a `focus`
    // verb; clear is a `filters` verb.
    { ...focusFilterAction(), family: "focus" },
    { ...clearFilterAction(effects.clearFilter), family: "filters" },
    { ...toggleFacetsAction(), family: "filters" },
    {
      id: LEFT_RAIL_COLLAPSE_TREE_ACTION_ID,
      label: LEFT_RAIL_COLLAPSE_TREE_LABEL,
      family: "navigate",
      run: effects.collapseTree,
    },
    { ...resetFiltersAction(effects.resetFilters), family: "filters" },
  ];
  return normalizedPaletteCommands(commands);
}

// Feature archive is no longer a per-feature standing command (corpus fence). It is
// an entity verb (`archiveFeatureAction` in the shared action builders), reachable
// from a feature/node context menu with the same arm-to-confirm + time-travel guard.

/**
 * Timeline commands on the palette. Jump-to-now docks the playhead back to LIVE
 * (the same intent the timeline's Home key fires) — a navigate verb reachable
 * without the timeline focused. The effect is injected by the selector so the
 * builder stays a pure projection.
 */
export interface TimelineCommandEffects {
  jumpToLive: () => void;
  fitToCorpus: () => void;
  setRangeDays: (days: number) => void;
}

const TIMELINE_RANGE_PRESETS: { days: number; label: string }[] = [
  { days: 1, label: "24 hours" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export function buildTimelineCommands(
  effects: TimelineCommandEffects,
): PaletteCommand[] {
  const commands: unknown[] = [
    {
      id: "timeline:jump-to-now",
      label: "jump playhead to now",
      family: "navigate",
      run: effects.jumpToLive,
    },
    {
      id: "timeline:fit-to-corpus",
      label: "timeline: fit all to view",
      family: "navigate",
      run: effects.fitToCorpus,
    },
    ...TIMELINE_RANGE_PRESETS.map((preset) => ({
      id: `timeline:range-${preset.days}d`,
      label: `timeline: last ${preset.label}`,
      family: "navigate",
      run: () => effects.setRangeDays(preset.days),
    })),
  ];
  return normalizedPaletteCommands(commands);
}

/**
 * Document-editor commands on the palette. Close-document docks the open editor
 * shut (`closeDocumentEditor`, a store-only no-op when none is open) — reachable
 * without the editor focused. Save/edit-mode are component-coupled (they need the
 * live draft + the write mutation) and are enrolled at the editor surface, not here.
 */
export function buildEditorCommands(closeDoc: () => void): PaletteCommand[] {
  const commands: unknown[] = [
    {
      id: "editor:close-document",
      label: "close the open document",
      family: "app",
      run: closeDoc,
    },
  ];
  return normalizedPaletteCommands(commands);
}

/**
 * Graph-control commands on the palette (deferral #13): the camera verbs, the
 * freeze toggle, and reset-to-defaults — the discrete graph-control actions the
 * GraphControls panel exposes as buttons, now reachable from cmd+K. They forward
 * through the scene-command bridge (a no-op when the graph is not mounted). The
 * continuous sliders (spacing/size/etc.) stay in the panel — they are not discrete
 * commands.
 */
export function buildGraphCommands(opts: {
  frozen: boolean;
  setFrozen: (frozen: boolean) => void;
  resetDefaults: () => void;
}): PaletteCommand[] {
  const commands: unknown[] = [
    {
      id: "graph:fit-to-view",
      label: "graph: fit to view",
      family: "navigate",
      run: graphFitToView,
    },
    {
      id: "graph:reset-view",
      label: "graph: reset view",
      family: "navigate",
      run: graphResetView,
    },
    {
      id: "graph:zoom-in",
      label: "graph: zoom in",
      family: "navigate",
      run: graphZoomIn,
    },
    {
      id: "graph:zoom-out",
      label: "graph: zoom out",
      family: "navigate",
      run: graphZoomOut,
    },
    {
      id: "graph:toggle-freeze",
      label: opts.frozen ? "graph: unfreeze layout" : "graph: freeze layout",
      family: "navigate",
      run: () => opts.setFrozen(!opts.frozen),
    },
    {
      id: "graph:reset-defaults",
      label: "graph: reset controls to defaults",
      family: "navigate",
      run: opts.resetDefaults,
    },
  ];
  return normalizedPaletteCommands(commands);
}

const THEME_PALETTE_COMMANDS: { value: string; label: string }[] = [
  { value: "system", label: "theme: system (auto)" },
  { value: "light", label: "theme: light" },
  { value: "dark", label: "theme: dark" },
  { value: "high-contrast", label: "theme: high contrast" },
];

/**
 * Settings commands on the palette (deferral #22): pin the theme preference
 * (system/light/dark/high-contrast) without opening the settings dialog. Writes
 * through the engine-owned theme setting via the injected intent (settings stay
 * schema-driven from the one registry).
 */
export function buildSettingsCommands(
  setTheme: (value: string) => void,
): PaletteCommand[] {
  const commands: unknown[] = THEME_PALETTE_COMMANDS.map((theme) => ({
    id: `settings:theme-${theme.value}`,
    label: theme.label,
    family: "app",
    run: () => setTheme(theme.value),
  }));
  return normalizedPaletteCommands(commands);
}

export function gateCommandsForTimeTravel(
  commands: readonly PaletteCommand[],
  timeTravel: boolean,
): PaletteCommand[] {
  if (!timeTravel) return [...commands];
  return commands.filter((command) => command.disabledInTimeTravel !== true);
}

/**
 * Derive each command's inline accelerator from the ONE keymap registry by shared
 * action id (command-palette-actions ADR): a command whose id matches a registered
 * `KeybindingDef` gets that binding's EFFECTIVE chord (defaults <- overrides),
 * rendered as keycaps. The accelerator is never hand-typed on the command, so the
 * palette, the legend, and the live handler cannot drift
 * (keyboard-shortcuts-bind-through-the-one-keymap-registry). Commands with no
 * binding are returned unchanged.
 */
export function deriveCommandAccelerators(
  commands: readonly PaletteCommand[],
  overrides: KeybindingOverrides,
): PaletteCommand[] {
  return commands.map((command) => {
    const def = getKeybinding(command.id);
    if (def === undefined) return command;
    const accelerator = chordToKeycaps(effectiveChord(def, overrides)).join("+");
    return accelerator.length > 0 ? { ...command, accelerator } : command;
  });
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
  "focus",
  "window",
  "edit",
  "reload",
  "settings",
  "search",
  "core",
  "rag",
  "help",
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
  /** Inline accelerator keycaps derived from the keymap registry, or null. */
  accelerator: string | null;
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
      accelerator: command.accelerator ?? null,
      selectionHintVisible:
        selected && confirmShortcutLabel === null && !command.accelerator,
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
    liveMessage = "nothing matches";
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
    inputPlaceholder: "type a command…",
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
 * cursor, and confirmation-row state; this selector assembles the `CommandContext`
 * from raw, stable selectors (stable-selectors), calls the command-provider registry
 * host (`resolveCommands`, which applies the central time-travel gate and the bounds),
 * then projects the result through the query filter and family grouping. The command
 * list itself is contributed by the registered providers, not hand-assembled here.
 */
export function useCommandPaletteCommandView(
  query: unknown,
): CommandPaletteCommandView {
  const scope = useActiveScope();
  const browserMode = useBrowserMode();
  const normalizedQuery = normalizeCommandPaletteQuery(query);
  const vocabulary = useFiltersVocabularyView(scope);
  const timeline = useDashboardTimelineModeView(scope);
  const runPaletteOp = useCommandPaletteOpsRunMutation().mutate;
  const resetFilters = useDashboardFilterSidebarIntent(scope).clearFilters;
  const clearFeatureFilter = useDashboardFeatureFilterDraft(scope).clear;
  const graphFrozen = useGraphControlsFrozen();
  const setThemePreference = useThemeSettingIntent().setThemePreference;
  const shellFrame = useShellFrameView(scope);
  const shellActions = useShellWindowActions(scope, shellFrame);
  const rightPanelSetTab = useShellPanelIntent(scope).setRightTab;
  const dateBounds = vocabulary.dateBounds;
  const timeTravel = timeline.opsDisabled;
  useCommandPaletteOpsFeedbackBoundary(scope, timeTravel);

  const commands = useMemo(() => {
    const ctx: CommandContext = {
      scope,
      timeTravel,
      keybindingOverrides: getKeymapOverrides(),
      graphFrozen,
      shell: {
        leftRailVisible: shellFrame.leftRailVisible,
        leftCollapsed: shellFrame.leftCollapsed,
        rightCollapsed: shellFrame.rightCollapsed,
        timelineVisible: shellFrame.timelineVisible,
      },
      intents: {
        collapseTree: () => {
          const key = browserTreeExpansionKey(scope, browserMode);
          useBrowserTreeExpansionStore.getState().collapseAll(key);
        },
        resetFilters: () => void resetFilters(),
        clearFeatureFilter: () => void clearFeatureFilter(),
        focusRightRailSearch: () => focusRightRailSearch(rightPanelSetTab),
        setTheme: setThemePreference,
        runOp: (target, verb) => {
          runPaletteOp({ target, verb });
        },
        closeDocument: () => closeDocumentEditor(),
        setGraphFrozen: (frozen) => setGraphFrozen(frozen, scope),
        jumpToLive: () => movePlayhead("live", scope),
        fitTimelineToCorpus: () => {
          const width = timelineViewSnapshot().viewportWidth;
          fitTimelineScopeToCorpus(
            scope,
            dateBounds,
            width,
            timelineCorpusFitKey(scope, dateBounds),
          );
        },
        setTimelineRangeDays: (days) => {
          const width = timelineViewSnapshot().viewportWidth;
          const now = Date.now();
          const toStr = new Date(now).toISOString().slice(0, 10);
          const fromStr = new Date(now - days * 86_400_000).toISOString().slice(0, 10);
          const range = orderedTimelineDateInputRange(fromStr, toStr);
          if (range) fitTimelineNavigationToDateRange(range, width);
        },
        toggleLeftRail: shellActions.toggleLeftRail,
        toggleLeftCollapsed: shellActions.toggleLeftCollapsed,
        toggleRightRail: shellActions.toggleRightRail,
        toggleTimeline: shellActions.toggleTimeline,
        setRightTab: shellActions.setRightTab,
        resetLayout: shellActions.resetLayout,
        showKeyboardShortcuts: openKeyboardShortcuts,
      },
    };
    return filterCommands(
      deriveCommandAccelerators(resolveCommands(ctx), ctx.keybindingOverrides),
      normalizedQuery,
    );
  }, [
    browserMode,
    clearFeatureFilter,
    dateBounds,
    graphFrozen,
    normalizedQuery,
    resetFilters,
    rightPanelSetTab,
    runPaletteOp,
    scope,
    setThemePreference,
    shellActions,
    shellFrame,
    timeTravel,
  ]);

  return useMemo(() => {
    const groups = groupByFamily(commands);
    const ordered = groups.flatMap((group) => group.commands);
    return {
      groups,
      ordered,
      matchedResults: ordered,
      noMatch: ordered.length === 0,
      navLoading: vocabulary.loading,
    };
  }, [commands, vocabulary.loading]);
}
