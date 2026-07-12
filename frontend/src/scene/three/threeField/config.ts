// Decomposed from threeField.ts (module-decomposition mandate, 2026-07-12).

import { controlNumber } from "../graphControlSchema";

// Pointer hit tolerance in screen px at the 16px rem basis; UI-scaled at use.
// Tweakable constants are read FROM the canonical control registry
// (graphControlSchema) so each has exactly ONE definition — never a schema entry plus
// a duplicate local const (the exact drift the registry exists to kill). Same values,
// single source of truth.
export const PICK_RADIUS_PX = controlNumber("pickRadiusPx");
/** Gentle restart alpha for a warm-started (mostly-carried-over) layout — low so
 *  persistent nodes barely move while new nodes settle in (object constancy). */
export const WARM_START_ALPHA = controlNumber("warmStartAlpha");
/** Live-retune kick: the gentle re-energise for a force/size slider — re-settle in
 *  place, never the old violent global 0.5 re-explode. */
export const GENTLE_REHEAT_ALPHA = controlNumber("gentleReheatAlpha");
/** Cold-start alpha + prewarm caps, schema-read here for the set-data energy
 *  dispatch (proportional warm ramp toward cold; frozen swaps prep zero ticks). */
export const COLD_START_ALPHA = controlNumber("coldAlpha");
export const PREWARM_MAX_TICKS = controlNumber("prewarmMaxTicks");
export const PREWARM_BUDGET_MS = controlNumber("prewarmBudgetMs");
/** Fit padding: a fixed, UI-scaled pixel margin reserved on EVERY edge when framing, so
 *  the framed graph never touches the canvas rim. A true pixel gap (zoom-independent),
 *  unlike a fractional factor whose apparent margin shrinks as the graph span grows; the
 *  framed bounds already cover node BODIES (graphBounds/fitToNodes expand by node radius),
 *  so this is clear space beyond the outermost node bodies. */
