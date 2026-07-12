// @vitest-environment happy-dom
//
// Render tests for the reader's section comment affordances + thread panel
// (authoring-surface W02.P05.S17). The reader is dumb chrome, so it is driven with a
// plane-shaped prop (the served comments + bound command callbacks the smart parent
// supplies) — NOT a wire mock: the live wire that backs those callbacks is exercised
// end to end in `sectionAnchor.live.test.ts` (a reader-built selector anchoring on
// the real engine). Here we assert the reader's own behaviour: viewport-switched
// affordance visibility, the count chip, the thread lifecycle (open → compose →
// resolve), and honest orphaned rendering with an explicit re-anchor.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ContentView } from "../../stores/server/queries";
import type { ServedComment } from "../../stores/server/authoring";
import { MarkdownReader } from "./MarkdownReader";
import type { ReaderCommentSource } from "./readerComments";

afterEach(() => {
  cleanup();
  // Restore matchMedia between tests (the compact case stubs it).
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

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

function available(text: string): ContentView {
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

function anchoredComment(id: string, headingPath: string[]): ServedComment {
  return {
    comment: {
      schema_version: "authoring.comment.v1",
      comment_id: id,
      document: { node_id: "doc:x" },
      selector: { heading_path: headingPath, expected_content_hash: "hash" },
      body: "a section note",
      author: { id: "human:editor", kind: "human" },
      resolved: false,
      created_at_ms: Date.now(),
      updated_at_ms: Date.now(),
    },
    anchor: {
      state: "anchored",
      heading_path: headingPath,
      content_start: 0,
      content_end: 1,
    },
    orphaned: false,
  };
}

function orphanedComment(id: string, headingPath: string[]): ServedComment {
  return {
    comment: {
      schema_version: "authoring.comment.v1",
      comment_id: id,
      document: { node_id: "doc:x" },
      selector: { heading_path: headingPath, expected_content_hash: "stale" },
      body: "a drifted note",
      author: { id: "human:editor", kind: "human" },
      resolved: false,
      created_at_ms: Date.now(),
      updated_at_ms: Date.now(),
    },
    anchor: {
      state: "orphaned",
      evidence: {
        reason: "content_hash_mismatch",
        heading_path: headingPath,
        expected: "e",
        observed: "o",
      },
    },
    orphaned: true,
  };
}

function makeSource(overrides: Partial<ReaderCommentSource> = {}): ReaderCommentSource {
  return {
    comments: [],
    actorReady: true,
    actorBootstrapping: false,
    ensureActor: vi.fn(),
    createComment: vi.fn().mockResolvedValue(undefined),
    editComment: vi.fn().mockResolvedValue(undefined),
    setResolved: vi.fn().mockResolvedValue(undefined),
    reanchorComment: vi.fn().mockResolvedValue(undefined),
    deleteComment: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Stub matchMedia so the compact breakpoint query matches → `useViewportClass()`
 *  reads "compact" (mirrors VaultBrowser.compact.render.test.tsx). */
function stubCompactMatchMedia(): void {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes("max-width"),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

describe("reader comment affordance visibility", () => {
  it("hover-reveals the affordance on a regular (pointer) viewport", () => {
    render(<MarkdownReader content={available(DOC)} commentSource={makeSource()} />);
    const affordance = screen.getByLabelText("Comment on this section");
    // The wrapper carries the hover reveal on pointer viewports.
    const wrapper = affordance.closest("[data-affordance-visibility]");
    expect(wrapper?.getAttribute("data-affordance-visibility")).toBe("hover");
  });

  it("always shows the affordance on a compact (touch) viewport", () => {
    stubCompactMatchMedia();
    render(<MarkdownReader content={available(DOC)} commentSource={makeSource()} />);
    const affordance = screen.getByLabelText("Comment on this section");
    const wrapper = affordance.closest("[data-affordance-visibility]");
    expect(wrapper?.getAttribute("data-affordance-visibility")).toBe("always");
  });
});

describe("reader comment count chip", () => {
  it("renders a count chip on a section that has served comments", () => {
    const source = makeSource({
      comments: [
        anchoredComment("a", SECTION_PATH),
        anchoredComment("b", SECTION_PATH),
      ],
    });
    const { container } = render(
      <MarkdownReader content={available(DOC)} commentSource={source} />,
    );
    const chip = container.querySelector("[data-comment-count]");
    expect(chip).toBeTruthy();
    expect(chip!.textContent).toBe("2");
  });

  it("shows no chip on a section with no comments", () => {
    const { container } = render(
      <MarkdownReader content={available(DOC)} commentSource={makeSource()} />,
    );
    expect(container.querySelector("[data-comment-count]")).toBeNull();
  });
});

describe("reader comment thread lifecycle", () => {
  it("opens the thread and composes a new comment with a section-anchored selector", async () => {
    const createComment = vi.fn().mockResolvedValue(undefined);
    render(
      <MarkdownReader
        content={available(DOC)}
        commentSource={makeSource({ createComment })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Comment on this section"));

    const box = await screen.findByLabelText("new comment");
    fireEvent.change(box, { target: { value: "please clarify" } });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));

    await waitFor(() => expect(createComment).toHaveBeenCalledTimes(1));
    const [selector, body] = createComment.mock.calls[0];
    // The selector carries the full raw ancestor path + a real git-blob-oid hash.
    expect(selector.heading_path).toEqual(SECTION_PATH);
    expect(selector.expected_content_hash).toMatch(/^[0-9a-f]{40}$/);
    expect(body).toBe("please clarify");
  });

  it("resolves an anchored comment from its thread row", async () => {
    const setResolved = vi.fn().mockResolvedValue(undefined);
    render(
      <MarkdownReader
        content={available(DOC)}
        commentSource={makeSource({
          comments: [anchoredComment("a", SECTION_PATH)],
          setResolved,
        })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Comment on this section"));
    fireEvent.click(await screen.findByLabelText("Resolve comment"));
    await waitFor(() => expect(setResolved).toHaveBeenCalledWith("a", true));
  });
});

const DUP_DOC = [
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

describe("reader duplicate-section handling", () => {
  it("blocks composing on a duplicated section with an honest hint, never a silent orphan", async () => {
    const createComment = vi.fn().mockResolvedValue(undefined);
    render(
      <MarkdownReader
        content={available(DUP_DOC)}
        commentSource={makeSource({ createComment })}
      />,
    );
    // Both identically-titled sections carry the affordance; open the first.
    fireEvent.click(screen.getAllByLabelText("Comment on this section")[0]);

    // The compose box is replaced by a plain-language hint — no "new comment" input.
    expect(
      await screen.findByText(/more than one section with this heading/),
    ).toBeTruthy();
    expect(screen.queryByLabelText("new comment")).toBeNull();
    expect(createComment).not.toHaveBeenCalled();
  });
});

describe("reader orphaned comment handling", () => {
  it("lists an orphaned note with its plain-language reason and re-anchors on request", async () => {
    const reanchorComment = vi.fn().mockResolvedValue(undefined);
    render(
      <MarkdownReader
        content={available(DOC)}
        commentSource={makeSource({
          comments: [orphanedComment("c", SECTION_PATH)],
          reanchorComment,
        })}
      />,
    );
    // The doc-level orphaned affordance appears (never silently re-anchored).
    fireEvent.click(screen.getByText("1 orphaned note"));

    // The typed reason renders in plain language.
    expect(await screen.findByText(/has been edited since/)).toBeTruthy();

    // The section still exists, so an explicit re-anchor is offered and fires.
    fireEvent.click(screen.getByText("Re-anchor to current section"));
    await waitFor(() => expect(reanchorComment).toHaveBeenCalledTimes(1));
    const [commentId, selector] = reanchorComment.mock.calls[0];
    expect(commentId).toBe("c");
    expect(selector.heading_path).toEqual(SECTION_PATH);
    expect(selector.expected_content_hash).toMatch(/^[0-9a-f]{40}$/);
  });
});
