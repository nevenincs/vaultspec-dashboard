// Visual review desk — every principal surface, four authored states, both themes.
//
// One page, one URL. The left nav lists every discovered surface; selecting one
// renders the REAL production component across normal / loading / empty / degraded,
// light beside dark. State comes from authored inputs supplied per component
// (`specimens/`), never from a backend condition: the page is hermetic
// (`hermetic.ts`), so nothing on it can wait on — or be blanked by — an engine.

import "./hermetic";

import {
  Component,
  StrictMode,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";

import { LocalizationProvider } from "@app/platform/localization/LocalizationProvider";
import { useViewStore } from "@app/stores/view/viewStore";

import {
  ORPHANED_SPECIMEN_IDS,
  REGISTRY,
  UNAUTHORED,
  type RegistryEntry,
  type RenderedSpecimenDef,
} from "./registry";
import { REVIEW_SCOPE, makeCellClient } from "./specimens/support";
import { REVIEW_STATES, STATE_LABEL, type ReviewState } from "./state";

import "@app/styles.css";

/** Root theme choices — the whole-desk control; solo specimens depend on it. */
const ROOT_THEMES = ["light", "dark", "high-contrast"] as const;
type RootTheme = (typeof ROOT_THEMES)[number];

function applyRootTheme(theme: RootTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";
}

/** A cell failure is review signal, not a desk crash: render it in place. */
class CellBoundary extends Component<
  { children: ReactNode; label: string },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.debug(`[visual-review] ${this.props.label} failed to render`, error, info);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-fg-3 text-meta">
        <div className="mb-fg-1 font-medium text-state-stale">
          {this.props.label} failed to render
        </div>
        <div className="text-ink-faint">{this.state.error.message}</div>
      </div>
    );
  }
}

/**
 * One mounted specimen cell: its OWN QueryClient (seeded per state), so four states
 * of one container coexist on one page while every unseeded read pends hermetically.
 */
function SpecimenMount({
  specimen,
  state,
}: {
  specimen: RenderedSpecimenDef;
  state: ReviewState;
}) {
  const client = useMemo(() => {
    const cellClient = makeCellClient();
    specimen.seed?.(cellClient, state);
    return cellClient;
  }, [specimen, state]);
  return (
    <QueryClientProvider client={client}>{specimen.render(state)}</QueryClientProvider>
  );
}

