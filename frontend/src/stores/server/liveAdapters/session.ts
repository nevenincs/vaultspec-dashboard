// Auto-split from liveAdapters.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the liveAdapters barrel; see ./index.ts.

import { normalizeWorkspaceLayoutBlob } from "../../workspaceLayout";
import type {
  RecentScope,
  ScopeContextWire,
  SessionState,
  SettingControlKind,
  SettingDef,
  SettingDisplay,
  SettingDisplayId,
  SettingEnumDisplayId,
  SettingGroupId,
  SettingValueType,
  SettingsSchema,
  SettingsState,
  TiersBlock,
  WorkspaceRoot,
  WorkspacesState,
} from "../engine";
import { SCOPE_ID_MAX_CHARS } from "../scopeIdentity";
import { isRec } from "./internal";

// --- session / settings (user-state-persistence W04.P08.S28) ---------------------
//
// Tolerant adapters for the orchestration crate's session/settings surface. The
// live `{data, tiers}` envelope is already unwrapped by `unwrapEnvelope` before
// these run (the client's get/put path); a body already in the internal shape
// (the mock) passes through unchanged — the one-code-path property. Every
// missing field defaults to a safe empty so a sparse or older shape NEVER throws
// and the chrome never has to read the raw tiers block (the degradation truth
// still rides through on `tiers`, defaulted to an empty block when absent).

function normalizeSessionString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= SCOPE_ID_MAX_CHARS
    ? normalized
    : undefined;
}

export const SESSION_STRING_LIST_MAX_ITEMS = 512;

function normalizeSessionStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const normalized = normalizeSessionString(entry);
    if (normalized === undefined || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= SESSION_STRING_LIST_MAX_ITEMS) break;
  }
  return out;
}

/** Tolerant adapter for the machine-global `recent_scopes` list: an array of
 *  `{workspace, scope}` pairs, dropping malformed entries, deduping by the pair,
 *  and bounding the list. A sparse or older session shape (no `recent_scopes`)
 *  defaults to an empty list rather than throwing. */
