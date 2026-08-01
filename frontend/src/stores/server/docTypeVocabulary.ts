// Canonical localized presentation for supported vault document types. Unknown
// wire values are rejected instead of being converted into user-facing copy.

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

type DocumentTypeDetailLabelKey =
  `documents:createDialog.documentTypes.${VaultDocumentType}`;

export interface DocumentTypePresentation<
  Id extends VaultDocumentType = VaultDocumentType,
  LabelKey extends DocumentTypeLabelKey = DocumentTypeLabelKey,
  DetailLabelKey extends DocumentTypeDetailLabelKey = DocumentTypeDetailLabelKey,
> {
  readonly id: Id;
  readonly label: MessageDescriptor<LabelKey>;
  readonly detailLabel: MessageDescriptor<DetailLabelKey>;
}

type DocumentTypePresentationMap = Readonly<{
  [Id in VaultDocumentType]: DocumentTypePresentation<
    Id,
    `documents:documentTypes.${Id}`,
    `documents:createDialog.documentTypes.${Id}`
  >;
}>;

const descriptor = <Key extends DocumentTypeLabelKey | DocumentTypeDetailLabelKey>(
  key: Key,
): MessageDescriptor<Key> => Object.freeze({ key });

/** Exhaustive localized presentation for the six displayable raw identities. */
export const DOC_TYPE_PRESENTATION = Object.freeze({
  research: Object.freeze({
    id: "research",
    label: descriptor("documents:documentTypes.research"),
    detailLabel: descriptor("documents:createDialog.documentTypes.research"),
  }),
  adr: Object.freeze({
    id: "adr",
    label: descriptor("documents:documentTypes.adr"),
    detailLabel: descriptor("documents:createDialog.documentTypes.adr"),
  }),
  plan: Object.freeze({
    id: "plan",
    label: descriptor("documents:documentTypes.plan"),
    detailLabel: descriptor("documents:createDialog.documentTypes.plan"),
  }),
  exec: Object.freeze({
    id: "exec",
    label: descriptor("documents:documentTypes.exec"),
    detailLabel: descriptor("documents:createDialog.documentTypes.exec"),
  }),
  audit: Object.freeze({
    id: "audit",
    label: descriptor("documents:documentTypes.audit"),
    detailLabel: descriptor("documents:createDialog.documentTypes.audit"),
  }),
  reference: Object.freeze({
    id: "reference",
    label: descriptor("documents:documentTypes.reference"),
    detailLabel: descriptor("documents:createDialog.documentTypes.reference"),
  }),
} as const satisfies DocumentTypePresentationMap);

/** Generic copy stays separate from the six canonical document-type labels. */
export const DOCUMENT_TYPE_MESSAGES = Object.freeze({
  document: Object.freeze({
    key: "documents:labels.document",
  } satisfies MessageDescriptor<"documents:labels.document">),
});

/** The canonical pipeline display order. Index documents are not displayed. */
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
 * @deprecated Use docTypePresentation with localized message resolution.
 */
export function docTypeLabel(docType: string): string {
  const presentation = docTypePresentation(docType);
  return presentation === null
    ? sourceDocuments.labels.document
    : sourceDocuments.documentTypes[presentation.id];
}
