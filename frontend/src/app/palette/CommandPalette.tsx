// The command palette (W02.P07.S23, command-palette ADR): the Ctrl/Cmd-K
// lifted surface — the universal navigation and verb plane and the cheap
// escape hatch that keeps the chrome minimal. Fronts navigation (features by
// name), lenses (apply and save), and the whitelisted ops verbs — all on
// committed primitives; nothing here exists only in the palette.
//
// Re-grounded onto the base design language (design-language ADR): it renders
// on the modal step of the elevation tier (shadow-fg-popover), consumes the
// semantic token surface only (no hardcoded hex/px), shows inline shortcut hints,
// and honours the keyboard-first / reduced-motion laws. Chrome icons are Lucide.
//
// W02.P06 (figma-parity-reconciliation): rebuilt faithfully to the binding Figma
// CommandPalette frame (17:1320) on the canonical Figma role-named type scale and
// radius/elevation (text-caption, rounded-fg-lg/xs, shadow-fg-popover) in place of
// the legacy alias shims. It stays a dumb projection over the preserved command
// registry — every row is a committed primitive routed through the dispatch seam.
//
// Layer ownership (dashboard-layer-ownership): app-chrome reads store state
// through stores hooks/selectors and emits intent only — it never fetches the
// engine and never reads the raw `tiers` block. Every ops verb dispatches
// through the stores-owned ops-run seam, whose terminal effect dispatches through
// the single logged, traced, guardable point that touches the engine client.

import { CornerDownLeft, Search } from "lucide-react";
import { useCallback, useEffect, useId, useRef } from "react";

import { Kbd, Skeleton, SkeletonRow } from "../kit";
import { useConfirmable } from "../../platform/dispatch/useAction";
import {
  closeCommandPalette,
  resetCommandPaletteSurfaceState,
  resetCommandPaletteOpsFeedback,
  setCommandPaletteArmedCommandId,
  setCommandPaletteCursor,
  setCommandPaletteQuery,
  useCommandPaletteGlobalToggle,
  useCommandPaletteArmedCommandId,
  useCommandPaletteCursor,
  useCommandPaletteMode,
  useCommandPaletteOpen,
  useCommandPaletteOpsMessage,
  useCommandPaletteQuery,
  useSearchPaletteGlobalShortcut,
  useDocumentSearchGlobalShortcut,
} from "../../stores/view/commandPalette";
import { SearchPaletteSurface } from "./SearchPaletteSurface";
import { DocumentSearchSurface } from "./DocumentSearchSurface";
import {
  commandPaletteMovedCursor,
  deriveCommandPaletteArmedRepair,
  deriveCommandPaletteActivation,
  deriveCommandPaletteKeyboardIntent,
  deriveCommandPalettePresentationView,
  useCommandPaletteCommandView,
} from "../../stores/view/commandPaletteCommands";
import { trapTabFocus } from "../chrome/focusTrap";
import { useDismissOnEscape } from "../chrome/useDismissOnEscape";
import { useFocusRestore } from "../chrome/useFocusRestore";

// --- the palette -----------------------------------------------------------------------

export function CommandPalette() {
  const open = useCommandPaletteOpen();
  const mode = useCommandPaletteMode();
  const commandPaletteConfirm = useConfirmable<void>("ops:run");
  useCommandPaletteGlobalToggle(commandPaletteConfirm.cancel);
  // The search shortcut (Mod+P) opens the SAME palette in search mode — both modes
  // share the one overlay so Command-K controls searching (filtering-has-one-
  // canonical-surface / keyboard-shortcuts-bind-through-the-one-keymap-registry).
  useSearchPaletteGlobalShortcut(commandPaletteConfirm.cancel);
  // The document shortcut (Mod+Shift+O) opens the SAME overlay in the literal
  // document-finder plane (command-palette-planes ADR).
  useDocumentSearchGlobalShortcut(commandPaletteConfirm.cancel);

  if (!open) return null;
  if (mode === "search") return <SearchPaletteSurface />;
  if (mode === "document") return <DocumentSearchSurface />;
  return <CommandPaletteSurface />;
}

