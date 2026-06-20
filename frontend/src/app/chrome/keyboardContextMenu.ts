export interface ContextMenuAnchor {
  x: number;
  y: number;
}

export interface KeyboardContextMenuEvent<T extends HTMLElement> {
  key: string;
  shiftKey: boolean;
  currentTarget: T;
  preventDefault: () => void;
}

/** ContextMenu key and Shift+F10 are the shared keyboard entry points. */
export function isKeyboardContextMenuEvent(
  event: Pick<KeyboardContextMenuEvent<HTMLElement>, "key" | "shiftKey">,
): boolean {
  return event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
}

/** Keyboard context menus anchor to the current row's bottom-left corner. */
export function keyboardContextMenuAnchor(element: HTMLElement): ContextMenuAnchor {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.bottom };
}

export function handleKeyboardContextMenu<T extends HTMLElement>(
  event: KeyboardContextMenuEvent<T>,
  openAt: (anchor: ContextMenuAnchor) => void,
): boolean {
  if (!isKeyboardContextMenuEvent(event)) return false;
  event.preventDefault();
  openAt(keyboardContextMenuAnchor(event.currentTarget));
  return true;
}
