// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessage } from "../../platform/localization/fallback";
import {
  DOCUMENT_VIEWER_MESSAGES,
  documentViewerDocumentTypeDescriptor,
  documentViewerStateDescriptor,
  documentViewerStatusDescriptor,
  documentViewerTruncationDescriptor,
} from "../../stores/server/documentViewerVocabulary";
import type { ContentView } from "../../stores/server/queries";
import { useViewStore } from "../../stores/view/viewStore";
import { MarkdownReader } from "./MarkdownReader";

const DOC = [
  "---",
  "tags:",
  "  - '#adr'",
  "  - '#review-rail-viewers'",
  "date: '2026-06-16'",
  "modified: '2026-06-17'",
  "status: accepted",
  "related:",
  "  - '[[2026-06-16-review-rail-viewers-plan]]'",
  "---",
  "",
  "# Authored heading",
  "",
  "Authored dek paragraph.",
  "",
  "Authored body linking to [[2026-06-16-other-doc|the other document]].",
  "",
  "- [x] finished step",
  "- [ ] pending step",
  "",
].join("\n");

function content(patch: Partial<ContentView> = {}): ContentView {
  return {
    loading: false,
    errored: false,
    notFound: false,
    degraded: false,
    degradedTiers: [],
    reasons: {},
    path: ".vault/adr/2026-06-16-x-adr.md",
    blobHash: "abc",
    languageHint: "markdown",
    text: DOC,
    truncated: null,
    available: true,
    ...patch,
  };
}

function renderReader(initial = content()) {
  const runtime = createTestLocalizationRuntime();
  const result = render(
    <I18nextProvider i18n={runtime}>
      <MarkdownReader content={initial} />
    </I18nextProvider>,
  );
  return { ...result, runtime };
}

afterEach(cleanup);
beforeEach(() => {
  useViewStore.setState({ openDocs: [], activeDocId: null });
});

