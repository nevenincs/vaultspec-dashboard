import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

export type TextFieldSize = "compact" | "regular";

type TextFieldAccessibleName =
  | {
      /** Accessible name when no separate labeling element owns the field. */
      "aria-label": string;
      "aria-labelledby"?: never;
    }
  | {
      "aria-label"?: never;
      /** Id of the visible element that names the field. */
      "aria-labelledby": string;
    };

export type TextFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className" | "size" | "type"
> &
  TextFieldAccessibleName & {
    /** Visual density only; the field remains a native single-line text input. */
    size?: TextFieldSize;
  };

const BASE =
  "block w-full min-w-0 border border-rule bg-paper text-ink outline-none transition-[border-color,background-color,color,opacity] duration-ui-fast ease-settle placeholder:text-ink-faint hover:border-rule-strong focus-visible:border-rule-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-[invalid=true]:border-state-broken disabled:cursor-not-allowed disabled:bg-paper-sunken disabled:text-ink-faint disabled:opacity-50 read-only:cursor-default read-only:bg-paper-sunken read-only:text-ink-muted";

const SIZE: Record<TextFieldSize, string> = {
  compact: "rounded-fg-xs px-fg-2 py-fg-1 text-body",
  regular: "rounded-fg-md px-fg-3 py-fg-2 text-body",
};

/**
 * The kit's ordinary single-line text input.
 *
 * Search, date, code, and composer entry remain separate semantic controls. This
 * primitive owns only shared field appearance and native input state; callers
 * continue to own values, validation policy, and keyboard behavior.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField({ size = "regular", ...inputProps }, ref) {
    return (
      <input
        {...inputProps}
        ref={ref}
        type="text"
        className={`${BASE} ${SIZE[size]}`}
        data-kit="text-field"
        data-size={size}
      />
    );
  },
);
