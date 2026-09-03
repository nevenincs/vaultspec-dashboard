// @vitest-environment happy-dom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessage } from "../../platform/localization/fallback";
import {
  CODE_VIEWER_MESSAGES,
  codeViewerFooterDescriptor,
  codeViewerStateDescriptor,
  documentViewerTruncationDescriptor,
} from "../../stores/server/documentViewerVocabulary";
import type { ContentView } from "../../stores/server/queries";
import type { LineChange } from "../authoring/editorChanges";
import { CodeViewer } from "./CodeViewer";
import { languageDisplayDescriptor } from "./languages";

function available(text: string, patch: Partial<ContentView> = {}): ContentView {
  return {
    loading: false,
    errored: false,
    notFound: false,
    degraded: false,
    degradedTiers: [],
    reasons: {},
    path: "src/auth/mod.rs",
    blobHash: "abc",
    languageHint: "rust",
    text,
    truncated: null,
    available: true,
    ...patch,
  };
}

function renderViewer(content: ContentView, changes?: LineChange[]) {
  const runtime = createTestLocalizationRuntime();
  const result = render(
    <I18nextProvider i18n={runtime}>
      <CodeViewer content={content} changes={changes} />
    </I18nextProvider>,
  );
  return { ...result, runtime };
}

afterEach(cleanup);

