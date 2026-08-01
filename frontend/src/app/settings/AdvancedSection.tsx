// Settings ▸ Advanced (advanced-service-console ADR D1) — the ONE home for every
// operational console. It renders AFTER the schema-driven groups and is
// deliberately NOT schema-driven: the settings registry stays the authority for
// settings VALUES, and consoles are not values. This is the sanctioned non-schema
// extension the ADR records, not a precedent for hand-wiring settings.
//
// Four folds, one expanded at a time (`advancedConsole` accordion): the index
// console (D4), the system-status block (D6), the project-health block, and the
// agent lifecycle console (D5). Expansion is the MOUNT GATE — a collapsed fold
// renders nothing, so none of the underlying polls run for someone who opened
// Settings to change a theme (data-loading-activity).
//
// Layer law: leaf chrome. Every console below reads its own stores hooks; this
// frame owns nothing but the disclosure state and the labels.

import { SectionLabel } from "../kit";
import { FoldSection } from "../kit/FoldSection";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import {
  ADVANCED_CONSOLE_IDS,
  ADVANCED_CONSOLE_LABELS,
  toggleAdvancedConsole,
  useExpandedAdvancedConsole,
  type AdvancedConsoleId,
} from "../../stores/view/advancedConsole";
import { A2aLifecyclePanel } from "../panels/A2aLifecyclePanel";
import { BackendHealthPanel } from "../panels/BackendHealthPanel";
import { IndexConsole } from "../panels/IndexConsole";
import { VaultHealthPanel } from "../panels/VaultHealthPanel";

const SECTION_TITLE = { key: "common:advanced.title" } as const;
const SECTION_DESCRIPTION = { key: "common:advanced.description" } as const;

function ConsoleBody({ console: consoleId }: { console: AdvancedConsoleId }) {
  switch (consoleId) {
    case "index":
      return <IndexConsole />;
    case "system":
      return <BackendHealthPanel />;
    case "project":
      return <VaultHealthPanel />;
    case "agent":
      return <A2aLifecyclePanel />;
  }
}

export function AdvancedSection() {
  const resolve = useLocalizedMessageResolver();
  const expanded = useExpandedAdvancedConsole();
  const title = resolve(SECTION_TITLE);
  if (title.usedFallback) return null;

  return (
    <section className="flex flex-col gap-fg-2" data-advanced-section>
      <SectionLabel>{title.message}</SectionLabel>
      <p className="text-caption text-ink-faint">
        {resolve(SECTION_DESCRIPTION).message}
      </p>
      <div className="flex flex-col gap-fg-1">
        {ADVANCED_CONSOLE_IDS.map((consoleId) => (
          <FoldSection
            key={consoleId}
            open={expanded === consoleId}
            onToggle={() => toggleAdvancedConsole(consoleId)}
            label={
              <span className="truncate text-label text-ink">
                {resolve(ADVANCED_CONSOLE_LABELS[consoleId]).message}
              </span>
            }
            bodyId={`advanced-console-${consoleId}`}
            bodyClassName="px-fg-2 py-fg-2"
            data-advanced-console={consoleId}
          >
            <ConsoleBody console={consoleId} />
          </FoldSection>
        ))}
      </div>
    </section>
  );
}
