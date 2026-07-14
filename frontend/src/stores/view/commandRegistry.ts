// The command-provider registry (command-palette-providers ADR): the Cmd+K
// command plane's contribution surface. A surface contributes a pure
// `CommandProvider` — `(ctx) => CommandDescriptor[]` — registered once; the generic
// host `resolveCommands` concatenates every registered provider's output, applies
// the central time-travel gate, normalizes and de-duplicates, and returns a bounded
// command list. It mirrors the context-menu resolver registry
// (`platform/actions/registry.ts`) and the keymap dispatcher's `registerKeyAction`
// (`stores/view/keymapDispatcher.ts`) — register-once, generic host, disposer — so
// the palette is fed the same way the other action planes are
// (unified-action-plane), instead of hand-concatenating builder arrays.
//
// Layer: this lives at the stores layer (not platform like the resolver registry)
// because the command context is stores-shaped — it carries the active scope, the
// shell-frame snapshot, the runtime effect intents, and the live keybinding
// override map. The palette command plane is a stores read model
// (dashboard-layer-ownership), so its registry lives with it. Providers stay pure
// of stores by reading everything they need from the injected `CommandContext`.
//
// Bounded by default (bounded-by-default-for-every-accumulator): the provider map,
// each provider's contribution, and the resolved list all carry caps at creation,
// so the command plane cannot grow unbounded regardless of how many providers
// enroll or how much any one provider emits.

import {
  normalizeActionDescriptor,
  type ActionDescriptorBase,
} from "../../platform/actions/action";
import type { KeybindingOverrides } from "../../platform/keymap/registry";
import type { ControlPanelId } from "./controlPanels";

/** The canonical command-family taxonomy (command-palette-actions ADR): every
 *  surface enrolls its verbs under one of these. `navigate`/`focus` move the view;
 *  `filters`/`window` adjust the workspace; `edit` is the document lifecycle;
 *  `reload` is the refresh/reindex family; `settings`/`search`/`help` are app planes;
 *  `core`/`rag` are the backend ops targets; `app` is the catch-all. */
export type CommandFamily =
  | "navigate"
  | "filters"
  | "focus"
  | "window"
  | "edit"
  | "reload"
  | "settings"
  | "search"
  | "core"
  | "rag"
  | "help"
  | "app";

const COMMAND_FAMILIES = new Set<CommandFamily>([
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
]);

export function normalizeCommandFamily(value: unknown): CommandFamily | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return COMMAND_FAMILIES.has(normalized as CommandFamily)
    ? (normalized as CommandFamily)
    : null;
}

/**
 * A palette command IS a shared `ActionDescriptor` (dashboard-context-menus ADR
 * layer 1) plus the palette-specific `family` grouping. Consuming the shared
 * descriptor base is what keeps the palette and the context menu from drifting; the
 * palette requires a store-only `run` and groups by `family`.
 */
export interface CommandDescriptor extends ActionDescriptorBase {
  /** Localized presentation inherited unchanged from the shared action contract. */
  label: ActionDescriptorBase["label"];
  /** Optional localized reason inherited unchanged from the shared action contract. */
  disabledReason?: ActionDescriptorBase["disabledReason"];
  family: CommandFamily;
  run: () => void;
  dispatch?: never;
}

/** The shell-frame visibility snapshot a window/shell provider reads to name each
 *  toggle's inverse ("hide" vs "show"). Assembled by the palette read model from
 *  the canonical shell-layout state; providers never read the store directly. */
export interface CommandShellContext {
  leftRailVisible: boolean;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  timelineVisible: boolean;
  graphVisible: boolean;
}

/** The runtime effect intents the providers fire. Hook-bound effects (scope-bound
 *  mutations, scene-bridge commands, store writes) are injected here so providers
 *  stay pure functions of their context. Module-level intents (e.g. the graph
 *  camera verbs, `openSettingsDialog`) are imported by the provider directly and do
 *  not need to ride the context. Grown per-provider as the builders migrate. */
export interface CommandIntents {
  /** Collapse the whole vault tree (scope+mode-bound). */
  collapseTree: () => void;
  /** Reset the canonical dashboard filters to empty (scope-bound). */
  resetFilters: () => void;
  /** Clear the left-rail feature-filter draft (scope-bound). */
  clearFeatureFilter: () => void;
  /** Clear the machine-global cross-project recents (the project history). */
  clearProjectHistory: () => void;
  /** Pin the theme preference through the engine-owned setting. */
  setTheme: (value: string) => void;
  /** Run a whitelisted operational verb through the appDispatcher seam. */
  runOp: (target: "core" | "rag", verb: string) => void;
  /** Close the open document editor (store-only no-op when none is open). */
  closeDocument: () => void;
  /** Close ALL open document tabs (#15). */
  closeAllDocuments: () => void;
  /** Reload the active document tab's content from the engine (#15). */
  reloadActiveDocument: () => void;
  /** Peg the active provisional (preview) tab to permanent (#15 "Keep Open"). */
  keepActiveDocumentOpen: () => void;
  /** Set the graph layout frozen flag (scope-bound). */
  setGraphFrozen: (frozen: boolean) => void;
  /** Dock the timeline playhead back to LIVE (time-travel exit; legacy). */
  jumpToLive: () => void;
  /** Fit the timeline to the whole corpus (legacy). */
  fitTimelineToCorpus: () => void;
  /** Set the canonical date_range to the last N days (Issue #14 range preset). */
  setTimelineRangeDays: (days: number) => void;
  /** Clear the canonical date_range filter (Issue #14). */
  clearDateRange: () => void;
  /** Shell window-management intents (toggle rails/timeline, switch tab, reset). */
  toggleLeftRail: () => void;
  toggleLeftCollapsed: () => void;
  toggleRightRail: () => void;
  toggleTimeline: () => void;
  toggleGraph: () => void;
  setRightTab: (tab: unknown) => void;
  resetLayout: () => void;
  showKeyboardShortcuts: () => void;
}

