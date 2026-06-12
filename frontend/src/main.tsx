import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { queryClient } from "./stores/server/queryClient";
import { router } from "./router";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("missing #root element");
}

// Contract-mock mode (W02.P05): the mock engine serves the fixture corpus
// through the same client transport until the live serve origin lands
// (S49). Dynamic import keeps the mock out of the bundle when the flag is
// off.
if (import.meta.env.VITE_MOCK_ENGINE === "1") {
  const [{ getMockEngine }, { engineClient }] = await Promise.all([
    import("./testing/mockEngine"),
    import("./stores/server/engine"),
  ]);
  engineClient.useTransport(getMockEngine().fetchImpl);
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
