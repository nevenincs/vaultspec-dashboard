// The command palette (W02.P07.S23, command-palette ADR): the Ctrl/Cmd-K
// lifted surface — the universal navigation and verb plane and the cheap
// escape hatch that keeps the chrome minimal. Fronts navigation (features by
// name), lenses (apply and save), and the whitelisted ops verbs — all on
// committed primitives; nothing here exists only in the palette.
//
// Re-grounded onto the base design language (design-language ADR): it renders
// on the modal step of the elevation tier (shadow-deep), consumes the semantic
// token surface only (no hardcoded hex/px), shows inline shortcut hints, and
// honours the keyboard-first / reduced-motion laws. Chrome icons are Lucide.
//
// Layer ownership (dashboard-layer-ownership): app-chrome reads store state
// through stores hooks/selectors and emits intent only — it never fetches the
// engine and never reads the raw `tiers` block. Every ops verb dispatches
// through the `appDispatcher` seam (`dispatchOps`), the single logged, traced,
// guardable point that touches the engine client.

import { CornerDownLeft, Search } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { useConfirmable } from "../../platform/dispatch/useAction";
import { useFiltersVocabulary } from "../../stores/server/queries";
import { BUILTIN_LENSES, useLensStore } from "../../stores/view/lenses";
import { selectNode } from "../../stores/view/selection";
import { useViewStore } from "../../stores/view/viewStore";
import { OPS_WHITELIST } from "../right/OpsPanel";
import { dispatchOps } from "../right/opsActions";
import { useActiveScope } from "../stage/Stage";

// --- pure command assembly (unit-tested) --------------------------------------------

/** The four command families, ordered as they group in the list. */
export type CommandFamily = "navigate" | "filters" | "core" | "rag";

export interface PaletteCommand {
  id: string;
  label: string;
  /** The family this command belongs to (drives grouping + the row hint). */
  family: CommandFamily;
  run: () => void;
  /** Destructive verbs arm on first Enter, run on the second. */
  confirm?: boolean;
}

/** Human-facing group heading per family (object-then-action taxonomy). */
export const FAMILY_LABEL: Record<CommandFamily, string> = {
  navigate: "navigate",
  filters: "filters",
  core: "core ops",
  rag: "rag ops",
};

export interface PaletteSources {
  featureTags: readonly string[];
  lensNames: readonly string[];
  query: string;
  applyLens: (name: string) => void;
  saveLens: (name: string) => void;
  runOp: (target: "core" | "rag", verb: string) => void;
  navigate: (nodeId: string) => void;
}

export function buildCommands(sources: PaletteSources): PaletteCommand[] {
  const commands: PaletteCommand[] = [];
  for (const feature of sources.featureTags) {
    commands.push({
      id: `nav:${feature}`,
      label: `go to ${feature}`,
      family: "navigate",
      run: () => sources.navigate(`feature:${feature}`),
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
      run: () => sources.runOp(target, verb),
    });
  }
  const trimmed = sources.query.trim();
  if (trimmed.length > 0) {
    commands.push({
      id: `save-lens:${trimmed}`,
      label: `save current filters as lens "${trimmed}"`,
      family: "filters",
      run: () => sources.saveLens(trimmed),
    });
  }
  return commands;
}

export function filterCommands(
  commands: readonly PaletteCommand[],
  query: string,
): PaletteCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...commands];
  // Forgiving of word order / partial tokens: every whitespace token of the
  // query must appear in the label, in any order (the ADR's fuzzy law).
  const tokens = needle.split(/\s+/).filter(Boolean);
  return commands.filter((c) => {
    const label = c.label.toLowerCase();
    return tokens.every((t) => label.includes(t));
  });
}

/** Group the flat list into families, preserving the canonical family order. */
const FAMILY_ORDER: CommandFamily[] = ["navigate", "filters", "core", "rag"];

export function groupByFamily(
  commands: readonly PaletteCommand[],
): { family: CommandFamily; commands: PaletteCommand[] }[] {
  return FAMILY_ORDER.map((family) => ({
    family,
    commands: commands.filter((c) => c.family === family),
  })).filter((group) => group.commands.length > 0);
}

// --- the palette -----------------------------------------------------------------------

