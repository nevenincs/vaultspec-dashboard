// Auto-split from liveAdapters.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the liveAdapters barrel; see ./index.ts.

import type { TiersBlock } from "../engine";

export type Rec = Record<string, unknown>;

export const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;

/**
 * Unwrap the live `{data, tiers}` envelope (and the events family's extra
 * `{payload}` nesting) onto the internal flat-with-tiers shape. Flat
 * bodies pass through.
 */
export function unwrapEnvelope(body: unknown): unknown {
  if (!isRec(body) || !isRec(body.data) || !("tiers" in body)) return body;
  let data = body.data;
  if (isRec(data.payload) && Object.keys(data).length <= 2) {
    // events: {data: {payload: {...}, shape}} → payload
    data = data.payload;
  }
  // A cursor-paginated route (e.g. /file-tree) carries `next_cursor` as a SIBLING
  // of `data` at the envelope top level (vaultspec-api `envelope(data, tiers,
  // next_cursor)`), not inside `data`. Preserve it onto the flattened body so the
  // pagination consumer can read it; absent on a non-paginated or last-page
  // response. Flat (already-unwrapped, e.g. mock) bodies hit the guard above and
  // pass through with their own `next_cursor` intact.
  const flat: Rec = { ...data, tiers: body.tiers as TiersBlock };
  if (typeof body.next_cursor === "string") flat.next_cursor = body.next_cursor;
  return flat;
}
