import {
  createCountMessageDescriptor,
  type CountMessageDescriptor,
  type MessageDescriptor,
  type PluralMessageKey,
} from "../../platform/localization/message";
import { docTypePresentation } from "./docTypeVocabulary";

const descriptor = <Key extends MessageDescriptor["key"]>(
  key: Key,
): MessageDescriptor<Key> => Object.freeze({ key });

export type DocumentViewerState =
  | "loading"
  | "errored"
  | "degraded"
  | "empty"
  | "missing"
  | "ready";

export type DocumentViewerDateKind = "created" | "updated";

export type DocumentViewerStatus =
  | "accepted"
  | "active"
  | "complete"
  | "deprecated"
  | "proposed"
  | "rejected"
  | "superseded";

export const DOCUMENT_VIEWER_MESSAGES = Object.freeze({
  accessibility: Object.freeze({
    document: descriptor("documents:viewer.reader.accessibility.document"),
  }),
  actions: Object.freeze({
    copy: descriptor("common:actions.copy"),
  }),
  errors: Object.freeze({
    loadFailed: descriptor("documents:viewer.reader.errors.loadFailed"),
    temporarilyUnavailable: descriptor(
      "documents:viewer.reader.errors.temporarilyUnavailable",
    ),
  }),
  labels: Object.freeze({
    created: descriptor("documents:viewer.reader.labels.created"),
    document: descriptor("documents:viewer.reader.labels.document"),
    readOnly: descriptor("documents:viewer.reader.labels.readOnly"),
    relatedDocuments: descriptor("documents:viewer.reader.labels.relatedDocuments"),
    tags: descriptor("documents:viewer.reader.labels.tags"),
    updated: descriptor("documents:viewer.reader.labels.updated"),
  }),
  states: Object.freeze({
    empty: descriptor("documents:viewer.reader.states.empty"),
    loading: descriptor("documents:viewer.reader.states.loading"),
    missing: descriptor("documents:viewer.reader.states.missing"),
  }),
  statusUnavailable: descriptor("documents:viewer.reader.statuses.unavailable"),
});

export const CODE_VIEWER_MESSAGES = Object.freeze({
  accessibility: Object.freeze({
    contents: descriptor("documents:viewer.codeViewer.accessibility.contents"),
  }),
  actions: Object.freeze({
    copy: DOCUMENT_VIEWER_MESSAGES.actions.copy,
  }),
  errors: Object.freeze({
    loadFailed: descriptor("documents:viewer.codeViewer.errors.loadFailed"),
    temporarilyUnavailable: descriptor(
      "documents:viewer.codeViewer.errors.temporarilyUnavailable",
    ),
  }),
  labels: Object.freeze({
    code: descriptor("documents:viewer.codeViewer.labels.code"),
    readOnly: descriptor("documents:viewer.codeViewer.labels.readOnly"),
  }),
  states: Object.freeze({
    empty: descriptor("documents:viewer.codeViewer.states.empty"),
    loading: descriptor("documents:viewer.codeViewer.states.loading"),
    missing: descriptor("documents:viewer.codeViewer.states.missing"),
  }),
});

export const CODE_VIEWER_STATE_MESSAGES = Object.freeze({
  loading: CODE_VIEWER_MESSAGES.states.loading,
  errored: CODE_VIEWER_MESSAGES.errors.loadFailed,
  degraded: CODE_VIEWER_MESSAGES.errors.temporarilyUnavailable,
  empty: CODE_VIEWER_MESSAGES.states.empty,
  missing: CODE_VIEWER_MESSAGES.states.missing,
  ready: null,
} as const satisfies Readonly<Record<DocumentViewerState, MessageDescriptor | null>>);

export function codeViewerStateDescriptor(value: unknown): MessageDescriptor | null {
  return typeof value === "string" && Object.hasOwn(CODE_VIEWER_STATE_MESSAGES, value)
    ? CODE_VIEWER_STATE_MESSAGES[value as DocumentViewerState]
    : CODE_VIEWER_MESSAGES.errors.loadFailed;
}

export function codeViewerFooterDescriptor(
  count: unknown,
  language: unknown,
  encoding: unknown,
): CountMessageDescriptor | null {
  if (
    typeof count !== "number" ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    typeof language !== "string" ||
    language.trim().length === 0 ||
    typeof encoding !== "string" ||
    encoding.trim().length === 0
  ) {
    return null;
  }
  return createCountMessageDescriptor(
    "documents:viewer.codeViewer.footer.summary",
    count,
    { language, encoding },
  );
}

export const DOCUMENT_VIEWER_STATE_MESSAGES = Object.freeze({
  loading: DOCUMENT_VIEWER_MESSAGES.states.loading,
  errored: DOCUMENT_VIEWER_MESSAGES.errors.loadFailed,
  degraded: DOCUMENT_VIEWER_MESSAGES.errors.temporarilyUnavailable,
  empty: DOCUMENT_VIEWER_MESSAGES.states.empty,
  missing: DOCUMENT_VIEWER_MESSAGES.states.missing,
  ready: null,
} as const satisfies Readonly<Record<DocumentViewerState, MessageDescriptor | null>>);

export const DOCUMENT_VIEWER_DATE_MESSAGES = Object.freeze({
  created: DOCUMENT_VIEWER_MESSAGES.labels.created,
  updated: DOCUMENT_VIEWER_MESSAGES.labels.updated,
} as const satisfies Readonly<Record<DocumentViewerDateKind, MessageDescriptor>>);

