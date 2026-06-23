import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Structural guard for the category vocabulary (#31: non-atomic category-deletion
// tripwire). The dashboard's node/chip/legend category color is defined across THREE
// sites that must stay in lockstep:
//
//   1. the kit `CategoryToken` union          — `app/kit/category.ts`
//      (the typed app-side vocabulary; `categoryColorVar(c: Category)` resolves
//       `var(--color-scene-category-<token>)` for every member)
//   2. the generated `--color-scene-category-*` tokens — `styles.css`
//      (the literal-hex values the scene readers + the kit `var()` resolve)
//   3. the scene `NodeCategory` union          — `scene/field/categoryColor.ts`
//      (the GRAPH-NODE categories — a subset of the kit vocabulary; `code` is a
//       chip/search category, never a graph node, so the kit set is a superset)
//
// The typed kit API already gives a tsc tripwire on the APP side: deleting a
// `CategoryToken` variant breaks every `categoryColorVar(category)` call site. But
// tsc CANNOT see the CSS tokens (a `var(--color-scene-category-foo)` string) nor the
// scene's string-keyed `cssColorNumber("--color-scene-category-" + cat)` lookups. So a
// NON-ATOMIC deletion — drop a category from the kit union but leave its CSS token (an
// orphan), or delete a CSS token while the kit still emits a `var()` for it (an
// unresolved color → fallback), or keep a category in the scene `NodeCategory` that the
// kit no longer knows — ships green today (`kit/category.test.ts` checks the resolver
// against its OWN hardcoded list, not these sources). This guard reads the three
// sources and fails the gate the moment they drift.

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(HERE, ".."); // frontend/src

/** Extract the string-literal members of a named `type X = | "a" | "b" …` union
 *  (optionally referencing another union, which is ignored — we collect only the
 *  literal members declared in THIS alias). */
function unionLiterals(source: string, typeName: string): Set<string> {
  const declStart = source.indexOf(`export type ${typeName} =`);
  if (declStart === -1) {
    throw new Error(`type ${typeName} not found`);
  }
  // The union body runs to the terminating `;`.
  const semicolon = source.indexOf(";", declStart);
  const body = source.slice(declStart, semicolon === -1 ? undefined : semicolon);
  const members = new Set<string>();
  for (const match of body.matchAll(/"([a-z][a-z0-9-]*)"/g)) {
    members.add(match[1]);
  }
  return members;
}

/** The distinct `--color-scene-category-<token>` token names declared in styles.css. */
function cssCategoryTokens(css: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of css.matchAll(/--color-scene-category-([a-z][a-z0-9-]*)/g)) {
    tokens.add(match[1]);
  }
  return tokens;
}

const sorted = (s: Set<string>): string[] => [...s].sort();

describe("category vocabulary stays in lockstep across its definition sites (#31)", () => {
  const kitSource = readFileSync(resolve(SRC_ROOT, "app/kit/category.ts"), "utf8");
  const sceneSource = readFileSync(
    resolve(SRC_ROOT, "scene/field/categoryColor.ts"),
    "utf8",
  );
  const css = readFileSync(resolve(SRC_ROOT, "styles.css"), "utf8");

  const kitTokens = unionLiterals(kitSource, "CategoryToken");
  const sceneCategories = unionLiterals(sceneSource, "NodeCategory");
  const cssTokens = cssCategoryTokens(css);

  it("the kit CategoryToken union and the --color-scene-category-* CSS tokens are identical", () => {
    // Bidirectional: a token deleted from one site but not the other is a non-atomic
    // deletion. Kit→CSS gap = an unresolved `var()` (wrong/fallback color); CSS→kit gap
    // = an orphan token no instance paints with.
    const missingFromCss = sorted(kitTokens).filter((t) => !cssTokens.has(t));
    const orphanInCss = sorted(cssTokens).filter((t) => !kitTokens.has(t));
    expect({ missingFromCss, orphanInCss }).toEqual({
      missingFromCss: [],
      orphanInCss: [],
    });
  });

  it("every scene NodeCategory is a member of the kit CategoryToken vocabulary", () => {
    // The graph-node categories are a SUBSET of the kit vocabulary (the kit additionally
    // carries chip/search-only `code`). A scene category absent from the kit would paint
    // its nodes from a token the centralized vocabulary does not define.
    const sceneNotInKit = sorted(sceneCategories).filter((c) => !kitTokens.has(c));
    expect(sceneNotInKit).toEqual([]);
  });

  it("the vocabulary is non-empty (the extraction actually parsed members)", () => {
    // Guards the guard: a parser regression that found zero members must fail loudly
    // rather than vacuously pass the set-equality checks above.
    expect(kitTokens.size).toBeGreaterThan(0);
    expect(sceneCategories.size).toBeGreaterThan(0);
    expect(cssTokens.size).toBeGreaterThan(0);
  });
});
