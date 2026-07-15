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
import { resolveKeycapPresentations } from "../../platform/keymap/chord";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import {
  closeKeyboardShortcuts,
  useKeyboardShortcutsGlobalToggle,
  useKeyboardShortcutGroups,
  useKeyboardShortcutsOpen,
} from "../../stores/view/keyboardShortcuts";

function keycapIdentity(shortcutId: string, index: number): string {
  return `${shortcutId}:keycap:${index}`;
}

export function KeyboardShortcuts() {
  const open = useKeyboardShortcutsOpen();
  const shortcutGroups = useKeyboardShortcutGroups();
  const resolveMessage = useLocalizedMessageResolver();
  useKeyboardShortcutsGlobalToggle();

  return (
    <Dialog
      open={open}
      onClose={closeKeyboardShortcuts}
      title={resolveMessage({ key: "common:shortcutDialog.title" }).message}
      description={resolveMessage({ key: "common:shortcutDialog.description" }).message}
    >
      <div className="flex flex-col gap-fg-4 px-fg-4 pt-fg-3 pb-fg-4">
        {shortcutGroups.map((group) => {
          const groupLabel = resolveMessage(group.label).message;
          return (
            <section key={group.id} className="flex flex-col gap-fg-1">
              <SectionLabel>{groupLabel}</SectionLabel>
              <ul className="flex flex-col">
                {group.shortcuts.map((shortcut) => {
                  const shortcutLabel = resolveMessage(shortcut.label).message;
                  const keycaps = resolveKeycapPresentations(
                    shortcut.keys,
                    resolveMessage,
                  );
                  return (
                    <li key={shortcut.id}>
                      <ListRow
                        trailing={keycaps.map((key, index) => (
                          <Kbd key={keycapIdentity(shortcut.id, index)}>{key}</Kbd>
                        ))}
                      >
                        {shortcutLabel}
                      </ListRow>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </Dialog>
  );
}
