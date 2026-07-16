import type { AppearanceControlSection } from "../../scene/three/appearanceControls";
import type { ForceControlSection } from "../../scene/three/forceControls";
import type { LabGraphControlId } from "../../scene/three/graphControlSchema";
import type {
  CountMessageDescriptor,
  MessageDescriptor,
} from "../../platform/localization/message";
import {
  GRAPH_CONTROLS_MESSAGES,
  UI_GRAPH_CONTROL_MESSAGES,
} from "./graphControlsVocabulary";

interface GraphControlMessages {
  readonly label: MessageDescriptor;
  readonly description: MessageDescriptor;
}

export const LAB_GRAPH_CONTROL_MESSAGES = {
  charge: UI_GRAPH_CONTROL_MESSAGES.charge,
  linkDistance: UI_GRAPH_CONTROL_MESSAGES.linkDistance,
  linkStrength: UI_GRAPH_CONTROL_MESSAGES.linkStrength,
  chargeDistanceMax: {
    label: { key: "graph:lab.controls.labels.chargeDistanceMax" },
    description: { key: "graph:lab.controls.descriptions.chargeDistanceMax" },
  },
  chargeTheta: {
    label: { key: "graph:lab.controls.labels.chargeTheta" },
    description: { key: "graph:lab.controls.descriptions.chargeTheta" },
  },
  centerStrength: {
    label: { key: "graph:lab.controls.labels.centerStrength" },
    description: { key: "graph:lab.controls.descriptions.centerStrength" },
  },
  collidePadding: {
    label: { key: "graph:lab.controls.labels.collidePadding" },
    description: { key: "graph:lab.controls.descriptions.collidePadding" },
  },
  collideStrength: {
    label: { key: "graph:lab.controls.labels.collideStrength" },
    description: { key: "graph:lab.controls.descriptions.collideStrength" },
  },
  collideIterations: {
    label: { key: "graph:lab.controls.labels.collideIterations" },
    description: { key: "graph:lab.controls.descriptions.collideIterations" },
  },
  velocityDecay: {
    label: { key: "graph:lab.controls.labels.velocityDecay" },
    description: { key: "graph:lab.controls.descriptions.velocityDecay" },
  },
  alphaDecay: {
    label: { key: "graph:lab.controls.labels.alphaDecay" },
    description: { key: "graph:lab.controls.descriptions.alphaDecay" },
  },
  alphaMin: {
    label: { key: "graph:lab.controls.labels.alphaMin" },
    description: { key: "graph:lab.controls.descriptions.alphaMin" },
  },
  dragAlpha: {
    label: { key: "graph:lab.controls.labels.dragAlpha" },
    description: { key: "graph:lab.controls.descriptions.dragAlpha" },
  },
  wakeMove: {
    label: { key: "graph:lab.controls.labels.wakeMove" },
    description: { key: "graph:lab.controls.descriptions.wakeMove" },
  },
  wakeRadius: {
    label: { key: "graph:lab.controls.labels.wakeRadius" },
    description: { key: "graph:lab.controls.descriptions.wakeRadius" },
  },
  sleepSpeed: {
    label: { key: "graph:lab.controls.labels.sleepSpeed" },
    description: { key: "graph:lab.controls.descriptions.sleepSpeed" },
  },
  sleepTicks: {
    label: { key: "graph:lab.controls.labels.sleepTicks" },
    description: { key: "graph:lab.controls.descriptions.sleepTicks" },
  },
  nodeSizeScale: UI_GRAPH_CONTROL_MESSAGES.nodeSizeScale,
  nodeSalienceScale: UI_GRAPH_CONTROL_MESSAGES.nodeSalienceScale,
  edgeWidthMin: {
    label: { key: "graph:lab.controls.labels.edgeWidthMin" },
    description: { key: "graph:lab.controls.descriptions.edgeWidthMin" },
  },
  edgeWidthMax: UI_GRAPH_CONTROL_MESSAGES.edgeWidthMax,
  edgeOpacityMin: {
    label: { key: "graph:lab.controls.labels.edgeOpacityMin" },
    description: { key: "graph:lab.controls.descriptions.edgeOpacityMin" },
  },
  edgeOpacityMax: UI_GRAPH_CONTROL_MESSAGES.edgeOpacityMax,
  edgeColorMode: UI_GRAPH_CONTROL_MESSAGES.edgeColorMode,
  nodeColorMode: UI_GRAPH_CONTROL_MESSAGES.nodeColorMode,
  nodeIcons: UI_GRAPH_CONTROL_MESSAGES.nodeIcons,
} as const satisfies Record<LabGraphControlId, GraphControlMessages>;

export const FORCE_CONTROL_SECTION_MESSAGES = {
  links: { key: "graph:lab.sections.links" },
  charge: { key: "graph:lab.sections.charge" },
  gravity: { key: "graph:lab.sections.gravity" },
  collision: { key: "graph:lab.sections.collision" },
  cooling: { key: "graph:lab.sections.cooling" },
  dragAndSleep: { key: "graph:lab.sections.dragAndSleep" },
} as const satisfies Record<ForceControlSection, MessageDescriptor>;

