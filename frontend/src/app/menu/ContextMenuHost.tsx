// The context-menu host (dashboard-context-menus ADR, layer 5): one floating
// app-chrome surface, mounted once, that renders the singleton menu. It reads
// the open-state slice (entity + anchor), derives the items from the resolver
// registry (pure, time-travel-reactive), and renders a compact lifted panel at
// the anchor - flipped/clamped into the viewport, light-dismissed, focus-trapped,
// with the role=menu a11y contract and arm-to-confirm for destructive items.
//
// Layer ownership (dashboard-layer-ownership): app-chrome reads stores through
// hooks and dispatches intent; it never fetches the engine. Mutating actions
// dispatch through the appDispatcher seam (actions-dispatch-through-the-one-seam);
// store-only intents call their `run` closure. Confirm is the menu's own
// two-step over the slice's armedItemId, so it owns one disarm path.

import { CornerDownLeft } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type { ActionDescriptor } from "../../platform/actions/action";
import { useCanDispatchAction, useDispatch } from "../../platform/dispatch/useAction";
import { logger } from "../../platform/logger/logger";
import {
  useActiveScope,
  useDashboardSelectedNodeId,
  useDashboardState,
} from "../../stores/server/queries";
import {
  armContextMenuItem,
  closeContextMenu,
  deriveContextMenuActivation,
  deriveContextMenuPanelPosition,
  deriveContextMenuCursorEdge,
  deriveContextMenuKeyboardIntent,
  deriveContextMenuCursorMove,
  deriveContextMenuCursorRepair,
  disarmContextMenu,
  setContextMenuCursor,
  setContextMenuPosition,
  useContextMenuResolvedView,
  useContextMenuViewportDismiss,
} from "../../stores/view/contextMenu";
import { useFocusRestore } from "../chrome/useFocusRestore";

const menuLog = logger.child("context-menu");

