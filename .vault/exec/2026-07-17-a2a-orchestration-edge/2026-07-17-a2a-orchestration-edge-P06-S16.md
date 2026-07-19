---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S16'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-orchestration-edge with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S16 and 2026-07-17-a2a-orchestration-edge-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Recover the team-run viewing binding only from one complete active workspace result, clear cross-scope bindings, and keep run-status plus relay authoritative and ## Scope

- `frontend/src/stores/server/agent/a2aTeam.ts`
- `frontend/src/stores/view/agentPanel.ts`
- `frontend/src/app/agent/AgentPanel.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Recover the team-run viewing binding only from one complete active workspace result, clear cross-scope bindings, and keep run-status plus relay authoritative

## Scope

- `frontend/src/stores/server/agent/a2aTeam.ts`
- `frontend/src/stores/view/agentPanel.ts`
- `frontend/src/app/agent/AgentPanel.tsx`

## Description

- Adapt the bounded active-run projection in the sole frontend wire client and retain at most two valid rows.
- Select a recovery binding only for one non-truncated result and key the finite cache by served scope.
- Track the binding's owning scope, clear cross-scope bindings, and omit the unavailable prompt after reload.
- Mount discovery only for the visible transcript and hand the recovered id to existing authoritative status and relay hooks.
- Cover unique, zero, ambiguous, truncated, malformed, degraded live-wire, and scope-change behavior.

## Outcome

The Agent panel can recover one unambiguous active team run after reload without persisting client authority or guessing among concurrent runs. Focused frontend verification passed 34 tests, TypeScript, Prettier, and ESLint.

## Notes

The live render suite emitted existing shutdown-time socket reset diagnostics after all tests passed. No mock, fake, skip, or xfail was introduced.