export const APPEARANCE_CONTROL_SECTION_MESSAGES = {
  nodes: { key: "graph:lab.sections.nodes" },
  edges: { key: "graph:lab.sections.edges" },
} as const satisfies Record<AppearanceControlSection, MessageDescriptor>;

export type LabGraphControlOption = "solid" | "gradient" | "category" | "recency";

export const LAB_GRAPH_CONTROL_OPTION_MESSAGES = {
  solid: GRAPH_CONTROLS_MESSAGES.options.solid,
  gradient: GRAPH_CONTROLS_MESSAGES.options.blended,
  category: GRAPH_CONTROLS_MESSAGES.options.category,
  recency: GRAPH_CONTROLS_MESSAGES.options.recency,
} as const satisfies Record<LabGraphControlOption, MessageDescriptor>;

export const THREE_LAB_MESSAGES = {
  title: { key: "graph:lab.title" },
  documentTitle: { key: "graph:lab.documentTitle" },
  panels: {
    simulation: { key: "graph:lab.panels.simulation" },
    appearance: { key: "graph:lab.panels.appearance" },
  },
  actions: {
    loadSample: { key: "graph:lab.actions.loadSample" },
    fitToView: { key: "graph:lab.actions.fitToView" },
    restartMovement: { key: "graph:lab.actions.restartMovement" },
    collapse: { key: "graph:lab.actions.collapse" },
    expand: { key: "graph:lab.actions.expand" },
    reset: { key: "graph:lab.actions.reset" },
    savePreset: { key: "graph:lab.actions.savePreset" },
    deletePreset: { key: "graph:lab.actions.deletePreset" },
    copyLink: { key: "graph:lab.actions.copyLink" },
  },
  accessibility: {
    simulationPanel: { key: "graph:lab.accessibility.simulationPanel" },
    appearancePanel: { key: "graph:lab.accessibility.appearancePanel" },
    presetList: { key: "graph:lab.accessibility.presetList" },
  },
  presets: {
    defaultName: { key: "graph:lab.presets.defaultName" },
    namePlaceholder: { key: "graph:lab.presets.namePlaceholder" },
    loadTitle: { key: "graph:lab.presets.loadTitle" },
    deleteTitle: { key: "graph:lab.presets.deleteTitle" },
  },
  feedback: {
    defaultsRestored: { key: "graph:lab.feedback.defaultsRestored" },
    presetNameRequired: { key: "graph:lab.feedback.presetNameRequired" },
    defaultPresetProtected: { key: "graph:lab.feedback.defaultPresetProtected" },
    linkCopied: { key: "graph:lab.feedback.linkCopied" },
    linkUnavailable: { key: "graph:lab.feedback.linkUnavailable" },
    linkCreationFailed: { key: "graph:lab.feedback.linkCreationFailed" },
  },
  values: { automatic: { key: "graph:lab.values.automatic" } },
} as const;

export function loadGeneratedMessage(count: number): CountMessageDescriptor {
  return { key: "graph:lab.actions.loadGenerated", values: { count } };
}

export function presetFeedbackMessage(
  action: "presetLoaded" | "presetSaved" | "presetDeleted",
  preset: string,
): MessageDescriptor {
  return { key: PRESET_FEEDBACK_KEYS[action], values: { preset } };
}

const PRESET_FEEDBACK_KEYS = {
  presetLoaded: "graph:lab.feedback.presetLoaded",
  presetSaved: "graph:lab.feedback.presetSaved",
  presetDeleted: "graph:lab.feedback.presetDeleted",
} as const;

const SAMPLE_TITLE_MESSAGES = {
  planning: { key: "graph:lab.sampleTitles.planning" },
  connections: { key: "graph:lab.sampleTitles.connections" },
  history: { key: "graph:lab.sampleTitles.history" },
  researchNote: { key: "graph:lab.sampleTitles.researchNote" },
  designNote: { key: "graph:lab.sampleTitles.designNote" },
  workPlan: { key: "graph:lab.sampleTitles.workPlan" },
  progressNote: { key: "graph:lab.sampleTitles.progressNote" },
  qualitySummary: { key: "graph:lab.sampleTitles.qualitySummary" },
  projectGuidance: { key: "graph:lab.sampleTitles.projectGuidance" },
  workGroup: { key: "graph:lab.sampleTitles.workGroup" },
} as const;

export function sampleTitleMessage(
  title:
    | "planning"
    | "connections"
    | "history"
    | "researchNote"
    | "designNote"
    | "workPlan"
    | "progressNote"
    | "qualitySummary"
    | "projectGuidance"
    | "workGroup",
): MessageDescriptor {
  return SAMPLE_TITLE_MESSAGES[title];
}

const GENERATED_TITLE_KEYS = {
  generatedGroup: "graph:lab.sampleTitles.generatedGroup",
  generatedItem: "graph:lab.sampleTitles.generatedItem",
} as const;

export function generatedTitleMessage(
  kind: "generatedGroup" | "generatedItem",
  number: number,
): MessageDescriptor {
  return { key: GENERATED_TITLE_KEYS[kind], values: { number } };
}
