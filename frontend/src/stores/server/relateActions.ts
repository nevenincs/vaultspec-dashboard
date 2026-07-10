// Relate/link dispatch terminal effect (ledgered-edit-migration W03.P10). Per
// the ADR, a `related:` edge is NOT a bespoke ledger verb — it materializes as
// an `edit_frontmatter` direct write on the SOURCE document (there is no
// "append one link" primitive; `set-frontmatter`/`edit_frontmatter` REPLACES
// the whole `related:` list). So relate is a read-modify-write: read the
// source's CURRENT `related` list + blob hash, append the target (deduped),
// and send the full new list through the ledger, fenced on the blob hash the
// read observed. A context-menu action only carries stems/ids at descriptor-
// build time (architecture-boundaries: `app/` never fetches) — the read lives
// HERE, in the registered dispatch effect (stores layer, the sole wire
// client), triggered only when the action actually fires.

import { appDispatcher } from "../../platform/dispatch/middleware";
import {
  authoringClient,
  requireActorToken,
  type DirectWriteOutcome,
} from "./authoring";
import { engineClient } from "./engine";
import { docNodeIdFromStem } from "./liveAdapters";
import { parseDocument } from "./parseDocument";
import { invalidateAfterVaultMutation } from "./queries";
import { queryClient } from "./queryClient";

export const RELATE_ACTION = "relate:link";

export interface RelatePayload {
  /** The source document's stem — the doc whose `related:` list gains the edge. */
  src: string;
  /** The target document's stem — the edge's destination. */
  dst: string;
  scope?: string | null;
}

/** The edge already existed (the read found `dst` in `src`'s current related
 *  list) — an idempotent no-op, mirroring the retired `vault link add`'s own
 *  idempotent exit-0-on-existing-edge behavior. No direct-write is sent. */
export interface RelateAlreadyLinked {
  kind: "already_related";
}

export type RelateOutcome = DirectWriteOutcome | RelateAlreadyLinked;

/** Read `src`'s current content, recover its `related:` stems + blob hash, and
 *  append `dst` (deduped). Exported for direct unit coverage of the
 *  read→append step without exercising the dispatch seam. */
export async function relatedListWithTarget(
  src: string,
  dst: string,
  scope: string | null | undefined,
): Promise<{ related: string[]; blobHash: string; alreadyRelated: boolean }> {
  const content = await engineClient.content(
    docNodeIdFromStem(src),
    scope ?? undefined,
  );
  const currentRelated = parseDocument(content.text).frontmatter?.related ?? [];
  return {
    related: currentRelated.includes(dst) ? currentRelated : [...currentRelated, dst],
    blobHash: content.blob_hash,
    alreadyRelated: currentRelated.includes(dst),
  };
}

// Register the terminal effect once (module load): the read-modify-write
// against the engine content read + the authoring ledger's direct-write route.
// A concurrent edit to `src` between the read and the write is caught by the
// `expected_blob_hash` fence — surfaces as a `conflict` VALUE (denials-are-
// values), never silently overwritten or thrown. Like every other
// context-menu-dispatched mutation in this action system
// (`fireActionDescriptor` is fire-and-forget), the resolved outcome carries no
// dedicated toast/error UI today — the graph/tree invalidation on `applied` is
// the user-visible signal; a `conflict`/`denied`/`failed` resolves silently
// (matches the pre-existing baseline for every other dispatch-only context-
// menu action, not a regression this phase introduces).
appDispatcher.register<RelatePayload>(RELATE_ACTION, async (action) => {
  const payload = action.payload;
  if (!payload || typeof payload.src !== "string" || typeof payload.dst !== "string") {
    throw new Error("relate dispatched without a valid src/dst payload");
  }
  const { src, dst, scope } = payload;
  const { related, blobHash, alreadyRelated } = await relatedListWithTarget(
    src,
    dst,
    scope,
  );
  if (alreadyRelated) {
    return { kind: "already_related" } satisfies RelateAlreadyLinked;
  }
  const outcome = await authoringClient.directWrite(
    {
      operation: "edit_frontmatter",
      ref: src,
      frontmatter: { related },
      expected_blob_hash: blobHash,
      scope,
    },
    { actorToken: requireActorToken() },
  );
  if (outcome.kind === "applied") {
    invalidateAfterVaultMutation(queryClient, scope, docNodeIdFromStem(src));
  }
  return outcome;
});

/** Dispatch a relate intent through the seam; resolves with the relate outcome. */
export function dispatchRelate(payload: RelatePayload): Promise<RelateOutcome> {
  return appDispatcher.dispatch({
    type: RELATE_ACTION,
    payload,
  }) as Promise<RelateOutcome>;
}
