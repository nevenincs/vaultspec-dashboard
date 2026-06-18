import { useCallback, useEffect, useRef } from "react";

import { parseWorkspaceTabs } from "../view/tabs";
import type { OpenDoc } from "../view/viewStore";
import { useViewStore } from "../view/viewStore";
import type { SessionState } from "./engine";
import {
  mapDefaultScope,
  useActiveScope,
  usePutSession,
  useSession,
  useWorkspaceMap,
} from "./queries";

export interface SessionScopeRestoreInput {
  attempted: boolean;
  pickedScope: string | null;
  sessionReady: boolean;
  persistedScope: string | null | undefined;
  fallbackScope: string | null;
  mutationIdle: boolean;
}

export function deriveSessionScopeRestoreIntent({
  attempted,
  pickedScope,
  sessionReady,
  persistedScope,
  fallbackScope,
  mutationIdle,
}: SessionScopeRestoreInput): string | null {
  if (attempted) return null;
  if (pickedScope) return null;
  if (!sessionReady) return null;
  if (persistedScope) return null;
  if (!fallbackScope) return null;
  if (!mutationIdle) return null;
  return fallbackScope;
}

/**
 * Persist the cold-start default scope ONCE (W04.P09.S29). The effect runs only
 * when the session has loaded with no active scope, the user has not picked one,
 * and a vault-bearing default exists. This is stores-layer session orchestration:
 * app surfaces mount it once, but do not interpret session/map state themselves.
 */
export function useRestoreSessionScope(): void {
  const picked = useViewStore((s) => s.scope);
  const map = useWorkspaceMap();
  const session = useSession();
  const putSession = usePutSession();
  const attemptedRef = useRef(false);

  const persisted = session.data?.active_scope || null;
  const fallback = mapDefaultScope(map);

  useEffect(() => {
    const intent = deriveSessionScopeRestoreIntent({
      attempted: attemptedRef.current,
      pickedScope: picked,
      sessionReady: session.isSuccess,
      persistedScope: persisted,
      fallbackScope: fallback,
      mutationIdle: putSession.isIdle,
    });
    if (!intent) return;
    attemptedRef.current = true;
    putSession.mutate({ active_scope: intent });
  }, [picked, session.isSuccess, persisted, fallback, putSession]);
}

export interface SessionContextSeed {
  workspace: string;
  scope: string | null;
  folder: string | null;
  featureTags: string[];
  /** The restored dock workspace tabs (editor-dock-workspace), parsed from the
   *  durable session `scope_context.workspace_layout`; empty when none saved. */
  openDocs: OpenDoc[];
  /** The restored active tab id, or null. */
  activeDocId: string | null;
}

export interface ScopeContextMirrorInput {
  writeSeq: number;
  currentSeq: number;
  writeScope: string | null;
  activeScope: string | null;
  session: Pick<SessionState, "active_scope" | "scope_context">;
}

export function deriveAcceptedScopeContextMirror({
  writeSeq,
  currentSeq,
  writeScope,
  activeScope,
  session,
}: ScopeContextMirrorInput): Pick<SessionContextSeed, "folder" | "featureTags"> | null {
  if (writeSeq !== currentSeq) return null;
  if (writeScope !== null && activeScope !== writeScope) return null;
  if (writeScope !== null && session.active_scope !== writeScope) return null;
  return {
    folder: session.scope_context.folder,
    featureTags: session.scope_context.feature_tags,
  };
}

export function restoredSessionContextSeed(
  pickedScope: string | null,
  session: SessionState | undefined,
): SessionContextSeed | null {
  if (pickedScope) return null;
  if (!session) return null;
  const restoredTabs = parseWorkspaceTabs(
    session.scope_context.workspace_layout ?? null,
  );
  return {
    workspace: session.active_workspace ?? session.workspace,
    scope: session.active_scope || null,
    folder: session.scope_context.folder,
    featureTags: session.scope_context.feature_tags,
    openDocs: restoredTabs?.openDocs ?? [],
    activeDocId: restoredTabs?.activeDocId ?? null,
  };
}

