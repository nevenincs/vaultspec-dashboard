// The keybinding registry (keyboard-action-system ADR, decisions 1, 2, 4).
//
// The declarative catalog of BINDABLE COMMAND ACTIONS (Class A). Each surface
// contributes its bindable verbs as `KeybindingDef`s - a stable action `id`
// (also the override-map key), a validated default chord, a label and group for
// the legend and the settings recorder, and the `context` the binding is active
// in. The registry is the single source of truth for WHAT can be bound and the
// DEFAULT chords; the engine settings registry persists only a sparse override
// map (`id -> chord`), and effective bindings are `defaults <- overrides`.
//
// This module deliberately maps a key event only to an action `id` + context.
// Turning that id into the live `ActionDescriptor` (which depends on store state
// and the time-travel gate) is the dispatcher's job, with an action resolver
// injected - so this registry stays pure and unit-testable with no app/store
// dependency, mirroring the resolver-registry split.
//
// Substrate module (platform layer): no imports from app/, scene/, or stores.
//
// Class B note: widget-intrinsic ARIA interaction (focus traps, dismiss-on-
// escape, roving-tabindex tree/tab/segment navigation, menu/listbox cursoring)
// is NOT registered here. Those keys are fixed by the ARIA widget contracts and
// must never be rebindable; only true command shortcuts live in this catalog.

import { type ChordEvent, canonicalizeChord, matchesChord, parseChord } from "./chord";
import {
  normalizeMessageDescriptor,
  type MessageDescriptor,
} from "../localization/message";

/**
 * The activation context of a binding. `global` is always active; the surface
 * contexts are active only when focus is within that surface (the dispatcher
 * decides). A key may bind different actions in different contexts without
 * collision; the most specific active context wins.
 */
export type BindingContext =
  | "global"
  | "canvas"
  | "timeline"
  | "left-rail"
  | "right-rail"
  | "filters";

/** The surface contexts, in declaration order (all more specific than global). */
export const SURFACE_CONTEXTS: readonly BindingContext[] = [
  "canvas",
  "timeline",
  "left-rail",
  "right-rail",
  "filters",
];

/**
 * Upper bound on the number of user override entries (bounded-by-default). The
 * engine enforces the same cap on the persisted map; this is the frontend-side
 * statement of the shared intent.
 */
export const MAX_KEYBINDING_OVERRIDES = 256;

/**
 * Per-chord byte ceiling, mirroring the engine's `KEYBINDING_CHORD_MAX_LEN`. The
 * engine rejects an over-length chord on write; the frontend mirrors the bound so
 * a value that bypassed the engine (an older persisted blob, a direct file edit)
 * can never feed an unbounded string into the per-keystroke matcher or the legend.
 */
export const MAX_KEYBINDING_CHORD_LEN = 64;
export const MAX_KEYBINDING_ID_LEN = 128;
export const LEGACY_KEYBINDING_PRESENTATION_MAX_CHARS = 256;

declare const legacyKeybindingPresentationBrand: unique symbol;

/** Bounded keybinding copy tracked by the localization scanner. */
export type LegacyKeybindingPresentation = string & {
  readonly [legacyKeybindingPresentationBrand]: "legacy-keybinding-presentation";
};

/** Presentation accepted by the keybinding registry. */
export type KeybindingPresentation = LegacyKeybindingPresentation | MessageDescriptor;

/** Group messages are taxonomy identities, so interpolation values are prohibited. */
export type KeybindingGroupPresentation =
  | LegacyKeybindingPresentation
  | (MessageDescriptor & { readonly values?: never });

/** Normalize bounded compatibility copy without coercion. */
export function normalizeLegacyKeybindingPresentation(
  value: unknown,
): LegacyKeybindingPresentation | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 &&
    normalized.length <= LEGACY_KEYBINDING_PRESENTATION_MAX_CHARS
    ? (normalized as LegacyKeybindingPresentation)
    : null;
}

/** Mark one complete legacy keybinding message for exact scanner inventory. */
export function legacyKeybindingPresentation(
  value: string,
): LegacyKeybindingPresentation {
  return (
    normalizeLegacyKeybindingPresentation(value) ?? ("" as LegacyKeybindingPresentation)
  );
}

/** Normalize a typed or scanner-tracked transitional keybinding message. */
export function normalizeKeybindingPresentation(
  value: unknown,
): KeybindingPresentation | null {
  if (typeof value === "string") {
    return normalizeLegacyKeybindingPresentation(value);
  }
  return normalizeMessageDescriptor(value);
}

