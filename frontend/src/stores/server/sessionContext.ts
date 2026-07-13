import { useCallback, useEffect, useRef } from "react";

import { normalizeWorkspaceLayoutBlob, parseWorkspaceTabs } from "../view/tabs";
import type { OpenDoc } from "../view/viewStore";
import {
  normalizeViewStoreSessionString,
  normalizeViewStoreSessionStringList,
  useViewStore,
} from "../view/viewStore";
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

interface SessionScopeContextRuntime {
  folder?: unknown;
  feature_tags?: unknown;
  workspace_layout?: unknown;
}

interface SessionContextRuntime {
  workspace?: unknown;
  active_scope?: unknown;
  active_workspace?: unknown;
  scope_context?: SessionScopeContextRuntime | null;
  recents?: unknown;
  tiers?: unknown;
}

export interface ScopeContextMirrorInput {
  writeSeq: number;
  currentSeq: number;
  writeScope: unknown;
  activeScope: unknown;
  session: SessionContextRuntime;
}

export function deriveAcceptedScopeContextMirror({
  writeSeq,
  currentSeq,
  writeScope,
  activeScope,
  session,
}: ScopeContextMirrorInput): Pick<SessionContextSeed, "folder" | "featureTags"> | null {
  const context = session.scope_context ?? {};
  const normalizedWriteScope = normalizeViewStoreSessionString(writeScope);
  const normalizedActiveScope = normalizeViewStoreSessionString(activeScope);
  const normalizedSessionScope = normalizeViewStoreSessionString(session.active_scope);
  if (writeSeq !== currentSeq) return null;
  if (normalizedWriteScope !== null && normalizedActiveScope !== normalizedWriteScope) {
    return null;
  }
  if (
    normalizedWriteScope !== null &&
    normalizedSessionScope !== normalizedWriteScope
  ) {
    return null;
  }
  return {
    folder: normalizeViewStoreSessionString(context.folder),
    featureTags: normalizeViewStoreSessionStringList(context.feature_tags),
  };
}

export function restoredSessionContextSeed(
  pickedScope: unknown,
  session: SessionContextRuntime | undefined,
): SessionContextSeed | null {
  if (normalizeViewStoreSessionString(pickedScope) !== null) return null;
  if (!session) return null;
  const context = session.scope_context ?? {};
  // The scope_context blob is stored per-scope, so its tabs' provable origin is the
  // session's active scope — bind scope-less/v1 tabs to it, never ambient (audit
  // finding 1).
  const restoredTabs = parseWorkspaceTabs(
    context.workspace_layout ?? null,
    session.active_scope,
  );
  return {
    workspace:
      normalizeViewStoreSessionString(session.active_workspace) ??
      normalizeViewStoreSessionString(session.workspace) ??
      "",
    scope: normalizeViewStoreSessionString(session.active_scope),
    folder: normalizeViewStoreSessionString(context.folder),
    featureTags: normalizeViewStoreSessionStringList(context.feature_tags),
    openDocs: restoredTabs?.openDocs ?? [],
    activeDocId: restoredTabs?.activeDocId ?? null,
  };
}

export interface DurableWorkspaceLayoutView {
  blob: string | null;
  settled: boolean;
}

export interface DurableWorkspaceLayoutWrite {
  scope: string | null;
  blob: string | null;
}

export interface ScopeContextWrite {
  scope: string | null;
  folder: string | null;
  featureTags: string[];
}

export function normalizeScopeContextWrite(
  scope: unknown,
  folder: unknown,
  featureTags: unknown,
): ScopeContextWrite {
  return {
    scope: normalizeViewStoreSessionString(scope),
    folder: normalizeViewStoreSessionString(folder),
    featureTags: normalizeViewStoreSessionStringList(featureTags),
  };
}