/**
 * Seed the view store's scope + folder context from the restored session
 * (W04.P09.S30). On the first successful session load it mirrors durable
 * `{ active_scope, scope_context }` into the view store without triggering a
 * wholesale scope-swap reset. Later session refetches cannot clobber in-session
 * edits because this is one-shot per mount.
 */
export function useSeedSessionContext(): void {
  const session = useSession();
  const picked = useViewStore((s) => s.scope);
  const seedFromSession = useViewStore((s) => s.seedFromSession);
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    if (!session.isSuccess) return;
    const seed = restoredSessionContextSeed(picked, session.data);
    if (!seed) return;
    seededRef.current = true;
    seedFromSession(seed);
  }, [picked, session.isSuccess, session.data, seedFromSession]);
}

/** The current folder + feature-tag contexts, read from the view store (the
 *  projection mirrored from the restored session). A pure read — no fetch. */
export function useScopeContextSelection(): {
  folder: string | null;
  featureContexts: string[];
} {
  const folder = useViewStore((s) => s.activeFolder);
  const featureContexts = useViewStore((s) => s.featureContexts);
  return { folder, featureContexts };
}

/**
 * Select the current folder + its feature-tag contexts: persist it durably
 * through the session API (`PUT /session scope_context`), then mirror the
 * accepted session payload into the view store for synchronous reads. The durable
 * home is the session, never localStorage. Returns the mutation so callers can
 * surface a rejected persist.
 */
export function useSelectFolderContext() {
  const activeScope = useActiveScope();
  const setScopeContext = useViewStore((s) => s.setScopeContext);
  const putSession = usePutSession();
  const writeSeqRef = useRef(0);
  const activeScopeRef = useRef(activeScope);
  activeScopeRef.current = activeScope;
  const select = (folder: string | null, featureTags: string[]) => {
    const seq = ++writeSeqRef.current;
    const writeScope = activeScopeRef.current;
    putSession.mutate(
      {
        scope_context: {
          scope: writeScope ?? undefined,
          folder,
          feature_tags: featureTags,
        },
      },
      {
        onSuccess: (session) => {
          const mirror = deriveAcceptedScopeContextMirror({
            writeSeq: seq,
            currentSeq: writeSeqRef.current,
            writeScope,
            activeScope: activeScopeRef.current,
            session,
          });
          if (!mirror) return;
          setScopeContext(mirror);
        },
      },
    );
  };
  return { select, putSession };
}

// --- durable dock workspace-layout seam (editor-dock-workspace) --------------
//
// The dock workspace persists its open-tab layout per scope in the DURABLE
// session `scope_context.workspace_layout` (SQLite-backed, survives reload AND
// engine restart). These are the stores-layer SEAMS the `app/` workspace consumes
// so it never touches `useSession`/`usePutSession` raw (dashboard-layer-ownership:
// session orchestration lives behind a stores seam).

/** Read the durable per-scope workspace-layout blob from the session. The session
 *  serves the ACTIVE scope's context, so the blob is returned only when the asked
 *  scope IS the active scope (a context for another scope must never seed this
 *  one); `settled` is true once the session query has resolved for that scope. */
export function useDurableWorkspaceLayout(scope: string | null): {
  blob: string | null;
  settled: boolean;
} {
  const session = useSession();
  // The session ALWAYS serves the ACTIVE scope's context, and the dock workspace
  // shows the active scope, so return its layout blob once the session has loaded
  // and a scope is set. (An earlier strict `session.active_scope === scope` gate
  // blocked restore during the load window, where the view-store `scope` had not
  // yet settled to the session's active scope — the live-verified restore miss.)
  return {
    blob: scope ? (session.data?.scope_context.workspace_layout ?? null) : null,
    settled: session.isSuccess && !!scope,
  };
}

/** A stable callback that durably persists a scope's workspace-layout blob through
 *  the session API (`PUT /session set_workspace_layout`), merged engine-side so it
 *  preserves the folder/feature-tag context. The workspace coalesces calls. */
export function usePersistWorkspaceLayout(): (scope: string, blob: string) => void {
  const putSession = usePutSession();
  return useCallback(
    (scope: string, blob: string) => {
      void putSession
        .mutateAsync({ set_workspace_layout: { scope, layout: blob } })
        .catch(() => undefined);
    },
    [putSession],
  );
}
