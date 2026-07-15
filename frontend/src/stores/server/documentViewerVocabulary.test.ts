import { describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import {
  CODE_VIEWER_MESSAGES,
  CODE_VIEWER_STATE_MESSAGES,
  codeViewerFooterDescriptor,
  codeViewerStateDescriptor,
  DOCUMENT_VIEWER_DATE_MESSAGES,
  DOCUMENT_VIEWER_MESSAGES,
  DOCUMENT_VIEWER_STATE_MESSAGES,
  DOCUMENT_VIEWER_STATUS_MESSAGES,
  documentViewerDateDescriptor,
  documentViewerDocumentTypeDescriptor,
  documentViewerMetadataDescriptor,
  documentViewerReadTimeDescriptor,
  documentViewerStateDescriptor,
  documentViewerStatusDescriptor,
  documentViewerTruncationDescriptor,
} from "./documentViewerVocabulary";

const runtimes = () => [
  createTestLocalizationRuntime(),
  createTestLocalizationRuntime(ltrTestLocale),
  createTestLocalizationRuntime(rtlTestLocale),
];

describe("document viewer vocabulary", () => {
  it("keeps every semantic map and descriptor frozen", () => {
    for (const map of [
      DOCUMENT_VIEWER_MESSAGES,
      DOCUMENT_VIEWER_DATE_MESSAGES,
      DOCUMENT_VIEWER_STATE_MESSAGES,
      DOCUMENT_VIEWER_STATUS_MESSAGES,
    ]) {
      expect(Object.isFrozen(map)).toBe(true);
    }
    for (const descriptor of Object.values(DOCUMENT_VIEWER_STATUS_MESSAGES)) {
      expect(Object.isFrozen(descriptor)).toBe(true);
    }
  });

  it("maps semantic states without exposing unknown values", () => {
    expect(Object.keys(DOCUMENT_VIEWER_STATE_MESSAGES)).toEqual([
      "loading",
      "errored",
      "degraded",
      "empty",
      "missing",
      "ready",
    ]);
    expect(documentViewerStateDescriptor("ready")).toBeNull();
    expect(documentViewerStateDescriptor("private_state")).toBe(
      DOCUMENT_VIEWER_MESSAGES.errors.loadFailed,
    );
    expect(
      runtimes().map((runtime) =>
        resolveMessageResult(runtime, documentViewerStateDescriptor("missing")!),
      ),
    ).toEqual([
      {
        message: "This document is not available here. Choose another document.",
        usedFallback: false,
      },
      {
        message: "Ce document n’est pas disponible ici. Choisissez un autre document.",
        usedFallback: false,
      },
      {
        message: "هذا المستند غير متاح هنا. اختر مستندًا آخر.",
        usedFallback: false,
      },
    ]);
  });

  it("maps known dates and statuses and fails closed for unknown values", () => {
    expect(documentViewerDateDescriptor("created")).toBe(
      DOCUMENT_VIEWER_DATE_MESSAGES.created,
    );
    expect(documentViewerDateDescriptor("modified")).toBeNull();
    expect(Object.keys(DOCUMENT_VIEWER_STATUS_MESSAGES)).toEqual([
      "accepted",
      "active",
      "complete",
      "deprecated",
      "proposed",
      "rejected",
      "superseded",
    ]);
    expect(documentViewerStatusDescriptor("accepted")).toBe(
      DOCUMENT_VIEWER_STATUS_MESSAGES.accepted,
    );
    expect(documentViewerStatusDescriptor(" accepted ")).toBe(
      DOCUMENT_VIEWER_MESSAGES.statusUnavailable,
    );
    expect(documentViewerStatusDescriptor("private_status")).toBe(
      DOCUMENT_VIEWER_MESSAGES.statusUnavailable,
    );
    expect(
      runtimes().map(
        (runtime) =>
          resolveMessageResult(runtime, documentViewerStatusDescriptor("unknown"))
            .message,
      ),
    ).toEqual(["Status unavailable", "État indisponible", "الحالة غير متاحة"]);
  });

  it("reuses canonical document-type detail labels and hides unknown tokens", () => {
    expect(
      runtimes().map(
        (runtime) =>
          resolveMessageResult(runtime, documentViewerDocumentTypeDescriptor("adr"))
            .message,
      ),
    ).toEqual(["Decision record", "Compte rendu de décision", "سجل قرار"]);
    expect(
      runtimes().map(
        (runtime) =>
          resolveMessageResult(
            runtime,
            documentViewerDocumentTypeDescriptor("private_type"),
          ).message,
      ),
    ).toEqual(["Document", "Document", "مستند"]);
  });

  it("resolves reading time and bounded truncation through every locale", () => {
    const readingTime = documentViewerReadTimeDescriptor(2);
    const truncation = documentViewerTruncationDescriptor(1, 2);
    expect(readingTime).not.toBeNull();
    expect(truncation).not.toBeNull();
    expect(
      runtimes().map((runtime) => resolveMessageResult(runtime, readingTime!).message),
    ).toEqual(["2 min read", "Lecture : 2 min", "وقت القراءة بالدقائق: 2"]);
    expect(
      runtimes().map((runtime) => resolveMessageResult(runtime, truncation!).message),
    ).toEqual([
      "Showing the first 1 of 2 bytes. Open the file for the full document.",
      "Affichage des 1 premiers octets sur 2. Ouvrez le fichier pour voir le document complet.",
      "يظهر أول 1 من أصل 2 بايتين. افتح الملف لعرض المستند كاملًا.",
    ]);
    expect(documentViewerReadTimeDescriptor(0)).toBeNull();
    expect(documentViewerReadTimeDescriptor(1.5)).toBeNull();
    expect(documentViewerTruncationDescriptor(-1, 2)).toBeNull();
    expect(documentViewerTruncationDescriptor(3, 2)).toBeNull();
  });

  it("selects one complete metadata message for all reachable combinations", () => {
    const cases = [
      [{ minutes: 2 }, "documents:viewer.reader.metadata.readTime"],
      [
        { minutes: 2, status: "Accepted" },
        "documents:viewer.reader.metadata.readTimeStatus",
      ],
      [
        { minutes: 2, created: "15 July 2026" },
        "documents:viewer.reader.metadata.createdReadTime",
      ],
      [
        { minutes: 2, created: "15 July 2026", status: "Accepted" },
        "documents:viewer.reader.metadata.createdReadTimeStatus",
      ],
      [
        { minutes: 2, updated: "16 July 2026" },
        "documents:viewer.reader.metadata.updatedReadTime",
      ],
      [
        { minutes: 2, updated: "16 July 2026", status: "Accepted" },
        "documents:viewer.reader.metadata.updatedReadTimeStatus",
      ],
      [
        { minutes: 2, created: "15 July 2026", updated: "16 July 2026" },
        "documents:viewer.reader.metadata.createdUpdatedReadTime",
      ],
      [
        {
          minutes: 2,
          created: "15 July 2026",
          updated: "16 July 2026",
          status: "Accepted",
        },
        "documents:viewer.reader.metadata.createdUpdatedReadTimeStatus",
      ],
    ] as const;

    for (const [input, key] of cases) {
      const descriptor = documentViewerMetadataDescriptor(input);
      expect(descriptor?.key).toBe(key);
      for (const runtime of runtimes()) {
        const result = resolveMessageResult(runtime, descriptor!);
        expect(result.usedFallback).toBe(false);
        expect(result.message).not.toMatch(/\{\{|\}\}/u);
      }
    }
    expect(documentViewerMetadataDescriptor({ minutes: 0 })).toBeNull();
    expect(documentViewerMetadataDescriptor({ minutes: 2, created: "   " })?.key).toBe(
      "documents:viewer.reader.metadata.readTime",
    );
  });
});

describe("code viewer vocabulary", () => {
  it("resolves closed states and complete footer counts in every locale", () => {
    expect(codeViewerStateDescriptor("loading")).toBe(
      CODE_VIEWER_STATE_MESSAGES.loading,
    );
    expect(codeViewerStateDescriptor("private")).toBe(
      CODE_VIEWER_MESSAGES.errors.loadFailed,
    );
    for (const count of [0, 1, 2]) {
      const footer = codeViewerFooterDescriptor(count, "Rust", "UTF-8");
      expect(footer).not.toBeNull();
      for (const runtime of runtimes()) {
        const result = resolveMessageResult(runtime, footer!);
        expect(result.usedFallback).toBe(false);
        expect(result.message).toContain("Rust");
        expect(result.message).toContain("UTF-8");
        expect(result.message).not.toMatch(/\{\{|\}\}/u);
      }
    }
  });

  it("rejects malformed footer data", () => {
    expect(codeViewerFooterDescriptor(-1, "Rust", "UTF-8")).toBeNull();
    expect(codeViewerFooterDescriptor(1, "", "UTF-8")).toBeNull();
    expect(codeViewerFooterDescriptor(1, "Rust", "")).toBeNull();
  });
});
