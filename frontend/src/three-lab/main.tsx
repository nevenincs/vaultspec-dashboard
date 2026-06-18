import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../styles.css";
import { ThreeLab } from "./ThreeLab";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("missing #root element");
}

const theme = new URLSearchParams(window.location.search).get("theme") ?? "light";
document.documentElement.setAttribute("data-theme", theme);

createRoot(rootElement).render(
  <StrictMode>
    <ThreeLab />
  </StrictMode>,
);
