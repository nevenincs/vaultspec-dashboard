// Platform/browser-reserved chord denylist (keyboard-shortcut-conflict-review ADR D3).
//
// A flat, hand-maintained set of canonical chord strings that a major browser or OS
// hard-reserves REGARDLESS of `preventDefault` — so a default binding on one of them is
// dead on arrival (the keystroke never reaches the page, or steals a window/OS gesture).
// This is the ONLY mechanism that catches a "collides with the browser" defect, because
// there is nothing in-app to detect: `findConflicts` only sees two in-app bindings collide
// with each other, never one binding colliding with the platform.
//
// The sibling guard (`stores/view/reservedKeybindingDenylist.guard.test.ts`) asserts no
// assembled DEFAULT chord canonicalizes into this set. Maintenance is APPEND-ONLY, an entry
// added only on an independently confirmed reservation; the set is fixed and small (no
// runtime growth, bounded-by-default).
//
// Substrate module (platform layer): no imports from app/, scene/, or stores.
//
// Modifier model note. `Mod` is the platform-primary accelerator: Command on macOS,
// Control elsewhere (see `chord.ts`). The chord model has no macOS-ONLY modifier token, so
// the macOS-only reservations (Cmd+H hide, Cmd+M minimize) are expressed as their `Mod`
// forms (`Mod+H`, `Mod+M`) — which cover them on macOS. On non-macOS those same entries
// resolve to `Ctrl+H`/`Ctrl+M`, which are not OS-reserved there but are harmless to forbid
// as DEFAULTS; the denylist only constrains what we ship, not what a user may bind.

import { canonicalizeChord } from "./chord";

/**
 * Canonical chord strings hard-reserved by a browser or OS. Each entry names the
 * reservation and the browsers/OS it applies to. Canonical form matches `chord.ts`'s
 * `formatChord` (modifiers in `Mod, Ctrl, Alt, Shift` order; single letters upper-cased;
 * digits as-is), so membership is a direct string compare after canonicalization.
 */
const RESERVED_CHORD_LIST: readonly string[] = [
  // Ctrl/Cmd + digit switches the active browser tab (1-8 select by index, 9 selects the
  // last tab) in Chrome, Firefox, Safari, and Edge; intercepted before the page keydown.
  "Mod+1",
  "Mod+2",
  "Mod+3",
  "Mod+4",
  "Mod+5",
  "Mod+6",
  "Mod+7",
  "Mod+8",
  "Mod+9",
  // Ctrl/Cmd+W closes the current tab (all major browsers).
  "Mod+W",
  // Ctrl/Cmd+T opens a new tab (all major browsers).
  "Mod+T",
  // Ctrl/Cmd+N opens a new window (all major browsers).
  "Mod+N",
  // Ctrl/Cmd+Q quits the browser (Cmd+Q on macOS; Ctrl+Q quits Firefox on Linux/Windows).
  "Mod+Q",
  // macOS Cmd+H hides the active application (window-server level; never reaches the page).
  "Mod+H",
  // macOS Cmd+M minimizes the active window (window-server level; never reaches the page).
  "Mod+M",
  // macOS Cmd+Opt+D shows/hides the Dock (Apple system-wide shortcut; window-server level).
  // macOS-only, expressed as its Mod form; harmless to forbid as a default elsewhere
  // (keyboard-shortcut-conflict-review ADR D5, re-review).
  "Mod+Alt+D",
  // Ctrl/Cmd+P opens the browser print dialog; preventability is inconsistent across
  // Firefox/Safari (keyboard-shortcut-conflict-review ADR D5), so it is reserved outright.
  "Mod+P",
  // --- Shift-class chrome-level window/tab management (all page-uninterceptable) -----------
  // Ctrl/Cmd+Shift+P opens a new private window in Firefox (review-caught: it made
  // Mod+Shift+P dead on arrival there, keyboard-shortcut-conflict-review ADR D5).
  "Mod+Shift+P",
  // Ctrl/Cmd+Shift+N opens a new incognito/InPrivate window (Chrome/Edge).
  "Mod+Shift+N",
  // Ctrl/Cmd+Shift+T reopens the last closed tab (Chrome/Firefox/Edge).
  "Mod+Shift+T",
  // Ctrl/Cmd+Shift+W closes the current window (Chrome/Edge; Firefox closes the window).
  "Mod+Shift+W",
  // Ctrl/Cmd+Shift+O opens the Bookmark Manager (Chrome/Edge) / Library (Firefox);
  // chrome-level, page-uninterceptable (keyboard-shortcut-conflict-review ADR D5, review-round).
  "Mod+Shift+O",
  // Ctrl/Cmd+Shift+D bookmarks all open tabs into a new folder (Chrome/Edge); chrome-level,
  // page-uninterceptable (keyboard-shortcut-conflict-review ADR D5, review-round).
  "Mod+Shift+D",
  // --- Devtools openers (browser-level; the page cannot preventDefault them) ---------------
  // Ctrl/Cmd+Shift+I opens Developer Tools (Chrome/Firefox/Edge).
  "Mod+Shift+I",
  // Ctrl/Cmd+Shift+J opens the JavaScript console (Chrome/Edge) / Browser Console (Firefox).
  "Mod+Shift+J",
  // Ctrl/Cmd+Shift+C opens the element inspector/picker (Chrome/Firefox/Edge).
  "Mod+Shift+C",
  // Ctrl/Cmd+Shift+K opens the Web Console in Firefox (review-noted: Mod+Shift+K is unusable).
  "Mod+Shift+K",
];

/** The canonicalized reserved-chord set (built once; malformed literals would surface as
 *  a set miss, but every literal above is authored in canonical form). */
const RESERVED_CHORDS: ReadonlySet<string> = new Set(
  RESERVED_CHORD_LIST.map((chord) => canonicalizeChord(chord) ?? chord),
);

/** The reserved chords in canonical form, for enumeration in tests/tools. */
export function reservedChords(): readonly string[] {
  return [...RESERVED_CHORDS];
}

/**
 * Whether a chord string canonicalizes to a platform/OS-reserved chord. A malformed
 * chord is never reserved (returns false); the caller decides how to treat malformed input.
 */
export function isReservedChord(chord: string): boolean {
  const canonical = canonicalizeChord(chord);
  return canonical !== null && RESERVED_CHORDS.has(canonical);
}
