// The stage navigation toolbar (re-skinned W02.P06.S22 onto the OKLCH semantic
// token layer and the sanctioned Lucide chrome marks per the nav-controls
// surface ADR): the camera + LOD rail. A single horizontal ARIA toolbar grouped
// by concern — a camera cluster (zoom-out / level receipt / zoom-in / fit /
// reset), the layout-controls toggle (grouped here for spatial coherence, its
// grammar deferred to the algorithm-panel ADR), the feature-versus-document
// granularity descent, and browser fullscreen at the trailing edge.
//
// Layer ownership (dashboard-layer-ownership / nav-controls ADR "Layer
// ownership"): this is app-chrome steering the scene. Camera affordances emit
// SceneController.command() ONLY — never the Pixi renderer, never per-frame
// polling, never layout/transform compute. The semantic-level label is READ from
// the camera-change event, never derived in chrome. Granularity is a WRITE to a
// stores setter, and the descent's loading/degradation truth is read through a
// stores selector (useGraphSliceAvailability), never the raw `tiers` block. The
// toolbar fetches nothing and holds no node shape.
//
// Keyboard + a11y (nav-controls ADR "Keyboard contract and a11y"): a roving
// single-tabstop toolbar — Tab enters, ArrowLeft/ArrowRight walk the controls
// and hand focus back to the page tab order at the ends. Each control is a real
// button with an accessible label; toggles carry aria-pressed. Per the base
// motion law (design-language ADR layer 6) keyboard-initiated camera actions are
// INSTANT: the zoom-in / zoom-out / reset-view SceneCommands the toolbar emits
// are non-animating at the seam, so the keyboard and pointer paths dispatch the
// same instant command — no animated keyboard action and no new seam member.

import {
  Maximize,
  Maximize2,
  Minimize,
  Minus,
  Plus,
  RotateCcw,
  Settings2,
} from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { SemanticLevel } from "../../scene/field/camera";
import { useGraphSliceAvailability } from "../../stores/server/queries";
import { useViewStore } from "../../stores/view/viewStore";
import { useActiveScope, getScene } from "./Stage";

interface NavToolbarProps {
  /** Whether the algorithm panel is open — toolbar reflects the toggle state. */
  algorithmPanelOpen: boolean;
  onAlgorithmPanelToggle: () => void;
}

// Lucide chrome marks render at the toolbar's small instrument size in single
// currentColor ink drawn from the token layer, so they are theme-correct across
// dark / light / high-contrast for free (nav-controls ADR "Icon usage").
const ICON_PX = 13;

function enterFullscreen() {
  document.documentElement.requestFullscreen().catch(() => {
    // Browser may refuse (permissions policy, sandboxed iframe).
    // Silently ignore — the button is best-effort (ADR "Control set").
  });
}

function exitFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

// --- roving-tabstop toolbar (ADR "Keyboard contract and a11y") -------------------
// The rail is one Tab-stop; ArrowLeft/ArrowRight walk the focusable controls and
// hand focus back to the normal tab order at the ends (the arrow-walk handoff).
// A data attribute marks the roving members so disabled controls drop out of the
// walk cleanly.
const ROVING_ATTR = "data-nav-rove";

function rovingButtons(toolbar: HTMLElement | null): HTMLButtonElement[] {
  if (!toolbar) return [];
  return Array.from(
    toolbar.querySelectorAll<HTMLButtonElement>(
      `button[${ROVING_ATTR}]:not(:disabled)`,
    ),
  );
}

interface ToolButtonProps {
  label: string;
  title?: string;
  icon: React.ReactNode;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  /** Tab index for the roving model: 0 for the active member, -1 otherwise. */
  tabIndex: number;
  onKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
}

function ToolButton({
  label,
  title,
  icon,
  onClick,
  pressed,
  disabled,
  tabIndex,
  onKeyDown,
  onFocus,
}: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={title ?? label}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      disabled={disabled}
      tabIndex={tabIndex}
      {...{ [ROVING_ATTR]: "" }}
      className={`flex h-6 w-6 items-center justify-center rounded-vs-sm transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-ink-faint/40 ${
        pressed
          ? "bg-accent-subtle text-ink hover:bg-accent-subtle"
          : "text-ink-faint hover:bg-paper-sunken hover:text-ink"
      }`}
    >
      {icon}
    </button>
  );
}

export const LEVEL_LABEL: Record<SemanticLevel, string> = {
  constellation: "all",
  feature: "feat",
  document: "doc",
};

/** Full-prose accessible names for the level receipt (ADR: "its accessible name
 *  spells the level in full"). */
