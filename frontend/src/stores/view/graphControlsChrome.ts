import { create } from "zustand";

import { appearanceDefaults, specById } from "../../scene/three/graphControlSchema";
import type { MessageDescriptor } from "../../platform/localization/message";
import {
  GRAPH_CONTROLS_MESSAGES,
  UI_GRAPH_CONTROL_MESSAGES,
} from "./graphControlsVocabulary";
import { normalizeViewStoreSessionString } from "./scopeIdentity";

export interface GraphControlsTuneParams {
  repulsion: number;
  linkDistance: number;
  linkSpring: number;
}

export type GraphControlsTuneParamKey = keyof GraphControlsTuneParams;

export const GRAPH_CONTROLS_TUNE_DEFAULTS: GraphControlsTuneParams = {
  repulsion: -numericSpec("charge").default,
  linkDistance: numericSpec("linkDistance").default,
  linkSpring: numericSpec("linkStrength").default,
};

function finiteOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numericSpec(id: string): {
  min: number;
  max: number;
  step: number;
  default: number;
} {
  const spec = specById(id);
  if (
    !spec ||
    spec.type !== "number" ||
    spec.min === undefined ||
    spec.max === undefined ||
    spec.step === undefined ||
    typeof spec.default !== "number"
  ) {
    throw new Error(`graphControlsChrome: expected numeric schema spec "${id}"`);
  }
  return {
    min: spec.min,
    max: spec.max,
    step: spec.step,
    default: spec.default,
  };
}

export function normalizeGraphControlsTuneParams(
  params: unknown,
): GraphControlsTuneParams {
  const value: Record<string, unknown> =
    params !== null && typeof params === "object"
      ? (params as Record<string, unknown>)
      : {};
  return {
    repulsion: finiteOrDefault(
      "repulsion" in value ? value.repulsion : undefined,
      GRAPH_CONTROLS_TUNE_DEFAULTS.repulsion,
    ),
    linkDistance: finiteOrDefault(
      "linkDistance" in value ? value.linkDistance : undefined,
      GRAPH_CONTROLS_TUNE_DEFAULTS.linkDistance,
    ),
    linkSpring: finiteOrDefault(
      "linkSpring" in value ? value.linkSpring : undefined,
      GRAPH_CONTROLS_TUNE_DEFAULTS.linkSpring,
    ),
  };
}

export function normalizeGraphControlsOpen(open: unknown): boolean {
  return open === true;
}

export function normalizeGraphControlsFrozen(frozen: unknown): boolean {
  return frozen === true;
}

export const normalizeGraphControlsFrozenScope = normalizeViewStoreSessionString;

export interface GraphControlsTuneSliderPresentationView {
  label: MessageDescriptor;
  title: MessageDescriptor;
  min: number;
  max: number;
  step: number;
}

export interface GraphControlsTunePresentationView {
  title: MessageDescriptor;
  categoryLabel: MessageDescriptor;
  containerClassName: string;
  freezeRowClassName: string;
  freezeLabelClassName: string;
  freezeLabel: MessageDescriptor;
  resetButtonClassName: string;
  resetLabel: MessageDescriptor;
  sliders: Record<GraphControlsTuneParamKey, GraphControlsTuneSliderPresentationView>;
}

export function deriveGraphControlsTunePresentationView(): GraphControlsTunePresentationView {
  const charge = numericSpec("charge");
  const linkDistance = numericSpec("linkDistance");
  const linkStrength = numericSpec("linkStrength");
  return {
    title: GRAPH_CONTROLS_MESSAGES.title,
    categoryLabel: GRAPH_CONTROLS_MESSAGES.sections.layout,
    containerClassName: "flex w-full flex-col gap-fg-2",
    freezeRowClassName: "flex items-center justify-between gap-fg-2",
    freezeLabelClassName: "text-body text-ink-muted",
    freezeLabel: GRAPH_CONTROLS_MESSAGES.labels.keepLayoutFixed,
    resetButtonClassName:
      "self-start text-caption text-accent-text underline-offset-2 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
    resetLabel: GRAPH_CONTROLS_MESSAGES.actions.resetSettings,
    sliders: {
      repulsion: {
        label: UI_GRAPH_CONTROL_MESSAGES.charge.label,
        title: UI_GRAPH_CONTROL_MESSAGES.charge.description,
        min: -charge.max,
        max: -charge.min,
        step: charge.step,
      },
      linkDistance: {
        label: UI_GRAPH_CONTROL_MESSAGES.linkDistance.label,
        title: UI_GRAPH_CONTROL_MESSAGES.linkDistance.description,
        min: linkDistance.min,
        max: linkDistance.max,
        step: linkDistance.step,
      },
      linkSpring: {
        label: UI_GRAPH_CONTROL_MESSAGES.linkStrength.label,
        title: UI_GRAPH_CONTROL_MESSAGES.linkStrength.description,
        min: linkStrength.min,
        max: linkStrength.max,
        step: linkStrength.step,
      },
    },
  };
}

