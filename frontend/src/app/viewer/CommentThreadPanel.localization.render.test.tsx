// @vitest-environment happy-dom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import type { SectionSelector, ServedComment } from "../../stores/server/authoring";
import { CommentThreadPanel, type CommentThreadPanelProps } from "./CommentThreadPanel";
import type { ReaderCommentActions } from "./readerComments";
import {
  sectionSelectorForBlock,
  type CommentAnchorIndex,
  type HeadingBlock,
} from "./sectionAnchor";

afterEach(cleanup);

const BLOCK: HeadingBlock = {
  path: ["Authored document", "Authored section"],
  level: 2,
  sectionText: "## Authored section\n\nAuthored body.\n",
};

const EMPTY_INDEX: CommentAnchorIndex = {
  byPluginPath: new Map(),
  ambiguousPaths: new Set(),
};

function servedComment(
  args: {
    body?: string;
    id?: string;
    kind?: "human" | "agent" | "system" | "tool_executor";
    orphaned?: boolean;
    reason?:
      | "content_hash_mismatch"
      | "missing_anchor"
      | "ambiguous_anchor"
      | "malformed_anchor";
    resolved?: boolean;
  } = {},
): ServedComment {
  const path = BLOCK.path;
  const reason = args.reason ?? "content_hash_mismatch";
  return {
    comment: {
      schema_version: "authoring.comment.v1",
      comment_id: args.id ?? "comment-private-17",
      document: { node_id: "document-private-23" },
      selector: { heading_path: path, expected_content_hash: "private-hash" },
      body: args.body ?? "Authored comment actor_id=private",
      author: { id: "private-actor", kind: args.kind ?? "human" },
      resolved: args.resolved ?? false,
      created_at_ms: Date.now(),
      updated_at_ms: Date.now(),
    },
    anchor: args.orphaned
      ? reason === "content_hash_mismatch"
        ? {
            state: "orphaned",
            evidence: {
              reason,
              heading_path: path,
              expected: "private-expected",
              observed: "private-observed",
            },
          }
        : reason === "ambiguous_anchor"
          ? {
              state: "orphaned",
              evidence: { reason, heading_path: path, candidate_count: 2 },
            }
          : reason === "missing_anchor"
            ? {
                state: "orphaned",
                evidence: { reason, heading_path: path },
              }
            : { state: "orphaned", evidence: { reason } }
      : {
          state: "anchored",
          heading_path: path,
          content_start: 0,
          content_end: BLOCK.sectionText.length,
        },
    orphaned: args.orphaned ?? false,
  };
}

interface OperationControl {
  addFails: boolean;
  deleteFails: boolean;
  moveFails: boolean;
  saveFails: boolean;
  statusFails: boolean;
}

interface OperationCalls {
  added: Array<{ selector: SectionSelector; body: string }>;
  deleted: string[];
  moved: Array<{ id: string; selector: SectionSelector }>;
  saved: Array<{ id: string; body: string }>;
  statuses: Array<{ id: string; resolved: boolean }>;
}

function operationHarness() {
  const control: OperationControl = {
    addFails: false,
    deleteFails: false,
    moveFails: false,
    saveFails: false,
    statusFails: false,
  };
  const calls: OperationCalls = {
    added: [],
    deleted: [],
    moved: [],
    saved: [],
    statuses: [],
  };
  const refusal = () => new Error("wire actor_id=private hash=private");
  const actions: ReaderCommentActions = {
    async createComment(selector, body) {
      calls.added.push({ selector, body });
      if (control.addFails) throw refusal();
    },
    async editComment(id, body) {
      calls.saved.push({ id, body });
      if (control.saveFails) throw refusal();
    },
    async setResolved(id, resolved) {
      calls.statuses.push({ id, resolved });
      if (control.statusFails) throw refusal();
    },
    async reanchorComment(id, selector) {
      calls.moved.push({ id, selector });
      if (control.moveFails) throw refusal();
    },
    async deleteComment(id) {
      calls.deleted.push(id);
      if (control.deleteFails) throw refusal();
    },
  };
  return { actions, calls, control };
}

function renderPanel(
  overrides: Partial<CommentThreadPanelProps> = {},
  harness = operationHarness(),
) {
  const runtime = createTestLocalizationRuntime();
  let closeCount = 0;
  let ensureCount = 0;
  const props: CommentThreadPanelProps = {
    block: BLOCK,
    comments: [],
    actions: harness.actions,
    anchorIndex: EMPTY_INDEX,
    actorReady: true,
    actorBootstrapping: false,
    ensureActor: () => {
      ensureCount += 1;
    },
    title: "Authored section",
    onClose: () => {
      closeCount += 1;
    },
    ...overrides,
  };
  const result = render(
    <I18nextProvider i18n={runtime}>
      <CommentThreadPanel {...props} />
    </I18nextProvider>,
  );
  return {
    ...result,
    runtime,
    harness,
    closeCount: () => closeCount,
    ensureCount: () => ensureCount,
  };
}

