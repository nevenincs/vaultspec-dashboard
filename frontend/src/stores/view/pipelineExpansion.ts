import { useEffect, useMemo } from "react";
import { create } from "zustand";

import { normalizeNodeId } from "../nodeIds";

export const PIPELINE_EXPANDED_IDS_CAP = 64;

const EMPTY_EXPANDED_IDS: readonly string[] = [];

type PipelineExpansionRowInput = { nodeId: string } | { node_id: string };

export interface PipelineExpansionRowView<T extends PipelineExpansionRowInput> {
  row: T;
  nodeId: string;
  expanded: boolean;
  statusPlanClassName: string;
  statusPlanSelectedValue: "" | undefined;
}

export function pipelineExpansionKey(
  scope: string | null,
  asOf?: string | number,
): string {
  const scopePart =
    scope === null ? "scope:null" : `scope:${encodeURIComponent(scope)}`;
  const playheadPart =
    asOf === undefined
      ? "playhead:live"
      : `playhead:${encodeURIComponent(String(asOf))}`;
  return `pipeline-expansion:${scopePart}:${playheadPart}`;
}

const DEFAULT_PIPELINE_EXPANSION_KEY = pipelineExpansionKey(null);

function pipelineExpansionRowId(row: PipelineExpansionRowInput): string {
  return normalizeNodeId("nodeId" in row ? row.nodeId : row.node_id) ?? "";
}

export function normalizePipelineExpandedIds(ids: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (let i = ids.length - 1; i >= 0; i -= 1) {
    const id = normalizeNodeId(ids[i]);
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    normalized.unshift(id);
    if (normalized.length >= PIPELINE_EXPANDED_IDS_CAP) break;
  }
  return normalized;
}

// Flush plan tracker — no border, no card background, no accent ring (the
// expanded/collapsed states no longer change chrome). The only resting class is
// `overflow-hidden` so the expanded step tree clips cleanly. One canonical fold
// idiom (design-system-is-centralized).
const PIPELINE_STATUS_PLAN_CLASS = "overflow-hidden";

export function derivePipelineExpansionRows<T extends PipelineExpansionRowInput>(
  rows: readonly T[],
  expanded: ReadonlySet<string>,
): PipelineExpansionRowView<T>[] {
  return rows.map((row) => {
    const nodeId = pipelineExpansionRowId(row);
    const isExpanded = expanded.has(nodeId);
    return {
      row,
      nodeId,
      expanded: isExpanded,
      statusPlanClassName: PIPELINE_STATUS_PLAN_CLASS,
      statusPlanSelectedValue: isExpanded ? "" : undefined,
    };
  });
}

interface PipelineExpansionState {
  key: string;
  expandedIds: string[];
  setKey: (key: string) => void;
  toggle: (key: string, id: string) => void;
  pruneVisible: (key: string, visibleIds: readonly string[]) => void;
  reset: () => void;
}

export const usePipelineExpansionStore = create<PipelineExpansionState>((set) => ({
  key: DEFAULT_PIPELINE_EXPANSION_KEY,
  expandedIds: [],
  setKey: (key) =>
    set((state) => (state.key === key ? state : { key, expandedIds: [] })),
  toggle: (key, id) =>
    set((state) => {
      const normalizedId = normalizeNodeId(id);
      if (normalizedId === null) return state;
      const current =
        state.key === key ? normalizePipelineExpandedIds(state.expandedIds) : [];
      const next = current.includes(normalizedId)
        ? current.filter((entry) => entry !== normalizedId)
        : normalizePipelineExpandedIds([...current, normalizedId]);
      return {
        key,
        expandedIds: next,
      };
    }),
  pruneVisible: (key, visibleIds) =>
    set((state) => {
      if (state.key !== key || state.expandedIds.length === 0) return state;
      const visible = new Set(normalizePipelineExpandedIds(visibleIds));
      const next = normalizePipelineExpandedIds(state.expandedIds).filter((id) =>
        visible.has(id),
      );
      return next.length === state.expandedIds.length &&
        next.every((id, index) => id === state.expandedIds[index])
        ? state
        : { expandedIds: next };
    }),
  reset: () =>
    set({
      key: DEFAULT_PIPELINE_EXPANSION_KEY,
      expandedIds: [],
    }),
}));

export function resetPipelineExpansion(): void {
  usePipelineExpansionStore.getState().reset();
}

export function usePipelineExpansion(
  scope: string | null,
  asOf: string | number | undefined,
  visiblePlanIds: readonly string[],
): { expanded: ReadonlySet<string>; toggle: (id: string) => void } {
  const key = useMemo(() => pipelineExpansionKey(scope, asOf), [scope, asOf]);
  const storeKey = usePipelineExpansionStore((state) => state.key);
  const expandedIds = usePipelineExpansionStore((state) => state.expandedIds);
  const setKey = usePipelineExpansionStore((state) => state.setKey);
  const toggleStored = usePipelineExpansionStore((state) => state.toggle);
  const pruneVisible = usePipelineExpansionStore((state) => state.pruneVisible);

  useEffect(() => setKey(key), [key, setKey]);
  useEffect(
    () => pruneVisible(key, visiblePlanIds),
    [key, visiblePlanIds, pruneVisible],
  );

  const activeIds = storeKey === key ? expandedIds : EMPTY_EXPANDED_IDS;
  const expanded = useMemo(() => new Set(activeIds), [activeIds]);
  const toggle = useMemo(
    () => (id: string) => toggleStored(key, id),
    [key, toggleStored],
  );

  return { expanded, toggle };
}
