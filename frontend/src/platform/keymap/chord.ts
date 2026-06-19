// The normalized chord primitive (keyboard-action-system ADR, decision 5 / F6).
//
// A `Chord` is the one canonical representation of a keyboard shortcut. Today
// the ~29 scattered key handlers each compare raw `event.key` plus modifier
// booleans inline; this module replaces that with a single parse/format/match
// primitive whose canonical string form is reused identically by the default
// catalog, the persisted override map, the dispatcher's lookup key, the `?`
// legend keycaps, and the `accelerator` hint already on `ActionDescriptor`.
//
// Substrate module (platform layer): no imports from app/, scene/, or stores.
//
// Modifier model. We expose `Mod` - the platform-primary accelerator that means
// Command on macOS and Control elsewhere - plus explicit `Ctrl`, `Alt`, and
// `Shift`. `Mod` is the recommended modifier for portable shortcuts (so `Mod+K`
// is Cmd+K on a Mac and Ctrl+K on Windows/Linux from one declaration); explicit
// `Ctrl` is for the rare binding that must be Control even on a Mac. On
// non-macOS, `Mod` and `Ctrl` both resolve to the Control key, which is correct
// and expected.

/** The recognized modifier tokens, in canonical render order. */
export const MODIFIER_TOKENS = ["Mod", "Ctrl", "Alt", "Shift"] as const;

/**
 * A normalized keyboard chord: a set of required modifiers plus one normalized
 * key. Construct via `parseChord`; never hand-build, so the key normalization
 * invariant (single letters lower-cased, named keys canonical-cased) always
 * holds.
 */
export interface Chord {
  /** Platform-primary accelerator: Command on macOS, Control elsewhere. */
  readonly mod: boolean;
  /** Explicit Control, independent of `mod` (distinct from `mod` only on macOS). */
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  /**
   * The normalized key: a single printable character lower-cased (`"k"`, `"["`,
   * `"?"`), or a named key in its canonical DOM casing (`"ArrowLeft"`,
   * `"Escape"`, `"Enter"`, `"Tab"`, `"Home"`, `"Space"`).
   */
  readonly key: string;
}

/** The minimal slice of a KeyboardEvent the matcher reads. Eases testing. */
export interface ChordEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

let detectedIsMac: boolean | null = null;

/**
 * Whether the host is macOS, where `Mod` is Command rather than Control. Read
 * once from the navigator and cached; falls back to `false` (Control) in
 * non-browser contexts. Pass `isMac` explicitly to the matcher in tests.
 */
export function defaultIsMac(): boolean {
  if (detectedIsMac !== null) return detectedIsMac;
  const nav: unknown = typeof navigator === "undefined" ? undefined : navigator;
  let platform = "";
  if (nav && typeof nav === "object") {
    const n = nav as { platform?: string; userAgent?: string };
    platform = `${n.platform ?? ""} ${n.userAgent ?? ""}`;
  }
  detectedIsMac = /\bMac|iPhone|iPad|iPod\b/i.test(platform);
  return detectedIsMac;
}

/** Test seam: force the cached macOS detection (or clear it with `null`). */
export function setIsMacForTesting(value: boolean | null): void {
  detectedIsMac = value;
}

/**
 * Normalize a raw DOM key value into the chord canonical form. Single printable
 * characters are lower-cased so `"K"` and `"k"` canonicalize together; the space
 * key becomes `"Space"`; every other (named) key keeps its DOM casing.
 */
export function normalizeKey(raw: string): string {
  if (raw === " " || raw === "Spacebar" || raw.toLowerCase() === "space")
    return "Space";
  if (raw.length === 1) return raw.toLowerCase();
  return raw;
}

/** A key that is a single non-alphanumeric printable character (e.g. `?`, `[`). */
function isSymbolKey(key: string): boolean {
  return key.length === 1 && !/[a-z0-9]/.test(key);
}

/**
 * Parse a chord string (`"Mod+Shift+K"`, `"ArrowLeft"`, `"?"`, `"Space"`) into a
 * `Chord`, or return `null` when it is malformed (empty, no key, an empty
 * segment, or more than one non-modifier token). Parsing is case-insensitive for
 * modifier tokens and single-letter keys; the result is always canonical. The
 * space key is written `"Space"` (a bare `" "` is also accepted); `"+"` is the
 * segment separator and is not itself bindable.
 */
