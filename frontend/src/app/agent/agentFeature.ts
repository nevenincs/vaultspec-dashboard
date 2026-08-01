// The composer's FEATURE binding (plan S44; the owner's cornerstone mandate).
//
// A feature is the cornerstone binding of the document-authoring lanes: it is what
// the produced documents are filed under AND what sets the agents' grounding
// context. So for a document-authoring preset it is not an optional mention among
// others — it is a standing, first-class binding that must be settled BEFORE the
// run starts, and it rides `run-start` as `feature_tag`.
//
// Which presets require it is SERVED, not guessed: `presets-list` carries
// `authoring_capability` on every preset (`document_authoring` for the ADR-research
// lanes, `coding` for the doc-editor and solo-coder lanes). Before S44 the frontend
// adapted that field and then never read it, so every document-authoring start was
// refused by the sibling with "requires a target feature tag" — the fourth time in
// this campaign that a presumed wire gap was a CONSUMPTION gap.
//
// The default comes from the OPEN DOCUMENT, because that is the binding the user has
// already expressed by opening it. It is a default, never a lock: the chip is a
// picker over the same feature vocabulary the rest of the app uses.

import type { EditorCorpusDocument } from "../../stores/server/queries";
import { stemFromDocNodeId } from "../../stores/server/liveAdapters";
import type { TeamPreset } from "../../stores/server/agent/a2aTeam";

/** The SERVED capability literal that marks a document-authoring lane. */
export const DOCUMENT_AUTHORING_CAPABILITY = "document_authoring";

/** Does this preset's run-start require a target feature tag? Read from the served
 *  `authoring_capability` alone — never from the preset id, which would make the
 *  client the authority on a fact the sibling already states. An absent capability
 *  (an older/sparse body) does NOT require one: the sibling stays the enforcer, so
 *  failing open here surfaces its refusal rather than blocking a startable run. */
export function presetRequiresFeatureTag(preset: TeamPreset | null): boolean {
  return preset?.authoring_capability === DOCUMENT_AUTHORING_CAPABILITY;
}

/** The feature the OPEN document is filed under, or null when no document is open,
 *  the active tab is not a vault document, or the document carries no feature. */
export function featureFromOpenDocument(
  activeDocId: string | null,
  documents: readonly EditorCorpusDocument[],
): string | null {
  const stem = stemFromDocNodeId(activeDocId);
  if (stem === null) return null;
  const feature = documents.find((doc) => doc.stem === stem)?.feature ?? null;
  return feature !== null && feature.length > 0 ? feature : null;
}

/** Where a bound feature came from — the chip says so, so a defaulted binding is
 *  never mistaken for one the user chose. */
export type FeatureBindingSource = "chosen" | "document" | "none";

export interface FeatureBinding {
  /** The tag that will ride `run-start` as `feature_tag`, or null when unbound. */
  readonly tag: string | null;
  readonly source: FeatureBindingSource;
}

/** Settle the composer's feature binding: an explicit choice wins, else the open
 *  document's feature, else nothing. An explicit choice is honoured even when it is
 *  outside the served vocabulary — the vocabulary is derived from documents that
 *  EXIST, and a run may legitimately open a brand-new feature. */
export function resolveFeatureBinding({
  chosen,
  activeDocId,
  documents,
}: {
  chosen: string | null;
  activeDocId: string | null;
  documents: readonly EditorCorpusDocument[];
}): FeatureBinding {
  if (chosen !== null && chosen.length > 0) return { tag: chosen, source: "chosen" };
  const fromDocument = featureFromOpenDocument(activeDocId, documents);
  if (fromDocument !== null) return { tag: fromDocument, source: "document" };
  return { tag: null, source: "none" };
}

/** Is the run unstartable for want of a feature? True only when the SERVED
 *  capability requires one and none is bound — so a coding preset is never gated,
 *  and a document-authoring preset never starts into a refusal we could foresee. */
export function featureStartBlocked(
  preset: TeamPreset | null,
  binding: FeatureBinding,
): boolean {
  return presetRequiresFeatureTag(preset) && binding.tag === null;
}
