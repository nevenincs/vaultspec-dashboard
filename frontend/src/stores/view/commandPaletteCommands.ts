import { useMemo } from "react";

import { legacyActionPresentation } from "../../platform/actions/action";
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
import {
  browseProjectsAction,
  clearHistoryAction,
  openProjectAction,
} from "./projectActions";
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
  resetSortingAction,
  sortTreeActions,
  toggleFacetsAction,
} from "./leftRailKeybindings";
import {
  useActiveScope,
  useClearRecents,
  useDashboardTimelineModeView,
  useFiltersVocabularyView,
} from "../server/queries";
import { openKeyboardShortcuts } from "./keyboardShortcuts";
import { showKeyboardShortcutsAction, toggleGraphAction } from "./chromeActions";
import { useCommandPaletteOpsRunMutation } from "./opsRun";
import { requestCloseDocumentEditor } from "./unsavedEditGuard";
import { closeAllDocTabs, promoteDocTab, reloadDocTab } from "./tabs";
import { useViewStore } from "./viewStore";
import { copyLinkAction } from "./documentLinkActions";
import { stemFromDocNodeId } from "../server/liveAdapters";
import {
  graphFitToView,
  graphResetView,
  graphZoomIn,
  graphZoomOut,
  setGraphFrozen,
} from "./graphCommands";
import { useGraphControlsFrozen } from "./graphControlsChrome";
import { getKeymapOverrides } from "./keymapDispatcher";
import { useShellPanelIntent } from "../server/panelStateIntent";
import {
  type KeybindingOverrides,
  effectiveChord,
  getKeybinding,
} from "../../platform/keymap/registry";
import { chordToKeycaps } from "../../platform/keymap/chord";
import { timelineCorpusFitKey, timelineViewSnapshot } from "./timeline";
import { fitTimelineScopeToCorpus, movePlayhead } from "./timelineIntent";
import { dateRangePatch, patchDashboardState } from "../server/dashboardState";
import {
  RIGHT_RAIL_TABS,
  type RailTabId,
  useShellFrameView,
  useShellWindowActions,
} from "./shellLayout";
import { useCommandPaletteOpsFeedbackBoundary } from "./commandPalette";
import { useOpenControlPanel } from "./controlPanels";

// Re-export the command-plane vocabulary from its canonical home (the registry) so
// existing importers keep resolving these names from this module.
export type { CommandContext, CommandDescriptor, CommandFamily };
export { normalizeCommandFamily };
/** A palette command IS a registry CommandDescriptor (the shared shape every plane
 *  consumes); this alias preserves the historical name. */
export type PaletteCommand = CommandDescriptor;
export type ResolvedPaletteCommand = Omit<
  PaletteCommand,
  "label" | "disabledReason"
