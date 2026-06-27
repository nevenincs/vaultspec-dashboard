// @figma GraphNavControls · SlhonORmySdoSMTQgDWw3w · 260:839
// Graph overlay controls (binding Figma redesign `graph/Hero` 213:505 +
// `graph/Sim + Display controls` 714:2630 + `NavControls/Vertical` 260:839). The
// graph's top bar is RETIRED: every graph affordance is now a canvas OVERLAY, so
// the field reads as the whole surface.
//
//   GraphNavControls — a VERTICAL camera cluster docked bottom-left (zoom in / out
//              · a rule · fit / recenter), camera SceneCommands only. A kit Card
//              over kit IconButtons (Lucide structural marks).
//   GraphSettingsPanel — a top-right icon trigger that drops a "Graph controls"
//              panel: a collapsible LAYOUT group (Spacing / Link length / Grouping
//              / Freeze layout) and APPEARANCE group (Node size / Importance / Link
//              thickness / Link opacity / Link colour) over the field's
//              `set-force-params` / `set-appearance-params` / `set-frozen` seams,
//              plus one "Reset to defaults".
//
// Every control resolves to a real, shared kit definition
// (design-system-is-centralized) and every user-facing string is the BINDING Figma
// plain-language vocabulary routed through the graph-controls chrome seam
// (ui-labels-are-user-facing): the seam keeps the technical ids (charge /
// linkStrength / nodeSalienceScale), the screen reads Spacing / Grouping /
// Importance.
//
// Layer ownership (dashboard-layer-ownership): app chrome steering the scene.
// Camera + layout affordances emit SceneController.command() ONLY; the panel
// fetches nothing, reads no raw `tiers` block, holds no node shape. Tokens only —
// no raw hex, no hardcoded px.

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { useFocusZone } from "../chrome/useFocusZone";

import {
  Card,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Divider,
  IconButton,
  Maximize,
  Menu,
  Minus,
  Plus,
  Popover,
  SectionLabel,
  Segment,
  SegmentedToggle,
  Slider,
  Switch,
} from "../kit";
import {
  useActiveScope,
  useDashboardGraphControlsView,
} from "../../stores/server/queries";
import {
  GRAPH_CONTROLS_APPEARANCE_DEFAULTS,
  GRAPH_CONTROLS_TUNE_DEFAULTS,
  deriveGraphControlsAppearancePresentationView,
  deriveGraphControlsFreezeToggleView,
  deriveGraphControlsNavigationView,
  deriveGraphControlsReflowToggleView,
  deriveGraphControlsSettingsPopoverView,
  deriveGraphControlsTunePresentationView,
  setGraphControlsAppearanceParams,
  toggleGraphControlsAppearanceOpen,
  toggleGraphControlsLayoutOpen,
  toggleGraphReflowFilter,
  setGraphControlsFrozen,
  setGraphControlsSettingsOpen,
  setGraphControlsTuneParams,
  toggleGraphControlsSettingsOpen,
  type GraphControlsAppearanceParams,
  type GraphControlsTuneParams,
  useGraphControlsAppearanceParams,
  useGraphControlsAppearanceOpen,
  useGraphControlsFrozen,
  useGraphControlsFrozenScope,
  useGraphControlsLayoutOpen,
  useGraphControlsSettingsOpen,
  useGraphControlsTuneParams,
  useGraphReflowFilter,
} from "../../stores/view/graphControlsChrome";
import { getScene } from "./Stage";

const ICON_PX = 16;

// ---------------------------------------------------------------------------
// Field interaction coalescing: a drag/keyboard run is bracketed by
// begin/end-interaction so the field can hold its energy floor for the duration
// and settle once the run ends. A keyboard step has no pointerup, so a trailing
// debounce ends the run once the steps stop.
// ---------------------------------------------------------------------------

const KEYBOARD_SETTLE_MS = 250;

function useFieldInteraction() {
  const interactingRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginInteraction = useCallback(() => {
    if (interactingRef.current) return;
    interactingRef.current = true;
    getScene().controller.command({ kind: "begin-interaction" });
  }, []);

  const endInteraction = useCallback(() => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    if (!interactingRef.current) return;
    interactingRef.current = false;
    getScene().controller.command({ kind: "end-interaction" });
  }, []);

  const armKeyboardSettle = useCallback(() => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(endInteraction, KEYBOARD_SETTLE_MS);
  }, [endInteraction]);

  // End any in-flight interaction if the panel unmounts mid-drag.
  useEffect(() => endInteraction, [endInteraction]);

  return { beginInteraction, endInteraction, armKeyboardSettle };
}

