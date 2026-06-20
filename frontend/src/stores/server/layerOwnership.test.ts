import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(HERE, "../..");
const PRODUCTION_SURFACES = ["app", "scene", "platform"] as const;
const VISUAL_HARNESS_ROOTS = [
  "filters-visual",
  "prototype",
  "status-visual",
  "three-lab",
  "timeline-visual",
  "viewer-visual",
] as const;
const VITE_CONFIG = resolve(SRC_ROOT, "../vite.config.ts");
const CONSOLE_ALLOWED_FILES = new Set(["platform/logger/logger.ts"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const PLAYHEAD_COMPONENT = "app/timeline/Playhead.tsx";
const TIMELINE_INTENT = "stores/view/timelineIntent.ts";
const BROWSER_SELECTION = resolve(SRC_ROOT, "app/left/browserSelection.ts");
const GRAPH_BOUNDS_SCENE_OWNER = "app/stage/Stage.tsx";
const GRAPH_OVERLAYS_SCENE_OWNER = "app/stage/Stage.tsx";
const GRAPH_REPRESENTATION_SCENE_OWNER = "app/stage/Stage.tsx";
const CODE_VIEWER = resolve(SRC_ROOT, "app/viewer/CodeViewer.tsx");
const FRONTMATTER_HEADER = resolve(SRC_ROOT, "app/viewer/FrontmatterHeader.tsx");
const MARKDOWN_READER = resolve(SRC_ROOT, "app/viewer/MarkdownReader.tsx");
const REMARK_WIKI_LINK = resolve(SRC_ROOT, "app/viewer/remarkWikiLink.ts");
const DOC_PANEL = resolve(SRC_ROOT, "app/stage/DocPanel.tsx");
const SETTINGS_EFFECTS = resolve(SRC_ROOT, "app/settings/settingsEffects.ts");
const VIEW_STORE = resolve(SRC_ROOT, "stores/view/viewStore.ts");
const VIEW_STORES_ROOT = resolve(SRC_ROOT, "stores/view");
const DASHBOARD_STATE_STORE = resolve(SRC_ROOT, "stores/server/dashboardState.ts");
const NON_WHOLESALE_VIEW_RESETS = new Set([
  "commandPalette.ts:resetCommandPaletteOpsFeedback",
  "commandPalette.ts:resetCommandPaletteSurfaceState",
  "opsReceipt.ts:resetOpsReceipt",
]);
const ALLOWED_PRODUCTION_USE_STATE = new Map<string, number>([]);
const ALLOWED_PRODUCTION_STORE_HOOK_CALLS = new Map<string, number>([
  ["platform/errors/CrashInjector.tsx:useCrashStore", 3],
]);

function sourceFiles(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path));
      continue;
    }
    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name))) continue;
    if (entry.name.includes(".test.") || entry.name.includes(".stories.")) continue;
    files.push(path);
  }
  return files;
}

function sourceFilesIncludingTests(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFilesIncludingTests(path));
      continue;
    }
    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name))) continue;
    if (entry.name.includes(".stories.")) continue;
    files.push(path);
  }
  return files;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function importStatements(source: string): string[] {
  return [...source.matchAll(/import\s+(?:[\s\S]*?)\s+from\s+["'][^"']+["'];?/g)].map(
    (match) => match[0],
  );
}

function existingSourceRels(rels: readonly string[]): string[] {
  return rels.filter((rel) => existsSync(join(SRC_ROOT, rel)));
}

function isRuntimeEngineImport(statement: string): boolean {
  if (!/["'][^"']*stores\/server\/engine["']/.test(statement.replaceAll("\\", "/"))) {
    return false;
  }
  return !/^import\s+type\b/.test(statement.trim());
}

function viewResetExports(): string[] {
  const resets: string[] = [];
  for (const file of sourceFiles(VIEW_STORES_ROOT)) {
    const rel = relative(VIEW_STORES_ROOT, file).replaceAll("\\", "/");
    const stripped = stripComments(readFileSync(file, "utf8"));
    for (const match of stripped.matchAll(
      /\bexport\s+function\s+(reset[A-Z]\w*)\s*\(/g,
    )) {
      resets.push(`${rel}:${match[1]}`);
    }
  }
  return resets.sort();
}

describe("dashboard layer ownership", () => {
  it("keeps production app chrome off direct engine transport", () => {
    const violations: string[] = [];

    for (const surface of PRODUCTION_SURFACES) {
      for (const file of sourceFiles(join(SRC_ROOT, surface))) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        for (const statement of importStatements(stripped)) {
          if (isRuntimeEngineImport(statement)) {
            violations.push(`${rel}: runtime import from stores/server/engine`);
          }
        }
        if (/\bengineClient\b/.test(stripped)) {
          violations.push(`${rel}: engineClient reference`);
        }
        if (/\bfetch\s*\(/.test(stripped)) {
          violations.push(`${rel}: direct fetch call`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps production stream subscriptions behind stores-owned seams", () => {
    const violations: string[] = [];

    for (const surface of PRODUCTION_SURFACES) {
      for (const file of sourceFiles(join(SRC_ROOT, surface))) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        for (const statement of importStatements(stripped)) {
          if (
            /\b(?:useEngineStream|engineStreamOptions|useBackendSignalStream)\b/.test(
              statement,
            )
          ) {
            violations.push(`${rel}: raw stream hook/options import`);
          }
        }
        if (/\bnew\s+EventSource\b/.test(stripped)) {
          violations.push(`${rel}: direct EventSource subscription`);
        }
        if (/["'`][^"'`]*\/stream\?/.test(stripped)) {
          violations.push(`${rel}: raw stream endpoint URL`);
        }
        if (/\b(?:openStream|streamUrl)\s*\(/.test(stripped)) {
          violations.push(`${rel}: direct stream transport call`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps engine stream cache identity normalized at the stores seam", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const seam of [
      "normalizeEngineStreamChannel",
      "normalizeEngineStreamChannels",
      "normalizeEngineStreamSince",
      "normalizeEngineStreamScope",
      "normalizeEngineStreamIdentity",
    ]) {
      if (!new RegExp(`\\bexport\\s+function\\s+${seam}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${seam}`);
      }
    }
    if (!/\bENGINE_STREAM_CHANNELS\s*=\s*\[\s*["']backends["']\s*,\s*["']git["']\s*,\s*["']graph["']\s*\]/.test(stripped)) {
      violations.push(`${rel}: stream channel domain is not canonical`);
    }
    if (
      !/\bstream:\s*\(\s*channels:\s*readonly\s+unknown\[\]\s*,\s*since\?:\s*unknown,\s*scope\?:\s*unknown\s*\)\s*=>\s*\{[\s\S]*\bnormalizeEngineStreamIdentity\s*\(\s*channels\s*,\s*since\s*,\s*scope\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: engine stream key bypasses normalized identity`);
    }
    if (
      !/\bengineStreamOptions\s*\(\s*channels:\s*readonly\s+unknown\[\]\s*,[\s\S]*\bconst\s+identity\s*=\s*normalizeEngineStreamIdentity\s*\(\s*channels\s*,\s*since\s*,\s*scope\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: stream options bypass normalized identity`);
    }
    if (/\bengineKeys\.stream\s*\(\s*channels\s*,\s*since\s*,\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: stream options pass raw identity to query key`);
    }
    if (/\bopenStream\s*\(\s*\[\s*\.\.\.channels\s*\]/.test(stripped)) {
      violations.push(`${rel}: stream options pass raw channels to transport`);
    }
    if (!/\bnormalizeBackendSignalChannel[\s\S]*\bnormalizeEngineStreamChannel\s*\(\s*channel\s*\)/.test(stripped)) {
      violations.push(`${rel}: backend-signal channel normalization is forked`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps production local state limited to reviewed ephemeral exceptions", () => {
    const seen = new Map<string, number>();
    const violations: string[] = [];

    for (const surface of PRODUCTION_SURFACES) {
      for (const file of sourceFiles(join(SRC_ROOT, surface))) {
        const stripped = stripComments(readFileSync(file, "utf8"));
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
        for (const match of stripped.matchAll(
          /const\s+\[\s*(\w+)\s*,\s*(\w+)\s*\]\s*=\s*useState\b/g,
        )) {
          const key = `${rel}:${match[1]}:${match[2]}`;
          seen.set(key, (seen.get(key) ?? 0) + 1);
          if (!ALLOWED_PRODUCTION_USE_STATE.has(key)) {
            violations.push(`${key}: unreviewed production useState tuple`);
          }
        }
        if (/\buseState\s*\(/.test(stripped)) {
          const tupleCalls = [
            ...stripped.matchAll(
              /const\s+\[\s*\w+\s*,\s*\w+\s*\]\s*=\s*useState(?:<[^>]+>)?(?=\s*\()/g,
            ),
          ].length;
          const totalCalls = [...stripped.matchAll(/\buseState(?:<[^>]+>)?\s*\(/g)]
            .length;
          if (tupleCalls !== totalCalls) {
            violations.push(`${rel}: unclassified production useState call`);
          }
        }
      }
    }

    for (const [key, expected] of ALLOWED_PRODUCTION_USE_STATE.entries()) {
      const actual = seen.get(key) ?? 0;
      if (actual !== expected) {
        violations.push(
          `${key}: expected ${expected} reviewed tuple(s), saw ${actual}`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps production raw store hook usage limited to reviewed platform exceptions", () => {
    const seen = new Map<string, number>();
    const violations: string[] = [];

    for (const surface of PRODUCTION_SURFACES) {
      for (const file of sourceFiles(join(SRC_ROOT, surface))) {
        const stripped = stripComments(readFileSync(file, "utf8"));
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
        for (const match of stripped.matchAll(/\b(use[A-Z]\w*Store)\s*\(/g)) {
          const hook = match[1];
          if (hook === "useSyncExternalStore") continue;
          const key = `${rel}:${hook}`;
          seen.set(key, (seen.get(key) ?? 0) + 1);
          if (!ALLOWED_PRODUCTION_STORE_HOOK_CALLS.has(key)) {
            violations.push(`${key}: raw production store hook call`);
          }
        }
      }
    }

    for (const [key, expected] of ALLOWED_PRODUCTION_STORE_HOOK_CALLS.entries()) {
      const actual = seen.get(key) ?? 0;
      if (actual !== expected) {
        violations.push(
          `${key}: expected ${expected} reviewed store hook call(s), saw ${actual}`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps timeline mode writes behind the playhead seam", () => {
    const violations: string[] = [];

    for (const surface of PRODUCTION_SURFACES) {
      for (const file of sourceFiles(join(SRC_ROOT, surface))) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
        if (/\bsetTimelineMode\s*\(/.test(stripped)) {
          violations.push(`${rel}: direct timeline_mode write`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps production playhead writes scoped to dashboard-state", () => {
    const violations: string[] = [];

    for (const surface of PRODUCTION_SURFACES) {
      for (const file of sourceFiles(join(SRC_ROOT, surface))) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        if (/\bmovePlayhead\s*\([^,]+,\s*null\s*\)/.test(stripped)) {
          violations.push(`${rel}: local-first playhead write in production surface`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps playhead writes behind the store-owned timeline intent seam", () => {
    const violations: string[] = [];
    const playhead = stripComments(
      readFileSync(join(SRC_ROOT, PLAYHEAD_COMPONENT), "utf8"),
    );
    const intent = stripComments(readFileSync(join(SRC_ROOT, TIMELINE_INTENT), "utf8"));

    for (const surface of PRODUCTION_SURFACES) {
      for (const file of sourceFiles(join(SRC_ROOT, surface))) {
        const stripped = stripComments(readFileSync(file, "utf8"));
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        for (const statement of importStatements(stripped)) {
          if (
            /\bmovePlayhead\b/.test(statement) &&
            !/stores\/view\/timelineIntent/.test(statement)
          ) {
            violations.push(`${rel}: playhead write imported outside timeline intent`);
          }
        }
      }
    }

    if (/\bpatchDashboardTimelineMode\b/.test(playhead)) {
      violations.push(`${PLAYHEAD_COMPONENT}: component owns timeline-mode write`);
    }
    if (!/\bstartPlayheadDragPointerSession\s*\(/.test(playhead)) {
      violations.push(`${PLAYHEAD_COMPONENT}: missing playhead drag pointer seam`);
    }
    if (/\b(?:host|globalThis)\.addEventListener\s*\(\s*["']pointer/.test(playhead)) {
      violations.push(`${PLAYHEAD_COMPONENT}: local playhead pointer listener`);
    }
    if (
      /\b(?:host|globalThis)\.removeEventListener\s*\(\s*["']pointer/.test(playhead)
    ) {
      violations.push(`${PLAYHEAD_COMPONENT}: local playhead pointer cleanup`);
    }
    if (!/\bpatchDashboardTimelineMode\b/.test(intent)) {
      violations.push(`${TIMELINE_INTENT}: missing dashboard timeline-mode write`);
    }
    if (!/\bsetTimelinePlayhead\b/.test(intent)) {
      violations.push(`${TIMELINE_INTENT}: missing local playhead projection`);
    }
    if (
      /\bmovePlayhead\s*\(\s*t:\s*DashboardPlayhead,\s*scope:\s*string\s*\|\s*null/.test(
        intent,
      )
    ) {
      violations.push(`${TIMELINE_INTENT}: movePlayhead trusts typed-only scope`);
    }
    if (!/\bmovePlayhead\s*\(\s*t:\s*unknown,\s*scope:\s*unknown/.test(intent)) {
      violations.push(`${TIMELINE_INTENT}: movePlayhead lacks runtime input seam`);
    }
    if (
      !/\bconst\s+playhead\s*=\s*normalizeTimelinePlayhead\s*\(\s*t\s*\)[\s\S]*\bconst\s+normalizedScope\s*=\s*normalizeTimelineScope\s*\(\s*scope\s*\)/.test(
        intent,
      )
    ) {
      violations.push(`${TIMELINE_INTENT}: movePlayhead bypasses input normalizers`);
    }
    if (
      !/\bnormalizedScope\s*!==\s*null[\s\S]*patchDashboardTimelineMode\s*\([\s\S]*normalizedScope[\s\S]*dashboardTimelineModeForPlayhead\s*\(\s*playhead\s*\)/.test(
        intent,
      )
    ) {
      violations.push(`${TIMELINE_INTENT}: dashboard playhead write uses raw identity`);
    }
    if (
      !/\bscope\s*==\s*null[\s\S]*setTimelinePlayhead\s*\(\s*playhead\s*\)/.test(intent)
    ) {
      violations.push(`${TIMELINE_INTENT}: local playhead fallback is not explicit`);
    }
    for (const seam of [
      "startPlayheadDragPointerSession",
      "dragToPlayhead",
      "keyboardStep",
      "timelineViewportXToTime",
      "timelineViewSnapshot",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(intent)) {
        violations.push(`${TIMELINE_INTENT}: missing ${seam} seam`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps hook timeline-mode writes on the guarded playhead seam", () => {
    const stripped = stripComments(readFileSync(DASHBOARD_STATE_STORE, "utf8"));
    const normalization = stripComments(
      readFileSync(
        join(SRC_ROOT, "stores/server/dashboardStateNormalization.ts"),
        "utf8",
      ),
    );
    const adapter = stripComments(
      readFileSync(join(SRC_ROOT, "stores/server/liveAdapters.ts"), "utf8"),
    );
    const violations: string[] = [];

    if (
      !/\bexport\s+function\s+normalizeDashboardTimelineMode\s*\(\s*mode:\s*unknown[\s\S]*Number\.isFinite\s*\(\s*mode\.at\s*\)/.test(
        normalization,
      )
    ) {
      violations.push(
        "stores/server/dashboardStateNormalization.ts: missing timeline-mode normalizer",
      );
    }
    if (
      !/\btimelineModePatch\s*\(\s*timeline_mode:\s*unknown\s*,?\s*\)[\s\S]*?:\s*DashboardStateMutationPatch\s*\{[\s\S]*normalizeDashboardTimelineMode\s*\(\s*timeline_mode\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(
        "stores/server/dashboardState.ts: timeline-mode patch trusts typed input",
      );
    }
    if (
      !/\bpatchDashboardTimelineMode\s*\([\s\S]*mode:\s*unknown[\s\S]*timelineModePatch\s*\(\s*mode\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(
        "stores/server/dashboardState.ts: timeline-mode write bypasses runtime normalizer",
      );
    }
    if (
      !/setTimelineMode:\s*\([^)]*\)\s*=>\s*patchDashboardTimelineMode\s*\(/.test(
        stripped,
      )
    ) {
      violations.push(
        "stores/server/dashboardState.ts: timeline-mode mutation bypasses guarded write",
      );
    }
    if (
      /setTimelineMode:\s*\([^)]*\)\s*=>\s*mutation\.mutateAsync\s*\(\s*timelineModePatch\s*\(/.test(
        stripped,
      )
    ) {
      violations.push(
        "stores/server/dashboardState.ts: timeline-mode mutation bypasses guarded playhead seam",
      );
    }
    for (const typedOnly of [
      "timelineModePatch(\n  timeline_mode: DashboardTimelineMode",
      "patchDashboardTimelineMode(\n  scope: string | null,\n  mode: DashboardTimelineMode",
      "patchDashboardTimelineMode(\n  scope: string | null,\n  mode: unknown",
      "setTimelineMode: (mode: DashboardTimelineMode)",
    ]) {
      if (stripped.includes(typedOnly)) {
        violations.push(
          `stores/server/dashboardState.ts: typed-only timeline-mode seam ${typedOnly}`,
        );
      }
    }
    for (const [required, pattern] of [
      [
        "timelineModePatch(timeline_mode: unknown)",
        /\btimelineModePatch\s*\(\s*timeline_mode:\s*unknown\s*\)/,
      ],
      [
        "patchDashboardTimelineMode(scope: unknown, mode: unknown)",
        /\bpatchDashboardTimelineMode\s*\(\s*scope:\s*unknown,\s*mode:\s*unknown/,
      ],
      ["setTimelineMode: (mode: unknown)", /setTimelineMode:\s*\(mode:\s*unknown\)/],
    ] as const) {
      if (!pattern.test(stripped)) {
        violations.push(
          `stores/server/dashboardState.ts: missing runtime timeline-mode seam ${required}`,
        );
      }
    }
    if (
      !/\bnormalizeDashboardTimelineMode\s*\(\s*body\.timeline_mode\s*\)/.test(adapter)
    ) {
      violations.push(
        "stores/server/liveAdapters.ts: dashboard adapter bypasses timeline-mode normalizer",
      );
    }
    if (
      !/\bconst\s+normalizedScope\s*=\s*normalizeDashboardStateWriteScope\s*\(\s*scope\s*\)[\s\S]*beginDashboardTimelineModeWrite\s*\(\s*normalizedScope\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(
        "stores/server/dashboardState.ts: timeline-mode write bypasses scope normalizer",
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps visual dashboard mutation payloads normalized at the store seam", () => {
    const stripped = stripComments(readFileSync(DASHBOARD_STATE_STORE, "utf8"));
    const normalization = stripComments(
      readFileSync(join(SRC_ROOT, "stores/server/dashboardStateNormalization.ts"), "utf8"),
    );
    const adapter = stripComments(
      readFileSync(join(SRC_ROOT, "stores/server/liveAdapters.ts"), "utf8"),
    );
    const violations: string[] = [];

    for (const typedOnly of [
      "patchDashboardState(\n  scope: string | null",
      "usePatchDashboardState(scope: string | null",
      "useDashboardStateMutations(scope: string | null",
      "setSelection: (selectedIds: string[])",
      "setFilters: (filters: DashboardFilters)",
      "setDateRange: (dateRange: DashboardDateRange)",
      "setLens: (lens: SalienceLens)",
      "setFocus: (focus: string | null)",
      "setPanelState: (panelState: DashboardPanelState)",
      "updatePanelState: (panelState: DashboardPanelStateUpdate)",
      "toggleFilterFacet: (facet: DashboardFilterFacet, value: string)",
      'descendFeature: (state: Pick<DashboardState, "filters">, featureTag: string)',
      "descendFeatureTag: (featureTag: string)",
    ]) {
      if (stripped.includes(typedOnly)) {
        violations.push(
          `stores/server/dashboardState.ts: typed-only visual mutation ${typedOnly}`,
        );
      }
    }
    for (const requiredScopeSeam of [
      "patchDashboardState(\n  scope: unknown",
      "usePatchDashboardState(scope: unknown",
      "useDashboardStateMutations(scope: unknown",
    ]) {
      if (!stripped.includes(requiredScopeSeam)) {
        violations.push(
          `stores/server/dashboardState.ts: missing runtime write scope seam ${requiredScopeSeam}`,
        );
      }
    }
    if (
      !/from\s+["']\.\/scopeIdentity["'][\s\S]*\bnormalizeStoreScope\b/.test(
        stripped,
      ) ||
      !/\bexport\s+const\s+normalizeDashboardStateWriteScope\s*=\s*normalizeStoreScope\b/.test(
        stripped,
      )
    ) {
      violations.push(
        "stores/server/dashboardState.ts: missing shared dashboard write-scope normalizer",
      );
    }
    if (
      !/\bexport\s+function\s+useDashboardStateMutations\s*\(\s*scope:\s*unknown\s*\)[\s\S]*\bconst\s+normalizedScope\s*=\s*normalizeDashboardStateWriteScope\s*\(\s*scope\s*\)[\s\S]*\busePatchDashboardState\s*\(\s*normalizedScope\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(
        "stores/server/dashboardState.ts: dashboard mutations bypass write-scope normalizer",
      );
    }
    for (const required of [
      "setSelection: (selectedIds: unknown)",
      "setFilters: (filters: unknown)",
      "setDateRange: (dateRange: unknown)",
      "setLens: (lens: unknown)",
      "setFocus: (focus: unknown)",
      "setPanelState: (panelState: unknown)",
      "updatePanelState: (panelState: unknown)",
      "toggleFilterFacet: (facet: unknown, value: unknown)",
      "descendFeature: (state: unknown, featureTag: unknown)",
      "descendFeatureTag: (featureTag: unknown)",
    ]) {
      if (!stripped.includes(required)) {
        violations.push(
          `stores/server/dashboardState.ts: missing runtime visual mutation ${required}`,
        );
      }
    }
    if (
      !/\bexport\s+function\s+normalizeDashboardSelectedIds\s*\(\s*ids:\s*unknown\s*\)[\s\S]*Array\.isArray\s*\(\s*ids\s*\)[\s\S]*normalizeNodeIds\s*\(\s*ids\s*,\s*MAX_DASHBOARD_SELECTED_IDS\s*\)/.test(
        normalization,
      )
    ) {
      violations.push(
        "stores/server/dashboardStateNormalization.ts: selection normalizer trusts typed ids",
      );
    }
    if (
      !/from\s+["']\.\/scopeIdentity["'][\s\S]*\bnormalizeStoreScope\b/.test(
        adapter,
      ) ||
      !/\badaptDashboardState\b[\s\S]*\bscope:\s*normalizeStoreScope\s*\(\s*body\.scope\s*\)\s*\?\?\s*["']["']/.test(
        adapter,
      ) ||
      !/\badaptDashboardState\b[\s\S]*\bselected_ids:\s*normalizeDashboardSelectedIds\s*\(\s*body\.selected_ids\s*\)[\s\S]*\bhovered_id:\s*normalizeDashboardNodeId\s*\(\s*body\.hovered_id\s*\)[\s\S]*\bsalience_focus:\s*normalizeDashboardNodeId\s*\(\s*body\.salience_focus\s*\)/.test(
        adapter,
      )
    ) {
      violations.push(
        "stores/server/liveAdapters.ts: dashboard adapter bypasses dashboard identity normalizers",
      );
    }
    if (
      !/\bexport\s+function\s+filtersPatch\s*\(\s*filters:\s*unknown\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(
        "stores/server/dashboardState.ts: filters patch trusts typed filters",
      );
    }
    if (
      !/\bexport\s+function\s+normalizeDashboardFilterFacet\s*\(\s*facet:\s*unknown[\s\S]*DASHBOARD_FILTER_FACETS[\s\S]*includes\s*\(\s*normalized\s*\)/.test(
        stripped,
      ) ||
      !/\bexport\s+const\s+DASHBOARD_FILTER_FACET_VALUE_MAX_CHARS\b/.test(
        stripped,
      ) ||
      !/\bexport\s+function\s+normalizeDashboardFilterFacetValue\s*\(\s*value:\s*unknown[\s\S]*value\.trim\s*\(\s*\)[\s\S]*normalized\.length\s*<=\s*DASHBOARD_FILTER_FACET_VALUE_MAX_CHARS/.test(
        stripped,
      )
    ) {
      violations.push(
        "stores/server/dashboardState.ts: missing bounded runtime filter-facet normalizers",
      );
    }
    if (
      !/\bdashboardFiltersWithFacetToggled\s*\([\s\S]*filters:\s*unknown[\s\S]*facet:\s*unknown[\s\S]*value:\s*unknown[\s\S]*normalizeDashboardFilterFacet\s*\(\s*facet\s*\)[\s\S]*normalizeDashboardFilterFacetValue\s*\(\s*value\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(
        "stores/server/dashboardState.ts: facet toggler trusts typed facet/value",
      );
    }
    if (
      !/\bdashboardFeatureDescentPatch\s*\([\s\S]*state:\s*unknown[\s\S]*featureTag:\s*unknown[\s\S]*normalizeDashboardFeatureTag\s*\(\s*featureTag\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(
        "stores/server/dashboardState.ts: feature descent trusts typed feature tag",
      );
    }
    if (
      !/\bexport\s+function\s+dateRangePatch\s*\([\s\S]*date_range:\s*unknown/.test(
        stripped,
      )
    ) {
      violations.push(
        "stores/server/dashboardState.ts: date-range patch trusts typed range",
      );
    }
    if (
      !/\bexport\s+function\s+focusPatch\s*\(\s*salience_focus:\s*unknown\s*\)[\s\S]*normalizeDashboardNodeId\s*\(\s*salience_focus\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(
        "stores/server/dashboardState.ts: focus patch bypasses node id normalizer",
      );
    }
    if (
      !/\bexport\s+function\s+panelStatePatch\s*\([\s\S]*panel_state:\s*unknown[\s\S]*normalizeDashboardPanelState\s*\(\s*panel_state\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(
        "stores/server/dashboardState.ts: panel-state patch trusts typed state",
      );
    }
    if (
      !/\bconst\s+commitPanelState\s*=\s*\(\s*panelState:\s*unknown\s*\)[\s\S]*const\s+normalizedPanelState\s*=\s*normalizeDashboardPanelState\s*\(\s*panelState\s*\)[\s\S]*pendingPanelStatesByScope\.set\s*\(\s*normalizedScope\s*,\s*normalizedPanelState\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(
        "stores/server/dashboardState.ts: panel-state queue stores raw panel state",
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps playhead dashboard reads behind the playhead view selector", () => {
    const rel = PLAYHEAD_COMPONENT;
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardState\b/.test(statement)) {
        violations.push(`${rel}: raw dashboard-state playhead subscription`);
      }
    }
    if (/\bdashboardState\.data\b/.test(stripped)) {
      violations.push(`${rel}: local dashboard timeline-mode playhead projection`);
    }
    if (
      /\bfunction\s+Playhead\s*\(\s*\{\s*scope\s*\}\s*:\s*\{\s*scope:\s*string\s*\|\s*null\s*\}\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: Playhead trusts typed-only scope`);
    }
    if (
      /\bfunction\s+TimeTravelChip\s*\(\s*\{\s*scope\s*\}\s*:\s*\{\s*scope:\s*string\s*\|\s*null\s*\}\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: TimeTravelChip trusts typed-only scope`);
    }
    if (
      !/\bconst\s+normalizedScope\s*=\s*normalizeTimelineScope\s*\(\s*scope\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing runtime timeline scope normalization`);
    }
    if (!/\buseDashboardPlayheadView\s*\(\s*normalizedScope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing dashboard playhead view seam`);
    }
    if (!/\buseDashboardTimelineModeView\s*\(\s*normalizedScope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing dashboard timeline-mode chip seam`);
    }
    if (/\bmovePlayhead\s*\([^,\n]+,\s*normalizedScope\s*\)/.test(stripped)) {
      violations.push(
        `${rel}: playhead write passes normalized scope instead of raw runtime scope`,
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps time-travel driver dashboard reads behind the timeline view selector", () => {
    const rel = "app/timeline/timeTravel.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardState\b/.test(statement)) {
        violations.push(`${rel}: raw dashboard-state time-travel subscription`);
      }
    }
    if (/\bdashboardState\.data\b|\btimeline_mode\b/.test(stripped)) {
      violations.push(`${rel}: local dashboard timeline-mode read`);
    }
    if (/\buseTimeTravel\s*\(\s*scope:\s*string\s*\|\s*null/.test(stripped)) {
      violations.push(`${rel}: useTimeTravel trusts typed-only scope`);
    }
    if (
      !/\bconst\s+normalizedScope\s*=\s*normalizeTimelineScope\s*\(\s*scope\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing runtime timeline scope normalization`);
    }
    if (!/\buseDashboardTimelineModeView\s*\(\s*normalizedScope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing dashboard timeline view seam`);
    }
    if (
      !/\bnew\s+TimeTravelDriver\s*\(\s*timeTravelSource\s*,\s*normalizedScope\s*,\s*sceneTarget\s*\(\s*scene\s*\)\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: time-travel driver uses raw scope identity`);
    }
    if (
      /\bfrom\s+["']\.\.\/\.\.\/scene\/sceneMapping["'][\s\S]*\bengineNodeToScene\b/.test(
        stripped,
      ) ||
      /\bfrom\s+["']\.\.\/\.\.\/scene\/sceneMapping["'][\s\S]*\bengineEdgeToScene\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: time-travel imports local graph row mappers`);
    }
    if (
      !/\bmapDelta\s*\(\s*entry:\s*unknown\s*\):\s*SceneDelta\s*\|\s*null/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: time-travel delta mapper accepts typed-only input`);
    }
    if (!/\breturn\s+graphDeltaToScene\s*\(\s*entry\s*\)/.test(stripped)) {
      violations.push(`${rel}: time-travel delta mapper bypasses graph seam`);
    }
    if (
      !/\bconst\s+keyframe\s*=\s*sliceToScene\s*\(\s*asof\s*\)[\s\S]*nodes:\s*keyframe\.nodes[\s\S]*edges:\s*keyframe\.edges/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: time-travel keyframe bypasses slice mapper`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps timeline range playback scope as a runtime playhead input", () => {
    const rel = "app/timeline/RangeSelect.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (/\bscope:\s*string\s*\|\s*null\b/.test(stripped)) {
      violations.push(`${rel}: range playback stores typed-only scope`);
    }
    if (
      !/\binterface\s+PlayState\s*\{[\s\S]*\bscope:\s*unknown[\s\S]*\}/.test(stripped)
    ) {
      violations.push(`${rel}: play state does not preserve runtime scope input`);
    }
    if (!/\bstartRangePlay\s*\([\s\S]*\bscope:\s*unknown\s*=\s*null/.test(stripped)) {
      violations.push(`${rel}: startRangePlay trusts typed-only scope`);
    }
    if (!/\bmovePlayhead\s*\(\s*to\s*,\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: reduced-motion range play bypasses playhead seam`);
    }
    if (!/\bmovePlayhead\s*\([\s\S]*playState\.scope[\s\S]*\)/.test(stripped)) {
      violations.push(`${rel}: animated range play bypasses runtime scope`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps dashboard-state writes behind named stores helpers", () => {
    const violations: string[] = [];

    for (const surface of PRODUCTION_SURFACES) {
      for (const file of sourceFiles(join(SRC_ROOT, surface))) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        if (/\busePatchDashboardState\s*\(/.test(stripped)) {
          violations.push(`${rel}: raw dashboard-state patch hook`);
        }
        if (/\.mutation\s*\.\s*mutateAsync\s*\(/.test(stripped)) {
          violations.push(`${rel}: raw dashboard-state mutation write`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps disabled dashboard-state reads from exposing cached query data", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (
      !/\bexport\s+function\s+normalizeDashboardStateRequestIdentity\b[\s\S]*\bnormalizeGraphSliceScope\s*\(\s*scope\s*\)[\s\S]*\bdashboardStateSessionIdentity\s*\(\s*session\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: dashboard-state request identity trusts typed inputs`);
    }
    if (
      !/\bexport\s+function\s+useDashboardState\s*\(\s*scope:\s*unknown\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: dashboard-state hook exposes typed-only scope`);
    }
    if (/\buseDashboardState\s*\(\s*scope:\s*string\s*\|\s*null\s*\)/.test(stripped)) {
      violations.push(`${rel}: dashboard-state hook trusts string|null scope`);
    }
    for (const selector of [
      "useDashboardSelectedNodeId",
      "useDashboardDateRangeView",
      "useDashboardRangeSelectView",
      "useDashboardGraphDefaultsInitializationView",
      "useDashboardFilterSummaryView",
      "useDashboardFilterChoicesView",
      "useDashboardFilterChoices",
      "useDashboardFilterSidebarView",
      "useDashboardTimelineModeView",
      "useDashboardPlayheadView",
      "useDashboardStageSceneView",
      "useDashboardGraphControlsView",
      "useDashboardLayoutSelectorView",
      "useDashboardLensSelectorView",
      "useDashboardShellChromeView",
      "useDashboardTierDialView",
    ]) {
      if (
        !new RegExp(
          `\\bexport\\s+function\\s+${selector}\\s*\\(\\s*scope:\\s*unknown`,
        ).test(stripped)
      ) {
        violations.push(`${rel}: ${selector} exposes typed-only scope`);
      }
    }
    if (
      !/\bexport\s+function\s+dashboardGraphDefaultsInitializationIdentity\s*\(\s*scope:\s*unknown[\s\S]*\bconst\s+normalizedScope\s*=\s*normalizeGraphSliceScope\s*\(\s*scope\s*\)[\s\S]*scope:\s*normalizedScope/.test(
        stripped,
      )
    ) {
      violations.push(
        `${rel}: dashboard graph-default initialization identity trusts raw scope`,
      );
    }
    if (
      !/const\s+request\s*=\s*normalizeDashboardStateRequestIdentity\s*\(\s*scope\s*,\s*session\.data\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(
        `${rel}: dashboard-state hook bypasses request identity normalizer`,
      );
    }
    if (
      !/const\s+enabled\s*=\s*request\.scope\s*!==\s*null\s*&&\s*session\.isSuccess/.test(
        stripped,
      )
    ) {
      violations.push(
        `${rel}: dashboard-state query lacks normalized session/scope enabled gate`,
      );
    }
    if (
      !/queryKey:\s*engineKeys\.dashboardState\s*\(\s*request\.scope\s*\?\?\s*["']["']\s*,\s*request\.sessionIdentity\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: dashboard-state query key bypasses normalized identity`);
    }
    if (!/engineClient\.dashboardState\s*\(\s*request\.scope!\s*\)/.test(stripped)) {
      violations.push(`${rel}: dashboard-state wire call bypasses normalized identity`);
    }
    if (
      !/return\s+enabled\s*\?\s*query\s*:\s*\{\s*\.\.\.query,\s*data:\s*undefined\s*\}/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: disabled dashboard-state read can expose cached data`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps disabled graph-slice reads from exposing cached query data", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const scopeIdentityRel = "stores/server/scopeIdentity.ts";
    const scopeIdentity = stripComments(
      readFileSync(join(SRC_ROOT, scopeIdentityRel), "utf8"),
    );
    const graphSliceHook = stripped.match(
      /export function useGraphSlice[\s\S]*?export function useSalienceGraphSlice/,
    )?.[0];
    const salienceHook = stripped.match(
      /export function useSalienceGraphSlice[\s\S]*?export interface SemanticEmbeddingsView/,
    )?.[0];
    const violations: string[] = [];

    if (!graphSliceHook) {
      violations.push(`${rel}: missing useGraphSlice hook`);
    } else {
      if (
        !/export\s*\{[\s\S]*\bnormalizeScopeId\s+as\s+normalizeStoreScope\b[\s\S]*\}\s*from\s+["']\.\.\/\.\.\/platform\/scope\/scopeIdentity["']/.test(
          scopeIdentity,
        ) ||
        !/export\s*\{[\s\S]*\bSCOPE_ID_MAX_CHARS\b[\s\S]*\}\s*from\s+["']\.\.\/\.\.\/platform\/scope\/scopeIdentity["']/.test(
          scopeIdentity,
        ) ||
        !/\bfrom\s+["']\.\/scopeIdentity["'][\s\S]*\bnormalizeStoreScope\b/.test(
          stripped,
        ) ||
        !/\bexport\s+const\s+normalizeGraphSliceScope\s*=\s*normalizeStoreScope\b/.test(
          stripped,
        ) ||
        !/\bnormalizeGraphSliceRequestIdentity\s*\(\s*scope:\s*unknown,\s*filter:\s*unknown,\s*asOf:\s*unknown,\s*granularity:\s*unknown,\s*lens:\s*unknown,\s*focus:\s*unknown/.test(
          stripped,
        )
      ) {
        violations.push(`${rel}: graph-slice request identity trusts typed inputs`);
      }
      if (
        !/\bconst\s+request\s*=\s*normalizeGraphSliceRequestIdentity\s*\(\s*scope\s*,[\s\S]*filter\s*,[\s\S]*asOf\s*,[\s\S]*granularity\s*,[\s\S]*lens\s*,[\s\S]*focus\s*,?\s*\)/.test(
          graphSliceHook,
        )
      ) {
        violations.push(
          `${rel}: graph-slice hook bypasses request identity normalizer`,
        );
      }
      if (!/const\s+enabled\s*=\s*request\.scope\s*!==\s*null/.test(graphSliceHook)) {
        violations.push(`${rel}: graph-slice query lacks scope enabled gate`);
      }
      if (
        !/queryKey:\s*engineKeys\.graph\s*\(\s*request\.scope\s*\?\?\s*["']["'][\s\S]*request\.filter[\s\S]*request\.asOf[\s\S]*request\.granularity[\s\S]*request\.lens[\s\S]*request\.focus/.test(
          graphSliceHook,
        )
      ) {
        violations.push(`${rel}: graph-slice query key bypasses normalized identity`);
      }
      if (
        !/engineClient\.graphQuery\s*\(\s*\{[\s\S]*scope:\s*request\.scope![\s\S]*filter:\s*request\.filter[\s\S]*as_of:\s*request\.asOf[\s\S]*granularity:\s*request\.granularity[\s\S]*lens:\s*request\.lens[\s\S]*focus:\s*request\.focus/.test(
          graphSliceHook,
        )
      ) {
        violations.push(
          `${rel}: graph-slice request body bypasses normalized identity`,
        );
      }
      if (
        !/return\s+enabled\s*\?\s*query\s*:\s*\{\s*\.\.\.query,\s*data:\s*undefined\s*\}/.test(
          graphSliceHook,
        )
      ) {
        violations.push(`${rel}: disabled graph-slice read can expose cached data`);
      }
    }

    if (!salienceHook) {
      violations.push(`${rel}: missing salience graph-slice hook`);
    } else {
      for (const typedOnly of [
        "useSalienceGraphSlice(\n  scope: string | null",
        "useSalienceSliceView(\n  scope: string | null",
      ]) {
        if (stripped.includes(typedOnly)) {
          violations.push(`${rel}: salience graph selector trusts typed-only input`);
        }
      }
      for (const required of [
        "useSalienceGraphSlice(\n  scope: unknown",
        "useSalienceSliceView(\n  scope: unknown",
      ]) {
        if (!stripped.includes(required)) {
          violations.push(`${rel}: salience graph selector lacks runtime input seam`);
        }
      }
      if (
        !/\bconst\s+normalizedScope\s*=\s*normalizeGraphSliceScope\s*\(\s*scope\s*\)[\s\S]*useDashboardState\s*\(\s*normalizedScope\s*\)[\s\S]*useGraphSlice\s*\(\s*[\s\S]*state\s*\?\s*normalizedScope\s*:\s*null/.test(
          salienceHook,
        )
      ) {
        violations.push(`${rel}: salience graph selector bypasses normalized scope`);
      }
      if (/\bscope\s*!==\s*null\b/.test(salienceHook)) {
        violations.push(`${rel}: salience graph selector gates raw scope`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps disabled vault-tree reads from exposing cached query data", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const vaultTreeHook = stripped.match(
      /export function useVaultTree[\s\S]*?export type VaultTreeAvailability/,
    )?.[0];
    const violations: string[] = [];

    if (!vaultTreeHook) {
      violations.push(`${rel}: missing useVaultTree hook`);
    } else {
      for (const typedOnly of [
        "useVaultTree(scope: string | null",
        "useVaultTreeAvailability(scope: string | null",
        "useVaultTreeSurface(scope: string | null",
        "useFiltersVocabulary(scope: string | null",
        "useFiltersVocabularyView(scope: string | null",
      ]) {
        if (stripped.includes(typedOnly)) {
          violations.push(
            `${rel}: query hook still trusts typed-only scope ${typedOnly}`,
          );
        }
      }
      for (const required of [
        "useVaultTree(scope: unknown",
        "useVaultTreeAvailability(scope: unknown",
        "useVaultTreeSurface(scope: unknown",
        "useFiltersVocabulary(scope: unknown",
        "useFiltersVocabularyView(scope: unknown",
      ]) {
        if (!stripped.includes(required)) {
          violations.push(`${rel}: query hook lacks runtime scope seam ${required}`);
        }
      }
      if (
        !/\bexport\s+function\s+normalizeVaultTreeRequestIdentity\b[\s\S]*\bnormalizeGraphSliceScope\s*\(\s*scope\s*\)/.test(
          stripped,
        )
      ) {
        violations.push(`${rel}: vault-tree request identity trusts typed inputs`);
      }
      if (
        !/const\s+request\s*=\s*normalizeVaultTreeRequestIdentity\s*\(\s*scope\s*\)/.test(
          vaultTreeHook,
        )
      ) {
        violations.push(`${rel}: vault-tree hook bypasses request identity normalizer`);
      }
      if (!/const\s+enabled\s*=\s*request\.scope\s*!==\s*null/.test(vaultTreeHook)) {
        violations.push(`${rel}: vault-tree query lacks normalized scope enabled gate`);
      }
      if (
        !/queryKey:\s*engineKeys\.vaultTree\s*\(\s*request\.scope\s*\?\?\s*["']["']\s*\)/.test(
          vaultTreeHook,
        )
      ) {
        violations.push(`${rel}: vault-tree query key bypasses normalized identity`);
      }
      if (!/engineClient\.vaultTree\s*\(\s*request\.scope!\s*\)/.test(vaultTreeHook)) {
        violations.push(`${rel}: vault-tree wire call bypasses normalized identity`);
      }
      if (
        !/withManualRetry\s*\(\s*enabled\s*\?\s*query\s*:\s*\{\s*\.\.\.query,\s*data:\s*undefined\s*\}\s*\)/.test(
          vaultTreeHook,
        )
      ) {
        violations.push(`${rel}: disabled vault-tree read can expose cached data`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps disabled timeline-lineage reads from exposing cached query data", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const lineageHook = stripped.match(
      /export function useTimelineLineage[\s\S]*?export interface TimelineLineageView/,
    )?.[0];
    const violations: string[] = [];

    if (!lineageHook) {
      violations.push(`${rel}: missing useTimelineLineage hook`);
    } else {
      if (
        !/\bexport\s+function\s+normalizeTimelineLineageRequestIdentity\b[\s\S]*\bnormalizeGraphSliceScope\s*\(\s*scope\s*\)[\s\S]*\bnormalizeTemporalRange\s*\(\s*range\s*\)[\s\S]*\bnormalizeTemporalText\s*\(\s*filter\s*\)[\s\S]*\bnormalizeGraphSliceAsOf\s*\(\s*asOf\s*\)/.test(
          stripped,
        )
      ) {
        violations.push(
          `${rel}: timeline-lineage request identity trusts typed inputs`,
        );
      }
      if (
        !/const\s+request\s*=\s*normalizeTimelineLineageRequestIdentity\s*\(\s*scope\s*,[\s\S]*range\s*,[\s\S]*filter\s*,[\s\S]*asOf\s*,?\s*\)/.test(
          lineageHook,
        )
      ) {
        violations.push(
          `${rel}: timeline-lineage hook bypasses request identity normalizer`,
        );
      }
      if (!/const\s+enabled\s*=\s*request\.scope\s*!==\s*null/.test(lineageHook)) {
        violations.push(`${rel}: timeline-lineage query lacks scope enabled gate`);
      }
      if (
        !/queryKey:\s*engineKeys\.lineage\s*\(\s*request\.scope\s*\?\?\s*["']["'][\s\S]*request\.range[\s\S]*request\.filter[\s\S]*request\.asOf/.test(
          lineageHook,
        )
      ) {
        violations.push(
          `${rel}: timeline-lineage query key bypasses normalized identity`,
        );
      }
      if (
        !/engineClient\.lineage\s*\(\s*\{[\s\S]*scope:\s*request\.scope![\s\S]*\.\.\.request\.range[\s\S]*filter:\s*request\.filter[\s\S]*t:\s*request\.asOf\s*==\s*null\s*\?\s*undefined\s*:\s*String\s*\(\s*request\.asOf\s*\)/.test(
          lineageHook,
        )
      ) {
        violations.push(
          `${rel}: timeline-lineage wire body bypasses normalized identity`,
        );
      }
      if (
        !/withManualRetry\s*\(\s*enabled\s*\?\s*query\s*:\s*\{\s*\.\.\.query,\s*data:\s*undefined\s*\}\s*\)/.test(
          lineageHook,
        )
      ) {
        violations.push(
          `${rel}: disabled timeline-lineage read can expose cached data`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps disabled file-tree reads from exposing cached query data", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const fileTreeHook = stripped.match(
      /export function useFileTree[\s\S]*?export type FileTreeAvailability/,
    )?.[0];
    const violations: string[] = [];

    if (!fileTreeHook) {
      violations.push(`${rel}: missing useFileTree hook`);
    } else {
      for (const typedOnly of [
        "useFileTree(scope: string | null",
        "useFileTreeLevel(\n  scope: string | null",
        "useFileTreeAvailability(scope: string | null",
        "useFileTreeRootSurface(scope: string | null",
      ]) {
        if (stripped.includes(typedOnly)) {
          violations.push(`${rel}: file-tree hook still trusts typed-only input`);
        }
      }
      for (const required of [
        "useFileTree(scope: unknown",
        "useFileTreeLevel(\n  scope: unknown",
        "useFileTreeAvailability(scope: unknown",
        "useFileTreeRootSurface(scope: unknown",
      ]) {
        if (!stripped.includes(required)) {
          violations.push(`${rel}: file-tree hook lacks runtime input seam`);
        }
      }
      if (
        !/\bexport\s+function\s+normalizeFileTreeRequestIdentity\b[\s\S]*\bnormalizeGraphSliceScope\s*\(\s*scope\s*\)[\s\S]*\benabled\s*===\s*true/.test(
          stripped,
        )
      ) {
        violations.push(`${rel}: file-tree request identity trusts typed inputs`);
      }
      if (
        !/\btypeof\s+path\s*===\s*["']string["'][\s\S]*path\.trim\s*\(\s*\)\s*\|\|\s*undefined/.test(
          stripped,
        )
      ) {
        violations.push(`${rel}: file-tree request identity preserves raw path`);
      }
      if (
        !/const\s+request\s*=\s*normalizeFileTreeRequestIdentity\s*\(\s*scope\s*,\s*path\s*,\s*enabled\s*\)/.test(
          fileTreeHook,
        )
      ) {
        violations.push(`${rel}: file-tree hook bypasses request identity normalizer`);
      }
      if (
        !/const\s+active\s*=\s*request\.scope\s*!==\s*null\s*&&\s*request\.enabled/.test(
          fileTreeHook,
        )
      ) {
        violations.push(`${rel}: file-tree query lacks scope/enabled gate`);
      }
      if (
        !/queryKey:\s*engineKeys\.fileTree\s*\(\s*request\.scope\s*\?\?\s*["']["']\s*,\s*request\.path\s*\)/.test(
          fileTreeHook,
        )
      ) {
        violations.push(`${rel}: file-tree query key bypasses normalized identity`);
      }
      if (
        !/engineClient\.fileTree\s*\(\s*\{\s*scope:\s*request\.scope![\s\S]*path:\s*request\.path\s*\}\s*\)/.test(
          fileTreeHook,
        )
      ) {
        violations.push(`${rel}: file-tree wire body bypasses normalized identity`);
      }
      if (
        !/withManualRetry\s*\(\s*active\s*\?\s*query\s*:\s*\{\s*\.\.\.query,\s*data:\s*undefined\s*\}\s*\)/.test(
          fileTreeHook,
        )
      ) {
        violations.push(`${rel}: disabled file-tree read can expose cached data`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps file-tree entry normalization at the live adapter boundary", () => {
    const rel = "stores/server/liveAdapters.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const seam of [
      "normalizeFileTreeString",
      "normalizeFileTreeCount",
      "adaptFileTreeEntry",
      "adaptFileTreeTruncated",
      "adaptFileTree",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${seam} file-tree adapter seam`);
      }
    }
    if (
      !/\bfunction\s+adaptFileTreeEntry[\s\S]*\bconst\s+path\s*=\s*normalizeFileTreeString\s*\(\s*value\.path\s*\)[\s\S]*\bif\s*\(\s*path\s*===\s*undefined\s*\)\s*return\s+null[\s\S]*\bconst\s+nodeId\s*=\s*normalizeNodeId\s*\(\s*value\.node_id\s*\)\s*\?\?\s*codeNodeIdFromPath\s*\(\s*path\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: file-tree entry adapter fabricates malformed rows`);
    }
    if (
      !/\bhas_children:\s*kind\s*===\s*["']dir["']\s*&&\s*value\.has_children\s*===\s*true/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: file-tree has_children bypasses kind gate`);
    }
    if (
      !/\bfunction\s+adaptFileTreeTruncated[\s\S]*normalizeFileTreeCount\s*\(\s*value\.total_children\s*\)[\s\S]*normalizeFileTreeCount\s*\(\s*value\.returned_children\s*\)[\s\S]*normalizeFileTreeString\s*\(\s*value\.reason\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: file-tree truncated block bypasses normalizers`);
    }
    if (
      !/entries:\s*Array\.isArray\s*\(\s*body\.entries\s*\)[\s\S]*\.map\s*\(\s*adaptFileTreeEntry\s*\)[\s\S]*\.filter\s*\(\s*\(\s*entry\s*\):\s*entry\s+is\s+FileTreeEntry\s*=>\s*entry\s*!==\s*null\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: file-tree adapter does not drop malformed entries`);
    }
    if (
      !/\bnext_cursor:\s*normalizeFileTreeString\s*\(\s*body\.next_cursor\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: file-tree cursor bypasses normalizer`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps disabled pipeline and plan-interior reads from exposing cached query data", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const pipelineHook = stripped.match(
      /export function usePipelineStatus[\s\S]*?export function usePlanInterior/,
    )?.[0];
    const planInteriorHook = stripped.match(
      /export function usePlanInterior[\s\S]*?export interface PipelineStatusView/,
    )?.[0];
    const violations: string[] = [];

    if (!pipelineHook) {
      violations.push(`${rel}: missing usePipelineStatus hook`);
    } else {
      if (
        !/\bexport\s+function\s+normalizePipelineStatusRequestIdentity\b[\s\S]*\bnormalizeGraphSliceScope\s*\(\s*scope\s*\)[\s\S]*\bnormalizeGraphSliceAsOf\s*\(\s*asOf\s*\)/.test(
          stripped,
        )
      ) {
        violations.push(`${rel}: pipeline request identity trusts typed inputs`);
      }
      if (
        !/const\s+request\s*=\s*normalizePipelineStatusRequestIdentity\s*\(\s*scope\s*,\s*asOf\s*\)/.test(
          pipelineHook,
        )
      ) {
        violations.push(`${rel}: pipeline hook bypasses request identity normalizer`);
      }
      if (!/const\s+enabled\s*=\s*request\.scope\s*!==\s*null/.test(pipelineHook)) {
        violations.push(`${rel}: pipeline query lacks scope enabled gate`);
      }
      if (
        !/queryKey:\s*engineKeys\.pipeline\s*\(\s*request\.scope\s*\?\?\s*["']["']\s*,\s*request\.asOf\s*\)/.test(
          pipelineHook,
        )
      ) {
        violations.push(`${rel}: pipeline query key bypasses normalized identity`);
      }
      if (
        !/queryFn:\s*\(\)\s*=>\s*engineClient\.pipeline\s*\(\s*request\.scope!\s*\)/.test(
          pipelineHook,
        )
      ) {
        violations.push(`${rel}: pipeline wire call bypasses normalized scope`);
      }
      if (
        !/return\s+enabled\s*\?\s*query\s*:\s*\{\s*\.\.\.query,\s*data:\s*undefined\s*\}/.test(
          pipelineHook,
        )
      ) {
        violations.push(`${rel}: disabled pipeline read can expose cached data`);
      }
    }

    if (!planInteriorHook) {
      violations.push(`${rel}: missing usePlanInterior hook`);
    } else {
      if (
        !/\bexport\s+function\s+normalizePlanInteriorRequestIdentity\b[\s\S]*\bnormalizeNodeId\s*\(\s*planId\s*\)[\s\S]*\bnormalizeNodeScopedScope\s*\(\s*scope\s*\)[\s\S]*\bisAddressableNode\s*\(\s*nodeId\s*\)/.test(
          stripped,
        )
      ) {
        violations.push(`${rel}: plan-interior request identity trusts typed inputs`);
      }
      if (
        !/const\s+request\s*=\s*normalizePlanInteriorRequestIdentity\s*\(\s*planId\s*,\s*scope\s*\)/.test(
          planInteriorHook,
        )
      ) {
        violations.push(
          `${rel}: plan-interior hook bypasses request identity normalizer`,
        );
      }
      if (
        !/const\s+enabled\s*=\s*request\.scope\s*!==\s*null\s*&&\s*request\.planId\s*!==\s*null/.test(
          planInteriorHook,
        )
      ) {
        violations.push(`${rel}: plan-interior query lacks scope/plan gate`);
      }
      if (
        !/queryKey:\s*engineKeys\.planInterior\s*\(\s*request\.scope\s*\?\?\s*["']["']\s*,\s*request\.planId\s*\?\?\s*["']["']\s*\)/.test(
          planInteriorHook,
        )
      ) {
        violations.push(`${rel}: plan-interior query key bypasses normalized identity`);
      }
      if (
        !/queryFn:\s*\(\)\s*=>\s*engineClient\.planInterior\s*\(\s*request\.planId!\s*,\s*request\.scope!\s*\)/.test(
          planInteriorHook,
        )
      ) {
        violations.push(`${rel}: plan-interior wire call bypasses normalized identity`);
      }
      if (
        !/return\s+enabled\s*\?\s*query\s*:\s*\{\s*\.\.\.query,\s*data:\s*undefined\s*\}/.test(
          planInteriorHook,
        )
      ) {
        violations.push(`${rel}: disabled plan-interior read can expose cached data`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps disabled history, forge, events, diff, and search reads from exposing cached query data", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const hooks = [
      {
        name: "useNodeHistory",
        pattern: /export function useNodeHistory[\s\S]*?export interface HistoryView/,
        enabled: /const\s+enabled\s*=\s*request\.scope\s*!==\s*null/,
        identity:
          /const\s+request\s*=\s*normalizeHistoryRequestIdentity\s*\(\s*scope\s*,\s*limit\s*\)/,
      },
      {
        name: "useNodePrs",
        pattern: /function useNodePrs[\s\S]*?function useNodeIssues/,
        enabled: /const\s+enabled\s*=\s*request\.scope\s*!==\s*null/,
        identity:
          /const\s+request\s*=\s*normalizePullRequestsRequestIdentity\s*\(\s*scope\s*,\s*state\s*\)/,
      },
      {
        name: "useNodeIssues",
        pattern: /function useNodeIssues[\s\S]*?export function usePRsView/,
        enabled: /const\s+enabled\s*=\s*request\.scope\s*!==\s*null/,
        identity:
          /const\s+request\s*=\s*normalizeIssuesRequestIdentity\s*\(\s*scope\s*,\s*state\s*\)/,
      },
      {
        name: "useEngineEvents",
        pattern:
          /export function useEngineEvents[\s\S]*?export function useTimelineLineage/,
        enabled: /const\s+enabled\s*=\s*request\.scope\s*!==\s*null/,
        identity:
          /const\s+request\s*=\s*normalizeEngineEventsRequestIdentity\s*\(\s*scope\s*,\s*range\s*,\s*bucket\s*\)/,
      },
      {
        name: "useGraphDiff",
        pattern: /export function useGraphDiff[\s\S]*?export function useEngineSearch/,
        enabled:
          /const\s+enabled\s*=[\s\S]*request\.scope\s*!==\s*null[\s\S]*request\.from\s*!==\s*null[\s\S]*request\.to\s*!==\s*null[\s\S]*String\s*\(\s*request\.from\s*\)\s*!==\s*String\s*\(\s*request\.to\s*\)/,
        identity:
          /const\s+request\s*=\s*normalizeGraphDiffRequestIdentity\s*\(\s*scope\s*,\s*from\s*,\s*to\s*,\s*filter\s*\)/,
      },
      {
        name: "useEngineSearch",
        pattern: /export function useEngineSearch[\s\S]*?const SEARCH_QUERY_TIMEOUT_MS/,
        enabled:
          /const\s+enabled\s*=\s*request\.scope\s*!==\s*null\s*&&\s*request\.query\.length\s*>\s*0/,
        identity:
          /const\s+request\s*=\s*normalizeSearchRequestIdentity\s*\(\s*query\s*,\s*target\s*,\s*scope\s*\)/,
        resultName: "result",
      },
    ];
    const violations: string[] = [];

    for (const hook of hooks) {
      const body = stripped.match(hook.pattern)?.[0];
      if (!body) {
        violations.push(`${rel}: missing ${hook.name} hook`);
        continue;
      }
      if (!hook.enabled.test(body)) {
        violations.push(`${rel}: ${hook.name} lacks its disabled-state gate`);
      }
      if (hook.identity && !hook.identity.test(body)) {
        violations.push(`${rel}: ${hook.name} bypasses normalized request identity`);
      }
      const queryName = hook.resultName ?? "query";
      const mask = new RegExp(
        `return\\s+enabled\\s*\\?\\s*${queryName}\\s*:\\s*\\{\\s*\\.\\.\\.${queryName},\\s*data:\\s*undefined\\s*\\}`,
      );
      if (!mask.test(body)) {
        violations.push(`${rel}: ${hook.name} can expose cached data while disabled`);
      }
    }

    for (const typedOnly of [
      "useContentView(\n  nodeId: string | null",
      "useReadTime(\n  nodeId: string | null",
    ]) {
      if (stripped.includes(typedOnly)) {
        violations.push(`${rel}: typed-only content projection ${typedOnly}`);
      }
    }
    const contentView = stripped.match(
      /export function useContentView[\s\S]*?export type ViewerStateTone/,
    )?.[0];
    if (!contentView) {
      violations.push(`${rel}: missing useContentView hook`);
    } else {
      if (
        !/const\s+request\s*=\s*normalizeNodeScopedRequestIdentity\s*\(\s*scope\s*,\s*nodeId\s*\)/.test(
          contentView,
        )
      ) {
        violations.push(`${rel}: content view bypasses normalized request identity`);
      }
      if (
        !/const\s+enabled\s*=\s*request\.scope\s*!==\s*null\s*&&\s*isAddressableNode\s*\(\s*request\.nodeId\s*\)/.test(
          contentView,
        )
      ) {
        violations.push(`${rel}: content view derives loading from raw identity`);
      }
      if (
        /nodeId\s*!==\s*null\s*&&\s*scope\s*!==\s*null\s*&&\s*query\.isPending/.test(
          contentView,
        )
      ) {
        violations.push(`${rel}: content view keeps raw loading gate`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps production app chrome off direct TanStack subscriptions", () => {
    const violations: string[] = [];

    for (const surface of PRODUCTION_SURFACES) {
      for (const file of sourceFiles(join(SRC_ROOT, surface))) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        for (const statement of importStatements(stripped)) {
          if (/["']@tanstack\/react-query["']/.test(statement)) {
            violations.push(`${rel}: direct TanStack query import`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps raw engine status reads behind stores status selectors", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\buseEngineStatus\s*\(/.test(stripped)) {
        violations.push(`${rel}: raw engine status query read`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps the app-level backend signal subscription behind the view seam", () => {
    const rel = "app/AppShell.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseBackendSignalStream\b/.test(statement)) {
        violations.push(`${rel}: raw backend signal stream import`);
      }
    }
    if (/\buseBackendSignalStream\s*\(/.test(stripped)) {
      violations.push(`${rel}: raw backend signal stream subscription`);
    }
    if (!/\buseBackendSignalSubscription\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing backend signal subscription seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps backend-signal recovery identity normalized in the stores seam", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (
      !/\bexport\s+function\s+normalizeBackendSignalChannel\s*\([\s\S]*channel:\s*unknown/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing backend-signal channel normalizer`);
    }
    if (
      !/\bnormalizeBackendSignalChannel[\s\S]*\bconst\s+normalized\s*=\s*normalizeEngineStreamChannel\s*\(\s*channel\s*\)[\s\S]*normalized\s*===\s*["']backends["']\s*\|\|\s*normalized\s*===\s*["']git["']/.test(
        stripped,
      )
    ) {
      violations.push(
        `${rel}: backend-signal channel normalizer bypasses stream channel domain`,
      );
    }
    if (
      !/\blatestBackendSignalSignature[\s\S]*\bconst\s+channel\s*=\s*normalizeBackendSignalChannel\s*\(\s*chunk\.channel\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: backend-signal signature reads raw channel names`);
    }
    if (
      /\blatestBackendSignalSignature[\s\S]*chunk\.channel\s*===\s*["'](?:backends|git)["']/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: backend-signal signature compares raw channels`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps canvas state overlay as a pure degradation projection", () => {
    const rel = "app/stage/CanvasStateOverlay.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (
        /\b(?:useGraphSlice|useGraphSliceAvailability|useEngineStatus|useStatusRollup)\b/.test(
          statement,
        )
      ) {
        violations.push(`${rel}: canvas overlay imports data/status selector`);
      }
      if (/\b(?:tiersFromQuery|readTierAvailability)\b/.test(statement)) {
        violations.push(`${rel}: canvas overlay imports raw tier interpreter`);
      }
      if (/\b(?:useQuery|useQueryClient)\b/.test(statement)) {
        violations.push(`${rel}: canvas overlay owns query state`);
      }
      if (/\b(?:engineClient|engineKeys)\b/.test(statement)) {
        violations.push(`${rel}: canvas overlay imports wire client/key`);
      }
    }
    if (
      /\b(?:useGraphSlice|useGraphSliceAvailability|useEngineStatus|useStatusRollup|useQuery|useQueryClient)\s*\(/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: canvas overlay owns data/status subscription`);
    }
    if (/\b(?:tiersFromQuery|readTierAvailability)\s*\(/.test(stripped)) {
      violations.push(`${rel}: canvas overlay reads raw tier truth`);
    }
    if (!/\bavailability\s*:\s*GraphSliceAvailability\b/.test(stripped)) {
      violations.push(`${rel}: missing pre-derived availability input contract`);
    }
    if (!/\bexport\s+function\s+resolveCanvasState\b/.test(stripped)) {
      violations.push(`${rel}: missing pure canvas-state resolver`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps OpsPanel rag-control reads behind the rag control view", () => {
    const rel = "app/right/OpsPanel.tsx";
    if (!existsSync(join(SRC_ROOT, rel))) {
      const rightRail = sourceFiles(join(SRC_ROOT, "app/right"))
        .map((file) => stripComments(readFileSync(file, "utf8")))
        .join("\n");
      expect(rightRail).not.toMatch(/\buseOpsPanelRagControl\b|\buseRagControlView\b/);
      return;
    }
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const ragControl = stripComments(
      readFileSync(join(SRC_ROOT, "stores/server/ragControl.ts"), "utf8"),
    );
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseRag(?:ServiceState|Readiness|Watcher|Projects)\b/.test(statement)) {
        violations.push(`${rel}: raw brokered rag-control read hook`);
      }
      if (
        /\buseRag(?:ControlView|ReindexWithProgress|WatcherReconfigure|ProjectEvict)\b/.test(
          statement,
        )
      ) {
        violations.push(`${rel}: app-layer rag-control hook assembly`);
      }
      if (/\bragSemanticOffline\b/.test(statement)) {
        violations.push(`${rel}: local rag semantic-offline interpretation`);
      }
    }
    if (/\b(?:serviceState|readiness|watcher|projects)\.data\b/.test(stripped)) {
      violations.push(`${rel}: app-layer brokered rag payload projection`);
    }
    if (/\benvelope\b/.test(stripped)) {
      violations.push(`${rel}: app-layer rag envelope read`);
    }
    if (
      /\breindex\.progress\.(?:terminal|failed|step|phase|fraction)\b/.test(stripped)
    ) {
      violations.push(`${rel}: app-layer rag progress presentation derivation`);
    }
    if (/Math\.round\s*\(\s*reindex\.progress\.fraction/.test(stripped)) {
      violations.push(`${rel}: app-layer rag progress percent formatting`);
    }
    if (
      !/\bderiveRagReindexProgressView\s*\(\s*reindex\.progress\s*\)/.test(stripped)
    ) {
      violations.push(`${rel}: missing rag progress presentation view`);
    }
    if (!/\bderiveRagControlPresentationView\s*\(\s*ragControl\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing rag control presentation view`);
    }
    if (/\bragControl\.index\b|\bragControl\.ready\b/.test(stripped)) {
      violations.push(`${rel}: local rag health presentation projection`);
    }
    if (/\bragControl\.projects\b/.test(stripped)) {
      violations.push(`${rel}: local rag project presentation projection`);
    }
    if (/\{\s*ragControl\.watch\s*&&/.test(stripped)) {
      violations.push(`${rel}: local rag watcher visibility projection`);
    }
    if (/\bpresentation\.projectRows\.length\s*>\s*0\b/.test(stripped)) {
      violations.push(`${rel}: local rag project visibility projection`);
    }
    for (const localCopy of [
      "semantic engine offline",
      "semantic index",
      "reindex vault",
      "resident projects",
      "vault docs",
      "models",
    ]) {
      if (stripped.includes(localCopy)) {
        violations.push(`${rel}: local rag-control presentation copy "${localCopy}"`);
      }
    }
    if (/aria-label=\{`evict\s+\$\{/.test(stripped)) {
      violations.push(`${rel}: local rag project evict aria label`);
    }
    for (const localChrome of [
      "flex items-center justify-between gap-fg-1 text-caption",
      "truncate text-ink-muted",
      "shrink-0 rounded-fg-xs p-fg-0-5 text-ink-faint hover:text-state-broken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed",
    ]) {
      if (stripped.includes(localChrome)) {
        violations.push(`${rel}: local rag project row chrome "${localChrome}"`);
      }
    }
    for (const field of [
      "ragControl.hasWatcherConfig",
      "presentation.hasProjectRows",
      "presentation.projectsContainerClassName",
      "presentation.projectsListClassName",
      "row.rowClassName",
      "row.rootClassName",
      "row.evictButtonClassName",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing ${field} projection`);
      }
    }
    if (!/\buseRagControlView\s*\(\s*scope\s*\)/.test(stripped)) {
      if (!/\buseOpsPanelRagControl\s*\(\s*\)/.test(stripped)) {
        violations.push(`${rel}: missing rag control view seam`);
      }
    }
    if (!/\buseOpsPanelRagControl\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing ops-panel rag-control seam`);
    }
    if (/\[\s*jobId\s*,\s*setJobId\s*\]\s*=\s*useState/.test(ragControl)) {
      violations.push("stores/server/ragControl.ts: hook-local rag reindex job id");
    }
    if (!/\buseRagReindexJobIdentity\s*\(\s*scope\s*\)/.test(ragControl)) {
      violations.push("stores/server/ragControl.ts: missing reindex job identity seam");
    }
    if (
      !/\bexport function ragSemanticOffline\b[\s\S]*?\breadTierAvailability\s*\(\s*data\.tiers\s*,\s*\[\s*["']semantic["']\s*\]\s*\)\.degraded/.test(
        ragControl,
      )
    ) {
      violations.push(
        "stores/server/ragControl.ts: missing shared brokered semantic-offline seam",
      );
    }
    if (!/\breturn\s+reads\.some\s*\(\s*ragSemanticOffline\s*\)/.test(ragControl)) {
      violations.push(
        "stores/server/ragControl.ts: control offline aggregation bypasses semantic-offline seam",
      );
    }
    if (
      !/\bconst\s+semanticOffline\s*=\s*ragSemanticOffline\s*\(\s*data\s*\)/.test(
        ragControl,
      )
    ) {
      violations.push(
        "stores/server/ragControl.ts: job progress bypasses semantic-offline seam",
      );
    }
    if (!/\bRAG_JOBS_LIMIT_CAP\b/.test(ragControl)) {
      violations.push("stores/server/ragControl.ts: missing rag jobs limit cap");
    }
    for (const seam of [
      "normalizeRagControlScope",
      "normalizeRagControlKeyPart",
      "normalizeRagProjectRoot",
      "normalizeRagJobText",
      "normalizeRagJobNumber",
      "normalizeRagJobId",
      "normalizeRagJobPhase",
      "normalizeRagRequestSeq",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(ragControl)) {
        violations.push(`stores/server/ragControl.ts: missing ${seam} seam`);
      }
    }
    for (const typedOnlyJobIdentity of [
      "beginRequest: (scope: string)",
      "acceptReceipt: (requestScope: string, requestSeq: number, jobId: string)",
      "setScope: (scope: string | null)",
    ]) {
      if (ragControl.includes(typedOnlyJobIdentity)) {
        violations.push(
          `stores/server/ragControl.ts: typed-only job identity seam ${typedOnlyJobIdentity}`,
        );
      }
    }
    for (const requiredJobIdentity of [
      "beginRequest: (scope: unknown)",
      "acceptReceipt: (requestScope: unknown, requestSeq: unknown, jobId: unknown)",
      "setScope: (scope: unknown)",
    ]) {
      if (!ragControl.includes(requiredJobIdentity)) {
        violations.push(
          `stores/server/ragControl.ts: missing runtime job identity seam ${requiredJobIdentity}`,
        );
      }
    }
    if (
      !/\bimport\s*\{[\s\S]*\bnormalizeGraphSliceScope\b[\s\S]*\}\s*from\s+["']\.\/queries["']/.test(
        ragControl,
      ) ||
      !/\bexport\s+const\s+normalizeRagControlScope\s*=\s*normalizeGraphSliceScope\b/.test(
        ragControl,
      )
    ) {
      violations.push(
        "stores/server/ragControl.ts: rag control scope duplicates graph-slice scope policy",
      );
    }
    if (
      !/\bexport function normalizeRagControlKeyPart\s*\(\s*[\s\S]*value:\s*unknown[\s\S]*fallback\s*=\s*["']["'][\s\S]*typeof\s+value\s*!==\s*["']string["'][\s\S]*value\.trim\s*\(\s*\)/.test(
        ragControl,
      )
    ) {
      violations.push(
        "stores/server/ragControl.ts: rag control keys bypass runtime normalizer",
      );
    }
    if (
      !/\bexport function normalizeRagRequestSeq\s*\(\s*value:\s*unknown\s*\):\s*number\s*\|\s*null[\s\S]*Number\.isSafeInteger\s*\(\s*value\s*\)/.test(
        ragControl,
      )
    ) {
      violations.push(
        "stores/server/ragControl.ts: rag reindex request sequence bypasses runtime normalizer",
      );
    }
    if (
      !/\bshouldAcceptRagJobReceipt[\s\S]*\bconst\s+normalizedCurrentScope\s*=\s*normalizeRagControlScope\s*\(\s*currentScope\s*\)[\s\S]*\bconst\s+normalizedRequestScope\s*=\s*normalizeRagControlScope\s*\(\s*requestScope\s*\)[\s\S]*\bconst\s+normalizedCurrentSeq\s*=\s*normalizeRagRequestSeq\s*\(\s*currentSeq\s*\)[\s\S]*\bconst\s+normalizedRequestSeq\s*=\s*normalizeRagRequestSeq\s*\(\s*requestSeq\s*\)/.test(
        ragControl,
      )
    ) {
      violations.push(
        "stores/server/ragControl.ts: rag receipt acceptance bypasses normalized scope/seq",
      );
    }
    if (
      !/\bacceptReceipt:\s*\(requestScope,\s*requestSeq,\s*jobId\)\s*=>\s*\{[\s\S]*\bconst\s+normalizedJobId\s*=\s*normalizeRagJobId\s*\(\s*jobId\s*\)[\s\S]*normalizedJobId\s*===\s*null[\s\S]*jobId:\s*normalizedJobId/.test(
        ragControl,
      )
    ) {
      violations.push("stores/server/ragControl.ts: rag job receipt stores raw job id");
    }
    if (
      !/\bexport function normalizeRagProjectRoot\s*\(\s*root:\s*unknown\s*\):\s*string\s*\|\s*null[\s\S]*normalizeRagControlScope\s*\(\s*root\s*\)/.test(
        ragControl,
      )
    ) {
      violations.push(
        "stores/server/ragControl.ts: rag project root bypasses normalizer",
      );
    }
    if (
      !/\bexport function normalizeRagProjectSlot\s*\(\s*slot:\s*unknown\s*\):\s*RagProjectSlot\s*\|\s*null[\s\S]*normalizeRagProjectRoot\s*\(\s*candidate\.root\s*\)/.test(
        ragControl,
      )
    ) {
      violations.push(
        "stores/server/ragControl.ts: rag project slot bypasses root normalizer",
      );
    }
    if (
      !/\bexport function normalizeRagProjectSlots\s*\(\s*slots:\s*unknown\s*\):\s*RagProjectSlot\[\][\s\S]*Array\.isArray\s*\(\s*slots\s*\)[\s\S]*normalizeRagProjectSlot\s*\(\s*slot\s*\)/.test(
        ragControl,
      )
    ) {
      violations.push(
        "stores/server/ragControl.ts: rag project slots bypass runtime list normalizer",
      );
    }
    if (
      !/\bconst\s+projectSlots\s*=\s*normalizeRagProjectSlots\s*\(\s*projects\?\.envelope\?\.projects\s*\)/.test(
        ragControl,
      )
    ) {
      violations.push(
        "stores/server/ragControl.ts: rag control view exposes raw resident projects",
      );
    }
    for (const keyHelper of [
      "serviceState",
      "jobs",
      "watcher",
      "projects",
      "readiness",
    ]) {
      if (
        !new RegExp(
          `${keyHelper}:\\s*\\([\\s\\S]*?\\)\\s*=>[\\s\\S]*?normalizeRagControlKeyPart`,
        ).test(ragControl)
      ) {
        violations.push(
          `stores/server/ragControl.ts: ${keyHelper} key bypasses key-part normalizer`,
        );
      }
    }
    if (
      !/\bfunction\s+normalizeRagJobNumber\s*\(\s*value:\s*unknown\s*\):\s*number\s*\|\s*undefined[\s\S]*Number\.isFinite\s*\(\s*value\s*\)/.test(
        ragControl,
      )
    ) {
      violations.push(
        "stores/server/ragControl.ts: rag job numbers bypass finite guard",
      );
    }
    if (
      !/\bexport function isJobTerminal\b[\s\S]*\bconst\s+normalized\s*=\s*normalizeRagJobPhase\s*\(\s*phase\s*\)[\s\S]*LIVE_PHASES\.has\s*\(\s*normalized\.toLowerCase\s*\(\s*\)\s*\)/.test(
        ragControl,
      )
    ) {
      violations.push(
        "stores/server/ragControl.ts: job terminal state bypasses phase normalizer",
      );
    }
    if (
      !/\bexport function requestedJob\b[\s\S]*\bconst\s+requestedId\s*=\s*normalizeRagJobId\s*\(\s*jobId\s*\)[\s\S]*normalizeRagJobId\s*\(\s*job\.id\s*\)\s*===\s*requestedId/.test(
        ragControl,
      )
    ) {
      violations.push(
        "stores/server/ragControl.ts: requested job lookup bypasses id normalizer",
      );
    }
    if (
      !/\bexport function interpretJobProgress\b[\s\S]*\bconst\s+requestedId\s*=\s*normalizeRagJobId\s*\(\s*jobId\s*\)[\s\S]*\bconst\s+phase\s*=\s*normalizeRagJobPhase\s*\(\s*job\?\.phase\s*\)[\s\S]*\bconst\s+total\s*=\s*normalizeRagJobNumber\s*\(\s*job\?\.progress\?\.total\s*\)[\s\S]*\bstep:\s*normalizeRagJobText\s*\(\s*job\?\.progress\?\.step\s*\)[\s\S]*polling:\s*requestedId\s*!==\s*null/.test(
        ragControl,
      )
    ) {
      violations.push(
        "stores/server/ragControl.ts: job progress view bypasses job normalizers",
      );
    }
    if (!/\bboundedRagJobsLimit\s*\(/.test(ragControl)) {
      violations.push("stores/server/ragControl.ts: missing bounded rag jobs helper");
    }
    if (
      !/\bexport function boundedRagJobsLimit\s*\(\s*limit:\s*unknown\s*\)[\s\S]*const\s+parsed\s*=[\s\S]*Number\.isFinite\s*\(\s*parsed\s*\)/.test(
        ragControl,
      )
    ) {
      violations.push(
        "stores/server/ragControl.ts: rag jobs limit bypasses finite guard",
      );
    }
    if (
      !/\bexport function normalizeRagJobsRequestIdentity\s*\([\s\S]*scope:\s*unknown[\s\S]*limit:\s*unknown\s*=\s*10[\s\S]*scope:\s*normalizeRagControlScope\s*\(\s*scope\s*\)[\s\S]*limit:\s*boundedRagJobsLimit\s*\(\s*limit\s*\)/.test(
        ragControl,
      )
    ) {
      violations.push(
        "stores/server/ragControl.ts: missing normalized rag jobs request identity",
      );
    }
    const reindex =
      ragControl.match(
        /export function useRagReindex[\s\S]*?export interface WatcherReconfigureArgs/,
      )?.[0] ?? "";
    if (
      !/\bexport function normalizeRagReindexArgs\s*\(\s*input:\s*unknown\s*\):\s*ReindexArgs/.test(
        ragControl,
      )
    ) {
      violations.push("stores/server/ragControl.ts: missing reindex args normalizer");
    }
    if (
      !/\bconst\s+type\s*=\s*normalizeRagReindexType\s*\(\s*value\.type\s*\)[\s\S]*typeof\s+value\.clean\s*===\s*["']boolean["']/.test(
        ragControl,
      )
    ) {
      violations.push("stores/server/ragControl.ts: reindex args are not runtime-normalized");
    }
    if (
      !/\bmutationFn:\s*\(\s*args:\s*unknown\s*=\s*\{\}\s*\)[\s\S]*body:\s*normalizeRagReindexArgs\s*\(\s*args\s*\)/.test(
        reindex,
      )
    ) {
      violations.push("stores/server/ragControl.ts: reindex dispatches raw args");
    }
    if (/\bmutationFn:\s*\(\s*args:\s*ReindexArgs/.test(reindex)) {
      violations.push("stores/server/ragControl.ts: reindex mutation is typed-only");
    }
    const projectEvict =
      ragControl.match(
        /export function useRagProjectEvict[\s\S]*?\/\/ --- a small convenience/,
      )?.[0] ?? "";
    if (
      !/\bconst\s+normalizedRoot\s*=\s*normalizeRagProjectRoot\s*\(\s*root\s*\)/.test(
        projectEvict,
      )
    ) {
      violations.push(
        "stores/server/ragControl.ts: project evict bypasses root normalizer",
      );
    }
    if (!/\bbody:\s*\{\s*root:\s*normalizedRoot\s*\}/.test(projectEvict)) {
      violations.push("stores/server/ragControl.ts: project evict dispatches raw root");
    }
    if (/\bmutationFn:\s*\(\s*root:\s*string\s*\)/.test(projectEvict)) {
      violations.push("stores/server/ragControl.ts: project evict is typed-only");
    }
    const opsRunInvalidation = ragControl.match(
      /export function invalidateAfterRagOpsRun[\s\S]*?export function useInvalidateAfterRagOpsRun/,
    )?.[0];
    if (!opsRunInvalidation) {
      violations.push("stores/server/ragControl.ts: missing rag ops invalidation seam");
    } else {
      if (
        !/\binvalidateRagControlQueries\s*\(\s*queryClient\s*\)/.test(
          opsRunInvalidation,
        )
      ) {
        violations.push(
          "stores/server/ragControl.ts: ops run bypasses shared rag control invalidation",
        );
      }
      if (!/\bengineKeys\.status\s*\(\s*\)/.test(opsRunInvalidation)) {
        violations.push("stores/server/ragControl.ts: ops run misses status");
      }
      if (
        !/\binvalidateScopedSemanticReads\s*\(\s*queryClient\s*,\s*normalizedScope\s*\)/.test(
          opsRunInvalidation,
        )
      ) {
        violations.push(
          "stores/server/ragControl.ts: lifecycle ops bypass scoped semantic invalidation",
        );
      }
      if (
        /\[\s*\.\.\.engineKeys\.all\s*,\s*["'](?:search|graph-embeddings)["']\s*,\s*normalizedScope\s*\]/.test(
          opsRunInvalidation,
        )
      ) {
        violations.push(
          "stores/server/ragControl.ts: lifecycle ops hand-compose semantic invalidation",
        );
      }
      if (
        !/if\s*\(\s*verb\s*!==\s*["']service-start["']\s*&&\s*verb\s*!==\s*["']service-stop["']\s*\)\s*return/.test(
          opsRunInvalidation,
        )
      ) {
        violations.push(
          "stores/server/ragControl.ts: semantic invalidation is not scoped to lifecycle ops",
        );
      }
    }
    const reindexInvalidation = ragControl.match(
      /export function invalidateRagReindexSettlementQueries[\s\S]*?export function useRagServiceState/,
    )?.[0];
    if (!reindexInvalidation) {
      violations.push(
        "stores/server/ragControl.ts: missing reindex settlement invalidation seam",
      );
    } else {
      if (
        !/\binvalidateRagControlQueries\s*\(\s*queryClient\s*\)/.test(
          reindexInvalidation,
        )
      ) {
        violations.push(
          "stores/server/ragControl.ts: reindex settlement bypasses shared rag control invalidation",
        );
      }
      if (!/\bengineKeys\.status\s*\(\s*\)/.test(reindexInvalidation)) {
        violations.push(
          "stores/server/ragControl.ts: reindex settlement misses status",
        );
      }
      if (
        !/\binvalidateScopedSemanticReads\s*\(\s*queryClient\s*,\s*normalizedScope\s*\)/.test(
          reindexInvalidation,
        )
      ) {
        violations.push(
          "stores/server/ragControl.ts: reindex settlement bypasses scoped semantic invalidation",
        );
      }
      if (
        /\[\s*\.\.\.engineKeys\.all\s*,\s*["'](?:search|graph-embeddings)["']\s*,\s*normalizedScope\s*\]/.test(
          reindexInvalidation,
        )
      ) {
        violations.push(
          "stores/server/ragControl.ts: reindex settlement hand-composes semantic invalidation",
        );
      }
      if (
        !/if\s*\(\s*normalizedScope\s*===\s*null\s*\|\|\s*!\s*semanticIndexChanged\s*\)\s*return/.test(
          reindexInvalidation,
        )
      ) {
        violations.push(
          "stores/server/ragControl.ts: reindex settlement semantic invalidation is not scoped to successful index changes",
        );
      }
    }
    for (const [name, pattern] of [
      [
        "useRagServiceState",
        /export function useRagServiceState[\s\S]*?export function useRagWatcher/,
      ],
      [
        "useRagWatcher",
        /export function useRagWatcher[\s\S]*?export function useRagProjects/,
      ],
      [
        "useRagProjects",
        /export function useRagProjects[\s\S]*?export function useRagReadiness/,
      ],
      [
        "useRagReadiness",
        /export function useRagReadiness[\s\S]*?export function useRagControlView/,
      ],
    ] as const) {
      const body = ragControl.match(pattern)?.[0];
      if (!body) {
        violations.push(`stores/server/ragControl.ts: missing ${name}`);
      } else if (
        !/\bconst\s+normalizedScope\s*=\s*normalizeRagControlScope\s*\(\s*scope\s*\)/.test(
          body,
        ) ||
        !/queryKey:\s*ragControlKeys\.\w+\s*\(\s*normalizedScope\s*\?\?\s*["']["']/.test(
          body,
        ) ||
        !/return\s+enabled\s*\?\s*query\s*:\s*\{\s*\.\.\.query,\s*data:\s*undefined\s*\}/.test(
          body,
        )
      ) {
        violations.push(
          `stores/server/ragControl.ts: ${name} bypasses normalized disabled cache boundary`,
        );
      }
    }
    const jobsRead = ragControl.match(
      /export function useRagJobs[\s\S]*?export function useRagReindex/,
    )?.[0];
    if (!jobsRead) {
      violations.push("stores/server/ragControl.ts: missing useRagJobs");
    } else if (
      !/\bconst\s+request\s*=\s*normalizeRagJobsRequestIdentity\s*\(\s*scope\s*,\s*limit\s*\)/.test(
        jobsRead,
      ) ||
      !/\bconst\s+enabled\s*=\s*request\.scope\s*!==\s*null/.test(jobsRead) ||
      !/queryKey:\s*ragControlKeys\.jobs\s*\(\s*request\.scope\s*\?\?\s*["']["']\s*,\s*`recent-\$\{request\.limit\}`\s*\)/.test(
        jobsRead,
      ) ||
      !/engineClient\.opsRagGet<RagJobsSnapshot>\s*\(\s*["']jobs["']\s*,\s*\{\s*limit:\s*request\.limit\s*\}/.test(
        jobsRead,
      ) ||
      !/return\s+enabled\s*\?\s*query\s*:\s*\{\s*\.\.\.query,\s*data:\s*undefined\s*\}/.test(
        jobsRead,
      )
    ) {
      violations.push(
        "stores/server/ragControl.ts: useRagJobs bypasses normalized request identity",
      );
    }
    const jobProgress = ragControl.match(
      /export function useRagJobProgress[\s\S]*?export function useRagJobs/,
    )?.[0];
    if (!jobProgress) {
      violations.push("stores/server/ragControl.ts: missing useRagJobProgress");
    } else {
      if (
        !/\bconst\s+normalizedScope\s*=\s*normalizeRagControlScope\s*\(\s*scope\s*\)/.test(
          jobProgress,
        ) ||
        !/\bconst\s+normalizedJobId\s*=\s*normalizeRagJobId\s*\(\s*jobId\s*\)/.test(
          jobProgress,
        ) ||
        !/const\s+enabled\s*=\s*normalizedScope\s*!==\s*null\s*&&\s*normalizedJobId\s*!==\s*null/.test(
          jobProgress,
        )
      ) {
        violations.push(
          "stores/server/ragControl.ts: rag job progress lacks enabled gate",
        );
      }
      if (
        !/enabled\s*\?\s*\(\s*query\.data\s+as\s+BrokeredResult<RagJobsSnapshot>\s*\|\s*undefined\s*\)\s*:\s*undefined/.test(
          jobProgress,
        ) ||
        !/enabled\s*\?\s*normalizedJobId\s*:\s*null/.test(jobProgress)
      ) {
        violations.push(
          "stores/server/ragControl.ts: rag job progress can expose cached data while disabled",
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps rag-control assembly behind the ops-panel view seam", () => {
    const violations: string[] = [];
    const owner = "stores/view/opsPanel.ts";
    const roots = [
      ...PRODUCTION_SURFACES.map((surface) => join(SRC_ROOT, surface)),
      VIEW_STORES_ROOT,
    ];
    const rawRagControlHook =
      /\buseRag(?:ServiceState|Readiness|Watcher|Projects|Jobs|ControlView|Reindex|ReindexWithProgress|WatcherReconfigure|WatcherStart|WatcherStop|ProjectEvict)\b/;

    for (const root of roots) {
      for (const file of sourceFiles(root)) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
        if (rel === owner) continue;

        for (const statement of importStatements(stripped)) {
          if (rawRagControlHook.test(statement)) {
            violations.push(`${rel}: raw rag-control hook import`);
          }
          if (
            /\b(?:ragControlKeys|BrokeredResult|RagControlView|ragSemanticOffline)\b/.test(
              statement,
            )
          ) {
            violations.push(`${rel}: rag-control wire/view import outside seam`);
          }
        }
        if (rawRagControlHook.test(stripped)) {
          violations.push(`${rel}: raw rag-control hook access`);
        }
        if (
          /\b(?:ragControlKeys|BrokeredResult|RagControlView|ragSemanticOffline)\b/.test(
            stripped,
          )
        ) {
          violations.push(`${rel}: rag-control wire/view access outside seam`);
        }
        if (/\bdispatchOps\s*\(\s*\{\s*target:\s*["']rag["']/.test(stripped)) {
          violations.push(`${rel}: direct rag ops dispatch outside seam`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps NowStrip status rollup reads behind the now-strip view seam", () => {
    const rel = "app/right/NowStrip.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseStatus(?:Rollup|RecoveryRefresh)\b/.test(statement)) {
        violations.push(`${rel}: raw status rollup hook import`);
      }
      if (
        /\b(?:GitStatusView|CoreStatusView|RagStatusView|StatusRollupView)\b/.test(
          statement,
        )
      ) {
        violations.push(`${rel}: app-layer status view typing`);
      }
    }
    if (/\buseStatus(?:Rollup|RecoveryRefresh)\s*\(/.test(stripped)) {
      violations.push(`${rel}: local status rollup subscription`);
    }
    if (/\brollup\.(?:git|core|rag|degradations|engineUnreachable)\b/.test(stripped)) {
      violations.push(`${rel}: local status rollup projection`);
    }
    if (!/\buseNowStripView\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing now-strip view seam`);
    }
    for (const localCopy of ["engine unreachable", "vaultspec serve", "degraded:"]) {
      if (stripped.includes(localCopy)) {
        violations.push(`${rel}: local now-strip presentation copy "${localCopy}"`);
      }
    }
    if (/jobs\s*===\s*1|job\{[^}]*jobs|jobsLabel\s*\?\?\s*`/.test(stripped)) {
      violations.push(`${rel}: local now-strip job pluralization`);
    }
    if (/\bTONE_CLASSES\b|\bTONE_INK\b/.test(stripped)) {
      violations.push(`${rel}: local now-strip tone class projection`);
    }
    for (const field of [
      "engineUnreachableLabel",
      "engineCommandLabel",
      "engineUnreachableClassName",
      "engineCommandClassName",
      "rootClassName",
      "liveRegionClassName",
      "degradationLabel",
      "degradationClassName",
      "degradationIconClassName",
      "jobsLabel",
      "ragLive",
    ]) {
      if (!new RegExp(`\\b${field}\\b`).test(stripped)) {
        violations.push(`${rel}: missing now-strip view ${field}`);
      }
    }
    for (const field of [
      "card.rootClassName",
      "card.identityClassName",
      "card.leadMarkClassName",
      "card.labelClassName",
      "card.detailRootClassName",
      "card.detailClassName",
      "card.jobsClassName",
      "card.toneMarkClassName",
      "card.loadingMarkClassName",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing now-strip card chrome ${field}`);
      }
    }
    for (const localChrome of [
      "flex items-center justify-between gap-fg-2 rounded-fg-md border px-fg-2 py-fg-1 shadow-fg-raised transition-colors duration-ui-fast ease-settle",
      "flex min-w-0 items-center gap-fg-1-5",
      "shrink-0 text-ink-faint",
      "font-medium text-ink",
      "min-w-0 truncate text-ink-muted",
      "shrink-0 rounded-fg-xs bg-paper-sunken px-fg-1 text-caption text-ink-muted",
      "animate-pulse-live",
      "space-y-fg-1 text-label",
      "text-label text-state-broken",
      "flex items-start gap-fg-1-5 text-state-broken",
      "mt-px shrink-0",
    ]) {
      if (stripped.includes(localChrome)) {
        violations.push(`${rel}: local now-strip chrome "${localChrome}"`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps production chrome off raw status and tier interpreters", () => {
    const violations: string[] = [];

    for (const surface of PRODUCTION_SURFACES) {
      for (const file of sourceFiles(join(SRC_ROOT, surface))) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        for (const statement of importStatements(stripped)) {
          if (
            /\buse(?:EngineStatus|GitStatus|CoreStatus|RagStatus|StatusRollup|StatusRecoveryRefresh)\b/.test(
              statement,
            )
          ) {
            violations.push(`${rel}: raw status hook import`);
          }
          if (
            /\bderive(?:GitStatusView|CoreStatusView|RagStatusView)\b/.test(statement)
          ) {
            violations.push(`${rel}: raw status projection import`);
          }
          if (/\b(?:readTierAvailability|tiersFromQuery)\b/.test(statement)) {
            violations.push(`${rel}: raw tier interpreter import`);
          }
          if (
            /\b(?:GitStatusView|CoreStatusView|RagStatusView|StatusRollupView)\b/.test(
              statement,
            )
          ) {
            violations.push(`${rel}: raw status view typing`);
          }
        }
        if (
          /\buse(?:EngineStatus|GitStatus|CoreStatus|RagStatus|StatusRollup|StatusRecoveryRefresh)\s*\(/.test(
            stripped,
          )
        ) {
          violations.push(`${rel}: raw status hook access`);
        }
        if (
          /\bderive(?:GitStatusView|CoreStatusView|RagStatusView)\s*\(/.test(stripped)
        ) {
          violations.push(`${rel}: raw status projection`);
        }
        if (/\b(?:readTierAvailability|tiersFromQuery)\s*\(/.test(stripped)) {
          violations.push(`${rel}: raw tier interpretation`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps rag status degradation on the shared semantic-tier reader", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];
    const start = stripped.indexOf("export function deriveRagStatusView");
    const end = stripped.indexOf("export function useRagStatus", start);
    const body = start >= 0 && end > start ? stripped.slice(start, end) : "";

    if (body.length === 0) {
      violations.push(`${rel}: missing rag status view derivation`);
    }
    if (
      !/\breadTierAvailability\s*\(\s*tiers\s*,\s*\[\s*RAG_TIER\s*\]\s*\)/.test(body)
    ) {
      violations.push(`${rel}: rag status bypasses shared tier reader`);
    }
    if (
      !/\bconst\s+degraded\s*=\s*tiers\s*!==\s*undefined\s*&&\s*availability\.degraded\b/.test(
        body,
      )
    ) {
      violations.push(`${rel}: rag status does not tie degradation to served tiers`);
    }
    if (/\btier\s*=\s*tiers\?\.\[\s*RAG_TIER\s*\]|\btier\.available\b/.test(body)) {
      violations.push(`${rel}: rag status uses local semantic tier availability read`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps degradation inputs on the shared semantic-tier reader", () => {
    const rel = "stores/server/degradationInputs.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (!/\breadTierAvailability\b/.test(stripped)) {
      violations.push(`${rel}: missing shared tier availability reader`);
    }
    if (
      !/\breadTierAvailability\s*\(\s*status\.tiers\s*,\s*\[\s*["']semantic["']\s*\]\s*\)\.degraded/.test(
        stripped,
      )
    ) {
      violations.push(
        `${rel}: semantic degradation is not read through the shared reader`,
      );
    }
    if (/\bstatus\.tiers\.semantic\??\.\s*available\b/.test(stripped)) {
      violations.push(`${rel}: local optional-chain semantic tier read`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps semantic embeddings held state on the shared semantic-tier reader", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];
    const start = stripped.indexOf("export function deriveSemanticEmbeddingsView");
    const end = stripped.indexOf("export function useGraphEmbeddings", start);
    const body = start >= 0 && end > start ? stripped.slice(start, end) : "";
    const hookStart = stripped.indexOf("export function useGraphEmbeddings");
    const hookEnd = stripped.indexOf("\n/**", hookStart + 1);
    const hook =
      hookStart >= 0
        ? stripped.slice(hookStart, hookEnd > hookStart ? hookEnd : undefined)
        : "";

    if (body.length === 0) {
      violations.push(`${rel}: missing semantic embeddings view derivation`);
    }
    if (
      !/\breadTierAvailability\s*\(\s*tiers\s*,\s*\[\s*SEMANTIC_TIER\s*\]\s*\)/.test(
        body,
      )
    ) {
      violations.push(`${rel}: semantic embeddings bypass shared tier reader`);
    }
    if (
      !/\bconst\s+unavailable\s*=\s*tiers\s*!==\s*undefined\s*&&\s*availability\.degraded\b/.test(
        body,
      )
    ) {
      violations.push(
        `${rel}: semantic embeddings does not degrade absent semantic tier`,
      );
    }
    if (
      /\bsemantic\s*!==\s*undefined\s*&&\s*semantic\.available\s*===\s*false\b/.test(
        body,
      )
    ) {
      violations.push(
        `${rel}: semantic embeddings uses local available:false held read`,
      );
    }
    if (
      !/\bexport\s+const\s+normalizeGraphEmbeddingsScope\s*=\s*normalizeGraphSliceScope\b/.test(
        stripped,
      ) ||
      !/\bnormalizeGraphEmbeddingsRequestIdentity\s*\(\s*scope:\s*unknown,\s*lens:\s*unknown,\s*focus:\s*unknown/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: graph embeddings request identity trusts typed inputs`);
    }
    if (
      !/\bconst\s+request\s*=\s*normalizeGraphEmbeddingsRequestIdentity\s*\(\s*scope\s*,\s*lens\s*,\s*focus\s*\)/.test(
        hook,
      )
    ) {
      violations.push(
        `${rel}: graph embeddings hook bypasses request identity normalizer`,
      );
    }
    if (
      !/queryKey:\s*engineKeys\.graphEmbeddings\s*\([\s\S]*request\.scope\s*\?\?\s*["']["'][\s\S]*request\.lens[\s\S]*request\.focus/.test(
        hook,
      )
    ) {
      violations.push(
        `${rel}: graph embeddings query key bypasses normalized identity`,
      );
    }
    if (
      !/engineClient\.graphEmbeddings\s*\(\s*\{[\s\S]*scope:\s*request\.scope![\s\S]*lens:\s*request\.lens[\s\S]*focus:\s*request\.focus/.test(
        hook,
      )
    ) {
      violations.push(
        `${rel}: graph embeddings request body bypasses normalized identity`,
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps semantic discover offline state on the shared semantic-tier reader", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];
    const start = stripped.indexOf("export function deriveDiscoverView");
    const end = stripped.indexOf("export function useDiscover", start);
    const body = start >= 0 && end > start ? stripped.slice(start, end) : "";

    if (body.length === 0) {
      violations.push(`${rel}: missing discover view derivation`);
    }
    if (!/\btiersFromQuery\s*\(\s*\{\s*data\s*,\s*error\s*\}\s*\)/.test(body)) {
      violations.push(`${rel}: discover offline bypasses fresh tier precedence`);
    }
    if (
      !/\breadTierAvailability\s*\(\s*tiers\s*,\s*\[\s*DISCOVER_TIER\s*\]\s*\)\.degraded/.test(
        body,
      )
    ) {
      violations.push(`${rel}: discover offline bypasses shared tier reader`);
    }
    if (/\btiers\s*\[\s*DISCOVER_TIER\s*\]\??\.\s*available\b/.test(body)) {
      violations.push(`${rel}: discover uses local semantic tier availability read`);
    }
    if (
      !/\bcandidates:\s*offline\s*\?\s*\[\]\s*:\s*\(data\?\.candidates\s*\?\?\s*\[\]\)/.test(
        body,
      )
    ) {
      violations.push(`${rel}: discover offline can expose stale candidates`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps semantic search offline state on the shared semantic-tier reader", () => {
    const rel = "stores/server/searchController.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];
    const start = stripped.indexOf("export function isSemanticOffline");
    const end = stripped.indexOf("export function isTransportError", start);
    const body = start >= 0 && end > start ? stripped.slice(start, end) : "";

    if (body.length === 0) {
      violations.push(`${rel}: missing semantic offline helper`);
    }
    if (
      !/\breadTierAvailability\s*\(\s*block\s*,\s*\[\s*["']semantic["']\s*\]\s*\)\.degraded/.test(
        body,
      )
    ) {
      violations.push(`${rel}: search offline bypasses shared tier reader`);
    }
    if (/\bblock\.semantic\b|\bsemantic\.available\b/.test(body)) {
      violations.push(`${rel}: search uses local semantic tier availability read`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps OpsPanel status and receipt composition behind the ops panel view", () => {
    const rel = "app/right/OpsPanel.tsx";
    if (!existsSync(join(SRC_ROOT, rel))) {
      const rightRail = sourceFiles(join(SRC_ROOT, "app/right"))
        .map((file) => stripComments(readFileSync(file, "utf8")))
        .join("\n");
      expect(rightRail).not.toMatch(/\buseOpsPanelView\b|\buseOpsReceipt\b/);
      return;
    }
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardTimelineModeView\b/.test(statement)) {
        violations.push(`${rel}: local timeline ops-state read`);
      }
      if (/\buseRagStatus\b/.test(statement)) {
        violations.push(`${rel}: local rag status read`);
      }
      if (/\buseOpsReceipt\b/.test(statement)) {
        violations.push(`${rel}: local ops receipt read`);
      }
      if (/\buseOpsReceiptBoundary\b/.test(statement)) {
        violations.push(`${rel}: local ops receipt boundary`);
      }
      if (/\bOPS_WHITELIST\b/.test(statement)) {
        violations.push(`${rel}: local ops whitelist filtering`);
      }
    }
    if (!/\buseOpsPanelView\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing ops panel view seam`);
    }
    if (/\bragVerbVisible\b|\bragKnown\b|\bragRunning\b/.test(stripped)) {
      violations.push(`${rel}: local rag operation cluster projection`);
    }
    if (/\breceiptTone\b/.test(stripped)) {
      violations.push(`${rel}: local receipt tone projection`);
    }
    if (
      /\bop\.target\s*===|\bop\.verb\s*===|\btarget\s*===\s*["'](?:core|rag)["']/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local ops verb chrome projection`);
    }
    for (const localCopy of ["confirm?", "cancel"]) {
      if (
        stripped.includes(`"${localCopy}"`) ||
        stripped.includes(`'${localCopy}'`) ||
        new RegExp(`>[\\s\\r\\n]*${localCopy.replace("?", "\\?")}[\\s\\r\\n]*<`).test(
          stripped,
        )
      ) {
        violations.push(`${rel}: local ops confirm presentation copy "${localCopy}"`);
      }
    }
    for (const localTemplate of [
      "`ops:${target}:${verb}`",
      "`confirm ${label}`",
      "`cancel ${label}`",
    ]) {
      if (stripped.includes(localTemplate)) {
        violations.push(`${rel}: local ops confirm presentation ${localTemplate}`);
      }
    }
    for (const localClass of [
      "cursor-not-allowed border-rule text-ink-faint",
      "border-rule text-ink hover:border-rule-strong hover:bg-paper-sunken",
      "border border-accent bg-accent-subtle",
      "text-caption text-ink-faint underline-offset-2",
    ]) {
      if (stripped.includes(localClass)) {
        violations.push(`${rel}: local ops control button class projection`);
      }
    }
    if (!/\bderiveOpsControlButtonPresentationView\b/.test(stripped)) {
      violations.push(`${rel}: missing ops control button presentation seam`);
    }
    for (const field of [
      "presentation.actionType",
      "presentation.mark",
      "presentation.idleDisabled",
      "presentation.idleBusy",
      "presentation.idleButtonClassName",
      "presentation.confirmDisabled",
      "presentation.confirmGroupClassName",
      "presentation.confirmButtonClassName",
      "presentation.confirmLabel",
      "presentation.confirmAriaLabel",
      "presentation.cancelButtonClassName",
      "presentation.cancelLabel",
      "presentation.cancelAriaLabel",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing ops button presentation field ${field}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps OpsPanel watcher config draft behind the rag watcher draft seam", () => {
    const rel = "app/right/OpsPanel.tsx";
    if (!existsSync(join(SRC_ROOT, rel))) {
      const rightRail = sourceFiles(join(SRC_ROOT, "app/right"))
        .map((file) => stripComments(readFileSync(file, "utf8")))
        .join("\n");
      expect(rightRail).not.toMatch(/\buseRagWatcherConfigDraft\b/);
      return;
    }
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseState\b/.test(statement)) {
        violations.push(`${rel}: local ops panel state hook`);
      }
      if (/\bwatcherReconfigureArgsFromDraft\b/.test(statement)) {
        violations.push(`${rel}: local watcher draft parsing import`);
      }
    }
    if (/\[\s*(?:debounce|cooldown)\s*,\s*set[A-Z]/.test(stripped)) {
      violations.push(`${rel}: local watcher config draft tuple`);
    }
    if (/\bNumber\s*\(|\bparseInt\s*\(|\bparseFloat\s*\(/.test(stripped)) {
      violations.push(`${rel}: local watcher config numeric parsing`);
    }
    if (
      !/\buseRagWatcherConfigDraft\s*\(\s*watch\s*,\s*sourceKey\s*\)/.test(stripped)
    ) {
      violations.push(`${rel}: missing rag watcher config draft seam`);
    }
    if (
      !/\bderiveRagWatcherConfigPresentationView\s*\(\s*\{\s*disabled\s*,\s*pending\s*\}\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing watcher config presentation seam`);
    }
    if (!/\bdraft\.reconfigureArgs\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing draft-owned watcher reconfigure args`);
    }
    for (const localCopy of ["debounce ms", "cooldown s"]) {
      if (stripped.includes(localCopy)) {
        violations.push(`${rel}: local watcher config label "${localCopy}"`);
      }
    }
    if (/>[\s\r\n]*apply[\s\r\n]*</.test(stripped)) {
      violations.push(`${rel}: local watcher apply label`);
    }
    if (/const\s+fieldClass\s*=/.test(stripped)) {
      violations.push(`${rel}: local watcher field class projection`);
    }
    if (/className=\{fieldClass\}/.test(stripped)) {
      violations.push(`${rel}: local watcher field class consumption`);
    }
    if (/disabled=\{disabled\s*\|\|\s*pending\}/.test(stripped)) {
      violations.push(`${rel}: local watcher apply disabled projection`);
    }
    for (const field of [
      "labels.fieldClassName",
      "labels.inputDisabled",
      "labels.applyDisabled",
      "labels.applyBusy",
      "labels.applyButtonClassName",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing watcher presentation field ${field}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps node-detail surface state behind the stores node-detail view", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      for (const statement of importStatements(stripped)) {
        if (/\buseNodeDetail\b/.test(statement)) {
          violations.push(`${rel}: raw node-detail query hook`);
        }
      }
      if (/\bdetail\.is(?:Pending|Error)\b/.test(stripped)) {
        violations.push(`${rel}: app-layer node-detail query state branch`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps disabled node-scoped reads from exposing cached query data", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    if (
      !/\bexport\s+function\s+normalizeNodeScopedRequestIdentity\b[\s\S]*\bnormalizeNodeId\s*\(\s*nodeId\s*\)/.test(
        stripped,
      )
    ) {
      expect([
        `${rel}: node-scoped reads lack a shared normalized request identity`,
      ]).toEqual([]);
    }
    const hooks = [
      {
        name: "useNodeDetail",
        pattern:
          /export function useNodeDetail[\s\S]*?export type NodeDetailSurfaceState/,
        identity:
          /const\s+request\s*=\s*normalizeNodeScopedRequestIdentity\s*\(\s*scope\s*,\s*id\s*\)/,
        enabled:
          /const\s+enabled\s*=\s*request\.scope\s*!==\s*null\s*&&\s*isAddressableNode\s*\(\s*request\.nodeId\s*\)/,
      },
      {
        name: "useNodeNeighbors",
        pattern: /export function useNodeNeighbors[\s\S]*?const CONTENT_GC_TIME/,
        identity:
          /const\s+request\s*=\s*normalizeNodeScopedRequestIdentity\s*\(\s*scope\s*,\s*id\s*,\s*depth\s*\)/,
        enabled:
          /const\s+enabled\s*=\s*request\.scope\s*!==\s*null\s*&&\s*isAddressableNode\s*\(\s*request\.nodeId\s*\)/,
      },
      {
        name: "useNodeContent",
        pattern: /export function useNodeContent[\s\S]*?export interface ContentView/,
        identity:
          /const\s+request\s*=\s*normalizeNodeScopedRequestIdentity\s*\(\s*scope\s*,\s*nodeId\s*\)/,
        enabled:
          /const\s+enabled\s*=\s*request\.scope\s*!==\s*null\s*&&\s*isAddressableNode\s*\(\s*request\.nodeId\s*\)/,
      },
      {
        name: "useNodeNeighborsBulk",
        pattern:
          /export function useNodeNeighborsBulk[\s\S]*?export function useNodeEvidence/,
        identity:
          /const\s+normalizedScope\s*=\s*normalizeNodeScopedScope\s*\(\s*scope\s*\)[\s\S]*const\s+normalizedDepth\s*=\s*normalizeNodeNeighborDepth\s*\(\s*depth\s*\)[\s\S]*const\s+nodeId\s*=\s*normalizeNodeId\s*\(\s*id\s*\)/,
        enabled:
          /const\s+enabled\s*=\s*normalizedScope\s*!==\s*null\s*&&\s*isAddressableNode\s*\(\s*nodeId\s*\)/,
        mask: /queries\s*\[\s*index\s*\]\?\.enabled\s*\?\s*result\s*:\s*\{\s*\.\.\.result,\s*data:\s*undefined\s*\}/,
      },
      {
        name: "useNodeEvidence",
        pattern: /export function useNodeEvidence[\s\S]*?export interface DiscoverView/,
        identity:
          /const\s+request\s*=\s*normalizeNodeScopedRequestIdentity\s*\(\s*scope\s*,\s*id\s*\)/,
        enabled:
          /const\s+enabled\s*=\s*request\.scope\s*!==\s*null\s*&&\s*isAddressableNode\s*\(\s*request\.nodeId\s*\)/,
      },
      {
        name: "useDiscover",
        pattern: /export function useDiscover[\s\S]*?export function useEngineEvents/,
        identity:
          /const\s+request\s*=\s*normalizeNodeScopedRequestIdentity\s*\(\s*scope\s*,\s*nodeId\s*\)/,
        enabled:
          /const\s+enabled\s*=\s*request\.scope\s*!==\s*null\s*&&\s*isAddressableNode\s*\(\s*request\.nodeId\s*\)/,
        mask: /deriveDiscoverView\s*\([\s\S]*enabled\s*&&\s*query\.isPending[\s\S]*enabled\s*,?\s*\)/,
      },
    ];
    const violations: string[] = [];
    if (
      !/\bexport\s+const\s+normalizeNodeScopedScope\s*=\s*normalizeGraphSliceScope\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: node-scoped request identity duplicates scope policy`);
    }

    for (const hook of hooks) {
      const body = stripped.match(hook.pattern)?.[0];
      if (!body) {
        violations.push(`${rel}: missing ${hook.name} hook`);
        continue;
      }
      if (!hook.enabled.test(body)) {
        violations.push(`${rel}: ${hook.name} lacks its disabled-state gate`);
      }
      if (!hook.identity.test(body)) {
        violations.push(`${rel}: ${hook.name} does not normalize request identity`);
      }
      const mask =
        hook.mask ??
        /return\s+enabled\s*\?\s*query\s*:\s*\{\s*\.\.\.query,\s*data:\s*undefined\s*\}/;
      if (!mask.test(body)) {
        violations.push(`${rel}: ${hook.name} can expose cached data while disabled`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps node interior detail projection behind the stores-view seam", () => {
    const rel = "app/islands/NodeInterior.tsx";
    const seamRel = "stores/view/nodeInterior.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const seam = stripComments(readFileSync(join(SRC_ROOT, seamRel), "utf8"));
    const componentBody =
      stripped.match(
        /\bexport\s+function\s+NodeInterior\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/,
      )?.[1] ?? stripped;
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\bfeatureTagFromNodeId\b/.test(statement)) {
        violations.push(`${rel}: app-layer feature-node identity projection`);
      }
    }
    if (!/\bderiveNodeInteriorView\b/.test(seam)) {
      violations.push(`${seamRel}: missing node interior projection seam`);
    }
    if (!/\bderiveNodeInteriorView\s*\(\s*id\s*,\s*detail\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing stores-view node interior projection`);
    }
    if (
      /\bconst\s+isFeature\b|\bid\.startsWith\s*\(\s*["']feature:/.test(componentBody)
    ) {
      violations.push(`${rel}: local feature-node routing`);
    }
    if (/\bdetail\.state\b|\bdetail\.node\b|\bdetail\.detail\b/.test(componentBody)) {
      violations.push(`${rel}: local node-detail state projection`);
    }
    for (const helper of ["interiorSteps", "stateMarkKey"]) {
      if (!new RegExp(`\\bexport\\s+function\\s+${helper}\\b`).test(seam)) {
        violations.push(`${seamRel}: missing ${helper} projection helper`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps hover-card evidence reads behind the stores hover-card view", () => {
    const rel = "app/islands/HoverCardLayer.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const seamRel = "stores/view/hoverCard.ts";
    const seam = stripComments(readFileSync(join(SRC_ROOT, seamRel), "utf8"));
    const violations: string[] = [];
    const menuEvidenceAlias = "app/right/menus/hoverCardEvidence.ts";
    const menuFiles = sourceFiles(join(SRC_ROOT, "app/right/menus")).map((file) =>
      relative(SRC_ROOT, file).replaceAll("\\", "/"),
    );

    if (menuFiles.includes(menuEvidenceAlias)) {
      violations.push(`${menuEvidenceAlias}: app-layer hover-card evidence alias`);
    }

    for (const statement of importStatements(stripped)) {
      if (/\buseNodeDetailView\b|\buseNodeEvidence\b/.test(statement)) {
        violations.push(`${rel}: raw hover-card query hook`);
      }
      if (/\bderiveEvidenceGroups\b|\bcardModelFromEvidence\b/.test(statement)) {
        violations.push(`${rel}: app-layer hover-card evidence projection`);
      }
    }
    if (/\bevidence\.data\b|\bdetail\.node\b/.test(stripped)) {
      violations.push(`${rel}: app-layer hover-card query payload read`);
    }
    if (!/\buseHoverCardView\s*\(\s*id\s*,\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing stores hover-card view seam`);
    }
    if (/\bscope\??:\s*string\s*\|\s*null\b/.test(stripped)) {
      violations.push(`${rel}: hover-card layer exposes typed-only scope`);
    }
    if (!/\bscope\??:\s*unknown\b/.test(stripped)) {
      violations.push(`${rel}: hover-card layer lacks runtime scope seam`);
    }
    if (
      /\bderiveHoverCardView\s*\(\s*requestedId:\s*string/.test(seam) ||
      /\buseHoverCardView\s*\(\s*id:\s*string\s*,\s*scope:\s*string\s*\|\s*null/.test(
        seam,
      )
    ) {
      violations.push(`${seamRel}: hover-card view selector is typed-only`);
    }
    if (
      !/\bderiveHoverCardView\s*\(\s*requestedId:\s*unknown[\s\S]*\bconst\s+nodeId\s*=\s*normalizeNodeId\s*\(\s*requestedId\s*\)[\s\S]*node\.id\s*!==\s*nodeId/.test(
        seam,
      )
    ) {
      violations.push(
        `${seamRel}: hover-card model matching bypasses node-id normalizer`,
      );
    }
    if (
      !/\buseHoverCardView\s*\(\s*id:\s*unknown,\s*scope:\s*unknown[\s\S]*\bconst\s+nodeId\s*=\s*normalizeNodeId\s*\(\s*id\s*\)[\s\S]*\bconst\s+normalizedScope\s*=\s*normalizeSelectionScope\s*\(\s*scope\s*\)[\s\S]*useNodeDetailView\s*\(\s*nodeId\s*,\s*normalizedScope\s*\)[\s\S]*useNodeEvidence\s*\(\s*nodeId\s*,\s*normalizedScope\s*\)/.test(
        seam,
      )
    ) {
      violations.push(`${seamRel}: hover-card query seam bypasses input normalizers`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps hover-card presentation derivation behind the status-card view", () => {
    const rel = "app/islands/HoverCard.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (/\bfunction\s+rolloutFraction\b|\bfunction\s+magnitudeLabel\b/.test(stripped)) {
      violations.push(`${rel}: local hover-card presentation projection`);
    }
    if (/Math\.round\s*\([^)]*progress/.test(stripped)) {
      violations.push(`${rel}: local hover-card progress width projection`);
    }
    if (!/\bderiveStatusCardPresentationView\s*\(\s*model\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing status-card presentation seam`);
    }
    if (!/\buseStatusCardBloomMotionView\s*\(\s*reduce\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing status-card bloom motion seam`);
    }
    if (/\buseState\b|\buseRef\b|\buseEffect\b/.test(stripped)) {
      violations.push(`${rel}: local hover-card bloom lifecycle`);
    }
    if (!/\buseReducedMotion\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing shared reduced-motion seam`);
    }
    for (const statement of importStatements(stripped)) {
      if (/\bprefersReducedMotion\b/.test(statement)) {
        violations.push(`${rel}: direct reduced-motion media-query helper import`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps typed hover-card content projection behind stores/view", () => {
    const violations: string[] = [];
    const islandFiles = sourceFiles(join(SRC_ROOT, "app/islands")).map((file) =>
      relative(SRC_ROOT, file).replaceAll("\\", "/"),
    );
    const rendererRel = "app/islands/HoverCard.tsx";
    const renderer = stripComments(readFileSync(join(SRC_ROOT, rendererRel), "utf8"));
    const liveMenuRel = "app/right/menus/HoverCard.tsx";
    const liveMenu = stripComments(readFileSync(join(SRC_ROOT, liveMenuRel), "utf8"));

    if (islandFiles.includes("app/islands/hoverCardContent.ts")) {
      violations.push("app/islands/hoverCardContent.ts: app-layer content projection");
    }
    if (/\bexport\s+interface\s+StatusCardModel\b/.test(renderer)) {
      violations.push(`${rendererRel}: local status-card model`);
    }
    if (/from\s+["']\.\/hoverCardContent["']/.test(renderer)) {
      violations.push(`${rendererRel}: app-local hover-card content import`);
    }
    if (!/from\s+["']\.\.\/\.\.\/stores\/view\/statusCard["']/.test(renderer)) {
      violations.push(`${rendererRel}: missing stores status-card model seam`);
    }
    if (!/from\s+["']\.\.\/\.\.\/stores\/view\/hoverCardContent["']/.test(renderer)) {
      violations.push(`${rendererRel}: missing stores hover-card content seam`);
    }
    if (/from\s+["']\.\.\/\.\.\/islands\/hoverCardContent["']/.test(liveMenu)) {
      violations.push(`${liveMenuRel}: app-local hover-card content import`);
    }
    if (
      !/from\s+["']\.\.\/\.\.\/\.\.\/stores\/view\/hoverCardContent["']/.test(liveMenu)
    ) {
      violations.push(`${liveMenuRel}: missing stores hover-card content seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps left-rail tiered query surface states behind stores selectors", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app/left"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\b\w+\.isError\s*&&\s*!\s*availability\.degraded\b/.test(stripped)) {
        violations.push(`${rel}: app-layer tiered query error classification`);
      }
      if (
        /\bavailability\.degradedTiers\.map\b/.test(stripped) ||
        /\bavailability\.reasons\s*\[/.test(stripped)
      ) {
        violations.push(`${rel}: app-layer degraded reason selection`);
      }
      for (const statement of importStatements(stripped)) {
        if (/\buse(?:WorkspaceMap|VaultTree|FileTree)Availability\b/.test(statement)) {
          violations.push(`${rel}: raw root availability hook in left-rail chrome`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps left-rail document identity on the shared stores grammar", () => {
    const source = readFileSync(BROWSER_SELECTION, "utf8");
    const stripped = stripComments(source);
    const violations: string[] = [];

    if (!/\bstemFromPath\b/.test(stripped)) {
      violations.push("app/left/browserSelection.ts: missing shared stem grammar");
    }
    if (!/\bdocNodeIdFromStem\b/.test(stripped)) {
      violations.push("app/left/browserSelection.ts: missing shared doc id grammar");
    }
    if (!/\bcodeNodeIdFromPath\b/.test(stripped)) {
      violations.push("app/left/browserSelection.ts: missing shared code id grammar");
    }
    if (/return\s+`doc:\$\{/.test(stripped)) {
      violations.push("app/left/browserSelection.ts: local doc id construction");
    }
    if (/return\s+`code:\$\{/.test(stripped)) {
      violations.push("app/left/browserSelection.ts: local code id construction");
    }
    if (/replace\s*\(\s*\/\^\.\*\\\//.test(stripped)) {
      violations.push("app/left/browserSelection.ts: local path stem regex");
    }

    expect(violations).toEqual([]);
  });

  it("keeps feature node identity on the shared stores grammar", () => {
    const enrolled = [
      "app/stage/Stage.tsx",
      "stores/server/queries.ts",
      "stores/view/commandPaletteCommands.ts",
      "stores/view/keyboardNavigation.ts",
      "stores/view/selection.ts",
    ];
    const violations: string[] = [];

    for (const rel of enrolled) {
      const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
      if (/`feature:\$\{/.test(stripped)) {
        violations.push(`${rel}: local feature node id construction`);
      }
      if (/startsWith\s*\(\s*["']feature:/.test(stripped)) {
        violations.push(`${rel}: local feature node prefix check`);
      }
      if (/slice\s*\(\s*["']feature:\.length/.test(stripped)) {
        violations.push(`${rel}: local feature node tag extraction`);
      }
    }

    const liveAdapters = stripComments(
      readFileSync(join(SRC_ROOT, "stores/server/liveAdapters.ts"), "utf8"),
    );
    if (!/\bfeatureNodeIdFromTag\b/.test(liveAdapters)) {
      violations.push("stores/server/liveAdapters.ts: missing feature node id helper");
    }
    if (!/\bfeatureTagFromNodeId\b/.test(liveAdapters)) {
      violations.push("stores/server/liveAdapters.ts: missing feature tag parser");
    }

    const keyboard = stripComments(
      readFileSync(join(SRC_ROOT, "stores/view/keyboardNavigation.ts"), "utf8"),
    );
    if (!/\bfeatureTags\.map\s*\(\s*featureNodeIdFromTag\s*\)/.test(keyboard)) {
      violations.push("stores/view/keyboardNavigation.ts: missing feature id helper");
    }

    const palette = stripComments(
      readFileSync(join(SRC_ROOT, "stores/view/commandPaletteCommands.ts"), "utf8"),
    );
    if (
      !/\bsources\.navigate\s*\(\s*featureNodeIdFromTag\s*\(\s*feature\s*\)\s*\)/.test(
        palette,
      )
    ) {
      violations.push(
        "stores/view/commandPaletteCommands.ts: missing feature id helper",
      );
    }

    const sceneEvents = stripComments(
      readFileSync(join(SRC_ROOT, "stores/view/stageSceneEvents.ts"), "utf8"),
    );
    if (!/\bopenGraphNodeFromScene\s*\(/.test(sceneEvents)) {
      violations.push(
        "stores/view/stageSceneEvents.ts: missing scene-open feature intent seam",
      );
    }

    const selection = stripComments(
      readFileSync(join(SRC_ROOT, "stores/view/selection.ts"), "utf8"),
    );
    if (
      !/\bconst\s+nodeId\s*=\s*normalizeNodeId\s*\(\s*id\s*\)[\s\S]*\bfeatureTagFromNodeId\s*\(\s*nodeId\s*\)/.test(
        selection,
      )
    ) {
      violations.push("stores/view/selection.ts: missing feature tag parser");
    }

    expect(violations).toEqual([]);
  });

  it("keeps left-rail browser selection behind the selection seam", () => {
    const source = readFileSync(BROWSER_SELECTION, "utf8");
    const stripped = stripComments(source);
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardState\b/.test(statement)) {
        violations.push(
          "app/left/browserSelection.ts: raw dashboard-state selection subscription",
        );
      }
      if (/\bdashboardSelectionId\b/.test(statement)) {
        violations.push(
          "app/left/browserSelection.ts: local dashboard selection id import",
        );
      }
      if (/\bselectNode\b/.test(statement)) {
        violations.push("app/left/browserSelection.ts: raw node-selection import");
      }
    }
    if (/\bdashboardSelectionId\s*\(/.test(stripped)) {
      violations.push(
        "app/left/browserSelection.ts: local dashboard selection id derivation",
      );
    }
    if (/\bselectNode\s*\(/.test(stripped)) {
      violations.push("app/left/browserSelection.ts: raw node-selection call");
    }
    if (!/\buseDashboardSelectedNodeId\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(
        "app/left/browserSelection.ts: missing dashboard selected-node seam",
      );
    }
    if (
      !/from\s+["']\.\.\/\.\.\/stores\/server\/queries["']/.test(stripped) ||
      !/\buseDashboardSelectedNodeId\b/.test(stripped)
    ) {
      violations.push(
        "app/left/browserSelection.ts: dashboard selected-node seam is not server-owned",
      );
    }
    if (
      /from\s+["']\.\.\/\.\.\/stores\/view\/selection["']/.test(stripped) &&
      /\buseDashboardSelectedNodeId\b/.test(stripped)
    ) {
      violations.push(
        "app/left/browserSelection.ts: selected-node read imported from view layer",
      );
    }
    if (
      !/\buseDashboardNodeSelection\s*\(\s*scope\s*\)/.test(stripped) &&
      !/\b(?:previewDocTab|openDocTab)\s*\(/.test(stripped)
    ) {
      violations.push(
        "app/left/browserSelection.ts: missing dashboard node-selection/tab seam",
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps workspace registry title selection behind the stores title view", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app/left"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      for (const statement of importStatements(stripped)) {
        if (/\buse(?:Workspaces|WorkspaceRoots|ActiveWorkspace)\b/.test(statement)) {
          violations.push(`${rel}: raw workspace registry title composition`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps workspace registry normalization at the live adapter boundary", () => {
    const rel = "stores/server/liveAdapters.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const seam of [
      "normalizeWorkspaceString",
      "adaptWorkspaceRoot",
      "adaptWorkspaces",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${seam} workspace adapter seam`);
      }
    }
    if (
      !/\bfunction\s+adaptWorkspaceRoot\s*\(\s*value:\s*unknown\s*\):\s*WorkspaceRoot\s*\|\s*null[\s\S]*\bconst\s+id\s*=\s*normalizeWorkspaceString\s*\(\s*value\.id\s*\)[\s\S]*\bconst\s+path\s*=\s*normalizeWorkspaceString\s*\(\s*value\.path\s*\)[\s\S]*\bif\s*\(\s*id\s*===\s*undefined\s*\|\|\s*path\s*===\s*undefined\s*\)\s*return\s+null/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: workspace root adapter fabricates malformed roots`);
    }
    if (
      !/\blabel\s*=\s*normalizeWorkspaceString\s*\(\s*value\.label\s*\)\s*\?\?\s*id/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: workspace root label bypasses canonical fallback`);
    }
    if (
      !/\bunreachable_reason:\s*normalizeWorkspaceString\s*\(\s*value\.unreachable_reason\s*\)\s*\?\?\s*null/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: workspace reachability reason bypasses normalizer`);
    }
    if (
      !/\.map\s*\(\s*adaptWorkspaceRoot\s*\)[\s\S]*\.filter\s*\(\s*\(\s*root\s*\):\s*root\s+is\s+WorkspaceRoot\s*=>\s*root\s*!==\s*null\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: workspace adapter does not drop malformed roots`);
    }
    if (
      !/\bactive_workspace:\s*normalizeWorkspaceString\s*\(\s*body\.active_workspace\s*\)\s*\?\?\s*null/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: active workspace bypasses workspace normalizer`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps enrolled filter-vocabulary surfaces behind the vocabulary view", () => {
    const enrolled = new Set([
      "app/a11y/KeyboardNav.tsx",
      "app/palette/CommandPalette.tsx",
      "app/stage/FilterSidebar.tsx",
      "app/timeline/Minimap.tsx",
      "app/timeline/Timeline.tsx",
      "app/timeline/TimelineControls.tsx",
    ]);
    const violations: string[] = [];

    for (const rel of enrolled) {
      const file = join(SRC_ROOT, rel);
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);

      for (const statement of importStatements(stripped)) {
        if (/\buseFiltersVocabulary\b/.test(statement)) {
          violations.push(`${rel}: raw filters-vocabulary query hook`);
        }
      }
      if (/\bvocabulary\.(?:data|isPending|isLoading|isError)\b/.test(stripped)) {
        violations.push(`${rel}: raw filters-vocabulary query state or payload`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps settings dialog resolution behind the stores dialog view", () => {
    const rel = "app/settings/SettingsDialog.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (
        /\buseSettings\b/.test(statement) ||
        /\buseSettingsSchema\b/.test(statement) ||
        /\bresolveSettings\b/.test(statement) ||
        /\busePutSettings\b/.test(statement) ||
        /\buseSettingsControlDraft\b/.test(statement)
      ) {
        violations.push(`${rel}: raw settings query/resolution composition`);
      }
      if (
        /\b(?:defaultSettingsEditTarget|effectiveSettingsEditTarget|settingCanTargetScope|settingsControlValue|settingsControlIsDefaulted|settingsProvenanceNote)\b/.test(
          statement,
        )
      ) {
        violations.push(`${rel}: local settings row selector import`);
      }
      if (/\buse(?:Callback|Effect|Ref|State)\b/.test(statement)) {
        violations.push(`${rel}: local settings row lifecycle state`);
      }
    }
    if (
      /\bschemaQuery\.(?:isLoading|data)\b/.test(stripped) ||
      /\bsettingsQuery\.(?:isLoading|data)\b/.test(stripped)
    ) {
      violations.push(`${rel}: raw settings query state or payload`);
    }
    if (/\bsettings\.schemaLoading\b/.test(stripped)) {
      violations.push(`${rel}: schema-only settings loading branch`);
    }
    if (!/\bsettings\.loading\b/.test(stripped)) {
      violations.push(`${rel}: missing combined settings loading state`);
    }
    if (/\bfunction\s+provenanceNote\b/.test(stripped)) {
      violations.push(`${rel}: local settings provenance formatter`);
    }
    if (/\bdef\.scope_eligible\s*&&\s*activeScope\b/.test(stripped)) {
      violations.push(`${rel}: local settings scopeability derivation`);
    }
    if (/\beff\.scopeValue\s*\?\?\s*eff\.value\b/.test(stripped)) {
      violations.push(`${rel}: local settings control-value derivation`);
    }
    if (
      /\bputSettings\.mutate\b|\berrorEpoch\b|\bsetError\b|\bclearSettingsDraftPending\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local settings row write/draft/error lifecycle`);
    }
    if (!/\bderiveSettingsEditTargetToggleView\b/.test(stripped)) {
      violations.push(`${rel}: missing settings edit-target toggle view seam`);
    }
    if (/\[\s*["']global["']\s*,\s*["']scope["']\s*\]\s+as\s+const/.test(stripped)) {
      violations.push(`${rel}: local settings edit-target domain`);
    }
    if (/\bt\s*===\s*["']global["']\s*\?\s*["']Global["']/.test(stripped)) {
      violations.push(`${rel}: local settings edit-target label projection`);
    }
    if (/\brow\.canMatchGlobal\b|\brow\.canResetDefault\b/.test(stripped)) {
      violations.push(`${rel}: local settings reset-action choice`);
    }
    if (/\bMatch global\b|\bReset to default\b/.test(stripped)) {
      violations.push(`${rel}: local settings reset-action label`);
    }
    for (const localCopy of [
      "Preferences are saved",
      "Loading settings",
      "No settings are available",
    ]) {
      if (stripped.includes(localCopy)) {
        violations.push(`${rel}: local settings dialog copy "${localCopy}"`);
      }
    }
    if (/\btitle\s*=\s*["']Settings["']/.test(stripped)) {
      violations.push(`${rel}: local settings dialog title`);
    }
    if (
      />[\s\r\n]*Cancel[\s\r\n]*</.test(stripped) ||
      />[\s\r\n]*Done[\s\r\n]*</.test(stripped)
    ) {
      violations.push(`${rel}: local settings footer label`);
    }
    for (const field of [
      "title",
      "description",
      "loadingMessage",
      "emptyMessage",
      "cancelLabel",
      "doneLabel",
    ]) {
      if (!new RegExp(`\\bsettings\\.${field}\\b`).test(stripped)) {
        violations.push(`${rel}: missing settings dialog ${field}`);
      }
    }
    if (!/\brow\.resetAction\b/.test(stripped)) {
      violations.push(`${rel}: missing settings reset-action view`);
    }
    if (!/\buseSettingsRowController\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing settings row controller seam`);
    }
    if (/\bactiveScope:\s*string\s*\|\s*null\b/.test(stripped)) {
      violations.push(`${rel}: settings row prop trusts typed-only scope`);
    }
    if (
      !/\binterface\s+SettingRowProps\s*\{[\s\S]*\bactiveScope:\s*unknown[\s\S]*\}/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: settings row prop lacks runtime scope seam`);
    }
    if (/\bonTarget:\s*\(\s*target:\s*string\s*\)\s*=>\s*void/.test(stripped)) {
      violations.push(`${rel}: settings target callback trusts typed-only target`);
    }
    if (!/\bonTarget:\s*\(\s*target:\s*unknown\s*\)\s*=>\s*void/.test(stripped)) {
      violations.push(`${rel}: settings target callback lacks runtime target seam`);
    }
    const rowStart = stripped.indexOf("function SettingRow");
    const rowEnd = stripped.indexOf("function ScopeTargetToggle");
    const rowBlock =
      rowStart >= 0 && rowEnd > rowStart ? stripped.slice(rowStart, rowEnd) : stripped;
    const targetStart = stripped.indexOf("function ScopeTargetToggle");
    const targetBlock = targetStart >= 0 ? stripped.slice(targetStart) : stripped;
    for (const field of [
      "row.rootClassName",
      "row.headerClassName",
      "row.labelClassName",
      "row.titleClassName",
      "row.descriptionClassName",
      "row.controlStackClassName",
      "row.footerClassName",
      "row.provenanceClassName",
      "row.resetButtonClassName",
      "row.errorClassName",
    ]) {
      if (!rowBlock.includes(field)) {
        violations.push(`${rel}: missing settings row chrome projection ${field}`);
      }
    }
    for (const localRowChrome of [
      "flex flex-col gap-fg-1",
      "flex items-start justify-between gap-fg-3",
      "min-w-0 flex-1",
      "block text-body text-ink",
      "mt-fg-0-5 block text-label text-ink-faint",
      "flex shrink-0 flex-col items-end gap-fg-1",
      "flex items-center justify-between gap-fg-2",
      "text-caption text-ink-faint",
      "text-caption text-diff-remove",
    ]) {
      if (rowBlock.includes(localRowChrome)) {
        violations.push(`${rel}: local settings row chrome "${localRowChrome}"`);
      }
    }
    if (/\bSETTINGS_EDIT_TARGET_OPTIONS\b/.test(targetBlock)) {
      violations.push(`${rel}: local settings edit-target option iteration`);
    }
    if (/\btarget\s*===\s*id\b/.test(targetBlock)) {
      violations.push(`${rel}: local settings edit-target checked projection`);
    }
    for (const localTargetChrome of [
      "flex gap-fg-0-5 text-caption",
      "rounded-fg-xs px-fg-1 py-fg-0-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      "font-medium text-accent-text",
      "text-ink-faint hover:text-ink-muted",
    ]) {
      if (targetBlock.includes(localTargetChrome)) {
        violations.push(
          `${rel}: local settings edit-target chrome "${localTargetChrome}"`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps production settings data access behind stores-server seams", () => {
    const violations: string[] = [];
    const roots = [
      ...PRODUCTION_SURFACES.map((surface) => join(SRC_ROOT, surface)),
      VIEW_STORES_ROOT,
    ];

    for (const root of roots) {
      for (const file of sourceFiles(root)) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        for (const statement of importStatements(stripped)) {
          if (/\buseSettings\b|\buseSettingsSchema\b/.test(statement)) {
            violations.push(`${rel}: raw settings query hook import`);
          }
          if (/\busePutSettings\b/.test(statement)) {
            violations.push(`${rel}: raw settings mutation hook import`);
          }
          if (
            /\b(?:resolveSettings|resolveEffective|resolveEffectiveSetting)\b/.test(
              statement,
            )
          ) {
            violations.push(`${rel}: raw settings resolution import`);
          }
          if (/\bCONSUMED_SETTING_KEYS\b/.test(statement)) {
            violations.push(`${rel}: raw consumed settings key import`);
          }
        }
        if (/\b(?:useSettings|useSettingsSchema|usePutSettings)\s*\(/.test(stripped)) {
          violations.push(`${rel}: raw settings hook access`);
        }
        if (
          /\b(?:resolveSettings|resolveEffective|resolveEffectiveSetting)\s*\(/.test(
            stripped,
          )
        ) {
          violations.push(`${rel}: raw settings resolution`);
        }
        if (/\bCONSUMED_SETTING_KEYS\b/.test(stripped)) {
          violations.push(`${rel}: raw consumed settings key access`);
        }
        if (
          /\bkey:\s*["'](?:theme|reduce_motion|default_granularity|confidence_floor|label_filter)["']/.test(
            stripped,
          )
        ) {
          violations.push(`${rel}: hardcoded consumed settings key`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps settings scope identity normalized before schema resolution", () => {
    const selectorsRel = "stores/server/settingsSelectors.ts";
    const selectors = stripComments(readFileSync(join(SRC_ROOT, selectorsRel), "utf8"));
    const scopeIdentityRel = "stores/server/scopeIdentity.ts";
    const scopeIdentity = stripComments(
      readFileSync(join(SRC_ROOT, scopeIdentityRel), "utf8"),
    );
    const queriesRel = "stores/server/queries.ts";
    const queries = stripComments(readFileSync(join(SRC_ROOT, queriesRel), "utf8"));
    const violations: string[] = [];

    if (
      !/export\s*\{[\s\S]*\bnormalizeScopeId\s+as\s+normalizeStoreScope\b[\s\S]*\}\s*from\s+["']\.\.\/\.\.\/platform\/scope\/scopeIdentity["']/.test(
        scopeIdentity,
      ) ||
      !/export\s*\{[\s\S]*\bSCOPE_ID_MAX_CHARS\b[\s\S]*\}\s*from\s+["']\.\.\/\.\.\/platform\/scope\/scopeIdentity["']/.test(
        scopeIdentity,
      ) ||
      !/\bfrom\s+["']\.\/scopeIdentity["'][\s\S]*\bnormalizeStoreScope\b/.test(
        selectors,
      ) ||
      !/\bexport\s+const\s+normalizeSettingsScope\s*=\s*normalizeStoreScope\b/.test(
        selectors,
      )
    ) {
      violations.push(`${selectorsRel}: missing runtime settings scope normalizer`);
    }
    if (
      !/\bexport\s+function\s+resolveEffective\s*\([\s\S]*activeScope:\s*unknown[\s\S]*const\s+normalizedScope\s*=\s*normalizeSettingsScope\s*\(\s*activeScope\s*\)[\s\S]*def\.scope_eligible\s*&&\s*normalizedScope\s*!==\s*null[\s\S]*settings\?\.scoped\?\.\[\s*normalizedScope\s*\]\?\.\[\s*def\.key\s*\]/.test(
        selectors,
      )
    ) {
      violations.push(
        `${selectorsRel}: effective settings resolution bypasses normalized scope`,
      );
    }
    if (
      /\bdef\.scope_eligible\s*&&\s*activeScope\b/.test(selectors) ||
      /\bsettings\?\.scoped\?\.\[\s*activeScope\s*\]/.test(selectors)
    ) {
      violations.push(`${selectorsRel}: raw activeScope used for scoped settings`);
    }
    if (
      !/\bexport\s+function\s+settingCanTargetScope\s*\([\s\S]*activeScope:\s*unknown[\s\S]*normalizeSettingsScope\s*\(\s*activeScope\s*\)\s*!==\s*null/.test(
        selectors,
      )
    ) {
      violations.push(
        `${selectorsRel}: settings scope targetability trusts typed scope`,
      );
    }
    for (const seam of [
      "deriveSettingsDialogView",
      "deriveSettingsEffectsView",
      "useSettingsDialogView",
      "useSettingsEffectsView",
    ]) {
      if (
        !new RegExp(
          `\\bexport\\s+function\\s+${seam}\\s*\\([\\s\\S]*activeScope:\\s*unknown`,
        ).test(queries)
      ) {
        violations.push(`${queriesRel}: ${seam} trusts typed active scope`);
      }
    }
    for (const seam of ["useSettingsDialogView", "useSettingsEffectsView"]) {
      if (
        !new RegExp(
          `\\bexport\\s+function\\s+${seam}\\s*\\([\\s\\S]*const\\s+normalizedScope\\s*=\\s*normalizeSettingsScope\\s*\\(\\s*activeScope\\s*\\)[\\s\\S]*settings\\.data,\\s*normalizedScope`,
        ).test(queries)
      ) {
        violations.push(`${queriesRel}: ${seam} bypasses settings scope normalizer`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps settings mutation payloads normalized at the server seam", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (
      !/\bexport\s+function\s+normalizeSettingUpdate\s*\(\s*update:\s*unknown\s*\):\s*SettingUpdate\s*\|\s*null/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing settings update normalizer`);
    }
    if (
      !/\bconst\s+key\s*=\s*record\.key\.trim\s*\(\s*\)[\s\S]*const\s+scope\s*=\s*normalizeSettingsScope\s*\(\s*record\.scope\s*\)\s*\?\?\s*undefined[\s\S]*return\s*\{\s*key,\s*value:\s*record\.value,\s*scope\s*\}/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: settings update identity is not normalized`);
    }
    const mutation =
      stripped.match(
        /export function usePutSettings[\s\S]*?export interface SaveBodyArgs/,
      )?.[0] ?? "";
    if (
      !/\bconst\s+normalized\s*=\s*normalizeSettingUpdate\s*\(\s*body\s*\)/.test(
        mutation,
      )
    ) {
      violations.push(`${rel}: settings mutation bypasses update normalizer`);
    }
    if (!/\bengineClient\.putSettings\s*\(\s*normalized\s*\)/.test(mutation)) {
      violations.push(`${rel}: settings mutation sends raw body`);
    }
    if (/\bmutationFn:\s*\(\s*body:\s*SettingUpdate\s*\)/.test(mutation)) {
      violations.push(`${rel}: settings mutation is typed-only`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps settings schema metadata normalized in the live adapter", () => {
    const rel = "stores/server/liveAdapters.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const seam of [
      "normalizeSchemaString",
      "normalizeOptionalSchemaString",
      "normalizeSchemaStringList",
      "normalizeSettingControlKind",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${seam} settings schema seam`);
      }
    }
    if (
      !/\bfunction\s+normalizeSchemaStringList\s*\(\s*value:\s*unknown\s*\)[\s\S]*\bconst\s+normalized\s*=\s*entry\.trim\s*\(\s*\)[\s\S]*\bseen\.has\s*\(\s*normalized\s*\)[\s\S]*\bout\.push\s*\(\s*normalized\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: settings schema list normalizer preserves raw spacing`);
    }
    if (
      !/\bfunction\s+adaptValueType\s*\(\s*value:\s*unknown\s*\)[\s\S]*\bmembers:\s*normalizeSchemaStringList\s*\(\s*value\.members\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: enum value type bypasses schema member normalizer`);
    }
    if (
      !/\bfunction\s+adaptSettingDef\s*\(\s*value:\s*unknown\s*\)[\s\S]*\bconst\s+key\s*=\s*normalizeOptionalSchemaString\s*\(\s*value\.key\s*\)[\s\S]*\bcontrol\s*=\s*normalizeSettingControlKind\s*\(\s*value\.control\s*\)[\s\S]*\bgroup:\s*normalizeSchemaString\s*\(\s*value\.group,\s*["']General["']\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(
        `${rel}: setting def adapter bypasses schema metadata normalizers`,
      );
    }
    if (
      !/\bfunction\s+adaptSettingsSchema\s*\(\s*body:\s*unknown\s*\)[\s\S]*\bconst\s+groups\s*=\s*normalizeSchemaStringList\s*\(\s*body\.groups\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: settings schema groups bypass normalizer`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps settings control decoding behind view control seams", () => {
    const violations: string[] = [];
    const enumRel = "app/settings/controls/EnumControl.tsx";
    const switchRel = "app/settings/controls/SwitchControl.tsx";
    const numberRel = "app/settings/controls/NumberControl.tsx";
    const textRel = "app/settings/controls/TextControl.tsx";
    const keybindingRel = "app/settings/controls/KeybindingControl.tsx";
    const viewRel = "stores/view/settingsControls.ts";

    for (const file of sourceFiles(join(SRC_ROOT, "app/settings/controls"))) {
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
      const stripped = stripComments(readFileSync(file, "utf8"));

      for (const statement of importStatements(stripped)) {
        if (/\b(?:decodeBool|decodeInt)\b/.test(statement)) {
          violations.push(`${rel}: app-layer settings wire decoder import`);
        }
        if (/stores\/server\/settingsSelectors/.test(statement.replaceAll("\\", "/"))) {
          violations.push(`${rel}: app-layer settings selector import`);
        }
      }
      if (/\b(?:decodeBool|decodeInt)\s*\(/.test(stripped)) {
        violations.push(`${rel}: local settings wire decode`);
      }
      if (/value_type\.type\s*===\s*["']integer["']/.test(stripped)) {
        violations.push(`${rel}: local integer control range projection`);
      }
      if (/value_type\.type\s*===\s*["']enum["']/.test(stripped)) {
        violations.push(`${rel}: local enum member projection`);
      }
      if (/value_type\.type\s*===\s*["']string["']/.test(stripped)) {
        violations.push(`${rel}: local string constraint projection`);
      }
    }

    const enumControl = stripComments(readFileSync(join(SRC_ROOT, enumRel), "utf8"));
    if (
      !/\bderiveSettingsEnumControlView\s*\(\s*def\s*,\s*value\s*\)/.test(enumControl)
    ) {
      violations.push(`${enumRel}: missing enum control view seam`);
    }
    if (
      !/\bsettingsEnumKeyboardTarget\s*\(\s*view\.options\s*,\s*index\s*,\s*e\.key\s*\)/.test(
        enumControl,
      )
    ) {
      violations.push(`${enumRel}: missing enum keyboard target seam`);
    }
    if (/\bconst\s+members\b|\bmembers\.map\b/.test(enumControl)) {
      violations.push(`${enumRel}: local enum member iteration`);
    }

    const switchControl = stripComments(
      readFileSync(join(SRC_ROOT, switchRel), "utf8"),
    );
    if (!/\bderiveSettingsSwitchControlView\s*\(\s*value\s*\)/.test(switchControl)) {
      violations.push(`${switchRel}: missing switch control view seam`);
    }
    if (/\bonChange\s*\(\s*on\s*\?/.test(switchControl)) {
      violations.push(`${switchRel}: local boolean next-value projection`);
    }

    const numberControl = stripComments(
      readFileSync(join(SRC_ROOT, numberRel), "utf8"),
    );
    if (
      !/\bderiveSettingsNumberControlView\s*\(\s*def\s*,\s*value\s*\)/.test(
        numberControl,
      )
    ) {
      violations.push(`${numberRel}: missing number control view seam`);
    }
    if (/def\.value_type\.type\s*===\s*["']integer["']/.test(numberControl)) {
      violations.push(`${numberRel}: local integer settings type projection`);
    }

    const textControl = stripComments(readFileSync(join(SRC_ROOT, textRel), "utf8"));
    if (!/\bderiveSettingsTextControlView\s*\(\s*def\s*\)/.test(textControl)) {
      violations.push(`${textRel}: missing text control view seam`);
    }
    if (/\bmaxLength\s*=\s*def\.value_type/.test(textControl)) {
      violations.push(`${textRel}: local text max-length projection`);
    }

    const keybindingControl = stripComments(
      readFileSync(join(SRC_ROOT, keybindingRel), "utf8"),
    );
    const settingsControlView = stripComments(
      readFileSync(join(SRC_ROOT, viewRel), "utf8"),
    );
    for (const seam of [
      "deriveSettingsKeybindingControlView",
      "useSettingsKeybindingRecorder",
      "toggleSettingsKeybindingRecording",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(keybindingControl)) {
        violations.push(`${keybindingRel}: missing ${seam} seam`);
      }
    }
    if (/\buseState\s*\(/.test(keybindingControl)) {
      violations.push(`${keybindingRel}: local keybinding recorder state`);
    }
    if (/\baddEventListener\s*\(\s*["']keydown["']/.test(keybindingControl)) {
      violations.push(`${keybindingRel}: local keybinding recorder listener`);
    }
    if (
      /\bKeyboardEvent\b|\bchordStringFromEvent\b|\bMODIFIER_KEYS\b/.test(
        keybindingControl,
      )
    ) {
      violations.push(`${keybindingRel}: local keybinding recorder key parsing`);
    }
    for (const seam of [
      "useSettingsKeybindingRecorderStore",
      "normalizeSettingsKeybindingId",
      "settingsKeybindingChordFromEvent",
      "useSettingsKeybindingRecorder",
      "normalizeKeybindingOverrides",
      "chordStringFromEvent",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(settingsControlView)) {
        violations.push(`${viewRel}: missing ${seam} keybinding recorder seam`);
      }
    }
    if (
      !/\bexport\s+function\s+settingsKeybindingChordFromEvent[\s\S]*\{\s*return\s+chordStringFromEvent\s*\(\s*event\s*\)\s*;\s*\}/.test(
        settingsControlView,
      )
    ) {
      violations.push(
        `${viewRel}: keybinding recorder event parsing bypasses chord primitive`,
      );
    }
    if (
      /\bSETTINGS_KEYBINDING_MODIFIER_KEYS\b|\bconst\s+tokens:\s*string\[\]/.test(
        settingsControlView,
      )
    ) {
      violations.push(`${viewRel}: keybinding recorder owns local chord parsing`);
    }
    if (
      !/from\s+["']\.\.\/\.\.\/platform\/keymap\/registry["'][\s\S]*\bnormalizeKeybindingId\b/.test(
        settingsControlView,
      ) ||
      !/\bexport\s+function\s+normalizeSettingsKeybindingId\s*\(\s*id:\s*unknown\s*\):\s*string\s*\|\s*null\s*\{\s*return\s+normalizeKeybindingId\s*\(\s*id\s*\)\s*;?\s*\}/.test(
        settingsControlView,
      )
    ) {
      violations.push(`${viewRel}: keybinding recorder id bypasses runtime normalizer`);
    }
    if (
      !/\bsetRecordingId:\s*\(id\)\s*=>\s*set\s*\(\s*\{\s*recordingId:\s*normalizeSettingsKeybindingId\s*\(\s*id\s*\)\s*\}/.test(
        settingsControlView,
      )
    ) {
      violations.push(`${viewRel}: keybinding recorder setter bypasses normalizer`);
    }
    if (
      !/\btoggleRecordingId:\s*\(id\)\s*=>[\s\S]*\bconst\s+normalizedId\s*=\s*normalizeSettingsKeybindingId\s*\(\s*id\s*\)[\s\S]*recordingId:\s*state\.recordingId\s*===\s*normalizedId\s*\?\s*null\s*:\s*normalizedId/.test(
        settingsControlView,
      )
    ) {
      violations.push(`${viewRel}: keybinding recorder toggle bypasses normalizer`);
    }
    for (const seam of [
      "nextKeybindingOverrides",
      "clearKeybindingOverride",
      "keybindingConflictIds",
    ]) {
      if (
        !new RegExp(
          `\\bexport\\s+function\\s+${seam}[\\s\\S]*normalizeSettingsKeybindingId\\s*\\(\\s*id\\s*\\)`,
        ).test(settingsControlView)
      ) {
        violations.push(`${viewRel}: ${seam} bypasses keybinding id normalizer`);
      }
    }
    if (
      !/\bnextKeybindingOverrides[\s\S]*\bnormalizeKeybindingOverrides\s*\(\s*current\s*\)/.test(
        settingsControlView,
      )
    ) {
      violations.push(`${viewRel}: nextKeybindingOverrides preserves raw override map`);
    }
    if (
      !/\bclearKeybindingOverride[\s\S]*\bconst\s+normalizedCurrent\s*=\s*normalizeKeybindingOverrides\s*\(\s*current\s*\)/.test(
        settingsControlView,
      )
    ) {
      violations.push(`${viewRel}: clearKeybindingOverride preserves raw override map`);
    }
    if (
      !/\bserializeKeybindingOverrides[\s\S]*JSON\.stringify\s*\(\s*normalizeKeybindingOverrides\s*\(\s*overrides\s*\)\s*\)/.test(
        settingsControlView,
      )
    ) {
      violations.push(
        `${viewRel}: keybinding override serialization bypasses normalizer`,
      );
    }
    if (
      !/\bkeybindingConflictIds[\s\S]*conflictsForCandidate\s*\([\s\S]*normalizeKeybindingOverrides\s*\(\s*current\s*\)/.test(
        settingsControlView,
      )
    ) {
      violations.push(
        `${viewRel}: keybinding conflict check preserves raw override map`,
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps settings control rendering behind the schema control registry", () => {
    const dialogRel = "app/settings/SettingsDialog.tsx";
    const registryRel = "app/settings/controls/registry.tsx";
    const dialog = stripComments(readFileSync(join(SRC_ROOT, dialogRel), "utf8"));
    const registry = stripComments(readFileSync(join(SRC_ROOT, registryRel), "utf8"));
    const violations: string[] = [];

    if (
      !/\bimport\s+\{\s*SettingControl\s*\}\s+from\s+["']\.\/controls\/registry["']/.test(
        dialog,
      )
    ) {
      violations.push(`${dialogRel}: missing settings control registry import`);
    }
    if (!/<SettingControl\b/.test(dialog)) {
      violations.push(`${dialogRel}: settings row bypasses SettingControl`);
    }
    if (/\bdef\.control\s*===|switch\s*\(\s*def\.control\s*\)/.test(dialog)) {
      violations.push(`${dialogRel}: local setting control-kind dispatch`);
    }
    if (/\b(?:EnumControl|SwitchControl|TextControl|NumberControl)\b/.test(dialog)) {
      violations.push(`${dialogRel}: direct setting control renderer reference`);
    }

    for (const [kind, renderer] of [
      ["segmented", "EnumControl"],
      ["switch", "SwitchControl"],
      ["text", "TextControl"],
      ["slider", "NumberControl"],
    ] as const) {
      if (!new RegExp(`${kind}\\s*:\\s*${renderer}\\b`).test(registry)) {
        violations.push(`${registryRel}: ${kind} is not mapped to ${renderer}`);
      }
    }
    if (
      !/\bCONTROL_RENDERERS\s*:\s*Record\s*<\s*SettingControlKind\s*,\s*ComponentType\s*<\s*ControlProps\s*>\s*>/.test(
        registry,
      )
    ) {
      violations.push(
        `${registryRel}: control renderer map is not keyed by SettingControlKind`,
      );
    }
    if (
      !/\bconst\s+Renderer\s*=\s*CONTROL_RENDERERS\s*\[\s*props\.def\.control\s*\]/.test(
        registry,
      )
    ) {
      violations.push(
        `${registryRel}: SettingControl does not dispatch on def.control`,
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps the theme bridge narrow over the schema-driven settings model", () => {
    const rel = "app/settings/themeSetting.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (
        /\buseSettings\b/.test(statement) ||
        /\buseSettingsSchema\b/.test(statement)
      ) {
        violations.push(`${rel}: raw settings query in theme bridge`);
      }
      if (/\bresolveEffectiveSetting\b/.test(statement)) {
        violations.push(`${rel}: local effective-setting resolution`);
      }
      if (/\busePutSettings\b/.test(statement)) {
        violations.push(`${rel}: app-layer settings mutation hook`);
      }
      if (/\bCONSUMED_SETTING_KEYS\b/.test(statement)) {
        violations.push(`${rel}: app-layer consumed theme setting key`);
      }
      if (
        /\buseTheme\b/.test(statement) &&
        !/platform\/theme\/useTheme/.test(statement)
      ) {
        violations.push(`${rel}: unexpected theme hook import`);
      }
    }
    if (!/\buseThemeSettingView\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing stores-owned theme setting view`);
    }
    if (
      !/\bconst\s*\{\s*loading\s*,\s*serverTheme\s*,\s*themeMembers\s*\}\s*=\s*useThemeSettingView\s*\(\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing stores-owned theme loading read`);
    }
    if (!/\buseThemeSettingIntent\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing stores-owned theme setting intent`);
    }
    if (/\bputSettings\.mutate\s*\(/.test(stripped)) {
      violations.push(`${rel}: app-layer theme setting write`);
    }
    if (/\bfunction\s+isThemePreference\s*\(/.test(stripped)) {
      violations.push(`${rel}: local platform theme preference validator`);
    }
    if (
      !/\bimport\s+\{[\s\S]*\bisThemePreference\b[\s\S]*\}\s+from\s+["']\.\.\/\.\.\/platform\/theme\/themeController["']/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing platform theme preference validator`);
    }
    if (!/\bschemaAllowsThemePreference\s*\([^)]*themeMembers[^)]*\)/.test(stripped)) {
      violations.push(`${rel}: theme writes not authorized by served schema members`);
    }
    if (!/\bthemeIntent\.writePending\b/.test(stripped)) {
      violations.push(`${rel}: missing in-flight guard against stale theme reconcile`);
    }
    if (!/if\s*\(\s*loading\s*\)\s*return/.test(stripped)) {
      violations.push(`${rel}: theme bridge is not loading-gated`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps app theme access behind the schema-backed theme bridge", () => {
    const violations: string[] = [];
    const bridgeRel = "app/settings/themeSetting.ts";

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
      if (rel === bridgeRel) continue;
      const stripped = stripComments(readFileSync(file, "utf8"));

      for (const statement of importStatements(stripped)) {
        if (/platform\/theme\/(?:useTheme|themeController)/.test(statement)) {
          violations.push(`${rel}: raw platform theme access`);
        }
        if (
          /\buseThemeSetting(?:View|Intent)?\b/.test(statement) &&
          !(
            rel === "app/AppShell.tsx" &&
            /\buseThemeSetting\b/.test(statement) &&
            !/\buseThemeSetting(?:View|Intent)\b/.test(statement)
          )
        ) {
          violations.push(`${rel}: raw theme setting seam outside bridge`);
        }
      }
      if (
        /\b(?:useTheme|getThemeController|readStoredPreference)\s*\(/.test(stripped)
      ) {
        violations.push(`${rel}: local theme state access`);
      }
      if (/\bdocument\.documentElement\.dataset\.theme\b/.test(stripped)) {
        violations.push(`${rel}: local data-theme mutation`);
      }
    }

    const appShell = stripComments(
      readFileSync(join(SRC_ROOT, "app/AppShell.tsx"), "utf8"),
    );
    if (!/\buseThemeSetting\s*\(\s*\)/.test(appShell)) {
      violations.push("app/AppShell.tsx: missing app-lifetime theme bridge mount");
    }

    expect(violations).toEqual([]);
  });

  it("keeps code-tree directory level state behind file-tree level selectors", () => {
    const rel = "app/left/CodeTree.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseFileTree\b/.test(statement)) {
        violations.push(`${rel}: raw file-tree directory query hook`);
      }
    }
    if (/\b(?:rootLevel|level)\.data\b/.test(stripped)) {
      violations.push(`${rel}: app-layer file-tree payload projection`);
    }
    if (/\blevel\.is(?:Pending|Loading|Error)\b/.test(stripped)) {
      violations.push(`${rel}: app-layer file-tree child query state branch`);
    }
    if (/\bfunction\s+basename\b|\bexport\s+function\s+basename\b/.test(stripped)) {
      violations.push(`${rel}: local file-tree basename helper`);
    }
    if (/\.replace\s*\(\s*\/\^?\.\*\\\//.test(stripped)) {
      violations.push(`${rel}: local file-tree path display parser`);
    }
    if (!/\buseFileTreeLevel\s*\(\s*scope\s*,\s*path\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing child file-tree level selector`);
    }
    if (
      !/\buseBrowserTreeExpansion\s*\([\s\S]*?\bscope\b[\s\S]*?["']code["'][\s\S]*?\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing scoped code browser-tree state seam`);
    }
    if (/\[\s*activeKey\s*,\s*setActiveKey\s*\]\s*=\s*useState/.test(stripped)) {
      violations.push(`${rel}: local code-tree roving active key`);
    }
    if (!/\bactiveKey\b/.test(stripped) || !/\bsetActiveKey\b/.test(stripped)) {
      violations.push(`${rel}: missing code browser-tree active-key seam`);
    }
    if (/\buseBrowserTreeExpansionStore\b/.test(stripped)) {
      violations.push(`${rel}: raw browser-tree store access`);
    }
    for (const localCopy of [
      "reading the worktree",
      "code tree unavailable",
      "try again",
      "this scope has no code tree",
      "no source files in this scope",
      "could not list this directory",
      "more here",
      "code browser",
    ]) {
      if (stripped.includes(localCopy)) {
        violations.push(`${rel}: local file-tree state copy "${localCopy}"`);
      }
    }
    if (/\btierAvailabilityReason\b/.test(stripped)) {
      violations.push(`${rel}: local file-tree degraded reason formatting`);
    }
    for (const field of [
      "rootSurface.loadingClassName",
      "rootSurface.errorRootClassName",
      "rootSurface.errorTitleClassName",
      "rootSurface.retryButtonClassName",
      "rootSurface.degradedClassName",
      "rootSurface.emptyClassName",
      "rootSurface.navClassName",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing root file-tree chrome ${field}`);
      }
    }
    if (!/\bfileTreeChildStatusStyle\s*\(\s*depth\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing store-owned child file-tree status indent`);
    }
    for (const localChrome of [
      "animate-pulse-live px-fg-1 py-fg-0-5 text-label text-ink-faint",
      "space-y-fg-1 px-fg-1 py-fg-0-5",
      "text-label text-state-broken",
      "rounded-fg-xs text-label text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
      "mx-fg-1 my-fg-1 rounded-fg-xs bg-accent-subtle/40 px-fg-1 py-fg-0-5 text-caption text-ink-muted",
      "px-fg-1 py-fg-0-5 text-label text-ink-faint",
      "animate-pulse-live px-fg-1 py-fg-0-5 text-caption text-ink-faint",
      "px-fg-1 py-fg-0-5 text-caption text-state-broken",
      "px-fg-1 py-fg-0-5 text-caption text-ink-faint",
    ]) {
      if (stripped.includes(localChrome)) {
        violations.push(`${rel}: local file-tree chrome ${localChrome}`);
      }
    }
    if (/\bpaddingLeft:\s*`\$\{0\.25\s*\+\s*depth\s*\*\s*0\.75\}rem`/.test(stripped)) {
      violations.push(`${rel}: local child file-tree indent projection`);
    }
    for (const field of [
      "loadingMessage",
      "errorTitle",
      "retryLabel",
      "emptyMessage",
      "childLoadingMessage",
      "childErrorMessage",
      "truncationMessage",
      "childLoadingClassName",
      "childErrorClassName",
      "truncationClassName",
    ]) {
      if (!new RegExp(`\\b(?:rootLevel|level)\\.${field}\\b`).test(stripped)) {
        violations.push(`${rel}: missing file-tree ${field}`);
      }
    }
    if (!/\bdegradedMessage\b/.test(stripped)) {
      violations.push(`${rel}: missing root file-tree degraded message`);
    }
    if (!/\bbrowserLabel\b/.test(stripped)) {
      violations.push(`${rel}: missing root file-tree browser label`);
    }
    if (!/\brootLevel\.rows\.map\b/.test(stripped)) {
      violations.push(`${rel}: missing root file-tree row projection`);
    }
    if (!/\blevel\.rows\.map\b/.test(stripped)) {
      violations.push(`${rel}: missing child file-tree row projection`);
    }
    if (!/\bderiveCodeBrowserTreeRowView\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing browser-tree code row projection`);
    }
    if (!/\bderiveBrowserTreeRovingKey\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing browser-tree roving-key projection`);
    }
    if (/\bexpansion\.expanded\.has\s*\(/.test(stripped)) {
      violations.push(`${rel}: local code-tree expanded-row projection`);
    }
    if (/\border\.includes\s*\(\s*activeKey\s*\)/.test(stripped)) {
      violations.push(`${rel}: local browser-tree roving-key projection`);
    }
    if (/\blinkedNodeIds\?\.has\s*\(/.test(stripped)) {
      violations.push(`${rel}: local code-tree linkage projection`);
    }
    if (/\bentry\.path\.toLowerCase\(\)\.includes\s*\(/.test(stripped)) {
      violations.push(`${rel}: local code-tree filter visibility projection`);
    }
    if (/\bnormalizedFilter\b|\.trim\(\)\.toLowerCase\(\)/.test(stripped)) {
      violations.push(`${rel}: local code-tree filter normalization`);
    }
    for (const field of [
      "rowView.visible",
      "rowView.navKey",
      "rowView.expanded",
      "rowView.linked",
      "rowView.highlighted",
      "rowView.rowClassName",
      "rowView.selectionCueClassName",
      "rowView.chevronClassName",
      "rowView.markClassName",
      "rowView.labelClassName",
      "rowView.linkedCueClassName",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing code-tree row projection ${field}`);
      }
    }
    if (!/\btabIndex=\{tabIndex\}/.test(stripped)) {
      violations.push(`${rel}: missing code-tree roving tab stop`);
    }
    if (!/\bsetActiveKey\s*\(\s*rowView\.navKey\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing code-tree active-key focus write`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps vault-tree entry normalization at the live adapter boundary", () => {
    const rel = "stores/server/liveAdapters.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const seam of [
      "normalizeVaultTreeString",
      "normalizeVaultTreeStringList",
      "adaptVaultTreeDates",
      "normalizeVaultTreeProgress",
      "adaptVaultTreeEntry",
      "adaptVaultTree",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${seam} vault-tree adapter seam`);
      }
    }
    if (
      !/\bfunction\s+adaptVaultTreeEntry[\s\S]*\bconst\s+path\s*=\s*normalizeVaultTreeString\s*\(\s*value\.path\s*\)[\s\S]*\bconst\s+stem\s*=\s*normalizeVaultTreeString\s*\(\s*value\.stem\s*\)[\s\S]*\bif\s*\(\s*stem\s*===\s*undefined\s*\)\s*return\s+null/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: vault-tree adapter fabricates malformed document rows`);
    }
    if (
      !/\bfeature_tags:\s*normalizeVaultTreeStringList\s*\(\s*value\.feature_tags\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: vault-tree feature tags bypass normalizer`);
    }
    if (!/\bdates:\s*adaptVaultTreeDates\s*\(\s*value\.dates\s*\)/.test(stripped)) {
      violations.push(`${rel}: vault-tree dates bypass adapter`);
    }
    if (
      !/\bfunction\s+normalizeVaultTreeProgress[\s\S]*Number\.isFinite\s*\(\s*value\.done\s*\)[\s\S]*Number\.isFinite\s*\(\s*value\.total\s*\)[\s\S]*done\s*<\s*0\s*\|\|\s*total\s*<=\s*0\s*\|\|\s*done\s*>\s*total/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: vault-tree progress bypasses finite bounded guard`);
    }
    if (
      !/body\.entries[\s\S]*\.map\s*\(\s*adaptVaultTreeEntry\s*\)[\s\S]*\.filter\s*\(\s*\(\s*entry\s*\):\s*entry\s+is\s+VaultTreeEntry\s*=>\s*entry\s*!==\s*null\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: vault-tree adapter does not drop malformed rows`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps vault tree disclosure and roving state behind the browser-tree seam", () => {
    const rel = "app/left/TreeBrowser.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (/\[\s*activeKey\s*,\s*setActiveKey\s*\]\s*=\s*useState/.test(stripped)) {
      violations.push(`${rel}: local vault tree roving active key`);
    }
    if (
      !/\buseBrowserTreeExpansion\s*\(\s*scope\s*,\s*["']vault["']\s*\)/.test(stripped)
    ) {
      violations.push(`${rel}: missing scoped browser-tree state seam`);
    }
    if (!/\bactiveKey\b/.test(stripped) || !/\bsetActiveKey\b/.test(stripped)) {
      violations.push(`${rel}: missing browser-tree active-key seam`);
    }
    if (/\buseBrowserTreeExpansionStore\b/.test(stripped)) {
      violations.push(`${rel}: raw browser-tree store access`);
    }
    if (/\bprojectFeatureGroups\b|\bfilterTreeEntries\b/.test(stripped)) {
      violations.push(`${rel}: app-owned vault-tree grouping/filter projection`);
    }
    if (
      /\bnew\s+Map\s*<\s*string\s*,\s*Map\s*<\s*string\s*,\s*VaultTreeEntry/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local vault-tree feature/doc-type grouping`);
    }
    if (/\bentry\.feature_tags\b|\bentry\.doc_type\b/.test(stripped)) {
      violations.push(`${rel}: local vault-tree feature/doc-type projection`);
    }
    if (!/\bderiveVaultTreeBrowserView\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing stores vault-tree browser projection`);
    }
    if (!/\bderiveBrowserTreeExpansionItem\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing browser-tree expansion row projection`);
    }
    if (!/\bderiveVaultBrowserTreeNavOrder\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing vault-tree nav-order projection`);
    }
    if (!/\bderiveBrowserTreeRovingKey\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing browser-tree roving-key projection`);
    }
    if (/\bexpanded\.has\s*\(/.test(stripped)) {
      violations.push(`${rel}: local vault-tree expanded-row projection`);
    }
    if (/\bconst\s+order\s*:\s*string\[\]\s*=\s*\[\]/.test(stripped)) {
      violations.push(`${rel}: local vault-tree nav-order projection`);
    }
    if (/\border\.includes\s*\(\s*activeKey\s*\)/.test(stripped)) {
      violations.push(`${rel}: local browser-tree roving-key projection`);
    }
    if (/\bisFresh\s*\(\s*fresh\s*\)\s*\?/.test(stripped)) {
      violations.push(`${rel}: local vault-tree freshness tone projection`);
    }
    if (!/\bfreshnessToneClass\s*\(\s*fresh\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing vault-tree freshness tone projection seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps browser-tree visual state keys collision-resistant", () => {
    const rel = "stores/view/browserTreeExpansion.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (!/\bencodeURIComponent\s*\(\s*normalizedScope\s*\)/.test(stripped)) {
      violations.push(`${rel}: scoped browser-tree key does not encode scope`);
    }
    if (
      !/\bnormalizedScope\s*===\s*null[\s\S]*\?\s*["']scope:null["']/.test(stripped)
    ) {
      violations.push(`${rel}: null scope lacks an explicit key sentinel`);
    }
    if (
      !/from\s+["']\.\/scopeIdentity["'][\s\S]*\bnormalizeViewStoreSessionString\b/.test(
        stripped,
      ) ||
      !/\bexport\s+const\s+normalizeBrowserTreeScope\s*=\s*normalizeViewStoreSessionString\b/.test(
        stripped,
      )
    ) {
      violations.push(
        `${rel}: browser-tree scope key bypasses shared view scope normalizer`,
      );
    }
    if (
      !/\bexport\s+function\s+normalizeBrowserTreeMode\b[\s\S]*mode\s*===\s*["']code["']\s*\?\s*["']code["']\s*:\s*["']vault["']/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: browser-tree mode key bypasses runtime normalizer`);
    }
    if (
      !/const\s+normalizedScope\s*=\s*normalizeBrowserTreeScope\s*\(\s*scope\s*\)[\s\S]*const\s+normalizedMode\s*=\s*normalizeBrowserTreeMode\s*\(\s*mode\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: browser-tree key factory bypasses normalized identity`);
    }
    if (
      !/scope:value:\$\{encodeURIComponent\s*\(\s*normalizedScope\s*\)\}/.test(stripped)
    ) {
      violations.push(`${rel}: real scopes lack a value-tagged key namespace`);
    }
    if (/\$\{scope\s*\?\?\s*["']none["']\}::\$\{mode\}/.test(stripped)) {
      violations.push(`${rel}: browser-tree key can collide with literal none scope`);
    }
    for (const seam of [
      "normalizeBrowserTreeExpansionKey",
      "normalizeBrowserTreeItemKey",
      "normalizeBrowserTreeActiveKey",
    ]) {
      if (!new RegExp(`\\bexport\\s+function\\s+${seam}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${seam} seam`);
      }
    }
    for (const normalizer of [
      "normalizeBrowserTreeExpansionKey",
      "normalizeBrowserTreeItemKey",
    ]) {
      if (
        !new RegExp(`\\b${normalizer}\\b[\\s\\S]*\\bvalue\\.trim\\s*\\(\\s*\\)`).test(
          stripped,
        )
      ) {
        violations.push(`${rel}: ${normalizer} preserves whitespace-only keys`);
      }
    }
    if (
      !/\bBROWSER_TREE_KEY_MAX_CHARS\b/.test(stripped) ||
      !/\bBROWSER_TREE_ITEM_KEY_MAX_CHARS\b/.test(stripped)
    ) {
      violations.push(`${rel}: browser-tree key caps are not explicit`);
    }
    if (
      !/\bnormalizeBrowserTreeExpansionKey\s*\(\s*value:\s*unknown\s*\)[\s\S]*\bconst\s+key\s*=\s*value\.trim\s*\(\s*\)[\s\S]*key\.length\s*<=\s*BROWSER_TREE_KEY_MAX_CHARS/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: browser-tree expansion key is not bounded`);
    }
    if (
      !/\bnormalizeBrowserTreeItemKey\s*\(\s*value:\s*unknown\s*\)[\s\S]*\bconst\s+key\s*=\s*value\.trim\s*\(\s*\)[\s\S]*key\.length\s*<=\s*BROWSER_TREE_ITEM_KEY_MAX_CHARS/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: browser-tree item key is not bounded`);
    }
    if (
      !/\bbrowserTreeExpansionKey\s*\(\s*scope:\s*unknown,\s*mode:\s*unknown\s*\)[\s\S]*\bkey\.length\s*<=\s*BROWSER_TREE_KEY_MAX_CHARS/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: browser-tree derived key is not bounded`);
    }
    for (const typedOnly of [
      "setKey: (key: string)",
      "toggle: (key: string, id: string)",
      "setActiveKey: (key: string, id: string | null)",
      "toggle: (id: string) => void",
      "setActiveKey: (id: string | null) => void",
    ]) {
      if (stripped.includes(typedOnly)) {
        violations.push(`${rel}: typed-only browser-tree expansion seam ${typedOnly}`);
      }
    }
    for (const required of [
      "normalizeBrowserTreeExpansionKey(key)",
      "normalizeBrowserTreeItemKey(id)",
      "normalizeBrowserTreeActiveKey(activeKey)",
    ]) {
      if (!stripped.includes(required)) {
        violations.push(`${rel}: browser-tree update bypasses ${required}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps graph-default freshness interpretation behind the stores layer", () => {
    const source = readFileSync(SETTINGS_EFFECTS, "utf8");
    const stripped = stripComments(source);
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardState\b/.test(statement)) {
        violations.push(
          "app/settings/settingsEffects.ts: raw dashboard-state freshness subscription",
        );
      }
      if (/\bisFreshDashboardGraphDefaultsState\b/.test(statement)) {
        violations.push(
          "app/settings/settingsEffects.ts: direct graph-default freshness predicate",
        );
      }
    }
    if (
      !/\buseDashboardGraphDefaultsInitializationView\s*\(\s*scope\s*\)/.test(stripped)
    ) {
      violations.push(
        "app/settings/settingsEffects.ts: missing stores freshness selector",
      );
    }
    if (!/\bgraphDefaultsInitialization\.identity\b/.test(stripped)) {
      violations.push(
        "app/settings/settingsEffects.ts: missing stores initialization identity",
      );
    }
    if (/\buseRef\b/.test(stripped)) {
      violations.push(
        "app/settings/settingsEffects.ts: app-layer graph-default guard state",
      );
    }
    if (
      /\binitializedGraphDefaults\.current\.has\s*\(\s*scope\s*\)/.test(stripped) ||
      /\bpendingGraphDefaults\.current\.has\s*\(\s*scope\s*\)/.test(stripped)
    ) {
      violations.push(
        "app/settings/settingsEffects.ts: graph-default guard is scope-only",
      );
    }
    if (/\bdashboardState\.data\b/.test(stripped)) {
      violations.push("app/settings/settingsEffects.ts: raw dashboard freshness read");
    }
    if (
      /\bgraph_granularity\s*===\s*["']feature["']/.test(stripped) ||
      /Object\.keys\([^)]*filters[^)]*\)\.length\s*===\s*0/.test(stripped)
    ) {
      violations.push("app/settings/settingsEffects.ts: local graph-default freshness");
    }

    expect(violations).toEqual([]);
  });

  it("keeps app-consumed settings interpretation behind stores selectors", () => {
    const source = readFileSync(SETTINGS_EFFECTS, "utf8");
    const stripped = stripComments(source);
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (
        /\buseSettings\b|\buseSettingsSchema\b|\bresolveReduceMotionSetting\b|\bresolveGraphSettingsDefaults\b/.test(
          statement,
        )
      ) {
        violations.push(
          "app/settings/settingsEffects.ts: raw settings query/resolution import",
        );
      }
    }
    if (/\bCONSUMED_SETTING_KEYS\.reduceMotion\b/.test(stripped)) {
      violations.push(
        "app/settings/settingsEffects.ts: local reduce-motion key lookup",
      );
    }
    if (/\bdecodeBool\s*\(/.test(stripped)) {
      violations.push("app/settings/settingsEffects.ts: local reduce-motion decode");
    }
    if (/\buseSettingsEffects\s*\(\s*scope:\s*string\s*\|\s*null/.test(stripped)) {
      violations.push(
        "app/settings/settingsEffects.ts: settings effects bridge trusts typed-only scope",
      );
    }
    if (!/\buseSettingsEffects\s*\(\s*scope:\s*unknown\s*=\s*null/.test(stripped)) {
      violations.push(
        "app/settings/settingsEffects.ts: settings effects bridge lacks runtime scope seam",
      );
    }
    if (!/\buseSettingsEffectsView\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push("app/settings/settingsEffects.ts: missing settings-effects view");
    }
    if (
      !/\bconst\s*\{\s*loading\s*,\s*reduceMotion\s*,\s*graphDefaults\s*\}\s*=\s*useSettingsEffectsView\s*\(\s*scope\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(
        "app/settings/settingsEffects.ts: missing combined settings loading read",
      );
    }
    if (!/if\s*\(\s*loading\s*\)\s*return/.test(stripped)) {
      violations.push(
        "app/settings/settingsEffects.ts: settings effects are not loading-gated",
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps timeline control date-range display behind the stores date view", () => {
    const rel = "app/timeline/TimelineControls.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardState\b/.test(statement)) {
        violations.push(`${rel}: raw dashboard-state date-range subscription`);
      }
    }
    if (
      /\b(?:const|let)\s+dashboardState\b|\bdashboardState\.data\b/.test(stripped) ||
      /\bdate_range\b/.test(stripped)
    ) {
      violations.push(`${rel}: local dashboard date-range display composition`);
    }
    if (/\bDate\.parse\s*\(/.test(stripped)) {
      violations.push(`${rel}: local timeline date parse`);
    }
    if (
      /\bnew\s+Date\s*\([^)]*\)\.toISOString\s*\(\)\.slice\s*\(\s*0\s*,\s*10\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local timeline date input formatting`);
    }
    if (
      /\bfunction\s+(?:parseDateInput|dateInputValue|formatDayMonth)\b/.test(stripped)
    ) {
      violations.push(`${rel}: local timeline date helper`);
    }
    for (const helper of [
      "parseTimelineInstant",
      "orderedTimelineDateInputRange",
      "timelineDateInputValue",
      "formatTimelineDayMonth",
    ]) {
      if (!new RegExp(`\\b${helper}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${helper} seam`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps timeline date-picker chrome behind the timeline seam", () => {
    const rel = "app/timeline/TimelineControls.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const match of stripped.matchAll(
      /const\s+\[\s*(pickerOpen|draftFrom|draftTo)\s*,\s*set[A-Z]\w*\s*\]\s*=\s*useState/g,
    )) {
      violations.push(`${rel}: local timeline date-picker state ${match[1]}`);
    }
    if (/\buseState\s*\(/.test(stripped)) {
      violations.push(`${rel}: local timeline controls state`);
    }
    for (const helper of [
      "useTimelineDatePickerState",
      "openTimelineDatePicker",
      "closeTimelineDatePicker",
      "setTimelineDatePickerDraftFrom",
      "setTimelineDatePickerDraftTo",
    ]) {
      if (!new RegExp(`\\b${helper}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${helper} seam`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps timeline navigation writes behind the timeline intent seam", () => {
    const rel = "app/timeline/TimelineControls.tsx";
    const surfaceRel = "app/timeline/Timeline.tsx";
    const stageRel = "app/stage/StageNavBar.tsx";
    const menuRel = "app/timeline/menus/eventMarkMenu.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const timelineSurface = stripComments(
      readFileSync(join(SRC_ROOT, surfaceRel), "utf8"),
    );
    const stageNav = stripComments(readFileSync(join(SRC_ROOT, stageRel), "utf8"));
    const eventMenu = stripComments(readFileSync(join(SRC_ROOT, menuRel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (
        /\bzoomAt\b|\btimeToStripX\b|\bclampPxPerMs\b|\bfitTimelineSpan\b|\bsetTimelineViewport\b/.test(
          statement,
        )
      ) {
        violations.push(`${rel}: app-layer timeline viewport math import`);
      }
      if (/\bMAX_PX_PER_MS\b|\bMIN_PX_PER_MS\b/.test(statement)) {
        violations.push(`${rel}: app-layer timeline zoom-bound import`);
      }
    }
    for (const statement of importStatements(stageNav)) {
      if (
        /\btimelineZoomViewport\b|\bfitTimelineSpan\b|\btimelineJumpToEndOffset\b|\bparseTimelineInstant\b|\bsetTimelineViewport\b|\bsetTimelineScrollOffset\b/.test(
          statement,
        )
      ) {
        violations.push(`${stageRel}: timeline navigation write bypasses intent seam`);
      }
    }
    for (const statement of importStatements(timelineSurface)) {
      if (
        /\bzoomAt\b|\bpanScrollOffset\b|\btimeToStripX\b|\bclampPxPerMs\b|\bfitTimelineSpan\b|\bfitTimelineViewportForScope\b|\bsetTimelineViewport\b|\bsetTimelineScrollOffset\b/.test(
          statement,
        )
      ) {
        violations.push(`${surfaceRel}: timeline viewport write bypasses intent seam`);
      }
    }
    for (const statement of importStatements(eventMenu)) {
      if (
        /\btimelineZoomViewport\b|\bfitTimelineSpan\b|\btimelineJumpToEndOffset\b|\bparseTimelineInstant\b|\bsetTimelineViewport\b|\btimelineViewSnapshot\b|\bclampPxPerMs\b|\bliveEdgeOffset\b|\btimeToStripX\b/.test(
          statement,
        )
      ) {
        violations.push(`${menuRel}: event zoom bypasses timeline intent seam`);
      }
    }
    for (const helper of [
      "zoomTimelineNavigation",
      "fitTimelineNavigationToCorpus",
      "jumpTimelineNavigationToLive",
      "timelineCanZoomIn",
      "timelineCanZoomOut",
      "TIMELINE_ZOOM_STEP",
    ]) {
      if (!new RegExp(`\\b${helper}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${helper} seam`);
      }
      if (!new RegExp(`\\b${helper}\\b`).test(stageNav)) {
        violations.push(`${stageRel}: missing ${helper} seam`);
      }
    }
    if (!/\bfitTimelineNavigationToDateRange\b/.test(stripped)) {
      violations.push(`${rel}: missing fitTimelineNavigationToDateRange seam`);
    }
    if (!/\bzoomTimelineNavigationToInstant\b/.test(eventMenu)) {
      violations.push(`${menuRel}: missing event zoom timeline intent seam`);
    }
    for (const helper of [
      "zoomTimelineNavigationAt",
      "panTimelineNavigation",
      "jumpTimelineNavigationToCorpusEdge",
      "fitTimelineScopeToCorpus",
    ]) {
      if (!new RegExp(`\\b${helper}\\b`).test(timelineSurface)) {
        violations.push(`${surfaceRel}: missing ${helper} seam`);
      }
    }
    if (/\bexport\s+const\s+ZOOM_STEP\b/.test(stripped)) {
      violations.push(`${rel}: local timeline zoom-step projection`);
    }
    if (
      /\bconst\s+(?:zoomBy|fitAll|jumpToNow)\s*=/.test(stripped) ||
      /\bfunction\s+(?:zoomBy|fitAll|jumpToNow|fitSpan|jumpToDateOffset)\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local timeline navigation helper`);
    }
    if (
      /\bconst\s+(?:zoomBy|fitAll|jumpToNow)\s*=/.test(stageNav) ||
      /\bfunction\s+(?:zoomBy|fitAll|jumpToNow)\b/.test(stageNav)
    ) {
      violations.push(`${stageRel}: local timeline navigation helper`);
    }
    if (/\bpxPerMs\s*[<>]\s*(?:MAX_PX_PER_MS|MIN_PX_PER_MS)\b/.test(stripped)) {
      violations.push(`${rel}: local timeline zoom-bound check`);
    }
    if (
      /\btimeToStripX\s*\(/.test(stripped) ||
      /\bzoomAt\s*\(/.test(stripped) ||
      /\bfitTimelineSpan\s*\(/.test(stripped) ||
      /\bsetTimelineViewport\s*\(/.test(stripped)
    ) {
      violations.push(`${rel}: local timeline strip viewport projection`);
    }
    if (
      /\b(?:zoomAt|panScrollOffset|timeToStripX|clampPxPerMs|fitTimelineSpan|fitTimelineViewportForScope|setTimelineViewport|setTimelineScrollOffset)\s*\(/.test(
        timelineSurface,
      )
    ) {
      violations.push(`${surfaceRel}: local timeline viewport write projection`);
    }
    if (
      /\bviewportZoomToInstant\b|\bsetTimelineViewport\s*\(|\btimelineViewSnapshot\s*\(|\bclampPxPerMs\s*\(|\bliveEdgeOffset\s*\(|\btimeToStripX\s*\(/.test(
        eventMenu,
      )
    ) {
      violations.push(`${menuRel}: local event timeline zoom projection`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps timeline visual viewport overrides out of product date-range intent", () => {
    const violations: string[] = [];

    for (const surface of PRODUCTION_SURFACES) {
      for (const file of sourceFiles(join(SRC_ROOT, surface))) {
        const stripped = stripComments(readFileSync(file, "utf8"));
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        if (rel !== "app/timeline/TimelineControls.tsx") {
          if (/\bpreferViewportDateRange\b/.test(stripped)) {
            violations.push(`${rel}: visual-only viewport label override in product`);
          }
        }
        if (
          /\b(?:applyTimelineViewportOverrideFromUrl|hasTimelineViewportOverrideParams)\b/.test(
            stripped,
          )
        ) {
          violations.push(`${rel}: visual viewport override helper in product`);
        }
        if (/\b(?:timelineFrom|timelineTo)\b/.test(stripped)) {
          violations.push(`${rel}: visual viewport query param in product`);
        }
      }
    }

    for (const file of sourceFiles(join(SRC_ROOT, "timeline-visual"))) {
      const stripped = stripComments(readFileSync(file, "utf8"));
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (
        /\b(?:patchDashboardState|useDashboardStateMutations|setDateRange|dateRangePatch|date_range)\b/.test(
          stripped,
        )
      ) {
        violations.push(`${rel}: visual harness mutates dashboard date-range intent`);
      }
    }

    const harness = stripComments(
      readFileSync(join(SRC_ROOT, "timeline-visual/main.tsx"), "utf8"),
    );
    if (!/\bpreferViewportDateRange=\{preferViewportDateRange\}/.test(harness)) {
      violations.push(
        "timeline-visual/main.tsx: missing explicit viewport label override binding",
      );
    }
    if (
      !/\bapplyTimelineViewportOverrideFromUrl\s*\(\s*window\.location\.search\s*,\s*scope\s*,\s*window\.innerWidth\s*,?\s*\)/.test(
        harness,
      )
    ) {
      violations.push(
        "timeline-visual/main.tsx: missing scoped timeline viewport override seam",
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps visual harness state outside the production dashboard contract", () => {
    const violations: string[] = [];
    const config = stripComments(readFileSync(VITE_CONFIG, "utf8"));

    if (
      !/command\s*===\s*["']build["']\s*\?\s*\{[\s\S]*index:\s*resolve\(\s*import\.meta\.dirname\s*,\s*["']index\.html["']\s*\)/.test(
        config,
      )
    ) {
      violations.push("vite.config.ts: production build input is not index-only");
    }

    for (const root of VISUAL_HARNESS_ROOTS) {
      for (const file of sourceFiles(join(SRC_ROOT, root))) {
        const stripped = stripComments(readFileSync(file, "utf8"));
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        for (const statement of importStatements(stripped)) {
          if (
            /\bstores\/server\/dashboardState\b/.test(statement.replaceAll("\\", "/"))
          ) {
            violations.push(`${rel}: visual harness imports dashboard-state mutations`);
          }
        }
        if (
          /\b(?:patchDashboardState|useDashboardStateMutations|selectionPatch|dateRangePatch|graphBoundsPatch|dashboardGraphDefaultsPatch)\b/.test(
            stripped,
          )
        ) {
          violations.push(`${rel}: visual harness mutates canonical dashboard state`);
        }
        if (/\bengineClient\b|\bfetch\s*\(/.test(stripped)) {
          violations.push(`${rel}: visual harness owns transport`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps timeline lineage query state behind the lineage view selector", () => {
    const rel = "app/timeline/Timeline.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseTimelineLineage\b/.test(statement)) {
        violations.push(`${rel}: raw timeline lineage query hook`);
      }
    }
    if (/\blineage\.is(?:Loading|Pending|Error)\b/.test(stripped)) {
      violations.push(`${rel}: app-layer lineage query state branch`);
    }
    if (/\blineage\.data\b/.test(stripped)) {
      violations.push(`${rel}: app-layer lineage payload projection`);
    }
    if (!/\buseTimelineLineageView\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing timeline lineage view selector`);
    }
    if (!/\bderiveTimelineSurfaceChromeView\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing timeline surface chrome projection`);
    }
    if (!/\btimelineChrome\./.test(stripped)) {
      violations.push(`${rel}: missing centralized timeline chrome consumption`);
    }
    if (/\bnoHistory\b/.test(stripped)) {
      violations.push(`${rel}: local no-history branch outside timeline chrome view`);
    }
    for (const localCopy of [
      "reading the timeline",
      "lineage appears as documents gain dates",
      "no lineage in this range yet",
      "reconnecting — showing the last lineage",
      "couldn’t load the timeline",
    ]) {
      if (stripped.includes(localCopy)) {
        violations.push(`${rel}: local timeline status copy "${localCopy}"`);
      }
    }
    for (const localChrome of [
      "pointer-events-none absolute left-fg-2 top-1/2 flex -translate-y-1/2 items-center gap-fg-1 text-caption text-ink-faint",
      "h-1.5 w-1.5 animate-pulse-live rounded-full bg-state-live",
      "pointer-events-none absolute inset-0 flex items-center justify-center text-caption text-ink-faint",
      "pointer-events-none absolute top-fg-1 right-fg-2 flex items-center gap-fg-1 rounded-fg-pill bg-paper-raised/95 px-fg-1-5 py-fg-0-5 text-caption text-state-stale shadow-fg-raised",
      "h-1.5 w-1.5 animate-pulse-live rounded-full bg-state-stale",
      "absolute left-fg-2 top-1/2 flex -translate-y-1/2 items-center gap-fg-2 text-caption text-ink-muted",
      "rounded-fg-xs bg-paper-sunken px-fg-1-5 py-fg-0-5 text-ink transition-colors duration-ui-fast ease-settle hover:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
    ]) {
      if (stripped.includes(localChrome)) {
        violations.push(`${rel}: local timeline status chrome "${localChrome}"`);
      }
    }
    for (const field of [
      "showLoading",
      "loadingClassName",
      "loadingDotClassName",
      "loadingLabel",
      "showEmpty",
      "emptyClassName",
      "emptyLabel",
      "showDegraded",
      "degradedClassName",
      "degradedDotClassName",
      "degradedLabel",
      "showError",
      "errorClassName",
      "errorLabel",
      "retryButtonClassName",
      "retryLabel",
    ]) {
      if (!new RegExp(`\\btimelineChrome\\.${field}\\b`).test(stripped)) {
        violations.push(`${rel}: missing timelineChrome.${field} projection`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps timeline range selector reads behind the stores range view", () => {
    const rel = "app/timeline/RangeSelect.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardState\b/.test(statement)) {
        violations.push(`${rel}: raw dashboard-state range subscription`);
      }
    }
    if (/\bdashboardState\.data\b|\bdate_range\b/.test(stripped)) {
      violations.push(`${rel}: local dashboard date-range read`);
    }
    if (!/\buseDashboardRangeSelectView\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing dashboard range-select view seam`);
    }
    if (/\[\s*drag\s*,\s*setDrag\s*\]\s*=\s*useState/.test(stripped)) {
      violations.push(`${rel}: local timeline range drag state`);
    }
    for (const helper of [
      "useTimelineRangeDragState",
      "clearTimelineRangeDrag",
      "startTimelineRangeDragPointerSession",
    ]) {
      if (!new RegExp(`\\b${helper}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${helper} seam`);
      }
    }
    for (const localOwner of [
      "startTimelineRangeDrag",
      "updateTimelineRangeDrag",
      "timelineViewSnapshot",
    ]) {
      if (new RegExp(`\\b${localOwner}\\b`).test(stripped)) {
        violations.push(`${rel}: app-layer ${localOwner} ownership`);
      }
    }
    if (/\b(?:host|globalThis)\.addEventListener\s*\(\s*["']pointer/.test(stripped)) {
      violations.push(`${rel}: local timeline range pointer listener`);
    }
    if (
      /\b(?:host|globalThis)\.removeEventListener\s*\(\s*["']pointer/.test(stripped)
    ) {
      violations.push(`${rel}: local timeline range pointer cleanup`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps timeline minimap scrubber state behind the timeline seam", () => {
    const rel = "app/timeline/Minimap.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (/\bconst\s+dragRef\s*=/.test(stripped)) {
      violations.push(`${rel}: local minimap scrubber drag ref`);
    }
    if (/\bdragRef\.current\b/.test(stripped)) {
      violations.push(`${rel}: local minimap scrubber drag state`);
    }
    for (const helper of [
      "setTimelineMinimapDrag",
      "clearTimelineMinimapDrag",
      "timelineMinimapDragSnapshot",
      "timelineMinimapKeyboardOffset",
      "timelineMinimapViewportForWindow",
      "timelineViewportForTimeRange",
    ]) {
      if (!new RegExp(`\\b${helper}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${helper} seam`);
      }
    }
    if (/\bviewportWidth\s*\*\s*0\.1\b/.test(stripped)) {
      violations.push(`${rel}: local minimap keyboard nudge projection`);
    }
    if (/\bviewportForTimeRange\s*\(/.test(stripped)) {
      violations.push(`${rel}: local minimap viewport range projection`);
    }
    if (/\bviewportWidth\s*\/\s*MAX_PX_PER_MS\b/.test(stripped)) {
      violations.push(`${rel}: local minimap minimum span projection`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps app date-range writes behind the date-range intent seam", () => {
    const violations: string[] = [];
    const enrolled = new Set([
      "app/stage/FilterSidebar.tsx",
      "app/timeline/RangeSelect.tsx",
      "app/timeline/TimelineControls.tsx",
    ]);

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const stripped = stripComments(readFileSync(file, "utf8"));
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\.setDateRange\s*\(/.test(stripped)) {
        violations.push(`${rel}: raw dashboard date-range write`);
      }
      if (/\bdateRangePatch\s*\(|\bdate_range\s*:/.test(stripped)) {
        violations.push(`${rel}: local dashboard date-range patch`);
      }
      if (
        /\bpatchDashboardState\s*\([^)]*\{[^}]*date_range\b/.test(stripped) ||
        /\bpatchDashboardState\s*\([^)]*dateRangePatch\s*\(/.test(stripped)
      ) {
        violations.push(`${rel}: ad hoc dashboard date-range dispatch`);
      }
    }

    for (const rel of enrolled) {
      const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
      if (!/\buseDateRangeIntent\s*\(\s*scope\s*\)/.test(stripped)) {
        violations.push(`${rel}: missing date-range intent seam`);
      }
    }

    const seam = stripComments(
      readFileSync(join(SRC_ROOT, "stores/server/dateRangeIntent.ts"), "utf8"),
    );
    if (!/\buseDashboardStateMutations\s*\(\s*normalizedScope\s*\)/.test(seam)) {
      violations.push(
        "stores/server/dateRangeIntent.ts: missing dashboard mutation bridge",
      );
    }
    if (!/\bnormalizeDashboardDateRange\b/.test(seam)) {
      violations.push("stores/server/dateRangeIntent.ts: missing date normalizer");
    }
    if (
      /\buseDateRangeIntent\s*\(\s*scope:\s*string\s*\|\s*null/.test(seam) ||
      /\bsetRange:\s*\(range:\s*DashboardDateRange\)/.test(seam) ||
      /import\s+type\s+\{\s*DashboardDateRange\s*\}/.test(seam)
    ) {
      violations.push("stores/server/dateRangeIntent.ts: typed-only setRange seam");
    }
    if (
      !/\bimport\s*\{[\s\S]*\bnormalizeDashboardStateWriteScope\b[\s\S]*\}\s*from\s+["']\.\/dashboardState["']/.test(
        seam,
      ) ||
      !/\bexport\s+const\s+normalizeDateRangeIntentScope\s*=\s*normalizeDashboardStateWriteScope\b/.test(
        seam,
      ) ||
      !/\bconst\s+normalizedScope\s*=\s*normalizeDateRangeIntentScope\s*\(\s*scope\s*\)/.test(
        seam,
      )
    ) {
      violations.push("stores/server/dateRangeIntent.ts: missing scope normalizer");
    }
    if (
      !/\bsetRange:\s*\([^)]*range[^)]*\)\s*=>[\s\S]*normalizedScope\s*===\s*null[\s\S]*mutations\.setDateRange\s*\(\s*normalizeDashboardDateRange\s*\(\s*range\s*\)/.test(
        seam,
      )
    ) {
      violations.push(
        "stores/server/dateRangeIntent.ts: missing normalized setRange dispatch",
      );
    }
    if (
      !/\bclearRange:\s*\(\)\s*=>[\s\S]*normalizedScope\s*===\s*null[\s\S]*mutations\.setDateRange\s*\(\s*\{\s*\}\s*\)/.test(
        seam,
      )
    ) {
      violations.push("stores/server/dateRangeIntent.ts: missing clearRange dispatch");
    }

    expect(violations).toEqual([]);
  });

  it("keeps dashboard date ranges normalized at read and write seams", () => {
    const dashboardRel = "stores/server/dashboardState.ts";
    const dateRel = "stores/server/dashboardDateRange.ts";
    const queriesRel = "stores/server/queries.ts";
    const filtersRel = "stores/view/filters.ts";
    const dashboard = stripComments(readFileSync(join(SRC_ROOT, dashboardRel), "utf8"));
    const date = stripComments(readFileSync(join(SRC_ROOT, dateRel), "utf8"));
    const queries = stripComments(readFileSync(join(SRC_ROOT, queriesRel), "utf8"));
    const filters = stripComments(readFileSync(join(SRC_ROOT, filtersRel), "utf8"));
    const violations: string[] = [];

    if (!/\bexport\s+function\s+normalizeDashboardDateRange\b/.test(date)) {
      violations.push(`${dateRel}: missing dashboard date-range normalizer`);
    }
    if (
      !/\bdateRangePatch\b[\s\S]*\bnormalizeDashboardDateRange\s*\(/.test(dashboard)
    ) {
      violations.push(`${dashboardRel}: date-range patch bypasses normalizer`);
    }
    if (!/\bfiltersAndDateRangePatch\b[\s\S]*\bcloneDateRange\s*\(/.test(dashboard)) {
      violations.push(`${dashboardRel}: compound date-range patch bypasses clone seam`);
    }
    if (
      !/\bdashboardDocumentStateSeed\b[\s\S]*\bnormalizeDashboardDateRange\s*\(/.test(
        dashboard,
      )
    ) {
      violations.push(`${dashboardRel}: dashboard seed bypasses date-range normalizer`);
    }
    for (const seam of [
      "deriveDashboardDateRangeView",
      "deriveDashboardRangeSelectView",
      "dashboardDateRangeLabel",
      "deriveDashboardLayoutSelectorView",
    ]) {
      if (
        !new RegExp(`\\b${seam}\\b[\\s\\S]*\\bnormalizeDashboardDateRange\\s*\\(`).test(
          queries,
        )
      ) {
        violations.push(`${queriesRel}: ${seam} bypasses date-range normalizer`);
      }
    }
    if (
      !/\bdateRangeOrEmpty\b[\s\S]*\bnormalizeDashboardDateRange\s*\(/.test(filters)
    ) {
      violations.push(`${filtersRel}: filter choices bypass date-range normalizer`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps dashboard date intent top-level until graph-query projection", () => {
    const dashboardRel = "stores/server/dashboardState.ts";
    const adapterRel = "stores/server/liveAdapters.ts";
    const filtersRel = "stores/view/filters.ts";
    const dashboard = stripComments(readFileSync(join(SRC_ROOT, dashboardRel), "utf8"));
    const adapter = stripComments(readFileSync(join(SRC_ROOT, adapterRel), "utf8"));
    const filters = stripComments(readFileSync(join(SRC_ROOT, filtersRel), "utf8"));
    const filtersPatchStart = dashboard.indexOf("export function filtersPatch");
    const dateRangePatchStart = dashboard.indexOf("export function dateRangePatch");
    const filtersPatchBody =
      filtersPatchStart >= 0 && dateRangePatchStart > filtersPatchStart
        ? dashboard.slice(filtersPatchStart, dateRangePatchStart)
        : "";
    const choicesStart = filters.indexOf("export function dashboardFiltersFromChoices");
    const graphFilterStart = filters.indexOf("export function toGraphFilter");
    const choicesBody =
      choicesStart >= 0 && graphFilterStart > choicesStart
        ? filters.slice(choicesStart, graphFilterStart)
        : "";
    const violations: string[] = [];

    if (
      !/\bexport\s+function\s+dashboardGraphFilter\b[\s\S]*\bfilter\.date_range\s*=\s*cloneDateRange\s*\(\s*state\.date_range\s*\)/.test(
        dashboard,
      )
    ) {
      violations.push(
        `${dashboardRel}: graph filter does not project top-level date_range`,
      );
    }
    if (!/\bdelete\s+filter\.date_range\b/.test(dashboard)) {
      violations.push(`${dashboardRel}: graph filter does not clear absent date_range`);
    }
    if (!filtersPatchBody) {
      violations.push(`${dashboardRel}: missing filtersPatch body`);
    }
    if (/\bdate_range\b/.test(filtersPatchBody)) {
      violations.push(
        `${dashboardRel}: filtersPatch persists date_range inside filters`,
      );
    }
    if (!choicesBody) {
      violations.push(`${filtersRel}: missing dashboardFiltersFromChoices body`);
    }
    if (/\bdate_range\b/.test(choicesBody)) {
      violations.push(
        `${filtersRel}: lens filter projection persists date_range in filters`,
      );
    }
    if (
      !/\bfilterChoicesFromDashboardState\b[\s\S]*\bdateRange:\s*dateRangeOrEmpty\s*\(\s*state\.date_range\s*\)/.test(
        filters,
      )
    ) {
      violations.push(`${filtersRel}: filter choices do not read top-level date_range`);
    }
    if (
      !/\badaptDashboardState\b[\s\S]*\bdate_range:\s*normalizeDashboardDateRange\s*\(\s*body\.date_range\s*\)/.test(
        adapter,
      )
    ) {
      violations.push(
        `${adapterRel}: dashboard adapter does not normalize top-level date_range`,
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps dashboard graph filters normalized at the canonical state seam", () => {
    const rel = "stores/server/dashboardState.ts";
    const normalizationRel = "stores/server/dashboardStateNormalization.ts";
    const adapterRel = "stores/server/liveAdapters.ts";
    const filtersRel = "stores/view/filters.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const normalization = stripComments(
      readFileSync(join(SRC_ROOT, normalizationRel), "utf8"),
    );
    const adapter = stripComments(readFileSync(join(SRC_ROOT, adapterRel), "utf8"));
    const filters = stripComments(readFileSync(join(SRC_ROOT, filtersRel), "utf8"));
    const violations: string[] = [];

    if (!/\bexport\s+function\s+normalizeDashboardFilterTiers\b/.test(normalization)) {
      violations.push(`${normalizationRel}: missing dashboard tier-filter normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeDashboardMinConfidence\b/.test(normalization)
    ) {
      violations.push(
        `${normalizationRel}: missing dashboard confidence-floor normalizer`,
      );
    }
    if (
      !/\bcloneDashboardFilters\b[\s\S]*\bnormalizeDashboardFilterTiers\s*\(/.test(
        normalization,
      )
    ) {
      violations.push(
        `${normalizationRel}: cloneDashboardFilters bypasses tier normalizer`,
      );
    }
    if (
      !/\bcloneDashboardFilters\b[\s\S]*\bnormalizeDashboardMinConfidence\s*\(/.test(
        normalization,
      )
    ) {
      violations.push(
        `${normalizationRel}: cloneDashboardFilters bypasses confidence-floor normalizer`,
      );
    }
    if (
      !/\bfunction\s+cloneStringArray\s*\(\s*values:\s*unknown\s*\)[\s\S]*\bconst\s+normalized\s*=\s*value\.trim\s*\(\s*\)[\s\S]*\bseen\.has\s*\(\s*normalized\s*\)[\s\S]*\bnext\.push\s*\(\s*normalized\s*\)/.test(
        normalization,
      )
    ) {
      violations.push(
        `${normalizationRel}: dashboard filter array normalizer preserves raw spacing`,
      );
    }
    if (
      !/\bfunction\s+normalizeDashboardFeatureQuery\s*\(\s*value:\s*unknown\s*,?\s*\)[\s\S]*\bnormalizeStringMember\s*\(\s*value\.mode\s*,\s*DASHBOARD_FEATURE_QUERY_MODES\s*\)/.test(
        normalization,
      )
    ) {
      violations.push(
        `${normalizationRel}: feature-query mode bypasses string-member normalizer`,
      );
    }
    if (
      !/\bFILTER_CHOICE_VALUE_MAX_CHARS\b/.test(filters) ||
      !/\bFILTER_CHOICE_LIST_MAX_ITEMS\b/.test(filters) ||
      !/\bfunction\s+normalizeFilterChoiceValue\s*\(\s*value:\s*unknown\s*\):\s*string\s*\|\s*null[\s\S]*\bvalue\.trim\s*\(\s*\)[\s\S]*normalized\.length\s*<=\s*FILTER_CHOICE_VALUE_MAX_CHARS/.test(
        filters,
      ) ||
      !/\bfunction\s+arrayOrEmpty\s*\(\s*values:\s*unknown[\s\S]*FILTER_CHOICE_LIST_MAX_ITEMS[\s\S]*normalizeFilterChoiceValue\s*\(\s*value\s*\)[\s\S]*\bseen\.has\s*\(\s*normalized\s*\)[\s\S]*\bnext\.push\s*\(\s*normalized\s*\)[\s\S]*\bnext\.length\s*>=\s*maxItems/.test(
        filters,
      )
    ) {
      violations.push(
        `${filtersRel}: filter-choice array normalizer is unbounded`,
      );
    }
    if (
      !/from\s+["']\.\.\/searchQuery["'][\s\S]*\bnormalizeSearchQuery\b/.test(
        filters,
      ) ||
      !/\bfunction\s+normalizeFilterChoiceText\s*\(\s*value:\s*unknown\s*\):\s*string[\s\S]*\bnormalizeSearchQuery\s*\(\s*value\s*\)/.test(
        filters,
      ) ||
      !/\btextMatch:\s*normalizeFilterChoiceText\s*\(\s*raw\.textMatch\s*\)/.test(
        filters,
      ) ||
      !/\btextMatch:\s*normalizeFilterChoiceText\s*\(\s*filters\.text\s*\)/.test(
        filters,
      )
    ) {
      violations.push(`${filtersRel}: filter-choice text bypasses search normalizer`);
    }
    if (
      !/\bfunction\s+structuralStatesOrEmpty\s*\([\s\S]*normalizeFilterChoiceValue\s*\(\s*value\s*\)[\s\S]*STRUCTURAL_STATES\.includes[\s\S]*next\.push\s*\(\s*structuralState\s*\)[\s\S]*next\.length\s*>=\s*STRUCTURAL_STATES\.length/.test(
        filters,
      )
    ) {
      violations.push(`${filtersRel}: structural state choices are not bounded`);
    }
    if (!/\bdashboardFiltersFromChoices\s*\(\s*choices:\s*unknown\s*\)/.test(filters)) {
      violations.push(
        `${filtersRel}: dashboard filter choices accept typed-only input`,
      );
    }
    if (
      !/\badaptDashboardState\b[\s\S]*\bfilters:\s*cloneDashboardFilters\s*\(\s*body\.filters\s*\)/.test(
        adapter,
      )
    ) {
      violations.push(`${adapterRel}: dashboard adapter bypasses filter normalizer`);
    }
    if (
      !/\bdashboardFiltersWithTier\b[\s\S]*\bisDashboardTierName\s*\(/.test(stripped)
    ) {
      violations.push(`${rel}: tier filter setter accepts non-canonical tier names`);
    }
    if (
      !/\bexport\s+function\s+normalizeDashboardTierName\s*\(\s*tier:\s*unknown[\s\S]*tier\.trim\s*\(\s*\)[\s\S]*isDashboardTierName\s*\(\s*normalized\s*\)/.test(
        stripped,
      ) ||
      !/\bexport\s+function\s+normalizeDashboardTierEnabled\s*\(\s*enabled:\s*unknown[\s\S]*typeof\s+enabled\s*===\s*["']boolean["']/.test(
        stripped,
      ) ||
      !/\bexport\s+function\s+normalizeDashboardConfidenceTier\s*\(\s*tier:\s*unknown[\s\S]*normalizeDashboardTierName\s*\(\s*tier\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing runtime tier filter normalizers`);
    }
    if (
      !/\bdashboardFiltersWithTier\s*\([\s\S]*filters:\s*unknown[\s\S]*tier:\s*unknown[\s\S]*on:\s*unknown[\s\S]*normalizeDashboardTierName\s*\(\s*tier\s*\)[\s\S]*normalizeDashboardTierEnabled\s*\(\s*on\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: tier filter setter trusts typed tier/enabled inputs`);
    }
    if (
      !/\bdashboardFiltersWithMinConfidence\b[\s\S]*\bnormalizeDashboardConfidenceFloor\s*\(/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: confidence filter setter bypasses floor normalizer`);
    }
    if (
      !/\bdashboardFiltersWithMinConfidence\s*\([\s\S]*filters:\s*unknown[\s\S]*tier:\s*unknown[\s\S]*floor:\s*unknown[\s\S]*normalizeDashboardConfidenceTier\s*\(\s*tier\s*\)[\s\S]*normalizeDashboardConfidenceFloor\s*\(\s*floor\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: confidence floor setter trusts typed tier/floor inputs`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps enrolled timeline-mode consumers behind the stores timeline view", () => {
    const enrolled = new Set([
      "app/palette/CommandPalette.tsx",
      "app/right/StatusTab.tsx",
      "app/stage/LensSelector.tsx",
      "app/stage/TierDial.tsx",
    ]);
    const violations: string[] = [];

    for (const rel of enrolled) {
      const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));

      for (const statement of importStatements(stripped)) {
        if (/\b(?:opsDisabledFor|timeTravelAsOf)\b/.test(statement)) {
          violations.push(`${rel}: app-layer timeline-mode derivation import`);
        }
      }
      if (/\btimeline_mode\b/.test(stripped)) {
        violations.push(`${rel}: raw dashboard timeline_mode read`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps the stage layout and lens selectors behind stores selector views", () => {
    const rel = "app/stage/LensSelector.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardState\b/.test(statement)) {
        violations.push(`${rel}: raw dashboard-state selector subscription`);
      }
      if (/\buseDashboardStateMutations\b/.test(statement)) {
        violations.push(`${rel}: broad dashboard-state selector mutation`);
      }
      if (/\buseDashboardTimelineModeView\b/.test(statement)) {
        violations.push(`${rel}: app-layer timeline selector projection`);
      }
      if (/\bDEFAULT_DASHBOARD_SALIENCE_LENS\b/.test(statement)) {
        violations.push(`${rel}: app-layer salience lens fallback`);
      }
    }
    if (
      /\bdashboardState\.data\b|\brepresentation_mode\b|\bsalience_lens\b|\btimeline_mode\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local dashboard layout/lens projection`);
    }
    if (!/\buseDashboardLayoutSelectorView\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing stores layout selector view seam`);
    }
    if (!/\buseDashboardStageControlsIntent\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing stores stage-controls intent seam`);
    }
    if (/\bdashboardMutations\b/.test(stripped)) {
      violations.push(`${rel}: local broad dashboard mutation alias`);
    }
    if (!/\bderiveDashboardLayoutSelectorPresentationView\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing stores layout presentation projection`);
    }
    if (!/\blayoutPresentation\.containerClassName\b/.test(stripped)) {
      violations.push(`${rel}: missing stores layout container class projection`);
    }
    if (!/\bgroup\.segments\.map\b/.test(stripped)) {
      violations.push(`${rel}: missing stores layout segment row iteration`);
    }
    for (const field of [
      "group.ariaLabel",
      "group.className",
      "seg.active",
      "seg.tabIndex",
      "seg.className",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing layout presentation field ${field}`);
      }
    }
    if (/\bSPATIAL_SEGMENTS\b|\bTIMELINE_SEGMENT\b/.test(stripped)) {
      violations.push(`${rel}: app-layer layout segment catalog`);
    }
    for (const localLayoutChrome of [
      "flex gap-fg-0-5 rounded-fg-md bg-paper-sunken p-fg-0-5",
      "flex items-center justify-center rounded-fg-xs px-fg-2 py-fg-1 text-label transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-focus",
      "bg-paper-raised font-medium text-ink shadow-fg-raised",
      "text-ink-muted hover:text-ink",
    ]) {
      if (stripped.includes(localLayoutChrome)) {
        violations.push(`${rel}: local layout segment chrome ${localLayoutChrome}`);
      }
    }
    if (!/\buseDashboardLensSelectorView\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing stores lens selector view seam`);
    }
    if (!/\bderiveDashboardLensSelectorPresentationView\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing stores lens presentation projection`);
    }
    if (!/\blensPresentation\.rows\.map\b/.test(stripped)) {
      violations.push(`${rel}: local lens row iteration`);
    }
    if (!/\baria-label=\{lensPresentation\.containerAriaLabel\}/.test(stripped)) {
      violations.push(`${rel}: missing stores lens container aria projection`);
    }
    if (!/\bclassName=\{lensPresentation\.containerClassName\}/.test(stripped)) {
      violations.push(`${rel}: missing stores lens container class projection`);
    }
    if (/\bLENS_OPTIONS\b/.test(stripped)) {
      violations.push(`${rel}: app-layer lens row catalog`);
    }
    if (/\bconst\s+active\s*=/.test(stripped)) {
      violations.push(`${rel}: local lens active-state projection`);
    }
    if (!/\bclassName=\{row\.className\}/.test(stripped)) {
      violations.push(`${rel}: missing stores lens row class projection`);
    }
    if (
      /row\.active\s*\?\s*["'][^"']*border-accent/.test(stripped) ||
      /border-transparent text-ink-muted hover:bg-paper-sunken/.test(stripped)
    ) {
      violations.push(`${rel}: local lens row class projection`);
    }
    if (/\baria-label=\{`\$\{[^}]+\.label\} lens`\}/.test(stripped)) {
      violations.push(`${rel}: local lens aria-label projection`);
    }
    if (/aria-label=["']salience lens["']/.test(stripped)) {
      violations.push(`${rel}: local lens container aria projection`);
    }
    if (
      stripped.includes(
        "flex items-center gap-fg-0-5 rounded-fg-md border border-rule bg-paper-raised/95 p-fg-0-5 shadow-fg-raised backdrop-blur-sm",
      )
    ) {
      violations.push(`${rel}: local lens container class projection`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps dashboard layout and lens enums normalized at read and write seams", () => {
    const dashboardRel = "stores/server/dashboardState.ts";
    const normalizationRel = "stores/server/dashboardStateNormalization.ts";
    const adapterRel = "stores/server/liveAdapters.ts";
    const queriesRel = "stores/server/queries.ts";
    const controlsIntentRel = "stores/server/dashboardStageControlsIntent.ts";
    const sceneIntentRel = "stores/server/dashboardStageSceneIntent.ts";
    const dashboard = stripComments(readFileSync(join(SRC_ROOT, dashboardRel), "utf8"));
    const normalization = stripComments(
      readFileSync(join(SRC_ROOT, normalizationRel), "utf8"),
    );
    const adapter = stripComments(readFileSync(join(SRC_ROOT, adapterRel), "utf8"));
    const queries = stripComments(readFileSync(join(SRC_ROOT, queriesRel), "utf8"));
    const controlsIntent = stripComments(
      readFileSync(join(SRC_ROOT, controlsIntentRel), "utf8"),
    );
    const sceneIntent = stripComments(
      readFileSync(join(SRC_ROOT, sceneIntentRel), "utf8"),
    );
    const violations: string[] = [];

    if (
      !/\bexport\s+function\s+normalizeDashboardRepresentationMode\b/.test(
        normalization,
      )
    ) {
      violations.push(`${normalizationRel}: missing representation-mode normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeDashboardGraphGranularity\s*\(\s*granularity:\s*unknown\s*,?\s*\)/.test(
        normalization,
      )
    ) {
      violations.push(
        `${normalizationRel}: missing runtime graph-granularity normalizer`,
      );
    }
    if (!/\bexport\s+function\s+normalizeDashboardSalienceLens\b/.test(normalization)) {
      violations.push(`${normalizationRel}: missing salience-lens normalizer`);
    }
    if (
      !/\bfunction\s+normalizeStringMember\s*(?:<[^>]+>)?\s*\(\s*value:\s*unknown\s*,[\s\S]*members:\s*readonly\s+\w+\[\]\s*,?\s*\)[\s\S]*\bconst\s+normalized\s*=\s*value\.trim\s*\(\s*\)[\s\S]*\bisStringMember\s*\(\s*normalized\s*,\s*members\s*\)/.test(
        normalization,
      )
    ) {
      violations.push(
        `${normalizationRel}: string member normalizer preserves raw spacing`,
      );
    }
    for (const [name, member] of [
      ["normalizeDashboardRepresentationMode", "REPRESENTATION_MODES"],
      ["normalizeDashboardGraphGranularity", "GRAPH_GRANULARITIES"],
      ["normalizeDashboardSalienceLens", "SALIENCE_LENSES"],
    ] as const) {
      if (
        !new RegExp(
          `\\b${name}\\b[\\s\\S]*\\bnormalizeStringMember\\s*\\([^,]+,\\s*${member}\\s*\\)`,
        ).test(normalization)
      ) {
        violations.push(
          `${normalizationRel}: ${name} bypasses string-member normalizer`,
        );
      }
    }
    if (
      !/\brepresentationModePatch\b[\s\S]*\bnormalizeDashboardRepresentationMode\s*\(/.test(
        dashboard,
      )
    ) {
      violations.push(`${dashboardRel}: representation-mode patch bypasses normalizer`);
    }
    if (!/\blensPatch\b[\s\S]*\bnormalizeDashboardSalienceLens\s*\(/.test(dashboard)) {
      violations.push(`${dashboardRel}: salience-lens patch bypasses normalizer`);
    }
    if (
      !/\bgranularityPatch\s*\(\s*graph_granularity:\s*unknown\s*,?\s*\)[\s\S]*\bnormalizeDashboardGraphGranularity\s*\(\s*graph_granularity\s*\)/.test(
        dashboard,
      )
    ) {
      violations.push(`${dashboardRel}: graph-granularity patch bypasses normalizer`);
    }
    if (
      !/\bdashboardGraphDefaultsPatch\s*\(\s*graph_granularity:\s*unknown[\s\S]*\bnormalizeDashboardGraphGranularity\s*\(\s*graph_granularity\s*\)/.test(
        dashboard,
      )
    ) {
      violations.push(`${dashboardRel}: graph defaults bypass granularity normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeDashboardGraphSettingsDefaults\s*\(\s*defaults:\s*unknown[\s\S]*normalizeDashboardGraphGranularity\s*\(\s*record\.defaultGranularity\s*\)[\s\S]*Number\.isFinite\s*\(\s*record\.confidenceFloor\s*\)[\s\S]*normalizeDashboardTextFilter\s*\(\s*record\.labelFilter\s*\)/.test(
        dashboard,
      )
    ) {
      violations.push(
        `${dashboardRel}: graph settings defaults bypass runtime normalizer`,
      );
    }
    if (
      !/\bdashboardGraphSettingsDefaultsPatch\s*\(\s*defaults:\s*unknown[\s\S]*normalizeDashboardGraphSettingsDefaults\s*\(\s*defaults\s*\)/.test(
        dashboard,
      )
    ) {
      violations.push(`${dashboardRel}: graph settings defaults trust typed input`);
    }
    if (
      /dashboardGraphSettingsDefaultsPatch\s*\(\s*defaults:\s*GraphSettingsDefaults/.test(
        dashboard,
      ) ||
      /applyGraphSettingsDefaults:\s*\(defaults:\s*GraphSettingsDefaults/.test(
        dashboard,
      )
    ) {
      violations.push(`${dashboardRel}: typed-only graph settings defaults seam`);
    }
    if (/\bdefaults\.labelFilter\.trim\s*\(\s*\)/.test(dashboard)) {
      violations.push(`${dashboardRel}: graph settings defaults trim raw label`);
    }
    for (const [field, normalizer] of [
      ["graph_granularity", "normalizeDashboardGraphGranularity"],
      ["salience_lens", "normalizeDashboardSalienceLens"],
      ["representation_mode", "normalizeDashboardRepresentationMode"],
    ] as const) {
      if (
        !new RegExp(
          `\\b${field}:\\s*${normalizer}\\s*\\(\\s*body\\.${field}\\s*\\)`,
        ).test(adapter)
      ) {
        violations.push(`${adapterRel}: dashboard adapter bypasses ${normalizer}`);
      }
    }
    for (const typedOnly of [
      "setRepresentationMode: (mode: RepresentationMode)",
      "setGranularity: (granularity: GraphGranularity)",
      "applyGraphDefaults: (granularity: GraphGranularity",
      "applyGraphSettingsDefaults: (defaults: GraphSettingsDefaults)",
    ]) {
      if (dashboard.includes(typedOnly)) {
        violations.push(`${dashboardRel}: typed-only graph visual seam ${typedOnly}`);
      }
    }
    for (const required of [
      "setRepresentationMode: (mode: unknown)",
      "setGranularity: (granularity: unknown)",
      "applyGraphDefaults: (granularity: unknown",
      "applyGraphSettingsDefaults: (defaults: unknown)",
    ]) {
      if (!dashboard.includes(required)) {
        violations.push(
          `${dashboardRel}: missing runtime graph visual seam ${required}`,
        );
      }
    }
    if (
      !/\bdashboardDocumentStateSeed\b[\s\S]*\bnormalizeDashboardRepresentationMode\s*\(/.test(
        dashboard,
      )
    ) {
      violations.push(
        `${dashboardRel}: dashboard seed bypasses representation normalizer`,
      );
    }
    if (
      !/\bdashboardDocumentStateSeed\b[\s\S]*\bnormalizeDashboardSalienceLens\s*\(/.test(
        dashboard,
      )
    ) {
      violations.push(`${dashboardRel}: dashboard seed bypasses lens normalizer`);
    }
    for (const seam of [
      "deriveDashboardStageSceneView",
      "deriveDashboardGraphControlsView",
      "deriveDashboardLayoutSelectorView",
    ]) {
      if (
        !new RegExp(
          `\\b${seam}\\b[\\s\\S]*\\bnormalizeDashboardRepresentationMode\\s*\\(`,
        ).test(queries)
      ) {
        violations.push(`${queriesRel}: ${seam} bypasses representation normalizer`);
      }
    }
    if (
      !/\bderiveDashboardLensSelectorView\b[\s\S]*\bnormalizeDashboardSalienceLens\s*\(/.test(
        queries,
      )
    ) {
      violations.push(`${queriesRel}: lens selector view bypasses lens normalizer`);
    }
    if (
      !/\bsetRepresentationMode:\s*\([^)]*\)\s*=>[\s\S]*\bnormalizeDashboardRepresentationMode\s*\(/.test(
        controlsIntent,
      )
    ) {
      violations.push(
        `${controlsIntentRel}: representation intent bypasses normalizer`,
      );
    }
    for (const typedOnly of [
      "useDashboardStageControlsIntent(\n  scope: string | null",
      "setRepresentationMode: (mode: RepresentationMode)",
      "setLens: (lens: SalienceLens)",
    ]) {
      if (controlsIntent.includes(typedOnly)) {
        violations.push(`${controlsIntentRel}: typed-only control seam ${typedOnly}`);
      }
    }
    for (const required of [
      "setRepresentationMode: (mode: unknown)",
      "setLens: (lens: unknown)",
    ]) {
      if (!controlsIntent.includes(required)) {
        violations.push(
          `${controlsIntentRel}: missing runtime control seam ${required}`,
        );
      }
    }
    if (
      !/\bimport\s*\{[\s\S]*\bnormalizeDashboardStateWriteScope\b[\s\S]*\}\s*from\s+["']\.\/dashboardState["']/.test(
        controlsIntent,
      ) ||
      !/\bexport\s+const\s+normalizeDashboardStageControlsScope\s*=\s*normalizeDashboardStateWriteScope\b/.test(
        controlsIntent,
      ) ||
      !/\bconst\s+normalizedScope\s*=\s*normalizeDashboardStageControlsScope\s*\(\s*scope\s*\)/.test(
        controlsIntent,
      )
    ) {
      violations.push(`${controlsIntentRel}: stage controls bypass scope normalizer`);
    }
    if (
      !/\buseDashboardStateMutations\s*\(\s*normalizedScope\s*\)/.test(controlsIntent)
    ) {
      violations.push(`${controlsIntentRel}: stage controls mutations use raw scope`);
    }
    if (
      !/\bnormalizedScope\s*===\s*null[\s\S]*\?\s*inert\s*\(\s*\)/.test(controlsIntent)
    ) {
      violations.push(
        `${controlsIntentRel}: stage controls do not gate normalized scope`,
      );
    }
    if (
      !/\bsetLens:\s*\([^)]*\)\s*=>[\s\S]*\bnormalizeDashboardSalienceLens\s*\(/.test(
        controlsIntent,
      )
    ) {
      violations.push(`${controlsIntentRel}: lens intent bypasses normalizer`);
    }
    if (
      !/\bsetRepresentationMode:\s*\([^)]*\)\s*=>[\s\S]*\bnormalizeDashboardRepresentationMode\s*\(/.test(
        sceneIntent,
      )
    ) {
      violations.push(
        `${sceneIntentRel}: scene representation intent bypasses normalizer`,
      );
    }
    if (sceneIntent.includes("useDashboardStageSceneIntent(\n  scope: string | null")) {
      violations.push(`${sceneIntentRel}: typed-only scene scope seam`);
    }
    if (sceneIntent.includes("setRepresentationMode: (mode: RepresentationMode)")) {
      violations.push(`${sceneIntentRel}: typed-only scene representation seam`);
    }
    if (sceneIntent.includes("descendFeatureTag: (featureTag: string)")) {
      violations.push(`${sceneIntentRel}: typed-only scene feature-descent seam`);
    }
    if (!sceneIntent.includes("setRepresentationMode: (mode: unknown)")) {
      violations.push(`${sceneIntentRel}: missing runtime scene representation seam`);
    }
    if (!sceneIntent.includes("descendFeatureTag: (featureTag: unknown)")) {
      violations.push(`${sceneIntentRel}: missing runtime scene feature-descent seam`);
    }
    if (
      !/\bimport\s*\{[\s\S]*\bnormalizeDashboardStateWriteScope\b[\s\S]*\}\s*from\s+["']\.\/dashboardState["']/.test(
        sceneIntent,
      ) ||
      !/\bexport\s+const\s+normalizeDashboardStageSceneScope\s*=\s*normalizeDashboardStateWriteScope\b/.test(
        sceneIntent,
      ) ||
      !/\bconst\s+normalizedScope\s*=\s*normalizeDashboardStageSceneScope\s*\(\s*scope\s*\)/.test(
        sceneIntent,
      )
    ) {
      violations.push(`${sceneIntentRel}: scene intent bypasses scope normalizer`);
    }
    if (!/\buseDashboardStateMutations\s*\(\s*normalizedScope\s*\)/.test(sceneIntent)) {
      violations.push(`${sceneIntentRel}: scene intent mutations use raw scope`);
    }
    if (
      !/\bnormalizeDashboardStageSceneFeatureTag\s*\(\s*[\s\S]*featureTag:\s*unknown[\s\S]*\):\s*string\s*\|\s*null/.test(
        sceneIntent,
      ) ||
      !/\bnormalizeDashboardStageSceneFeatureTag\s*\([\s\S]*\breturn\s+normalizeDashboardFeatureTag\s*\(\s*featureTag\s*\)/.test(
        sceneIntent,
      ) ||
      !/\bconst\s+normalizedFeatureTag\s*=\s*normalizeDashboardStageSceneFeatureTag\s*\(\s*featureTag\s*\)/.test(
        sceneIntent,
      )
    ) {
      violations.push(`${sceneIntentRel}: scene feature descent bypasses normalizer`);
    }
    if (
      !/\bnormalizedScope\s*===\s*null[\s\S]*\?\s*inert\s*\(\s*\)/.test(sceneIntent)
    ) {
      violations.push(`${sceneIntentRel}: scene intent does not gate normalized scope`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps the stage tier dial behind the stores tier-dial view", () => {
    const rel = "app/stage/TierDial.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardState\b/.test(statement)) {
        violations.push(`${rel}: raw dashboard-state tier subscription`);
      }
      if (/\buseDashboardStateMutations\b/.test(statement)) {
        violations.push(`${rel}: broad dashboard-state tier mutation`);
      }
      if (/\bdashboardFiltersWith(?:Tier|MinConfidence)\b/.test(statement)) {
        violations.push(`${rel}: app-layer tier filter patch helper`);
      }
      if (/\bdashboardGraphQueryVariables\b/.test(statement)) {
        violations.push(`${rel}: app-layer graph query variable projection`);
      }
      if (/\buseGraphSlice\b/.test(statement)) {
        violations.push(`${rel}: app-layer graph slice availability read`);
      }
      if (/\buseGraphSliceAvailability\b/.test(statement)) {
        violations.push(`${rel}: app-layer graph availability projection`);
      }
    }
    if (
      /\bdashboardState\.data\b|\bfilters\.tiers\b|\bfilters\.min_confidence\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local dashboard tier filter projection`);
    }
    if (!/\buseDashboardTierDialView\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing stores tier-dial view seam`);
    }
    if (!/\buseDashboardTierDialIntent\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing stores tier-dial intent seam`);
    }
    if (/\bdashboardMutations\b/.test(stripped)) {
      violations.push(`${rel}: local broad dashboard mutation alias`);
    }
    if (/\bdashboardFiltersWith(?:Tier|MinConfidence)\s*\(/.test(stripped)) {
      violations.push(`${rel}: local dashboard tier filter patch composition`);
    }
    for (const required of [
      "view.rootClassName",
      "view.ariaLabel",
      "view.rows.map",
      "row.rowClassName",
      "row.buttonClassName",
      "row.buttonAriaLabel",
      "row.markTitle",
      "row.offlineLabel",
      "row.offlineLabelClassName",
      "row.showConfidence",
      "row.confidenceTier",
      "row.confidenceGroupClassName",
      "row.confidenceSliderClassName",
      "row.confidenceReadoutClassName",
      "row.confidenceReadoutLabel",
      "row.confidenceAriaLabel",
      "row.confidenceAriaValueText",
      "row.confidenceTitle",
    ]) {
      if (!stripped.includes(required)) {
        violations.push(`${rel}: missing derived tier-dial ${required}`);
      }
    }
    for (const localProjection of [
      "flex items-center gap-fg-2 text-label",
      "flex items-center gap-fg-1 rounded-fg-xs border",
      "cursor-not-allowed border-dashed border-rule text-ink-faint",
      "border-rule-strong bg-paper-sunken text-ink",
      "text-caption text-state-stale",
      "h-1 w-14 accent-accent",
      "w-7 text-right text-caption tabular-nums text-ink-faint",
      "offline - rag is not available",
      "semantic is about now - inapplicable while time travelling",
      "semantic is offline - rag is not available",
    ]) {
      if (stripped.includes(localProjection)) {
        violations.push(`${rel}: local tier-dial presentation projection`);
      }
    }
    if (/\btier\s*===\s*["']semantic["']/.test(stripped)) {
      violations.push(`${rel}: local semantic tier availability branch`);
    }
    if (/\btier\s*===\s*["']temporal["']/.test(stripped)) {
      violations.push(`${rel}: local temporal confidence branch`);
    }
    if (/\bMath\.round\s*\(/.test(stripped)) {
      violations.push(`${rel}: local tier confidence readout projection`);
    }
    if (/\bTIER_ORDER\.map\s*\(/.test(stripped)) {
      violations.push(`${rel}: local tier order projection`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps tier-dial dashboard intent scoped through a runtime normalizer", () => {
    const rel = "stores/server/dashboardTierDialIntent.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (
      /\buseDashboardTierDialIntent\s*\(\s*scope:\s*string\s*\|\s*null/.test(stripped)
    ) {
      violations.push(`${rel}: tier-dial intent trusts typed-only scope`);
    }
    for (const typedOnly of [
      "setTierEnabled: (tier: TierName, enabled: boolean)",
      "setMinConfidence: (tier: ConfidenceTierName, value: number)",
      "import type { TierName }",
      "type ConfidenceTierName",
    ]) {
      if (stripped.includes(typedOnly)) {
        violations.push(`${rel}: typed-only tier intent seam ${typedOnly}`);
      }
    }
    for (const required of [
      "setTierEnabled: (tier: unknown, enabled: unknown)",
      "setMinConfidence: (tier: unknown, value: unknown)",
    ]) {
      if (!stripped.includes(required)) {
        violations.push(`${rel}: missing runtime tier intent seam ${required}`);
      }
    }
    if (
      !/\bimport\s*\{[\s\S]*\bnormalizeDashboardStateWriteScope\b[\s\S]*\}\s*from\s+["']\.\/dashboardState["']/.test(
        stripped,
      ) ||
      !/\bexport\s+const\s+normalizeDashboardTierDialScope\s*=\s*normalizeDashboardStateWriteScope\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing runtime scope normalizer`);
    }
    if (
      !/\bconst\s+normalizedScope\s*=\s*normalizeDashboardTierDialScope\s*\(\s*scope\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: tier intent bypasses normalized scope`);
    }
    if (!/\buseDashboardState\s*\(\s*normalizedScope\s*\)/.test(stripped)) {
      violations.push(`${rel}: tier view reads raw scope`);
    }
    if (!/\buseDashboardStateMutations\s*\(\s*normalizedScope\s*\)/.test(stripped)) {
      violations.push(`${rel}: tier mutations receive raw scope`);
    }
    if (
      !/\bconst\s+normalizedTier\s*=\s*normalizeDashboardTierName\s*\(\s*tier\s*\)[\s\S]*const\s+normalizedEnabled\s*=\s*normalizeDashboardTierEnabled\s*\(\s*enabled\s*\)[\s\S]*normalizedScope\s*===\s*null\s*\|\|[\s\S]*normalizedTier\s*===\s*null\s*\|\|[\s\S]*normalizedEnabled\s*===\s*null[\s\S]*mutations\.setFilters\s*\([\s\S]*dashboardFiltersWithTier/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: tier toggle does not gate normalized inputs`);
    }
    if (
      !/\bconst\s+normalizedTier\s*=\s*normalizeDashboardConfidenceTier\s*\(\s*tier\s*\)[\s\S]*normalizedScope\s*===\s*null\s*\|\|[\s\S]*normalizedTier\s*===\s*null[\s\S]*mutations\.setFilters\s*\([\s\S]*dashboardFiltersWithMinConfidence/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: tier confidence does not gate normalized inputs`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps AppShell dashboard panel/time-travel reads behind the shell chrome view", () => {
    const rel = "app/AppShell.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardState\b/.test(statement)) {
        violations.push(`${rel}: raw dashboard-state shell chrome subscription`);
      }
      if (/\buseDashboardShellChromeView\b/.test(statement)) {
        violations.push(`${rel}: app-layer dashboard shell chrome subscription`);
      }
      if (/\buseDashboardStateMutations\b/.test(statement)) {
        violations.push(`${rel}: app-layer dashboard panel mutation seam`);
      }
      if (/\buseShellLayoutState\b/.test(statement)) {
        violations.push(`${rel}: app-layer shell layout composition`);
      }
      if (/\buseDismissOn(?:Escape|OutsidePointer)\b/.test(statement)) {
        violations.push(`${rel}: hand-rolled shell panel flyout dismiss wiring`);
      }
      if (/\bDEFAULT_DASHBOARD_PANEL_STATE\b/.test(statement)) {
        violations.push(`${rel}: app-layer dashboard panel fallback`);
      }
      if (/\bisTimeTravel\b/.test(statement)) {
        violations.push(`${rel}: app-layer timeline-mode interpretation`);
      }
    }
    if (/\bfunction\s+clampPanel\b|\bconst\s+PANEL_KEY_STEP\b/.test(stripped)) {
      violations.push(`${rel}: local shell panel sizing rule`);
    }
    if (/\bexport\s*\{\s*appShellGridColumns\b/.test(stripped)) {
      violations.push(`${rel}: app-layer shell grid helper facade`);
    }
    if (/\bpanel_state\b/.test(stripped)) {
      violations.push(`${rel}: raw dashboard panel_state read`);
    }
    if (/\btimeline_mode\b/.test(stripped)) {
      violations.push(`${rel}: raw dashboard timeline_mode read`);
    }
    if (!/\buseShellFrameView\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing stores shell frame view seam`);
    }
    if (/\buseShellPanelIntent\b/.test(stripped)) {
      violations.push(`${rel}: app-layer shell panel intent subscription`);
    }
    if (!/\buseShellWindowActions\s*\(\s*scope\s*,\s*shellFrame\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing stores shell window action seam`);
    }
    if (!/\bPopover\b/.test(stripped)) {
      violations.push(`${rel}: missing shared Popover shell panel flyout seam`);
    }
    if (!/\bonDismiss=\{shellActions\.closePanelFlyout\}/.test(stripped)) {
      violations.push(`${rel}: shell panel flyout dismiss does not close via seam`);
    }
    if (/\bpanelIntent\./.test(stripped)) {
      violations.push(`${rel}: local shell panel intent dispatch`);
    }
    if (
      /\bsetLeftCollapsed\s*=|\btoggleLeftCollapsed\s*=|\btoggleRight\s*=/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local shell composite action`);
    }
    if (/\bupdatePanelState\s*\(/.test(stripped)) {
      violations.push(`${rel}: local dashboard panel-state write`);
    }
    if (!/\bstartShellResizePointerSession\b/.test(stripped)) {
      violations.push(`${rel}: missing stores shell pointer-resize intent seam`);
    }
    if (!/\bresizeShellPanelByKey\b/.test(stripped)) {
      violations.push(`${rel}: missing stores shell keyboard-resize intent seam`);
    }
    if (/\bshellResizePointerSize\b/.test(stripped)) {
      violations.push(`${rel}: local shell pointer-resize projection`);
    }
    if (/\bshellResizeKeySize\b/.test(stripped)) {
      violations.push(`${rel}: local shell keyboard-resize projection`);
    }
    if (
      /\b(?:document|ownerDocument)\.addEventListener\s*\(\s*["']pointermove["']/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local shell pointermove listener`);
    }
    if (
      /\b(?:document|ownerDocument)\.addEventListener\s*\(\s*["']pointerup["']/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local shell pointerup listener`);
    }
    for (const statement of importStatements(stripped)) {
      if (
        /\b(?:LEFT_RAIL_MIN_WIDTH|LEFT_RAIL_MAX_WIDTH|RIGHT_RAIL_MIN_WIDTH|RIGHT_RAIL_MAX_WIDTH|TIMELINE_MIN_HEIGHT|TIMELINE_MAX_HEIGHT|setShellLeftRailWidth|setShellRightRailWidth|setShellTimelineHeight)\b/.test(
          statement,
        )
      ) {
        violations.push(`${rel}: app-layer shell resize bound/write import`);
      }
    }
    if (/\bboundedShellPanelSize\s*\(/.test(stripped)) {
      violations.push(`${rel}: local shell panel bounding projection`);
    }
    if (/\bSHELL_PANEL_KEY_STEP\b/.test(stripped)) {
      violations.push(`${rel}: local shell panel key-step projection`);
    }
    if (/\bconst\s+(?:forward|backward)\s*=/.test(stripped)) {
      violations.push(`${rel}: local shell keyboard resize direction projection`);
    }
    for (const localCopy of [
      "Close panel controls",
      "Open panel controls",
      "panel controls",
      "Hide left rail",
      "Show left rail",
      "Expand left rail",
      "Collapse left rail",
      "Show right rail",
      "Hide right rail",
      "Hide timeline",
      "Show timeline",
    ]) {
      if (stripped.includes(localCopy)) {
        violations.push(`${rel}: local shell panel-control copy "${localCopy}"`);
      }
    }
    if (/\{\s*leftRailVisible\s*&&\s*\(/.test(stripped)) {
      violations.push(`${rel}: local shell panel-control visibility projection`);
    }
    for (const localProjection of [
      /\bleftRailVisible\s*&&\s*leftCollapsed\b/,
      /\bleftRailVisible\s*&&\s*!\s*leftCollapsed\b/,
      /\{\s*timelineVisible\s*&&\s*\(/,
      /\{\s*!\s*rightCollapsed\s*&&\s*\(/,
      /\brightCollapsed\s*\?\s*""\s*:\s*"border-l border-rule"/,
    ]) {
      if (localProjection.test(stripped)) {
        violations.push(`${rel}: local shell frame visibility/chrome projection`);
      }
    }
    for (const localChrome of [
      "relative grid h-screen min-h-0 bg-paper text-ink",
      "relative flex min-h-0 flex-col overflow-hidden",
      "flex min-h-0 flex-1 flex-col border-r border-rule",
      "relative flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden border-t border-rule",
      "pointer-events-none absolute left-2 top-2 z-20",
      "pointer-events-none absolute top-2 z-20",
      "pointer-events-auto mt-fg-2 w-52 rounded-fg-md border border-rule bg-paper-raised p-fg-1 shadow-fg-raised",
      "absolute z-10 bg-transparent outline-none transition-colors duration-ui-fast",
      "Resize left rail",
      "Resize right rail",
      "Resize timeline",
    ]) {
      if (stripped.includes(localChrome)) {
        violations.push(`${rel}: local shell chrome "${localChrome}"`);
      }
    }
    for (const field of [
      "shellFrame.rootClassName",
      "shellFrame.leftRailClassName",
      "shellFrame.showCollapsedLeftRail",
      "shellFrame.showExpandedLeftRail",
      "shellFrame.leftRailContentClassName",
      "shellFrame.stageColumnClassName",
      "shellFrame.stageBodyClassName",
      "shellFrame.showTimeline",
      "shellFrame.timelineClassName",
      "shellFrame.timelineStyle",
      "shellFrame.timelineBodyClassName",
      "shellFrame.rightRailClassName",
      "shellFrame.showRightRail",
      "shellFrame.panelFlyoutRootClassName",
      "shellFrame.panelFlyoutRootStyle",
      "shellFrame.panelFlyoutButtonWrapperClassName",
      "deriveShellResizeHandleView",
      "panelControls.flyoutButtonLabel",
      "panelControls.flyoutMenuLabel",
      "panelControls.flyoutMenuClassName",
      "panelControls.itemClassName",
      "panelControls.leftRailVisibilityLabel",
      "panelControls.showLeftCollapseControl",
      "panelControls.leftCollapseLabel",
      "panelControls.rightRailVisibilityLabel",
      "panelControls.timelineVisibilityLabel",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing shell panel-control projection ${field}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps shell panel intent behind dashboard-state mutations", () => {
    const rel = "stores/server/panelStateIntent.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (!/\buseDashboardStateMutations\s*\(\s*normalizedScope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing dashboard mutation bridge`);
    }
    if (stripped.includes("useShellPanelIntent(scope: string | null")) {
      violations.push(`${rel}: panel-state intent trusts typed-only scope`);
    }
    if (
      !/\bimport\s*\{[\s\S]*\bnormalizeDashboardStateWriteScope\b[\s\S]*\}\s*from\s+["']\.\/dashboardState["']/.test(
        stripped,
      ) ||
      !/\bexport\s+const\s+normalizeShellPanelIntentScope\s*=\s*normalizeDashboardStateWriteScope\b/.test(
        stripped,
      ) ||
      !/\bconst\s+normalizedScope\s*=\s*normalizeShellPanelIntentScope\s*\(\s*scope\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: panel-state intent bypasses scope normalizer`);
    }
    if (!/\bnormalizeDashboardPanelStateUpdate\b/.test(stripped)) {
      violations.push(`${rel}: panel-state intent bypasses update normalizer`);
    }
    for (const typedOnly of [
      "setLeftCollapsed: (leftCollapsed: boolean)",
      "setRightCollapsed: (rightCollapsed: boolean)",
      "setRightTab: (rightTab: DashboardPanelState",
    ]) {
      if (stripped.includes(typedOnly)) {
        violations.push(`${rel}: typed-only panel intent seam ${typedOnly}`);
      }
    }
    if (
      !/\bsetLeftCollapsed:\s*\([^)]*leftCollapsed[^)]*\)\s*=>[\s\S]*normalizedScope\s*===\s*null[\s\S]*updatePanelState\s*\(\s*normalizeDashboardPanelStateUpdate\s*\(\s*\{\s*left_collapsed:\s*leftCollapsed\s*\}/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing left-collapse dispatch`);
    }
    if (
      !/\bsetRightCollapsed:\s*\([^)]*rightCollapsed[^)]*\)\s*=>[\s\S]*normalizedScope\s*===\s*null[\s\S]*updatePanelState\s*\(\s*normalizeDashboardPanelStateUpdate\s*\(\s*\{\s*right_collapsed:\s*rightCollapsed\s*\}/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing right-collapse dispatch`);
    }
    if (
      !/\bsetRightTab:\s*\([^)]*rightTab[^)]*\)\s*=>[\s\S]*normalizedScope\s*===\s*null[\s\S]*updatePanelState\s*\(\s*normalizeDashboardPanelStateUpdate\s*\(\s*\{\s*right_tab:\s*rightTab\s*\}/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing right-tab dispatch`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps dashboard panel state normalized at read and write seams", () => {
    const dashboardRel = "stores/server/dashboardState.ts";
    const normalizationRel = "stores/server/dashboardStateNormalization.ts";
    const adapterRel = "stores/server/liveAdapters.ts";
    const queriesRel = "stores/server/queries.ts";
    const dashboard = stripComments(readFileSync(join(SRC_ROOT, dashboardRel), "utf8"));
    const normalization = stripComments(
      readFileSync(join(SRC_ROOT, normalizationRel), "utf8"),
    );
    const adapter = stripComments(readFileSync(join(SRC_ROOT, adapterRel), "utf8"));
    const queries = stripComments(readFileSync(join(SRC_ROOT, queriesRel), "utf8"));
    const violations: string[] = [];

    if (!/\bexport\s+function\s+normalizeDashboardPanelState\b/.test(normalization)) {
      violations.push(`${normalizationRel}: missing panel-state normalizer`);
    }
    if (
      !/\bfunction\s+dashboardPanelStateRecord\s*\(\s*state:\s*unknown\s*\)/.test(
        normalization,
      )
    ) {
      violations.push(`${normalizationRel}: missing panel-state unknown input reader`);
    }
    if (
      !/\bexport\s+function\s+normalizeDashboardPanelStateUpdate\b/.test(normalization)
    ) {
      violations.push(`${normalizationRel}: missing panel-state update normalizer`);
    }
    if (!/\bexport\s+function\s+normalizeDashboardPanelTab\b/.test(normalization)) {
      violations.push(`${normalizationRel}: missing panel-tab normalizer`);
    }
    if (
      !/\bfunction\s+normalizeDashboardPanelTab\s*\(\s*tab:\s*unknown\s*,?\s*\)[\s\S]*\bnormalizeStringMember\s*\(\s*tab\s*,\s*DASHBOARD_PANEL_TABS\s*\)/.test(
        normalization,
      )
    ) {
      violations.push(
        `${normalizationRel}: panel-tab normalizer bypasses string-member normalizer`,
      );
    }
    if (
      /\bnormalizeDashboardPanelState\s*\(\s*state:\s*Partial<DashboardPanelState>/.test(
        normalization,
      ) ||
      /\bnormalizeDashboardPanelStateUpdate\s*\(\s*update:\s*Partial<DashboardPanelState>/.test(
        normalization,
      )
    ) {
      violations.push(
        `${normalizationRel}: panel-state normalizer exposes typed-only input`,
      );
    }
    if (
      !/\bpanelStatePatch\b[\s\S]*\bnormalizeDashboardPanelState\s*\(/.test(dashboard)
    ) {
      violations.push(`${dashboardRel}: panel-state patch bypasses normalizer`);
    }
    if (
      !/\bmergeDashboardPanelState\b[\s\S]*\bnormalizeDashboardPanelStateUpdate\s*\(/.test(
        dashboard,
      )
    ) {
      violations.push(`${dashboardRel}: panel-state merge bypasses update normalizer`);
    }
    if (
      !/\bnormalizeDashboardPanelStateUpdate\b[\s\S]*\bnormalizeDashboardPanelTab\s*\(\s*panelState\.right_tab\s*\)[\s\S]*\bright_tab\s*=\s*rightTab/.test(
        normalization,
      )
    ) {
      violations.push(
        `${normalizationRel}: panel-state update bypasses panel-tab normalizer`,
      );
    }
    if (
      !/\bdashboardDocumentStateSeed\b[\s\S]*\bnormalizeDashboardPanelState\s*\(/.test(
        dashboard,
      )
    ) {
      violations.push(
        `${dashboardRel}: dashboard seed bypasses panel-state normalizer`,
      );
    }
    if (
      !/\badaptDashboardState\b[\s\S]*\bpanel_state:\s*normalizeDashboardPanelState\s*\(\s*body\.panel_state\s*\)/.test(
        adapter,
      )
    ) {
      violations.push(
        `${adapterRel}: dashboard adapter bypasses panel-state normalizer`,
      );
    }
    if (
      !/\bderiveDashboardShellChromeView\b[\s\S]*\bnormalizeDashboardPanelState\s*\(/.test(
        queries,
      )
    ) {
      violations.push(
        `${queriesRel}: shell chrome view bypasses panel-state normalizer`,
      );
    }
    if (
      !/\bexport\s+function\s+useDashboardShellChromeView\s*\(\s*scope:\s*unknown\s*,?\s*\)/.test(
        queries,
      ) ||
      !/\buseDashboardState\s*\(\s*scope\s*\)/.test(queries)
    ) {
      violations.push(
        `${queriesRel}: shell chrome hook bypasses dashboard-state scope normalizer`,
      );
    }
    if (
      /\buseDashboardShellChromeView\s*\(\s*scope:\s*string\s*\|\s*null\s*\)/.test(
        queries,
      )
    ) {
      violations.push(`${queriesRel}: shell chrome hook exposes typed-only scope`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps right-rail tab options behind the shell-layout seam", () => {
    const rels = ["app/right/RailTabs.tsx", "stores/view/commandPaletteCommands.ts"];
    const shellLayoutRel = "stores/view/shellLayout.ts";
    const shellLayout = stripComments(
      readFileSync(join(SRC_ROOT, shellLayoutRel), "utf8"),
    );
    const violations: string[] = [];

    for (const rel of rels) {
      const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
      if (!/\bRIGHT_RAIL_TABS\b/.test(stripped)) {
        violations.push(`${rel}: missing shell-layout tab option seam`);
      }
      if (/\bexport\s+type\s+RailTabId\b/.test(stripped)) {
        violations.push(`${rel}: local right-rail tab union`);
      }
      if (/\bconst\s+RAIL_TABS\b/.test(stripped)) {
        violations.push(`${rel}: local right-rail tab option list`);
      }
      if (
        rel === "app/right/RailTabs.tsx" &&
        !/\brightRailAdjacentTab\b/.test(stripped)
      ) {
        violations.push(`${rel}: missing right-rail roving movement seam`);
      }
      if (
        rel === "app/right/RailTabs.tsx" &&
        /\bRIGHT_RAIL_TABS\.length\b|%\s*RIGHT_RAIL_TABS\.length/.test(stripped)
      ) {
        violations.push(`${rel}: local right-rail roving movement projection`);
      }
      for (const label of ["Status", "Changes", "Search"]) {
        if (new RegExp(`label:\\s*["']${label}["']`).test(stripped)) {
          violations.push(`${rel}: local ${label.toLowerCase()} tab label`);
        }
        if (stripped.includes(`activity rail: ${label.toLowerCase()}`)) {
          violations.push(`${rel}: local ${label.toLowerCase()} rail command label`);
        }
      }
      for (const tab of ["status", "changes", "search"]) {
        if (new RegExp(`setRightTab\\s*\\(\\s*["']${tab}["']\\s*\\)`).test(stripped)) {
          violations.push(`${rel}: local ${tab} tab write`);
        }
      }
    }
    const paletteRel = "stores/view/commandPaletteCommands.ts";
    const palette = stripComments(readFileSync(join(SRC_ROOT, paletteRel), "utf8"));
    if (!/\buseShellWindowActions\s*\(\s*scope\s*,\s*shellFrame\s*\)/.test(palette)) {
      violations.push(`${paletteRel}: missing shell window action seam`);
    }
    if (/\buseShellPanelIntent\b/.test(palette)) {
      violations.push(`${paletteRel}: command palette owns shell panel intent`);
    }
    for (const localShellAction of [
      "setShellLeftRailVisible",
      "setShellTimelineVisible",
      "resetShellLayout",
      "DEFAULT_RIGHT_RAIL_TAB",
    ]) {
      if (new RegExp(`\\b${localShellAction}\\b`).test(palette)) {
        violations.push(`${paletteRel}: local shell action ${localShellAction}`);
      }
    }
    if (/\bpanelIntent\./.test(palette)) {
      violations.push(`${paletteRel}: local shell panel intent dispatch`);
    }
    if (
      !/\bexport\s+function\s+normalizeRightRailTab\s*\(\s*tab:\s*unknown\s*\)/.test(
        shellLayout,
      )
    ) {
      violations.push(`${shellLayoutRel}: missing right-rail tab normalizer`);
    }
    if (
      !/\bnormalizeRightRailTab\s*\(\s*tab:\s*unknown\s*\)[\s\S]*\bconst\s+normalized\s*=\s*tab\.trim\s*\(\s*\)[\s\S]*\bDASHBOARD_PANEL_TABS[\s\S]*\.includes\s*\(\s*normalized\s*\)/.test(
        shellLayout,
      )
    ) {
      violations.push(
        `${shellLayoutRel}: right-rail tab normalizer preserves raw spacing`,
      );
    }
    if (
      !/\brightRailAdjacentTab\s*\(\s*[\s\S]*?current:\s*unknown[\s\S]*?direction:\s*unknown/.test(
        shellLayout,
      )
    ) {
      violations.push(`${shellLayoutRel}: right-rail roving seam is typed-only`);
    }
    if (/\brightRailAdjacentTab\s*\(\s*current:\s*RailTabId/.test(shellLayout)) {
      violations.push(`${shellLayoutRel}: right-rail roving current is typed-only`);
    }
    if (/\bsetRightTab:\s*\(tab:\s*RailTabId\)/.test(shellLayout)) {
      violations.push(`${shellLayoutRel}: shell window action tab is typed-only`);
    }
    for (const typedOnly of [
      "useShellFrameView(scope: string | null)",
      "useShellWindowActions(\n  scope: string | null",
    ]) {
      if (shellLayout.includes(typedOnly)) {
        violations.push(`${shellLayoutRel}: typed-only shell scope seam ${typedOnly}`);
      }
    }
    if (
      !/\bexport\s+function\s+useShellFrameView\s*\(\s*scope:\s*unknown\s*\)/.test(
        shellLayout,
      ) ||
      !/\buseDashboardShellChromeView\s*\(\s*scope\s*\)/.test(shellLayout)
    ) {
      violations.push(
        `${shellLayoutRel}: shell frame view bypasses normalized scope seam`,
      );
    }
    if (
      !/\bexport\s+function\s+useShellWindowActions\s*\(\s*scope:\s*unknown[\s\S]*\buseShellPanelIntent\s*\(\s*scope\s*\)/.test(
        shellLayout,
      )
    ) {
      violations.push(
        `${shellLayoutRel}: shell window actions bypass normalized scope seam`,
      );
    }
    if (
      !/\bsetRightTab:\s*\(tab\)\s*=>[\s\S]*\bpanelIntent\.setRightTab\s*\(\s*normalizeRightRailTab\s*\(\s*tab\s*\)\s*\)/.test(
        shellLayout,
      )
    ) {
      violations.push(`${shellLayoutRel}: right-tab action bypasses tab normalizer`);
    }
    if (
      /\bsetRightTab:\s*\(tab:\s*DashboardPanelState\["right_tab"\]\)/.test(palette)
    ) {
      violations.push(`${paletteRel}: window command tab writer is typed-only`);
    }
    if (/\bid:\s*`window:rail-\$\{id\}`/.test(palette)) {
      violations.push(`${paletteRel}: right-rail command id uses raw tab id`);
    }
    if (
      !/\bnormalizeCommandPaletteRightRailTab\s*\(\s*tab:\s*unknown\s*\):\s*RailTabId\s*\|\s*null[\s\S]*\btab\.trim\s*\(\s*\)[\s\S]*\bRIGHT_RAIL_TABS\.find\b/.test(
        palette,
      )
    ) {
      violations.push(`${paletteRel}: missing palette right-rail tab normalizer`);
    }
    if (
      !/\bcommandPaletteRightRailCommandId\s*\(\s*tab:\s*unknown\s*\):\s*string\s*\|\s*null[\s\S]*\bnormalizeCommandPaletteRightRailTab\s*\(\s*tab\s*\)/.test(
        palette,
      )
    ) {
      violations.push(`${paletteRel}: right-rail command id bypasses normalizer`);
    }
    if (
      !/\bconst\s+commandId\s*=\s*commandPaletteRightRailCommandId\s*\(\s*id\s*\)[\s\S]*\bconst\s+tab\s*=\s*normalizeCommandPaletteRightRailTab\s*\(\s*id\s*\)[\s\S]*commandId\s*===\s*null\s*\|\|\s*tab\s*===\s*null/.test(
        palette,
      )
    ) {
      violations.push(
        `${paletteRel}: right-rail commands do not filter bad tab identity`,
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps right-rail keybinding enrollment behind the stores-owned view seam", () => {
    const appRel = "app/right/rightRailActions.tsx";
    const seamRel = "stores/view/rightRailKeybindings.ts";
    const app = stripComments(readFileSync(join(SRC_ROOT, appRel), "utf8"));
    const seam = stripComments(readFileSync(join(SRC_ROOT, seamRel), "utf8"));
    const violations: string[] = [];

    if (!/from\s+["']\.\.\/\.\.\/stores\/view\/rightRailKeybindings["']/.test(app)) {
      violations.push(`${appRel}: missing right-rail keybinding seam export`);
    }
    for (const localOwner of [
      "registerKeybindings",
      "registerKeyAction",
      "useShellPanelIntent",
      "useActiveScope",
      "RIGHT_RAIL_TABS",
      "queueMicrotask",
      "document.querySelector",
      "focusRightRailSearch",
      "focusSearchField",
      "rightRailTabChord",
    ]) {
      if (new RegExp(`\\b${localOwner.replace(".", "\\.")}\\b`).test(app)) {
        violations.push(`${appRel}: app-layer ${localOwner} ownership`);
      }
    }
    if (/setRightTab\s*\(\s*["']search["']\s*\)/.test(app)) {
      violations.push(`${appRel}: app-layer search tab write`);
    }

    for (const required of [
      "RIGHT_RAIL_TABS",
      "useShellPanelIntent",
      "useActiveScope",
      "registerKeybindings",
      "registerKeyAction",
      "deriveRightRailKeybindings",
      "rightRailTabActionId",
      "RIGHT_RAIL_FOCUS_SEARCH_ACTION_ID",
    ]) {
      if (!new RegExp(`\\b${required}\\b`).test(seam)) {
        violations.push(`${seamRel}: missing ${required}`);
      }
    }
    if (
      /\brightRailTabActionId\s*\(\s*tab:\s*RailTabId\s*\)/.test(seam) ||
      /\brightRailTabChord\s*\(\s*index:\s*number\s*\)/.test(seam)
    ) {
      violations.push(
        `${seamRel}: right-rail keybinding identity trusts typed-only input`,
      );
    }
    if (
      !/\bnormalizeRightRailKeybindingTab\s*\(\s*tab:\s*unknown\s*\):\s*RailTabId\s*\|\s*null[\s\S]*\btab\.trim\s*\(\s*\)[\s\S]*\bRIGHT_RAIL_TABS\.find\b/.test(
        seam,
      )
    ) {
      violations.push(`${seamRel}: missing right-rail keybinding tab normalizer`);
    }
    if (
      !/\brightRailTabActionId\s*\(\s*tab:\s*unknown\s*\):\s*string\s*\|\s*null[\s\S]*\bnormalizeRightRailKeybindingTab\s*\(\s*tab\s*\)/.test(
        seam,
      )
    ) {
      violations.push(`${seamRel}: tab action id bypasses runtime normalizer`);
    }
    if (
      !/\brightRailTabChord\s*\(\s*index:\s*unknown\s*\):\s*string\s*\|\s*null[\s\S]*Number\.isInteger\s*\(\s*index\s*\)[\s\S]*index\s*<\s*RIGHT_RAIL_TABS\.length/.test(
        seam,
      )
    ) {
      violations.push(`${seamRel}: tab chord bypasses bounded index validation`);
    }
    if (
      !/\bconst\s+id\s*=\s*rightRailTabActionId\s*\(\s*tab\.id\s*\)[\s\S]*\bconst\s+defaultChord\s*=\s*rightRailTabChord\s*\(\s*index\s*\)[\s\S]*id\s*===\s*null\s*\|\|\s*defaultChord\s*===\s*null/.test(
        seam,
      )
    ) {
      violations.push(`${seamRel}: tab bindings do not filter malformed identities`);
    }
    if (!/\buseShellPanelIntent\s*\(\s*scope\s*\)/.test(seam)) {
      violations.push(`${seamRel}: panel intent is not scoped from active scope`);
    }
    if (!/setRightTab\s*\(\s*["']search["']\s*\)/.test(seam)) {
      violations.push(`${seamRel}: missing centralized focus-search tab write`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps left-rail keybinding enrollment behind the stores-owned view seam", () => {
    const appRel = "app/left/leftRailActions.tsx";
    const seamRel = "stores/view/leftRailKeybindings.ts";
    const app = stripComments(readFileSync(join(SRC_ROOT, appRel), "utf8"));
    const seam = stripComments(readFileSync(join(SRC_ROOT, seamRel), "utf8"));
    const violations: string[] = [];

    if (!/from\s+["']\.\.\/\.\.\/stores\/view\/leftRailKeybindings["']/.test(app)) {
      violations.push(`${appRel}: missing left-rail keybinding seam export`);
    }
    for (const localOwner of [
      "registerKeybindings",
      "registerKeyAction",
      "useActiveScope",
      "useDashboardTextFilterDraft",
      "cycleBrowserMode",
      "document.querySelector",
      "focusLeftRailFilter",
      "deriveLeftRailKeybindings",
    ]) {
      if (new RegExp(`\\b${localOwner.replace(".", "\\.")}\\b`).test(app)) {
        violations.push(`${appRel}: app-layer ${localOwner} ownership`);
      }
    }

    for (const required of [
      "useActiveScope",
      "useDashboardTextFilterDraft",
      "cycleBrowserMode",
      "registerKeybindings",
      "registerKeyAction",
      "deriveLeftRailKeybindings",
      "LEFT_RAIL_CYCLE_MODE_ACTION_ID",
      "LEFT_RAIL_FOCUS_FILTER_ACTION_ID",
      "LEFT_RAIL_CLEAR_FILTER_ACTION_ID",
    ]) {
      if (!new RegExp(`\\b${required}\\b`).test(seam)) {
        violations.push(`${seamRel}: missing ${required}`);
      }
    }
    if (!/\buseDashboardTextFilterDraft\s*\(\s*scope\s*\)/.test(seam)) {
      violations.push(`${seamRel}: text-filter draft is not scoped from active scope`);
    }
    if (!/\brun\s*:\s*cycleBrowserMode\b/.test(seam)) {
      violations.push(`${seamRel}: missing centralized browser-mode cycle action`);
    }
    if (!/\btextFilter\.clear\s*\(\s*\)/.test(seam)) {
      violations.push(`${seamRel}: missing centralized text-filter clear action`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps settings effects dashboard writes behind the settings effects intent", () => {
    const rel = "app/settings/settingsEffects.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardStateMutations\b/.test(statement)) {
        violations.push(`${rel}: app-layer dashboard mutation seam`);
      }
    }
    if (/\bapplyGraphSettingsDefaults\b/.test(stripped)) {
      violations.push(`${rel}: local graph-defaults dashboard write`);
    }
    if (!/\buseSettingsEffectsIntent\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing settings effects intent seam`);
    }
    if (
      !/\bsettingsIntent\s*\.\s*applyFreshGraphDefaults\s*\(\s*graphDefaults\s*,\s*graphDefaultsInitialization\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing graph-defaults intent dispatch`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps settings effects intent behind dashboard-state mutations", () => {
    const rel = "stores/server/settingsEffectsIntent.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (!/\buseDashboardStateMutations\s*\(\s*normalizedScope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing dashboard mutation bridge`);
    }
    if (
      /\buseSettingsEffectsIntent\s*\(\s*scope:\s*string\s*\|\s*null/.test(stripped)
    ) {
      violations.push(`${rel}: settings effects intent trusts typed-only scope`);
    }
    if (/\bGraphSettingsDefaults\b/.test(stripped)) {
      violations.push(`${rel}: settings effects intent imports graph-defaults shape`);
    }
    if (
      /\bapplyGraphDefaults:\s*\(\s*defaults:\s*GraphSettingsDefaults\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: graph-defaults intent trusts typed-only defaults`);
    }
    if (!/\bapplyGraphDefaults:\s*\(\s*defaults:\s*unknown\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing runtime graph-defaults intent`);
    }
    if (
      !/\bapplyFreshGraphDefaults:\s*\([\s\S]*defaults:\s*unknown[\s\S]*initialization:\s*unknown[\s\S]*\)\s*=>\s*Promise<unknown>/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing one-shot graph-defaults intent`);
    }
    if (!/\binitializedGraphDefaultsByIdentity\s*=\s*new\s+Set/.test(stripped)) {
      violations.push(`${rel}: missing initialized graph-default identity guard`);
    }
    if (!/\bpendingGraphDefaultsByIdentity\s*=\s*new\s+Set/.test(stripped)) {
      violations.push(`${rel}: missing pending graph-default identity guard`);
    }
    if (!/\bSETTINGS_GRAPH_DEFAULTS_IDENTITY_GUARD_CAP\b/.test(stripped)) {
      violations.push(`${rel}: graph-default identity guard is not bounded`);
    }
    if (!/\bSETTINGS_GRAPH_DEFAULTS_IDENTITY_MAX_CHARS\b/.test(stripped)) {
      violations.push(`${rel}: graph-default identity values are not length-bounded`);
    }
    if (
      !/\brememberSettingsGraphDefaultsInitializedIdentity\b[\s\S]*\binitializedGraphDefaultsByIdentity\.size\s*>\s*SETTINGS_GRAPH_DEFAULTS_IDENTITY_GUARD_CAP/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: initialized graph-default guard has no eviction cap`);
    }
    if (
      !/\breserveSettingsGraphDefaultsPendingIdentity\b[\s\S]*\bpendingGraphDefaultsByIdentity\.size\s*>=\s*SETTINGS_GRAPH_DEFAULTS_IDENTITY_GUARD_CAP/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: pending graph-default guard has no admission cap`);
    }
    if (
      !/\bnormalizeSettingsGraphDefaultsInitializationIdentity\s*\(\s*[\s\S]*identity/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing initialization identity normalizer`);
    }
    if (
      !/\bisFreshSettingsGraphDefaultsInitialization\s*\(\s*initialization\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: fresh initialization check bypassed`);
    }
    if (
      !/\bimport\s*\{[\s\S]*\bnormalizeDashboardStateWriteScope\b[\s\S]*\}\s*from\s+["']\.\/dashboardState["']/.test(
        stripped,
      ) ||
      !/\bexport\s+const\s+normalizeSettingsEffectsScope\s*=\s*normalizeDashboardStateWriteScope\b/.test(
        stripped,
      ) ||
      !/\bconst\s+normalizedScope\s*=\s*normalizeSettingsEffectsScope\s*\(\s*scope\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: settings effects intent bypasses scope normalizer`);
    }
    if (
      !/\bapplyGraphDefaults:\s*\([^)]*defaults[^)]*\)\s*=>[\s\S]*normalizedScope\s*===\s*null[\s\S]*applyGraphSettingsDefaults\s*\(\s*defaults\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing graph-defaults dispatch`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps app-consumed settings writes behind settings intent seams", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app/settings"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      for (const statement of importStatements(stripped)) {
        if (/\busePutSettings\b/.test(statement)) {
          violations.push(`${rel}: app-layer settings mutation hook`);
        }
        if (/\bCONSUMED_SETTING_KEYS\b/.test(statement)) {
          violations.push(`${rel}: app-layer consumed setting key import`);
        }
      }
      if (/\bputSettings\.mutate\s*\(/.test(stripped)) {
        violations.push(`${rel}: app-layer settings write`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps settings row controller writes behind the settings row intent", () => {
    const rel = "stores/view/settingsControlRow.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const selectorsRel = "stores/server/settingsSelectors.ts";
    const selectors = stripComments(readFileSync(join(SRC_ROOT, selectorsRel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\busePutSettings\b/.test(statement)) {
        violations.push(`${rel}: view-layer settings mutation hook`);
      }
      if (/\bEngineError\b/.test(statement)) {
        violations.push(`${rel}: view-layer engine error parsing`);
      }
    }
    if (/\bputSettings\.mutate\s*\(/.test(stripped)) {
      violations.push(`${rel}: view-layer settings write payload`);
    }
    if (/\berrorMessage\b/.test(stripped)) {
      violations.push(`${rel}: view-layer settings error extraction`);
    }
    if (!/\buseSettingsRowWriteIntent\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing settings row write intent seam`);
    }
    if (!/\bwriteIntent\.write\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing settings row write dispatch`);
    }
    if (
      !/\bexport\s+function\s+normalizeSettingsEditTarget\s*\([\s\S]*value:\s*unknown[\s\S]*\):\s*SettingsEditTarget\s*\|\s*null/.test(
        selectors,
      )
    ) {
      violations.push(`${selectorsRel}: missing settings edit-target normalizer`);
    }
    if (
      !/\bfunction\s+normalizeSettingsEditTarget\s*\([\s\S]*value:\s*unknown[\s\S]*\)[\s\S]*\bconst\s+normalized\s*=\s*value\.trim\s*\(\s*\)[\s\S]*\bSETTINGS_EDIT_TARGETS\.find\s*\(\s*\(\s*target\s*\)\s*=>\s*target\s*===\s*normalized\s*\)/.test(
        selectors,
      )
    ) {
      violations.push(
        `${selectorsRel}: settings edit-target normalizer preserves raw spacing`,
      );
    }
    if (
      !/\bexport\s+function\s+isSettingsEditTarget\s*\(\s*value:\s*unknown\s*\)/.test(
        selectors,
      )
    ) {
      violations.push(
        `${selectorsRel}: settings edit-target validator accepts typed-only input`,
      );
    }
    if (
      !/from\s+["']\.\.\/server\/settingsSelectors["'][\s\S]*\bnormalizeSettingsEditTarget\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: view row owns settings edit-target normalizer`);
    }
    if (
      !/from\s+["']\.\.\/server\/settingsSelectors["'][\s\S]*\bnormalizeSettingsScope\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: view row owns settings scope normalizer`);
    }
    if (!/\bnormalizeSettingsEditTarget\s*\(\s*nextTarget\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing settings edit-target runtime validation`);
    }
    if (
      !/\buseSettingsRowController\s*\(\s*[\s\S]*activeScope:\s*unknown[\s\S]*\)/.test(
        stripped,
      ) ||
      !/\bconst\s+normalizedActiveScope\s*=\s*normalizeSettingsScope\s*\(\s*activeScope\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: settings row controller trusts typed-only scope`);
    }
    if (
      !/\bderiveSettingsRowStaticView\s*\(\s*eff,\s*normalizedActiveScope,\s*target\s*\)/.test(
        stripped,
      ) ||
      !/\bactiveScope:\s*normalizedActiveScope\b/.test(stripped)
    ) {
      violations.push(`${rel}: settings row controller uses raw scope identity`);
    }
    if (!/\bsetRawTarget\s*\(\s*normalizedTarget\s*\)/.test(stripped)) {
      violations.push(`${rel}: settings edit-target setter bypasses normalized seam`);
    }
    if (/\bsetTarget\s*=\s*useState/.test(stripped)) {
      violations.push(`${rel}: raw settings edit-target state setter is exposed`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps settings row intent behind the settings mutation seam", () => {
    const rel = "stores/server/settingsRowIntent.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (!/\busePutSettings\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing settings mutation bridge`);
    }
    if (!/\bexport\s+function\s+normalizeSettingsRowWrite\b/.test(stripped)) {
      violations.push(`${rel}: missing settings row write normalizer`);
    }
    if (!/\bnormalizeSettingUpdate\b/.test(stripped)) {
      violations.push(`${rel}: settings row write bypasses shared mutation normalizer`);
    }
    if (!/from\s+["']\.\/queries["'][\s\S]*\bnormalizeSettingUpdate\b/.test(stripped)) {
      violations.push(`${rel}: missing shared settings update normalizer import`);
    }
    if (
      !/\bfunction\s+settingsRowWriteRecord\s*\(\s*update:\s*unknown\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing settings row unknown input reader`);
    }
    if (/\bfunction\s+normalizeSettingsWrite(?:Key|Scope)\b/.test(stripped)) {
      violations.push(`${rel}: settings row owns duplicate write normalizer`);
    }
    if (
      /\bnormalizeSettingsRowWrite\s*\(\s*update:\s*Partial<SettingsRowWrite>/.test(
        stripped,
      ) ||
      /\bupdate:\s*SettingsRowWrite,\s*[\r\n\s]*handlers\?/.test(stripped)
    ) {
      violations.push(`${rel}: settings row write exposes typed-only input seam`);
    }
    if (/\bactiveScope:\s*string\s*\|\s*null\b/.test(stripped)) {
      violations.push(`${rel}: settings row write active scope is typed-only`);
    }
    if (!/\bactiveScope:\s*unknown\b/.test(stripped)) {
      violations.push(`${rel}: settings row write missing runtime active scope seam`);
    }
    if (
      !/\breturn\s+normalizeSettingUpdate\s*\(\s*\{[\s\S]*key:\s*row\.key[\s\S]*value:\s*row\.value[\s\S]*scope:\s*row\.target\s*===\s*["']scope["']\s*\?\s*row\.activeScope\s*:\s*undefined[\s\S]*\}\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(
        `${rel}: settings row write does not delegate payload normalization`,
      );
    }
    if (
      !/\bconst\s+normalized\s*=\s*normalizeSettingsRowWrite\s*\(\s*update\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: settings write dispatch bypasses row normalizer`);
    }
    if (!/\bif\s*\(\s*normalized\s*===\s*null\s*\)\s*return\b/.test(stripped)) {
      violations.push(`${rel}: malformed settings row write is not dropped`);
    }
    if (!/\bputSettings\.mutate\s*\(\s*normalized\s*,/.test(stripped)) {
      violations.push(`${rel}: missing normalized settings write payload`);
    }
    if (!/\bsettingsWriteErrorMessage\s*\(\s*error\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing normalized settings write error`);
    }
    if (!/\bDEFAULT_SETTINGS_WRITE_ERROR\b/.test(stripped)) {
      violations.push(`${rel}: missing settings write fallback error message`);
    }
    if (!/\bSETTINGS_WRITE_ERROR_MESSAGE_CAP\b/.test(stripped)) {
      violations.push(`${rel}: missing bounded settings write error cap`);
    }
    if (
      !/\bexport\s+function\s+normalizeSettingsWriteErrorText\s*\(\s*message:\s*unknown\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing settings write error text normalizer`);
    }
    if (
      !/\bsettingsWriteErrorMessage[\s\S]*\bnormalizeSettingsWriteErrorText\s*\(\s*error\.errorMessage\s*\)[\s\S]*\bnormalizeSettingsWriteErrorText\s*\(\s*record\.errorMessage\s*\)[\s\S]*\bnormalizeSettingsWriteErrorText\s*\(\s*error\.message\s*\)[\s\S]*\bnormalizeSettingsWriteErrorText\s*\(\s*record\.message\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: settings write error extraction bypasses normalizer`);
    }
    if (/\bconst\s+err\s*=\s*error\s+as\s+EngineError\b/.test(stripped)) {
      violations.push(`${rel}: settings write error uses typed-only cast`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps theme setting intent behind the settings mutation seam", () => {
    const rel = "stores/server/themeSettingIntent.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (!/\busePutSettings\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing settings mutation bridge`);
    }
    if (!/\bCONSUMED_SETTING_KEYS\.theme\b/.test(stripped)) {
      violations.push(`${rel}: missing stores-owned theme setting key`);
    }
    if (!/\bexport\s+function\s+normalizeThemeSettingPreference\b/.test(stripped)) {
      violations.push(`${rel}: missing theme preference write normalizer`);
    }
    if (!/\bisThemePreference\s*\(\s*value\s*\)/.test(stripped)) {
      violations.push(`${rel}: theme preference normalizer bypasses platform domain`);
    }
    if (/\bsetThemePreference:\s*\(value:\s*string\)/.test(stripped)) {
      violations.push(`${rel}: typed-only theme preference seam`);
    }
    if (
      !/\bconst\s+normalized\s*=\s*normalizeThemeSettingPreference\s*\(\s*value\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: theme preference dispatch bypasses normalizer`);
    }
    if (!/\bif\s*\(\s*normalized\s*===\s*null\s*\)\s*return\b/.test(stripped)) {
      violations.push(`${rel}: malformed theme preference write is not dropped`);
    }
    if (
      !/\bsetThemePreference\b[\s\S]*\bputSettings\.mutate\s*\(\s*\{\s*key:\s*CONSUMED_SETTING_KEYS\.theme\s*,\s*value:\s*normalized\s*\}/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing theme preference dispatch`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps inspector neighbor tier grouping behind the stores selector", () => {
    const rel = "app/right/Inspector.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseNodeNeighbors\b/.test(statement)) {
        violations.push(`${rel}: raw node-neighbors query hook`);
      }
    }
    if (/\bedgesByTier\b/.test(stripped)) {
      violations.push(`${rel}: app-layer neighbor tier grouping`);
    }
    if (/\bneighborEdges\b/.test(stripped)) {
      violations.push(`${rel}: raw neighbor edge payload read`);
    }
    if (/\.replace\s*\(\s*\/\^\(doc\|feature\|code\|commit\):/.test(stripped)) {
      violations.push(`${rel}: local edge target label projection`);
    }
    if (/\bMath\.round\s*\(\s*edge\.confidence/.test(stripped)) {
      violations.push(`${rel}: local edge confidence label projection`);
    }
    if (/\bedge\.state\s*\?\s*`/.test(stripped)) {
      violations.push(`${rel}: local edge state label projection`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps inspector edge endpoint labels behind the node-label seam", () => {
    const rel = "stores/view/inspector.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (!/\bgraphEndpointDisplayLabel\s*\(\s*edge\.dst\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing graph endpoint label seam`);
    }
    if (/\.replace\s*\(\s*\/\^\(doc\|feature\|code\|commit\):/.test(stripped)) {
      violations.push(`${rel}: local graph endpoint prefix stripping`);
    }
    if (/\bfunction\s+edgeTargetLabel\b/.test(stripped)) {
      violations.push(`${rel}: local inspector edge target label helper`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps Inspector read composition behind the stores inspector view", () => {
    const rel = "app/right/Inspector.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (
        /\buse(?:DashboardResolvedSelection|NodeDetailView|NodeEvidence|InspectorNeighborTierView)\b/.test(
          statement,
        )
      ) {
        violations.push(`${rel}: raw inspector read hook`);
      }
    }
    if (
      /\bdetail\.(?:state|node)\b|\bevidence\.data\b|\bselection\?\.kind\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: app-layer inspector read-model composition`);
    }
    if (!/\buseInspectorView\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing stores inspector view seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps Inspector presentation facts behind the stores inspector view", () => {
    const appRel = "app/right/Inspector.tsx";
    const viewRel = "stores/view/inspector.ts";
    const app = stripComments(readFileSync(join(SRC_ROOT, appRel), "utf8"));
    const view = stripComments(readFileSync(join(SRC_ROOT, viewRel), "utf8"));
    const violations: string[] = [];

    for (const localCopy of [
      "select something to inspect",
      "inspecting...",
      "node unavailable",
      "Evidence",
      "Edges by tier",
    ]) {
      if (app.includes(localCopy)) {
        violations.push(`${appRel}: local inspector presentation copy "${localCopy}"`);
      }
    }
    if (/aria-label=\{`node\s+\$\{/.test(app)) {
      violations.push(`${appRel}: local inspector node aria-label projection`);
    }
    if (/\bPropertyRow\s+label=["'](?:kind|state|progress|modified)["']/.test(app)) {
      violations.push(`${appRel}: local inspector property-row label`);
    }
    if (/\bedge\.stateLabel\b|\bedge\.confidenceLabel\b/.test(app)) {
      violations.push(`${appRel}: local inspector edge display assembly`);
    }

    for (const field of [
      "message",
      "headerLabel",
      "summaryLabel",
      "nodeTitle",
      "nodeAriaLabel",
      "propertyRows",
      "evidenceSectionLabel",
      "edgeSectionLabel",
      "displayLabel",
      "messageClassName",
      "rootClassName",
      "headerClassName",
      "summaryClassName",
      "nodePanelClassName",
      "nodeTitleClassName",
      "propertyListClassName",
      "evidenceSectionClassName",
      "edgeSectionClassName",
      "sectionLabelClassName",
      "evidenceListClassName",
      "evidenceItemClassName",
      "evidenceRuleClassName",
      "tierGroupClassName",
      "tierButtonClassName",
      "tierListClassName",
      "tierEdgeButtonClassName",
    ]) {
      if (!new RegExp(`\\b${field}\\b`).test(app)) {
        violations.push(`${appRel}: missing inspector presentation field ${field}`);
      }
    }
    for (const localClass of [
      "space-y-fg-2 text-body",
      "rounded-fg-xs focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      "truncate font-serif text-title text-ink",
      "space-y-fg-0-5 text-ink-muted",
      "ml-fg-3 mt-fg-0-5 space-y-fg-0-5 text-ink-muted",
      "truncate text-left hover:underline",
    ]) {
      if (app.includes(localClass)) {
        violations.push(`${appRel}: local inspector chrome class "${localClass}"`);
      }
    }
    if (!/\bderiveInspectorPropertyRows\s*\(/.test(view)) {
      violations.push(`${viewRel}: missing property-row presentation seam`);
    }
    if (!/\beventTouchSummary\s*\(/.test(view)) {
      violations.push(`${viewRel}: missing event summary presentation seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps Inspector tier expansion behind the inspector expansion seam", () => {
    const rel = "app/right/Inspector.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseState\b/.test(statement)) {
        violations.push(`${rel}: local inspector expansion state hook`);
      }
      if (/\buseInspectorExpansionStore\b/.test(statement)) {
        violations.push(`${rel}: raw inspector expansion store access`);
      }
    }
    if (/\bsetUnfolded\b|\[\s*unfolded\s*,\s*set[A-Z]/.test(stripped)) {
      violations.push(`${rel}: local inspector tier expansion tuple`);
    }
    if (
      !/\buseInspectorTierExpansion\s*\(\s*scope\s*,\s*view\.nodeId\s*,\s*view\.tierKeys\s*,?\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing inspector tier expansion seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps inspector expansion visual-state keys collision-resistant", () => {
    const rel = "stores/view/inspectorExpansion.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (
      !/\bnormalizedScope\s*===\s*null[\s\S]*\?\s*["']scope:null["']/.test(stripped)
    ) {
      violations.push(`${rel}: null scope lacks an explicit key sentinel`);
    }
    if (
      !/\bnormalizedNodeId\s*===\s*null[\s\S]*\?\s*["']node:null["']/.test(stripped)
    ) {
      violations.push(`${rel}: null inspected node lacks an explicit key sentinel`);
    }
    if (!/\bencodeURIComponent\s*\(\s*normalizedScope\s*\)/.test(stripped)) {
      violations.push(`${rel}: scoped inspector key does not encode scope`);
    }
    if (!/\bencodeURIComponent\s*\(\s*normalizedNodeId\s*\)/.test(stripped)) {
      violations.push(`${rel}: scoped inspector key does not encode node id`);
    }
    if (
      !/from\s+["']\.\/scopeIdentity["'][\s\S]*\bnormalizeViewStoreSessionString\b/.test(
        stripped,
      ) ||
      !/\bexport\s+const\s+normalizeInspectorExpansionScope\s*=\s*normalizeViewStoreSessionString\b/.test(
        stripped,
      )
    ) {
      violations.push(
        `${rel}: inspector scope key bypasses shared view scope normalizer`,
      );
    }
    if (
      !/from\s+["']\.\.\/nodeIds["']/.test(stripped) ||
      !/\bexport\s+function\s+normalizeInspectorExpansionNodeId\b[\s\S]*\bnormalizeNodeId\s*\(\s*nodeId\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: inspector node key bypasses node-id normalizer`);
    }
    if (
      !/const\s+normalizedScope\s*=\s*normalizeInspectorExpansionScope\s*\(\s*scope\s*\)[\s\S]*const\s+normalizedNodeId\s*=\s*normalizeInspectorExpansionNodeId\s*\(\s*nodeId\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: inspector key factory bypasses normalized identity`);
    }
    if (
      !/scope:value:\$\{encodeURIComponent\s*\(\s*normalizedScope\s*\)\}/.test(stripped)
    ) {
      violations.push(`${rel}: real scopes lack a value-tagged key namespace`);
    }
    if (
      !/node:value:\$\{encodeURIComponent\s*\(\s*normalizedNodeId\s*\)\}/.test(stripped)
    ) {
      violations.push(`${rel}: real nodes lack a value-tagged key namespace`);
    }
    if (
      /\$\{scope\s*\?\?\s*["']none["']\}::\$\{nodeId\s*\?\?\s*["']none["']\}/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: inspector key can collide with literal none values`);
    }
    if (!/\bconst\s+INSPECTOR_TIER_IDS\s*=\s*\[/.test(stripped)) {
      violations.push(`${rel}: missing canonical inspector tier vocabulary`);
    }
    if (!/\bexport\s+function\s+normalizeInspectorExpansionKey\b/.test(stripped)) {
      violations.push(`${rel}: missing inspector expansion key normalizer`);
    }
    if (!/\bINSPECTOR_EXPANSION_KEY_MAX_CHARS\b/.test(stripped)) {
      violations.push(`${rel}: inspector expansion key cap is not explicit`);
    }
    if (
      !/\bnormalizeInspectorExpansionKey\s*\(\s*value:\s*unknown\s*\)[\s\S]*\bconst\s+normalized\s*=\s*value\.trim\s*\(\s*\)[\s\S]*normalized\.length\s*>\s*0[\s\S]*normalized\.length\s*<=\s*INSPECTOR_EXPANSION_KEY_MAX_CHARS/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: inspector expansion key is not trimmed and bounded`);
    }
    if (
      !/\binspectorExpansionKey\s*\(\s*scope:\s*unknown,\s*nodeId:\s*unknown\s*\)[\s\S]*\bkey\.length\s*<=\s*INSPECTOR_EXPANSION_KEY_MAX_CHARS/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: inspector expansion derived key is not bounded`);
    }
    if (!/\bexport\s+function\s+normalizeInspectorExpansionTier\b/.test(stripped)) {
      violations.push(`${rel}: missing inspector expansion tier normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeInspectorExpansionTiers\b[\s\S]*\bnormalizeInspectorExpansionTier\s*\(/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: inspector expansion tier list bypasses normalizer`);
    }
    for (const typedOnly of [
      "setKey: (key: string)",
      "toggleTier: (key: string, tier: string)",
      "pruneVisible: (key: string, visibleTiers: readonly string[])",
      "visibleTiers: readonly string[]",
      "toggle: (tier: string) => void",
    ]) {
      if (stripped.includes(typedOnly)) {
        violations.push(`${rel}: typed-only inspector expansion seam ${typedOnly}`);
      }
    }
    if (
      !/\bsetKey:\s*\(key\)[\s\S]*\bnormalizeInspectorExpansionKey\s*\(\s*key\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: inspector setKey bypasses key normalizer`);
    }
    if (
      !/\btoggleTier:\s*\(key,\s*tier\)\s*=>[\s\S]*\bnormalizeInspectorExpansionKey\s*\(\s*key\s*\)[\s\S]*\bnormalizeInspectorExpansionTier\s*\(\s*tier\s*\)[\s\S]*\bnormalizeInspectorExpansionTiers\s*\(/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: inspector expansion toggle bypasses normalizers`);
    }
    const storeBlock = stripped;
    const pruneStart = storeBlock.lastIndexOf("pruneVisible:");
    const pruneEnd = pruneStart >= 0 ? storeBlock.indexOf("reset:", pruneStart) : -1;
    const pruneBlock =
      pruneStart >= 0 && pruneEnd > pruneStart
        ? storeBlock.slice(pruneStart, pruneEnd)
        : "";
    if (
      !/\bnormalizeInspectorExpansionKey\s*\(\s*key\s*\)/.test(pruneBlock) ||
      !/\bnormalizeInspectorExpansionTiers\s*\(\s*visibleTiers\s*\)/.test(pruneBlock) ||
      !/\bnormalizeInspectorExpansionTiers\s*\(\s*state\.expandedTiers\s*,?\s*\)/.test(
        pruneBlock,
      )
    ) {
      violations.push(`${rel}: inspector expansion prune bypasses normalizers`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps node context-menu descriptors behind the stores node-entity view", () => {
    const rels = ["app/stage/Stage.tsx", "app/right/Inspector.tsx"];
    const nodeEntityRel = "stores/view/nodeEntity.ts";
    const bridge = stripComments(
      readFileSync(join(SRC_ROOT, "stores/view/stageSceneEvents.ts"), "utf8"),
    );
    const nodeEntity = stripComments(
      readFileSync(join(SRC_ROOT, nodeEntityRel), "utf8"),
    );
    const violations: string[] = [];

    for (const rel of rels) {
      const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
      for (const statement of importStatements(stripped)) {
        if (
          /\bisNodeIslandOpen\b|\bisPinnedNode\b|\bisInWorkingSet\b/.test(statement)
        ) {
          violations.push(`${rel}: local node entity membership read`);
        }
      }
      if (/\bisOpen\s*:|\bisPinned\s*:|\binWorkingSet\s*:/.test(stripped)) {
        violations.push(`${rel}: local node entity descriptor composition`);
      }
      const seamOwner = rel === "app/stage/Stage.tsx" ? bridge : stripped;
      if (!/\bnodeEntityView\s*\(/.test(seamOwner)) {
        violations.push(`${rel}: missing node entity view seam`);
      }
    }
    for (const typedOnly of [
      "id: string",
      "scope?: string | null",
      "title?: string",
      "nodeEntityView({ id, scope, title }: NodeEntityViewInput): NodeEntity",
    ]) {
      if (nodeEntity.includes(typedOnly)) {
        violations.push(`${nodeEntityRel}: node entity view input is typed-only`);
      }
    }
    if (
      !/\bexport\s+function\s+nodeEntityView\s*\(\s*input:\s*unknown\s*\):\s*NodeEntity\s*\|\s*null/.test(
        nodeEntity,
      )
    ) {
      violations.push(`${nodeEntityRel}: node entity view lacks runtime input seam`);
    }
    if (
      !/\bconst\s+id\s*=\s*normalizeNodeId\s*\(\s*input\.id\s*\)[\s\S]*\bid\s*===\s*null/.test(
        nodeEntity,
      )
    ) {
      violations.push(`${nodeEntityRel}: node entity view bypasses node-id normalizer`);
    }
    if (!/\bnormalizeSelectionScope\s*\(\s*input\.scope\s*\)/.test(nodeEntity)) {
      violations.push(`${nodeEntityRel}: node entity view bypasses scope normalizer`);
    }
    for (const membership of ["isNodeIslandOpen", "isPinnedNode", "isInWorkingSet"]) {
      if (!new RegExp(`\\b${membership}\\s*\\(\\s*id\\s*\\)`).test(nodeEntity)) {
        violations.push(
          `${nodeEntityRel}: node entity membership bypasses normalized id for ${membership}`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps node-interior feature lifecycle behind the stores selector", () => {
    const rel = "app/islands/NodeInterior.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseGraphSlice\b/.test(statement)) {
        violations.push(`${rel}: raw feature lifecycle graph-slice query`);
      }
      if (/\bselectNode\b/.test(statement)) {
        violations.push(`${rel}: raw node-selection import`);
      }
    }
    if (/\buseGraphSlice\s*\(/.test(stripped)) {
      violations.push(`${rel}: local feature lifecycle graph-slice query`);
    }
    if (/\bfeature_tags\s*:\s*\[/.test(stripped)) {
      violations.push(`${rel}: local feature lifecycle filter projection`);
    }
    if (/\bselectNode\s*\([^)]*,\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: raw scoped node-selection call`);
    }
    if (!/\buseFeatureLifecycleView\s*\(\s*id\s*,\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing feature lifecycle selector seam`);
    }
    if (!/\buseDashboardNodeSelection\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing dashboard node-selection seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps inspector selection resolution behind the inspector view seam", () => {
    const rel = "app/right/Inspector.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardState\b/.test(statement)) {
        violations.push(`${rel}: raw dashboard-state selection subscription`);
      }
      if (/\bdashboardSelectionId\b/.test(statement)) {
        violations.push(`${rel}: local dashboard selection id derivation import`);
      }
      if (/\buseResolvedSelection\b/.test(statement)) {
        violations.push(`${rel}: local resolved-selection composition import`);
      }
      if (/\buseDashboardResolvedSelection\b/.test(statement)) {
        violations.push(`${rel}: raw resolved-selection hook`);
      }
    }
    if (/\bdashboardSelectionId\s*\(/.test(stripped)) {
      violations.push(`${rel}: local dashboard selection id derivation`);
    }
    if (!/\buseInspectorView\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing inspector view seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps keyboard selection behind the selection seam", () => {
    const rel = "app/a11y/KeyboardNav.tsx";
    const seamRel = "stores/view/keyboardNavigation.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const seam = stripComments(readFileSync(join(SRC_ROOT, seamRel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardState\b/.test(statement)) {
        violations.push(`${rel}: raw dashboard-state selection subscription`);
      }
      if (/\bdashboardSelectionId\b/.test(statement)) {
        violations.push(`${rel}: local dashboard selection id derivation import`);
      }
      if (/\bselectNode\b/.test(statement)) {
        violations.push(`${rel}: raw node-selection import`);
      }
      if (/\buseNodeNeighbors\b/.test(statement)) {
        violations.push(`${rel}: raw keyboard neighbor query hook`);
      }
      if (/\buseFiltersVocabularyView\b/.test(statement)) {
        violations.push(`${rel}: local keyboard feature vocabulary projection`);
      }
    }
    if (/\bdashboardSelectionId\s*\(/.test(stripped)) {
      violations.push(`${rel}: local dashboard selection id derivation`);
    }
    if (/\bselectNode\s*\(/.test(stripped)) {
      violations.push(`${rel}: raw node-selection call`);
    }
    if (/\bneighbors\.data\b|\bvocabulary\.featureTags\b/.test(stripped)) {
      violations.push(`${rel}: local keyboard navigation data projection`);
    }
    if (!/\buseKeyboardNavigationSurface\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing keyboard navigation surface seam`);
    }
    if (/\buseDashboardNodeSelection\s*\(/.test(stripped)) {
      violations.push(`${rel}: app-layer dashboard node-selection seam`);
    }
    if (!/\buseDashboardNodeSelection\s*\(\s*normalizedScope\s*\)/.test(seam)) {
      violations.push(`${seamRel}: missing dashboard node-selection seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps keyboard navigation data behind the keyboard navigation view", () => {
    const rel = "app/a11y/KeyboardNav.tsx";
    const seamRel = "stores/view/keyboardNavigation.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const seam = stripComments(readFileSync(join(SRC_ROOT, seamRel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardSelectedNodeId\b/.test(statement)) {
        violations.push(`${rel}: raw keyboard selected-node read`);
      }
      if (/\buseKeyboardNavigationView\b/.test(statement)) {
        violations.push(`${rel}: app-layer keyboard navigation view import`);
      }
      if (/\bderiveKeyboardNavigationView\b/.test(statement)) {
        violations.push(`${rel}: app-layer keyboard navigation projection`);
      }
      if (/\bKeyboardNavigationView\b/.test(statement)) {
        violations.push(`${rel}: app-layer keyboard navigation model typing`);
      }
      if (
        /\bcycleKeyboardList\b|\bkeyboardBracketStep\b|\bsteppedKeyboardPlayhead\b/.test(
          statement,
        )
      ) {
        violations.push(`${rel}: app-layer keyboard navigation helper import`);
      }
    }
    if (/\buseDashboardSelectedNodeId\s*\(/.test(stripped)) {
      violations.push(`${rel}: raw keyboard selected-node subscription`);
    }
    if (/\bderiveKeyboardNavigationView\s*\(/.test(stripped)) {
      violations.push(`${rel}: local keyboard navigation projection`);
    }
    if (/\bconst\s+(?:neighbors|neighborIds|featureIds|selectedId)\b/.test(stripped)) {
      violations.push(`${rel}: local keyboard navigation data assembly`);
    }
    if (
      !/\bconst\s+navigation\s*=\s*useKeyboardNavigationSurface\s*\(\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing canonical keyboard navigation surface`);
    }
    if (/\bderiveKeyboardNavigationKeyIntent\s*\(/.test(stripped)) {
      violations.push(`${rel}: local keyboard key-intent projection`);
    }
    if (/\bintent\.kind\s*===\s*["'](?:select-node|move-playhead)["']/.test(stripped)) {
      violations.push(`${rel}: local keyboard intent dispatch`);
    }
    for (const appOwner of [
      "KEYBOARD_NAVIGATION_BINDINGS",
      "keyboardNavigationKeyForAction",
      "registerKeybindings",
      "registerKeyAction",
      "useKeymapDispatcher",
      "timelineViewSnapshot",
      "visibleRange",
      "movePlayhead",
    ]) {
      if (new RegExp(`\\b${appOwner}\\b`).test(stripped)) {
        violations.push(`${rel}: app-layer ${appOwner} ownership`);
      }
    }
    for (const required of [
      "KEYBOARD_NAVIGATION_BINDINGS",
      "keyboardNavigationKeyForAction",
      "deriveKeyboardNavigationKeyIntent",
      "deriveKeyboardNavigationActionDescriptor",
      "useKeyboardNavigationView",
      "useKeyboardNavigationKeybindings",
      "useKeyboardNavigationSurface",
      "registerKeybindings",
      "registerKeyAction",
      "useKeymapDispatcher",
    ]) {
      if (!new RegExp(`\\b${required}\\b`).test(seam)) {
        violations.push(`${seamRel}: missing ${required} keymap seam`);
      }
    }
    for (const typedOnly of [
      "deriveKeyboardNavigationActionDescriptor(\n  binding: KeyboardNavigationBinding,\n  navigation: KeyboardNavigationView,\n  scope: string | null",
      "useKeyboardNavigationView(\n  scope: string | null",
      "useKeyboardNavigationKeybindings(\n  scope: string | null",
    ]) {
      if (seam.includes(typedOnly)) {
        violations.push(`${seamRel}: typed-only keyboard scope seam ${typedOnly}`);
      }
    }
    if (
      !/\bnormalizeSelectionScope\b[\s\S]*\bfrom\s+["']\.\/selection["']/.test(seam)
    ) {
      violations.push(`${seamRel}: keyboard scope bypasses selection normalizer`);
    }
    if (!/\buseKeyboardNavigationView\s*\(\s*scope:\s*unknown\s*,?\s*\)/.test(seam)) {
      violations.push(`${seamRel}: keyboard navigation view lacks runtime scope seam`);
    }
    if (
      !/\bconst\s+normalizedScope\s*=\s*normalizeSelectionScope\s*\(\s*scope\s*\)[\s\S]*\buseDashboardSelectedNodeId\s*\(\s*normalizedScope\s*\)[\s\S]*\buseFiltersVocabularyView\s*\(\s*normalizedScope\s*\)[\s\S]*\buseNodeNeighbors\s*\(\s*selectedId\s*,\s*normalizedScope\s*\)/.test(
        seam,
      )
    ) {
      violations.push(`${seamRel}: keyboard navigation view reads raw scope`);
    }
    if (
      !/\bconst\s+normalizedScope\s*=\s*normalizeSelectionScope\s*\(\s*scope\s*\)[\s\S]*\bconst\s+navigation\s*=\s*useKeyboardNavigationView\s*\(\s*normalizedScope\s*\)[\s\S]*\bconst\s+selectDashboardNode\s*=\s*useDashboardNodeSelection\s*\(\s*normalizedScope\s*\)/.test(
        seam,
      )
    ) {
      violations.push(`${seamRel}: keyboard surface bypasses normalized scope`);
    }
    if (
      !/\bderiveKeyboardNavigationActionDescriptor\s*\([\s\S]*scope:\s*unknown\s*,/.test(
        seam,
      )
    ) {
      violations.push(`${seamRel}: keyboard action descriptor trusts typed-only scope`);
    }
    if (!/\bconst\s+intent\s*=\s*deriveKeyboardNavigationKeyIntent\s*\(/.test(seam)) {
      violations.push(`${seamRel}: missing keyboard intent dispatch seam`);
    }
    if (!/\bintent\.kind\s*===\s*["']select-node["']/.test(seam)) {
      violations.push(`${seamRel}: missing select-node keyboard intent dispatch`);
    }
    if (!/\bmovePlayhead\s*\(\s*intent\.playhead\s*,\s*scope\s*\)/.test(seam)) {
      violations.push(`${seamRel}: missing playhead keyboard intent dispatch`);
    }
    if (
      /\bmovePlayhead\s*\(\s*intent\.playhead\s*,\s*normalizedScope\s*\)/.test(seam)
    ) {
      violations.push(
        `${seamRel}: playhead keyboard dispatch normalizes malformed scope into local state`,
      );
    }
    if (!/\btimelineVisibleRange\s*\(/.test(seam)) {
      violations.push(`${seamRel}: missing stores timeline visible-range projection`);
    }
    if (/\baddEventListener\s*\(\s*["']keydown["']/.test(stripped)) {
      violations.push(`${rel}: local keyboard navigation listener`);
    }
    if (/\b(?:e|event)\.(?:ctrlKey|metaKey|altKey)\b/.test(stripped)) {
      violations.push(`${rel}: local keyboard modifier inspection`);
    }
    if (/\bisFormTarget\b/.test(stripped)) {
      violations.push(`${rel}: local form-target key guard`);
    }
    if (
      /\bfunction\s+cycle\b|\bfunction\s+bracketStep\b|\bfunction\s+steppedPlayhead\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local keyboard navigation helper projection`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps status commit activation behind the event-node selection seam", () => {
    const rel = "app/right/StatusTab.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\bselectNodes\b/.test(statement)) {
        violations.push(`${rel}: raw multi-node selection import`);
      }
      if (/\bselectEvent\b/.test(statement)) {
        violations.push(`${rel}: raw event metadata import`);
      }
    }
    if (/\bselectNodes\s*\(/.test(stripped)) {
      violations.push(`${rel}: raw multi-node selection call`);
    }
    if (/\bselectEvent\s*\(/.test(stripped)) {
      violations.push(`${rel}: raw event metadata call`);
    }
    if (!/\bselectEventNodes\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing event-node selection seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps document dashboard-state test resets behind the stores helper", () => {
    const violations: string[] = [];

    for (const surface of ["app", "stores"] as const) {
      for (const file of sourceFilesIncludingTests(join(SRC_ROOT, surface))) {
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
        if (rel === "stores/server/dashboardState.ts") continue;
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);

        if (
          /selected_ids:\s*\[\]/.test(stripped) &&
          /hovered_id:\s*null/.test(stripped) &&
          /timeline_mode:\s*\{\s*kind:\s*["']live["']\s*\}/.test(stripped) &&
          /graph_granularity:\s*["']document["']/.test(stripped) &&
          /graph_bounds:\s*\{\s*shape:\s*["']free["']/.test(stripped)
        ) {
          violations.push(`${rel}: duplicated dashboard document reset fixture`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps resettable view stores enrolled in wholesale scope resets", () => {
    const viewStore = stripComments(readFileSync(VIEW_STORE, "utf8"));
    const violations: string[] = [];
    const resetHelper =
      viewStore.match(
        /\bfunction\s+resetCorpusLocalStores\s*\(\)\s*:\s*void\s*\{([\s\S]*?)\n\}/,
      )?.[1] ?? "";
    const setScopeBody =
      viewStore.match(
        /\bsetScope:\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n {2}\},\n {2}swapWorkspace:/,
      )?.[1] ?? "";
    const swapWorkspaceBody =
      viewStore.match(
        /\bswapWorkspace:\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n {2}\},\n {2}seedFromSession:/,
      )?.[1] ?? "";

    if (!resetHelper) {
      violations.push("viewStore.ts: missing resetCorpusLocalStores helper");
    }
    if (!/\bresetCorpusLocalStores\s*\(\s*\)/.test(setScopeBody)) {
      violations.push("viewStore.ts: setScope bypasses resetCorpusLocalStores");
    }
    if (!/\bresetCorpusLocalStores\s*\(\s*\)/.test(swapWorkspaceBody)) {
      violations.push("viewStore.ts: swapWorkspace bypasses resetCorpusLocalStores");
    }

    for (const reset of viewResetExports()) {
      if (NON_WHOLESALE_VIEW_RESETS.has(reset)) continue;
      const helper = reset.split(":")[1]!;
      if (reset === "shellLayout.ts:resetShellLayout") {
        for (const field of [
          /leftRailVisible:\s*true/,
          /leftRailWidth:\s*LEFT_RAIL_DEFAULT_WIDTH/,
          /rightRailWidth:\s*RIGHT_RAIL_DEFAULT_WIDTH/,
          /timelineVisible:\s*true/,
          /timelineHeight:\s*TIMELINE_DEFAULT_HEIGHT/,
          /panelFlyoutOpen:\s*false/,
        ]) {
          if (!field.test(viewStore)) {
            violations.push(`${reset}: shell layout field missing from corpus reset`);
          }
        }
        continue;
      }
      if (!new RegExp(`\\b${helper}\\s*\\(`).test(resetHelper)) {
        violations.push(`${reset}: not enrolled in resetCorpusLocalStores`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps query-cache invalidation behind stores-server orchestration", () => {
    const violations: string[] = [];
    const roots = [
      ...PRODUCTION_SURFACES.map((surface) => join(SRC_ROOT, surface)),
      VIEW_STORES_ROOT,
    ];

    for (const root of roots) {
      for (const file of sourceFiles(root)) {
        const stripped = stripComments(readFileSync(file, "utf8"));
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        for (const statement of importStatements(stripped)) {
          if (/\buseQueryClient\b/.test(statement)) {
            violations.push(`${rel}: app/view query-client ownership`);
          }
        }
        if (
          /\.(?:invalidateQueries|removeQueries|refetchQueries|resetQueries)\s*\(/.test(
            stripped,
          )
        ) {
          violations.push(`${rel}: app/view query-cache mutation`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps ops dispatch and whitelist ownership in the stores layer", () => {
    const violations: string[] = [];
    const opsRunOwner = "stores/view/opsRun.ts";

    for (const root of ["app", "scene", "platform", "stores/view"] as const) {
      for (const file of sourceFiles(join(SRC_ROOT, root))) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        if (/from\s+["'](?:\.\/|\.\.\/right\/)[^"']*opsActions["']/.test(stripped)) {
          violations.push(`${rel}: app-local opsActions import`);
        }
        if (/\bexport\s+const\s+OPS_WHITELIST\b/.test(stripped)) {
          violations.push(`${rel}: app-layer ops whitelist`);
        }
        if (
          /\bengineClient\.ops(?:Core|CoreWrite|CoreCreate|Rag|RagGet|Git)\s*\(/.test(
            stripped,
          )
        ) {
          violations.push(`${rel}: direct engine ops call outside stores-server`);
        }
        if (rel !== opsRunOwner) {
          for (const statement of importStatements(stripped)) {
            if (/\bdispatchOps\b|\bOPS_ACTION\b/.test(statement)) {
              violations.push(`${rel}: ops dispatch bypasses opsRun seam`);
            }
          }
          if (/\bdispatchOps\s*\(/.test(stripped)) {
            violations.push(`${rel}: direct ops dispatch outside opsRun seam`);
          }
          if (
            /\bappDispatcher\.dispatch\s*\(\s*\{[\s\S]*type:\s*OPS_ACTION/.test(
              stripped,
            ) ||
            /\btype:\s*["']ops:run["']/.test(stripped)
          ) {
            violations.push(`${rel}: raw ops dispatcher payload`);
          }
        }
      }
    }

    const opsRun = stripComments(readFileSync(join(SRC_ROOT, opsRunOwner), "utf8"));
    const opsActionsRel = "stores/server/opsActions.ts";
    const opsActions = stripComments(
      readFileSync(join(SRC_ROOT, opsActionsRel), "utf8"),
    );
    if (!/\bnormalizeOpsWhitelistIntent\b/.test(opsRun)) {
      violations.push(`${opsRunOwner}: missing app-exposed ops whitelist guard`);
    }
    if (
      !/from\s+["']\.\.\/server\/opsActions["'][\s\S]*\bnormalizeOpsWhitelistIntent\b/.test(
        opsRun,
      )
    ) {
      violations.push(`${opsRunOwner}: ops run owns local target/verb parsing`);
    }
    if (/\bnormalizeOpsVerb\b/.test(opsRun)) {
      violations.push(`${opsRunOwner}: ops run parses non-whitelisted receipt verbs`);
    }
    if (
      !/\bexport\s+function\s+normalizeOpsRunVariables\s*\(\s*variables:\s*unknown[\s\S]*return\s+normalizeOpsWhitelistIntent\s*\(\s*variables\s*\)/.test(
        opsRun,
      )
    ) {
      violations.push(`${opsRunOwner}: ops mutation does not normalize target+verb`);
    }
    if (/\bfunction\s+normalizeOpsRun(?:Target|Verb)\b/.test(opsRun)) {
      violations.push(`${opsRunOwner}: local ops run target/verb normalizer`);
    }
    if (
      !/\bexport\s+function\s+opsRunReceiptVerb\s*\(\s*variables:\s*unknown/.test(
        opsRun,
      )
    ) {
      violations.push(`${opsRunOwner}: missing safe ops receipt verb seam`);
    }
    if (
      !/\bopsRunReceiptVerb\s*\(\s*variables:\s*unknown\s*\)[\s\S]*\bconst\s+normalized\s*=\s*normalizeOpsRunVariables\s*\(\s*variables\s*\)[\s\S]*return\s+normalized\?\.verb\s*\?\?\s*["']operation["']/.test(
        opsRun,
      )
    ) {
      violations.push(`${opsRunOwner}: receipt verb bypasses whitelisted intent`);
    }
    if (/\bString\s*\(\s*variables\.(?:target|verb)\s*\)/.test(opsRun)) {
      violations.push(`${opsRunOwner}: invalid ops receipt formats raw variables`);
    }
    if (!/\buseInvalidateAfterRagOpsRun\s*\(\s*scope\s*\)/.test(opsRun)) {
      violations.push(`${opsRunOwner}: missing rag ops cache invalidation seam`);
    }
    if (!/\bintent\.target\s*===\s*["']rag["']/.test(opsRun)) {
      violations.push(`${opsRunOwner}: rag ops success is not branched separately`);
    }
    if (!/\binvalidateRagOpsRun\s*\(\s*intent\.verb\s*\)/.test(opsRun)) {
      violations.push(`${opsRunOwner}: rag ops success misses rag cache invalidation`);
    }
    if (/\bvars\.(?:target|verb)\b/.test(opsRun)) {
      violations.push(`${opsRunOwner}: raw ops mutation vars used after normalization`);
    }
    if (/\buseQueryClient\b/.test(opsRun)) {
      violations.push(`${opsRunOwner}: query-client mutation outside server seam`);
    }
    if (!/\bexport\s+function\s+isOpsDispatchIntent\b/.test(opsActions)) {
      violations.push(`${opsActionsRel}: missing terminal ops dispatch predicate`);
    }
    if (
      !/\bexport\s+function\s+normalizeOpsTarget\s*\(\s*value:\s*unknown\s*\)[\s\S]*value\.trim\s*\(\s*\)[\s\S]*normalized\s*===\s*["']core["'][\s\S]*normalized\s*===\s*["']rag["']/.test(
        opsActions,
      )
    ) {
      violations.push(`${opsActionsRel}: missing shared ops target normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeOpsVerb\s*\(\s*value:\s*unknown\s*\)[\s\S]*value\.trim\s*\(\s*\)[\s\S]*normalized\.length\s*>\s*0/.test(
        opsActions,
      )
    ) {
      violations.push(`${opsActionsRel}: missing shared ops verb normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeOpsWhitelistIntent\s*\(\s*payload:\s*unknown[\s\S]*\bnormalizeOpsTarget\s*\(\s*payload\.target\s*\)[\s\S]*\bnormalizeOpsVerb\s*\(\s*payload\.verb\s*\)[\s\S]*\bisOpsWhitelistIntent\s*\(\s*intent\s*\)/.test(
        opsActions,
      )
    ) {
      violations.push(`${opsActionsRel}: missing shared app-exposed ops normalizer`);
    }
    if (!/\bfunction\s+isRecord\s*\(\s*value:\s*unknown\s*\)/.test(opsActions)) {
      violations.push(`${opsActionsRel}: missing runtime payload record guard`);
    }
    if (!/\bisOpsDispatchIntent\s*\(\s*payload:\s*unknown\s*\)/.test(opsActions)) {
      violations.push(`${opsActionsRel}: dispatch predicate is not a runtime boundary`);
    }
    if (
      !/\bif\s*\(\s*!isOpsTarget\s*\(\s*payload\.target\s*\)\s*\)\s*return\s+false/.test(
        opsActions,
      )
    ) {
      violations.push(`${opsActionsRel}: dispatch predicate does not validate target`);
    }
    if (
      !/\bconst\s+normalizedVerb\s*=\s*normalizeOpsVerb\s*\(\s*payload\.verb\s*\)[\s\S]*normalizedVerb\s*===\s*null\s*\|\|\s*normalizedVerb\s*!==\s*payload\.verb/.test(
        opsActions,
      )
    ) {
      violations.push(
        `${opsActionsRel}: dispatch predicate does not validate normalized verb`,
      );
    }
    if (
      !/\bconst\s+OPS_CORE_WRITE_VERBS\s*=\s*new\s+Set\s*\(\s*\[[\s\S]*["']set-body["'][\s\S]*["']set-frontmatter["'][\s\S]*["']edit["'][\s\S]*["']rename["'][\s\S]*\]\s*\)/.test(
        opsActions,
      )
    ) {
      violations.push(`${opsActionsRel}: core write dispatch verbs drift from editor mutations`);
    }
    if (
      !/\bfunction\s+isOpsWriteBodyForVerb\s*\(\s*verb:\s*string,\s*body:\s*unknown\s*\):\s*body\s+is\s+OpsWriteBody[\s\S]*\bisRecord\s*\(\s*body\s*\)[\s\S]*\bbody\.ref[\s\S]*\bverb\s*===\s*["']rename["'][\s\S]*\bbody\.to/.test(
        opsActions,
      )
    ) {
      violations.push(`${opsActionsRel}: core write dispatch does not validate body shape`);
    }
    if (
      !/\bfunction\s+isOpsCreateBody\s*\(\s*body:\s*unknown\s*\):\s*body\s+is\s+OpsCreateBody[\s\S]*\bbody\.doc_type[\s\S]*\bbody\.feature/.test(
        opsActions,
      )
    ) {
      violations.push(`${opsActionsRel}: core create dispatch does not validate body shape`);
    }
    if (
      !/\bOPS_CORE_WRITE_VERBS\.has\s*\(\s*verb\s*\)\s*&&\s*isOpsWriteBodyForVerb\s*\(\s*verb\s*,\s*payload\.body\s*\)/.test(
        opsActions,
      )
    ) {
      violations.push(`${opsActionsRel}: core write dispatch predicate bypasses body validator`);
    }
    if (
      !/\bverb\s*===\s*OPS_CORE_CREATE_VERB\s*&&\s*isOpsCreateBody\s*\(\s*payload\.body\s*\)/.test(
        opsActions,
      )
    ) {
      violations.push(`${opsActionsRel}: core create dispatch predicate bypasses body validator`);
    }
    if (
      !/\bfunction\s+isOpsRagControlBodyForVerb\s*\(\s*verb:\s*string,\s*body:\s*unknown\s*\):\s*boolean[\s\S]*verb\s*===\s*["']reindex["'][\s\S]*body\.type[\s\S]*body\.clean[\s\S]*verb\s*===\s*["']watcher-reconfigure["'][\s\S]*body\.debounce_ms[\s\S]*body\.cooldown_s[\s\S]*verb\s*===\s*["']project-evict["'][\s\S]*body\.root/.test(
        opsActions,
      )
    ) {
      violations.push(`${opsActionsRel}: rag control dispatch does not validate body shape`);
    }
    if (
      !/\bOPS_RAG_CONTROL_VERBS\.has\s*\(\s*verb\s*\)\s*&&\s*isOpsRagControlBodyForVerb\s*\(\s*verb\s*,\s*payload\.body\s*\)/.test(
        opsActions,
      )
    ) {
      violations.push(`${opsActionsRel}: rag dispatch predicate bypasses body validator`);
    }
    if (!/\bassertOpsDispatchIntent\s*\(\s*payload\s*\)/.test(opsActions)) {
      violations.push(
        `${opsActionsRel}: terminal ops handler bypasses dispatch predicate`,
      );
    }
    if (
      !/\bfunction\s+assertOpsDispatchIntent\s*\(\s*payload:\s*unknown\s*\):\s*asserts\s+payload\s+is\s+OpsPayload[\s\S]*\bisOpsDispatchIntent\s*\(\s*payload\s*\)/.test(
        opsActions,
      )
    ) {
      violations.push(`${opsActionsRel}: missing reusable ops dispatch assertion`);
    }
    if (
      !/\bexport\s+function\s+dispatchOps\s*\(\s*payload:\s*unknown\s*\)[\s\S]*\bassertOpsDispatchIntent\s*\(\s*payload\s*\)[\s\S]*\bappDispatcher\.dispatch/.test(
        opsActions,
      )
    ) {
      violations.push(`${opsActionsRel}: public ops dispatch is typed-only`);
    }
    if (!/\bOPS_CORE_WRITE_VERBS\b/.test(opsActions)) {
      violations.push(`${opsActionsRel}: missing core write verb vocabulary`);
    }
    if (!/\bOPS_CORE_CREATE_VERB\b/.test(opsActions)) {
      violations.push(`${opsActionsRel}: missing core create verb vocabulary`);
    }
    if (
      !/\bOPS_CORE_WRITE_VERBS\.has\s*\(\s*(?:payload\.verb|verb)\s*\)/.test(opsActions)
    ) {
      violations.push(`${opsActionsRel}: core writes bypass verb vocabulary`);
    }
    if (!/\b(?:payload\.verb|verb)\s*===\s*OPS_CORE_CREATE_VERB\b/.test(opsActions)) {
      violations.push(`${opsActionsRel}: core create bypasses verb vocabulary`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps UI and view layers behind the React dispatch seam", () => {
    const violations: string[] = [];
    const roots = [
      ...PRODUCTION_SURFACES.map((surface) => join(SRC_ROOT, surface)),
      VIEW_STORES_ROOT,
    ];

    for (const root of roots) {
      for (const file of sourceFiles(root)) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        if (/from\s+["'][^"']*platform\/dispatch\/middleware["']/.test(stripped)) {
          violations.push(`${rel}: raw appDispatcher middleware import`);
        }
        if (
          /import\s+\{[^}]*\b(?:appDispatcher|appConfirmGuard|createConfirmGuard)\b[^}]*\}\s+from\s+["'][^"']*platform["']/.test(
            stripped,
          )
        ) {
          violations.push(
            `${rel}: raw dispatch middleware import from platform barrel`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps action type normalization at the platform dispatch seam", () => {
    const violations: string[] = [];
    const dispatchRel = "platform/dispatch/dispatch.ts";
    const useActionRel = "platform/dispatch/useAction.ts";
    const middlewareRel = "platform/dispatch/middleware.ts";
    const dispatch = stripComments(readFileSync(join(SRC_ROOT, dispatchRel), "utf8"));
    const useAction = stripComments(readFileSync(join(SRC_ROOT, useActionRel), "utf8"));
    const middleware = stripComments(
      readFileSync(join(SRC_ROOT, middlewareRel), "utf8"),
    );

    if (
      !/\bexport\s+function\s+normalizeActionType\s*\(\s*type:\s*unknown\s*\):\s*string\s*\|\s*null[\s\S]*typeof\s+type\s*!==\s*["']string["'][\s\S]*type\.trim\s*\(\s*\)/.test(
        dispatch,
      )
    ) {
      violations.push(`${dispatchRel}: missing runtime action-type normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeAction\s*\(\s*action:\s*unknown\s*\):\s*Action\s*\|\s*null[\s\S]*normalizeActionType\s*\(\s*record\?\.type\s*\)/.test(
        dispatch,
      )
    ) {
      violations.push(`${dispatchRel}: action object bypasses type normalizer`);
    }
    if (
      !/\bfunction\s+normalizeActionMeta\s*\(\s*meta:\s*unknown\s*\):\s*ActionMeta\s*\|\s*undefined[\s\S]*typeof\s+meta\s*===\s*["']object["'][\s\S]*!\s*Array\.isArray\s*\(\s*meta\s*\)/.test(
        dispatch,
      )
    ) {
      violations.push(`${dispatchRel}: action meta bypasses runtime shape guard`);
    }
    if (
      !/\bconst\s+normalized:\s*Action\s*=\s*\{\s*type\s*\}[\s\S]*["']payload["']\s+in\s+record[\s\S]*normalized\.payload\s*=\s*record\.payload[\s\S]*normalizeActionMeta\s*\(\s*record\?\.meta\s*\)[\s\S]*normalized\.meta\s*=\s*meta[\s\S]*return\s+normalized/.test(
        dispatch,
      )
    ) {
      violations.push(`${dispatchRel}: normalized action leaks raw record fields`);
    }
    if (/\{\s*\.\.\.record\s*,\s*type\s*\}/.test(dispatch)) {
      violations.push(`${dispatchRel}: normalized action spreads raw record fields`);
    }
    for (const seam of [
      "register<P>(type: unknown",
      "register(type: unknown, handler: unknown",
      "hasHandler(type: unknown",
      "dispatch(action: unknown",
    ]) {
      if (!dispatch.includes(seam)) {
        violations.push(`${dispatchRel}: typed-only dispatcher seam ${seam}`);
      }
    }
    if (
      !/\bregister[\s\S]*const\s+normalizedType\s*=\s*normalizeActionType\s*\(\s*type\s*\)[\s\S]*typeof\s+handler\s*!==\s*["']function["'][\s\S]*const\s+erased\s*=\s*handler\s+as\s+ActionHandler[\s\S]*this\.handlers\.set\s*\(\s*normalizedType,\s*erased\s*\)/.test(
        dispatch,
      )
    ) {
      violations.push(`${dispatchRel}: handler registry bypasses normalized runtime seam`);
    }
    if (
      !/\bhasHandler[\s\S]*const\s+normalizedType\s*=\s*normalizeActionType\s*\(\s*type\s*\)[\s\S]*this\.handlers\.has\s*\(\s*normalizedType\s*\)/.test(
        dispatch,
      )
    ) {
      violations.push(`${dispatchRel}: handler availability bypasses normalized type`);
    }
    if (
      !/\bdispatch[\s\S]*const\s+normalizedAction\s*=\s*normalizeAction\s*\(\s*action\s*\)[\s\S]*return\s+chain\s*\(\s*normalizedAction\s*\)/.test(
        dispatch,
      )
    ) {
      violations.push(`${dispatchRel}: dispatch bypasses normalized action`);
    }
    for (const typedOnly of [
      "useDispatch(): (action: Action)",
      "useCanDispatchAction(): (type: string)",
      "useAction<P = void>(\n  type: string",
      "useConfirmable<P = void>(type: string)",
    ]) {
      if (useAction.includes(typedOnly)) {
        violations.push(`${useActionRel}: typed-only React dispatch seam ${typedOnly}`);
      }
    }
    if (
      !/from\s+["']\.\/dispatch["'][\s\S]*\bnormalizeActionType\b/.test(middleware) ||
      !/\bisArmed:\s*\(type\)\s*=>\s*\{[\s\S]*normalizeActionType\s*\(\s*type\s*\)/.test(
        middleware,
      ) ||
      !/\bdisarm:\s*\(type\)\s*=>\s*\{[\s\S]*normalizeActionType\s*\(\s*type\s*\)/.test(
        middleware,
      )
    ) {
      violations.push(`${middlewareRel}: confirm guard bypasses normalized type`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps context-menu state and resolution behind the view seam", () => {
    const violations: string[] = [];
    const viewOwner = "stores/view/contextMenu.ts";
    const registryOwner = "platform/actions/registry.ts";
    const roots = [
      ...PRODUCTION_SURFACES.map((surface) => join(SRC_ROOT, surface)),
      VIEW_STORES_ROOT,
    ];

    for (const root of roots) {
      for (const file of sourceFiles(root)) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
        if (rel === viewOwner) continue;

        for (const statement of importStatements(stripped)) {
          if (/\buseContextMenuStore\b/.test(statement)) {
            violations.push(`${rel}: raw context-menu store import`);
          }
          if (rel !== registryOwner && /\bresolveActions\b/.test(statement)) {
            violations.push(`${rel}: raw context-menu action resolution import`);
          }
          if (/\bgroupContextMenuActions\b/.test(statement)) {
            violations.push(`${rel}: raw context-menu grouping import`);
          }
        }
        if (/\buseContextMenuStore\b/.test(stripped)) {
          violations.push(`${rel}: raw context-menu store access`);
        }
        if (rel !== registryOwner && /\bresolveActions\s*\(/.test(stripped)) {
          violations.push(`${rel}: raw context-menu action resolution`);
        }
        if (/\bgroupContextMenuActions\s*\(/.test(stripped)) {
          violations.push(`${rel}: raw context-menu grouping`);
        }
        if (
          /\buseContextMenuResolvedView\b/.test(stripped) &&
          rel !== "app/menu/ContextMenuHost.tsx"
        ) {
          violations.push(`${rel}: context-menu resolved view outside host`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps action resolver registry entity ingress normalized", () => {
    const registryRel = "platform/actions/registry.ts";
    const entityRel = "platform/actions/entity.ts";
    const registry = stripComments(readFileSync(join(SRC_ROOT, registryRel), "utf8"));
    const entity = stripComments(readFileSync(join(SRC_ROOT, entityRel), "utf8"));
    const violations: string[] = [];

    if (!/\bexport\s+const\s+ENTITY_KINDS\b/.test(entity)) {
      violations.push(`${entityRel}: missing runtime entity-kind catalog`);
    }
    if (
      !/\bexport\s+function\s+normalizeEntityKind\s*\(\s*kind:\s*unknown\s*\):\s*EntityKind\s*\|\s*null[\s\S]*\bkind\.trim\s*\(\s*\)/.test(
        entity,
      )
    ) {
      violations.push(`${entityRel}: missing entity-kind normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeEntityDescriptor\s*\(\s*entity:\s*unknown\s*\):\s*EntityDescriptor\s*\|\s*null[\s\S]*\bswitch\s*\(\s*kind\s*\)/.test(
        entity,
      )
    ) {
      violations.push(`${entityRel}: missing shape-aware entity descriptor normalizer`);
    }
    for (const cap of [
      "ENTITY_DESCRIPTOR_ID_MAX_CHARS",
      "ENTITY_DESCRIPTOR_PATH_MAX_CHARS",
      "ENTITY_DESCRIPTOR_TEXT_MAX_CHARS",
      "ENTITY_DESCRIPTOR_HUNK_MAX_CHARS",
    ]) {
      if (!new RegExp(`\\bexport\\s+const\\s+${cap}\\b`).test(entity)) {
        violations.push(`${entityRel}: missing entity descriptor cap ${cap}`);
      }
    }
    if (
      !/\bfunction\s+normalizeRequiredString\s*\(\s*value:\s*unknown,\s*maxChars:\s*number\s*\)[\s\S]*normalized\.length\s*<=\s*maxChars/.test(
        entity,
      ) ||
      !/\bfunction\s+normalizeRequiredEntityId\s*\(\s*value:\s*unknown\s*\)[\s\S]*ENTITY_DESCRIPTOR_ID_MAX_CHARS/.test(
        entity,
      ) ||
      !/\bfunction\s+normalizeRequiredPath\s*\(\s*value:\s*unknown\s*\)[\s\S]*ENTITY_DESCRIPTOR_PATH_MAX_CHARS/.test(
        entity,
      ) ||
      !/\bfunction\s+normalizeOptionalHunk\s*\(\s*value:\s*unknown\s*\)[\s\S]*ENTITY_DESCRIPTOR_HUNK_MAX_CHARS/.test(
        entity,
      )
    ) {
      violations.push(`${entityRel}: entity descriptor strings are unbounded`);
    }
    if (!/from\s+["']\.\.\/graph\/nodeIds["']/.test(entity)) {
      violations.push(`${entityRel}: graph identities bypass platform node-id seam`);
    }
    if (!/from\s+["']\.\.\/scope\/scopeIdentity["']/.test(entity)) {
      violations.push(`${entityRel}: scope identities bypass platform scope seam`);
    }
    if (
      !/\bnormalizeOptionalNullableScopeId\s*\(\s*entity\.scope\s*\)/.test(entity)
    ) {
      violations.push(`${entityRel}: descriptor scope bypasses scope normalizer`);
    }
    if (
      /assignDefined\(normalized,\s*["']scope["'],\s*normalizeOptionalNullableString\(/.test(
        entity,
      )
    ) {
      violations.push(`${entityRel}: descriptor scope is normalized as plain string`);
    }
    if (
      !/\bfunction\s+normalizeOptionalNodeId\s*\(\s*value:\s*unknown\s*\)[\s\S]*\bnormalizeNodeId\s*\(\s*value\s*\)/.test(
        entity,
      )
    ) {
      violations.push(`${entityRel}: missing optional node-id normalizer`);
    }
    if (
      !/\bfunction\s+normalizeNodeIdList\s*\(\s*value:\s*unknown\s*\)[\s\S]*Array\.isArray\s*\(\s*value\s*\)[\s\S]*\bnormalizeNodeIds\s*\(\s*value\s*,\s*value\.length\s*\)/.test(
        entity,
      )
    ) {
      violations.push(`${entityRel}: event node ids bypass shared node-id list`);
    }
    for (const nodeField of [
      "nodeId",
      "dst",
      "src",
    ]) {
      if (
        new RegExp(
          `assignDefined\\(normalized,\\s*["']${nodeField}["'],\\s*normalizeOptionalString\\(`,
        ).test(entity)
      ) {
        violations.push(`${entityRel}: ${nodeField} is normalized as a plain string`);
      }
    }
    if (/\bconst\s+nodeIds\s*=\s*normalizeStringList\s*\(\s*entity\.nodeIds\s*\)/.test(entity)) {
      violations.push(`${entityRel}: event nodeIds use generic string list`);
    }
    if (
      !/\bexport\s+function\s+normalizeActionEntity\s*\(\s*entity:\s*unknown\s*\):\s*EntityDescriptor\s*\|\s*null\s*\{\s*return\s+normalizeEntityDescriptor\s*\(\s*entity\s*\)/.test(
        registry,
      )
    ) {
      violations.push(
        `${registryRel}: action entity normalizer bypasses descriptor seam`,
      );
    }
    if (
      !/\bexport\s+function\s+registerResolver\s*\([\s\S]*\bkind:\s*unknown[\s\S]*\bresolver:\s*unknown[\s\S]*\bconst\s+normalizedKind\s*=\s*normalizeEntityKind\s*\(\s*kind\s*\)[\s\S]*typeof\s+resolver\s*!==\s*["']function["'][\s\S]*\bconst\s+erased\s*=\s*resolver\s+as\s+ActionResolver[\s\S]*\bresolvers\.set\s*\(\s*normalizedKind\s*,\s*erased\s*\)/.test(
        registry,
      )
    ) {
      violations.push(
        `${registryRel}: resolver registration bypasses normalized runtime seam`,
      );
    }
    if (
      !/\bexport\s+function\s+hasResolver\s*\(\s*kind:\s*unknown\s*\)[\s\S]*\bnormalizeEntityKind\s*\(\s*kind\s*\)[\s\S]*\bresolvers\.has\s*\(\s*normalizedKind\s*\)/.test(
        registry,
      )
    ) {
      violations.push(`${registryRel}: resolver lookup bypasses normalized kind`);
    }
    if (
      !/\bexport\s+function\s+resolveActions\s*\(\s*entity:\s*unknown[\s\S]*\bconst\s+normalizedEntity\s*=\s*normalizeActionEntity\s*\(\s*entity\s*\)[\s\S]*\bresolvers\.get\s*\(\s*normalizedEntity\.kind\s*\)/.test(
        registry,
      )
    ) {
      violations.push(`${registryRel}: action resolution bypasses normalized entity`);
    }
    if (
      !/\bimport\s*\{\s*normalizeActionDescriptor,\s*type\s+ActionDescriptor\s*\}\s*from\s+["']\.\/action["']/.test(
        registry,
      ) ||
      !/\bresolver\s*\(\s*normalizedEntity\s*,\s*ctx\s*\)[\s\S]*\.map\s*\(\s*\(\s*action\s*\)\s*=>\s*normalizeActionDescriptor\s*\(\s*action\s*\)\s*\)[\s\S]*\.filter\s*\(\s*\(\s*action\s*\):\s*action\s+is\s+ActionDescriptor\s*=>\s*action\s*!==\s*null\s*\)/.test(
        registry,
      )
    ) {
      violations.push(
        `${registryRel}: action resolution bypasses descriptor normalizer`,
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps change-menu entity ingress normalized before action construction", () => {
    const violations: string[] = [];

    for (const [menuRel, functionName, kind, rawFields, typedImport] of [
      [
        "app/right/menus/changeMenu.ts",
        "changeMenu",
        "change",
        /\bentity\.(?:path|hunk)\b/,
        /\bimport\s+type\s*\{\s*ChangeEntity\b/,
      ],
      [
        "app/right/menus/edgeMenu.ts",
        "edgeMenu",
        "edge",
        /\bentity\.(?:id|relation|dst|tier)\b/,
        /\bimport\s+type\s*\{\s*EdgeEntity\b/,
      ],
      [
        "app/stage/menus/metaEdgeMenu.ts",
        "metaEdgeMenu",
        "meta-edge",
        /\bentity\.(?:id|summary)\b/,
        /\bimport\s+type\s*\{\s*MetaEdgeEntity\b/,
      ],
    ] as const) {
      const menu = stripComments(readFileSync(join(SRC_ROOT, menuRel), "utf8"));
      if (!/\bimport\s*\{\s*normalizeEntityDescriptor\s*\}/.test(menu)) {
        violations.push(`${menuRel}: missing entity descriptor normalizer`);
      }
      if (
        !new RegExp(
          `\\bexport\\s+function\\s+${functionName}\\s*\\(\\s*entity:\\s*unknown\\s*\\)`,
        ).test(menu)
      ) {
        violations.push(`${menuRel}: ${functionName} is a typed-only runtime seam`);
      }
      if (
        !/\bconst\s+normalizedEntity\s*=\s*normalizeEntityDescriptor\s*\(\s*entity\s*\)/.test(
          menu,
        ) ||
        !new RegExp(`\\bnormalizedEntity\\?\\.\\s*kind\\s*!==\\s*["']${kind}["']`).test(
          menu,
        )
      ) {
        violations.push(`${menuRel}: ${functionName} bypasses normalized entity`);
      }
      if (rawFields.test(menu)) {
        violations.push(`${menuRel}: ${functionName} reads raw entity fields`);
      }
      if (typedImport.test(menu)) {
        violations.push(`${menuRel}: ${functionName} imports typed-only entity`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps platform action descriptor helpers normalized at runtime ingress", () => {
    const actionRel = "platform/actions/action.ts";
    const clipboardRel = "platform/actions/clipboardActions.ts";
    const shellRel = "platform/actions/shellActions.ts";
    const action = stripComments(readFileSync(join(SRC_ROOT, actionRel), "utf8"));
    const clipboard = stripComments(readFileSync(join(SRC_ROOT, clipboardRel), "utf8"));
    const shell = stripComments(readFileSync(join(SRC_ROOT, shellRel), "utf8"));
    const violations: string[] = [];

    for (const seam of [
      "normalizeActionDescriptorId",
      "normalizeActionDescriptorLabel",
      "normalizeActionDescriptorText",
      "normalizeActionDescriptor",
    ]) {
      if (!new RegExp(`\\bexport\\s+function\\s+${seam}\\b`).test(action)) {
        violations.push(`${actionRel}: missing descriptor normalizer ${seam}`);
      }
    }
    for (const cap of [
      "ACTION_DESCRIPTOR_ID_MAX_CHARS",
      "ACTION_DESCRIPTOR_LABEL_MAX_CHARS",
      "ACTION_DESCRIPTOR_META_TEXT_MAX_CHARS",
      "ACTION_DESCRIPTOR_ACCELERATOR_MAX_CHARS",
    ]) {
      if (!new RegExp(`\\bexport\\s+const\\s+${cap}\\b`).test(action)) {
        violations.push(`${actionRel}: missing descriptor cap ${cap}`);
      }
    }
    if (
      !/\bnormalizeActionDescriptorId\s*\(\s*value:\s*unknown,\s*fallback:\s*string\s*\)[\s\S]*normalized\.length\s*<=\s*ACTION_DESCRIPTOR_ID_MAX_CHARS/.test(
        action,
      ) ||
      !/\bnormalizeActionDescriptorLabel\s*\([\s\S]*value:\s*unknown[\s\S]*fallback:\s*string[\s\S]*\)[\s\S]*normalized\.length\s*<=\s*ACTION_DESCRIPTOR_LABEL_MAX_CHARS/.test(
        action,
      )
    ) {
      violations.push(`${actionRel}: descriptor id/label normalizers are unbounded`);
    }
    if (
      !/\bexport\s+function\s+normalizeActionDescriptor\s*\(\s*action:\s*unknown\s*,?\s*\):\s*ActionDescriptor\s*\|\s*null[\s\S]*ACTION_DESCRIPTOR_ID_MAX_CHARS[\s\S]*ACTION_DESCRIPTOR_LABEL_MAX_CHARS[\s\S]*\bnormalizeActionDescriptorSection\s*\(\s*record\.section\s*\)[\s\S]*ACTION_DESCRIPTOR_META_TEXT_MAX_CHARS[\s\S]*ACTION_DESCRIPTOR_ACCELERATOR_MAX_CHARS[\s\S]*\bnormalizeAction\s*\(\s*record\.dispatch\s*\)/.test(
        action,
      )
    ) {
      violations.push(
        `${actionRel}: runtime descriptor normalizer trusts resolver output`,
      );
    }
    if (
      !/\bexport\s+function\s+fireActionDescriptor\s*\(\s*action:\s*unknown\s*\):\s*unknown[\s\S]*\bconst\s+normalized\s*=\s*normalizeActionDescriptor\s*\(\s*action\s*\)[\s\S]*!isRunnable\s*\(\s*normalized\s*\)[\s\S]*appDispatcher\.dispatch\s*\(\s*normalized\.dispatch\s*\)/.test(
        action,
      )
    ) {
      violations.push(`${actionRel}: direct descriptor execution bypasses normalizer`);
    }
    if (
      !/\bexport\s+function\s+copyAction\s*\(\s*opts:\s*unknown\s*\)/.test(clipboard) ||
      !/\bnormalizeActionDescriptorId\s*\(\s*record\.id\s*,\s*["']copy["']\s*\)/.test(
        clipboard,
      ) ||
      !/\bnormalizeCopyPayload\s*\(\s*record\s*\)/.test(clipboard)
    ) {
      violations.push(`${clipboardRel}: copy descriptor helper bypasses normalizers`);
    }
    if (
      !/\bexport\s+function\s+dispatchCopy\s*\(\s*payload:\s*unknown\s*\)/.test(
        clipboard,
      ) ||
      !/\bnormalizeCopyPayload\s*\(\s*payload\s*\)/.test(clipboard)
    ) {
      violations.push(
        `${clipboardRel}: direct copy dispatch bypasses payload normalizer`,
      );
    }
    if (
      /\bcopyAction\s*\(\s*opts:\s*\{[\s\S]*\bid:\s*string[\s\S]*\btext:\s*string/.test(
        clipboard,
      )
    ) {
      violations.push(`${clipboardRel}: typed-only copy action helper`);
    }
    if (
      !/\bexport\s+function\s+normalizeShellPayload\s*\(\s*payload:\s*unknown\s*\)/.test(
        shell,
      )
    ) {
      violations.push(`${shellRel}: missing shell payload normalizer`);
    }
    if (
      !/\bexport\s+function\s+revealAction\s*\(\s*opts:\s*unknown\s*\)/.test(shell) ||
      !/\bnormalizeActionDescriptorId\s*\(\s*record\.id\s*,\s*["']reveal["']\s*\)/.test(
        shell,
      ) ||
      !/\bnormalizeShellPayload\s*\(\s*record\s*\)/.test(shell)
    ) {
      violations.push(`${shellRel}: reveal descriptor helper bypasses normalizers`);
    }
    if (
      !/\bexport\s+function\s+openInEditorAction\s*\(\s*opts:\s*unknown\s*\)/.test(
        shell,
      ) ||
      !/\bnormalizeActionDescriptorId\s*\(\s*record\.id\s*,\s*["']open-in-editor["']\s*\)/.test(
        shell,
      ) ||
      !/\bnormalizeShellPayload\s*\(\s*record\s*\)/.test(shell)
    ) {
      violations.push(`${shellRel}: open-in-editor helper bypasses normalizers`);
    }
    for (const typedOnly of [
      "revealAction(opts: { id: string; path: string })",
      "openInEditorAction(opts: {\n  id: string;\n  path: string;",
    ]) {
      if (shell.includes(typedOnly)) {
        violations.push(`${shellRel}: typed-only shell action helper ${typedOnly}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps git read parsing and opsGit calls behind stores-server selectors", () => {
    const violations: string[] = [];
    const engine = stripComments(
      readFileSync(join(SRC_ROOT, "stores/server/engine.ts"), "utf8"),
    );
    const queries = stripComments(
      readFileSync(join(SRC_ROOT, "stores/server/queries.ts"), "utf8"),
    );

    for (const root of ["app", "scene", "platform", "stores/view"] as const) {
      for (const file of sourceFiles(join(SRC_ROOT, root))) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        if (/\bopsGit\s*\(/.test(stripped)) {
          violations.push(`${rel}: direct opsGit call`);
        }
        if (/\bparseGit(?:Status|Numstat|UnifiedDiff)\b/.test(stripped)) {
          violations.push(`${rel}: non-server git output parsing`);
        }
      }
    }
    if (
      !/verb:\s*["']status["']\s*\|\s*["']numstat["']\s*\|\s*["']diff["']\s*\|\s*["']histdiff["']/.test(
        engine,
      )
    ) {
      violations.push("stores/server/engine.ts: opsGit verb contract missing histdiff");
    }
    if (!/\bengineClient\.opsGit\s*\(\s*["']histdiff["']/.test(queries)) {
      violations.push(
        "stores/server/queries.ts: historical diff bypasses opsGit histdiff",
      );
    }
    if (!/\bengineKeys\.gitHistoricalDiff\s*\(/.test(queries)) {
      violations.push(
        "stores/server/queries.ts: historical diff missing scoped query key",
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps backend git ops read-only, bounded, and argument-validated", () => {
    const rel = "engine/crates/vaultspec-api/src/routes/ops.rs";
    const source = readFileSync(resolve(SRC_ROOT, "../..", rel), "utf8");
    const violations: string[] = [];

    if (
      !/const\s+GIT_WHITELIST:\s*&\[\(&str,\s*&\[&str\]\)\]\s*=\s*&\[[\s\S]*\("status",\s*&\["status",\s*"--porcelain=v1",\s*"--branch"\]\)[\s\S]*\("numstat",\s*&\["diff",\s*"--numstat",\s*"--no-color"\]\)[\s\S]*\("diff",\s*&\["diff",\s*"--no-color"\]\)[\s\S]*\("histdiff",\s*&\["diff",\s*"--no-color"\]\)/.test(
        source,
      )
    ) {
      violations.push(
        `${rel}: git whitelist is not the read-only status/numstat/diff/histdiff set`,
      );
    }
    for (const mutating of ["add", "commit", "checkout", "reset", "stash", "merge"]) {
      if (new RegExp(`\\("${mutating}"\\s*,`).test(source)) {
        violations.push(`${rel}: mutating git verb "${mutating}" is whitelisted`);
      }
    }
    if (
      !/const\s+GIT_PATH_VERBS:\s*&\[&str\]\s*=\s*&\["diff",\s*"histdiff"\]/.test(
        source,
      )
    ) {
      violations.push(`${rel}: git path verbs are not limited to diff/histdiff`);
    }
    if (!/const\s+GIT_REV_VERBS:\s*&\[&str\]\s*=\s*&\["histdiff"\]/.test(source)) {
      violations.push(`${rel}: git rev verbs are not limited to histdiff`);
    }
    if (
      !/fn\s+validate_diff_path[\s\S]*path\.is_empty\(\)[\s\S]*path\.starts_with\('-'\)[\s\S]*path\.starts_with\('\/'\)[\s\S]*path\.starts_with\('\\\\'\)[\s\S]*path\.chars\(\)\.nth\(1\)\s*==\s*Some\(':'\)[\s\S]*path\.split\(\['\/',\s*'\\\\'\]\)\.any\(\|seg\|\s*seg\s*==\s*"\.\."\)/.test(
        source,
      )
    ) {
      violations.push(`${rel}: git diff path validation is not bounded`);
    }
    if (
      !/fn\s+validate_rev[\s\S]*rev\.is_empty\(\)[\s\S]*rev\.starts_with\('-'\)[\s\S]*rev\.contains\("\.\."\)[\s\S]*rev\.contains\(char::is_whitespace\)/.test(
        source,
      )
    ) {
      violations.push(`${rel}: historical git rev validation is not bounded`);
    }
    if (
      !/fn\s+git_args_for[\s\S]*args\.push\(validate_rev\(state,\s*from\)\?\)[\s\S]*args\.push\(validate_rev\(state,\s*to\)\?\)[\s\S]*let\s+validated\s*=\s*validate_diff_path\(state,\s*p\)\?[\s\S]*args\.push\("--"\.into\(\)\)[\s\S]*args\.push\(validated\)/.test(
        source,
      )
    ) {
      violations.push(`${rel}: git args are not rev/path validated with -- separation`);
    }
    if (
      !/run_git_bounded\([\s\S]*SIBLING_TIMEOUT[\s\S]*SIBLING_STDOUT_CAP/.test(source)
    ) {
      violations.push(`${rel}: git ops do not use bounded timeout/stdout caps`);
    }
    const gitRouteStart = source.indexOf("pub async fn ops_git");
    const gitRoute = gitRouteStart >= 0 ? source.slice(gitRouteStart) : "";
    const gitEnvelopeStart = gitRoute.indexOf("Ok(super::envelope(");
    const gitEnvelope =
      gitEnvelopeStart >= 0
        ? gitRoute.slice(gitEnvelopeStart, gitEnvelopeStart + 220)
        : "";
    if (
      !gitEnvelope.includes('json!({"verb": name, "output": output})') ||
      !gitEnvelope.includes("super::query_tiers(&cell)")
    ) {
      violations.push(`${rel}: git ops success does not use the shared tiers envelope`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps graph-bounds scene commands behind the Stage projection owner", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app/stage"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
      if (rel === GRAPH_BOUNDS_SCENE_OWNER) continue;

      if (/kind:\s*["']set-bounds["']/.test(stripped)) {
        violations.push(`${rel}: direct graph_bounds scene command`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps GraphControls dashboard reads behind the graph-controls view", () => {
    const rel = "app/stage/GraphControls.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardState\b/.test(statement)) {
        violations.push(`${rel}: raw dashboard-state graph-controls subscription`);
      }
      if (/\buseDashboardStateMutations\b/.test(statement)) {
        violations.push(`${rel}: broad dashboard-state graph-controls mutation`);
      }
    }
    if (
      /\bdashboardState\.data\b|\btimeline_mode\b|\brepresentation_mode\b|\bgraph_bounds\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local dashboard graph-controls projection`);
    }
    if (!/\buseDashboardGraphControlsView\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing stores graph-controls view seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps dashboard graph bounds normalized at read and write seams", () => {
    const dashboardRel = "stores/server/dashboardState.ts";
    const normalizationRel = "stores/server/dashboardStateNormalization.ts";
    const adapterRel = "stores/server/liveAdapters.ts";
    const queriesRel = "stores/server/queries.ts";
    const dashboard = stripComments(readFileSync(join(SRC_ROOT, dashboardRel), "utf8"));
    const normalization = stripComments(
      readFileSync(join(SRC_ROOT, normalizationRel), "utf8"),
    );
    const adapter = stripComments(readFileSync(join(SRC_ROOT, adapterRel), "utf8"));
    const queries = stripComments(readFileSync(join(SRC_ROOT, queriesRel), "utf8"));
    const violations: string[] = [];

    if (!/\bexport\s+function\s+normalizeDashboardGraphBounds\b/.test(normalization)) {
      violations.push(`${normalizationRel}: missing graph-bounds normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeDashboardGraphBounds\s*\(\s*bounds:\s*unknown\s*\)/.test(
        normalization,
      )
    ) {
      violations.push(
        `${normalizationRel}: graph-bounds normalizer accepts typed-only input`,
      );
    }
    if (
      !/\bfunction\s+normalizeDashboardBoundShape\s*\(\s*shape:\s*unknown\s*\)[\s\S]*\bnormalizeStringMember\s*\(\s*shape\s*,\s*DASHBOARD_BOUND_SHAPES\s*\)/.test(
        normalization,
      )
    ) {
      violations.push(
        `${normalizationRel}: bound-shape normalizer bypasses string-member normalizer`,
      );
    }
    if (
      !/\bgraphBoundsPatch\s*\(\s*graph_bounds:\s*unknown\s*\)[\s\S]*\bnormalizeDashboardGraphBounds\s*\(\s*graph_bounds\s*\)/.test(
        dashboard,
      )
    ) {
      violations.push(`${dashboardRel}: graph-bounds patch bypasses normalizer`);
    }
    if (
      !/\bdashboardDocumentStateSeed\b[\s\S]*\bnormalizeDashboardGraphBounds\s*\(/.test(
        dashboard,
      )
    ) {
      violations.push(
        `${dashboardRel}: dashboard seed bypasses graph-bounds normalizer`,
      );
    }
    if (
      !/\badaptDashboardState\b[\s\S]*\bgraph_bounds:\s*normalizeDashboardGraphBounds\s*\(\s*body\.graph_bounds\s*\)/.test(
        adapter,
      )
    ) {
      violations.push(
        `${adapterRel}: dashboard adapter bypasses graph-bounds normalizer`,
      );
    }
    if (
      !/\bderiveDashboardGraphControlsView\b[\s\S]*\bnormalizeDashboardGraphBounds\s*\(/.test(
        queries,
      )
    ) {
      violations.push(
        `${queriesRel}: graph-controls view bypasses graph-bounds normalizer`,
      );
    }
    if (
      !/\bderiveDashboardStageSceneView\b[\s\S]*\bnormalizeDashboardGraphBounds\s*\(/.test(
        queries,
      )
    ) {
      violations.push(
        `${queriesRel}: stage scene view bypasses graph-bounds normalizer`,
      );
    }
    if (dashboard.includes("setGraphBounds: (bounds: DashboardGraphBounds)")) {
      violations.push(`${dashboardRel}: typed-only graph-bounds mutation seam`);
    }
    if (!dashboard.includes("setGraphBounds: (bounds: unknown)")) {
      violations.push(`${dashboardRel}: missing runtime graph-bounds mutation seam`);
    }
    if (
      !/\bsetGraphBounds:\s*\(bounds:\s*unknown\)\s*=>\s*mutation\.mutateAsync\s*\(\s*graphBoundsPatch\s*\(\s*bounds\s*\)\s*\)/.test(
        dashboard,
      )
    ) {
      violations.push(
        `${dashboardRel}: graph-bounds mutation bypasses patch normalizer`,
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps GraphControls popover chrome behind the graph-controls chrome seam", () => {
    const rel = "app/stage/GraphControls.tsx";
    const storeRel = "stores/view/graphControlsChrome.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const store = stripComments(readFileSync(join(SRC_ROOT, storeRel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseGraphControlsChromeStore\b/.test(statement)) {
        violations.push(`${rel}: raw graph-controls chrome store access`);
      }
    }
    if (/\[\s*open\s*,\s*setOpen\s*\]\s*=\s*useState/.test(stripped)) {
      violations.push(`${rel}: local graph settings popover state`);
    }
    if (/\[\s*frozen\s*,\s*setFrozen\s*\]\s*=\s*useState/.test(stripped)) {
      violations.push(`${rel}: local graph freeze state`);
    }
    if (/\[\s*params\s*,\s*setParams\s*\]\s*=\s*useState/.test(stripped)) {
      violations.push(`${rel}: local graph tuning parameter state`);
    }
    if (!/\buseGraphControlsSettingsOpen\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing graph settings open seam`);
    }
    if (!/\btoggleGraphControlsSettingsOpen\b/.test(stripped)) {
      violations.push(`${rel}: missing graph settings toggle seam`);
    }
    if (!/\bsetGraphControlsSettingsOpen\s*\(\s*false\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing graph settings close seam`);
    }
    if (
      !/\bderiveGraphControlsSettingsPopoverView\s*\(\s*open\s*,\s*label\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing graph settings popover view seam`);
    }
    for (const field of [
      "popover.active",
      "popover.ariaExpanded",
      "popover.panelVisible",
      "popover.panelAriaLabel",
      "popover.panelClassName",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing graph settings popover field ${field}`);
      }
    }
    if (
      stripped.includes(
        "absolute bottom-full right-0 z-30 mb-fg-2 flex flex-col gap-fg-2 bg-paper-raised/95 p-fg-3 backdrop-blur-sm",
      )
    ) {
      violations.push(`${rel}: local graph settings popover panel chrome`);
    }
    if (/\bactive=\{open\}/.test(stripped)) {
      violations.push(`${rel}: local graph settings active projection`);
    }
    if (/\baria-expanded=\{open\}/.test(stripped)) {
      violations.push(`${rel}: local graph settings aria-expanded projection`);
    }
    if (/\{open\s*&&\s*\(/.test(stripped)) {
      violations.push(`${rel}: local graph settings panel visibility projection`);
    }
    for (const helper of [
      "useGraphControlsFrozen",
      "useGraphControlsFrozenScope",
      "setGraphControlsFrozen",
    ]) {
      if (!new RegExp(`\\b${helper}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${helper} seam`);
      }
    }
    for (const normalizer of [
      "normalizeGraphControlsOpen",
      "normalizeGraphControlsFrozen",
      "normalizeGraphControlsTuneParams",
    ]) {
      if (!new RegExp(`\\bexport\\s+function\\s+${normalizer}\\b`).test(store)) {
        violations.push(`${storeRel}: missing ${normalizer}`);
      }
    }
    if (
      !/from\s+["']\.\/scopeIdentity["'][\s\S]*\bnormalizeViewStoreSessionString\b/.test(
        store,
      ) ||
      !/\bexport\s+const\s+normalizeGraphControlsFrozenScope\s*=\s*normalizeViewStoreSessionString\b/.test(
        store,
      )
    ) {
      violations.push(
        `${storeRel}: frozen scope bypasses shared view scope normalizer`,
      );
    }
    for (const typedOnly of [
      "setSettingsOpen: (open: boolean)",
      "setFrozen: (frozen: boolean, scope: string | null)",
      "setTuneParams: (params: GraphControlsTuneParams)",
      "patchTuneParams: (patch: Partial<GraphControlsTuneParams>)",
      "setGraphControlsSettingsOpen(open: boolean)",
      "setGraphControlsFrozen(frozen: boolean, scope: string | null)",
      "setGraphControlsTuneParams(params: GraphControlsTuneParams)",
      "patchGraphControlsTuneParams(\n  patch: Partial<GraphControlsTuneParams>",
    ]) {
      if (store.includes(typedOnly)) {
        violations.push(
          `${storeRel}: typed-only graph-controls chrome seam ${typedOnly}`,
        );
      }
    }
    for (const required of [
      "setSettingsOpen: (open: unknown)",
      "setFrozen: (frozen: unknown, scope: unknown)",
      "setTuneParams: (params: unknown)",
      "patchTuneParams: (patch: unknown)",
      "setGraphControlsSettingsOpen(open: unknown)",
      "setGraphControlsFrozen(frozen: unknown, scope: unknown)",
      "setGraphControlsTuneParams(params: unknown)",
      "patchGraphControlsTuneParams(patch: unknown)",
    ]) {
      if (!store.includes(required)) {
        violations.push(`${storeRel}: missing runtime chrome seam ${required}`);
      }
    }
    if (
      !/\bsetSettingsOpen:\s*\(settingsOpen\)\s*=>[\s\S]*\bnormalizeGraphControlsOpen\s*\(\s*settingsOpen\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: settings-open setter bypasses normalizer`);
    }
    if (
      !/\bsetFrozen:\s*\(frozen,\s*frozenScope\)\s*=>[\s\S]*\bnormalizeGraphControlsFrozen\s*\(\s*frozen\s*\)[\s\S]*\bnormalizeGraphControlsFrozenScope\s*\(\s*frozenScope\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: frozen setter bypasses normalizers`);
    }
    if (
      !/\bsetTuneParams:\s*\(tuneParams\)\s*=>[\s\S]*\bnormalizeGraphControlsTuneParams\s*\(\s*tuneParams\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: tune setter bypasses normalizer`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps GraphControls action presentation behind the chrome seam", () => {
    const rel = "app/stage/GraphControls.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (
      !/\bderiveGraphControlsFreezeToggleView\s*\(\s*frozen\s*,\s*freezeAvailable\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing graph freeze action presentation seam`);
    }
    if (!/\bderiveGraphControlsNavigationView\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing graph navigation presentation seam`);
    }
    for (const field of [
      "freezeView.label",
      "freezeView.title",
      "navigationView.ariaLabel",
      "navigationView.zoomIn.label",
      "navigationView.zoomOut.label",
      "navigationView.fitToView.label",
      "navigationView.fitToView.title",
      "navigationView.resetView.label",
      "navigationView.resetView.title",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing graph action presentation field ${field}`);
      }
    }
    for (const localActionChrome of [
      "resume simulation",
      "freeze simulation",
      "resume the Cosmos simulation",
      "pause the Cosmos simulation in place",
      "freeze is available in the Network layout",
      "flex flex-col items-center gap-fg-0-5",
      "zoom in",
      "zoom out",
      "my-fg-0-5 h-px w-5 bg-rule",
      "fit to view",
      "fit all nodes into the viewport",
      "reset view",
      "reset the camera to the origin",
    ]) {
      if (stripped.includes(localActionChrome)) {
        violations.push(`${rel}: local graph action presentation ${localActionChrome}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps GraphControls light-dismiss wiring behind chrome hooks", () => {
    const rel = "app/stage/GraphControls.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const popoverRel = "app/kit/Popover.tsx";
    const popover = stripComments(readFileSync(join(SRC_ROOT, popoverRel), "utf8"));
    const outsideHookRel = "app/chrome/useDismissOnOutsidePointer.ts";
    const outsideHook = stripComments(
      readFileSync(join(SRC_ROOT, outsideHookRel), "utf8"),
    );
    const violations: string[] = [];

    if (/document\.addEventListener\s*\(\s*["']pointerdown["']/.test(stripped)) {
      violations.push(`${rel}: local outside-pointer dismiss listener`);
    }
    if (/document\.addEventListener\s*\(\s*["']keydown["']/.test(stripped)) {
      violations.push(`${rel}: local Escape dismiss listener`);
    }
    if (!/\bPopover\b/.test(stripped)) {
      violations.push(`${rel}: missing shared Popover light-dismiss seam`);
    }
    if (!/\buseDismissOnEscape\s*\(/.test(popover)) {
      violations.push(`${popoverRel}: missing shared Escape dismiss hook`);
    }
    if (!/\buseDismissOnOutsidePointer\s*\(/.test(popover)) {
      violations.push(`${popoverRel}: missing shared outside-pointer dismiss hook`);
    }
    if (
      !/\bexport\s+function\s+normalizeDismissOnOutsidePointerEnabled\b/.test(
        outsideHook,
      )
    ) {
      violations.push(`${outsideHookRel}: missing outside-pointer enabled normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeDismissOnOutsidePointerIgnoreSelector\b/.test(
        outsideHook,
      )
    ) {
      violations.push(
        `${outsideHookRel}: missing outside-pointer ignore-selector normalizer`,
      );
    }
    if (!/\bexport\s+function\s+isInsideIgnoredDismissTarget\b/.test(outsideHook)) {
      violations.push(`${outsideHookRel}: missing safe ignored-target matcher`);
    }
    if (/\benabled\?:\s*boolean\b/.test(outsideHook)) {
      violations.push(`${outsideHookRel}: outside-pointer gate trusts typed boolean`);
    }
    if (/\bignoreSelector\?:\s*string\b/.test(outsideHook)) {
      violations.push(
        `${outsideHookRel}: outside-pointer ignore selector trusts typed string`,
      );
    }
    if (
      !/\bconst\s+normalizedEnabled\s*=\s*normalizeDismissOnOutsidePointerEnabled\s*\(\s*enabled\s*\)/.test(
        outsideHook,
      )
    ) {
      violations.push(`${outsideHookRel}: outside-pointer bypasses enabled normalizer`);
    }
    if (
      !/\bconst\s+normalizedIgnoreSelector\s*=\s*[\s\S]*normalizeDismissOnOutsidePointerIgnoreSelector\s*\(\s*ignoreSelector\s*\)/.test(
        outsideHook,
      )
    ) {
      violations.push(
        `${outsideHookRel}: outside-pointer bypasses ignore-selector normalizer`,
      );
    }
    if (/\bnode\?\.closest\?\.\(\s*ignoreSelector\s*\)/.test(outsideHook)) {
      violations.push(`${outsideHookRel}: outside-pointer uses raw selector match`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps dock workspace layout codec behind the tab store seam", () => {
    const rel = "app/stage/useWorkspacePersistence.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const dockWorkspace = readFileSync(
      join(SRC_ROOT, "app/stage/DockWorkspace.tsx"),
      "utf8",
    );
    const tabsSource = readFileSync(join(SRC_ROOT, "stores/view/tabs.ts"), "utf8");
    const violations: string[] = [];
    const imports = importStatements(stripped).join("\n");

    if (/\bJSON\.(?:parse|stringify)\s*\(/.test(stripped)) {
      violations.push(`${rel}: app-layer workspace_layout JSON codec`);
    }
    if (/\bfunction\s+(?:parseWorkspaceTabs|serializeWorkspaceTabs)\b/.test(stripped)) {
      violations.push(`${rel}: app-layer workspace_layout codec function`);
    }
    if (
      !/from\s+["']\.\.\/\.\.\/stores\/view\/tabs["']/.test(imports) ||
      !/\bparseWorkspaceTabs\b/.test(imports) ||
      !/\bserializeWorkspaceTabs\b/.test(imports) ||
      !/\bshouldPersistWorkspaceTabsLayout\b/.test(imports)
    ) {
      violations.push(`${rel}: missing tab-store workspace_layout codec seam`);
    }
    if (
      !/from\s+["']\.\.\/\.\.\/stores\/view\/viewStore["']/.test(imports) ||
      !/\bnormalizeViewStoreSessionString\b/.test(imports)
    ) {
      violations.push(`${rel}: missing workspace persistence scope normalizer`);
    }
    if (
      /\buseWorkspacePersistence\s*\(\s*scope:\s*string\s*\|\s*null\s*\)/.test(stripped)
    ) {
      violations.push(`${rel}: workspace persistence trusts typed-only scope`);
    }
    if (!/\buseWorkspacePersistence\s*\(\s*scope:\s*unknown\s*\)/.test(stripped)) {
      violations.push(`${rel}: workspace persistence missing runtime scope seam`);
    }
    if (
      !/\bconst\s+normalizedScope\s*=\s*normalizeViewStoreSessionString\s*\(\s*scope\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: workspace persistence bypasses scope normalizer`);
    }
    if (
      !/\bshouldPersistWorkspaceTabsLayout\s*\(\s*[\s\S]*lastPersistedRef\.current\s*,[\s\S]*normalizedScope\s*,[\s\S]*next[\s\S]*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing tab-store workspace_layout persist decision`);
    }
    if (/\bif\s*\(\s*!\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: workspace persistence gates raw scope truthiness`);
    }
    if (
      !/\buseDurableWorkspaceLayout\s*\(\s*normalizedScope\s*\)/.test(stripped) ||
      !/\bnormalizedScope\s*===\s*null/.test(stripped) ||
      !/\blastPersistedRef\.current\s*=\s*\{\s*scope:\s*normalizedScope,\s*blob:\s*next\s*\}/.test(
        stripped,
      ) ||
      !/\bpersistLayoutRef\.current\s*\(\s*normalizedScope,\s*next\s*\)/.test(stripped)
    ) {
      violations.push(`${rel}: workspace persistence uses raw scope identity`);
    }
    if (/\bparseWorkspaceTabs\s*\(\s*next\s*\)\?\.openDocs\.length/.test(stripped)) {
      violations.push(`${rel}: app-layer workspace_layout empty-persist decision`);
    }
    if (
      /persist \+ restore the open-tab set per scope through dashboard-state/.test(
        dockWorkspace,
      )
    ) {
      violations.push(
        "app/stage/DockWorkspace.tsx: stale dashboard-state dock persistence comment",
      );
    }
    if (/dashboard panel-state (?:workspace )?blob/.test(tabsSource)) {
      violations.push(
        "stores/view/tabs.ts: stale dashboard-state workspace_layout comment",
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps durable workspace layout reads scoped to the accepted session scope", () => {
    const rel = "stores/server/sessionContext.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const adapterRel = "stores/server/liveAdapters.ts";
    const adapter = stripComments(readFileSync(join(SRC_ROOT, adapterRel), "utf8"));
    const violations: string[] = [];

    if (!/\bfunction\s+deriveDurableWorkspaceLayoutView\b/.test(stripped)) {
      violations.push(`${rel}: missing durable workspace layout selector`);
    }
    if (
      !/\bexport\s+function\s+normalizeDurableWorkspaceLayoutWrite\s*\(\s*scope:\s*unknown,\s*blob:\s*unknown/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing durable workspace layout write normalizer`);
    }
    if (
      /\busePersistWorkspaceLayout\s*\(\s*\):\s*\(\s*scope:\s*string,\s*blob:\s*string\s*\)\s*=>\s*void/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: durable workspace layout persist is typed-only`);
    }
    if (
      !/\bconst\s+write\s*=\s*normalizeDurableWorkspaceLayoutWrite\s*\(\s*scope\s*,\s*blob\s*\)[\s\S]*write\.scope\s*===\s*null\s*\|\|\s*write\.blob\s*===\s*null[\s\S]*set_workspace_layout:\s*\{\s*scope:\s*write\.scope,\s*layout:\s*write\.blob\s*\}/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: durable workspace layout persist bypasses normalizer`);
    }
    if (
      !/\bconst\s+normalizedScope\s*=\s*normalizeViewStoreSessionString\s*\(\s*scope\s*\)/.test(
        stripped,
      ) ||
      !/\bconst\s+activeScope\s*=\s*normalizeViewStoreSessionString\s*\(\s*session\?\.active_scope\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing accepted active-scope normalization`);
    }
    if (
      !/\bconst\s+scopeAccepted\s*=\s*normalizedScope\s*!==\s*null\s*&&\s*activeScope\s*===\s*normalizedScope\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: durable layout is not gated by accepted scope`);
    }
    if (
      !/\bscopeAccepted\s*\?\s*normalizeWorkspaceLayoutBlob\s*\(\s*context\.workspace_layout\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: durable layout blob bypasses accepted-scope gate`);
    }
    if (!/\bnormalizeWorkspaceLayoutBlob\b/.test(stripped)) {
      violations.push(`${rel}: durable layout blob bypasses workspace-layout normalizer`);
    }
    if (!/\bsettled:\s*sessionReady\s*&&\s*scopeAccepted\b/.test(stripped)) {
      violations.push(`${rel}: durable layout settled flag is not scope-gated`);
    }
    if (
      !/\breturn\s+deriveDurableWorkspaceLayoutView\s*\(\s*scope\s*,\s*session\.isSuccess\s*,\s*session\.data\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: hook bypasses durable layout selector`);
    }
    for (const seam of [
      "normalizeViewStoreSessionString",
      "normalizeViewStoreSessionStringList",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${seam} session projection normalizer`);
      }
    }
    if (
      !/\bfunction\s+deriveAcceptedScopeContextMirror[\s\S]*\bconst\s+normalizedWriteScope\s*=\s*normalizeViewStoreSessionString\s*\(\s*writeScope\s*\)[\s\S]*\bconst\s+normalizedActiveScope\s*=\s*normalizeViewStoreSessionString\s*\(\s*activeScope\s*\)[\s\S]*\bconst\s+normalizedSessionScope\s*=\s*normalizeViewStoreSessionString\s*\(\s*session\.active_scope\s*\)[\s\S]*folder:\s*normalizeViewStoreSessionString\s*\(\s*context\.folder\s*\)[\s\S]*featureTags:\s*normalizeViewStoreSessionStringList\s*\(\s*context\.feature_tags\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: accepted scope-context mirror trusts session fields`);
    }
    if (
      !/\bfunction\s+restoredSessionContextSeed[\s\S]*normalizeViewStoreSessionString\s*\(\s*pickedScope\s*\)[\s\S]*workspace:\s*[\s\S]*normalizeViewStoreSessionString\s*\(\s*session\.active_workspace\s*\)[\s\S]*normalizeViewStoreSessionString\s*\(\s*session\.workspace\s*\)[\s\S]*scope:\s*normalizeViewStoreSessionString\s*\(\s*session\.active_scope\s*\)[\s\S]*folder:\s*normalizeViewStoreSessionString\s*\(\s*context\.folder\s*\)[\s\S]*featureTags:\s*normalizeViewStoreSessionStringList\s*\(\s*context\.feature_tags\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: restored session seed trusts session fields`);
    }
    if (
      /\bfolder:\s*session\.scope_context\.folder\b/.test(stripped) ||
      /\bfeatureTags:\s*session\.scope_context\.feature_tags\b/.test(stripped) ||
      /\bscope:\s*session\.active_scope\s*\|\|\s*null\b/.test(stripped)
    ) {
      violations.push(`${rel}: raw session context projection`);
    }
    if (!/\bfunction\s+adaptScopeContext\b[\s\S]*\bworkspace_layout\b/.test(adapter)) {
      violations.push(`${adapterRel}: session adapter drops workspace_layout`);
    }
    if (
      !/from\s+["']\.\.\/workspaceLayout["'][\s\S]*\bnormalizeWorkspaceLayoutBlob\b/.test(
        adapter,
      ) ||
      !/\bconst\s+workspaceLayout\s*=\s*normalizeWorkspaceLayoutBlob\s*\(\s*value\.workspace_layout\s*\)/.test(
        adapter,
      )
    ) {
      violations.push(`${adapterRel}: workspace_layout adapter is not normalized`);
    }
    for (const seam of ["normalizeSessionString", "normalizeSessionStringList"]) {
      if (!new RegExp(`\\bfunction\\s+${seam}\\b`).test(adapter)) {
        violations.push(`${adapterRel}: missing ${seam} session adapter seam`);
      }
    }
    if (
      !/from\s+["']\.\/scopeIdentity["'][\s\S]*\bSCOPE_ID_MAX_CHARS\b/.test(
        adapter,
      ) ||
      !/\bfunction\s+normalizeSessionString\s*\(\s*value:\s*unknown\s*\):\s*string\s*\|\s*undefined[\s\S]*\bvalue\.trim\s*\(\s*\)[\s\S]*normalized\.length\s*<=\s*SCOPE_ID_MAX_CHARS/.test(
        adapter,
      )
    ) {
      violations.push(`${adapterRel}: session string normalizer is unbounded`);
    }
    if (
      !/\bfunction\s+normalizeSessionStringList\s*\(\s*value:\s*unknown\s*\):\s*string\[\][\s\S]*\bconst\s+normalized\s*=\s*normalizeSessionString\s*\(\s*entry\s*\)[\s\S]*\bseen\.has\s*\(\s*normalized\s*\)[\s\S]*out\.push\s*\(\s*normalized\s*\)/.test(
        adapter,
      )
    ) {
      violations.push(
        `${adapterRel}: session string-list normalizer preserves raw entries`,
      );
    }
    if (
      !/\bSESSION_STRING_LIST_MAX_ITEMS\b/.test(adapter) ||
      !/\bout\.length\s*>=\s*SESSION_STRING_LIST_MAX_ITEMS/.test(adapter)
    ) {
      violations.push(`${adapterRel}: session string-list accumulator is unbounded`);
    }
    if (
      !/\bfunction\s+adaptScopeContext\b[\s\S]*\bfolder\s*=\s*normalizeSessionString\s*\(\s*value\.folder\s*\)\s*\?\?\s*null[\s\S]*feature_tags:\s*normalizeSessionStringList\s*\(\s*value\.feature_tags\s*\)/.test(
        adapter,
      )
    ) {
      violations.push(`${adapterRel}: scope context bypasses session normalizers`);
    }
    if (
      !/\bexport function adaptSession\b[\s\S]*workspace:\s*normalizeSessionString\s*\(\s*body\.workspace\s*\)\s*\?\?\s*["'][\s\S]*active_scope:\s*normalizeSessionString\s*\(\s*body\.active_scope\s*\)\s*\?\?\s*["'][\s\S]*active_workspace:\s*normalizeSessionString\s*\(\s*body\.active_workspace\s*\)\s*\?\?\s*null[\s\S]*recents:\s*normalizeSessionStringList\s*\(\s*body\.recents\s*\)/.test(
        adapter,
      )
    ) {
      violations.push(`${adapterRel}: session adapter bypasses session normalizers`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps backend session scope-context and workspace-layout writes merged", () => {
    const rel = "engine/crates/vaultspec-api/src/routes/session.rs";
    const source = stripComments(readFileSync(resolve(SRC_ROOT, "../..", rel), "utf8"));
    const putStart = source.indexOf("pub async fn put_session");
    const putEnd = source.indexOf("// --- settings", putStart);
    const putSession = putStart >= 0 ? source.slice(putStart, putEnd) : "";
    const ctxStart = putSession.indexOf("if let Some(ctx)");
    const layoutStart =
      ctxStart >= 0 ? putSession.indexOf("if let Some(layout)", ctxStart) : -1;
    const recentStart = putSession.indexOf("if let Some(value)");
    const ctxBlock =
      ctxStart >= 0 && layoutStart > ctxStart
        ? putSession.slice(ctxStart, layoutStart)
        : "";
    const layoutBlock =
      layoutStart >= 0 && recentStart > layoutStart
        ? putSession.slice(layoutStart, recentStart)
        : "";
    const violations: string[] = [];

    if (putSession.length === 0) {
      violations.push(`${rel}: missing put_session route`);
    }
    if (
      !/\bset_workspace_layout\s*:\s*Option\s*<\s*WorkspaceLayoutUpdate\s*>/.test(
        source,
      )
    ) {
      violations.push(`${rel}: missing workspace-layout session update field`);
    }
    if (!/\bconst\s+MAX_WORKSPACE_LAYOUT_LEN\b/.test(source)) {
      violations.push(`${rel}: workspace-layout blob is not ingress bounded`);
    }
    if (
      !/\bset_workspace_layout[\s\S]*?layout\.len\(\)\s*>\s*MAX_WORKSPACE_LAYOUT_LEN/.test(
        putSession,
      )
    ) {
      violations.push(`${rel}: workspace-layout length is not checked before persist`);
    }
    if (/\bScopeContext\s*\{/.test(ctxBlock)) {
      violations.push(
        `${rel}: scope_context write rebuilds and can drop workspace_layout`,
      );
    }
    if (
      !/\blet\s+mut\s+context\s*=\s*us\.scope_context\s*\(\s*&workspace\s*,\s*&target\s*\)\s*\.unwrap_or_default\s*\(\s*\)/.test(
        ctxBlock,
      )
    ) {
      violations.push(`${rel}: scope_context write does not merge from stored context`);
    }
    if (!/\bcontext\.active_folder\s*=\s*ctx\.folder\.clone\s*\(\s*\)/.test(ctxBlock)) {
      violations.push(`${rel}: scope_context write does not own folder field`);
    }
    if (
      !/\bcontext\.feature_tags\s*=\s*ctx\.feature_tags\.clone\s*\(\s*\)/.test(ctxBlock)
    ) {
      violations.push(`${rel}: scope_context write does not own feature-tag field`);
    }
    if (/\bScopeContext\s*\{/.test(layoutBlock)) {
      violations.push(
        `${rel}: workspace-layout write rebuilds and can drop folder context`,
      );
    }
    if (
      !/\blet\s+mut\s+context\s*=\s*us\.scope_context\s*\(\s*&workspace\s*,\s*&target\s*\)\s*\.unwrap_or_default\s*\(\s*\)/.test(
        layoutBlock,
      )
    ) {
      violations.push(
        `${rel}: workspace-layout write does not merge from stored context`,
      );
    }
    if (
      !/\bcontext\.workspace_layout\s*=\s*layout\.layout\.clone\s*\(\s*\)/.test(
        layoutBlock,
      )
    ) {
      violations.push(`${rel}: workspace-layout write does not own layout field`);
    }
    if (/\bcontext\.(?:active_folder|feature_tags)\s*=/.test(layoutBlock)) {
      violations.push(`${rel}: workspace-layout write mutates folder context`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps Stage dashboard scene reads behind the stage-scene view", () => {
    const rel = "app/stage/Stage.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardState\b/.test(statement)) {
        violations.push(`${rel}: raw dashboard-state scene subscription`);
      }
      if (/\buseDashboardStateMutations\b/.test(statement)) {
        violations.push(`${rel}: broad dashboard-state scene mutation`);
      }
      if (/\bdashboardGraphQueryVariables\b/.test(statement)) {
        violations.push(`${rel}: app-layer graph query variable projection`);
      }
      if (/\bdashboardSelectionId\b/.test(statement)) {
        violations.push(`${rel}: app-layer dashboard selection projection`);
      }
      if (/\bstageGraphFilterFromDashboardState\b/.test(statement)) {
        violations.push(`${rel}: app-layer stage graph filter projection`);
      }
    }
    if (
      /\bdashboardState\.data\b|\bselected_ids\b|\btimeline_mode\b|\brepresentation_mode\b|\bgraph_bounds\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local dashboard scene projection`);
    }
    if (!/\buseDashboardStageSceneView\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing stores stage-scene view seam`);
    }
    if (!/\buseDashboardStageSceneIntent\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing stores stage-scene intent seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps Stage scene command payloads behind stage-scene command helpers", () => {
    const rel = "app/stage/Stage.tsx";
    const commandsRel = "stores/view/stageSceneCommands.ts";
    const mappingRel = "scene/sceneMapping.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const commands = stripComments(readFileSync(join(SRC_ROOT, commandsRel), "utf8"));
    const mapping = stripComments(readFileSync(join(SRC_ROOT, mappingRel), "utf8"));
    const violations: string[] = [];

    for (const helper of [
      "stageSetDataCommand",
      "stageRepresentationCommand",
      "stageBoundsCommand",
      "stageOverlaysCommand",
    ]) {
      if (!new RegExp(`\\b${helper}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${helper} seam`);
      }
    }
    for (const commandKind of [
      "set-data",
      "set-representation-mode",
      "set-bounds",
      "set-overlays",
    ]) {
      if (new RegExp(`kind:\\s*["']${commandKind}["']`).test(stripped)) {
        violations.push(`${rel}: local ${commandKind} command projection`);
      }
    }
    if (/\bsliceToScene\s*\(/.test(stripped)) {
      violations.push(`${rel}: local set-data scene mapping`);
    }
    if (/graphBounds\.size\s*>\s*0/.test(stripped)) {
      violations.push(`${rel}: local graph-bounds size projection`);
    }
    if (/overlays\.featureCountries|overlays\.featureHulls/.test(stripped)) {
      violations.push(`${rel}: local overlay command payload projection`);
    }
    for (const typedOnly of [
      "stageSetDataCommand(slice: {\n  nodes: EngineNode[]",
      "stageRepresentationCommand(mode: RepresentationMode)",
      "stageBoundsCommand(\n  bounds: DashboardGraphBounds | undefined",
    ]) {
      if (commands.includes(typedOnly)) {
        violations.push(`${commandsRel}: typed-only scene command seam ${typedOnly}`);
      }
    }
    if (!/\bstageSetDataCommand\s*\(\s*slice:\s*unknown\s*\)/.test(commands)) {
      violations.push(`${commandsRel}: set-data command accepts typed-only input`);
    }
    if (!/\bstageRepresentationCommand\s*\(\s*mode:\s*unknown\s*\)/.test(commands)) {
      violations.push(
        `${commandsRel}: representation command accepts typed-only input`,
      );
    }
    if (!/\bstageBoundsCommand\s*\(\s*bounds:\s*unknown\s*\)/.test(commands)) {
      violations.push(`${commandsRel}: bounds command accepts typed-only input`);
    }
    if (
      !/\bstageRepresentationCommand\b[\s\S]*\bnormalizeDashboardRepresentationMode\s*\(\s*mode\s*\)/.test(
        commands,
      )
    ) {
      violations.push(`${commandsRel}: representation command bypasses normalizer`);
    }
    if (
      !/\bstageBoundsCommand\b[\s\S]*\bnormalizeDashboardGraphBounds\s*\(\s*bounds\s*\)/.test(
        commands,
      )
    ) {
      violations.push(`${commandsRel}: bounds command bypasses normalizer`);
    }
    if (mapping.includes("sliceToScene(slice: { nodes: EngineNode[]")) {
      violations.push(`${mappingRel}: slice mapper accepts typed-only input`);
    }
    if (!/\bsliceToScene\s*\(\s*slice:\s*unknown\s*\)/.test(mapping)) {
      violations.push(`${mappingRel}: slice mapper lacks runtime input seam`);
    }
    if (
      !/\bsliceToScene\b[\s\S]*Array\.isArray\s*\(\s*record\.nodes\s*\)[\s\S]*normalizeGraphDeltaNode\s*\(\s*node\s*\)[\s\S]*Array\.isArray\s*\(\s*record\.edges\s*\)[\s\S]*normalizeGraphDeltaEdge\s*\(\s*edge\s*\)/.test(
        mapping,
      )
    ) {
      violations.push(`${mappingRel}: slice mapper bypasses graph row normalizers`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps Stage scene event interpretation behind the stores view bridge", () => {
    const rel = "app/stage/Stage.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const bridge = stripComments(
      readFileSync(join(SRC_ROOT, "stores/view/stageSceneEvents.ts"), "utf8"),
    );
    const violations: string[] = [];

    if (!/\bhandleStageSceneEvent\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing Stage scene-event bridge`);
    }
    if (/\bdashboardMutations\b/.test(stripped)) {
      violations.push(`${rel}: broad dashboard mutation object passed to scene bridge`);
    }
    if (/\buseDashboardStateMutations\b/.test(bridge)) {
      violations.push(
        "stores/view/stageSceneEvents.ts: broad dashboard mutation hook type",
      );
    }
    if (/\bdashboardMutations\b/.test(bridge)) {
      violations.push(
        "stores/view/stageSceneEvents.ts: broad dashboard mutation bridge name",
      );
    }
    if (!/\bstageSceneIntent\b/.test(stripped)) {
      violations.push(`${rel}: missing stage scene intent bridge`);
    }
    if (!/\bstageSceneIntent\b/.test(bridge)) {
      violations.push("stores/view/stageSceneEvents.ts: missing stage scene intent");
    }
    if (
      /descendFeatureTag:\s*\(featureTag:\s*string\)/.test(bridge) ||
      /setRepresentationMode:\s*\(mode:\s*RepresentationMode\)/.test(bridge)
    ) {
      violations.push(
        "stores/view/stageSceneEvents.ts: typed-only scene intent bridge",
      );
    }
    if (
      !/descendFeatureTag:\s*\(featureTag:\s*unknown\)/.test(bridge) ||
      !/setRepresentationMode:\s*\(mode:\s*unknown\)/.test(bridge)
    ) {
      violations.push(
        "stores/view/stageSceneEvents.ts: missing runtime scene intent bridge",
      );
    }
    for (const localIntent of [
      "setHoveredNodeId",
      "openGraphNodeFromScene",
      "openContextMenu",
      "nodeEntityView",
    ]) {
      if (new RegExp(`\\b${localIntent}\\b`).test(stripped)) {
        violations.push(`${rel}: local scene-event intent ${localIntent}`);
      }
      if (!new RegExp(`\\b${localIntent}\\b`).test(bridge)) {
        violations.push(
          `stores/view/stageSceneEvents.ts: missing scene-event intent ${localIntent}`,
        );
      }
    }
    if (!/\bexpandWorkingSet\b/.test(bridge)) {
      violations.push(
        "stores/view/stageSceneEvents.ts: missing scene-event intent expandWorkingSet",
      );
    }
    for (const sceneEventKind of ["hover", "open", "expand", "context-menu"]) {
      if (
        new RegExp(`event\\.kind\\s*===\\s*["']${sceneEventKind}["']`).test(stripped)
      ) {
        violations.push(`${rel}: local ${sceneEventKind} scene-event interpretation`);
      }
    }
    if (/event\.kind\s*===\s*["']representation-mode-changed["']/.test(stripped)) {
      violations.push(`${rel}: local representation echo interpretation`);
    }
    if (!/\bshouldSyncAppliedRepresentationMode\b/.test(bridge)) {
      violations.push(
        "stores/view/stageSceneEvents.ts: missing representation echo seam",
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps graph-overlay scene commands behind the Stage projection owner", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app/stage"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
      if (rel === GRAPH_OVERLAYS_SCENE_OWNER) continue;

      if (/kind:\s*["']set-overlays["']/.test(stripped)) {
        violations.push(`${rel}: direct graph overlays scene command`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps graph-representation scene commands behind the Stage projection owner", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app/stage"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
      if (rel === GRAPH_REPRESENTATION_SCENE_OWNER) continue;

      if (/kind:\s*["']set-representation-mode["']/.test(stripped)) {
        violations.push(`${rel}: direct graph representation scene command`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps graph-overlay view state behind the graph overlay seam", () => {
    const violations: string[] = [];
    const graphOverlaysRel = "stores/view/graphOverlays.ts";
    const viewRel = "stores/view/viewStore.ts";
    const stageCommandsRel = "stores/view/stageSceneCommands.ts";
    const graphOverlays = stripComments(
      readFileSync(join(SRC_ROOT, graphOverlaysRel), "utf8"),
    );
    const view = stripComments(readFileSync(join(SRC_ROOT, viewRel), "utf8"));
    const stageCommands = stripComments(
      readFileSync(join(SRC_ROOT, stageCommandsRel), "utf8"),
    );

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\.overlays\b/.test(stripped)) {
        violations.push(`${rel}: raw graph overlay state read`);
      }
      if (/\.setOverlays\s*\(/.test(stripped)) {
        violations.push(`${rel}: raw graph overlay state write`);
      }
    }

    if (!/\bexport\s+function\s+normalizeGraphOverlays\b/.test(view)) {
      violations.push(`${viewRel}: missing graph overlay normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeGraphOverlays\s*\(\s*overlays:\s*unknown\s*\)/.test(
        view,
      )
    ) {
      violations.push(`${viewRel}: graph overlay normalizer accepts typed-only input`);
    }
    if (
      !/\bfunction\s+graphOverlayInputRecord\s*\(\s*value:\s*unknown\s*\)/.test(view)
    ) {
      violations.push(`${viewRel}: missing unknown graph overlay record reader`);
    }
    if (
      !/\bsetOverlays:\s*\([^)]*\)\s*=>\s*set\s*\(\s*\{\s*overlays:\s*normalizeGraphOverlays\s*\(/.test(
        view,
      )
    ) {
      violations.push(`${viewRel}: setOverlays bypasses graph overlay normalizer`);
    }
    if (
      !/\buseGraphOverlays\b[\s\S]*\buseViewStore\s*\(\s*\(\s*state\s*\)\s*=>\s*state\.overlays\s*\)[\s\S]*\bnormalizeGraphOverlays\s*\(/.test(
        graphOverlays,
      )
    ) {
      violations.push(`${graphOverlaysRel}: graph overlay read bypasses normalizer`);
    }
    if (!/\bsetGraphOverlays\s*\(\s*overlays:\s*unknown\s*\)/.test(graphOverlays)) {
      violations.push(
        `${graphOverlaysRel}: graph overlay write accepts typed-only input`,
      );
    }
    for (const typedOnly of [
      "setOverlays: (overlays: GraphOverlayState)",
      "setGraphOverlays(overlays: GraphOverlayState)",
      "normalizeGraphOverlays(\n  overlays: GraphOverlayInput",
      "stageOverlaysCommand(overlays: GraphOverlayState)",
    ]) {
      if (
        view.includes(typedOnly) ||
        graphOverlays.includes(typedOnly) ||
        stageCommands.includes(typedOnly)
      ) {
        violations.push(
          `${graphOverlaysRel}: typed-only graph overlay seam ${typedOnly}`,
        );
      }
    }
    if (!/\bstageOverlaysCommand\s*\(\s*overlays:\s*unknown\s*\)/.test(stageCommands)) {
      violations.push(
        `${stageCommandsRel}: overlay scene command accepts typed-only input`,
      );
    }
    if (
      !/\bstageOverlaysCommand\b[\s\S]*\bnormalizeGraphOverlays\s*\(\s*overlays\s*\)/.test(
        stageCommands,
      )
    ) {
      violations.push(`${stageCommandsRel}: overlay scene command bypasses normalizer`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps Stage visual state behind named view seams", () => {
    const rel = "app/stage/Stage.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (
        /\b(?:useViewStore|usePinStore|useFilterSidebarStore|useGraphControlsChromeStore)\b/.test(
          statement,
        )
      ) {
        violations.push(`${rel}: raw visual state store import`);
      }
    }
    for (const required of [
      "useGraphOverlays",
      "usePinnedDiscoveries",
      "bindPinsToScene",
      "useWorkingSet",
      "handleStageSceneEvent",
      "useGraphAffordanceReconciliation",
    ]) {
      if (!new RegExp(`\\b${required}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${required} seam`);
      }
    }
    if (/\buseViewStore\b|\busePinStore\b|\buseFilterSidebarStore\b/.test(stripped)) {
      violations.push(`${rel}: raw visual state store access`);
    }
    if (/\.(?:setOverlays|togglePin|setOpen|toggle|close)\s*\(/.test(stripped)) {
      violations.push(`${rel}: raw visual state store method`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps graph-affordance pruning behind the graph-affordance seam", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\.pruneNodeAffordances\s*\(/.test(stripped)) {
        violations.push(`${rel}: raw graph-affordance prune`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps graph-affordance reconciliation owned by the merged Stage model", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const stripped = stripComments(readFileSync(file, "utf8"));
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
      if (rel === "app/stage/Stage.tsx") continue;

      for (const statement of importStatements(stripped)) {
        if (
          /\b(?:reconcileGraphAffordances|useGraphAffordanceReconciliation)\b/.test(
            statement,
          )
        ) {
          violations.push(
            `${rel}: graph-affordance reconciliation outside Stage owner`,
          );
        }
      }
      if (/\breconcileGraphAffordances\s*\(/.test(stripped)) {
        violations.push(`${rel}: graph-affordance reconciliation outside Stage owner`);
      }
    }

    const stage = stripComments(
      readFileSync(join(SRC_ROOT, "app/stage/Stage.tsx"), "utf8"),
    );
    if (!/\buseGraphAffordanceReconciliation\b/.test(stage)) {
      violations.push(
        "app/stage/Stage.tsx: missing graph-affordance reconciliation seam",
      );
    }
    if (/\bmergedNodeIds\b|\bmerged\.nodes\.map\s*\(/.test(stage)) {
      violations.push("app/stage/Stage.tsx: local graph-affordance id projection");
    }
    if (!/\buseGraphAffordanceReconciliation\s*\(\s*merged\s*\)/.test(stage)) {
      violations.push(
        "app/stage/Stage.tsx: reconciliation is not fed by merged graph model",
      );
    }
    const seam = stripComments(
      readFileSync(join(SRC_ROOT, "stores/view/graphAffordances.ts"), "utf8"),
    );
    if (!/\bnormalizeNodeIds\b/.test(seam)) {
      violations.push(
        "stores/view/graphAffordances.ts: graph-affordance ids bypass node-id normalizer",
      );
    }
    if (
      !/\bgraphAffordanceNodeIds\b[\s\S]*Array\.isArray\s*\(\s*graph\.nodes\s*\)[\s\S]*normalizeNodeIds\s*\([\s\S]*\.nodes\.map\s*\(\s*\(\s*node\s*\)\s*=>\s*node\?\.id\s*\)[\s\S]*graph\.nodes\.length/.test(
        seam,
      )
    ) {
      violations.push(
        "stores/view/graphAffordances.ts: missing normalized graph-owned node-id projection",
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps dashboard selection scene projection behind the selection seam", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/kind:\s*["']set-selected["']/.test(stripped)) {
        violations.push(`${rel}: raw selected-ring scene command`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps dashboard node selection out of the local selection binder", () => {
    const rel = "stores/view/selection.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];
    const start = stripped.indexOf("export function bindSelectionToScene");
    const end = start >= 0 ? stripped.indexOf("\nexport function", start + 1) : -1;
    const binder = start >= 0 ? stripped.slice(start, end >= 0 ? end : undefined) : "";

    if (binder.length === 0) {
      violations.push(`${rel}: missing bindSelectionToScene seam`);
    }
    if (/\bselectedIds\b/.test(binder)) {
      violations.push(`${rel}: dashboard selected ids in local selection binder`);
    }
    if (!/\bprojectDashboardSelectionToScene\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing dashboard selection scene projection seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps selected-id normalization centralized at dashboard and scene seams", () => {
    const nodeIdsRel = "platform/graph/nodeIds.ts";
    const storeNodeIdsRel = "stores/nodeIds.ts";
    const dashboardRel = "stores/server/dashboardState.ts";
    const dashboardNormalizationRel = "stores/server/dashboardStateNormalization.ts";
    const selectionRel = "stores/view/selection.ts";
    const graphWalkRel = "app/stage/graphWalk.ts";
    const stageRel = "app/stage/Stage.tsx";
    const nodeIds = stripComments(readFileSync(join(SRC_ROOT, nodeIdsRel), "utf8"));
    const storeNodeIds = stripComments(
      readFileSync(join(SRC_ROOT, storeNodeIdsRel), "utf8"),
    );
    const dashboard = stripComments(readFileSync(join(SRC_ROOT, dashboardRel), "utf8"));
    const dashboardNormalization = stripComments(
      readFileSync(join(SRC_ROOT, dashboardNormalizationRel), "utf8"),
    );
    const selection = stripComments(readFileSync(join(SRC_ROOT, selectionRel), "utf8"));
    const graphWalk = stripComments(readFileSync(join(SRC_ROOT, graphWalkRel), "utf8"));
    const stage = stripComments(readFileSync(join(SRC_ROOT, stageRel), "utf8"));
    const violations: string[] = [];

    if (!/\bexport\s+function\s+normalizeNodeId\b/.test(nodeIds)) {
      violations.push(`${nodeIdsRel}: missing single node-id normalizer`);
    }
    if (!/\bexport\s+function\s+normalizeNodeIds\b/.test(nodeIds)) {
      violations.push(`${nodeIdsRel}: missing node-id list normalizer`);
    }
    if (
      !/\bexport\s+const\s+NODE_ID_MAX_CHARS\b/.test(nodeIds) ||
      !/\bexport\s+function\s+normalizeNodeId\s*\(\s*raw:\s*unknown\s*\)[\s\S]*\bconst\s+id\s*=\s*raw\.trim\s*\(\s*\)[\s\S]*id\.length\s*<=\s*NODE_ID_MAX_CHARS/.test(
        nodeIds,
      )
    ) {
      violations.push(`${nodeIdsRel}: node id normalizer is unbounded`);
    }
    if (!/from\s+["']\.\.\/platform\/graph\/nodeIds["']/.test(storeNodeIds)) {
      violations.push(`${storeNodeIdsRel}: stores node-id facade bypasses platform seam`);
    }
    if (!/\bNODE_ID_MAX_CHARS\b/.test(storeNodeIds)) {
      violations.push(`${storeNodeIdsRel}: stores node-id facade hides id cap`);
    }
    if (!/from\s+["']\.\.\/nodeIds["']/.test(dashboardNormalization)) {
      violations.push(
        `${dashboardNormalizationRel}: selected ids do not use shared node-id helper`,
      );
    }
    if (
      !/\bexport\s+const\s+MAX_DASHBOARD_SELECTED_IDS\s*=\s*256\b/.test(
        dashboardNormalization,
      )
    ) {
      violations.push(`${dashboardNormalizationRel}: missing selected-id cap mirror`);
    }
    if (
      !/\bexport\s+function\s+normalizeDashboardSelectedIds\b/.test(
        dashboardNormalization,
      )
    ) {
      violations.push(`${dashboardNormalizationRel}: missing selected-id normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeDashboardSelectedIds\s*\(\s*ids:\s*unknown\s*\)[\s\S]*Array\.isArray\s*\(\s*ids\s*\)[\s\S]*normalizeNodeIds\s*\(\s*ids\s*,\s*MAX_DASHBOARD_SELECTED_IDS\s*\)/.test(
        dashboardNormalization,
      )
    ) {
      violations.push(
        `${dashboardNormalizationRel}: selected-id normalizer accepts typed-only ids`,
      );
    }
    if (
      !/\bexport\s+function\s+selectionPatch\s*\(\s*selected_ids:\s*unknown\s*,?\s*\)/.test(
        dashboard,
      )
    ) {
      violations.push(`${dashboardRel}: selectionPatch accepts typed-only ids`);
    }
    if (
      !/\bselectionPatch\b[\s\S]*\bnormalizeDashboardSelectedIds\s*\(\s*selected_ids\s*\)/.test(
        dashboard,
      )
    ) {
      violations.push(`${dashboardRel}: selectionPatch writes raw selected ids`);
    }
    if (!/\bnormalizeDashboardSelectedIds\b/.test(selection)) {
      violations.push(
        `${selectionRel}: selection seam bypasses selected-id normalizer`,
      );
    }
    for (const seam of [
      "selectEvent",
      "selectEventNodes",
      "projectDashboardSelectionToScene",
      "pulseSelectionNodes",
    ]) {
      const start = selection.indexOf(`export function ${seam}`);
      const end = start >= 0 ? selection.indexOf("\nexport function", start + 1) : -1;
      const body = start >= 0 ? selection.slice(start, end >= 0 ? end : undefined) : "";
      if (!/\bnormalizeDashboardSelectedIds\s*\(/.test(body)) {
        violations.push(`${selectionRel}: ${seam} does not normalize selected ids`);
      }
    }
    const selectNodeAndPulseStart = selection.indexOf(
      "export function selectNodeAndPulse",
    );
    const selectNodeAndPulseEnd =
      selectNodeAndPulseStart >= 0
        ? selection.indexOf("\nexport function", selectNodeAndPulseStart + 1)
        : -1;
    const selectNodeAndPulse =
      selectNodeAndPulseStart >= 0
        ? selection.slice(
            selectNodeAndPulseStart,
            selectNodeAndPulseEnd >= 0 ? selectNodeAndPulseEnd : undefined,
          )
        : "";
    if (
      !/\bselectNode\s*\(\s*nodeId\s*,\s*scope\s*\)\.then\s*\(/.test(selectNodeAndPulse)
    ) {
      violations.push(
        `${selectionRel}: selectNodeAndPulse bypasses dashboard selection seam`,
      );
    }
    if (
      !/\bif\s*\(\s*selected\s*\)\s*pulseSelectionNodes\s*\(\s*scene\s*,\s*pulseIds\s*\)/.test(
        selectNodeAndPulse,
      )
    ) {
      violations.push(
        `${selectionRel}: selectNodeAndPulse pulses before accepted dashboard selection`,
      );
    }
    if (!/\breturn\s+selected\s*;/.test(selectNodeAndPulse)) {
      violations.push(
        `${selectionRel}: selectNodeAndPulse does not return dashboard selection result`,
      );
    }
    for (const seam of ["openNodeIslandFromWalk", "focusFromWalk"]) {
      const start = selection.indexOf(`export async function ${seam}`);
      const end = start >= 0 ? selection.indexOf("\nexport ", start + 1) : -1;
      const body = start >= 0 ? selection.slice(start, end >= 0 ? end : undefined) : "";
      if (!/\bconst\s+nodeId\s*=\s*normalizeNodeId\s*\(\s*id\s*\)/.test(body)) {
        violations.push(`${selectionRel}: ${seam} bypasses walked-id normalizer`);
      }
      if (/kind:\s*["']focus-node["'][\s\S]*\bid\s*,/.test(body)) {
        violations.push(`${selectionRel}: ${seam} focuses raw walked id`);
      }
      if (!/kind:\s*["']focus-node["'][\s\S]*\bid:\s*nodeId/.test(body)) {
        violations.push(`${selectionRel}: ${seam} does not focus normalized walked id`);
      }
    }
    for (const typedOnly of [
      "select: (id: string | null) => void",
      "open: (id: string) => void",
      "expand: (id: string) => void",
    ]) {
      if (graphWalk.includes(typedOnly)) {
        violations.push(`${graphWalkRel}: graph-walk handler input is typed-only`);
      }
    }
    for (const required of [
      "select: (id: unknown) => void",
      "open: (id: unknown) => void",
      "expand: (id: unknown) => void",
    ]) {
      if (!graphWalk.includes(required)) {
        violations.push(`${graphWalkRel}: graph-walk handler lacks runtime id seam`);
      }
    }
    for (const typedOnly of [
      "select: (id: string | null) =>",
      "open: (id: string) =>",
      "expand: (id: string) =>",
    ]) {
      if (stage.includes(typedOnly)) {
        violations.push(`${stageRel}: stage graph-walk callback is typed-only`);
      }
    }
    if (
      !/\bselect:\s*\(id:\s*unknown\)\s*=>[\s\S]*\bfocusFromWalk\s*\(\s*scene\.controller,\s*id,\s*scope/.test(
        stage,
      )
    ) {
      violations.push(`${stageRel}: stage walk select bypasses normalized seam`);
    }
    if (
      !/\bopen:\s*\(id:\s*unknown\)\s*=>[\s\S]*\bopenNodeIslandFromWalk\s*\(\s*scene\.controller,\s*id,\s*scope/.test(
        stage,
      )
    ) {
      violations.push(`${stageRel}: stage walk open bypasses normalized seam`);
    }
    if (
      !/\bexpand:\s*\(id:\s*unknown\)\s*=>\s*expandWorkingSet\s*\(\s*id\s*\)/.test(
        stage,
      )
    ) {
      violations.push(`${stageRel}: stage walk expand bypasses working-set seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps view-local node affordance ids on the shared normalizer", () => {
    const pinsRel = "stores/view/pins.ts";
    const viewRel = "stores/view/viewStore.ts";
    const workingRel = "stores/view/workingSet.ts";
    const discoveriesRel = "stores/view/discoveries.ts";
    const discoveryEdgesRel = "stores/view/discoveryEdges.ts";
    const selectionRel = "stores/view/selection.ts";
    const pins = stripComments(readFileSync(join(SRC_ROOT, pinsRel), "utf8"));
    const view = stripComments(readFileSync(join(SRC_ROOT, viewRel), "utf8"));
    const working = stripComments(readFileSync(join(SRC_ROOT, workingRel), "utf8"));
    const discoveries = stripComments(
      readFileSync(join(SRC_ROOT, discoveriesRel), "utf8"),
    );
    const discoveryEdges = stripComments(
      readFileSync(join(SRC_ROOT, discoveryEdgesRel), "utf8"),
    );
    const selection = stripComments(readFileSync(join(SRC_ROOT, selectionRel), "utf8"));
    const violations: string[] = [];

    if (!/from\s+["']\.\.\/nodeIds["']/.test(pins)) {
      violations.push(`${pinsRel}: pin store bypasses shared node-id helper`);
    }
    if (!/from\s+["']\.\.\/nodeIds["']/.test(view)) {
      violations.push(`${viewRel}: view store bypasses shared node-id helper`);
    }
    if (!/from\s+["']\.\.\/nodeIds["']/.test(working)) {
      violations.push(
        `${workingRel}: working-set helper bypasses shared node-id helper`,
      );
    }
    if (!/from\s+["']\.\.\/nodeIds["']/.test(discoveries)) {
      violations.push(
        `${discoveriesRel}: discovery panel bypasses shared node-id helper`,
      );
    }
    if (!/from\s+["']\.\.\/nodeIds["']/.test(discoveryEdges)) {
      violations.push(
        `${discoveryEdgesRel}: discovery edge normalizer bypasses shared node-id helper`,
      );
    }
    if (
      !/\bexport\s+function\s+normalizePinnedNodeIds\b[\s\S]*\bnormalizeNodeIds\b/.test(
        pins,
      )
    ) {
      violations.push(`${pinsRel}: persisted pins do not normalize node ids`);
    }
    for (const seam of ["togglePin", "isPinned", "bindPinsToScene"]) {
      if (
        !new RegExp(`\\b${seam}\\b[\\s\\S]*\\bnormalizePinnedNodeIds\\s*\\(`).test(pins)
      ) {
        violations.push(`${pinsRel}: ${seam} bypasses pinned-id read normalizer`);
      }
    }
    if (
      !/\bexport\s+function\s+normalizeOpenDocs\b[\s\S]*\bnormalizeNodeId\s*\(/.test(
        view,
      )
    ) {
      violations.push(`${viewRel}: open-doc normalizer bypasses shared node-id helper`);
    }
    if (
      !/\bexport\s+function\s+normalizeActiveDocId\b[\s\S]*\bnormalizeNodeId\s*\(/.test(
        view,
      )
    ) {
      violations.push(
        `${viewRel}: active-doc normalizer bypasses shared node-id helper`,
      );
    }
    for (const seam of [
      "togglePin",
      "isPinned",
      "setHovered",
      "setDwelledHover",
      "openNode",
      "closeNode",
      "openDoc",
      "promoteDoc",
      "activateDoc",
      "closeDoc",
      "reorderDocs",
      "openEditor",
      "pinDiscovery",
      "pruneNodeAffordances",
      "addToWorkingSet",
      "removeFromWorkingSet",
    ]) {
      const source = seam === "togglePin" || seam === "isPinned" ? pins : view;
      if (
        !new RegExp(`\\b${seam}\\b[\\s\\S]*\\bnormalizeNodeId(?:s)?\\s*\\(`).test(
          source,
        )
      ) {
        violations.push(`${seam}: missing shared node-id normalization`);
      }
    }
    if (!/\bisInWorkingSet\b[\s\S]*\bnormalizeNodeId\s*\(/.test(working)) {
      violations.push(`${workingRel}: working-set membership read is raw`);
    }
    if (
      !/\bexport\s+function\s+normalizeWorkingSetIds\b[\s\S]*\bnormalizeNodeId\s*\(/.test(
        working,
      )
    ) {
      violations.push(`${workingRel}: missing working-set read normalizer`);
    }
    for (const seam of [
      "useWorkingSet",
      "workingSetRows",
      "lastWorkingSetEntry",
      "isInWorkingSet",
    ]) {
      if (
        !new RegExp(`\\b${seam}\\b[\\s\\S]*\\bnormalizeWorkingSetIds\\s*\\(`).test(
          working,
        )
      ) {
        violations.push(`${workingRel}: ${seam} bypasses working-set read normalizer`);
      }
    }
    for (const typedOnly of [
      "workingSetKeyAction(\n  actionId: string,\n  selectedId: string | null",
      "useWorkingSetKeybindings(selectedId: string | null)",
      "expandWorkingSet(id: string)",
      "collapseWorkingSet(id: string)",
      "isInWorkingSet(id: string)",
    ]) {
      if (working.includes(typedOnly)) {
        violations.push(`${workingRel}: typed-only working-set seam ${typedOnly}`);
      }
    }
    for (const required of [
      "workingSetKeyAction(\n  actionId: unknown,\n  selectedId: unknown",
      "useWorkingSetKeybindings(selectedId: unknown)",
      "expandWorkingSet(id: unknown)",
      "collapseWorkingSet(id: unknown)",
      "isInWorkingSet(id: unknown)",
    ]) {
      if (!working.includes(required)) {
        violations.push(`${workingRel}: missing runtime working-set seam ${required}`);
      }
    }
    if (
      !/\bexport\s+function\s+normalizeOpenedNodeIslandIds\b[\s\S]*\bnormalizeNodeId\s*\(/.test(
        selection,
      )
    ) {
      violations.push(`${selectionRel}: missing opened-island read normalizer`);
    }
    for (const typedOnly of [
      "setHovered: (id: string | null)",
      "setDwelledHover: (id: string | null)",
      "openNode: (id: string)",
      "closeNode: (id: string)",
      "addToWorkingSet: (id: string)",
      "removeFromWorkingSet: (id: string)",
      "selectNodes(\n  ids: readonly string[]",
      "selectNode(\n  id: string | null",
      "selectFirstNode(\n  ids: readonly string[]",
      "setHoveredNodeId(id: string | null)",
      "setDwelledHoverNodeId(id: string | null)",
      "openNodeIsland(\n  id: string",
      "openGraphNodeFromScene(\n  id: string",
      "closeNodeIsland(id: string)",
      "openNodeIslandFromWalk(\n  scene: SceneController,\n  id: string",
      "focusFromWalk(\n  scene: SceneController,\n  id: string | null",
      "selectEvent(\n  id: string,\n  nodeIds: string[]",
      "selectEventNodes(\n  id: string,\n  nodeIds: readonly string[]",
      "selectEdge(id: string)",
      "pulseSelectionNodes(\n  scene: SceneController,\n  ids: readonly string[]",
      "selectNodeAndPulse(\n  scene: SceneController,\n  nodeId: string",
    ]) {
      if (selection.includes(typedOnly) || view.includes(typedOnly)) {
        violations.push(`${selectionRel}: typed-only selection seam ${typedOnly}`);
      }
    }
    if (
      !/\bexport\s+function\s+selectNode\s*\(\s*id:\s*unknown[\s\S]*?\bnormalizeNodeId\s*\(\s*id\s*\)/.test(
        selection,
      )
    ) {
      violations.push(`${selectionRel}: selectNode bypasses runtime id normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeSelectionMetadataId\s*\(\s*id:\s*unknown\s*\)[\s\S]*\.trim\s*\(\s*\)/.test(
        selection,
      )
    ) {
      violations.push(`${selectionRel}: missing local selection metadata id normalizer`);
    }
    if (
      !/\bexport\s+const\s+SELECTION_METADATA_ID_MAX_CHARS\s*=\s*512\b/.test(
        selection,
      ) ||
      !/\bexport\s+function\s+normalizeSelectionMetadataId\s*\(\s*id:\s*unknown\s*\)[\s\S]*normalized\.length\s*<=\s*SELECTION_METADATA_ID_MAX_CHARS/.test(
        selection,
      )
    ) {
      violations.push(`${selectionRel}: local selection metadata ids are unbounded`);
    }
    if (
      !/\bexport\s+function\s+normalizeSelectionTruncatedNodeCount\s*\(\s*value:\s*unknown\s*\)[\s\S]*\bMath\.trunc\s*\(/.test(
        selection,
      )
    ) {
      violations.push(
        `${selectionRel}: missing local selection truncated-count normalizer`,
      );
    }
    if (
      !/\bexport\s+function\s+selectEvent\s*\(\s*id:\s*unknown[\s\S]*?\bconst\s+eventId\s*=\s*normalizeSelectionMetadataId\s*\(\s*id\s*\)[\s\S]*?\bid:\s*eventId\b[\s\S]*?\bnormalizeDashboardSelectedIds\s*\(\s*nodeIds\s*\)/.test(
        selection,
      )
    ) {
      violations.push(`${selectionRel}: selectEvent bypasses metadata normalizer`);
    }
    if (
      !/\bexport\s+function\s+selectEventNodes\s*\(\s*id:\s*unknown[\s\S]*?\bconst\s+eventId\s*=\s*normalizeSelectionMetadataId\s*\(\s*id\s*\)[\s\S]*?\beventId\s*===\s*null[\s\S]*?\bPromise\.resolve\s*\(\s*false\s*\)[\s\S]*?\bselectEvent\s*\(\s*eventId\b/.test(
        selection,
      )
    ) {
      violations.push(`${selectionRel}: selectEventNodes is not metadata-atomic`);
    }
    if (
      !/\bexport\s+function\s+selectEdge\s*\(\s*id:\s*unknown\s*\)[\s\S]*?\bconst\s+edgeId\s*=\s*normalizeSelectionMetadataId\s*\(\s*id\s*\)[\s\S]*?\bid:\s*edgeId\b/.test(
        selection,
      )
    ) {
      violations.push(`${selectionRel}: selectEdge bypasses metadata normalizer`);
    }
    if (
      !/\bexport\s+async\s+function\s+openNodeIsland\s*\(\s*id:\s*unknown[\s\S]*?\bconst\s+nodeId\s*=\s*normalizeNodeId\s*\(\s*id\s*\)/.test(
        selection,
      )
    ) {
      violations.push(`${selectionRel}: openNodeIsland bypasses runtime id normalizer`);
    }
    if (
      !/\bimport\s*\{[\s\S]*\bnormalizeStoreScope\b[\s\S]*\}\s*from\s+["']\.\.\/server\/scopeIdentity["']/.test(
        selection,
      ) ||
      !/\bexport\s+const\s+normalizeSelectionScope\s*=\s*normalizeStoreScope\b/.test(
        selection,
      )
    ) {
      violations.push(`${selectionRel}: missing selection scope normalizer`);
    }
    if (
      !/\bselectNodes\b[\s\S]*\bpatchDashboardState\s*\(\s*normalizeSelectionScope\s*\(\s*scope\s*\)/.test(
        selection,
      )
    ) {
      violations.push(`${selectionRel}: selection write bypasses scope normalizer`);
    }
    if (
      !/\bopenGraphNodeFromScene\b[\s\S]*\bconst\s+normalizedScope\s*=\s*normalizeSelectionScope\s*\(\s*scope\s*\)[\s\S]*\bnormalizedScope\s*===\s*null/.test(
        selection,
      )
    ) {
      violations.push(
        `${selectionRel}: scene-open feature descent bypasses scope normalizer`,
      );
    }
    for (const typedScope of [
      "selectNodes(\n  ids: readonly unknown[],\n  scope: string | null",
      "selectNode(\n  id: unknown,\n  scope: string | null",
      "openNodeIsland(\n  id: unknown,\n  scope: string | null",
      "openGraphNodeFromScene(\n  id: unknown,\n  scope: string | null",
      "selectEventNodes(\n  id: string,\n  nodeIds: readonly unknown[],\n  scope: string | null",
      "selectNodeAndPulse(\n  scene: SceneController,\n  nodeId: unknown,\n  pulseIds: readonly unknown[],\n  scope: string | null",
    ]) {
      if (selection.includes(typedScope)) {
        violations.push(
          `${selectionRel}: typed-only selection scope seam ${typedScope}`,
        );
      }
    }
    for (const seam of ["useOpenedNodeIslands", "isNodeIslandOpen"]) {
      if (
        !new RegExp(
          `\\b${seam}\\b[\\s\\S]*\\bnormalizeOpenedNodeIslandIds\\s*\\(`,
        ).test(selection)
      ) {
        violations.push(
          `${selectionRel}: ${seam} bypasses opened-island read normalizer`,
        );
      }
    }
    if (
      !/\bexport\s+function\s+normalizeDiscoveryPanelTarget\s*\(\s*nodeId:\s*unknown\s*\)[\s\S]*\bnormalizeNodeId\s*\(\s*nodeId\s*\)/.test(
        discoveries,
      )
    ) {
      violations.push(`${discoveriesRel}: missing discovery panel target normalizer`);
    }
    if (
      !/\bopen:\s*\(nodeId\)\s*=>\s*set\s*\(\s*\(state\)\s*=>\s*\{[\s\S]*\bconst\s+openFor\s*=\s*normalizeDiscoveryPanelTarget\s*\(\s*nodeId\s*\)[\s\S]*\bopenFor\s*===\s*null[\s\S]*\?\s*state\s*:\s*\{\s*openFor\s*\}/.test(
        discoveries,
      )
    ) {
      violations.push(
        `${discoveriesRel}: discovery panel open target is raw or nullable`,
      );
    }
    if (!/\bopen:\s*\(\s*nodeId:\s*unknown\s*\)\s*=>\s*void\b/.test(discoveries)) {
      violations.push(
        `${discoveriesRel}: discovery panel open accepts typed-only input`,
      );
    }
    if (!/\bopenDiscoveryPanel\s*\(\s*nodeId:\s*unknown\s*\)/.test(discoveries)) {
      violations.push(
        `${discoveriesRel}: discovery panel public open accepts typed-only input`,
      );
    }
    if (
      !/\buseDiscoveryPanelOpenFor\b[\s\S]*\bnormalizeDiscoveryPanelTarget\s*\(\s*state\.openFor\s*\)/.test(
        discoveries,
      )
    ) {
      violations.push(`${discoveriesRel}: discovery panel open read is raw`);
    }
    if (
      !/\bexport\s+function\s+normalizeDiscoveryEdge\b[\s\S]*\bnormalizeNodeId\s*\(/.test(
        discoveryEdges,
      )
    ) {
      violations.push(
        `${discoveryEdgesRel}: discovery edges bypass shared node-id helper`,
      );
    }
    if (
      !/\bexport\s+const\s+DISCOVERY_EDGE_ID_MAX_CHARS\s*=\s*512\b/.test(
        discoveryEdges,
      ) ||
      !/\bexport\s+function\s+normalizeDiscoveryEdgeId\b[\s\S]*\.trim\s*\(\s*\)[\s\S]*normalized\.length\s*<=\s*DISCOVERY_EDGE_ID_MAX_CHARS/.test(
        discoveryEdges,
      )
    ) {
      violations.push(`${discoveryEdgesRel}: discovery edge ids are unbounded`);
    }
    if (
      !/\bexport\s+function\s+normalizeDiscoveryEdge\b[\s\S]*\bconst\s+id\s*=\s*normalizeDiscoveryEdgeId\s*\(\s*candidate\.id\s*\)[\s\S]*\bid,\s*[\s\S]*\bsrc,\s*[\s\S]*\bdst,[\s\S]*\brelation:\s*candidate\.relation\.trim\s*\(\s*\)[\s\S]*\bconfidence:\s*normalizeDiscoveryConfidence\s*\(/.test(
        discoveryEdges,
      )
    ) {
      violations.push(
        `${discoveryEdgesRel}: discovery edge normalizer does not own id/src/dst/relation/confidence`,
      );
    }
    if (
      !/\bexport\s+function\s+normalizePinnedDiscoveries\b[\s\S]*\bnormalizePinnedDiscoveryEdges\s*\(/.test(
        discoveries,
      )
    ) {
      violations.push(
        `${discoveriesRel}: pinned discoveries bypass discovery edge normalizer`,
      );
    }
    for (const seam of [
      "usePinnedDiscoveries",
      "discoveryCandidateRows",
      "pinDiscoveryCandidate",
      "unpinDiscoveryCandidate",
      "selectDiscoveryCandidate",
    ]) {
      if (
        !new RegExp(
          `\\b${seam}\\b[\\s\\S]*\\bnormalize(?:PinnedDiscoveries|DiscoveryEdges|DiscoveryEdgeId|NodeId)\\s*\\(`,
        ).test(discoveries)
      ) {
        violations.push(
          `${discoveriesRel}: ${seam} bypasses normalized discovery seam`,
        );
      }
    }
    if (
      /\bselectDiscoveryCandidate\s*\(\s*nodeId:\s*unknown,\s*scope:\s*string\s*\|\s*null/.test(
        discoveries,
      )
    ) {
      violations.push(
        `${discoveriesRel}: discovery candidate selection accepts typed-only scope`,
      );
    }
    if (
      /\buseDiscoveryCandidateSelection\s*\(\s*scope:\s*string\s*\|\s*null/.test(
        discoveries,
      )
    ) {
      violations.push(
        `${discoveriesRel}: discovery candidate hook accepts typed-only scope`,
      );
    }
    if (
      !/\bselectDiscoveryCandidate\s*\(\s*nodeId:\s*unknown,\s*scope:\s*unknown\b[\s\S]*?\bconst\s+normalizedScope\s*=\s*normalizeSelectionScope\s*\(\s*scope\s*\)[\s\S]*?\bselectNode\s*\(\s*id,\s*normalizedScope\s*\)/.test(
        discoveries,
      )
    ) {
      violations.push(
        `${discoveriesRel}: discovery candidate selection bypasses scope normalizer`,
      );
    }
    if (
      !/\buseDiscoveryCandidateSelection\s*\(\s*scope:\s*unknown\s*\)[\s\S]*?\bconst\s+normalizedScope\s*=\s*normalizeSelectionScope\s*\(\s*scope\s*\)[\s\S]*?\bselectDiscoveryCandidate\s*\(\s*nodeId,\s*normalizedScope\s*\)[\s\S]*?\[\s*normalizedScope\s*\]/.test(
        discoveries,
      )
    ) {
      violations.push(
        `${discoveriesRel}: discovery candidate hook bypasses normalized scope`,
      );
    }
    if (
      !/\bpinDiscoveryCandidate\b[\s\S]*\bconst\s+normalizedEdge\s*=\s*normalizeDiscoveryEdge\s*\(\s*edge\s*\)[\s\S]*\bpinDiscovery\s*\(\s*normalizedEdge\s*\)/.test(
        discoveries,
      )
    ) {
      violations.push(
        `${discoveriesRel}: pin discovery intent bypasses edge normalizer`,
      );
    }
    if (
      !/\bpinDiscovery:\s*\(edge\)\s*=>[\s\S]*\bconst\s+normalizedEdge\s*=\s*normalizeDiscoveryEdge\s*\(\s*edge\s*\)[\s\S]*normalizedEdge\s*===\s*null/.test(
        view,
      )
    ) {
      violations.push(
        `${viewRel}: view-store discovery pins bypass shared edge normalization`,
      );
    }
    if (
      !/\bunpinDiscovery:\s*\(edgeId\)\s*=>[\s\S]*\bconst\s+id\s*=\s*normalizeDiscoveryEdgeId\s*\(\s*edgeId\s*\)/.test(
        view,
      )
    ) {
      violations.push(
        `${viewRel}: view-store discovery unpin bypasses edge-id normalization`,
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps selection pulse scene commands behind the selection seam", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/kind:\s*["']pulse["']/.test(stripped)) {
        violations.push(`${rel}: raw selection pulse scene command`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps timeline node activation behind the selection pulse seam", () => {
    const rel = "app/timeline/eventSelection.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\bselectNode\b/.test(statement)) {
        violations.push(`${rel}: raw node-selection import`);
      }
      if (/\bpulseSelectionNodes\b/.test(statement)) {
        violations.push(`${rel}: raw pulse helper import`);
      }
    }
    if (/\bselectNode\s*\(/.test(stripped)) {
      violations.push(`${rel}: raw node-selection call`);
    }
    if (/\bpulseSelectionNodes\s*\(/.test(stripped)) {
      violations.push(`${rel}: raw pulse helper call`);
    }
    if (!/\bselectNodeAndPulse\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing selection pulse seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps timeline event-menu node jumps behind the first-node seam", () => {
    const rel = "app/timeline/menus/eventMarkMenu.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\bselectNode\b/.test(statement)) {
        violations.push(`${rel}: raw node-selection import`);
      }
    }
    if (/\bselectNode\s*\(/.test(stripped)) {
      violations.push(`${rel}: raw node-selection call`);
    }
    if (!/\bselectFirstNode\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing first-node selection seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps timeline event-menu event selection behind the event-node seam", () => {
    const rel = "app/timeline/menus/eventMarkMenu.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\bselectEvent\b/.test(statement)) {
        violations.push(`${rel}: raw event metadata import`);
      }
      if (/\bselectNodes\b/.test(statement)) {
        violations.push(`${rel}: raw multi-node selection import`);
      }
    }
    if (/\bselectEvent\s*\(/.test(stripped)) {
      violations.push(`${rel}: raw event metadata call`);
    }
    if (/\bselectNodes\s*\(/.test(stripped)) {
      violations.push(`${rel}: raw multi-node selection call`);
    }
    if (!/\bselectEventNodes\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing event-node selection seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps query recovery behind stores retry callbacks", () => {
    const violations: string[] = [];

    for (const surface of PRODUCTION_SURFACES) {
      for (const file of sourceFiles(join(SRC_ROOT, surface))) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        if (/\.refetch\s*\(/.test(stripped)) {
          violations.push(`${rel}: raw query refetch`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps session restore orchestration behind stores session seams", () => {
    const violations: string[] = [];
    const rawSessionRestoreAccess =
      /\b(?:useSession|usePutSession|mapDefaultScope|seedFromSession)\b/;

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (rawSessionRestoreAccess.test(stripped)) {
        violations.push(`${rel}: raw session restore orchestration`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps node hover as a view-local selection seam", () => {
    const viewStore = stripComments(readFileSync(VIEW_STORE, "utf8"));
    const selection = stripComments(
      readFileSync(join(SRC_ROOT, "stores/view/selection.ts"), "utf8"),
    );
    const violations: string[] = [];

    if (!/\bhoveredId:\s*string\s*\|\s*null\b/.test(viewStore)) {
      violations.push("viewStore.ts: missing view-local hovered id");
    }
    if (!/\bdwelledHoverId:\s*string\s*\|\s*null\b/.test(viewStore)) {
      violations.push("viewStore.ts: missing view-local hover dwell id");
    }
    if (!/\bsetHovered:\s*\(id:\s*unknown\)\s*=>\s*void\b/.test(viewStore)) {
      violations.push("viewStore.ts: missing view-local hover writer");
    }
    if (!/\bsetDwelledHover:\s*\(id:\s*unknown\)\s*=>\s*void\b/.test(viewStore)) {
      violations.push("viewStore.ts: missing view-local hover dwell writer");
    }
    if (!/\buseHoveredNodeId\s*\(\s*\)/.test(selection)) {
      violations.push("selection.ts: missing hovered-node read seam");
    }
    if (!/\bsetHoveredNodeId\s*\(\s*id:\s*unknown\s*\)/.test(selection)) {
      violations.push("selection.ts: missing hovered-node write seam");
    }
    if (
      !/\buseDwelledHoverNodeId\s*\(\s*hoveredId:\s*string\s*\|\s*null\s*\)/.test(
        selection,
      )
    ) {
      violations.push("selection.ts: missing hovered-node dwell seam");
    }
    if (!/\bsetDwelledHoverNodeId\s*\(\s*id:\s*unknown\s*\)/.test(selection)) {
      violations.push("selection.ts: missing hovered-node dwell write seam");
    }
    for (const typedOnly of [
      "setHovered: (id: string | null)",
      "setDwelledHover: (id: string | null)",
      "setHoveredNodeId(id: string | null)",
      "setDwelledHoverNodeId(id: string | null)",
    ]) {
      if (viewStore.includes(typedOnly) || selection.includes(typedOnly)) {
        violations.push(`typed-only hover seam ${typedOnly}`);
      }
    }

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const stripped = stripComments(readFileSync(file, "utf8"));
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\.setHover\s*\(/.test(stripped)) {
        violations.push(`${rel}: dashboard hover mutation`);
      }
      if (/\bhoverPatch\s*\(|\bhovered_id\s*:/.test(stripped)) {
        violations.push(`${rel}: dashboard hover patch`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps minimap chrome state behind the minimap chrome seam", () => {
    const rel = "app/stage/MinimapWidget.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const storeRel = "stores/view/minimapChrome.ts";
    const store = stripComments(readFileSync(join(SRC_ROOT, storeRel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseState\b/.test(statement)) {
        violations.push(`${rel}: local minimap collapse state`);
      }
      if (/\buseMinimapChromeStore\b/.test(statement)) {
        violations.push(`${rel}: raw minimap chrome store access`);
      }
    }
    if (/\[\s*collapsed\s*,\s*setCollapsed\s*\]/.test(stripped)) {
      violations.push(`${rel}: local minimap collapse tuple`);
    }
    if (!/\buseMinimapChromeView\s*\(\s*embedded\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing minimap chrome view seam`);
    }
    if (!/\btoggleMinimapCollapsed\b/.test(stripped)) {
      violations.push(`${rel}: missing minimap collapse write seam`);
    }
    if (!/\bexport\s+function\s+normalizeMinimapCollapsed\b/.test(store)) {
      violations.push(`${storeRel}: missing minimap collapsed normalizer`);
    }
    if (
      !/\bsetCollapsed:\s*\(collapsed\)\s*=>[\s\S]*\bnormalizeMinimapCollapsed\s*\(\s*collapsed\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: setCollapsed bypasses normalizer`);
    }
    if (
      /\bsetCollapsed:\s*\([^)]*:\s*boolean/.test(store) ||
      /\bfunction\s+setMinimapCollapsed\s*\([^)]*:\s*boolean/.test(store)
    ) {
      violations.push(`${storeRel}: minimap setter exposes typed-only input seam`);
    }
    for (const field of [
      "view.collapsed",
      "view.rootClassName",
      "view.rootStyle",
      "view.groupAriaLabel",
      "view.headerClassName",
      "view.actionsClassName",
      "view.titleLabel",
      "view.showRecenter",
      "view.recenterLabel",
      "view.collapseLabel",
      "view.collapseActive",
      "view.collapseAriaExpanded",
      "view.collapseIcon",
      "view.canvasRegionId",
      "view.canvasRegionAriaHidden",
      "view.canvasRegionStyle",
      "view.canvasWidth",
      "view.canvasHeight",
      "view.canvasAriaLabel",
      "view.canvasClassName",
      "view.canvasStyle",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing minimap chrome projection ${field}`);
      }
    }
    for (const localChrome of [
      "pointer-events-auto absolute bottom-fg-2 right-fg-2 z-10 overflow-hidden backdrop-blur-sm",
      "flex items-center justify-between gap-fg-1 border-b border-rule pr-fg-1",
      "flex items-center gap-fg-0-5",
      "graph minimap navigator",
      "recenter the field in view",
      "expand minimap",
      "collapse minimap",
      "block cursor-pointer touch-none",
    ]) {
      if (stripped.includes(localChrome)) {
        violations.push(`${rel}: local minimap chrome "${localChrome}"`);
      }
    }
    if (/collapsed\s*\?\s*["']auto["']/.test(stripped)) {
      violations.push(`${rel}: local minimap width projection`);
    }
    if (/display:\s*collapsed\s*\?/.test(stripped)) {
      violations.push(`${rel}: local minimap canvas visibility projection`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps hover-card hover reads behind the view-local selection seam", () => {
    const rel = "app/islands/HoverCardLayer.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardState\b/.test(statement)) {
        violations.push(`${rel}: raw dashboard-state hover subscription`);
      }
      if (/\bDashboardState\b/.test(statement)) {
        violations.push(`${rel}: local dashboard hover payload typing`);
      }
      if (/\buseViewStore\b/.test(statement)) {
        violations.push(`${rel}: raw hover view-store subscription`);
      }
    }
    if (/\bhovered_id\b|\bdashboardState\.data\b/.test(stripped)) {
      violations.push(`${rel}: local dashboard hover projection`);
    }
    if (!/\buseHoveredNodeId\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing hovered-node seam`);
    }
    if (
      !/\bderiveHoverCardLayerView\s*\(\s*dwelledId\s*,\s*openedIds\s*\)/.test(stripped)
    ) {
      violations.push(`${rel}: missing hover-card layer view projection`);
    }
    for (const required of [
      "view.rootClassName",
      "view.targetId",
      "view.cardShellClassName",
    ]) {
      if (!stripped.includes(required)) {
        violations.push(`${rel}: missing hover-card layer ${required}`);
      }
    }
    if (/\bfunction\s+resolveHoverTarget\b/.test(stripped)) {
      violations.push(`${rel}: local hover-card target projection`);
    }
    for (const localChrome of [
      "pointer-events-none absolute inset-0 overflow-hidden",
      "pointer-events-none",
    ]) {
      if (stripped.includes(localChrome)) {
        violations.push(`${rel}: local hover-card chrome projection`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps hover and island overlays behind selection and anchor seams", () => {
    const files = [
      {
        rel: "app/islands/HoverCardLayer.tsx",
        allowedTuples: new Set<string>(),
        required: [
          /\buseHoveredNodeId\s*\(\s*\)/,
          /\buseDwelledHoverNodeId\s*\(\s*hoveredId\s*\)/,
          /\buseOpenedNodeIslands\s*\(\s*\)/,
          /\bderiveHoverCardLayerView\s*\(\s*dwelledId\s*,\s*openedIds\s*\)/,
          /\bopenNodeIsland\s*\(\s*openId\s*,\s*scope\s*\)/,
          /\buseHoverCardView\s*\(\s*id\s*,\s*scope\s*\)/,
          /["']\.\.\/\.\.\/stores\/view\/islandAnchors["']/,
        ],
      },
      {
        rel: "app/islands/IslandLayer.tsx",
        allowedTuples: new Set<string>(),
        required: [
          /\buseOpenedNodeIslands\s*\(\s*\)/,
          /\bcloseNodeIsland\s*\(\s*id\s*\)/,
          /\buseNodeAnchor\s*\(\s*scene\s*,\s*id\s*\)/,
          /\bopenContextMenu\s*\(\s*\{\s*kind:\s*"island"\s*,\s*id\s*,\s*scope\s*\}/,
          /["']\.\.\/\.\.\/stores\/view\/islandAnchors["']/,
        ],
      },
    ];
    const violations: string[] = [];

    for (const { rel, allowedTuples, required } of files) {
      const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
      for (const statement of importStatements(stripped)) {
        if (
          /\buseViewStore\b|\buseDashboardState\b|\bpatchDashboardState\b/.test(
            statement,
          )
        ) {
          violations.push(`${rel}: raw overlay state import`);
        }
        if (/\bselectNode\b|\bselectNodes\b|\bisNodeIslandOpen\b/.test(statement)) {
          violations.push(`${rel}: overlay bypasses selection seam`);
        }
      }
      if (
        /\buseViewStore\b|\buseDashboardState\b|\bpatchDashboardState\b/.test(stripped)
      ) {
        violations.push(`${rel}: raw overlay state access`);
      }
      if (
        /\bselectNode\s*\(|\bselectNodes\s*\(|\bisNodeIslandOpen\s*\(/.test(stripped)
      ) {
        violations.push(`${rel}: overlay bypasses selection seam`);
      }
      if (/\bscene\.trackNode\s*\(/.test(stripped)) {
        violations.push(`${rel}: raw scene anchor subscription`);
      }
      if (/\.openedIds\b|\.openNode\s*\(|\.closeNode\s*\(/.test(stripped)) {
        violations.push(`${rel}: raw opened-island state access`);
      }
      for (const match of stripped.matchAll(
        /\bconst\s*\[\s*([A-Za-z0-9_$]+)\s*,\s*([A-Za-z0-9_$]+)\s*\]\s*=\s*useState/g,
      )) {
        const tuple = `${match[1]}:${match[2]}`;
        if (!allowedTuples.has(tuple)) {
          violations.push(`${rel}: unexpected local overlay state tuple ${tuple}`);
        }
      }
      for (const pattern of required) {
        if (!pattern.test(stripped)) {
          violations.push(`${rel}: missing overlay seam ${pattern.source}`);
        }
      }
    }

    const islandAnchors = stripComments(
      readFileSync(join(SRC_ROOT, "stores/view/islandAnchors.ts"), "utf8"),
    );
    if (!/\bexport function normalizeSceneAnchor\s*\(/.test(islandAnchors)) {
      violations.push("stores/view/islandAnchors.ts: missing anchor normalizer");
    }
    if (
      !/\bnormalizeSceneAnchor\b[\s\S]*Number\.isFinite\s*\(\s*value\.x\s*\)[\s\S]*Number\.isFinite\s*\(\s*value\.y\s*\)[\s\S]*Number\.isFinite\s*\(\s*value\.scale\s*\)/.test(
        islandAnchors,
      )
    ) {
      violations.push(
        "stores/view/islandAnchors.ts: anchor normalizer trusts scene payloads",
      );
    }
    if (
      !/\bsetAnchor:\s*\([^)]*id[^)]*anchor[^)]*\)\s*=>\s*\{[\s\S]*\bconst\s+normalizedAnchor\s*=\s*normalizeSceneAnchor\s*\(\s*anchor\s*\)[\s\S]*withAnchor\s*\(\s*state\.anchors\s*,\s*nodeId\s*,\s*normalizedAnchor\s*\)/.test(
        islandAnchors,
      )
    ) {
      violations.push(
        "stores/view/islandAnchors.ts: setAnchor bypasses normalized anchor payload",
      );
    }
    if (
      !/\bexport function islandStyle\s*\(\s*anchor:\s*unknown\s*\)[\s\S]*normalizeSceneAnchor\s*\(\s*anchor\s*\)/.test(
        islandAnchors,
      )
    ) {
      violations.push(
        "stores/view/islandAnchors.ts: island style bypasses anchor normalizer",
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps local selection metadata behind the selection seam", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\.selection\b/.test(stripped)) {
        violations.push(`${rel}: raw local selection metadata read`);
      }
      if (/\.selectEntity\s*\(/.test(stripped)) {
        violations.push(`${rel}: raw local selection metadata write`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps opened-island writes behind selection seams", () => {
    const violations: string[] = [];

    for (const surface of PRODUCTION_SURFACES) {
      for (const file of sourceFiles(join(SRC_ROOT, surface))) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        if (/\.openNode\s*\(/.test(stripped)) {
          violations.push(`${rel}: raw opened-island write`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps opened-island closes behind selection seams", () => {
    const violations: string[] = [];

    for (const surface of PRODUCTION_SURFACES) {
      for (const file of sourceFiles(join(SRC_ROOT, surface))) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        if (/\.closeNode\s*\(/.test(stripped)) {
          violations.push(`${rel}: raw opened-island close`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps opened-island state access behind selection seams", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\.openedIds\b/.test(stripped)) {
        violations.push(`${rel}: raw opened-island state access`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps pin toggles behind the pin intent seam", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\.togglePin\s*\(/.test(stripped)) {
        violations.push(`${rel}: raw pin toggle`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps app pin access behind named pin helpers", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\busePinStore\b/.test(stripped)) {
        violations.push(`${rel}: raw pin store access`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps graph node menu membership descriptor-driven", () => {
    const rel = "app/stage/menus/graphNodeMenu.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const menuActionsRel = "stores/view/menuActions.ts";
    const menuActions = stripComments(
      readFileSync(join(SRC_ROOT, menuActionsRel), "utf8"),
    );
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseViewStore\b|\busePinStore\b/.test(statement)) {
        violations.push(`${rel}: raw graph menu state store import`);
      }
      if (/\bisNodeIslandOpen\b|\bisPinnedNode\b|\bisInWorkingSet\b/.test(statement)) {
        violations.push(`${rel}: graph menu recomputes membership`);
      }
      if (/\buseOpenedNodeIslands\b|\buseWorkingSet\b/.test(statement)) {
        violations.push(`${rel}: graph menu subscribes to membership state`);
      }
      if (
        /\b(?:selectNode|openNodeIsland|closeNodeIsland|togglePinnedNode|expandWorkingSet|collapseWorkingSet)\b/.test(
          statement,
        )
      ) {
        violations.push(`${rel}: direct graph menu store intent import`);
      }
    }
    if (/\buseViewStore\b|\busePinStore\b/.test(stripped)) {
      violations.push(`${rel}: raw graph menu state store access`);
    }
    if (
      /\bisNodeIslandOpen\s*\(|\bisPinnedNode\s*\(|\bisInWorkingSet\s*\(/.test(stripped)
    ) {
      violations.push(`${rel}: local graph menu membership lookup`);
    }
    if (!/\bimport\s*\{\s*normalizeEntityDescriptor\s*\}/.test(stripped)) {
      violations.push(`${rel}: missing entity descriptor normalizer`);
    }
    if (
      !/\bexport\s+function\s+graphNodeMenu\s*\(\s*entity:\s*unknown\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: graph node menu is a typed-only runtime seam`);
    }
    if (
      !/\bconst\s+normalizedEntity\s*=\s*normalizeEntityDescriptor\s*\(\s*entity\s*\)/.test(
        stripped,
      ) ||
      !/\bnormalizedEntity\?\.\s*kind\s*!==\s*["']node["']/.test(stripped)
    ) {
      violations.push(`${rel}: graph node menu bypasses normalized entity`);
    }
    if (/\bentity\.(?:id|scope|title|isOpen|isPinned|inWorkingSet)\b/.test(stripped)) {
      violations.push(`${rel}: graph node menu reads raw entity fields`);
    }
    if (/\bimport\s+type\s*\{\s*NodeEntity\b/.test(stripped)) {
      violations.push(`${rel}: graph node menu imports typed-only NodeEntity`);
    }
    if (!/\bnormalizedEntity\.isOpen\b/.test(stripped)) {
      violations.push(`${rel}: missing descriptor-driven island membership`);
    }
    if (!/\bnormalizedEntity\.isPinned\b/.test(stripped)) {
      violations.push(`${rel}: missing descriptor-driven pin membership`);
    }
    if (!/\bnormalizedEntity\.inWorkingSet\b/.test(stripped)) {
      violations.push(`${rel}: missing descriptor-driven working-set membership`);
    }
    if (
      !/\bopenMenuNodeIsland\s*\(/.test(stripped) ||
      !/\bcloseMenuNodeIsland\s*\(/.test(stripped) ||
      !/\btoggleMenuPinnedNode\s*\(/.test(stripped) ||
      !/\bexpandMenuWorkingSet\s*\(/.test(stripped) ||
      !/\bcollapseMenuWorkingSet\s*\(/.test(stripped)
    ) {
      violations.push(`${rel}: missing named graph menu intent seams`);
    }
    for (const helper of [
      "focusMenuNode",
      "openMenuNodeIsland",
      "closeMenuNodeIsland",
      "toggleMenuPinnedNode",
      "expandMenuWorkingSet",
      "collapseMenuWorkingSet",
      "clearMenuWorkingSet",
    ]) {
      if (!new RegExp(`\\bexport\\s+function\\s+${helper}\\b`).test(menuActions)) {
        violations.push(`${menuActionsRel}: missing ${helper}`);
      }
    }
    if (/openNodeIsland\s*\(\s*id\s*,\s*scope\s*\?\?\s*null\s*\)/.test(menuActions)) {
      violations.push(`${menuActionsRel}: menu open coerces absent scope to null`);
    }
    if (
      !/from\s+["']\.\.\/server\/scopeIdentity["'][\s\S]*\bnormalizeStoreScope\b/.test(
        menuActions,
      ) ||
      !/\bmenuEntityScope\s*\([\s\S]*\breturn\s+["']scope["']\s+in\s+entity\s*\?\s*normalizeStoreScope\s*\(\s*entity\.scope\s*\)\s*:\s*undefined/.test(
        menuActions,
      )
    ) {
      violations.push(`${menuActionsRel}: menu entity scope bypasses scope normalizer`);
    }
    if (
      !/\bconst\s+request\s*=\s*scope\s*===\s*undefined\s*\?\s*openNodeIsland\s*\(\s*id\s*\)\s*:\s*openNodeIsland\s*\(\s*id\s*,\s*scope\s*\)/.test(
        menuActions,
      )
    ) {
      violations.push(
        `${menuActionsRel}: menu open does not preserve active-scope default`,
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps context-menu resolvers behind the menu action seam", () => {
    const violations: string[] = [];
    const resolverRels = [
      "app/stage/menus/graphNodeMenu.ts",
      "app/stage/menus/canvasMenu.ts",
      "app/islands/menus/islandMenu.ts",
      "app/left/menus/codeFileMenu.ts",
      "app/left/menus/vaultDocMenu.ts",
      "app/right/menus/searchResultMenu.ts",
      "app/timeline/menus/eventMarkMenu.ts",
    ];

    for (const rel of resolverRels) {
      const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
      for (const statement of importStatements(stripped)) {
        if (
          /\b(?:selectNode|openNodeIsland|closeNodeIsland|togglePinnedNode|expandWorkingSet|collapseWorkingSet|clearWorkingSet)\b/.test(
            statement,
          )
        ) {
          violations.push(`${rel}: direct store intent import`);
        }
      }
      if (
        /\b(?:selectNode|openNodeIsland|closeNodeIsland|togglePinnedNode|expandWorkingSet|collapseWorkingSet|clearWorkingSet)\s*\(/.test(
          stripped,
        )
      ) {
        violations.push(`${rel}: direct store intent call`);
      }
      if (!/\.\.\/\.\.\/\.\.\/stores\/view\/menuActions/.test(stripped)) {
        violations.push(`${rel}: missing menu action seam import`);
      }
      if (/\bfunction\s+entityScope\s*\(/.test(stripped)) {
        violations.push(`${rel}: local entity scope helper`);
      }
      if (
        /menus\/(?:searchResultMenu|eventMarkMenu)\.ts$/.test(rel) &&
        !/\bmenuEntityScope\b|\bfocusMenuNode\b/.test(stripped)
      ) {
        violations.push(`${rel}: resolver bypasses shared entity scope seam`);
      }
      if (rel === "app/left/menus/codeFileMenu.ts") {
        if (!/\bimport\s*\{\s*normalizeEntityDescriptor\s*\}/.test(stripped)) {
          violations.push(`${rel}: missing entity descriptor normalizer`);
        }
        if (
          !/\bexport\s+function\s+codeFileMenu\s*\(\s*entity:\s*unknown\s*\)/.test(
            stripped,
          )
        ) {
          violations.push(`${rel}: code-file menu is a typed-only runtime seam`);
        }
        if (
          !/\bconst\s+normalizedEntity\s*=\s*normalizeEntityDescriptor\s*\(\s*entity\s*\)/.test(
            stripped,
          ) ||
          !/\bnormalizedEntity\?\.\s*kind\s*!==\s*["']code-file["']/.test(stripped)
        ) {
          violations.push(`${rel}: code-file menu bypasses normalized entity`);
        }
        if (/\bentity\.(?:id|path|isDir|nodeId|scope)\b/.test(stripped)) {
          violations.push(`${rel}: code-file menu reads raw entity fields`);
        }
        if (/\bimport\s+type\s*\{\s*CodeFileEntity\b/.test(stripped)) {
          violations.push(`${rel}: code-file menu imports typed-only CodeFileEntity`);
        }
      }
      if (rel === "app/left/menus/vaultDocMenu.ts") {
        if (!/\bimport\s*\{\s*normalizeEntityDescriptor\s*\}/.test(stripped)) {
          violations.push(`${rel}: missing entity descriptor normalizer`);
        }
        if (
          !/\bexport\s+function\s+vaultDocMenu\s*\(\s*entity:\s*unknown\s*\)/.test(
            stripped,
          )
        ) {
          violations.push(`${rel}: vault-doc menu is a typed-only runtime seam`);
        }
        if (
          !/\bconst\s+normalizedEntity\s*=\s*normalizeEntityDescriptor\s*\(\s*entity\s*\)/.test(
            stripped,
          ) ||
          !/\bnormalizedEntity\?\.\s*kind\s*!==\s*["']vault-doc["']/.test(stripped)
        ) {
          violations.push(`${rel}: vault-doc menu bypasses normalized entity`);
        }
        if (/\bentity\.(?:id|path|stem|nodeId|scope)\b/.test(stripped)) {
          violations.push(`${rel}: vault-doc menu reads raw entity fields`);
        }
        if (/\bimport\s+type\s*\{\s*VaultDocEntity\b/.test(stripped)) {
          violations.push(`${rel}: vault-doc menu imports typed-only VaultDocEntity`);
        }
      }
      if (rel === "app/islands/menus/islandMenu.ts") {
        if (!/\bimport\s*\{\s*normalizeEntityDescriptor\s*\}/.test(stripped)) {
          violations.push(`${rel}: missing entity descriptor normalizer`);
        }
        if (
          !/\bexport\s+function\s+islandMenu\s*\(\s*entity:\s*unknown\s*\)/.test(
            stripped,
          )
        ) {
          violations.push(`${rel}: island menu is a typed-only runtime seam`);
        }
        if (
          !/\bconst\s+normalizedEntity\s*=\s*normalizeEntityDescriptor\s*\(\s*entity\s*\)/.test(
            stripped,
          ) ||
          !/\bnormalizedEntity\?\.\s*kind\s*!==\s*["']island["']/.test(stripped)
        ) {
          violations.push(`${rel}: island menu bypasses normalized entity`);
        }
        if (/\bentity\.(?:id|scope)\b/.test(stripped)) {
          violations.push(`${rel}: island menu reads raw entity fields`);
        }
        if (/\bimport\s+type\s*\{\s*IslandEntity\b/.test(stripped)) {
          violations.push(`${rel}: island menu imports typed-only IslandEntity`);
        }
      }
      if (rel === "app/right/menus/searchResultMenu.ts") {
        if (!/\bimport\s*\{\s*normalizeEntityDescriptor\s*\}/.test(stripped)) {
          violations.push(`${rel}: missing entity descriptor normalizer`);
        }
        if (
          !/\bexport\s+function\s+searchResultMenu\s*\(\s*entity:\s*unknown\s*\)/.test(
            stripped,
          )
        ) {
          violations.push(`${rel}: search-result menu is a typed-only runtime seam`);
        }
        if (
          !/\bconst\s+normalizedEntity\s*=\s*normalizeEntityDescriptor\s*\(\s*entity\s*\)/.test(
            stripped,
          ) ||
          !/\bnormalizedEntity\?\.\s*kind\s*!==\s*["']search-result["']/.test(stripped)
        ) {
          violations.push(`${rel}: search-result menu bypasses normalized entity`);
        }
        if (/\bentity\.(?:id|source|nodeId|score|isCode|scope)\b/.test(stripped)) {
          violations.push(`${rel}: search-result menu reads raw entity fields`);
        }
        if (/\bimport\s+type\s*\{\s*SearchResultEntity\b/.test(stripped)) {
          violations.push(
            `${rel}: search-result menu imports typed-only SearchResultEntity`,
          );
        }
      }
      if (rel === "app/timeline/menus/eventMarkMenu.ts") {
        if (!/\bimport\s*\{\s*normalizeEntityDescriptor\s*\}/.test(stripped)) {
          violations.push(`${rel}: missing entity descriptor normalizer`);
        }
        if (
          !/\bexport\s+function\s+eventMarkMenu\s*\(\s*entity:\s*unknown/.test(stripped)
        ) {
          violations.push(`${rel}: event mark menu is a typed-only runtime seam`);
        }
        if (
          !/\bconst\s+normalizedEntity\s*=\s*normalizeEntityDescriptor\s*\(\s*entity\s*\)/.test(
            stripped,
          ) ||
          !/\bnormalizedEntity\?\.\s*kind\s*!==\s*["']event["']/.test(stripped)
        ) {
          violations.push(`${rel}: event mark menu bypasses normalized entity`);
        }
        if (/\bentity\.(?:id|nodeIds|scope|ts|truncatedNodeIds)\b/.test(stripped)) {
          violations.push(`${rel}: event mark menu reads raw entity fields`);
        }
        if (/\bimport\s+type\s*\{\s*EventEntity\b/.test(stripped)) {
          violations.push(`${rel}: event mark menu imports typed-only EventEntity`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps viewer target writes behind the viewer intent seam", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\.openInViewer\s*\(/.test(stripped)) {
        violations.push(`${rel}: raw open-in-viewer write`);
      }
      if (/\.closeViewer\s*\(/.test(stripped)) {
        violations.push(`${rel}: raw close-viewer write`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps viewer target reads behind the viewer intent seam", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\bviewerTarget\b/.test(stripped)) {
        violations.push(`${rel}: raw viewer target read`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps dock workspace tab projection behind the tab seam", () => {
    const rel = "app/stage/DockWorkspace.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseOpenDocs\b/.test(statement)) {
        violations.push(`${rel}: raw open-docs subscription`);
      }
      if (/\buseActiveDocId\b/.test(statement)) {
        violations.push(`${rel}: raw active-doc subscription`);
      }
    }
    if (!/\buseDockWorkspaceTabsView\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing dock workspace tabs view`);
    }
    if (!/\bderiveDockWorkspaceSyncPlan\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing dock sync plan seam`);
    }
    if (/\bfunction\s+titleFor\b|\btitleFor\s*\(/.test(stripped)) {
      violations.push(`${rel}: local dock tab title projection`);
    }
    if (/\bnew\s+Set\s*\(\s*openDocs\.map\b/.test(stripped)) {
      violations.push(`${rel}: local open-doc wanted-set projection`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps dock document tab state behind the tab seam", () => {
    const violations: string[] = [];
    const tabsRel = "stores/view/tabs.ts";
    const viewRel = "stores/view/viewStore.ts";
    const tabs = stripComments(readFileSync(join(SRC_ROOT, tabsRel), "utf8"));
    const view = stripComments(readFileSync(join(SRC_ROOT, viewRel), "utf8"));
    const rawTabWrite =
      /\.(?:openDoc|promoteDoc|activateDoc|closeDoc|reorderDocs)\s*\(/;
    const rawTabRead = /\b(?:openDocs|activeDocId)\b/;

    for (const root of ["app", "scene", "platform", "stores/view"] as const) {
      for (const file of sourceFiles(join(SRC_ROOT, root))) {
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
        if (rel === "stores/view/tabs.ts" || rel === "stores/view/viewStore.ts") {
          continue;
        }
        const stripped = stripComments(readFileSync(file, "utf8"));

        if (rawTabWrite.test(stripped)) {
          violations.push(`${rel}: raw dock-tab lifecycle write`);
        }
        for (const statement of importStatements(stripped)) {
          if (/\buseOpenDocs\b|\buseActiveDocId\b/.test(statement)) {
            violations.push(`${rel}: raw dock-tab subscription`);
          }
        }
        if (/\buseViewStore\b/.test(stripped) && rawTabRead.test(stripped)) {
          violations.push(`${rel}: raw dock-tab state read`);
        }
      }
    }

    if (!/\bnormalizeOpenDocs\b/.test(view)) {
      violations.push(`${viewRel}: missing normalized open-doc helper`);
    }
    if (!/\bnormalizeActiveDocId\b/.test(view)) {
      violations.push(`${viewRel}: missing normalized active-doc helper`);
    }
    if (!/\bexport\s+function\s+normalizeViewerSurface\b/.test(view)) {
      violations.push(`${viewRel}: missing viewer-surface normalizer`);
    }
    if (!/\bArray\.isArray\s*\(\s*openDocs\s*\)/.test(view)) {
      violations.push(`${viewRel}: open-doc normalizer assumes array input`);
    }
    for (const typedOnly of [
      "openDoc: (nodeId: string, surface: ViewerSurface, permanent?: boolean)",
      "promoteDoc: (nodeId: string)",
      "activateDoc: (nodeId: string)",
      "closeDoc: (nodeId: string)",
      "reorderDocs: (orderedIds: string[])",
      "previewDocTab(\n  nodeId: string",
      "openDocTab(\n  nodeId: string",
      "scope: string | null = useViewStore.getState().scope",
      "promoteDocTab(nodeId: string)",
      "activateDocTab(nodeId: string)",
      "closeDocTab(nodeId: string)",
      "reorderDocTabs(orderedIds: string[])",
      "deriveDockDocPanelView(\n  nodeId: string",
      "useDockDocPanelView(\n  nodeId: string",
    ]) {
      if (view.includes(typedOnly) || tabs.includes(typedOnly)) {
        violations.push(`${tabsRel}: typed-only dock-tab seam ${typedOnly}`);
      }
    }
    for (const helper of ["previewDocTab", "openDocTab"]) {
      const start = tabs.indexOf(`export function ${helper}`);
      const end = start >= 0 ? tabs.indexOf("\nexport function", start + 1) : -1;
      const body = start >= 0 ? tabs.slice(start, end >= 0 ? end : undefined) : "";
      if (!/\bnormalizeNodeId\s*\(\s*nodeId\s*\)/.test(body)) {
        violations.push(`${tabsRel}: ${helper} bypasses node-id normalizer`);
      }
      if (!/\bnormalizeViewerSurface\s*\(\s*surface\s*\)/.test(body)) {
        violations.push(`${tabsRel}: ${helper} bypasses viewer-surface normalizer`);
      }
      if (!/\bnormalizeSelectionScope\s*\(\s*scope\s*\)/.test(body)) {
        violations.push(`${tabsRel}: ${helper} bypasses selection-scope normalizer`);
      }
    }
    for (const helper of [
      "deriveDockWorkspaceSyncPlan",
      "serializeWorkspaceTabs",
      "parseWorkspaceTabs",
      "restoreDocTabsIfEmpty",
      "normalizeDockWorkspaceTabsView",
    ]) {
      const start = tabs.indexOf(`export function ${helper}`);
      const end = start >= 0 ? tabs.indexOf("\nexport function", start + 1) : -1;
      const body = start >= 0 ? tabs.slice(start, end >= 0 ? end : undefined) : "";
      if (!/\bnormalizeOpenDocs\s*\(/.test(body)) {
        violations.push(`${tabsRel}: ${helper} bypasses normalized open-doc helper`);
      }
      if (!/\bnormalizeActiveDocId\s*\(/.test(body)) {
        violations.push(`${tabsRel}: ${helper} bypasses normalized active-doc helper`);
      }
    }
    for (const helper of ["useOpenDocs", "useWorkspaceHasDocs"]) {
      const start = tabs.indexOf(`export function ${helper}`);
      const end = start >= 0 ? tabs.indexOf("\nexport function", start + 1) : -1;
      const body = start >= 0 ? tabs.slice(start, end >= 0 ? end : undefined) : "";
      if (!/\bnormalizeOpenDocs\s*\(/.test(body)) {
        violations.push(`${tabsRel}: ${helper} bypasses normalized open-doc helper`);
      }
    }
    for (const helper of ["useActiveDocId", "useDockWorkspaceTabsView"]) {
      const start = tabs.indexOf(`export function ${helper}`);
      const end = start >= 0 ? tabs.indexOf("\nexport function", start + 1) : -1;
      const body = start >= 0 ? tabs.slice(start, end >= 0 ? end : undefined) : "";
      if (!/\bnormalize(?:ActiveDocId|DockWorkspaceTabsView)\s*\(/.test(body)) {
        violations.push(`${tabsRel}: ${helper} bypasses normalized active-doc helper`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps dock document panel composition behind the tab read model", () => {
    const rel = "app/stage/DocPanel.tsx";
    const storeRel = "stores/view/tabs.ts";
    const stripped = stripComments(readFileSync(DOC_PANEL, "utf8"));
    const store = stripComments(readFileSync(join(SRC_ROOT, storeRel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseActiveScope\b/.test(statement)) {
        violations.push(`${rel}: local active-scope join`);
      }
      if (/\buseContentView\b/.test(statement)) {
        violations.push(`${rel}: local content query join`);
      }
      if (/\bderiveMarkdownHeaderView\b/.test(statement)) {
        violations.push(`${rel}: local markdown header projection`);
      }
    }
    if (!/\buseDockDocPanelView\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing dock doc panel view seam`);
    }
    if (/\bheaderProps\b/.test(stripped)) {
      violations.push(`${rel}: local header props projection`);
    }
    if (
      !/\bderiveDockDocPanelView\s*\([\s\S]*nodeId:\s*unknown[\s\S]*surface:\s*unknown[\s\S]*scope:\s*unknown/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: dock doc panel view trusts typed inputs`);
    }
    if (
      !/\bconst\s+normalizedNodeId\s*=\s*normalizeNodeId\s*\(\s*nodeId\s*\)/.test(
        store,
      ) ||
      !/\bconst\s+normalizedSurface\s*=\s*normalizeViewerSurface\s*\(\s*surface\s*\)/.test(
        store,
      ) ||
      !/\bconst\s+normalizedScope\s*=\s*normalizeViewStoreSessionString\s*\(\s*scope\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: dock doc panel view bypasses normalizers`);
    }
    if (
      !/\buseDockDocPanelView\s*\([\s\S]*nodeId:\s*unknown[\s\S]*surface:\s*unknown/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: dock doc panel hook exposes typed-only inputs`);
    }
    if (
      !/\buseContentView\s*\(\s*normalizedNodeId\s*,\s*scope\s*\)/.test(store)
    ) {
      violations.push(`${storeRel}: dock doc panel hook reads content with raw node id`);
    }
    if (
      !/\bderiveMarkdownHeaderView\s*\(\s*normalizedNodeId\s*,\s*content\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: dock doc panel header uses raw node id`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps the retired single-viewer surface from returning", () => {
    const viewerFiles = sourceFiles(join(SRC_ROOT, "app/viewer")).map((file) =>
      relative(SRC_ROOT, file).replaceAll("\\", "/"),
    );

    expect(viewerFiles).not.toContain("app/viewer/ViewerSurface.tsx");
  });

  it("keeps markdown reader parsing behind the stores selector", () => {
    const source = readFileSync(MARKDOWN_READER, "utf8");
    const stripped = stripComments(source);
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\bparseDocument\b/.test(statement)) {
        violations.push("app/viewer/MarkdownReader.tsx: parser import");
      }
    }
    if (/\bparseDocument\s*\(/.test(stripped)) {
      violations.push("app/viewer/MarkdownReader.tsx: local document parse");
    }
    if (!/\bderiveMarkdownReaderView\b/.test(stripped)) {
      violations.push("app/viewer/MarkdownReader.tsx: missing stores reader selector");
    }
    if (
      /\bcontent\.(?:loading|errored|degraded|available|reasons|path|languageHint|truncated|text)\b/.test(
        stripped,
      )
    ) {
      violations.push("app/viewer/MarkdownReader.tsx: raw content field projection");
    }
    for (const localProjection of [
      "DOCTYPE_EYEBROW",
      "eyebrowFor",
      "formatLongDate",
      "readingMinutes",
      "splitEditorial",
    ]) {
      if (stripped.includes(localProjection)) {
        violations.push(
          `app/viewer/MarkdownReader.tsx: local reader projection ${localProjection}`,
        );
      }
    }
    if (/\bview\.frontmatter\b|\bview\.status\b|\bview\.body\b/.test(stripped)) {
      violations.push(
        "app/viewer/MarkdownReader.tsx: local reader body/frontmatter projection",
      );
    }
    if (/\btruncated\.returned_bytes\b|\btruncated\.total_bytes\b/.test(stripped)) {
      violations.push(
        "app/viewer/MarkdownReader.tsx: local truncation message projection",
      );
    }
    if (
      /\btone\s*===\s*["'](?:broken|muted|faint)["']/.test(stripped) ||
      /\bmarkdownView\.stateTone\s*===\s*["'](?:broken|muted|faint)["']/.test(stripped)
    ) {
      violations.push(
        "app/viewer/MarkdownReader.tsx: local reader state tone class projection",
      );
    }
    if (!/\bmarkdownView\.stateToneClass\b/.test(stripped)) {
      violations.push("app/viewer/MarkdownReader.tsx: missing stores state tone class");
    }
    if (!/\bview\.editorial\b/.test(stripped)) {
      violations.push(
        "app/viewer/MarkdownReader.tsx: missing stores editorial projection",
      );
    }
    if (!/\bmarkdownView\.truncationMessage\b/.test(stripped)) {
      violations.push(
        "app/viewer/MarkdownReader.tsx: missing stores truncation message",
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps code viewer content-state projection behind the stores selector", () => {
    const source = readFileSync(CODE_VIEWER, "utf8");
    const stripped = stripComments(source);
    const violations: string[] = [];

    if (!/\bderiveCodeViewerView\b/.test(stripped)) {
      violations.push("app/viewer/CodeViewer.tsx: missing stores code-viewer selector");
    }
    if (
      /\bcontent\.(?:loading|errored|degraded|available|reasons|path|languageHint|truncated|text)\b/.test(
        stripped,
      )
    ) {
      violations.push("app/viewer/CodeViewer.tsx: raw content field projection");
    }
    if (!/\bderiveCodeLineWindow\b/.test(stripped)) {
      violations.push("app/viewer/CodeViewer.tsx: missing code-line window seam");
    }
    if (!/\bderiveCodeLineWindowPresentation\b/.test(stripped)) {
      violations.push("app/viewer/CodeViewer.tsx: missing code-line presentation seam");
    }
    if (!/\bderiveCodeLineRowStyle\b/.test(stripped)) {
      violations.push("app/viewer/CodeViewer.tsx: missing code-line row seam");
    }
    if (/\[\s*scrollTop\s*,\s*setScrollTop\s*\]\s*=\s*useState/.test(stripped)) {
      violations.push("app/viewer/CodeViewer.tsx: local code viewer scroll state");
    }
    if (!/\buseCodeViewerScrollTop\s*\(\s*\)/.test(stripped)) {
      violations.push("app/viewer/CodeViewer.tsx: missing code viewer scroll seam");
    }
    if (/\buseCodeViewerScrollState\s*\(\s*\)/.test(stripped)) {
      violations.push("app/viewer/CodeViewer.tsx: broad code viewer scroll state read");
    }
    if (!/\bsetCodeViewerScrollTop\s*\(/.test(stripped)) {
      violations.push("app/viewer/CodeViewer.tsx: missing code viewer scroll setter");
    }
    const storeRel = "stores/view/codeViewer.ts";
    const store = stripComments(readFileSync(join(SRC_ROOT, storeRel), "utf8"));
    if (
      !/\bexport\s+function\s+boundedScrollTop\s*\(\s*scrollTop:\s*unknown\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: missing runtime scroll-top normalizer`);
    }
    if (
      !/\bexport\s+function\s+useCodeViewerScrollTop\s*\(\s*\)\s*:\s*number/.test(store)
    ) {
      violations.push(`${storeRel}: missing narrow scroll-top read seam`);
    }
    if (/\bexport\s+function\s+useCodeViewerScrollState\s*\(/.test(store)) {
      violations.push(`${storeRel}: exposes broad scroll state hook`);
    }
    if (/\bsetScrollTop:\s*\(scrollTop:\s*number\)/.test(store)) {
      violations.push(`${storeRel}: typed-only scroll setter`);
    }
    if (/\bsetCodeViewerScrollTop\s*\(\s*scrollTop:\s*number\s*\)/.test(store)) {
      violations.push(`${storeRel}: typed-only scroll helper`);
    }
    if (!/\bboundedPositiveInteger\b/.test(store)) {
      violations.push(`${storeRel}: line window bypasses measurement normalizer`);
    }
    for (const localCopy of [
      "This file is empty",
      "read-only",
      "Truncated to the first",
      "open the file directly",
    ]) {
      if (stripped.includes(localCopy)) {
        violations.push(
          `app/viewer/CodeViewer.tsx: local code-viewer copy "${localCopy}"`,
        );
      }
    }
    if (!/\bview\.readOnlyLabel\b/.test(stripped)) {
      violations.push("app/viewer/CodeViewer.tsx: missing stores read-only label");
    }
    if (!/\bview\.truncationMessage\b/.test(stripped)) {
      violations.push("app/viewer/CodeViewer.tsx: missing stores truncation message");
    }
    if (
      /\btone\s*===\s*["'](?:broken|muted|faint)["']/.test(stripped) ||
      /\bview\.stateTone\s*===\s*["'](?:broken|muted|faint)["']/.test(stripped)
    ) {
      violations.push("app/viewer/CodeViewer.tsx: local state tone class projection");
    }
    if (!/\bview\.stateToneClass\b/.test(stripped)) {
      violations.push("app/viewer/CodeViewer.tsx: missing stores state tone class");
    }
    for (const localLineChrome of [
      "file contents",
      "min-h-0 flex-1 overflow-auto bg-paper-sunken font-mono text-body",
      "flex whitespace-pre",
      "sticky left-0 select-none pr-fg-2 text-right text-ink-faint",
      "px-fg-1",
    ]) {
      if (stripped.includes(localLineChrome)) {
        violations.push(
          `app/viewer/CodeViewer.tsx: local code-line chrome "${localLineChrome}"`,
        );
      }
    }
    if (!/\bpresentation\.scrollerClassName\b/.test(stripped)) {
      violations.push("app/viewer/CodeViewer.tsx: missing scroller class projection");
    }
    if (!/\bpresentation\.scrollerAriaLabel\b/.test(stripped)) {
      violations.push("app/viewer/CodeViewer.tsx: missing scroller aria projection");
    }
    if (!/\bpresentation\.rowClassName\b/.test(stripped)) {
      violations.push("app/viewer/CodeViewer.tsx: missing line-row class projection");
    }
    if (!/\bpresentation\.gutterClassName\b/.test(stripped)) {
      violations.push("app/viewer/CodeViewer.tsx: missing gutter class projection");
    }
    if (!/\bpresentation\.codeClassName\b/.test(stripped)) {
      violations.push("app/viewer/CodeViewer.tsx: missing code class projection");
    }
    if (!/\buseElementHeight\b/.test(stripped)) {
      violations.push(
        "app/viewer/CodeViewer.tsx: missing shared height measurement seam",
      );
    }
    if (/\bnew\s+ResizeObserver\b/.test(stripped)) {
      violations.push("app/viewer/CodeViewer.tsx: local resize observer");
    }
    if (/\bMath\.(?:floor|ceil)\s*\(\s*(?:scrollTop|viewport)/.test(stripped)) {
      violations.push("app/viewer/CodeViewer.tsx: local line-window math");
    }

    expect(violations).toEqual([]);
  });

  it("keeps viewer tokenization behind the shared highlighter seam", () => {
    const violations: string[] = [];
    const allowedOwners = new Set([
      "app/viewer/useHighlighter.ts",
      "app/viewer/languages.ts",
      "app/viewer/highlighterTheme.ts",
    ]);

    for (const root of ["app", "stores", "platform", "scene"] as const) {
      for (const file of sourceFiles(join(SRC_ROOT, root))) {
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
        if (allowedOwners.has(rel)) continue;

        const stripped = stripComments(readFileSync(file, "utf8"));
        for (const statement of importStatements(stripped)) {
          if (/["'](?:shiki|shiki\/[^"']+|@shikijs\/[^"']+)["']/.test(statement)) {
            violations.push(`${rel}: direct highlighter package import`);
          }
        }
        if (
          /\b(?:createHighlighterCore|createJavaScriptRegexEngine|codeToHast|codeToTokensBase|resolveGrammar)\b/.test(
            stripped,
          )
        ) {
          violations.push(`${rel}: local tokenization implementation`);
        }
      }
    }

    const highlighter = readFileSync(
      join(SRC_ROOT, "app/viewer/useHighlighter.ts"),
      "utf8",
    );
    if (
      !highlighter.includes("highlighterPromise") ||
      !highlighter.includes("createHighlighterCore")
    ) {
      violations.push(
        "app/viewer/useHighlighter.ts: missing singleton highlighter promise",
      );
    }
    if (!highlighter.includes("langLoads") || !highlighter.includes("new Map")) {
      violations.push("app/viewer/useHighlighter.ts: missing grammar load de-dupe map");
    }
    if (/\buseState\s*\(/.test(highlighter)) {
      violations.push("app/viewer/useHighlighter.ts: hook-local tokenization state");
    }
    if (!/\buseSyncExternalStore\b/.test(highlighter)) {
      violations.push(
        "app/viewer/useHighlighter.ts: missing external-store snapshot seam",
      );
    }
    if (!/\bTOKENIZATION_CACHE_CAP\b/.test(highlighter)) {
      violations.push(
        "app/viewer/useHighlighter.ts: missing bounded tokenization cache",
      );
    }

    const codeViewer = stripComments(readFileSync(CODE_VIEWER, "utf8"));
    if (
      !/\buseTokenLines\s*\(\s*view\.text\s*,\s*view\.languageHint\s*\)/.test(
        codeViewer,
      )
    ) {
      violations.push("app/viewer/CodeViewer.tsx: missing shared token-lines seam");
    }

    const markdownReader = stripComments(
      readFileSync(join(SRC_ROOT, "app/viewer/MarkdownReader.tsx"), "utf8"),
    );
    if (!/\buseHighlightedHast\s*\(\s*code\s*,\s*lang\s*\)/.test(markdownReader)) {
      violations.push(
        "app/viewer/MarkdownReader.tsx: missing shared HAST highlighter seam",
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps frontmatter chrome projection behind the stores selector", () => {
    const source = readFileSync(FRONTMATTER_HEADER, "utf8");
    const stripped = stripComments(source);
    const violations: string[] = [];

    if (/\bCATEGORY_TAGS\b|\btagCategory\b/.test(stripped)) {
      violations.push(
        "app/viewer/FrontmatterHeader.tsx: local tag category projection",
      );
    }
    if (/\bfrontmatter\b/.test(stripped)) {
      violations.push("app/viewer/FrontmatterHeader.tsx: raw frontmatter prop");
    }
    if (/\bdoc:\$\{/.test(stripped)) {
      violations.push("app/viewer/FrontmatterHeader.tsx: local related node id");
    }
    if (!/\bFrontmatterHeaderView\b/.test(stripped)) {
      violations.push("app/viewer/FrontmatterHeader.tsx: missing stores header view");
    }

    expect(violations).toEqual([]);
  });

  it("keeps markdown wiki-link document identity on the shared grammar", () => {
    const source = readFileSync(REMARK_WIKI_LINK, "utf8");
    const stripped = stripComments(source);
    const violations: string[] = [];

    if (!/\bdocNodeIdFromStem\b/.test(stripped)) {
      violations.push("app/viewer/remarkWikiLink.ts: missing shared doc id grammar");
    }
    if (/\bdoc:\$\{/.test(stripped)) {
      violations.push("app/viewer/remarkWikiLink.ts: local doc id construction");
    }

    expect(violations).toEqual([]);
  });

  it("keeps stores query document identity on the shared grammar", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (/`doc:\$\{/.test(stripped)) {
      violations.push(`${rel}: local document node id construction`);
    }
    if (!/\bdocNodeIdFromStem\s*\(\s*result\.stem\s*\)/.test(stripped)) {
      violations.push(`${rel}: create result node id does not use shared grammar`);
    }
    if (!/\bnodeId:\s*docNodeIdFromStem\s*\(\s*stem\s*\)/.test(stripped)) {
      violations.push(
        `${rel}: frontmatter header related ids do not use shared grammar`,
      );
    }
    if (!/\bconst\s+targetId\s*=\s*docNodeIdFromStem\s*\(\s*stem\s*\)/.test(stripped)) {
      violations.push(`${rel}: link-resolution target ids do not use shared grammar`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps discovery pin writes behind the discovery intent seam", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\.pinDiscovery\s*\(/.test(stripped)) {
        violations.push(`${rel}: raw discovery pin`);
      }
      if (/\.unpinDiscovery\s*\(/.test(stripped)) {
        violations.push(`${rel}: raw discovery unpin`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps discovery candidate activation behind the discovery intent seam", () => {
    const rel = "app/stage/Discover.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\bselectNode\b/.test(statement)) {
        violations.push(`${rel}: raw node-selection import`);
      }
      if (/\bselectDiscoveryCandidate\b/.test(statement)) {
        violations.push(`${rel}: direct discovery selection action import`);
      }
    }
    if (/\bselectNode\s*\(/.test(stripped)) {
      violations.push(`${rel}: raw node-selection call`);
    }
    if (!/\buseDiscoveryCandidateSelection\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing discovery candidate selection hook`);
    }
    if (/\.replace\s*\(\s*\/\^\(feature\|doc\):/.test(stripped)) {
      violations.push(`${rel}: local discovery node label projection`);
    }
    if (/\bMath\.round\s*\(\s*candidate\.confidence/.test(stripped)) {
      violations.push(`${rel}: local discovery confidence label projection`);
    }
    if (!/\buseDiscoveryPanelOpenView\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing discovery open label view`);
    }
    if (!/\buseDiscoveryCandidateRows\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing discovery candidate row view`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps editor lifecycle writes behind the editor intent seam", () => {
    const violations: string[] = [];
    const viewRel = "stores/view/viewStore.ts";
    const editorRel = "stores/view/editor.ts";
    const view = stripComments(readFileSync(join(SRC_ROOT, viewRel), "utf8"));
    const editor = stripComments(readFileSync(join(SRC_ROOT, editorRel), "utf8"));
    const rawEditorWrite =
      /\.(?:openEditor|setDraft|markSaving|markSaved|markConflict|markFailed|closeEditor)\s*\(/;

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (rawEditorWrite.test(stripped)) {
        violations.push(`${rel}: raw editor lifecycle write`);
      }
    }

    for (const seam of [
      "normalizeEditorTextValue",
      "openEditor: (nodeId: unknown, text: unknown, baseBlobHash: unknown)",
      "setDraft: (text: unknown)",
      "markSaved: (blobHash: unknown)",
    ]) {
      if (!view.includes(seam)) {
        violations.push(`${viewRel}: missing editor lifecycle seam ${seam}`);
      }
    }
    for (const seam of [
      "openDocumentEditor(\n  nodeId: unknown,\n  text: unknown,\n  baseBlobHash: unknown",
      "updateEditorDraft(text: unknown)",
      "markEditorSaved(blobHash: unknown)",
    ]) {
      if (!editor.includes(seam)) {
        violations.push(`${editorRel}: missing editor intent seam ${seam}`);
      }
    }
    for (const typedOnly of [
      "openEditor: (nodeId: string, text: string, baseBlobHash: string)",
      "setDraft: (text: string)",
      "markSaved: (blobHash: string)",
      "openDocumentEditor(\n  nodeId: string,\n  text: string,\n  baseBlobHash: string",
      "updateEditorDraft(text: string)",
      "markEditorSaved(blobHash: string)",
    ]) {
      if (view.includes(typedOnly) || editor.includes(typedOnly)) {
        violations.push(`editor lifecycle typed-only seam ${typedOnly}`);
      }
    }
    if (
      !/\bopenEditor:\s*\(nodeId,\s*text,\s*baseBlobHash\)\s*=>[\s\S]*\bnormalizeEditorTextValue\s*\(\s*text\s*\)[\s\S]*\bnormalizeEditorTextValue\s*\(\s*baseBlobHash\s*\)/.test(
        view,
      )
    ) {
      violations.push(`${viewRel}: openEditor bypasses text/blob normalizer`);
    }
    if (
      !/\bsetDraft:\s*\(text\)\s*=>[\s\S]*\bnormalizeEditorTextValue\s*\(\s*text\s*\)/.test(
        view,
      )
    ) {
      violations.push(`${viewRel}: setDraft bypasses text normalizer`);
    }
    if (
      !/\bmarkSaved:\s*\(blobHash\)\s*=>[\s\S]*\bnormalizeEditorTextValue\s*\(\s*blobHash\s*\)/.test(
        view,
      )
    ) {
      violations.push(`${viewRel}: markSaved bypasses blob normalizer`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps markdown editor reads behind the editor read model", () => {
    const rel = "app/viewer/MarkdownDocView.tsx";
    const storeRel = "stores/view/editor.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const store = stripComments(readFileSync(join(SRC_ROOT, storeRel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseViewStore\b/.test(statement)) {
        violations.push(`${rel}: raw view-store editor read`);
      }
      if (/\bEditorStatus\b/.test(statement)) {
        violations.push(`${rel}: app-layer editor status typing`);
      }
      if (/\bderiveMarkdownReaderView\b/.test(statement)) {
        violations.push(`${rel}: local markdown reader projection`);
      }
    }
    if (!/\buseDocumentEditorView\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing editor read-model seam`);
    }
    if (!/\bderiveMarkdownEditorDocumentView\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing markdown editor document projection`);
    }
    if (!/\bderiveMarkdownEditorFrontmatterPatch\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing markdown editor frontmatter patch seam`);
    }
    if (!/\bsetMarkdownEditorFrontmatterDraft\b/.test(stripped)) {
      violations.push(`${rel}: missing frontmatter draft write seam`);
    }
    if (!/\beditorChrome\.frontmatterDraft\b/.test(stripped)) {
      violations.push(`${rel}: missing frontmatter draft read-model seam`);
    }
    if (
      !/\bexport\s+function\s+normalizeMarkdownEditorFrontmatterDraft\s*\([\s\S]*?\bdraft:\s*unknown[\s\S]*?\):\s*Partial<MarkdownEditorFrontmatterDraft>/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: missing frontmatter draft runtime normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeMarkdownEditorFrontmatterDraftState\s*\([\s\S]*?\bdraft:\s*unknown[\s\S]*?\):\s*MarkdownEditorFrontmatterDraft/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: missing full frontmatter draft state normalizer`);
    }
    if (
      !/\bfunction\s+normalizeEditorDraftText\s*\(\s*value:\s*unknown\s*\)/.test(store)
    ) {
      violations.push(`${storeRel}: missing editor draft text normalizer`);
    }
    if (
      /\bseed:\s*\(\s*nodeId:\s*string,\s*currentStem:\s*string,\s*frontmatterDraft:\s*MarkdownEditorFrontmatterDraft/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: editor chrome seed exposes typed-only inputs`);
    }
    if (
      !/\bseed:\s*\([\s\S]*nodeId:\s*unknown[\s\S]*currentStem:\s*unknown[\s\S]*frontmatterDraft:\s*unknown/.test(
        store,
      ) ||
      !/\bconst\s+normalizedNodeId\s*=\s*normalizeNodeId\s*\(\s*nodeId\s*\)/.test(
        store,
      ) ||
      !/\bconst\s+normalizedStem\s*=\s*normalizeEditorDraftText\s*\(\s*currentStem\s*\)/.test(
        store,
      ) ||
      !/\bconst\s+normalizedFrontmatter\s*=\s*normalizeMarkdownEditorFrontmatterDraftState\s*\(\s*frontmatterDraft\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: editor chrome seed bypasses normalizers`);
    }
    if (
      !/\bsetRenameDraft:\s*\(draft\)\s*=>\s*set\s*\(\s*\{\s*renameDraft:\s*normalizeEditorDraftText\s*\(\s*draft\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: rename draft setter bypasses normalizer`);
    }
    if (
      !/\bsetFrontmatterDraft:\s*\(draft\)\s*=>[\s\S]*\bnormalizeMarkdownEditorFrontmatterDraft\s*\(\s*draft\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: frontmatter draft setter bypasses normalizer`);
    }
    if (
      !/\bderiveMarkdownEditorChromeView\s*\([\s\S]*nodeId:\s*unknown[\s\S]*currentStem:\s*unknown[\s\S]*sourceFrontmatterDraft:\s*unknown/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: editor chrome projection trusts typed inputs`);
    }
    if (
      /\bderiveDocumentEditorView\s*\([\s\S]*nodeId:\s*string[\s\S]*\)/.test(store) ||
      /\buseDocumentEditorView\s*\(\s*nodeId:\s*string\s*\)/.test(store)
    ) {
      violations.push(`${storeRel}: document editor read model trusts typed node id`);
    }
    if (
      !/\bderiveDocumentEditorView\s*\([\s\S]*nodeId:\s*unknown[\s\S]*\bconst\s+normalizedNodeId\s*=\s*normalizeNodeId\s*\(\s*nodeId\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: document editor view bypasses node-id normalizer`);
    }
    if (
      !/\bisEditing:\s*[\s\S]*normalizedNodeId\s*!==\s*null[\s\S]*state\.editorTarget\?\.nodeId\s*===\s*normalizedNodeId/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: document editor view uses raw target identity`);
    }
    if (/\bSTATUS_LABEL\b/.test(stripped)) {
      violations.push(`${rel}: local editor status labels`);
    }
    if (/\bconst\s+isEditing\b/.test(stripped)) {
      violations.push(`${rel}: local editor target projection`);
    }
    if (/\bcontent\.(?:available|text|blobHash)\b/.test(stripped)) {
      violations.push(`${rel}: raw content editor seed projection`);
    }
    if (/\bfrontmatter\?\./.test(stripped)) {
      violations.push(`${rel}: local frontmatter editor seed projection`);
    }
    if (/\.split\s*\(\s*["'],["']\s*\)/.test(stripped)) {
      violations.push(`${rel}: local frontmatter list parsing`);
    }
    if (/\.trim\s*\(\s*\)\s*\|\|\s*undefined/.test(stripped)) {
      violations.push(`${rel}: local optional frontmatter field normalization`);
    }
    if (/\bdefaultValue=\{(?:tags|date|related)\}/.test(stripped)) {
      violations.push(`${rel}: uncontrolled frontmatter editor field`);
    }
    if (
      /\bform\.elements\.namedItem\s*\(|\bread\s*\(\s*["'](?:tags|date|related)["']\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local frontmatter form state read`);
    }
    if (/editor\.statusTone\s*===/.test(stripped)) {
      violations.push(`${rel}: local editor status tone projection`);
    }
    if (!/\beditor\.statusToneClass\b/.test(stripped)) {
      violations.push(`${rel}: missing editor status tone class projection`);
    }
    for (const localAdvisoryField of [
      "check.severity",
      "check.message",
      "check.check",
      "check.fixable",
    ]) {
      if (stripped.includes(localAdvisoryField)) {
        violations.push(
          `${rel}: local editor advisory projection ${localAdvisoryField}`,
        );
      }
    }
    for (const field of [
      "editorChrome.hasAdvisories",
      "editorChrome.advisoriesLabel",
      "editorChrome.advisoryRows",
      "row.fixableSuffix",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing editor advisory row projection ${field}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps markdown document writes behind stores write mutations", () => {
    const rel = "app/viewer/MarkdownDocView.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (
        /\b(?:dispatchOps|adaptOpsWrite|invalidateAfterVaultMutation|stemFromNodeId)\b/.test(
          statement,
        )
      ) {
        violations.push(`${rel}: app-layer document write plumbing import`);
      }
      if (/\b(?:engineClient|engineKeys|useQueryClient)\b/.test(statement)) {
        violations.push(`${rel}: app-layer document write wire/cache import`);
      }
      if (/\buseMutation\b/.test(statement)) {
        violations.push(`${rel}: app-layer document write mutation ownership`);
      }
    }
    if (
      /\b(?:dispatchOps|adaptOpsWrite|invalidateAfterVaultMutation|stemFromNodeId|engineClient|engineKeys|useQueryClient|useMutation)\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: app-layer document write/cache implementation`);
    }
    if (/\b(?:set-body|set-frontmatter|opsCoreWrite|opsCoreCreate)\b/.test(stripped)) {
      violations.push(`${rel}: app-layer core write verb knowledge`);
    }
    if (!/\buseSaveBody\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing save-body mutation seam`);
    }
    if (!/\buseSetFrontmatter\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing frontmatter mutation seam`);
    }
    if (!/\buseRenameDoc\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing rename mutation seam`);
    }
    if (!/\bapplyEditorWriteResult\s*\(\s*result\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing typed editor write-result seam`);
    }
    if (!/\bapplyRenameEditorResult\s*\(\s*result\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing typed rename-result seam`);
    }
    if (!/\bapplyRenamedMarkdownDocWorkspace\s*\(\s*result\s*,/.test(stripped)) {
      violations.push(`${rel}: missing rename workspace re-key seam`);
    }
    if (
      /\b(?:closeDocTab|openDocTab)\s*\(\s*result\.(?:oldNodeId|newNodeId)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local rename tab re-key choreography`);
    }
    if (
      /\bopenDocumentEditor\s*\(\s*result\.newNodeId\s*,[\s\S]*?result\.newBlobHash\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local rename editor re-key choreography`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps document write mutation args normalized before ops dispatch", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const normalizer of [
      "normalizeSaveBodyArgs",
      "normalizeSetFrontmatterArgs",
      "normalizeCreateDocArgs",
      "normalizeRenameDocArgs",
    ]) {
      if (
        !new RegExp(
          `\\bexport\\s+function\\s+${normalizer}\\s*\\(\\s*args:\\s*unknown`,
        ).test(stripped)
      ) {
        violations.push(`${rel}: missing runtime write normalizer ${normalizer}`);
      }
    }

    const saveBody =
      stripped.match(
        /export function useSaveBody[\s\S]*?export interface SetFrontmatterArgs/,
      )?.[0] ?? "";
    const frontmatter =
      stripped.match(
        /export function useSetFrontmatter[\s\S]*?export interface CreateDocArgs/,
      )?.[0] ?? "";
    const create =
      stripped.match(
        /export function useCreateDoc[\s\S]*?export interface RenameDocArgs/,
      )?.[0] ?? "";
    const rename =
      stripped.match(
        /export function useRenameDoc[\s\S]*?export function deriveDocType/,
      )?.[0] ?? "";

    if (
      !/\bconst\s+normalized\s*=\s*normalizeSaveBodyArgs\s*\(\s*args\s*\)/.test(
        saveBody,
      )
    ) {
      violations.push(`${rel}: save-body mutation bypasses normalized args`);
    }
    if (
      !/\bref:\s*normalized\.ref\b[\s\S]*\bbody:\s*normalized\.text\b[\s\S]*\bexpected_blob_hash:\s*normalized\.baseBlobHash\b/.test(
        saveBody,
      )
    ) {
      violations.push(`${rel}: save-body dispatch uses raw body args`);
    }
    if (
      !/\binvalidateAfterVaultMutation\s*\(\s*queryClient\s*,\s*normalized\.scope\s*,\s*normalized\.nodeId\s*\)/.test(
        saveBody,
      )
    ) {
      violations.push(`${rel}: save-body invalidation uses raw identity`);
    }

    if (
      !/\bconst\s+normalized\s*=\s*normalizeSetFrontmatterArgs\s*\(\s*args\s*\)/.test(
        frontmatter,
      )
    ) {
      violations.push(`${rel}: frontmatter mutation bypasses normalized args`);
    }
    if (
      !/\bref:\s*normalized\.ref\b[\s\S]*\bdate:\s*normalized\.date\b[\s\S]*\btags:\s*normalized\.tags\b[\s\S]*\brelated:\s*normalized\.related\b/.test(
        frontmatter,
      )
    ) {
      violations.push(`${rel}: frontmatter dispatch uses raw metadata args`);
    }
    if (
      !/\binvalidateAfterVaultMutation\s*\(\s*queryClient\s*,\s*normalized\.scope\s*,\s*normalized\.nodeId\s*\)/.test(
        frontmatter,
      )
    ) {
      violations.push(`${rel}: frontmatter invalidation uses raw identity`);
    }

    if (
      !/\bconst\s+normalized\s*=\s*normalizeCreateDocArgs\s*\(\s*args\s*\)/.test(create)
    ) {
      violations.push(`${rel}: create mutation bypasses normalized args`);
    }
    if (
      !/\bscope:\s*normalized\.scope\s*\?\?\s*undefined\b[\s\S]*\bdoc_type:\s*normalized\.docType\b[\s\S]*\bfeature:\s*normalized\.feature\b[\s\S]*\btitle:\s*normalized\.title\b[\s\S]*\brelated:\s*normalized\.related\b/.test(
        create,
      )
    ) {
      violations.push(`${rel}: create dispatch uses raw args`);
    }
    if (
      !/\binvalidateAfterVaultMutation\s*\(\s*queryClient\s*,\s*normalized\.scope\s*\)/.test(
        create,
      )
    ) {
      violations.push(`${rel}: create invalidation uses raw scope`);
    }

    if (
      !/\bconst\s+normalized\s*=\s*normalizeRenameDocArgs\s*\(\s*args\s*\)/.test(rename)
    ) {
      violations.push(`${rel}: rename mutation bypasses normalized args`);
    }
    if (
      !/\bref:\s*normalized\.ref\b[\s\S]*\bto:\s*normalized\.to\b[\s\S]*\bexpected_blob_hash:\s*normalized\.expectedBlobHash\b/.test(
        rename,
      )
    ) {
      violations.push(`${rel}: rename dispatch uses raw args`);
    }
    if (
      !/\boldNodeId:\s*normalized\.nodeId\b[\s\S]*\bnewNodeId:\s*docNodeIdFromStem\s*\(\s*normalized\.to\s*\)/.test(
        rename,
      )
    ) {
      violations.push(`${rel}: rename result derives identity from raw args`);
    }
    if (
      !/\binvalidateAfterVaultMutation\s*\(\s*queryClient\s*,\s*normalized\.scope\s*\)/.test(
        rename,
      )
    ) {
      violations.push(`${rel}: rename invalidation uses raw scope`);
    }
    if (
      /\bstemFromNodeId\s*\(\s*args\.nodeId\s*\)|\bscope:\s*args\.scope\s*\?\?\s*undefined\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: document write seam still dispatches raw args`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps vault-mutation invalidation enrolled across graph, git, and history reads", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    const graphGenerationStart = stripped.indexOf(
      "export const GRAPH_GENERATION_QUERY_SUBTREES",
    );
    const graphGenerationEnd =
      graphGenerationStart >= 0
        ? stripped.indexOf("] as const", graphGenerationStart)
        : -1;
    const graphGenerationBlock =
      graphGenerationStart >= 0 && graphGenerationEnd > graphGenerationStart
        ? stripped.slice(graphGenerationStart, graphGenerationEnd)
        : "";
    const invalidationStart = stripped.indexOf(
      "export function invalidateAfterVaultMutation",
    );
    const invalidationEnd =
      invalidationStart >= 0
        ? stripped.indexOf(
            "export function invalidateGraphGenerationReads",
            invalidationStart,
          )
        : -1;
    const invalidationBlock =
      invalidationStart >= 0 && invalidationEnd > invalidationStart
        ? stripped.slice(invalidationStart, invalidationEnd)
        : "";

    for (const subtree of ["content", "file-tree", "history", "search"]) {
      if (!new RegExp(`["']${subtree}["']`).test(graphGenerationBlock)) {
        violations.push(`${rel}: graph-generation invalidation missing ${subtree}`);
      }
    }
    if (
      !/\bconst\s+normalizedScope\s*=\s*normalizeGitDiffArg\s*\(\s*scope\s*\)/.test(
        invalidationBlock,
      )
    ) {
      violations.push(`${rel}: vault mutation invalidation bypasses scope normalizer`);
    }
    if (
      !/\bconst\s+normalizedNodeId\s*=\s*normalizeNodeId\s*\(\s*nodeId\s*\)/.test(
        invalidationBlock,
      )
    ) {
      violations.push(`${rel}: vault mutation invalidation bypasses node normalizer`);
    }
    if (
      !/\binvalidateGraphGenerationSubtrees\s*\(\s*queryClient\s*,\s*normalizedScope\s*\)/.test(
        invalidationBlock,
      )
    ) {
      violations.push(`${rel}: vault mutation bypasses graph-generation invalidation`);
    }
    if (!/\bengineKeys\.status\s*\(\s*\)/.test(invalidationBlock)) {
      violations.push(`${rel}: vault mutation misses status invalidation`);
    }
    if (!/\bengineKeys\.map\s*\(\s*\)/.test(invalidationBlock)) {
      violations.push(`${rel}: vault mutation misses map invalidation`);
    }
    if (
      !/\bengineKeys\.gitChanges\s*\(\s*normalizedScope\s*\)/.test(invalidationBlock)
    ) {
      violations.push(`${rel}: vault mutation misses git-changes invalidation`);
    }
    if (
      !/\[\s*\.\.\.engineKeys\.all\s*,\s*["']git-diff["']\s*,\s*normalizedScope\s*\]/.test(
        invalidationBlock,
      )
    ) {
      violations.push(`${rel}: vault mutation misses scoped git-diff invalidation`);
    }
    if (
      !/\[\s*\.\.\.engineKeys\.all\s*,\s*["']git-histdiff["']\s*,\s*normalizedScope\s*,?\s*\]/.test(
        invalidationBlock,
      )
    ) {
      violations.push(`${rel}: vault mutation misses scoped git-histdiff invalidation`);
    }
    if (
      !/if\s*\(\s*normalizedScope\s*===\s*null\s*\)\s*\{[\s\S]*\[\s*\.\.\.engineKeys\.all\s*,\s*["']search["']\s*\][\s\S]*return\s*;[\s\S]*\}/.test(
        invalidationBlock,
      )
    ) {
      violations.push(
        `${rel}: null-scope vault mutation fallback search invalidation missing`,
      );
    }
    if (
      /invalidateQueryPrefix\s*\(\s*queryClient\s*,\s*\[\s*\.\.\.engineKeys\.all\s*,\s*["']search["']\s*\]\s*\)\s*;[\s\S]*if\s*\(\s*normalizedScope\s*===\s*null\s*\)/.test(
        invalidationBlock,
      )
    ) {
      violations.push(`${rel}: scoped vault mutation globally invalidates search`);
    }
    const renameStart = stripped.indexOf("export function useRenameDoc");
    const renameEnd =
      renameStart >= 0
        ? stripped.indexOf("export function deriveDocType", renameStart)
        : -1;
    const renameBlock =
      renameStart >= 0 && renameEnd > renameStart
        ? stripped.slice(renameStart, renameEnd)
        : "";
    if (renameBlock.length === 0) {
      violations.push(`${rel}: missing rename mutation seam`);
    }
    if (
      !/\bdispatchOps\s*\(\s*\{[\s\S]*target:\s*["']core["'][\s\S]*verb:\s*["']rename["'][\s\S]*mode:\s*["']write["']/.test(
        renameBlock,
      )
    ) {
      violations.push(`${rel}: rename mutation bypasses core write dispatch seam`);
    }
    if (
      !/if\s*\(\s*result\.kind\s*===\s*["']renamed["']\s*\)\s*\{[\s\S]*\binvalidateAfterVaultMutation\s*\(\s*queryClient\s*,\s*normalized\.scope\s*\)/.test(
        renameBlock,
      )
    ) {
      violations.push(`${rel}: rename mutation misses vault-mutation invalidation`);
    }
    if (/\binvalidateAfterVaultMutation\s*\(/.test(renameBlock)) {
      const renamedBranch =
        renameBlock.match(
          /if\s*\(\s*result\.kind\s*===\s*["']renamed["']\s*\)\s*\{[\s\S]*?\}/,
        )?.[0] ?? "";
      if (!/\binvalidateAfterVaultMutation\s*\(/.test(renamedBranch)) {
        violations.push(`${rel}: rename invalidation is not gated on renamed outcome`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps shell layout writes behind the shell layout seam", () => {
    const violations: string[] = [];
    const shellLayoutRel = "stores/view/shellLayout.ts";
    const viewStoreRel = "stores/view/viewStore.ts";
    const shellLayout = stripComments(
      readFileSync(join(SRC_ROOT, shellLayoutRel), "utf8"),
    );
    const viewStore = stripComments(readFileSync(join(SRC_ROOT, viewStoreRel), "utf8"));
    const rawShellLayoutWrite =
      /\.(?:setLeftRailVisible|setLeftRailWidth|setRightRailWidth|setTimelineVisible|setTimelineHeight|setPanelFlyoutOpen|togglePanelFlyout)\s*\(/;
    const rawShellLayoutRead =
      /\b(?:leftRailVisible|leftRailWidth|rightRailWidth|timelineVisible|timelineHeight|panelFlyoutOpen)\b/;

    for (const root of ["app", "scene", "platform", "stores/view"] as const) {
      for (const file of sourceFiles(join(SRC_ROOT, root))) {
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
        if (
          rel === "stores/view/shellLayout.ts" ||
          rel === "stores/view/viewStore.ts"
        ) {
          continue;
        }
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);

        if (rawShellLayoutWrite.test(stripped)) {
          violations.push(`${rel}: raw shell layout write`);
        }
        for (const statement of importStatements(stripped)) {
          if (/\buseShellLayoutState\b/.test(statement)) {
            violations.push(`${rel}: raw shell layout state subscription`);
          }
        }
        if (/\buseViewStore\b/.test(stripped) && rawShellLayoutRead.test(stripped)) {
          violations.push(`${rel}: raw shell layout state read`);
        }
      }
    }

    for (const seam of [
      "normalizeShellLayoutVisible",
      "normalizeShellLayoutPanelSize",
    ]) {
      if (!new RegExp(`\\bexport\\s+function\\s+${seam}\\b`).test(viewStore)) {
        violations.push(`${viewStoreRel}: missing ${seam} seam`);
      }
    }
    for (const typedOnly of [
      "setLeftRailVisible: (visible: boolean)",
      "setLeftRailWidth: (width: number)",
      "setRightRailWidth: (width: number)",
      "setTimelineVisible: (visible: boolean)",
      "setTimelineHeight: (height: number)",
      "setPanelFlyoutOpen: (open: boolean)",
      "setShellLeftRailVisible(visible: boolean)",
      "setShellLeftRailWidth(width: number)",
      "setShellRightRailWidth(width: number)",
      "setShellTimelineVisible(visible: boolean)",
      "setShellTimelineHeight(height: number)",
      "setShellPanelFlyoutOpen(open: boolean)",
    ]) {
      if (viewStore.includes(typedOnly) || shellLayout.includes(typedOnly)) {
        violations.push(`shell layout typed-only seam ${typedOnly}`);
      }
    }
    for (const required of [
      "normalizeShellLayoutVisible(leftRailVisible)",
      "normalizeShellLayoutPanelSize(\n        width,\n        LEFT_RAIL_MIN_WIDTH,\n        LEFT_RAIL_MAX_WIDTH",
      "normalizeShellLayoutPanelSize(\n        width,\n        RIGHT_RAIL_MIN_WIDTH,\n        RIGHT_RAIL_MAX_WIDTH",
      "normalizeShellLayoutVisible(timelineVisible)",
      "normalizeShellLayoutPanelSize(\n        height,\n        TIMELINE_MIN_HEIGHT,\n        TIMELINE_MAX_HEIGHT",
      "normalizeShellLayoutVisible(panelFlyoutOpen)",
    ]) {
      if (!viewStore.includes(required)) {
        violations.push(`${viewStoreRel}: shell layout update bypasses ${required}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps working-set access behind the working-set seam", () => {
    const violations: string[] = [];
    const storeRel = "stores/view/workingSet.ts";
    const store = stripComments(readFileSync(join(SRC_ROOT, storeRel), "utf8"));
    const rawWorkingSetAccess =
      /(?:\.workingSet\b|\.addToWorkingSet\s*\(|\.removeFromWorkingSet\s*\(|\.clearWorkingSet\s*\()/;

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (rawWorkingSetAccess.test(stripped)) {
        violations.push(`${rel}: raw working-set access`);
      }
      if (rel === "app/stage/WorkingSet.tsx") {
        if (/\.replace\s*\(\s*\/\^\(feature\|doc\):/.test(stripped)) {
          violations.push(`${rel}: local working-set node label projection`);
        }
        if (!/\buseWorkingSetView\s*\(\s*\)/.test(stripped)) {
          violations.push(`${rel}: missing working-set presentation view`);
        }
        if (
          !/\buseWorkingSetKeybindings\s*\(\s*canonicalSelectedId\s*\?\?\s*null\s*\)/.test(
            stripped,
          )
        ) {
          violations.push(`${rel}: missing working-set keybinding seam`);
        }
        for (const appOwner of [
          "WORKING_SET_KEYBINDINGS",
          "registerKeybindings",
          "registerKeyAction",
          "workingSetKeyAction",
        ]) {
          if (new RegExp(`\\b${appOwner}\\b`).test(stripped)) {
            violations.push(`${rel}: app-layer ${appOwner} ownership`);
          }
        }
        if (/\baddEventListener\s*\(\s*["']keydown["']/.test(stripped)) {
          violations.push(`${rel}: local working-set keyboard listener`);
        }
        if (/\bKeyboardEvent\b/.test(stripped)) {
          violations.push(`${rel}: local working-set keyboard event parser`);
        }
        if (/\b(?:e|event)\.(?:key|ctrlKey|metaKey|altKey)\b/.test(stripped)) {
          violations.push(`${rel}: local working-set keyboard inspection`);
        }
        for (const localCopy of [
          "working set",
          "expansions in working set",
          "clear to constellation",
        ]) {
          if (stripped.includes(localCopy)) {
            violations.push(`${rel}: local working-set presentation copy`);
          }
        }
        if (/`Collapse\s+\$\{row\.(?:id|label)\}`/.test(stripped)) {
          violations.push(`${rel}: local working-set collapse label`);
        }
        if (!/\brow\.collapseLabel\b/.test(stripped)) {
          violations.push(`${rel}: missing working-set row action label`);
        }
        for (const field of [
          "view.navClassName",
          "view.countClassName",
          "row.rootClassName",
          "row.collapseButtonClassName",
          "view.clearButtonClassName",
        ]) {
          if (!stripped.includes(field)) {
            violations.push(`${rel}: missing working-set chrome projection ${field}`);
          }
        }
        for (const localChrome of [
          "pointer-events-auto absolute top-9 left-2 z-10 flex flex-wrap items-center gap-1",
          "rounded-fg-pill bg-paper-sunken px-fg-1-5 py-fg-0-5 text-caption tabular-nums text-ink-muted",
          "flex items-center gap-fg-1 rounded-fg-pill border border-rule bg-paper-raised px-fg-2 py-fg-0-5 text-caption text-ink shadow-fg-raised",
          "flex items-center text-ink-faint hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
          "rounded-fg-pill border border-rule bg-paper-sunken px-fg-2 py-fg-0-5 text-caption text-ink-muted hover:text-ink transition-colors duration-ui-fast ease-settle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
        ]) {
          if (stripped.includes(localChrome)) {
            violations.push(`${rel}: local working-set chrome "${localChrome}"`);
          }
        }
      }
    }

    for (const seam of [
      "WORKING_SET_KEYBINDINGS",
      "WORKING_SET_EXPAND_SELECTION_ACTION_ID",
      "WORKING_SET_COLLAPSE_LAST_ACTION_ID",
      "workingSetKeyAction",
      "useWorkingSetKeybindings",
      "registerKeybindings",
      "registerKeyAction",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(store)) {
        violations.push(`${storeRel}: missing ${seam} seam`);
      }
    }
    if (!/\bdefaultChord\s*:\s*["']E["']/.test(store)) {
      violations.push(`${storeRel}: missing working-set expand keybinding default`);
    }
    if (!/\bdefaultChord\s*:\s*["']Backspace["']/.test(store)) {
      violations.push(`${storeRel}: missing working-set collapse keybinding default`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps discovery panel chrome behind the discovery panel seam", () => {
    const rel = "app/stage/Discover.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseState\b/.test(statement)) {
        violations.push(`${rel}: local discovery panel state`);
      }
      if (/\buseDiscoveryPanelStore\b/.test(statement)) {
        violations.push(`${rel}: raw discovery panel store access`);
      }
    }
    if (/\[\s*openFor\s*,\s*setOpenFor\s*\]/.test(stripped)) {
      violations.push(`${rel}: local discovery panel tuple`);
    }
    if (!/\buseDiscoveryPanelOpenView\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing discovery panel open target seam`);
    }
    if (!/\bopenDiscoveryPanel\b/.test(stripped)) {
      violations.push(`${rel}: missing discovery panel open seam`);
    }
    if (!/\bcloseDiscoveryPanel\b/.test(stripped)) {
      violations.push(`${rel}: missing discovery panel close seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps workspace map normalization at the live adapter boundary", () => {
    const rel = "stores/server/liveAdapters.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const seam of [
      "normalizeMapString",
      "normalizeMapStringList",
      "normalizeMapCount",
      "adaptMapBranch",
      "adaptMapWorktree",
      "adaptMap",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${seam} workspace-map adapter seam`);
      }
    }
    if (
      !/\bfunction\s+adaptMapWorktree[\s\S]*\bconst\s+path\s*=\s*normalizeMapString\s*\(\s*value\.path\s*\)[\s\S]*\bif\s*\(\s*path\s*===\s*undefined\s*\)\s*return\s+null/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: workspace-map adapter fabricates malformed worktrees`);
    }
    if (
      !/\bhas_vault:\s*value\.has_vault\s*===\s*true/.test(stripped) ||
      !/\bis_default:\s*value\.is_main\s*===\s*true/.test(stripped)
    ) {
      violations.push(`${rel}: workspace-map booleans bypass strict normalization`);
    }
    if (
      !/\bconst\s+degraded\s*=\s*normalizeMapStringList\s*\(\s*value\.degraded\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: workspace-map degraded reasons bypass normalizer`);
    }
    if (
      !/\bfunction\s+normalizeMapCount\s*\(\s*value:\s*unknown\s*\):\s*number\s*\|\s*undefined[\s\S]*Number\.isFinite\s*\(\s*value\s*\)[\s\S]*value\s*<\s*0[\s\S]*Math\.floor\s*\(\s*value\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: workspace-map ahead/behind counts bypass finite guard`);
    }
    if (
      !/branches:\s*branches[\s\S]*\.map\s*\(\s*adaptMapBranch\s*\)[\s\S]*\.filter\s*\([\s\S]*branch\s*!==\s*null[\s\S]*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: workspace-map adapter does not drop malformed branches`);
    }
    if (
      !/worktrees:\s*worktrees[\s\S]*\.map\s*\(\s*adaptMapWorktree\s*\)[\s\S]*\.filter\s*\([\s\S]*worktree\s*!==\s*null[\s\S]*\)/.test(
        stripped,
      )
    ) {
      violations.push(
        `${rel}: workspace-map adapter does not drop malformed worktrees`,
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps worktree picker chrome behind the worktree picker chrome seam", () => {
    const rel = "app/left/WorktreePicker.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const chromeRel = "stores/view/worktreePickerChrome.ts";
    const chrome = stripComments(readFileSync(join(SRC_ROOT, chromeRel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseState\b/.test(statement)) {
        violations.push(`${rel}: local worktree picker chrome state`);
      }
      if (/\buseWorktreePickerChromeStore\b/.test(statement)) {
        violations.push(`${rel}: raw worktree picker chrome store access`);
      }
      if (/\buseWorktreePickerChrome\b/.test(statement)) {
        violations.push(`${rel}: raw worktree picker chrome hook import`);
      }
      if (
        /\b(?:useWorkspaceMapSurface|useActiveScope|useActivateWorktreeScope|deriveWorkspaceMapPickerPresentationView|isSessionMutationRejected|isSupersededScopeSwitch)\b/.test(
          statement,
        )
      ) {
        violations.push(`${rel}: raw worktree picker state/projection import`);
      }
    }
    if (
      /\[\s*(?:expanded|switchError|pendingId|keyboardToggle)\s*,\s*set[A-Z]/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local worktree picker chrome tuple`);
    }
    if (!/\buseWorktreePickerView\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing worktree picker view seam`);
    }
    if (/\buseSwitchActiveScope\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: local worktree activation session hook`);
    }
    if (/\bmovePlayhead\s*\(\s*["']live["']/.test(stripped)) {
      violations.push(`${rel}: local worktree activation playhead reset`);
    }
    if (/\buseActivateWorktreeScope\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: raw worktree activation seam`);
    }
    if (/\bderiveWorkspaceMapPickerPresentationView\s*\(/.test(stripped)) {
      violations.push(`${rel}: local workspace-map picker presentation`);
    }
    if (!/\bactivateRow\s*\(\s*row\s*,/.test(stripped)) {
      violations.push(`${rel}: missing worktree activation view seam`);
    }
    if (
      /worktree scope:|choose a worktree scope|pick a worktree|no worktrees mapped|no vault-bearing worktree|this is the only vault-bearing|context only, no vault corpus|switching…/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local worktree picker presentation copy`);
    }
    if (/could not switch|could not persist|selection not saved/.test(stripped)) {
      violations.push(`${rel}: local worktree switch failure copy`);
    }
    if (/\bfailWorktreeSwitch\s*\(/.test(stripped)) {
      violations.push(`${rel}: local classified worktree switch failure`);
    }
    if (/\brepositories\.flatMap\b|\.sort\s*\(/.test(stripped)) {
      violations.push(`${rel}: local workspace-map row projection`);
    }
    if (!/\brow\.selectable\b/.test(stripped)) {
      violations.push(`${rel}: missing stores-owned worktree selectable row`);
    }
    if (!/\brow\.rowClassName\b/.test(stripped)) {
      violations.push(`${rel}: missing stores-owned worktree row class`);
    }
    if (!/\brow\.activeCueClassName\b/.test(stripped)) {
      violations.push(`${rel}: missing stores-owned worktree active cue class`);
    }
    for (const field of [
      "row.branchClassName",
      "row.badgeClassName",
      "row.degradedIconClassName",
      "row.pendingLabelClassName",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing stores-owned worktree row chrome ${field}`);
      }
    }
    for (const field of [
      "pickerView.triggerClassName",
      "pickerView.triggerLabelClassName",
      "pickerView.triggerIconClassName",
      "pickerView.loadingClassName",
      "pickerView.errorRootClassName",
      "pickerView.errorLabelClassName",
      "pickerView.retryButtonClassName",
      "pickerView.degradedClassName",
      "pickerView.emptyClassName",
      "pickerView.singleScopeClassName",
      "listClassName",
      "switchErrorClassName",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing stores-owned worktree chrome ${field}`);
      }
    }
    for (const localRowChrome of [
      "px-fg-1 py-fg-0-5 text-label text-ink-faint",
      "space-y-fg-1 px-fg-1 py-fg-0-5",
      "text-label text-state-broken",
      "rounded-fg-xs text-label text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
      "flex w-full items-center gap-fg-1-5 rounded-fg-md bg-paper-sunken px-[10px] py-[6px] transition-colors duration-ui-fast hover:bg-paper-sunken/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      "min-w-0 flex-1 truncate text-left text-body-strong",
      "shrink-0 text-ink-faint",
      "mt-fg-1 rounded-fg-xs bg-accent-subtle/40 px-fg-1 py-fg-0-5 text-caption text-ink-muted",
      "mt-fg-1 space-y-fg-0-5",
      "animate-slide-in-down",
      "px-fg-2 py-fg-1 text-label text-ink-faint",
      "px-fg-2 py-fg-0-5 text-caption text-ink-faint",
      "mt-fg-1 px-fg-1 text-caption text-state-broken",
      "flex w-full items-center gap-fg-1 rounded-fg-xs px-fg-2 py-fg-0-5 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      "-ml-fg-1 h-3 w-0.5 shrink-0 rounded-full",
      "min-w-0 truncate",
      "flex shrink-0 items-center text-state-stale",
      "ml-auto shrink-0 text-caption text-ink-faint",
    ]) {
      if (stripped.includes(localRowChrome)) {
        violations.push(`${rel}: local worktree row chrome "${localRowChrome}"`);
      }
    }
    if (
      /["']bg-accent-subtle font-medium text-ink["']/.test(stripped) ||
      /["']cursor-not-allowed text-ink-faint\/60["']/.test(stripped)
    ) {
      violations.push(`${rel}: local worktree row class projection`);
    }
    if (
      /pickerView\.pending\s*\?\s*["']text-ink-muted["']/.test(stripped) ||
      /["']text-ink-muted["']\s*:\s*["']text-ink["']/.test(stripped)
    ) {
      violations.push(`${rel}: local worktree trigger label class projection`);
    }
    if (/\b!\s*worktree\.has_vault\b/.test(stripped)) {
      violations.push(`${rel}: local worktree selectable negation`);
    }
    if (/\bworktree\.has_vault\s*\?/.test(stripped)) {
      violations.push(`${rel}: local worktree selectable branch`);
    }
    for (const helper of [
      "setWorktreePickerExpanded",
      "toggleWorktreePickerExpanded",
    ]) {
      if (!new RegExp(`\\b${helper}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${helper} seam`);
      }
    }
    for (const helper of [
      "useWorktreePickerView",
      "beginWorktreeSwitch",
      "completeWorktreeSwitch",
      "cancelWorktreeSwitch",
      "failWorktreeSwitch",
    ]) {
      if (!new RegExp(`\\b${helper}\\b`).test(chrome)) {
        violations.push(`${chromeRel}: missing ${helper} seam`);
      }
    }
    if (!/\bexport\s+function\s+normalizeWorktreePickerSwitchId\b/.test(chrome)) {
      violations.push(`${chromeRel}: missing worktree switch id normalizer`);
    }
    if (!/\bWORKTREE_SWITCH_ID_CAP\b/.test(chrome)) {
      violations.push(`${chromeRel}: missing bounded worktree switch id cap`);
    }
    if (!/\bexport\s+function\s+normalizeWorktreePickerBoolean\b/.test(chrome)) {
      violations.push(`${chromeRel}: missing worktree picker boolean normalizer`);
    }
    if (!/\bexport\s+function\s+normalizeWorktreePickerSwitchError\b/.test(chrome)) {
      violations.push(`${chromeRel}: missing worktree switch error normalizer`);
    }
    if (!/\bWORKTREE_SWITCH_ERROR_CAP\b/.test(chrome)) {
      violations.push(`${chromeRel}: missing bounded worktree switch error cap`);
    }
    if (!/\bWORKTREE_SWITCH_LABEL_CAP\b/.test(chrome)) {
      violations.push(`${chromeRel}: missing bounded worktree switch label cap`);
    }
    if (!/\bexport\s+function\s+normalizeWorktreePickerSwitchLabel\b/.test(chrome)) {
      violations.push(`${chromeRel}: missing worktree switch label normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeWorktreePickerActivationIntent\s*\([\s\S]*row:\s*unknown[\s\S]*\):\s*WorktreePickerActivationIntent\s*\|\s*null/.test(
        chrome,
      )
    ) {
      violations.push(`${chromeRel}: missing worktree activation intent normalizer`);
    }
    if (
      !/\bnormalizeWorktreePickerActivationIntent[\s\S]*\bnormalizeWorktreePickerSwitchId\s*\(\s*worktree\.id\s*\)/.test(
        chrome,
      )
    ) {
      violations.push(`${chromeRel}: activation intent bypasses switch-id normalizer`);
    }
    if (
      !/\bnormalizeWorktreePickerSwitchId\s*\(\s*id:\s*unknown\s*\)[\s\S]*\bconst\s+normalized\s*=\s*id\.trim\s*\(\s*\)[\s\S]*normalized\.length\s*<=\s*WORKTREE_SWITCH_ID_CAP/.test(
        chrome,
      )
    ) {
      violations.push(`${chromeRel}: switch id normalizer is unbounded`);
    }
    if (
      !/\bnormalizeWorktreePickerSwitchError\s*\(\s*value:\s*unknown\s*\)[\s\S]*\bconst\s+normalized\s*=\s*value\.trim\s*\(\s*\)[\s\S]*WORKTREE_SWITCH_ERROR_CAP/.test(
        chrome,
      )
    ) {
      violations.push(`${chromeRel}: switch error normalizer is unbounded`);
    }
    if (
      !/\bnormalizeWorktreePickerSwitchLabel\s*\(\s*value:\s*unknown\s*\)[\s\S]*\bconst\s+normalized\s*=\s*value\.trim\s*\(\s*\)[\s\S]*WORKTREE_SWITCH_LABEL_CAP/.test(
        chrome,
      )
    ) {
      violations.push(`${chromeRel}: switch label normalizer is unbounded`);
    }
    for (const typedOnly of [
      "setExpanded: (expanded: boolean, viaKeyboard: boolean)",
      "toggleExpanded: (viaKeyboard: boolean)",
      "beginSwitch: (id: string)",
      "completeSwitch: (id: string)",
      "cancelSwitch: (id: string)",
      "failSwitch: (id: string, message: string)",
      "setWorktreePickerExpanded(\n  expanded: boolean,\n  viaKeyboard: boolean",
      "toggleWorktreePickerExpanded(viaKeyboard: boolean)",
      "beginWorktreeSwitch(id: string)",
      "completeWorktreeSwitch(id: string)",
      "cancelWorktreeSwitch(id: string)",
      "failWorktreeSwitch(\n  id: string,\n  branch: string",
    ]) {
      if (chrome.includes(typedOnly)) {
        violations.push(`${chromeRel}: typed-only worktree picker seam ${typedOnly}`);
      }
    }
    if (
      !/\bsetExpanded:\s*\(expanded,\s*viaKeyboard\)[\s\S]*\bnormalizeWorktreePickerBoolean\s*\(\s*expanded\s*\)[\s\S]*\bnormalizeWorktreePickerBoolean\s*\(\s*viaKeyboard\s*\)/.test(
        chrome,
      )
    ) {
      violations.push(`${chromeRel}: disclosure setter bypasses boolean normalizer`);
    }
    if (
      !/\btoggleExpanded:\s*\(viaKeyboard\)[\s\S]*\bnormalizeWorktreePickerBoolean\s*\(\s*viaKeyboard\s*\)/.test(
        chrome,
      )
    ) {
      violations.push(`${chromeRel}: disclosure toggle bypasses boolean normalizer`);
    }
    if (
      !/\bbeginSwitch:\s*\(pendingId\)\s*=>\s*\{[\s\S]*\bnormalizeWorktreePickerSwitchId\s*\(\s*pendingId\s*\)[\s\S]*\bpendingId:\s*id\b/.test(
        chrome,
      )
    ) {
      violations.push(`${chromeRel}: begin switch bypasses normalized pending id`);
    }
    for (const action of ["completeSwitch", "cancelSwitch", "failSwitch"]) {
      if (
        !new RegExp(
          `${action}:\\s*\\(id(?:,\\s*switchError)?\\)\\s*=>\\s*\\{[\\s\\S]*\\bnormalizeWorktreePickerSwitchId\\s*\\(\\s*id\\s*\\)[\\s\\S]*state\\.pendingId\\s*===\\s*normalized`,
        ).test(chrome)
      ) {
        violations.push(`${chromeRel}: ${action} bypasses normalized pending id`);
      }
    }
    if (
      !/\bfailSwitch:\s*\(id,\s*switchError\)[\s\S]*\bnormalizeWorktreePickerSwitchError\s*\(\s*switchError\s*\)/.test(
        chrome,
      )
    ) {
      violations.push(`${chromeRel}: fail switch bypasses error normalizer`);
    }
    if (
      !/\bworktreeSwitchFailureMessage[\s\S]*\bnormalizeWorktreePickerSwitchLabel\s*\(\s*branch\s*\)/.test(
        chrome,
      )
    ) {
      violations.push(`${chromeRel}: failure copy bypasses branch label normalizer`);
    }
    if (
      !/\bactivateRow\s*=\s*useCallback\(\s*\(\s*row:\s*unknown[\s\S]*\bconst\s+intent\s*=\s*normalizeWorktreePickerActivationIntent\s*\(\s*row\s*\)[\s\S]*\bactivateWorktreeScope\s*\(\s*intent\.id\s*\)[\s\S]*\bbeginWorktreeSwitch\s*\(\s*intent\.id\s*\)/.test(
        chrome,
      )
    ) {
      violations.push(`${chromeRel}: activateRow bypasses normalized activation intent`);
    }
    if (
      /\bactivateWorktreeScope\s*\(\s*worktree\.id\s*\)|\bbeginWorktreeSwitch\s*\(\s*worktree\.id\s*\)|\bcompleteWorktreeSwitch\s*\(\s*worktree\.id\s*\)|\bcancelWorktreeSwitch\s*\(\s*worktree\.id\s*\)|\bfailWorktreeSwitch\s*\(\s*worktree\.id/.test(
        chrome,
      )
    ) {
      violations.push(`${chromeRel}: activateRow uses raw worktree id`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps worktree menu scope activation behind the worktree activation seam", () => {
    const rel = "app/left/menus/worktreeMenu.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (/\bactivateWorktreeScope\b/.test(stripped)) {
      violations.push(`${rel}: direct worktree menu activation import`);
    }
    if (/\bswitchActiveScope\b/.test(stripped)) {
      violations.push(`${rel}: local worktree menu session switch`);
    }
    if (/\bmovePlayhead\s*\(\s*["']live["']/.test(stripped)) {
      violations.push(`${rel}: local worktree menu playhead reset`);
    }
    if (/\brun:\s*switchable\b|\brun:\s*\(\s*\)\s*=>/.test(stripped)) {
      violations.push(`${rel}: mutating worktree menu uses run closure`);
    }
    if (/\bWORKTREE_ACTIVATE_SCOPE_ACTION\b/.test(stripped)) {
      violations.push(`${rel}: app-layer worktree action type import`);
    }
    if (!/\bimport\s*\{\s*normalizeEntityDescriptor\s*\}/.test(stripped)) {
      violations.push(`${rel}: missing entity descriptor normalizer`);
    }
    if (
      !/\bexport\s+function\s+worktreeMenu\s*\(\s*entity:\s*unknown\s*\)/.test(stripped)
    ) {
      violations.push(`${rel}: worktree menu is a typed-only runtime seam`);
    }
    if (
      !/\bconst\s+normalizedEntity\s*=\s*normalizeEntityDescriptor\s*\(\s*entity\s*\)/.test(
        stripped,
      ) ||
      !/\bnormalizedEntity\?\.\s*kind\s*!==\s*["']worktree["']/.test(stripped)
    ) {
      violations.push(`${rel}: worktree menu bypasses normalized worktree entity`);
    }
    if (
      !/switchable\s*\?\s*\{[\s\S]*?dispatch:\s*worktreeActivateScopeDispatch\s*\(\s*normalizedEntity\.id\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing stores-owned worktree activation dispatch seam`);
    }
    if (/\bentity\.(?:id|branch|path|hasVault)\b/.test(stripped)) {
      violations.push(`${rel}: worktree menu reads raw entity fields`);
    }
    if (/\bimport\s+type\s*\{\s*WorktreeEntity\b/.test(stripped)) {
      violations.push(`${rel}: worktree menu imports typed-only WorktreeEntity`);
    }
    if (/payload:\s*\{\s*scope:\s*entity\.id\s*\}/.test(stripped)) {
      violations.push(`${rel}: app-layer worktree activation payload shape`);
    }
    if (/dispatch:\s*switchable\s*\?/.test(stripped)) {
      violations.push(`${rel}: disabled worktree action carries undefined dispatch`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps workspace menu entity ingress normalized before action construction", () => {
    const rel = "app/left/menus/workspaceMenu.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (!/\bimport\s*\{\s*normalizeEntityDescriptor\s*\}/.test(stripped)) {
      violations.push(`${rel}: missing entity descriptor normalizer`);
    }
    if (
      !/\bexport\s+function\s+workspaceMenu\s*\(\s*entity:\s*unknown\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: workspace menu is a typed-only runtime seam`);
    }
    if (
      !/\bconst\s+normalizedEntity\s*=\s*normalizeEntityDescriptor\s*\(\s*entity\s*\)/.test(
        stripped,
      ) ||
      !/\bnormalizedEntity\?\.\s*kind\s*!==\s*["']workspace["']/.test(stripped)
    ) {
      violations.push(`${rel}: workspace menu bypasses normalized workspace entity`);
    }
    if (/\bentity\.(?:id|path|isLaunchDefault)\b/.test(stripped)) {
      violations.push(`${rel}: workspace menu reads raw entity fields`);
    }
    if (/\bimport\s+type\s*\{\s*WorkspaceEntity\b/.test(stripped)) {
      violations.push(`${rel}: workspace menu imports typed-only WorkspaceEntity`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps worktree activation sequencing in the stores-server seam", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];
    const switchStart = stripped.indexOf("export async function switchActiveScope");
    const switchEnd = stripped.indexOf("export function useSwitchActiveScope");
    const scopeSwitch =
      switchStart >= 0 && switchEnd > switchStart
        ? stripped.slice(switchStart, switchEnd)
        : "";
    const mirrorStart = stripped.indexOf("function mirrorAcceptedSessionScopeContext");
    const mirrorEnd = stripped.indexOf(
      "function applyAcceptedWorkspaceSwitch",
      mirrorStart,
    );
    const mirror =
      mirrorStart >= 0 && mirrorEnd > mirrorStart
        ? stripped.slice(mirrorStart, mirrorEnd)
        : "";
    const workspaceStart = stripped.indexOf("function applyAcceptedWorkspaceSwitch");
    const workspaceEnd = stripped.indexOf("function seedSessionCache", workspaceStart);
    const workspaceSwitch =
      workspaceStart >= 0 && workspaceEnd > workspaceStart
        ? stripped.slice(workspaceStart, workspaceEnd)
        : "";
    const scopeApplyStart = stripped.indexOf("function applyAcceptedActiveScopeSwitch");
    const scopeApplyEnd = stripped.indexOf(
      "export async function switchActiveScope",
      scopeApplyStart,
    );
    const scopeApply =
      scopeApplyStart >= 0 && scopeApplyEnd > scopeApplyStart
        ? stripped.slice(scopeApplyStart, scopeApplyEnd)
        : "";
    const start = stripped.indexOf("export async function activateWorktreeScope");
    const end = stripped.indexOf("export function useActivateWorktreeScope");
    const activation = start >= 0 && end > start ? stripped.slice(start, end) : "";

    if (scopeSwitch.length === 0) {
      violations.push(`${rel}: missing active scope switch seam`);
    }
    if (mirror.length === 0) {
      violations.push(`${rel}: missing accepted session scope-context mirror`);
    }
    if (
      !/\bmirrorSessionScopeContext\s*\(\s*\{\s*folder:\s*session\.scope_context\.folder,\s*featureTags:\s*session\.scope_context\.feature_tags/.test(
        mirror,
      )
    ) {
      violations.push(`${rel}: accepted scope context is not mirrored from session`);
    }
    if (
      !/\bmirrorAcceptedSessionScopeContext\s*\(\s*session\s*\)/.test(workspaceSwitch)
    ) {
      violations.push(`${rel}: workspace switch drops accepted scope context`);
    }
    if (!/\bmirrorAcceptedSessionScopeContext\s*\(\s*session\s*\)/.test(scopeApply)) {
      violations.push(`${rel}: active scope switch drops accepted scope context`);
    }
    if (
      !/\bexport\s+function\s+normalizeActiveScopeSwitchScope\s*\(\s*scope:\s*unknown\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing active scope switch input normalizer`);
    }
    if (
      !/from\s+["']\.\/scopeIdentity["'][\s\S]*\bnormalizeStoreScope\b/.test(
        stripped,
      ) ||
      !/\bconst\s+normalized\s*=\s*normalizeStoreScope\s*\(\s*scope\s*\)[\s\S]*normalized\s*===\s*null[\s\S]*scope switch requires a non-empty scope/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: active scope switch bypasses shared scope normalizer`);
    }
    if (
      !/\bconst\s+acceptedScope\s*=\s*normalizeActiveScopeSwitchScope\s*\(\s*scope\s*\)[\s\S]*requestedActiveScope\s*=\s*acceptedScope/.test(
        scopeSwitch,
      )
    ) {
      violations.push(`${rel}: active scope switch validates after mutating intent`);
    }
    if (
      !/\bexport\s+function\s+normalizeWorkspaceSwitchIntent\s*\(\s*[\s\S]*workspace:\s*unknown[\s\S]*scope:\s*unknown\s*=\s*null[\s\S]*const\s+normalizedWorkspace\s*=\s*normalizeStoreScope\s*\(\s*workspace\s*\)[\s\S]*workspace switch requires a non-empty workspace[\s\S]*scope:\s*normalizeStoreScope\s*\(\s*scope\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing workspace switch intent normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeAcceptedWorkspaceSwitchState\s*\([\s\S]*active_workspace[\s\S]*active_scope[\s\S]*workspace:\s*normalizeStoreScope\s*\(\s*session\.active_workspace\s*\)\s*\?\?\s*intent\.workspace[\s\S]*scope:\s*normalizeStoreScope\s*\(\s*session\.active_scope\s*\)\s*\?\?\s*intent\.scope/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: accepted workspace switch state bypasses normalizer`);
    }
    if (
      !/\bconst\s+swap\s*=\s*\(\s*workspace:\s*unknown,\s*scope:\s*unknown\s*=\s*null\s*\)[\s\S]*\bconst\s+intent\s*=\s*normalizeWorkspaceSwitchIntent\s*\(\s*workspace\s*,\s*scope\s*\)[\s\S]*active_workspace:\s*intent\.workspace[\s\S]*active_scope:\s*intent\.scope/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: workspace switch mutates from raw intent`);
    }
    if (
      !/\bconst\s+accepted\s*=\s*normalizeAcceptedWorkspaceSwitchState\s*\(\s*session\s*,\s*intent\s*\)[\s\S]*swapWorkspace\s*\(\s*accepted\.workspace\s*,\s*accepted\.scope\s*\)/.test(
        workspaceSwitch,
      )
    ) {
      violations.push(`${rel}: workspace switch applies raw accepted session`);
    }
    for (const typedOnly of [
      "switchActiveScope(\n  scope: string",
      "useSwitchActiveScope(): (scope: string)",
      "activateWorktreeScope(\n  scope: string",
      "useActivateWorktreeScope(): (scope: string)",
      "const swap = (workspace: string, scope: string | null)",
    ]) {
      if (stripped.includes(typedOnly)) {
        violations.push(`${rel}: typed-only active scope seam ${typedOnly}`);
      }
    }
    for (const required of [
      "switchActiveScope(\n  scope: unknown",
      "useSwitchActiveScope(): (scope: unknown)",
      "activateWorktreeScope(\n  scope: unknown",
      "useActivateWorktreeScope(): (scope: unknown)",
    ]) {
      if (!stripped.includes(required)) {
        violations.push(`${rel}: missing runtime active scope seam ${required}`);
      }
    }
    if (activation.length === 0) {
      violations.push(`${rel}: missing worktree activation seam`);
    }
    if (
      !/const\s+session\s*=\s*await\s+switchActiveScope\s*\(\s*scope\s*,\s*queryClient\s*\)/.test(
        activation,
      )
    ) {
      violations.push(`${rel}: activation does not persist accepted scope first`);
    }
    if (
      !/\bmovePlayhead\s*\(\s*["']live["']\s*,\s*session\.active_scope\s*\)/.test(
        activation,
      )
    ) {
      violations.push(`${rel}: activation does not reset playhead for accepted scope`);
    }
    if (!/\breturn\s+session\b/.test(activation)) {
      violations.push(`${rel}: activation does not return accepted session`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps worktree activation dispatch payloads validated before mutation", () => {
    const rel = "stores/server/worktreeActions.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (!/\bfunction\s+isWorktreeActivateScopePayload\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing worktree activation payload validator`);
    }
    if (!/from\s+["']\.\/scopeIdentity["'][\s\S]*\bnormalizeStoreScope\b/.test(stripped)) {
      violations.push(
        `${rel}: worktree activation payload bypasses shared scope normalizer`,
      );
    }
    if (
      !/\bfunction\s+normalizeWorktreeActivateScopePayload\s*\(\s*[\s\S]*value:\s*unknown[\s\S]*\):\s*WorktreeActivateScopePayload\s*\|\s*null[\s\S]*\bconst\s+scope\s*=\s*normalizeStoreScope\s*\(\s*\(value\s+as\s+\{\s*scope\?:\s*unknown\s*\}\)\.scope\s*\)[\s\S]*\bscope\s*===\s*null\s*\?\s*null\s*:\s*\{\s*scope\s*\}/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing normalized worktree activation payload seam`);
    }
    if (!/\bfunction\s+worktreeActivateScopeDispatch\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing worktree activation dispatch factory`);
    }
    if (
      !/worktreeActivateScopeDispatch\s*\(\s*scope:\s*unknown\s*\)[\s\S]*const\s+normalizedScope\s*=\s*normalizeStoreScope\s*\(\s*scope\s*\)[\s\S]*payload:\s*\{\s*scope:\s*normalizedScope\s*\}/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: dispatch factory does not own normalized scope payload`);
    }
    if (
      !/\bconst\s+payload\s*=\s*normalizeWorktreeActivateScopePayload\s*\(\s*action\.payload\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: activation dispatch does not normalize payload`);
    }
    if (!/activateWorktreeScope\s*\(\s*payload\.scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: activation dispatch mutates with raw payload scope`);
    }
    if (/activateWorktreeScope\s*\(\s*action\.payload\?\.scope\s*\?\?/.test(stripped)) {
      violations.push(`${rel}: activation dispatch falls back to empty scope`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps scope and workspace switches refreshing every scoped data plane", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];
    const subtreeStart = stripped.indexOf("export const SCOPED_ENGINE_QUERY_SUBTREES");
    const subtreeEnd = stripped.indexOf("export const GRAPH_GENERATION_QUERY_SUBTREES");
    const subtrees =
      subtreeStart >= 0 && subtreeEnd > subtreeStart
        ? stripped.slice(subtreeStart, subtreeEnd)
        : "";
    const scopeRefreshStart = stripped.indexOf(
      "export function refreshAfterAcceptedScopeSwitch",
    );
    const workspaceRefreshStart = stripped.indexOf(
      "export function refreshAfterAcceptedWorkspaceSwitch",
    );
    const scopeRefresh =
      scopeRefreshStart >= 0 && workspaceRefreshStart > scopeRefreshStart
        ? stripped.slice(scopeRefreshStart, workspaceRefreshStart)
        : "";
    const workspaceRefresh =
      workspaceRefreshStart >= 0
        ? stripped.slice(
            workspaceRefreshStart,
            stripped.indexOf("export function useEngineStatus", workspaceRefreshStart),
          )
        : "";

    for (const subtree of [
      "vault-tree",
      "file-tree",
      "filters",
      "dashboard-state",
      "graph",
      "graph-embeddings",
      "content",
      "events",
      "history",
      "pipeline",
      "search",
      "git-changes",
      "git-diff",
      "git-histdiff",
      "ops-rag",
    ]) {
      if (!new RegExp(`["']${subtree}["']`).test(subtrees)) {
        violations.push(`${rel}: scoped switch refresh omits ${subtree}`);
      }
    }
    if (!/\binvalidateScopedEngineQueries\s*\(\s*queryClient\s*\)/.test(scopeRefresh)) {
      violations.push(`${rel}: scope switch does not invalidate scoped queries`);
    }
    if (!/\bengineKeys\.map\s*\(\s*\)/.test(scopeRefresh)) {
      violations.push(`${rel}: scope switch does not refresh workspace map`);
    }
    if (!/\bengineKeys\.status\s*\(\s*\)/.test(scopeRefresh)) {
      violations.push(`${rel}: scope switch does not refresh status recovery`);
    }
    if (!/\bremoveScopedEngineQueries\s*\(\s*queryClient\s*\)/.test(workspaceRefresh)) {
      violations.push(`${rel}: workspace switch does not remove stale scoped queries`);
    }
    if (
      !/\bqueryClient\.removeQueries\s*\(\s*\{\s*queryKey:\s*engineKeys\.map\(\s*\)/.test(
        workspaceRefresh,
      )
    ) {
      violations.push(`${rel}: workspace switch does not remove stale map query`);
    }
    if (!/\bengineKeys\.workspaces\s*\(\s*\)/.test(workspaceRefresh)) {
      violations.push(`${rel}: workspace switch does not refresh workspace registry`);
    }
    if (!/\bengineKeys\.status\s*\(\s*\)/.test(workspaceRefresh)) {
      violations.push(`${rel}: workspace switch does not refresh status recovery`);
    }
    if (
      !/\binvalidateScopedEngineQueries\s*\(\s*queryClient\s*\)/.test(workspaceRefresh)
    ) {
      violations.push(`${rel}: workspace switch does not refetch scoped queries`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps production scope switching behind durable stores seams", () => {
    const violations: string[] = [];
    const roots = [
      ...PRODUCTION_SURFACES.map((surface) => join(SRC_ROOT, surface)),
      VIEW_STORES_ROOT,
    ];
    const allowedHookConsumer = "stores/view/worktreePickerChrome.ts";
    const owner = "stores/view/viewStore.ts";

    for (const root of roots) {
      for (const file of sourceFiles(root)) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
        if (rel === owner) continue;

        for (const statement of importStatements(stripped)) {
          if (/\buseSwitchActiveScope\b/.test(statement)) {
            violations.push(`${rel}: raw scope-switch hook import`);
          }
          if (
            /\b(?:switchActiveScope|activateWorktreeScope)\b/.test(statement) &&
            !/\buseActivateWorktreeScope\b/.test(statement)
          ) {
            violations.push(`${rel}: direct durable scope-switch import`);
          }
          if (
            /\buseActivateWorktreeScope\b/.test(statement) &&
            rel !== allowedHookConsumer
          ) {
            violations.push(`${rel}: worktree activation hook outside picker seam`);
          }
        }
        if (/\.(?:setScope|swapWorkspace)\s*\(/.test(stripped)) {
          violations.push(`${rel}: direct scope/workspace view-store mutation`);
        }
        if (/\bswitchActiveScope\s*\(/.test(stripped)) {
          violations.push(`${rel}: direct durable scope switch`);
        }
        if (/\buseSwitchActiveScope\s*\(/.test(stripped)) {
          violations.push(`${rel}: raw durable scope-switch hook`);
        }
        if (
          /\bactivateWorktreeScope\s*\(/.test(stripped) &&
          rel !== allowedHookConsumer
        ) {
          violations.push(`${rel}: direct worktree activation outside picker seam`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps create-document chrome behind the create-doc view seam", () => {
    const rel = "app/stage/CreateDocButton.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const storeRel = "stores/view/createDocChrome.ts";
    const store = stripComments(readFileSync(join(SRC_ROOT, storeRel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseState\b/.test(statement)) {
        violations.push(`${rel}: local create-doc state`);
      }
      if (/\buseViewStore\b/.test(statement)) {
        violations.push(`${rel}: raw view-store scope read`);
      }
    }
    if (!/\buseActiveScope\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing active-scope seam`);
    }
    if (!/\buseCreateDocChrome\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing create-doc chrome seam`);
    }
    if (
      !/\bderiveCreateDocSubmission\s*\(\s*\{[\s\S]*docType[\s\S]*feature[\s\S]*title[\s\S]*\}\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing create-doc submit projection seam`);
    }
    if (/\b(?:feature|title)\.trim\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: local create-doc draft normalization`);
    }
    if (/Feature and title are required/.test(stripped)) {
      violations.push(`${rel}: local create-doc validation copy`);
    }
    if (/\bnodeIdFromPath\b|\.path\.split\s*\(/.test(stripped)) {
      violations.push(`${rel}: local created-doc identity derivation`);
    }
    if (!/\bexport\s+function\s+normalizeCreateDocType\b/.test(store)) {
      violations.push(`${storeRel}: missing create-doc type normalizer`);
    }
    if (
      !/\bnormalizeCreateDocType\s*\(\s*value:\s*unknown\s*\)[\s\S]*\bconst\s+normalized\s*=\s*value\.trim\s*\(\s*\)[\s\S]*\bisCreateDocType\s*\(\s*normalized\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: create-doc type normalizer preserves raw spacing`);
    }
    if (!/\bexport\s+function\s+normalizeCreateDocDraftText\b/.test(store)) {
      violations.push(`${storeRel}: missing create-doc draft text normalizer`);
    }
    if (!/\bexport\s+function\s+normalizeCreateDocError\b/.test(store)) {
      violations.push(`${storeRel}: missing create-doc error normalizer`);
    }
    if (
      !/\bsetDocType:\s*\(docType\)\s*=>[\s\S]*\bnormalizeCreateDocType\s*\(\s*docType\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: setDocType bypasses type normalizer`);
    }
    if (
      !/\bsetFeature:\s*\(feature\)\s*=>[\s\S]*\bnormalizeCreateDocDraftText\s*\(\s*feature\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: setFeature bypasses draft normalizer`);
    }
    if (
      !/\bsetTitle:\s*\(title\)\s*=>[\s\S]*\bnormalizeCreateDocDraftText\s*\(\s*title\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: setTitle bypasses draft normalizer`);
    }
    if (
      !/\bsetError:\s*\(error\)\s*=>[\s\S]*\bnormalizeCreateDocError\s*\(\s*error\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: setError bypasses error normalizer`);
    }
    if (
      /\b(?:setFeature|setTitle):\s*\([^)]*:\s*string/.test(store) ||
      /\bsetError:\s*\([^)]*:\s*string\s*\|\s*null/.test(store) ||
      /\bfunction\s+setCreateDoc(?:Feature|Title)\s*\([^)]*:\s*string/.test(store) ||
      /\bfunction\s+setCreateDocError\s*\([^)]*:\s*string\s*\|\s*null/.test(store)
    ) {
      violations.push(`${storeRel}: create-doc setters expose typed-only input seams`);
    }
    if (
      !/\bexport\s+function\s+deriveCreateDocSubmission\s*\(\s*draft:\s*unknown\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: create-doc submission accepts typed-only draft`);
    }
    if (
      !/\bfunction\s+createDocSubmissionDraftRecord\s*\(\s*draft:\s*unknown\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: missing submission draft record reader`);
    }
    if (
      !/\bderiveCreateDocSubmission[\s\S]*\bconst\s+value\s*=\s*createDocSubmissionDraftRecord\s*\(\s*draft\s*\)[\s\S]*\bnormalizeCreateDocType\s*\(\s*value\.docType\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: submission bypasses type normalizer`);
    }
    if (
      !/\bconst\s+feature\s*=\s*normalizeCreateDocDraftText\s*\(\s*value\.feature\s*\)\.trim\s*\(\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: submission feature bypasses draft normalizer`);
    }
    if (
      !/\bconst\s+title\s*=\s*normalizeCreateDocDraftText\s*\(\s*value\.title\s*\)\.trim\s*\(\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: submission title bypasses draft normalizer`);
    }
    if (
      /\bderiveCreateDocSubmission\s*\(\s*draft:\s*Pick<CreateDocChromeView/.test(
        store,
      ) ||
      /\bdraft\.(?:feature|title)\.trim\s*\(\s*\)/.test(store)
    ) {
      violations.push(`${storeRel}: create-doc submission trusts typed draft fields`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps filter-sidebar chrome behind the filter sidebar seam", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\buseFilterSidebarStore\b/.test(stripped)) {
        violations.push(`${rel}: raw filter-sidebar store access`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps scoped persistence re-keying behind the view-store transition owner", () => {
    const violations: string[] = [];
    const viewStore = stripComments(
      readFileSync(join(SRC_ROOT, "stores/view/viewStore.ts"), "utf8"),
    );
    const scopedStoreRel = "stores/view/scopedStore.ts";
    const scopedStore = stripComments(
      readFileSync(join(SRC_ROOT, scopedStoreRel), "utf8"),
    );
    const scopedKeysRel = "platform/storage/scopedKeys.ts";
    const scopedKeys = stripComments(
      readFileSync(join(SRC_ROOT, scopedKeysRel), "utf8"),
    );

    if (!/\bfunction\s+rekeyScopedClientStores\s*\(/.test(viewStore)) {
      violations.push(
        "stores/view/viewStore.ts: missing scoped persistence re-key owner",
      );
    }
    if (!/\busePinStore\.getState\(\)\.setScopeKey\s*\(/.test(viewStore)) {
      violations.push("stores/view/viewStore.ts: missing pin store re-key");
    }
    if (!/\buseLensStore\.getState\(\)\.setScopeKey\s*\(/.test(viewStore)) {
      violations.push("stores/view/viewStore.ts: missing lens store re-key");
    }
    if (
      !/\bsetScope:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\bconst\s+normalizedScope\s*=\s*normalizeViewStoreSessionString\s*\(\s*scope\s*\)[\s\S]*?\brekeyScopedClientStores\s*\(\s*normalizedScope\s*\)/.test(
        viewStore,
      )
    ) {
      violations.push(
        "stores/view/viewStore.ts: setScope does not normalize and re-key scoped stores",
      );
    }
    if (
      !/\bswapWorkspace:\s*\([^)]*workspace[^)]*scope[^)]*\)\s*=>\s*\{[\s\S]*?\bconst\s+normalizedWorkspace\s*=\s*normalizeViewStoreSessionString\s*\(\s*workspace\s*\)[\s\S]*?\bconst\s+normalizedScope\s*=\s*normalizeViewStoreSessionString\s*\(\s*scope\s*\)[\s\S]*?\brekeyScopedClientStores\s*\(\s*normalizedScope\s*,\s*normalizedWorkspace\s*\)/.test(
        viewStore,
      )
    ) {
      violations.push(
        "stores/view/viewStore.ts: swapWorkspace does not normalize and re-key scoped stores",
      );
    }
    const viewScopeIdentityRel = "stores/view/scopeIdentity.ts";
    const viewScopeIdentity = stripComments(
      readFileSync(join(SRC_ROOT, viewScopeIdentityRel), "utf8"),
    );
    if (
      !/import\s*\{[\s\S]*\bnormalizeScopeId\b[\s\S]*\}\s*from\s+["']\.\.\/\.\.\/platform\/scope\/scopeIdentity["']/.test(
        viewScopeIdentity,
      ) ||
      !/import\s*\{[\s\S]*\bSCOPE_ID_MAX_CHARS\b[\s\S]*\}\s*from\s+["']\.\.\/\.\.\/platform\/scope\/scopeIdentity["']/.test(
        viewScopeIdentity,
      ) ||
      !/\bexport\s+function\s+normalizeViewStoreSessionString\s*\(\s*value:\s*unknown\s*\):\s*string\s*\|\s*null[\s\S]*\breturn\s+normalizeScopeId\s*\(\s*value\s*\)/.test(
        viewScopeIdentity,
      )
    ) {
      violations.push(
        `${viewScopeIdentityRel}: view session-string normalizer bypasses platform scope identity`,
      );
    }
    if (
      !/\bexport\s+function\s+normalizeViewStoreSessionStringList\s*\(\s*value:\s*unknown\s*\):\s*string\[\][\s\S]*Array\.isArray\s*\(\s*value\s*\)[\s\S]*normalizeViewStoreSessionString\s*\(\s*entry\s*\)/.test(
        viewScopeIdentity,
      )
    ) {
      violations.push(
        `${viewScopeIdentityRel}: missing shared view session-string list normalizer`,
      );
    }
    if (
      !/\bVIEW_STORE_SESSION_STRING_LIST_MAX_ITEMS\b/.test(viewScopeIdentity) ||
      !/\bnormalized\.length\s*>=\s*VIEW_STORE_SESSION_STRING_LIST_MAX_ITEMS/.test(
        viewScopeIdentity,
      )
    ) {
      violations.push(
        `${viewScopeIdentityRel}: view session-string lists are unbounded`,
      );
    }
    if (
      !/from\s+["']\.\/scopeIdentity["'][\s\S]*\bnormalizeViewStoreSessionString/.test(
        viewStore,
      ) ||
      !/\bexport\s+const\s+normalizeViewStoreSessionString\s*=\s*normalizeViewStoreSessionStringIdentity\b/.test(
        viewStore,
      ) ||
      !/\bexport\s+const\s+normalizeViewStoreSessionStringList\s*=\s*normalizeViewStoreSessionStringListIdentity\b/.test(
        viewStore,
      )
    ) {
      violations.push(
        "stores/view/viewStore.ts: view session normalizers bypass shared scope identity",
      );
    }
    for (const typedOnly of [
      "setScope: (scope: string | null)",
      "swapWorkspace: (workspace: string, scope: string | null)",
      "folder: string | null;",
      "featureTags: string[];",
    ]) {
      if (viewStore.includes(typedOnly)) {
        violations.push(
          `stores/view/viewStore.ts: typed-only session seam ${typedOnly}`,
        );
      }
    }
    if (
      /\bscope:\s*scope\b/.test(viewStore) ||
      /\bactiveFolder:\s*folder\b/.test(viewStore) ||
      /\bfeatureContexts:\s*featureTags\b/.test(viewStore)
    ) {
      violations.push("stores/view/viewStore.ts: raw session context stored");
    }
    if (
      !/from\s+["']\.\.\/\.\.\/platform\/storage\/scopedKeys["'][\s\S]*\bnormalizeScopedStorageKeyPart\b/.test(
        scopedStore,
      ) ||
      !/\bexport\s+const\s+normalizeScopedStoreKeyPart\s*=\s*normalizeScopedStorageKeyPart\b/.test(
        scopedStore,
      )
    ) {
      violations.push(
        `${scopedStoreRel}: scoped key-part normalizer bypasses platform storage helper`,
      );
    }
    if (
      !/\bexport\s+const\s+SCOPED_STORAGE_KEY_PART_MAX_CHARS\b/.test(scopedKeys) ||
      !/\bexport\s+function\s+normalizeScopedStorageKeyPart\s*\(\s*value:\s*unknown\s*\)[\s\S]*\bconst\s+normalized\s*=\s*value\.trim\s*\(\s*\)[\s\S]*normalized\.length\s*<=\s*SCOPED_STORAGE_KEY_PART_MAX_CHARS/.test(
        scopedKeys,
      )
    ) {
      violations.push(`${scopedKeysRel}: scoped storage key parts are unbounded`);
    }
    if (
      !/\bscopedStorageKey\s*\(\s*prefix\s*,\s*workspace\s*,\s*scope\s*\)/.test(
        scopedStore,
      )
    ) {
      violations.push(`${scopedStoreRel}: active key is not role-tagged`);
    }
    if (
      !/\blegacyEncodedScopedStorageKey\b/.test(scopedStore) ||
      !/\blegacyScopedStorageKey\b/.test(scopedStore)
    ) {
      violations.push(`${scopedStoreRel}: missing legacy scoped key fallback`);
    }
    if (
      /\bconst\s+storageKey\s*=\s*\([^)]*workspace[^)]*scope[^)]*\)\s*=>\s*`[^`]*\$\{workspace\}[^`]*\$\{scope\}/.test(
        scopedStore,
      )
    ) {
      violations.push(`${scopedStoreRel}: active key uses raw workspace/scope`);
    }

    for (const file of sourceFiles(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
      if (rel === "stores/view/viewStore.ts") continue;

      const stripped = stripComments(readFileSync(file, "utf8"));
      if (/\.setScopeKey\s*\(/.test(stripped)) {
        violations.push(`${rel}: scoped persistence re-key outside viewStore`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps production browser storage behind sanctioned persistence owners", () => {
    const violations: string[] = [];
    const allowedStorageOwners = new Set([
      "platform/theme/themeController.ts",
      "scene/positionCache.ts",
      "stores/view/scopedStore.ts",
    ]);
    const roots = [
      ...PRODUCTION_SURFACES.map((surface) => join(SRC_ROOT, surface)),
      join(SRC_ROOT, "stores"),
    ];

    for (const root of roots) {
      for (const file of sourceFiles(root)) {
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
        if (allowedStorageOwners.has(rel)) continue;

        const stripped = stripComments(readFileSync(file, "utf8"));
        if (/\b(?:localStorage|sessionStorage)\b/.test(stripped)) {
          violations.push(`${rel}: direct browser storage outside persistence owner`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps scene position persistence keys encoded and legacy-readable", () => {
    const rel = "scene/positionCache.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (
      !/from\s+["']\.\.\/platform\/storage\/scopedKeys["'][\s\S]*\bscopedStorageKey\b/.test(
        stripped,
      ) ||
      !/\bexport\s+const\s+normalizePositionCacheKeyPart\s*=\s*normalizeScopedStorageKeyPart\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: position cache bypasses platform scoped-key helper`);
    }
    if (!/\blegacyScopeKey\b/.test(stripped)) {
      violations.push(`${rel}: missing legacy position blob fallback`);
    }
    if (!/\blegacyEncodedScopeKey\b/.test(stripped)) {
      violations.push(`${rel}: missing encoded legacy position blob fallback`);
    }
    if (!/\blegacyIndexKey\b/.test(stripped)) {
      violations.push(`${rel}: missing legacy position index fallback`);
    }
    if (!/\blegacyEncodedIndexKey\b/.test(stripped)) {
      violations.push(`${rel}: missing encoded legacy position index fallback`);
    }
    if (!/\bscopedStorageKey\s*\(\s*PREFIX\s*,\s*workspace\s*,\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: active position key is not role-tagged`);
    }
    if (
      /\bconst\s+scopeKey\s*=\s*\([^)]*workspace[^)]*scope[^)]*\)\s*:\s*string\s*=>\s*`[^`]*\$\{workspace\}[^`]*\$\{scope\}/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: active position key uses raw workspace/scope`);
    }
    if (!/\bremoveScopeBlob\b[\s\S]*\blegacyScopeKey\b/.test(stripped)) {
      violations.push(`${rel}: evictions do not clear legacy position blobs`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps Stage position persistence scoped to the active workspace and scope", () => {
    const rel = "app/stage/Stage.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (!/\buseActiveWorkspace\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing active-workspace seam for scene persistence`);
    }
    if (!/\buseActiveScope\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing active-scope seam for scene persistence`);
    }
    if (
      !/\bsetPersistenceScope\s*\(\s*activeWorkspace\s*,\s*scope\s*\)/.test(stripped)
    ) {
      violations.push(`${rel}: scene persistence is not keyed by workspace+scope`);
    }
    if (/\bsetPersistenceScope\s*\(\s*["'`]/.test(stripped)) {
      violations.push(`${rel}: scene persistence uses a literal workspace key`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps session folder-context mirroring behind stores session seams", () => {
    const violations: string[] = [];
    const allowed = new Set([
      "stores/server/sessionContext.ts",
      "stores/view/viewStore.ts",
    ]);

    for (const file of sourceFiles(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
      if (allowed.has(rel)) continue;

      const stripped = stripComments(readFileSync(file, "utf8"));
      if (/\bsetScopeContext\s*\(/.test(stripped)) {
        violations.push(`${rel}: raw session folder-context mirror write`);
      }
      if (
        rel.startsWith("app/left/") &&
        (/\bfeatureContextsFor\b/.test(stripped) ||
          /\bentry\.(?:feature_tags|doc_type)\b/.test(stripped))
      ) {
        violations.push(`${rel}: app-layer folder-context projection`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps browser-mode reset behind the view-store transition owner", () => {
    const violations: string[] = [];
    const allowed = new Set(["stores/view/browserMode.ts", "stores/view/viewStore.ts"]);

    for (const file of sourceFiles(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
      if (allowed.has(rel)) continue;

      const stripped = stripComments(readFileSync(file, "utf8"));
      if (/\bresetBrowserMode\s*\(/.test(stripped)) {
        violations.push(`${rel}: browser-mode reset outside viewStore transition`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps browser-mode app access behind the browser-mode seam", () => {
    const violations: string[] = [];
    const browserModeRel = "stores/view/browserMode.ts";
    const leftRailActionsRel = "stores/view/leftRailKeybindings.ts";
    const browserMode = stripComments(
      readFileSync(join(SRC_ROOT, browserModeRel), "utf8"),
    );
    const leftRailActions = stripComments(
      readFileSync(join(SRC_ROOT, leftRailActionsRel), "utf8"),
    );

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\buseBrowserModeStore\b/.test(stripped)) {
        violations.push(`${rel}: raw browser-mode store access`);
      }
      for (const statement of importStatements(stripped)) {
        if (/\bsetBrowserMode\b/.test(statement)) {
          violations.push(`${rel}: direct browser-mode imperative import`);
        }
      }
      if (/\bsetBrowserMode\s*\(/.test(stripped)) {
        violations.push(`${rel}: direct browser-mode mutation`);
      }
    }

    if (!/\bcycleBrowserMode\b/.test(leftRailActions)) {
      violations.push(`${leftRailActionsRel}: missing browser-mode cycle seam`);
    }
    if (/\bBROWSER_MODE_OPTIONS\b[\s\S]*\.findIndex\s*\(/.test(leftRailActions)) {
      violations.push(`${leftRailActionsRel}: local browser-mode cycle projection`);
    }
    for (const typedOnly of [
      "isBrowserMode(value: string)",
      "setMode: (mode: BrowserMode)",
      "setBrowserMode(mode: string)",
      "useBrowserModeIntent(): (mode: string) => void",
    ]) {
      if (browserMode.includes(typedOnly)) {
        violations.push(`${browserModeRel}: typed-only browser-mode seam ${typedOnly}`);
      }
    }
    for (const required of [
      "normalizeBrowserMode(value: unknown)",
      "isBrowserMode(value: unknown)",
      "setMode: (mode: unknown)",
      "setBrowserMode(mode: unknown)",
      "useBrowserModeIntent(): (mode: unknown) => void",
    ]) {
      if (!browserMode.includes(required)) {
        violations.push(
          `${browserModeRel}: missing runtime browser-mode seam ${required}`,
        );
      }
    }
    if (
      !/\bfunction\s+normalizeBrowserMode\s*\(\s*value:\s*unknown\s*\)[\s\S]*\bconst\s+normalized\s*=\s*value\.trim\s*\(\s*\)[\s\S]*\bBROWSER_MODE_OPTIONS\.find\s*\(\s*\(\s*option\s*\)\s*=>\s*option\.id\s*===\s*normalized\s*\)/.test(
        browserMode,
      )
    ) {
      violations.push(
        `${browserModeRel}: browser-mode normalizer preserves raw spacing`,
      );
    }
    if (
      !/\bsetMode:\s*\(mode\)\s*=>[\s\S]*\bnormalizeBrowserMode\s*\(\s*mode\s*\)/.test(
        browserMode,
      )
    ) {
      violations.push(`${browserModeRel}: store mode setter bypasses mode normalizer`);
    }
    if (!/\bmode:\s*normalizedMode\b/.test(browserMode)) {
      violations.push(`${browserModeRel}: store mode setter preserves raw mode input`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps BrowserRegion mode changes behind the browser-mode intent", () => {
    const rel = "app/left/BrowserRegion.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (!/\buseBrowserMode\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing browser-mode view read`);
    }
    if (!/\buseBrowserModeIntent\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing browser-mode intent`);
    }
    if (!/\bonModeChange=\{setMode\}/.test(stripped)) {
      violations.push(`${rel}: browser-mode toggle bypasses intent`);
    }
    if (/\bonModeChange=\{setBrowserMode\}/.test(stripped)) {
      violations.push(`${rel}: direct browser-mode setter passed to toggle`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps browser-mode options behind the browser-mode seam", () => {
    const violations: string[] = [];
    const rels = ["app/left/BrowserModeToggle.tsx", "app/shell/IconRail.tsx"];

    for (const rel of rels) {
      const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));

      if (!/\bBROWSER_MODE_OPTIONS\b/.test(stripped)) {
        violations.push(`${rel}: missing browser-mode option seam`);
      }
      if (/\bconst\s+(?:MODES|PRIMARY_ENTRIES)\b/.test(stripped)) {
        violations.push(`${rel}: local browser-mode option list`);
      }
      if (/\{\s*id:\s*["']vault["']\s*,\s*label:\s*["']Vault["']\s*\}/.test(stripped)) {
        violations.push(`${rel}: local vault mode label`);
      }
      if (/\{\s*id:\s*["']code["']\s*,\s*label:\s*["']Code["']\s*\}/.test(stripped)) {
        violations.push(`${rel}: local code mode label`);
      }
      if (/\bas\s+BrowserMode\b/.test(stripped)) {
        violations.push(`${rel}: app-layer browser-mode assertion`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps lifted chrome state behind named modal seams", () => {
    const violations: string[] = [];
    const rawLiftedChromeStore =
      /\b(?:useCommandPaletteStore|useKeyboardShortcutsStore|useSettingsDialog)\b/;

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (rawLiftedChromeStore.test(stripped)) {
        violations.push(`${rel}: raw lifted chrome store access`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps settings dialog chrome state normalized behind its store seam", () => {
    const storeRel = "stores/view/settingsDialog.ts";
    const bridgeRel = "app/settings/useSettingsDialog.ts";
    const store = stripComments(readFileSync(join(SRC_ROOT, storeRel), "utf8"));
    const bridge = stripComments(readFileSync(join(SRC_ROOT, bridgeRel), "utf8"));
    const violations: string[] = [];

    for (const seam of [
      "normalizeSettingsDialogOpen",
      "setOpen: (open: unknown)",
      "setSettingsDialogOpen(open: unknown)",
      "useSettingsDialogOpen",
      "openSettingsDialog",
      "closeSettingsDialog",
      "toggleSettingsDialog",
    ]) {
      if (!store.includes(seam)) {
        violations.push(`${storeRel}: missing settings dialog seam ${seam}`);
      }
    }
    for (const seam of [
      "normalizeSettingsDialogOpen",
      "setSettingsDialogOpen",
      "useSettingsDialogOpen",
      "openSettingsDialog",
      "closeSettingsDialog",
      "toggleSettingsDialog",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(bridge)) {
        violations.push(`${bridgeRel}: missing settings dialog bridge ${seam}`);
      }
    }
    for (const typedOnly of [
      "setOpen: (open: boolean)",
      "setSettingsDialogOpen(open: boolean)",
    ]) {
      if (store.includes(typedOnly)) {
        violations.push(`${storeRel}: typed-only settings dialog seam ${typedOnly}`);
      }
    }
    if (
      !/\bsetOpen:\s*\(open\)\s*=>[\s\S]*\bnormalizeSettingsDialogOpen\s*\(\s*open\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: open-state setter bypasses normalizer`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps keyboard-shortcut legend rows behind the keyboard-shortcuts seam", () => {
    const rel = "app/menu/KeyboardShortcuts.tsx";
    const storeRel = "stores/view/keyboardShortcuts.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const store = stripComments(readFileSync(join(SRC_ROOT, storeRel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseEffect\b/.test(statement)) {
        violations.push(`${rel}: local shortcut listener lifecycle`);
      }
      if (/\btoggleKeyboardShortcuts\b/.test(statement)) {
        violations.push(`${rel}: local shortcut toggle dispatch`);
      }
    }
    if (/\binterface\s+Shortcut\b|\binterface\s+ShortcutGroup\b/.test(stripped)) {
      violations.push(`${rel}: local shortcut legend row typing`);
    }
    if (/\bSHORTCUT_GROUPS\b/.test(stripped)) {
      violations.push(`${rel}: local shortcut legend row model`);
    }
    if (
      /\bKeyboardEvent\b|\bisFormTarget\b|\baddEventListener\s*\(\s*["']keydown["']/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local shortcut key intent parsing`);
    }
    if (!/\buseKeyboardShortcutGroups\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing shortcut-groups view seam`);
    }
    if (!/\buseKeyboardShortcutsGlobalToggle\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing shortcut global-toggle seam`);
    }
    for (const seam of [
      "KEYBOARD_SHORTCUTS_TOGGLE_BINDING",
      "normalizeKeyboardShortcutsOpen",
      "useKeyboardShortcutsOpen",
      "openKeyboardShortcuts",
      "closeKeyboardShortcuts",
      "toggleKeyboardShortcuts",
      "registerKeybindings",
      "registerKeyAction",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(store)) {
        violations.push(`${storeRel}: missing ${seam} keymap seam`);
      }
    }
    if (!/\bsetOpen:\s*\(open:\s*unknown\)\s*=>/.test(store)) {
      violations.push(`${storeRel}: missing runtime shortcut open setter`);
    }
    if (
      !/\bexport\s+function\s+setKeyboardShortcutsOpen\s*\(\s*open:\s*unknown\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: missing runtime shortcut open helper`);
    }
    if (/\bshouldToggleKeyboardShortcuts\b/.test(store)) {
      violations.push(`${storeRel}: local shortcut toggle key parser`);
    }
    if (
      /\bKeyboardEvent\b|\bisKeyboardShortcutsFormTarget\b|\baddEventListener\s*\(\s*["']keydown["']/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: local shortcut toggle listener`);
    }
    if (/\b(?:event|e)\.(?:ctrlKey|metaKey|altKey)\b/.test(store)) {
      violations.push(`${storeRel}: local shortcut modifier inspection`);
    }
    for (const typedOnly of [
      "setOpen: (open: boolean)",
      "setKeyboardShortcutsOpen(open: boolean)",
    ]) {
      if (store.includes(typedOnly)) {
        violations.push(`${storeRel}: typed-only shortcut legend seam ${typedOnly}`);
      }
    }
    if (
      !/\bsetOpen:\s*\(open\)\s*=>[\s\S]*\bnormalizeKeyboardShortcutsOpen\s*\(\s*open\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: open-state setter bypasses normalizer`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps modal focus trapping behind the shared chrome primitive", () => {
    const rels = ["app/chrome/Dialog.tsx", "app/palette/CommandPalette.tsx"];
    const violations: string[] = [];

    for (const rel of rels) {
      const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
      if (/\bfunction\s+focusablesOf\s*\(/.test(stripped)) {
        violations.push(`${rel}: local focusable-descendant helper`);
      }
      if (/\bquerySelectorAll<HTMLElement>\s*\(/.test(stripped)) {
        violations.push(`${rel}: local focusable query`);
      }
      if (!/\btrapTabFocus\s*\(/.test(stripped)) {
        violations.push(`${rel}: missing shared focus trap`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps modal Escape dismissal behind the shared chrome hook", () => {
    const rel = "app/chrome/Dialog.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const hookRel = "app/chrome/useDismissOnEscape.ts";
    const hook = stripComments(readFileSync(join(SRC_ROOT, hookRel), "utf8"));
    const violations: string[] = [];

    if (/\baddEventListener\s*\(\s*["']keydown["']/.test(stripped)) {
      violations.push(`${rel}: local Escape listener`);
    }
    if (!/\buseDismissOnEscape\s*\(\s*onClose\s*,\s*\{/.test(stripped)) {
      violations.push(`${rel}: missing shared Escape-dismiss hook`);
    }
    if (!/\benabled:\s*open\b/.test(stripped)) {
      violations.push(`${rel}: Escape-dismiss hook is not open-gated`);
    }
    if (!/\btarget:\s*document\b/.test(stripped)) {
      violations.push(`${rel}: modal Escape target drifted from document`);
    }
    if (!/\bpreventDefault:\s*true\b/.test(stripped)) {
      violations.push(`${rel}: modal Escape does not prevent default`);
    }
    if (!/\bexport\s+function\s+normalizeDismissOnEscapeEnabled\b/.test(hook)) {
      violations.push(`${hookRel}: missing Escape-dismiss enabled normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeDismissOnEscapePreventDefault\b/.test(hook)
    ) {
      violations.push(`${hookRel}: missing Escape-dismiss preventDefault normalizer`);
    }
    if (/\benabled\?:\s*boolean\b/.test(hook)) {
      violations.push(`${hookRel}: Escape-dismiss gate trusts typed-only boolean`);
    }
    if (/\bpreventDefault\?:\s*boolean\b/.test(hook)) {
      violations.push(`${hookRel}: Escape-dismiss preventDefault trusts typed-only boolean`);
    }
    if (
      !/\bconst\s+normalizedEnabled\s*=\s*normalizeDismissOnEscapeEnabled\s*\(\s*enabled\s*\)/.test(
        hook,
      )
    ) {
      violations.push(`${hookRel}: Escape-dismiss bypasses normalized enabled gate`);
    }
    if (
      !/\bnormalizeDismissOnEscapePreventDefault\s*\(\s*preventDefault\s*\)/.test(
        hook,
      )
    ) {
      violations.push(`${hookRel}: Escape-dismiss bypasses normalized preventDefault`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps focus restore lifecycle behind the shared chrome hook", () => {
    const hookRel = "app/chrome/useFocusRestore.ts";
    const hook = stripComments(readFileSync(join(SRC_ROOT, hookRel), "utf8"));
    const rels = [
      "app/chrome/Dialog.tsx",
      "app/palette/CommandPalette.tsx",
      "app/menu/ContextMenuHost.tsx",
    ];
    const violations: string[] = [];

    for (const rel of rels) {
      const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
      if (/\b(?:previousFocus|restoreRef|wasOpenRef)\b/.test(stripped)) {
        violations.push(`${rel}: local focus-restore ref`);
      }
      if (/\bdocument\.activeElement\s+instanceof\s+HTMLElement\b/.test(stripped)) {
        violations.push(`${rel}: local focus capture`);
      }
      if (!/\buseFocusRestore\s*\(/.test(stripped)) {
        violations.push(`${rel}: missing shared focus-restore hook`);
      }
    }
    if (!/\bexport\s+function\s+normalizeFocusRestoreOpen\b/.test(hook)) {
      violations.push(`${hookRel}: missing focus restore open normalizer`);
    }
    if (/\buseFocusRestore\s*\(\s*open:\s*boolean\b/.test(hook)) {
      violations.push(`${hookRel}: focus restore trusts typed-only open state`);
    }
    if (
      !/\bconst\s+normalizedOpen\s*=\s*normalizeFocusRestoreOpen\s*\(\s*open\s*\)/.test(
        hook,
      )
    ) {
      violations.push(`${hookRel}: focus restore bypasses normalized open state`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps production diagnostics behind the platform logger boundary", () => {
    const violations: string[] = [];

    for (const surface of ["app", "scene", "stores", "platform"] as const) {
      for (const file of sourceFiles(join(SRC_ROOT, surface))) {
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
        if (CONSOLE_ALLOWED_FILES.has(rel)) continue;
        const stripped = stripComments(readFileSync(file, "utf8"));

        if (/\bconsole\s*\./.test(stripped)) {
          violations.push(`${rel}: raw console diagnostic outside platform logger`);
        }
        if (/\beslint-disable-next-line\s+no-console\b/.test(stripped)) {
          violations.push(`${rel}: local no-console suppression`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps app view-store affordance access behind named seams", () => {
    const violations: string[] = [];
    const rawViewStoreAffordance =
      /\bgetState\s*\(\s*\)\s*\.\s*(?:openNode|closeNode|addToWorkingSet|removeFromWorkingSet|clearWorkingSet|openInViewer|closeViewer|selectEntity|openEditor|setDraft|markSaving|markSaved|markConflict|markFailed|closeEditor)\s*\(/;

    for (const surface of PRODUCTION_SURFACES) {
      for (const file of sourceFiles(join(SRC_ROOT, surface))) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        if (/\buseViewStore\b/.test(stripped)) {
          violations.push(`${rel}: raw view-store access`);
        }
        if (rawViewStoreAffordance.test(stripped)) {
          violations.push(`${rel}: raw view-store affordance write`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps right-rail search intent behind the search-intent seam", () => {
    const violations: string[] = [];
    const storeRel = "stores/view/searchIntent.ts";
    const store = stripComments(readFileSync(join(SRC_ROOT, storeRel), "utf8"));

    for (const file of sourceFiles(join(SRC_ROOT, "app/right"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\buseSearchIntentStore\b/.test(stripped)) {
        violations.push(`${rel}: raw search-intent store access`);
      }
    }
    if (
      !/\bexport\s+function\s+normalizeSearchIntentTarget\s*\(\s*value:\s*unknown\s*\):\s*SearchTarget\s*\|\s*null/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: missing search target normalizer`);
    }
    if (!/from\s+["']\.\.\/searchTarget["']/.test(store)) {
      violations.push(`${storeRel}: search target domain is not shared`);
    }
    if (
      !/\bfunction\s+normalizeSearchIntentTarget\s*\(\s*value:\s*unknown\s*\):\s*SearchTarget\s*\|\s*null[\s\S]*return\s+normalizeOptionalSearchTarget\s*\(\s*value\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: search target normalizer bypasses shared seam`);
    }
    if (
      !/\bexport\s+function\s+isSearchTarget\s*\(\s*value:\s*unknown\s*\):\s*value\s+is\s+SearchTarget\s*\{[\s\S]*normalizeSearchIntentTarget\s*\(\s*value\s*\)\s*!==\s*null/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: search target predicate bypasses normalizer`);
    }
    if (
      !/\bsetTarget:\s*\(target\)\s*=>\s*\{[\s\S]*\bconst\s+normalizedTarget\s*=\s*normalizeSearchIntentTarget\s*\(\s*target\s*\)[\s\S]*set\s*\(\s*\{\s*target:\s*normalizedTarget\s*\}/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: search target action bypasses normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeSearchIntentQuery\s*\(\s*query:\s*unknown\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: search query normalizer is not runtime-safe`);
    }
    if (
      !/from\s+["']\.\.\/searchQuery["']/.test(store) ||
      !/\bnormalizeSearchIntentQuery\b[\s\S]*\bnormalizeSearchQuery\s*\(\s*query\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: search intent bypasses shared query normalizer`);
    }
    if (
      !/\bsetQuery:\s*\(query\)\s*=>\s*set\s*\(\s*\{\s*query:\s*normalizeSearchIntentQuery\s*\(\s*query\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: search query action bypasses normalizer`);
    }
    if (
      /\bsetSearchIntentTarget\s*\([^)]*\)\s*:\s*void\s*\{[\s\S]*\bisSearchTarget\s*\(/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: search target validation lives in helper only`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps search wire state behind the stores-server search controller", () => {
    const violations: string[] = [];
    const rawSearchHelpers =
      /\b(?:useEngineSearch|engineKeys\.search|engineClient\.search|buildFallbackResults|isSemanticOffline|isTransportError|latestBackendsRagAvailable)\b/;
    const controllerRel = "stores/server/searchController.ts";
    const queriesRel = "stores/server/queries.ts";
    const controller = stripComments(
      readFileSync(join(SRC_ROOT, controllerRel), "utf8"),
    );
    const queries = stripComments(readFileSync(join(SRC_ROOT, queriesRel), "utf8"));
    const presentationStart = controller.indexOf(
      "export function deriveSearchPresentationView",
    );
    const presentationEnd = controller.indexOf(
      "export function interpretSearch",
      presentationStart,
    );
    const presentation =
      presentationStart >= 0 && presentationEnd > presentationStart
        ? controller.slice(presentationStart, presentationEnd)
        : "";

    for (const root of ["app", "scene", "platform", "stores/view"] as const) {
      for (const file of sourceFiles(join(SRC_ROOT, root))) {
        const stripped = stripComments(readFileSync(file, "utf8"));
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        if (rawSearchHelpers.test(stripped)) {
          violations.push(`${rel}: raw search wire/state-machine access`);
        }
        for (const statement of importStatements(stripped)) {
          if (/\buseVaultTree\b|\buseFiltersVocabulary\b/.test(statement)) {
            violations.push(`${rel}: search fallback data subscription`);
          }
        }
      }
    }
    if (!/\benabled\?:\s*boolean\b/.test(controller)) {
      violations.push(`${controllerRel}: missing controller enabled state input`);
    }
    if (
      !/normalizeSearchRequestIdentity/.test(importStatements(controller).join("\n")) ||
      !/\bnormalizeSearchRequestIdentity\s*\(\s*rawQuery\s*,\s*target\s*,\s*scope\s*\)/.test(
        controller,
      )
    ) {
      violations.push(
        `${controllerRel}: search request identity bypasses shared query normalizer`,
      );
    }
    if (
      !/from\s+["']\.\.\/searchQuery["']/.test(controller) ||
      !/\bexport\s+function\s+buildFallbackResults\s*\([\s\S]*query:\s*unknown/.test(
        controller,
      ) ||
      !/\bconst\s+needle\s*=\s*normalizeSearchQuery\s*\(\s*query\s*\)\.toLowerCase\s*\(\s*\)/.test(
        controller,
      )
    ) {
      violations.push(
        `${controllerRel}: fallback search bypasses shared query normalizer`,
      );
    }
    if (
      !/\bexport\s+function\s+normalizeSearchRagLifecycleWord\s*\(\s*word:\s*unknown\s*\)/.test(
        controller,
      )
    ) {
      violations.push(`${controllerRel}: missing stream rag lifecycle normalizer`);
    }
    if (
      !/\bfunction\s+ragWordOf\b[\s\S]*\bnormalizeSearchRagLifecycleWord\s*\(\s*\(data\s+as\s+\{\s*rag\?:\s*unknown\s*\}\)\.rag\s*\)/.test(
        controller,
      )
    ) {
      violations.push(`${controllerRel}: rag health detector reads raw stream word`);
    }
    if (/\btypeof\s+word\s*===\s*["']string["'][\s\S]*\breturn\s+word\b/.test(controller)) {
      violations.push(`${controllerRel}: rag lifecycle word bypasses normalizer`);
    }
    if (
      !/\bexport\s+function\s+deriveSearchPresentationView\s*\(\s*query:\s*unknown/.test(
        controller,
      )
    ) {
      violations.push(`${controllerRel}: search presentation trusts typed query`);
    }
    if (
      !/\bconst\s+trimmedQuery\s*=\s*normalizeSearchQuery\s*\(\s*query\s*\)/.test(
        presentation,
      )
    ) {
      violations.push(
        `${controllerRel}: search presentation bypasses shared query normalizer`,
      );
    }
    if (/\bquery\.trim\s*\(/.test(presentation)) {
      violations.push(`${controllerRel}: search presentation trims raw query`);
    }
    if (
      !/\bfunction\s+normalizeSearchTarget\s*\(\s*target:\s*unknown\s*\):\s*SearchTarget/.test(
        readFileSync(join(SRC_ROOT, "stores/searchTarget.ts"), "utf8"),
      ) ||
      !/from\s+["']\.\.\/searchTarget["']/.test(queries) ||
      !/\bconst\s+normalizeSearchScope\s*=\s*normalizeGraphSliceScope\b/.test(
        queries,
      ) ||
      !/from\s+["']\.\.\/searchQuery["']/.test(queries) ||
      !/\bnormalizeSearchRequestIdentity\s*\([\s\S]*\bquery:\s*normalizeSearchQuery\s*\(\s*rawQuery\s*\)[\s\S]*\btarget:\s*normalizeSearchTarget\s*\(\s*target\s*\)[\s\S]*\bscope:\s*normalizeSearchScope\s*\(\s*scope\s*\)/.test(
        queries,
      )
    ) {
      violations.push(
        `${queriesRel}: search request identity trusts typed query/target/scope`,
      );
    }
    if (!/\bif\s*\(\s*!enabled\s*\|\|\s*!hasQuery\s*\)/.test(controller)) {
      violations.push(`${controllerRel}: scope-less search is not interpreted as idle`);
    }
    if (!/\benabled:\s*requestedSearch\.scope\s*!==\s*null\b/.test(controller)) {
      violations.push(
        `${controllerRel}: search controller enabled truth bypasses scope`,
      );
    }
    if (
      !/normalizeBackendSignalChannel/.test(importStatements(controller).join("\n")) ||
      !/\bragWordOf[\s\S]*\bnormalizeBackendSignalChannel\s*\(\s*chunk\.channel\s*\)\s*!==\s*["']backends["']/.test(
        controller,
      )
    ) {
      violations.push(
        `${controllerRel}: rag health detector bypasses backend-signal channel normalizer`,
      );
    }
    if (
      /\bragWordOf[\s\S]*\b"rag"\s+in\s+data[\s\S]*\breturn\s+word/.test(controller) &&
      !/\bragWordOf[\s\S]*\bnormalizeBackendSignalChannel\s*\(\s*chunk\.channel\s*\)/.test(
        controller,
      )
    ) {
      violations.push(
        `${controllerRel}: rag health detector trusts payload shape only`,
      );
    }

    const rel = "app/right/SearchTab.tsx";
    const searchTab = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    if (
      !/\buseSearchController\s*\(\s*query\s*,\s*target\s*,\s*scope\s*\)/.test(
        searchTab,
      )
    ) {
      violations.push(`${rel}: missing stores search controller seam`);
    }
    if (!/\bderiveSearchPresentationView\s*\(\s*query\s*,\s*search\b/.test(searchTab)) {
      violations.push(`${rel}: missing stores search presentation seam`);
    }
    for (const helper of [
      "deriveSearchTargetRows",
      "useSearchIntentQuery",
      "useSearchIntentTarget",
      "setSearchIntentQuery",
      "setSearchIntentTarget",
    ]) {
      if (!new RegExp(`\\b${helper}\\b`).test(searchTab)) {
        violations.push(`${rel}: missing ${helper} seam`);
      }
    }
    if (/\[\s*["']vault["']\s*,\s*["']code["']\s*\]\s+as\s+const/.test(searchTab)) {
      violations.push(`${rel}: local search target domain`);
    }
    if (!/\bderiveSearchTargetRows\s*\(\s*\)/.test(searchTab)) {
      violations.push(`${rel}: missing search-target domain projection seam`);
    }
    if (!/\btargetRows\.map\b/.test(searchTab)) {
      violations.push(`${rel}: local search target row iteration`);
    }
    if (/\bSEARCH_TARGET_OPTIONS\.map\b/.test(searchTab)) {
      violations.push(`${rel}: raw search target domain iteration`);
    }
    if (/\btarget\s*===\s*\w+\b/.test(searchTab)) {
      violations.push(`${rel}: local search target active-state projection`);
    }
    if (/\bas\s+SearchTarget\b/.test(searchTab)) {
      violations.push(`${rel}: app-layer search target assertion`);
    }
    if (!/\bonChange=\{setSearchIntentTarget\}/.test(searchTab)) {
      violations.push(`${rel}: search target change bypasses intent seam`);
    }
    if (
      /row\.active\s*\?\s*["']border-accent/.test(searchTab) ||
      /["']border-accent bg-accent-subtle font-medium text-ink["']/.test(searchTab)
    ) {
      violations.push(`${rel}: local search target active-class projection`);
    }
    if (/\brow\.(?:active|className)\b/.test(searchTab)) {
      violations.push(`${rel}: local search target selected/chrome projection`);
    }
    if (
      searchTab.includes(
        "rounded-fg-pill border px-fg-2 py-fg-0-5 text-label transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      )
    ) {
      violations.push(`${rel}: local search target row base chrome`);
    }
    if (!/\bclassName=\{presentation\.targetGroupClassName\}/.test(searchTab)) {
      violations.push(`${rel}: missing search-target group class projection`);
    }
    if (!/<SegmentedToggle\b/.test(searchTab) || !/<Segment\b/.test(searchTab)) {
      violations.push(`${rel}: missing shared segmented-target control`);
    }
    if (
      !/\bconst\s+semanticData\s*=\s*requestSettled\s*\?\s*semantic\.data\s*:\s*undefined/.test(
        controller,
      )
    ) {
      violations.push(`${controllerRel}: search data is not gated by settled identity`);
    }
    if (
      !/\bconst\s+semanticError\s*=\s*requestSettled\s*\?\s*semantic\.error\s*:\s*undefined/.test(
        controller,
      )
    ) {
      violations.push(
        `${controllerRel}: search error is not gated by settled identity`,
      );
    }
    if (
      !/\bfallbackEntries:\s*requestSettled\s*\?\s*tree\.data\?\.entries\s*:\s*undefined/.test(
        controller,
      )
    ) {
      violations.push(
        `${controllerRel}: fallback entries are not gated by settled identity`,
      );
    }
    if (
      !/\bfilterVocabulary:\s*requestSettled\s*\?\s*filters\.data\s*:\s*undefined/.test(
        controller,
      )
    ) {
      violations.push(
        `${controllerRel}: search vocabulary is not gated by settled identity`,
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps search result normalization at the live adapter boundary", () => {
    const adapterRel = "stores/server/liveAdapters.ts";
    const searchRel = "app/right/SearchTab.tsx";
    const adapter = stripComments(readFileSync(join(SRC_ROOT, adapterRel), "utf8"));
    const searchTab = stripComments(readFileSync(join(SRC_ROOT, searchRel), "utf8"));
    const violations: string[] = [];

    for (const seam of [
      "normalizeSearchResultString",
      "normalizeSearchResultScore",
      "adaptSearchResult",
      "adaptSearch",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(adapter)) {
        violations.push(`${adapterRel}: missing ${seam} search adapter seam`);
      }
    }
    if (!/\bSearchResponse\b/.test(adapter)) {
      violations.push(`${adapterRel}: search adapter does not use SearchResponse`);
    }
    if (
      !/\bfunction\s+normalizeSearchResultScore\s*\(\s*value:\s*unknown\s*\):\s*number\s*\|\s*null[\s\S]*Number\.isFinite\s*\(\s*value\s*\)[\s\S]*Math\.max\s*\(\s*0\s*,\s*Math\.min\s*\(\s*1\s*,\s*value\s*\)\s*\)/.test(
        adapter,
      )
    ) {
      violations.push(`${adapterRel}: search score normalizer accepts invalid scores`);
    }
    if (
      !/\bfunction\s+adaptSearchResult\s*\(\s*item:\s*unknown\s*\):\s*SearchResponse\["results"\]\[number\]\s*\|\s*null[\s\S]*\bconst\s+score\s*=\s*normalizeSearchResultScore\s*\(\s*item\.score\s*\)[\s\S]*\bif\s*\(\s*score\s*===\s*null\s*\)\s*return\s+null[\s\S]*\bif\s*\(\s*source\s*===\s*undefined\s*\)\s*return\s+null/.test(
        adapter,
      )
    ) {
      violations.push(`${adapterRel}: search adapter fabricates malformed results`);
    }
    if (
      !/\bconst\s+normalizedItem:\s*Record<string,\s*unknown>\s*=[\s\S]*\bnode_id:\s*deriveSearchNodeId\s*\(\s*normalizedItem\s*\)/.test(
        adapter,
      )
    ) {
      violations.push(
        `${adapterRel}: search node-id derivation bypasses normalized row`,
      );
    }
    if (
      !/\.map\s*\(\s*adaptSearchResult\s*\)[\s\S]*\.filter\s*\(\s*\(\s*result\s*\):\s*result\s+is\s+SearchResponse\["results"\]\[number\]\s*=>\s*result\s*!==\s*null\s*\)/.test(
        adapter,
      )
    ) {
      violations.push(`${adapterRel}: search adapter does not drop malformed rows`);
    }
    if (/\badaptSearch\b|\bderiveSearchNodeId\b|\bSearchResponse\b/.test(searchTab)) {
      violations.push(`${searchRel}: app-layer search result adaptation`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps right-rail search presentation facts behind the search controller", () => {
    const rel = "app/right/SearchTab.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (/\bconst\s+showResults\b/.test(stripped)) {
      violations.push(`${rel}: local search result visibility derivation`);
    }
    if (/\bconst\s+firstClickable\b/.test(stripped)) {
      violations.push(`${rel}: local search roving-entry derivation`);
    }
    if (/\bconst\s+liveMessage\b/.test(stripped)) {
      violations.push(`${rel}: local search live-region derivation`);
    }
    if (/\bconst\s+trimmed\b|\bquery\.trim\s*\(/.test(stripped)) {
      violations.push(`${rel}: local search query presentation trim`);
    }
    if (/\bconst\s+hasQuery\b/.test(stripped)) {
      violations.push(`${rel}: local search idle-state derivation`);
    }
    if (/\bsearch\.results\.findIndex\b/.test(stripped)) {
      violations.push(`${rel}: raw search result focus-index scan`);
    }
    if (/\bsearch\.state\s*===/.test(stripped)) {
      violations.push(`${rel}: local search state visibility branch`);
    }
    if (/\bsearch\.semanticOffline\b/.test(stripped)) {
      violations.push(`${rel}: local search semantic-offline visibility branch`);
    }
    if (/\bsearch\.error\b/.test(stripped)) {
      violations.push(`${rel}: local search error visibility branch`);
    }
    if (/\bscorePercent\b|\bresultEntity\b/.test(stripped)) {
      violations.push(`${rel}: local search result row presentation helper`);
    }
    if (/Math\.round\s*\([^)]*\bscore\b/.test(stripped)) {
      violations.push(`${rel}: local search score label derivation`);
    }
    if (/\bfallback=\{search\.semanticOffline\}/.test(stripped)) {
      violations.push(`${rel}: local search row fallback-state threading`);
    }
    if (/\bfallbackLabel=\{presentation\.fallbackBadgeLabel\}/.test(stripped)) {
      violations.push(`${rel}: local search row fallback-label threading`);
    }
    if (
      /\bfallback\s*\?\s*["']text-ink-faint["']\s*:\s*["']text-ink-muted["']/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local search row score tone derivation`);
    }
    if (/\bresult\.node_id\s*\?\?/.test(stripped)) {
      violations.push(`${rel}: local search result identity fallback`);
    }
    if (
      /\bresult\.node_id\s*!==\s*null\b|\bresult\.node_id\s*===\s*null\b/.test(stripped)
    ) {
      violations.push(`${rel}: local search result selectability derivation`);
    }
    if (/\.startsWith\s*\(\s*["'](?:doc|code|commit):/.test(stripped)) {
      violations.push(`${rel}: local search result species derivation`);
    }
    if (!/\bspeciesMark\s*\(\s*row\.species\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing controller-derived search result species`);
    }
    if (!/\bpresentation\.resultRows\b/.test(stripped)) {
      violations.push(`${rel}: missing controller-derived search result rows`);
    }
    if (!/\brow\.scoreToneClass\b/.test(stripped)) {
      violations.push(`${rel}: missing controller-derived search row score tone`);
    }
    if (!/\brow\.buttonClassName\b/.test(stripped)) {
      violations.push(`${rel}: missing controller-derived search row button chrome`);
    }
    if (!/\brow\.excerptClassName\b/.test(stripped)) {
      violations.push(`${rel}: missing controller-derived search row excerpt chrome`);
    }
    if (!/\brow\.fallbackBadgeLabel\b/.test(stripped)) {
      violations.push(`${rel}: missing controller-derived search row fallback badge`);
    }
    for (const localChrome of [
      "space-y-fg-2 text-body",
      "flex gap-fg-1",
      "px-fg-1 py-fg-2 text-label text-ink-faint",
      "animate-pulse-live px-fg-1 py-fg-0-5 text-label text-ink-faint",
      "flex items-start gap-fg-1-5 rounded-fg-xs border border-state-stale/40 bg-paper-sunken px-fg-2 py-fg-1 text-label text-ink-muted",
      "mt-px shrink-0 text-state-stale",
      "space-y-fg-1 rounded-fg-xs border border-state-broken/40 px-fg-2 py-fg-1",
      "text-label text-state-broken",
      "rounded-fg-xs text-label text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
      "px-fg-1 text-caption text-ink-faint",
    ]) {
      if (stripped.includes(localChrome)) {
        violations.push(`${rel}: local search presentation chrome "${localChrome}"`);
      }
    }
    if (
      /row\.selectable\s*\?\s*["'][^"']*hover:border-rule-strong/.test(stripped) ||
      /["']cursor-default opacity-70["']/.test(stripped)
    ) {
      violations.push(`${rel}: local search result selectable chrome projection`);
    }
    if (
      stripped.includes(
        '"w-full rounded-fg-xs border border-rule px-fg-2 py-fg-1 text-left transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
      ) ||
      stripped.includes('"mt-fg-0-5 block truncate text-ink-muted"')
    ) {
      violations.push(`${rel}: local search result row chrome class`);
    }
    for (const localCopy of [
      "search semantically across the vault and code",
      "searching",
      "semantic search offline",
      "vault only; no code fallback available",
      "search request failed",
      "try again",
      "Ranked by meaning",
      "Ranked by text match",
      "Search documents and code",
      "search query",
      "search target",
      "search results",
      "text match",
    ]) {
      if (stripped.includes(localCopy)) {
        violations.push(`${rel}: local search presentation copy "${localCopy}"`);
      }
    }
    for (const field of [
      "idleMessage",
      "showLoading",
      "showSemanticOffline",
      "showError",
      "loadingMessage",
      "semanticOfflineMessage",
      "errorTitle",
      "retryLabel",
      "inputPlaceholder",
      "inputAriaLabel",
      "targetGroupAriaLabel",
      "resultsListAriaLabel",
      "resultSummaryLabel",
      "rootClassName",
      "targetGroupClassName",
      "idleClassName",
      "loadingClassName",
      "semanticOfflineClassName",
      "semanticOfflineIconClassName",
      "errorClassName",
      "errorTitleClassName",
      "retryButtonClassName",
      "noResultsClassName",
      "resultCountClassName",
      "resultsListClassName",
    ]) {
      if (!new RegExp(`\\bpresentation\\.${field}\\b`).test(stripped)) {
        violations.push(`${rel}: missing controller-derived ${field}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps status-tab chrome behind the status-tab chrome seam", () => {
    const rel = "app/right/StatusTab.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const storeRel = "stores/view/statusTabChrome.ts";
    const store = stripComments(readFileSync(join(SRC_ROOT, storeRel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseState\b/.test(statement)) {
        violations.push(`${rel}: local status-tab state`);
      }
    }
    for (const helper of [
      "useStatusSectionOpen",
      "toggleStatusSection",
      "useRecentCommitsChrome",
      "deriveRecentCommitChromeRows",
      "toggleRecentCommit",
      "showMoreRecentCommits",
    ]) {
      if (!new RegExp(`\\b${helper}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${helper} seam`);
      }
    }
    if (/\[\s*limit\s*,\s*setLimit\s*\]|\[\s*open\s*,\s*setOpen\s*\]/.test(stripped)) {
      violations.push(`${rel}: local status chrome tuple`);
    }
    if (/\bopenHashes\.includes\s*\(/.test(stripped)) {
      violations.push(`${rel}: local recent-commit open-hash join`);
    }
    if (
      /open\s*\?\s*["']bg-paper-sunken["']\s*:\s*["']bg-paper-raised["']/.test(stripped)
    ) {
      violations.push(`${rel}: local status-section card class projection`);
    }
    if (!/\bderiveStatusSectionChromeView\s*\(\s*id\s*,\s*open\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing status-section chrome view seam`);
    }
    for (const field of [
      "chrome.bodyId",
      "chrome.twistyPx",
      "chrome.headerClassName",
      "chrome.bodyClassName",
      "chrome.bodyVisible",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing status-section chrome ${field}`);
      }
    }
    for (const localSectionChrome of [
      "overflow-hidden rounded-fg-md border border-rule transition-colors duration-ui-fast ease-settle",
      "flex w-full items-center gap-fg-2 px-fg-3 py-fg-2 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      "px-fg-3 pb-fg-3 pt-fg-0-5",
    ]) {
      if (stripped.includes(localSectionChrome)) {
        violations.push(`${rel}: local status-section chrome "${localSectionChrome}"`);
      }
    }
    if (/\bexpanded\s*&&\s*row\.hasBody\b/.test(stripped)) {
      violations.push(`${rel}: local recent-commit body visibility projection`);
    }
    if (!/\bshowBody\b/.test(stripped)) {
      violations.push(`${rel}: missing recent-commit body visibility view`);
    }
    if (!/\bOPEN_RECENT_COMMIT_HASHES_CAP\b/.test(store)) {
      violations.push(`${storeRel}: missing bounded open commit accumulator cap`);
    }
    if (!/\bRECENT_COMMIT_HASH_MAX_CHARS\b/.test(store)) {
      violations.push(`${storeRel}: missing bounded recent commit hash identity cap`);
    }
    if (!/\bRECENT_COMMITS_LIMIT_CAP\b/.test(store)) {
      violations.push(`${storeRel}: missing bounded recent commits limit cap`);
    }
    if (!/\bcappedOpenRecentCommitHashes\s*\(/.test(store)) {
      violations.push(`${storeRel}: missing bounded open commit projection`);
    }
    if (!/\bArray\.isArray\s*\(\s*hashes\s*\)/.test(store)) {
      violations.push(`${storeRel}: open commit projection assumes array input`);
    }
    if (!/\bboundedPositiveCount\s*\(/.test(store)) {
      violations.push(`${storeRel}: missing bounded paging input projection`);
    }
    if (!/\bderiveRecentCommitsChromeView\b/.test(store)) {
      violations.push(`${storeRel}: missing recent commits chrome selector projection`);
    }
    if (!/\bderiveStatusSectionChromeView\b/.test(store)) {
      violations.push(`${storeRel}: missing status-section chrome selector projection`);
    }
    if (!/\bSTATUS_SECTION_IDS\b/.test(store)) {
      violations.push(`${storeRel}: missing declared status section vocabulary`);
    }
    if (!/\bnormalizeStatusSectionId\b/.test(store)) {
      violations.push(`${storeRel}: missing status section id normalizer`);
    }
    if (!/\bnormalizeStatusSectionOpen\b/.test(store)) {
      violations.push(`${storeRel}: missing status section open normalizer`);
    }
    if (
      !/\bfunction\s+normalizeRecentCommitHash\s*\(\s*hash:\s*unknown\s*\)/.test(store)
    ) {
      violations.push(`${storeRel}: missing recent commit hash input normalizer`);
    }
    if (
      !/\bfunction\s+normalizeRecentCommitHash\s*\(\s*hash:\s*unknown\s*\)[\s\S]*normalized\.length\s*<=\s*RECENT_COMMIT_HASH_MAX_CHARS/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: recent commit hash identity is unbounded`);
    }
    for (const typedOnly of [
      "toggleSection: (id: StatusSectionId, defaultOpen: boolean)",
      "toggleRecentCommit: (hash: string)",
      "showMoreRecentCommits: (page: number, defaultLimit: number)",
      "useStatusSectionOpen(\n  id: StatusSectionId,\n  defaultOpen: boolean",
      "deriveStatusSectionChromeView(\n  id: StatusSectionId,\n  open: boolean",
      "deriveRecentCommitsChromeView(\n  recentCommitsLimit: number | null",
      "useRecentCommitsChrome(defaultLimit: number)",
      "toggleStatusSection(id: StatusSectionId, defaultOpen: boolean)",
      "toggleRecentCommit(hash: string)",
      "showMoreRecentCommits(page: number, defaultLimit: number)",
    ]) {
      if (store.includes(typedOnly)) {
        violations.push(`${storeRel}: typed-only status chrome seam ${typedOnly}`);
      }
    }
    if (
      !/\btoggleSection\b[\s\S]*\bnormalizeStatusSectionId\s*\(\s*id\s*\)/.test(store)
    ) {
      violations.push(`${storeRel}: section disclosure bypasses id normalizer`);
    }
    if (
      !/\btoggleSection\b[\s\S]*\bnormalizeStatusSectionOpen\s*\(\s*defaultOpen\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: section disclosure bypasses open normalizer`);
    }
    if (
      !/\buseStatusSectionOpen\b[\s\S]*\bnormalizeStatusSectionId\s*\(\s*id\s*\)[\s\S]*\bnormalizeStatusSectionOpen\s*\(\s*defaultOpen\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: status section hook bypasses read normalizers`);
    }
    if (
      !/\bderiveStatusSectionChromeView\b[\s\S]*\bnormalizeStatusSectionId\s*\(\s*id\s*\)[\s\S]*\bnormalizeStatusSectionOpen\s*\(\s*open\s*\)/.test(
        store,
      )
    ) {
      violations.push(
        `${storeRel}: status section chrome projection bypasses read normalizers`,
      );
    }
    if (
      !/\bconst\s+normalizedHash\s*=\s*normalizeRecentCommitHash\s*\(\s*hash\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: recent commit toggle bypasses hash normalizer`);
    }
    if (
      !/\buseRecentCommitsChrome\b[\s\S]*\bderiveRecentCommitsChromeView\s*\(/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: recent commits hook bypasses selector projection`);
    }
    if (
      !/\bcappedOpenRecentCommitHashes\s*\(\s*openRecentCommitHashes\s*\)/.test(store)
    ) {
      violations.push(`${storeRel}: recent commits selector does not normalize hashes`);
    }
    if (
      !/\bderiveRecentCommitChromeRows[\s\S]*\bconst\s+rowHash\s*=\s*normalizeRecentCommitHash\s*\(\s*row\.commit\.hash\s*\)[\s\S]*\bopen\.has\s*\(\s*rowHash\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: recent commit row expansion uses raw commit hash`);
    }
    if (!/\bhash\.trim\s*\(/.test(store)) {
      violations.push(`${storeRel}: missing recent commit hash normalization`);
    }
    if (!/Math\.min\s*\(\s*RECENT_COMMITS_LIMIT_CAP/.test(store)) {
      violations.push(`${storeRel}: unbounded recent commits paging limit`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps status location presentation behind the location-anchor view", () => {
    const rel = "app/right/StatusTab.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const server = stripComments(
      readFileSync(join(SRC_ROOT, "stores/server/queries.ts"), "utf8"),
    );
    const violations: string[] = [];

    if (/no scope\s+—\s+pick a worktree first/.test(stripped)) {
      violations.push(`${rel}: local location empty-state copy`);
    }
    if (!/\banchor\.emptyLabel\b/.test(stripped)) {
      violations.push(`${rel}: missing location-anchor empty label`);
    }
    for (const field of ["anchor.emptyClassName", "anchor.branchClassName"]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing location-anchor presentation ${field}`);
      }
    }
    if (/>main</.test(stripped)) {
      violations.push(`${rel}: local location main label`);
    }
    for (const localClass of [
      "px-fg-1 text-label text-ink-faint",
      "shrink-0 font-medium text-ink",
      "min-w-0 truncate font-medium text-accent-text",
      "truncate font-mono text-meta text-ink-faint",
    ]) {
      if (stripped.includes(localClass)) {
        violations.push(`${rel}: local location presentation class "${localClass}"`);
      }
    }
    if (
      !/\bemptyLabel:\s*normalizedScope\s*===\s*null\s*\?[\s\S]*no scope\s+—\s+pick a worktree first[\s\S]*:\s*null/.test(
        server,
      )
    ) {
      violations.push(
        "stores/server/queries.ts: missing location empty-label projection",
      );
    }
    for (const field of [
      "emptyClassName",
      "mainLabel",
      "mainClassName",
      "branchClassName",
      "pathClassName",
    ]) {
      if (!new RegExp(`\\b${field}\\b`).test(server)) {
        violations.push(
          `stores/server/queries.ts: missing location presentation field ${field}`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps status-tab recent commit row labels behind the history view", () => {
    const rel = "app/right/StatusTab.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];
    const recentCommitsStart = stripped.indexOf("function RecentCommitsBody");
    const recentCommitsEnd = stripped.indexOf("export function StatusTab");
    const recentCommits =
      recentCommitsStart >= 0 && recentCommitsEnd > recentCommitsStart
        ? stripped.slice(recentCommitsStart, recentCommitsEnd)
        : stripped;

    if (/\(no subject\)/.test(recentCommits)) {
      violations.push(`${rel}: local recent commit subject fallback`);
    }
    if (/aria-label=\{`\$\{expanded\s*\?\s*["']collapse/.test(recentCommits)) {
      violations.push(`${rel}: local recent commit message-toggle label`);
    }
    if (/aria-label=\{`commit\s+\$\{commit\.short_hash/.test(recentCommits)) {
      violations.push(`${rel}: local recent commit row aria label`);
    }
    for (const helper of [
      "row.subjectLabel",
      "row.rowAriaLabel",
      "row.messageToggleLabel",
    ]) {
      if (!recentCommits.includes(helper)) {
        violations.push(`${rel}: missing ${helper} from history row view`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps right-rail DOM roving focus behind the shared chrome primitive", () => {
    const rels = existingSourceRels([
      "app/right/SearchTab.tsx",
      "app/right/WorkTab.tsx",
      "app/right/DiffView.tsx",
    ]);
    const violations: string[] = [];

    for (const rel of rels) {
      const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
      if (/\bfunction\s+rovingRows\s*\(/.test(stripped)) {
        violations.push(`${rel}: local roving row query helper`);
      }
      if (/\bquerySelectorAll<[^>]+>\s*\(/.test(stripped)) {
        violations.push(`${rel}: local roving item query`);
      }
      if (!/\bmoveRovingFocus\s*\(/.test(stripped)) {
        violations.push(`${rel}: missing shared roving focus primitive`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps right-rail search activation behind the scoped selection seam", () => {
    const rel = "app/right/SearchTab.tsx";
    const source = readFileSync(join(SRC_ROOT, rel), "utf8");
    const stripped = stripComments(source);
    const violations: string[] = [];

    if (/\bimport\s*\{\s*selectNode\b/.test(stripped)) {
      violations.push(`${rel}: raw search selection import`);
    }
    if (/\bconst\s+selectNode\b/.test(stripped)) {
      violations.push(`${rel}: local callback named like raw selection`);
    }
    if (/\bselectNode\s*\([^)]*,\s*scope\b/.test(stripped)) {
      violations.push(`${rel}: raw scoped search selection call`);
    }
    if (!/\buseDashboardNodeSelection\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing scoped search selection seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps right-rail work activation behind the scoped selection seam", () => {
    const rel = "app/right/StatusTab.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\bselectNode\b/.test(statement)) {
        violations.push(`${rel}: raw work selection import`);
      }
    }
    if (/\bconst\s+selectNode\b/.test(stripped)) {
      violations.push(`${rel}: local callback named like raw selection`);
    }
    if (/\bselectNode\s*\(/.test(stripped)) {
      violations.push(`${rel}: raw work selection call`);
    }
    if (!/\bselectEventNodes\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing event selection seam`);
    }
    if (!/<PlanStepTree\b/.test(stripped)) {
      violations.push(`${rel}: missing shared plan-step selection surface`);
    }
    if (
      !/\bderivePipelineExpansionRows\s*\(\s*view\.planRows\s*,\s*expanded\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing expansion-projected work plan rows`);
    }
    if (
      /\bderivePipelineExpansionRows\s*\(\s*view\.plans\s*,\s*expanded\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: raw work plan expansion row source`);
    }
    if (/\bview\.plans\s*\[\s*0\s*\]|\bview\.plans\.map\b/.test(stripped)) {
      violations.push(`${rel}: app-layer work plan row lookup`);
    }
    const treeRel = "app/right/PlanStepTree.tsx";
    const tree = stripComments(readFileSync(join(SRC_ROOT, treeRel), "utf8"));
    if (
      !/\buseDashboardNodeSelection\s*\(\s*useActiveScope\s*\(\s*\)\s*\)/.test(tree)
    ) {
      violations.push(`${treeRel}: missing scoped plan-step selection seam`);
    }
    if (!/\bstep\.rowAriaLabel\b/.test(tree)) {
      violations.push(`${treeRel}: missing plan-step row label projection`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps context-menu host state behind the context-menu seam", () => {
    const violations: string[] = [];
    const storeRel = "stores/view/contextMenu.ts";
    const store = stripComments(readFileSync(join(SRC_ROOT, storeRel), "utf8"));

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\buseContextMenuStore\b/.test(stripped)) {
        violations.push(`${rel}: raw context-menu store access`);
      }
    }

    for (const seam of [
      "normalizeContextMenuAnchor",
      "normalizeContextMenuCursor",
      "normalizeContextMenuItemId",
      "normalizeContextMenuEntity",
      "normalizeContextMenuTimeTravel",
      "normalizeContextMenuPanelSize",
      "normalizeContextMenuViewport",
    ]) {
      if (!new RegExp(`\\bexport\\s+function\\s+${seam}\\b`).test(store)) {
        violations.push(`${storeRel}: missing ${seam} seam`);
      }
    }
    for (const typedOnly of [
      "openMenu: (entity: EntityDescriptor, anchor: MenuAnchor)",
      "arm: (itemId: string)",
      "setCursor: (cursor: number)",
      "setPosition: (position: MenuAnchor | null)",
      "deriveContextMenuPanelPosition(\n  anchor: MenuAnchor,\n  size: ContextMenuPanelSize,\n  viewport: ContextMenuViewport",
      "deriveContextMenuResolvedView(\n  snapshot: ContextMenuSnapshot,\n  timeTravel: boolean",
      "useContextMenuResolvedView(\n  timeTravel: boolean",
      "openContextMenu(entity: EntityDescriptor, anchor: MenuAnchor)",
      "armContextMenuItem(itemId: string)",
      "setContextMenuCursor(cursor: number)",
      "setContextMenuPosition(position: MenuAnchor | null)",
    ]) {
      if (store.includes(typedOnly)) {
        violations.push(`${storeRel}: typed-only context-menu seam ${typedOnly}`);
      }
    }
    for (const required of [
      "normalizeContextMenuEntity(entity)",
      "normalizeContextMenuAnchor(anchor)",
      "normalizeContextMenuItemId(itemId)",
      "normalizeContextMenuCursor(cursor)",
      "normalizeContextMenuAnchor(position)",
      "normalizeContextMenuPanelSize(size)",
      "normalizeContextMenuViewport(viewport)",
    ]) {
      if (!store.includes(required)) {
        violations.push(`${storeRel}: context-menu update bypasses ${required}`);
      }
    }
    if (
      !/from\s+["']\.\.\/\.\.\/platform\/actions\/action["'][\s\S]*\bACTION_DESCRIPTOR_ID_MAX_CHARS\b/.test(
        store,
      ) ||
      !/\bnormalizeContextMenuItemId\s*\(\s*value:\s*unknown\s*\)[\s\S]*\bconst\s+normalized\s*=\s*value\.trim\s*\(\s*\)[\s\S]*normalized\.length\s*<=\s*ACTION_DESCRIPTOR_ID_MAX_CHARS/.test(
        store,
      )
    ) {
      violations.push(
        `${storeRel}: context-menu item identity does not share action descriptor cap`,
      );
    }
    if (!/\bnormalizeEntityDescriptor\s*\(\s*value\s*\)/.test(store)) {
      violations.push(`${storeRel}: context-menu entity seam bypasses descriptor seam`);
    }
    if (
      !/\bconst\s+normalizedTimeTravel\s*=\s*normalizeContextMenuTimeTravel\s*\(\s*timeTravel\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: context-menu time-travel gate bypasses normalizer`);
    }
    if (
      !/\bresolveActions\s*\(\s*snapshot\.entity\s*,\s*\{\s*timeTravel:\s*normalizedTimeTravel\s*\}\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: context-menu resolver uses raw time-travel gate`);
    }
    if (/\{\s*\.\.\.\s*value\s*,\s*kind/.test(store)) {
      violations.push(`${storeRel}: context-menu entity seam preserves raw payload`);
    }

    const hostRel = "app/menu/ContextMenuHost.tsx";
    const host = stripComments(readFileSync(join(SRC_ROOT, hostRel), "utf8"));
    if (/\[\s*cursor\s*,\s*setCursor\s*\]\s*=\s*useState/.test(host)) {
      violations.push(`${hostRel}: local context-menu cursor state`);
    }
    if (/\[\s*pos\s*,\s*setPos\s*\]\s*=\s*useState/.test(host)) {
      violations.push(`${hostRel}: local context-menu panel position state`);
    }
    if (/\bsetCursor\s*\(/.test(host)) {
      violations.push(`${hostRel}: local context-menu cursor setter`);
    }
    if (/\bsetPos\s*\(/.test(host)) {
      violations.push(`${hostRel}: local context-menu panel position setter`);
    }
    if (!/\bsetContextMenuCursor\b/.test(host)) {
      violations.push(`${hostRel}: missing context-menu cursor seam`);
    }
    if (!/\bsetContextMenuPosition\b/.test(host)) {
      violations.push(`${hostRel}: missing context-menu position seam`);
    }
    if (!/\buseContextMenuViewportDismiss\s*\(\s*\)/.test(host)) {
      violations.push(`${hostRel}: missing context-menu viewport dismiss seam`);
    }
    if (/\bwindow\.addEventListener\s*\(\s*["'](?:scroll|resize|blur)["']/.test(host)) {
      violations.push(`${hostRel}: local context-menu viewport dismiss listener`);
    }
    if (
      /\bwindow\.removeEventListener\s*\(\s*["'](?:scroll|resize|blur)["']/.test(host)
    ) {
      violations.push(`${hostRel}: local context-menu viewport dismiss cleanup`);
    }
    if (!/\bderiveContextMenuPanelPosition\b/.test(host)) {
      violations.push(`${hostRel}: missing context-menu panel-position projection`);
    }
    if (/\bcomputeMenuPosition\b/.test(host)) {
      violations.push(`${hostRel}: local context-menu panel-position projection`);
    }
    if (/from\s+["']\.\/position["']/.test(host)) {
      violations.push(`${hostRel}: app-menu position helper import`);
    }
    if (!/\bderiveContextMenuCursorRepair\s*\(\s*menu\s*\)/.test(host)) {
      violations.push(`${hostRel}: missing context-menu cursor repair seam`);
    }
    if (!/\bderiveContextMenuCursorMove\s*\(/.test(host)) {
      violations.push(`${hostRel}: missing context-menu cursor movement seam`);
    }
    if (!/\bderiveContextMenuCursorEdge\s*\(/.test(host)) {
      violations.push(`${hostRel}: missing context-menu cursor edge seam`);
    }
    if (/\brunnableIndices\.includes\s*\(/.test(host)) {
      violations.push(`${hostRel}: local context-menu cursor repair`);
    }
    if (/\brunnableIndices\.indexOf\s*\(/.test(host)) {
      violations.push(`${hostRel}: local context-menu cursor movement`);
    }
    if (
      /\brunnableIndices\s*\[\s*0\s*\]/.test(host) ||
      /\brunnableIndices\s*\[\s*runnableIndices\.length\s*-\s*1\s*\]/.test(host)
    ) {
      violations.push(`${hostRel}: local context-menu cursor edge derivation`);
    }
    if (!/\bcursor\b/.test(host)) {
      violations.push(`${hostRel}: missing store-owned context-menu cursor read`);
    }
    if (!/\bposition\b/.test(host)) {
      violations.push(`${hostRel}: missing store-owned context-menu position read`);
    }
    if (/\bconst\s+liveMessage\b/.test(host)) {
      violations.push(`${hostRel}: local context-menu live-region derivation`);
    }
    if (/\btimeTravel\?:\s*boolean\b/.test(host)) {
      violations.push(`${hostRel}: typed-only context-menu time-travel prop`);
    }
    if (!/\btimeTravel\?:\s*unknown\b/.test(host)) {
      violations.push(`${hostRel}: missing runtime context-menu time-travel prop seam`);
    }
    for (const localCopy of ["no actions", "entity actions"]) {
      if (host.includes(localCopy)) {
        violations.push(
          `${hostRel}: local context-menu presentation copy "${localCopy}"`,
        );
      }
    }
    if (/`confirm\s+\$\{action\.label\}\?`/.test(host)) {
      violations.push(`${hostRel}: local context-menu confirm label`);
    }
    if (/\bcontextMenuActionLabel\s*\(/.test(host)) {
      violations.push(`${hostRel}: local context-menu row label derivation`);
    }
    for (const localRowState of [
      "const selected =",
      "const armed =",
      "const disabled =",
    ]) {
      if (host.includes(localRowState)) {
        violations.push(`${hostRel}: local context-menu row state "${localRowState}"`);
      }
    }
    for (const localActionField of [
      "action.accelerator",
      "action.disabledReason",
      "action.disabled ===",
    ]) {
      if (host.includes(localActionField)) {
        violations.push(
          `${hostRel}: local context-menu descriptor presentation "${localActionField}"`,
        );
      }
    }
    for (const field of ["menuAriaLabel", "emptyMessage", "liveMessage"]) {
      if (!new RegExp(`\\b${field}\\b`).test(host)) {
        violations.push(`${hostRel}: missing resolved context-menu ${field}`);
      }
    }
    for (const field of ["rowGroups", "activeRow"]) {
      if (!new RegExp(`\\b${field}\\b`).test(host)) {
        violations.push(`${hostRel}: missing resolved context-menu ${field}`);
      }
    }
    for (const rowField of [
      "row.label",
      "row.disabled",
      "row.selected",
      "row.iconClassName",
      "row.iconSpacerClassName",
      "row.labelClassName",
      "row.confirmShortcutClassName",
      "row.acceleratorClassName",
      "row.selectionHintClassName",
    ]) {
      if (!host.includes(rowField)) {
        violations.push(`${hostRel}: missing context-menu row view ${rowField}`);
      }
    }
    if (
      /["']cursor-default border-l-transparent text-ink-faint["']/.test(host) ||
      /["']border-l-accent bg-accent-subtle text-ink["']/.test(host) ||
      /["']border-l-transparent text-ink-muted hover:bg-paper-sunken hover:text-ink["']/.test(
        host,
      )
    ) {
      violations.push(`${hostRel}: local context-menu row class projection`);
    }
    if (!/\brow\.className\b/.test(host)) {
      violations.push(`${hostRel}: missing context-menu row class view`);
    }
    for (const localRowChrome of [
      "shrink-0 text-ink-faint",
      "size-3.5 shrink-0",
      "flex-1 truncate",
      "text-state-stale",
      "rounded-fg-xs border border-rule px-fg-1 font-mono text-caption text-ink-faint",
      "font-mono text-caption text-ink-faint",
    ]) {
      if (host.includes(localRowChrome)) {
        violations.push(
          `${hostRel}: local context-menu row chrome "${localRowChrome}"`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps keyboard context-menu row anchoring behind the chrome primitive", () => {
    const rels = existingSourceRels([
      "app/left/CodeTree.tsx",
      "app/left/TreeBrowser.tsx",
      "app/left/WorktreePicker.tsx",
      "app/right/DiffView.tsx",
      "app/right/Inspector.tsx",
      "app/right/SearchTab.tsx",
    ]);
    const violations: string[] = [];

    for (const rel of rels) {
      const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
      if (/\bkey\s*===\s*["']ContextMenu["']/.test(stripped)) {
        violations.push(`${rel}: local ContextMenu key check`);
      }
      if (/\bshiftKey\s*&&\s*[^)]*\bkey\s*===\s*["']F10["']/.test(stripped)) {
        violations.push(`${rel}: local Shift+F10 key check`);
      }
      if (/\bgetBoundingClientRect\s*\(/.test(stripped)) {
        violations.push(`${rel}: local keyboard menu anchor measurement`);
      }
      if (!/\bhandleKeyboardContextMenu\s*\(/.test(stripped)) {
        violations.push(`${rel}: missing shared keyboard context-menu primitive`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps context-menu action resolution behind the resolved menu view", () => {
    const rel = "app/menu/ContextMenuHost.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\bresolveActions\b/.test(statement)) {
        violations.push(`${rel}: local action resolver import`);
      }
      if (/\bACTION_SECTION_ORDER\b/.test(statement)) {
        violations.push(`${rel}: local section-order import`);
      }
    }
    if (/\bresolveActions\s*\(/.test(stripped)) {
      violations.push(`${rel}: local action resolution`);
    }
    if (/\bgroupBySection\b|\bsectionOf\b/.test(stripped)) {
      violations.push(`${rel}: local action grouping`);
    }
    if (!/\buseContextMenuResolvedView\s*\(\s*timeTravel\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing resolved context-menu view seam`);
    }
    if (/\bisRunnable\b/.test(stripped)) {
      violations.push(`${rel}: local context-menu runnable classification`);
    }
    if (!/\bderiveContextMenuActivation\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing context-menu activation seam`);
    }
    if (/\baction\.confirm\b/.test(stripped)) {
      violations.push(`${rel}: local context-menu confirm classification`);
    }
    if (/\baction\.dispatch\??\./.test(stripped)) {
      violations.push(`${rel}: local context-menu dispatch classification`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps palette lens access behind the lens seam", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\buseLensStore\b/.test(stripped)) {
        violations.push(`${rel}: raw lens store access`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps pin and lens persistence behind scoped view-store seams", () => {
    const violations: string[] = [];
    const allowedOwners = new Set([
      "stores/view/lenses.ts",
      "stores/view/pins.ts",
      "stores/view/viewStore.ts",
    ]);

    for (const root of [
      "app",
      "scene",
      "platform",
      "stores/server",
      "stores/view",
    ] as const) {
      for (const file of sourceFiles(join(SRC_ROOT, root))) {
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
        if (allowedOwners.has(rel)) continue;

        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);

        for (const statement of importStatements(stripped)) {
          if (/\b(?:usePinStore|useLensStore)\b/.test(statement)) {
            violations.push(`${rel}: raw pin/lens store import`);
          }
          if (/\b(?:loadPins|savePins|loadLenses|saveLenses)\b/.test(statement)) {
            violations.push(`${rel}: raw pin/lens persistence import`);
          }
        }
        if (/\b(?:usePinStore|useLensStore)\b/.test(stripped)) {
          violations.push(`${rel}: raw pin/lens store access`);
        }
        if (/\b(?:loadPins|savePins|loadLenses|saveLenses)\s*\(/.test(stripped)) {
          violations.push(`${rel}: raw pin/lens persistence call`);
        }
        if (/\.(?:setScopeKey|togglePin|saveCurrent|choicesFor)\s*\(/.test(stripped)) {
          violations.push(`${rel}: raw pin/lens scoped-store method`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps degradation debug state behind the degradation-debug seam", () => {
    const violations: string[] = [];
    const storeRel = "stores/view/degradationDebug.ts";
    const store = stripComments(readFileSync(join(SRC_ROOT, storeRel), "utf8"));

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\buseDegradationStore\b/.test(stripped)) {
        violations.push(`${rel}: raw degradation-debug store access`);
      }
    }

    for (const seam of [
      "normalizeDegradationDebugOpen",
      "normalizeDegradationOverrideKey",
      "normalizeDegradationOverrideValue",
      "setOpen: (open: unknown)",
      "setOverride: (key: unknown, value: unknown)",
      "setDegradationOverride(\n  key: unknown,\n  value: unknown",
    ]) {
      if (!store.includes(seam)) {
        violations.push(`${storeRel}: missing degradation-debug seam ${seam}`);
      }
    }
    for (const typedOnly of [
      "setOpen: (open: boolean)",
      "setOverride: (key: keyof DegradationInputs, value: boolean | number | null)",
      "setDegradationOverride(\n  key: keyof DegradationInputs,\n  value: boolean | number | null",
    ]) {
      if (store.includes(typedOnly)) {
        violations.push(`${storeRel}: typed-only degradation-debug seam ${typedOnly}`);
      }
    }
    if (
      !/\bsetOpen:\s*\(open\)\s*=>[\s\S]*\bnormalizeDegradationDebugOpen\s*\(\s*open\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: open setter bypasses degradation normalizer`);
    }
    if (
      !/\bsetOverride:\s*\(key,\s*value\)\s*=>[\s\S]*\bnormalizeDegradationOverrideKey\s*\(\s*key\s*\)[\s\S]*\bnormalizeDegradationOverrideValue\s*\(\s*overrideKey,\s*value\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: override setter bypasses degradation normalizers`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps degradation debug switch chrome behind the degradation-debug seam", () => {
    const rel = "app/degradation/DebugSwitch.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseState\b/.test(statement)) {
        violations.push(`${rel}: local degradation debug panel state`);
      }
    }
    if (/\[\s*open\s*,\s*setOpen\s*\]/.test(stripped)) {
      violations.push(`${rel}: local degradation debug panel tuple`);
    }
    if (!/\buseDegradationDebugOpen\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing degradation debug open seam`);
    }
    if (!/\bopenDegradationDebug\b/.test(stripped)) {
      violations.push(`${rel}: missing degradation debug open helper`);
    }
    if (!/\bcloseDegradationDebug\b/.test(stripped)) {
      violations.push(`${rel}: missing degradation debug close helper`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps reduced-motion media-query state behind the shared visual seam", () => {
    const violations: string[] = [];
    const hookRel = "app/chrome/useReducedMotion.ts";
    const hook = stripComments(readFileSync(join(SRC_ROOT, hookRel), "utf8"));

    for (const root of ["app", "scene"] as const) {
      for (const file of sourceFiles(join(SRC_ROOT, root))) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        if (/\(prefers-reduced-motion:\s*reduce\)/.test(stripped)) {
          violations.push(`${rel}: local reduced-motion media query`);
        }
        if (/\bfunction\s+prefersReducedMotion\s*\(/.test(stripped)) {
          violations.push(`${rel}: local reduced-motion helper`);
        }
        if (root === "app" && rel !== "app/chrome/useReducedMotion.ts") {
          for (const statement of importStatements(stripped)) {
            if (
              /platform\/reducedMotion/.test(statement) ||
              /\bprefersReducedMotion\b/.test(statement)
            ) {
              violations.push(`${rel}: direct reduced-motion platform import`);
            }
          }
        }
      }
    }
    if (!/\bdataset\.reduceMotion\s*===\s*["']true["']/.test(hook)) {
      violations.push(`${hookRel}: missing setting-owned reduced-motion source`);
    }
    if (!/\bMutationObserver\b[\s\S]*data-reduce-motion/.test(hook)) {
      violations.push(`${hookRel}: does not observe setting reduced-motion updates`);
    }
    if (!/\buseSyncExternalStore\s*\(/.test(hook)) {
      violations.push(`${hookRel}: reduced-motion source is not an external store`);
    }
    if (/\buseState\s*\(/.test(hook)) {
      violations.push(`${hookRel}: reduced-motion source is mirrored in local state`);
    }
    if (
      !/\bprefersReducedMotion\s*\(\s*\)\s*\|\|\s*settingReducedMotion\s*\(\s*\)/.test(
        hook,
      )
    ) {
      violations.push(`${hookRel}: OS and setting reduced-motion floors drift`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps element measurement behind the shared external-store seam", () => {
    const violations: string[] = [];
    const rel = "app/chrome/useElementWidth.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));

    if (/\buseState\s*\(/.test(stripped)) {
      violations.push(`${rel}: element measurement is mirrored in local state`);
    }
    if (!/\buseSyncExternalStore\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing external-store measurement subscription`);
    }
    if (!/\bcreateElementMeasurementStore\b/.test(stripped)) {
      violations.push(`${rel}: missing centralized element measurement store`);
    }
    if (!/\bResizeObserver\b[\s\S]*observer\.observe\s*\(\s*el\s*\)/.test(stripped)) {
      violations.push(`${rel}: measurement seam bypasses ResizeObserver`);
    }
    if (!/\braw\s*&&\s*raw\s*>\s*0\s*\?\s*raw\s*:\s*null\b/.test(stripped)) {
      violations.push(`${rel}: measurement seam does not preserve zero-as-null`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps timeline view state behind the timeline seam", () => {
    const violations: string[] = [];
    const timelineRel = "stores/view/timeline.ts";
    const timeline = stripComments(readFileSync(join(SRC_ROOT, timelineRel), "utf8"));

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\buseTimelineStore\b/.test(stripped)) {
        violations.push(`${rel}: raw timeline store access`);
      }
    }

    for (const seam of [
      "normalizeTimelinePlayhead",
      "normalizeTimelineViewportWidth",
      "normalizeTimelineScope",
      "normalizeTimelineCorpusKey",
      "normalizeTimelineLane",
      "normalizeTimelineLaneVisibility",
      "normalizeTimelineDraftText",
      "normalizeTimelineViewportX",
      "normalizeTimelineMinimapDragState",
    ]) {
      if (!new RegExp(`\\bexport\\s+function\\s+${seam}\\b`).test(timeline)) {
        violations.push(`${timelineRel}: missing ${seam}`);
      }
    }
    for (const normalizer of ["normalizeTimelineScope", "normalizeTimelineCorpusKey"]) {
      if (
        !new RegExp(
          `\\b${normalizer}\\s*\\(\\s*value:\\s*unknown\\s*\\)[\\s\\S]*\\bconst\\s+normalized\\s*=\\s*value\\.trim\\s*\\(\\s*\\)[\\s\\S]*normalized\\.length\\s*>\\s*0[\\s\\S]*normalized\\.length\\s*<=\\s*TIMELINE_(?:SCOPE|CORPUS_KEY)_MAX_CHARS`,
        ).test(timeline)
      ) {
        violations.push(`${timelineRel}: ${normalizer} is not length-bounded`);
      }
    }
    if (
      !/\bTIMELINE_SCOPE_MAX_CHARS\b/.test(timeline) ||
      !/\bTIMELINE_CORPUS_KEY_MAX_CHARS\b/.test(timeline) ||
      !/\bTIMELINE_DRAFT_TEXT_MAX_CHARS\b/.test(timeline)
    ) {
      violations.push(`${timelineRel}: missing timeline string identity bounds`);
    }
    if (
      !/\bnormalizeTimelineDraftText\s*\(\s*value:\s*unknown\s*\)[\s\S]*normalized\.length\s*<=\s*TIMELINE_DRAFT_TEXT_MAX_CHARS/.test(
        timeline,
      )
    ) {
      violations.push(`${timelineRel}: timeline date drafts are unbounded`);
    }
    if (
      !/\btimelineCorpusFitKey\b[\s\S]*\bconst\s+from\s*=\s*normalizeTimelineDraftText\s*\(\s*source\.from\s*\)[\s\S]*\bconst\s+normalizedTo\s*=\s*normalizeTimelineDraftText\s*\(\s*source\.to\s*\)/.test(
        timeline,
      )
    ) {
      violations.push(`${timelineRel}: timeline corpus-fit key uses raw date bounds`);
    }
    for (const typedOnly of [
      'setPlayhead: (t: number | "live")',
      "setScrollOffset: (scrollOffset: number)",
      "setPxPerMs: (pxPerMs: number)",
      "setViewportWidth: (viewportWidth: number)",
      "scope: string,\n    pxPerMs: number,\n    scrollOffset: number",
      "toggleLane: (lane: PhaseLane, visible?: boolean)",
      'setTimelinePlayhead(playheadT: number | "live")',
      "setTimelineScrollOffset(scrollOffset: number)",
      "setTimelinePxPerMs(pxPerMs: number)",
      "setTimelineViewportWidth(viewportWidth: number)",
      "setTimelineViewport(pxPerMs: number, scrollOffset: number)",
      "fitTimelineViewportForScope(\n  scope: string,\n  pxPerMs: number",
      "toggleTimelineLane(lane: PhaseLane, visible?: boolean)",
      "openTimelineDatePicker(draftFrom: string, draftTo: string)",
      "setTimelineDatePickerDraftFrom(draftFrom: string)",
      "setTimelineDatePickerDraftTo(draftTo: string)",
      "startTimelineRangeDrag(x: number)",
      "updateTimelineRangeDrag(x2: number)",
      "setTimelineMinimapDrag(drag: TimelineMinimapDragState)",
      "clearTimelineMinimapDrag(pointerId?: number)",
    ]) {
      if (timeline.includes(typedOnly)) {
        violations.push(`${timelineRel}: typed-only timeline seam ${typedOnly}`);
      }
    }
    for (const required of [
      "normalizeTimelinePlayhead(playheadT)",
      "boundedScrollOffset(scrollOffset)",
      "boundedPxPerMs(pxPerMs)",
      "normalizeTimelineViewportWidth(viewportWidth)",
      "normalizeTimelineScope(scope)",
      "normalizeTimelineCorpusKey(corpusKey)",
      "normalizeTimelineLane(lane)",
      "normalizeTimelineLaneVisibility(visible)",
      "normalizeTimelineDraftText(draftFrom)",
      "normalizeTimelineDraftText(draftTo)",
      "normalizeTimelineViewportX(x)",
      "normalizeTimelineViewportX(x2)",
      "normalizeTimelineMinimapDragState(drag)",
      "normalizeTimelinePointerId(pointerId)",
    ]) {
      if (!timeline.includes(required)) {
        violations.push(`${timelineRel}: timeline update bypasses ${required}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps view-layer query-cache usage confined to the timeline view-state seam", () => {
    const violations: string[] = [];
    const timelineRel = "stores/view/timeline.ts";
    const timeline = stripComments(readFileSync(join(SRC_ROOT, timelineRel), "utf8"));

    for (const file of sourceFiles(VIEW_STORES_ROOT)) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (rel === timelineRel) continue;

      for (const statement of importStatements(stripped)) {
        if (/\buseQuery\b|\buseQueryClient\b/.test(statement)) {
          violations.push(`${rel}: view-layer query hook outside timeline seam`);
        }
        if (/stores\/server\/queryClient/.test(statement)) {
          violations.push(`${rel}: view-layer query client outside timeline seam`);
        }
      }
      if (/\bqueryClient\.(?:getQueryData|setQueryData)\s*\(/.test(stripped)) {
        violations.push(`${rel}: view-layer query-cache state outside timeline seam`);
      }
    }

    if (
      !/\bconst\s+timelineViewKey\s*=\s*\[\s*["']timeline-view["']\s*,\s*["']state["']\s*\]\s*as\s+const/.test(
        timeline,
      )
    ) {
      violations.push(`${timelineRel}: missing isolated timeline view-state cache key`);
    }
    if (
      !/\bqueryClient\.getQueryData\s*<\s*TimelineStateData\s*>\s*\(\s*timelineViewKey\s*\)/.test(
        timeline,
      )
    ) {
      violations.push(`${timelineRel}: timeline read does not use the owned cache key`);
    }
    if (
      !/\bqueryClient\.setQueryData\s*<\s*TimelineStateData\s*>\s*\(\s*timelineViewKey\s*,\s*next\s*\)/.test(
        timeline,
      )
    ) {
      violations.push(
        `${timelineRel}: timeline write does not use the owned cache key`,
      );
    }
    if (!/\buseQuery\s*\(\s*\{\s*queryKey:\s*timelineViewKey/.test(timeline)) {
      violations.push(
        `${timelineRel}: timeline hook does not subscribe through the owned key`,
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps app live-status writes behind the live-status seam", () => {
    const violations: string[] = [];
    const liveStatusRel = "stores/server/liveStatus.ts";
    const liveStatus = stripComments(
      readFileSync(join(SRC_ROOT, liveStatusRel), "utf8"),
    );

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\buseLiveStatusStore\b/.test(stripped)) {
        violations.push(`${rel}: raw live-status store access`);
      }
    }

    for (const seam of [
      "normalizeLiveStreamConnected",
      "normalizeLiveSeq",
      "normalizeLiveBrokenLinkCount",
      "setStreamConnected: (connected: unknown)",
      "setLastSeq: (seq: unknown)",
      "setBrokenLinkCount: (count: unknown)",
      "setLiveStreamConnected(connected: unknown)",
      "advanceLiveSeq(seq: unknown)",
      "setLiveBrokenLinkCount(count: unknown)",
    ]) {
      if (!liveStatus.includes(seam)) {
        violations.push(`${liveStatusRel}: missing live-status runtime seam ${seam}`);
      }
    }
    for (const typedOnly of [
      "setStreamConnected: (connected: boolean)",
      "setLastSeq: (seq: number)",
      "setBrokenLinkCount: (count: number)",
      "setLiveStreamConnected(connected: boolean)",
      "advanceLiveSeq(seq: number)",
      "setLiveBrokenLinkCount(count: number)",
    ]) {
      if (liveStatus.includes(typedOnly)) {
        violations.push(`${liveStatusRel}: typed-only live-status seam ${typedOnly}`);
      }
    }
    for (const required of [
      "normalizeLiveStreamConnected(streamConnected)",
      "normalizeLiveSeq(seq)",
      "normalizeLiveBrokenLinkCount(brokenLinkCount)",
    ]) {
      if (!liveStatus.includes(required)) {
        violations.push(`${liveStatusRel}: live-status update bypasses ${required}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps graph live-delta output behind the graph-sync store seam", () => {
    const rel = "stores/server/graphSync.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (
      /\[\s*featureDeltas\s*,\s*setFeatureDeltas\s*\]\s*=\s*useState/.test(stripped)
    ) {
      violations.push(`${rel}: hook-local feature delta state`);
    }
    if (/\[\s*gapCount\s*,\s*setGapCount\s*\]\s*=\s*useState/.test(stripped)) {
      violations.push(`${rel}: hook-local graph gap state`);
    }
    if (!/\buseGraphLiveDeltaStore\b/.test(stripped)) {
      violations.push(`${rel}: missing graph live-delta store seam`);
    }
    for (const typedOnly of [
      "setLifecycle: (scope: string | null, keyframeSeq: number | null)",
      "useGraphLiveDeltaView(\n  scope: string | null",
      "useGraphLiveSync(\n  scope: string | null",
      "enabled: boolean",
      "keyframeSeq: number | null = null",
    ]) {
      if (stripped.includes(typedOnly)) {
        violations.push(`${rel}: graph live sync trusts typed-only input ${typedOnly}`);
      }
    }
    for (const required of [
      "setLifecycle: (scope: unknown, keyframeSeq: unknown)",
      "useGraphLiveDeltaView(\n  scope: unknown",
      "useGraphLiveSync(\n  scope: unknown",
      "enabled: unknown",
      "keyframeSeq: unknown = null",
    ]) {
      if (!stripped.includes(required)) {
        violations.push(`${rel}: graph live sync lacks runtime input seam ${required}`);
      }
    }
    if (
      !/\bimport\s*\{[\s\S]*\bnormalizeGraphSliceScope\b[\s\S]*\}\s*from\s+["']\.\/queries["']/.test(
        stripped,
      ) ||
      !/\bexport\s+const\s+normalizeGraphLiveScope\s*=\s*normalizeGraphSliceScope\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: graph live scope duplicates graph-slice scope policy`);
    }
    for (const normalizer of [
      "normalizeGraphLiveKeyframeSeq",
      "normalizeGraphLiveEnabled",
    ]) {
      if (!new RegExp(`\\bexport\\s+function\\s+${normalizer}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${normalizer}`);
      }
    }
    if (
      !/\bconst\s+normalizedScope\s*=\s*normalizeGraphLiveScope\s*\(\s*scope\s*\)[\s\S]*const\s+normalizedKeyframeSeq\s*=[\s\S]*normalizedScope\s*===\s*null\s*\?\s*null\s*:\s*normalizeGraphLiveKeyframeSeq\s*\(\s*keyframeSeq\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: graph live sync bypasses normalized lifecycle identity`);
    }
    if (
      !/\bconst\s+active\s*=\s*normalizeGraphLiveEnabled\s*\(\s*enabled\s*\)\s*&&\s*normalizedScope\s*!==\s*null/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: graph live sync gates raw enabled/scope`);
    }
    if (
      !/\buseGraphLiveDeltaView\s*\(\s*normalizedScope\s*,\s*normalizedKeyframeSeq\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing graph live-delta view seam`);
    }
    if (
      !/\bsetLifecycle\s*\(\s*normalizedScope\s*,\s*normalizedKeyframeSeq\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: graph live lifecycle stores raw identity`);
    }
    if (!/\bGRAPH_FEATURE_DELTAS_CAP\b/.test(stripped)) {
      violations.push(`${rel}: missing bounded feature-delta batch cap`);
    }
    if (!/\bexport\s+function\s+normalizeGraphFeatureDeltas\b/.test(stripped)) {
      violations.push(`${rel}: missing feature-delta batch normalizer`);
    }
    if (
      !/\bsetFeatureDeltas:\s*\(featureDeltas\)\s*=>[\s\S]*\bnormalizeGraphFeatureDeltas\s*\(\s*featureDeltas\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: graph live-delta store writes raw feature deltas`);
    }
    if (
      !/\buseGraphLiveDeltaView[\s\S]*\bnormalizeGraphFeatureDeltas\s*\(\s*state\.featureDeltas\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: graph live-delta view exposes raw feature deltas`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps Stage live-delta scene command projection behind sceneMapping", () => {
    const rel = "app/stage/Stage.tsx";
    const mappingRel = "scene/sceneMapping.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const mapping = stripComments(readFileSync(join(SRC_ROOT, mappingRel), "utf8"));
    const violations: string[] = [];

    if (!/\bgraphDeltasToApplyCommand\s*\(\s*featureDeltas\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing graph-delta apply command seam`);
    }
    if (/\bgraphDeltaToScene\b/.test(stripped)) {
      violations.push(`${rel}: local graph-delta row mapping`);
    }
    if (/kind:\s*["']apply-deltas["']/.test(stripped)) {
      violations.push(`${rel}: local apply-deltas command projection`);
    }
    if (/deltas\s*\[\s*deltas\.length\s*-\s*1\s*\]/.test(stripped)) {
      violations.push(`${rel}: local graph-delta seq projection`);
    }
    for (const typedOnly of [
      "graphDeltaToScene(delta: GraphDeltaEntry)",
      "graphDeltasToApplyCommand(\n  deltas: readonly GraphDeltaEntry[]",
    ]) {
      if (mapping.includes(typedOnly)) {
        violations.push(`${mappingRel}: typed-only live-delta seam ${typedOnly}`);
      }
    }
    if (!/\bgraphDeltaToScene\s*\(\s*delta:\s*unknown\s*\)/.test(mapping)) {
      violations.push(`${mappingRel}: graph delta mapper accepts typed-only input`);
    }
    if (!/\bgraphDeltasToApplyCommand\s*\(\s*deltas:\s*unknown\s*\)/.test(mapping)) {
      violations.push(`${mappingRel}: graph delta command accepts typed-only input`);
    }
    if (
      !/\bfunction\s+isObjectRecord\s*\(\s*value:\s*unknown\s*\)/.test(mapping) ||
      !/\bfunction\s+normalizeGraphDeltaOp\s*\(\s*value:\s*unknown\s*\)/.test(
        mapping,
      ) ||
      !/\bfunction\s+normalizeGraphDeltaNumber\s*\(\s*value:\s*unknown\s*\)/.test(
        mapping,
      )
    ) {
      violations.push(`${mappingRel}: graph delta mapper lacks runtime normalizers`);
    }
    if (
      !/\bgraphDeltaToScene\b[\s\S]*\bnormalizeGraphDeltaOp\s*\(\s*delta\.op\s*\)[\s\S]*\bnormalizeGraphDeltaNumber\s*\(\s*delta\.t\s*\)[\s\S]*\bnormalizeGraphDeltaNumber\s*\(\s*delta\.seq\s*\)/.test(
        mapping,
      )
    ) {
      violations.push(`${mappingRel}: graph delta mapper bypasses runtime clocks/op`);
    }
    if (
      !/\bgraphDeltasToApplyCommand\b[\s\S]*Array\.isArray\s*\(\s*deltas\s*\)[\s\S]*\bgraphDeltaToScene\s*\(\s*entry\s*\)/.test(
        mapping,
      )
    ) {
      violations.push(`${mappingRel}: graph delta command trusts raw batch shape`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps ops receipt lifecycle behind the ops receipt seam", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app/right"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\breceiptEpoch\b/.test(stripped)) {
        violations.push(`${rel}: local ops receipt epoch`);
      }
      if (/\bsetReceipt\b/.test(stripped)) {
        violations.push(`${rel}: local ops receipt write`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps rag watcher config drafts behind the watcher draft seam", () => {
    const violations: string[] = [];
    const controlRel = "stores/server/ragControl.ts";
    const draftRel = "stores/view/ragWatcherConfigDraft.ts";
    const control = stripComments(readFileSync(join(SRC_ROOT, controlRel), "utf8"));
    const draft = stripComments(readFileSync(join(SRC_ROOT, draftRel), "utf8"));

    for (const file of sourceFiles(join(SRC_ROOT, "app/right"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\bcanonical(?:Debounce|Cooldown)\b/.test(stripped)) {
        violations.push(`${rel}: local rag watcher canonical draft`);
      }
      if (
        /\[\s*(?:debounce|cooldown)\s*,\s*set(?:Debounce|Cooldown)\s*\]/.test(stripped)
      ) {
        violations.push(`${rel}: local rag watcher draft write`);
      }
      if (/\bWATCHER_(?:DEBOUNCE|COOLDOWN)_/.test(stripped)) {
        violations.push(`${rel}: local rag watcher bounds`);
      }
    }
    if (!/\bWATCHER_DEBOUNCE_MS_MAX\b/.test(control)) {
      violations.push(`${controlRel}: missing debounce upper bound`);
    }
    if (!/\bWATCHER_COOLDOWN_S_MAX\b/.test(control)) {
      violations.push(`${controlRel}: missing cooldown upper bound`);
    }
    if (
      !/\bexport\s+function\s+normalizeRagWatcherConfigDraftValue\s*\(\s*value:\s*unknown\s*\)/.test(
        draft,
      )
    ) {
      violations.push(`${draftRel}: missing watcher draft input normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeWatcherReconfigureArgs\s*\([\s\S]*input:\s*unknown[\s\S]*\):\s*WatcherReconfigureArgs/.test(
        control,
      )
    ) {
      violations.push(`${controlRel}: missing watcher reconfigure args normalizer`);
    }
    if (!/\bboundedRagWatcherIntegerArg\s*\(/.test(control)) {
      violations.push(`${controlRel}: missing bounded integer arg parser`);
    }
    if (!/\bboundedRagWatcherNumberArg\s*\(/.test(control)) {
      violations.push(`${controlRel}: missing bounded number arg parser`);
    }
    if (
      !/from\s+["']\.\.\/server\/ragControl["'][\s\S]*\bnormalizeWatcherReconfigureArgs\b/.test(
        draft,
      )
    ) {
      violations.push(`${draftRel}: watcher draft bypasses rag control normalizer`);
    }
    if (
      !/\bwatcherReconfigureArgsFromDraft[\s\S]*return\s+normalizeWatcherReconfigureArgs\s*\(\s*\{[\s\S]*debounce_ms:\s*normalizeRagWatcherConfigDraftValue\s*\(\s*debounce\s*\)[\s\S]*cooldown_s:\s*normalizeRagWatcherConfigDraftValue\s*\(\s*cooldown\s*\)/.test(
        draft,
      )
    ) {
      violations.push(
        `${draftRel}: watcher draft owns wire args instead of delegating`,
      );
    }
    for (const forbidden of [
      "WATCHER_DEBOUNCE_MS_MAX",
      "WATCHER_COOLDOWN_S_MAX",
      "boundedIntegerDraft",
      "boundedNumberDraft",
    ]) {
      if (draft.includes(forbidden)) {
        violations.push(`${draftRel}: local watcher broker parser ${forbidden}`);
      }
    }
    if (!/\bsourceKey\s*:\s*string\s*\|\s*null\b/.test(draft)) {
      violations.push(`${draftRel}: missing watcher source identity key`);
    }
    if (
      !/\buseEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]*\bsetDebounceDraft\s*\(\s*canonicalDebounce\s*\)[\s\S]*\bsetCooldownDraft\s*\(\s*canonicalCooldown\s*\)[\s\S]*\}\s*,\s*\[\s*canonicalDebounce\s*,\s*canonicalCooldown\s*,\s*sourceKey\s*\]\s*\)/.test(
        draft,
      )
    ) {
      violations.push(`${draftRel}: watcher source changes do not reset draft`);
    }
    for (const typedOnly of [
      "setDebounce: (value: string)",
      "setCooldown: (value: string)",
      "debounce: string;\n  cooldown: string;\n}): WatcherReconfigureArgs",
    ]) {
      if (draft.includes(typedOnly)) {
        violations.push(`${draftRel}: typed-only watcher draft seam ${typedOnly}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps palette ops feedback behind the command-palette seam", () => {
    const violations: string[] = [];
    const storeRel = "stores/view/commandPalette.ts";
    const store = stripComments(readFileSync(join(SRC_ROOT, storeRel), "utf8"));

    for (const file of sourceFiles(join(SRC_ROOT, "app/palette"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\bopsRunSeq\b/.test(stripped)) {
        violations.push(`${rel}: local palette ops feedback epoch`);
      }
      if (/\bsetOpsMessage\b/.test(stripped)) {
        violations.push(`${rel}: local palette ops feedback write`);
      }
      if (/\bdispatchOps\s*\(/.test(stripped)) {
        violations.push(`${rel}: app-layer palette ops dispatch`);
      }
      if (/\bopsReceiptFrom(?:Result|Error)\b/.test(stripped)) {
        violations.push(`${rel}: app-layer palette ops receipt shaping`);
      }
    }
    if (!/\bCOMMAND_PALETTE_OPS_MESSAGE_CAP\b/.test(store)) {
      violations.push(`${storeRel}: missing bounded ops feedback message cap`);
    }
    if (!/\bexport\s+function\s+normalizeCommandPaletteOpsMessage\b/.test(store)) {
      violations.push(`${storeRel}: missing ops feedback message normalizer`);
    }
    if (!/\bexport\s+function\s+normalizeCommandPaletteOpsEpoch\b/.test(store)) {
      violations.push(`${storeRel}: missing ops feedback epoch normalizer`);
    }
    if (!/\bmessage\.trim\s*\(\s*\)/.test(store)) {
      violations.push(`${storeRel}: ops feedback messages are not trimmed`);
    }
    if (
      !/\bbeginOpsFeedback:\s*\(message\)[\s\S]*\bnormalizeCommandPaletteOpsMessage\s*\(\s*message\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: begin ops feedback bypasses normalizer`);
    }
    if (
      !/\bsetOpsFeedbackForEpoch:\s*\(epoch,\s*message\)[\s\S]*\bnormalizeCommandPaletteOpsMessage\s*\(\s*message\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: epoch feedback update bypasses normalizer`);
    }
    if (
      !/\bsetOpsFeedbackForEpoch:\s*\(epoch,\s*message\)[\s\S]*\bnormalizeCommandPaletteOpsEpoch\s*\(\s*epoch\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: epoch feedback update bypasses epoch normalizer`);
    }
    for (const typedOnly of [
      "beginOpsFeedback: (message: string)",
      "setOpsFeedbackForEpoch: (epoch: number, message: string)",
      "beginCommandPaletteOpsFeedback(message: string)",
      "setCommandPaletteOpsFeedbackForEpoch(\n  epoch: number,\n  message: string",
    ]) {
      if (store.includes(typedOnly)) {
        violations.push(`${storeRel}: typed-only palette ops seam ${typedOnly}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps continuous settings drafts behind the settings draft seam", () => {
    const violations: string[] = [];
    const storeRel = "stores/view/settingsControlDraft.ts";
    const rowRel = "stores/view/settingsControlRow.ts";
    const store = stripComments(readFileSync(join(SRC_ROOT, storeRel), "utf8"));
    const row = stripComments(readFileSync(join(SRC_ROOT, rowRel), "utf8"));

    if (
      !/\bexport\s+function\s+normalizeSettingsControlDraftValue\s*\(\s*[\s\S]*value:\s*unknown[\s\S]*maxLength\?:\s*unknown/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: missing settings draft input normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeSettingsControlDraftMaxLength\s*\(\s*value:\s*unknown\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: missing settings draft max-length normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeSettingsControlDraftContinuous\s*\(\s*value:\s*unknown\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: missing settings draft continuous normalizer`);
    }
    if (
      /\bcontrolValue:\s*string\b/.test(store) ||
      /\bcontinuous:\s*boolean\b/.test(store) ||
      /\bmaxLength:\s*number\b/.test(store)
    ) {
      violations.push(`${storeRel}: settings draft options trust typed-only input`);
    }
    if (
      !/\bconst\s+normalizedMaxLength\s*=\s*normalizeSettingsControlDraftMaxLength\s*\(\s*maxLength\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: settings draft max length bypasses normalizer`);
    }
    if (
      !/\bconst\s+normalizedControlValue\s*=\s*normalizeSettingsControlDraftValue\s*\(\s*[\s\S]*controlValue\s*,[\s\S]*normalizedMaxLength/.test(
        store,
      )
    ) {
      violations.push(
        `${storeRel}: settings draft canonical value bypasses normalizer`,
      );
    }
    if (
      !/\bconst\s+isContinuous\s*=\s*normalizeSettingsControlDraftContinuous\s*\(\s*continuous\s*\)/.test(
        store,
      )
    ) {
      violations.push(
        `${storeRel}: settings draft continuous flag bypasses normalizer`,
      );
    }
    if (
      !/\bconst\s+normalized\s*=\s*normalizeSettingsControlDraftValue\s*\(\s*next\s*,\s*normalizedMaxLength\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: settings draft change bypasses normalizer`);
    }
    if (
      !/\bcontrolMaxLength:\s*eff\.def\.value_type\.type\s*===\s*["']string["']\s*\?\s*eff\.def\.value_type\.max_len\s*:\s*undefined/.test(
        row,
      ) ||
      !/\bmaxLength:\s*view\.controlMaxLength\b/.test(row)
    ) {
      violations.push(`${rowRel}: settings row does not pass schema max length`);
    }
    if (/\bchange:\s*\(\s*next:\s*string\s*\)\s*=>\s*void\b/.test(store)) {
      violations.push(`${storeRel}: settings draft change accepts typed-only input`);
    }
    if (/\bcommit:\s*\(\s*next:\s*string\s*\)\s*=>\s*void\b/.test(store)) {
      violations.push(`${storeRel}: settings draft commit accepts typed-only input`);
    }
    if (
      !/\bexport\s+function\s+normalizeSettingsRowCommitValue\s*\(\s*[\s\S]*value:\s*unknown[\s\S]*controlMaxLength/.test(
        row,
      )
    ) {
      violations.push(`${rowRel}: missing settings row commit normalizer`);
    }
    if (/\bcommit:\s*\(\s*next:\s*string\s*\)\s*=>\s*void\b/.test(row)) {
      violations.push(`${rowRel}: settings row commit accepts typed-only input`);
    }
    if (
      !/\bconst\s+normalizedValue\s*=\s*normalizeSettingsRowCommitValue\s*\(\s*next\s*,[\s\S]*controlMaxLength[\s\S]*\)[\s\S]*value:\s*normalizedValue/.test(
        row,
      )
    ) {
      violations.push(`${rowRel}: settings row write bypasses commit normalizer`);
    }

    for (const file of sourceFiles(join(SRC_ROOT, "app/settings"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\bpreviousControlValue\b/.test(stripped)) {
        violations.push(`${rel}: local settings canonical draft tracker`);
      }
      if (/\bclearPendingDraft\b/.test(stripped)) {
        violations.push(`${rel}: local settings draft cancellation`);
      }
      if (/\bsetTimeout\s*\(\s*\(\)\s*=>\s*commit\s*\(/.test(stripped)) {
        violations.push(`${rel}: local settings draft debounce`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps interactive text-filter writes behind named dashboard helpers", () => {
    const violations: string[] = [];

    for (const surface of ["app/left", "app/stage"] as const) {
      for (const file of sourceFiles(join(SRC_ROOT, surface))) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        if (/\bdashboardFiltersWithText\b/.test(stripped)) {
          violations.push(`${rel}: raw text-filter patch composition`);
        }
        if (/\.setTextFilter\s*\(/.test(stripped)) {
          violations.push(`${rel}: direct dashboard text-filter write`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps dashboard text-filter drafts behind the shared text-filter seam", () => {
    const violations: string[] = [];
    const draftRel = "stores/view/dashboardTextFilter.ts";
    const intentRel = "stores/server/dashboardTextFilterIntent.ts";
    const dashboardRel = "stores/server/dashboardState.ts";
    const normalizationRel = "stores/server/dashboardStateNormalization.ts";
    const draft = stripComments(readFileSync(join(SRC_ROOT, draftRel), "utf8"));
    const intent = stripComments(readFileSync(join(SRC_ROOT, intentRel), "utf8"));
    const dashboard = stripComments(readFileSync(join(SRC_ROOT, dashboardRel), "utf8"));
    const normalization = stripComments(
      readFileSync(join(SRC_ROOT, normalizationRel), "utf8"),
    );

    for (const file of sourceFiles(join(SRC_ROOT, "app"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      for (const statement of importStatements(stripped)) {
        if (/\buseDashboardTextFilterIntent\b/.test(statement)) {
          violations.push(`${rel}: raw dashboard text-filter intent import`);
        }
      }
      if (/\bsetTextFilterRef\b/.test(stripped)) {
        violations.push(`${rel}: local dashboard text-filter mutation ref`);
      }
      if (/debounce\s*\(\s*\(\s*value:\s*string\s*\)/.test(stripped)) {
        violations.push(`${rel}: local dashboard text-filter debounce`);
      }
      if (/\buseDashboardTextFilterIntent\s*\(/.test(stripped)) {
        violations.push(`${rel}: raw dashboard text-filter intent call`);
      }
      if (/\.setTextFilter\s*\(/.test(stripped)) {
        violations.push(`${rel}: direct dashboard text-filter write`);
      }
      if (/\bfilters\.text\b/.test(stripped)) {
        const allowedTextFilterReaders = new Set(["app/left/BrowserRegion.tsx"]);
        if (!allowedTextFilterReaders.has(rel)) {
          violations.push(`${rel}: local dashboard text-filter read`);
        }
      }
    }
    for (const statement of importStatements(draft)) {
      if (/\buseDashboardState\b/.test(statement)) {
        violations.push(`${draftRel}: raw dashboard-state subscription`);
      }
      if (/\buseDashboardStateMutations\b/.test(statement)) {
        violations.push(`${draftRel}: raw dashboard text-filter mutation seam`);
      }
    }
    if (/\bdashboardState\.data\b|\bfilters\.text\b/.test(draft)) {
      violations.push(`${draftRel}: local canonical text-filter read`);
    }
    if (/\bsetTextFilterRef\b|\.setTextFilter\s*\(/.test(draft)) {
      violations.push(`${draftRel}: local dashboard text-filter mutation ref`);
    }
    if (!/\buseDashboardTextFilterIntent\s*\(\s*normalizedScope\s*\)/.test(draft)) {
      violations.push(`${draftRel}: missing server text-filter intent seam`);
    }
    if (
      /\buseDashboardTextFilterDraft\s*\(\s*scope:\s*string\s*\|\s*null/.test(draft) ||
      /\buseDashboardTextFilterIntent\s*\(\s*scope:\s*string\s*\|\s*null/.test(intent)
    ) {
      violations.push(`${draftRel}: text-filter scope seam trusts typed inputs`);
    }
    if (
      !/\bnormalizeDashboardTextFilterScope\s*\(\s*scope\s*\)/.test(draft) ||
      !/\bimport\s*\{[\s\S]*\bnormalizeDashboardStateWriteScope\b[\s\S]*\}\s*from\s+["']\.\/dashboardState["']/.test(
        intent,
      ) ||
      !/\bexport\s+const\s+normalizeDashboardTextFilterScope\s*=\s*normalizeDashboardStateWriteScope\b/.test(
        intent,
      )
    ) {
      violations.push(`${draftRel}: missing text-filter scope normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeDashboardTextFilterDraftValue\s*\(\s*value:\s*unknown\s*\)/.test(
        draft,
      )
    ) {
      violations.push(`${draftRel}: missing text-filter draft input normalizer`);
    }
    if (
      !/\bnormalizeDashboardTextFilterDraftValue[\s\S]*\bnormalizeSearchQuery\s*\(\s*value\s*\)/.test(
        draft,
      )
    ) {
      violations.push(`${draftRel}: text-filter draft is not query-normalized`);
    }
    if (
      !/\bconst\s+normalized\s*=\s*normalizeDashboardTextFilterDraftValue\s*\(\s*next\s*\)/.test(
        draft,
      )
    ) {
      violations.push(`${draftRel}: text-filter draft write bypasses normalizer`);
    }
    if (/\bsetValue:\s*\(\s*value:\s*string\s*\)\s*=>\s*void\b/.test(draft)) {
      violations.push(`${draftRel}: text-filter draft setter accepts typed-only input`);
    }
    if (/\bwriteTextFilter:\s*\(\s*value:\s*string\s*\)/.test(intent)) {
      violations.push(`${intentRel}: text-filter intent accepts typed-only input`);
    }
    if (/\bsetTextFilter:\s*\(\s*text:\s*string\s*\)/.test(dashboard)) {
      violations.push(`${dashboardRel}: text-filter mutation accepts typed-only input`);
    }
    if (/\bdashboardFiltersWithText\s*\(\s*[\s\S]*?text:\s*string/.test(dashboard)) {
      violations.push(`${dashboardRel}: text-filter helper accepts typed-only input`);
    }
    if (!/\bwriteTextFilter:\s*\(\s*value:\s*unknown\s*\)/.test(intent)) {
      violations.push(`${intentRel}: missing runtime-safe text-filter intent`);
    }
    if (!/\bsourceIdentity:\s*string\b/.test(intent)) {
      violations.push(`${intentRel}: missing text-filter source identity`);
    }
    if (!/\bdashboardStateSessionIdentity\s*\(\s*session\.data\s*\)/.test(intent)) {
      violations.push(`${intentRel}: source identity bypasses dashboard session key`);
    }
    if (!/\bsetTextFilter:\s*\(\s*text:\s*unknown\s*\)/.test(dashboard)) {
      violations.push(`${dashboardRel}: missing runtime-safe text-filter mutation`);
    }
    if (!/\bdashboardFiltersWithText\s*\(\s*[\s\S]*?text:\s*unknown/.test(dashboard)) {
      violations.push(`${dashboardRel}: missing runtime-safe text-filter helper`);
    }
    if (
      !/\bdashboardFiltersWithText[\s\S]*\bnormalizeDashboardTextFilter\s*\(\s*text\s*\)/.test(
        dashboard,
      )
    ) {
      violations.push(`${dashboardRel}: text-filter helper bypasses normalizer`);
    }
    if (
      !/\bnormalizeDashboardTextFilter[\s\S]*\bnormalizeSearchQuery\s*\(\s*value\s*\)/.test(
        normalization,
      )
    ) {
      violations.push(`${normalizationRel}: dashboard text filter is not bounded`);
    }
    if (
      !/\buseEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]*\bdebouncedSetTextFilter\.cancel\s*\(\s*\)[\s\S]*\bsetLocalValue\s*\(\s*canonicalText\s*\)[\s\S]*\}\s*,\s*\[\s*canonicalText\s*,\s*debouncedSetTextFilter\s*,\s*normalizedScope\s*,\s*sourceIdentity\s*\]\s*\)/.test(
        draft,
      )
    ) {
      violations.push(`${draftRel}: source changes do not reset text-filter draft`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps the stage filter sidebar behind the stores sidebar view", () => {
    const rel = "app/stage/FilterSidebar.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardState\b/.test(statement)) {
        violations.push(`${rel}: raw dashboard-state filter sidebar subscription`);
      }
      if (/\buseDashboardStateMutations\b/.test(statement)) {
        violations.push(`${rel}: broad dashboard-state filter sidebar mutation`);
      }
    }
    if (
      /\bconst\s+dashboardState\b/.test(stripped) ||
      /\bdashboardState\.data\b/.test(stripped)
    ) {
      violations.push(`${rel}: local dashboard filter sidebar state read`);
    }
    if (/\bdate_range\b/.test(stripped)) {
      violations.push(`${rel}: raw dashboard date-range sidebar read`);
    }
    if (
      /\bfilters\.(?:doc_types|feature_tags|relations|structural_state|text)\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: app-layer dashboard filter payload projection`);
    }
    if (/\bscope:\s*string\s*\|\s*null\b/.test(stripped)) {
      violations.push(`${rel}: typed-only filter sidebar scope boundary`);
    }
    if (!/\bscope:\s*unknown\b/.test(stripped)) {
      violations.push(`${rel}: missing runtime-safe filter sidebar scope boundary`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps filter-sidebar dashboard intent scoped through a runtime normalizer", () => {
    const rel = "stores/server/dashboardFilterSidebarIntent.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (
      /\buseDashboardFilterSidebarIntent\s*\(\s*scope:\s*string\s*\|\s*null/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: filter-sidebar intent trusts typed-only scope`);
    }
    if (
      /\btoggleFacet:\s*\(\s*facet:\s*DashboardFilterFacet,\s*value:\s*string\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: filter-sidebar facet intent trusts typed-only inputs`);
    }
    if (
      !/\btoggleFacet:\s*\(\s*facet:\s*unknown,\s*value:\s*unknown\s*\)/.test(stripped)
    ) {
      violations.push(`${rel}: missing runtime-safe facet intent inputs`);
    }
    if (/\btype\s+DashboardFilterFacet\b/.test(stripped)) {
      violations.push(`${rel}: imports typed-only dashboard facet`);
    }
    if (
      !/\bimport\s*\{[\s\S]*\bnormalizeDashboardStateWriteScope\b[\s\S]*\}\s*from\s+["']\.\/dashboardState["']/.test(
        stripped,
      ) ||
      !/\bexport\s+const\s+normalizeDashboardFilterSidebarScope\s*=\s*normalizeDashboardStateWriteScope\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing runtime scope normalizer`);
    }
    if (
      !/\bconst\s+normalizedScope\s*=\s*normalizeDashboardFilterSidebarScope\s*\(\s*scope\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: dashboard intent bypasses normalized scope`);
    }
    if (!/\buseDashboardStateMutations\s*\(\s*normalizedScope\s*\)/.test(stripped)) {
      violations.push(`${rel}: dashboard mutations receive raw filter-sidebar scope`);
    }
    if (
      !/\bnormalizedScope\s*===\s*null\s*\?\s*inert\s*\(\s*\)\s*:\s*mutations\.toggleFilterFacet/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: facet intent does not gate normalized scope`);
    }
    if (
      !/\bnormalizedScope\s*===\s*null\s*\?\s*inert\s*\(\s*\)\s*:\s*mutations\.setFilters\s*\(\s*\{\s*\}\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: clear intent does not gate normalized scope`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps filter-sidebar visual state behind the filter-sidebar seam", () => {
    const rel = "app/stage/FilterSidebar.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const match of stripped.matchAll(
      /const\s+\[\s*(\w+)\s*,\s*(\w+)\s*\]\s*=\s*useState/g,
    )) {
      const tuple = `${match[1]}:${match[2]}`;
      violations.push(`${rel}: local filter-sidebar state tuple ${tuple}`);
    }
    const mainComponent = stripped.slice(
      stripped.indexOf("export function FilterSidebar"),
    );
    if (/\buseState\s*\(/.test(mainComponent)) {
      violations.push(`${rel}: exported sidebar owns local visual/filter state`);
    }
    if (!/\buseFilterSidebarVisualState\b/.test(stripped)) {
      violations.push(`${rel}: missing scoped visual-state seam`);
    }
    if (!/\buseFiltersVocabularyView\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing stores vocabulary view seam`);
    }
    if (!/\buseDashboardFilterSidebarView\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing stores filter-sidebar view seam`);
    }
    if (!/\buseDashboardFilterSidebarIntent\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing dashboard filter-sidebar intent seam`);
    }
    if (!/\bderiveFilterSidebarMenuSections\s*\(\s*\{/.test(stripped)) {
      violations.push(`${rel}: missing filter-sidebar section projection seam`);
    }
    if (/\buseMemo\b/.test(stripped)) {
      violations.push(`${rel}: local filter-sidebar section memo/projection`);
    }
    if (
      /\bvocabulary\.(?:docTypes|featureTags|statuses|health)\.map\b/.test(stripped) ||
      /\bfilterView\.editedWindowRows\.map\b/.test(stripped)
    ) {
      violations.push(`${rel}: local filter-sidebar option projection`);
    }
    if (/\bJSON\.stringify\s*\(/.test(stripped)) {
      violations.push(`${rel}: local disclosure reset key derivation`);
    }
    if (
      !/const\s+visualStateKey\s*=\s*useFilterSidebarVisualState\s*\(\s*scope\s*,\s*vocabulary\.docTypes\s*,\s*vocabulary\.featureTags\s*,\s*vocabulary\.statuses\s*,\s*vocabulary\.health\s*,?\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing scoped vocabulary visual-state seam`);
    }
    if (!/\bkey=\{visualStateKey\}/.test(stripped)) {
      violations.push(`${rel}: scoped vocabulary key is not registered with seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps filter-sidebar visual-state identity membership-based", () => {
    const rel = "stores/view/filterSidebar.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (!/\bvisualStateVocabularyPart\b/.test(stripped)) {
      violations.push(`${rel}: missing visual-state vocabulary normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeFilterSidebarVocabularyPart\s*\(\s*values:\s*unknown\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing runtime visual-state vocabulary normalizer`);
    }
    if (
      !/\bFILTER_SIDEBAR_VOCABULARY_VALUE_MAX_CHARS\b/.test(stripped) ||
      !/\bFILTER_SIDEBAR_VOCABULARY_PART_MAX_VALUES\b/.test(stripped)
    ) {
      violations.push(`${rel}: visual-state vocabulary identity is unbounded`);
    }
    if (
      !/\bnormalizeFilterSidebarVocabularyValue\b[\s\S]*normalized\.length\s*<=\s*FILTER_SIDEBAR_VOCABULARY_VALUE_MAX_CHARS/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: visual-state vocabulary values are unbounded`);
    }
    if (!/\bArray\.isArray\s*\(\s*values\s*\)/.test(stripped)) {
      violations.push(`${rel}: visual-state vocabulary normalizer trusts typed arrays`);
    }
    if (!/\bconst\s+normalizedValues\s*=\s*new\s+Set\s*<\s*string\s*>\s*\(\s*\)/.test(stripped)) {
      violations.push(`${rel}: visual-state identity does not dedupe vocabulary`);
    }
    if (
      !/\bnormalizedValues\.size\s*>=\s*FILTER_SIDEBAR_VOCABULARY_PART_MAX_VALUES/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: visual-state vocabulary accumulator is unbounded`);
    }
    if (
      !/\.sort\s*\(\s*\(\s*a\s*,\s*b\s*\)\s*=>\s*a\.localeCompare\s*\(\s*b\s*\)\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: visual-state identity does not sort vocabulary`);
    }
    if (
      /\bderiveFilterSidebarVisualStateKey\s*\(\s*scope\s*:\s*unknown\s*,\s*docTypes\s*:\s*readonly\s+string\[\]\s*,\s*featureTags\s*:\s*readonly\s+string\[\]\s*,\s*statuses\s*:\s*readonly\s+string\[\]\s*,\s*health\s*:\s*readonly\s+string\[\]\s*,?\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: visual-state identity trusts typed vocabulary arrays`);
    }
    if (
      !/\bderiveFilterSidebarVisualStateKey\s*\(\s*scope\s*:\s*unknown\s*,\s*docTypes\s*:\s*unknown\s*,\s*featureTags\s*:\s*unknown\s*,\s*statuses\s*:\s*unknown\s*,\s*health\s*:\s*unknown\s*,?\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(
        `${rel}: visual-state identity does not include full sidebar vocabulary`,
      );
    }
    if (
      !/from\s+["']\.\/scopeIdentity["'][\s\S]*\bnormalizeViewStoreSessionString\b/.test(
        stripped,
      ) ||
      !/\bexport\s+const\s+normalizeFilterSidebarScope\s*=\s*normalizeViewStoreSessionString\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing shared visual-state scope normalizer`);
    }
    if (!/\bnormalizeFilterSidebarScope\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: visual-state identity uses raw scope`);
    }
    for (const vocabularyPart of ["docTypes", "featureTags", "statuses", "health"]) {
      if (
        !new RegExp(
          `\\bvisualStateVocabularyPart\\s*\\(\\s*${vocabularyPart}\\s*\\)`,
        ).test(stripped)
      ) {
        violations.push(`${rel}: visual-state identity omits ${vocabularyPart}`);
      }
    }
    if (
      !/\bvisualStateVocabularyPart\s*\(\s*values:\s*unknown\s*\)[\s\S]*\bnormalizeFilterSidebarVocabularyPart\s*\(\s*values\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: visual-state identity bypasses vocabulary normalizer`);
    }
    if (
      /JSON\.stringify\s*\(\s*\[\s*scope\s*,\s*docTypes\s*,\s*featureTags\s*\]\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: visual-state identity is raw array-order sensitive`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps filter-sidebar visual chrome input normalized at the store seam", () => {
    const rel = "stores/view/filterSidebar.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const seam of [
      "normalizeFilterSidebarOpen",
      "normalizeFilterSidebarVisualStateKey",
      "normalizeFilterSidebarSectionKey",
      "normalizeFilterSidebarListKey",
    ]) {
      if (!new RegExp(`\\bexport\\s+function\\s+${seam}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${seam} seam`);
      }
    }
    if (
      !/\bexport\s+const\s+normalizeFilterSidebarScope\s*=\s*normalizeViewStoreSessionString\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing normalizeFilterSidebarScope seam`);
    }
    for (const typedOnly of [
      "setOpen: (open: boolean)",
      "syncVisualStateKey: (key: string)",
      "setTopicSearch: (value: string)",
      "setSectionOpen: (key: FilterSidebarSectionKey, open: boolean)",
      "expandList: (key: FilterSidebarListKey)",
      "setFilterSidebarOpen(open: boolean)",
      "setFilterSidebarTopicSearch(value: string)",
      "setFilterSidebarSectionOpen(\n  key: FilterSidebarSectionKey,\n  open: boolean",
      "expandFilterSidebarList(key: FilterSidebarListKey)",
    ]) {
      if (stripped.includes(typedOnly)) {
        violations.push(`${rel}: typed-only filter-sidebar chrome seam ${typedOnly}`);
      }
    }
    for (const required of [
      "normalizeFilterSidebarOpen(open)",
      "normalizeFilterSidebarVisualStateKey(key)",
      "normalizeFilterSidebarSectionKey(key)",
      "normalizeFilterSidebarOpen(open)",
      "normalizeFilterSidebarListKey(key)",
    ]) {
      if (!stripped.includes(required)) {
        violations.push(`${rel}: filter-sidebar update bypasses ${required}`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps filter-sidebar topic search bounded in the visual-state seam", () => {
    const rel = "stores/view/filterSidebar.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (!/\bFILTER_SIDEBAR_TOPIC_SEARCH_MAX_CHARS\b/.test(stripped)) {
      violations.push(`${rel}: missing topic-search bound`);
    }
    if (
      !/\bnormalizeFilterSidebarTopicSearch\s*\(\s*value\s*:\s*unknown\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing topic-search normalizer`);
    }
    if (
      !/from\s+["']\.\.\/searchQuery["']/.test(stripped) ||
      !/\bnormalizeFilterSidebarTopicSearch\b[\s\S]*\bnormalizeSearchQuery\s*\(\s*value\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: topic-search bypasses shared query normalizer`);
    }
    if (
      !/\bconst\s+topicSearch\s*=\s*normalizeFilterSidebarTopicSearch\s*\(\s*value\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: topic-search setter bypasses normalizer`);
    }
    if (
      !/\bnormalizeFilterSidebarTopicSearch\s*\(\s*topicSearch\s*\)\.trim\s*\(\s*\)\.toLowerCase\s*\(\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: topic option projection bypasses normalizer`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps filter-sidebar presentation facts behind stores selector seams", () => {
    const rel = "app/stage/FilterSidebar.tsx";
    const viewRel = "stores/server/queries.ts";
    const chromeRel = "stores/view/filterSidebar.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const view = stripComments(readFileSync(join(SRC_ROOT, viewRel), "utf8"));
    const chrome = stripComments(readFileSync(join(SRC_ROOT, chromeRel), "utf8"));
    const violations: string[] = [];

    for (const localCopy of [
      "filter panel",
      "Filter documents",
      "Clear all",
      "clear all filters",
      "close filter panel",
      "Kind",
      "Topic",
      "Edited",
      "edited window",
      "Any time",
      "Last 7 days",
      "Last 30 days",
      "This year",
      "loading...",
      "loading…",
      "none in corpus",
    ]) {
      if (stripped.includes(`"${localCopy}"`) || stripped.includes(`'${localCopy}'`)) {
        violations.push(
          `${rel}: local filter-sidebar presentation copy "${localCopy}"`,
        );
      }
    }
    for (const localMapping of [
      "DOC_TYPE_LABEL",
      "STATUS_DOT",
      "HEALTH_DOT",
      "HEALTH_LABEL",
      "docTypeLabel",
      "statusDot",
      "healthDot",
      "healthLabel",
    ]) {
      if (new RegExp(`\\b${localMapping}\\b`).test(stripped)) {
        violations.push(
          `${rel}: local filter-sidebar vocabulary presentation mapping ${localMapping}`,
        );
      }
    }
    if (/\+\{[^}]*overflow[^}]*\}\s*more/.test(stripped)) {
      violations.push(`${rel}: local filter-sidebar overflow label`);
    }
    for (const field of [
      "presentation.panelAriaLabel",
      "presentation.panelClassName",
      "presentation.titleLabel",
    ]) {
      const pattern = new RegExp(`\\b${field.replace(".", "\\.")}\\b`);
      if (!pattern.test(stripped)) {
        violations.push(`${rel}: missing ${field} presentation field`);
      }
    }
    if (!/<FilterMenu\b/.test(stripped)) {
      violations.push(`${rel}: missing centralized filter menu presenter`);
    }
    if (!/\btitle=\{presentation\.titleLabel\}/.test(stripped)) {
      violations.push(`${rel}: filter menu title is not store-owned`);
    }
    if (!/\bsections=\{sections\}/.test(stripped)) {
      violations.push(`${rel}: filter menu is not fed by container sections`);
    }
    if (/\bselected\.includes\s*\(/.test(stripped)) {
      violations.push(`${rel}: local facet checked-state projection`);
    }
    if (/\brow\.(?:checked|active)\s*\?\s*["']text-ink["']/.test(stripped)) {
      violations.push(`${rel}: local filter-row selected text styling`);
    }
    if (
      stripped.includes(
        '"flex cursor-pointer items-center gap-fg-2 rounded-fg-xs px-fg-1 py-fg-0-5 text-label hover:bg-paper-sunken"',
      ) ||
      stripped.includes('"accent-accent"')
    ) {
      violations.push(`${rel}: local filter-row chrome class`);
    }
    for (const localSidebarChrome of [
      "pointer-events-auto absolute bottom-0 left-0 top-9 z-20 flex w-60 flex-col overflow-hidden border-r border-rule bg-paper-raised/95 shadow-fg-overlay backdrop-blur-sm focus:outline-none animate-slide-in-left",
      "flex items-center justify-between border-b border-rule px-fg-3 py-fg-1-5",
      "text-body font-medium text-ink",
      "flex items-center gap-fg-2",
      "text-caption text-accent-text underline-offset-2 hover:underline",
      "rounded-fg-xs p-fg-0-5 text-ink-faint hover:bg-paper-sunken hover:text-ink",
      "border-b border-rule",
      "flex w-full items-center justify-between px-fg-3 py-fg-1-5 text-left text-label font-medium uppercase tracking-wider text-ink-muted hover:bg-paper-sunken",
      "flex items-center gap-fg-1-5",
      "rounded-fg-pill bg-paper-sunken px-fg-1-5 py-fg-0-5 text-caption font-normal text-ink-muted",
      "text-ink-faint",
      "pb-2",
      "px-fg-3 py-fg-1 text-label italic text-ink-faint",
      "space-y-fg-0-5 px-fg-3",
      "ml-fg-1 text-label text-ink-faint underline hover:text-ink-muted",
      "border-t border-rule px-fg-3 py-fg-1-5",
      "text-label text-state-stale",
    ]) {
      if (stripped.includes(localSidebarChrome)) {
        violations.push(`${rel}: local filter-sidebar chrome ${localSidebarChrome}`);
      }
    }
    if (/\bfilterView\.editedWindow\s*===/.test(stripped)) {
      violations.push(`${rel}: local edited-window active-state projection`);
    }
    if (!/\bDASHBOARD_FILTER_SIDEBAR_PRESENTATION\b/.test(view)) {
      violations.push(`${viewRel}: missing dashboard filter-sidebar presentation`);
    }
    if (!/\bderiveFilterSidebarFacetListView\s*\(/.test(chrome)) {
      violations.push(`${chromeRel}: missing facet-list presentation derivation`);
    }
    if (
      !/\bexport\s+function\s+normalizeFilterSidebarFacetValues\s*\(\s*values:\s*unknown\s*\)/.test(
        chrome,
      )
    ) {
      violations.push(`${chromeRel}: missing facet presentation value normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeFilterSidebarFacetLimit\s*\(\s*max:\s*unknown\s*\)/.test(
        chrome,
      )
    ) {
      violations.push(`${chromeRel}: missing facet-list limit normalizer`);
    }
    if (
      !/\bderiveFilterSidebarFacetListView\s*\(\s*values:\s*unknown,\s*selected:\s*unknown,\s*max:\s*unknown,\s*showAll:\s*unknown,\s*loading:\s*unknown/.test(
        chrome,
      )
    ) {
      violations.push(`${chromeRel}: facet-list projection trusts typed inputs`);
    }
    if (
      !/\bderiveFilterSidebarFacetListView[\s\S]*\bnormalizeFilterSidebarFacetValues\s*\(\s*values\s*\)[\s\S]*\bnormalizeFilterSidebarFacetValues\s*\(\s*selected\s*\)[\s\S]*\bnormalizeFilterSidebarFacetLimit\s*\(\s*max\s*\)/.test(
        chrome,
      )
    ) {
      violations.push(`${chromeRel}: facet-list projection bypasses normalizers`);
    }
    if (!/\bderiveFilterSidebarMenuSections\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing stores filter-sidebar menu section seam`);
    }
    if (
      /\bfilterSidebar(?:DocTypeLabel|StatusDot|HealthDot|HealthLabel)\s*\(/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: app-layer filter-sidebar vocabulary presentation call`);
    }
    if (!/\bexport\s+function\s+deriveFilterSidebarMenuSections\b/.test(chrome)) {
      violations.push(`${chromeRel}: missing menu-section projection helper`);
    }
    for (const field of [
      "presentation.kindSectionLabel",
      "presentation.topicSectionLabel",
    ]) {
      const pattern = new RegExp(`\\b${field.replace(".", "\\.")}\\b`);
      if (!pattern.test(chrome)) {
        violations.push(`${chromeRel}: menu-section projection misses ${field}`);
      }
    }
    for (const helper of [
      "filterSidebarTopicOptions",
      "filterSidebarDocTypeLabel",
      "filterSidebarStatusDot",
      "filterSidebarHealthDot",
      "filterSidebarHealthLabel",
    ]) {
      if (!new RegExp(`\\bexport\\s+function\\s+${helper}\\b`).test(chrome)) {
        violations.push(`${chromeRel}: missing ${helper} helper`);
      }
    }
    if (
      !/\bfilterSidebarTopicOptions\s*\(\s*featureTags:\s*unknown,\s*topicSearch:\s*unknown/.test(
        chrome,
      ) ||
      !/\bfilterSidebarTopicOptions[\s\S]*\bnormalizeFilterSidebarFacetValues\s*\(\s*featureTags\s*\)/.test(
        chrome,
      )
    ) {
      violations.push(`${chromeRel}: topic projection trusts typed vocabulary`);
    }
    if (
      !/\bderiveFilterSidebarMenuSections[\s\S]*\bconst\s+docTypes\s*=\s*normalizeFilterSidebarFacetValues\s*\(\s*vocabulary\.docTypes\s*\)[\s\S]*\bconst\s+selectedDocTypes\s*=\s*normalizeFilterSidebarFacetValues\s*\(\s*filterView\.docTypes\s*\)/.test(
        chrome,
      )
    ) {
      violations.push(`${chromeRel}: menu-section projection bypasses facet normalizer`);
    }
    for (const internalProjection of [
      "filterSidebarDocTypeLabel",
      "filterSidebarTopicOptions",
      "filterSidebarStatusDot",
      "filterSidebarHealthDot",
      "filterSidebarHealthLabel",
    ]) {
      const projectionBody = chrome.match(
        /export function deriveFilterSidebarMenuSections[\s\S]*?export function filterSidebarDocTypeLabel/,
      )?.[0];
      if (
        !projectionBody ||
        !new RegExp(`\\b${internalProjection}\\b`).test(projectionBody)
      ) {
        violations.push(
          `${chromeRel}: menu-section projection does not use ${internalProjection}`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps right-rail pipeline artifact grouping behind the pipeline-status view", () => {
    const enrolled = ["app/right/StatusTab.tsx"];
    const violations: string[] = [];

    for (const rel of enrolled) {
      const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));

      if (/\bview\.artifacts\.filter\b/.test(stripped)) {
        violations.push(`${rel}: app-layer pipeline artifact grouping`);
      }
      if (/\.doc_type\s*===\s*["'](?:plan|adr)["']/.test(stripped)) {
        violations.push(`${rel}: app-layer pipeline artifact type split`);
      }
      if (/\bview\.artifacts\.map\b/.test(stripped)) {
        violations.push(`${rel}: app-layer pipeline artifact derived set`);
      }
      if (/\bconst\s+(?:plans|adrs|planIds|occupied)\b/.test(stripped)) {
        violations.push(`${rel}: local pipeline artifact projection`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps pipeline artifact normalization at the live adapter boundary", () => {
    const rel = "stores/server/liveAdapters.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const seam of [
      "normalizePipelineString",
      "normalizePipelineStringList",
      "normalizePipelinePhase",
      "adaptPipelineArtifact",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${seam} pipeline adapter seam`);
      }
    }
    if (!/from\s+["']\.\.\/nodeIds["']/.test(stripped)) {
      violations.push(`${rel}: pipeline adapter does not import node id normalizer`);
    }
    if (
      !/\bfunction\s+adaptPipelineArtifact\s*\(\s*value:\s*unknown\s*\):\s*PipelineArtifact\s*\|\s*null[\s\S]*\bconst\s+nodeId\s*=\s*normalizeNodeId\s*\(\s*value\.node_id\s*\)[\s\S]*\bif\s*\(\s*nodeId\s*===\s*null\s*\)\s*return\s+null/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: pipeline adapter fabricates malformed artifact ids`);
    }
    if (
      !/\bconst\s+phase\s*=\s*normalizePipelinePhase\s*\(\s*value\.phase\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: pipeline phase bypasses normalizer`);
    }
    if (
      !/\bfeature_tags:\s*normalizePipelineStringList\s*\(\s*value\.feature_tags\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: pipeline feature tags bypass normalizer`);
    }
    if (
      !/\bmap\s*\(\s*adaptPipelineArtifact\s*\)[\s\S]*\.filter\s*\(\s*\(\s*artifact\s*\):\s*artifact\s+is\s+PipelineArtifact\s*=>\s*artifact\s*!==\s*null\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: pipeline adapter does not drop malformed artifacts`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps history commit normalization at the live adapter boundary", () => {
    const rel = "stores/server/liveAdapters.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const seam of [
      "HISTORY_COMMITS_MAX_ITEMS",
      "HISTORY_COMMIT_NODE_IDS_CAP",
      "HISTORY_STRING_MAX_CHARS",
      "HISTORY_COMMIT_BODY_MAX_CHARS",
      "normalizeHistoryString",
      "normalizeHistoryBody",
      "adaptHistoryCommit",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${seam} history adapter seam`);
      }
    }
    if (!/from\s+["']\.\.\/nodeIds["']/.test(stripped)) {
      violations.push(`${rel}: history adapter does not import node id normalizer`);
    }
    if (
      !/\bfunction\s+normalizeHistoryString\s*\(\s*value:\s*unknown\s*\):\s*string\s*\|\s*null[\s\S]*value\.trim\s*\(\s*\)[\s\S]*trimmed\.length\s*<=\s*HISTORY_STRING_MAX_CHARS/.test(
        stripped,
      ) ||
      !/\bfunction\s+normalizeHistoryBody\s*\(\s*value:\s*unknown\s*\):\s*string[\s\S]*value\.length\s*<=\s*HISTORY_COMMIT_BODY_MAX_CHARS[\s\S]*value\.slice\s*\(\s*0\s*,\s*HISTORY_COMMIT_BODY_MAX_CHARS\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: history string payloads are unbounded`);
    }
    if (
      !/\bfunction\s+adaptHistoryCommit\s*\(\s*value:\s*unknown\s*\):\s*HistoryCommit\s*\|\s*null[\s\S]*\bconst\s+hash\s*=\s*normalizeHistoryString\s*\(\s*value\.hash\s*\)[\s\S]*\bif\s*\(\s*hash\s*===\s*null\s*\)\s*return\s+null/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: history adapter fabricates malformed hashes`);
    }
    if (
      !/\bconst\s+shortHash\s*=\s*normalizeHistoryString\s*\(\s*value\.short_hash\s*\)\s*\?\?\s*hash\.slice\s*\(\s*0\s*,\s*8\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: history short hash bypasses canonical fallback`);
    }
    if (
      !/\bnode_ids:\s*Array\.isArray\s*\(\s*value\.node_ids\s*\)[\s\S]*normalizeNodeIds\s*\(\s*value\.node_ids\s*,\s*HISTORY_COMMIT_NODE_IDS_CAP\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: history node ids bypass bounded normalizer`);
    }
    if (
      !/\bexport function adaptHistory[\s\S]*const\s+commits:\s*HistoryCommit\[\]\s*=\s*\[\][\s\S]*for\s*\(\s*const\s+row\s+of\s+body\.commits\s*\)[\s\S]*commits\.push\s*\(\s*commit\s*\)[\s\S]*commits\.length\s*>=\s*HISTORY_COMMITS_MAX_ITEMS[\s\S]*reason:\s*["']adapter commit ceiling["']/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: history commit accumulator is unbounded`);
    }
    if (
      !/\bnext_cursor:\s*normalizeHistoryString\s*\(\s*body\.next_cursor\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: history cursor bypasses normalizer`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps GitHub work-item normalization at the live adapter boundary", () => {
    const rel = "stores/server/liveAdapters.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const seam of [
      "GITHUB_WORK_ITEM_LABELS_CAP",
      "normalizeGitHubWorkItemNumber",
      "normalizeGitHubWorkItemString",
      "normalizeGitHubWorkItemNullableString",
      "normalizeGitHubWorkItemLabels",
      "normalizeGitHubWorkItemCount",
      "adaptPullRequest",
      "adaptIssue",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${seam} GitHub work-item seam`);
      }
    }
    if (
      !/\bfunction\s+normalizeGitHubWorkItemNumber\s*\(\s*value:\s*unknown\s*\):\s*number\s*\|\s*null[\s\S]*Number\.isSafeInteger\s*\(\s*value\s*\)[\s\S]*value\s*>\s*0/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: GitHub work-item numbers are not identity-normalized`);
    }
    if (
      !/\bfunction\s+normalizeGitHubWorkItemLabels\s*\(\s*value:\s*unknown\s*\):\s*string\[\][\s\S]*\bconst\s+normalized\s*=\s*normalizeGitHubWorkItemString\s*\(\s*label\s*\)[\s\S]*\bseen\.has\s*\(\s*normalized\s*\)[\s\S]*labels\.length\s*>=\s*GITHUB_WORK_ITEM_LABELS_CAP/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: GitHub label array bypasses bounded normalizer`);
    }
    for (const [fn, typeName] of [
      ["adaptPullRequest", "PullRequest"],
      ["adaptIssue", "Issue"],
    ] as const) {
      if (
        !new RegExp(
          `\\bfunction\\s+${fn}\\s*\\(\\s*value:\\s*unknown\\s*\\):\\s*${typeName}\\s*\\|\\s*null[\\s\\S]*\\bconst\\s+number\\s*=\\s*normalizeGitHubWorkItemNumber\\s*\\(\\s*value\\.number\\s*\\)[\\s\\S]*\\bif\\s*\\(\\s*number\\s*===\\s*null\\s*\\)\\s*return\\s+null`,
        ).test(stripped)
      ) {
        violations.push(`${rel}: ${fn} fabricates malformed work-item numbers`);
      }
    }
    if (
      !/\bchecks:\s*adaptPrChecks\s*\(\s*value\.checks\s*\)/.test(stripped) ||
      !/\btotal:\s*normalizeGitHubWorkItemCount\s*\(\s*value\.total\s*\)/.test(stripped)
    ) {
      violations.push(`${rel}: PR checks bypass finite count normalizer`);
    }
    if (
      !/\blabels:\s*normalizeGitHubWorkItemLabels\s*\(\s*value\.labels\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: issue labels bypass GitHub label normalizer`);
    }
    if (
      !/\breason:\s*normalizeGitHubWorkItemNullableString\s*\(\s*body\.reason\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: GitHub availability reason bypasses normalizer`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps plan-interior normalization at the live adapter boundary", () => {
    const rel = "stores/server/liveAdapters.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const seam of [
      "adaptInteriorStep",
      "adaptInteriorPhase",
      "adaptInteriorWave",
      "adaptPlanInterior",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${seam} plan-interior adapter seam`);
      }
    }
    for (const [fn, typeName, idField] of [
      ["adaptInteriorStep", "InteriorStep", "step"],
      ["adaptInteriorPhase", "InteriorPhase", "phase"],
      ["adaptInteriorWave", "InteriorWave", "wave"],
    ] as const) {
      if (
        !new RegExp(
          `\\bfunction\\s+${fn}\\s*\\(\\s*value:\\s*unknown\\s*\\):\\s*${typeName}\\s*\\|\\s*null[\\s\\S]*\\bconst\\s+nodeId\\s*=\\s*normalizeNodeId\\s*\\(\\s*value\\.node_id\\s*\\)[\\s\\S]*\\bif\\s*\\(\\s*nodeId\\s*===\\s*null\\s*\\|\\|\\s*id\\s*===\\s*undefined\\s*\\)\\s*return\\s+null`,
        ).test(stripped)
      ) {
        violations.push(`${rel}: ${idField} adapter fabricates malformed ids`);
      }
    }
    if (
      !/\badaptInteriorPhase[\s\S]*\.map\s*\(\s*adaptInteriorStep\s*\)[\s\S]*\.filter\s*\(\s*\(\s*step\s*\):\s*step\s+is\s+InteriorStep\s*=>\s*step\s*!==\s*null\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: phase adapter does not drop malformed steps`);
    }
    if (
      !/\badaptInteriorWave[\s\S]*\.map\s*\(\s*adaptInteriorPhase\s*\)[\s\S]*\.filter\s*\(\s*\(\s*phase\s*\):\s*phase\s+is\s+InteriorPhase\s*=>\s*phase\s*!==\s*null\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: wave adapter does not drop malformed phases`);
    }
    for (const [field, mapper, typeName] of [
      ["waves", "adaptInteriorWave", "InteriorWave"],
      ["phases", "adaptInteriorPhase", "InteriorPhase"],
      ["steps", "adaptInteriorStep", "InteriorStep"],
    ] as const) {
      if (
        !new RegExp(
          `${field}:\\s*Array\\.isArray\\(raw\\.${field}\\)[\\s\\S]*\\.map\\s*\\(\\s*${mapper}\\s*\\)[\\s\\S]*\\.filter\\s*\\(\\s*\\(\\s*\\w+\\s*\\):\\s*\\w+\\s+is\\s+${typeName}\\s*=>\\s*\\w+\\s*!==\\s*null\\s*\\)`,
        ).test(stripped)
      ) {
        violations.push(`${rel}: plan interior ${field} bypass malformed-row drop`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps right-rail pipeline state copy behind the pipeline-status view", () => {
    const enrolled = ["app/right/StatusTab.tsx"];
    const violations: string[] = [];

    for (const rel of enrolled) {
      const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));

      for (const localCopy of [
        "pipeline status unavailable",
        "reading in-flight work",
        "no work in flight on this branch",
        "no plans in flight on this branch",
        "the pipeline read is degraded",
        "work pipeline status",
        "in-flight pipeline work",
      ]) {
        if (stripped.includes(localCopy)) {
          violations.push(`${rel}: local pipeline state copy "${localCopy}"`);
        }
      }
      if (/\bview\.reasons\.structural\b/.test(stripped)) {
        violations.push(`${rel}: app-layer pipeline degraded reason formatting`);
      }
      if (rel.endsWith("WorkTab.tsx")) {
        const planRowStart = stripped.indexOf("function PlanRow");
        const planRowEnd = stripped.indexOf("interface AdrRowProps");
        const planRow =
          planRowStart >= 0 && planRowEnd > planRowStart
            ? stripped.slice(planRowStart, planRowEnd)
            : stripped;
        for (const helper of [
          "deriveWorkProgressRingView",
          "deriveWorkStatusPillView",
          "deriveWorkPipelineArcView",
          "deriveWorkPlanRowChrome",
          "WORK_ROVING_ATTR",
        ]) {
          if (!stripped.includes(helper)) {
            violations.push(`${rel}: missing work-tab chrome seam ${helper}`);
          }
        }
        if (/\bSTATUS_INK\b|\bPIPELINE_ARC\b|\bringGeometry\b/.test(stripped)) {
          violations.push(`${rel}: local work-tab chrome projection helper`);
        }
        if (/\bconst\s+on\s*=\s*occupied\.has\s*\(/.test(stripped)) {
          violations.push(`${rel}: local pipeline-arc occupied projection`);
        }
        for (const localPlanChrome of [
          "space-y-fg-0-5",
          "flex items-stretch gap-fg-0-5",
          "flex shrink-0 items-center rounded-fg-xs px-fg-0-5 text-ink-faint transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
          "flex min-w-0 flex-1 items-center gap-fg-1-5 rounded-fg-xs border border-rule px-fg-2 py-fg-1 text-left transition-colors duration-ui-fast ease-settle hover:border-rule-strong hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
          "mt-px flex items-center gap-fg-1-5 text-caption text-ink-faint",
          "pl-fg-4",
        ]) {
          if (planRow.includes(localPlanChrome)) {
            violations.push(`${rel}: local work plan row chrome "${localPlanChrome}"`);
          }
        }
        if (/\bconst\s+first(?:Plan|Adr)\b/.test(stripped)) {
          violations.push(`${rel}: local work roving tab-stop projection`);
        }
        if (/\bview\.(?:planRows|adrs)\s*\[\s*0\s*\]/.test(stripped)) {
          violations.push(`${rel}: app-layer first work row lookup`);
        }
        if (!/\bview\.workStatusTitle\b/.test(stripped)) {
          violations.push(`${rel}: missing work status title from pipeline view`);
        }
        if (!/\bview\.workStatusDetail\b/.test(stripped)) {
          violations.push(`${rel}: missing work status detail from pipeline view`);
        }
        if (!/\bview\.workSurfaceAriaLabel\b/.test(stripped)) {
          violations.push(`${rel}: missing work surface aria label from pipeline view`);
        }
        if (!/\bview\.workListAriaLabel\b/.test(stripped)) {
          violations.push(`${rel}: missing work list aria label from pipeline view`);
        }
        if (!/\bview\.workTabbablePlanId\b/.test(stripped)) {
          violations.push(
            `${rel}: missing work roving plan tab-stop from pipeline view`,
          );
        }
        if (!/\bview\.workTabbableAdrId\b/.test(stripped)) {
          violations.push(
            `${rel}: missing work roving ADR tab-stop from pipeline view`,
          );
        }
        for (const field of [
          "row.phaseLabel",
          "row.modifiedAt",
          "row.tierLabel",
          "row.tierAriaLabel",
          "row.showProgress",
          "row.progressDone",
          "row.progressTotal",
        ]) {
          if (!planRow.includes(field)) {
            violations.push(`${rel}: missing pipeline plan row projection ${field}`);
          }
        }
        if (
          /\bartifact\.progress\b|\bprogress\?\.total\b|\bprogress\?\.done\b/.test(
            planRow,
          )
        ) {
          violations.push(`${rel}: local work plan progress projection`);
        }
        if (/\bartifact\.tier\b|`tier \$\{artifact\.tier\}`/.test(planRow)) {
          violations.push(`${rel}: local work plan tier projection`);
        }
        if (/\bartifact\.dates\b|\brow\.artifact\.dates\b/.test(planRow)) {
          violations.push(`${rel}: local work plan freshness source projection`);
        }
        const adrRowStart = stripped.indexOf("function AdrRow");
        const adrRowEnd = stripped.indexOf("export function WorkTab");
        const adrRow =
          adrRowStart >= 0 && adrRowEnd > adrRowStart
            ? stripped.slice(adrRowStart, adrRowEnd)
            : stripped;
        if (!/\bview\.adrRows\.map\b/.test(stripped)) {
          violations.push(`${rel}: missing pipeline ADR row projection iteration`);
        }
        if (/\bview\.adrs\.map\b/.test(stripped)) {
          violations.push(`${rel}: app-layer ADR artifact row iteration`);
        }
        for (const field of [
          "row.nodeId",
          "row.titleLabel",
          "row.modifiedAt",
          "row.selectAriaLabel",
          "row.statusLabel",
          "row.featureLabel",
          "row.showStatusPlaceholder",
          "row.statusPlaceholderLabel",
          "row.rowClassName",
          "row.iconClassName",
          "row.bodyClassName",
          "row.headingClassName",
          "row.titleClassName",
          "row.statusPlaceholderClassName",
          "row.metaClassName",
        ]) {
          if (!adrRow.includes(field)) {
            violations.push(`${rel}: missing pipeline ADR row projection ${field}`);
          }
        }
        if (
          /\bartifact\.(?:title|stem|status|feature_tags|node_id)\b/.test(adrRow) ||
          /`ADR \$\{/.test(adrRow)
        ) {
          violations.push(`${rel}: local ADR row artifact projection`);
        }
        if (/\bartifact\.dates\b|\brow\.artifact\.dates\b/.test(adrRow)) {
          violations.push(`${rel}: local ADR row freshness source projection`);
        }
        for (const localAdrChrome of [
          "flex w-full items-center gap-fg-1-5 rounded-fg-xs border border-rule px-fg-2 py-fg-1 text-left transition-colors duration-ui-fast ease-settle hover:border-rule-strong hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
          "shrink-0 rounded-fg-pill border border-rule px-fg-1-5 py-px text-caption text-ink-faint",
          "status pending",
        ]) {
          if (adrRow.includes(localAdrChrome)) {
            violations.push(`${rel}: local ADR row chrome "${localAdrChrome}"`);
          }
        }
        for (const field of [
          "view.workSurfaceState",
          "view.showWorkDegraded",
          "view.showWorkLoading",
          "view.showWorkEmpty",
          "view.workStatusSectionClassName",
          "view.workListSectionClassName",
          "view.workLiveRegionClassName",
          "view.workStatusIconClassName",
          "view.workStatusTitleClassName",
          "view.workStatusDetailClassName",
          "view.workListClassName",
        ]) {
          if (!stripped.includes(field)) {
            violations.push(`${rel}: missing work surface projection ${field}`);
          }
        }
        if (/\bif\s*\(\s*view\.degraded\s*\)/.test(stripped)) {
          violations.push(`${rel}: local work degraded visibility branch`);
        }
        if (/\bif\s*\(\s*view\.loading\s*\)/.test(stripped)) {
          violations.push(`${rel}: local work loading visibility branch`);
        }
        if (/\bview\.count\s*={2,3}\s*0\b/.test(stripped)) {
          violations.push(`${rel}: local work empty visibility branch`);
        }
        for (const localClass of [
          "flex flex-col items-center gap-fg-2 px-fg-2 py-fg-6 text-center text-label text-ink-muted",
          "flex flex-col items-center gap-fg-2 px-fg-2 py-fg-6 text-center text-label text-ink-faint",
          "space-y-fg-2 text-body",
          "animate-pulse-live",
        ]) {
          if (stripped.includes(localClass)) {
            violations.push(`${rel}: local work surface class "${localClass}"`);
          }
        }
      }
      if (
        rel.endsWith("StatusTab.tsx") &&
        !/\bview\.openPlansStatusLabel\b/.test(stripped)
      ) {
        violations.push(`${rel}: missing open-plans status label from pipeline view`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps right-rail pipeline expansion behind the shared expansion seam", () => {
    const enrolled = ["app/right/StatusTab.tsx"];
    const violations: string[] = [];

    for (const rel of enrolled) {
      const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));

      for (const statement of importStatements(stripped)) {
        if (/\busePipelineExpansionStore\b/.test(statement)) {
          violations.push(`${rel}: raw pipeline expansion store access`);
        }
      }
      if (/\[\s*expanded(?:Ids|Plans)?\s*,\s*set[A-Z]/.test(stripped)) {
        violations.push(`${rel}: local pipeline expansion state`);
      }
      if (
        !/\busePipelineExpansion\s*\(\s*scope\s*,\s*asOf\s*,\s*view\.planIds\s*\)/.test(
          stripped,
        )
      ) {
        violations.push(`${rel}: missing shared pipeline expansion seam`);
      }
      if (!/\bderivePipelineExpansionRows\s*\(/.test(stripped)) {
        violations.push(`${rel}: missing pipeline expansion row projection seam`);
      }
      if (/\bexpanded\.has\s*\(/.test(stripped)) {
        violations.push(`${rel}: local pipeline expanded-row projection`);
      }
      if (
        /\busePlanInteriorView\s*\(\s*artifact\.node_id\s*,\s*scope\s*\)/.test(stripped)
      ) {
        violations.push(`${rel}: unbounded plan interior fetch while collapsed`);
      }
      if (
        !/\busePlanInteriorView\s*\(\s*expanded\s*\?\s*(?:artifact\.node_id|row\.nodeId)\s*:\s*null\s*,\s*scope\s*\)/.test(
          stripped,
        )
      ) {
        violations.push(`${rel}: missing expanded-gated plan interior read`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps pipeline expansion visual-state keys collision-resistant", () => {
    const rel = "stores/view/pipelineExpansion.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (
      !/\bnormalizedScope\s*===\s*null[\s\S]*\?\s*["']scope:null["']/.test(stripped)
    ) {
      violations.push(`${rel}: null scope lacks an explicit key sentinel`);
    }
    if (
      !/\bnormalizedAsOf\s*===\s*undefined[\s\S]*\?\s*["']playhead:live["']/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: live playhead lacks an explicit key sentinel`);
    }
    if (!/\bencodeURIComponent\s*\(\s*normalizedScope\s*\)/.test(stripped)) {
      violations.push(`${rel}: scoped pipeline key does not encode scope`);
    }
    if (
      !/\bencodeURIComponent\s*\(\s*String\s*\(\s*normalizedAsOf\s*\)\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: scoped pipeline key does not encode playhead`);
    }
    if (
      !/from\s+["']\.\/scopeIdentity["'][\s\S]*\bnormalizeViewStoreSessionString\b/.test(
        stripped,
      ) ||
      !/\bexport\s+const\s+normalizePipelineExpansionScope\s*=\s*normalizeViewStoreSessionString\b/.test(
        stripped,
      )
    ) {
      violations.push(
        `${rel}: pipeline expansion scope bypasses shared view scope normalizer`,
      );
    }
    if (
      !/\bexport\s+function\s+normalizePipelineExpansionAsOf\b[\s\S]*Number\.isFinite\s*\(\s*asOf\s*\)[\s\S]*asOf\.trim\s*\(\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(
        `${rel}: pipeline expansion playhead bypasses runtime normalizer`,
      );
    }
    if (
      !/const\s+normalizedScope\s*=\s*normalizePipelineExpansionScope\s*\(\s*scope\s*\)[\s\S]*const\s+normalizedAsOf\s*=\s*normalizePipelineExpansionAsOf\s*\(\s*asOf\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: pipeline expansion key bypasses normalized identity`);
    }
    if (
      !/scope:value:\$\{encodeURIComponent\s*\(\s*normalizedScope\s*\)\}/.test(stripped)
    ) {
      violations.push(`${rel}: real scopes lack a value-tagged key namespace`);
    }
    if (
      !/playhead:value:\$\{encodeURIComponent\s*\(\s*String\s*\(\s*normalizedAsOf\s*\)\s*\)\}/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: real playheads lack a value-tagged key namespace`);
    }
    if (
      /\$\{scope\s*\?\?\s*["']none["']\}::\$\{asOf\s*\?\?\s*["']live["']\}/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: pipeline key can collide with literal none/live values`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps pipeline expansion ids normalized at the store seam", () => {
    const rel = "stores/view/pipelineExpansion.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (
      !/\bimport\s+\{\s*normalizeNodeId\s*\}\s+from\s+["']\.\.\/nodeIds["']/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing shared node-id normalizer import`);
    }
    if (!/\bexport\s+function\s+normalizePipelineExpandedIds\b/.test(stripped)) {
      violations.push(`${rel}: missing bounded expanded-id normalizer`);
    }
    if (
      !/\bPIPELINE_EXPANSION_AS_OF_MAX_CHARS\b/.test(stripped) ||
      !/\bPIPELINE_EXPANSION_KEY_MAX_CHARS\b/.test(stripped)
    ) {
      violations.push(`${rel}: missing bounded pipeline expansion identity caps`);
    }
    if (!/\bexport\s+function\s+normalizePipelineExpansionKey\b/.test(stripped)) {
      violations.push(`${rel}: missing pipeline expansion key normalizer`);
    }
    if (
      !/\bnormalizePipelineExpansionKey\s*\(\s*value:\s*unknown\s*\)[\s\S]*\bconst\s+normalized\s*=\s*value\.trim\s*\(\s*\)[\s\S]*normalized\.length\s*<=\s*PIPELINE_EXPANSION_KEY_MAX_CHARS/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: pipeline expansion key is unbounded`);
    }
    if (
      !/\bnormalizePipelineExpansionAsOf\s*\(\s*[\s\S]*asOf:\s*unknown[\s\S]*\)[\s\S]*normalized\.length\s*<=\s*PIPELINE_EXPANSION_AS_OF_MAX_CHARS/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: pipeline expansion as-of identity is unbounded`);
    }
    if (
      !/\bpipelineExpansionKey\s*\(\s*scope:\s*unknown,\s*asOf\?:\s*unknown[\s\S]*\bkey\.length\s*<=\s*PIPELINE_EXPANSION_KEY_MAX_CHARS/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: derived pipeline expansion key is unbounded`);
    }
    if (!/\bArray\.isArray\s*\(\s*ids\s*\)/.test(stripped)) {
      violations.push(`${rel}: expanded-id normalizer assumes array input`);
    }
    for (const typedOnly of [
      "setKey: (key: string)",
      "toggle: (key: string, id: string)",
      "pruneVisible: (key: string, visibleIds: readonly string[])",
      "toggle: (id: string) => void",
    ]) {
      if (stripped.includes(typedOnly)) {
        violations.push(`${rel}: typed-only pipeline expansion seam ${typedOnly}`);
      }
    }
    if (
      !/\bsetKey:\s*\(key\)\s*=>[\s\S]*\bnormalizePipelineExpansionKey\s*\(\s*key\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: pipeline expansion setKey bypasses key normalizer`);
    }
    if (
      !/\bnormalizePipelineExpandedIds[\s\S]*\bnormalizeNodeId\s*\(\s*ids\[i\]\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: expanded-id normalizer bypasses node-id seam`);
    }
    if (
      !/\btoggle:\s*\(key,\s*id\)\s*=>[\s\S]*\bnormalizePipelineExpansionKey\s*\(\s*key\s*\)[\s\S]*\bnormalizeNodeId\s*\(\s*id\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: pipeline expansion toggle bypasses normalizers`);
    }
    if (
      !/\bpruneVisible:\s*\(key,\s*visibleIds\)\s*=>[\s\S]*\bnormalizePipelineExpansionKey\s*\(\s*key\s*\)[\s\S]*\bnormalizePipelineExpandedIds\s*\(\s*visibleIds\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: pipeline expansion prune bypasses normalizers`);
    }
    if (!/\bpipelineExpansionRowId[\s\S]*\bnormalizeNodeId\s*\(/.test(stripped)) {
      violations.push(`${rel}: pipeline row projection bypasses id normalizer`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps status-tab open-plan row presentation behind the pipeline view", () => {
    const rel = "app/right/StatusTab.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (
      !/\bderivePipelineExpansionRows\s*\(\s*view\.planRows\s*,\s*expanded\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing expansion-projected open-plan rows`);
    }
    if (!/\bplanRows\.map\b/.test(stripped)) {
      violations.push(`${rel}: missing projected open-plan row iteration`);
    }
    if (/\bview\.planRows\.map\b/.test(stripped)) {
      violations.push(`${rel}: app-layer open-plan expansion row mapping`);
    }
    if (/\bview\.plans\.map\b/.test(stripped)) {
      violations.push(`${rel}: app-layer open-plan row mapping`);
    }
    if (/\bview\.plans\s*\[\s*0\s*\]/.test(stripped)) {
      violations.push(`${rel}: app-layer first open-plan row lookup`);
    }
    if (/\bconst\s+title\s*=/.test(stripped)) {
      violations.push(`${rel}: local open-plan title projection`);
    }
    if (/Math\.round\s*\([^)]*\bdone\s*\/\s*total/.test(stripped)) {
      violations.push(`${rel}: local open-plan percent formatting`);
    }
    if (/`open plan\s+\$\{/.test(stripped)) {
      violations.push(`${rel}: local open-plan aria label`);
    }
    if (
      /\$\{expanded\s*\?\s*["']collapse["']\s*:\s*["']expand["']\}\s+steps/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local open-plan toggle label`);
    }
    for (const field of [
      "row.titleLabel",
      "row.tierLabel",
      "row.tierAriaLabel",
      "row.openAriaLabel",
      "row.showProgress",
      "row.progressDone",
      "row.progressTotal",
      "row.progressTextLabel",
      "row.progressLabel",
      "row.progressPercentLabel",
      "row.toggleLabel",
      "statusPlanClassName",
      "statusPlanSelectedValue",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing pipeline plan row field ${field}`);
      }
    }
    if (
      /expanded\s*\?\s*["']ring-1 ring-accent\/30/.test(stripped) ||
      /data-open-plan-selected=\{expanded\s*\?/.test(stripped)
    ) {
      violations.push(`${rel}: local open-plan expanded chrome projection`);
    }
    if (
      /\bartifact\.progress\b|\bprogress\?\.total\b|\bprogress\?\.done\b/.test(stripped)
    ) {
      violations.push(`${rel}: local open-plan progress projection`);
    }
    if (/\bartifact\.tier\b|`tier \$\{artifact\.tier\}`/.test(stripped)) {
      violations.push(`${rel}: local open-plan tier projection`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps plan step row presentation behind the plan-interior view", () => {
    const rel = "app/right/PlanStepTree.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (/\bstep\.exec_node_id\b/.test(stripped)) {
      violations.push(`${rel}: local plan-step target projection`);
    }
    if (/\bstep\.action\s*\?\?/.test(stripped)) {
      violations.push(`${rel}: local plan-step heading projection`);
    }
    if (/open exec record|no exec record/.test(stripped)) {
      violations.push(`${rel}: local plan-step aria copy`);
    }
    for (const localCopy of [
      "loading steps",
      "step tree pending",
      "no steps in this plan yet",
      "plan steps",
      "this plan exceeds the interior ceiling",
    ]) {
      if (stripped.includes(localCopy)) {
        violations.push(
          `${rel}: local plan-step-tree presentation copy "${localCopy}"`,
        );
      }
    }
    if (/\bPLAN_INTERIOR_SERVED\b/.test(stripped)) {
      violations.push(`${rel}: local plan-interior served gate`);
    }
    if (
      /\bview\.waves\.length\s*===\s*0\b/.test(stripped) ||
      /\bview\.phases\.length\s*===\s*0\b/.test(stripped) ||
      /\bview\.steps\.length\s*(?:===|>|<|!==)\s*\d+\b/.test(stripped)
    ) {
      violations.push(`${rel}: local plan-step-tree empty-state derivation`);
    }
    for (const field of [
      "step.targetNodeId",
      "step.selectable",
      "step.headingLabel",
      "step.rowAriaLabel",
      "step.rowClassName",
      "view.served",
      "view.empty",
      "view.hasUngroupedSteps",
      "view.loadingMessage",
      "view.placeholderMessage",
      "view.emptyMessage",
      "view.listAriaLabel",
      "view.truncatedMessage",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing plan-step row field ${field}`);
      }
    }
    if (
      /step\.selectable\s*\?\s*["']hover:bg-paper-sunken/.test(stripped) ||
      /["']cursor-default opacity-80["']/.test(stripped)
    ) {
      violations.push(`${rel}: local plan-step selectable chrome projection`);
    }
    if (
      stripped.includes(
        '"flex w-full items-center gap-fg-1-5 rounded-fg-xs px-fg-1 py-fg-0-5 text-left text-label transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
      )
    ) {
      violations.push(`${rel}: local plan-step row chrome class`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps the status location anchor behind a runtime stores projection", () => {
    const rel = "app/right/StatusTab.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const queriesRel = "stores/server/queries.ts";
    const queries = stripComments(readFileSync(join(SRC_ROOT, queriesRel), "utf8"));
    const violations: string[] = [];

    if (!/\buseLocationAnchor\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing stores-owned location anchor selector`);
    }
    if (
      /\bfunction\s+LocationStrip\s*\(\s*\{\s*scope\s*\}\s*:\s*\{\s*scope:\s*string\s*\|\s*null\s*\}/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: location strip exposes typed-only scope`);
    }
    if (
      !/\bfunction\s+LocationStrip\s*\(\s*\{\s*scope\s*\}\s*:\s*\{\s*scope:\s*unknown\s*\}/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: location strip lacks runtime scope seam`);
    }
    if (
      /\bderiveLocationAnchor\b|\buseWorkspaceMap\b|\buseGitStatus\b/.test(stripped)
    ) {
      violations.push(`${rel}: app-layer location anchor composition`);
    }
    if (/\brepositories\b|\bworktrees\b|\bis_default\b|\bgit\.git\b/.test(stripped)) {
      violations.push(`${rel}: app-layer location anchor state parsing`);
    }
    if (
      /\bderiveLocationAnchor\s*\(\s*scope:\s*string\s*\|\s*null/.test(queries) ||
      /\buseLocationAnchor\s*\(\s*scope:\s*string\s*\|\s*null/.test(queries)
    ) {
      violations.push(`${queriesRel}: location anchor exposes typed-only scope`);
    }
    if (
      !/\bderiveLocationAnchor\s*\(\s*scope:\s*unknown[\s\S]*\bconst\s+normalizedScope\s*=\s*normalizeGraphSliceScope\s*\(\s*scope\s*\)[\s\S]*\bw\.path\s*===\s*normalizedScope[\s\S]*\bw\.id\s*===\s*normalizedScope[\s\S]*path:\s*normalizedScope/.test(
        queries,
      )
    ) {
      violations.push(`${queriesRel}: location anchor bypasses scope normalizer`);
    }
    if (!/\buseLocationAnchor\s*\(\s*scope:\s*unknown\s*\)/.test(queries)) {
      violations.push(`${queriesRel}: location hook lacks runtime scope seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps recent-commit row projection behind the history view", () => {
    const rel = "app/right/StatusTab.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const queriesRel = "stores/server/queries.ts";
    const queries = stripComments(readFileSync(join(SRC_ROOT, queriesRel), "utf8"));
    const violations: string[] = [];

    if (/\bview\.commits\.slice\b/.test(stripped)) {
      violations.push(`${rel}: app-layer recent commit row limit`);
    }
    if (/\bview\.commits\.map\b/.test(stripped)) {
      violations.push(`${rel}: app-layer recent commit row mapping`);
    }
    if (/\bview\.commits\.length\b/.test(stripped)) {
      violations.push(`${rel}: app-layer recent commit emptiness read`);
    }
    if (/\bcommit\.node_ids\b/.test(stripped)) {
      violations.push(`${rel}: app-layer raw commit node-id read`);
    }
    if (/\bnode_ids\.filter\b/.test(stripped)) {
      violations.push(`${rel}: app-layer commit selectable-target filtering`);
    }
    if (/startsWith\s*\(\s*["']commit:/.test(stripped)) {
      violations.push(`${rel}: app-layer commit node-id exclusion`);
    }
    if (/`commit:\$\{commit\.hash\}`/.test(stripped)) {
      violations.push(`${rel}: app-layer commit event-id construction`);
    }
    if (/\bRECENT_COMMITS\b/.test(stripped)) {
      violations.push(`${rel}: app-layer recent commit limit constant`);
    }
    if (/\bcommit\.ts\b/.test(stripped)) {
      violations.push(`${rel}: app-layer recent commit timestamp derivation`);
    }
    if (/\brelative(?:Ts|Age)\b/.test(stripped)) {
      violations.push(`${rel}: app-layer recent commit age formatter`);
    }
    if (/\bnew\s+Date\s*\(\s*commit\./.test(stripped)) {
      violations.push(`${rel}: app-layer recent commit date parsing`);
    }
    if (
      !/\bderiveRecentCommitChromeRows\s*\(\s*view\.recentCommitRows\b/.test(stripped)
    ) {
      violations.push(`${rel}: missing stores-derived recent commit chrome rows`);
    }
    if (!/\bchromeRows\.map\b/.test(stripped)) {
      violations.push(`${rel}: missing chrome-projected recent commit row iteration`);
    }
    if (!/\bview\.canShowMore\b/.test(stripped)) {
      violations.push(`${rel}: missing stores-derived recent commit paging state`);
    }
    for (const field of [
      "chromeRow.rootClassName",
      "chromeRow.headerClassName",
      "chromeRow.toggleClassName",
      "chromeRow.rowButtonClassName",
      "chromeRow.shortHashClassName",
      "chromeRow.subjectClassName",
      "chromeRow.ageClassName",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing recent-commit chrome field ${field}`);
      }
    }
    for (const field of [
      "view.showLoading",
      "view.showUnavailable",
      "view.showEmpty",
      "view.listRootClassName",
      "view.listClassName",
      "view.loadingClassName",
      "view.unavailableClassName",
      "view.emptyClassName",
      "view.commitBodyClassName",
      "view.showMoreButtonClassName",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing recent-history presentation field ${field}`);
      }
    }
    const recentCommitsStart = stripped.indexOf("function RecentCommitsBody");
    const recentCommitsEnd = stripped.indexOf("export function StatusTab");
    const recentCommits =
      recentCommitsStart >= 0 && recentCommitsEnd > recentCommitsStart
        ? stripped.slice(recentCommitsStart, recentCommitsEnd)
        : stripped;
    for (const localBranch of [
      "\\bif\\s*\\(\\s*view\\.degraded\\s*\\|\\|\\s*view\\.errored\\s*\\)",
      "\\bif\\s*\\(\\s*view\\.loading\\s*\\)",
      "\\bview\\.recentCommitRows\\.length\\s*===\\s*0",
    ]) {
      if (new RegExp(localBranch).test(recentCommits)) {
        violations.push(`${rel}: local recent-history visibility branch`);
      }
    }
    for (const localClass of [
      "text-label text-ink-muted",
      "animate-pulse-live text-label text-ink-faint motion-reduce:animate-none",
      "text-label text-ink-faint",
      "space-y-fg-0-5",
      "flex items-center gap-fg-1-5 rounded-fg-xs px-fg-1 py-fg-1",
      "flex shrink-0 items-center rounded-fg-xs text-ink-faint transition-colors duration-ui-fast hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      "flex min-w-0 flex-1 items-center gap-fg-1-5 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      "shrink-0 font-mono text-meta text-accent-text",
      "min-w-0 flex-1 truncate text-label text-ink-muted",
      "shrink-0 text-meta text-ink-faint",
      "ml-fg-5 mt-fg-0-5 whitespace-pre-wrap rounded-fg-xs border border-rule bg-paper-raised px-fg-2 py-fg-1-5 text-label text-ink-muted",
      "w-full rounded-fg-xs px-fg-2 py-fg-1 text-center text-label text-ink-muted transition-colors duration-ui-fast hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
    ]) {
      if (
        recentCommits.includes(`"${localClass}"`) ||
        recentCommits.includes(`'${localClass}'`)
      ) {
        violations.push(`${rel}: local recent-history chrome "${localClass}"`);
      }
    }
    if (
      !/\bexport\s+function\s+normalizeHistoryLimit\b/.test(queries) ||
      !/\bexport\s+function\s+normalizeHistoryRequestIdentity\b[\s\S]*\bnormalizeGraphSliceScope\s*\(\s*scope\s*\)[\s\S]*\bnormalizeHistoryLimit\s*\(\s*limit\s*\)/.test(
        queries,
      )
    ) {
      violations.push(`${queriesRel}: missing shared history limit normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeHistoryCommitForView\b/.test(queries) ||
      !/\bexport\s+function\s+normalizeHistoryCommitsForView\b[\s\S]*\bnormalizeHistoryCommitForView\b/.test(
        queries,
      )
    ) {
      violations.push(`${queriesRel}: missing shared history commit row normalizer`);
    }
    if (
      !/\bexport\s+function\s+deriveHistoryView\b[\s\S]*\bnormalizeHistoryCommitsForView\s*\(\s*data\?\.commits\s*\)/.test(
        queries,
      )
    ) {
      violations.push(`${queriesRel}: history view derives from raw commit rows`);
    }
    if (
      !/\bexport\s+function\s+useNodeHistory\b[\s\S]*\bconst\s+request\s*=\s*normalizeHistoryRequestIdentity\s*\(\s*scope\s*,\s*limit\s*\)[\s\S]*\bengineKeys\.history\s*\(\s*request\.scope\s*\?\?\s*["']["']\s*,\s*request\.limit\s*\)[\s\S]*\bengineClient\.history\s*\(\s*\{\s*scope:\s*request\.scope!\s*,\s*limit:\s*request\.limit\s*\}/.test(
        queries,
      )
    ) {
      violations.push(
        `${queriesRel}: history query key/wire bypasses normalized limit`,
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps status GitHub and history state presentation behind stores views", () => {
    const rel = "app/right/StatusTab.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const queriesRel = "stores/server/queries.ts";
    const queries = stripComments(readFileSync(join(SRC_ROOT, queriesRel), "utf8"));
    const violations: string[] = [];

    for (const bodyName of [
      "OpenPlansBody",
      "OpenPrsBody",
      "RecentPrsBody",
      "OpenIssuesBody",
      "RecentCommitsBody",
    ]) {
      if (
        new RegExp(
          `\\bfunction\\s+${bodyName}\\s*\\(\\s*\\{\\s*scope\\s*\\}\\s*:\\s*\\{\\s*scope:\\s*string\\s*\\|\\s*null\\s*\\}`,
        ).test(stripped)
      ) {
        violations.push(`${rel}: ${bodyName} exposes typed-only scope`);
      }
      if (
        !new RegExp(
          `\\bfunction\\s+${bodyName}\\s*\\(\\s*\\{\\s*scope\\s*\\}\\s*:\\s*\\{\\s*scope:\\s*unknown\\s*\\}`,
        ).test(stripped)
      ) {
        violations.push(`${rel}: ${bodyName} lacks runtime scope seam`);
      }
    }

    for (const localCopy of [
      "reading open PRs...",
      "reading open PRs…",
      "reading recent PRs...",
      "reading recent PRs…",
      "reading open issues...",
      "reading open issues…",
      "no open pull requests",
      "no recently-merged pull requests",
      "no open issues",
      "pull requests unavailable",
      "issues unavailable",
      "recent history unavailable",
      "reading recent commits...",
      "reading recent commits…",
      "no commits yet on this branch.",
      "Show more",
      "checks pending",
      "Open plans",
      "Open PRs",
      "Open issues",
      "Recent PRs",
      "Recent commits",
    ]) {
      if (stripped.includes(`"${localCopy}"`) || stripped.includes(`'${localCopy}'`)) {
        violations.push(`${rel}: local status presentation copy "${localCopy}"`);
      }
    }
    if (!/\bderiveStatusTabSectionsView\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing status section presentation seam`);
    }
    for (const section of [
      "sections.openPlans",
      "sections.openPrs",
      "sections.openIssues",
      "sections.recentPrs",
      "sections.recentCommits",
    ]) {
      if (!new RegExp(`\\b${section.replace(".", "\\.")}\\.title\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${section} title`);
      }
    }
    if (/\bpr\.is_draft\s*\?/.test(stripped)) {
      violations.push(`${rel}: local PR draft label projection`);
    }
    if (/\bpr\.checks\b|\bfailing\s*>\s*0|\bpassed\s*===\s*total\b/.test(stripped)) {
      violations.push(`${rel}: local PR checks label projection`);
    }
    if (/\brow\.checksTone\s*===\s*["'](?:active|broken|faint)["']/.test(stripped)) {
      violations.push(`${rel}: local PR checks tone class projection`);
    }
    if (/\brow\.iconTone\s*===\s*["'](?:accent|muted|faint)["']/.test(stripped)) {
      violations.push(`${rel}: local PR icon tone class projection`);
    }
    if (/\bissue\.labels\.slice\s*\(/.test(stripped)) {
      violations.push(`${rel}: local issue label cap projection`);
    }
    const githubBodiesStart = stripped.indexOf("function OpenPrsBody");
    const githubBodiesEnd = stripped.indexOf("function IssueRow");
    const githubBodies =
      githubBodiesStart >= 0 && githubBodiesEnd > githubBodiesStart
        ? stripped.slice(githubBodiesStart, githubBodiesEnd)
        : stripped;
    for (const field of [
      "view.loadingLabel",
      "view.emptyLabel",
      "view.unavailableLabel",
      "view.rows",
      "view.showLoading",
      "view.showUnavailable",
      "view.showEmpty",
      "view.listClassName",
      "view.loadingClassName",
      "view.unavailableClassName",
      "view.emptyClassName",
      "view.showMoreLabel",
    ]) {
      if (!new RegExp(`\\b${field.replace(".", "\\.")}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${field} stores presentation field`);
      }
    }
    for (const localBranch of [
      "\\bif\\s*\\(\\s*view\\.loading\\s*\\)",
      "\\bif\\s*\\(\\s*!\\s*view\\.available\\s*\\)",
      "\\bview\\.(?:prs|issues)\\.length\\s*===\\s*0",
    ]) {
      if (new RegExp(localBranch).test(githubBodies)) {
        violations.push(`${rel}: local GitHub section visibility branch`);
      }
    }
    for (const localClass of [
      "animate-pulse-live text-label text-ink-faint motion-reduce:animate-none",
      "text-label text-ink-faint",
      "space-y-fg-0-5",
    ]) {
      if (
        githubBodies.includes(`"${localClass}"`) ||
        githubBodies.includes(`'${localClass}'`)
      ) {
        violations.push(`${rel}: local GitHub section chrome "${localClass}"`);
      }
    }
    if (!/\brow\.stateLabel\b/.test(stripped)) {
      violations.push(`${rel}: missing PR row state label`);
    }
    if (!/\brow\.checksLabel\b/.test(stripped)) {
      violations.push(`${rel}: missing PR row checks label`);
    }
    if (!/\brow\.checksToneClass\b/.test(stripped)) {
      violations.push(`${rel}: missing PR row checks tone class`);
    }
    if (!/\brow\.iconToneClass\b/.test(stripped)) {
      violations.push(`${rel}: missing PR row icon tone class`);
    }
    if (!/\brow\.labels\b/.test(stripped)) {
      violations.push(`${rel}: missing issue row label projection`);
    }

    if (!/\bfunction deriveGitHubWorkItemAvailability\b/.test(queries)) {
      violations.push(`${queriesRel}: missing shared GitHub availability helper`);
    }
    for (const [name, pattern] of [
      [
        "derivePRsView",
        /export function derivePRsView[\s\S]*?export function deriveIssuesView/,
      ],
      [
        "deriveIssuesView",
        /export function deriveIssuesView[\s\S]*?function useNodePrs/,
      ],
    ] as const) {
      const body = queries.match(pattern)?.[0] ?? "";
      if (!/\bderiveGitHubWorkItemAvailability\s*\(/.test(body)) {
        violations.push(`${queriesRel}: ${name} bypasses shared GitHub availability`);
      }
      for (const localState of [
        /\bconst\s+available\s*=\s*!\s*loading\s*&&\s*!\s*errored\s*&&\s*data\?\.available\s*===\s*true/,
        /\bconst\s+showUnavailable\s*=\s*!\s*showLoading\s*&&\s*!\s*available/,
        /\bconst\s+showEmpty\s*=\s*available\s*&&\s*\w+\.length\s*===\s*0/,
        /\bconst\s+showList\s*=\s*available\s*&&\s*\w+\.length\s*>\s*0/,
      ]) {
        if (localState.test(body)) {
          violations.push(
            `${queriesRel}: ${name} owns local GitHub availability state`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps right-rail chrome off left-rail presentation surfaces", () => {
    const root = join(SRC_ROOT, "app/right");
    const violations: string[] = [];

    for (const file of sourceFiles(root)) {
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");
      const stripped = stripComments(readFileSync(file, "utf8"));
      for (const statement of importStatements(stripped)) {
        const normalized = statement.replaceAll("\\", "/");
        if (
          /from\s+["']\.\.\/left\/(?:VaultBrowser|vaultRowPresentation)["']/.test(
            normalized,
          )
        ) {
          violations.push(`${rel}: right rail imports left-rail presentation surface`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps right-rail feature surfaces from importing each other as helper owners", () => {
    const pairs = [
      ["app/right/StatusTab.tsx", "WorkTab"],
      ["app/right/ChangesOverview.tsx", "StatusTab"],
    ] as const;
    const violations: string[] = [];

    for (const [rel, forbidden] of pairs) {
      const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
      for (const statement of importStatements(stripped)) {
        if (new RegExp(`from\\s+["']\\./${forbidden}["']`).test(statement)) {
          violations.push(`${rel}: imports ${forbidden} instead of a neutral seam`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps changed-files git output normalization at the stores parser boundary", () => {
    const rel = "stores/server/liveAdapters.ts";
    const changesRel = "app/right/ChangesOverview.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const changes = stripComments(readFileSync(join(SRC_ROOT, changesRel), "utf8"));
    const violations: string[] = [];

    for (const seam of [
      "GIT_CHANGED_FILES_MAX_ROWS",
      "GIT_PATH_MAX_CHARS",
      "GIT_DIFF_MAX_HUNKS",
      "GIT_DIFF_MAX_LINES",
      "GIT_DIFF_LINE_MAX_CHARS",
      "normalizeGitPath",
      "isPorcelainCode",
      "normalizeGitNumstatCount",
      "normalizeGitDiffStatus",
      "parseGitStatus",
      "parseGitNumstat",
      "parseUnifiedDiff",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${seam} git parser seam`);
      }
    }
    if (
      !/\bfunction\s+normalizeGitPath\s*\(\s*value:\s*string\s*\):\s*string\s*\|\s*null[\s\S]*value\.trim\s*\(\s*\)[\s\S]*normalized\.length\s*<=\s*GIT_PATH_MAX_CHARS/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: git path normalizer is unbounded`);
    }
    if (
      !/\bexport\s+function\s+parseGitStatus\s*\(\s*output:\s*string\s*\):\s*ChangedFile\[\][\s\S]*raw\.trim\s*\(\s*\)\.length\s*===\s*0[\s\S]*raw\.charAt\s*\(\s*2\s*\)\s*!==\s*["'] ["'][\s\S]*!isPorcelainCode\s*\(\s*code\s*\)[\s\S]*const\s+normalizedPath\s*=\s*normalizeGitPath\s*\(\s*path\s*\)[\s\S]*normalizedPath\s*===\s*null/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: porcelain parser accepts malformed changed-file rows`);
    }
    if (
      !/\bparseGitStatus[\s\S]*entries\.length\s*>=\s*GIT_CHANGED_FILES_MAX_ROWS/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: porcelain parser changed-file accumulator is unbounded`);
    }
    if (
      !/\bfunction\s+normalizeGitNumstatCount\s*\(\s*value:\s*string\s*\):\s*number\s*\|\s*null[\s\S]*\/\^\\d\+\$\/\.test\s*\(\s*value\s*\)[\s\S]*Number\.isSafeInteger\s*\(\s*parsed\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: numstat count normalizer accepts unsafe counts`);
    }
    if (
      !/\bexport\s+function\s+parseGitNumstat\s*\(\s*output:\s*string[\s\S]*const\s+normalizedPath\s*=\s*normalizeGitPath\s*\(\s*path\s*\)[\s\S]*addsStr\s*!==\s*["']-["']\s*&&\s*adds\s*===\s*null[\s\S]*continue/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: numstat parser accepts malformed tally rows`);
    }
    if (
      !/\bparseGitNumstat[\s\S]*tallies\.size\s*>=\s*GIT_CHANGED_FILES_MAX_ROWS/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: numstat parser tally accumulator is unbounded`);
    }
    if (
      !/\bexport\s+function\s+normalizeGitDiffStatus\s*\(\s*status:\s*unknown\s*\):\s*string\s*\|\s*undefined[\s\S]*typeof\s+status\s*!==\s*["']string["'][\s\S]*status\.trim\s*\(\s*\)\.toUpperCase\s*\(\s*\)[\s\S]*GIT_DIFF_STATUS_LETTERS\.has\s*\(\s*normalized\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: diff status parser trusts typed status`);
    }
    if (
      !/\bexport\s+function\s+parseUnifiedDiff\s*\([\s\S]*status\?:\s*unknown[\s\S]*const\s+normalizedStatus\s*=\s*normalizeGitDiffStatus\s*\(\s*status\s*\)[\s\S]*normalizedStatus\s*===\s*undefined\s*\?\s*\{\}\s*:\s*\{\s*status:\s*normalizedStatus\s*\}/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: unified diff parser writes raw status`);
    }
    if (
      !/\bfunction\s+normalizeGitDiffLineText\s*\(\s*text:\s*string\s*\)[\s\S]*text\.length\s*<=\s*GIT_DIFF_LINE_MAX_CHARS[\s\S]*text\.slice\s*\(\s*0\s*,\s*GIT_DIFF_LINE_MAX_CHARS\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: unified diff line text is unbounded`);
    }
    if (
      !/\bparseUnifiedDiff[\s\S]*const\s+normalizedPath\s*=\s*normalizeGitPath\s*\(\s*path\s*\)\s*\?\?\s*["']["'][\s\S]*const\s+totalHunks\s*=[\s\S]*HUNK_HEADER_RE\.test\s*\(\s*line\s*\)[\s\S]*hunks\.length\s*>=\s*GIT_DIFF_MAX_HUNKS[\s\S]*returnedLines\s*>=\s*GIT_DIFF_MAX_LINES[\s\S]*truncated:\s*\{[\s\S]*total_hunks:\s*totalHunks[\s\S]*returned_hunks:\s*hunks\.length[\s\S]*reason:\s*truncatedReason/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: unified diff parser accumulator is unbounded`);
    }
    if (/\bparseGit(?:Status|Numstat|UnifiedDiff)\b/.test(changes)) {
      violations.push(`${changesRel}: changes overview imports git parser`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps changes overview state composition behind the stores overview view", () => {
    const rel = "app/right/ChangesOverview.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseGitStatus\b/.test(statement) || /\buseChangedFiles\b/.test(statement)) {
        violations.push(`${rel}: raw git/changed-files overview subscription`);
      }
      if (/\bEngineEvent\b/.test(statement)) {
        violations.push(`${rel}: app-layer engine event presentation parsing`);
      }
    }
    if (/\bconst\s+(?:files|docs|hasChanges|gitView|changed)\b/.test(stripped)) {
      violations.push(`${rel}: local changes overview projection`);
    }
    if (/\bif\s*\(\s*!\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: local changes overview no-scope projection`);
    }
    for (const rowName of ["ChangedFileRow", "ChangedDocRow"]) {
      if (
        new RegExp(
          `\\bfunction\\s+${rowName}\\s*\\([\\s\\S]*?scope:\\s*string\\s*\\|\\s*null`,
        ).test(stripped)
      ) {
        violations.push(`${rel}: ${rowName} exposes typed-only scope`);
      }
      if (
        !new RegExp(`\\bfunction\\s+${rowName}\\s*\\([\\s\\S]*?scope:\\s*unknown`).test(
          stripped,
        )
      ) {
        violations.push(`${rel}: ${rowName} lacks runtime scope seam`);
      }
    }
    if (/\bchanges\.(?:files|documents)\.length\s*>\s*0\b/.test(stripped)) {
      violations.push(`${rel}: local changes overview section visibility`);
    }
    for (const localCopy of [
      "no scope",
      "pick a worktree first",
      "reading changes",
      "repository state unavailable",
      "changes unavailable",
      "working tree clean",
      "Changed files",
      "Changed documents",
      "changed files",
      "changed documents",
    ]) {
      if (stripped.includes(localCopy)) {
        violations.push(`${rel}: local changes overview state copy "${localCopy}"`);
      }
    }
    if (
      /aria-label=\{`\$\{file\.(?:adds|dels)\}\s+(?:added|removed)`\}/.test(stripped)
    ) {
      violations.push(`${rel}: local changed-file numstat aria label`);
    }
    if (/\bfileDotColor\b/.test(stripped)) {
      violations.push(`${rel}: local changed-file dot color helper`);
    }
    if (/\bfile\.group\b/.test(stripped)) {
      violations.push(`${rel}: local changed-file group presentation read`);
    }
    if (!/\bfile\.dotColor\b/.test(stripped)) {
      violations.push(`${rel}: missing stores-owned changed-file dot color`);
    }
    for (const localRowChrome of [
      "flex h-[30px] w-full items-center gap-fg-2 rounded-fg-md border border-rule bg-paper px-fg-2 text-left transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      "size-2 shrink-0 rounded-full",
      "min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink",
      "shrink-0 text-[11px] text-diff-add",
      "shrink-0 text-[11px] text-diff-remove",
      "min-w-0 flex-1 truncate text-[12.5px] text-ink",
      "shrink-0 text-[13px] text-ink-faint",
    ]) {
      if (stripped.includes(localRowChrome)) {
        violations.push(`${rel}: local changes row chrome "${localRowChrome}"`);
      }
    }
    for (const field of [
      "rowClassName",
      "dotClassName",
      "basenameClassName",
      "addsClassName",
      "delsClassName",
      "openArrowClassName",
      "fallbackDotClassName",
      "titleClassName",
    ]) {
      if (!new RegExp(`\\bfile\\.${field}\\b`).test(stripped)) {
        violations.push(`${rel}: missing stores-owned changed-row ${field}`);
      }
    }
    if (/file\{\s*changes\.files\.length\s*===\s*1/.test(stripped)) {
      violations.push(`${rel}: local changed-file summary pluralization`);
    }
    if (/document\{\s*changes\.documents\.length\s*===\s*1/.test(stripped)) {
      violations.push(`${rel}: local changed-document summary pluralization`);
    }
    for (const field of [
      "summaryLabels",
      "noScope",
      "hasFiles",
      "hasDocuments",
      "loadingLabel",
      "degradedLabel",
      "errorTitle",
      "retryLabel",
      "noScopeLabel",
      "filesSectionLabel",
      "filesListAriaLabel",
      "documentsSectionLabel",
      "documentsListAriaLabel",
      "cleanLabel",
      "noScopeClassName",
      "rootClassName",
      "summaryClassName",
      "summaryPrimaryClassName",
      "summaryDividerClassName",
      "summaryAdditionsClassName",
      "summaryDeletionsClassName",
      "loadingClassName",
      "degradedClassName",
      "errorRootClassName",
      "errorTitleClassName",
      "retryButtonClassName",
      "sectionLabelClassName",
      "listClassName",
      "cleanClassName",
    ]) {
      if (!new RegExp(`\\bchanges\\.${field}\\b`).test(stripped)) {
        violations.push(`${rel}: missing stores-owned ${field}`);
      }
    }
    for (const localChrome of [
      "space-y-fg-3 text-label",
      "flex flex-wrap items-center gap-fg-1-5",
      "animate-pulse-live text-label text-ink-faint motion-reduce:animate-none",
      "rounded-fg-md bg-paper-sunken px-fg-2 py-fg-1 text-label text-ink-muted",
      "flex items-center gap-fg-2",
      "flex-1 text-label text-state-broken",
      "rounded-fg-xs text-caption text-ink-faint underline-offset-2 hover:text-ink-muted hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
      "space-y-fg-1",
    ]) {
      if (stripped.includes(localChrome)) {
        violations.push(`${rel}: local changes overview chrome "${localChrome}"`);
      }
    }
    if (
      /\b(?:gitView|changed)\.(?:loading|degraded|errored|summary|codeFiles|documents)\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: app-layer changes overview state composition`);
    }
    if (/\bdocNodeId\s*\(|\bvaultDocType\s*\(/.test(stripped)) {
      violations.push(`${rel}: local changed-document identity projection`);
    }
    if (/\bdocDisplayTitle\b|\bdocTypeCategory\b/.test(stripped)) {
      violations.push(`${rel}: local changed-document presentation projection`);
    }
    if (/`code:\$\{[^}]*file\.path[^}]*\}`/.test(stripped)) {
      violations.push(`${rel}: local changed-file node id projection`);
    }
    if (
      /\b(?:KIND_MARK|eventMark|eventLabel|isVaultPath)\b/.test(stripped) ||
      /\bfunction\s+basename\b|\bexport\s+function\s+basename\b/.test(stripped)
    ) {
      violations.push(`${rel}: stale app-owned changes/event helper projection`);
    }
    if (
      /\.split\s*\(\s*\/\[\^?/.test(stripped) ||
      /\.startsWith\s*\(\s*["']\.vault\//.test(stripped)
    ) {
      violations.push(`${rel}: local path classifier/parser`);
    }
    if (!/\buseChangesOverview\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing stores-owned changes overview view`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps the diff body as a pure parsed-git projection", () => {
    const rel = "app/right/DiffView.tsx";
    const queriesRel = "stores/server/queries.ts";
    const queries = stripComments(readFileSync(join(SRC_ROOT, queriesRel), "utf8"));
    const violations: string[] = [];
    if (!existsSync(join(SRC_ROOT, rel))) {
      const changesRel = "app/right/ChangesOverview.tsx";
      const changes = stripComments(readFileSync(join(SRC_ROOT, changesRel), "utf8"));
      if (/\b(?:useGitFileDiff|useGitHistoricalFileDiff)\b/.test(changes)) {
        violations.push(`${changesRel}: changes overview owns diff-body reads`);
      }
      if (!/\bexport function normalizeGitDiffRequest\b/.test(queries)) {
        violations.push(`${queriesRel}: missing shared git diff argument normalizer`);
      }
      if (!/\bfunction canReadGitFileDiff\b/.test(queries)) {
        violations.push(`${queriesRel}: missing normalized live git diff read gate`);
      }
      if (!/\bfunction canReadGitHistoricalFileDiff\b/.test(queries)) {
        violations.push(
          `${queriesRel}: missing normalized historical git diff read gate`,
        );
      }
      expect(violations).toEqual([]);
      return;
    }
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));

    for (const statement of importStatements(stripped)) {
      if (
        /\b(?:useGitFileDiff|useGitHistoricalFileDiff|useGitStatus)\b/.test(statement)
      ) {
        violations.push(`${rel}: diff renderer imports git data selector`);
      }
      if (/\b(?:useQuery|useQueryClient)\b/.test(statement)) {
        violations.push(`${rel}: diff renderer owns query state`);
      }
      if (/\bengineClient\b|\bengineKeys\b/.test(statement)) {
        violations.push(`${rel}: diff renderer imports wire client/key`);
      }
      if (/\bparseGit(?:Status|Numstat|UnifiedDiff)\b/.test(statement)) {
        violations.push(`${rel}: diff renderer imports git parser`);
      }
    }
    if (
      /\b(?:useGitFileDiff|useGitHistoricalFileDiff|useGitStatus|useQuery|useQueryClient)\s*\(/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: diff renderer owns git/query subscription`);
    }
    if (
      /\b(?:engineClient|engineKeys)\b|parseGit(?:Status|Numstat|UnifiedDiff)\s*\(/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: diff renderer owns git wire/parsing logic`);
    }
    if (!/\bdiff\s*:\s*GitFileDiff\b/.test(stripped)) {
      violations.push(`${rel}: missing parsed GitFileDiff prop contract`);
    }
    const liveDiffStart = queries.indexOf("export function useGitFileDiff");
    const historicalDiffStart = queries.indexOf(
      "export function useGitHistoricalFileDiff",
    );
    const liveDiff =
      liveDiffStart >= 0 && historicalDiffStart > liveDiffStart
        ? queries.slice(liveDiffStart, historicalDiffStart)
        : "";
    const historicalDiff =
      historicalDiffStart >= 0 ? queries.slice(historicalDiffStart) : "";
    if (!/\bexport function normalizeGitDiffRequest\b/.test(queries)) {
      violations.push(`${queriesRel}: missing shared git diff argument normalizer`);
    }
    for (const typedOnly of [
      "useChangedFiles(scope: string | null",
      "useChangesOverview(scope: string | null",
      "normalizeGitDiffRequest(\n  scope: string | null",
      "canReadGitFileDiff(\n  scope: string | null",
      "canReadGitHistoricalFileDiff(\n  scope: string | null",
      "useGitFileDiff(\n  scope: string | null",
      "useGitHistoricalFileDiff(\n  scope: string | null",
      "status?: string",
    ]) {
      if (queries.includes(typedOnly)) {
        violations.push(`${queriesRel}: typed-only git diff seam ${typedOnly}`);
      }
    }
    for (const required of [
      "useChangedFiles(scope: unknown",
      "useChangesOverview(scope: unknown",
      "normalizeGitDiffRequest(\n  scope: unknown,\n  path: unknown",
      "canReadGitFileDiff(\n  scope: unknown,\n  path: unknown",
      "canReadGitHistoricalFileDiff(\n  scope: unknown,\n  path: unknown",
      "useGitFileDiff(\n  scope: unknown,\n  path: unknown",
      "useGitHistoricalFileDiff(\n  scope: unknown,\n  path: unknown",
      "status?: unknown",
    ]) {
      if (!queries.includes(required)) {
        violations.push(`${queriesRel}: missing runtime git diff seam ${required}`);
      }
    }
    if (
      !/\bfunction\s+normalizeGitDiffArg\s*\(\s*value:\s*unknown\s*\):\s*string\s*\|\s*null\s*\{[\s\S]*\bnormalizeGitQueryKeyPart\s*\(\s*value\s*\)/.test(
        queries,
      )
    ) {
      violations.push(`${queriesRel}: git diff arg bypasses capped key normalizer`);
    }
    if (!/\bGIT_QUERY_KEY_PART_MAX_CHARS\b/.test(queries)) {
      violations.push(`${queriesRel}: git query key parts are not length-bounded`);
    }
    if (
      !/\bexport\s+function\s+normalizeGitQueryKeyPart\s*\(\s*value:\s*unknown\s*\):\s*string[\s\S]*typeof\s+value\s*!==\s*["']string["'][\s\S]*\.trim\s*\(\s*\)[\s\S]*normalized\.length\s*<=\s*GIT_QUERY_KEY_PART_MAX_CHARS/.test(
        queries,
      )
    ) {
      violations.push(`${queriesRel}: git query key normalizer trusts typed inputs`);
    }
    for (const keyHelper of ["gitChanges", "gitDiff", "gitHistoricalDiff"]) {
      if (
        !new RegExp(
          `${keyHelper}:\\s*\\([\\s\\S]*?\\)\\s*=>[\\s\\S]*?normalizeGitQueryKeyPart`,
        ).test(queries)
      ) {
        violations.push(`${queriesRel}: ${keyHelper} bypasses git key normalizer`);
      }
    }
    if (
      !/\bfunction useChangedFilesForGit\s*\(\s*scope:\s*unknown[\s\S]*\bconst\s+normalizedScope\s*=\s*normalizeGitDiffArg\s*\(\s*scope\s*\)[\s\S]*\bengineKeys\.gitChanges\s*\(\s*normalizedScope\s*\?\?\s*["']["']\s*\)[\s\S]*\bengineClient\.opsGit\s*\(\s*["']status["']\s*,\s*\{\s*scope:\s*normalizedScope!/.test(
        queries,
      )
    ) {
      violations.push(`${queriesRel}: changed-files read bypasses scope normalizer`);
    }
    if (
      !/\bexport function useChangesOverview\s*\(\s*scope:\s*unknown[\s\S]*\bconst\s+normalizedScope\s*=\s*normalizeGitDiffArg\s*\(\s*scope\s*\)[\s\S]*deriveChangesOverviewView\s*\(\s*git\s*,\s*changed\s*,\s*normalizedScope\s*\)/.test(
        queries,
      )
    ) {
      violations.push(`${queriesRel}: changes overview bypasses normalized scope`);
    }
    if (
      !/\bfunction canReadGitFileDiff\b[\s\S]*\bconst\s+request\s*=\s*normalizeGitDiffRequest\s*\(\s*scope\s*,\s*path\s*\)[\s\S]*\brequest\.scope\s*!==\s*null[\s\S]*\brequest\.path\s*!==\s*null/.test(
        queries,
      )
    ) {
      violations.push(`${queriesRel}: missing normalized live git diff read gate`);
    }
    if (
      !/\bfunction canReadGitHistoricalFileDiff\b[\s\S]*\bconst\s+request\s*=\s*normalizeGitDiffRequest\s*\(\s*scope\s*,\s*path\s*,\s*from\s*,\s*to\s*\)[\s\S]*\bcanReadGitFileDiff\s*\(\s*request\.scope\s*,\s*request\.path\s*,\s*git\s*\)[\s\S]*\brequest\.from\s*!==\s*null[\s\S]*\brequest\.to\s*!==\s*null/.test(
        queries,
      )
    ) {
      violations.push(
        `${queriesRel}: missing normalized historical git diff read gate`,
      );
    }
    if (
      !/\bconst\s+request\s*=\s*normalizeGitDiffRequest\s*\(\s*scope\s*,\s*path\s*\)[\s\S]*\bconst\s+enabled\s*=\s*canReadGitFileDiff\s*\(\s*request\.scope\s*,\s*request\.path\s*,\s*git\s*\)/.test(
        liveDiff,
      )
    ) {
      violations.push(`${queriesRel}: live git diff bypasses normalized read gate`);
    }
    if (
      !/\bconst\s+request\s*=\s*normalizeGitDiffRequest\s*\(\s*scope\s*,\s*path\s*,\s*from\s*,\s*to\s*\)/.test(
        historicalDiff,
      ) ||
      !/\bconst\s+enabled\s*=\s*canReadGitHistoricalFileDiff\s*\(/.test(
        historicalDiff,
      ) ||
      !/\brequest\.scope\b[\s\S]*\brequest\.path\b[\s\S]*\brequest\.from\b[\s\S]*\brequest\.to\b[\s\S]*\bgit\b/.test(
        historicalDiff,
      )
    ) {
      violations.push(
        `${queriesRel}: historical git diff bypasses normalized read gate`,
      );
    }

    expect(violations).toEqual([]);
  });

  it("keeps palette lens snapshots behind the dashboard filter-choices seam", () => {
    const rel = "app/palette/CommandPalette.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardState\b/.test(statement)) {
        violations.push(`${rel}: raw dashboard-state lens snapshot subscription`);
      }
      if (/\bfilterChoicesFromDashboardState\b/.test(statement)) {
        violations.push(`${rel}: local dashboard filter-choice projection`);
      }
    }
    if (/\bdashboardState\.data\b/.test(stripped)) {
      violations.push(`${rel}: raw dashboard payload passed to lens snapshot`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps palette command assembly behind the command-view seam", () => {
    const rel = "app/palette/CommandPalette.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (
        /\b(?:useDashboardStateMutations|useFiltersVocabularyView|useDashboardTimelineModeView|useDashboardFilterChoices|useLenses|useDashboardNodeSelection|useCommandPaletteOpsRunMutation)\b/.test(
          statement,
        )
      ) {
        violations.push(`${rel}: local palette command data subscription`);
      }
      if (
        /\b(?:dashboardFiltersFromChoices|getLensChoices|saveCurrentLens|OPS_WHITELIST)\b/.test(
          statement,
        )
      ) {
        violations.push(`${rel}: local palette command assembly helper import`);
      }
    }
    if (
      /\bbuildCommands\s*\(|\bfilterCommands\s*\(|\bgroupByFamily\s*\(/.test(stripped)
    ) {
      violations.push(`${rel}: local palette command projection`);
    }
    if (/\bconst\s+liveMessage\b/.test(stripped)) {
      violations.push(`${rel}: local palette live-region derivation`);
    }
    for (const localCopy of [
      "nothing matches",
      "loading navigation",
      "type a command",
      "command palette",
    ]) {
      if (stripped.includes(localCopy)) {
        violations.push(`${rel}: local palette presentation copy "${localCopy}"`);
      }
    }
    if (/`confirm\s+\$\{command\.label\}\?`/.test(stripped)) {
      violations.push(`${rel}: local palette confirm-row label`);
    }
    if (!/\buseCommandPaletteCommandView\s*\(\s*query\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing command palette command-view seam`);
    }
    if (!/\bderiveCommandPalettePresentationView\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing palette presentation-view seam`);
    }
    if (!/\bderiveCommandPaletteActivation\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing palette activation seam`);
    }
    if (!/\bderiveCommandPaletteArmedRepair\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing palette armed repair seam`);
    }
    if (/\bcommand\.confirm\b|\bactiveCommand\?\.confirm\b/.test(stripped)) {
      violations.push(`${rel}: local palette confirm classification`);
    }
    if (/\bcommandPaletteRowLabel\s*\(/.test(stripped)) {
      violations.push(`${rel}: local palette row-label derivation`);
    }
    if (/\boptionId\s*\(\s*activeCommand\.id\s*\)/.test(stripped)) {
      violations.push(`${rel}: local palette option id projection`);
    }
    if (/\bFAMILY_LABEL\b/.test(stripped)) {
      violations.push(`${rel}: local palette family-label projection`);
    }
    if (/\bgroup\.commands\.map\b/.test(stripped)) {
      violations.push(`${rel}: local palette command-row mapping`);
    }
    if (/\bordered\.indexOf\s*\(\s*command\s*\)/.test(stripped)) {
      violations.push(`${rel}: local palette row index derivation`);
    }
    if (/\bconst\s+(?:selected|armed)\s*=/.test(stripped)) {
      violations.push(`${rel}: local palette row state derivation`);
    }
    if (!/\bpresentation\.rowGroups\.map\b/.test(stripped)) {
      violations.push(`${rel}: missing palette row-groups view`);
    }
    for (const field of [
      "row.label",
      "row.rowClassName",
      "row.labelClassName",
      "row.selected",
      "row.confirmShortcutLabel",
      "row.selectionHintVisible",
      "row.optionDomIdPart",
    ]) {
      if (!stripped.includes(field)) {
        violations.push(`${rel}: missing palette row view ${field}`);
      }
    }
    if (
      /row\.selected\s*\?\s*["']bg-accent-subtle text-ink/.test(stripped) ||
      /row\.armed\s*\?\s*["']text-state-stale/.test(stripped)
    ) {
      violations.push(`${rel}: local palette selected/armed row chrome`);
    }
    if (
      stripped.includes(
        '"flex h-[30px] w-full items-center justify-between rounded-fg-md px-fg-4 text-left transition-colors duration-ui-fast ease-settle',
      )
    ) {
      violations.push(`${rel}: local palette row chrome class`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps palette time-travel gating on shared action descriptors", () => {
    const rel = "stores/view/commandPaletteCommands.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (!/\bnormalizeActionDescriptor\b/.test(stripped)) {
      violations.push(`${rel}: palette commands bypass shared action normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizeCommandFamily\s*\(\s*value:\s*unknown\s*\):\s*CommandFamily\s*\|\s*null[\s\S]*\bvalue\.trim\s*\(\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing palette family normalizer`);
    }
    if (
      !/\bexport\s+function\s+normalizePaletteCommand\s*\(\s*command:\s*unknown\s*\):\s*PaletteCommand\s*\|\s*null[\s\S]*\bnormalizeCommandFamily\s*\(\s*command\.family\s*\)[\s\S]*\bnormalizeActionDescriptor\s*\(\s*command\s*\)[\s\S]*typeof\s+action\.run\s*!==\s*["']function["']/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: palette command normalizer trusts raw command shape`);
    }
    if (
      !/\bfunction\s+normalizedPaletteCommands\s*\([\s\S]*\bnormalizePaletteCommand\s*\(\s*command\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: palette command builders bypass normalized list seam`);
    }
    if (/id\.startsWith\s*\(\s*["']ops:/.test(stripped)) {
      violations.push(`${rel}: command-id time-travel gate`);
    }
    if (!/\bdisabledInTimeTravel:\s*true\b/.test(stripped)) {
      violations.push(`${rel}: ops commands do not carry action time-travel flag`);
    }
    if (!/\bgateCommandsForTimeTravel\b/.test(stripped)) {
      violations.push(`${rel}: missing shared palette time-travel gate`);
    }
    if (
      !/\bcommand\.disabledInTimeTravel\s*!==\s*true\b/.test(stripped) ||
      !/\bgateCommandsForTimeTravel\s*\(\s*all\s*,\s*timeTravel\s*\)/.test(stripped)
    ) {
      violations.push(`${rel}: palette gate does not use disabledInTimeTravel`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps palette command query normalization at the command-view seam", () => {
    const rel = "stores/view/commandPaletteCommands.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (!/from\s+["']\.\/commandPalette["']/.test(stripped)) {
      violations.push(`${rel}: command assembly bypasses palette store seams`);
    }
    if (!/\bnormalizeCommandPaletteQuery\b/.test(stripped)) {
      violations.push(`${rel}: command assembly bypasses query normalizer`);
    }
    for (const typedOnly of [
      "query: string",
      "featureTags: readonly string[]",
      "lensNames: readonly string[]",
      "filterCommands(\n  commands: readonly PaletteCommand[],\n  query: string",
      "useCommandPaletteCommandView(query: string)",
    ]) {
      if (stripped.includes(typedOnly)) {
        violations.push(`${rel}: typed-only palette query seam ${typedOnly}`);
      }
    }
    if (
      !/\bconst\s+normalizedQuery\s*=\s*normalizeCommandPaletteQuery\s*\(\s*sources\.query\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: buildCommands uses raw query`);
    }
    if (
      !/\bexport\s+function\s+normalizeCommandPaletteSourceItems\s*\(\s*items:\s*unknown\s*\):\s*string\[\][\s\S]*Array\.isArray\s*\(\s*items\s*\)[\s\S]*item\.trim\s*\(\s*\)[\s\S]*COMMAND_PALETTE_SOURCE_ITEMS_CAP/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing bounded command source normalizer`);
    }
    if (
      !/\bCOMMAND_PALETTE_SOURCE_ITEM_MAX_CHARS\b/.test(stripped) ||
      !/\bnormalizeCommandPaletteSourceItems\b[\s\S]*normalized\.length\s*>\s*COMMAND_PALETTE_SOURCE_ITEM_MAX_CHARS/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: command source item identities are unbounded`);
    }
    if (
      !/\bconst\s+featureTags\s*=\s*normalizeCommandPaletteSourceItems\s*\(\s*sources\.featureTags\s*\)/.test(
        stripped,
      ) ||
      !/\bconst\s+lensNames\s*=\s*normalizeCommandPaletteSourceItems\s*\(\s*sources\.lensNames\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: command assembly trusts raw source arrays`);
    }
    if (
      /\bfor\s*\(\s*const\s+feature\s+of\s+sources\.featureTags\s*\)/.test(stripped) ||
      /\bfor\s*\(\s*const\s+name\s+of\s+sources\.lensNames\s*\)/.test(stripped)
    ) {
      violations.push(`${rel}: command assembly iterates raw source arrays`);
    }
    if (
      !/\bconst\s+needle\s*=\s*normalizeCommandPaletteQuery\s*\(\s*query\s*\)\.toLowerCase\s*\(\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: filterCommands uses raw query`);
    }
    if (
      !/\bexport\s+function\s+useCommandPaletteCommandView\s*\(\s*query:\s*unknown\s*,?\s*\)/.test(
        stripped,
      ) ||
      !/\bconst\s+normalizedQuery\s*=\s*normalizeCommandPaletteQuery\s*\(\s*query\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: command view hook trusts typed query`);
    }
    if (
      /\bsources\.query\.trim\s*\(/.test(stripped) ||
      /\bquery\.trim\s*\(/.test(stripped)
    ) {
      violations.push(`${rel}: command query is trimmed outside the normalizer`);
    }
    if (!/\bfilterCommands\s*\(\s*gated\s*,\s*normalizedQuery\s*\)/.test(stripped)) {
      violations.push(`${rel}: command view filters with raw query`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps command-palette armed command identity bounded in the store seam", () => {
    const rel = "stores/view/commandPalette.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (!/\bCOMMAND_PALETTE_ARMED_COMMAND_ID_MAX_CHARS\b/.test(stripped)) {
      violations.push(`${rel}: missing armed command-id cap`);
    }
    if (
      !/\bnormalizeCommandPaletteArmedCommandId\s*\(\s*[\s\S]*commandId:\s*unknown[\s\S]*\)[\s\S]*\bconst\s+normalized\s*=\s*commandId\.trim\s*\(\s*\)[\s\S]*normalized\.length\s*<=\s*COMMAND_PALETTE_ARMED_COMMAND_ID_MAX_CHARS/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: armed command-id normalizer is unbounded`);
    }
    if (
      !/\bsetArmedCommandId:\s*\(commandId\)\s*=>[\s\S]*normalizeCommandPaletteArmedCommandId\s*\(\s*commandId\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: armed command-id setter bypasses normalizer`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps command-palette dashboard lens writes behind the lens intent", () => {
    const rel = "stores/view/commandPaletteCommands.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseDashboardStateMutations\b/.test(statement)) {
        violations.push(`${rel}: broad dashboard-state lens mutation`);
      }
      if (/\bdashboardFiltersFromChoices\b/.test(statement)) {
        violations.push(`${rel}: local saved-lens dashboard filter projection`);
      }
    }
    if (/\bdashboardMutations\b/.test(stripped)) {
      violations.push(`${rel}: local broad dashboard mutation alias`);
    }
    if (/\bsetFiltersAndDateRange\s*\(/.test(stripped)) {
      violations.push(`${rel}: local saved-lens dashboard write`);
    }
    if (!/\buseCommandPaletteLensIntent\s*\(\s*scope\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing command-palette lens intent seam`);
    }
    if (!/\blensIntent\s*\.\s*applyLensChoices\s*\(\s*choices\s*\)/.test(stripped)) {
      violations.push(`${rel}: missing saved-lens intent dispatch`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps saved lens snapshots normalized before dashboard writes", () => {
    const lensesRel = "stores/view/lenses.ts";
    const intentRel = "stores/server/commandPaletteLensIntent.ts";
    const lenses = stripComments(readFileSync(join(SRC_ROOT, lensesRel), "utf8"));
    const intent = stripComments(readFileSync(join(SRC_ROOT, intentRel), "utf8"));
    const violations: string[] = [];

    if (!/\bnormalizeFilterChoices\b/.test(lenses)) {
      violations.push(
        `${lensesRel}: saved lens persistence bypasses filter-choice normalizer`,
      );
    }
    if (
      !/\bconst\s+choices\s*=\s*normalizeFilterChoices\s*\(\s*lens\?\.choices\s*\)/.test(
        lenses,
      )
    ) {
      violations.push(`${lensesRel}: persisted lens choices are not normalized`);
    }
    if (
      !/\bconst\s+normalizedChoices\s*=\s*normalizeFilterChoices\s*\(\s*choices\s*\)/.test(
        lenses,
      )
    ) {
      violations.push(`${lensesRel}: saved current lens choices are not normalized`);
    }
    if (!/\bnormalizedLensName\b/.test(lenses)) {
      violations.push(`${lensesRel}: saved lens names are not normalized`);
    }
    if (!/\bnormalizeFilterChoices\b/.test(intent)) {
      violations.push(`${intentRel}: lens intent bypasses filter-choice normalizer`);
    }
    if (/\btype\s+FilterChoices\b/.test(intent)) {
      violations.push(`${intentRel}: lens intent imports typed-only lens payloads`);
    }
    if (/\bapplyLensChoices\s*:\s*\(\s*choices\s*:\s*FilterChoices\s*\)/.test(intent)) {
      violations.push(`${intentRel}: lens intent does not accept runtime payloads`);
    }
    if (
      /\buseCommandPaletteLensIntent\s*\(\s*scope:\s*string\s*\|\s*null/.test(intent)
    ) {
      violations.push(`${intentRel}: lens intent accepts typed-only scope`);
    }
    if (
      !/\bimport\s*\{[\s\S]*\bnormalizeDashboardStateWriteScope\b[\s\S]*\}\s*from\s+["']\.\/dashboardState["']/.test(
        intent,
      ) ||
      !/\bexport\s+const\s+normalizeCommandPaletteLensScope\s*=\s*normalizeDashboardStateWriteScope\b/.test(
        intent,
      ) ||
      !/\bconst\s+normalizedScope\s*=\s*normalizeCommandPaletteLensScope\s*\(\s*scope\s*\)/.test(
        intent,
      )
    ) {
      violations.push(`${intentRel}: lens intent bypasses scope normalizer`);
    }
    if (!/\buseDashboardStateMutations\s*\(\s*normalizedScope\s*\)/.test(intent)) {
      violations.push(`${intentRel}: lens intent mutations use raw scope`);
    }
    if (
      !/\bnormalizedScope\s*===\s*null\s*\|\|\s*normalized\s*===\s*null/.test(intent)
    ) {
      violations.push(`${intentRel}: lens intent does not gate normalized scope`);
    }
    if (
      !/\bconst\s+normalized\s*=\s*normalizeFilterChoices\s*\(\s*choices\s*\)/.test(
        intent,
      )
    ) {
      violations.push(`${intentRel}: lens intent writes raw choices`);
    }
    if (/\bchoices\s*\.\s*dateRange\b/.test(intent)) {
      violations.push(`${intentRel}: lens intent reads raw dateRange`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps command-palette transient workflow state behind the palette store seam", () => {
    const rel = "app/palette/CommandPalette.tsx";
    const storeRel = "stores/view/commandPalette.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const store = stripComments(readFileSync(join(SRC_ROOT, storeRel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\buseCommandPaletteStore\b/.test(statement)) {
        violations.push(`${rel}: raw command-palette store access`);
      }
    }
    if (/\[\s*open\s*,\s*setOpen\s*\]\s*=\s*useState/.test(stripped)) {
      violations.push(`${rel}: local command-palette open state`);
    }
    if (/\buseState\s*\(/.test(stripped)) {
      violations.push(`${rel}: local command-palette workflow state`);
    }
    for (const seam of [
      "useCommandPaletteOpen",
      "useCommandPaletteQuery",
      "useCommandPaletteCursor",
      "useCommandPaletteArmedCommandId",
      "closeCommandPalette",
      "setCommandPaletteQuery",
      "setCommandPaletteCursor",
      "setCommandPaletteArmedCommandId",
      "resetCommandPaletteSurfaceState",
      "resetCommandPaletteOpsFeedback",
      "useCommandPaletteOpsMessage",
      "useCommandPaletteGlobalToggle",
      "useDismissOnEscape",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(stripped)) {
        violations.push(`${rel}: missing ${seam} seam`);
      }
    }
    if (/\bwindow\.addEventListener\s*\(\s*["']keydown["']/.test(stripped)) {
      violations.push(`${rel}: local command-palette global Escape listener`);
    }
    if (/\bwindow\.removeEventListener\s*\(\s*["']keydown["']/.test(stripped)) {
      violations.push(`${rel}: local command-palette global Escape cleanup`);
    }
    if (
      /\bevent\.key\s*!==\s*["']Escape["']|\be\.key\s*===\s*["']Escape["']/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local command-palette Escape classification`);
    }
    if (
      !/\buseDismissOnEscape\s*\(\s*close\s*,\s*\{\s*enabled:\s*open,\s*preventDefault:\s*true\s*\}\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: command-palette Escape dismissal bypasses chrome hook`);
    }
    if (/\bwindow\.addEventListener\s*\(\s*["']keydown["']/.test(store)) {
      violations.push(`${storeRel}: store owns command-palette keydown listener`);
    }
    if (/\bwindow\.removeEventListener\s*\(\s*["']keydown["']/.test(store)) {
      violations.push(`${storeRel}: store owns command-palette keydown cleanup`);
    }
    if (
      /\bevent\.key\s*!==\s*["']Escape["']|\be\.key\s*===\s*["']Escape["']/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: store owns command-palette Escape classification`);
    }
    for (const localOwner of [
      "registerKeybindings",
      "registerKeyAction",
      "openCommandPalette",
      "COMMAND_PALETTE_ACTION_ID",
      "COMMAND_PALETTE_KEYBINDING",
    ]) {
      if (new RegExp(`\\b${localOwner}\\b`).test(stripped)) {
        violations.push(`${rel}: app-layer ${localOwner} ownership`);
      }
    }
    for (const seam of [
      "COMMAND_PALETTE_ACTION_ID",
      "COMMAND_PALETTE_SHORTCUT_LABEL",
      "COMMAND_PALETTE_KEYBINDING",
      "useCommandPaletteGlobalToggle",
      "registerKeybindings",
      "registerKeyAction",
      "openCommandPalette",
      "closeCommandPalette",
      "resetCommandPaletteOpsFeedback",
    ]) {
      if (!new RegExp(`\\b${seam}\\b`).test(store)) {
        violations.push(`${storeRel}: missing ${seam} keybinding seam`);
      }
    }
    for (const seam of [
      "COMMAND_PALETTE_QUERY_MAX_CHARS",
      "normalizeCommandPaletteQuery",
      "normalizeCommandPaletteCursor",
      "normalizeCommandPaletteArmedCommandId",
      "normalizeCommandPaletteFeedbackScope",
      "normalizeCommandPaletteFeedbackTimeTravel",
      "query: string",
      "cursor: number",
      "armedCommandId: string | null",
      "setQuery:",
      "setCursor:",
      "setArmedCommandId:",
      "resetSurfaceState:",
    ]) {
      if (!store.includes(seam)) {
        violations.push(`${storeRel}: missing palette workflow state seam ${seam}`);
      }
    }
    for (const typedOnly of [
      "setQuery: (query: string)",
      "setCursor: (cursor: number)",
      "setArmedCommandId: (commandId: string | null)",
      "setCommandPaletteQuery(query: string)",
      "setCommandPaletteCursor(cursor: number)",
      "setCommandPaletteArmedCommandId(commandId: string | null)",
    ]) {
      if (store.includes(typedOnly)) {
        violations.push(`${storeRel}: typed-only command-palette seam ${typedOnly}`);
      }
    }
    if (
      !/from\s+["']\.\.\/searchQuery["']/.test(store) ||
      !/\bnormalizeCommandPaletteQuery\b[\s\S]*\bnormalizeSearchQuery\s*\(\s*query\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: palette query bypasses shared query normalizer`);
    }
    if (
      !/\bsetQuery:\s*\(query\)\s*=>[\s\S]*\bnormalizeCommandPaletteQuery\s*\(\s*query\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: query setter bypasses normalizer`);
    }
    if (
      !/\bsetCursor:\s*\(cursor\)\s*=>[\s\S]*\bnormalizeCommandPaletteCursor\s*\(\s*cursor\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: cursor setter bypasses normalizer`);
    }
    if (
      !/\bsetArmedCommandId:\s*\(commandId\)\s*=>[\s\S]*\bnormalizeCommandPaletteArmedCommandId\s*\(\s*commandId\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: armed command setter bypasses normalizer`);
    }
    if (
      !/\buseCommandPaletteOpsFeedbackBoundary\s*\(\s*scope:\s*unknown,\s*timeTravel:\s*unknown/.test(
        store,
      ) ||
      !/\bconst\s+normalizedScope\s*=\s*normalizeCommandPaletteFeedbackScope\s*\(\s*scope\s*\)/.test(
        store,
      ) ||
      !/\bconst\s+normalizedTimeTravel\s*=\s*normalizeCommandPaletteFeedbackTimeTravel\s*\(\s*timeTravel\s*\)/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: ops feedback boundary trusts raw context`);
    }
    if (
      !/from\s+["']\.\/scopeIdentity["'][\s\S]*\bnormalizeViewStoreSessionString\b/.test(
        store,
      ) ||
      !/\bexport\s+const\s+normalizeCommandPaletteFeedbackScope\s*=\s*normalizeViewStoreSessionString\b/.test(
        store,
      )
    ) {
      violations.push(
        `${storeRel}: command-palette feedback scope bypasses shared view scope normalizer`,
      );
    }
    if (
      /\buseCommandPaletteOpsFeedbackBoundary\s*\(\s*scope:\s*string\s*\|\s*null,\s*timeTravel:\s*boolean/.test(
        store,
      )
    ) {
      violations.push(`${storeRel}: ops feedback boundary exposes typed-only context`);
    }
    if (/\bdefaultChord\s*:\s*["']Mod\+K["']/.test(stripped)) {
      violations.push(`${rel}: local command-palette keybinding default`);
    }
    if (!/\bdefaultChord\s*:\s*["']Mod\+K["']/.test(store)) {
      violations.push(`${storeRel}: missing command-palette keybinding default`);
    }
    if (/\bkey\.toLowerCase\s*\(\s*\)\s*===\s*["']k["']/.test(stripped)) {
      violations.push(`${rel}: local command-palette shortcut key parsing`);
    }
    if (/\b(?:e|event)\.(?:ctrlKey|metaKey)\b/.test(stripped)) {
      violations.push(`${rel}: local command-palette modifier inspection`);
    }
    if (
      !/\buseFocusRestore\s*\(\s*open\s*,\s*\{[\s\S]*\bonClose\s*:\s*reset/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: palette state is not reset through focus lifecycle`);
    }
    if (
      !/\bconst\s+close\s*=\s*useCallback\s*\([\s\S]*\breset\s*\(\s*\)[\s\S]*\bcloseCommandPalette\s*\(\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: close path does not reset before store close`);
    }
    if (
      !/\bcommandPaletteMovedCursor\s*\(\s*ordered\.length\s*,\s*cursor\s*,\s*delta\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: missing command-palette cursor movement seam`);
    }
    if (
      /Math\.(?:min|max)\s*\([\s\S]*cursor/.test(stripped) ||
      /cursor\s*<\s*0\s*\?\s*0\s*:\s*cursor/.test(stripped)
    ) {
      violations.push(`${rel}: local command-palette cursor boundary math`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps keymap enrollment and live action resolver ids normalized", () => {
    const registryRel = "platform/keymap/registry.ts";
    const dispatcherRel = "stores/view/keymapDispatcher.ts";
    const settingsRel = "stores/server/settingsSelectors.ts";
    const registry = stripComments(readFileSync(join(SRC_ROOT, registryRel), "utf8"));
    const dispatcher = stripComments(
      readFileSync(join(SRC_ROOT, dispatcherRel), "utf8"),
    );
    const settings = stripComments(readFileSync(join(SRC_ROOT, settingsRel), "utf8"));
    const violations: string[] = [];

    if (
      !/\bexport\s+function\s+normalizeKeybindingId\s*\(\s*id:\s*unknown\s*\):\s*string\s*\|\s*null[\s\S]*\bid\.trim\s*\(\s*\)/.test(
        registry,
      )
    ) {
      violations.push(`${registryRel}: missing keybinding id normalizer`);
    }
    if (!/\bMAX_KEYBINDING_ID_LEN\b/.test(registry)) {
      violations.push(`${registryRel}: missing bounded keybinding id cap`);
    }
    if (
      !/\bexport\s+function\s+normalizeKeybindingId\s*\(\s*id:\s*unknown\s*\):\s*string\s*\|\s*null[\s\S]*normalized\.length\s*<=\s*MAX_KEYBINDING_ID_LEN/.test(
        registry,
      )
    ) {
      violations.push(`${registryRel}: keybinding ids are unbounded`);
    }
    if (
      !/\bfunction\s+normalizeKeybindingText\s*\(\s*value:\s*unknown\s*\):\s*string\s*\|\s*null[\s\S]*\bvalue\.trim\s*\(\s*\)/.test(
        registry,
      ) ||
      !/\bexport\s+function\s+normalizeBindingContext\s*\(\s*value:\s*unknown\s*\):\s*BindingContext\s*\|\s*null[\s\S]*\bSURFACE_CONTEXTS\b/.test(
        registry,
      )
    ) {
      violations.push(`${registryRel}: missing keybinding metadata normalizers`);
    }
    if (
      !/\bexport\s+function\s+normalizeKeybindingOverrides\s*\(\s*overrides:\s*unknown\s*,?\s*\):\s*KeybindingOverrides[\s\S]*\bMAX_KEYBINDING_OVERRIDES\b[\s\S]*\bnormalizeKeybindingId\s*\(\s*id\s*\)[\s\S]*\bMAX_KEYBINDING_CHORD_LEN\b/.test(
        registry,
      )
    ) {
      violations.push(`${registryRel}: missing bounded override-map normalizer`);
    }
    if (
      !/\bexport\s+function\s+effectiveChord\s*\([\s\S]*\bconst\s+normalizedOverrides\s*=\s*normalizeKeybindingOverrides\s*\(\s*overrides\s*\)[\s\S]*normalizedOverrides\s*\[\s*normalizedId\s*\]/.test(
        registry,
      )
    ) {
      violations.push(`${registryRel}: effective chord trusts raw override map`);
    }
    if (
      !/from\s+["']\.\.\/\.\.\/platform\/keymap\/registry["'][\s\S]*\bnormalizeKeybindingOverrides\b/.test(
        settings,
      ) ||
      !/\breturn\s+normalizeKeybindingOverrides\s*\(\s*parsed\s*\)/.test(settings)
    ) {
      violations.push(
        `${settingsRel}: keybinding setting parser bypasses platform normalizer`,
      );
    }
    if (
      !/\bnormalizedKeybindingDef\s*\(\s*rawDef\s*\)/.test(registry) ||
      !/\bfunction\s+normalizedKeybindingDef\s*\(\s*def:\s*KeybindingDef\s*\):\s*KeybindingDef\s*\|\s*null[\s\S]*normalizeKeybindingId\s*\(\s*def\.id\s*\)[\s\S]*normalizeKeybindingText\s*\(\s*def\.defaultChord\s*\)[\s\S]*normalizeKeybindingText\s*\(\s*def\.label\s*\)[\s\S]*normalizeKeybindingText\s*\(\s*def\.group\s*\)[\s\S]*normalizeBindingContext\s*\(\s*def\.context\s*\)/.test(
        registry,
      )
    ) {
      violations.push(`${registryRel}: registration bypasses normalized def`);
    }
    if (
      !/\bexport\s+function\s+getKeybinding\s*\(\s*id:\s*unknown\s*\)/.test(registry) ||
      !/\bconst\s+normalizedId\s*=\s*normalizeKeybindingId\s*\(\s*id\s*\)/.test(
        registry,
      )
    ) {
      violations.push(`${registryRel}: lookup bypasses normalized id`);
    }
    if (
      !/\bconst\s+normalizedId\s*=\s*normalizeKeybindingId\s*\(\s*def\.id\s*\)/.test(
        registry,
      )
    ) {
      violations.push(`${registryRel}: effective override lookup uses raw id`);
    }
    if (
      !/\btargetId:\s*unknown\b/.test(registry) ||
      !/\bconst\s+normalizedTargetId\s*=\s*normalizeKeybindingId\s*\(\s*targetId\s*\)/.test(
        registry,
      )
    ) {
      violations.push(`${registryRel}: candidate conflict lookup uses raw target id`);
    }
    if (!/normalizeKeybindingId/.test(dispatcher)) {
      violations.push(`${dispatcherRel}: dispatcher does not import id normalizer`);
    }
    if (!/normalizeBindingContext/.test(dispatcher)) {
      violations.push(
        `${dispatcherRel}: dispatcher does not import context normalizer`,
      );
    }
    if (
      !/\bexport\s+function\s+normalizeActiveKeymapContexts\s*\([\s\S]*contexts:\s*Iterable<unknown>[\s\S]*\):\s*Set<BindingContext>[\s\S]*normalizeBindingContext\s*\(\s*context\s*\)/.test(
        dispatcher,
      )
    ) {
      violations.push(`${dispatcherRel}: missing active-context normalizer`);
    }
    if (
      !/\bactiveContextsFromElement[\s\S]*normalizeBindingContext\s*\(\s*host\?\.getAttribute\s*\(\s*["']data-keymap-context["']\s*\)\s*\)/.test(
        dispatcher,
      )
    ) {
      violations.push(
        `${dispatcherRel}: DOM active context bypasses context normalizer`,
      );
    }
    if (
      !/\bresolveKeybinding\s*\([\s\S]*normalizeActiveKeymapContexts\s*\(\s*deps\.getActiveContexts\s*\(\s*\)\s*\)/.test(
        dispatcher,
      )
    ) {
      violations.push(
        `${dispatcherRel}: key event handling trusts raw active contexts`,
      );
    }
    if (/SURFACE_CONTEXTS/.test(dispatcher)) {
      violations.push(`${dispatcherRel}: dispatcher owns raw surface context catalog`);
    }
    if (!/\bnormalizeActionDescriptor\b/.test(dispatcher)) {
      violations.push(`${dispatcherRel}: dispatcher does not import action normalizer`);
    }
    if (
      !/\bexport\s+function\s+registerKeyAction\s*\(\s*id:\s*unknown/.test(
        dispatcher,
      ) ||
      !/\bresolver:\s*unknown\b/.test(dispatcher) ||
      !/\btypeof\s+resolver\s*!==\s*["']function["']/.test(dispatcher) ||
      !/\bconst\s+normalizedId\s*=\s*normalizeKeybindingId\s*\(\s*id\s*\)/.test(
        dispatcher,
      ) ||
      !/\bconst\s+normalizedResolver\s*=\s*resolver\s+as\s*\(\s*\)\s*=>\s*unknown\b/.test(
        dispatcher,
      ) ||
      !/\bkeyActions\.set\s*\(\s*normalizedId\s*,\s*normalizedResolver\s*\)/.test(
        dispatcher,
      )
    ) {
      violations.push(`${dispatcherRel}: action registration uses raw id`);
    }
    if (
      !/\bexport\s+function\s+resolveKeyAction\s*\(\s*id:\s*unknown\s*\)/.test(
        dispatcher,
      ) ||
      !/\bkeyActions\.get\s*\(\s*normalizedId\s*\)/.test(dispatcher) ||
      !/\bnormalizeActionDescriptor\s*\(\s*keyActions\.get\s*\(\s*normalizedId\s*\)\?\.\(\s*\)\s*\)/.test(
        dispatcher,
      )
    ) {
      violations.push(`${dispatcherRel}: action resolution bypasses normalized seam`);
    }
    if (
      !/\bresolveAction:\s*\(\s*id:\s*unknown\s*\)\s*=>\s*unknown\b/.test(dispatcher) ||
      !/\bconst\s+action\s*=\s*normalizeActionDescriptor\s*\(\s*deps\.resolveAction\s*\(\s*def\.id\s*\)\s*\)/.test(
        dispatcher,
      )
    ) {
      violations.push(`${dispatcherRel}: key event handling trusts raw action`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps stage visibility snapshots behind the dashboard filter-choices seam", () => {
    const rel = "app/stage/Stage.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    for (const statement of importStatements(stripped)) {
      if (/\bfilterChoicesFromDashboardState\b/.test(statement)) {
        violations.push(`${rel}: local dashboard filter-choice projection import`);
      }
    }
    if (/\bfilterChoicesFromDashboardState\s*\(/.test(stripped)) {
      violations.push(`${rel}: local dashboard filter-choice projection`);
    }
    if (
      !/\buseDashboardVisibilityCommand\s*\(\s*scope\s*,\s*merged\s*\)/.test(stripped)
    ) {
      violations.push(`${rel}: missing stores dashboard visibility command seam`);
    }
    for (const helper of ["computeVisibility", "visibilitySceneCommand"]) {
      if (new RegExp(`\\b${helper}\\b`).test(stripped)) {
        violations.push(`${rel}: local stores visibility helper call ${helper}`);
      }
    }
    if (/kind:\s*["']set-visibility["']/.test(stripped)) {
      violations.push(`${rel}: local scene visibility command projection`);
    }
    if (
      /\bmembership\?\.hiddenNodeCount\b|\bmembership\?\.hiddenEdgeCount\b/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: local visibility hidden-count projection`);
    }
    if (/merged\.nodes\.length\s*-\s*\(/.test(stripped)) {
      violations.push(`${rel}: local visible-node count projection`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps dashboard filter-choice subscriptions in the server selector layer", () => {
    const viewRel = "stores/view/dashboardFilterChoices.ts";
    const queryRel = "stores/server/queries.ts";
    const view = stripComments(readFileSync(join(SRC_ROOT, viewRel), "utf8"));
    const queries = stripComments(readFileSync(join(SRC_ROOT, queryRel), "utf8"));
    const violations: string[] = [];

    if (/\buseDashboardState\s*\(/.test(view)) {
      violations.push(`${viewRel}: view-layer dashboard-state subscription`);
    }
    if (/\bfilterChoicesFromDashboardState\s*\(/.test(view)) {
      violations.push(`${viewRel}: view-layer dashboard filter-choice projection`);
    }
    if (
      /\buseDashboardVisibilityCommand\s*\(\s*scope:\s*string\s*\|\s*null/.test(view)
    ) {
      violations.push(`${viewRel}: visibility command trusts typed-only scope`);
    }
    if (!/\buseDashboardVisibilityCommand\s*\(\s*scope:\s*unknown/.test(view)) {
      violations.push(`${viewRel}: visibility command lacks runtime scope seam`);
    }
    if (
      !/\buseDashboardFilterChoicesView\b[\s\S]*\buseDashboardState\s*\(/.test(queries)
    ) {
      violations.push(
        `${queryRel}: missing server-owned dashboard filter-choice selector`,
      );
    }
    if (!/\bderiveDashboardFilterChoicesView\b/.test(queries)) {
      violations.push(`${queryRel}: missing dashboard filter-choice view derivation`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps graph query filters on the dashboard-state projection contract", () => {
    const rel = "stores/server/queries.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (/\bcloneDashboardFiltersForQuery\b/.test(stripped)) {
      violations.push(`${rel}: local graph filter clone`);
    }
    if (/\bfunction\s+dashboardGraphSliceVariables\b/.test(stripped)) {
      violations.push(`${rel}: local graph query variable projection`);
    }
    if (
      !/\bdashboardGraphQueryVariables\s*\(\s*dashboardState\.data\s*\)/.test(stripped)
    ) {
      violations.push(
        `${rel}: graph slice availability bypasses dashboard-state variables`,
      );
    }
    if (
      !/\bcloneDashboardFilters\s*\(\s*state\?\.filters\s*\?\?\s*\{\s*\}\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: tier-dial view does not use dashboard filter clone`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps broken-link live-status reductions behind the live-status seam", () => {
    const stageRel = "app/stage/Stage.tsx";
    const timeTravelRel = "app/timeline/timeTravel.ts";
    const liveStatusRel = "stores/server/liveStatus.ts";
    const violations: string[] = [];

    for (const rel of [stageRel, timeTravelRel]) {
      const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));

      if (
        /\.filter\s*\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.state\s*===\s*["']broken["']\s*\)/.test(
          stripped,
        )
      ) {
        violations.push(`${rel}: local broken-link reduction`);
      }
      if (/\bfunction\s+countBrokenStructuralEdges\b/.test(stripped)) {
        violations.push(`${rel}: local broken-link helper`);
      }
    }
    const stage = stripComments(readFileSync(join(SRC_ROOT, stageRel), "utf8"));
    const timeTravel = stripComments(
      readFileSync(join(SRC_ROOT, timeTravelRel), "utf8"),
    );
    const liveStatus = stripComments(
      readFileSync(join(SRC_ROOT, liveStatusRel), "utf8"),
    );

    if (
      !/\buseLiveBrokenLinkCountFromEdges\s*\(\s*merged\?\.edges\s*\?\?\s*null\s*,\s*liveTimeline\s*\)/.test(
        stage,
      )
    ) {
      violations.push(`${stageRel}: missing live-status edge reduction hook`);
    }
    if (/\bsetLiveBrokenLinkCount\b|\bcountBrokenLinks\b/.test(stage)) {
      violations.push(`${stageRel}: local broken-link live-status composition`);
    }
    if (!/\bsetLiveBrokenLinkCountFromEdges\s*\(\s*edges\s*\)/.test(timeTravel)) {
      violations.push(`${timeTravelRel}: missing live-status edge reduction seam`);
    }
    if (!/\bfunction\s+countBrokenLinks\b/.test(liveStatus)) {
      violations.push(`${liveStatusRel}: missing live-status broken-link reducer`);
    }
    if (!/\bfunction\s+setLiveBrokenLinkCountFromEdges\b/.test(liveStatus)) {
      violations.push(`${liveStatusRel}: missing broken-link edge write seam`);
    }
    if (!/\bfunction\s+useLiveBrokenLinkCountFromEdges\b/.test(liveStatus)) {
      violations.push(`${liveStatusRel}: missing broken-link hook seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps dashboard filter facet patch composition behind dashboard-state helpers", () => {
    const violations: string[] = [];

    for (const surface of ["app/stage", "stores/view"] as const) {
      for (const file of sourceFiles(join(SRC_ROOT, surface))) {
        const source = readFileSync(file, "utf8");
        const stripped = stripComments(source);
        const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

        if (/\btoggleDashboardFilterFacet\b/.test(stripped)) {
          violations.push(`${rel}: legacy dashboard filter facet helper`);
        }
        if (/\bdashboardFiltersWithFacetToggled\b/.test(stripped)) {
          violations.push(`${rel}: raw dashboard filter facet patch composition`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps timeline auto-fit provenance behind the timeline view-state seam", () => {
    const rel = "app/timeline/Timeline.tsx";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (/\bconst\s+\[\s*fittedScope\s*,/.test(stripped)) {
      violations.push(`${rel}: component-local timeline auto-fit sentinel`);
    }
    if (/\bsetFittedScope\b/.test(stripped)) {
      violations.push(`${rel}: local timeline auto-fit provenance write`);
    }
    if (!/\buseTimelineAutoFittedScope\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing timeline auto-fit provenance seam`);
    }
    if (!/\bfitTimelineScopeToCorpus\s*\(/.test(stripped)) {
      violations.push(`${rel}: missing timeline scope-fit intent seam`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps timeline corpus auto-fit identity collision-resistant", () => {
    const rel = "stores/view/timeline.ts";
    const stripped = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
    const violations: string[] = [];

    if (
      !/\bconst\s+normalizedScope\s*=\s*normalizeTimelineScope\s*\(\s*scope\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: timeline fit key bypasses scope normalizer`);
    }
    if (
      !/\bnormalizedScope\s*===\s*null\s*\|\|\s*from\.length\s*===\s*0/.test(stripped)
    ) {
      violations.push(`${rel}: timeline fit key accepts invalid scope/from identity`);
    }
    if (!/\bencodeURIComponent\s*\(\s*normalizedScope\s*\)/.test(stripped)) {
      violations.push(`${rel}: timeline fit key does not encode scope`);
    }
    if (!/\bencodeURIComponent\s*\(\s*from\s*\)/.test(stripped)) {
      violations.push(`${rel}: timeline fit key does not encode from bound`);
    }
    if (!/\bencodeURIComponent\s*\(\s*to\s*\)/.test(stripped)) {
      violations.push(`${rel}: timeline fit key does not encode to bound`);
    }
    if (
      !/\btimelineCorpusFitKey\s*\(\s*scope:\s*unknown\s*,\s*bounds:\s*unknown\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: timeline fit key accepts typed-only identity inputs`);
    }
    if (
      !/bounds\s*!==\s*null\s*&&\s*typeof\s+bounds\s*===\s*["']object["'][\s\S]*!\s*Array\.isArray\s*\(\s*bounds\s*\)/.test(
        stripped,
      )
    ) {
      violations.push(`${rel}: timeline fit key trusts raw bounds shape`);
    }
    if (
      !/scope:value:\$\{encodeURIComponent\s*\(\s*normalizedScope\s*\)\}/.test(stripped)
    ) {
      violations.push(`${rel}: real scopes lack a value-tagged key namespace`);
    }
    if (!/from:value:\$\{encodeURIComponent\s*\(\s*from\s*\)\}/.test(stripped)) {
      violations.push(`${rel}: real from bounds lack a value-tagged key namespace`);
    }
    if (!/to:value:\$\{encodeURIComponent\s*\(\s*to\s*\)\}/.test(stripped)) {
      violations.push(`${rel}: real to bounds lack a value-tagged key namespace`);
    }
    if (/JSON\.stringify\s*\(\s*\[\s*scope\s*,\s*bounds\.from/.test(stripped)) {
      violations.push(`${rel}: timeline fit key uses raw array identity`);
    }
    if (/\bif\s*\(\s*!\s*scope\s*\|\|/.test(stripped)) {
      violations.push(`${rel}: timeline fit key drops falsy but non-null scopes`);
    }

    expect(violations).toEqual([]);
  });

  it("keeps settings graph-default patch composition behind dashboard-state helpers", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(join(SRC_ROOT, "app/settings"))) {
      const source = readFileSync(file, "utf8");
      const stripped = stripComments(source);
      const rel = relative(SRC_ROOT, file).replaceAll("\\", "/");

      if (/\bdashboardFiltersWith(?:Text|MinConfidence)\b/.test(stripped)) {
        violations.push(`${rel}: raw settings graph-default filter composition`);
      }
      if (/\bapplyGraphSettingsDefaults\s*\(/.test(stripped)) {
        violations.push(`${rel}: raw settings graph-default dashboard write`);
      }
    }

    expect(violations).toEqual([]);
  });
});