export const DOCUMENT_VIEWER_STATUS_MESSAGES = Object.freeze({
  accepted: descriptor("documents:viewer.reader.statuses.accepted"),
  active: descriptor("documents:viewer.reader.statuses.active"),
  complete: descriptor("documents:viewer.reader.statuses.complete"),
  deprecated: descriptor("documents:viewer.reader.statuses.deprecated"),
  proposed: descriptor("documents:viewer.reader.statuses.proposed"),
  rejected: descriptor("documents:viewer.reader.statuses.rejected"),
  superseded: descriptor("documents:viewer.reader.statuses.superseded"),
} as const satisfies Readonly<Record<DocumentViewerStatus, MessageDescriptor>>);

export function documentViewerStateDescriptor(
  value: unknown,
): MessageDescriptor | null {
  if (
    typeof value === "string" &&
    Object.hasOwn(DOCUMENT_VIEWER_STATE_MESSAGES, value)
  ) {
    return DOCUMENT_VIEWER_STATE_MESSAGES[value as DocumentViewerState];
  }
  return DOCUMENT_VIEWER_MESSAGES.errors.loadFailed;
}

export function documentViewerDateDescriptor(value: unknown): MessageDescriptor | null {
  return typeof value === "string" &&
    Object.hasOwn(DOCUMENT_VIEWER_DATE_MESSAGES, value)
    ? DOCUMENT_VIEWER_DATE_MESSAGES[value as DocumentViewerDateKind]
    : null;
}

export function documentViewerStatusDescriptor(value: unknown): MessageDescriptor {
  return typeof value === "string" &&
    Object.hasOwn(DOCUMENT_VIEWER_STATUS_MESSAGES, value)
    ? DOCUMENT_VIEWER_STATUS_MESSAGES[value as DocumentViewerStatus]
    : DOCUMENT_VIEWER_MESSAGES.statusUnavailable;
}

export function documentViewerDocumentTypeDescriptor(
  value: unknown,
): MessageDescriptor {
  return (
    docTypePresentation(value)?.detailLabel ?? DOCUMENT_VIEWER_MESSAGES.labels.document
  );
}

type DocumentViewerMetadataKey = Extract<
  PluralMessageKey,
  `documents:viewer.reader.metadata.${string}`
>;

const DOCUMENT_VIEWER_METADATA_KEYS = Object.freeze({
  readTime: "documents:viewer.reader.metadata.readTime",
  readTimeStatus: "documents:viewer.reader.metadata.readTimeStatus",
  createdReadTime: "documents:viewer.reader.metadata.createdReadTime",
  createdReadTimeStatus: "documents:viewer.reader.metadata.createdReadTimeStatus",
  updatedReadTime: "documents:viewer.reader.metadata.updatedReadTime",
  updatedReadTimeStatus: "documents:viewer.reader.metadata.updatedReadTimeStatus",
  createdUpdatedReadTime: "documents:viewer.reader.metadata.createdUpdatedReadTime",
  createdUpdatedReadTimeStatus:
    "documents:viewer.reader.metadata.createdUpdatedReadTimeStatus",
} as const satisfies Readonly<Record<string, DocumentViewerMetadataKey>>);

export interface DocumentViewerMetadataInput {
  readonly created?: string | null;
  readonly updated?: string | null;
  readonly minutes: number;
  readonly status?: string | null;
}

function presentedValue(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function documentViewerReadTimeDescriptor(
  minutes: unknown,
): CountMessageDescriptor | null {
  return typeof minutes === "number" && Number.isSafeInteger(minutes) && minutes > 0
    ? createCountMessageDescriptor("documents:viewer.reader.metadata.readTime", minutes)
    : null;
}

export function documentViewerMetadataDescriptor(
  input: DocumentViewerMetadataInput,
): CountMessageDescriptor | null {
  if (!Number.isSafeInteger(input.minutes) || input.minutes <= 0) return null;

  const created = presentedValue(input.created);
  const updated = presentedValue(input.updated);
  const status = presentedValue(input.status);
  const values: Record<string, string> = {};
  if (created !== null) values.created = created;
  if (updated !== null) values.updated = updated;
  if (status !== null) values.status = status;

  let key: DocumentViewerMetadataKey;
  if (created !== null && updated !== null) {
    key =
      status === null
        ? DOCUMENT_VIEWER_METADATA_KEYS.createdUpdatedReadTime
        : DOCUMENT_VIEWER_METADATA_KEYS.createdUpdatedReadTimeStatus;
  } else if (created !== null) {
    key =
      status === null
        ? DOCUMENT_VIEWER_METADATA_KEYS.createdReadTime
        : DOCUMENT_VIEWER_METADATA_KEYS.createdReadTimeStatus;
  } else if (updated !== null) {
    key =
      status === null
        ? DOCUMENT_VIEWER_METADATA_KEYS.updatedReadTime
        : DOCUMENT_VIEWER_METADATA_KEYS.updatedReadTimeStatus;
  } else {
    key =
      status === null
        ? DOCUMENT_VIEWER_METADATA_KEYS.readTime
        : DOCUMENT_VIEWER_METADATA_KEYS.readTimeStatus;
  }

  return createCountMessageDescriptor(key, input.minutes, values);
}

export function documentViewerTruncationDescriptor(
  returned: unknown,
  total: unknown,
): CountMessageDescriptor | null {
  if (
    typeof returned !== "number" ||
    !Number.isSafeInteger(returned) ||
    returned < 0 ||
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total <= 0 ||
    returned > total
  ) {
    return null;
  }
  return createCountMessageDescriptor(
    "documents:viewer.reader.truncation.bytes",
    total,
    { returned },
  );
}
