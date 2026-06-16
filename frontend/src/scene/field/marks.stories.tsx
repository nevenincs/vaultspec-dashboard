import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  DOC_TYPE_MARK_DEFS,
  EVENT_MARK_DEFS,
  STATE_MARK_DEFS,
  TIER_MARK_DEFS,
} from "./marks";
import { DocTypeMark, EventMark, StateMark, TierMark } from "./markComponents";

/**
 * Domain iconography gallery (plan W01.P07.S33). Renders every in-family mark — doc-type,
 * event, tier, and lifecycle-state — at the 14px grayscale-by-shape floor and at display
 * size. These are design items to seed into Figma and parity-check; they read the same SVG
 * paths the canvas uses, so the gallery and the scene stay coherent (iconography ADR).
 */

function Grid({
  title,
  keys,
  render,
}: {
  title: string;
  keys: string[];
  render: (k: string, size: number) => React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: "var(--spacing-fg-6)" }}>
      <h3
        style={{
          fontSize: "var(--text-body-strong)",
          fontWeight: 600,
          margin: "0 0 var(--spacing-fg-2)",
        }}
      >
        {title}
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: "var(--spacing-fg-3)",
        }}
      >
        {keys.map((k) => (
          <div
            key={k}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--color-ink)",
              }}
            >
              {render(k, 14)}
              {render(k, 24)}
            </div>
            <span
              style={{
                fontSize: "var(--text-caption)",
                color: "var(--color-ink-muted)",
              }}
            >
              {k}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Marks() {
  return (
    <div
      style={{
        background: "var(--color-paper)",
        color: "var(--color-ink)",
        padding: "var(--spacing-fg-6)",
        fontFamily: "var(--font-sans)",
        minWidth: 720,
      }}
    >
      <Grid
        title="Doc-type marks"
        keys={Object.keys(DOC_TYPE_MARK_DEFS)}
        render={(k, size) => <DocTypeMark kind={k} size={size} title={k} />}
      />
      <Grid
        title="Event marks"
        keys={Object.keys(EVENT_MARK_DEFS)}
        render={(k, size) => <EventMark event={k} size={size} title={k} />}
      />
      <Grid
        title="Tier marks"
        keys={Object.keys(TIER_MARK_DEFS)}
        render={(k, size) => (
          <TierMark tier={k as keyof typeof TIER_MARK_DEFS} size={size} title={k} />
        )}
      />
      <Grid
        title="Lifecycle-state marks"
        keys={Object.keys(STATE_MARK_DEFS)}
        render={(k, size) => (
          <StateMark state={k as keyof typeof STATE_MARK_DEFS} size={size} title={k} />
        )}
      />
    </div>
  );
}

const meta: Meta<typeof Marks> = {
  title: "Foundations/Iconography",
  component: Marks,
  parameters: { layout: "fullscreen" },
};
export default meta;

export const AllMarks: StoryObj<typeof Marks> = {};
