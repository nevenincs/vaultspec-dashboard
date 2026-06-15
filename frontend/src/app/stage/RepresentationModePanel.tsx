// Representation-mode selector (graph-representation ADR, canvas-controls
// amendment W04.P12).
//
// Selects the active representation mode (connectivity, lineage, semantic) — the
// CPU-worker spatialization of the served nodes. EXPLICITLY DISTINCT from the
// force/circular toggle in AlgorithmPanel (force/circular becomes a sub-option of
// the connectivity mode): representation mode changes WHICH layout runs, the
// force/circular toggle only tunes the connectivity solver.
//
// Layer ownership: this is app chrome. It reads + writes the active mode in the
// VIEW STORE (the scene command is issued by Stage's effect, the single owner of
// the scene); it never fetches the engine, never reads the raw tiers block, and
// never reaches the scene worker directly. Icons are Lucide structural marks (the
// sanctioned chrome family).

import { GitBranch, Network, Sparkles } from "lucide-react";

import type { RepresentationMode } from "../../scene/field/representationLayout";
import { useViewStore } from "../../stores/view/viewStore";

interface ModeOption {
  mode: RepresentationMode;
  label: string;
  hint: string;
  Icon: typeof Network;
}

/** The three v1 modes, in selector order (connectivity is the default/first). */
export const MODE_OPTIONS: ModeOption[] = [
  {
    mode: "connectivity",
    label: "Connectivity",
    hint: "Force-directed topology layout (force/circular tuning applies here)",
    Icon: Network,
  },
  {
    mode: "lineage",
    label: "Lineage",
    hint: "Derivation-axis DAG: trace research -> adr -> plan -> exec -> audit",
    Icon: GitBranch,
  },
  {
    mode: "semantic",
    label: "Semantic",
    hint: "Meaning constellation: UMAP over embeddings (clusters by meaning)",
    Icon: Sparkles,
  },
];

export function RepresentationModePanel() {
  const mode = useViewStore((s) => s.activeRepresentationMode);
  const setMode = useViewStore((s) => s.setRepresentationMode);

  return (
    <div
      role="group"
      aria-label="graph representation mode"
      className="flex items-center gap-vs-0-5 rounded-vs border border-border bg-surface/80 p-vs-0-5 shadow-vs-1"
    >
      {MODE_OPTIONS.map(({ mode: m, label, hint, Icon }) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            role="switch"
            aria-checked={active}
            aria-label={label}
            title={hint}
            onClick={() => setMode(m)}
            className={[
              "flex items-center gap-vs-0-5 rounded-vs px-vs-1-5 py-vs-0-5 text-label transition-colors",
              active
                ? "bg-accent/15 text-ink ring-1 ring-accent/40"
                : "text-ink-muted hover:bg-ink/5",
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
