// Filters visual-parity harness (filter-controls campaign).
//
// A dev-only isolated entry — mirrors the timeline-visual / viewer-visual precedent —
// that renders the REAL <FilterMenu/> with deterministic fixture data mirroring the
// binding Figma "graph/Filter menu" 217:633 (KIND → TOPIC → STATUS → HEALTH → EDITED).
// No engine, no stores: local state drives the toggles so the menu is live to click
// while the initial render is pixel-stable for the figma-visual-parity capture.
// Excluded from the production build (vite input is only index.html).
//
// URL params: `?theme=` overrides the forced light theme (default light, the parity
// baseline).

import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

import { FilterMenu, type FilterMenuSection } from "../app/stage/FilterMenu";
import "../styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("missing #root element");
}

const params = new URLSearchParams(window.location.search);
const theme = params.get("theme") ?? "light";
document.documentElement.setAttribute("data-theme", theme);
document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function FiltersHarness() {
  const [kind, setKind] = useState<string[]>(["research", "plan"]);
  const [topic, setTopic] = useState<string[]>(["delta-sync"]);
  const [topicSearch, setTopicSearch] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [health, setHealth] = useState<string[]>([]);
  const [edited, setEdited] = useState("any");

  const anyActive =
    kind.length > 0 ||
    topic.length > 0 ||
    status.length > 0 ||
    health.length > 0 ||
    edited !== "any";

  const sections: FilterMenuSection[] = [
    {
      type: "checkbox",
      key: "kind",
      label: "KIND",
      selected: kind,
      onToggle: (v) => setKind((s) => toggle(s, v)),
      options: [
        { value: "research", label: "Research", count: 56 },
        { value: "adr", label: "Decisions", count: 38 },
        { value: "plan", label: "Plans", count: 142 },
        { value: "exec", label: "Steps", count: 210 },
        { value: "audit", label: "Audits", count: 24 },
        { value: "summary", label: "Summaries", count: 18 },
      ],
    },
    {
      type: "checkbox",
      key: "topic",
      label: "TOPIC",
      selected: topic,
      onToggle: (v) => setTopic((s) => toggle(s, v)),
      search: {
        value: topicSearch,
        onChange: setTopicSearch,
        placeholder: "Search topics…",
      },
      options: [
        { value: "delta-sync", label: "delta-sync", count: 8 },
        { value: "design-system", label: "design-system", count: 44 },
        { value: "timeline", label: "timeline", count: 73 },
      ],
    },
    {
      type: "checkbox",
      key: "status",
      label: "STATUS",
      selected: status,
      onToggle: (v) => setStatus((s) => toggle(s, v)),
      options: [
        { value: "accepted", label: "accepted", count: 8, dot: "complete" },
        { value: "proposed", label: "proposed", count: 12, dot: "provisional" },
        { value: "in-progress", label: "in-progress", count: 3, dot: "active" },
        { value: "finished", label: "finished", count: 5, dot: "complete" },
      ],
    },
    {
      type: "checkbox",
      key: "health",
      label: "HEALTH",
      selected: health,
      onToggle: (v) => setHealth((s) => toggle(s, v)),
      options: [
        { value: "dangling", label: "dangling links", count: 4, dot: "broken" },
        {
          value: "invalid",
          label: "invalid frontmatter",
          count: 2,
          dot: "danger",
        },
        { value: "empty", label: "empty scaffold", count: 7, dot: "stale" },
        { value: "orphaned", label: "orphaned", count: 11, dot: "archived" },
      ],
    },
    {
      type: "radio",
      key: "edited",
      label: "EDITED",
      value: edited,
      onSelect: setEdited,
      options: [
        { value: "any", label: "Any time" },
        { value: "7d", label: "Last 7 days" },
        { value: "30d", label: "Last 30 days" },
        { value: "year", label: "This year" },
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
          setTopic([]);
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
    <FiltersHarness />
  </StrictMode>,
);