export type GraphControlsEdgeColorMode = "solid" | "gradient";
export type GraphControlsNodeColorMode = "category" | "recency";

export interface GraphControlsAppearanceParams {
  nodeSizeScale: number;
  nodeSalienceScale: number;
  edgeWidthMin: number;
  edgeWidthMax: number;
  edgeOpacityMin: number;
  edgeOpacityMax: number;
  edgeColorMode: GraphControlsEdgeColorMode;
  nodeColorMode: GraphControlsNodeColorMode;

  nodeIcons: boolean;
}

export type GraphControlsAppearanceSliderKey =
  | "nodeSizeScale"
  | "nodeSalienceScale"
  | "edgeWidthMax"
  | "edgeOpacityMax";

export const GRAPH_CONTROLS_APPEARANCE_DEFAULTS: GraphControlsAppearanceParams =
  appearanceDefaults();

export function normalizeGraphControlsAppearanceParams(
  params: unknown,
): GraphControlsAppearanceParams {
  const value: Record<string, unknown> =
    params !== null && typeof params === "object"
      ? (params as Record<string, unknown>)
      : {};
  const mode = value.edgeColorMode;
  return {
    nodeSizeScale: finiteOrDefault(
      "nodeSizeScale" in value ? value.nodeSizeScale : undefined,
      GRAPH_CONTROLS_APPEARANCE_DEFAULTS.nodeSizeScale,
    ),
    nodeSalienceScale: finiteOrDefault(
      "nodeSalienceScale" in value ? value.nodeSalienceScale : undefined,
      GRAPH_CONTROLS_APPEARANCE_DEFAULTS.nodeSalienceScale,
    ),
    edgeWidthMin: finiteOrDefault(
      "edgeWidthMin" in value ? value.edgeWidthMin : undefined,
      GRAPH_CONTROLS_APPEARANCE_DEFAULTS.edgeWidthMin,
    ),
    edgeWidthMax: finiteOrDefault(
      "edgeWidthMax" in value ? value.edgeWidthMax : undefined,
      GRAPH_CONTROLS_APPEARANCE_DEFAULTS.edgeWidthMax,
    ),
    edgeOpacityMin: finiteOrDefault(
      "edgeOpacityMin" in value ? value.edgeOpacityMin : undefined,
      GRAPH_CONTROLS_APPEARANCE_DEFAULTS.edgeOpacityMin,
    ),
    edgeOpacityMax: finiteOrDefault(
      "edgeOpacityMax" in value ? value.edgeOpacityMax : undefined,
      GRAPH_CONTROLS_APPEARANCE_DEFAULTS.edgeOpacityMax,
    ),
    edgeColorMode:
      mode === "solid" || mode === "gradient"
        ? mode
        : GRAPH_CONTROLS_APPEARANCE_DEFAULTS.edgeColorMode,
    nodeColorMode:
      value.nodeColorMode === "category" || value.nodeColorMode === "recency"
        ? value.nodeColorMode
        : GRAPH_CONTROLS_APPEARANCE_DEFAULTS.nodeColorMode,
    nodeIcons:
      typeof value.nodeIcons === "boolean"
        ? value.nodeIcons
        : GRAPH_CONTROLS_APPEARANCE_DEFAULTS.nodeIcons,
  };
}