function normalizeRecentScopes(value: unknown): RecentScope[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: RecentScope[] = [];
  for (const entry of value) {
    if (!isRec(entry)) continue;
    const workspace = normalizeSessionString(entry.workspace);
    const scope = normalizeSessionString(entry.scope);
    if (workspace === undefined || scope === undefined) continue;
    const key = `${workspace} ${scope}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ workspace, scope });
    if (out.length >= SESSION_STRING_LIST_MAX_ITEMS) break;
  }
  return out;
}

/** Default a scope-context wire shape, tolerating an absent or partial object:
 *  an absent `folder` becomes null (no folder selected), absent `feature_tags`
 *  becomes []. */
function adaptScopeContext(value: unknown): ScopeContextWire {
  if (!isRec(value)) return { folder: null, feature_tags: [] };
  const folder = normalizeSessionString(value.folder) ?? null;
  const workspaceLayout = normalizeWorkspaceLayoutBlob(value.workspace_layout);
  return {
    folder,
    feature_tags: normalizeSessionStringList(value.feature_tags),
    ...(workspaceLayout !== null ? { workspace_layout: workspaceLayout } : {}),
  };
}

/**
 * Live `/session` → the internal session state. TOLERANT: a sparse body (no
 * `scope_context`, no `recents`) defaults to safe empties rather than throwing,
 * so a freshly-recreated best-effort store (the prototype's corrupt→empty path)
 * restores as "no selection yet" instead of crashing the load.
 */
export function adaptSession(body: unknown): SessionState {
  if (!isRec(body)) {
    return {
      workspace: "",
      active_scope: "",
      active_workspace: null,
      scope_context: { folder: null, feature_tags: [] },
      recents: [],
      recent_scopes: [],
      tiers: {},
    };
  }
  return {
    workspace: normalizeSessionString(body.workspace) ?? "",
    active_scope: normalizeSessionString(body.active_scope) ?? "",
    // The active WORKSPACE id (dashboard-workspace-registry ADR); null when
    // absent (a sparse or older session shape) so the rail marks none current.
    active_workspace: normalizeSessionString(body.active_workspace) ?? null,
    scope_context: adaptScopeContext(body.scope_context),
    recents: normalizeSessionStringList(body.recents),
    recent_scopes: normalizeRecentScopes(body.recent_scopes),
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

// --- workspace registry (dashboard-workspace-registry ADR) -----------------------
//
// Tolerant adapter for `GET /workspaces`. The live `{data, tiers}` envelope is
// already unwrapped by `unwrapEnvelope` before this runs; a body already in the
// internal shape (the mock) passes through unchanged. Every missing field
// defaults to a safe empty so a sparse or older shape NEVER throws and the
// chrome never reads the raw tiers block (the degradation truth rides on `tiers`,
// defaulted to an empty block when absent).

/** Default one registered-root wire row, tolerating an absent or partial object:
 *  missing id/label/path become empty strings, `is_launch`/`reachable` default
 *  conservatively (false / true — an unmarked root is treated as reachable so it
 *  is never wrongly hidden as degraded), and an absent reason is null. */
function normalizeWorkspaceString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function adaptWorkspaceRoot(value: unknown): WorkspaceRoot | null {
  if (!isRec(value)) return null;
  const id = normalizeWorkspaceString(value.id);
  const path = normalizeWorkspaceString(value.path);
  if (id === undefined || path === undefined) return null;
  const label = normalizeWorkspaceString(value.label) ?? id;
  return {
    id,
    label,
    path,
    is_launch: value.is_launch === true,
    // Absent reachability is treated as reachable (do not hide a root as
    // degraded on a missing field); only an explicit `false` degrades.
    reachable: value.reachable !== false,
    unreachable_reason: normalizeWorkspaceString(value.unreachable_reason) ?? null,
  };
}

/** Live `/workspaces` → the internal workspaces state. TOLERANT: an absent
 *  `workspaces` array defaults to empty (the rail renders the header fallback),
 *  and an absent active-workspace id is null. */
export function adaptWorkspaces(body: unknown): WorkspacesState {
  if (!isRec(body)) return { workspaces: [], active_workspace: null, tiers: {} };
  return {
    workspaces: Array.isArray(body.workspaces)
      ? body.workspaces
          .map(adaptWorkspaceRoot)
          .filter((root): root is WorkspaceRoot => root !== null)
      : [],
    active_workspace: normalizeWorkspaceString(body.active_workspace) ?? null,
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

/** Keys that would mutate the prototype chain if mapped from an untrusted wire object
 *  (JSON.parse makes `__proto__` an OWN enumerable key) — dropped defensively as a
 *  prototype-pollution guard at the trust boundary. */
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Default a flat `{ key: value }` string map, dropping non-string values AND
 *  prototype-polluting keys (untrusted wire input). */
function adaptStringMap(value: unknown): Record<string, string> {
  if (!isRec(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) continue;
    if (typeof raw === "string") out[key] = raw;
  }
  return out;
}

/**
 * Live `/settings` → the internal settings state. TOLERANT: an absent `global`
 * or `scoped` (or a sparse-omitted scope) defaults to an empty map, so the
 * client composes precedence over whatever is present without guarding for
 * missing keys.
 */
export function adaptSettings(body: unknown): SettingsState {
  if (!isRec(body)) return { global: {}, scoped: {}, tiers: {} };
  const scopedRaw = isRec(body.scoped) ? body.scoped : {};
  const scoped: Record<string, Record<string, string>> = {};
  for (const [scope, entries] of Object.entries(scopedRaw)) {
    if (UNSAFE_OBJECT_KEYS.has(scope)) continue;
    scoped[scope] = adaptStringMap(entries);
  }
  return {
    global: adaptStringMap(body.global),
    scoped,
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

const CONTROL_KINDS: SettingControlKind[] = [
  "segmented",
  "switch",
  "text",
  "slider",
  "keybinding",
  "graph_controls",
  "section_folds",
];

export const SETTING_SCHEMA_MAX_ITEMS = 256;
export const SETTING_SCHEMA_MAX_GROUPS = 16;
export const SETTING_ENUM_MAX_MEMBERS = 64;
export const SETTING_DISPLAY_ID_MAX_CHARS = 64;
export const SETTING_DEFAULT_MAX_CHARS = 4096;
export const SETTING_VALUE_LIMIT_MAX = 4096;
export const SETTING_NUMERIC_ABS_MAX = 1_000_000;
export const SETTING_ORDER_MAX = 10_000;

type DisplaySpec = Readonly<{
  id: SettingDisplayId;
  group: SettingGroupId;
  control: SettingControlKind;
  valueType: SettingValueType["type"];
  defaultValue: string;
  scopeEligible: boolean;
  order: number;
  min?: number;
  max?: number;
  maxLen?: number;
  maxEntries?: number;
  step?: number;
  unit?: string;
  enumMembers?: readonly (readonly [string, SettingEnumDisplayId])[];
  legacy?: readonly [
    label: string,
    description: string,
    group: string,
    placeholder?: string,
  ];
}>;

const DISPLAY_BY_SETTING_KEY: Readonly<Record<string, DisplaySpec>> = Object.freeze({
  theme: {
    id: "appearance.theme",
    group: "appearance",
    control: "segmented",
    valueType: "enum",
    defaultValue: "system",
    scopeEligible: false,
    order: 1,
    enumMembers: [
      ["system", "theme.system"],
      ["light", "theme.light"],
      ["dark", "theme.dark"],
      ["high-contrast", "theme.highContrast"],
    ],
    legacy: ["Theme", "The dashboard color theme.", "Appearance"],
  },
  reduce_motion: {
    id: "appearance.reduceMotion",
    group: "appearance",
    control: "switch",
    valueType: "bool",
    defaultValue: "false",
    scopeEligible: false,
    order: 2,
    legacy: ["Reduce motion", "Minimise animation and transitions.", "Appearance"],
  },
  right_rail_section_folds: {
    id: "appearance.activitySectionFolds",
    group: "appearance",
    control: "section_folds",
    valueType: "section_folds",
    defaultValue: "{}",
    scopeEligible: false,
    order: 3,
    maxEntries: 64,
    legacy: [
      "Activity rail section folds",
      "Which activity-rail sections are kept open.",
      "Appearance",
    ],
  },
  language: {
    id: "appearance.language",
    group: "appearance",
    control: "segmented",
    valueType: "enum",
    defaultValue: "en",
    scopeEligible: false,
    order: 4,
    enumMembers: [["en", "language.english"]],
  },
  default_granularity: {
    id: "graph.defaultGranularity",
    group: "graph",
    control: "segmented",
    valueType: "enum",
    defaultValue: "document",
    scopeEligible: true,
    order: 1,
    enumMembers: [
      ["feature", "granularity.feature"],
      ["document", "granularity.document"],
    ],
    legacy: ["Default granularity", "The graph detail level on load.", "Graph"],
  },
  graph_corpus: {
    id: "graph.corpus",
    group: "graph",
    control: "segmented",
    valueType: "enum",
    defaultValue: "vault",
    scopeEligible: true,
    order: 2,
    enumMembers: [
      ["vault", "corpus.vault"],
      ["code", "corpus.code"],
    ],
    legacy: [
      "Graph corpus",
      "Which dataset the graph maps: the vault or the codebase.",
      "Graph",
    ],
  },
  timeline_date_criterion: {
    id: "graph.timelineDate",
    group: "graph",
    control: "segmented",
    valueType: "enum",
    defaultValue: "created",
    scopeEligible: true,
    order: 6,
    enumMembers: [
      ["created", "timelineDate.created"],
      ["modified", "timelineDate.modified"],
      ["stamped", "timelineDate.stamped"],
    ],
    legacy: [
      "Timeline date",
      "Which date the timeline orders and filters documents by.",
      "Graph",
    ],
  },
  confidence_floor: {
    id: "graph.confidenceFloor",
    group: "graph",
    control: "slider",
    valueType: "integer",
    defaultValue: "0",
    scopeEligible: false,
    order: 3,
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
    legacy: ["Confidence floor", "Hide inferred edges below this certainty.", "Graph"],
  },
  label_filter: {
    id: "graph.labelFilter",
    group: "graph",
    control: "text",
    valueType: "string",
    defaultValue: "",
    scopeEligible: false,
    order: 4,
    maxLen: 200,
    legacy: [
      "Label filter",
      "Only show nodes whose stem matches.",
      "Graph",
      "type a stem…",
    ],
  },
  graph_controls: {
    id: "graph.controls",
    group: "graph",
    control: "graph_controls",
    valueType: "graph_controls",
    defaultValue: "{}",
    scopeEligible: false,
    order: 5,
    maxEntries: 256,
    legacy: [
      "Graph controls",
      "Persisted force and appearance tuning for the graph.",
      "Graph",
    ],
  },
  keybindings: {
    id: "keybindings.shortcuts",
    group: "keybindings",
    control: "keybinding",
    valueType: "keybindings",
    defaultValue: "{}",
    scopeEligible: false,
    order: 1,
    maxEntries: 256,
    legacy: [
      "Keyboard shortcuts",
      "Customize the chord for any command.",
      "Keybindings",
    ],
  },
});

const LEGACY_GROUP_IDS: Readonly<Record<string, SettingGroupId>> = Object.freeze({
  Appearance: "appearance",
  Graph: "graph",
  Keybindings: "keybindings",
});

function normalizeOptionalSchemaString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.length > 0 && value.length <= 64 && value === value.trim()
    ? value
    : undefined;
}

function normalizeSchemaStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  if (value.length > SETTING_ENUM_MAX_MEMBERS) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value.slice(0, SETTING_ENUM_MAX_MEMBERS)) {
    if (typeof entry !== "string") continue;
    const normalized = entry.trim();
    if (normalized.length === 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= SETTING_ENUM_MAX_MEMBERS) break;
  }
  return out;
}

function normalizeSettingControlKind(value: unknown): SettingControlKind | null {
  return typeof value === "string" && (CONTROL_KINDS as string[]).includes(value)
    ? (value as SettingControlKind)
    : null;
}

function boundedInteger(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : null;
}

function adaptValueType(value: unknown): SettingValueType | null {
  if (!isRec(value) || typeof value.type !== "string") return null;
  switch (value.type) {
    case "enum": {
      const members = normalizeSchemaStringList(value.members);
      if (
        !Array.isArray(value.members) ||
        value.members.length === 0 ||
        value.members.length !== members.length ||
        value.members.some((member, index) => member !== members[index])
      ) {
        return null;
      }
      return {
        type: "enum",
        members,
      };
    }
    case "bool":
      return { type: "bool" };
    case "integer": {
      const min = boundedInteger(
        value.min,
        -SETTING_NUMERIC_ABS_MAX,
        SETTING_NUMERIC_ABS_MAX,
      );
      const max = boundedInteger(
        value.max,
        -SETTING_NUMERIC_ABS_MAX,
        SETTING_NUMERIC_ABS_MAX,
      );
      if (min === null || max === null || min > max) return null;
      return {
        type: "integer",
        min,
        max,
      };
    }
    case "keybindings": {
      const maxEntries = boundedInteger(value.max_entries, 0, SETTING_VALUE_LIMIT_MAX);
      if (maxEntries === null) return null;
      return {
        type: "keybindings",
        max_entries: maxEntries,
      };
    }
    case "graph_controls": {
      const maxEntries = boundedInteger(value.max_entries, 0, SETTING_VALUE_LIMIT_MAX);
      if (maxEntries === null) return null;
      return {
        type: "graph_controls",
        max_entries: maxEntries,
      };
    }
    case "section_folds": {
      const maxEntries = boundedInteger(value.max_entries, 0, SETTING_VALUE_LIMIT_MAX);
      if (maxEntries === null) return null;
      return {
        type: "section_folds",
        max_entries: maxEntries,
      };
    }
    case "string": {
      const maxLen = boundedInteger(value.max_len, 0, SETTING_VALUE_LIMIT_MAX);
      if (maxLen === null) return null;
      return { type: "string", max_len: maxLen };
    }
    default:
      return null;
  }
}

function semanticIdIsWellFormed(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= SETTING_DISPLAY_ID_MAX_CHARS &&
    /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*$/.test(value)
  );
}

function adaptSettingDisplay(
  value: unknown,
  key: string,
  valueType: SettingValueType,
  source: Readonly<Record<string, unknown>>,
): SettingDisplay | null {
  const spec = Object.hasOwn(DISPLAY_BY_SETTING_KEY, key)
    ? DISPLAY_BY_SETTING_KEY[key]
    : undefined;
  if (spec === undefined) return null;

  const expectedMembers = spec.enumMembers ?? [];
  if (valueType.type === "enum") {
    if (
      expectedMembers.length !== valueType.members.length ||
      expectedMembers.some(([member], index) => valueType.members[index] !== member)
    ) {
      return null;
    }
  } else if (expectedMembers.length > 0) {
    return null;
  }

  // An absent display block is the one recognized legacy schema. Its resolved
  // English fields are deliberately ignored and never copied into client state.
  if (value === undefined) {
    const legacy = spec.legacy;
    if (
      legacy === undefined ||
      source.label !== legacy[0] ||
      source.description !== legacy[1] ||
      source.group !== legacy[2] ||
      source.placeholder !== legacy[3]
    ) {
      return null;
    }
    return {
      id: spec.id,
      group: spec.group,
      enum_members: expectedMembers.map(([member, id]) => ({ value: member, id })),
    };
  }
  if (!isRec(value)) return null;
  if (
    !semanticIdIsWellFormed(value.id) ||
    !semanticIdIsWellFormed(value.group) ||
    value.id !== spec.id ||
    value.group !== spec.group
  ) {
    return null;
  }

  const rawMembers = value.enum_members;
  if (expectedMembers.length === 0) {
    if (
      rawMembers !== undefined &&
      (!Array.isArray(rawMembers) || rawMembers.length > 0)
    ) {
      return null;
    }
    return { id: spec.id, group: spec.group, enum_members: [] };
  }
  if (!Array.isArray(rawMembers) || rawMembers.length !== expectedMembers.length) {
    return null;
  }
  for (let index = 0; index < expectedMembers.length; index += 1) {
    const raw = rawMembers[index];
    const [expectedValue, expectedId] = expectedMembers[index];
    if (
      !isRec(raw) ||
      raw.value !== expectedValue ||
      !semanticIdIsWellFormed(raw.id) ||
      raw.id !== expectedId
    ) {
      return null;
    }
  }
  return {
    id: spec.id,
    group: spec.group,
    enum_members: expectedMembers.map(([member, id]) => ({ value: member, id })),
  };
}

function valueTypeMatchesSpec(valueType: SettingValueType, spec: DisplaySpec): boolean {
  if (valueType.type !== spec.valueType) return false;
  switch (valueType.type) {
    case "integer":
      return valueType.min === spec.min && valueType.max === spec.max;
    case "string":
      return valueType.max_len === spec.maxLen;
    case "keybindings":
    case "graph_controls":
    case "section_folds":
      return valueType.max_entries === spec.maxEntries;
    default:
      return true;
  }
}

function adaptSettingDef(value: unknown): SettingDef | null {
  if (!isRec(value)) return null;
  if (
    typeof value.key !== "string" ||
    value.key.length === 0 ||
    value.key.length > 256 ||
    value.key !== value.key.trim()
  ) {
    return null;
  }
  const key = value.key;
  const spec = Object.hasOwn(DISPLAY_BY_SETTING_KEY, key)
    ? DISPLAY_BY_SETTING_KEY[key]
    : undefined;
  if (spec === undefined) return null;
  const control = normalizeSettingControlKind(value.control);
  const valueType = adaptValueType(value.value_type);
  if (control === null || valueType === null) return null;
  const defaultValue =
    typeof value.default === "string" &&
    value.default.length <= SETTING_DEFAULT_MAX_CHARS
      ? value.default
      : null;
  const order = boundedInteger(value.order, 0, SETTING_ORDER_MAX);
  const step =
    value.step === undefined
      ? undefined
      : boundedInteger(value.step, 1, SETTING_NUMERIC_ABS_MAX);
  if (defaultValue === null || order === null || step === null) return null;
  const unit = normalizeOptionalSchemaString(value.unit);
  if (value.unit !== undefined && unit === undefined) return null;
  if (
    typeof value.scope_eligible !== "boolean" ||
    control !== spec.control ||
    !valueTypeMatchesSpec(valueType, spec) ||
    defaultValue !== spec.defaultValue ||
    value.scope_eligible !== spec.scopeEligible ||
    order !== spec.order ||
    step !== spec.step ||
    unit !== spec.unit
  ) {
    return null;
  }
  const display = adaptSettingDisplay(value.display, key, valueType, value);
  if (display === null) return null;
  return {
    key,
    value_type: valueType,
    default: defaultValue,
    scope_eligible: spec.scopeEligible,
    control,
    display,
    order,
    step,
    unit,
  };
}

function adaptSettingGroups(value: unknown): SettingGroupId[] {
  if (!Array.isArray(value)) return [];
  const groups: SettingGroupId[] = [];
  const seen = new Set<SettingGroupId>();
  for (const raw of value.slice(0, SETTING_SCHEMA_MAX_GROUPS)) {
    if (typeof raw !== "string") continue;
    const legacyGroup = Object.hasOwn(LEGACY_GROUP_IDS, raw)
      ? LEGACY_GROUP_IDS[raw]
      : undefined;
    const group =
      raw === "appearance" || raw === "graph" || raw === "keybindings"
        ? raw
        : legacyGroup;
    if (group === undefined || seen.has(group)) continue;
    seen.add(group);
    groups.push(group);
    if (groups.length >= SETTING_SCHEMA_MAX_GROUPS) break;
  }
  return groups;
}

/** Live `/settings/schema` → the internal schema. TOLERANT: an absent settings
 *  or groups array defaults to empty; malformed defs are dropped rather than
 *  throwing, and the chrome never reads the raw tiers block. */
export function adaptSettingsSchema(body: unknown): SettingsSchema {
  if (!isRec(body)) return { settings: [], groups: [], tiers: {} };
  const settings: SettingDef[] = [];
  const seenKeys = new Set<string>();
  if (Array.isArray(body.settings)) {
    for (const raw of body.settings.slice(0, SETTING_SCHEMA_MAX_ITEMS)) {
      const def = adaptSettingDef(raw);
      if (def === null || seenKeys.has(def.key)) continue;
      seenKeys.add(def.key);
      settings.push(def);
      if (settings.length >= SETTING_SCHEMA_MAX_ITEMS) break;
    }
  }
  const groups = adaptSettingGroups(body.groups);
  return { settings, groups, tiers: (body.tiers ?? {}) as TiersBlock };
}
