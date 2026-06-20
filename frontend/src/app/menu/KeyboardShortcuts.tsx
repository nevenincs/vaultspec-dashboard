// The keyboard-shortcuts surface (figma-frontend-rewrite W03.P09.S13; binding
// Figma board KeyboardShortcuts 104:39). A lifted cheat-sheet that names the
// keyboard contract the app already implements — it is a pure projection of the
// real handlers, never an invented list: the command-palette toggle
// (CommandPalette), the arrow-walk / playhead-step keys (KeyboardNav), and the
// dismiss / activate / context-menu conventions the overlays share.
//
// Store-owned like the command palette: its open state is shared view chrome,
// while the "?" toggle is registered as a bindable action through the central
// keymap dispatcher. It reuses the shared modal Dialog for the scrim, focus trap,
// and Escape/backdrop dismiss. Every row is a centralized kit primitive —
// SectionLabel group headers, ListRow rows, Kbd keycaps
// (design-system-is-centralized) — so the surface re-themes with the kit.
//
// Layer ownership (dashboard-layer-ownership): app-chrome only; it reads no wire
// state, issues no fetch, and reads no raw `tiers` block. It is a static legend.

import { Kbd, ListRow, SectionLabel } from "../kit";
import { Dialog } from "../chrome/Dialog";
import {
  closeKeyboardShortcuts,
  useKeyboardShortcutsGlobalToggle,
  useKeyboardShortcutGroups,
  useKeyboardShortcutsOpen,
} from "../../stores/view/keyboardShortcuts";

export function KeyboardShortcuts() {
  const open = useKeyboardShortcutsOpen();
  const shortcutGroups = useKeyboardShortcutGroups();
  useKeyboardShortcutsGlobalToggle();

  return (
    <Dialog
      open={open}
      onClose={closeKeyboardShortcuts}
      title="Keyboard shortcuts"
      description="The keys this dashboard listens for. Press ? to toggle this legend."
    >
      <div className="flex flex-col gap-fg-4 px-fg-4 pt-fg-3 pb-fg-4">
        {shortcutGroups.map((group) => (
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