export interface GraphControlsAppearancePresentationView {
  containerClassName: string;
  headingClassName: string;
  heading: MessageDescriptor;
  colorModeLabel: MessageDescriptor;
  colorModeAriaLabel: MessageDescriptor;
  solidLabel: MessageDescriptor;
  gradientLabel: MessageDescriptor;
  nodeColorModeLabel: MessageDescriptor;
  nodeColorModeAriaLabel: MessageDescriptor;
  categoryLabel: MessageDescriptor;
  recencyLabel: MessageDescriptor;
  iconsLabel: MessageDescriptor;
  iconsTitle: MessageDescriptor;
  iconsAriaLabel: MessageDescriptor;
  resetButtonClassName: string;
  resetLabel: MessageDescriptor;
  sliders: Record<
    GraphControlsAppearanceSliderKey,
    GraphControlsTuneSliderPresentationView
  >;
}

export function deriveGraphControlsAppearancePresentationView(): GraphControlsAppearancePresentationView {
  const nodeSize = numericSpec("nodeSizeScale");
  const salience = numericSpec("nodeSalienceScale");
  const edgeWidth = numericSpec("edgeWidthMax");
  const edgeOpacity = numericSpec("edgeOpacityMax");
  return {
    containerClassName: "flex w-full flex-col gap-fg-2",
    headingClassName: "text-label text-ink-muted",
    heading: GRAPH_CONTROLS_MESSAGES.sections.appearance,
    colorModeLabel: UI_GRAPH_CONTROL_MESSAGES.edgeColorMode.label,
    colorModeAriaLabel: GRAPH_CONTROLS_MESSAGES.accessibility.edgeColorMode,
    solidLabel: GRAPH_CONTROLS_MESSAGES.options.solid,
    gradientLabel: GRAPH_CONTROLS_MESSAGES.options.blended,
    nodeColorModeLabel: UI_GRAPH_CONTROL_MESSAGES.nodeColorMode.label,
    nodeColorModeAriaLabel: GRAPH_CONTROLS_MESSAGES.accessibility.nodeColorMode,
    categoryLabel: GRAPH_CONTROLS_MESSAGES.options.category,
    recencyLabel: GRAPH_CONTROLS_MESSAGES.options.recency,
    iconsLabel: UI_GRAPH_CONTROL_MESSAGES.nodeIcons.label,
    iconsTitle: UI_GRAPH_CONTROL_MESSAGES.nodeIcons.description,
    iconsAriaLabel: GRAPH_CONTROLS_MESSAGES.accessibility.showNodeIcons,
    resetButtonClassName:
      "self-start text-caption text-accent-text underline-offset-2 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
    resetLabel: GRAPH_CONTROLS_MESSAGES.actions.resetSettings,
    sliders: {
      nodeSizeScale: {
        label: UI_GRAPH_CONTROL_MESSAGES.nodeSizeScale.label,
        title: UI_GRAPH_CONTROL_MESSAGES.nodeSizeScale.description,
        min: nodeSize.min,
        max: nodeSize.max,
        step: nodeSize.step,
      },
      nodeSalienceScale: {
        label: UI_GRAPH_CONTROL_MESSAGES.nodeSalienceScale.label,
        title: UI_GRAPH_CONTROL_MESSAGES.nodeSalienceScale.description,
        min: salience.min,
        max: salience.max,
        step: salience.step,
      },
      edgeWidthMax: {
        label: UI_GRAPH_CONTROL_MESSAGES.edgeWidthMax.label,
        title: UI_GRAPH_CONTROL_MESSAGES.edgeWidthMax.description,
        min: edgeWidth.min,
        max: edgeWidth.max,
        step: edgeWidth.step,
      },
      edgeOpacityMax: {
        label: UI_GRAPH_CONTROL_MESSAGES.edgeOpacityMax.label,
        title: UI_GRAPH_CONTROL_MESSAGES.edgeOpacityMax.description,
        min: edgeOpacity.min,
        max: edgeOpacity.max,
        step: edgeOpacity.step,
      },
    },
  };
}

export interface GraphControlsSegmentOptionView {
  value: string;
  label: MessageDescriptor;
  title: MessageDescriptor;
}

export interface GraphControlsViewPresentationView {
  heading: MessageDescriptor;
  detailAriaLabel: MessageDescriptor;
  detailOptions: readonly GraphControlsSegmentOptionView[];

  caption: MessageDescriptor;
}

