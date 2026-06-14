// Status stamp — the PURE mapping from a node's authority/lifecycle status to a
// grayscale-safe stamp TREATMENT (node-visual-richness prototype). This is the
// shape channel for status: a ring weight, a ghost (dimmed) reading, a slash, a
// severity dot, or a tier notch — never hue. Tint only ever REINFORCES the
// treatment through `stampToken` (the CSS custom-property NAME); shape carries.
//
// The module is intentionally free of Pixi and DOM so it is fully unit-testable
// and can drive both a future sprite-anatomy integration and the prototype's
// DOM/SVG mock. It mirrors the existing field discipline (`nodeSprites.ts`,
// `progressRing.ts`): the GEOMETRY/SEMANTICS are pure and unit-tested; the
// rendering layer (deferred) maps the descriptor onto sprites.
//
// The authoritative status table (node-visual-richness spec):
//   adr:      proposed→provisional, accepted→affirmed, rejected→negated,
//             deprecated→retired.
//   plan:     tier L1..L4 → tiered ordinal 1..4 (rollout is a SEPARATE channel,
//             the progress ring/bar — not a stamp).
//   audit:    critical→graded ord 4, high→3, medium→2, low→1.
//   rule:     active→affirmed, superseded→retired (value `superseded` ⇒ slash).
//   feature:  in_flight→affirmed, archived→retired.
//   missing/unparseable → no stamp (the all-empty descriptor).

/** The six status equivalence classes the stamp treatment is keyed on. */
export type StatusClass =
  | "affirmed"
  | "provisional"
  | "negated"
  | "retired"
  | "graded"
  | "tiered";

/**
 * A node's resolved status, as the engine would carry it. `value` is the raw
 * vocabulary term (e.g. `accepted`, `superseded`, `critical`); `class` is its
 * resolved equivalence class; `ordinal` carries the graded severity (4..1) or
 * the tier rank (1..4) where the class needs a magnitude.
 */
export interface NodeStatus {
  readonly value?: string;
  readonly class?: StatusClass;
  /** graded: 4..1 (critical→low); tiered: 1..4 (L1→L4). Absent otherwise. */
  readonly ordinal?: number;
}

/**
 * The grayscale-safe stamp TREATMENT — the shape channel for status. Every
 * field is shape, never hue: a ring weight, a ghost (dimmed) reading, a slash,
 * a severity dot fill level, or a stepped tier notch.
 */
export interface StampDescriptor {
  /** Ring weight around the node: solid (affirmed), dashed (provisional), none. */
  readonly ring?: "solid" | "dashed" | "none";
  /** Dim the node to a ghost reading (retired / archived / deprecated). */
  readonly ghost: boolean;
  /** Strike the node through (negated / superseded). */
  readonly slash: boolean;
  /** Severity dot fill level 0..4 (graded); 0 = absent. */
  readonly severityDot?: 0 | 1 | 2 | 3 | 4;
  /** Stepped tier notch 1..4 (tiered). Absent otherwise. */
  readonly tierNotch?: 1 | 2 | 3 | 4;
}

/** The all-empty descriptor: no stamp (absent / unparseable status). */
const NO_STAMP: StampDescriptor = { ghost: false, slash: false };

/** Clamp an ordinal into the inclusive 1..4 range used by both magnitude classes. */
function clampOrdinal(ordinal: number | undefined): 1 | 2 | 3 | 4 | 0 {
  if (!Number.isFinite(ordinal)) return 0;
  const n = Math.round(ordinal as number);
  if (n <= 0) return 0;
  if (n >= 4) return 4;
  return n as 1 | 2 | 3;
}

/**
 * Map a resolved status to its stamp treatment. The table is exact:
 *
 *   affirmed    → solid ring
 *   provisional → dashed ring
 *   negated     → slash (no ring)
 *   retired     → ghost, no ring; if value is `superseded`, ALSO slash
 *                 (a superseded rule is both retired AND negated — the engine
 *                 sends class `retired` with value `superseded`)
 *   graded      → severity dot at the ordinal fill level (1..4; 0 absent)
 *   tiered      → tier notch at the ordinal rank (1..4)
 *
 * An absent or unclassifiable status yields the all-empty descriptor (no stamp).
 */
export function stampFor(status: NodeStatus | undefined): StampDescriptor {
  if (!status || !status.class) return NO_STAMP;
  switch (status.class) {
    case "affirmed":
      return { ring: "solid", ghost: false, slash: false };
    case "provisional":
      return { ring: "dashed", ghost: false, slash: false };
    case "negated":
      return { ring: "none", ghost: false, slash: true };
    case "retired":
      // A retired node ghosts (dims) and carries no ring. The one compound case
      // is a SUPERSEDED rule: the engine sends class `retired` value `superseded`
      // to mean "retired AND negated", so the ghost ALSO gains a slash.
      return {
        ring: "none",
        ghost: true,
        slash: status.value === "superseded",
      };
    case "graded":
      return { ghost: false, slash: false, severityDot: clampOrdinal(status.ordinal) };
    case "tiered": {
      const notch = clampOrdinal(status.ordinal);
      return notch === 0
        ? { ghost: false, slash: false }
        : { ghost: false, slash: false, tierNotch: notch };
    }
    default:
      return NO_STAMP;
  }
}

/**
 * The CSS custom-property NAME whose tint REINFORCES a status class — never the
 * load-bearing channel (shape carries; this only echoes it). Returns a token
 * name string; the caller resolves it against the live cascade.
 *
 *   affirmed    → --color-state-active   (a settled, live node)
 *   retired     → --color-state-archived (the muted warm gray of the archived)
 *   negated     → --color-state-archived (struck-through reads as retired tint)
 *   provisional → --color-status-provisional (a tentative warm-neutral)
 *   graded      → --color-status-graded      (a severity-bearing warm hue)
 *   tiered      → --color-status-tiered       (the tier-rank reinforcement)
 *
 * The `--color-status-*` names are defined prototype-locally (the prototype
 * scopes them in its own stylesheet) to stay collision-free with the in-flight
 * token work in `styles.css`; the names are stable and a post-merge integration
 * can promote them into the shared semantic tier.
 */
export function stampToken(cls: StatusClass | undefined): string {
  switch (cls) {
    case "affirmed":
      return "--color-state-active";
    case "retired":
    case "negated":
      return "--color-state-archived";
    case "provisional":
      return "--color-status-provisional";
    case "graded":
      return "--color-status-graded";
    case "tiered":
      return "--color-status-tiered";
    default:
      return "--color-ink-muted";
  }
}
