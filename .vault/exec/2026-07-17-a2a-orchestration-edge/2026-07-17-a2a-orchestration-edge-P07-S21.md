---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S21'
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
     The S21 and 2026-07-17-a2a-orchestration-edge-plan placeholders are machine-filled by
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
     The Make frontend relay resume cursor-aware and byte-bounded, latch authoritative reconciliation, and derive terminal controls only from confirmed run status and ## Scope

- `frontend/src/stores/server/agent/`
- `frontend/src/stores/server/liveAdapters/`
- `frontend/src/app/agent/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Make frontend relay resume cursor-aware and byte-bounded, latch authoritative reconciliation, and derive terminal controls only from confirmed run status

## Scope

- `frontend/src/stores/server/agent/`
- `frontend/src/stores/server/liveAdapters/`
- `frontend/src/app/agent/`

## Description

- Generate one path-safe UUID run id per deliberate submission and reuse the exact payload for one bounded lost-ack retry.
- Resume the relay from the last admitted sequence and preserve transcript state through append refetches.
- Bound transcript retention to 256 frames and 2 MiB of UTF-8 payload.
- Fence reconciliation by generation until a successful authoritative post-signal status read.
- Keep browser polling active while the relay is degraded and stop it only on authoritative terminal status.
- Derive Cancel, Dismiss, and terminal transcript posture only from same-run `TeamRunStatus`, including `archived`.

## Outcome

Reload and reconnect recover the viewing transcript without granting relay frames lifecycle authority or admitting stale status from another run. ESLint and TypeScript passed; focused production-store tests passed 46 of 46 and Composer, AgentPanel, and live render tests passed 29 of 29.

## Notes

The adversarial pass found and fixed status-request coalescing across a gap, heartbeats prematurely clearing degraded polling, cross-run `keepPreviousData` terminal authority, an unresolved reconciliation waiter after timer cleanup, and invalid non-integer relay sequences. All were fixed before handoff; no S21 issue remains open.