export function deriveGraphControlsViewPresentationView(): GraphControlsViewPresentationView {
  return {
    heading: GRAPH_CONTROLS_MESSAGES.sections.show,
    detailAriaLabel: GRAPH_CONTROLS_MESSAGES.accessibility.nodeLevel,
    detailOptions: [
      {
        value: "feature",
        label: GRAPH_CONTROLS_MESSAGES.options.features,
        title: GRAPH_CONTROLS_MESSAGES.descriptions.featureLevel,
      },
      {
        value: "document",
        label: GRAPH_CONTROLS_MESSAGES.options.documents,
        title: GRAPH_CONTROLS_MESSAGES.descriptions.documentLevel,
      },
    ],
    caption: GRAPH_CONTROLS_MESSAGES.descriptions.granularity,
  };
}

export interface GraphControlsSettingsPopoverView {
  active: boolean;
  ariaExpanded: boolean;
  panelVisible: boolean;
  panelAriaLabel: MessageDescriptor;
  panelClassName: string;
}

export function deriveGraphControlsSettingsPopoverView(
  open: boolean,
  label: MessageDescriptor,
): GraphControlsSettingsPopoverView {
  return {
    active: open,
    ariaExpanded: open,
    panelVisible: open,
    panelAriaLabel: label,
    panelClassName:
      "absolute right-0 top-full z-30 mt-fg-1 flex w-[16.5rem] flex-col gap-fg-3 p-fg-3 backdrop-blur-sm",
  };
}

export interface GraphControlsFreezeToggleView {
  label: MessageDescriptor;
  title: MessageDescriptor;
}

export function deriveGraphControlsFreezeToggleView(
  _frozen: boolean,
  freezeAvailable: boolean,
): GraphControlsFreezeToggleView {
  return {
    label: GRAPH_CONTROLS_MESSAGES.labels.keepLayoutFixed,
    title: freezeAvailable
      ? GRAPH_CONTROLS_MESSAGES.descriptions.keepLayoutFixed
      : GRAPH_CONTROLS_MESSAGES.descriptions.settingUnavailableInHistory,
  };
}

export interface GraphControlsSimToggleView {
  label: MessageDescriptor;
  title: MessageDescriptor;
}

export function deriveGraphControlsSimToggleView(
  running: boolean,
): GraphControlsSimToggleView {
  return {
    label: running
      ? GRAPH_CONTROLS_MESSAGES.actions.pauseMovement
      : GRAPH_CONTROLS_MESSAGES.actions.resumeMovement,
    title: running
      ? GRAPH_CONTROLS_MESSAGES.actions.pauseMovement
      : GRAPH_CONTROLS_MESSAGES.actions.resumeMovement,
  };
}

export interface GraphControlsReflowToggleView {
  label: MessageDescriptor;
  title: MessageDescriptor;
}

export function deriveGraphControlsReflowToggleView(
  _reflow: boolean,
): GraphControlsReflowToggleView {
  return {
    label: GRAPH_CONTROLS_MESSAGES.actions.rearrangeAfterFiltering,
    title: GRAPH_CONTROLS_MESSAGES.descriptions.rearrangeAfterFiltering,
  };
}

export interface GraphControlsNavigationButtonView {
  label: MessageDescriptor;
  title?: MessageDescriptor;
}

export interface GraphControlsNavigationView {
  containerClassName: string;
  ariaLabel: MessageDescriptor;
  dividerClassName: string;
  zoomIn: GraphControlsNavigationButtonView;
  zoomOut: GraphControlsNavigationButtonView;
  fitToView: GraphControlsNavigationButtonView;

  autoframe: {
    label: MessageDescriptor;
    titleOn: MessageDescriptor;
    titleOff: MessageDescriptor;
  };
}

export function deriveGraphControlsNavigationView(): GraphControlsNavigationView {
  return {
    containerClassName: "flex flex-col items-center gap-fg-0-5",
    ariaLabel: GRAPH_CONTROLS_MESSAGES.accessibility.navigation,
    dividerClassName: "my-fg-0-5 h-px w-6 bg-rule",
    zoomIn: { label: GRAPH_CONTROLS_MESSAGES.actions.zoomIn },
    zoomOut: { label: GRAPH_CONTROLS_MESSAGES.actions.zoomOut },
    fitToView: {
      label: GRAPH_CONTROLS_MESSAGES.actions.fitToView,
      title: GRAPH_CONTROLS_MESSAGES.actions.fitToView,
    },
    autoframe: {
      label: GRAPH_CONTROLS_MESSAGES.actions.keepInView,
      titleOn: GRAPH_CONTROLS_MESSAGES.descriptions.keepInView,
      titleOff: GRAPH_CONTROLS_MESSAGES.descriptions.keepInView,
    },
  };
}

