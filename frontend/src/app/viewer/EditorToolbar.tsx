// EditorToolbar — the markdown body's formatting affordances
// (document-editor-redesign ADR). A compact row of kit IconButtons carrying the
// two sanctioned families' glyphs (Lucide structural marks); each dispatches the
// pure `applyMarkdownFormat` command over the current selection (the parent owns
// the textarea ref and the draft). It is a single FocusZone tab stop — one roving
// group, arrow/Home/End move within it (Class-B composite navigation), never a
// hand-rolled roving loop (actions-keymap-palette). The command surface is the
// toolbar; keyboard accelerators (Mod+B/I/K) are widget-intrinsic to the editor
// textarea and handled there, not as global keymap chords.

import { useState } from "react";
import {
  Bold,
  Brackets,
  Code,
  Heading,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  type LucideIcon,
  TextQuote,
} from "lucide-react";

import { IconButton } from "../kit";
import { useFocusZone } from "../chrome/useFocusZone";
import type { MarkdownFormatCommand } from "./markdownFormatting";

const GLYPH_PX = 16;

interface ToolbarItem {
  command: MarkdownFormatCommand;
  label: string;
  Icon: LucideIcon;
}

// Ordered by frequency / familiarity: inline emphasis, then structure, then links.
const TOOLBAR_ITEMS: readonly ToolbarItem[] = [
  { command: "bold", label: "Bold", Icon: Bold },
  { command: "italic", label: "Italic", Icon: Italic },
  { command: "code", label: "Inline code", Icon: Code },
  { command: "heading", label: "Heading", Icon: Heading },
  { command: "bulletList", label: "Bulleted list", Icon: List },
  { command: "orderedList", label: "Numbered list", Icon: ListOrdered },
  { command: "quote", label: "Quote", Icon: TextQuote },
  { command: "link", label: "Link", Icon: LinkIcon },
  { command: "wikiLink", label: "Link to document", Icon: Brackets },
];

export function EditorToolbar({
  onCommand,
  disabled = false,
}: {
  onCommand: (command: MarkdownFormatCommand) => void;
  disabled?: boolean;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const zone = useFocusZone({
    orientation: "horizontal",
    wrap: true,
    activeKey,
    onActiveKeyChange: setActiveKey,
  });

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      aria-orientation="horizontal"
      className="flex items-center gap-fg-0-5"
      data-editor-toolbar
    >
      {TOOLBAR_ITEMS.map(({ command, label, Icon }) => {
        const item = zone.rove(command);
        return (
          <IconButton
            key={command}
            ref={item.ref}
            tabIndex={item.tabIndex}
            onKeyDown={item.onKeyDown}
            label={label}
            title={label}
            disabled={disabled}
            // Keep focus in the textarea so the selection the command wraps is not
            // lost to the button; commit on mouse-down before focus moves.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onCommand(command)}
          >
            <Icon size={GLYPH_PX} aria-hidden />
          </IconButton>
        );
      })}
    </div>
  );
}
