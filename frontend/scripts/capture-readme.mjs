import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const outputDir = resolve(repoRoot, "docs/assets");
const origin = process.env.VAULTSPEC_README_ORIGIN ?? "http://127.0.0.1:8770";
const outputs = {
  workspace: resolve(outputDir, "workspace.png"),
  document: resolve(outputDir, "document-workspace.png"),
  search: resolve(outputDir, "search.png"),
  status: resolve(outputDir, "status.png"),
};

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});

const manifest = {
  schema: "vaultspec.readme-captures.v1",
  captured_at: new Date().toISOString(),
  origin,
  viewport: { width: 1440, height: 900 },
  figures: {},
};

async function capture(page, name, path, evidence) {
  await page.screenshot({ path, animations: "disabled" });
  const bytes = await readFile(path);
  manifest.figures[name] = {
    file: `docs/assets/${path.split(/[\\/]/).at(-1)}`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    evidence,
  };
}

try {
  const page = await browser.newPage({ viewport: manifest.viewport });
  await page.goto(origin, { waitUntil: "domcontentloaded" });

  await page.getByRole("application", { name: /node canvas/i }).waitFor();
  await page.getByRole("region", { name: "activity" }).waitFor();
  await page.locator("[data-timeline]").waitFor();

  const vaultMode = page.getByRole("radio", { name: "Vault", exact: true });
  if (!(await vaultMode.isChecked())) await vaultMode.click();

  for (const control of [page.getByRole("button", { name: "⚒ degrade" })]) {
    if (await control.count()) await control.first().evaluate((node) => node.remove());
  }
  const crashButton = page.getByRole("button", { name: "left-rail", exact: true });
  if (await crashButton.count()) {
    await crashButton.first().evaluate((node) => node.parentElement?.remove());
  }

  await page
    .getByRole("navigation", { name: "vault browser" })
    .waitFor({ timeout: 90_000 });
  await page
    .getByText(/Still loading/i)
    .first()
    .waitFor({ state: "hidden", timeout: 90_000 });

  const summary = page.getByRole("button", {
    name: /\d+ files?\s+\d+ documents?/i,
  });
  await summary.first().waitFor();
  const summaryText = await summary.first().innerText();
  const documentCount = Number(summaryText.match(/(\d+) documents?/i)?.[1] ?? 0);
  if (documentCount < 1) {
    throw new Error(`dashboard document summary is not ready: ${summaryText}`);
  }

  const location = await page
    .getByRole("button", { name: /^current location:/i })
    .getAttribute("aria-label");
  await page.waitForTimeout(3000);
  await capture(page, "workspace", outputs.workspace, {
    page_title: await page.title(),
    current_location: location,
    document_summary: summaryText.replace(/\s+/g, " ").trim(),
    graph_present: true,
    timeline_present: true,
    activity_present: true,
  });

  const documents = page.getByRole("button", { name: /^Documents \d+$/ });
  if ((await documents.getAttribute("aria-expanded")) !== "true")
    await documents.click();
  const decisions = page.getByRole("button", { name: /^Decisions \d+$/ });
  if ((await decisions.getAttribute("aria-expanded")) !== "true")
    await decisions.click();
  const decisionList = decisions
    .locator("xpath=..")
    .locator("xpath=following-sibling::*[1]");
  const decision = decisionList.getByRole("button").first();
  const decisionLabel = (await decision.innerText()).replace(/\s+/g, " ").trim();
  await decision.dblclick();
  const documentRegion = page.getByRole("region", { name: "document", exact: true });
  await documentRegion.waitFor();
  const documentTitle = await documentRegion
    .getByRole("heading", { level: 1 })
    .innerText();
  await page
    .getByText(/Refreshing view/i)
    .first()
    .waitFor({ state: "hidden", timeout: 90_000 });
  await page.waitForTimeout(2000);
  await capture(page, "document", outputs.document, {
    selected_record: decisionLabel,
    document_title: documentTitle,
    document_region_present: true,
    graph_present: true,
  });

  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${mod}+P`);
  const searchDialog = page.getByRole("dialog", { name: "Search documents and code" });
  await searchDialog.waitFor();
  const searchInput = searchDialog.getByRole("combobox", {
    name: "Search documents and code…",
  });
  const searchQuery = "dashboard";
  await searchInput.fill(searchQuery);
  await searchDialog
    .getByText(/\d+ results?/i)
    .first()
    .waitFor({ timeout: 90_000 });
  const resultSummary = await searchDialog
    .getByText(/\d+ results?/i)
    .first()
    .innerText();
  const semanticOffline =
    (await searchDialog.locator("[data-semantic-offline]").count()) > 0;
  await capture(page, "search", outputs.search, {
    query: searchQuery,
    result_summary: resultSummary,
    semantic_offline: semanticOffline,
    scopes: ["All", "Docs", "Code"],
  });

  await page.keyboard.press("Escape");
  for (const buttonName of [/^Open plans \d+$/, /^Search service$/]) {
    const button = page.getByRole("button", { name: buttonName }).first();
    if (await button.count()) {
      if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
    }
  }
  await page
    .getByText(/Refreshing view/i)
    .first()
    .waitFor({ state: "hidden", timeout: 90_000 });
  await page.waitForTimeout(2000);
  await capture(page, "status", outputs.status, {
    activity_present: true,
    open_plans_visible: (await page.getByText(/^Open plans$/).count()) > 0,
    search_service_visible: (await page.getByText(/^Search service$/).count()) > 0,
  });

  await writeFile(
    resolve(outputDir, "readme-captures.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log(`wrote ${Object.values(outputs).join(", ")}`);
  console.log(`wrote ${resolve(outputDir, "readme-captures.json")}`);
} finally {
  await browser.close();
}