interface GraphControlsChromeState {
  settingsOpen: boolean;
  layoutOpen: boolean;
  appearanceOpen: boolean;
  frozen: boolean;
  frozenScope: string | null;
  reflowFilter: boolean;
  autoframeEnabled: boolean;
  simRunning: boolean;
  tuneParams: GraphControlsTuneParams;
  appearanceParams: GraphControlsAppearanceParams;
  setSettingsOpen: (open: unknown) => void;
  toggleSettingsOpen: () => void;
  setLayoutOpen: (open: unknown) => void;
  toggleLayoutOpen: () => void;
  setAppearanceOpen: (open: unknown) => void;
  toggleAppearanceOpen: () => void;
  setFrozen: (frozen: unknown, scope: unknown) => void;
  setReflowFilter: (on: unknown) => void;
  toggleReflowFilter: () => void;
  setAutoframe: (on: unknown) => void;
  toggleAutoframe: () => void;
  setSimRunning: (running: unknown) => void;
  setTuneParams: (params: unknown) => void;
  patchTuneParams: (patch: unknown) => void;
  setAppearanceParams: (params: unknown) => void;
  patchAppearanceParams: (patch: unknown) => void;
  reset: () => void;
}

export const useGraphControlsChromeStore = create<GraphControlsChromeState>((set) => ({
  settingsOpen: false,
  layoutOpen: true,
  appearanceOpen: true,
  frozen: false,
  frozenScope: null,
  reflowFilter: false,
  autoframeEnabled: true,
  simRunning: false,
  tuneParams: normalizeGraphControlsTuneParams(GRAPH_CONTROLS_TUNE_DEFAULTS),
  appearanceParams: normalizeGraphControlsAppearanceParams(
    GRAPH_CONTROLS_APPEARANCE_DEFAULTS,
  ),
  setSettingsOpen: (settingsOpen) =>
    set({ settingsOpen: normalizeGraphControlsOpen(settingsOpen) }),
  toggleSettingsOpen: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
  setLayoutOpen: (layoutOpen) =>
    set({ layoutOpen: normalizeGraphControlsOpen(layoutOpen) }),
  toggleLayoutOpen: () => set((state) => ({ layoutOpen: !state.layoutOpen })),
  setAppearanceOpen: (appearanceOpen) =>
    set({ appearanceOpen: normalizeGraphControlsOpen(appearanceOpen) }),
  toggleAppearanceOpen: () =>
    set((state) => ({ appearanceOpen: !state.appearanceOpen })),
  setFrozen: (frozen, frozenScope) =>
    set({
      frozen: normalizeGraphControlsFrozen(frozen),
      frozenScope: normalizeGraphControlsFrozenScope(frozenScope),
    }),
  setReflowFilter: (on) => set({ reflowFilter: normalizeGraphControlsOpen(on) }),
  toggleReflowFilter: () => set((state) => ({ reflowFilter: !state.reflowFilter })),
  setAutoframe: (on) => set({ autoframeEnabled: normalizeGraphControlsOpen(on) }),
  toggleAutoframe: () =>
    set((state) => ({ autoframeEnabled: !state.autoframeEnabled })),
  setSimRunning: (running) => set({ simRunning: normalizeGraphControlsOpen(running) }),
  setTuneParams: (tuneParams) =>
    set({ tuneParams: normalizeGraphControlsTuneParams(tuneParams) }),
  patchTuneParams: (patch) =>
    set((state) => {
      const patchRecord: Record<string, unknown> =
        patch !== null && typeof patch === "object"
          ? (patch as Record<string, unknown>)
          : {};
      return {
        tuneParams: normalizeGraphControlsTuneParams({
          ...state.tuneParams,
          ...patchRecord,
        }),
      };
    }),
  setAppearanceParams: (appearanceParams) =>
    set({
      appearanceParams: normalizeGraphControlsAppearanceParams(appearanceParams),
    }),
  patchAppearanceParams: (patch) =>
    set((state) => {
      const patchRecord: Record<string, unknown> =
        patch !== null && typeof patch === "object"
          ? (patch as Record<string, unknown>)
          : {};
      return {
        appearanceParams: normalizeGraphControlsAppearanceParams({
          ...state.appearanceParams,
          ...patchRecord,
        }),
      };
    }),
  reset: () =>
    set({
      settingsOpen: false,
      layoutOpen: true,
      appearanceOpen: true,
      frozen: false,
      frozenScope: null,
      reflowFilter: false,
      autoframeEnabled: true,
      simRunning: false,
      tuneParams: normalizeGraphControlsTuneParams(GRAPH_CONTROLS_TUNE_DEFAULTS),
      appearanceParams: normalizeGraphControlsAppearanceParams(
        GRAPH_CONTROLS_APPEARANCE_DEFAULTS,
      ),
    }),
}));

