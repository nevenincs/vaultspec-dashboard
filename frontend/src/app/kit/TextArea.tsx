import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";

export type TextAreaSize = "compact" | "regular";
export type TextAreaResize = "none" | "vertical";

type TextAreaAccessibleName =
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

export type TextAreaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "className"
> &
  TextAreaAccessibleName & {
    /** Visual density; row count remains a native textarea concern. */
    size?: TextAreaSize;
    /** Layout-safe resize behavior. Horizontal growth is intentionally excluded. */
    resize?: TextAreaResize;
  };

const BASE =
  "block w-full min-w-0 border border-rule bg-paper text-ink outline-none transition-[border-color,background-color,color,opacity] duration-ui-fast ease-settle placeholder:text-ink-faint hover:border-rule-strong focus-visible:border-rule-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-[invalid=true]:border-state-broken disabled:cursor-not-allowed disabled:bg-paper-sunken disabled:text-ink-faint disabled:opacity-50 read-only:cursor-default read-only:bg-paper-sunken read-only:text-ink-muted";

const SIZE: Record<TextAreaSize, string> = {
  compact: "rounded-fg-xs px-fg-2 py-fg-1 text-body",
  regular: "rounded-fg-md px-fg-3 py-fg-2 text-body",
};

const RESIZE: Record<TextAreaResize, string> = {
  none: "resize-none",
  vertical: "resize-y",
};

/**
 * The kit's ordinary multiline text field.
 *
 * Code editing, composer entry, and specialized overlay mechanics remain with
 * their owning surfaces. This primitive owns shared field appearance and native
 * textarea state without adding keyboard, measurement, or submission behavior.
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea({ size = "regular", resize = "vertical", ...textareaProps }, ref) {
    return (
      <textarea
        {...textareaProps}
        ref={ref}
        className={`${BASE} ${SIZE[size]} ${RESIZE[resize]}`}
        data-kit="text-area"
        data-size={size}
        data-resize={resize}
      />
    );
  },
);
