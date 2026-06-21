import { useEffect, useMemo } from "react";
import { create } from "zustand";

import { normalizeNodeId } from "../nodeIds";
import { normalizeViewStoreSessionString } from "./scopeIdentity";

const EMPTY_TIERS: readonly string[] = [];
const noopInspectorExpansionWrite = () => undefined;
const INSPECTOR_TIER_IDS = ["declared", "structural", "temporal", "semantic"] as const;
const INSPECTOR_TIER_ID_SET = new Set<string>(INSPECTOR_TIER_IDS);
export const INSPECTOR_EXPANSION_KEY_MAX_CHARS = 2048;
const DEFAULT_INSPECTOR_EXPANSION_KEY = "inspector-expansion:scope:null:node:null";

export const normalizeInspectorExpansionScope = normalizeViewStoreSessionString;

export function normalizeInspectorExpansionNodeId(nodeId: unknown): string | null {
  return normalizeNodeId(nodeId);
}

export function inspectorExpansionKey(scope: unknown, nodeId: unknown): string {
  const normalizedScope = normalizeInspectorExpansionScope(scope);
  const normalizedNodeId = normalizeInspectorExpansionNodeId(nodeId);
  const scopePart =
    normalizedScope === null
      ? "scope:null"
      : `scope:value:${encodeURIComponent(normalizedScope)}`;
  const nodePart =
    normalizedNodeId === null
      ? "node:null"
      : `node:value:${encodeURIComponent(normalizedNodeId)}`;
  const key = `inspector-expansion:${scopePart}:${nodePart}`;
  return key.length <= INSPECTOR_EXPANSION_KEY_MAX_CHARS
    ? key
    : DEFAULT_INSPECTOR_EXPANSION_KEY;
}

export function canWriteInspectorExpansionIdentity(
  scope: unknown,
  nodeId: unknown,
): boolean {
  return (
    (scope === null || normalizeInspectorExpansionScope(scope) !== null) &&
    normalizeInspectorExpansionNodeId(nodeId) !== null
  );
}

export function normalizeInspectorExpansionKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= INSPECTOR_EXPANSION_KEY_MAX_CHARS
    ? normalized
    : null;
}

export function normalizeInspectorExpansionTier(tier: unknown): string | null {
  if (typeof tier !== "string") return null;
  const normalized = tier.trim();
  return INSPECTOR_TIER_ID_SET.has(normalized) ? normalized : null;
}

export function normalizeInspectorExpansionTiers(tiers: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tier of tiers) {
    const normalized = normalizeInspectorExpansionTier(tier);
    if (normalized === null || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= INSPECTOR_TIER_IDS.length) break;
  }
  return out;
}

function sameTierList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tier, index) => tier === b[index]);
}

interface InspectorExpansionState {
  key: string;
  expandedTiers: string[];
  setKey: (key: unknown) => void;
  toggleTier: (key: unknown, tier: unknown) => void;
  pruneVisible: (key: unknown, visibleTiers: readonly unknown[]) => void;
  reset: () => void;
}

export const useInspectorExpansionStore = create<InspectorExpansionState>((set) => ({
  key: DEFAULT_INSPECTOR_EXPANSION_KEY,
  expandedTiers: [],
  setKey: (key) =>
    set((state) => {
      const normalizedKey = normalizeInspectorExpansionKey(key);
      if (normalizedKey === null) return state;
      return state.key === normalizedKey
        ? state
        : { key: normalizedKey, expandedTiers: [] };
    }),
  toggleTier: (key, tier) =>
    set((state) => {
      const normalizedKey = normalizeInspectorExpansionKey(key);
      if (normalizedKey === null) return state;
      const normalized = normalizeInspectorExpansionTier(tier);
      if (normalized === null) return state;
      const current =
        state.key === normalizedKey
          ? normalizeInspectorExpansionTiers(state.expandedTiers)
          : [];
      const expandedTiers = current.includes(normalized)
        ? current.filter((entry) => entry !== normalized)
        : normalizeInspectorExpansionTiers([...current, normalized]);
      return { key: normalizedKey, expandedTiers };
    }),
  pruneVisible: (key, visibleTiers) =>
    set((state) => {
      const normalizedKey = normalizeInspectorExpansionKey(key);
      if (
        normalizedKey === null ||
        state.key !== normalizedKey ||
        state.expandedTiers.length === 0
      ) {
        return state;
      }
      const visible = new Set(normalizeInspectorExpansionTiers(visibleTiers));
      const expandedTiers = normalizeInspectorExpansionTiers(
        state.expandedTiers,
      ).filter((tier) => visible.has(tier));
      return sameTierList(expandedTiers, state.expandedTiers)
        ? state
        : { expandedTiers };
    }),
  reset: () =>
    set({
      key: DEFAULT_INSPECTOR_EXPANSION_KEY,
      expandedTiers: [],
    }),
}));

export function resetInspectorExpansion(): void {
  useInspectorExpansionStore.getState().reset();
}

export function useInspectorTierExpansion(
  scope: unknown,
  nodeId: unknown,
  visibleTiers: readonly unknown[],
): { expanded: ReadonlySet<string>; toggle: (tier: unknown) => void } {
  const key = useMemo(() => inspectorExpansionKey(scope, nodeId), [scope, nodeId]);
  const canWrite = useMemo(
    () => canWriteInspectorExpansionIdentity(scope, nodeId),
    [scope, nodeId],
  );
  const storeKey = useInspectorExpansionStore((state) => state.key);
  const expandedTiers = useInspectorExpansionStore((state) => state.expandedTiers);
  const setKey = useInspectorExpansionStore((state) => state.setKey);
  const toggleStored = useInspectorExpansionStore((state) => state.toggleTier);
  const pruneVisible = useInspectorExpansionStore((state) => state.pruneVisible);

  useEffect(() => {
    if (!canWrite) return;
    setKey(key);
  }, [canWrite, key, setKey]);
  useEffect(() => {
    if (!canWrite) return;
    pruneVisible(key, visibleTiers);
  }, [canWrite, key, visibleTiers, pruneVisible]);

  const activeTiers = canWrite && storeKey === key ? expandedTiers : EMPTY_TIERS;
  const expanded = useMemo(() => new Set(activeTiers), [activeTiers]);
  const toggle = useMemo(
    () =>
      canWrite
        ? (tier: unknown) => toggleStored(key, tier)
        : noopInspectorExpansionWrite,
    [canWrite, key, toggleStored],
  );

  return { expanded, toggle };
}
