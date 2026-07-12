import { useCallback, useEffect, useRef } from "react";

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
  type ShellFrameView,
  useShellFrameView,
  useShellWindowActions,
} from "../stores/view/shellLayout";
import { DataActivityIndicator } from "./chrome/DataActivityIndicator";
import { ShellResizeHandle } from "./chrome/ShellResizeHandle";
import { LeftRail } from "./left/LeftRail";
import { backgroundContextMenuHandler } from "./menus/backgroundContextMenu";
import { openContextMenu } from "../stores/view/contextMenu";
import { useProjectKeybindings } from "../stores/view/projectActions";
import { setResetLayoutRunner } from "../stores/view/resetLayoutBridge";
import {
  LEFT_RAIL_KEYMAP_CONTEXT,
  useLeftRailKeybindings,
} from "./left/leftRailActions";
import {
  RIGHT_RAIL_KEYMAP_CONTEXT,
  useRightRailKeybindings,
} from "./right/rightRailActions";
import { useEditorKeybindings } from "../stores/view/editorKeybindings";
import { useDocTabKeybindings } from "../stores/view/docTabKeybindings";
import { useGraphToggleKeybindings } from "../stores/view/graphToggleKeybindings";
import { useReloadKeybindings } from "../stores/view/reloadKeybindings";
import { setSceneCommandRunner } from "../stores/view/sceneCommandBridge";
import { KeyboardNav } from "./a11y/KeyboardNav";
import { useRegionCycleKeybindings } from "./chrome/regionCycleKeybindings";
import { DegradationDebugSwitch } from "./degradation/DebugSwitch";
import { ContextMenuHost } from "./menu/ContextMenuHost";
import { UnsavedEditGuardHost } from "./chrome/UnsavedEditGuardHost";
import { KeyboardShortcuts } from "./menu/KeyboardShortcuts";
// Register every per-surface context-menu resolver once at app load.
import "./menus/registerAll";
// Register every per-surface command-palette provider once at app load.
import "./menus/registerAllCommands";
import { AddProjectDialog } from "./left/AddProjectDialog";
import { CreateDocDialog } from "./left/CreateDocDialog";
import { ProjectNavigator } from "./left/ProjectNavigator";
import { CommandPalette } from "./palette/CommandPalette";
import { SettingsDialog } from "./settings/SettingsDialog";
import { useSettingsEffects } from "./settings/settingsEffects";
import { useGraphViewModeBridge } from "../stores/server/graphViewModeBridge";
import { useThemeSetting } from "./settings/themeSetting";
import { StatusTab } from "./right/StatusTab";
import { IconRail } from "./shell/IconRail";
import { CompactAppShell } from "./shell/CompactAppShell";
import { getScene } from "./stage/Stage";
import { DockWorkspace } from "./stage/DockWorkspace";
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
    timeTravel,
    leftCollapsed,
    gridColumns,
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

  // Theme is an engine setting now (dashboard-settings W05): the bridge reconciles
  // the server value to the framework-free controller and persists changes. Called
  // once here so the reconcile runs regardless of rail collapse state.
  useThemeSetting();
  // Apply document-level settings effects once at the shell top. Graph/filter
  // defaults are dashboard-state concerns, not legacy store seeds.
  useSettingsEffects(scope);
  // Bridge the left-rail vault|code view mode to the graph corpus + durable
  // setting once at the shell top (codebase-graphing ADR D7): a view-mode change
  // (rail toggle, keyboard cycle, or command palette) re-queries the other corpus
  // and wipes/reloads the canvas; a fresh scope adopts the persisted mode.
  useGraphViewModeBridge(scope);
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
  useProjectKeybindings();
  useRightRailKeybindings();
  useEditorKeybindings();
  useDocTabKeybindings();
  // The global Refresh chord (Mod+Shift+R), enrolled on the one keymap registry
  // alongside its palette command and context-menu global tail (global-context-actions).
  useReloadKeybindings();
  // The graph-visibility toggle chord (Mod+Shift+G), enrolled on the one keymap
  // registry alongside its palette command (window:graph) and background-menu entry
  // (appshell-reframe #11), all under the one shared id.
  useGraphToggleKeybindings();
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
  // The background context menu's "Reset layout" runs the FULL reset (matching the
  // palette's window:reset-layout) through this seam, since the full reset needs the
  // scope-bound panel-intent hook a resolver cannot call (review HIGH-2 fix).
  useEffect(() => {
    setResetLayoutRunner(() => shellActions.resetLayout());
    return () => setResetLayoutRunner(null);
  }, [shellActions]);
  // Place initial focus on the stage once on mount so the page never loads with
  // focus on `<body>` (the APG always-have-a-focused-element floor). The skip
  // link remains the first Tab stop for keyboard users.
  useEffect(() => {
    stageRef.current?.focus({ preventScroll: true });
  }, []);
  // Retire the pre-hydration boot shell (index.html) after the shell's first
  // commit — the real chrome is painted underneath by now, so the static
  // skeleton hands off without a blank frame (on-demand-cold-start boot shell).
  useEffect(() => {
    document.getElementById("boot-shell")?.remove();
  }, []);

  // Compact (phone/tablet) branch of the ONE shell projection
  // (mobile-responsive-layout ADR D2): a single pane + bottom tab bar instead of
  // the desktop three-column grid. The app-wide overlays (palette, settings,
  // context menu, shortcuts, keyboard nav) render in both branches; the heavy
  // graph dock workspace is absent on compact (ADR D4 — canvas not mounted on a
  // cold compact load).
  if (shellFrame.compact) {
    return (
      <div className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-paper text-ink">
        {/* The universal loading floor (universal-data-loading ADR D2): one
            mount per shell branch — compact has no canvas, so this is the only
            surface signalling the cold-load listing drain. */}
        <DataActivityIndicator />
        <CommandPalette />
        <SettingsDialog />
        <AddProjectDialog />
        <CreateDocDialog />
        <ProjectNavigator />
        <UnsavedEditGuardHost />
        <ContextMenuHost timeTravel={timeTravel} />
        <KeyboardShortcuts />
        <KeyboardNav />
        <CompactAppShell />
      </div>
    );
  }

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
      {/* The universal loading floor (universal-data-loading ADR D2). */}
      <DataActivityIndicator />
      <CommandPalette />
      <SettingsDialog />
      <AddProjectDialog />
      <CreateDocDialog />
      <ProjectNavigator />
      <UnsavedEditGuardHost />
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
            <ShellResizeHandle side="right" axis="left" current={leftRailWidth} />
          </ErrorBoundary>
        )}
      </aside>

      {/* ── Center — documents | (graph + tethered timeline) ────────── */}
      <main
        ref={stageRef}
        id="stage"
        tabIndex={-1}
        data-focus-region="stage"
        className={shellFrame.stageColumnClassName}
      >
        {/* The center is ONE ROW: the documents pane and the graph form side-by-side
            dockview panels, and the timeline is tethered UNDER the graph as part of
            the SAME panel (graph + timeline = one unit; appshell-reframe #11). The
            graph is a TOGGLEABLE, portal-pinned canvas panel — GraphCanvasHost
            renders the whole Stage and dockview only manages an empty placeholder, so
            docking/toggling never re-parents the canvas. When the graph is hidden the
            documents take the full width; when no document is open the graph takes the
            full width; with neither, the dock workspace shows its ghost empty state. */}
        <div className={shellFrame.stageBodyClassName}>
          <ErrorBoundary region="stage">
            <CrashZone region="stage" />
            <DockWorkspace />
          </ErrorBoundary>
        </div>
      </main>

      {/* ── Right pane — the activity rail ──────────────────────────── */}
      <aside className={shellFrame.rightRailClassName}>
        {shellFrame.showRightRail && (
          <ErrorBoundary region="right-rail">
            <CrashZone region="right-rail" />
            <ShellResizeHandle side="left" axis="right" current={rightRailWidth} />
            <ActivityRail shellFrame={shellFrame} />
          </ErrorBoundary>
        )}
      </aside>

      {/* The activity-rail (and graph) visibility toggles are NOT free-floating chrome
          here: they live in the dock's top-right action cluster (DockWorkspace's
          rightHeaderActionsComponent), which rides the top-right-most open panel and
          is re-derived on every layout change. */}

      <CrashInjector />
    </div>
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
        onContextMenu={backgroundContextMenuHandler("right-rail", openContextMenu)}
      >
        <StatusTab />
      </div>
    </div>
  );
}
