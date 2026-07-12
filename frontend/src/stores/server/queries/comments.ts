// Section-anchored document comments — hooks (authoring-surface ADR D2, W02.P03).
// Domain submodule of the queries barrel; see ./index.ts.
//
// The stores layer stays the SOLE wire client: these hooks consume the authoring
// wire client's comment methods (`../authoring`) and hold the bounded per-document
// comment cache. The comment query key lives under `authoringKeys` so the EXISTING
// authoring lifecycle-stream invalidation (`invalidateAuthoring`, fired on every
// authoring SSE frame — including `comment.created/.updated/.deleted`) refreshes an
// open thread for free, the same delta path the review queue rides. A mounted
// thread panel keeps that stream alive by subscribing here (mount-gated, ref-
// counted — data-loading-activity), so a comment created elsewhere reaches it.
//
// Reads return the raw query result (derive in `useMemo` at the call site,
// frontend-store-selectors). Mutations invalidate exactly the affected document's
// comment query on settle; a genuine refusal (unknown document, oversized body,
// unregistered actor) is a tiers-bearing EngineError the caller surfaces (the
// comment routes serve typed errors, not denial values).

import {
  authoringClient,
  authoringKeys,
  requireActorToken,
  subscribeAuthoringLifecycle,
  type CommentListResult,
  type SectionSelector,
} from "../authoring";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { isAddressableNode, normalizeNodeScopedRequestIdentity } from "./graph";

/** Freshness window for the per-document comment listing — the same 2s stale / 60s
 *  gc bound the review-queue and other authoring reads use (bounded-by-default): a
 *  brief stale window rides the lifecycle-stream invalidation for live freshness,
 *  and an unobserved thread's entry is evicted promptly when the panel closes. */
const COMMENT_STALE_TIME = 2_000;
const COMMENT_GC_TIME = 60_000;

/** Invalidate exactly one document's comment listing (the affected `(scope,
 *  nodeId)` entry), the settle-time refresh every comment mutation drives. */
function invalidateDocumentComments(
  queryClient: QueryClient,
  scope: string | null,
  nodeId: string | null,
): void {
  if (scope === null || nodeId === null) return;
  void queryClient.invalidateQueries({
    queryKey: authoringKeys.comments(scope, nodeId),
  });
}

/**
 * The bounded, backend-served comment listing for one open document
 * (authoring-surface ADR D2). Keyed by (scope, nodeId); disabled until a document
 * is open and a worktree is resolved (the `useNodeContent`/`usePlanInterior`
 * enabled-on-id pattern), so a surface that renders no thread fetches nothing
 * (mount-gating). A mounted thread subscribes to the authoring lifecycle stream so
 * a `comment.*` SSE frame refreshes the listing without a manual poll. Returns the
 * raw query result — derive in `useMemo` at the call site.
 */
export function useDocumentComments(
  nodeId: unknown,
  scope: unknown,
): UseQueryResult<CommentListResult, Error> {
  const request = normalizeNodeScopedRequestIdentity(scope, nodeId);
  const enabled = request.scope !== null && isAddressableNode(request.nodeId);

  // Keep the authoring lifecycle stream alive while a thread is open so comment
  // deltas (comment.created/.updated/.deleted) reach the blanket authoring
  // invalidation that refreshes this listing. Ref-counted + mount-gated: it stops
  // when the last comment/review surface unmounts.
  useEffect(() => {
    if (!enabled) return;
    return subscribeAuthoringLifecycle();
  }, [enabled]);

  const query = useQuery({
    queryKey: authoringKeys.comments(request.scope ?? "", request.nodeId ?? ""),
    queryFn: ({ signal }) =>
      authoringClient.listComments(request.nodeId!, undefined, signal),
    enabled,
    staleTime: COMMENT_STALE_TIME,
    gcTime: COMMENT_GC_TIME,
  });
  return enabled
    ? query
    : ({ ...query, data: undefined } as UseQueryResult<CommentListResult, Error>);
}

/** The scope + document a comment mutation settles against — the `(scope, nodeId)`
 *  pair the affected comment listing is keyed on. */
interface CommentMutationTarget {
  scope: string | null;
  nodeId: string | null;
}

/** Create a section-anchored comment on a document, invalidating that document's
 *  comment listing on success. `nodeId` rides the route; the body carries only
 *  `{selector, body}` (the author is the resolved principal). */
export function useCreateComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      args: CommentMutationTarget & { selector: SectionSelector; body: string },
    ) => {
      if (args.nodeId === null) {
        throw new Error("a comment requires a target document node id");
      }
      return authoringClient.createComment(
        args.nodeId,
        { selector: args.selector, body: args.body },
        { actorToken: requireActorToken() },
      );
    },
    onSuccess: (_record, args) =>
      invalidateDocumentComments(queryClient, args.scope, args.nodeId),
  });
}

/** Edit a comment's body, invalidating the owning document's listing on success. */
export function useEditComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: CommentMutationTarget & { commentId: string; body: string }) =>
      authoringClient.updateComment(
        args.commentId,
        { op: "edit_body", body: args.body },
        { actorToken: requireActorToken() },
      ),
    onSuccess: (_record, args) =>
      invalidateDocumentComments(queryClient, args.scope, args.nodeId),
  });
}

/** Toggle a comment's resolved flag, invalidating the owning document's listing. */
export function useSetCommentResolved() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      args: CommentMutationTarget & { commentId: string; resolved: boolean },
    ) =>
      authoringClient.updateComment(
        args.commentId,
        { op: "set_resolved", resolved: args.resolved },
        { actorToken: requireActorToken() },
      ),
    onSuccess: (_record, args) =>
      invalidateDocumentComments(queryClient, args.scope, args.nodeId),
  });
}

/** Explicitly re-anchor a comment to the current section state (never a silent
 *  side effect of a read), invalidating the owning document's listing. */
export function useReanchorComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      args: CommentMutationTarget & { commentId: string; selector: SectionSelector },
    ) =>
      authoringClient.updateComment(
        args.commentId,
        { op: "reanchor", selector: args.selector },
        { actorToken: requireActorToken() },
      ),
    onSuccess: (_record, args) =>
      invalidateDocumentComments(queryClient, args.scope, args.nodeId),
  });
}

/** Delete a comment (idempotent), invalidating the owning document's listing. */
export function useDeleteComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: CommentMutationTarget & { commentId: string }) =>
      authoringClient.deleteComment(args.commentId, {
        actorToken: requireActorToken(),
      }),
    onSuccess: (_removed, args) =>
      invalidateDocumentComments(queryClient, args.scope, args.nodeId),
  });
}
