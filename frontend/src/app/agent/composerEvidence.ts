// The `@`-evidence rel-path autocomplete's pure half (agent-panel-shell-integration
// D3; plan P06.S21). Typing `@` opens a picker that rides the EXISTING search-
// provider seam — `useFilesVaultProvider` + `useFilesCodeProvider`, both already
// scoped to the bound workspace — and turns accepted hits into the existing mention
// chips. No new wire, no new provider, no second search implementation.
//
// Why paths at all: a mention today is a feature tag or a document stem, which the
// a2a context harness resolves through the vault. Evidence the user points at is
// often neither — a source file has only a repo-relative path. So the chip family
// gains a `path` kind whose value IS the rel path, and the prompt carries it as a
// structured reference the harness's context-ref discovery can pick up verbatim.
//
// Layer law: pure functions over already-read provider results. No fetch, no React,
// no raw `tiers` — the hosting component owns the provider hooks.

import type { SearchProviderEntry } from "../../stores/server/searchProviders";
import type { AgentMention } from "../../stores/view/agentComposer";

/** How many evidence rows the picker offers at once (bounded-by-default; the
 *  providers are already capped, this bounds the merge). */
export const AGENT_EVIDENCE_RESULTS_CAP = 24;

/** The rel path a search hit points at, or null when its node id carries none.
 *  `code:{path}` is a source file; `doc:{stem}` is a vault document, whose stem is
 *  its own stable rel-path-shaped identity. Anything else is not evidence. */
export function evidencePathFromNodeId(nodeId: string): string | null {
  if (nodeId.startsWith("code:")) {
    const path = nodeId.slice(5);
    return path.length > 0 ? path : null;
  }
  if (nodeId.startsWith("doc:")) {
    const stem = nodeId.slice(4);
    return stem.length > 0 ? stem : null;
  }
  return null;
}

/** The trailing filename of a rel path — the picker's primary line, so a deep path
 *  still reads at a glance. */
export function evidenceBasename(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? path : path.slice(cut + 1);
}

/** The parent directory of a rel path, or "" at the root — the picker's dimmed
 *  secondary line, which is what disambiguates two files of the same name. */
export function evidenceDirname(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? "" : path.slice(0, cut);
}

export interface EvidenceOption {
  /** The committed value: the rel path itself (also the mention chip's value, so
   *  the same path can never be attached twice). */
  value: string;
  primary: string;
  secondary?: string;
}

/**
 * Merge the two files providers' entries into the picker's bounded option list.
 *
 * The providers arrive already ranked within their own band, so this preserves the
 * order it is given and only dedupes by path — the vault provider runs first, so a
 * document that is also reachable as a file keeps its document identity. Anything
 * already attached as a chip is dropped, exactly as the corpus picker does, so the
 * cap can never be spent on rows that would be no-ops.
 */
export function evidenceOptions(
  providerEntries: readonly (readonly SearchProviderEntry[])[],
  attached: readonly AgentMention[],
  cap = AGENT_EVIDENCE_RESULTS_CAP,
): EvidenceOption[] {
  const taken = new Set(attached.map((mention) => mention.value));
  const seen = new Set<string>();
  const options: EvidenceOption[] = [];
  for (const entries of providerEntries) {
    for (const entry of entries) {
      if (options.length >= cap) return options;
      const nodeId = entry.result.node_id;
      const path = nodeId === null ? null : evidencePathFromNodeId(nodeId);
      if (path === null || seen.has(path) || taken.has(path)) continue;
      seen.add(path);
      const dir = evidenceDirname(path);
      options.push({
        value: path,
        primary: evidenceBasename(path),
        ...(dir.length > 0 ? { secondary: dir } : {}),
      });
    }
  }
  return options;
}

/** Turn an accepted rel path into the mention chip that carries it. The label is
 *  the basename (the chip is narrow); the VALUE is the full path, because that is
 *  what travels in the prompt and what dedupes the attachment. */
export function evidenceMention(path: string): AgentMention {
  return { kind: "path", value: path, label: evidenceBasename(path) };
}