describe("CommentThreadPanel localization", () => {
  it("switches locale on the mounted panel without resetting authored data, draft, or focus", async () => {
    const authored = servedComment();
    const { runtime, container } = renderPanel({ comments: [authored] });
    const panel = screen.getByRole("dialog", { name: "Section comments" });
    const body = screen.getByText(authored.comment.body);
    const compose = screen.getByRole("textbox", { name: "New comment" });
    fireEvent.change(compose, { target: { value: "Authored draft #private" } });
    compose.focus();

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(screen.getByRole("dialog", { name: "Commentaires de la section" })).toBe(
      panel,
    );
    expect(screen.getByRole("textbox", { name: "Nouveau commentaire" })).toBe(compose);
    expect((compose as HTMLTextAreaElement).value).toBe("Authored draft #private");
    expect(document.activeElement).toBe(compose);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(screen.getByRole("dialog", { name: "تعليقات القسم" })).toBe(panel);
    expect(screen.getByRole("textbox", { name: "تعليق جديد" })).toBe(compose);
    expect(screen.getByText(authored.comment.body)).toBe(body);
    expect(document.activeElement).toBe(compose);
    expect(container.querySelector("[data-comment-id]")).toBeNull();
    expect(container.querySelector("[data-comment-orphan-reason]")).toBeNull();
  });

  it("uses production selector math and keeps the compose draft after a safe failure", async () => {
    const harness = operationHarness();
    harness.control.addFails = true;
    renderPanel({}, harness);
    const compose = screen.getByRole("textbox", { name: "New comment" });
    fireEvent.change(compose, { target: { value: "Keep this authored draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));

    await screen.findByText("The comment could not be added. Try again.");
    expect((compose as HTMLTextAreaElement).value).toBe("Keep this authored draft");
    expect(screen.queryByText(/wire|actor_id|private-hash/iu)).toBeNull();
    expect(harness.calls.added).toHaveLength(1);
    expect(harness.calls.added[0]).toEqual({
      selector: await sectionSelectorForBlock(BLOCK),
      body: "Keep this authored draft",
    });

    harness.control.addFails = false;
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));
    await screen.findByText("Comment added.");
    expect((compose as HTMLTextAreaElement).value).toBe("");
  });

  it("keeps edit and status controls actionable after localized failures", async () => {
    const harness = operationHarness();
    harness.control.saveFails = true;
    harness.control.statusFails = true;
    const authored = servedComment();
    renderPanel({ comments: [authored] }, harness);

    fireEvent.click(screen.getByText(authored.comment.body));
    const editor = screen.getByRole("textbox", { name: "Edit comment" });
    fireEvent.change(editor, { target: { value: "Revised authored comment" } });
    fireEvent.click(screen.getByRole("button", { name: "Save comment" }));
    await screen.findByText("The comment could not be saved. Try again.");
    expect((editor as HTMLTextAreaElement).value).toBe("Revised authored comment");
    expect(screen.getByRole("dialog", { name: "Section comments" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Resolve comment" }));
    await screen.findByText("The comment could not be resolved. Try again.");
    expect(harness.calls.statuses).toEqual([
      { id: authored.comment.comment_id, resolved: true },
    ]);
  });

  it("uses the reopened outcome for a resolved comment", async () => {
    const harness = operationHarness();
    harness.control.statusFails = true;
    const authored = servedComment({ resolved: true });
    renderPanel({ comments: [authored] }, harness);
    fireEvent.click(screen.getByRole("button", { name: "Reopen comment" }));
    await screen.findByText("The comment could not be reopened. Try again.");
    expect(harness.calls.statuses).toEqual([
      { id: authored.comment.comment_id, resolved: false },
    ]);
  });

  it("confirms deletion once, cancels without mutation, and restores trigger focus", async () => {
    const harness = operationHarness();
    const authored = servedComment();
    renderPanel({ comments: [authored] }, harness);
    const trigger = screen.getByRole("button", { name: "Delete comment" });
    trigger.focus();
    fireEvent.click(trigger);
    let confirmation = screen.getByRole("dialog", {
      name: "Delete this comment?",
    });
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
    expect(harness.calls.deleted).toEqual([]);
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    fireEvent.click(trigger);
    confirmation = screen.getByRole("dialog", { name: "Delete this comment?" });
    const confirm = within(confirmation).getByRole("button", {
      name: "Delete comment",
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await screen.findByText("Comment deleted.");
    expect(harness.calls.deleted).toEqual([authored.comment.comment_id]);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("keeps an open confirmation mounted and focused while its locale changes", async () => {
    const harness = operationHarness();
    const authored = servedComment();
    const { runtime } = renderPanel({ comments: [authored] }, harness);
    const trigger = screen.getByRole("button", { name: "Delete comment" });
    fireEvent.click(trigger);
    const confirmation = screen.getByRole("dialog", {
      name: "Delete this comment?",
    });
    const confirm = within(confirmation).getByRole("button", {
      name: "Delete comment",
    });
    await waitFor(() => expect(document.activeElement).toBe(confirm));

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(screen.getByRole("dialog", { name: "Supprimer ce commentaire ?" })).toBe(
      confirmation,
    );
    expect(
      within(confirmation).getByRole("button", {
        name: "Supprimer le commentaire",
      }),
    ).toBe(confirm);
    expect(document.activeElement).toBe(confirm);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(screen.getByRole("dialog", { name: "هل تريد حذف هذا التعليق؟" })).toBe(
      confirmation,
    );
    expect(within(confirmation).getByRole("button", { name: "حذف التعليق" })).toBe(
      confirm,
    );
    expect(document.activeElement).toBe(confirm);
    fireEvent.click(within(confirmation).getByRole("button", { name: "إلغاء" }));
    expect(harness.calls.deleted).toEqual([]);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("shows a move action only for one exact live section and handles selector failure safely", async () => {
    const harness = operationHarness();
    harness.control.moveFails = true;
    const authored = servedComment({
      kind: "tool_executor",
      orphaned: true,
    });
    const exactIndex: CommentAnchorIndex = {
      byPluginPath: new Map([["plugin-path", BLOCK]]),
      ambiguousPaths: new Set(),
    };
    const { rerender, runtime } = renderPanel(
      {
        block: undefined,
        comments: [authored],
        anchorIndex: exactIndex,
        orphanedPanel: true,
      },
      harness,
    );
    expect(screen.getByText("Automation")).toBeTruthy();
    expect(screen.queryByText(/anchor|orphan|hash|wire/iu)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Move comment to this section" }),
    );
    await screen.findByText("The comment could not be moved. Try again.");
    expect(harness.calls.moved).toEqual([
      {
        id: authored.comment.comment_id,
        selector: await sectionSelectorForBlock(BLOCK),
      },
    ]);

    const multipleIndex: CommentAnchorIndex = {
      byPluginPath: new Map([
        ["first", BLOCK],
        ["second", { ...BLOCK }],
      ]),
      ambiguousPaths: new Set(),
    };
    rerender(
      <I18nextProvider i18n={runtime}>
        <CommentThreadPanel
          block={undefined}
          comments={[authored]}
          actions={harness.actions}
          anchorIndex={multipleIndex}
          actorReady
          actorBootstrapping={false}
          ensureActor={() => undefined}
          title="Untrusted ignored title"
          orphanedPanel
          onClose={() => undefined}
        />
      </I18nextProvider>,
    );
    expect(
      screen.queryByRole("button", { name: "Move comment to this section" }),
    ).toBeNull();

    const ambiguousIndex: CommentAnchorIndex = {
      byPluginPath: new Map([["same", BLOCK]]),
      ambiguousPaths: new Set(["same"]),
    };
    rerender(
      <I18nextProvider i18n={runtime}>
        <CommentThreadPanel
          block={undefined}
          comments={[authored]}
          actions={harness.actions}
          anchorIndex={ambiguousIndex}
          actorReady
          actorBootstrapping={false}
          ensureActor={() => undefined}
          title="Untrusted ignored title"
          orphanedPanel
          onClose={() => undefined}
        />
      </I18nextProvider>,
    );
    expect(
      screen.queryByRole("button", { name: "Move comment to this section" }),
    ).toBeNull();
  });

  it("preserves popover dismissal and reports copy failures without diagnostics", () => {
    let copyCount = 0;
    const { closeCount } = renderPanel({
      onCopyLink: () => {
        copyCount += 1;
        throw new Error("wire actor_id=private");
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(copyCount).toBe(1);
    expect(screen.getByText("The link could not be copied. Try again.")).toBeTruthy();
    expect(screen.queryByText(/wire|actor_id/iu)).toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(closeCount()).toBe(1);
  });
});
