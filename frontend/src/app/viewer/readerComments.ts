// Reader comment plane: the context + action descriptor threading section-comment
// data and mutations into the reader's per-heading wrappers (authoring-surface ADR
// D2, W02.P05).
//
// The reader stays DUMB chrome (dashboard-layer-ownership): it fetches nothing. The
// smart parent (`MarkdownDocView`) owns the `useDocumentComments` read and the
// comment mutation hooks and hands the reader a `ReaderCommentPlane` — the served
// comments plus bound async command callbacks. The reader threads that plane to
// every heading wrapper through this context so a heading rendered deep inside
// react-markdown reaches it without prop-drilling through the markdown component
// map.

import { createContext, useContext } from "react";
import { MessageSquare } from "lucide-react";

import type { ActionDescriptor } from "../../platform/actions/action";
import type { ServedComment, SectionSelector } from "../../stores/server/authoring";
import type { ViewportClass } from "../../stores/view/viewportClass";
import {
  headingPathKey,
  type CommentAnchorIndex,
  type HeadingBlock,
} from "./sectionAnchor";

/** The one section-comment action id (unified-action-plane): the verb the heading
 *  affordance dispatches to open a section's comment thread. Section-scoped — it
 *  carries its section payload in the `run` closure, so it is NOT palette-enrolled
 *  (a standing palette command has no section context to act on). */
export const COMMENT_SECTION_ACTION_ID = "viewer:comment-section";

/**
 * Build the one section-comment action descriptor. Authored ONCE here and fired by
 * the heading affordance; the section identity lives in the `run` closure so the
 * same verb serves every heading without a bespoke per-heading handler. `hasComments`
 * only reshapes the label (Open vs Add) — the id and lane never change.
 */
export function commentSectionAction(args: {
  hasComments: boolean;
  onOpen: () => void;
}): ActionDescriptor {
  return {
    id: COMMENT_SECTION_ACTION_ID,
    label: args.hasComments ? "Open comments" : "Add a comment",
    section: "transform",
    icon: MessageSquare,
    run: args.onOpen,
  };
}

/** The bound comment command callbacks the smart parent provides. Each resolves
 *  when the mutation settles (the parent invalidates the document's comment
 *  listing); a genuine refusal rejects with the tiers-bearing error the caller
 *  surfaces. */
export interface ReaderCommentActions {
  createComment(selector: SectionSelector, body: string): Promise<void>;
  editComment(commentId: string, body: string): Promise<void>;
  setResolved(commentId: string, resolved: boolean): Promise<void>;
  reanchorComment(commentId: string, selector: SectionSelector): Promise<void>;
  deleteComment(commentId: string): Promise<void>;
}

/** What the smart parent (`MarkdownDocView`) supplies: the served comments, the
 *  bound command callbacks, and the actor-identity state. The reader assembles the
 *  full plane by adding the anchor index (derived from the document body it renders)
 *  and the live viewport class. */
export interface ReaderCommentSource extends ReaderCommentActions {
  /** Every served comment for the open document (anchor resolution backend-served). */
  comments: ServedComment[];
  /** A human actor token is bootstrapped — a comment command can fire. */
  actorReady: boolean;
  /** Whether a bootstrap mint is in flight (for the compose box's disabled state). */
  actorBootstrapping: boolean;
  /** Mint the shared editor actor token (idempotent) — called when a thread opens. */
  ensureActor(): void;
}

/** The full reader comment plane the reader threads through context: the parent's
 *  source plus the reader-derived anchor index and viewport class. */
export interface ReaderCommentPlane extends ReaderCommentSource {
  /** The raw-body heading anchor index (plugin path → raw block + section bytes). */
  anchorIndex: CommentAnchorIndex;
  /** The live viewport class — the affordance is hover-revealed on `regular`,
   *  always visible on `compact` (touch has no hover). */
  viewport: ViewportClass;
}

/** The reader comment plane context. `null` when the reader has no comment plane
 *  (a caller that mounts the reader without comments — the headings render plainly). */
export const ReaderCommentsContext = createContext<ReaderCommentPlane | null>(null);

/** Read the reader comment plane, or `null` when no plane is mounted. */
export function useReaderComments(): ReaderCommentPlane | null {
  return useContext(ReaderCommentsContext);
}

/** The ANCHORED comments attached to one section (by exact heading-path match), in
 *  creation order. Orphaned comments are excluded — they live in the doc-level
 *  orphaned panel, never silently re-anchored onto a live section. */
export function anchoredCommentsForBlock(
  comments: ServedComment[],
  block: HeadingBlock,
): ServedComment[] {
  const key = headingPathKey(block.path);
  return comments.filter(
    (served) =>
      !served.orphaned &&
      served.anchor.state === "anchored" &&
      headingPathKey(served.anchor.heading_path) === key,
  );
}

/** Every orphaned comment (any drift reason), for the doc-level orphaned panel. */
export function orphanedComments(comments: ServedComment[]): ServedComment[] {
  return comments.filter((served) => served.orphaned);
}
