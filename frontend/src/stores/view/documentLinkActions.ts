// The document copy-link verb (authoring-surface ADR D3). ONE shared action
// descriptor, enrolled UNCHANGED across the two planes it is eligible for under the
// one id `vault-doc:copy-link`: the vault-doc context-menu resolver (app) and the
// document-scoped command palette (stores). Because it must be consumed by BOTH the
// app-layer menu and the stores-layer palette provider, it lives in stores/view (app
// may depend on stores, never the reverse), and it dispatches the wire-free platform
// copy verb — it touches the clipboard, never the engine.
//
// The app has NO document URL/route scheme (documents open as tabs by node id, not by
// address), so the "deep link" it copies is the Obsidian-style wiki-link reference the
// vault already uses for cross-document links — `[[stem]]` — resolvable through the
// reader's `remarkWikiLink` navigation. A section anchor (`[[stem#slug]]`) is produced
// when a heading slug is supplied (a block-scoped invocation, D3); document-scoped
// invocations copy the bare `[[stem]]`.

import { Link } from "lucide-react";

import {
  legacyActionPresentation,
  type ActionDescriptor,
} from "../../platform/actions/action";
import { dispatchCopy } from "../../platform/actions/clipboardActions";

export const COPY_LINK_ACTION_ID = "vault-doc:copy-link";
export const COPY_LINK_LABEL = "Copy link";

/** The Obsidian-style wiki-link reference for a document stem, with an optional
 *  section anchor when a heading slug is supplied. */
export function documentWikiLink(stem: string, heading?: string | null): string {
  const trimmedStem = stem.trim();
  const trimmedHeading = typeof heading === "string" ? heading.trim() : "";
  const anchor = trimmedHeading.length > 0 ? `#${trimmedHeading}` : "";
  return `[[${trimmedStem}${anchor}]]`;
}

export interface CopyLinkOptions {
  /** The action id — the shared `vault-doc:copy-link` unless a surface re-scopes it. */
  id?: string;
  /** The document stem the link targets, or null when the source is not a document
   *  (renders disabled-with-reason). */
  stem: string | null;
  /** An optional heading slug — when present the copied link carries a section
   *  anchor (a block-scoped invocation); absent copies the bare document link. */
  heading?: string | null;
  label?: string;
}

/**
 * "Copy link": copy a navigable wiki-link reference to a document (with a section
 * anchor when block-invoked). A `run`-based descriptor so the ONE builder is valid on
 * BOTH the context menu and the command palette (the palette normalizer requires a
 * `run`, never a `dispatch`). Non-mutating navigation aid — no time-travel gate.
 * Disabled-with-reason when the source is not a document.
 */
export function copyLinkAction(opts: CopyLinkOptions): ActionDescriptor {
  const base = {
    id: opts.id ?? COPY_LINK_ACTION_ID,
    label: legacyActionPresentation(opts.label ?? COPY_LINK_LABEL),
    section: "copy" as const,
    icon: Link,
  };
  if (opts.stem === null) {
    return {
      ...base,
      disabled: true,
      disabledReason: legacyActionPresentation("not a document"),
    };
  }
  const text = documentWikiLink(opts.stem, opts.heading);
  return { ...base, run: () => void dispatchCopy({ text }) };
}
