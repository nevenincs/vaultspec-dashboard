// Rapid-prototyping persistence for the three-lab's D3ForceParams tuning panel:
// localStorage of the live params, named presets, JSON copy/paste, and a
// `?sim=` shareable URL. Pure + framework-free (no React) — ThreeLab wires these
// to its UI.
//
// FORCE_CONTROL_DEFAULTS (which is {...D3_FORCE_DEFAULTS}) is the SINGLE SOURCE OF
// TRUTH for both the key set and the fallback values: a stored value for an
// unknown/removed knob is dropped, and a missing knob falls back to its default,
// so a persisted blob can never drift the schema. We never duplicate the ranges
// or defaults here — they live in forceControls.ts / d3ForceSolver.ts.

import { type D3ForceParams } from "../scene/three/d3ForceSolver";
import { FORCE_CONTROL_DEFAULTS } from "../scene/three/forceControls";

export const FORCE_PARAMS_STORAGE_KEY = "vaultspec.threeLab.forceParams";
export const FORCE_PRESETS_STORAGE_KEY = "vaultspec.threeLab.forcePresets";
/** Query-param name for a shareable config, mirroring the lab's `?theme=`. */
export const FORCE_PARAMS_URL_KEY = "sim";
/** Built-in preset: always resolves to the defaults; cannot be overwritten or
 *  deleted. */
export const DEFAULT_PRESET_NAME = "Default";

const PARAM_KEYS = Object.keys(FORCE_CONTROL_DEFAULTS) as (keyof D3ForceParams)[];

export type ForcePresets = Record<string, D3ForceParams>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Coerce an arbitrary value into a COMPLETE D3ForceParams: start from the
 *  defaults and accept only finite numbers for known keys. Guarantees a valid,
 *  schema-current object regardless of what was stored or pasted. */
export function sanitizeParams(raw: unknown): D3ForceParams {
  const out: D3ForceParams = { ...FORCE_CONTROL_DEFAULTS };
  if (isRecord(raw)) {
    for (const key of PARAM_KEYS) {
      const value = raw[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        out[key] = value;
      }
    }
  }
  return out;
}

/** Only the knobs that differ from the defaults — the compact form encoded in a
 *  shareable URL. */
export function diffFromDefaults(params: D3ForceParams): Partial<D3ForceParams> {
  const diff: Partial<D3ForceParams> = {};
  for (const key of PARAM_KEYS) {
    if (params[key] !== FORCE_CONTROL_DEFAULTS[key]) diff[key] = params[key];
  }
  return diff;
}

export function paramsToJson(params: D3ForceParams): string {
  return JSON.stringify(params, null, 2);
}

/** Parse pasted JSON into a complete, sanitized params object. Throws on invalid
 *  JSON so the caller can surface a message. */
export function parseParamsJson(text: string): D3ForceParams {
  return sanitizeParams(JSON.parse(text) as unknown);
}

// --- localStorage: the live params --------------------------------------------

export function readStoredParams(): D3ForceParams | null {
  try {
    const raw = window.localStorage.getItem(FORCE_PARAMS_STORAGE_KEY);
    if (!raw) return null;
    return sanitizeParams(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeStoredParams(params: D3ForceParams): void {
  try {
    window.localStorage.setItem(FORCE_PARAMS_STORAGE_KEY, JSON.stringify(params));
  } catch {
    /* localStorage can be unavailable in restricted browser contexts */
  }
}

// --- localStorage: named presets ----------------------------------------------

export function readPresets(): ForcePresets {
  try {
    const raw = window.localStorage.getItem(FORCE_PRESETS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return {};
    const out: ForcePresets = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (name === DEFAULT_PRESET_NAME) continue; // the built-in is never stored
      out[name] = sanitizeParams(value);
    }
    return out;
  } catch {
    return {};
  }
}

function writePresets(presets: ForcePresets): void {
  try {
    window.localStorage.setItem(FORCE_PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    /* localStorage can be unavailable in restricted browser contexts */
  }
}

/** Save (or overwrite) a named preset and return the new map. A blank name or
 *  the reserved "Default" name is rejected (returns the map unchanged). */
export function savePreset(
  presets: ForcePresets,
  name: string,
  params: D3ForceParams,
): ForcePresets {
  const trimmed = name.trim();
  if (!trimmed || trimmed === DEFAULT_PRESET_NAME) return presets;
  const next: ForcePresets = { ...presets, [trimmed]: { ...params } };
  writePresets(next);
  return next;
}

/** Remove a named preset and return the new map. The built-in "Default" and any
 *  unknown name are no-ops. */
export function deletePreset(presets: ForcePresets, name: string): ForcePresets {
  if (name === DEFAULT_PRESET_NAME || !(name in presets)) return presets;
  const next: ForcePresets = { ...presets };
  delete next[name];
  writePresets(next);
  return next;
}

/** Built-in "Default" first, then user preset names alphabetically. */
export function presetNames(presets: ForcePresets): string[] {
  return [
    DEFAULT_PRESET_NAME,
    ...Object.keys(presets).sort((a, b) => a.localeCompare(b)),
  ];
}

/** Resolve a preset name to its params; the built-in name and any unknown name
 *  resolve to the defaults. */
export function loadPreset(presets: ForcePresets, name: string): D3ForceParams {
  if (name === DEFAULT_PRESET_NAME) return { ...FORCE_CONTROL_DEFAULTS };
  const found = presets[name];
  return found ? { ...found } : { ...FORCE_CONTROL_DEFAULTS };
}

// --- `?sim=` shareable URL ----------------------------------------------------

function encodeBase64(text: string): string | null {
  try {
    return window.btoa(text);
  } catch {
    return null;
  }
}

function decodeBase64(text: string): string | null {
  try {
    return window.atob(text);
  } catch {
    return null;
  }
}

/** Base64 of the diff-vs-defaults — the value to put in `?sim=`. Null if the
 *  environment has no base64 encoder. */
export function encodeParamsToUrl(params: D3ForceParams): string | null {
  return encodeBase64(JSON.stringify(diffFromDefaults(params)));
}

/** Decode a `?sim=` value into a complete params object, or null if it is
 *  absent/garbage. */
export function decodeParamsFromUrl(sim: string | null): D3ForceParams | null {
  if (!sim) return null;
  const json = decodeBase64(sim);
  if (json === null) return null;
  try {
    return sanitizeParams(JSON.parse(json) as unknown);
  } catch {
    return null;
  }
}

/** Read and decode `?sim=` from a location search string. */
export function readUrlParams(search: string): D3ForceParams | null {
  try {
    return decodeParamsFromUrl(new URLSearchParams(search).get(FORCE_PARAMS_URL_KEY));
  } catch {
    return null;
  }
}

/** Build a shareable absolute URL embedding the current params as `?sim=`. */
export function buildShareUrl(params: D3ForceParams): string | null {
  const encoded = encodeParamsToUrl(params);
  if (encoded === null) return null;
  const { origin, pathname } = window.location;
  return `${origin}${pathname}?${FORCE_PARAMS_URL_KEY}=${encoded}`;
}

/** Initial params for mount: `?sim=` wins over localStorage wins over defaults. */
export function initialForceParams(search: string): D3ForceParams {
  return readUrlParams(search) ?? readStoredParams() ?? { ...FORCE_CONTROL_DEFAULTS };
}
