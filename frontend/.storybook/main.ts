import type { StorybookConfig } from "@storybook/react-vite";

/**
 * Storybook on the Vite builder (plan W01.P06). The gallery is the seeding + parity
 * substrate for the Figma backport: a clean per-component render surface to import into
 * Figma and to diff against via the read-only MCP (figma-design-bridge ADR).
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-themes"],
  framework: { name: "@storybook/react-vite", options: {} },
  core: { disableTelemetry: true },
};

export default config;
