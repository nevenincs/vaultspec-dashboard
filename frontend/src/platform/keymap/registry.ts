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

/** One bindable command action. Construct in a surface's action module. */
export interface KeybindingDef {
  /** Stable action id; the override-map key and the dispatcher's resolve key. */
  readonly id: string;
  /** The canonical default chord string (e.g. `"Mod+K"`, `"ArrowLeft"`). */
  readonly defaultChord: string;
  /** Human label for the legend and the settings recorder. */
  readonly label: string;
  /** Grouping for the legend and settings (e.g. `"General"`, `"Graph"`). */
  readonly group: string;
  /** The context the binding is active in. */
  readonly context: BindingContext;
}

/** Sparse map of user override chords, keyed by action id. */
export type KeybindingOverrides = Readonly<Record<string, string>>;

const bindings = new Map<string, KeybindingDef>();

/**
 * Register a batch of bindings; returns a disposer that removes exactly the
 * entries it added (only if they have not since been replaced). Throws on a
 * malformed default chord - that is a programmer error caught in tests, not a
 * runtime degradation.
 */
export function registerKeybindings(defs: readonly KeybindingDef[]): () => void {
  for (const def of defs) {
    if (canonicalizeChord(def.defaultChord) === null) {
      throw new Error(
        `keybinding "${def.id}" has a malformed default chord: "${def.defaultChord}"`,
      );
    }
    bindings.set(def.id, def);
  }
  return () => {
    for (const def of defs) {
      if (bindings.get(def.id) === def) bindings.delete(def.id);
    }
  };
}

/** All registered bindings, in stable id order. */
export function listKeybindings(): KeybindingDef[] {
  return [...bindings.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Look up one binding by id. */
export function getKeybinding(id: string): KeybindingDef | undefined {
  return bindings.get(id);
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
  const override = overrides[def.id];
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
  for (const def of defs) {
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
  const sorted = [...defs].sort((a, b) => a.id.localeCompare(b.id));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (!contextsOverlap(a.context, b.context)) continue;
      const ca = canonicalizeChord(effectiveChord(a, overrides));
      const cb = canonicalizeChord(effectiveChord(b, overrides));
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
  targetId: string,
  candidateChord: string,
): string[] {
  const target = defs.find((d) => d.id === targetId);
  const candidate = canonicalizeChord(candidateChord);
  if (!target || candidate === null) return [];
  const hits: string[] = [];
  for (const def of defs) {
    if (def.id === targetId) continue;
    if (!contextsOverlap(def.context, target.context)) continue;
    if (canonicalizeChord(effectiveChord(def, overrides)) === candidate) {
      hits.push(def.id);
    }
  }
  return hits.sort((a, b) => a.localeCompare(b));
}
