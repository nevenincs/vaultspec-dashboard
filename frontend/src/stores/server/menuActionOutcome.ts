// Menu-fired dispatch OUTCOME consumption (KAR-006, with the KAR-004 copy
// fold-in). The context menu is the only plane offering the mutating vault verbs
// (relate / autofix / archive), and it discarded the ops dispatch promise: a
// business REFUSAL looked identical to success (the engine returns HTTP 200 for
// both, with the outcome in the forwarded core envelope), a TRANSPORT failure
// became an unhandled rejection, and a SUCCESS never invalidated the cache (so
// the UI updated only when the ~2s file-watcher rebuild landed).
//
// The interpretation + cache invalidation belong in the stores layer — the sole
// wire client (dashboard-layer-ownership) — so app-chrome never touches the
// engine client. This awaits the promise, branches the ops envelope on
// status/data (NEVER the HTTP code), invalidates the vault-mutation caches on
// success, catches transport failures, and returns a plain feedback string for
// the app to announce. It never rejects.

import type { QueryClient } from "@tanstack/react-query";

import { COPY_ACTION, type CopyResult } from "../../platform/actions/clipboardActions";
import { envelopeData, type OpsResult } from "./engine";
import { OPS_ACTION } from "./opsActions";
import { invalidateAfterVaultMutation } from "./queries";
import { queryClient as defaultQueryClient } from "./queryClient";

export interface MenuActionOutcome {
  ok: boolean;
  /** The feedback line to announce, or null for a dispatch with no observable
   *  outcome (a store-only intent that reports nothing). */
  message: string | null;
}

/** The refusal reason from an ops envelope, or null when the op SUCCEEDED. Reads
 *  the forwarded sibling envelope's `status` + `data` (never the HTTP code): a
 *  `failed` status or an inner `refused`/`conflict` flag is a business refusal. */
function opsRefusalReason(ops: OpsResult): string | null {
  const { status, data } = envelopeData(ops.envelope);
  const refused =
    status === "failed" || data.refused === true || data.conflict === true;
  if (!refused) return null;
  const errors = Array.isArray(data.errors)
    ? data.errors.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (errors.length > 0) return errors.join("; ");
  for (const key of ["message", "error", "reason"] as const) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "the operation was refused";
}

/**
 * Consume a menu-fired dispatch's outcome. Returns a feedback message (or null
 * for a dispatch type with no observable outcome). NEVER rejects — a transport
 * failure resolves to an honest degraded message so the firing surface can
 * announce it instead of leaking an unhandled rejection.
 */
export async function consumeMenuActionOutcome(
  type: unknown,
  outcome: unknown,
  scope: unknown,
  queryClient: QueryClient = defaultQueryClient,
): Promise<MenuActionOutcome> {
  if (type === OPS_ACTION) {
    try {
      const ops = (await outcome) as OpsResult;
      const reason = opsRefusalReason(ops);
      if (reason !== null) {
        return { ok: false, message: `Couldn't complete that: ${reason}` };
      }
      // Success: refresh the vault-mutation caches so the graph/tree update now,
      // not on the next ~2s watcher rebuild (the ops handler assigns
      // invalidation to the caller).
      invalidateAfterVaultMutation(queryClient, scope);
      return { ok: true, message: "Done." };
    } catch {
      return { ok: false, message: "Couldn't reach the engine - please try again." };
    }
  }
  if (type === COPY_ACTION) {
    try {
      const { ok } = (await outcome) as CopyResult;
      return ok
        ? { ok: true, message: "Copied." }
        : { ok: false, message: "Couldn't copy." };
    } catch {
      return { ok: false, message: "Couldn't copy." };
    }
  }
  return { ok: true, message: null };
}