/**
 * The read snapshot + injected effects a `CommandProvider` is allowed to see. It is
 * assembled once per render by the palette read model from raw, stable selectors
 * (stable-selectors) and passed to `resolveCommands`. Providers read from it and
 * never reach a store, so each provider is a pure, unit-testable function.
 */
export interface CommandContext {
  /** Active dashboard scope (null before a scope resolves); mutations are scope-bound. */
  scope: string | null;
  /** True in time-travel mode; the gate removes `disabledInTimeTravel` commands. */
  timeTravel: boolean;
  /** Live keybinding overrides, for deriving each command's inline accelerator
   *  from the keymap registry by shared id (wired in the actions wave). */
  keybindingOverrides: KeybindingOverrides;
  /** Graph layout frozen flag (the graph provider names freeze vs unfreeze). */
  graphFrozen: boolean;
  /** The currently open framework control panel, for pure toggle-label projection. */
  openControlPanel: ControlPanelId | null;
  /** Shell-frame visibility snapshot (the window provider reads these). */
  shell: CommandShellContext;
  /** The open document's stem for document-scoped verbs (copy-link), or null/absent
   *  when no document — or a non-document tab — is active. A provider enrolls its
   *  doc-scoped commands only when this resolves. */
  activeDocumentStem?: string | null;
  /** Runtime effect intents the providers fire. */
  intents: CommandIntents;
}

/** A pure provider: the commands one surface contributes for a given context. */
export type CommandProvider = (ctx: CommandContext) => readonly unknown[];

/** Cap the number of registered providers (bounded-by-default). */
export const COMMAND_PROVIDERS_CAP = 64;
/** Cap a single provider's contribution, so one provider cannot flood the plane. */
export const COMMANDS_PER_PROVIDER_CAP = 256;
/** Cap the resolved, de-duplicated command list the palette renders. */
export const RESOLVED_COMMANDS_CAP = 1024;

const providers = new Map<string, CommandProvider>();

function normalizeProviderId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const normalized = id.trim();
  return normalized.length > 0 && normalized.length <= 128 ? normalized : null;
}

/**
 * Normalize one contributed command: it must be a runnable store-only descriptor
 * (a valid `run`, never a `dispatch`) carrying a known `family`. Anything else is
 * dropped — the same defensive contract `normalizePaletteCommand` enforced, now the
 * one canonical normalizer the registry applies to every provider's output.
 */
export function normalizeCommandDescriptor(command: unknown): CommandDescriptor | null {
  if (command === null || typeof command !== "object") return null;
  const family = normalizeCommandFamily((command as { family?: unknown }).family);
  if (family === null) return null;
  const action = normalizeActionDescriptor(command);
  if (action === null || typeof action.run !== "function") return null;
  return { ...action, family, run: action.run };
}

/**
 * Register a command provider under a stable id; returns a disposer. A second
 * registration under the same id replaces the first (mirroring the resolver
 * registry). Registration past the provider cap is ignored (bounded-by-default).
 */
export function registerCommandProvider(id: unknown, provider: unknown): () => void {
  const normalizedId = normalizeProviderId(id);
  if (normalizedId === null || typeof provider !== "function") return () => undefined;
  if (!providers.has(normalizedId) && providers.size >= COMMAND_PROVIDERS_CAP) {
    return () => undefined;
  }
  const erased = provider as CommandProvider;
  providers.set(normalizedId, erased);
  return () => {
    if (providers.get(normalizedId) === erased) providers.delete(normalizedId);
  };
}

export function hasCommandProvider(id: unknown): boolean {
  const normalizedId = normalizeProviderId(id);
  return normalizedId === null ? false : providers.has(normalizedId);
}

/**
 * Resolve the full command list for a context. Every registered provider is called,
 * its output normalized and capped, the results de-duplicated by id (first wins),
 * the central time-travel gate applied once (mutating commands marked
 * `disabledInTimeTravel` are REMOVED in historical mode, so no provider re-derives
 * the gate), and the whole list bounded. Query filtering and family grouping stay
 * with the caller (the palette read model), which already owns them.
 */
export function resolveCommands(ctx: CommandContext): CommandDescriptor[] {
  const seen = new Set<string>();
  const out: CommandDescriptor[] = [];
  for (const provider of providers.values()) {
    let contributed: readonly unknown[];
    try {
      contributed = provider(ctx);
    } catch {
      // A throwing provider degrades to no commands rather than breaking the plane.
      continue;
    }
    if (!Array.isArray(contributed)) continue;
    let perProvider = 0;
    for (const raw of contributed) {
      if (perProvider >= COMMANDS_PER_PROVIDER_CAP) break;
      const command = normalizeCommandDescriptor(raw);
      if (command === null || seen.has(command.id)) continue;
      if (ctx.timeTravel && command.disabledInTimeTravel === true) continue;
      seen.add(command.id);
      out.push(command);
      perProvider += 1;
      if (out.length >= RESOLVED_COMMANDS_CAP) return out;
    }
  }
  return out;
}

/** Test-only: drop all registered providers. */
export function resetCommandProviders(): void {
  providers.clear();
}
