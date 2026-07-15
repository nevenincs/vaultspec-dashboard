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
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import type { MarkdownFormatCommand } from "./markdownFormatting";

const GLYPH_PX = 16;

interface ToolbarItem {
  command: MarkdownFormatCommand;
  label: MessageDescriptor;
  Icon: LucideIcon;
}

const TOOLBAR_ITEMS: readonly ToolbarItem[] = [
  { command: "bold", label: { key: "documents:editor.actions.bold" }, Icon: Bold },
  {
    command: "italic",
    label: { key: "documents:editor.actions.italic" },
    Icon: Italic,
  },
  {
    command: "code",
    label: { key: "documents:editor.actions.inlineCode" },
    Icon: Code,
  },
  {
    command: "heading",
    label: { key: "documents:editor.actions.heading" },
    Icon: Heading,
  },
  {
    command: "bulletList",
    label: { key: "documents:editor.actions.bulletedList" },
    Icon: List,
  },
  {
    command: "orderedList",
    label: { key: "documents:editor.actions.numberedList" },
    Icon: ListOrdered,
  },
  {
    command: "quote",
    label: { key: "documents:editor.actions.quote" },
    Icon: TextQuote,
  },
  { command: "link", label: { key: "documents:editor.actions.link" }, Icon: LinkIcon },
  {
    command: "wikiLink",
    label: { key: "documents:editor.actions.linkToDocument" },
    Icon: Brackets,
  },
];

export function EditorToolbar({
  onCommand,
  disabled = false,
}: {
  onCommand: (command: MarkdownFormatCommand) => void;
  disabled?: boolean;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const zone = useFocusZone({
    orientation: "horizontal",
    wrap: true,
    activeKey,
    onActiveKeyChange: setActiveKey,
  });
  const toolbarLabel = resolveMessage({
    key: "documents:editor.accessibility.formattingToolbar",
  });

  if (toolbarLabel.usedFallback) return null;

  return (
    <div
      role="toolbar"
      aria-label={toolbarLabel.message}
      aria-orientation="horizontal"
      className="flex items-center gap-fg-0-5"
      data-editor-toolbar
    >
      {TOOLBAR_ITEMS.map(({ command, label, Icon }) => {
        const presentation = resolveMessage(label);
        if (presentation.usedFallback) return null;
        const item = zone.rove(command);
        return (
          <IconButton
            key={command}
            ref={item.ref}
            tabIndex={item.tabIndex}
            onKeyDown={item.onKeyDown}
            label={presentation.message}
            title={presentation.message}
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
