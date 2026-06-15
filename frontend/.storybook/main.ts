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
  viteFinal: async (config) => {
    // The engine-dev plugin supervises the Rust engine; it must not run under Storybook
    // (its build failure raises a Vite error overlay over every story). Strip it and
    // disable the HMR overlay so component renders capture cleanly for Figma seeding.
    config.plugins = (config.plugins ?? []).filter(
      (p) => !(p && typeof p === "object" && "name" in p && p.name === "vaultspec:engine-dev"),
    );
    config.server = {
      ...(config.server ?? {}),
      hmr: { ...(config.server?.hmr === false ? {} : config.server?.hmr), overlay: false },
    };
    return config;
  },
};

export default config;