> & {
  label: string;
  disabledReason?: string;
  presentationSafe: boolean;
  fallbackDisabled: boolean;
  legacyConfirmPrompt: string | null;
};

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
  graphVisible: boolean;
  toggleLeftRail: () => void;
  toggleLeftCollapsed: () => void;
  toggleRightRail: () => void;
  toggleTimeline: () => void;
  toggleGraph: () => void;
  setRightTab: (tab: unknown) => void;
  resetLayout: () => void;
  /** Retained on the shared CommandIntents contract; the window command builder now
   *  composes the shared showKeyboardShortcutsAction instead of this callback. */
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
  // Every window/pane verb reads as "<Element>: <Action>" (Title Case, the
  // label-casing-convention) so each is found by searching the element name in
  // Cmd+K — "Left rail: Hide", "Timeline: Show", alongside "Graph: Fit to View".
  const commands: unknown[] = [
    {
      id: "window:left-rail",
      label: legacyActionPresentation(
        w.leftRailVisible ? "Left rail: Hide" : "Left rail: Show",
      ),
      family: "window",
      run: w.toggleLeftRail,
    },
  ];
  // Collapse only applies while the left rail is mounted (mirrors the flyout's
  // `showLeftCollapseControl` gate).
  if (w.leftRailVisible) {
    commands.push({
      id: "window:left-collapse",
      label: legacyActionPresentation(
        w.leftCollapsed ? "Left rail: Expand" : "Left rail: Collapse",
      ),
      family: "window",
      run: w.toggleLeftCollapsed,
    });
  }
  commands.push(
    {
      id: "window:right-rail",
      label: legacyActionPresentation(
        w.rightCollapsed ? "Right rail: Show" : "Right rail: Hide",
      ),
      family: "window",
      run: w.toggleRightRail,
    },
    // Graph visibility COMPOSES the one shared `toggleGraphAction()` builder (the
    // SAME authoring the keymap, the background menu, and the canvas/dock toggles
    // use) under the single id `window:graph` — the palette no longer hand-writes a
    // second, drift-prone copy (unified-action-plane). It rides the window family
    // like the other window/pane verbs.
    { ...toggleGraphAction(), family: "window" as const },
  );
  // The timeline is tethered to the graph (one panel); its toggle only applies
  // while the graph is shown, so it is offered as a command only then (no dead
  // command when the graph — and its timeline — are hidden).
  if (w.graphVisible) {
    commands.push({
      id: "window:timeline",
      label: legacyActionPresentation(
        w.timelineVisible ? "Timeline: Hide" : "Timeline: Show",
      ),
      family: "window",
      run: w.toggleTimeline,
    });
  }
  commands.push(
    ...RIGHT_RAIL_TABS.flatMap(({ id, label }) => {
      const commandId = commandPaletteRightRailCommandId(id);
      const tab = normalizeCommandPaletteRightRailTab(id);
      return commandId === null || tab === null
        ? []
        : [
            {
              id: commandId,
              label: legacyActionPresentation(`Activity rail: ${label}`),
              family: "window" as const,
              run: () => w.setRightTab(tab),
            },
          ];
    }),
    {
      // Reset-layout runs the full reset directly here (the palette has the hook); the
      // background menu composes resetLayoutAction over the same id+behavior via the
      // reset-layout bridge. One id (`window:reset-layout`), one behavior.
      id: "window:reset-layout",
      label: legacyActionPresentation("Reset Layout"),
      family: "window",
      run: w.resetLayout,
    },
    // Keyboard-shortcuts composes the SHARED chromeActions builder (unified-action-plane):
    // it now carries its TRUE keybinding id `app:keyboard-shortcuts` (NOT the old `window:`
    // stem, which never matched the registry), so its `?` accelerator derives correctly
    // across the palette, the keymap, AND the background context menu from one definition.
    { ...showKeyboardShortcutsAction(), family: "help" as const },
  );
  return normalizedPaletteCommands(commands);
}

/**
 * The left-rail commands on the palette: Add to a Feature, the two direct browse-mode
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
      label: legacyActionPresentation(LEFT_RAIL_COLLAPSE_TREE_LABEL),
      family: "navigate",
      run: effects.collapseTree,
    },
    { ...resetFiltersAction(effects.resetFilters), family: "filters" },
    // The vault tree's sort plane (left-rail-tree-controls ADR D3): one command
    // per sort option + the reset, from the SAME shared builders the rail-top
    // sort menu and the vault-section context menu consume.
    ...sortTreeActions().map((action) => ({ ...action, family: "navigate" })),
    { ...resetSortingAction(), family: "navigate" },
  ];
  return normalizedPaletteCommands(commands);
}

/** The "Project" command group (global project-management plane): open/register a
 *  project, browse-or-switch the cross-project history, and clear that history.
 *  All three share the "Project:" label prefix and ride the `app` family; Open and
 *  Browse derive accelerators from their keymap ids. */
