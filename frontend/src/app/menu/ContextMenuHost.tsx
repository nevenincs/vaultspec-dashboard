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
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";

import {
  ACTION_SECTION_ORDER,
  isRunnable,
  type ActionDescriptor,
  type ActionSection,
} from "../../platform/actions/action";
import { resolveActions } from "../../platform/actions/registry";
import { appDispatcher } from "../../platform/dispatch/middleware";
import { useDispatch } from "../../platform/dispatch/useAction";
import { logger } from "../../platform/logger/logger";
import { useContextMenuStore } from "../../stores/view/contextMenu";
import { useViewStore } from "../../stores/view/viewStore";
import { computeMenuPosition } from "./position";

/** Default section for an item a resolver left ungrouped. */
const DEFAULT_SECTION: ActionSection = "navigate";

const menuLog = logger.child("context-menu");

function sectionOf(action: ActionDescriptor): ActionSection {
  return action.section ?? DEFAULT_SECTION;
}

/** Group resolved actions into the canonical section order, dropping empty groups. */
function groupBySection(
  actions: readonly ActionDescriptor[],
): { section: ActionSection; actions: ActionDescriptor[] }[] {
  return ACTION_SECTION_ORDER.map((section) => ({
    section,
    actions: actions.filter((a) => sectionOf(a) === section),
  })).filter((group) => group.actions.length > 0);
}

