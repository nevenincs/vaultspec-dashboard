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
import type { ActionDescriptor } from "./action";

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

const UNAVAILABLE_REASON = "not available in the browser";

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
  runShell("reveal", action.payload?.path ?? ""),
);
appDispatcher.register<ShellPayload>(OPEN_IN_EDITOR_ACTION, (action) =>
  runShell("openInEditor", action.payload?.path ?? ""),
);

/** Build a "reveal in file manager" action; disabled-with-reason when no host. */
export function revealAction(opts: { id: string; path: string }): ActionDescriptor {
  const available = isHostShellAvailable();
  return {
    id: opts.id,
    label: "Reveal in file manager",
    section: "navigate",
    icon: FolderOpen,
    dispatch: { type: REVEAL_ACTION, payload: { path: opts.path } },
    disabled: !available,
    disabledReason: available ? undefined : UNAVAILABLE_REASON,
  };
}

/** Build an "open in editor" action; disabled-with-reason when no host. */
export function openInEditorAction(opts: {
  id: string;
  path: string;
}): ActionDescriptor {
  const available = isHostShellAvailable();
  return {
    id: opts.id,
    label: "Open in editor",
    section: "navigate",
    icon: ExternalLink,
    dispatch: { type: OPEN_IN_EDITOR_ACTION, payload: { path: opts.path } },
    disabled: !available,
    disabledReason: available ? undefined : UNAVAILABLE_REASON,
  };
}
