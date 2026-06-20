import { useEffect, useMemo } from "react";
import { create } from "zustand";

import { normalizeViewStoreSessionString } from "./scopeIdentity";

export type BrowserTreeMode = "vault" | "code";

export const BROWSER_TREE_EXPANDED_KEYS_CAP = 128;
export const BROWSER_TREE_KEY_MAX_CHARS = 2048;
export const BROWSER_TREE_ITEM_KEY_MAX_CHARS = 2048;

const EMPTY_EXPANDED_KEYS: readonly string[] = [];
const DEFAULT_BROWSER_TREE_KEY = "browser-tree:scope:null:vault";

export interface BrowserTreeExpansionItemView {
  key: string;
  expanded: boolean;
}

export interface BrowserTreeVaultDocTypeGroupShape {
  docType: string;
  entries: readonly { path: string }[];
}

export interface BrowserTreeVaultFeatureGroupShape {
  feature: string;
  docTypes: readonly BrowserTreeVaultDocTypeGroupShape[];
}

export interface BrowserTreeCodeEntryShape {
  path: string;
  kind: "dir" | "file";
  node_id: string;
}

export function deriveCodeBrowserTreeNavKey(entry: BrowserTreeCodeEntryShape): string {
  return `${entry.kind === "dir" ? "d" : "f"}:${entry.path}`;
}

export interface BrowserTreeCodeRowView {
  navKey: string;
  isDir: boolean;
  expanded: boolean;
  linked: boolean;
  highlighted: boolean;
  visible: boolean;
  rowStyle: { paddingLeft: string };
  rowClassName: string;
  selectionCueClassName: string;
  chevronClassName: string;
  chevronSpacerStyle: { display: "inline-block"; width: number };
  markClassName: string;
  labelClassName: string;
  linkedCueClassName: string;
  linkedCueAriaLabel: string;
}

export interface BrowserTreeCodeRowOptions {
  depth: number;
  filter: string;
  highlightPath: string | null;
  expanded: ReadonlySet<string>;
  linkedNodeIds?: ReadonlySet<string>;
  chevronPx: number;
}

export const normalizeBrowserTreeScope = normalizeViewStoreSessionString;

export function normalizeBrowserTreeMode(mode: unknown): BrowserTreeMode {
  return mode === "code" ? "code" : "vault";
}

export function browserTreeExpansionKey(scope: unknown, mode: unknown): string {
  const normalizedScope = normalizeBrowserTreeScope(scope);
  const normalizedMode = normalizeBrowserTreeMode(mode);
  const scopePart =
    normalizedScope === null
      ? "scope:null"
      : `scope:value:${encodeURIComponent(normalizedScope)}`;
  const key = `browser-tree:${scopePart}:${normalizedMode}`;
  return key.length <= BROWSER_TREE_KEY_MAX_CHARS ? key : DEFAULT_BROWSER_TREE_KEY;
}

export function deriveBrowserTreeExpansionItem(
  key: string,
  expanded: ReadonlySet<string>,
): BrowserTreeExpansionItemView {
  return {
    key,
    expanded: expanded.has(key),
  };
}

export function deriveVaultBrowserTreeNavOrder(
  groups: readonly BrowserTreeVaultFeatureGroupShape[],
  expanded: ReadonlySet<string>,
): string[] {
  const order: string[] = [];
  for (const group of groups) {
    const featureKey = `f:${group.feature}`;
    order.push(featureKey);
    if (!deriveBrowserTreeExpansionItem(featureKey, expanded).expanded) continue;
    for (const docTypeGroup of group.docTypes) {
      const docTypeKey = `d:${group.feature}/${docTypeGroup.docType}`;
      order.push(docTypeKey);
      if (!deriveBrowserTreeExpansionItem(docTypeKey, expanded).expanded) continue;
      for (const entry of docTypeGroup.entries) order.push(`r:${entry.path}`);
    }
  }
  return order;
}

export function deriveBrowserTreeRovingKey(
  activeKey: string | null,
  order: readonly string[],
): string | null {
  return activeKey && order.includes(activeKey) ? activeKey : (order[0] ?? null);
}

export function deriveCodeBrowserTreeRowView(
  entry: BrowserTreeCodeEntryShape,
  options: BrowserTreeCodeRowOptions,
): BrowserTreeCodeRowView {
  const isDir = entry.kind === "dir";
  const normalizedFilter = options.filter.trim().toLowerCase();
  const highlighted = entry.path === options.highlightPath;
  const linked = !isDir && (options.linkedNodeIds?.has(entry.node_id) ?? false);
  const rowExpansion = deriveBrowserTreeExpansionItem(entry.path, options.expanded);
  return {
    navKey: deriveCodeBrowserTreeNavKey(entry),
    isDir,
    expanded: isDir && rowExpansion.expanded,
    linked,
    highlighted,
    visible:
      normalizedFilter.length === 0 ||
      isDir ||
      entry.path.toLowerCase().includes(normalizedFilter),
    rowStyle: { paddingLeft: "0.25rem" },
    rowClassName: `flex h-[30px] w-full items-center gap-fg-1 truncate rounded-fg-xs pr-fg-1 text-meta text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
      highlighted
        ? "bg-accent-subtle font-medium text-ink"
        : "text-ink-muted hover:bg-paper-sunken hover:text-ink"
    }`,
    selectionCueClassName: `h-3 w-0.5 shrink-0 rounded-full ${
      highlighted ? "bg-accent" : "bg-transparent"
    }`,
    chevronClassName: "shrink-0 text-ink-faint",
    chevronSpacerStyle: { display: "inline-block", width: options.chevronPx },
    markClassName: "shrink-0 text-ink-faint",
    labelClassName: "min-w-0 truncate font-mono",
    linkedCueClassName: "ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70",
    linkedCueAriaLabel: "has graph linkage",
  };
}

