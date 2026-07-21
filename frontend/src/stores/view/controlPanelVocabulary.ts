import type { MessageDescriptor } from "../../platform/localization/message";
import type { ControlSurfaceId } from "./controlPanels";

type ControlPanelLabelKey =
  | "common:controlPanels.labels.search"
  | "common:controlPanels.labels.approvals"
  | "common:controlPanels.labels.systemStatus"
  | "common:controlPanels.labels.projectHealth"
  | "common:controlPanels.labels.agentService";

type ControlPanelActionKey =
  | "common:controlPanels.actions.showSearch"
  | "common:controlPanels.actions.hideSearch"
  | "common:controlPanels.actions.showApprovals"
  | "common:controlPanels.actions.hideApprovals"
  | "common:controlPanels.actions.showSystemStatus"
  | "common:controlPanels.actions.hideSystemStatus"
  | "common:controlPanels.actions.showProjectHealth"
  | "common:controlPanels.actions.hideProjectHealth"
  | "common:controlPanels.actions.showAgentService"
  | "common:controlPanels.actions.hideAgentService";

type ControlPanelUnavailableTitleKey =
  | "common:controlPanels.unavailableTitles.search"
  | "common:controlPanels.unavailableTitles.approvals"
  | "common:controlPanels.unavailableTitles.systemStatus"
  | "common:controlPanels.unavailableTitles.projectHealth"
  | "common:controlPanels.unavailableTitles.agentService";

interface ControlPanelVocabularyEntry<
  Id extends ControlSurfaceId,
  LabelKey extends ControlPanelLabelKey,
  ShowKey extends ControlPanelActionKey,
  HideKey extends ControlPanelActionKey,
  UnavailableTitleKey extends ControlPanelUnavailableTitleKey,
> {
  readonly id: Id;
  readonly label: MessageDescriptor<LabelKey>;
  readonly showLabel: MessageDescriptor<ShowKey>;
  readonly hideLabel: MessageDescriptor<HideKey>;
  readonly unavailableTitle: MessageDescriptor<UnavailableTitleKey>;
}

export type ControlPanelVocabulary =
  | ControlPanelVocabularyEntry<
      "search-service",
      "common:controlPanels.labels.search",
      "common:controlPanels.actions.showSearch",
      "common:controlPanels.actions.hideSearch",
      "common:controlPanels.unavailableTitles.search"
    >
  | ControlPanelVocabularyEntry<
      "approvals",
      "common:controlPanels.labels.approvals",
      "common:controlPanels.actions.showApprovals",
      "common:controlPanels.actions.hideApprovals",
      "common:controlPanels.unavailableTitles.approvals"
    >
  | ControlPanelVocabularyEntry<
      "backend-health",
      "common:controlPanels.labels.systemStatus",
      "common:controlPanels.actions.showSystemStatus",
      "common:controlPanels.actions.hideSystemStatus",
      "common:controlPanels.unavailableTitles.systemStatus"
    >
  | ControlPanelVocabularyEntry<
      "vault-health",
      "common:controlPanels.labels.projectHealth",
      "common:controlPanels.actions.showProjectHealth",
      "common:controlPanels.actions.hideProjectHealth",
      "common:controlPanels.unavailableTitles.projectHealth"
    >
  | ControlPanelVocabularyEntry<
      "agent-service",
      "common:controlPanels.labels.agentService",
      "common:controlPanels.actions.showAgentService",
      "common:controlPanels.actions.hideAgentService",
      "common:controlPanels.unavailableTitles.agentService"
    >;

type ControlPanelVocabularyMap = Readonly<{
  [Id in ControlSurfaceId]: Extract<ControlPanelVocabulary, { readonly id: Id }>;
}>;

const descriptor = <Key extends MessageDescriptor["key"]>(
  key: Key,
): MessageDescriptor<Key> => Object.freeze({ key });

export const CONTROL_PANEL_VOCABULARY = Object.freeze({
  "search-service": Object.freeze({
    id: "search-service",
    label: descriptor("common:controlPanels.labels.search"),
    showLabel: descriptor("common:controlPanels.actions.showSearch"),
    hideLabel: descriptor("common:controlPanels.actions.hideSearch"),
    unavailableTitle: descriptor("common:controlPanels.unavailableTitles.search"),
  }),
  approvals: Object.freeze({
    id: "approvals",
    label: descriptor("common:controlPanels.labels.approvals"),
    showLabel: descriptor("common:controlPanels.actions.showApprovals"),
    hideLabel: descriptor("common:controlPanels.actions.hideApprovals"),
    unavailableTitle: descriptor("common:controlPanels.unavailableTitles.approvals"),
  }),
  "backend-health": Object.freeze({
    id: "backend-health",
    label: descriptor("common:controlPanels.labels.systemStatus"),
    showLabel: descriptor("common:controlPanels.actions.showSystemStatus"),
    hideLabel: descriptor("common:controlPanels.actions.hideSystemStatus"),
    unavailableTitle: descriptor("common:controlPanels.unavailableTitles.systemStatus"),
  }),
  "vault-health": Object.freeze({
    id: "vault-health",
    label: descriptor("common:controlPanels.labels.projectHealth"),
    showLabel: descriptor("common:controlPanels.actions.showProjectHealth"),
    hideLabel: descriptor("common:controlPanels.actions.hideProjectHealth"),
    unavailableTitle: descriptor(
      "common:controlPanels.unavailableTitles.projectHealth",
    ),
  }),
  "agent-service": Object.freeze({
    id: "agent-service",
    label: descriptor("common:controlPanels.labels.agentService"),
    showLabel: descriptor("common:controlPanels.actions.showAgentService"),
    hideLabel: descriptor("common:controlPanels.actions.hideAgentService"),
    unavailableTitle: descriptor("common:controlPanels.unavailableTitles.agentService"),
  }),
} as const satisfies ControlPanelVocabularyMap);

export function controlPanelVocabulary(value: unknown): ControlPanelVocabulary | null {
  return value === "search-service" ||
    value === "approvals" ||
    value === "backend-health" ||
    value === "vault-health" ||
    value === "agent-service"
    ? CONTROL_PANEL_VOCABULARY[value]
    : null;
}
