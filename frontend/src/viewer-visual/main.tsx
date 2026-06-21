// Reader visual-parity harness (editor-figma-parity campaign).
//
// A dev-only isolated entry — mirrors the `timeline-visual` precedent — that
// renders the REAL <MarkdownReader/> against the ONE shared fixture, with no
// engine and no store intent: it builds a synthetic `ContentResponse` (structural
// tier available) from the fixture text and runs it through the production
// `deriveContentView`, so the reader sees exactly the interpreted `ContentView`
// it would in the app. This gives a deterministic, pixel-stable surface for the
// figma-visual-parity capture. Excluded from the production build (vite input is
// only index.html).
//
// URL params: `?w=<px>` sets the reader surface width (default 860); `?theme=`
// overrides the forced light theme (default light, the parity baseline).

import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { DocChrome } from "../app/viewer/DocChrome";
import { MarkdownReader } from "../app/viewer/MarkdownReader";
import type { ContentResponse } from "../stores/server/engine";
import { deriveContentView } from "../stores/server/queries";
import { queryClient } from "../stores/server/queryClient";
import "../styles.css";
import { READER_FIXTURE_MARKDOWN, READER_FIXTURE_PATH } from "./fixture";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("missing #root element");
}

const params = new URLSearchParams(window.location.search);
const surfaceWidth = Number(params.get("w") ?? "460") || 460;
const theme = params.get("theme") ?? "light";
// Force the parity theme directly on <html> — bypass stored prefs / media query
// so the capture is deterministic regardless of the host machine's settings.
document.documentElement.setAttribute("data-theme", theme);
document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";

// The synthetic served bytes: the fixture markdown with the structural tier up,
// run through the production derivation so the reader's ContentView is identical
// to a live read.
const byteLen = new TextEncoder().encode(READER_FIXTURE_MARKDOWN).length;
const response: ContentResponse = {
  path: READER_FIXTURE_PATH,
  blob_hash: "fixture0000000000000000000000000000000000",
  byte_len: byteLen,
  language_hint: "markdown",
  text: READER_FIXTURE_MARKDOWN,
  truncated: null,
  tiers: { structural: { available: true } },
};
const content = deriveContentView(response, null, false);

// The binding reader frame (455:1117) is a card: the ONE chrome bar (breadcrumb +
// View/Edit toggle — the real `DocChrome`), then the reading column + footer the
// real MarkdownReader renders. The harness composes the card from the SAME
// `DocChrome` the app uses, so this capture verifies the real chrome, not a mock.
function ReaderVisualHarness() {
  return (
    <div className="flex h-screen min-h-0 justify-center bg-paper text-ink">
      <div
        className="flex min-h-0 flex-col overflow-hidden rounded-[1rem] border border-rule bg-paper"
        style={{ width: `${surfaceWidth}px` }}
        data-reader-surface
      >
        <DocChrome
          trail={[
            { label: "Vault" },
            { label: "Decisions" },
            { label: "Phase-lane arc timeline" },
          ]}
          mode="view"
          onModeChange={() => undefined}
          canEdit
        />
        <div className="min-h-0 flex-1">
          <MarkdownReader content={content} scope={null} />
        </div>
      </div>
    </div>
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ReaderVisualHarness />
    </QueryClientProvider>
  </StrictMode>,
);
