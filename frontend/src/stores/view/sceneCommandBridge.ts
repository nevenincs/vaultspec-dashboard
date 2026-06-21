// Scene-command bridge (mirrors the keymap-overrides reader bridge in queries.ts).
// The graph scene controller lives in the app/scene layer (`getScene()` is reached
// only from app chrome), but the command palette and the keymap dispatcher resolve
// in the stores layer and cannot import it (dashboard-layer-ownership). This
// module is the seam: the app registers a runner once at mount that forwards a
// command object to `getScene().controller.command(...)`, and stores-layer callers
// (palette commands, keymap thunks) invoke `runSceneCommand(...)` without importing
// the scene. The command payload is an opaque object here — the app-side runner
// owns the `SceneCommand` typing — so the stores layer stays free of scene types.

let sceneCommandRunner: ((command: unknown) => void) | null = null;

/** App chrome registers the forwarder once (e.g. at the shell top). Pass null on
 *  teardown so a stale closure never fires after unmount. */
export function setSceneCommandRunner(
  runner: ((command: unknown) => void) | null,
): void {
  sceneCommandRunner = runner;
}

/** Forward a scene command from the stores layer, if a runner is registered. A
 *  no-op before the scene mounts (the command silently drops rather than throws). */
export function runSceneCommand(command: unknown): void {
  sceneCommandRunner?.(command);
}

/** Whether a scene-command runner is currently registered (the graph is mounted). */
export function hasSceneCommandRunner(): boolean {
  return sceneCommandRunner !== null;
}
