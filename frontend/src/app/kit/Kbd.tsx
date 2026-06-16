// Kbd — the centralized keycap (figma-frontend-rewrite W01.P02.S05; binding kit
// board 135:2). The small monospace key-cap chip used in the command palette and
// the keyboard-shortcuts surface to render a shortcut glyph (e.g. ⌘, K, Esc).
// Surfaces compose this instead of hand-styling a `<kbd>` per frame
// (design-system-is-centralized). Renders the semantic `<kbd>` element, token-pure:
// mono type step, sunken paper ground, subtle rule, small radius.

import type { HTMLAttributes } from "react";

export type KbdProps = HTMLAttributes<HTMLElement>;

export function Kbd({ className = "", children, ...rest }: KbdProps) {
  return (
    <kbd
      className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-fg-xs border border-rule bg-paper-sunken px-fg-1 py-fg-0-5 text-mono text-ink-muted ${className}`.trim()}
      {...rest}
    >
      {children}
    </kbd>
  );
}
