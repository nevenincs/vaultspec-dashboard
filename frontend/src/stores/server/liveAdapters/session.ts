// Auto-split from liveAdapters.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the liveAdapters barrel; see ./index.ts.

import { normalizeWorkspaceLayoutBlob } from "../../workspaceLayout";
import type {
  RecentScope,
  ScopeContextWire,
  SessionState,
  SettingControlKind,
  SettingDef,
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
];

function normalizeSchemaString(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeOptionalSchemaString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeSchemaStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = entry.trim();
    if (normalized.length === 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeSettingControlKind(value: unknown): SettingControlKind {
  const normalized = normalizeOptionalSchemaString(value);
  return normalized !== undefined && (CONTROL_KINDS as string[]).includes(normalized)
    ? (normalized as SettingControlKind)
    : "text";
}

/** Decode one `value_type` tagged union from the wire, defaulting unknown or
 *  malformed shapes to a permissive `string` so a sparse or newer wire never
 *  throws (the tolerant-adapter property). */
function adaptValueType(value: unknown): SettingValueType {
  if (!isRec(value) || typeof value.type !== "string") {
    return { type: "string", max_len: 4096 };
  }
  switch (value.type) {
    case "enum":
      return {
        type: "enum",
        members: normalizeSchemaStringList(value.members),
      };
    case "bool":
      return { type: "bool" };
    case "integer":
      return {
        type: "integer",
        min: typeof value.min === "number" ? value.min : 0,
        max: typeof value.max === "number" ? value.max : 100,
      };
    case "keybindings":
      return {
        type: "keybindings",
        max_entries: typeof value.max_entries === "number" ? value.max_entries : 256,
      };
    case "graph_controls":
      return {
        type: "graph_controls",
        max_entries: typeof value.max_entries === "number" ? value.max_entries : 256,
      };
    case "string":
    default:
      return {
        type: "string",
        max_len: typeof value.max_len === "number" ? value.max_len : 4096,
      };
  }
}

/** Decode one declared setting from the wire, defaulting every missing field to
 *  a safe value. An unknown control kind falls back to `text` (the most generic
 *  renderer), so a newer engine-declared control never crashes an older client. */
function adaptSettingDef(value: unknown): SettingDef | null {
  if (!isRec(value)) return null;
  const key = normalizeOptionalSchemaString(value.key);
  if (key === undefined) return null;
  const control = normalizeSettingControlKind(value.control);
  return {
    key,
    value_type: adaptValueType(value.value_type),
    default: typeof value.default === "string" ? value.default : "",
    scope_eligible: value.scope_eligible === true,
    control,
    label: normalizeSchemaString(value.label, key),
    description: normalizeSchemaString(value.description, ""),
    group: normalizeSchemaString(value.group, "General"),
    order: typeof value.order === "number" ? value.order : 0,
    step: typeof value.step === "number" ? value.step : undefined,
    unit: normalizeOptionalSchemaString(value.unit),
    placeholder: normalizeOptionalSchemaString(value.placeholder),
  };
}

/** Live `/settings/schema` → the internal schema. TOLERANT: an absent settings
 *  or groups array defaults to empty; malformed defs are dropped rather than
 *  throwing, and the chrome never reads the raw tiers block. */
export function adaptSettingsSchema(body: unknown): SettingsSchema {
  if (!isRec(body)) return { settings: [], groups: [], tiers: {} };
  const settings = Array.isArray(body.settings)
    ? body.settings.map(adaptSettingDef).filter((d): d is SettingDef => d !== null)
    : [];
  const groups = normalizeSchemaStringList(body.groups);
  return { settings, groups, tiers: (body.tiers ?? {}) as TiersBlock };
}
