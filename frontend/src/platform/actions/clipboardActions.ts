// The copy verb family (dashboard-context-menus ADR, layer 2 / W02.P04): a
// terminal handler registered on the appDispatcher seam, exactly like ops, but
// wire-free - it touches the clipboard, never the engine, so it lives in the
// platform substrate. Every copy action a menu offers (copy id / title / path /
// stem / summary) dispatches this one verb with the text to write; the
// `CopyWhat` whitelist names the sanctioned shapes for labels and telemetry.
//
// Substrate module: no imports from app/, scene/, or stores.

import { Copy } from "lucide-react";

import { appDispatcher } from "../dispatch/middleware";
import { resolveMessage, type MessageTranslator } from "../localization/fallback";
import {
  normalizeMessageDescriptor,
  type MessageDescriptor,
  type MessageKey,
} from "../localization/message";
import { localization } from "../localization/runtime";
import { logger } from "../logger/logger";
import {
  normalizeActionDescriptorId,
  normalizeActionDescriptorText,
  type ActionDescriptor,
} from "./action";

const clipboardLog = logger.child("clipboard");

/** The sanctioned copy shapes (the brief's "copy whitelist"). */
export type CopyWhat = "id" | "title" | "path" | "stem" | "summary";

export const COPY_ACTION = "action:copy";

export type CopyPayload =
  | {
      readonly text: string;
      readonly message?: never;
      /** What the text represents - for labels and trace, never alters behaviour. */
      readonly what?: CopyWhat;
    }
  | {
      /** Catalog-owned clipboard content, resolved only by the terminal effect. */
      readonly message: MessageDescriptor;
      readonly text?: never;
      /** What the text represents - for labels and trace, never alters behaviour. */
      readonly what?: CopyWhat;
    };

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
const COPY_ACTION_MESSAGE_KEYS = [
  "common:actions.copy",
  "common:actions.copyCategoryName",
  "common:actions.copyDocumentName",
  "common:actions.copyFeatureTag",
  "common:actions.copyPath",
  "common:actions.copySummary",
  "common:actions.copyTitle",
] as const satisfies readonly MessageKey[];
const COPY_ACTION_MESSAGE_KEY_SET: ReadonlySet<string> = new Set(
  COPY_ACTION_MESSAGE_KEYS,
);
const DEFAULT_COPY_ACTION_LABEL = Object.freeze({
  key: "common:actions.copy",
}) satisfies MessageDescriptor<"common:actions.copy">;

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

/** Accept only one exact clipboard-content lane: raw text or a localized message. */
export function isCopyPayload(value: unknown): value is CopyPayload {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  let prototype: object | null;
  let keys: readonly PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
    keys = Reflect.ownKeys(value);
  } catch {
    return false;
  }
  if (prototype !== Object.prototype && prototype !== null) return false;

  const fields = new Map<string, unknown>();
  for (const key of keys) {
    if (typeof key !== "string") return false;
    if (key !== "text" && key !== "message" && key !== "what") return false;
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return false;
    }
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor)
    ) {
      return false;
    }
    fields.set(key, descriptor.value);
  }

  const what = fields.get("what");
  if (what !== undefined && normalizeCopyWhat(what) !== what) {
    return false;
  }
  const hasText = fields.has("text");
  const hasMessage = fields.has("message");
  if (hasText === hasMessage) return false;
  return hasText
    ? typeof fields.get("text") === "string"
    : normalizeMessageDescriptor(fields.get("message")) !== null;
}

export function normalizeCopyPayload(payload: unknown): CopyPayload | null {
  if (!isCopyPayload(payload)) return null;
  const what = normalizeCopyWhat(payload.what);
  if (typeof payload.text === "string") {
    return {
      text: payload.text,
      ...(what === undefined ? {} : { what }),
    };
  }
  const message = normalizeMessageDescriptor(payload.message);
  return message === null
    ? null
    : {
        message,
        ...(what === undefined ? {} : { what }),
      };
}

/** Resolve catalog-owned content against the active locale at clipboard execution. */
export function resolveCopyPayloadText(
  payload: unknown,
  translator: MessageTranslator = localization,
): string | null {
  const normalized = normalizeCopyPayload(payload);
  if (normalized === null) return null;
  return "message" in normalized
    ? resolveMessage(translator, normalized.message)
    : normalized.text;
}

function normalizeCopyActionLabel(value: unknown): MessageDescriptor {
  const normalized = normalizeMessageDescriptor(value);
  return normalized !== null &&
    normalized.values === undefined &&
    COPY_ACTION_MESSAGE_KEY_SET.has(normalized.key)
    ? normalized
    : DEFAULT_COPY_ACTION_LABEL;
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
  const text = resolveCopyPayloadText(action.payload);
  if (text === null) return Promise.resolve({ ok: false } satisfies CopyResult);
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
  const what = normalizeCopyWhat(record.what);
  const payload: CopyPayload = {
    text: normalizeActionDescriptorText(record.text),
    ...(what === undefined ? {} : { what }),
  };
  return {
    id: normalizeActionDescriptorId(record.id, "copy"),
    label: normalizeCopyActionLabel(record.label),
    section: "copy",
    icon: Copy,
    dispatch: { type: COPY_ACTION, payload },
  };
}

/** Build a copy action whose content resolves from a typed message at execution. */
export function copyLocalizedMessageAction(opts: unknown): ActionDescriptor {
  const record = copyRecord(opts);
  const what = normalizeCopyWhat(record.what);
  const payload = normalizeCopyPayload({
    message: record.message,
    ...(what === undefined ? {} : { what }),
  });
  return {
    id: normalizeActionDescriptorId(record.id, "copy"),
    label: normalizeCopyActionLabel(record.label),
    section: "copy",
    icon: Copy,
    dispatch: { type: COPY_ACTION, payload },
  };
}
