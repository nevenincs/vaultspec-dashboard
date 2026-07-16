import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";

import { bindDocumentLanguage } from "../platform/localization/documentLanguage";
import {
  LocalizationProvider,
  useLocalizedMessage,
} from "../platform/localization/LocalizationProvider";
import { THREE_LAB_MESSAGES } from "../stores/view/threeLabVocabulary";
import "../styles.css";
import { ThreeLab } from "./ThreeLab";

export function ThreeLabDocumentTitle() {
  const title = useLocalizedMessage(THREE_LAB_MESSAGES.documentTitle);
  useEffect(() => {
    document.title = title;
  }, [title]);
  return null;
}

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
