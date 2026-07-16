// Filters visual-parity harness (filter-controls campaign).
//
// A dev-only isolated entry — mirrors the timeline-visual / viewer-visual precedent —
// that renders the REAL <FilterMenu/> with deterministic fixture data mirroring the
// binding Figma "graph/Filter menu" 217:633 (KIND → FEATURE → STATUS → HEALTH → EDITED).
// No engine, no stores: local state drives the toggles so the menu is live to click
// while the initial render is pixel-stable for the figma-visual-parity capture.
// Excluded from the production build (vite input is only index.html).
//
// URL params: `?theme=` overrides the forced light theme (default light, the parity
// baseline).

import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

import { FilterMenu, type FilterMenuSection } from "../app/stage/FilterMenu";
import { bindDocumentLanguage } from "../platform/localization/documentLanguage";
import { LocalizationProvider } from "../platform/localization/LocalizationProvider";
import {
  FILTER_MESSAGES,
  authoredFilterLabel,
  filterMessageLabel,
} from "../stores/view/filterPresentation";
import "../styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("missing #root element");
}

const unbindDocumentLanguage = bindDocumentLanguage();
if (import.meta.hot) import.meta.hot.dispose(unbindDocumentLanguage);

const params = new URLSearchParams(window.location.search);
const theme = params.get("theme") ?? "light";
document.documentElement.setAttribute("data-theme", theme);
document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function FiltersHarness() {
  const [kind, setKind] = useState<string[]>(["research", "plan"]);
  const [feature, setFeature] = useState<string[]>(["delta-sync"]);
  const [featureSearch, setFeatureSearch] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [health, setHealth] = useState<string[]>([]);
  const [edited, setEdited] = useState("any");

  const anyActive =
    kind.length > 0 ||
    feature.length > 0 ||
    status.length > 0 ||
    health.length > 0 ||
    edited !== "any";

  const sections: FilterMenuSection[] = [
    {
      type: "checkbox",
      key: "kind",
      label: FILTER_MESSAGES.sections.kind,
      selected: kind,
      onToggle: (v) => setKind((s) => toggle(s, v)),
      options: [
        {
          value: "research",
          label: filterMessageLabel(FILTER_MESSAGES.options.research),
          count: 56,
        },
        {
          value: "adr",
          label: filterMessageLabel(FILTER_MESSAGES.options.adr),
          count: 38,
        },
        {
          value: "plan",
          label: filterMessageLabel(FILTER_MESSAGES.options.plan),
          count: 142,
        },
        {
          value: "exec",
          label: filterMessageLabel(FILTER_MESSAGES.options.exec),
          count: 210,
        },
        {
          value: "audit",
          label: filterMessageLabel(FILTER_MESSAGES.options.audit),
          count: 24,
        },
        {
          value: "summary",
          label: filterMessageLabel(FILTER_MESSAGES.options.summary),
          count: 18,
        },
      ],
    },
    {
      type: "checkbox",
      key: "feature",
      label: FILTER_MESSAGES.sections.feature,
      selected: feature,
      onToggle: (v) => setFeature((s) => toggle(s, v)),
      search: {
        value: featureSearch,
        onChange: setFeatureSearch,
        placeholder: FILTER_MESSAGES.searchFeatures,
      },
      options: [
        { value: "delta-sync", label: authoredFilterLabel("delta-sync"), count: 8 },
        {
          value: "design-system",
          label: authoredFilterLabel("design-system"),
          count: 44,
        },
        { value: "timeline", label: authoredFilterLabel("timeline"), count: 73 },
      ],
    },
    {
      type: "checkbox",
      key: "status",
      label: FILTER_MESSAGES.sections.decisionStatus,
      selected: status,
      onToggle: (v) => setStatus((s) => toggle(s, v)),
      options: [
        {
          value: "accepted",
          label: filterMessageLabel({ key: "graph:filters.statuses.accepted" }),
          count: 8,
          dot: "complete",
        },
        {
          value: "proposed",
          label: filterMessageLabel({ key: "graph:filters.statuses.proposed" }),
          count: 12,
          dot: "provisional",
        },
        {
          value: "in-progress",
          label: filterMessageLabel({ key: "graph:filters.statuses.inProgress" }),
          count: 3,
          dot: "active",
        },
        {
          value: "finished",
          label: filterMessageLabel({ key: "graph:filters.statuses.finished" }),
          count: 5,
          dot: "complete",
        },
      ],
    },
    {
      type: "checkbox",
      key: "health",
      label: FILTER_MESSAGES.sections.health,
      selected: health,
      onToggle: (v) => setHealth((s) => toggle(s, v)),
      options: [
        {
          value: "dangling",
          label: filterMessageLabel({ key: "graph:filters.health.dangling" }),
          count: 4,
          dot: "broken",
        },
        {
          value: "invalid",
          label: filterMessageLabel({ key: "graph:filters.health.invalid" }),
          count: 2,
          dot: "danger",
        },
        {
          value: "empty",
          label: filterMessageLabel({ key: "graph:filters.health.emptyScaffold" }),
          count: 7,
          dot: "stale",
        },
        {
          value: "orphaned",
          label: filterMessageLabel({ key: "graph:filters.health.orphaned" }),
          count: 11,
          dot: "archived",
        },
      ],
    },
    {
      type: "radio",
      key: "edited",
      label: FILTER_MESSAGES.sections.edited,
      value: edited,
      onSelect: setEdited,
      options: [
        { value: "any", label: FILTER_MESSAGES.edited.any },
        { value: "7d", label: FILTER_MESSAGES.edited["7d"] },
        { value: "30d", label: FILTER_MESSAGES.edited["30d"] },
        { value: "year", label: FILTER_MESSAGES.edited.year },
      ],
    },
  ];

  return (
    <div className="flex min-h-screen items-start justify-center bg-paper-sunken p-[2.5rem] text-ink">
      <FilterMenu
        sections={sections}
        anyActive={anyActive}
        onClearAll={() => {
          setKind([]);
          setFeature([]);
          setStatus([]);
          setHealth([]);
          setEdited("any");
        }}
      />
    </div>
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <LocalizationProvider>
      <FiltersHarness />
    </LocalizationProvider>
  </StrictMode>,
);