export function parseChord(input: string): Chord | null {
  if (input === " ") {
    return { mod: false, ctrl: false, alt: false, shift: false, key: "Space" };
  }
  const trimmed = input.trim();
  if (trimmed === "") return null;

  let mod = false;
  let ctrl = false;
  let alt = false;
  let shift = false;
  const keys: string[] = [];

  for (const part of trimmed.split("+").map((p) => p.trim())) {
    if (part === "") return null; // an empty segment ("Mod+", "++") is malformed
    const lower = part.toLowerCase();
    if (lower === "mod" || lower === "cmd" || lower === "command" || lower === "meta") {
      mod = true;
    } else if (lower === "ctrl" || lower === "control") {
      ctrl = true;
    } else if (lower === "alt" || lower === "option" || lower === "opt") {
      alt = true;
    } else if (lower === "shift") {
      shift = true;
    } else {
      keys.push(part);
    }
  }

  if (keys.length !== 1) return null;
  const key = normalizeKey(keys[0]);
  // H1: a symbol key (?, [, {, ...) bakes its shifted state into the character
  // the browser reports, so Shift is NOT part of its identity. The matcher skips
  // the shift comparison for symbol keys, and the recorder may capture shiftKey
  // true for a shifted symbol - so we strip shift HERE at parse time too, making
  // record, store, conflict-check, and match all share ONE identity
  // ("Shift+?" canonicalizes to "?"). Without this the recorder could persist
  // "Shift+?" while the matcher fires it on a bare "?", a silent divergence.
  const shiftForKey = isSymbolKey(key) ? false : shift;
  return { mod, ctrl, alt, shift: shiftForKey, key };
}

/** The display form of the key portion: single letters upper-cased for legibility. */
function displayKey(key: string): string {
  if (key.length === 1 && /[a-z]/.test(key)) return key.toUpperCase();
  return key;
}

/**
 * The canonical string form of a chord, used as the lookup key everywhere.
 * Modifiers render in fixed order (`Mod`, `Ctrl`, `Alt`, `Shift`) so two chords
 * that differ only in author ordering format identically.
 */
export function formatChord(chord: Chord): string {
  const tokens: string[] = [];
  if (chord.mod) tokens.push("Mod");
  if (chord.ctrl) tokens.push("Ctrl");
  if (chord.alt) tokens.push("Alt");
  if (chord.shift) tokens.push("Shift");
  tokens.push(displayKey(chord.key));
  return tokens.join("+");
}

/** Canonicalize a chord string (parse then format); `null` when malformed. */
export function canonicalizeChord(input: string): string | null {
  const chord = parseChord(input);
  return chord === null ? null : formatChord(chord);
}

/**
 * Split a canonical chord string into ordered display keycaps for the legend and
 * the settings recorder (e.g. `"Mod+Shift+K"` -> `["Mod","Shift","K"]`). The
 * `Mod` token renders as the platform-primary accelerator symbol — `"⌘"` on
 * macOS, `"Ctrl"` elsewhere — so the legend reads true to the host; every other
 * token (including a named key like `"ArrowLeft"`) renders verbatim. A chord that
 * fails to canonicalize yields a single keycap of its raw text so a corrupt entry
 * is shown honestly rather than dropped.
 */
export function chordToKeycaps(
  chordString: string,
  isMac: boolean = defaultIsMac(),
): string[] {
  const canonical = canonicalizeChord(chordString);
  if (canonical === null) return [chordString];
  const modSymbol = isMac ? "⌘" : "Ctrl";
  return canonical.split("+").map((token) => (token === "Mod" ? modSymbol : token));
}

/**
 * Whether a keyboard event satisfies a chord. Modifier matching is exact after
 * resolving `Mod` to the platform key: on macOS `Mod` requires Command, else it
 * requires Control. The shift comparison is intentionally skipped for symbol
 * keys (e.g. `?`, `{`) because the shifted state is already baked into the
 * character the browser reports, so requiring Shift would double-count it.
 */
export function matchesChord(
  chord: Chord,
  event: ChordEvent,
  isMac: boolean = defaultIsMac(),
): boolean {
  const expectMeta = chord.mod && isMac;
  const expectCtrl = (chord.mod && !isMac) || chord.ctrl;
  if (event.metaKey !== expectMeta) return false;
  if (event.ctrlKey !== expectCtrl) return false;
  if (event.altKey !== chord.alt) return false;
  if (!isSymbolKey(chord.key) && event.shiftKey !== chord.shift) return false;
  return normalizeKey(event.key) === chord.key;
}
