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

import {
  type MessageDescriptor,
  type MessageKey,
  normalizeMessageDescriptor,
} from "../localization/message";

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

export const MAX_KEYCAP_PRESENTATIONS = MODIFIER_TOKENS.length + 1;
const MAX_KEYCAP_LITERAL_CODE_UNITS = 32;
const MAX_KEYCAP_DISPLAY_CHORD_CHARS = 256;

export interface LiteralKeycapPresentation {
  readonly kind: "literal";
  readonly value: string;
}

/** Locale-independent display data for one visible keyboard keycap. */
export type KeycapPresentation = LiteralKeycapPresentation | MessageDescriptor;

const KEYCAP_MESSAGE_KEYS = {
  Alt: "common:keycaps.alt",
  ArrowDown: "common:keycaps.arrowDown",
  ArrowLeft: "common:keycaps.arrowLeft",
  ArrowRight: "common:keycaps.arrowRight",
  ArrowUp: "common:keycaps.arrowUp",
  Backspace: "common:keycaps.backspace",
  Ctrl: "common:keycaps.control",
  Delete: "common:keycaps.delete",
  End: "common:keycaps.end",
  Enter: "common:keycaps.enter",
  Escape: "common:keycaps.escape",
  Home: "common:keycaps.home",
  Insert: "common:keycaps.insert",
  PageDown: "common:keycaps.pageDown",
  PageUp: "common:keycaps.pageUp",
  Shift: "common:keycaps.shift",
  Space: "common:keycaps.space",
  Tab: "common:keycaps.tab",
} as const satisfies Readonly<Record<string, MessageKey>>;

const keyGraphemeSegmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function isSingleGrapheme(value: string): boolean {
  if (value.length === 0 || value.length > MAX_KEYCAP_LITERAL_CODE_UNITS) return false;
  return keyGraphemeSegmenter === null
    ? Array.from(value).length === 1
    : Array.from(keyGraphemeSegmenter.segment(value)).length === 1;
}

function isPrintableKeyGrapheme(value: string): boolean {
  const hasUnsafeFormat = Array.from(value).some(
    (character) => /\p{Cf}/u.test(character) && character !== "\u200d",
  );
  return (
    isSingleGrapheme(value) &&
    !/[\p{Cc}\p{Cs}\p{Z}]/u.test(value) &&
    !hasUnsafeFormat &&
    (!value.includes("\u200d") || /\p{Extended_Pictographic}/u.test(value)) &&
    /[\p{L}\p{N}\p{P}\p{S}]/u.test(value)
  );
}

function literalKeycap(value: string): LiteralKeycapPresentation | null {
  const safe =
    value === "⌘" ||
    /^F(?:[1-9]|1\d|2[0-4])$/u.test(value) ||
    isPrintableKeyGrapheme(value);
  return safe ? Object.freeze({ kind: "literal", value }) : null;
}

/** Normalize one keycap presentation without evaluating accessors or coercing data. */
export function normalizeKeycapPresentation(value: unknown): KeycapPresentation | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  let kind: PropertyDescriptor | undefined;
  let literal: PropertyDescriptor | undefined;
  try {
    kind = Object.getOwnPropertyDescriptor(value, "kind");
    literal = Object.getOwnPropertyDescriptor(value, "value");
  } catch {
    return null;
  }
  if (kind !== undefined || literal !== undefined) {
    if (
      kind === undefined ||
      literal === undefined ||
      !("value" in kind) ||
      !("value" in literal) ||
      kind.value !== "literal" ||
      typeof literal.value !== "string"
    ) {
      return null;
    }
    return literalKeycap(literal.value);
  }
  return normalizeMessageDescriptor(value);
}

/** Normalize one bounded accelerator/keycap sequence. */
export function normalizeKeycapPresentations(
  value: unknown,
): readonly KeycapPresentation[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_KEYCAP_PRESENTATIONS
  ) {
    return null;
  }
  const normalized: KeycapPresentation[] = [];
  for (const item of value) {
    const presentation = normalizeKeycapPresentation(item);
    if (presentation === null) return null;
    normalized.push(presentation);
  }
  return Object.freeze(normalized);
}

export interface KeycapMessageResolution {
  readonly message: string;
  readonly usedFallback: boolean;
}

/** Resolve keycaps at a rendering boundary; any missing message hides the hint. */
export function resolveKeycapPresentations(
  presentations: readonly KeycapPresentation[],
  resolveMessage: (descriptor: MessageDescriptor) => KeycapMessageResolution,
): readonly string[] {
  const labels: string[] = [];
  for (const presentation of presentations) {
    if ("kind" in presentation) {
      labels.push(presentation.value);
      continue;
    }
    const resolved = resolveMessage(presentation);
    if (resolved.usedFallback) return [];
    labels.push(resolved.message);
  }
  return Object.freeze(labels);
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

/** Modifier-only DOM keys that never finish a chord on their own. */
const MODIFIER_ONLY_EVENT_KEYS = new Set([
  "Control",
  "Meta",
  "Alt",
  "Shift",
  "AltGraph",
  "OS",
]);

/**
 * Build the canonical chord string represented by a keyboard event, or `null`
 * when the event is only a modifier key press. Used by recorder seams so event
 * capture, persisted overrides, conflict checks, and dispatch all share one
 * parse/format identity.
 */
export function chordStringFromEvent(event: ChordEvent): string | null {
  if (MODIFIER_ONLY_EVENT_KEYS.has(event.key)) return null;
  const tokens: string[] = [];
  if (event.metaKey) tokens.push("Mod");
  if (event.ctrlKey) tokens.push("Ctrl");
  if (event.altKey) tokens.push("Alt");
  if (event.shiftKey) tokens.push("Shift");
  tokens.push(event.key);
  return canonicalizeChord(tokens.join("+"));
}

/**
 * Project a canonical chord into locale-independent keycap presentations. `Mod`
 * remains the platform-primary accelerator: Command on macOS and localized
 * Control elsewhere. Known named keys use semantic catalog messages; printable
 * keys, symbols, and function keys use bounded literal presentations. Malformed
 * or unknown display tokens fail closed so raw chord data never reaches the UI.
 */
export function chordToKeycaps(
  chordString: string,
  isMac: boolean = defaultIsMac(),
): readonly KeycapPresentation[] {
  if (chordString.length > MAX_KEYCAP_DISPLAY_CHORD_CHARS) return [];
  const canonical = canonicalizeChord(chordString);
  if (canonical === null) return [];
  const presentations: KeycapPresentation[] = [];
  for (const token of canonical.split("+")) {
    if (token === "Mod") {
      const presentation = isMac
        ? literalKeycap("⌘")
        : ({ key: KEYCAP_MESSAGE_KEYS.Ctrl } satisfies MessageDescriptor);
      if (presentation === null) return [];
      presentations.push(presentation);
      continue;
    }
    const messageKey = KEYCAP_MESSAGE_KEYS[token as keyof typeof KEYCAP_MESSAGE_KEYS];
    if (messageKey !== undefined) {
      presentations.push({ key: messageKey });
      continue;
    }
    const literal = literalKeycap(token);
    if (literal === null) return [];
    presentations.push(literal);
  }
  return Object.freeze(presentations);
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