/** Normalize a static group message; dynamic values cannot become grouping identity. */
export function normalizeKeybindingGroupPresentation(
  value: unknown,
): KeybindingGroupPresentation | null {
  const normalized = normalizeKeybindingPresentation(value);
  if (normalized === null) return null;
  if (typeof normalized === "string") return normalized;
  return normalized.values === undefined
    ? (normalized as KeybindingGroupPresentation)
    : null;
}

/** One bindable command action. Construct in a surface's action module. */
export interface KeybindingDef {
  /** Stable action id; the override-map key and the dispatcher's resolve key. */
  readonly id: string;
  /** The canonical default chord string (e.g. `"Mod+K"`, `"ArrowLeft"`). */
  readonly defaultChord: string;
  /** Human label for the legend and the settings recorder. */
  readonly label: KeybindingPresentation;
  /** Grouping for the legend and settings (e.g. `"General"`, `"Graph"`). */
  readonly group: KeybindingGroupPresentation;
  /** The context the binding is active in. */
  readonly context: BindingContext;
}

/** Sparse map of user override chords, keyed by action id. */
export type KeybindingOverrides = Readonly<Record<string, string>>;

const bindings = new Map<string, KeybindingDef>();

export function normalizeKeybindingId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const normalized = id.trim();
  return normalized.length > 0 && normalized.length <= MAX_KEYBINDING_ID_LEN
    ? normalized
    : null;
}

function normalizeKeybindingText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeBindingContext(value: unknown): BindingContext | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized === "global") return "global";
  return (SURFACE_CONTEXTS as readonly string[]).includes(normalized)
    ? (normalized as BindingContext)
    : null;
}

function isKeybindingOverrideRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeKeybindingOverrides(overrides: unknown): KeybindingOverrides {
  if (!isKeybindingOverrideRecord(overrides)) return {};
  const normalized: Record<string, string> = {};
  let count = 0;
  for (const [id, chord] of Object.entries(overrides)) {
    if (count >= MAX_KEYBINDING_OVERRIDES) break;
    const normalizedId = normalizeKeybindingId(id);
    if (normalizedId === null) continue;
    if (typeof chord !== "string") continue;
    const normalizedChord = chord.trim();
    if (
      normalizedChord.length === 0 ||
      normalizedChord.length > MAX_KEYBINDING_CHORD_LEN
    ) {
      continue;
    }
    normalized[normalizedId] = normalizedChord;
    count += 1;
  }
  return normalized;
}

function keybindingDefRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const snapshot: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    for (const key of ["id", "defaultChord", "label", "group", "context"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) return null;
      snapshot[key] = descriptor.value;
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function normalizedKeybindingDef(value: unknown): KeybindingDef | null {
  const def = keybindingDefRecord(value);
  if (def === null) return null;
  const normalizedId = normalizeKeybindingId(def.id);
  const defaultChord = normalizeKeybindingText(def.defaultChord);
  const label = normalizeKeybindingPresentation(def.label);
  const group = normalizeKeybindingGroupPresentation(def.group);
  const context = normalizeBindingContext(def.context);
  if (
    normalizedId === null ||
    defaultChord === null ||
    label === null ||
    group === null ||
    context === null
  ) {
    return null;
  }
  return {
    id: normalizedId,
    defaultChord,
    label,
    group,
    context,
  };
}

/**
 * Register a batch of bindings; returns a disposer that removes exactly the
 * entries it added (only if they have not since been replaced). Throws on a
 * malformed default chord - that is a programmer error caught in tests, not a
 * runtime degradation.
 */
export function registerKeybindings(defs: readonly KeybindingDef[]): () => void {
  const registered: KeybindingDef[] = [];
  for (const rawDef of defs) {
    const def = normalizedKeybindingDef(rawDef);
    if (def === null) {
      throw new Error("keybinding has a malformed id");
    }
    if (canonicalizeChord(def.defaultChord) === null) {
      throw new Error(`keybinding "${def.id}" has a malformed definition`);
    }
    bindings.set(def.id, def);
    registered.push(def);
  }
  return () => {
    for (const def of registered) {
      if (bindings.get(def.id) === def) bindings.delete(def.id);
    }
  };
}

/** All registered bindings, in stable id order. */
export function listKeybindings(): KeybindingDef[] {
  return [...bindings.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Look up one binding by id. */
export function getKeybinding(id: unknown): KeybindingDef | undefined {
  const normalizedId = normalizeKeybindingId(id);
  return normalizedId === null ? undefined : bindings.get(normalizedId);
}

/** Test-only: drop all registered bindings. */
export function resetKeybindings(): void {
  bindings.clear();
}

/**
 * The effective chord string for a binding: the user override when present and
 * well-formed, else the default. An override that fails to parse is ignored so a
 * corrupt persisted value can never disable a binding outright.
 */
export function effectiveChord(
  def: KeybindingDef,
  overrides: KeybindingOverrides,
): string {
  const normalizedId = normalizeKeybindingId(def.id);
  const normalizedOverrides = normalizeKeybindingOverrides(overrides);
  const override =
    normalizedId === null ? undefined : normalizedOverrides[normalizedId];
  if (typeof override === "string" && canonicalizeChord(override) !== null) {
    return override;
  }
  return def.defaultChord;
}

/** Whether two contexts can be active at the same time (global overlaps all). */
export function contextsOverlap(a: BindingContext, b: BindingContext): boolean {
  return a === b || a === "global" || b === "global";
}

/** Specificity rank: surface contexts (1) beat global (0) when both match. */
function specificity(context: BindingContext): number {
  return context === "global" ? 0 : 1;
}

/**
 * Resolve a key event to the bound action id active in the current contexts, or
 * `null` when nothing matches. Among matches, the most specific active context
 * wins (a surface binding overrides a global one when that surface is focused);
 * ties within the same specificity resolve by id order for determinism.
 */
export function resolveKeybinding(
  defs: readonly KeybindingDef[],
  overrides: KeybindingOverrides,
  activeContexts: ReadonlySet<BindingContext>,
  event: ChordEvent,
  isMac?: boolean,
): KeybindingDef | null {
  let best: KeybindingDef | null = null;
  for (const rawDef of defs) {
    const def = normalizedKeybindingDef(rawDef);
    if (def === null) continue;
    if (!activeContexts.has(def.context)) continue;
    const chord = parseChord(effectiveChord(def, overrides));
    if (chord === null || !matchesChord(chord, event, isMac)) continue;
    if (
      best === null ||
      specificity(def.context) > specificity(best.context) ||
      (specificity(def.context) === specificity(best.context) && def.id < best.id)
    ) {
      best = def;
    }
  }
  return best;
}

/** A set of bindings that resolve to the same chord within overlapping contexts. */
export interface KeybindingConflict {
  /** The shared canonical chord string. */
  readonly chord: string;
  /** The conflicting action ids, in id order. */
  readonly ids: string[];
}

/**
 * Find binding conflicts: distinct actions whose effective chords are equal and
 * whose contexts overlap (so they could fire on the same keystroke). Used by the
 * settings recorder to warn before a user assigns a colliding chord.
 */
export function findConflicts(
  defs: readonly KeybindingDef[],
  overrides: KeybindingOverrides = {},
): KeybindingConflict[] {
  const conflicts: KeybindingConflict[] = [];
  const normalizedOverrides = normalizeKeybindingOverrides(overrides);
  const sorted = defs
    .map(normalizedKeybindingDef)
    .filter((def): def is KeybindingDef => def !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (!contextsOverlap(a.context, b.context)) continue;
      const ca = canonicalizeChord(effectiveChord(a, normalizedOverrides));
      const cb = canonicalizeChord(effectiveChord(b, normalizedOverrides));
      if (ca !== null && ca === cb) {
        conflicts.push({ chord: ca, ids: [a.id, b.id] });
      }
    }
  }
  return conflicts;
}

/**
 * The conflicts a candidate chord would introduce for `targetId` if assigned -
 * the recorder's pre-commit check. Returns the ids of existing bindings the
 * candidate would collide with (overlapping context, same canonical chord),
 * excluding the target itself.
 */
export function conflictsForCandidate(
  defs: readonly KeybindingDef[],
  overrides: KeybindingOverrides,
  targetId: unknown,
  candidateChord: string,
): string[] {
  const normalizedTargetId = normalizeKeybindingId(targetId);
  const normalizedDefs = defs
    .map(normalizedKeybindingDef)
    .filter((def): def is KeybindingDef => def !== null);
  const target = normalizedDefs.find((d) => d.id === normalizedTargetId);
  const candidate = canonicalizeChord(candidateChord);
  if (!target || candidate === null) return [];
  const normalizedOverrides = normalizeKeybindingOverrides(overrides);
  const hits: string[] = [];
  for (const def of normalizedDefs) {
    if (def.id === normalizedTargetId) continue;
    if (!contextsOverlap(def.context, target.context)) continue;
    if (canonicalizeChord(effectiveChord(def, normalizedOverrides)) === candidate) {
      hits.push(def.id);
    }
  }
  return hits.sort((a, b) => a.localeCompare(b));
}