describe("MarkdownReader localization", () => {
  it("updates the same document nodes in English, French, and Arabic", async () => {
    const { container, runtime } = renderReader();
    const title = screen.getByRole("heading", { name: "Authored heading", level: 1 });
    const type = screen.getByText(
      resolveMessage(runtime, documentViewerDocumentTypeDescriptor("adr")),
    );
    const tag = screen.getByText("#review-rail-viewers");
    const related = screen.getByRole("link", {
      name: "2026-06-16-review-rail-viewers-plan",
    });
    const meta = container.querySelector(".reader-meta.text-ink-muted");
    expect(meta?.textContent).toContain("2026");
    const englishMeta = meta?.textContent;

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(screen.getByRole("heading", { name: "Authored heading", level: 1 })).toBe(
      title,
    );
    expect(
      screen.getByText(
        resolveMessage(runtime, documentViewerDocumentTypeDescriptor("adr")),
      ),
    ).toBe(type);
    expect(screen.getByText("#review-rail-viewers")).toBe(tag);
    expect(
      screen.getByRole("link", {
        name: "2026-06-16-review-rail-viewers-plan",
      }),
    ).toBe(related);
    expect(meta?.textContent).not.toBe(englishMeta);

    const frenchMeta = meta?.textContent;
    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(meta?.textContent).not.toBe(frenchMeta);
    expect(meta?.textContent).toContain("يونيو");
    expect(document.body.textContent).toContain("Authored dek paragraph.");
    expect(document.body.textContent).toContain("Authored body linking to");
  });

  it("localizes code fence controls without changing authored code", async () => {
    const fenced = content({
      text: [
        "# Authored heading",
        "",
        "Authored dek.",
        "",
        "```sh",
        "const answer = 42;",
        "```",
      ].join("\n"),
    });
    const { runtime } = renderReader(fenced);
    const copy = screen.getByRole("button", {
      name: resolveMessage(runtime, DOCUMENT_VIEWER_MESSAGES.actions.copy),
    });
    const readOnly = screen.getByText(
      resolveMessage(runtime, DOCUMENT_VIEWER_MESSAGES.labels.readOnly),
    );
    const language = screen.getByText("Shell");

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("button", {
        name: resolveMessage(runtime, DOCUMENT_VIEWER_MESSAGES.actions.copy),
      }),
    ).toBe(copy);
    expect(
      screen.getByText(
        resolveMessage(runtime, DOCUMENT_VIEWER_MESSAGES.labels.readOnly),
      ),
    ).toBe(readOnly);
    expect(screen.getByText("Interpréteur de commandes")).toBe(language);
    expect(document.body.textContent).toContain("const answer = 42;");

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("button", {
        name: resolveMessage(runtime, DOCUMENT_VIEWER_MESSAGES.actions.copy),
      }),
    ).toBe(copy);
    expect(screen.getByText("واجهة الأوامر")).toBe(language);
    expect(document.body.textContent).toContain("const answer = 42;");
  });

  it("uses generic localized copy for an unknown fence without changing code", async () => {
    const hostile = "private_tokenizer_state";
    const authored = "const authored_bytes = 'unchanged';";
    const { runtime } = renderReader(
      content({
        text: ["# Authored heading", "", `\`\`\`${hostile}`, authored, "```"].join(
          "\n",
        ),
      }),
    );
    const language = screen.getByText("Text");
    expect(document.body.textContent).not.toContain(hostile);
    expect(document.body.textContent).toContain(authored);

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(screen.getByText("Texte")).toBe(language);
    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(screen.getByText("نص")).toBe(language);
    expect(document.body.textContent).not.toContain(hostile);
    expect(document.body.textContent).toContain(authored);
  });

  it("formats truncation numbers in place for every test locale", async () => {
    const truncated = content({
      truncated: {
        returned_bytes: 1_234,
        total_bytes: 5_678,
        reason: "private_limit_name",
      },
    });
    const { runtime } = renderReader(truncated);
    const notice = screen.getByText(
      resolveMessage(runtime, documentViewerTruncationDescriptor(1_234, 5_678)),
    );

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(notice.textContent).toBe(
      resolveMessage(runtime, documentViewerTruncationDescriptor(1_234, 5_678)),
    );

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(notice.textContent).toBe(
      resolveMessage(runtime, documentViewerTruncationDescriptor(1_234, 5_678)),
    );
    expect(document.body.textContent).not.toContain("private_limit_name");
  });

  it("shows safe copy for an unknown status and hides its raw value", () => {
    const hostile = content({ text: DOC.replace("accepted", "wire_private_status") });
    const { container, runtime } = renderReader(hostile);
    expect(container.querySelector(".reader-meta")?.textContent).toContain(
      resolveMessage(runtime, documentViewerStatusDescriptor(null)),
    );
    expect(document.body.textContent).not.toContain("wire_private_status");
  });

  it("renders every non-ready state without structural details", () => {
    const states = [
      content({ loading: true, available: false, text: "" }),
      content({ errored: true, available: false, text: "" }),
      content({
        degraded: true,
        available: false,
        text: "",
        reasons: { structural: "private_worktree_state" },
      }),
      content({ available: false, text: "" }),
      content({ notFound: true, available: false, text: "" }),
    ];
    const expected = ["loading", "errored", "degraded", "empty", "missing"] as const;
    for (const [index, state] of states.entries()) {
      const runtime = createTestLocalizationRuntime();
      const view = render(
        <I18nextProvider i18n={runtime}>
          <MarkdownReader content={state} />
        </I18nextProvider>,
      );
      expect(document.body.textContent).toContain(
        resolveMessage(runtime, documentViewerStateDescriptor(expected[index])!),
      );
      expect(document.body.textContent).not.toContain("private_worktree_state");
      view.unmount();
    }
  });

  it("preserves related and body navigation", () => {
    renderReader();
    fireEvent.click(
      screen.getByRole("link", {
        name: "2026-06-16-review-rail-viewers-plan",
      }),
    );
    expect(
      useViewStore
        .getState()
        .openDocs.some(
          (entry) => entry.nodeId === "doc:2026-06-16-review-rail-viewers-plan",
        ),
    ).toBe(true);
    fireEvent.click(screen.getByRole("link", { name: "the other document" }));
    const open = useViewStore.getState().openDocs;
    expect(open.some((entry) => entry.nodeId === "doc:2026-06-16-other-doc")).toBe(
      true,
    );
  });

  it("keeps task markers and removes unsafe link targets", () => {
    const unsafe = content({
      text: DOC.replace(
        "Authored body linking to [[2026-06-16-other-doc|the other document]].",
        "Authored body with [unsafe](javascript:alert(document.cookie)) and [safe](https://example.com).",
      ),
    });
    const { container } = renderReader(unsafe);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(container.querySelectorAll("[data-step-check]")).toHaveLength(2);
    expect(
      screen.getByText("unsafe").closest("a")?.getAttribute("href") ?? "",
    ).not.toMatch(/^javascript:/i);
    expect(screen.getByText("safe").closest("a")?.getAttribute("href")).toBe(
      "https://example.com",
    );
  });
});
