import { create } from "zustand";

import { SEARCH_QUERY_MAX_CHARS, normalizeSearchQuery } from "../searchQuery";
import {
  DEFAULT_SEARCH_TARGET,
  SEARCH_TARGET_OPTIONS,
  normalizeOptionalSearchTarget,
  type SearchTarget,
} from "../searchTarget";

export {
  DEFAULT_SEARCH_TARGET,
  SEARCH_TARGET_OPTIONS,
  type SearchTarget,
} from "../searchTarget";

export const SEARCH_INTENT_QUERY_MAX_CHARS = SEARCH_QUERY_MAX_CHARS;

export interface SearchTargetRowView {
  target: SearchTarget;
  label: string;
}

export function deriveSearchTargetRows(): SearchTargetRowView[] {
  return SEARCH_TARGET_OPTIONS.map((option) => ({
    target: option,
    label: option,
  }));
}

export function isSearchTarget(value: unknown): value is SearchTarget {
  return normalizeSearchIntentTarget(value) !== null;
}

export function normalizeSearchIntentTarget(value: unknown): SearchTarget | null {
  return normalizeOptionalSearchTarget(value);
}

export function normalizeSearchIntentQuery(query: unknown): string {
  return normalizeSearchQuery(query);
}

interface SearchIntentState {
  query: string;
  target: SearchTarget;
  setQuery: (query: unknown) => void;
  setTarget: (target: unknown) => void;
  reset: () => void;
}

export const useSearchIntentStore = create<SearchIntentState>((set) => ({
  query: "",
  target: DEFAULT_SEARCH_TARGET,
  setQuery: (query) => set({ query: normalizeSearchIntentQuery(query) }),
  setTarget: (target) => {
    const normalizedTarget = normalizeSearchIntentTarget(target);
    if (normalizedTarget === null) return;
    set({ target: normalizedTarget });
  },
  reset: () => set({ query: "", target: DEFAULT_SEARCH_TARGET }),
}));

export function useSearchIntentQuery(): string {
  return useSearchIntentStore((state) => state.query);
}

export function useSearchIntentTarget(): SearchTarget {
  return useSearchIntentStore((state) => state.target);
}

export function setSearchIntentQuery(query: unknown): void {
  useSearchIntentStore.getState().setQuery(query);
}

export function setSearchIntentTarget(target: unknown): void {
  useSearchIntentStore.getState().setTarget(target);
}

export function resetSearchIntent(): void {
  useSearchIntentStore.getState().reset();
}