export function buildProjectCommands(effects: {
  clearProjectHistory: () => void;
}): PaletteCommand[] {
  const commands: unknown[] = [
    { ...openProjectAction(), family: "app" },
    { ...browseProjectsAction(), family: "app" },
    { ...clearHistoryAction(effects.clearProjectHistory), family: "app" },
  ];
  return normalizedPaletteCommands(commands);
}

// Feature archive is no longer a per-feature standing command (corpus fence). It is
// an entity verb (`archiveFeatureAction` in the shared action builders), reachable
// from a feature/node context menu with the same arm-to-confirm + time-travel guard.

/**
 * Timeline commands on the palette (Issue #14 rebuild). The timeline is now a fixed
 * date-range selector, so the scroll/playhead verbs (jump-to-now, fit-to-corpus) are
 * gone; what remains are the date_range writers — the last-N-days presets and a clear
 * — which write the canonical `date_range` and narrow the rail + graph in lock-step.
 * The effects are injected by the selector so the builder stays a pure projection.
 */
export interface TimelineCommandEffects {
  setRangeDays: (days: number) => void;
  clearDateRange: () => void;
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
    ...TIMELINE_RANGE_PRESETS.map((preset) => ({
      id: `timeline:range-${preset.days}d`,
      label: legacyActionPresentation(`Timeline: Last ${preset.label}`),
      family: "filters",
      run: () => effects.setRangeDays(preset.days),
    })),
    {
      id: "timeline:clear-date-range",
      label: legacyActionPresentation("Timeline: Clear Date Range"),
      family: "filters",
      run: effects.clearDateRange,
    },
  ];
  return normalizedPaletteCommands(commands);
}

/**
 * Document-editor commands on the palette. Close-document docks the open editor
 * shut (`closeDocumentEditor`, a store-only no-op when none is open) — reachable
 * without the editor focused. Save/edit-mode are component-coupled (they need the
 * live draft + the write mutation) and are enrolled at the editor surface, not here.
 */
export function buildEditorCommands(intents: {
  closeDoc: () => void;
  closeAllDocs: () => void;
  reloadDoc: () => void;
  keepOpen: () => void;
  /** Toggle the draft-vs-saved diff panel (authoring-surface ADR D4). */
  toggleDiff: () => void;
}): PaletteCommand[] {
  const commands: unknown[] = [
    {
      id: "editor:close-document",
      label: legacyActionPresentation("Close Document"),
      family: "app",
      run: intents.closeDoc,
    },
    {
      id: "editor:close-all-documents",
      label: legacyActionPresentation("Close All Documents"),
      family: "app",
      run: intents.closeAllDocs,
    },
    {
      id: "editor:reload-document",
      label: legacyActionPresentation("Reload Document"),
      family: "app",
      run: intents.reloadDoc,
    },
    {
      id: "editor:keep-document-open",
      label: legacyActionPresentation("Keep Document Open"),
      family: "app",
      run: intents.keepOpen,
    },
    {
      // Shared id with the keymap chord (Mod+Shift+D) so accelerators derive
      // correctly from the registry (actions-keymap-palette: one id per verb).
      id: "editor:toggle-diff",
      label: legacyActionPresentation("Toggle Draft Diff"),
      family: "edit",
      run: intents.toggleDiff,
    },
  ];
  return normalizedPaletteCommands(commands);
}

/**
 * Document-scoped palette commands (authoring-surface ADR D3). Copy-link is enrolled
 * ONLY when a document is open (`stem` non-null), so it is never a dead command with
 * no target. It composes the SAME shared `copyLinkAction` builder the vault-doc
 * context menu uses under one id (`vault-doc:copy-link`), so the verb is authored once
 * across both planes (the unified action plane).
 */
