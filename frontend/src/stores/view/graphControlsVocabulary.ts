import type { UiGraphControlId } from "../../scene/three/graphControlSchema";
import type { MessageDescriptor } from "../../platform/localization/message";

interface GraphControlMessages {
  readonly label: MessageDescriptor;
  readonly description: MessageDescriptor;
}

export const UI_GRAPH_CONTROL_MESSAGES = {
  charge: {
    label: { key: "graph:controls.labels.charge" },
    description: { key: "graph:controls.descriptions.charge" },
  },
  edgeColorMode: {
    label: { key: "graph:controls.labels.edgeColorMode" },
    description: { key: "graph:controls.descriptions.edgeColorMode" },
  },
  edgeOpacityMax: {
    label: { key: "graph:controls.labels.edgeOpacityMax" },
    description: { key: "graph:controls.descriptions.edgeOpacityMax" },
  },
  edgeWidthMax: {
    label: { key: "graph:controls.labels.edgeWidthMax" },
    description: { key: "graph:controls.descriptions.edgeWidthMax" },
  },
  linkDistance: {
    label: { key: "graph:controls.labels.linkDistance" },
    description: { key: "graph:controls.descriptions.linkDistance" },
  },
  linkStrength: {
    label: { key: "graph:controls.labels.linkStrength" },
    description: { key: "graph:controls.descriptions.linkStrength" },
  },
  nodeColorMode: {
    label: { key: "graph:controls.labels.nodeColorMode" },
    description: { key: "graph:controls.descriptions.nodeColorMode" },
  },
  nodeIcons: {
    label: { key: "graph:controls.labels.nodeIcons" },
    description: { key: "graph:controls.descriptions.nodeIcons" },
  },
  nodeSalienceScale: {
    label: { key: "graph:controls.labels.nodeSalienceScale" },
    description: { key: "graph:controls.descriptions.nodeSalienceScale" },
  },
  nodeSizeScale: {
    label: { key: "graph:controls.labels.nodeSizeScale" },
    description: { key: "graph:controls.descriptions.nodeSizeScale" },
  },
} as const satisfies Record<UiGraphControlId, GraphControlMessages>;

export const GRAPH_CONTROLS_MESSAGES = {
  title: { key: "graph:controls.title" },
  sections: {
    show: { key: "graph:controls.sections.show" },
    layout: { key: "graph:controls.sections.layout" },
    appearance: { key: "graph:controls.sections.appearance" },
  },
  accessibility: {
    navigation: { key: "graph:controls.accessibility.navigation" },
    nodeLevel: { key: "graph:controls.accessibility.nodeLevel" },
    edgeColorMode: { key: "graph:controls.accessibility.edgeColorMode" },
    nodeColorMode: { key: "graph:controls.accessibility.nodeColorMode" },
    showNodeIcons: { key: "graph:controls.accessibility.showNodeIcons" },
  },
  actions: {
    fitToView: { key: "graph:actions.fitToView" },
    keepInView: { key: "graph:actions.keepInView" },
    pauseMovement: { key: "graph:actions.pauseMovement" },
    rearrangeAfterFiltering: { key: "graph:actions.rearrangeAfterFiltering" },
    resetSettings: { key: "graph:actions.resetSettings" },
    resumeMovement: { key: "graph:actions.resumeMovement" },
    zoomIn: { key: "graph:actions.zoomIn" },
    zoomOut: { key: "graph:actions.zoomOut" },
  },
  labels: {
    keepLayoutFixed: { key: "graph:controls.labels.keepLayoutFixed" },
  },
  descriptions: {
    documentLevel: { key: "graph:controls.descriptions.documentLevel" },
    featureLevel: { key: "graph:controls.descriptions.featureLevel" },
    granularity: { key: "graph:controls.descriptions.granularity" },
    keepInView: { key: "graph:controls.descriptions.keepInView" },
    keepLayoutFixed: { key: "graph:controls.descriptions.keepLayoutFixed" },
    rearrangeAfterFiltering: {
      key: "graph:controls.descriptions.rearrangeAfterFiltering",
    },
    settingUnavailableInHistory: {
      key: "graph:controls.descriptions.settingUnavailableInHistory",
    },
  },
  options: {
    blended: { key: "graph:controls.options.blended" },
    category: { key: "graph:controls.options.category" },
    documents: { key: "graph:controls.options.documents" },
    features: { key: "graph:controls.options.features" },
    recency: { key: "graph:controls.options.recency" },
    solid: { key: "graph:controls.options.solid" },
  },
} as const;