export function ContextMenuHost() {
  // One shallow-compared subscription (B8, resource-hardening) instead of seven
  // independent ones: the host re-renders once per menu-state change, not once
  // per subscribed field.
  const { open, entity, anchor, armedItemId, closeMenu, arm, disarm } =
    useContextMenuStore(
      useShallow((s) => ({
        open: s.open,
        entity: s.entity,
        anchor: s.anchor,
        armedItemId: s.armedItemId,
        closeMenu: s.closeMenu,
        arm: s.arm,
        disarm: s.disarm,
      })),
    );
  const timeTravel = useViewStore((s) => s.timelineMode.kind === "time-travel");
  const dispatch = useDispatch();

  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [cursor, setCursor] = useState(0);

  const baseId = useId();
  const liveRegionId = `${baseId}-live`;
  const itemId = (id: string) => `${baseId}-item-${id}`;

  // Items are a pure function of the entity + time-travel state (never stored).
  const items = useMemo(
    () => (entity ? resolveActions(entity, { timeTravel }) : []),
    [entity, timeTravel],
  );
  const groups = useMemo(() => groupBySection(items), [items]);
  // The cursor walks DISPLAY (grouped) order so the highlighted row and the
  // keyboard cursor index the same flattened sequence.
  const ordered = useMemo(() => groups.flatMap((g) => g.actions), [groups]);
  const runnableIndices = useMemo(
    () => ordered.map((a, i) => (isRunnable(a) ? i : -1)).filter((i) => i >= 0),
    [ordered],
  );

  // Capture/restore focus across the open lifecycle (the palette's contract).
  useEffect(() => {
    if (open) {
      previousFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      // Start the cursor on the first runnable item.
      setCursor(runnableIndices[0] ?? 0);
    } else {
      previousFocus.current?.focus();
      previousFocus.current = null;
      setPos(null);
    }
    // Only re-run on open/close; the first runnable index is read at that edge.
  }, [open]);

  // Restore focus if the host unmounts while a menu is open: the [open] effect
  // above only fires on an open -> closed transition, so an unmount (AppShell
  // teardown, ErrorBoundary swap) would otherwise strand focus on a removed
  // menuitem (M1).
  useEffect(() => () => previousFocus.current?.focus(), []);

  // Measure then flip/clamp into the viewport once the panel is laid out.
  useLayoutEffect(() => {
    if (!open || !anchor || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    setPos(
      computeMenuPosition(
        anchor,
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [open, anchor, items]);

  // Move DOM focus to the active item so the role=menu reads correctly.
  const activeId = ordered[cursor]?.id;
  useEffect(() => {
    if (!open || pos === null || !activeId) return;
    document.getElementById(`${baseId}-item-${activeId}`)?.focus();
  }, [open, pos, activeId, baseId]);

  // Light-dismiss on scroll / resize / window blur (outside-click and Escape are
  // handled on the rendered nodes). Capture scroll so a scroll inside any
  // container dismisses rather than leaving a stale anchor.
  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => closeMenu();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("blur", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("blur", onScrollOrResize);
    };
  }, [open, closeMenu]);

  const moveCursor = useCallback(
    (delta: 1 | -1) => {
      if (runnableIndices.length === 0) return;
      // Disarm any pending confirm when the cursor leaves the armed row.
      disarm();
      const here = runnableIndices.indexOf(cursor);
      const nextPos =
        here < 0
          ? delta === 1
            ? 0
            : runnableIndices.length - 1
          : Math.min(runnableIndices.length - 1, Math.max(0, here + delta));
      setCursor(runnableIndices[nextPos]);
    },
    [cursor, runnableIndices, disarm],
  );

  const activate = useCallback(
    (action: ActionDescriptor) => {
      if (!isRunnable(action)) return;
      if (action.confirm) {
        if (armedItemId !== action.id) {
          arm(action.id);
          return;
        }
        // Second activation on the armed item: fire then close.
      }
      if (action.dispatch) {
        // Degrade honestly (M2): a verb whose terminal handler is not registered
        // (e.g. a host-shell verb unavailable in this context) must not throw
        // inside a React event handler. Log and close rather than crash.
        if (appDispatcher.hasHandler(action.dispatch.type)) {
          dispatch(action.dispatch);
        } else {
          menuLog.warn(`no handler for menu action "${action.dispatch.type}"`);
        }
      } else {
        action.run?.();
      }
      closeMenu();
    },
    [armedItemId, arm, dispatch, closeMenu],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveCursor(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveCursor(-1);
      } else if (e.key === "Home") {
        e.preventDefault();
        disarm();
        if (runnableIndices.length) setCursor(runnableIndices[0]);
      } else if (e.key === "End") {
        e.preventDefault();
        disarm();
        if (runnableIndices.length)
          setCursor(runnableIndices[runnableIndices.length - 1]);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const action = ordered[cursor];
        if (action) activate(action);
      } else if (e.key === "Tab") {
        // A context menu is not a tab surface; Tab closes it (cohort convention).
        e.preventDefault();
        closeMenu();
      }
    },
    [closeMenu, moveCursor, disarm, runnableIndices, ordered, cursor, activate],
  );

  // Polite announcement: the menu's entity, the focused item, and the arm prompt.
  const liveMessage = useMemo(() => {
    if (!open || !entity) return "";
    const active = ordered[cursor];
    const kindLabel = entity.kind.replace(/-/g, " ");
    if (!active) return `${kindLabel} actions: no actions`;
    if (armedItemId === active.id) return `confirm ${active.label}?`;
    return `${kindLabel} actions. ${active.label}`;
  }, [open, entity, ordered, cursor, armedItemId]);

  if (!open || !entity || !anchor) return null;

  // Hidden until measured so the first paint never flashes at the wrong spot.
  const placed = pos !== null;

  return createPortal(
    <div
      // Invisible full-screen catcher: a click anywhere outside the panel
      // dismisses (light-dismiss, not a modal scrim).
      className="fixed inset-0 z-50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeMenu();
      }}
      onContextMenu={(e) => {
        // A right-click on the catcher (outside the panel) closes the menu and
        // suppresses the native menu, matching cohort behaviour.
        e.preventDefault();
        closeMenu();
      }}
    >
      <div
        ref={panelRef}
        role="menu"
        aria-label={`${entity.kind.replace(/-/g, " ")} actions`}
        aria-activedescendant={ordered[cursor] ? itemId(ordered[cursor].id) : undefined}
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
          left: placed ? pos.x : anchor.x,
          top: placed ? pos.y : anchor.y,
          visibility: placed ? "visible" : "hidden",
        }}
        className="flex max-h-[min(24rem,calc(100vh-1rem))] w-56 max-w-[calc(100vw-1rem)] flex-col overflow-y-auto rounded-vs-lg border border-rule bg-paper-raised py-vs-1 text-body shadow-deep animate-fade-in"
      >
        {ordered.length === 0 && (
          <div className="px-vs-3 py-vs-2 text-center text-label text-ink-faint">
            no actions
          </div>
        )}
        {groups.map((group, gi) => (
          <div key={group.section} role="presentation">
            {gi > 0 && (
              <div role="separator" className="my-vs-1 border-t border-rule" />
            )}
            {group.actions.map((action) => {
              const index = ordered.indexOf(action);
              const selected = index === cursor;
              const armed = armedItemId === action.id;
              const Mark = action.icon;
              const disabled = action.disabled === true;
              return (
                <button
                  key={action.id}
                  type="button"
                  id={itemId(action.id)}
                  role="menuitem"
                  tabIndex={selected ? 0 : -1}
                  aria-disabled={disabled || undefined}
                  title={disabled ? action.disabledReason : undefined}
                  onMouseEnter={() => {
                    if (!disabled) {
                      disarm();
                      setCursor(index);
                    }
                  }}
                  onClick={() => activate(action)}
                  className={`flex w-full items-center gap-vs-2 px-vs-3 py-vs-1-5 text-left transition-colors duration-ui-fast ${
                    disabled
                      ? "cursor-default text-ink-faint"
                      : selected
                        ? "bg-paper-sunken text-ink"
                        : "text-ink-muted hover:bg-paper-sunken hover:text-ink"
                  }`}
                >
                  {Mark ? (
                    <Mark aria-hidden size={14} className="shrink-0 text-ink-faint" />
                  ) : (
                    <span aria-hidden className="size-3.5 shrink-0" />
                  )}
                  <span
                    className={`flex-1 truncate ${armed ? "text-state-stale" : ""}`}
                  >
                    {armed ? `confirm ${action.label}?` : action.label}
                  </span>
                  {action.confirm && (
                    <span
                      aria-hidden
                      className="rounded-vs-sm border border-rule px-vs-1 font-mono text-2xs text-ink-faint"
                    >
                      ⏎⏎
                    </span>
                  )}
                  {action.accelerator && !action.confirm && (
                    <span className="font-mono text-2xs text-ink-faint">
                      {action.accelerator}
                    </span>
                  )}
                  {selected && !action.confirm && !action.accelerator && (
                    <CornerDownLeft aria-hidden size={12} className="text-ink-faint" />
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