export function buildDocumentCommands(opts: { stem: string | null }): PaletteCommand[] {
  if (opts.stem === null) return [];
  const commands: unknown[] = [
    { ...copyLinkAction({ stem: opts.stem }), family: "app" },
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
      label: legacyActionPresentation("Graph: Fit to View"),
      family: "navigate",
      run: graphFitToView,
    },
    {
      id: "graph:reset-view",
      label: legacyActionPresentation("Graph: Reset View"),
      family: "navigate",
      run: graphResetView,
    },
    {
      id: "graph:zoom-in",
      label: legacyActionPresentation("Graph: Zoom In"),
      family: "navigate",
      run: graphZoomIn,
    },
    {
      id: "graph:zoom-out",
      label: legacyActionPresentation("Graph: Zoom Out"),
      family: "navigate",
      run: graphZoomOut,
    },
    {
      id: "graph:toggle-freeze",
      label: legacyActionPresentation(
        opts.frozen ? "Graph: Resume Layout" : "Graph: Freeze Layout",
      ),
      family: "navigate",
      run: () => opts.setFrozen(!opts.frozen),
    },
    {
      id: "graph:reset-defaults",
      label: legacyActionPresentation("Graph: Reset Controls to Defaults"),
      family: "navigate",
      run: opts.resetDefaults,
    },
  ];
  return normalizedPaletteCommands(commands);
}

const THEME_PALETTE_COMMANDS: { value: string; label: string }[] = [
  { value: "system", label: "Theme: System" },
  { value: "light", label: "Theme: Light" },
  { value: "dark", label: "Theme: Dark" },
  { value: "high-contrast", label: "Theme: High Contrast" },
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
    label: legacyActionPresentation(theme.label),
    family: "app",
    run: () => setTheme(theme.value),
  }));
  return normalizedPaletteCommands(commands);
}

export function gateCommandsForTimeTravel<
  Command extends Pick<PaletteCommand, "disabledInTimeTravel">,
