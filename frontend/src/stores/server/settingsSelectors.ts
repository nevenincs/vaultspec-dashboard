// Effective-value resolution for the settings module (dashboard-settings W02).
//
// Pure selectors over the served schema (the single source of truth) and the
// {global, scoped} value maps. They resolve each declared setting's EFFECTIVE
// value with scoped-then-global-then-default precedence and report provenance,
// and group + order the settings exactly as the engine declared. This lives in
// the stores layer (the sole wire client); the dialog consumes the resolved
// shape and never composes precedence itself or reads raw value maps.

import type { SettingDef, SettingsSchema, SettingsState } from "./engine";

/** Where a setting's effective value came from. */
export type SettingProvenance = "default" | "global" | "scope";

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
