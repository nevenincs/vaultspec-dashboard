// Temp keyboard-navigation verification harness (keyboard-navigation W07.S34).
// Launches its OWN Chromium with software WebGL (dodging the headless-WebGL crash
// and the locked MCP browser profiles) and drives the full-shell keyboard
// traversal, printing a JSON report. Deleted after the run.
import { chromium } from "playwright";

const URL = process.env.KBNAV_URL || "http://localhost:5176/";
const out = {};

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-gl=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => {
  out.pageError = out.pageError || String(e).slice(0, 120);
});

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
// Wait for the shell regions to mount (the graph may still be loading; we only
// need the DOM/focus model).
await page.waitForSelector('[data-focus-region="left-rail"]', { timeout: 60000 });
await page.waitForTimeout(4000); // let initial-focus effect + first paint settle

const region = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return "BODY";
    const h = a.closest && a.closest("[data-focus-region]");
    const label = (a.getAttribute("aria-label") || a.textContent || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 18);
    return `${h ? h.getAttribute("data-focus-region") : "(none)"}:${a.tagName.toLowerCase()}${a.id ? "#" + a.id : ""} "${label}"`;
  });

// 1. Initial focus + structural snapshot.
out.initialFocus = await page.evaluate(() => {
  const a = document.activeElement;
  return a === document.body ? "BODY(FAIL)" : a.tagName + "#" + (a.id || "");
});
out.structural = await page.evaluate(() => {
  const tabbables = Array.from(
    document.querySelectorAll("a[href],button,input,select,textarea,[tabindex]"),
  ).filter(
    (el) =>
      el.offsetParent !== null &&
      el.getAttribute("tabindex") !== "-1" &&
      !el.disabled,
  );
  return {
    totalTabbable: tabbables.length,
    skipLinkFirst: (
      document.querySelectorAll(
        "a[href],button,input,select,textarea,[tabindex]",
      )[0]?.textContent || ""
    )
      .trim()
      .slice(0, 18),
    regions: Array.from(document.querySelectorAll("[data-focus-region]")).map((e) =>
      e.getAttribute("data-focus-region"),
    ),
    timelineContained: Array.from(
      document.querySelectorAll("[data-timeline-accessible-nodes] button"),
    ).filter((b) => b.tabIndex >= 0).length,
  };
});

// 2. F6 region cycle (forward) + Shift+F6 (reverse).
await page.evaluate(() => document.querySelector("#stage")?.focus());
out.f6Cycle = [];
for (let i = 0; i < 4; i++) {
  await page.keyboard.press("F6");
  await page.waitForTimeout(150);
  out.f6Cycle.push(await region());
}
await page.evaluate(() => document.querySelector("#stage")?.focus());
await page.waitForTimeout(100);
out.shiftF6 = [];
for (let i = 0; i < 2; i++) {
  await page.keyboard.press("Shift+F6");
  await page.waitForTimeout(150);
  out.shiftF6.push(await region());
}

// 3. Vault tree roving: focus the tree's roving row, ArrowDown twice.
out.treeRove = await page.evaluate(() => {
  const r = Array.from(
    document.querySelectorAll('[data-focus-region="left-rail"] button'),
  ).find((b) => b.tabIndex === 0 && /Features|Documents/i.test(b.textContent || ""));
  if (r) {
    r.focus();
    return (r.textContent || "").trim().slice(0, 16);
  }
  return "NO-ROVING-ROW";
});
if (out.treeRove !== "NO-ROVING-ROW") {
  const trace = [];
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(120);
    trace.push(
      await page.evaluate(() =>
        (document.activeElement?.textContent || "").trim().slice(0, 16),
      ),
    );
  }
  out.treeRoveTrace = trace;
}

// 4. Viewer scroll regions are focusable.
out.viewerFocusable = await page.evaluate(() => {
  const code = document.querySelector(
    '[role="region"][aria-label*="document" i], [data-stage] [role="region"]',
  );
  const focusableRegions = Array.from(
    document.querySelectorAll('[role="region"][tabindex="0"]'),
  ).length;
  return { focusableRegions };
});

// 5. Context-menu double-fire (S28): open the menu on a tree row via Shift+F10,
//    ArrowDown must move the menu cursor (aria-activedescendant) and stay in the
//    menu (no leak to the global graph-nav).
out.contextMenu = await (async () => {
  const focused = await page.evaluate(() => {
    // Whatever tree row currently holds the rail's single tab stop (roving may
    // have moved it). A feature/doc row carries the vault-doc context menu.
    const r = Array.from(
      document.querySelectorAll('[data-focus-region="left-rail"] button'),
    ).find(
      (b) => b.tabIndex === 0 && /\d$/.test((b.textContent || "").trim()),
    );
    if (!r) return false;
    r.focus();
    return true;
  });
  if (!focused) return "no-tree-row";
  await page.keyboard.press("ContextMenu");
  await page.waitForTimeout(250);
  const before = await page.evaluate(() => {
    const m = document.querySelector('[role="menu"]');
    return m
      ? { open: true, active: m.getAttribute("aria-activedescendant") || null }
      : { open: false };
  });
  if (!before.open) return "menu-did-not-open";
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => {
    const m = document.querySelector('[role="menu"]');
    return {
      stillOpen: !!m,
      active: m ? m.getAttribute("aria-activedescendant") || null : null,
      focusInMenu: !!document.activeElement?.closest('[role="menu"]'),
    };
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const closed = await page.evaluate(
    () => !document.querySelector('[role="menu"]'),
  );
  return {
    cursorMoved: before.active !== after.active,
    stayedInMenu: after.stillOpen,
    closedOnEscape: closed,
  };
})();

// 6. PR rows (S22): if the Open PRs section has rows, they should be focusable
//    and rove.
out.prRows = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll("li[data-pr]"));
  const tab0 = rows.filter((r) => r.tabIndex === 0);
  return { count: rows.length, focusable: rows.filter((r) => r.tabIndex >= -1 && r.hasAttribute("tabindex")).length, tab0: tab0.length };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
