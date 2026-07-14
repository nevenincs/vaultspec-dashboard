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
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Kbd, Skeleton, SkeletonRow } from "../kit";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageResolutionResult } from "../../platform/localization/fallback";
import { resolveKeycapPresentations } from "../../platform/keymap/chord";
import { isRunnable } from "../../platform/actions/action";
import { localizationNamespaces } from "../../platform/localization/runtime";
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
  useCommandPaletteQuery,
  useSearchPaletteGlobalShortcut,
  useDocumentSearchGlobalShortcut,
} from "../../stores/view/commandPalette";
import { SearchPaletteSurface } from "./SearchPaletteSurface";
import { DocumentSearchSurface } from "./DocumentSearchSurface";
import {
  commandPaletteMovedRunnableCursor,
  deriveCommandPaletteArmedRepair,
  deriveCommandPaletteActivation,
  deriveCommandPaletteKeyboardIntent,
  deriveCommandPalettePresentationView,
  groupByFamily,
  useCommandPaletteCommandView,
} from "../../stores/view/commandPaletteCommands";
import {
  filterResolvedPaletteCommands,
  repairCommandPaletteCursorById,
  resolvePaletteCommands,
  type CommandPaletteProjectionSnapshot,
} from "./commandPalettePresentation";
import { trapTabFocus } from "../chrome/focusTrap";
import { useDismissOnEscape } from "../chrome/useDismissOnEscape";
import { useFocusRestore } from "../chrome/useFocusRestore";
import { ActionConfirmationDialog } from "../chrome/ActionConfirmationDialog";

// --- the palette -----------------------------------------------------------------------

