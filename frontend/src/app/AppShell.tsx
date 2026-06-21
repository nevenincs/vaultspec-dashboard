import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { CrashInjector, CrashZone } from "../platform/errors/CrashInjector";
import { ErrorBoundary } from "../platform/errors/ErrorBoundary";
import { useActiveScope } from "../stores/server/queries";
import { useBackendSignalSubscription } from "../stores/view/backendSignals";
import {
  useBrowserMode,
  useBrowserModeIntent,
  type BrowserMode,
} from "../stores/view/browserMode";
import {
  deriveShellResizeHandleView,
  resizeShellPanelByKey,
  startShellResizePointerSession,
  type ShellResizeAxis,
  type ShellResizeHandleSide,
  toggleShellPanelFlyout as togglePanelFlyout,
  type ShellFrameView,
  useShellFrameView,
  useShellWindowActions,
} from "../stores/view/shellLayout";
import { LeftRail } from "./left/LeftRail";
import {
  LEFT_RAIL_KEYMAP_CONTEXT,
  useLeftRailKeybindings,
} from "./left/leftRailActions";
import {
  RIGHT_RAIL_KEYMAP_CONTEXT,
  useRightRailKeybindings,
} from "./right/rightRailActions";
import { useEditorKeybindings } from "../stores/view/editorKeybindings";
import { setSceneCommandRunner } from "../stores/view/sceneCommandBridge";
import { KeyboardNav } from "./a11y/KeyboardNav";
import { useRegionCycleKeybindings } from "./chrome/regionCycleKeybindings";
import { DegradationDebugSwitch } from "./degradation/DebugSwitch";
import { IconButton, Popover } from "./kit";
import { PanelLeft } from "./kit/glyphs";
import { ContextMenuHost } from "./menu/ContextMenuHost";
import { KeyboardShortcuts } from "./menu/KeyboardShortcuts";
// Register every per-surface context-menu resolver once at app load.
import "./menus/registerAll";
// Register every per-surface command-palette provider once at app load.
import "./menus/registerAllCommands";
import { CommandPalette } from "./palette/CommandPalette";
import { SettingsDialog } from "./settings/SettingsDialog";
import { useSettingsEffects } from "./settings/settingsEffects";
import { useThemeSetting } from "./settings/themeSetting";
import { StatusTab } from "./right/StatusTab";
import { IconRail } from "./shell/IconRail";
import { getScene } from "./stage/Stage";
import { DockWorkspace } from "./stage/DockWorkspace";
import { Playhead } from "./timeline/Playhead";
import { Timeline } from "./timeline/Timeline";
import { handleNodeClick } from "./timeline/eventSelection";
// The reader/code-viewer stack (react-markdown + Shiki) is heavy and only needed
// Binding AppShell grid (figma-frontend-rewrite W02.P03 — board 117:2): three
// fluid/fixed columns at full viewport height —
//   left rail (expanded width, collapsed 48px, or hidden) | stage (flex) |
//   right-pane (resizable, or hidden)
// — where the side panes are collapsible/toggleable and reflow the grid. The stage
// column is itself a vertical stack: a 44px breadcrumb topbar, the graph area
// (the existing Stage, fills), and a resizable/toggleable Timeline at the bottom.
//
// Layer law (dashboard-layer-ownership / view-rewrite-preserves-the-state-and-
// scene-contract): the shell is leaf chrome — it composes the centralized kit and
// renders the existing LeftRail / Stage / Timeline / ActivityRail in their slots,
// consuming the preserved stores hooks and SceneController contract UNCHANGED. It
// adds no new fetch, mints no model, and reads no raw `tiers`.

