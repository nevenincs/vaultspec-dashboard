// @vitest-environment happy-dom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessage } from "../../platform/localization/fallback";
import type { SectionSelector, ServedComment } from "../../stores/server/authoring";
import {
  COMMENT_ACTIONS,
  COMMENT_MESSAGES,
  commentConnectionIssueDescriptor,
  commentsToReviewCountDescriptor,
} from "../../stores/server/authoring/commentVocabulary";
import type { ContentView } from "../../stores/server/queries";
import { MarkdownReader } from "./MarkdownReader";
import type { ReaderCommentActions, ReaderCommentSource } from "./readerComments";
import { clearSectionScroll, requestSectionScroll } from "./readerSectionScroll";

const NODE_ID = "doc:2026-06-16-x-adr";
const SECTION_PATH = ["Doc Title", "Section One"];

const DOC = [
  "---",
  "tags:",
  "  - '#adr'",
  "date: '2026-06-16'",
  "modified: '2026-06-16'",
  "---",
  "",
  "# Doc Title",
  "",
  "An intro dek paragraph.",
  "",
  "## Section One",
  "",
  "Section one body.",
  "",
].join("\n");

const DUPLICATE_DOC = [
  "---",
  "tags:",
  "  - '#adr'",
  "date: '2026-06-16'",
  "---",
  "",
  "# Doc Title",
  "",
  "An intro dek paragraph.",
  "",
  "## Repeated",
  "",
  "First body.",
  "",
  "## Repeated",
  "",
  "Second body.",
  "",
].join("\n");

afterEach(() => {
  cleanup();
  clearSectionScroll(NODE_ID);
});

function available(text = DOC): ContentView {
  return {
    loading: false,
    errored: false,
    degraded: false,
    degradedTiers: [],
    reasons: {},
    path: ".vault/adr/2026-06-16-x-adr.md",
    blobHash: "abc",
    languageHint: "markdown",
    text,
    truncated: null,
    available: true,
  };
}

function servedComment(
  id: string,
  options: { orphaned?: boolean; body?: string } = {},
): ServedComment {
  const orphaned = options.orphaned ?? false;
  return {
    comment: {
      schema_version: "authoring.comment.v1",
      comment_id: id,
      document: { node_id: "doc:x" },
      selector: { heading_path: SECTION_PATH, expected_content_hash: "hash" },
      body: options.body ?? "Authored comment",
      author: { id: "human:editor", kind: "human" },
      resolved: false,
      created_at_ms: Date.now(),
      updated_at_ms: Date.now(),
    },
    anchor: orphaned
      ? {
          state: "orphaned",
          evidence: {
            reason: "content_hash_mismatch",
            heading_path: SECTION_PATH,
            expected: "expected-private-hash",
            observed: "observed-private-hash",
          },
        }
      : {
          state: "anchored",
          heading_path: SECTION_PATH,
          content_start: 0,
          content_end: 1,
        },
    orphaned,
  };
}

interface OperationCalls {
  readonly added: Array<{ selector: SectionSelector; body: string }>;
  readonly saved: Array<{ id: string; body: string }>;
  readonly statuses: Array<{ id: string; resolved: boolean }>;
  readonly moved: Array<{ id: string; selector: SectionSelector }>;
  readonly deleted: string[];
}

function operationHarness(): { actions: ReaderCommentActions; calls: OperationCalls } {
  const calls: OperationCalls = {
    added: [],
    saved: [],
    statuses: [],
    moved: [],
    deleted: [],
  };
  const actions: ReaderCommentActions = {
    async createComment(selector, body) {
      calls.added.push({ selector, body });
    },
    async editComment(id, body) {
      calls.saved.push({ id, body });
    },
    async setResolved(id, resolved) {
      calls.statuses.push({ id, resolved });
    },
    async reanchorComment(id, selector) {
      calls.moved.push({ id, selector });
    },
    async deleteComment(id) {
      calls.deleted.push(id);
    },
  };
  return { actions, calls };
}