function CommandPaletteSurface() {
  const open = useCommandPaletteOpen();
  const query = useCommandPaletteQuery();
  const cursor = useCommandPaletteCursor();
  const opsMessage = useCommandPaletteOpsMessage();
  // Platform confirm guard for ops commands (W03.P04.S08 consolidation):
  // replaces the bespoke `armed: string | null` state. A single slot keyed
  // on "ops:run" is correct because only one cursor position can be active;
  // armedCommandId tracks which specific command is in confirm-mode for the
  // label display so navigating away re-arms the new command cleanly.
  const confirmable = useConfirmable<void>("ops:run");
  const armedCommandId = useCommandPaletteArmedCommandId();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Stable id roots so role=combobox / listbox / option wire together and
  // aria-activedescendant can name the cursor row.
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const liveRegionId = `${baseId}-live`;
  const optionId = (optionDomIdPart: string) => `${baseId}-opt-${optionDomIdPart}`;

  const commandView = useCommandPaletteCommandView(query);
  const { ordered } = commandView;

  // Disarm any pending ops confirm and clear the armed-row id. Both close() and
  // reset() funnel through this so no exit path can leak an armed slot into the
  // process-wide appConfirmGuard (ADR: closing/navigating/editing disarms).
  const disarm = useCallback(() => {
    confirmable.cancel();
    setCommandPaletteArmedCommandId(null);
  }, [confirmable.cancel]);

  const reset = useCallback(() => {
    resetCommandPaletteSurfaceState();
    resetCommandPaletteOpsFeedback();
    disarm();
  }, [disarm]);

  // The single local close path: disarm, then hide. Every modal-owned exit
  // (Escape, backdrop dismiss, activating a non-confirm command) routes here so
  // lifted palette state is always cleared on the way out. The Mod+K toggle is a
  // registered keybinding handled by the one global keymap dispatcher.
  const close = useCallback(() => {
    reset();
    closeCommandPalette();
  }, [reset]);

  useDismissOnEscape(close, { enabled: open, preventDefault: true });

  useFocusRestore(open, {
    onOpen: () => inputRef.current?.focus(),
    onClose: reset,
  });

  const presentation = deriveCommandPalettePresentationView(commandView, {
    cursor,
    confirmArmed: confirmable.armed,
    armedCommandId,
  });
  const { activeCommand, safeCursor } = presentation;

  // Source-driven command changes (scope swaps, time-travel mode, vocabulary/lens
  // updates) can move or remove the armed row without a keyboard/pointer event.
  // The shared confirm guard must track the currently displayed command, not a
  // stale id from a prior projection.
  useEffect(() => {
    const repair = deriveCommandPaletteArmedRepair(activeCommand, {
      confirmArmed: confirmable.armed,
      armedCommandId,
    });
    if (repair.clearArmedCommandId) setCommandPaletteArmedCommandId(null);
    if (repair.disarm) disarm();
  }, [activeCommand, armedCommandId, confirmable.armed, disarm]);

  if (!open) return null;

  const runAt = (index: number) => {
    const activation = deriveCommandPaletteActivation(ordered, index, {
      confirmArmed: confirmable.armed,
      armedCommandId,
    });
    if (activation.kind === "ignore") return;
    setCommandPaletteCursor(activation.cursor);
    if (activation.kind === "arm") {
      // Arm (or re-arm after navigating to a different confirm command).
      if (confirmable.armed) confirmable.cancel();
      setCommandPaletteArmedCommandId(activation.commandId);
      confirmable.trigger();
      return;
    }
    if (activation.closeAfterRun) {
      // Non-confirm command: disarm any other pending ops arm BEFORE running, so
      // activating a navigation/lens row while an ops verb is armed cannot leave
      // the guard slot armed after close.
      disarm();
      activation.command.run();
      close();
    } else {
      // Second Enter on the same armed command: disarm then fire. The palette stays
      // open so the inline ops message remains visible.
      disarm();
      activation.command.run();
    }
  };

  // Move the cursor to an explicit index, disarming any pending confirm so the
  // armed row can never desync from the visually-selected row (shared by the
  // keyboard moveCursor and the pointer onMouseEnter path).
  const setCursorTo = (index: number) => {
    disarm();
    setCommandPaletteCursor(index);
  };

  const moveCursor = (delta: 1 | -1) => {
    if (ordered.length === 0) return;
    setCursorTo(commandPaletteMovedCursor(ordered.length, cursor, delta));
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
        aria-label={presentation.dialogLabel}
        className="flex w-[32rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-fg-lg border border-rule bg-paper-raised shadow-fg-popover animate-slide-in-down"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => trapTabFocus(panelRef.current, e)}
      >
        {/* Search affordance + query input (combobox over the listbox). */}
        <div className="flex items-center gap-fg-2 border-b border-rule px-fg-4">
          <Search aria-hidden className="size-4 shrink-0 text-ink-faint" />
          <input
            ref={inputRef}
            value={query}
            role="combobox"
            aria-expanded
            aria-controls={listboxId}
            aria-activedescendant={
              presentation.activeOptionDomIdPart
                ? optionId(presentation.activeOptionDomIdPart)
                : undefined
            }
            aria-autocomplete="list"
            onChange={(e) => {
              // Editing the query disarms (ADR: editing the query disarms a
              // pending confirm cleanly).
              setCommandPaletteQuery(e.target.value);
              setCommandPaletteCursor(0);
              resetCommandPaletteOpsFeedback();
              disarm();
            }}
            onKeyDown={(e) => {
              const intent = deriveCommandPaletteKeyboardIntent(e.key);
              if (intent === null) return;
              e.preventDefault();
              if (intent.kind === "move-cursor") moveCursor(intent.delta);
              else runAt(safeCursor);
            }}
            placeholder={presentation.inputPlaceholder}
            className="w-full bg-transparent py-fg-3 text-body text-ink outline-none placeholder:text-ink-faint"
          />
        </div>

        {/* The result listbox: families grouped, rows are options. */}
        <ul
          id={listboxId}
          role="listbox"
          aria-label={presentation.listboxLabel}
          className="max-h-80 overflow-y-auto py-fg-1 text-body"
        >
          {presentation.noMatch && (
            <li
              role="presentation"
              className="px-fg-4 py-fg-3 text-center text-ink-faint"
            >
              {presentation.noMatchMessage}
            </li>
          )}
          {presentation.rowGroups.map((group) => (
            <li key={group.family} role="presentation">
              <div className="px-fg-4 pt-fg-2 pb-fg-0-5 text-caption font-medium uppercase tracking-wide text-ink-faint">
                {group.label}
              </div>
              <ul role="presentation">
                {group.rows.map((row) => {
                  return (
                    <li key={row.id} role="presentation">
                      <button
                        type="button"
                        id={optionId(row.optionDomIdPart)}
                        role="option"
                        aria-selected={row.selected}
                        tabIndex={-1}
                        onMouseEnter={() => setCursorTo(row.index)}
                        onClick={() => runAt(row.index)}
                        className={row.rowClassName}
                      >
                        <span className={row.labelClassName}>{row.label}</span>
                        <span className="flex items-center gap-fg-2 text-label text-ink-faint">
                          {row.accelerator && !row.armed && (
                            <Kbd>{row.accelerator}</Kbd>
                          )}
                          {row.confirmShortcutLabel && (
                            <span
                              className="rounded-fg-xs border border-rule px-fg-1 py-fg-0-5 font-mono text-caption"
                              aria-hidden
                            >
                              {row.confirmShortcutLabel}
                            </span>
                          )}
                          {row.selectionHintVisible && (
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
          {presentation.navLoading && (
            // Loading is UI-ONLY (state-mode-uniformity ADR D2): a text-free skeleton
            // standing in for result rows, the human search message only in the kit
            // `Skeleton`'s sr-only — never on-screen "Searching…" text.
            <li role="presentation" className="px-fg-4 py-fg-2">
              <Skeleton
                label={presentation.navLoadingMessage ?? "Searching…"}
                className="gap-fg-1-5"
              >
                <SkeletonRow width="w-3/4" />
                <SkeletonRow width="w-1/2" />
              </Skeleton>
            </li>
          )}
        </ul>

        {/* Inline ops result / degradation truth (does not close the palette). */}
        {opsMessage && (
          <div
            role="status"
            className="border-t border-rule px-fg-4 py-fg-2 text-label text-ink-muted"
          >
            {opsMessage}
          </div>
        )}

        {/* Footer hints (board 94:2): navigate / open / close with Kbd chips. */}
        <div className="flex items-center gap-fg-3 border-t border-rule px-fg-4 py-fg-2 text-caption text-ink-faint">
          <span className="flex items-center gap-fg-1">
            {presentation.footerHints.navigate} <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
          </span>
          <span className="flex items-center gap-fg-1">
            {presentation.footerHints.open} <Kbd>↵</Kbd>
          </span>
          <span className="flex items-center gap-fg-1">
            {presentation.footerHints.close} <Kbd>esc</Kbd>
          </span>
        </div>

        {/* Polite live region: result count, selection, and arm prompt. */}
        <div id={liveRegionId} aria-live="polite" className="sr-only">
          {presentation.liveMessage}
        </div>
      </div>
    </div>
  );
}