export function AppShell() {
  const scope = useActiveScope();
  const shellFrame = useShellFrameView(scope);
  const shellActions = useShellWindowActions(scope, shellFrame);
  const {
    leftRailVisible,
    leftRailWidth,
    rightRailWidth,
    timelineHeight,
    panelFlyoutOpen,
    timeTravel,
    leftCollapsed,
    gridColumns,
    panelControls,
  } = shellFrame;
  const browserMode = useBrowserMode();
  const browserModeIntent = useBrowserModeIntent();
  // The stage (main content) is the skip-link target and the initial-focus
  // landing, so a visible focused element always exists from a cold load and the
  // tab ring never starts on `<body>` (keyboard-navigation W01.P02).
  const stageRef = useRef<HTMLElement>(null);
  const openLeftRailMode = useCallback(
    (mode: BrowserMode) => {
      browserModeIntent(mode);
      if (!leftRailVisible) shellActions.toggleLeftRail();
      if (leftCollapsed) shellActions.toggleLeftCollapsed();
    },
    [browserModeIntent, leftCollapsed, leftRailVisible, shellActions],
  );

  const startResize = (
    axis: ShellResizeAxis,
    startSize: number,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    startShellResizePointerSession({
      axis,
      startSize,
      startClientX: event.clientX,
      startClientY: event.clientY,
      target: event.currentTarget.ownerDocument,
    });
  };

  const resizeByKey = (
    event: KeyboardEvent<HTMLDivElement>,
    current: number,
    axis: ShellResizeAxis,
  ) => {
    resizeShellPanelByKey({
      axis,
      current,
      key: event.key,
      preventDefault: () => event.preventDefault(),
    });
  };

  // Theme is an engine setting now (dashboard-settings W05): the bridge reconciles
  // the server value to the framework-free controller and persists changes. Called
  // once here so the reconcile runs regardless of rail collapse state.
  useThemeSetting();
  // Apply document-level settings effects once at the shell top. Graph/filter
  // defaults are dashboard-state concerns, not legacy store seeds.
  useSettingsEffects(scope);
  // F-M1 (event-unity): mount the shared backend-signal stream (backends + git)
  // once here so status / rag-health stay live regardless of which rail tab is
  // open; NowStrip and the search controller read the deduped shared accumulator.
  useBackendSignalSubscription();
  // Enroll the left/right rail + filter command shortcuts onto the one keymap
  // registry (keyboard-action-system W04.P11-P12). Each hook registers its
  // bindings + action resolvers in an effect and disposes them on unmount; the
  // single global dispatcher owns the keydown listener. Mounted here once at the
  // shell top so the bindings are present for the rails' lifetime (the surface
  // contexts gate which bindings fire when each rail region is focused).
  useLeftRailKeybindings();
  useRightRailKeybindings();
  useEditorKeybindings();
  // Region traversal (keyboard-navigation W01.P02): F6/Shift+F6 cycle focus
  // between the major panels through the one keymap registry, and the focusin
  // tracker feeds per-region entry memory. Mounted once at the shell top.
  useRegionCycleKeybindings();
  // Bridge the stores-layer command palette / keymap to the scene controller
  // (deferral #13): register a forwarder that calls into the graph scene only when
  // a command actually fires (getScene is lazy), so graph camera/layout verbs are
  // reachable as enrolled actions without the stores layer importing the scene.
  useEffect(() => {
    setSceneCommandRunner((command) => getScene().controller.command(command as never));
    return () => setSceneCommandRunner(null);
  }, []);
  // Place initial focus on the stage once on mount so the page never loads with
  // focus on `<body>` (the APG always-have-a-focused-element floor). The skip
  // link remains the first Tab stop for keyboard users.
  useEffect(() => {
    stageRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      className={shellFrame.rootClassName}
      style={{
        gridTemplateColumns: gridColumns,
      }}
    >
      {/* Skip link — the first tab stop, jumps focus past the chrome into the
          stage content (keyboard-navigation W01.P02). Visually hidden until
          focused. */}
      <a
        href="#stage"
        className="sr-only focus:not-sr-only focus:absolute focus:left-fg-2 focus:top-fg-2 focus:z-50 focus:rounded-fg-sm focus:bg-paper focus:px-fg-2 focus:py-fg-1 focus:text-ink focus:outline focus:outline-2 focus:outline-focus"
        onClick={(event) => {
          event.preventDefault();
          stageRef.current?.focus();
        }}
      >
        Skip to content
      </a>
      <CommandPalette />
      <SettingsDialog />
      <ContextMenuHost timeTravel={timeTravel} />
      <KeyboardShortcuts />
      <DegradationDebugSwitch />
      <KeyboardNav />

      {/* ── Left rail — expanded content, collapsed mode icons, or hidden ──── */}
      <aside className={shellFrame.leftRailClassName}>
        {shellFrame.showCollapsedLeftRail && (
          <IconRail active={browserMode} onSelect={openLeftRailMode} />
        )}
        {shellFrame.showExpandedLeftRail && (
          <ErrorBoundary region="left-rail">
            <CrashZone region="left-rail" />
            <div
              className={shellFrame.leftRailContentClassName}
              data-keymap-context={LEFT_RAIL_KEYMAP_CONTEXT}
              data-focus-region="left-rail"
            >
              <LeftRail />
            </div>
            <ResizeHandle
              side="right"
              onPointerDown={(event) => startResize("left", leftRailWidth, event)}
              onKeyDown={(event) => resizeByKey(event, leftRailWidth, "left")}
            />
          </ErrorBoundary>
        )}
      </aside>

      {/* ── Stage column (flex) — graph | timeline ────────────────── */}
      <main
        ref={stageRef}
        id="stage"
        tabIndex={-1}
        data-focus-region="stage"
        className={shellFrame.stageColumnClassName}
      >
        {/* Graph + documents area (editor-dock-workspace): the dock workspace
            replaces the single-doc viewer overlay. The graph is a portal-pinned
            canvas panel (default right, full width until a document opens) and
            documents open as walkable/tabbable/movable/hot-dockable panels to its
            left. Stage's canvas + SceneController seam are preserved unchanged —
            GraphCanvasHost renders the whole Stage and dockview only manages an
            empty placeholder, so docking never re-parents the canvas. */}
        <div className={shellFrame.stageBodyClassName}>
          <ErrorBoundary region="stage">
            <CrashZone region="stage" />
            <DockWorkspace />
          </ErrorBoundary>
        </div>

        {/* Bottom timeline — the lower SECTION of the unified graph+timeline element
            (graph-timeline-workspace). Its own header is retired: navigation lives in
            the shared stage top bar, and the ResizeHandle above is the fine-tunable
            buffer between the two sections. The lineage surface fills the section.
            Layer law: this region wires stores hooks and shared-state intent only —
            no fetch, no raw `tiers`. A mark click flows into the ONE shared selection
            + a bounded stage ego pulse through `handleNodeClick`. The playhead stays
            (temporal navigation); the date-range brush is gone (filtering retired). */}
        {shellFrame.showTimeline && (
          <footer
            className={shellFrame.timelineClassName}
            style={shellFrame.timelineStyle}
            data-focus-region="timeline"
          >
            <ResizeHandle
              side="top"
              onPointerDown={(event) => startResize("timeline", timelineHeight, event)}
              onKeyDown={(event) => resizeByKey(event, timelineHeight, "timeline")}
            />
            <ErrorBoundary region="timeline">
              <CrashZone region="timeline" />
              <div className={shellFrame.timelineBodyClassName}>
                <Timeline
                  onNodeClick={(node, arcs) =>
                    handleNodeClick(node, arcs, getScene().controller, scope)
                  }
                  overlay={<Playhead scope={scope} />}
                />
              </div>
            </ErrorBoundary>
          </footer>
        )}
      </main>

      {/* ── Right pane — the activity rail ──────────────────────────── */}
      <aside className={shellFrame.rightRailClassName}>
        {shellFrame.showRightRail && (
          <ErrorBoundary region="right-rail">
            <CrashZone region="right-rail" />
            <ResizeHandle
              side="left"
              onPointerDown={(event) => startResize("right", rightRailWidth, event)}
              onKeyDown={(event) => resizeByKey(event, rightRailWidth, "right")}
            />
            <ActivityRail shellFrame={shellFrame} />
          </ErrorBoundary>
        )}
      </aside>

      {/* ── Single panel flyout ─────────────────────────────────────── */}
      {/* Anchor the panel-controls toggle to the EXPANDED rail's top-right corner
          so it never bleeds over the left-aligned worktree/project header
          (board 244:750 keeps the rail header clean). When the rail is collapsed
          or hidden it falls back to the stage's top-left, where there is no
          content to collide with. */}
      <Popover
        open={panelFlyoutOpen}
        onDismiss={shellActions.closePanelFlyout}
        className={shellFrame.panelFlyoutRootClassName}
        style={shellFrame.panelFlyoutRootStyle}
      >
        <span className={shellFrame.panelFlyoutButtonWrapperClassName}>
          <IconButton
            label={panelControls.flyoutButtonLabel}
            active={panelFlyoutOpen}
            onClick={togglePanelFlyout}
          >
            <PanelLeft size={16} />
          </IconButton>
        </span>
        {panelFlyoutOpen && (
          <div
            className={panelControls.flyoutMenuClassName}
            role="menu"
            aria-label={panelControls.flyoutMenuLabel}
          >
            <PanelFlyoutItem
              label={panelControls.leftRailVisibilityLabel}
              className={panelControls.itemClassName}
              onClick={() => shellActions.runPanelAction(shellActions.toggleLeftRail)}
            />
            {panelControls.showLeftCollapseControl && (
              <PanelFlyoutItem
                label={panelControls.leftCollapseLabel}
                className={panelControls.itemClassName}
                onClick={() =>
                  shellActions.runPanelAction(shellActions.toggleLeftCollapsed)
                }
              />
            )}
            <PanelFlyoutItem
              label={panelControls.rightRailVisibilityLabel}
              className={panelControls.itemClassName}
              onClick={() => shellActions.runPanelAction(shellActions.toggleRightRail)}
            />
            <PanelFlyoutItem
              label={panelControls.timelineVisibilityLabel}
              className={panelControls.itemClassName}
              onClick={() => shellActions.runPanelAction(shellActions.toggleTimeline)}
            />
          </div>
        )}
      </Popover>

      <CrashInjector />
    </div>
  );
}

function ResizeHandle({
  side,
  onPointerDown,
  onKeyDown,
}: {
  side: ShellResizeHandleSide;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const view = deriveShellResizeHandleView(side);

  return (
    <div
      aria-label={view.label}
      aria-orientation={view.orientation}
      className={view.className}
      role="separator"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}

function PanelFlyoutItem({
  label,
  className,
  onClick,
}: {
  label: string;
  className: string;
  onClick: () => void;
}) {
  return (
    <button type="button" role="menuitem" className={className} onClick={onClick}>
      {label}
    </button>
  );
}

// The activity-rail composition (binding redesign `ActivityRail / Status`, node
// 599:2099): the rail's three tabs (Status · Changes · Search) are RETIRED — the
// rail is now ONE scrollable status surface. The former Status pane is the rail:
// a worktree/branch location header, the working-tree Changes fold, and the
// plan-derived open work + GitHub items + recent commits. (Semantic search has
// moved out of the rail into the command palette.) The rail keeps its keymap
// context so rail-scoped command shortcuts still resolve.
function ActivityRail({
  shellFrame,
}: {
  shellFrame: Pick<ShellFrameView, "activityRailClassName" | "activityPanelClassName">;
}) {
  return (
    <div
      className={shellFrame.activityRailClassName}
      data-keymap-context={RIGHT_RAIL_KEYMAP_CONTEXT}
      data-focus-region="right-rail"
    >
      <div
        className={shellFrame.activityPanelClassName}
        role="region"
        aria-label="activity"
        tabIndex={0}
      >
        <StatusTab />
      </div>
    </div>
  );
}
