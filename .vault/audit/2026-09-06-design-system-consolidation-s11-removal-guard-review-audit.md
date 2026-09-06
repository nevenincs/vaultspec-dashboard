---
tags:
  - '#audit'
  - '#design-system-consolidation'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:e12f55627358e83c2a625ac3ee365abc9275327fdec9b71c74c5e527a83381cc'
related:
  - "[[2026-09-05-design-system-consolidation-plan]]"
---

# `design-system-consolidation` audit: `s11 removal guard review`

## Scope

Independent review of `test_design_system_consolidation.py` against
`W01.P02.S11`, the accepted consolidation plan, the production/development
separation rule, and the S09-S10 registration contract. The review covers exact
single-invocation order, canonical package-command enforcement, production
import resolution into `frontend/dev`, guard discovery, and mutation cases that
prove missing, duplicate, reordered, redirected, shell-bypassed, and forbidden
import forms fail. Production and scene sources are outside the change scope.

## Findings

### s11-exact-once | medium | Direct duplicate scanner commands bypass the once-only guard

`_frontend_lint_scripts` counts only `Cmd` steps whose argv begins with the npm-run prefix. The guard therefore passes if a tamper leaves the canonical `npm ... run lint:design-system` step in place and adds a second direct `Cmd(("node", "frontend/dev/tooling/scan-design-system.mjs"))`, even though the scanner now executes twice. Extend the recipe validation to inspect every command step and reject any additional argv that directly or indirectly names the scanner path; add a mutation test using real `Cmd` objects rather than only a list of npm script-name strings.

Resolution: recipe validation now inspects every declarative `Cmd` for either
the package-script name or canonical scanner path, requires exactly one such
command, and requires that command to equal the canonical npm argv. The
mutation matrix uses real `Cmd` values and proves an added direct Node scanner
command fails alongside missing, duplicate, and reordered npm forms.

### s11-import-parser | medium | Import-looking prose inside strings is treated as executable dependency syntax

`_without_javascript_comments` deliberately preserves quoted and template-literal contents, then `IMPORT_SPECIFIER` searches the resulting raw text without syntax context. A normal source string such as an example containing `import("@dev/tooling/x")`, or prose containing `from "../../../dev/..."`, is therefore reported as a production dependency even though it is not an import. Replace this lexical approximation with a syntax-aware JS/TS import scan (or a parser-backed helper already used by frontend tooling), covering static imports, re-exports, dynamic imports, and CommonJS calls while excluding comments and ordinary literal contents. Add explicit string and template-literal false-positive mutations alongside the existing comment case.

Resolution: the guard now batches shipped sources through the installed
TypeScript parser and visits import declarations, re-exports, dynamic imports,
CommonJS calls, import-equals declarations, and import types. Parse errors fail
closed. Ordinary quoted strings, template literals, and comments now have
explicit negative controls and produce no dependency edge.

Current positive evidence is otherwise sound: the package command is exact and shell-free; the intended npm step occurs after `lint:modules` and before `format:check`; actual production source is clean; static, dynamic, re-export, CommonJS, alias, and relative dev paths are exercised; guard discovery is asserted; and no production, scene, or W02 implementation belongs to S11. The targeted guard file passes 19/19 and `git diff --check` passes, but those green checks do not cover the two bypass/false-positive cases above.

## Recommendations

- Close both mutation gaps before accepting S11, then rerun the targeted and full guard suites plus the complete frontend lint recipe.

Status: REQUEST CHANGES.

Post-correction evidence: targeted guards pass 22/22, the full guard suite
passes 143/143, and the complete frontend lint recipe passes with the scanner
and immutable scene preimage check clean. Independent re-review is pending.

Independent re-review confirmed both resolutions. `_scanner_commands` examines every real `Cmd`, recognizes both package-script and canonical scanner-path invocations, requires exactly one command, and requires the canonical npm argv; the direct-Node duplicate mutation fails as intended. The batched TypeScript AST probe extracts static imports and re-exports, dynamic imports, `require`, import-equals, and import-type literals, fails closed on parse diagnostics, and does not infer dependencies from quoted strings, template prose, or comments.

Independent post-fix evidence: targeted guards 22/22 PASS; full guard suite 143/143 PASS; `git diff --check` PASS; and full `just lint frontend` PASS with the design-system scanner invoked once and the immutable S179 scene-byte guard clean. No remaining finding or S11 production, scene, package, or W02 scope expansion surfaced.

Re-review status: PASS.
