// Reset-layout bridge (background-context-menus, review HIGH-2 fix). The FULL layout
// reset = resetShellLayout() PLUS the dashboard-state panel resets (left/right collapse,
// right tab) which run through the scope-bound `useShellPanelIntent` hook — available only
// in a React component, not in a non-hook context-menu resolver. AppShell registers the
// runner once; the background menu's `resetLayoutAction` invokes it through this seam,
// mirroring sceneCommandBridge. This guarantees the menu's "Reset layout" is byte-identical
// to the palette's `window:reset-layout` (one id, one behavior — unified-action-plane),
// rather than the weaker bare `resetShellLayout` it called before.

let resetLayoutRunner: (() => void) | null = null;

/** Register the full-reset runner (AppShell, where the panel-intent hook lives). */
export function setResetLayoutRunner(runner: (() => void) | null): void {
  resetLayoutRunner = runner;
}

/** Run the full layout reset; a no-op before the shell mounts the runner. */
export function runResetLayout(): void {
  resetLayoutRunner?.();
}
