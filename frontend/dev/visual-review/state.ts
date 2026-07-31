// The review axes: STATE x THEME, declared once.
//
// The desk renders every specimen across these axes and nothing else. Viewport is
// deliberately NOT an axis here: the application resolves its viewport class from
// `window.matchMedia`, which only a real window (or a framed document) can vary, and
// the four-state review does not need it — compact-shell surfaces are reviewed as
// components, not as a responsive switch.

/** The four states every reviewed component must reach from authored props. */
export const REVIEW_STATES = ["normal", "loading", "empty", "degraded"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

/**
 * On-screen names follow the standard UX-state vocabulary (and Figma's state
 * naming): the first state is "Default". The internal token stays `normal` —
 * internal vocabulary may live in source but never on screen.
 */
export const STATE_LABEL: Record<ReviewState, string> = {
  normal: "Default",
  loading: "Loading",
  empty: "Empty",
  degraded: "Degraded",
};

// Theme is a ROOT-level axis (the desk's theme control), never a per-cell wrapper.
// The public `--color-*` tier is declared on `:root`, where its `var(--semantic-*)`
// references flatten at computed-value time — so a subtree `[data-theme]` wrapper
// remaps the semantic tier while descendants keep inheriting the already-flattened
// root colors: a half-themed, wrong cell. Theming the root is exactly what the
// application's own theme controller does, so the desk switches themes the same way.
