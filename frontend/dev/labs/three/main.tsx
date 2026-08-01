import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";

import { bindDocumentLanguage } from "@app/platform/localization/documentLanguage";
import { LocalizationProvider } from "@app/platform/localization/LocalizationProvider";
import { localization } from "@app/platform/localization/runtime";
import { useLabMessage } from "./labMessage";
import { registerLabMessages } from "./registerLabMessages";
import { THREE_LAB_MESSAGES } from "./threeLabVocabulary";
import "@app/styles.css";
import { ThreeLab } from "./ThreeLab";

export function ThreeLabDocumentTitle() {
  const title = useLabMessage(THREE_LAB_MESSAGES.documentTitle);
  useEffect(() => {
    document.title = title;
  }, [title]);
  return null;
}

// The lab's copy no longer ships in the catalog — it registers itself here, before
// first render, so every `graph:lab.*` lookup resolves.
// The lab's copy no longer ships in the catalog — it registers itself here, before
// first render, so every `graph:lab.*` lookup resolves.
registerLabMessages(localization);

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("missing #root element");

const unbindDocumentLanguage = bindDocumentLanguage();
if (import.meta.hot) import.meta.hot.dispose(unbindDocumentLanguage);

const theme = new URLSearchParams(window.location.search).get("theme") ?? "light";
document.documentElement.setAttribute("data-theme", theme);

createRoot(rootElement).render(
  <StrictMode>
    <LocalizationProvider>
      <ThreeLabDocumentTitle />
      <ThreeLab />
    </LocalizationProvider>
  </StrictMode>,
);
