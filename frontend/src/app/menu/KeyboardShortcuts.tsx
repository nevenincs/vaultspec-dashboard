// The keyboard-shortcuts surface (figma-frontend-rewrite W03.P09.S13; binding
// Figma board KeyboardShortcuts 104:39). A lifted cheat-sheet that names the
// keyboard contract the app already implements — it is a pure projection of the
// real handlers, never an invented list: the command-palette toggle
// (CommandPalette), the arrow-walk / playhead-step keys (KeyboardNav), and the
// dismiss / activate / context-menu conventions the overlays share.
//
// Self-contained like the command palette: it owns its open state and a global
// "?" listener (suppressed inside form fields), and reuses the shared modal
// Dialog for the scrim, focus trap, and Escape/backdrop dismiss. Every row is a
// centralized kit primitive — SectionLabel group headers, ListRow rows, Kbd
// keycaps (design-system-is-centralized) — so the surface re-themes with the kit.
//
// Layer ownership (dashboard-layer-ownership): app-chrome only; it reads no wire
// state, issues no fetch, and reads no raw `tiers` block. It is a static legend.

import { useEffect, useState } from "react";

import { Kbd, ListRow, SectionLabel } from "../kit";
import { Dialog } from "../chrome/Dialog";

/** One shortcut: a human label and the ordered keycaps that trigger it. */
interface Shortcut {
  label: string;
  keys: string[];
}

/** A named group of shortcuts (rendered under a SectionLabel). */
interface ShortcutGroup {
  name: string;
  shortcuts: Shortcut[];
}

// The binding contract, transcribed from the live handlers so the legend can
// never drift from what the app actually does.
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    name: "General",
    shortcuts: [
      { label: "Open the command palette", keys: ["Ctrl", "K"] },
      { label: "Show keyboard shortcuts", keys: ["?"] },
      { label: "Dismiss the overlay or menu", keys: ["Esc"] },
    ],
  },
  {
    name: "Graph & selection",
    shortcuts: [
      { label: "Cycle the selection's neighbours", keys: ["←", "→"] },
      { label: "Cycle the feature constellations", keys: ["↑", "↓"] },
      { label: "Activate the focused item", keys: ["Enter"] },
      { label: "Open the context menu", keys: ["Right-click"] },
    ],
  },
  {
    name: "Timeline",
    shortcuts: [{ label: "Step the timeline playhead", keys: ["[", "]"] }],
  },
];

function isFormTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && /^(input|textarea|select)$/i.test(target.tagName)
  );
}

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);

  // Global "?" opens the legend. Form fields keep the key (so typing "?" in the
  // palette query or a setting field is unaffected); modifier combos are ignored.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isFormTarget(e.target)) return;
      if (e.key === "?") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Keyboard shortcuts"
      description="The keys this dashboard listens for. Press ? to toggle this legend."
    >
      <div className="flex flex-col gap-fg-4 px-fg-4 pt-fg-3 pb-fg-4">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.name} className="flex flex-col gap-fg-1">
            <SectionLabel>{group.name}</SectionLabel>
            <ul className="flex flex-col">
              {group.shortcuts.map((shortcut) => (
                <li key={shortcut.label}>
                  <ListRow
                    trailing={shortcut.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  >
                    {shortcut.label}
                  </ListRow>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