function renderReader(
  options: {
    comments?: ServedComment[];
    content?: ContentView;
    nodeId?: string | null;
  } = {},
) {
  const runtime = createTestLocalizationRuntime();
  const harness = operationHarness();
  let ensureActorCount = 0;
  const source: ReaderCommentSource = {
    comments: options.comments ?? [],
    docStem: "2026-06-16-x-adr",
    sourceRevision: "blob-fixture",
    actorReady: true,
    actorBootstrapping: false,
    ensureActor() {
      ensureActorCount += 1;
    },
    ...harness.actions,
  };
  const result = render(
    <I18nextProvider i18n={runtime}>
      <MarkdownReader
        content={options.content ?? available()}
        nodeId={options.nodeId === undefined ? NODE_ID : options.nodeId}
        commentSource={source}
      />
    </I18nextProvider>,
  );
  return {
    ...result,
    runtime,
    source,
    calls: harness.calls,
    ensureActorCount: () => ensureActorCount,
  };
}

describe("reader comments", () => {
  it("updates mounted controls in English, French, and Arabic without losing the open draft", async () => {
    const anchored = servedComment("comment-a");
    const review = servedComment("comment-b", { orphaned: true });
    const { runtime } = renderReader({ comments: [anchored, review] });

    const openButton = screen.getByRole("button", {
      name: resolveMessage(runtime, COMMENT_ACTIONS.open),
    });
    const reviewButton = screen.getByRole("button", {
      name: resolveMessage(runtime, commentsToReviewCountDescriptor(1)),
    });
    openButton.focus();
    fireEvent.click(openButton);
    const dialog = await screen.findByRole("dialog", {
      name: resolveMessage(runtime, COMMENT_MESSAGES.accessibility.sectionComments),
    });
    const textbox = screen.getByRole("textbox", {
      name: resolveMessage(runtime, COMMENT_MESSAGES.accessibility.newComment),
    });
    fireEvent.change(textbox, { target: { value: "Authored draft" } });
    textbox.focus();

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("button", {
        name: resolveMessage(runtime, COMMENT_ACTIONS.open),
      }),
    ).toBe(openButton);
    expect(
      screen.getByRole("button", {
        name: resolveMessage(runtime, commentsToReviewCountDescriptor(1)),
      }),
    ).toBe(reviewButton);
    expect(
      screen.getByRole("dialog", {
        name: resolveMessage(runtime, COMMENT_MESSAGES.accessibility.sectionComments),
      }),
    ).toBe(dialog);
    expect((textbox as HTMLTextAreaElement).value).toBe("Authored draft");
    expect(document.activeElement).toBe(textbox);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("button", {
        name: resolveMessage(runtime, COMMENT_ACTIONS.open),
      }),
    ).toBe(openButton);
    expect(
      screen.getByRole("button", {
        name: resolveMessage(runtime, commentsToReviewCountDescriptor(1)),
      }),
    ).toBe(reviewButton);
    expect((textbox as HTMLTextAreaElement).value).toBe("Authored draft");
    expect(document.activeElement).toBe(textbox);
  });

  it("keeps the regular viewport affordance hover-revealed and shows the section count", () => {
    const { container, runtime } = renderReader({
      comments: [servedComment("comment-a"), servedComment("comment-b")],
    });
    const affordance = screen.getByRole("button", {
      name: resolveMessage(runtime, COMMENT_ACTIONS.open),
    });
    expect(
      affordance
        .closest("[data-affordance-visibility]")
        ?.getAttribute("data-affordance-visibility"),
    ).toBe("hover");
    expect(container.querySelector("[data-comment-count]")?.textContent).toBe("2");
  });

  it("opens and closes the section panel and restores focus", async () => {
    const { runtime } = renderReader();
    const openButton = screen.getByRole("button", {
      name: resolveMessage(runtime, COMMENT_ACTIONS.open),
    });
    openButton.focus();
    fireEvent.click(openButton);
    expect(
      await screen.findByRole("dialog", {
        name: resolveMessage(runtime, COMMENT_MESSAGES.accessibility.sectionComments),
      }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: resolveMessage(runtime, COMMENT_ACTIONS.close),
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: resolveMessage(runtime, COMMENT_MESSAGES.accessibility.sectionComments),
        }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(openButton);
  });

  it("adds a comment with the production section selector", async () => {
    const { runtime, calls } = renderReader();
    fireEvent.click(
      screen.getByRole("button", {
        name: resolveMessage(runtime, COMMENT_ACTIONS.open),
      }),
    );
    const textbox = await screen.findByRole("textbox", {
      name: resolveMessage(runtime, COMMENT_MESSAGES.accessibility.newComment),
    });
    fireEvent.change(textbox, { target: { value: "Please clarify" } });
    fireEvent.click(
      screen.getByRole("button", {
        name: resolveMessage(runtime, COMMENT_ACTIONS.add),
      }),
    );

    await waitFor(() => expect(calls.added).toHaveLength(1));
    expect(calls.added[0]?.selector.heading_path).toEqual(SECTION_PATH);
    expect(calls.added[0]?.selector.expected_content_hash).toMatch(/^[0-9a-f]{40}$/);
    expect(calls.added[0]?.body).toBe("Please clarify");
  });

  it("changes an anchored comment status through the supplied operation", async () => {
    const { runtime, calls } = renderReader({
      comments: [servedComment("comment-a")],
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: resolveMessage(runtime, COMMENT_ACTIONS.open),
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: resolveMessage(runtime, COMMENT_ACTIONS.resolve),
      }),
    );
    await waitFor(() =>
      expect(calls.statuses).toEqual([{ id: "comment-a", resolved: true }]),
    );
  });

  it("blocks adding a comment when two sections have the same heading", async () => {
    const { runtime, calls } = renderReader({ content: available(DUPLICATE_DOC) });
    fireEvent.click(
      screen.getAllByRole("button", {
        name: resolveMessage(runtime, COMMENT_ACTIONS.open),
      })[0]!,
    );
    expect(
      await screen.findByText(
        resolveMessage(runtime, COMMENT_MESSAGES.disabledReasons.duplicateHeading),
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("textbox", {
        name: resolveMessage(runtime, COMMENT_MESSAGES.accessibility.newComment),
      }),
    ).toBeNull();
    expect(calls.added).toHaveLength(0);
  });

  it("shows comments to review and moves one with a production selector", async () => {
    const { container, runtime, calls } = renderReader({
      comments: [servedComment("comment-a", { orphaned: true })],
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: resolveMessage(runtime, commentsToReviewCountDescriptor(1)),
      }),
    );
    expect(
      await screen.findByText(
        resolveMessage(
          runtime,
          commentConnectionIssueDescriptor("content_hash_mismatch"),
        ),
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: resolveMessage(runtime, COMMENT_ACTIONS.moveToThisSection),
      }),
    );
    await waitFor(() => expect(calls.moved).toHaveLength(1));
    expect(calls.moved[0]?.id).toBe("comment-a");
    expect(calls.moved[0]?.selector.heading_path).toEqual(SECTION_PATH);
    expect(calls.moved[0]?.selector.expected_content_hash).toMatch(/^[0-9a-f]{40}$/);
    expect(container.textContent).not.toContain("content_hash_mismatch");
    expect(container.textContent).not.toContain("expected-private-hash");
    expect(container.textContent).not.toContain("observed-private-hash");
  });

  it("clears an unfinished section request when a loading reader closes", () => {
    const loading: ContentView = {
      ...available(),
      loading: true,
      text: "",
      available: false,
    };
    const first = renderReader({ content: loading });
    act(() => requestSectionScroll(NODE_ID, "section-one"));
    first.unmount();

    const second = renderReader();
    expect(
      second.container.querySelector("#section-one")?.getAttribute("tabindex"),
    ).toBe(null);
  });
});
