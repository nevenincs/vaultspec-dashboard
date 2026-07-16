import { useCallback, useEffect, useId, useRef, useState } from "react";

import { useFocusZone } from "../chrome/useFocusZone";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";

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
  Pause,
  Play,
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
import { useDashboardStageControlsIntent } from "../../stores/server/dashboardStageControlsIntent";
import {
  GRAPH_CONTROLS_APPEARANCE_DEFAULTS,
  GRAPH_CONTROLS_TUNE_DEFAULTS,
  deriveGraphControlsAppearancePresentationView,
  deriveGraphControlsFreezeToggleView,
  deriveGraphControlsNavigationView,
  deriveGraphControlsReflowToggleView,
  deriveGraphControlsSettingsPopoverView,
  deriveGraphControlsSimToggleView,
  deriveGraphControlsTunePresentationView,
  deriveGraphControlsViewPresentationView,
  setGraphControlsAppearanceParams,
  toggleGraphControlsAppearanceOpen,
  toggleGraphControlsAutoframe,
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
  useGraphControlsAutoframe,
  useGraphControlsFrozen,
  useGraphControlsFrozenScope,
  useGraphControlsLayoutOpen,
  useGraphControlsSettingsOpen,
  useGraphControlsSimRunning,
  useGraphControlsTuneParams,
  useGraphReflowFilter,
} from "../../stores/view/graphControlsChrome";
import { getScene } from "./Stage";

const ICON_PX = 16;

function useGraphControlMessage() {
  const resolveMessage = useLocalizedMessageResolver();
  return useCallback(
    (descriptor: MessageDescriptor) => resolveMessage(descriptor).message,
    [resolveMessage],
  );
}

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

  useEffect(() => endInteraction, [endInteraction]);

  return { beginInteraction, endInteraction, armKeyboardSettle };
}

export function GraphNavControls() {
  const message = useGraphControlMessage();
  const scene = getScene();
  const navigationView = deriveGraphControlsNavigationView();
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
  const autoframeRove = zone.rove("autoframe");
  const autoframe = useGraphControlsAutoframe();
  useEffect(() => {
    scene.controller.command({ kind: "set-autoframe", enabled: autoframe });
  }, [autoframe, scene.controller]);
  return (
    <Card
      elevation="raised"
      padded={false}
      className="pointer-events-auto absolute bottom-fg-2 left-fg-2 z-10 p-fg-1"
      role="toolbar"
      aria-label={message(navigationView.ariaLabel)}
      data-graph-nav-controls
    >
      <div className={navigationView.containerClassName}>
        <IconButton
          ref={zoomIn.ref}
          tabIndex={zoomIn.tabIndex}
          onKeyDown={zoomIn.onKeyDown}
          onFocus={() => setActiveNav("zoom-in")}
          label={message(navigationView.zoomIn.label)}
          onClick={() => scene.controller.command({ kind: "zoom-in" })}
        >
          <Plus size={ICON_PX} aria-hidden />
        </IconButton>
        <IconButton
          ref={zoomOut.ref}
          tabIndex={zoomOut.tabIndex}
          onKeyDown={zoomOut.onKeyDown}
          onFocus={() => setActiveNav("zoom-out")}
          label={message(navigationView.zoomOut.label)}
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
          label={message(navigationView.fitToView.label)}
          title={
            navigationView.fitToView.title
              ? message(navigationView.fitToView.title)
              : undefined
          }
          onClick={() => scene.controller.command({ kind: "fit-to-view" })}
        >
          <Maximize size={ICON_PX} aria-hidden />
        </IconButton>
        <IconButton
          ref={autoframeRove.ref}
          tabIndex={autoframeRove.tabIndex}
          onKeyDown={autoframeRove.onKeyDown}
          onFocus={() => setActiveNav("autoframe")}
          active={autoframe}
          aria-pressed={autoframe}
          label={message(navigationView.autoframe.label)}
          title={
            autoframe
              ? message(navigationView.autoframe.titleOn)
              : message(navigationView.autoframe.titleOff)
          }
          onClick={toggleGraphControlsAutoframe}
        >
          <Crosshair size={ICON_PX} aria-hidden />
        </IconButton>
      </div>
    </Card>
  );
}

