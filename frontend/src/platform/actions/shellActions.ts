// Host-shell verbs (dashboard-context-menus ADR, layer 2 / W02.P05): reveal a
// path in the OS file manager, and open a path in the user's editor. These need
// a host bridge the browser does not provide, so they DEGRADE HONESTLY: when no
// host shell is present (the pure web context) the verbs are disabled-with-reason
// in the menu and their handlers return a degraded result rather than firing into
// a void. A desktop host installs `window.vaultspecHost` to enable them.
//
// Substrate module: no imports from app/, scene/, or stores.

import { ExternalLink, FolderOpen } from "lucide-react";

import { logger } from "../logger/logger";
import { appDispatcher } from "../dispatch/middleware";
import {
  normalizeActionDescriptorId,
  normalizeActionDescriptorText,
  type ActionDescriptor,
} from "./action";

const shellLog = logger.child("shell");

/** The desktop host bridge, when one is installed. */
export interface HostShell {
  reveal(path: string): Promise<void>;
  openInEditor(path: string): Promise<void>;
}

declare global {
  interface Window {
    vaultspecHost?: HostShell;
  }
}

export function getHostShell(): HostShell | undefined {
  return globalThis.window?.vaultspecHost;
}

/** True when a desktop host bridge is present (reveal / open-in-editor enabled). */
export function isHostShellAvailable(): boolean {
  return getHostShell() !== undefined;
}

export const REVEAL_ACTION = "action:reveal";
export const OPEN_IN_EDITOR_ACTION = "action:open-in-editor";

export interface ShellPayload {
  path: string;
}

export interface ShellResult {
  ok: boolean;
  /** True when the verb could not run because no host shell is present. */
  degraded?: boolean;
}

function shellActionRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeShellPath(value: unknown): string {
  return normalizeActionDescriptorText(value);
}

export function normalizeShellPayload(payload: unknown): ShellPayload {
  return { path: normalizeShellPath(shellActionRecord(payload).path) };
}

function runShell(verb: "reveal" | "openInEditor", path: string): Promise<ShellResult> {
  const host = getHostShell();
  if (!host) {
    shellLog.info(`${verb} unavailable: no host shell`);
    return Promise.resolve({ ok: false, degraded: true });
  }
  return host[verb](path).then(
    () => ({ ok: true }),
    (error: unknown) => {
      shellLog.warn(`${verb} failed`, { error });
      return { ok: false };
    },
  );
}

appDispatcher.register<ShellPayload>(REVEAL_ACTION, (action) =>
  runShell("reveal", normalizeShellPayload(action.payload).path),
);
appDispatcher.register<ShellPayload>(OPEN_IN_EDITOR_ACTION, (action) =>
  runShell("openInEditor", normalizeShellPayload(action.payload).path),
);

/** Build a "reveal in file manager" action; disabled-with-reason when no host. */
export function revealAction(opts: unknown): ActionDescriptor {
  const record = shellActionRecord(opts);
  const available = isHostShellAvailable();
  return {
    id: normalizeActionDescriptorId(record.id, "reveal"),
    label: { key: "common:actions.showInFileManager" },
    section: "navigate",
    icon: FolderOpen,
    dispatch: { type: REVEAL_ACTION, payload: normalizeShellPayload(record) },
    disabled: !available,
    disabledReason: available
      ? undefined
      : { key: "common:disabledReasons.desktopFileManagerRequired" },
  };
}

/** Build an "open in editor" action; disabled-with-reason when no host. */
export function openInEditorAction(opts: unknown): ActionDescriptor {
  const record = shellActionRecord(opts);
  const available = isHostShellAvailable();
  return {
    id: normalizeActionDescriptorId(record.id, "open-in-editor"),
    label: { key: "common:actions.openInEditor" },
    section: "navigate",
    icon: ExternalLink,
    dispatch: { type: OPEN_IN_EDITOR_ACTION, payload: normalizeShellPayload(record) },
    disabled: !available,
    disabledReason: available
      ? undefined
      : { key: "common:disabledReasons.desktopEditorRequired" },
  };
}
