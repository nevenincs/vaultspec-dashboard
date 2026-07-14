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
import {
  legacyActionPresentation,
  normalizeActionDescriptorId,
  normalizeActionDescriptorLabel,
  normalizeActionDescriptorText,
  type ActionDescriptor,
} from "./action";

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

const COPY_WHAT_VALUES: readonly CopyWhat[] = [
  "id",
  "title",
  "path",
  "stem",
  "summary",
];
const COPY_WHAT_SET = new Set<string>(COPY_WHAT_VALUES);

function copyRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeCopyWhat(value: unknown): CopyWhat | undefined {
  return typeof value === "string" && COPY_WHAT_SET.has(value)
    ? (value as CopyWhat)
    : undefined;
}

export function normalizeCopyPayload(payload: unknown): CopyPayload {
  const record = copyRecord(payload);
  const what = normalizeCopyWhat(record.what);
  return {
    text: normalizeActionDescriptorText(record.text),
    ...(what === undefined ? {} : { what }),
  };
}

/** The one clipboard write that works in a NON-SECURE context: a hidden textarea
 *  + `document.execCommand("copy")`, fired synchronously within the user-gesture
 *  stack. `navigator.clipboard` is undefined on plain-http origins (anything but
 *  https / localhost / 127.0.0.1), which is our canonical network origin — so
 *  without this fallback every copy is a silent no-op off localhost (KAR-002). */
function execCommandCopy(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  const active = document.activeElement as HTMLElement | null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", ""); // avoid the mobile soft keyboard
  textarea.style.position = "fixed";
  textarea.style.top = "-624.9375rem";
  textarea.style.left = "-624.9375rem";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (error) {
    clipboardLog.warn("execCommand copy failed", { error });
  }
  document.body.removeChild(textarea);
  active?.focus?.(); // restore focus to the triggering surface
  return ok;
}

/** Write text to the clipboard. Prefers the async Clipboard API (secure
 *  contexts); falls back to the hidden-textarea `execCommand` path — the only
 *  mechanism that works on the non-secure plain-http origin the dashboard is
 *  served from (KAR-002/003: the previously-advertised fallback did not exist). */
async function writeClipboard(text: string): Promise<boolean> {
  if (globalThis.navigator?.clipboard?.writeText) {
    try {
      await globalThis.navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      // Secure context but the write was rejected — try execCommand as a
      // best-effort (it may be past the gesture after the await, but costs
      // nothing to attempt).
      clipboardLog.warn("clipboard.writeText failed; trying execCommand", { error });
    }
  }
  return execCommandCopy(text);
}

// Register the terminal effect once at module load (the ops handler pattern).
appDispatcher.register<CopyPayload>(COPY_ACTION, (action) => {
  const text = normalizeCopyPayload(action.payload).text;
  return writeClipboard(text).then((ok) => ({ ok }) satisfies CopyResult);
});

/** Dispatch a copy directly (non-menu callers). */
export function dispatchCopy(payload: unknown): Promise<CopyResult> {
  return appDispatcher.dispatch({
    type: COPY_ACTION,
    payload: normalizeCopyPayload(payload),
  }) as Promise<CopyResult>;
}

/** Build a copy action descriptor for a menu's copy section. */
export function copyAction(opts: unknown): ActionDescriptor {
  const record = copyRecord(opts);
  const payload = normalizeCopyPayload(record);
  return {
    id: normalizeActionDescriptorId(record.id, "copy"),
    label: legacyActionPresentation(
      normalizeActionDescriptorLabel(record.label, "Copy"),
    ),
    section: "copy",
    icon: Copy,
    dispatch: { type: COPY_ACTION, payload },
  };
}
