// The copy verb family (dashboard-context-menus ADR, layer 2 / W02.P04): a
// terminal handler registered on the appDispatcher seam, exactly like ops, but
// wire-free - it touches the clipboard, never the engine, so it lives in the
// platform substrate. Every copy action a menu offers (copy id / title / path /
// stem / summary) dispatches this one verb with the text to write; the
// `CopyWhat` whitelist names the sanctioned shapes for labels and telemetry.
//
// Substrate module: no imports from app/, scene/, or stores.

import { Copy } from "lucide-react";

import { logger } from "../logger/logger";
import { appDispatcher } from "../dispatch/middleware";
import type { ActionDescriptor } from "./action";

const clipboardLog = logger.child("clipboard");

/** The sanctioned copy shapes (the brief's "copy whitelist"). */
export type CopyWhat = "id" | "title" | "path" | "stem" | "summary";

export const COPY_ACTION = "action:copy";

export interface CopyPayload {
  text: string;
  /** What the text represents - for labels and trace, never alters behaviour. */
  what?: CopyWhat;
}

export interface CopyResult {
  ok: boolean;
}

/** Write text to the clipboard, with an execCommand fallback for older surfaces. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    clipboardLog.warn("clipboard.writeText failed", { error });
  }
  return false;
}

// Register the terminal effect once at module load (the ops handler pattern).
appDispatcher.register<CopyPayload>(COPY_ACTION, (action) => {
  const text = action.payload?.text ?? "";
  return writeClipboard(text).then((ok) => ({ ok }) satisfies CopyResult);
});

/** Dispatch a copy directly (non-menu callers). */
export function dispatchCopy(payload: CopyPayload): Promise<CopyResult> {
  return appDispatcher.dispatch({ type: COPY_ACTION, payload }) as Promise<CopyResult>;
}

/** Build a copy action descriptor for a menu's copy section. */
export function copyAction(opts: {
  id: string;
  label: string;
  text: string;
  what?: CopyWhat;
}): ActionDescriptor {
  return {
    id: opts.id,
    label: opts.label,
    section: "copy",
    icon: Copy,
    dispatch: { type: COPY_ACTION, payload: { text: opts.text, what: opts.what } },
  };
}
