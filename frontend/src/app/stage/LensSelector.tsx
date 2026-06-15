// Salience-lens selector (graph-node-salience ADR, canvas-controls amendment
// W04.P12).
//
// Selects the active SALIENCE lens (status, design) — the viewer-intent parameter
// that, via DOI, drives both the per-lens importance field and the served node
// set. Switching the lens is a wire RE-QUERY (the lens folds into the graph slice
// cache key), so this control emits lens intent into the stores VIEW STORE — the
// stores layer is the sole wire client. Distinct from the named-filter-set lenses
// (the palette's saved filters) and the tier dial.
//
// Layer ownership: app chrome reads + writes the active lens in the view store; it
// never fetches the engine and never reads the raw tiers block. Icons are Lucide
// structural marks (the sanctioned chrome family).

import { Compass, ScrollText } from "lucide-react";

import type { SalienceLens } from "../../stores/server/engine";
import { useViewStore } from "../../stores/view/viewStore";

interface LensOption {
  lens: SalienceLens;
  label: string;
  hint: string;
  Icon: typeof Compass;
}

/** The two launch lenses, in selector order (status is the default/first). */
export const LENS_OPTIONS: LensOption[] = [
  {
    lens: "status",
    label: "Status",
    hint: "What is in-flight: plans, progress, the pivotal bridges that gate work",
    Icon: Compass,
  },
  {
    lens: "design",
    label: "Design",
    hint: "Why the system is this way: the binding decisions and their grounding",
    Icon: ScrollText,
  },
];

export function LensSelector() {
  const lens = useViewStore((s) => s.activeLens);
  const setLens = useViewStore((s) => s.setActiveLens);

  return (
    <div
      role="group"
      aria-label="salience lens"
      className="flex items-center gap-vs-0-5 rounded-vs-md border border-rule bg-paper-raised/95 p-vs-0-5 shadow-card backdrop-blur-sm"
    >
      {LENS_OPTIONS.map(({ lens: l, label, hint, Icon }) => {
        const active = lens === l;
        return (
          <button
            key={l}
            type="button"
            role="switch"
            aria-checked={active}
            aria-label={`${label} lens`}
            title={hint}
            onClick={() => setLens(l)}
            className={[
              "flex items-center gap-vs-1 rounded-vs-sm px-vs-1-5 py-vs-0-5 text-label transition-colors duration-ui-fast ease-settle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
              active
                ? "border border-accent bg-accent-subtle text-ink"
                : "border border-transparent text-ink-muted hover:bg-paper-sunken hover:text-ink",
            ].join(" ")}
          >
            <Icon size={14} aria-hidden />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
