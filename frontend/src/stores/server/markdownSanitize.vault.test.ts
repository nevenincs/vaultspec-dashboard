// Live-vault enumeration (document-reader hardening): walk EVERY `.vault/**/*.md`
// document in this project, extract EVERY markdown heading at EVERY level
// (frontmatter stripped, fenced code blocks skipped), run each through the reader
// heading sanitizer, and assert the result is plain text — no residual markdown
// formatting per the no-noise editorial directive. This drives the sanitizer to an
// all-green against the real corpus, not just crafted fixtures.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  deriveEditorialTitle,
  sanitizeHeadingText,
  sanitizeReaderBody,
} from "./markdownSanitize";
import { parseDocument } from "./parseDocument";

const VAULT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../.vault",
);

function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(full));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/** Extract raw heading texts from a markdown body, skipping fenced code blocks. */
function extractHeadings(body: string): string[] {
  const headings: string[] = [];
  let inFence = false;
  let fenceChar = "";
  for (const line of body.split("\n")) {
    const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const char = fence[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = char;
      } else if (
        char === fenceChar &&
        new RegExp(`^\\s{0,3}\\${fenceChar}{3,}\\s*$`).test(line)
      ) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;
    const h = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (h && h[1].trim() !== "") headings.push(h[1]);
  }
  return headings;
}

// The sanitization rules, as detectors: a sanitized heading must contain none of
// these. Paired-marker detectors (not lone `*` / `_`) so a literal glob like
// `*.md` or a `snake_case` identifier is not a false positive.
const RESIDUAL: Array<[string, RegExp]> = [
  ["inline code (`)", /`/],
  ["bold (**…**)", /\*\*[^*]+\*\*/],
  ["italic (*…*)", /\*[^*\s][^*]*\*/],
  ["bold (__…__)", /(?<![\p{L}\p{N}])__[^_]+__(?![\p{L}\p{N}])/u],
  ["italic (_…_)", /(?<![\p{L}\p{N}])_[^_]+_(?![\p{L}\p{N}])/u],
  ["strikethrough (~~)", /~~[^~]+~~/],
  ["highlight (==)", /==[^=]+==/],
  ["wiki link ([[)", /\[\[/],
  ["md link (](…))", /\]\([^)]*\)/],
  // Real HTML tags only — a bare placeholder like <path>/<stem> is content, not
  // formatting, and is intentionally preserved by the sanitizer.
  [
    "html tag",
    /<\/?(?:a|abbr|b|blockquote|br|code|del|div|em|h[1-6]|hr|i|img|ins|kbd|li|mark|ol|p|pre|q|s|samp|small|span|strong|sub|sup|table|tbody|td|th|thead|tr|u|ul|var)\b[^>]*>|<[A-Za-z][^>]*(?:=|\/)[^>]*>/i,
  ],
];

function residualNoise(s: string): string[] {
  return RESIDUAL.filter(([, re]) => re.test(s)).map(([name]) => name);
}

describe("live vault heading sanitization", () => {
  const files = existsSync(VAULT_DIR) ? walkMarkdown(VAULT_DIR) : [];

  it("finds the vault corpus", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("sanitizes EVERY heading at EVERY level to plain text (all-green)", () => {
    const failures: string[] = [];
    let headingCount = 0;
    for (const file of files) {
      const { body } = parseDocument(readFileSync(file, "utf8"));
      for (const raw of extractHeadings(body)) {
        headingCount += 1;
        const sanitized = sanitizeHeadingText(raw);
        const noise = residualNoise(sanitized);
        const stable = sanitizeHeadingText(sanitized) === sanitized;
        if (noise.length > 0 || !stable) {
          const rel = file.slice(VAULT_DIR.length + 1).replace(/\\/g, "/");
          failures.push(
            `${rel}\n    raw: ${JSON.stringify(raw)}\n    out: ${JSON.stringify(sanitized)}\n    ${noise.length ? `residual: ${noise.join(", ")}` : "not idempotent"}`,
          );
        }
      }
    }
    // Surface the first failures for diagnosis; the assertion is zero.
    if (failures.length > 0) {
      throw new Error(
        `${failures.length} of ${headingCount} headings still carry markdown noise:\n\n${failures.slice(0, 40).join("\n\n")}`,
      );
    }
    expect(headingCount).toBeGreaterThan(0);
  });

  it("produces a clean human-readable editorial title for every authored doc", () => {
    // The authored editorial documents (the doc-types whose H1 follows the
    // vaultspec template). Exec STEP records are action sentences, not editorial
    // titles, so they are validated by the heading pass above, not here.
    const DOC_DIRS = ["adr", "audit", "plan", "research", "reference"];
    const failures: string[] = [];
    let titleCount = 0;
    for (const file of files) {
      const rel = file.slice(VAULT_DIR.length + 1).replace(/\\/g, "/");
      const topDir = rel.split("/")[0];
      if (!DOC_DIRS.includes(topDir)) continue;
      const { body } = parseDocument(readFileSync(file, "utf8"));
      const h1 = extractHeadings(body)[0];
      if (h1 === undefined) continue;
      titleCount += 1;
      const title = deriveEditorialTitle(h1);
      const problems: string[] = [];
      if (title === "") problems.push("empty");
      if (/`/.test(title)) problems.push("backtick");
      if (/\|\s*\(?\s*status/i.test(title)) problems.push("status block");
      if (/\]\([^)]*\)|\[\[/.test(title)) problems.push("link syntax");
      // The technical "{slug} {doctype}:" template prefix must be gone.
      if (
        /^[\p{L}\p{N}][\p{L}\p{N}-]*\s+(?:adr|audit|plan|research|reference)\s*:/iu.test(
          title,
        )
      ) {
        problems.push("doctype prefix");
      }
      if (problems.length > 0) {
        failures.push(
          `${rel}\n    h1:    ${JSON.stringify(h1)}\n    title: ${JSON.stringify(title)}\n    ${problems.join(", ")}`,
        );
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `${failures.length} of ${titleCount} editorial titles are not clean:\n\n${failures.slice(0, 40).join("\n\n")}`,
      );
    }
    expect(titleCount).toBeGreaterThan(0);
  });

  it("strips EVERY HTML comment from the read-mode body (outside code fences)", () => {
    const failures: string[] = [];
    let withComments = 0;
    for (const file of files) {
      const { body } = parseDocument(readFileSync(file, "utf8"));
      if (!body.includes("<!--")) continue;
      withComments += 1;
      const sanitized = sanitizeReaderBody(body);
      // Scan the sanitized output fence-aware: a `<!--`/`-->` may legitimately
      // survive ONLY inside a fenced code block (literal code), never as prose.
      let inFence = false;
      let fenceChar = "";
      for (const line of sanitized.split("\n")) {
        const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
        if (fence) {
          const char = fence[1][0];
          if (!inFence) {
            inFence = true;
            fenceChar = char;
          } else if (
            char === fenceChar &&
            new RegExp(`^\\s{0,3}\\${fenceChar}{3,}\\s*$`).test(line)
          ) {
            inFence = false;
          }
          continue;
        }
        if (inFence) continue;
        if (line.includes("<!--") || line.includes("-->")) {
          const rel = file.slice(VAULT_DIR.length + 1).replace(/\\/g, "/");
          failures.push(`${rel}\n    leaked: ${JSON.stringify(line)}`);
          break;
        }
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `${failures.length} of ${withComments} comment-bearing docs leaked a comment into the reader:\n\n${failures.slice(0, 40).join("\n\n")}`,
      );
    }
    expect(withComments).toBeGreaterThan(0);
  });
});
