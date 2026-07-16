// StepCheckMark — the centralized plan-step completion mark. A filled disc + check
// for a done step, a hollow ring for an open one: the grayscale-by-shape identity
// (icons-come-from-the-two-sanctioned-families) shared by the right-rail step tree
// AND the markdown reader's plan task-list, so a step reads the same in both places
// (design-system-is-centralized). Display-only, prop-driven; carries
// `data-step-check`/`data-done` so a host (the reader's done-row treatment) can
// style around it via CSS.

const MARK_PX = 14;
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";

export interface StepCheckMarkProps {
  /** Whether the step is complete (filled disc + check) or open (hollow ring). */
  done: boolean;
  /** Square size in CSS px for the SVG box. Defaults to 14. */
  size?: number;
}

export function StepCheckMark({ done, size = MARK_PX }: StepCheckMarkProps) {
  const resolveMessage = useLocalizedMessageResolver();
  return (
    <span
      role="img"
      aria-label={
        resolveMessage({
          key: done ? "common:kit.stepStates.complete" : "common:kit.stepStates.open",
        }).message
      }
      data-step-check
      data-done={done}
      className={`inline-flex shrink-0 items-center justify-center ${
        done ? "text-state-complete" : "text-ink-faint"
      }`}
    >
      <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
        <circle
          cx={7}
          cy={7}
          r={5.5}
          // Filled disc vs hollow ring is the grayscale-by-shape identity.
          fill={done ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={done ? 0 : 1.4}
        />
        {done && (
          <path
            d="M4.3 7.2 6.1 9 9.7 5"
            fill="none"
            stroke="var(--color-paper-raised)"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </span>
  );
}