export function GraphSimControl() {
  const message = useGraphControlMessage();
  const scene = getScene();
  const running = useGraphControlsSimRunning();
  const frozen = useGraphControlsFrozen();
  const view = deriveGraphControlsSimToggleView(running);
  function toggle() {
    if (running) {
      scene.controller.command({ kind: "set-simulation-active", active: false });
      return;
    }
    if (frozen) {
      setGraphControlsFrozen(false, null);
      scene.controller.command({ kind: "set-frozen", frozen: false });
    }
    scene.controller.command({ kind: "sim-play" });
  }
  return (
    <Card
      elevation="raised"
      padded={false}
      className="pointer-events-auto absolute left-fg-2 top-fg-2 z-10 p-fg-1"
      data-graph-sim-control
    >
      <IconButton
        label={message(view.label)}
        title={message(view.title)}
        aria-pressed={running}
        active={running}
        onClick={toggle}
      >
        {running ? (
          <Pause size={ICON_PX} aria-hidden />
        ) : (
          <Play size={ICON_PX} aria-hidden />
        )}
      </IconButton>
    </Card>
  );
}

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

function FreezeRow() {
  const message = useGraphControlMessage();
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
    <div className={tuneView.freezeRowClassName} title={message(freezeView.title)}>
      <span className={tuneView.freezeLabelClassName}>
        {message(tuneView.freezeLabel)}
      </span>
      <Switch
        checked={frozen}
        disabled={!freezeAvailable}
        onChange={toggle}
        label={message(freezeView.label)}
      />
    </div>
  );
}

function ReflowRow() {
  const message = useGraphControlMessage();
  const reflow = useGraphReflowFilter();
  const tuneView = deriveGraphControlsTunePresentationView();
  const view = deriveGraphControlsReflowToggleView(reflow);
  return (
    <div className={tuneView.freezeRowClassName} title={message(view.title)}>
      <span className={tuneView.freezeLabelClassName}>{message(view.label)}</span>
      <Switch
        checked={reflow}
        onChange={toggleGraphReflowFilter}
        label={message(view.label)}
      />
    </div>
  );
}

