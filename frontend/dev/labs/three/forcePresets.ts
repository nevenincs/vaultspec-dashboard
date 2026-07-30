import { type D3ForceParams } from "../scene/three/d3ForceSolver";
import { FORCE_CONTROL_DEFAULTS, FORCE_CONTROLS } from "../scene/three/forceControls";
import {
  authoredDisplayText,
  compareAuthoredDisplayText,
} from "../platform/localization/displayText";

export const FORCE_PARAMS_STORAGE_KEY = "vaultspec.threeLab.forceParams";
export const FORCE_PRESETS_STORAGE_KEY = "vaultspec.threeLab.forcePresets";
export const FORCE_PARAMS_URL_KEY = "sim";
export const DEFAULT_PRESET_NAME = "Default";
export const FORCE_PRESETS_MAX_ITEMS = 24;
export const FORCE_PRESET_NAME_MAX_CHARS = 64;
export const FORCE_PARAMS_URL_MAX_CHARS = 4096;
export const FORCE_PARAMS_STORAGE_MAX_CHARS = 8192;
export const FORCE_PRESETS_STORAGE_MAX_CHARS = 64 * 1024;

const PARAM_KEYS = Object.keys(FORCE_CONTROL_DEFAULTS) as (keyof D3ForceParams)[];
const CONTROL_BY_KEY = new Map(FORCE_CONTROLS.map((control) => [control.key, control]));

export type ForcePresets = Record<string, D3ForceParams>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clampParamValue(key: keyof D3ForceParams, value: number): number {
  const control = CONTROL_BY_KEY.get(key);
  return control ? Math.max(control.min, Math.min(control.max, value)) : value;
}

export function normalizePresetName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  return trimmed.length > 0 &&
    trimmed.length <= FORCE_PRESET_NAME_MAX_CHARS &&
    trimmed !== DEFAULT_PRESET_NAME
    ? trimmed
    : null;
}

export function sanitizeParams(raw: unknown): D3ForceParams {
  const out: D3ForceParams = { ...FORCE_CONTROL_DEFAULTS };
  if (isRecord(raw)) {
    for (const key of PARAM_KEYS) {
      const value = raw[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        out[key] = clampParamValue(key, value);
      }
    }
  }
  return out;
}

export function diffFromDefaults(params: D3ForceParams): Partial<D3ForceParams> {
  const diff: Partial<D3ForceParams> = {};
  for (const key of PARAM_KEYS) {
    if (params[key] !== FORCE_CONTROL_DEFAULTS[key]) diff[key] = params[key];
  }
  return diff;
}

export function readStoredParams(): D3ForceParams | null {
  try {
    const raw = window.localStorage.getItem(FORCE_PARAMS_STORAGE_KEY);
    if (!raw) return null;
    if (raw.length > FORCE_PARAMS_STORAGE_MAX_CHARS) return null;
    return sanitizeParams(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeStoredParams(params: D3ForceParams): void {
  try {
    window.localStorage.setItem(
      FORCE_PARAMS_STORAGE_KEY,
      JSON.stringify(sanitizeParams(params)),
    );
  } catch {
    /* localStorage can be unavailable in restricted browser contexts */
  }
}

export function normalizeForcePresets(raw: unknown): ForcePresets {
  if (!isRecord(raw)) return {};
  const out: ForcePresets = {};
  for (const [rawName, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= FORCE_PRESETS_MAX_ITEMS) break;
    const name = normalizePresetName(rawName);
    if (name === null || name in out) continue;
    out[name] = sanitizeParams(value);
  }
  return out;
}

export function readPresets(): ForcePresets {
  try {
    const raw = window.localStorage.getItem(FORCE_PRESETS_STORAGE_KEY);
    if (!raw) return {};
    if (raw.length > FORCE_PRESETS_STORAGE_MAX_CHARS) return {};
    const parsed = JSON.parse(raw) as unknown;
    return normalizeForcePresets(parsed);
  } catch {
    return {};
  }
}

function writePresets(presets: ForcePresets): void {
  try {
    window.localStorage.setItem(
      FORCE_PRESETS_STORAGE_KEY,
      JSON.stringify(normalizeForcePresets(presets)),
    );
  } catch {
    /* localStorage can be unavailable in restricted browser contexts */
  }
}

export function savePreset(
  presets: ForcePresets,
  name: string,
  params: D3ForceParams,
): ForcePresets {
  const normalizedName = normalizePresetName(name);
  if (normalizedName === null) return presets;
  const entries = Object.entries(normalizeForcePresets(presets)).filter(
    ([existing]) => existing !== normalizedName,
  );
  entries.push([normalizedName, sanitizeParams(params)]);
  const next = Object.fromEntries(
    entries.slice(-FORCE_PRESETS_MAX_ITEMS),
  ) as ForcePresets;
  writePresets(next);
  return next;
}

export function deletePreset(presets: ForcePresets, name: string): ForcePresets {
  const normalizedName = normalizePresetName(name);
  const next: ForcePresets = { ...normalizeForcePresets(presets) };
  if (normalizedName === null || !(normalizedName in next)) return presets;
  delete next[normalizedName];
  writePresets(next);
  return next;
}

export function presetNames(presets: ForcePresets, locale: string): string[] {
  return [
    DEFAULT_PRESET_NAME,
    ...Object.keys(presets).sort((left, right) =>
      compareAuthoredDisplayText(
        locale,
        authoredDisplayText(left),
        authoredDisplayText(right),
      ),
    ),
  ];
}

export function loadPreset(presets: ForcePresets, name: string): D3ForceParams {
  if (name === DEFAULT_PRESET_NAME) return { ...FORCE_CONTROL_DEFAULTS };
  const found = presets[name];
  return found ? { ...found } : { ...FORCE_CONTROL_DEFAULTS };
}

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

export function encodeParamsToUrl(params: D3ForceParams): string | null {
  const encoded = encodeBase64(JSON.stringify(diffFromDefaults(params)));
  return encoded !== null && encoded.length <= FORCE_PARAMS_URL_MAX_CHARS
    ? encoded
    : null;
}

export function decodeParamsFromUrl(sim: string | null): D3ForceParams | null {
  if (!sim) return null;
  if (sim.length > FORCE_PARAMS_URL_MAX_CHARS) return null;
  const json = decodeBase64(sim);
  if (json === null) return null;
  try {
    return sanitizeParams(JSON.parse(json) as unknown);
  } catch {
    return null;
  }
}

export function readUrlParams(search: string): D3ForceParams | null {
  try {
    return decodeParamsFromUrl(new URLSearchParams(search).get(FORCE_PARAMS_URL_KEY));
  } catch {
    return null;
  }
}

export function buildShareUrl(params: D3ForceParams): string | null {
  const encoded = encodeParamsToUrl(params);
  if (encoded === null) return null;
  const { origin, pathname } = window.location;
  return `${origin}${pathname}?${FORCE_PARAMS_URL_KEY}=${encoded}`;
}

export function initialForceParams(search: string): D3ForceParams {
  return readUrlParams(search) ?? readStoredParams() ?? { ...FORCE_CONTROL_DEFAULTS };
}