interface BrowserTreeExpansionState {
  key: string;
  expandedKeys: string[];
  activeKey: string | null;
  setKey: (key: unknown) => void;
  toggle: (key: unknown, id: unknown) => void;
  setActiveKey: (key: unknown, id: unknown) => void;
  reset: () => void;
}

export function normalizeBrowserTreeExpansionKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return key.length > 0 && key.length <= BROWSER_TREE_KEY_MAX_CHARS ? key : null;
}

export function normalizeBrowserTreeItemKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return key.length > 0 && key.length <= BROWSER_TREE_ITEM_KEY_MAX_CHARS
    ? key
    : null;
}

export function normalizeBrowserTreeActiveKey(value: unknown): string | null {
  return value === null ? null : normalizeBrowserTreeItemKey(value);
}

export const useBrowserTreeExpansionStore = create<BrowserTreeExpansionState>(
  (set) => ({
    key: DEFAULT_BROWSER_TREE_KEY,
    expandedKeys: [],
    activeKey: null,
    setKey: (key) =>
      set((state) => {
        const normalizedKey = normalizeBrowserTreeExpansionKey(key);
        if (normalizedKey === null) return state;
        return state.key === normalizedKey
          ? state
          : { key: normalizedKey, expandedKeys: [], activeKey: null };
      }),
    toggle: (key, id) =>
      set((state) => {
        const normalizedKey = normalizeBrowserTreeExpansionKey(key);
        const itemKey = normalizeBrowserTreeItemKey(id);
        if (normalizedKey === null || itemKey === null) return state;
        const current = state.key === normalizedKey ? state.expandedKeys : [];
        const next = current.includes(itemKey)
          ? current.filter((entry) => entry !== itemKey)
          : [...current, itemKey];
        return {
          key: normalizedKey,
          expandedKeys:
            next.length > BROWSER_TREE_EXPANDED_KEYS_CAP
              ? next.slice(next.length - BROWSER_TREE_EXPANDED_KEYS_CAP)
              : next,
        };
      }),
    setActiveKey: (key, activeKey) =>
      set((state) => {
        const normalizedKey = normalizeBrowserTreeExpansionKey(key);
        if (normalizedKey === null) return state;
        const normalizedActiveKey = normalizeBrowserTreeActiveKey(activeKey);
        return state.key === normalizedKey
          ? { activeKey: normalizedActiveKey }
          : { key: normalizedKey, expandedKeys: [], activeKey: normalizedActiveKey };
      }),
    reset: () =>
      set({
        key: DEFAULT_BROWSER_TREE_KEY,
        expandedKeys: [],
        activeKey: null,
      }),
  }),
);

export function resetBrowserTreeExpansion(): void {
  useBrowserTreeExpansionStore.getState().reset();
}

export function useBrowserTreeExpansion(
  scope: unknown,
  mode: unknown,
): {
  expanded: ReadonlySet<string>;
  activeKey: string | null;
  toggle: (id: unknown) => void;
  setActiveKey: (id: unknown) => void;
} {
  const key = useMemo(() => browserTreeExpansionKey(scope, mode), [scope, mode]);
  const storeKey = useBrowserTreeExpansionStore((state) => state.key);
  const expandedKeys = useBrowserTreeExpansionStore((state) => state.expandedKeys);
  const storedActiveKey = useBrowserTreeExpansionStore((state) => state.activeKey);
  const setKey = useBrowserTreeExpansionStore((state) => state.setKey);
  const toggleStored = useBrowserTreeExpansionStore((state) => state.toggle);
  const setActiveKeyStored = useBrowserTreeExpansionStore(
    (state) => state.setActiveKey,
  );

  useEffect(() => setKey(key), [key, setKey]);

  const activeKeys = storeKey === key ? expandedKeys : EMPTY_EXPANDED_KEYS;
  const activeKey = storeKey === key ? storedActiveKey : null;
  const expanded = useMemo(() => new Set(activeKeys), [activeKeys]);
  const toggle = useMemo(
    () => (id: unknown) => toggleStored(key, id),
    [key, toggleStored],
  );
  const setActiveKey = useMemo(
    () => (id: unknown) => setActiveKeyStored(key, id),
    [key, setActiveKeyStored],
  );

  return { expanded, activeKey, toggle, setActiveKey };
}