function LayoutSection() {
  const message = useGraphControlMessage();
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
      label={message(tuneView.categoryLabel)}
      expanded={open}
      onToggle={toggleGraphControlsLayoutOpen}
      bodyId={bodyId}
    >
      <PanelSlider
        label={message(spacing.label)}
        title={message(spacing.title)}
        value={params.repulsion}
        min={spacing.min}
        max={spacing.max}
        step={spacing.step}
        onChange={(v) => apply({ repulsion: v })}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      <PanelSlider
        label={message(linkDistance.label)}
        title={message(linkDistance.title)}
        value={params.linkDistance}
        min={linkDistance.min}
        max={linkDistance.max}
        step={linkDistance.step}
        onChange={(v) => apply({ linkDistance: v })}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      <PanelSlider
        label={message(grouping.label)}
        title={message(grouping.title)}
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

function AppearanceSection() {
  const message = useGraphControlMessage();
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
      label={message(view.heading)}
      expanded={open}
      onToggle={toggleGraphControlsAppearanceOpen}
      bodyId={bodyId}
    >
      <PanelSlider
        label={message(nodeSize.label)}
        title={message(nodeSize.title)}
        value={params.nodeSizeScale}
        min={nodeSize.min}
        max={nodeSize.max}
        step={nodeSize.step}
        onChange={(v) => apply({ nodeSizeScale: v })}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      <PanelSlider
        label={message(importance.label)}
        title={message(importance.title)}
        value={params.nodeSalienceScale}
        min={importance.min}
        max={importance.max}
        step={importance.step}
        onChange={(v) => apply({ nodeSalienceScale: v })}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      <PanelSlider
        label={message(linkThickness.label)}
        title={message(linkThickness.title)}
        value={params.edgeWidthMax}
        min={linkThickness.min}
        max={linkThickness.max}
        step={linkThickness.step}
        onChange={(v) => apply({ edgeWidthMax: v })}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      <PanelSlider
        label={message(linkOpacity.label)}
        title={message(linkOpacity.title)}
        value={params.edgeOpacityMax}
        min={linkOpacity.min}
        max={linkOpacity.max}
        step={linkOpacity.step}
        onChange={(v) => apply({ edgeOpacityMax: v })}
        onInteractStart={beginInteraction}
        onInteractEnd={endInteraction}
      />
      <div className="flex w-full flex-col gap-fg-1">
        <span className="text-label text-ink-muted">
          {message(view.nodeColorModeLabel)}
        </span>
        <SegmentedToggle
          ariaLabel={message(view.nodeColorModeAriaLabel)}
          value={params.nodeColorMode}
          onChange={(v) =>
            apply({
              nodeColorMode: v as GraphControlsAppearanceParams["nodeColorMode"],
            })
          }
          fullWidth
        >
          <Segment value="category">{message(view.categoryLabel)}</Segment>
          <Segment value="recency">{message(view.recencyLabel)}</Segment>
        </SegmentedToggle>
      </div>
      <div className="flex w-full flex-col gap-fg-1">
        <span className="text-label text-ink-muted">
          {message(view.colorModeLabel)}
        </span>
        <SegmentedToggle
          ariaLabel={message(view.colorModeAriaLabel)}
          value={params.edgeColorMode}
          onChange={(v) =>
            apply({
              edgeColorMode: v as GraphControlsAppearanceParams["edgeColorMode"],
            })
          }
          fullWidth
        >
          <Segment value="solid">{message(view.solidLabel)}</Segment>
          <Segment value="gradient">{message(view.gradientLabel)}</Segment>
        </SegmentedToggle>
      </div>
      <div
        className="flex items-center justify-between gap-fg-2"
        title={message(view.iconsTitle)}
      >
        <span className="text-label text-ink-muted">{message(view.iconsLabel)}</span>
        <Switch
          checked={params.nodeIcons}
          onChange={(v) => apply({ nodeIcons: v })}
          label={message(view.iconsAriaLabel)}
        />
      </div>
    </FoldableCategory>
  );
}

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

function ViewSection() {
  const message = useGraphControlMessage();
  const scope = useActiveScope();
  const { granularity } = useDashboardGraphControlsView(scope);
  const controls = useDashboardStageControlsIntent(scope);
  const view = deriveGraphControlsViewPresentationView();

  return (
    <section className="flex w-full flex-col gap-fg-1-5" data-graph-view-section>
      <SectionLabel>{message(view.heading)}</SectionLabel>
      <SegmentedToggle
        ariaLabel={message(view.detailAriaLabel)}
        value={granularity}
        onChange={(v) => void controls.setGranularity(v).catch(() => undefined)}
        fullWidth
      >
        {view.detailOptions.map((option) => (
          <Segment
            key={option.value}
            value={option.value}
            title={message(option.title)}
          >
            {message(option.label)}
          </Segment>
        ))}
      </SegmentedToggle>
      <p className="text-caption text-ink-muted">{message(view.caption)}</p>
    </section>
  );
}

export function GraphSettingsPanel() {
  const message = useGraphControlMessage();
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
      {/* Graph visibility is NOT toggled from here - it rides the dock's single
          top-right action cluster (DockWorkspace), so there is exactly one graph
          toggle and it is never duplicated against this settings trigger. */}
      <span data-popover-trigger>
        <IconButton
          label={message(tuneView.title)}
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
          aria-label={message(popover.panelAriaLabel)}
          className={popover.panelClassName}
          data-popover-panel
        >
          <p className="text-body font-medium text-ink">{message(tuneView.title)}</p>
          <ViewSection />
          <Divider />
          <LayoutSection />
          <Divider />
          <AppearanceSection />
          <button
            type="button"
            onClick={resetAll}
            className={tuneView.resetButtonClassName}
          >
            {message(tuneView.resetLabel)}
          </button>
        </Card>
      )}
    </Popover>
  );
}