export const LEVEL_NAME: Record<SemanticLevel, string> = {
  constellation: "constellation",
  feature: "feature",
  document: "document",
};

export function NavToolbar({
  algorithmPanelOpen,
  onAlgorithmPanelToggle,
}: NavToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [level, setLevel] = useState<SemanticLevel | null>(null);
  // Granularity toggle: reads + writes viewStore so Stage.tsx re-queries.
  const granularity = useViewStore((s) => s.granularity);
  const setGranularity = useViewStore((s) => s.setGranularity);
  // Time-travel owns the scene's data (ADR "States"): the granularity descent is
  // disabled while time travelling — it would fight the time-travel driver's
  // ownership. Camera pan/zoom/fit/reset stay LIVE since they are pure view
  // navigation. Read through the stores hook, never derived in chrome.
  const timelineMode = useViewStore((s) => s.timelineMode);
  const timeTravelling = timelineMode.kind === "time-travel";
  // The descent's loading / degradation truth, read through a stores selector so
  // the toolbar never touches the raw tiers block (layer ownership).
  const scope = useActiveScope();
  const sliceAvailability = useGraphSliceAvailability(scope, granularity);
  const descentBusy = sliceAvailability.loading;
  const descentDegraded = sliceAvailability.degraded;
  const descentReason = Object.values(sliceAvailability.reasons)[0];

  // Track OS-level fullscreen state via the document event.
  useEffect(() => {
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFSChange);
    return () => document.removeEventListener("fullscreenchange", onFSChange);
  }, []);

  // Subscribe to camera-change events to display the current semantic level.
  useEffect(() => {
    return getScene().controller.on((event) => {
      if (event.kind === "camera-change") {
        setLevel(event.level);
      }
    });
  }, []);

  const scene = getScene();

  // Roving-tabstop arrow walk: ArrowLeft/ArrowRight move focus between the rail's
  // enabled controls; at the ends focus is handed back to the page tab order by
  // doing nothing (the browser's native Tab takes over). Home/End jump to the
  // first/last. Keyboard activation (Enter/Space) is the button default and stays
  // instant — the camera SceneCommands the buttons emit do not animate.
  const onRovingKeyDown = useCallback((e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const buttons = rovingButtons(toolbarRef.current);
    const at = buttons.indexOf(e.currentTarget);
    if (at === -1) return;
    const next =
      e.key === "ArrowRight"
        ? at + 1
        : e.key === "ArrowLeft"
          ? at - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? buttons.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    const target = buttons[Math.min(buttons.length - 1, Math.max(0, next))];
    target?.focus();
  }, []);

  // The active roving member carries tabIndex 0; the rest carry -1 so the whole
  // rail is one Tab-stop. We track which control is "active" by focus; the first
  // enabled control is the default Tab entry.
  const [activeRove, setActiveRove] = useState(0);
  // Roving props for the raw granularity buttons (which are not ToolButtons and
  // need the data attribute + handlers spread directly).
  const roveProps = (index: number) => ({
    tabIndex: index === activeRove ? 0 : -1,
    onKeyDown: onRovingKeyDown,
    onFocus: () => setActiveRove(index),
    [ROVING_ATTR]: "",
  });
  // Roving props for ToolButton (which applies the data attribute itself, so we
  // pass only the focus/keyboard handlers and the tab index through its typed
  // props).
  const roveButton = (index: number) => ({
    tabIndex: index === activeRove ? 0 : -1,
    onKeyDown: onRovingKeyDown,
    onFocus: () => setActiveRove(index),
  });

  return (
    <div
      ref={toolbarRef}
      className="pointer-events-auto absolute right-vs-2 top-8 z-20 flex items-center gap-vs-0-5 rounded-vs-md border border-rule bg-paper-raised/90 px-vs-1 py-vs-0-5 shadow-panel backdrop-blur-sm"
      role="toolbar"
      aria-label="graph navigation"
      aria-orientation="horizontal"
      data-nav-toolbar
    >
      {/* Group 1 — camera cluster (SceneController zoom commands, P01.S02).
          Instant at the seam: keyboard and pointer dispatch the same command. */}
      <ToolButton
        label="zoom out"
        icon={<Minus size={ICON_PX} aria-hidden />}
        onClick={() => scene.controller.command({ kind: "zoom-out" })}
        {...roveButton(0)}
      />
      {level !== null && (
        <span
          className="min-w-[2.5rem] text-center text-2xs text-ink-faint"
          aria-label={`zoom level: ${LEVEL_NAME[level]}`}
          title={LEVEL_NAME[level]}
          role="status"
          data-tabular
          data-nav-level
        >
          {LEVEL_LABEL[level]}
        </span>
      )}
      <ToolButton
        label="zoom in"
        icon={<Plus size={ICON_PX} aria-hidden />}
        onClick={() => scene.controller.command({ kind: "zoom-in" })}
        {...roveButton(1)}
      />

      <span className="mx-vs-0-5 h-3.5 w-px bg-rule" aria-hidden />

      <ToolButton
        label="fit to view"
        title="fit all nodes into viewport"
        icon={<Maximize2 size={ICON_PX} aria-hidden />}
        onClick={() => scene.controller.command({ kind: "fit-to-view" })}
        {...roveButton(2)}
      />
      <ToolButton
        label="reset view"
        title="reset camera to origin"
        icon={<RotateCcw size={ICON_PX} aria-hidden />}
        onClick={() => scene.controller.command({ kind: "reset-view" })}
        {...roveButton(3)}
      />

      <span className="mx-vs-0-5 h-3.5 w-px bg-rule" aria-hidden />

      {/* Layout-controls toggle — grouped here for spatial coherence; grammar
          deferred to the algorithm-panel ADR (nav-controls ADR "Scope"). */}
      <ToolButton
        label="toggle layout controls"
        title={algorithmPanelOpen ? "close layout controls" : "open layout controls"}
        icon={<Settings2 size={ICON_PX} aria-hidden />}
        pressed={algorithmPanelOpen}
        onClick={onAlgorithmPanelToggle}
        {...roveButton(4)}
      />

      <span className="mx-vs-0-5 h-3.5 w-px bg-rule" aria-hidden />

      {/* Group 2 — the LOD descent. A two-segment toggle in its own group, kept
          formally distinct from the passive level receipt above (ADR
          "Granularity versus level"). Disabled in time-travel (the driver owns
          the scene's data); a quiet busy/degraded affordance otherwise — a
          designed state, never an error. The group's description states the
          descent's bounded nature (feature = overview, document = bounded full
          slice). */}
      <div
        className={`flex rounded-vs-sm border border-rule text-2xs transition-opacity duration-ui-fast ${
          timeTravelling ? "opacity-40" : ""
        } ${descentBusy ? "animate-pulse-live" : ""}`}
        role="group"
        aria-label="graph granularity"
        aria-disabled={timeTravelling || undefined}
        title={
          timeTravelling
            ? "granularity is fixed while time travelling — the timeline owns the scene"
            : descentDegraded
              ? `some of the graph is unavailable right now${
                  descentReason ? ` — ${descentReason}` : ""
                }`
              : "Switch between the feature constellation overview and the bounded full document graph"
        }
        data-nav-granularity
      >
        <button
          type="button"
          aria-pressed={granularity === "feature"}
          disabled={timeTravelling}
          onClick={() => setGranularity("feature")}
          className={`flex items-center rounded-l-vs-sm px-vs-1-5 py-vs-0-5 transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed ${
            granularity === "feature"
              ? "bg-accent-subtle font-medium text-ink"
              : "text-ink-faint hover:text-ink-muted"
          }`}
          title="Feature constellation — the unbounded-safe overview of how features relate"
          {...roveProps(5)}
        >
          feat
        </button>
        <span className="w-px bg-rule" aria-hidden />
        <button
          type="button"
          aria-pressed={granularity === "document"}
          disabled={timeTravelling}
          onClick={() => setGranularity("document")}
          className={`flex items-center rounded-r-vs-sm px-vs-1-5 py-vs-0-5 transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed ${
            granularity === "document"
              ? "bg-accent-subtle font-medium text-ink"
              : "text-ink-faint hover:text-ink-muted"
          }`}
          title="Document graph — the bounded full slice of vault documents and their links"
          {...roveProps(6)}
        >
          docs
        </button>
      </div>

      <span className="mx-vs-0-5 h-3.5 w-px bg-rule" aria-hidden />

      {/* Trailing — fullscreen (browser Fullscreen API). Reflects the live OS
          fullscreen state and swaps its icon + label accordingly (ADR
          "States"). */}
      <ToolButton
        label={isFullscreen ? "exit fullscreen" : "fullscreen"}
        title={isFullscreen ? "exit fullscreen (Esc)" : "fullscreen"}
        icon={
          isFullscreen ? (
            <Minimize size={ICON_PX} aria-hidden />
          ) : (
            <Maximize size={ICON_PX} aria-hidden />
          )
        }
        pressed={isFullscreen}
        onClick={isFullscreen ? exitFullscreen : enterFullscreen}
        {...roveButton(7)}
      />
    </div>
  );
}
