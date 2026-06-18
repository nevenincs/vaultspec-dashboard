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
const surfaceWidth = Number(params.get("w") ?? "860") || 860;
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

// The binding Reader frame (263:871) is a 760-wide card: a chrome topbar
// (breadcrumb + View/Edit toggle — the DocHeader crown, wired for real in the
// next phase), a rule, then the reading column + footer the real MarkdownReader
// renders. The harness composes the card so the full-frame parity capture matches
// the Figma frame; the breadcrumb/toggle are faithful static chrome for now.
function ChromeTopbar() {
  return (
    <div className="flex shrink-0 items-center justify-between bg-paper py-[13px] pl-[20px] pr-[14px]">
      <div className="flex items-center gap-[6px] text-[12.5px]">
        <span className="text-ink-muted">Vault</span>
        <span className="text-ink-faint">/</span>
        <span className="text-ink-muted">Decisions</span>
        <span className="text-ink-faint">/</span>
        <span className="font-medium text-ink">Graph layout catalog</span>
      </div>
      <div className="flex items-center gap-[2px] rounded-[9px] bg-paper-sunken p-[3px]">
        <span className="rounded-[5px] bg-paper-raised px-[12px] py-[5px] text-[11.5px] font-medium text-ink">
          View
        </span>
        <span className="rounded-[5px] px-[12px] py-[5px] text-[11.5px] text-ink-muted">
          Edit
        </span>
      </div>
    </div>
  );
}

function ReaderVisualHarness() {
  return (
    <div className="flex h-screen min-h-0 justify-center bg-paper text-ink">
      <div
        className="flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-rule bg-paper"
        style={{ width: `${surfaceWidth}px` }}
        data-reader-surface
      >
        <ChromeTopbar />
        <div className="h-px w-full shrink-0 bg-rule" />
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