// ---------------------------------------------------------------------------
// GraphNavControls — the vertical camera cluster, docked bottom-left of the canvas
// (binding NavControls/Vertical 260:839). Camera commands only. The layout +
// divider classes come from the navigation chrome seam, never inline.
// ---------------------------------------------------------------------------

export function GraphNavControls() {
  const scene = getScene();
  const navigationView = deriveGraphControlsNavigationView();
  // The camera cluster is ONE tab stop: arrows rove between the four buttons via
  // the shared FocusZone, so the toolbar contributes a single stop to the stage
  // tab ring (keyboard-navigation W02.P05.S16 — the APG toolbar pattern).
  const [activeNav, setActiveNav] = useState<string | null>(null);
  const zone = useFocusZone({
    orientation: "both",
    wrap: false,
    activeKey: activeNav,
    onActiveKeyChange: setActiveNav,
  });
  const zoomIn = zone.rove("zoom-in");
  const zoomOut = zone.rove("zoom-out");
  const fit = zone.rove("fit-to-view");
  const reset = zone.rove("reset-view");
  return (
    <Card
      elevation="raised"
      padded={false}
      className="pointer-events-auto absolute bottom-fg-2 left-fg-2 z-10 p-fg-1"
      role="toolbar"
      aria-label={navigationView.ariaLabel}
      data-graph-nav-controls
    >
      <div className={navigationView.containerClassName}>
        <IconButton
          ref={zoomIn.ref}
          tabIndex={zoomIn.tabIndex}
          onKeyDown={zoomIn.onKeyDown}
          onFocus={() => setActiveNav("zoom-in")}
          label={navigationView.zoomIn.label}
          onClick={() => scene.controller.command({ kind: "zoom-in" })}
        >
          <Plus size={ICON_PX} aria-hidden />
        </IconButton>
        <IconButton
          ref={zoomOut.ref}
          tabIndex={zoomOut.tabIndex}
          onKeyDown={zoomOut.onKeyDown}
          onFocus={() => setActiveNav("zoom-out")}
          label={navigationView.zoomOut.label}
          onClick={() => scene.controller.command({ kind: "zoom-out" })}
        >
          <Minus size={ICON_PX} aria-hidden />
        </IconButton>
        <span className={navigationView.dividerClassName} aria-hidden />
        <IconButton
          ref={fit.ref}
          tabIndex={fit.tabIndex}
          onKeyDown={fit.onKeyDown}
          onFocus={() => setActiveNav("fit-to-view")}
          label={navigationView.fitToView.label}
          title={navigationView.fitToView.title}
          onClick={() => scene.controller.command({ kind: "fit-to-view" })}
        >
          <Maximize size={ICON_PX} aria-hidden />
        </IconButton>
        <IconButton
          ref={reset.ref}
          tabIndex={reset.tabIndex}
          onKeyDown={reset.onKeyDown}
          onFocus={() => setActiveNav("reset-view")}
          label={navigationView.resetView.label}
          title={navigationView.resetView.title}
          onClick={() => scene.controller.command({ kind: "reset-view" })}
        >
          <Crosshair size={ICON_PX} aria-hidden />
        </IconButton>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// PanelSlider — a binding panel row: a quiet label above a full-width kit Slider,
// with NO numeric readout (binding 714:2630 rows). The drag/keyboard run is
// bracketed for the field's interaction coalescing.
// ---------------------------------------------------------------------------

interface PanelSliderProps {
  label: string;
  title?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  onInteractStart: () => void;
  onInteractEnd: () => void;
}

function PanelSlider({
  label,
  title,
  value,
  min,
  max,
  step,
  onChange,
  onInteractStart,
  onInteractEnd,
}: PanelSliderProps) {
  return (
    <div className="flex w-full flex-col gap-fg-1" title={title}>
      <span className="text-label text-ink-muted">{label}</span>
      <div
        onPointerDown={onInteractStart}
        onPointerUp={onInteractEnd}
        onKeyDown={onInteractStart}
        onBlur={onInteractEnd}
      >
        <Slider
          label={label}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={onChange}
          fullWidth
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FreezeRow — the "Freeze layout" row: a label + a kit Switch over the field's
// `set-frozen` seam. Pausing holds the simulation in place without adding energy;
// it is meaningful only while the layout can settle, so it disables when freeze is
// unavailable and clears when the active scope changes (a scope switch re-runs the
// solver, so a stale frozen flag must not persist).
// ---------------------------------------------------------------------------

function FreezeRow() {
  const scene = getScene();
  const scope = useActiveScope();
  const { freezeAvailable } = useDashboardGraphControlsView(scope);
  const frozen = useGraphControlsFrozen();
  const frozenScope = useGraphControlsFrozenScope();
  const freezeView = deriveGraphControlsFreezeToggleView(frozen, freezeAvailable);
  const tuneView = deriveGraphControlsTunePresentationView();

  useEffect(() => {
    if (!frozen) return;
    const scopeChanged = frozenScope !== scope;
    if (freezeAvailable && !scopeChanged) return;
    setGraphControlsFrozen(false, null);
    scene.controller.command({ kind: "set-frozen", frozen: false });
  }, [freezeAvailable, frozen, frozenScope, scene.controller, scope]);

  useEffect(() => {
    return () => {
      if (frozen) scene.controller.command({ kind: "set-frozen", frozen: false });
    };
  }, [frozen, scene.controller]);

  function toggle() {
    const next = !frozen;
    setGraphControlsFrozen(next, scope);
    scene.controller.command({ kind: "set-frozen", frozen: next });
  }

  return (
    <div className={tuneView.freezeRowClassName} title={freezeView.title}>
      <span className={tuneView.freezeLabelClassName}>{tuneView.freezeLabel}</span>
      <Switch
        checked={frozen}
        disabled={!freezeAvailable}
        onChange={toggle}
        label={freezeView.label}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReflowRow — the "Reflow on filter" row: a label + a kit Switch over the
// canvas-local reflow flag. OFF (default) = filtering dims/hides nodes in place
// (stable positions); ON = filtering REMOVES them from the live simulation so the
// graph re-forms around the survivors. Unlike FreezeRow this dispatches no scene
// command directly — Stage's reactive data effect reads the flag and re-feeds the
// (filtered) set-data with the reflow hint. A canvas-behaviour toggle, never the
// canonical filter (filtering-has-one-canonical-surface: the rail still authors WHAT
// is filtered; this only changes HOW the canvas reacts).
// ---------------------------------------------------------------------------

function ReflowRow() {
  const reflow = useGraphReflowFilter();
  const tuneView = deriveGraphControlsTunePresentationView();
  const view = deriveGraphControlsReflowToggleView(reflow);
  return (
    <div className={tuneView.freezeRowClassName} title={view.title}>
      <span className={tuneView.freezeLabelClassName}>{view.label}</span>
      <Switch checked={reflow} onChange={toggleGraphReflowFilter} label={view.label} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// LayoutSection — the collapsible LAYOUT group: the field's d3-force knobs (Spacing
// / Link length / Grouping) + the Freeze layout row. The sliders map onto
// `set-force-params` (Spacing → −charge magnitude; link distance / spring straight
// through).
// ---------------------------------------------------------------------------

function LayoutSection() {
  const open = useGraphControlsLayoutOpen();
  const params = useGraphControlsTuneParams();
  const tuneView = deriveGraphControlsTunePresentationView();
  const spacing = tuneView.sliders.repulsion;
  const linkDistance = tuneView.sliders.linkDistance;
  const grouping = tuneView.sliders.linkSpring;
  const { beginInteraction, endInteraction, armKeyboardSettle } = useFieldInteraction();
  const bodyId = useId();

  function apply(update: Partial<GraphControlsTuneParams>) {
    const next = { ...params, ...update };
    setGraphControlsTuneParams(next);
    beginInteraction();
    // Map the UI knobs onto the field's d3-force params: Spacing is the push
    // MAGNITUDE → a negative charge; link distance / spring map straight through.
    getScene().controller.command({
      kind: "set-force-params",
      params: {
        charge: -next.repulsion,
        linkDistance: next.linkDistance,
        linkStrength: next.linkSpring,
      },
    });
    armKeyboardSettle();
  }

  return (
    <FoldableCategory
      label={tuneView.categoryLabel}
      expanded={open}
      onToggle={toggleGraphControlsLayoutOpen}
      bodyId={bodyId}
    >
      <PanelSlider
        label={spacing.label}
        title={spacing.title}
        value={params.repulsion}
        min={spacing.min}
        max={spacing.max}
        step={spacing.step}
        onChange={(v) => apply({ repulsion: v })}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      <PanelSlider
        label={linkDistance.label}
        title={linkDistance.title}
        value={params.linkDistance}
        min={linkDistance.min}
        max={linkDistance.max}
        step={linkDistance.step}
        onChange={(v) => apply({ linkDistance: v })}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      <PanelSlider
        label={grouping.label}
        title={grouping.title}
        value={params.linkSpring}
        min={grouping.min}
        max={grouping.max}
        step={grouping.step}
        onChange={(v) => apply({ linkSpring: v })}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      <FreezeRow />
      <ReflowRow />
    </FoldableCategory>
  );
}

// ---------------------------------------------------------------------------
// AppearanceSection — the collapsible APPEARANCE group: the node-size + link-look
// knobs over `set-appearance-params`. Link colour is a Solid / Blended segmented
// toggle (Blended — the leaf→parent gradient — is the binding default).
// ---------------------------------------------------------------------------

function AppearanceSection() {
  const open = useGraphControlsAppearanceOpen();
  const params = useGraphControlsAppearanceParams();
  const view = deriveGraphControlsAppearancePresentationView();
  const nodeSize = view.sliders.nodeSizeScale;
  const importance = view.sliders.nodeSalienceScale;
  const linkThickness = view.sliders.edgeWidthMax;
  const linkOpacity = view.sliders.edgeOpacityMax;
  const { beginInteraction, endInteraction, armKeyboardSettle } = useFieldInteraction();
  const bodyId = useId();

  function apply(update: Partial<GraphControlsAppearanceParams>) {
    const next = { ...params, ...update };
    setGraphControlsAppearanceParams(next);
    beginInteraction();
    // Dispatch the full appearance set (incl. the unsurfaced min ends) so the field
    // merges a complete, consistent look.
    getScene().controller.command({
      kind: "set-appearance-params",
      params: {
        nodeSizeScale: next.nodeSizeScale,
        nodeSalienceScale: next.nodeSalienceScale,
        edgeWidthMin: next.edgeWidthMin,
        edgeWidthMax: next.edgeWidthMax,
        edgeOpacityMin: next.edgeOpacityMin,
        edgeOpacityMax: next.edgeOpacityMax,
        edgeColorMode: next.edgeColorMode,
        nodeIcons: next.nodeIcons,
      },
    });
    armKeyboardSettle();
  }

  return (
    <FoldableCategory
      label={view.heading}
      expanded={open}
      onToggle={toggleGraphControlsAppearanceOpen}
      bodyId={bodyId}
    >
      <PanelSlider
        label={nodeSize.label}
        title={nodeSize.title}
        value={params.nodeSizeScale}
        min={nodeSize.min}
        max={nodeSize.max}
        step={nodeSize.step}
        onChange={(v) => apply({ nodeSizeScale: v })}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      <PanelSlider
        label={importance.label}
        title={importance.title}
        value={params.nodeSalienceScale}
        min={importance.min}
        max={importance.max}
        step={importance.step}
        onChange={(v) => apply({ nodeSalienceScale: v })}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      <PanelSlider
        label={linkThickness.label}
        title={linkThickness.title}
        value={params.edgeWidthMax}
        min={linkThickness.min}
        max={linkThickness.max}
        step={linkThickness.step}
        onChange={(v) => apply({ edgeWidthMax: v })}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      <PanelSlider
        label={linkOpacity.label}
        title={linkOpacity.title}
        value={params.edgeOpacityMax}
        min={linkOpacity.min}
        max={linkOpacity.max}
        step={linkOpacity.step}
        onChange={(v) => apply({ edgeOpacityMax: v })}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      <div className="flex w-full flex-col gap-fg-1">
        <span className="text-label text-ink-muted">{view.colorModeLabel}</span>
        <SegmentedToggle
          ariaLabel={view.colorModeAriaLabel}
          value={params.edgeColorMode}
          onChange={(v) =>
            apply({
              edgeColorMode: v as GraphControlsAppearanceParams["edgeColorMode"],
            })
          }
          fullWidth
        >
          <Segment value="solid">{view.solidLabel}</Segment>
          <Segment value="gradient">{view.gradientLabel}</Segment>
        </SegmentedToggle>
      </div>
      <div
        className="flex items-center justify-between gap-fg-2"
        title={view.iconsTitle}
      >
        <span className="text-label text-ink-muted">{view.iconsLabel}</span>
        <Switch
          checked={params.nodeIcons}
          onChange={(v) => apply({ nodeIcons: v })}
          label={view.iconsAriaLabel}
        />
      </div>
    </FoldableCategory>
  );
}

// ---------------------------------------------------------------------------
// FoldableCategory — a collapsible group inside the panel, composing the ONE
// canonical fold idiom (the kit twisty + SectionLabel eyebrow). Pure local
// disclosure chrome owned by each section.
// ---------------------------------------------------------------------------

function FoldableCategory({
  label,
  expanded,
  onToggle,
  bodyId,
  children,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  bodyId: string;
  children: React.ReactNode;
}) {
  const Twisty = expanded ? ChevronDown : ChevronRight;
  return (
    <section className="flex w-full flex-col gap-fg-2" data-graph-control-category>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
        className="flex w-full items-center gap-fg-1-5 rounded-fg-xs text-left transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        <Twisty size={14} aria-hidden className="shrink-0 text-ink-faint" />
        <SectionLabel>{label}</SectionLabel>
      </button>
      {expanded && (
        <div id={bodyId} className="flex w-full flex-col gap-fg-2 pl-fg-1">
          {children}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// GraphSettingsPanel — the top-right trigger (binding `graph-settings-trigger`)
// that drops the "Graph controls" panel. Collapsed by default so the field is never
// occluded; opening / closing (toggle / Escape / outside pointer) flows through the
// shared Popover light-dismiss seam. One "Reset to defaults" restores both groups.
// ---------------------------------------------------------------------------

export function GraphSettingsPanel() {
  const open = useGraphControlsSettingsOpen();
  const tuneView = deriveGraphControlsTunePresentationView();
  const label = tuneView.title;
  const popover = deriveGraphControlsSettingsPopoverView(open, label);
  const panelId = useId();
  const close = useCallback(() => setGraphControlsSettingsOpen(false), []);

  function resetAll() {
    setGraphControlsTuneParams(GRAPH_CONTROLS_TUNE_DEFAULTS);
    setGraphControlsAppearanceParams(GRAPH_CONTROLS_APPEARANCE_DEFAULTS);
    getScene().controller.command({
      kind: "set-force-params",
      params: {
        charge: -GRAPH_CONTROLS_TUNE_DEFAULTS.repulsion,
        linkDistance: GRAPH_CONTROLS_TUNE_DEFAULTS.linkDistance,
        linkStrength: GRAPH_CONTROLS_TUNE_DEFAULTS.linkSpring,
      },
    });
    getScene().controller.command({
      kind: "set-appearance-params",
      params: { ...GRAPH_CONTROLS_APPEARANCE_DEFAULTS },
    });
  }

  return (
    <Popover
      open={open}
      onDismiss={close}
      escapeTarget={document}
      className="pointer-events-auto absolute right-fg-2 top-fg-2 z-30 flex items-center"
      data-graph-settings
    >
      <span data-popover-trigger>
        <IconButton
          label={tuneView.title}
          active={popover.active}
          aria-expanded={popover.ariaExpanded}
          aria-controls={panelId}
          onClick={toggleGraphControlsSettingsOpen}
        >
          <Menu size={ICON_PX} aria-hidden />
        </IconButton>
      </span>
      {popover.panelVisible && (
        <Card
          id={panelId}
          elevation="overlay"
          padded={false}
          role="group"
          aria-label={popover.panelAriaLabel}
          className={popover.panelClassName}
          data-popover-panel
        >
          <p className="text-body font-medium text-ink">{tuneView.title}</p>
          <LayoutSection />
          <Divider />
          <AppearanceSection />
          <button
            type="button"
            onClick={resetAll}
            className={tuneView.resetButtonClassName}
          >
            {tuneView.resetLabel}
          </button>
        </Card>
      )}
    </Popover>
  );
}
