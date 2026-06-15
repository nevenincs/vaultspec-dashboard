import { QueryClientProvider } from "@tanstack/react-query";
import type { Preview } from "@storybook/react-vite";
import { withThemeByDataAttribute } from "@storybook/addon-themes";

import { engineClient } from "../src/stores/server/engine";
import { queryClient } from "../src/stores/server/queryClient";
import { useViewStore } from "../src/stores/view/viewStore";
import { MockEngine, MOCK_SCOPE } from "../src/testing/mockEngine";

// The token tier (generated from the DTCG source into styles.css) drives every story, so
// the gallery renders exactly what the app renders. Theme switching mirrors the app's
// [data-theme] mechanism (figma-design-bridge: themes are light/dark/high-contrast peers).
import "../src/styles.css";

// Wire the SAME mockEngine the stores tests use, so chrome stories render against the live
// wire shape (mock-mirrors-live-wire-shape rule) — populated, seedable design surfaces.
let installed = false;
function ensureEngine(): void {
  if (!installed) {
    engineClient.useTransport(new MockEngine().fetchImpl);
    installed = true;
  }
  useViewStore.getState().setScope(MOCK_SCOPE);
}

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    backgrounds: { disable: true }, // the token --color-paper ground is the backdrop
  },
  decorators: [
    (Story) => {
      ensureEngine();
      return (
        <QueryClientProvider client={queryClient}>
          <Story />
        </QueryClientProvider>
      );
    },
    withThemeByDataAttribute({
      themes: { light: "light", dark: "dark", "high-contrast": "high-contrast" },
      defaultTheme: "light",
      attributeName: "data-theme",
    }),
  ],
};

export default preview;
