import { useEffect, useMemo } from "react";
import { create } from "zustand";

import { normalizeNodeId } from "../nodeIds";
import { normalizeViewStoreSessionString } from "./scopeIdentity";

export const PIPELINE_EXPANDED_IDS_CAP = 64;
export const PIPELINE_EXPANSION_AS_OF_MAX_CHARS = 512;
export const PIPELINE_EXPANSION_KEY_MAX_CHARS = 2048;

const EMPTY_EXPANDED_IDS: readonly string[] = [];
const noopPipelineExpansionWrite = () => undefined;

type PipelineExpansionRowInput = { nodeId: string } | { node_id: string };

export interface PipelineExpansionRowView<T extends PipelineExpansionRowInput> {
  row: T;
  nodeId: string;
  expanded: boolean;
  statusPlanClassName: string;
  statusPlanSelectedValue: "" | undefined;
}

export const normalizePipelineExpansionScope = normalizeViewStoreSessionString;

export function normalizePipelineExpansionAsOf(
  asOf: unknown,
): string | number | undefined {
  if (typeof asOf === "number") return Number.isFinite(asOf) ? asOf : undefined;
  if (typeof asOf !== "string") return undefined;
  const normalized = asOf.trim();
  return normalized.length > 0 &&
    normalized.length <= PIPELINE_EXPANSION_AS_OF_MAX_CHARS
    ? normalized
    : undefined;
}

export function pipelineExpansionKey(scope: unknown, asOf?: unknown): string {
  const normalizedScope = normalizePipelineExpansionScope(scope);
  const normalizedAsOf = normalizePipelineExpansionAsOf(asOf);
  const scopePart =
    normalizedScope === null
      ? "scope:null"
      : `scope:value:${encodeURIComponent(normalizedScope)}`;
  const playheadPart =
    normalizedAsOf === undefined
      ? "playhead:live"
      : `playhead:value:${encodeURIComponent(String(normalizedAsOf))}`;
  const key = `pipeline-expansion:${scopePart}:${playheadPart}`;
  return key.length <= PIPELINE_EXPANSION_KEY_MAX_CHARS
    ? key
    : pipelineExpansionKey(null);
}

export function canWritePipelineExpansionIdentity(
  scope: unknown,
  asOf: unknown,
): boolean {
  return (
    (scope === null || normalizePipelineExpansionScope(scope) !== null) &&
    (asOf === undefined || normalizePipelineExpansionAsOf(asOf) !== undefined)
  );
}

const DEFAULT_PIPELINE_EXPANSION_KEY = pipelineExpansionKey(null);

export function normalizePipelineExpansionKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= PIPELINE_EXPANSION_KEY_MAX_CHARS
    ? normalized
    : null;
}

function pipelineExpansionRowId(row: PipelineExpansionRowInput): string {
  return normalizeNodeId("nodeId" in row ? row.nodeId : row.node_id) ?? "";
}

export function normalizePipelineExpandedIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
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

// Plan tracker card (binding ActivityRail · Status PlanPill, node 551:1555): a
// bordered white card on the canonical small radius — `bg-paper-raised` over the
// rail's warm paper, a faint `border-rule` hairline, `rounded-fg-sm`. The
// expanded/collapsed states do not change chrome; `overflow-hidden` clips the
// expanded step tree cleanly. Tokens, not literals (design-system-is-centralized,
// figma-is-the-binding-source-of-truth).
const PIPELINE_STATUS_PLAN_CLASS =
  "overflow-hidden rounded-fg-sm border border-rule bg-paper-raised";

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
  setKey: (key: unknown) => void;
  toggle: (key: unknown, id: unknown) => void;
  pruneVisible: (key: unknown, visibleIds: unknown) => void;
  reset: () => void;
}

export const usePipelineExpansionStore = create<PipelineExpansionState>((set) => ({
  key: DEFAULT_PIPELINE_EXPANSION_KEY,
  expandedIds: [],
  setKey: (key) =>
    set((state) => {
      const normalizedKey = normalizePipelineExpansionKey(key);
      if (normalizedKey === null) return state;
      return state.key === normalizedKey
        ? state
        : { key: normalizedKey, expandedIds: [] };
    }),
  toggle: (key, id) =>
    set((state) => {
      const normalizedKey = normalizePipelineExpansionKey(key);
      const normalizedId = normalizeNodeId(id);
      if (normalizedKey === null || normalizedId === null) return state;
      const current =
        state.key === normalizedKey
          ? normalizePipelineExpandedIds(state.expandedIds)
          : [];
      const next = current.includes(normalizedId)
        ? current.filter((entry) => entry !== normalizedId)
        : normalizePipelineExpandedIds([...current, normalizedId]);
      return {
        key: normalizedKey,
        expandedIds: next,
      };
    }),
  pruneVisible: (key, visibleIds) =>
    set((state) => {
      const normalizedKey = normalizePipelineExpansionKey(key);
      if (
        normalizedKey === null ||
        state.key !== normalizedKey ||
        state.expandedIds.length === 0
      ) {
        return state;
      }
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
  scope: unknown,
  asOf: unknown,
  visiblePlanIds: readonly unknown[],
): { expanded: ReadonlySet<string>; toggle: (id: unknown) => void } {
  const key = useMemo(() => pipelineExpansionKey(scope, asOf), [scope, asOf]);
  const canWrite = useMemo(
    () => canWritePipelineExpansionIdentity(scope, asOf),
    [scope, asOf],
  );
  const storeKey = usePipelineExpansionStore((state) => state.key);
  const expandedIds = usePipelineExpansionStore((state) => state.expandedIds);
  const setKey = usePipelineExpansionStore((state) => state.setKey);
  const toggleStored = usePipelineExpansionStore((state) => state.toggle);
  const pruneVisible = usePipelineExpansionStore((state) => state.pruneVisible);

  useEffect(() => {
    if (!canWrite) return;
    setKey(key);
  }, [canWrite, key, setKey]);
  useEffect(() => {
    if (!canWrite) return;
    pruneVisible(key, visiblePlanIds);
  }, [canWrite, key, visiblePlanIds, pruneVisible]);

  const activeIds = canWrite && storeKey === key ? expandedIds : EMPTY_EXPANDED_IDS;
  const expanded = useMemo(() => new Set(activeIds), [activeIds]);
  const toggle = useMemo(
    () =>
      canWrite ? (id: unknown) => toggleStored(key, id) : noopPipelineExpansionWrite,
    [canWrite, key, toggleStored],
  );

  return { expanded, toggle };
}
