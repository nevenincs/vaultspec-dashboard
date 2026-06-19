// Effective-value resolution for the settings module (dashboard-settings W02).
//
// Pure selectors over the served schema (the single source of truth) and the
// {global, scoped} value maps. They resolve each declared setting's EFFECTIVE
// value with scoped-then-global-then-default precedence and report provenance,
// and group + order the settings exactly as the engine declared. This lives in
// the stores layer (the sole wire client); the dialog consumes the resolved
// shape and never composes precedence itself or reads raw value maps.

import type { KeybindingOverrides } from "../../platform/keymap/registry";
import { MAX_KEYBINDING_OVERRIDES } from "../../platform/keymap/registry";
import type {
  GraphGranularity,
  SettingDef,
  SettingsSchema,
  SettingsState,
} from "./engine";

/** Settings with app-level consumers beyond the generic schema-rendered dialog. */
export const CONSUMED_SETTING_KEYS = {
  theme: "theme",
  reduceMotion: "reduce_motion",
  defaultGranularity: "default_granularity",
  confidenceFloor: "confidence_floor",
  labelFilter: "label_filter",
  keybindings: "keybindings",
} as const;

export type ConsumedSettingKey =
  (typeof CONSUMED_SETTING_KEYS)[keyof typeof CONSUMED_SETTING_KEYS];

/** Where a setting's effective value came from. */
export type SettingProvenance = "default" | "global" | "scope";

/** Where a settings row edit is targeted. */
export type SettingsEditTarget = "global" | "scope";

/** One declared setting resolved to its effective value for the active scope. */
export interface EffectiveSetting {
  def: SettingDef;
  /** The effective string value (scope override > global > schema default). */
  value: string;
  /** Which layer the effective value came from. */
  provenance: SettingProvenance;
  /** The raw global value, when one is persisted (else undefined). */
  globalValue?: string;
  /** The raw active-scope override, when one is persisted (else undefined). Only
   *  ever set for a scope-eligible setting. */
  scopeValue?: string;
}

/** A settings group (category) with its resolved members, in declared order. */
export interface SettingsGroup {
  name: string;
  settings: EffectiveSetting[];
}

/**
 * Resolve one setting's effective value for `activeScope`. Precedence:
 * a scope override (only when the setting is scope-eligible and a value is
 * persisted for the active scope) wins over the global value, which wins over
 * the schema-declared default. Provenance names the winning layer so the UI can
 * render an honest "inheriting global / default" affordance.
 */
export function resolveEffective(
  def: SettingDef,
  settings: SettingsState | undefined,
  activeScope: string | null,
): EffectiveSetting {
  const globalValue = settings?.global?.[def.key];
  const scopeValue =
    def.scope_eligible && activeScope
      ? settings?.scoped?.[activeScope]?.[def.key]
      : undefined;

  if (scopeValue !== undefined) {
    return { def, value: scopeValue, provenance: "scope", globalValue, scopeValue };
  }
  if (globalValue !== undefined) {
    return { def, value: globalValue, provenance: "global", globalValue };
  }
  return { def, value: def.default, provenance: "default", globalValue };
}

/** Find a declared setting by key in the served schema. */
export function settingDefByKey(
  schema: SettingsSchema | undefined,
  key: ConsumedSettingKey,
): SettingDef | undefined {
  return schema?.settings.find((def) => def.key === key);
}

/**
 * Resolve an app-consumed setting by key through the engine-served schema. This
 * keeps behavior consumers from re-implementing schema lookup or precedence.
 */
export function resolveEffectiveSetting(
  schema: SettingsSchema | undefined,
  settings: SettingsState | undefined,
  activeScope: string | null,
  key: ConsumedSettingKey,
): EffectiveSetting | null {
  const def = settingDefByKey(schema, key);
  return def ? resolveEffective(def, settings, activeScope) : null;
}

/** Return the declared enum members for a setting, or an empty list otherwise. */
export function settingEnumMembers(def: SettingDef | undefined): readonly string[] {
  return def?.value_type.type === "enum" ? def.value_type.members : [];
}

/** Resolve the app-wide reduce-motion setting through the served schema. */
export function resolveReduceMotionSetting(
  schema: SettingsSchema | undefined,
  settings: SettingsState | undefined,
): boolean {
  const setting = resolveEffectiveSetting(
    schema,
    settings,
    null,
    CONSUMED_SETTING_KEYS.reduceMotion,
  );
  return setting ? decodeBool(setting.value) : false;
}

/** Whether a setting row can target the active scope. */
export function settingCanTargetScope(
  eff: EffectiveSetting,
  activeScope: string | null,
): boolean {
  return eff.def.scope_eligible && activeScope !== null;
}

/** Default row edit target: scope override when present, otherwise global. */
export function defaultSettingsEditTarget(eff: EffectiveSetting): SettingsEditTarget {
  return eff.scopeValue !== undefined ? "scope" : "global";
}

/** The target that can actually be written for the current active scope. */
export function effectiveSettingsEditTarget(
  eff: EffectiveSetting,
  activeScope: string | null,
  target: SettingsEditTarget,
): SettingsEditTarget {
  return settingCanTargetScope(eff, activeScope) ? target : "global";
}

/**
 * Value a settings control should display for the chosen edit target. A scope row
 * inherits the effective value until it owns an override; a global row falls back
 * to the schema default when no global value is persisted.
 */
export function settingsControlValue(
  eff: EffectiveSetting,
  target: SettingsEditTarget,
): string {
  return target === "scope"
    ? (eff.scopeValue ?? eff.value)
    : (eff.globalValue ?? eff.def.default);
}

export function settingsControlIsDefaulted(
  eff: EffectiveSetting,
  target: SettingsEditTarget,
): boolean {
  return settingsControlValue(eff, target) === eff.def.default;
}

