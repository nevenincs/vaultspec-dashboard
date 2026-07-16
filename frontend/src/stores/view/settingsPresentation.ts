import type { MessageDescriptor } from "../../platform/localization/message";
import type {
  SettingDef,
  SettingDisplayId,
  SettingEnumDisplayId,
  SettingGroupId,
} from "../server/engine";

type Descriptor = MessageDescriptor;

const descriptor = <Key extends Descriptor["key"]>(key: Key): MessageDescriptor<Key> =>
  Object.freeze({ key });

export const SETTINGS_GROUP_MESSAGES = Object.freeze({
  appearance: descriptor("settings:groups.appearance"),
  graph: descriptor("settings:groups.graph"),
  keybindings: descriptor("settings:groups.keybindings"),
} satisfies Readonly<Record<SettingGroupId, Descriptor>>);

export interface SettingPresentationDescriptors {
  readonly label: Descriptor;
  readonly description: Descriptor;
  readonly placeholder?: Descriptor;
}

export const SETTING_MESSAGES = Object.freeze({
  "appearance.theme": {
    label: descriptor("settings:fields.theme.label"),
    description: descriptor("settings:fields.theme.description"),
  },
  "appearance.reduceMotion": {
    label: descriptor("settings:fields.reduceMotion.label"),
    description: descriptor("settings:fields.reduceMotion.description"),
  },
  "appearance.activitySectionFolds": {
    label: descriptor("settings:fields.activitySectionFolds.label"),
    description: descriptor("settings:fields.activitySectionFolds.description"),
  },
  "appearance.language": {
    label: descriptor("settings:fields.language.label"),
    description: descriptor("settings:fields.language.description"),
  },
  "graph.defaultGranularity": {
    label: descriptor("settings:fields.defaultGranularity.label"),
    description: descriptor("settings:fields.defaultGranularity.description"),
  },
  "graph.corpus": {
    label: descriptor("settings:fields.corpus.label"),
    description: descriptor("settings:fields.corpus.description"),
  },
  "graph.timelineDate": {
    label: descriptor("settings:fields.timelineDate.label"),
    description: descriptor("settings:fields.timelineDate.description"),
  },
  "graph.confidenceFloor": {
    label: descriptor("settings:fields.confidenceFloor.label"),
    description: descriptor("settings:fields.confidenceFloor.description"),
  },
  "graph.labelFilter": {
    label: descriptor("settings:fields.labelFilter.label"),
    description: descriptor("settings:fields.labelFilter.description"),
    placeholder: descriptor("settings:fields.labelFilter.placeholder"),
  },
  "graph.controls": {
    label: descriptor("settings:fields.graphControls.label"),
    description: descriptor("settings:fields.graphControls.description"),
  },
  "keybindings.shortcuts": {
    label: descriptor("settings:fields.shortcuts.label"),
    description: descriptor("settings:fields.shortcuts.description"),
  },
} satisfies Readonly<Record<SettingDisplayId, SettingPresentationDescriptors>>);

export const SETTING_ENUM_MESSAGES = Object.freeze({
  "theme.system": descriptor("settings:options.system"),
  "theme.light": descriptor("settings:options.light"),
  "theme.dark": descriptor("settings:options.dark"),
  "theme.highContrast": descriptor("settings:options.highContrast"),
  "language.english": descriptor("settings:options.english"),
  "granularity.feature": descriptor("features:labels.feature"),
  "granularity.document": descriptor("documents:labels.document"),
  "corpus.vault": descriptor("documents:browserModes.documents"),
  "corpus.code": descriptor("documents:categories.code"),
  "timelineDate.created": descriptor("timeline:criteria.created"),
  "timelineDate.modified": descriptor("timeline:criteria.modified"),
  "timelineDate.stamped": descriptor("timeline:criteria.stamped"),
} satisfies Readonly<Record<SettingEnumDisplayId, Descriptor>>);

const SETTING_ENUM_VALUES = Object.freeze({
  "theme.system": "system",
  "theme.light": "light",
  "theme.dark": "dark",
  "theme.highContrast": "high-contrast",
  "language.english": "en",
  "granularity.feature": "feature",
  "granularity.document": "document",
  "corpus.vault": "vault",
  "corpus.code": "code",
  "timelineDate.created": "created",
  "timelineDate.modified": "modified",
  "timelineDate.stamped": "stamped",
} satisfies Readonly<Record<SettingEnumDisplayId, string>>);

export function settingPresentationDescriptors(
  def: SettingDef,
): SettingPresentationDescriptors | null {
  return Object.hasOwn(SETTING_MESSAGES, def.display.id)
    ? SETTING_MESSAGES[def.display.id]
    : null;
}

export function settingEnumMessageDescriptors(
  def: SettingDef,
): ReadonlyMap<string, Descriptor> | null {
  if (def.value_type.type !== "enum") {
    return def.display.enum_members.length === 0 ? new Map() : null;
  }
  if (def.value_type.members.length !== def.display.enum_members.length) return null;
  const messages = new Map<string, Descriptor>();
  for (let index = 0; index < def.value_type.members.length; index += 1) {
    const value = def.value_type.members[index]!;
    const display = def.display.enum_members[index];
    if (
      display === undefined ||
      display.value !== value ||
      !Object.hasOwn(SETTING_ENUM_MESSAGES, display.id) ||
      SETTING_ENUM_VALUES[display.id] !== value
    ) {
      return null;
    }
    messages.set(value, SETTING_ENUM_MESSAGES[display.id]);
  }
  return messages;
}
