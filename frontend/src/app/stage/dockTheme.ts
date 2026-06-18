// The dock workspace theme (editor-dock-workspace P01). Owns dockview's base
// stylesheet import (Vite JS-imported CSS, so it sidesteps the CSS @import
// ordering trap in `styles.css`) and the single custom `DockviewTheme` whose
// class binds dockview's `--dv-*` surface to the OKLCH `--color-*` token tier
// (the remap lives in `styles.css` under `.dockview-theme-vaultspec`). Because
// the token tier already flips per `[data-theme]`, ONE theme serves light /
// dark / high-contrast — no per-theme dockview object.
//
// Layer law: this is `app/` chrome composing the centralized token tier, not a
// bespoke restyle (design-system-is-centralized,
// themes-are-oklch-generated-from-a-token-tier).

import "dockview/dist/styles/dockview.css";

import type { DockviewTheme } from "dockview";

/** The vaultspec dock theme: a class hook whose `--dv-*` values resolve through
 *  the OKLCH semantic tier remapped in `styles.css`. `gap: 0` keeps panels flush
 *  with the surrounding shell; `colorScheme` is only a hint dockview uses for a
 *  couple of built-in adornments — the real colors come from the token tier. */
export const vaultspecDockTheme: DockviewTheme = {
  name: "vaultspec",
  className: "dockview-theme-vaultspec",
  gap: 0,
};