export function useGraphControlsSettingsOpen(): boolean {
  return useGraphControlsChromeStore((state) => state.settingsOpen);
}

export function useGraphControlsAutoframe(): boolean {
  return useGraphControlsChromeStore((state) => state.autoframeEnabled);
}

export function useGraphControlsSimRunning(): boolean {
  return useGraphControlsChromeStore((state) => state.simRunning);
}

export function setGraphControlsSimRunning(running: unknown): void {
  useGraphControlsChromeStore.getState().setSimRunning(running);
}

export function toggleGraphControlsAutoframe(): void {
  useGraphControlsChromeStore.getState().toggleAutoframe();
}

export function useGraphControlsLayoutOpen(): boolean {
  return useGraphControlsChromeStore((state) => state.layoutOpen);
}

export function useGraphControlsAppearanceOpen(): boolean {
  return useGraphControlsChromeStore((state) => state.appearanceOpen);
}

export function useGraphControlsFrozen(): boolean {
  return useGraphControlsChromeStore((state) => state.frozen);
}

export function useGraphControlsFrozenScope(): string | null {
  return useGraphControlsChromeStore((state) => state.frozenScope);
}

export function setGraphControlsSettingsOpen(open: unknown): void {
  useGraphControlsChromeStore.getState().setSettingsOpen(open);
}

export function toggleGraphControlsSettingsOpen(): void {
  useGraphControlsChromeStore.getState().toggleSettingsOpen();
}

export function setGraphControlsLayoutOpen(open: unknown): void {
  useGraphControlsChromeStore.getState().setLayoutOpen(open);
}

export function toggleGraphControlsLayoutOpen(): void {
  useGraphControlsChromeStore.getState().toggleLayoutOpen();
}

export function setGraphControlsAppearanceOpen(open: unknown): void {
  useGraphControlsChromeStore.getState().setAppearanceOpen(open);
}

export function toggleGraphControlsAppearanceOpen(): void {
  useGraphControlsChromeStore.getState().toggleAppearanceOpen();
}

export function setGraphControlsFrozen(frozen: unknown, scope: unknown): void {
  useGraphControlsChromeStore.getState().setFrozen(frozen, scope);
}

export function useGraphReflowFilter(): boolean {
  return useGraphControlsChromeStore((state) => state.reflowFilter);
}

export function setGraphReflowFilter(on: unknown): void {
  useGraphControlsChromeStore.getState().setReflowFilter(on);
}

export function toggleGraphReflowFilter(): void {
  useGraphControlsChromeStore.getState().toggleReflowFilter();
}

export function resetGraphControlsChrome(): void {
  useGraphControlsChromeStore.getState().reset();
}

export function useGraphControlsTuneParams(): GraphControlsTuneParams {
  return useGraphControlsChromeStore((state) => state.tuneParams);
}

export function setGraphControlsTuneParams(params: unknown): void {
  useGraphControlsChromeStore.getState().setTuneParams(params);
}

export function patchGraphControlsTuneParams(patch: unknown): void {
  useGraphControlsChromeStore.getState().patchTuneParams(patch);
}

export function useGraphControlsAppearanceParams(): GraphControlsAppearanceParams {
  return useGraphControlsChromeStore((state) => state.appearanceParams);
}

export function setGraphControlsAppearanceParams(params: unknown): void {
  useGraphControlsChromeStore.getState().setAppearanceParams(params);
}

export function patchGraphControlsAppearanceParams(patch: unknown): void {
  useGraphControlsChromeStore.getState().patchAppearanceParams(patch);
}
