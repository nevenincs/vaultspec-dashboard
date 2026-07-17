// Vault browser: the primary feature-based tree representation of the vault
// corpus. The rail exposes only Vault and Code modes; the old standalone Tree
// mode is folded into this surface. This module preserves the public
// `VaultBrowser` and presentation-helper exports while delegating rendering to
// the shared feature → doc_type → document tree projection.

import type { VaultTreeEntry } from "../../stores/server/engine";
import {
  filterVaultTreeEntries,
  projectVaultTreeFeatureGroups,
  type VaultTreeFeatureGroup,
} from "../../stores/server/queries";
import { TreeBrowser, type TreeBrowserProps } from "./TreeBrowser";
import { pathStem } from "./browserSelection";
import {
  docMarkName as sharedDocMarkName,
  freshness as sharedFreshness,
  freshnessToneClass as sharedFreshnessToneClass,
  VAULT_GROUPS as SHARED_VAULT_GROUPS,
} from "./vaultRowPresentation";

// Re-exported so existing importers keep a stable surface while Vault mode now
// owns the feature tree.
export const VAULT_GROUPS = SHARED_VAULT_GROUPS;
export const docMarkName = sharedDocMarkName;
export const freshness = sharedFreshness;
export const freshnessToneClass = sharedFreshnessToneClass;
export { filterVaultTreeEntries as filterTreeEntries };
export { projectVaultTreeFeatureGroups as projectFeatureGroups };
export type { VaultTreeFeatureGroup as FeatureGroup };

/** Display stem — the shared derivation from the selection join. */
export function entryStem(path: string): string {
  return pathStem(path);
}

/**
 * Client-side narrowing of the ALREADY-FETCHED vault listing. Kept under the
 * VaultBrowser name because the in-rail filter still belongs to Vault mode.
 */
export function filterVaultEntries(
  entries: readonly VaultTreeEntry[],
  filter: string,
): VaultTreeEntry[] {
  return filterVaultTreeEntries(entries, filter);
}

export type VaultBrowserProps = Omit<TreeBrowserProps, "variant">;

export function VaultBrowser(props: VaultBrowserProps) {
  return <TreeBrowser {...props} variant="vault" />;
}