export function normalizeDurableWorkspaceLayoutWrite(
  scope: unknown,
  blob: unknown,
): DurableWorkspaceLayoutWrite {
  return {
    scope: normalizeViewStoreSessionString(scope),
    blob: normalizeWorkspaceLayoutBlob(blob),
  };
}

export function deriveDurableWorkspaceLayoutView(
  scope: unknown,
  sessionReady: boolean,
  session: SessionContextRuntime | undefined,
): DurableWorkspaceLayoutView {
  const normalizedScope = normalizeViewStoreSessionString(scope);
  const activeScope = normalizeViewStoreSessionString(session?.active_scope);
  const context = session?.scope_context ?? {};
  const scopeAccepted = normalizedScope !== null && activeScope === normalizedScope;
  return {
    blob: scopeAccepted ? normalizeWorkspaceLayoutBlob(context.workspace_layout) : null,
    settled: sessionReady && scopeAccepted,
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
  const mirrorSessionScopeContext = useViewStore((s) => s.mirrorSessionScopeContext);
  const seededRef = useRef(false);
  // The active scope this hook last attributed context to, so a REMOTE flip while
  // still unpicked re-attributes rather than leaving stale folder/features.
  const seededScopeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session.isSuccess) return;
    // `restoredSessionContextSeed` returns null once the user has PICKED a scope
    // (they are pinned; a remote flip must not move them). While unpicked it returns
    // the current active scope's context.
    const seed = restoredSessionContextSeed(picked, session.data);
    if (!seed) return;
    if (!seededRef.current) {
      seededRef.current = true;
      seededScopeRef.current = seed.scope;
      seedFromSession(seed);
      return;
    }
    // Already seeded once and STILL unpicked: if the observed active scope changed
    // (a remote flip on the shared session), re-mirror folder/features to the new
    // scope's context so they are not interpreted under a foreign ambient scope
    // (audit finding 3 — attribution over reset). A LIGHT re-mirror only: it does not
    // pin the scope or reseed tabs (finding 1 owns the restored tabs' origin), so it
    // stays the minimal fix within scope.
    if (seededScopeRef.current !== seed.scope) {
      seededScopeRef.current = seed.scope;
      mirrorSessionScopeContext({ folder: seed.folder, featureTags: seed.featureTags });
    }
  }, [
    picked,
    session.isSuccess,
    session.data,
    seedFromSession,
    mirrorSessionScopeContext,
  ]);
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
  const select = (folder: unknown, featureTags: unknown) => {
    const seq = ++writeSeqRef.current;
    const write = normalizeScopeContextWrite(
      activeScopeRef.current,
      folder,
      featureTags,
    );
    if (write.scope === null) return;
    putSession.mutate(
      {
        scope_context: {
          scope: write.scope,
          folder: write.folder,
          feature_tags: write.featureTags,
        },
      },
      {
        onSuccess: (session) => {
          const mirror = deriveAcceptedScopeContextMirror({
            writeSeq: seq,
            currentSeq: writeSeqRef.current,
            writeScope: write.scope,
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
export function useDurableWorkspaceLayout(scope: unknown): DurableWorkspaceLayoutView {
  const session = useSession();
  return deriveDurableWorkspaceLayoutView(scope, session.isSuccess, session.data);
}

/** A stable callback that durably persists a scope's workspace-layout blob through
 *  the session API (`PUT /session set_workspace_layout`), merged engine-side so it
 *  preserves the folder/feature-tag context. The workspace coalesces calls. */
export function usePersistWorkspaceLayout(): (scope: unknown, blob: unknown) => void {
  const putSession = usePutSession();
  return useCallback(
    (scope: unknown, blob: unknown) => {
      const write = normalizeDurableWorkspaceLayoutWrite(scope, blob);
      if (write.scope === null || write.blob === null) return;
      void putSession
        .mutateAsync({
          set_workspace_layout: { scope: write.scope, layout: write.blob },
        })
        .catch(() => undefined);
    },
    [putSession],
  );
}
