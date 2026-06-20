import { useEffect, useMemo } from "react";
import { create } from "zustand";

import { normalizeViewStoreSessionString } from "./scopeIdentity";

export type BrowserTreeMode = "vault" | "code";

export const BROWSER_TREE_EXPANDED_KEYS_CAP = 128;
export const BROWSER_TREE_KEY_MAX_CHARS = 2048;
export const BROWSER_TREE_ITEM_KEY_MAX_CHARS = 2048;

const EMPTY_EXPANDED_KEYS: readonly string[] = [];
const DEFAULT_BROWSER_TREE_KEY = "browser-tree:scope:null:vault";
const noopBrowserTreeWrite = () => undefined;

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

export function canWriteBrowserTreeExpansionScope(scope: unknown): boolean {
  return scope === null || normalizeBrowserTreeScope(scope) !== null;
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

/** The two always-present collapsible section rows of the Vault tree. */
export const VAULT_BROWSER_TREE_SECTION_KEYS = [
  "sec:features",
  "sec:documents",
] as const;

/**
 * Every collapsible folder key in the Vault tree, matching the keys the tree
 * actually toggles on (TreeBrowser): the two `sec:*` sections, the `feat:<feature>`
 * rows under Features, and the `type:<docType>` rows under Documents. The
 * "expand all" action sets the expanded set to exactly these; document rows are
 * leaves and are never expanded.
 */
export function deriveAllVaultBrowserTreeKeys(input: {
  features: readonly string[];
  docTypes: readonly string[];
}): string[] {
  return [
    ...VAULT_BROWSER_TREE_SECTION_KEYS,
    ...input.features.map((feature) => `feat:${feature}`),
    ...input.docTypes.map((docType) => `type:${docType}`),
  ];
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

export function deriveBrowserTreeKeyboardTarget(
  order: readonly string[],
  from: unknown,
  key: unknown,
): string | null {
  if (key !== "ArrowDown" && key !== "ArrowUp") return null;
  const current = normalizeBrowserTreeActiveKey(from);
  if (current === null || order.length === 0) return null;
  const at = order.indexOf(current);
  if (at === -1) return null;
  const delta = key === "ArrowDown" ? 1 : -1;
  return order[Math.min(order.length - 1, Math.max(0, at + delta))] ?? null;
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
  expandKeys: (key: unknown, ids: unknown) => void;
  collapseAll: (key: unknown) => void;
  setActiveKey: (key: unknown, id: unknown) => void;
  reset: () => void;
}

/** Bound and de-duplicate a candidate expanded-key set at the store boundary. */
function boundExpandedKeys(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const itemKey = normalizeBrowserTreeItemKey(id);
    if (itemKey === null || seen.has(itemKey)) continue;
    seen.add(itemKey);
    out.push(itemKey);
  }
  return out.length > BROWSER_TREE_EXPANDED_KEYS_CAP
    ? out.slice(out.length - BROWSER_TREE_EXPANDED_KEYS_CAP)
    : out;
}

export function normalizeBrowserTreeExpansionKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return key.length > 0 && key.length <= BROWSER_TREE_KEY_MAX_CHARS ? key : null;
}

export function normalizeBrowserTreeItemKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return key.length > 0 && key.length <= BROWSER_TREE_ITEM_KEY_MAX_CHARS ? key : null;
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
    expandKeys: (key, ids) =>
      set((state) => {
        const normalizedKey = normalizeBrowserTreeExpansionKey(key);
        if (normalizedKey === null) return state;
        const incoming = boundExpandedKeys(ids);
        const current = state.key === normalizedKey ? state.expandedKeys : [];
        const merged = boundExpandedKeys([...current, ...incoming]);
        return { key: normalizedKey, expandedKeys: merged };
      }),
    collapseAll: (key) =>
      set((state) => {
        const normalizedKey = normalizeBrowserTreeExpansionKey(key);
        if (normalizedKey === null) return state;
        if (state.key === normalizedKey && state.expandedKeys.length === 0) {
          return state;
        }
        return { key: normalizedKey, expandedKeys: [] };
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
  expandAll: (ids: unknown) => void;
  collapseAll: () => void;
  setActiveKey: (id: unknown) => void;
} {
  const key = useMemo(() => browserTreeExpansionKey(scope, mode), [scope, mode]);
  const canWrite = useMemo(() => canWriteBrowserTreeExpansionScope(scope), [scope]);
  const storeKey = useBrowserTreeExpansionStore((state) => state.key);
  const expandedKeys = useBrowserTreeExpansionStore((state) => state.expandedKeys);
  const storedActiveKey = useBrowserTreeExpansionStore((state) => state.activeKey);
  const setKey = useBrowserTreeExpansionStore((state) => state.setKey);
  const toggleStored = useBrowserTreeExpansionStore((state) => state.toggle);
  const expandKeysStored = useBrowserTreeExpansionStore((state) => state.expandKeys);
  const collapseAllStored = useBrowserTreeExpansionStore((state) => state.collapseAll);
  const setActiveKeyStored = useBrowserTreeExpansionStore(
    (state) => state.setActiveKey,
  );

  useEffect(() => {
    if (!canWrite) return;
    setKey(key);
  }, [canWrite, key, setKey]);

  const activeKeys = canWrite && storeKey === key ? expandedKeys : EMPTY_EXPANDED_KEYS;
  const activeKey = canWrite && storeKey === key ? storedActiveKey : null;
  const expanded = useMemo(() => new Set(activeKeys), [activeKeys]);
  const toggle = useMemo(
    () => (canWrite ? (id: unknown) => toggleStored(key, id) : noopBrowserTreeWrite),
    [canWrite, key, toggleStored],
  );
  const expandAll = useMemo(
    () =>
      canWrite ? (ids: unknown) => expandKeysStored(key, ids) : noopBrowserTreeWrite,
    [canWrite, key, expandKeysStored],
  );
  const collapseAll = useMemo(
    () => (canWrite ? () => collapseAllStored(key) : noopBrowserTreeWrite),
    [canWrite, key, collapseAllStored],
  );
  const setActiveKey = useMemo(
    () =>
      canWrite ? (id: unknown) => setActiveKeyStored(key, id) : noopBrowserTreeWrite,
    [canWrite, key, setActiveKeyStored],
  );

  return { expanded, activeKey, toggle, expandAll, collapseAll, setActiveKey };
}