export function ContextMenuHost({
  timeTravel = false,
}: {
  timeTravel?: unknown;
} = {}) {
  const scope = useActiveScope();
  const selectedNodeId = useDashboardSelectedNodeId(scope);
  // The active graph corpus rides the resolver context like scope does, so a
  // vault-only verb (the commit row's time-travel entry) disables honestly in
  // code mode (code-timeline-range ADR).
  const corpus = useDashboardState(scope).data?.corpus;
  const menu = useContextMenuResolvedView(timeTravel, selectedNodeId, scope, corpus);
  const {
    open,
    entity,
    anchor,
    armedItemId,
    actions,
    rowGroups,
    ordered,
    activeRow,
    runnableIndices,
    cursor,
    position,
    menuAriaLabel,
    emptyMessage,
    liveMessage,
  } = menu;
  const dispatch = useDispatch();
  const canDispatch = useCanDispatchAction();

  const panelRef = useRef<HTMLDivElement>(null);

  const baseId = useId();
  const liveRegionId = `${baseId}-live`;
  const itemId = (id: string) => `${baseId}-item-${id}`;

  useContextMenuViewportDismiss();

  // The menu projection can change while open when canonical app state changes
  // underneath it (notably dashboard time-travel removing mutating actions). Keep
  // cursor and arm state attached to the CURRENT derived item set, not a stale row.
  useEffect(() => {
    if (!open) return;
    const repair = deriveContextMenuCursorRepair(menu);
    if (repair.changed) setContextMenuCursor(repair.cursor);
    if (repair.disarm) disarmContextMenu();
  }, [open, menu]);

  useFocusRestore(open, {
    onOpen: () =>
      setContextMenuCursor(deriveContextMenuCursorEdge(runnableIndices, "first") ?? 0),
  });

  // Measure then flip/clamp into the viewport once the panel is laid out.
  useLayoutEffect(() => {
    if (!open || !anchor || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    setContextMenuPosition(
      deriveContextMenuPanelPosition(
        anchor,
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [open, anchor, actions]);

  // Move DOM focus to the active item so the role=menu reads correctly.
  const activeId = activeRow?.id;
  useEffect(() => {
    if (!open || position === null || !activeId) return;
    document.getElementById(`${baseId}-item-${activeId}`)?.focus();
  }, [open, position, activeId, baseId]);

  const moveCursor = useCallback(
    (delta: 1 | -1) => {
      const nextCursor = deriveContextMenuCursorMove(cursor, runnableIndices, delta);
      if (nextCursor === null) return;
      // Disarm any pending confirm when the cursor leaves the armed row.
      disarmContextMenu();
      setContextMenuCursor(nextCursor);
    },
    [cursor, runnableIndices],
  );

  const activate = useCallback(
    (action: ActionDescriptor) => {
      const activation = deriveContextMenuActivation(action, armedItemId, canDispatch);
      if (activation.kind === "ignore") return;
      if (activation.kind === "arm") {
        armContextMenuItem(activation.itemId);
        return;
      }
      if (activation.kind === "missing-dispatch") {
        // Degrade honestly (M2): an unregistered terminal handler must not throw
        // inside a React event handler. Log and close rather than crash.
        menuLog.warn(`no handler for menu action "${activation.type}"`);
      } else if (activation.kind === "dispatch") {
        dispatch(activation.dispatch);
      } else {
        activation.action.run?.();
      }
      closeContextMenu();
    },
    [armedItemId, canDispatch, dispatch],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const intent = deriveContextMenuKeyboardIntent(e.key);
      if (intent === null) return;
      e.preventDefault();
      // Stop the consumed key (arrows/Enter/Escape) from bubbling to the one
      // global keymap dispatcher's window listener, which binds bare arrows to
      // graph cycling — an un-stopped menu arrow would move the cursor AND the
      // graph selection (keyboard-navigation W06.P09.S28, the Class-B isolation).
      e.stopPropagation();
      if (intent.kind === "close") {
        closeContextMenu();
      } else if (intent.kind === "move-cursor") {
        moveCursor(intent.delta);
      } else if (intent.kind === "cursor-edge") {
        disarmContextMenu();
        const edgeCursor = deriveContextMenuCursorEdge(runnableIndices, intent.edge);
        if (edgeCursor !== null) setContextMenuCursor(edgeCursor);
      } else {
        const action = ordered[cursor];
        if (action) activate(action);
      }
    },
    [moveCursor, runnableIndices, ordered, cursor, activate],
  );

  if (!open || !entity || !anchor) return null;

  // Hidden until measured so the first paint never flashes at the wrong spot.
  const placed = position !== null;

  return createPortal(
    <div
      // Invisible full-screen catcher: a click anywhere outside the panel
      // dismisses (light-dismiss, not a modal scrim).
      className="fixed inset-0 z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeContextMenu();
      }}
      onContextMenu={(e) => {
        // A right-click on the catcher (outside the panel) closes the menu and
        // suppresses the native menu, matching cohort behaviour.
        e.preventDefault();
        closeContextMenu();
      }}
    >
      <div
        ref={panelRef}
        role="menu"
        aria-label={menuAriaLabel}
        aria-activedescendant={activeRow ? itemId(activeRow.id) : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          // A right-click inside the open menu must not bubble to the catcher
          // and dismiss it (L1); suppress the native menu and keep this one open.
          e.preventDefault();
          e.stopPropagation();
        }}
        style={{
          position: "fixed",
          left: position ? position.x : anchor.x,
          top: position ? position.y : anchor.y,
          visibility: placed ? "visible" : "hidden",
        }}
        className="flex max-h-[min(24rem,calc(100vh-1rem))] w-56 max-w-[calc(100vw-1rem)] flex-col overflow-y-auto rounded-fg-lg border border-rule bg-paper-raised p-fg-1 text-body shadow-fg-popover animate-fade-in"
      >
        {ordered.length === 0 && (
          <div className="px-fg-3 py-fg-2 text-center text-label text-ink-faint">
            {emptyMessage}
          </div>
        )}
        {rowGroups.map((group, gi) => (
          <div
            key={group.section}
            role="presentation"
            className="flex flex-col gap-fg-0-5"
          >
            {gi > 0 && (
              // Inset divider: a symmetrically-inset hairline, padded from the
              // edges to match the inset rounded selection rects, so the
              // separator reads as a soft section break.
              <div role="separator" className="py-fg-0-5 px-fg-1">
                <div className="h-px bg-rule" />
              </div>
            )}
            {group.rows.map((row) => {
              const Mark = row.icon;
              const action = row.action;
              return (
                <button
                  key={row.id}
                  type="button"
                  id={itemId(row.id)}
                  role="menuitem"
                  tabIndex={row.selected ? 0 : -1}
                  aria-disabled={row.disabled || undefined}
                  title={row.disabledReason}
                  onMouseEnter={() => {
                    if (!row.disabled) {
                      disarmContextMenu();
                      setContextMenuCursor(row.index);
                    }
                  }}
                  onClick={() => {
                    if (!row.disabled) setContextMenuCursor(row.index);
                    activate(action);
                  }}
                  className={`flex w-full items-center gap-fg-1 rounded-fg-xs px-fg-2 py-fg-0-5 text-left transition-colors duration-ui-fast ${row.className}`}
                >
                  {Mark ? (
                    <Mark aria-hidden size={14} className={row.iconClassName} />
                  ) : (
                    <span aria-hidden className={row.iconSpacerClassName} />
                  )}
                  <span className={row.labelClassName}>{row.label}</span>
                  {row.confirmShortcutLabel && (
                    <span aria-hidden className={row.confirmShortcutClassName}>
                      {row.confirmShortcutLabel}
                    </span>
                  )}
                  {row.acceleratorLabel && (
                    <span className={row.acceleratorClassName}>
                      {row.acceleratorLabel}
                    </span>
                  )}
                  {row.selectionHintVisible && (
                    <CornerDownLeft
                      aria-hidden
                      size={12}
                      className={row.selectionHintClassName}
                    />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Polite live region: entity, focused item, and the arm prompt. */}
      <div id={liveRegionId} aria-live="polite" className="sr-only">
        {liveMessage}
      </div>
    </div>,
    document.body,
  );
}
