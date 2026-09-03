// Programmatic extraction of the PRINCIPAL visual surfaces.
//
// "Every element" does not mean every export. A Button has no loading state and no
// empty state; rendering it in four conditions would be four identical cells and a
// lie about what is being reviewed. The elements worth a condition matrix are the
// principal surfaces — the panels, rails, stages and views the application is made of.
//
// The discriminator is already in the codebase and does not need a hand-maintained
// list: a surface is principal if it is DATA-BEARING. In this design a data-bearing
// component composes the shared state primitives (`StateBlock` / `Skeleton`) or reads
// the stores, because that is precisely what it means to have a loading, degraded or
// empty condition at all. Atoms do neither.
//
// So extraction walks the module graph, keeps the modules that carry those markers,
// and drops the rest. A new panel appears in the desk the moment it is written.

/** Raw source of every production module, for marker analysis. */
const SOURCES = import.meta.glob<string>(
  ["../../src/app/**/*.tsx", "!../../src/app/**/*.test.tsx"],
  {
    eager: true,
    query: "?raw",
    import: "default",
  },
);

/** Markers that make a component data-bearing, and therefore condition-bearing.
 *
 *  The list is a proxy for the rule stated above — composes the state primitives OR
 *  reads the stores — so a store read that goes through a slice-specific hook needs
 *  its hook named here. The agent panel's own surfaces (composer, transcript, team
 *  run, chip, pending-changes bridge) read the session and team-run slices and
 *  compose no `StateBlock`/`Skeleton` of their own, so without these two entries the
 *  entire docked panel was invisible to the desk except its outermost frame. */
const DATA_BEARING = [
  "StateBlock",
  "Skeleton",
  "useDataActivityView",
  "usePipelineStatusView",
  "useDashboard",
  "useVaultTree",
  "tiers",
  "useSession",
  "useAgentTeamRunId",
  // The two health consoles Settings ▸ Advanced hosts (advanced-service-console ADR
  // D6) state their whole condition as a served tone word, so they compose neither
  // state primitive and were invisible to the desk — the one pair of relocated
  // surfaces with no reviewable cell. They read the status rollup and the project
  // status through these slice-specific hooks.
  "useStatusRollup",
  "useCoreStatus",
  // Settings ▸ the dialog and its Advanced section. The dialog is schema-driven —
  // its whole body is a served registry read with pending and empty states — and
  // Advanced hosts the operational consoles. Neither composes a state primitive of
  // its own, so without these the entire SETTINGS area was invisible to the desk.
  "useSettingsDialogView",
  "useExpandedAdvancedConsole",
];

/** Areas that are never principal surfaces regardless of markers. */
const EXCLUDED_AREAS = ["kit", "a11y", "chrome", "presentation", "menus", "menu"];

export interface Surface {
  /** URL-safe id, stable across runs so a cell deep-link keeps working. */
  readonly id: string;
  /** The DISPLAYED name — always the file's own name, e.g. `AgentPanel`. */
  readonly name: string;
  /** The export `SurfaceFrame` actually mounts. Equal to `name` for the common case
   *  (the file's principal export is named after the file); when the file's
   *  principal component carries a DIFFERENT name than its file (a multi-export
   *  module, or a file named after its role rather than its symbol —
   *  `TimelineRangeSelector.tsx` exporting `TimelineRange`), this is the export
   *  that actually resolves, so the cell mounts the real component instead of
   *  every condition rendering the identical "did not mount standalone" fallback. */
  readonly exportName: string;
  /** Repo-relative module path. */
  readonly modulePath: string;
  /** Area under `src/app`, e.g. `agent` — groups the desk. */
  readonly area: string;
}

function repoPath(globPath: string): string {
  return globPath.replace(/^(?:\.\.\/)+/, "");
}

function areaOf(path: string): string {
  const parts = path.split("/");
  // src/app/<area>/<File>.tsx  — the shell files sit directly under app/
  return parts.length >= 4 ? parts[2] : "shell";
}

/** Every top-level `export function X(...)` / `export const X = ...` PascalCase
 *  name, in source order — a component export, never a helper (`resolveXState`),
 *  a constant (`X_MESSAGES`), or a type. */
const EXPORTED_COMPONENT_NAMES = /export (?:function|const) ([A-Z][A-Za-z0-9]*)\b/g;

/** The export a file's PRINCIPAL component actually resolves under.
 *
 *  The file's OWN name is right for the overwhelming majority of surfaces (the
 *  export is named after the file), so that stays the preference. When it is
 *  absent — the file groups several related exports under a role-based name
 *  (`GraphControls.tsx`) or exports its component under a shorter name than the
 *  file's (`TimelineRangeSelector.tsx` -> `TimelineRange`) — the FIRST exported
 *  component in source order is the file's principal one by convention, so that
 *  is what gets mounted rather than leaving the surface permanently unmountable. */
function principalExportName(source: string, fileName: string): string | null {
  const found = [...source.matchAll(EXPORTED_COMPONENT_NAMES)].map((m) => m[1]!);
  if (found.length === 0) return null;
  if (found.includes(fileName)) return fileName;
  // A file whose principal component EXTENDS its own name — `ReviewStation.tsx`
  // exporting `ReviewStationBody` — is the principal export, and picking it beats
  // falling through to source order. Source order alone chose `ProposalCard` there:
  // a real component, so the cell mounted something and never reported a fault, but
  // the wrong something. That is worse than a blank cell, because the desk showed a
  // card where a reviewer expected the station and nothing said otherwise.
  const prefixed = found.filter((n) => n.startsWith(fileName));
  if (prefixed.length > 0) {
    return prefixed.reduce((a, b) => (a.length <= b.length ? a : b));
  }
  return found[0]!;
}

/**
 * Every principal surface, discovered from the module graph.
 *
 * Sorted by area then name so the desk is stable between reloads — an unstable order
 * makes a long inventory impossible to review twice.
 */
export const SURFACES: readonly Surface[] = Object.entries(SOURCES)
  .flatMap(([globPath, source]) => {
    const modulePath = repoPath(globPath);
    const area = areaOf(modulePath);
    if (EXCLUDED_AREAS.includes(area)) return [];
    if (!DATA_BEARING.some((marker) => source.includes(marker))) return [];
    const name =
      modulePath
        .split("/")
        .pop()
        ?.replace(/\.tsx$/, "") ?? "";
    if (!name || !/^[A-Z]/.test(name)) return [];
    const exportName = principalExportName(source, name) ?? name;
    return [
      {
        id: `${area}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name,
        exportName,
        modulePath,
        area,
      },
    ];
  })
  .sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name));

/** Areas present, in desk order. */
export function surfaceAreas(): readonly string[] {
  return [...new Set(SURFACES.map((s) => s.area))].sort();
}