describe("CodeViewer", () => {
  it("updates mounted header, footer, action, and accessibility nodes in every locale", async () => {
    const { container, runtime } = renderViewer(
      available("printf 'hello'\n", { languageHint: "sh" }),
    );
    const header = container.querySelector("header")!;
    const footer = container.querySelector("footer")!;
    const path = within(header).getByText("mod.rs");
    const readOnly = within(header).getByText(
      resolveMessage(runtime, CODE_VIEWER_MESSAGES.labels.readOnly),
    );
    const copy = within(header).getByRole("button", {
      name: resolveMessage(runtime, CODE_VIEWER_MESSAGES.actions.copy),
    });
    const contents = screen.getByRole("region", {
      name: resolveMessage(runtime, CODE_VIEWER_MESSAGES.accessibility.contents),
    });
    expect(footer.textContent).toBe(
      resolveMessage(runtime, codeViewerFooterDescriptor(1, "Shell", "UTF-8")),
    );

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(within(header).getByText("mod.rs")).toBe(path);
    expect(
      within(header).getByText(
        resolveMessage(runtime, CODE_VIEWER_MESSAGES.labels.readOnly),
      ),
    ).toBe(readOnly);
    expect(
      within(header).getByRole("button", {
        name: resolveMessage(runtime, CODE_VIEWER_MESSAGES.actions.copy),
      }),
    ).toBe(copy);
    expect(
      screen.getByRole("region", {
        name: resolveMessage(runtime, CODE_VIEWER_MESSAGES.accessibility.contents),
      }),
    ).toBe(contents);
    expect(footer.textContent).toBe(
      resolveMessage(
        runtime,
        codeViewerFooterDescriptor(1, "Interpréteur de commandes", "UTF-8"),
      ),
    );

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(within(header).getByText("mod.rs")).toBe(path);
    expect(footer.textContent).toBe(
      resolveMessage(runtime, codeViewerFooterDescriptor(1, "واجهة الأوامر", "UTF-8")),
    );
  });

  it("does not restate the language in the header \u2014 the footer already carries it", () => {
    // Owner review [msbavmdz]: the type pill duplicated the footer summary, and it
    // spent the widest line in the component on a fact already on screen. The
    // footer assertion above proves the language is still stated, and localized,
    // in every locale; this proves the header no longer says it a second time.
    const { container, runtime } = renderViewer(
      available("printf 'hello'\n", { languageHint: "sh" }),
    );
    const header = container.querySelector("header")!;
    const footer = container.querySelector("footer")!;
    const language = resolveMessage(runtime, languageDisplayDescriptor("sh", "code"));
    expect(footer.textContent).toContain(language);
    expect(header.textContent).not.toContain(language);
  });

  it("uses safe generic copy for an unknown language hint", () => {
    const { container, runtime } = renderViewer(
      available("private text", {
        path: undefined,
        languageHint: "private_wire_language",
      }),
    );
    expect(
      within(container.querySelector("header")!).getAllByText(
        resolveMessage(runtime, CODE_VIEWER_MESSAGES.labels.code),
      ).length,
    ).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("private_wire_language");
  });

  it("renders actionable localized states without structural details", () => {
    const states = [
      available("", { loading: true, available: false }),
      available("", { notFound: true, available: false }),
      available("", { errored: true, available: false }),
      available("", {
        degraded: true,
        available: false,
        reasons: { structural: "private_backend_state" },
      }),
      available("", { available: false }),
    ];
    const names = ["loading", "missing", "errored", "degraded", "empty"] as const;
    for (const [index, content] of states.entries()) {
      const runtime = createTestLocalizationRuntime();
      const view = render(
        <I18nextProvider i18n={runtime}>
          <CodeViewer content={content} />
        </I18nextProvider>,
      );
      expect(document.body.textContent).toContain(
        resolveMessage(runtime, codeViewerStateDescriptor(names[index])!),
      );
      expect(document.body.textContent).not.toContain("private_backend_state");
      view.unmount();
    }
  });

  it("renders production line rows and localized singular and plural counts", () => {
    const one = renderViewer(available("one\n"));
    expect(screen.getByText("1")).toBeTruthy();
    expect(one.container.querySelector("footer")?.textContent).toBe(
      resolveMessage(one.runtime, codeViewerFooterDescriptor(1, "Rust", "UTF-8")),
    );
    one.unmount();

    const two = renderViewer(available("one\ntwo\n"));
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(two.container.querySelector("footer")?.textContent).toBe(
      resolveMessage(two.runtime, codeViewerFooterDescriptor(2, "Rust", "UTF-8")),
    );
  });

  it("localizes the mounted truncation notice without exposing its reason", async () => {
    const { runtime } = renderViewer(
      available("x".repeat(100), {
        truncated: {
          total_bytes: 2_000_000,
          returned_bytes: 1_048_576,
          reason: "private_ceiling_name",
        },
      }),
    );
    const descriptor = documentViewerTruncationDescriptor(1_048_576, 2_000_000);
    const notice = screen.getByText(resolveMessage(runtime, descriptor));

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(notice.textContent).toBe(resolveMessage(runtime, descriptor));
    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(notice.textContent).toBe(resolveMessage(runtime, descriptor));
    expect(document.body.textContent).not.toContain("private_ceiling_name");
  });

  it("keeps the copy action active without changing code or focus", () => {
    const authored = "const answer = 42;\n";
    const { runtime } = renderViewer(available(authored));
    const copy = screen.getByRole("button", {
      name: resolveMessage(runtime, CODE_VIEWER_MESSAGES.actions.copy),
    });
    copy.focus();
    fireEvent.click(copy);
    expect(document.activeElement).toBe(copy);
    expect(document.body.textContent).toContain("const answer = 42;");
  });

  it("names what each copy writes instead of one ambiguous Copy", () => {
    const { runtime } = renderViewer(available("const answer = 42;\n"));
    const trigger = screen.getByRole("button", {
      name: resolveMessage(runtime, CODE_VIEWER_MESSAGES.actions.copy),
    });
    // The affordance is a glyph that OPENS a menu, not a one-shot copy.
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      resolveMessage(runtime, CODE_VIEWER_MESSAGES.actions.copyContents),
      resolveMessage(runtime, CODE_VIEWER_MESSAGES.actions.copyPath),
    ]);

    // Choosing one closes the menu; the viewer stays read-only either way.
    fireEvent.click(items[0]!);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("offers no path copy for a file served without a path", () => {
    const { runtime } = renderViewer(available("x\n", { path: undefined }));
    fireEvent.click(
      screen.getByRole("button", {
        name: resolveMessage(runtime, CODE_VIEWER_MESSAGES.actions.copy),
      }),
    );
    // Honest absence rather than a permanently dead menu row.
    expect(within(screen.getByRole("menu")).getAllByRole("menuitem")).toHaveLength(1);
  });

  it("heads the file with its name over its repo-relative path", () => {
    const { container } = renderViewer(available("x\n"));
    const header = container.querySelector("header")!;
    expect(within(header).getByText("mod.rs")).toBeTruthy();
    const path = header.querySelector("[data-code-viewer-path]")!;
    expect(path.textContent).toBe("src/auth/mod.rs");
    // The full path is revealed on hover when the header is too narrow for it.
    expect(path.getAttribute("title")).toBe("src/auth/mod.rs");
  });

  it("renders the shared caution treatment when the read is degraded", () => {
    const { runtime } = renderViewer(
      available("", {
        degraded: true,
        available: false,
        reasons: { structural: "private_backend_state" },
      }),
    );
    // The one shared degraded block (caution mark + one sentence), not a plain
    // tinted paragraph that reads as ordinary prose.
    const block = document.querySelector('[data-state-block="degraded"]')!;
    expect(block).toBeTruthy();
    expect(block.textContent).toBe(
      resolveMessage(runtime, CODE_VIEWER_MESSAGES.errors.temporarilyUnavailable),
    );
    expect(document.body.textContent).not.toContain("private_backend_state");
  });

  it("remains display-only", () => {
    renderViewer(available("fn main() {}\n"));
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("renders read-only change markers for the file's git diff (D5)", () => {
    // A modified line 1 and an added line 2 (0-based, in the visible window).
    renderViewer(available("one\ntwo\nthree\n"), [
      { line: 0, kind: "modified", span: 1 },
      { line: 1, kind: "added", span: 1 },
    ]);
    // The gutter carries the same diff tones as the editor — no editing affordance
    // is introduced (still read-only).
    expect(document.querySelector('[data-change-marker="modified"]')).toBeTruthy();
    expect(document.querySelector('[data-change-marker="added"]')).toBeTruthy();
    expect(
      document.querySelector('[data-change-marker="modified"]')?.className,
    ).toContain("bg-diff-modified");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("renders no markers for a clean file", () => {
    renderViewer(available("one\ntwo\n"));
    expect(document.querySelector("[data-change-marker]")).toBeNull();
  });
});