export function commandFamilyHeading(
  resolution: MessageResolutionResult,
): string | null {
  return resolution.usedFallback ? null : resolution.message;
}

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
  const resolveMessage = useLocalizedMessageResolver();
  const { i18n } = useTranslation(localizationNamespaces, { useSuspense: false });
  const locale = i18n.resolvedLanguage ?? i18n.language;
  // Platform confirm guard for ops commands (W03.P04.S08 consolidation):
  // replaces the bespoke `armed: string | null` state. A single slot keyed
  // on "ops:run" is correct because only one cursor position can be active;
  // armedCommandId tracks which specific command is in confirm-mode for the
  // label display so navigating away re-arms the new command cleanly.
  const confirmable = useConfirmable<void>("ops:run");
  const armedCommandId = useCommandPaletteArmedCommandId();
  const [pendingConfirmationId, setPendingConfirmationId] = useState<string | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Stable id roots so role=combobox / listbox / option wire together and
  // aria-activedescendant can name the cursor row.
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const liveRegionId = `${baseId}-live`;
  const optionId = (optionDomIdPart: string) => `${baseId}-opt-${optionDomIdPart}`;

  const rawCommandView = useCommandPaletteCommandView();
  const commandView = useMemo(() => {
    const resolved = resolvePaletteCommands(rawCommandView.commands, resolveMessage);
    const matchedResults = filterResolvedPaletteCommands(resolved, query, locale);
    const groups = groupByFamily(matchedResults);
    const ordered = groups.flatMap((group) => group.commands);
    return {
      groups,
      ordered,
      matchedResults: ordered,
      noMatch: ordered.length === 0,
      navLoading: rawCommandView.navLoading,
    };
  }, [locale, query, rawCommandView, resolveMessage]);
  const { ordered } = commandView;
  const pendingRawCommand =
    pendingConfirmationId === null
      ? undefined
      : rawCommandView.commands.find((command) => command.id === pendingConfirmationId);
  const pendingPresentedCommand =
    pendingConfirmationId === null
      ? undefined
      : ordered.find((command) => command.id === pendingConfirmationId);
  const pendingConfirmation = pendingRawCommand?.confirmation;
  const pendingConfirmationValid =
    pendingConfirmationId !== null &&
    pendingConfirmation !== undefined &&
    pendingPresentedCommand !== undefined &&
    pendingPresentedCommand.presentationSafe &&
    pendingPresentedCommand.disabled !== true &&
    pendingRawCommand !== undefined &&
    isRunnable(pendingRawCommand);
  const projectionRef = useRef<CommandPaletteProjectionSnapshot | null>(null);
  const projectedCursor = repairCommandPaletteCursorById(
    projectionRef.current,
    query,
    cursor,
    ordered,
  );

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
    setPendingConfirmationId(null);
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

  const cancelTypedConfirmation = useCallback(() => {
    setPendingConfirmationId(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useDismissOnEscape(close, {
    enabled: open && pendingConfirmationId === null,
    preventDefault: true,
  });

  useFocusRestore(open, {
    onOpen: () => inputRef.current?.focus(),
    onClose: reset,
  });

  const presentation = deriveCommandPalettePresentationView(commandView, {
    cursor: projectedCursor,
    confirmArmed: confirmable.armed,
    armedCommandId,
  });
  const { activeCommand, safeCursor } = presentation;

  useEffect(() => {
    const nextCursor = safeCursor < 0 ? 0 : safeCursor;
    if (cursor !== nextCursor) setCommandPaletteCursor(nextCursor);
    projectionRef.current = {
      query,
      cursor: nextCursor,
      orderedIds: ordered.map((command) => command.id),
      activeCommandId: activeCommand?.id ?? null,
    };
  }, [activeCommand?.id, cursor, ordered, query, safeCursor]);

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

  useEffect(() => {
    if (pendingConfirmationId !== null && !pendingConfirmationValid) {
      cancelTypedConfirmation();
    }
  }, [cancelTypedConfirmation, pendingConfirmationId, pendingConfirmationValid]);

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
    if (activation.kind === "confirm") {
      disarm();
      const current = rawCommandView.commands.find(
        (command) => command.id === activation.commandId,
      );
      if (current?.confirmation === undefined) return;
      setPendingConfirmationId(activation.commandId);
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
    if (ordered[index]?.disabled === true) return;
    disarm();
    setCommandPaletteCursor(index);
  };

  const moveCursor = (delta: 1 | -1) => {
    if (ordered.length === 0) return;
    setCursorTo(commandPaletteMovedRunnableCursor(ordered, safeCursor, delta));
  };

  const confirmTypedAction = useCallback(() => {
    if (!pendingConfirmationValid || pendingRawCommand === undefined) return;
    setPendingConfirmationId(null);
    pendingRawCommand.run();
    close();
  }, [close, pendingConfirmationValid, pendingRawCommand]);

  return (
    <>
      {pendingConfirmationId === null && (
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
                  className="px-fg-4 py-fg-3 text-center text-ink-muted"
                >
                  {presentation.noMatchMessage}
                </li>
              )}
              {presentation.rowGroups.map((group) => {
                const heading = commandFamilyHeading(resolveMessage(group.label));
                return (
                  <li key={group.family} role="presentation">
                    {heading !== null && (
                      <div className="px-fg-4 pt-fg-2 pb-fg-0-5 text-caption font-medium text-ink-faint">
                        {heading}
                      </div>
                    )}
                    <ul role="presentation">
                      {group.rows.map((row) => {
                        const accelerator = row.accelerator
                          ? resolveKeycapPresentations(
                              row.accelerator,
                              resolveMessage,
                            ).join("+")
                          : "";
                        return (
                          <li key={row.id} role="presentation">
                            <button
                              type="button"
                              id={optionId(row.optionDomIdPart)}
                              role="option"
                              aria-selected={row.selected}
                              aria-disabled={row.disabled || undefined}
                              disabled={row.disabled}
                              title={row.disabledReason}
                              tabIndex={-1}
                              onMouseEnter={() => setCursorTo(row.index)}
                              onClick={() => runAt(row.index)}
                              className={row.rowClassName}
                            >
                              <span className={row.labelClassName}>{row.label}</span>
                              <span className="flex items-center gap-fg-2 text-label text-ink-faint">
                                {accelerator.length > 0 && !row.armed && (
                                  <Kbd>{accelerator}</Kbd>
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
                );
              })}
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
      )}
      {pendingConfirmationValid && pendingConfirmation !== undefined && (
        <ActionConfirmationDialog
          open
          confirmation={pendingConfirmation}
          onConfirm={confirmTypedAction}
          onCancel={cancelTypedConfirmation}
        />
      )}
    </>
  );
}
