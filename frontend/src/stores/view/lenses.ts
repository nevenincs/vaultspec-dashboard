// Named lenses (W02.P07.S31, ADR G3.f / G5.d): filter sets saved
// client-side under a name ("broken links", "last sprint",
// "high-confidence only") and exposed to the command palette. The engine
// holds no preference store; lenses live in web storage.

import { create } from "zustand";

import type { KeyValueStore } from "../../scene/positionCache";
import type { FilterChoices } from "./filters";
import { DEFAULT_CHOICES, useFilterStore } from "./filters";

export interface Lens {
  name: string;
  choices: FilterChoices;
  builtin?: boolean;
}

/** Shipped lenses — the spec's worked examples; not persisted. */
export const BUILTIN_LENSES: Lens[] = [
  {
    name: "broken links",
    builtin: true,
    choices: {
      ...structuredClone(DEFAULT_CHOICES),
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

const STORAGE_KEY = "vaultspec-dashboard:lenses:default";

export function loadLenses(store: KeyValueStore): Lens[] {
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? (parsed as Lens[]).filter((l) => typeof l.name === "string" && l.choices)
      : [];
  } catch {
    store.removeItem(STORAGE_KEY);
    return [];
  }
}

export function saveLenses(store: KeyValueStore, lenses: readonly Lens[]): void {
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(lenses.filter((l) => !l.builtin)));
  } catch {
    // Best-effort persistence.
  }
}

function backingStore(): KeyValueStore | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

interface LensState {
  saved: Lens[];
  /** Snapshot the CURRENT filter choices under a name (overwrites). */
  saveCurrent: (name: string) => void;
  apply: (name: string) => boolean;
  remove: (name: string) => void;
  /** Builtins plus saved — the palette's lens list. */
  all: () => Lens[];
}

export const useLensStore = create<LensState>((set, get) => ({
  saved: backingStore() ? loadLenses(backingStore()!) : [],
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
    const store = backingStore();
    if (store) saveLenses(store, saved);
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
    const store = backingStore();
    if (store) saveLenses(store, saved);
  },
  all: () => [...BUILTIN_LENSES, ...get().saved],
}));
