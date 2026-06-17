// Kit Button (figma-frontend-rewrite W01.P02 — binding Figma component kit board
// "Design System — Components" 135:2, Button symbol Variant=Primary/Secondary/
// Ghost/Danger × State=Default/Hover/Disabled). The single centralized text-button
// definition every surface composes from, so a "button on screen" always means a
// real shared definition rather than a hand-built rounded-rect (design-system-is-
// centralized).
//
// Variants map to the binding token tier:
//   primary   — the single muted accent fill (accent base → hover), accent ink.
//   secondary — a ruled paper-raised button (border + sunken hover).
//   ghost     — no chrome until hover (sunken tint), for inline/toolbar actions.
//   danger    — the sacred remove/diff-red, reserved for destructive verbs.
// Hover/disabled are CSS-driven; geometry/padding/radius/type read tokens only.

import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className"
> {
  /** The visual variant (default "secondary"). */
  variant?: ButtonVariant;
  /** Button label / content. */
  children: ReactNode;
}

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-fg-1-5 rounded-fg-md px-fg-3 py-fg-1-5 text-body font-medium transition-colors duration-ui-fast ease-settle outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-paper hover:bg-accent-hover disabled:hover:bg-accent",
  secondary:
    "border border-rule bg-paper-raised text-ink hover:bg-paper-sunken hover:border-rule-strong disabled:hover:bg-paper-raised",
  ghost: "text-ink-muted hover:bg-paper-sunken hover:text-ink",
  danger:
    "border border-rule bg-paper-raised text-diff-remove hover:bg-paper-sunken hover:border-rule-strong",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", type = "button", children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${BASE} ${VARIANT[variant]}`}
      data-kit="button"
      data-variant={variant}
      {...rest}
    >
      {children}
    </button>
  );
});