/** The standard presentation: four state panes under the root theme. */
function StateGrid({
  surface,
  specimen,
}: {
  surface: RegistryEntry["surface"];
  specimen: RenderedSpecimenDef;
}) {
  return (
    <div className="grid grid-cols-1 gap-fg-4 xl:grid-cols-2">
      {REVIEW_STATES.map((state) => (
        <section key={state} className="flex min-w-0 flex-col gap-fg-1">
          <h3 className="m-0 text-meta font-medium tracking-wide text-ink uppercase">
            {STATE_LABEL[state]}
          </h3>
          <div className="min-h-[10rem] overflow-auto rounded-fg-sm border border-rule bg-canvas text-ink">
            <CellBoundary label={`${surface.name} · ${STATE_LABEL[state]}`}>
              <div className={specimen.host ?? "p-fg-3"}>
                <SpecimenMount specimen={specimen} state={state} />
              </div>
            </CellBoundary>
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * Solo presentation for portaling surfaces (dialogs, palettes, lifted overlays):
 * they mount on `document.body`, so four instances cannot coexist. One state at a
 * time, themed like everything else by the root control.
 */
function SoloStage({
  surface,
  specimen,
}: {
  surface: RegistryEntry["surface"];
  specimen: RenderedSpecimenDef;
}) {
  const [state, setState] = useState<ReviewState>("normal");
  return (
    <>
      <div className="mb-fg-4 flex items-center gap-fg-2 text-meta">
        <span className="text-ink-muted">State</span>
        {REVIEW_STATES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setState(s)}
            className={`rounded-fg-xs border border-rule px-fg-2 py-fg-1 ${
              s === state ? "bg-paper-sunken text-ink" : "text-ink-muted hover:bg-paper"
            }`}
          >
            {STATE_LABEL[s]}
          </button>
        ))}
        <span className="text-ink-faint">
          Renders as an overlay under the desk theme — switch the theme control to
          compare light and dark.
        </span>
      </div>
      <CellBoundary
        key={`${surface.id}-${state}`}
        label={`${surface.name} · ${STATE_LABEL[state]}`}
      >
        {/* A positioned surface (an absolute-inset reader) still needs its shaped
            slot in solo mode, or it escapes and covers the desk. */}
        <div className={specimen.host}>
          <SpecimenMount specimen={specimen} state={state} />
        </div>
      </CellBoundary>
    </>
  );
}

function Desk() {
  const [selectedId, setSelectedId] = useState<string>(() => {
    const requested = new URLSearchParams(window.location.search).get("surface");
    return requested && REGISTRY.some((e) => e.surface.id === requested)
      ? requested
      : (REGISTRY[0]?.surface.id ?? "");
  });
  const [rootTheme, setRootTheme] = useState<RootTheme>("light");

  useEffect(() => applyRootTheme(rootTheme), [rootTheme]);

  // Keep the selection deep-linkable without reloading the page.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("surface") === selectedId) return;
    q.set("surface", selectedId);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${q.toString()}`,
    );
  }, [selectedId]);

  const entry = useMemo(
    () => REGISTRY.find((e) => e.surface.id === selectedId),
    [selectedId],
  );
  const byArea = useMemo(() => {
    const grouped = new Map<string, RegistryEntry[]>();
    for (const e of REGISTRY) {
      const bucket = grouped.get(e.surface.area);
      if (bucket) bucket.push(e);
      else grouped.set(e.surface.area, [e]);
    }
    return grouped;
  }, []);

  return (
    <div className="flex min-h-screen bg-paper-sunken text-ink">
      <nav className="w-[14rem] shrink-0 overflow-y-auto border-r border-rule bg-paper p-fg-3">
        <h1 className="text-label font-medium">Visual review</h1>
        <p className="mb-fg-3 text-meta text-ink-faint">
          {REGISTRY.length} components · {REVIEW_STATES.length} states · authored props,
          no engine
        </p>
        {UNAUTHORED.length > 0 ? (
          <p className="mb-fg-3 text-meta text-state-stale">
            {UNAUTHORED.length} without authored states
          </p>
        ) : null}
        {ORPHANED_SPECIMEN_IDS.length > 0 ? (
          <p className="mb-fg-3 text-meta text-state-stale">
            Orphaned specimen ids: {ORPHANED_SPECIMEN_IDS.join(", ")}
          </p>
        ) : null}
        {[...byArea].map(([area, entries]) => (
          <div key={area} className="mb-fg-3">
            <div className="mb-fg-1 text-meta tracking-wide text-ink-faint uppercase">
              {area}
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {entries.map(({ surface, specimen }) => (
                <li key={surface.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(surface.id)}
                    className={`w-full rounded-fg-xs px-fg-2 py-fg-1 text-left text-meta ${
                      surface.id === selectedId
                        ? "bg-paper-sunken text-ink"
                        : "text-ink-muted hover:bg-paper-sunken"
                    }`}
                  >
                    {surface.name}
                    {specimen === null ? (
                      <span className="text-state-stale" title="No authored states yet">
                        {" "}
                        ·
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <main className="min-w-0 flex-1 overflow-y-auto p-fg-4">
        <div className="mb-fg-4 flex flex-wrap items-center gap-fg-3 text-meta">
          <span className="text-ink-muted">Theme</span>
          {ROOT_THEMES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setRootTheme(t)}
              className={`rounded-fg-xs border border-rule px-fg-2 py-fg-1 ${
                t === rootTheme ? "bg-paper text-ink" : "text-ink-muted hover:bg-paper"
              }`}
            >
              {t}
            </button>
          ))}
          <span className="text-ink-faint">
            Themes the whole desk — review each state under light and dark in turn.
          </span>
        </div>

        {!entry ? (
          <p className="text-ink-faint">No component selected.</p>
        ) : (
          <>
            <header className="mb-fg-4">
              <h2 className="text-title font-medium">{entry.surface.name}</h2>
              <p className="text-meta text-ink-faint">{entry.surface.modulePath}</p>
              {entry.specimen !== null &&
              !("excluded" in entry.specimen) &&
              entry.specimen.note ? (
                <p className="mt-fg-1 text-meta text-ink-muted">
                  {entry.specimen.note}
                </p>
              ) : null}
            </header>
            {entry.specimen === null ? (
              <p className="text-label text-state-stale">
                No authored states for this component yet — add an entry to{" "}
                <code>dev/visual-review/specimens/</code>.
              </p>
            ) : "excluded" in entry.specimen ? (
              <div className="max-w-[45rem] rounded-fg-sm border border-rule bg-paper p-fg-4 text-label text-ink-muted">
                <p className="m-0 mb-fg-2 font-medium text-ink">
                  Not rendered in the state matrix
                </p>
                <p className="m-0">{entry.specimen.excluded}</p>
              </div>
            ) : entry.specimen.solo ? (
              <SoloStage surface={entry.surface} specimen={entry.specimen} />
            ) : (
              <StateGrid surface={entry.surface} specimen={entry.specimen} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("missing #root element");

applyRootTheme("light");

// Pin the client-local active scope so `useActiveScope()` — and every specimen's
// seeded query key — resolves to the one authored review scope, engine-free.
useViewStore.getState().setScope(REVIEW_SCOPE);

createRoot(rootElement).render(
  <StrictMode>
    <LocalizationProvider>
      <Desk />
    </LocalizationProvider>
  </StrictMode>,
);