>(commands: readonly Command[], timeTravel: boolean): Command[] {
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
export function deriveCommandAccelerators<
  Command extends { id: string; accelerator?: string },
>(commands: readonly Command[], overrides: KeybindingOverrides): Command[] {
  return commands.map((command) => {
    const def = getKeybinding(command.id);
    if (def === undefined) return command;
    const accelerator = chordToKeycaps(effectiveChord(def, overrides)).join("+");
    return accelerator.length > 0 ? { ...command, accelerator } : command;
  });
}

export function filterCommands(
  commands: readonly ResolvedPaletteCommand[],
  query: unknown,
): ResolvedPaletteCommand[] {
  const needle = typeof query === "string" ? query.trim().toLowerCase() : "";
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

export function groupByFamily<Command extends Pick<PaletteCommand, "family">>(
  commands: readonly Command[],
): { family: CommandFamily; commands: Command[] }[] {
  return FAMILY_ORDER.map((family) => ({
    family,
    commands: commands.filter((command) => command.family === family),
  })).filter((group) => group.commands.length > 0);
}

export interface CommandPaletteCommandView {
  commands: PaletteCommand[];
  navLoading: boolean;
}

export interface CommandPaletteRowView {
  command: ResolvedPaletteCommand;
  id: string;
  optionDomIdPart: string;
  index: number;
  label: string;
  disabled: boolean;
  disabledReason: string | undefined;
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
  activeCommand: ResolvedPaletteCommand | undefined;
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
  | {
      kind: "confirm";
      cursor: number;
      commandId: string;
    }
  | {
      kind: "run";
      cursor: number;
      command: ResolvedPaletteCommand;
      closeAfterRun: boolean;
    };

export type CommandPaletteKeyboardIntent =
  | { kind: "move-cursor"; delta: 1 | -1 }
  | { kind: "run-active" };

export interface CommandPaletteArmedRepair {
  clearArmedCommandId: boolean;
  disarm: boolean;
}

export function commandPaletteRowLabel(
  command: ResolvedPaletteCommand,
  armed: boolean,
): string {
  return armed ? (command.legacyConfirmPrompt ?? command.label) : command.label;
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

export function commandPaletteMovedRunnableCursor(
  commands: readonly Pick<ResolvedPaletteCommand, "disabled">[],
  cursor: number,
  delta: 1 | -1,
): number {
  const runnableIndices = commands.flatMap((command, index) =>
    command.disabled === true ? [] : [index],
  );
  if (runnableIndices.length === 0) return -1;
  const currentPosition = runnableIndices.indexOf(cursor);
  if (currentPosition < 0) {
    return delta > 0
      ? (runnableIndices.find((index) => index > cursor) ?? runnableIndices.at(-1)!)
      : ([...runnableIndices].reverse().find((index) => index < cursor) ??
          runnableIndices[0]!);
  }
  const nextPosition = Math.min(
    Math.max(0, currentPosition + delta),
    runnableIndices.length - 1,
  );
  return runnableIndices[nextPosition]!;
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
  ordered: readonly ResolvedPaletteCommand[],
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
  if (command.confirmation !== undefined) {
    return {
      kind: "confirm",
      cursor,
      commandId: command.id,
    };
  }
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
  activeCommand: ResolvedPaletteCommand | undefined,
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
  commandView: {
    groups: { family: CommandFamily; commands: ResolvedPaletteCommand[] }[];
    ordered: ResolvedPaletteCommand[];
    matchedResults: ResolvedPaletteCommand[];
    noMatch: boolean;
    navLoading: boolean;
  },
  state: {
    cursor: number;
    confirmArmed: boolean;
    armedCommandId: string | null;
  },
): CommandPalettePresentationView {
  const runnableIndices = commandView.ordered.flatMap((command, index) =>
    command.disabled === true ? [] : [index],
  );
  const safeCursor = runnableIndices.includes(state.cursor)
    ? state.cursor
    : (runnableIndices[0] ?? -1);
  const activeCommand = safeCursor >= 0 ? commandView.ordered[safeCursor] : undefined;
  const rows = commandView.ordered.map((command, index): CommandPaletteRowView => {
    const armed = state.confirmArmed && state.armedCommandId === command.id;
    const disabled = command.disabled === true;
    const selected = !disabled && index === safeCursor;
    const confirmShortcutLabel = command.confirm ? "⏎ ⏎" : null;
    return {
      command,
      id: command.id,
      optionDomIdPart: commandPaletteOptionDomIdPart(command.id),
      index,
      label: commandPaletteRowLabel(command, armed),
      disabled,
      disabledReason: command.disabledReason,
      rowClassName: `flex h-[1.875rem] w-full items-center justify-between rounded-fg-md px-fg-4 text-left transition-colors duration-ui-fast ease-settle ${
        disabled
          ? "cursor-not-allowed text-ink-faint opacity-60"
          : selected
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
    inputPlaceholder: "Type a command or search…",
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
 * and returns the raw normalized command list. Locale-bound resolution, query
 * filtering, and family grouping belong to the React palette boundary.
 */
export function useCommandPaletteCommandView(): CommandPaletteCommandView {
  const scope = useActiveScope();
  const browserMode = useBrowserMode();
  const vocabulary = useFiltersVocabularyView(scope);
  const timeline = useDashboardTimelineModeView(scope);
  const runPaletteOp = useCommandPaletteOpsRunMutation().mutate;
  const resetFilters = useDashboardFilterSidebarIntent(scope).clearFilters;
  const clearFeatureFilter = useDashboardFeatureFilterDraft(scope).clear;
  const clearProjectHistory = useClearRecents();
  const graphFrozen = useGraphControlsFrozen();
  const openControlPanel = useOpenControlPanel();
  const setThemePreference = useThemeSettingIntent().setThemePreference;
  const shellFrame = useShellFrameView(scope);
  const shellActions = useShellWindowActions(scope, shellFrame);
  const rightPanelSetTab = useShellPanelIntent(scope).setRightTab;
  const dateBounds = vocabulary.dateBounds;
  const timeTravel = timeline.opsDisabled;
  // The open document's stem, read reactively (raw primitive selector — stable) so the
  // document-scoped copy-link command enrolls/withdraws as the active tab changes.
  const activeDocId = useViewStore((state) => state.activeDocId);
  const activeDocumentStem = stemFromDocNodeId(activeDocId);
  useCommandPaletteOpsFeedbackBoundary(scope, timeTravel);

  const commands = useMemo(() => {
    const ctx: CommandContext = {
      scope,
      timeTravel,
      keybindingOverrides: getKeymapOverrides(),
      graphFrozen,
      openControlPanel,
      shell: {
        leftRailVisible: shellFrame.leftRailVisible,
        leftCollapsed: shellFrame.leftCollapsed,
        rightCollapsed: shellFrame.rightCollapsed,
        timelineVisible: shellFrame.timelineVisible,
        graphVisible: shellFrame.graphVisible,
      },
      activeDocumentStem,
      intents: {
        collapseTree: () => {
          const key = browserTreeExpansionKey(scope, browserMode);
          useBrowserTreeExpansionStore.getState().collapseAll(key);
        },
        resetFilters: () => void resetFilters(),
        clearFeatureFilter: () => void clearFeatureFilter(),
        clearProjectHistory: () => void clearProjectHistory(),
        setTheme: setThemePreference,
        runOp: (target, verb) => {
          runPaletteOp({ target, verb });
        },
        closeDocument: () => requestCloseDocumentEditor(),
        closeAllDocuments: () => closeAllDocTabs(),
        reloadActiveDocument: () => {
          const state = useViewStore.getState();
          const activeId = state.activeDocId;
          if (activeId === null) return;
          // Attribution law (ambient-scope-coherence audit): reload against the
          // tab's ORIGIN scope, never the ambient active scope — a cross-scope
          // tab's content key folds ITS scope, so an ambient-scope invalidation
          // would silently miss it (review LOW).
          const tab = state.openDocs.find((doc) => doc.nodeId === activeId);
          reloadDocTab(activeId, tab?.scope ?? scope);
        },
        keepActiveDocumentOpen: () => {
          const activeId = useViewStore.getState().activeDocId;
          if (activeId !== null) promoteDocTab(activeId);
        },
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
          // Issue #14: a range preset writes the canonical date_range directly — the
          // last N days up to today — narrowing the rail + graph in lock-step. The
          // timeline is the sole date_range writer (filtering-has-one-canonical-surface).
          const now = Date.now();
          const toStr = new Date(now).toISOString().slice(0, 10);
          const fromStr = new Date(now - days * 86_400_000).toISOString().slice(0, 10);
          void patchDashboardState(scope, dateRangePatch({ from: fromStr, to: toStr }));
        },
        clearDateRange: () => void patchDashboardState(scope, dateRangePatch({})),
        toggleLeftRail: shellActions.toggleLeftRail,
        toggleLeftCollapsed: shellActions.toggleLeftCollapsed,
        toggleRightRail: shellActions.toggleRightRail,
        toggleTimeline: shellActions.toggleTimeline,
        toggleGraph: shellActions.toggleGraph,
        setRightTab: shellActions.setRightTab,
        resetLayout: shellActions.resetLayout,
        showKeyboardShortcuts: openKeyboardShortcuts,
      },
    };
    return deriveCommandAccelerators(resolveCommands(ctx), ctx.keybindingOverrides);
  }, [
    activeDocumentStem,
    browserMode,
    clearFeatureFilter,
    clearProjectHistory,
    dateBounds,
    graphFrozen,
    openControlPanel,
    resetFilters,
    rightPanelSetTab,
    runPaletteOp,
    scope,
    setThemePreference,
    shellActions,
    shellFrame,
    timeTravel,
  ]);

  return useMemo(
    () => ({ commands, navLoading: vocabulary.loading }),
    [commands, vocabulary.loading],
  );
}
