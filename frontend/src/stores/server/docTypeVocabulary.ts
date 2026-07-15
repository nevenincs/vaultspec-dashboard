// The ONE canonical vault doc-type vocabulary (terminology-standardization ADR
// D1/D2). Raw wire identities remain separate from localized presentation.
//
// Layer law (dashboard-layer-ownership): this lives in `stores/server` so BOTH the
// stores layer and the app layer can import it without the app→stores→engine
// boundary ever being crossed backwards (stores must NOT import app). It is pure
// data + pure functions: no wire access, no node identity, no raw `tiers` read.
//
// `index`, `code`, `summary`, and arbitrary wire values are deliberately absent from
// the displayed schema. Presentation lookups reject them instead of deriving copy
// from raw data.

import { documents as sourceDocuments } from "../../locales/en/documents";
import type { MessageDescriptor } from "../../platform/localization/message";

export type VaultDocumentType =
  | "research"
  | "adr"
  | "plan"
  | "exec"
  | "audit"
  | "reference";

type DocumentTypeLabelKey =
  | "documents:documentTypes.research"
  | "documents:documentTypes.adr"
  | "documents:documentTypes.plan"
  | "documents:documentTypes.exec"
  | "documents:documentTypes.audit"
  | "documents:documentTypes.reference";

export interface DocumentTypePresentation<
  Id extends VaultDocumentType = VaultDocumentType,
  LabelKey extends DocumentTypeLabelKey = DocumentTypeLabelKey,
> {
  readonly id: Id;
  readonly label: MessageDescriptor<LabelKey>;
}

type DocumentTypePresentationMap = Readonly<{
  [Id in VaultDocumentType]: DocumentTypePresentation<
    Id,
    `documents:documentTypes.${Id}`
  >;
}>;

const descriptor = <Key extends DocumentTypeLabelKey>(
  key: Key,
): MessageDescriptor<Key> => Object.freeze({ key });

/** Exhaustive localized presentation for the six displayable raw identities. */
export const DOC_TYPE_PRESENTATION = Object.freeze({
  research: Object.freeze({
    id: "research",
    label: descriptor("documents:documentTypes.research"),
  }),
  adr: Object.freeze({
    id: "adr",
    label: descriptor("documents:documentTypes.adr"),
  }),
  plan: Object.freeze({
    id: "plan",
    label: descriptor("documents:documentTypes.plan"),
  }),
  exec: Object.freeze({
    id: "exec",
    label: descriptor("documents:documentTypes.exec"),
  }),
  audit: Object.freeze({
    id: "audit",
    label: descriptor("documents:documentTypes.audit"),
  }),
  reference: Object.freeze({
    id: "reference",
    label: descriptor("documents:documentTypes.reference"),
  }),
} as const satisfies DocumentTypePresentationMap);

/** Generic copy stays separate from the six canonical document-type labels. */
export const DOCUMENT_TYPE_MESSAGES = Object.freeze({
  document: Object.freeze({
    key: "documents:labels.document",
  } satisfies MessageDescriptor<"documents:labels.document">),
});

/** The canonical pipeline display order (ADR D2): research → decisions → plans →
 *  steps → audits → references, the workflow's natural reading order. `index` is
 *  excluded — it is never a displayed group. */
export const DOC_TYPE_ORDER = Object.freeze([
  "research",
  "adr",
  "plan",
  "exec",
  "audit",
  "reference",
] as const) satisfies readonly VaultDocumentType[];

/** Resolve presentation only for an exact displayable raw identity. */
export function docTypePresentation(value: unknown): DocumentTypePresentation | null {
  return value === "research" ||
    value === "adr" ||
    value === "plan" ||
    value === "exec" ||
    value === "audit" ||
    value === "reference"
    ? DOC_TYPE_PRESENTATION[value]
    : null;
}

/**
 * @deprecated Temporary source-locale bridge for consumers awaiting descriptor
 * migration. It never derives or exposes copy from an unknown raw value.
 */
export function docTypeLabel(docType: string): string {
  const presentation = docTypePresentation(docType);
  return presentation === null
    ? sourceDocuments.labels.document
    : sourceDocuments.documentTypes[presentation.id];
}
