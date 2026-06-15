// Prototype harness mount (node-visual-richness, DEV-ONLY). A SECOND Vite entry
// (prototype.html) wires this; the app router never imports it, so it stays out
// of the production bundle. It applies a default [data-theme] so the token layer
// resolves, then mounts the standalone StatusGallery.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { StatusGallery } from "./StatusGallery";
import "./prototype.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("missing #root element");
}

// The gallery is theme-agnostic but needs an active [data-theme] for the token
// remaps to resolve; light is the default. Append ?theme=dark / high-contrast to
// inspect the stamps under the other themes.
const theme = new URLSearchParams(window.location.search).get("theme") ?? "light";
document.documentElement.setAttribute("data-theme", theme);

createRoot(rootElement).render(
  <StrictMode>
    <StatusGallery />
  </StrictMode>,
);