/** Honest one-line note about where a settings value comes from. */
export function settingsProvenanceNote(
  eff: EffectiveSetting,
  target: SettingsEditTarget,
): string {
  if (target === "scope") {
    return eff.scopeValue !== undefined
      ? "Overridden for this scope."
      : "Editing this scope (currently inheriting global).";
  }
  switch (eff.provenance) {
    case "scope":
      return "This scope overrides the global value.";
    case "global":
      return "Using the global value.";
    case "default":
      return "Using the default.";
  }
}

export interface GraphSettingsDefaults {
  defaultGranularity: GraphGranularity;
  confidenceFloor: number;
  labelFilter: string;
}

function isGraphGranularity(value: string): value is GraphGranularity {
  return value === "feature" || value === "document";
}

/**
 * Resolve graph defaults through the engine-served settings schema. These are
 * initialization defaults for dashboard-state, not a second live source of graph
 * intent once the user has touched the dashboard.
 */
export function resolveGraphSettingsDefaults(
  schema: SettingsSchema | undefined,
  settings: SettingsState | undefined,
  activeScope: string | null,
): GraphSettingsDefaults | null {
  const granularity = resolveEffectiveSetting(
    schema,
    settings,
    activeScope,
    CONSUMED_SETTING_KEYS.defaultGranularity,
  );
  const confidence = resolveEffectiveSetting(
    schema,
    settings,
    activeScope,
    CONSUMED_SETTING_KEYS.confidenceFloor,
  );
  const label = resolveEffectiveSetting(
    schema,
    settings,
    activeScope,
    CONSUMED_SETTING_KEYS.labelFilter,
  );
  if (!granularity || !confidence || !label) return null;
  const confidenceFloor = Math.min(100, Math.max(0, decodeInt(confidence.value, 0)));
  return {
    defaultGranularity: isGraphGranularity(granularity.value)
      ? granularity.value
      : "document",
    confidenceFloor,
    labelFilter: label.value,
  };
}

/**
 * Resolve all declared settings for the active scope, grouped and ordered per
 * the engine-owned schema. Groups appear in the schema's declared `groups`
 * order; within a group, settings sort by their declared `order`. A setting
 * whose group is not in the declared list is appended under a trailing group of
 * that name (defensive — keeps a newer engine-declared group visible).
 */
export function resolveSettings(
  schema: SettingsSchema | undefined,
  settings: SettingsState | undefined,
  activeScope: string | null,
): SettingsGroup[] {
  if (!schema) return [];
  const byGroup = new Map<string, EffectiveSetting[]>();
  for (const def of schema.settings) {
    const resolved = resolveEffective(def, settings, activeScope);
    const list = byGroup.get(def.group) ?? [];
    list.push(resolved);
    byGroup.set(def.group, list);
  }

  const ordered: SettingsGroup[] = [];
  const seen = new Set<string>();
  const emit = (name: string): void => {
    const list = byGroup.get(name);
    if (!list || seen.has(name)) return;
    seen.add(name);
    list.sort((a, b) => a.def.order - b.def.order);
    ordered.push({ name, settings: list });
  };
  for (const name of schema.groups) emit(name);
  // Any group not named in the declared order (defensive) follows, alphabetically.
  for (const name of [...byGroup.keys()].sort()) emit(name);
  return ordered;
}

// --- typed decode helpers (string wire value -> typed control value) ----------

/** Decode a boolean wire value (`"true"` / `"false"`). */
export function decodeBool(value: string): boolean {
  return value === "true";
}

/** Decode an integer wire value, falling back when unparseable. */
export function decodeInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// --- keybinding override map decode (keyboard-action-system W02) ---------------
//
// The `keybindings` setting persists a sparse `{action_id: chord}` JSON OBJECT
// STRING. The selector below decodes the effective value into the
// `KeybindingOverrides` map the dispatcher and the legend read. Decoding is
// DEFENSIVE by contract: a corrupt persisted value can never disable the keymap
// (degrades to no overrides), non-string/empty entries are dropped, and the map
// is bounded at the same cap the registry and engine enforce
// (bounded-by-default-for-every-accumulator). Chord well-formedness is NOT
// re-validated here — `effectiveChord` already ignores an unparseable override —
// so an unknown future chord syntax round-trips rather than being silently
// dropped at the boundary.

/** Parse the raw `keybindings` setting JSON string into a sparse override map.
 *  Returns `{}` on any parse failure or a non-object payload; drops entries whose
 *  value is not a non-empty string; bounds the result at MAX_KEYBINDING_OVERRIDES. */
export function parseKeybindingOverrides(raw: string | undefined): KeybindingOverrides {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: Record<string, string> = {};
  let count = 0;
  for (const [id, chord] of Object.entries(parsed as Record<string, unknown>)) {
    if (count >= MAX_KEYBINDING_OVERRIDES) break;
    if (typeof id !== "string" || id === "") continue;
    if (typeof chord !== "string" || chord === "") continue;
    out[id] = chord;
    count += 1;
  }
  return out;
}

/**
 * Resolve the effective keybinding override map through the engine-served schema.
 * The `keybindings` setting is global (no per-scope override), so resolution uses
 * the global-then-default precedence with a null scope, then decodes the JSON
 * object string. Returns `{}` when the setting is absent or the value is corrupt
 * — the keymap always falls back to its declared defaults, never to nothing.
 */
export function resolveKeybindingOverrides(
  schema: SettingsSchema | undefined,
  settings: SettingsState | undefined,
): KeybindingOverrides {
  const setting = resolveEffectiveSetting(
    schema,
    settings,
    null,
    CONSUMED_SETTING_KEYS.keybindings,
  );
  return parseKeybindingOverrides(setting?.value);
}
