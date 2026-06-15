// Named lenses (W02.P07.S31, ADR G3.f / G5.d): filter sets saved
// client-side under a name ("broken links", "last sprint",
// "high-confidence only") and exposed to the command palette. The engine
// holds no preference store; lenses live in web storage.

import { create } from "zustand";

import type { KeyValueStore } from "../../scene/positionCache";
import type { FilterChoices } from "./filters";
import { DEFAULT_CHOICES, useFilterStore } from "./filters";
import { createScopedStore } from "./scopedStore";

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
      tiers: { declared: false, structural: true, temporal: false, semantic: false },
      structuralStates: ["broken"],
    },
  },
  {
    name: "high-confidence only",
    builtin: true,
    choices: {
      ...structuredClone(DEFAULT_CHOICES),
      minConfidence: { temporal: 0.7, semantic: 0.7 },
    },
  },
];

// Lenses are keyed by workspace + scope like every other client-side
// persistence surface (G5.d; finding lens-scope-key-018): lens choices
// embed scope-dependent vocabulary (feature tags), so cross-scope bleed is
// real, not theoretical. The scope-keyed scaffold is owned by
// `createScopedStore`; this configures it for the `Lens[]` shape, dropping
// builtins on save (they are shipped, not persisted).
const lensesStore = createScopedStore<Lens[]>({
  prefix: "vaultspec-dashboard:lenses",
  parse: (raw) =>
    Array.isArray(raw)
      ? (raw as Lens[]).filter((l) => l && typeof l.name === "string" && l.choices)
      : [],
  serialize: (lenses) => lenses.filter((l) => !l.builtin),
});

export function loadLenses(
  store: KeyValueStore,
  workspace: string,
  scope: string,
): Lens[] {
  return lensesStore.load(store, workspace, scope);
}

export function saveLenses(
  store: KeyValueStore,
  workspace: string,
  scope: string,
  lenses: readonly Lens[],
): void {
  lensesStore.save(store, workspace, scope, [...lenses]);
}

interface LensState {
  saved: Lens[];
  workspace: string;
  scope: string;
  /** Swap the persistence scope and load its lenses (worktree switch). */
  setScopeKey: (workspace: string, scope: string) => void;
  /** Snapshot the CURRENT filter choices under a name (overwrites). */
  saveCurrent: (name: string) => void;
  apply: (name: string) => boolean;
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
    const store = lensesStore.backingStore();
    set({
      workspace,
      scope,
      saved: store ? loadLenses(store, workspace, scope) : [],
    });
  },
  saveCurrent: (name) => {
    const f = useFilterStore.getState();
    const lens: Lens = {
      name,
      choices: {
        tiers: { ...f.tiers },
        minConfidence: { ...f.minConfidence },
        docTypes: [...f.docTypes],
        featureTags: [...f.featureTags],
        relations: [...f.relations],
        structuralStates: [...f.structuralStates],
        textMatch: f.textMatch,
        dateRange: { ...f.dateRange },
      },
    };
    const saved = [...get().saved.filter((l) => l.name !== name), lens];
    set({ saved });
    const store = lensesStore.backingStore();
    if (store) saveLenses(store, get().workspace, get().scope, saved);
  },
  apply: (name) => {
    const lens = get()
      .all()
      .find((l) => l.name === name);
    if (!lens) return false;
    useFilterStore.getState().apply(structuredClone(lens.choices));
    return true;
  },
  remove: (name) => {
    const saved = get().saved.filter((l) => l.name !== name);
    set({ saved });
    const store = lensesStore.backingStore();
    if (store) saveLenses(store, get().workspace, get().scope, saved);
  },
  all: () => [...BUILTIN_LENSES, ...get().saved],
}));
