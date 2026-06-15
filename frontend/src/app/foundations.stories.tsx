import type { Meta, StoryObj } from "@storybook/react-vite";

/**
 * Design-foundations gallery (plan W01.P07.S27). Renders the public token surface — the
 * exact tokens generated from the DTCG source into styles.css — so the foundations can be
 * seeded into Figma and parity-checked. Switch the Storybook theme toolbar to see every
 * swatch remap across light / dark / high-contrast.
 */

const COLORS = [
  "paper",
  "paper-raised",
  "paper-sunken",
  "paper-aged",
  "ink",
  "ink-muted",
  "ink-faint",
  "rule",
  "rule-strong",
  "accent",
  "accent-subtle",
  "accent-text",
  "focus",
  "state-live",
  "state-active",
  "state-complete",
  "state-archived",
  "state-stale",
  "state-broken",
  "tier-declared",
  "tier-structural",
  "tier-temporal",
  "tier-semantic",
  "diff-add",
  "diff-remove",
];

const TYPE = ["2xs", "label", "body", "title", "heading"];
const SPACE = ["vs-0-5", "vs-1", "vs-1-5", "vs-2", "vs-3", "vs-4", "vs-6", "vs-8"];
const SHADOW = ["flat", "card", "panel", "float", "dialog", "deep"];
const RADIUS = ["vs-sm", "vs-md", "vs-lg", "vs-xl"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "var(--spacing-vs-6)" }}>
      <h3
        style={{
          font: "var(--text-title)",
          fontSize: "var(--text-title)",
          color: "var(--color-ink)",
          margin: "0 0 var(--spacing-vs-2)",
          fontWeight: 600,
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function Foundations() {
  return (
    <div
      style={{
        background: "var(--color-paper)",
        color: "var(--color-ink)",
        padding: "var(--spacing-vs-6)",
        fontFamily: "var(--font-sans)",
        minWidth: 720,
      }}
    >
      <Section title="Color — semantic surface">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "var(--spacing-vs-2)",
          }}
        >
          {COLORS.map((c) => (
            <div key={c} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div
                style={{
                  height: 40,
                  borderRadius: "var(--radius-vs-sm)",
                  background: `var(--color-${c})`,
                  border: "1px solid var(--color-rule)",
                }}
              />
              <span
                style={{ fontSize: "var(--text-2xs)", color: "var(--color-ink-muted)" }}
              >
                {c}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography — UI scale">
        {TYPE.map((t) => (
          <div key={t} style={{ fontSize: `var(--text-${t})`, marginBottom: 4 }}>
            text-{t} — The quick brown fox 0123456789
          </div>
        ))}
      </Section>

      <Section title="Spacing — 4px grid">
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "var(--spacing-vs-2)",
          }}
        >
          {SPACE.map((s) => (
            <div key={s} style={{ textAlign: "center" }}>
              <div
                style={{
                  width: `var(--spacing-${s})`,
                  height: 24,
                  background: "var(--color-accent)",
                }}
              />
              <span
                style={{ fontSize: "var(--text-2xs)", color: "var(--color-ink-muted)" }}
              >
                {s}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Elevation">
        <div style={{ display: "flex", gap: "var(--spacing-vs-4)" }}>
          {SHADOW.map((s) => (
            <div key={s} style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 64,
                  height: 48,
                  background: "var(--color-paper-raised)",
                  borderRadius: "var(--radius-vs-md)",
                  boxShadow: `var(--shadow-${s})`,
                }}
              />
              <span
                style={{ fontSize: "var(--text-2xs)", color: "var(--color-ink-muted)" }}
              >
                {s}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Radius">
        <div style={{ display: "flex", gap: "var(--spacing-vs-4)" }}>
          {RADIUS.map((r) => (
            <div key={r} style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  background: "var(--color-accent-subtle)",
                  border: "1px solid var(--color-accent)",
                  borderRadius: `var(--radius-${r})`,
                }}
              />
              <span
                style={{ fontSize: "var(--text-2xs)", color: "var(--color-ink-muted)" }}
              >
                {r}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

const meta: Meta<typeof Foundations> = {
  title: "Foundations/Tokens",
  component: Foundations,
  parameters: { layout: "fullscreen" },
};
export default meta;

export const Tokens: StoryObj<typeof Foundations> = {};