/**
 * Tab-order focusable descendants of a container. Anything with
 * `tabindex="-1"` is programmatically focusable but NOT a tab stop, so it is
 * excluded — the result rows carry `tabindex=-1` and must not count toward the
 * trap's first/last boundary, or the input would stop being the first stop.
 */
function focusablesOf(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      "a[href], button, input, select, textarea, [tabindex]",
    ),
  ).filter((el) => {
    if (el.hasAttribute("disabled")) return false;
    if (el.getAttribute("tabindex") === "-1") return false;
    return true;
  });
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  // The last ops dispatch result surfaced inline (degraded/error truth): the
  // palette stays open and shows a legible message rather than failing
  // silently or implying success.
  const [opsMessage, setOpsMessage] = useState<string | null>(null);
  // Platform confirm guard for ops commands (W03.P04.S08 consolidation):
  // replaces the bespoke `armed: string | null` state. A single slot keyed
  // on "ops:run" is correct because only one cursor position can be active;
  // armedCommandId tracks which specific command is in confirm-mode for the
  // label display so navigating away re-arms the new command cleanly.
  const confirmable = useConfirmable<void>("ops:run");
  const [armedCommandId, setArmedCommandId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Focus restore: the palette returns focus to wherever the user was when it
  // opened (the audit's focus-restore obligation).
  const previousFocus = useRef<HTMLElement | null>(null);
  // Stable id roots so role=combobox / listbox / option wire together and
  // aria-activedescendant can name the cursor row.
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const liveRegionId = `${baseId}-live`;
  const optionId = (id: string) => `${baseId}-opt-${id}`;

  const scope = useActiveScope();
  const vocabulary = useFiltersVocabulary(scope);
  // Select the stable slice and compose builtins memoized: a selector
  // returning a fresh array per snapshot loops useSyncExternalStore
  // (caught by the 032 interactive test).
  const saved = useLensStore((s) => s.saved);
  const lenses = useMemo(() => [...BUILTIN_LENSES, ...saved], [saved]);
  const timeTravel = useViewStore((s) => s.timelineMode.kind === "time-travel");
  // Loading liveness: the navigate family is still resolving (vocabulary
  // pending) — shown as a subtle cue per family, never a blank list.
  const navLoading = scope !== null && vocabulary.isPending;

  // Disarm any pending ops confirm and clear the armed-row id. Both close() and
  // reset() funnel through this so no exit path can leak an armed slot into the
  // process-wide appConfirmGuard (ADR: closing/navigating/editing disarms).
  const disarm = useCallback(() => {
    confirmable.cancel();
    setArmedCommandId(null);
  }, [confirmable]);

  const reset = useCallback(() => {
    setQuery("");
    setCursor(0);
    setOpsMessage(null);
    disarm();
  }, [disarm]);

  // The single close path: disarm, then hide. Every exit (Escape, Ctrl/Cmd-K
  // toggle, backdrop dismiss, activating a non-confirm command) routes here so
  // the armed state is always cleared on the way out.
  const close = useCallback(() => {
    disarm();
    setOpen(false);
  }, [disarm]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        // Toggle: if open, close (disarming); if closed, open with a clean slate.
        if (open) close();
        else {
          reset();
          setOpen(true);
        }
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      previousFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      inputRef.current?.focus();
    } else {
      previousFocus.current?.focus();
      previousFocus.current = null;
    }
  }, [open]);

  const commands = useMemo(() => {
    const all = buildCommands({
      featureTags: vocabulary.data?.feature_tags ?? [],
      lensNames: lenses.map((l) => l.name),
      query,
      applyLens: (name) => useLensStore.getState().apply(name),
      saveLens: (name) => useLensStore.getState().saveCurrent(name),
      // Route through the platform dispatch seam (palette-ops-dispatch-through-
      // the-seam): dispatchOps is the single logged/traced/guardable engine
      // touch. The result/error is surfaced inline so degradation reads as a
      // designed state rather than a silent failure.
      runOp: (target, verb) => {
        setOpsMessage(`${verb}: running…`);
        dispatchOps({ target, verb }).then(
          (result) => setOpsMessage(`${verb}: ${result.ok ? "ok" : "unavailable"}`),
          (err) =>
            setOpsMessage(
              `${verb}: ${err instanceof Error ? err.message : "unavailable"}`,
            ),
        );
      },
      navigate: (nodeId) => selectNode(nodeId),
    });
    // Ops verbs disappear in time-travel (the G4.b gate applies everywhere).
    const gated = timeTravel ? all.filter((c) => !c.id.startsWith("ops:")) : all;
    return filterCommands(gated, query);
  }, [vocabulary.data, lenses, query, timeTravel]);

  const groups = useMemo(() => groupByFamily(commands), [commands]);
  // The cursor walks DISPLAY order, not raw build order: grouping re-orders the
  // rows (filters before ops, save-lens folded into filters), so the keyboard
  // cursor and the visually-highlighted row must index the same flattened
  // group order or they desync.
  const ordered = useMemo(() => groups.flatMap((g) => g.commands), [groups]);

  // The contextual "save current filters as lens" command always matches its
  // own query, so it can never be the SEARCH result the no-match state is about.
  // No-match is shown when nothing but that contextual action matched.
  const matchedResults = useMemo(
    () => ordered.filter((c) => !c.id.startsWith("save-lens:")),
    [ordered],
  );
  const noMatch = matchedResults.length === 0;

  // Keep the cursor inside the current result set as it narrows.
  const safeCursor = ordered.length === 0 ? -1 : Math.min(cursor, ordered.length - 1);
  const activeCommand = safeCursor >= 0 ? ordered[safeCursor] : undefined;

  // The polite live-region message: result count + selection, plus the armed
  // prompt — de-duplicated so fast typing does not flood assistive tech.
  const liveMessage = useMemo(() => {
    if (noMatch) {
      // a11y honesty: when no SEARCH result matched but the contextual
      // save-lens row is the sole survivor (and is the aria-selected row),
      // announce that affordance rather than a bare "nothing matches".
      const saveLens = ordered.find((c) => c.id.startsWith("save-lens:"));
      return saveLens ? `no matches — ${saveLens.label}` : "nothing matches";
    }
    const count = `${matchedResults.length} command${
      matchedResults.length === 1 ? "" : "s"
    }`;
    if (activeCommand && confirmable.armed && armedCommandId === activeCommand.id) {
      return `${count}. confirm ${activeCommand.label}?`;
    }
    return activeCommand ? `${count}. ${activeCommand.label}` : count;
  }, [
    noMatch,
    ordered,
    matchedResults.length,
    activeCommand,
    confirmable.armed,
    armedCommandId,
  ]);

  if (!open) return null;

  const runAt = (index: number) => {
    const command = ordered[index];
    if (!command) return;
    if (command.confirm) {
      if (!confirmable.armed || armedCommandId !== command.id) {
        // Arm (or re-arm after navigating to a different confirm command).
        if (confirmable.armed) confirmable.cancel();
        setArmedCommandId(command.id);
        confirmable.trigger();
        return;
      }
      // Second Enter on the same armed command: disarm then fire. The palette
      // stays open so the inline ops message remains visible.
      disarm();
      command.run();
      return;
    }
    // Non-confirm command: disarm any other pending ops arm BEFORE running, so
    // activating a navigation/lens row while an ops verb is armed cannot leave
    // the guard slot armed after close.
    disarm();
    command.run();
    close();
  };

  // Move the cursor to an explicit index, disarming any pending confirm so the
  // armed row can never desync from the visually-selected row (shared by the
  // keyboard moveCursor and the pointer onMouseEnter path).
  const setCursorTo = (index: number) => {
    disarm();
    setCursor(index);
  };

  const moveCursor = (delta: 1 | -1) => {
    if (ordered.length === 0) return;
    setCursorTo(
      Math.min(ordered.length - 1, Math.max(0, (cursor < 0 ? 0 : cursor) + delta)),
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 pt-24 animate-fade-in"
      onMouseDown={(e) => {
        // Backdrop dismiss only on the scrim itself — a click inside the panel
        // (which stops propagation) must not close it. Routes through close()
        // so the dismiss disarms any pending ops confirm.
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="command palette"
        className="flex w-[32rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-vs-xl border border-rule bg-paper-raised shadow-deep animate-slide-in-down"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Real focus trap: Tab / Shift+Tab cycle within the dialog so focus
          // can never escape to the chrome behind the scrim while open.
          if (e.key !== "Tab" || !panelRef.current) return;
          const focusables = focusablesOf(panelRef.current);
          if (focusables.length === 0) {
            e.preventDefault();
            return;
          }
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          const activeEl = document.activeElement;
          if (e.shiftKey && activeEl === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && activeEl === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        {/* Search affordance + query input (combobox over the listbox). */}
        <div className="flex items-center gap-vs-2 border-b border-rule px-vs-4">
          <Search aria-hidden className="size-4 shrink-0 text-ink-faint" />
          <input
            ref={inputRef}
            value={query}
            role="combobox"
            aria-expanded
            aria-controls={listboxId}
            aria-activedescendant={
              activeCommand ? optionId(activeCommand.id) : undefined
            }
            aria-autocomplete="list"
            onChange={(e) => {
              // Editing the query disarms (ADR: editing the query disarms a
              // pending confirm cleanly).
              setQuery(e.target.value);
              setCursor(0);
              setOpsMessage(null);
              disarm();
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                moveCursor(1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                moveCursor(-1);
              } else if (e.key === "Enter") {
                e.preventDefault();
                runAt(safeCursor);
              }
            }}
            placeholder="type a command, feature, or lens…"
            className="w-full bg-transparent py-vs-3 text-body text-ink outline-none placeholder:text-ink-faint"
          />
        </div>

        {/* The result listbox: families grouped, rows are options. */}
        <ul
          id={listboxId}
          role="listbox"
          aria-label="commands"
          className="max-h-80 overflow-y-auto py-vs-1 text-body"
        >
          {noMatch && (
            <li
              role="presentation"
              className="px-vs-4 py-vs-3 text-center text-ink-faint"
            >
              nothing matches
            </li>
          )}
          {groups.map((group) => (
            <li key={group.family} role="presentation">
              <div className="px-vs-4 pt-vs-2 pb-vs-0-5 text-2xs font-medium uppercase tracking-wide text-ink-faint">
                {FAMILY_LABEL[group.family]}
              </div>
              <ul role="presentation">
                {group.commands.map((command) => {
                  const index = ordered.indexOf(command);
                  const selected = index === safeCursor;
                  const armed = confirmable.armed && armedCommandId === command.id;
                  return (
                    <li key={command.id} role="presentation">
                      <button
                        type="button"
                        id={optionId(command.id)}
                        role="option"
                        aria-selected={selected}
                        tabIndex={-1}
                        onMouseEnter={() => setCursorTo(index)}
                        onClick={() => runAt(index)}
                        className={`flex w-full items-center justify-between border-l-2 rounded-r-vs-sm py-vs-1-5 pr-vs-4 pl-vs-3 text-left transition-colors duration-ui-fast ease-settle ${
                          selected
                            ? "border-accent bg-paper-sunken text-ink"
                            : "border-transparent text-ink-muted hover:bg-paper-sunken hover:text-ink"
                        }`}
                      >
                        <span className={armed ? "text-state-stale" : undefined}>
                          {armed ? `confirm ${command.label}?` : command.label}
                        </span>
                        <span className="flex items-center gap-vs-2 text-label text-ink-faint">
                          {command.confirm && (
                            <span
                              className="rounded-vs-sm border border-rule px-vs-1 py-vs-0-5 font-mono text-2xs"
                              aria-hidden
                            >
                              ⏎ ⏎
                            </span>
                          )}
                          {selected && !command.confirm && (
                            <CornerDownLeft
                              aria-hidden
                              className="size-3 text-ink-faint"
                            />
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
          {navLoading && (
            <li
              role="presentation"
              className="flex items-center gap-vs-2 px-vs-4 py-vs-2 text-label text-ink-faint"
            >
              <span
                aria-hidden
                className="size-2 rounded-full bg-state-live animate-pulse-live"
              />
              loading navigation…
            </li>
          )}
        </ul>

        {/* Inline ops result / degradation truth (does not close the palette). */}
        {opsMessage && (
          <div
            role="status"
            className="border-t border-rule px-vs-4 py-vs-2 text-label text-ink-muted"
          >
            {opsMessage}
          </div>
        )}

        {/* Polite live region: result count, selection, and arm prompt. */}
        <div id={liveRegionId} aria-live="polite" className="sr-only">
          {liveMessage}
        </div>
      </div>
    </div>
  );
}