export const FIT_PADDING_PX = controlNumber("fitPaddingPx");
/** Fractional inset of the minimap overview from the minimap canvas edges. */
export const MINIMAP_INSET = controlNumber("minimapInset");
// Camera zoom band + step factors. This is the LIVE field clamp (cameraCore's
// MIN/MAX_SCALE is the retired Camera-class path; the registry names that drift).
export const ZOOM_MIN = controlNumber("zoomMin");
export const ZOOM_MAX = controlNumber("zoomMax");
export const ZOOM_STEP_BUTTON = controlNumber("zoomStepButton");
export const ZOOM_STEP_WHEEL = controlNumber("zoomStepWheel");
/** Trackpad pinch zoom sensitivity: factor = exp(-deltaY × this) per pinch wheel event. */
export const PINCH_ZOOM_SENSITIVITY = controlNumber("pinchZoomSensitivity");
// Autoframe (graph-autoframe): poll the graph bounds on an INTERVAL (not every frame) and
// ease the camera to the fit when the frame drifts beyond a deadband — never per-frame, so
// it can't fight the settle or jitter. Local interaction-tuning constants (dimensionless /
// ms), mirroring NODE_RECEDE_HOVER etc.; not user-tunable look params.
export const AUTOFRAME_POLL_MS = 400; // bounds-poll cadence while autoframe is on
export const AUTOFRAME_EASE = 0.16; // per-frame lerp toward the target (smooth, not a snap)
export const AUTOFRAME_DEADBAND = 0.07; // min fractional frame change (center/zoom) to re-target
export const AUTOFRAME_SETTLE_EPS = 0.004; // within this fraction of target → snap + stop easing
// Label LOD + ring treatment (read from the registry; one definition each).
export const LABEL_BUDGET = controlNumber("labelBudget");
export const PULSE_RING_WIDTH = controlNumber("pulseRingWidth");
export const PULSE_RING_ALPHA = controlNumber("pulseRingAlpha");
// Emphasis-state grammar (2026-07-03 graph-representation ADR): the three interaction
// states differentiate by GRAMMAR, not hue. De-emphasis stays COLOUR-ONLY at full opacity
// (a non-focus node mixes toward the canvas background, node material uDimColor =
// canvasBackground; focus nodes keep full category colour; edges keep their category
// GRADIENT in every mode, no recolour; no glow, no near-black) — but the recede DEPTH now
// encodes the state: a transient hover recedes shallow, a durable selection (node ring or
// feature-cluster spotlight) recedes deeper so it reads as the stronger state. The recede
// is CONTINUOUS and eased (aDim carries the current mix fraction, tweened toward its
// per-node target each frame) so every state change cross-fades instead of popping;
// prefers-reduced-motion snaps instantly.
export const NODE_RECEDE_HOVER = 0.3; // shallow non-focus mix while a transient hover is active
export const NODE_RECEDE_SELECT = 0.5; // deeper non-focus mix under a durable selection/spotlight
// Exponential-ease time constant for the emphasis cross-fade: ~95% settled in ~3τ ≈ 210ms
// (the design motion window). Dimensionless attribute tween, not a user-tunable look param.
export const EMPHASIS_FADE_TAU_MS = 70;
// Render-time position smoothing (graph-simulation-stability reference — the Quartz
// mechanism): the displayed position eases toward the physics position by this fraction
// per frame while anything is in motion, time-averaging Barnes-Hut/anneal jitter before
// it reaches the screen; the settle then GLIDES out over ~15 frames instead of popping.
// Fixed legibility constants, not user-tunable look params.
export const DISPLAY_LERP_K = 0.12; // display → physics fraction per frame
export const DISPLAY_SNAP_EPS = 0.01; // world units: within this of truth → snap exact + stop
// Fixed-timestep sim accumulator: the solver targets 60 ticks/s in wall-clock terms —
// a slow renderer runs bounded catch-up ticks per frame so anneal/stall budgets and the
// felt settle duration stop depending on the frame rate.
export const SIM_TICK_MS = 1000 / 60;
export const SIM_MAX_CATCHUP_TICKS = 3;
export const FOCUS_RING_WIDTH_PX = 2; // thin accent focus ring on the hovered hub
// Cluster-selection perimeter fence (emphasis-state-grammar ADR): the positive marker of
// the durable feature-cluster selection — a convex padded hull (rounded n-gon) traced
// around the visible cohort on the 2D overlay. Pad beyond the largest member's screen
// radius; hairline accent stroke over a whisper fill; alpha rides the emphasis ease.
export const FENCE_PAD_PX = 12; // padding beyond the largest member radius (screen px at UI scale 1)
export const FENCE_STROKE_WIDTH_PX = 1.5; // fence perimeter stroke width
export const FENCE_STROKE_ALPHA = 0.85; // stroke opacity at full fence presence
export const FENCE_FILL_ALPHA = 0.06; // whisper interior fill (skipped under perf degradation)
// Max canvas label width before ellipsis (screen px at UI scale 1; multiplied by
// uiScale at draw). The bare canvas label is ELIDED here so an over-long title can
// never paint an unbounded line across the field — the FULL title lives in the DOM
// HoverCard (binding graph-ui "Label … truncated with ellipsis, full title in the
// HoverCard"). A fixed legibility threshold, not a user-tunable look param.
export const LABEL_MAX_WIDTH_PX = 200;
// Interactive (hover/select/pin) labels render as a design PILL — a rounded, paper-filled
// chip with a hairline scene-rule border, not naked text — so the focused label reads as a
// deliberate design element above the field (ambient DOI labels stay plate-less). The text
// is SANITIZED (whitespace collapsed, control chars stripped) and elided to a FIXED max
// character length before the width fit, so a pathological title can never blow the chip
// out. Screen-px at UI scale 1, multiplied by uiScale at draw.
export const LABEL_MAX_CHARS = 48; // fixed sanitized character cap for an interactive label
export const LABEL_PILL_PAD_X_PX = 7; // horizontal padding inside the pill
export const LABEL_PILL_PAD_Y_PX = 3; // vertical padding inside the pill
export const LABEL_PILL_GAP_PX = 6; // gap from the node body to the pill
// Icon mode (graph-node-icons): the circle ↔ doc-type-icon cross-fade by on-screen
// node size. Below LO the node is a plain dot (an icon would be sub-legible — the marks
// are gated at 14px); above HI it is the full icon; between, the two cross-fade. The
// icon quad is drawn a touch larger than the dot it replaces so the silhouette reads.
// Local render constants (mirroring NODE_RECEDE_HOVER / FOCUS_RING_WIDTH_PX above), not
// schema knobs — they are fixed legibility thresholds, not user-tunable look params.
// Icon-INSIDE-circle (graph-icon-inside-circle): the doc-type icon is drawn WITHIN the
// filled disc as one composite mark, so its half-extent is a FRACTION of the node radius
// (≈62% of the disc DIAMETER) — padded inside the rim, not larger than the disc.
export const ICON_SIZE_MULT = 0.7; // icon half-extent vs node radius (~70% diameter, inside the disc)
// Icon LOD fade: the inner icon fades in by ON-SCREEN node radius. Tuned LOW so icon mode
// is actually VISIBLE at normal zoom — a 1214-node graph fit to the viewport clamps every
// node to ~1.5–4px on screen, so the old 6/12px thresholds meant the icon NEVER appeared
// until the user zoomed deep into a cluster (the "icon mode does nothing" regression #39).
// At these values a node fully shows its icon by ~4px (the fit-zoom hub size) and fades out
// only for sub-legible specks below ~2px.
export const ICON_FADE_LO_PX = 2; // node radius (screen px) where the inner icon begins to appear
export const ICON_FADE_HI_PX = 4; // ...and is fully shown
// Bounded GL-context-restore retries (bounded-by-default): after this many failed rebuilds
// on webglcontextrestored, the scene reports render-unavailable (recoverable:false).
export const MAX_GL_RESTORE_ATTEMPTS = 3;
// Defense-in-depth node ceiling for set-data (Rule 2: every CLIENT wire-ingestion point
// bounds + reports, never trusting the upstream cap). Mirrors the stores adapter's
// MAX_CLIENT_GRAPH_NODES (20000) — set well above any real graph; the scene clamps its OWN
// boundary so an oversized/regressed/direct payload can't exhaust GPU memory.
export const MAX_SCENE_NODES = 20000;
// FPS-adaptive LOD hysteresis band (perf hardening): degrade above a ~25fps-equivalent
// per-frame render cost, restore below ~45fps — the gap prevents flapping between tiers.
export const PERF_DEGRADE_MS = 40;
export const PERF_RESTORE_MS = 22;
