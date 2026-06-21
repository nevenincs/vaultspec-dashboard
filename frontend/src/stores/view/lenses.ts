// Named lenses (W02.P07.S31, ADR G3.f / G5.d): filter choice snapshots saved
// client-side under a name and exposed to the command palette. The store owns
// persistence only; applying a lens writes canonical dashboard-state.

import { useMemo } from "react";
import { create } from "zustand";

import type { KeyValueStore } from "../../scene/positionCache";
import type { FilterChoices } from "./filters";
import { DEFAULT_CHOICES, normalizeFilterChoices } from "./filters";
import { createScopedStore, normalizeScopedStoreKeyPart } from "./scopedStore";

export interface Lens {
  name: string;
  choices: FilterChoices;
  builtin?: boolean;
}

/** Shipped lenses — the spec's worked examples; not persisted. */
export const BUILTIN_LENSES: Lens[] = [
  {
    // THE broken-links view (finding 019): isolated to the structural
    // tier filtered to broken — not "everything, plus a broken facet".
    // Nodes are retained by the membership rules (node facets untouched).
    name: "broken links",
    builtin: true,
    choices: {
      ...structuredClone(DEFAULT_CHOICES),
      tiers: { declared: false, structural: true, temporal: false },
      structuralStates: ["broken"],
    },
  },
  {
    name: "high-confidence only",
    builtin: true,
    choices: {
      ...structuredClone(DEFAULT_CHOICES),
      minConfidence: { temporal: 0.7 },
    },
  },
];

const BUILTIN_LENS_NAMES = new Set(BUILTIN_LENSES.map((lens) => lens.name));

export const SAVED_LENSES_CAP = 48;
export const SAVED_LENS_NAME_MAX = 80;

function normalizedLensName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return null;
  return name.slice(0, SAVED_LENS_NAME_MAX);
}

function cappedSavedLenses(lenses: readonly unknown[]): Lens[] {
  const seen = new Set<string>();
  const out: Lens[] = [];
  for (let i = lenses.length - 1; i >= 0 && out.length < SAVED_LENSES_CAP; i -= 1) {
    const lens = lenses[i] as Partial<Lens> | null | undefined;
    const name = normalizedLensName(lens?.name);
    const choices = normalizeFilterChoices(lens?.choices);
    if (
      !lens ||
      lens.builtin ||
      name === null ||
      BUILTIN_LENS_NAMES.has(name) ||
      choices === null ||
      seen.has(name)
    ) {
      continue;
    }
    seen.add(name);
    out.unshift({ name, choices });
  }
  return out;
}

// Lenses are keyed by workspace + scope like every other client-side
// persistence surface (G5.d; finding lens-scope-key-018): lens choices
// embed scope-dependent vocabulary (feature tags), so cross-scope bleed is
// real, not theoretical. The scope-keyed scaffold is owned by
// `createScopedStore`; this configures it for the `Lens[]` shape, dropping
// builtins on save (they are shipped, not persisted).
const lensesStore = createScopedStore<Lens[]>({
  prefix: "vaultspec-dashboard:lenses",
  parse: (raw) => (Array.isArray(raw) ? cappedSavedLenses(raw) : []),
  serialize: (lenses) => cappedSavedLenses(lenses),
});

export function loadLenses(
  store: KeyValueStore,
  workspace: unknown,
  scope: unknown,
): Lens[] {
  return lensesStore.load(store, workspace, scope);
}

export function saveLenses(
  store: KeyValueStore,
  workspace: unknown,
  scope: unknown,
  lenses: readonly Lens[],
): void {
  lensesStore.save(store, workspace, scope, cappedSavedLenses(lenses));
}

interface LensState {
  saved: Lens[];
  workspace: string;
  scope: string;
  /** Swap the persistence scope and load its lenses (worktree switch). */
  setScopeKey: (workspace: unknown, scope: unknown) => void;
  /** Save the supplied canonical filter choices under a name (overwrites). */
  saveCurrent: (name: string, choices: FilterChoices) => void;
  choicesFor: (name: string) => FilterChoices | null;
  remove: (name: string) => void;
  /** Builtins plus saved — the palette's lens list. */
  all: () => Lens[];
}

export const useLensStore = create<LensState>((set, get) => ({
  saved: lensesStore.backingStore()
    ? loadLenses(lensesStore.backingStore()!, "default", "default")
    : [],
  workspace: "default",
  scope: "default",
  setScopeKey: (workspace, scope) => {
    const nextWorkspace = normalizeScopedStoreKeyPart(workspace);
    const nextScope = normalizeScopedStoreKeyPart(scope);
    const store = lensesStore.backingStore();
    set({
      workspace: nextWorkspace,
      scope: nextScope,
      saved: store ? loadLenses(store, nextWorkspace, nextScope) : [],
    });
  },
  saveCurrent: (name, choices) => {
    const normalizedName = normalizedLensName(name);
    const normalizedChoices = normalizeFilterChoices(choices);
    if (
      normalizedName === null ||
      normalizedChoices === null ||
      BUILTIN_LENS_NAMES.has(normalizedName)
    ) {
      return;
    }
    const lens: Lens = {
      name: normalizedName,
      choices: normalizedChoices,
    };
    const saved = cappedSavedLenses([
      ...get().saved.filter((l) => l.name !== normalizedName),
      lens,
    ]);
    set({ saved });
    const store = lensesStore.backingStore();
    if (store) saveLenses(store, get().workspace, get().scope, saved);
  },
  choicesFor: (name) => {
    const lens = get()
      .all()
      .find((l) => l.name === normalizedLensName(name));
    return lens ? structuredClone(lens.choices) : null;
  },
  remove: (name) => {
    const normalizedName = normalizedLensName(name);
    const saved = get().saved.filter((l) => l.name !== normalizedName);
    set({ saved });
    const store = lensesStore.backingStore();
    if (store) saveLenses(store, get().workspace, get().scope, saved);
  },
  all: () => [...BUILTIN_LENSES, ...get().saved],
}));

export function useLenses(): readonly Lens[] {
  const saved = useLensStore((state) => state.saved);
  return useMemo(() => [...BUILTIN_LENSES, ...saved], [saved]);
}

export function getLensChoices(name: string): FilterChoices | null {
  return useLensStore.getState().choicesFor(name);
}

export function saveCurrentLens(name: string, choices: FilterChoices): void {
  useLensStore.getState().saveCurrent(name, choices);
}

export function removeSavedLens(name: string): void {
  useLensStore.getState().remove(name);
}
